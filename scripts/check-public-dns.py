#!/usr/bin/env python3
"""check-public-dns.py — can the public internet actually reach this service?

Answers the one question the other checks cannot. The proxy hosts, the
certificates and the containers can all be correct while the world still lands
somewhere else, because public reachability is decided by the **registry
delegation** of the domain — a record that lives at the registrar, not on this
host.

For every host this repo owns (the HOSTS map in npm-proxy-hosts.py) it checks:

  delegation  the zone is served by this stack's DNS plane. Compares the SOA
              primary nameserver the public resolvers report against the one our
              own nameserver reports — a recursive resolver just echoes the
              *zone's own* NS RRset, so only the SOA reveals a foreign
              delegation.
  records     the public answer for each host matches the answer our own
              authoritative nameserver gives, i.e. the world reaches us.
  tls         each host serves HTTPS with a certificate valid for its name.

Run it after any DNS change, and again after a delegation move to confirm the
cutover landed. Exit 1 if anything fails (2 if the checks could not run).

    ./scripts/check-public-dns.py
    ./scripts/check-public-dns.py --skip-tls     # DNS checks only
    ./scripts/check-public-dns.py --json         # machine-readable

Environment (this repo's .env): NPM_BASE_DOMAIN — the zone to validate.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import shutil
import socket
import ssl
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from importlib import import_module

_npm = import_module("npm-proxy-hosts")  # repo's host map + .env reader
HOSTS = _npm.HOSTS
load_env_file = _npm.load_env_file

# Our own authoritative nameserver: the source of truth for where a name *should*
# point. The in-house zone is served by the same pair that serves innotel.us.
AUTHORITATIVE_NS = "ns1.innotel.us"
PUBLIC_RESOLVERS = ("1.1.1.1", "8.8.8.8")
DNS_TIMEOUT = 8
HTTP_TIMEOUT = 12


class Check:
    """One PASS/FAIL line."""

    def __init__(self, name: str, ok: bool, detail: str):
        self.name, self.ok, self.detail = name, ok, detail


def dig(server: str | None, name: str, rtype: str, *, norecurse: bool = False) -> list[str] | None:
    """Answer records via dig, or None when dig is unavailable."""
    cmd = ["dig", "+time=%d" % DNS_TIMEOUT, "+tries=1", "+short", name, rtype]
    if server:
        cmd.insert(1, "@" + server)
    if norecurse:
        cmd.insert(1, "+norecurse")
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=DNS_TIMEOUT + 4)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    return [line.strip().rstrip(".") for line in out.stdout.splitlines()
            if line.strip() and not line.startswith(";")]


def addresses(answers: list[str]) -> list[str]:
    """Keep only real addresses from a +short answer (a CNAME target is not one)."""
    out = []
    for answer in answers:
        try:
            ipaddress.ip_address(answer)
        except ValueError:
            continue
        out.append(answer)
    return out


def fqdns(base_domain: str) -> list[str]:
    """Every name this repo claims, apex first."""
    out = []
    for host in HOSTS:
        sub = host.get("sub")
        out.append(f"{sub}.{base_domain}" if sub else base_domain)
    return out


def soa_mname(server: str, zone: str) -> str:
    """The primary nameserver named in the SOA — i.e. who actually serves the zone.

    This is the throttle-proof way to catch a foreign delegation: the registry
    delegation cannot be read directly from the TLD servers reliably (they rate
    limit), but the SOA MNAME the public resolvers return is whatever zone is
    really answering — which is precisely the thing we want to know.
    """
    answers = dig(server, zone, "SOA")
    if answers:
        # +short prints the whole SOA line; the primary NS is its first field.
        return answers[0].split()[0].rstrip(".").lower()
    return ""


def check_delegation(zone: str, expected_ns: tuple[str, ...] = ()) -> Check:
    """Is the zone served by this stack's nameservers, or by someone else?

    Compares the SOA primary nameserver the public resolvers report with the one
    our own nameserver reports for the same name. Equal means the world is
    talking to our DNS plane; different means the registry still delegates the
    zone somewhere else, and no amount of work on this host will be reachable.
    """
    ours = soa_mname(AUTHORITATIVE_NS, zone)
    public = ""
    for resolver in PUBLIC_RESOLVERS:
        public = soa_mname(resolver, zone)
        if public:
            break
    if not public:
        return Check("delegation", False, f"could not read a public SOA for {zone}")
    if not ours:
        return Check("delegation", False,
                     f"our nameserver has no SOA for {zone} (is the zone hosted here?)")
    if public != ours:
        return Check("delegation", False,
                     f"{zone} is served by {public}, not our plane ({ours})")
    if expected_ns:
        expected = {n.lower().rstrip(".") for n in expected_ns}
        if public not in expected and not any(public.endswith("." + n) for n in expected):
            return Check("delegation", False,
                         f"{zone} is served by {public}, expected one of "
                         f"{', '.join(sorted(expected))}")
    return Check("delegation", True, f"{zone} served by our plane ({public})")


def check_records(hosts: list[str]) -> tuple[list[Check], dict[str, str], dict[str, str]]:
    """Public answer must match our own authoritative answer."""
    checks: list[Check] = []
    public_ips: dict[str, str] = {}
    our_ips: dict[str, str] = {}
    for host in hosts:
        auth = addresses(dig(AUTHORITATIVE_NS, host, "A") or [])
        our_ips[host] = auth[0] if auth else ""
        public: list[str] = []
        for resolver in PUBLIC_RESOLVERS:
            for ip in addresses(dig(resolver, host, "A") or []):
                if ip not in public:
                    public.append(ip)
        public_ips[host] = public[0] if public else ""
        if not auth:
            checks.append(Check(host, False, "no authoritative record in our own zone"))
        elif set(auth) & set(public):
            checks.append(Check(host, True, f"public={', '.join(public)}"))
        else:
            checks.append(Check(host, False,
                                f"public={', '.join(public) or 'unresolved'} "
                                f"but our zone says {', '.join(auth)}"))
    return checks, public_ips, our_ips


def check_tls(host: str, ip: str, our_ip: str = "") -> Check:
    """HTTPS as a *public* client sees it.

    Connects to the public address the world would use, with SNI set to the
    hostname — the local resolver points these names at our own edge, so using
    it here would test the wrong server. A valid certificate on the wrong edge
    is still the wrong server: an error status there counts as a failure, not a
    pass.
    """
    if not ip:
        return Check(host, False, "no public address to test")
    ctx = ssl.create_default_context()
    request = (f"GET / HTTP/1.1\r\nHost: {host}\r\n"
               f"User-Agent: check-public-dns\r\nConnection: close\r\n\r\n").encode()
    try:
        with socket.create_connection((ip, 443), timeout=HTTP_TIMEOUT) as raw:
            with ctx.wrap_socket(raw, server_hostname=host) as tls:
                tls.sendall(request)
                data = tls.recv(4096)
        status = data.split(b" ", 2)[1].decode() if b" " in data else "?"
        if our_ip and ip != our_ip and status.startswith(("4", "5")):
            return Check(host, False,
                         f"https {status} from {ip} — that is the wrong edge "
                         f"(our zone says {our_ip})")
        return Check(host, True, f"https {status} via {ip}")
    except ssl.SSLCertVerificationError as exc:
        return Check(host, False, f"certificate invalid for {host}: {exc.verify_message}")
    except ssl.SSLError as exc:
        return Check(host, False, f"TLS failed via {ip}: {exc}")
    except (socket.timeout, ConnectionError, OSError) as exc:
        return Check(host, False, f"unreachable via {ip}: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env-file", default=str(REPO / ".env"))
    parser.add_argument("--expected-ns", default="",
                        help="optional comma list the zone's primary NS must be one of")
    parser.add_argument("--skip-tls", action="store_true", help="DNS checks only")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args()

    if not shutil.which("dig"):
        print("FAIL dig is required (apt install dnsutils / bind-utils)", file=sys.stderr)
        return 2

    env = load_env_file(Path(args.env_file))
    zone = (env.get("NPM_BASE_DOMAIN") or "").strip().lstrip(".").lower()
    if not zone:
        print(f"FAIL NPM_BASE_DOMAIN is not set in {args.env_file}", file=sys.stderr)
        return 2
    expected_ns = tuple(n.strip().lower() for n in args.expected_ns.split(",") if n.strip())

    hosts = fqdns(zone)
    detail = f"expected NS: {', '.join(expected_ns)}" if expected_ns else "nameservers: our plane"
    print(f"zone: {zone}   hosts: {len(hosts)}   {detail}\n")

    delegation = check_delegation(zone, expected_ns)
    record_checks, public_ips, our_ips = check_records(hosts)
    tls_checks = ([] if args.skip_tls else
                  [check_tls(h, public_ips.get(h, ""), our_ips.get(h, "")) for h in hosts])

    results = [delegation] + record_checks + tls_checks
    for check in results:
        print(f"  {'PASS' if check.ok else 'FAIL'}  {check.name:38} {check.detail}")

    failed = [c for c in results if not c.ok]
    print()
    if not delegation.ok:
        print("The zone is not delegated to this stack's nameservers, so public traffic and\n"
              "Let's Encrypt HTTP-01 validation never reach this host. Fix the delegation at\n"
              "the registrar for this domain, then re-run this check. See README →\n"
              "\"DNS prerequisite\".")
    print(f"{'PASS' if not failed else 'FAIL'} {len(results) - len(failed)}/{len(results)} checks passed")

    if args.json:
        print(json.dumps({
            "zone": zone,
            "delegation_ok": delegation.ok,
            "public": public_ips,
            "checks": [{"name": c.name, "ok": c.ok, "detail": c.detail} for c in results],
        }, indent=2))
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
