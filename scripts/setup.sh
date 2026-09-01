#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# setup.sh — one-command bootstrap for the Rizz Aura Global Leaderboard Platform
#
# Usage:
#   git clone <this repository> && cd rizzaura-platform
#   ./scripts/setup.sh
#
# What it does:
#   1. Checks prerequisites (docker, openssl, python3, curl, compose v2)
#   1b. Enables the commit-attribution guard hook (.githooks)
#   2. Generates .env from .env.example with fresh random secrets
#   3. Builds & boots the whole stack (api + 4 frontends + Authentik)
#   4. Waits for services to become healthy
#   5. Provisions Authentik (scripts/provision-authentik.py): OIDC provider,
#      application, admin group — writes client credentials back to .env
#   6. Restarts the api so it picks up the SSO credentials
#   7. Provisions Nginx Proxy Manager hosts (scripts/npm-proxy-hosts.py):
#      app/api/auth/rankings/community/admin + ONE wildcard *.rizzaura.net
#      certificate via DNS-01 (TSIG/rfc2136 credentials) when configured
#   8. Runs a smoke test
#
# Idempotent — safe to re-run. Existing .env values are preserved.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO/.env"
ENV_EXAMPLE="$REPO/.env.example"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}PASS${NC} $*"; }
warn() { echo -e "${YELLOW}WARN${NC} $*"; }
fail() { echo -e "${RED}FAIL${NC} $*"; exit 1; }

echo "══════════════════════════════════════════════════════════════"
echo "  Rizz Aura — Global Leaderboard Platform — Setup"
echo "══════════════════════════════════════════════════════════════"

# ═══ 1. Prerequisites ═════════════════════════════════════════════
echo ""
echo "── 1. Prerequisites ──"
command -v docker &>/dev/null   || fail "docker not found — install Docker first"
command -v openssl &>/dev/null  || fail "openssl not found"
command -v python3 &>/dev/null  || fail "python3 not found"
command -v curl &>/dev/null     || fail "curl not found"
docker compose version &>/dev/null || fail "docker compose plugin not found (need Compose v2)"
pass "docker $(docker --version | awk '{print $3}' | tr -d ','), openssl $(openssl version | awk '{print $2}'), python3 $(python3 --version | awk '{print $2}')"

# ═══ 1b. Commit-attribution guard hook ═════════════════════════════
echo ""
echo "── 1b. Commit attribution guard hook ──"
if [ -d "$REPO/.githooks" ]; then
    git config core.hooksPath "$REPO/.githooks" \
        && pass "commit guard hook enabled (core.hooksPath -> .githooks)" \
        || warn "could not set core.hooksPath"
else
    warn ".githooks dir missing — commit guard hook not enabled"
fi

# ═══ 2. Generate .env ══════════════════════════════════════════════
echo ""
echo "── 2. Environment (.env) ──"
if [ -f "$ENV_FILE" ]; then
    pass ".env already exists — keeping your secrets"
else
    pass "generating .env from .env.example with fresh random secrets"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" "$ENV_FILE"
    sed -i "s|^AUTHENTIK_SECRET_KEY=.*|AUTHENTIK_SECRET_KEY=$(openssl rand -base64 36)|" "$ENV_FILE"
    sed -i "s|^AUTHENTIK_TOKEN=.*|AUTHENTIK_TOKEN=$(openssl rand -base64 36)|" "$ENV_FILE"
    sed -i "s|^AUTHENTIK_POSTGRES_PASSWORD=.*|AUTHENTIK_POSTGRES_PASSWORD=$(openssl rand -hex 16)|" "$ENV_FILE"
    sed -i "s|^AUTHENTIK_REDIS_PASSWORD=.*|AUTHENTIK_REDIS_PASSWORD=$(openssl rand -hex 16)|" "$ENV_FILE"
    sed -i "s|^AUTHENTIK_BOOTSTRAP_PASSWORD=.*|AUTHENTIK_BOOTSTRAP_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')|" "$ENV_FILE"
    pass "secrets written"
fi
set -a; source "$ENV_FILE"; set +a

# ═══ 3. Boot the stack ═════════════════════════════════════════════
echo ""
echo "── 3. Boot stack ──"
COMPOSE_LOG=$(mktemp)
if ! docker compose --env-file "$ENV_FILE" -f "$REPO/docker-compose.yml" up -d --build >"$COMPOSE_LOG" 2>&1; then
    cat "$COMPOSE_LOG" >&2
    rm -f "$COMPOSE_LOG"
    fail "Docker Compose failed to boot the stack"
