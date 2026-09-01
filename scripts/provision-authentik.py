#!/usr/bin/env python3
"""provision_authentik.py — wire Authentik (SSO) into the Rizz Aura platform.

Idempotent, stdlib-only, talks to the Authentik REST API (no UI clicks):

  1. ensures the admin group (default: rizz-aura-admins) exists
  2. ensures the "Rizz Aura SSO" OIDC provider exists (confidential client,
     redirect_uri = <API_URL>/api/auth/callback, groups scope included)
  3. ensures the "Rizz Aura" application exists, bound to that provider
  4. adds the bootstrap admin user to the admin group
  5. writes AUTHENTIK_CLIENT_ID / AUTHENTIK_CLIENT_SECRET back into .env

Safe to re-run after a fresh Authentik boot. Requires AUTHENTIK_TOKEN (the
API token set in .env) and a reachable Authentik instance.

Usage:
    python3 scripts/provision-authentik.py [--env-file .env]
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
DEFAULT_ENV = REPO / ".env"
AUTH_HOST = "http://127.0.0.1:9000"
API_PREFIX = "/api/v3"


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        env[key.strip()] = val.strip().strip('"').strip("'")
    return env


def save_env(path: Path, updates: dict[str, str]) -> None:
    lines = path.read_text().splitlines() if path.exists() else []
    for key, val in updates.items():
        replaced = False
        for i, line in enumerate(lines):
            if line.startswith(f"{key}="):
                lines[i] = f"{key}={val}"
                replaced = True
                break
        if not replaced:
            lines.append(f"{key}={val}")
    path.write_text("\n".join(lines) + "\n")


class AkApi:
    def __init__(self, base: str, token: str):
        self.base = base.rstrip("/")
        self.token = token

    def _call(self, method: str, path: str, body: Any = None) -> Any:
        url = f"{self.base}{path}"
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = (e.read() or b"").decode(errors="replace")[:300]
            raise RuntimeError(f"{method} {path} → HTTP {e.code}: {detail}") from e

    def get_all(self, path: str) -> list[dict]:
        """Paginate a list endpoint (Authentik paginates with ?page / pagination)."""
        out: list[dict] = []
        page = 1
        while True:
            sep = "&" if "?" in path else "?"
            res = self._call("GET", f"{path}{sep}page={page}&page_size=100")
            if not isinstance(res, dict):
                out.extend(res or [])
                break
            out.extend(res.get("results") or [])
            nxt = (res.get("pagination") or {}).get("next")
            if not nxt or page >= nxt:
                break
            page += 1
        return out


def find_by(rows: list[dict], **kw) -> dict | None:
    for r in rows:
        if all(r.get(k) == v for k, v in kw.items()):
            return r
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=str(DEFAULT_ENV))
    parser.add_argument("--auth-host", default=AUTH_HOST, help="Authentik API base (default http://127.0.0.1:9000)")
    args = parser.parse_args()
    env = load_env(Path(args.env_file))

    token = env.get("AUTHENTIK_TOKEN", "")
    if not token:
        print("FAIL AUTHENTIK_TOKEN missing from .env — set it and re-run", file=sys.stderr)
        return 1
    api = AkApi(args.auth_host, token)
    api_url = env.get("API_URL", "http://localhost:8000").rstrip("/")
    app_url = env.get("APP_URL", "https://app.rizzaura.net").rstrip("/")
    admin_group = env.get("AUTHENTIK_ADMIN_GROUP", "rizz-aura-admins")
    bootstrap_email = env.get("AUTHENTIK_BOOTSTRAP_EMAIL", "admin@rizzaura.net")

    try:
        # 1. Admin group
        groups = api.get_all(f"{API_PREFIX}/core/groups/")
        grp = find_by(groups, name=admin_group)
        if grp is None:
            grp = api._call("POST", f"{API_PREFIX}/core/groups/", {"name": admin_group})
            print(f"PASS created group {admin_group} (pk {grp['pk']})")
        else:
            print(f"PASS group {admin_group} already exists")

        # 2. OIDC provider
        providers = api.get_all(f"{API_PREFIX}/core/providers/oidc/")
        prov = find_by(providers, name="Rizz Aura SSO")
        if prov is None:
            # authorization flow: implicit consent (no consent screen)
            flows = api.get_all(f"{API_PREFIX}/flows/instances/")
            auth_flow = find_by(flows, slug="default-provider-authorization-implicit-consent")
            if auth_flow is None:
                print("FAIL could not find the default implicit-consent authorization flow", file=sys.stderr)
                return 1
            # signing key: generate a dedicated RSA pair
            key = api._call("POST", f"{API_PREFIX}/crypto/certificatekeypairs/generate/", {"name": "Rizz Aura Signing Key"})
            # default OIDC scope property mappings (openid / profile / email / groups)
            scopes = api.get_all(f"{API_PREFIX}/propertymappings/provider/scope/")
            scope_ids = []
            for want in ["OpenID", "Profile", "Email", "Groups"]:
                m = find_by(scopes, name=f"authentik default OIDC Mapping: {want}")
                if m:
                    scope_ids.append(m["pk"])
            client_id = "rizz-aura-" + secrets.token_hex(6)
            client_secret = secrets.token_urlsafe(32)
            prov = api._call("POST", f"{API_PREFIX}/core/providers/oidc/", {
                "name": "Rizz Aura SSO",
                "client_type": "confidential",
                "client_id": client_id,
                "client_secret": client_secret,
                "authorization_flow": auth_flow["pk"],
                "redirect_uris": [f"{api_url}/api/auth/callback"],
                "signing_key": key["pk"],
                "property_mappings": scope_ids,
                "sub_mode": "hashed_user_id",
                "issuer_mode": "global",
            })
            print(f"PASS created OIDC provider 'Rizz Aura SSO' (pk {prov['pk']})")
            save_env(Path(args.env_file), {
                "AUTHENTIK_CLIENT_ID": client_id,
                "AUTHENTIK_CLIENT_SECRET": client_secret,
            })
            print("PASS wrote AUTHENTIK_CLIENT_ID / AUTHENTIK_CLIENT_SECRET to .env")
        else:
            print("PASS OIDC provider 'Rizz Aura SSO' already exists")

        # 3. Application bound to the provider
        apps = api.get_all(f"{API_PREFIX}/core/applications/")
        app = find_by(apps, slug="rizz-aura")
        if app is None:
            app = api._call("POST", f"{API_PREFIX}/core/applications/", {
                "name": "Rizz Aura",
                "slug": "rizz-aura",
                "provider": prov["pk"],
                "launch_url": app_url,
            })
            print(f"PASS created application 'Rizz Aura' (slug rizz-aura)")
        else:
            print("PASS application 'Rizz Aura' already exists")

        # 4. Bootstrap admin → admin group
        users = api.get_all(f"{API_PREFIX}/core/users/")
        admin_user = find_by(users, email=bootstrap_email)
        if admin_user is not None:
            api._call("POST", f"{API_PREFIX}/core/groups/{grp['pk']}/users/", [admin_user["pk"]])
            print(f"PASS added {bootstrap_email} to {admin_group}")
        else:
            print(f"WARN bootstrap admin {bootstrap_email} not found yet — Authentik may still be booting")

        print("PASS Authentik provisioned — restart the api container so it picks up the client credentials")
        return 0
    except (RuntimeError, urllib.error.URLError, OSError) as e:
        print(f"FAIL Authentik provisioning error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