fi
cat "$COMPOSE_LOG" | tail -3
rm -f "$COMPOSE_LOG"
pass "stack booting — waiting for healthy…"

# ═══ 4. Wait for healthy ═══════════════════════════════════════════
for svc in api authentik-server; do
    cid="$(docker compose --env-file "$ENV_FILE" -f "$REPO/docker-compose.yml" ps -q "$svc" 2>/dev/null || true)"
    if [ -z "$cid" ]; then
        warn "$svc has no container yet (may still be starting)"
        continue
    fi
    timeout 180 bash -c "until docker inspect '$cid' --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do sleep 3; done" \
        && pass "$svc healthy" \
        || warn "$svc not healthy after 3 min — continuing anyway"
done

# ═══ 5. Provision Authentik ════════════════════════════════════════
echo ""
echo "── 5. Authentik provisioning (OIDC provider + application + admin group) ──"
if [ -n "${AUTHENTIK_TOKEN:-}" ]; then
    if python3 "$REPO/scripts/provision-authentik.py" --env-file "$ENV_FILE"; then
        pass "Authentik provisioned"
    else
        warn "Authentik provisioning failed — Authentik may still be booting. Re-run:"
        warn "    python3 scripts/provision-authentik.py"
    fi
else
    warn "AUTHENTIK_TOKEN unset — skipping Authentik provisioning"
fi

# ═══ 6. Restart api with SSO credentials ═══════════════════════════
if grep -q "^AUTHENTIK_CLIENT_ID=." "$ENV_FILE"; then
    echo ""
    echo "── 6. Restart api with SSO credentials ──"
    docker compose --env-file "$ENV_FILE" -f "$REPO/docker-compose.yml" up -d --force-recreate api 2>&1 | tail -1
    pass "api restarted with Authentik client credentials"
fi

# ═══ 7. NPM proxy hosts (optional) ═════════════════════════════════
echo ""
echo "── 7. NPM proxy hosts (optional) ──"
# Creates/updates the 6 proxy hosts (app, api, auth, rankings, community,
# admin) + ONE wildcard *.rizzaura.net certificate via DNS-01. Set
# NPM_DNS_PROVIDER=rfc2136 and NPM_DNS_PROVIDER_CREDENTIALS=<NPM credential id>
# for TSIG-based wildcard issuance. NPM itself runs outside this stack
# (usually port 81) — skipped with a WARN when unreachable/unconfigured.
NPM_API_URL="${NPM_API_URL:-http://127.0.0.1:81}"
if curl -sf --max-time 3 "$NPM_API_URL/api/tokens" >/dev/null 2>&1 || [ -n "${NPM_API_TOKEN:-}" ]; then
    python3 "$REPO/scripts/npm-proxy-hosts.py" --env-file "$ENV_FILE" \
        || warn "NPM host sync reported failures — inspect the output above"
    pass "NPM proxy hosts synced"
else
    warn "NPM not reachable at $NPM_API_URL (or no token) — skipping proxy host provisioning"
    warn "Re-run ./scripts/setup.sh after pointing NPM at this host."
fi

# ═══ 8. Smoke test ═════════════════════════════════════════════════
echo ""
echo "── 8. Smoke test ──"
API_PORT="${PORT:-8000}"
timeout 20 bash -c "until curl -sf \"http://127.0.0.1:${API_PORT}/api/state\" >/dev/null 2>&1; do sleep 2; done" \
    && pass "api /api/state ok (port ${API_PORT})" \
    || warn "api not reachable yet — check docker compose ps"
ME=$(curl -sf "http://127.0.0.1:${API_PORT}/api/me" 2>/dev/null || echo '{"anon":true}')
echo "  /api/me → $ME"
SEASON=$(curl -sf "http://127.0.0.1:${API_PORT}/api/seasons" 2>/dev/null | head -c 120 || true)
echo "  /api/seasons → $SEASON"
echo ""
pass "Setup complete. Point Nginx Proxy Manager at this host and visit:"
echo "    https://app.rizzaura.net (main app) · https://rankings.rizzaura.net · https://community.rizzaura.net"
echo "    https://admin.rizzaura.net (admins) · https://api.rizzaura.net · https://auth.rizzaura.net (Authentik)"
