# 🔥 Rizz Aura — Platform Stack Role

**Classification: CommunityOps**

Reputation and community: real-time leaderboards, rankings, achievements, and competition engine.

This page declares Rizz Aura's role in the
[**Innotel Platform Stack**](https://github.com/innotelinc/innotel-platform-stack) —
the canonical single-responsibility architecture. The stack is defined in exactly one
place; this page links each product to it and states what this platform owns, consumes,
provides, and explicitly does not own.

## Owns

- Leaderboards
- Reputation
- Rankings
- Achievements
- Communities
- Competition engine

## Provides

- Community platform for the ecosystem

## Consumes

- Authentik — identity, SSO, admin roles
- Cerulean Vault — secrets, Magnate API token, AI keys
- Magnate — payments and entitlements
- NPM Edge — public routing, TLS termination at the edge

## Explicitly does NOT own

- Identity (Authentik)
- Billing (Magnate)


## Secrets (Cerulean Vault)

The platform's SecretOps is **Cerulean Vault** — HashiCorp Vault, KV v2, hosted by
Cerulean — with `vault://<mount>/<path>#<key>` references in `.env`.

### Legacy: the Infisical profile

This stack currently still imports its credentials into an **Infisical** workspace and
derives `.env` from it. Enable it with:

```bash
# generate the required keys and add them to .env
openssl rand -base64 32   # INFISICAL_ENCRYPTION_KEY
openssl rand -hex 16      # INFISICAL_AUTH_SECRET
openssl rand -hex 16      # INFISICAL_DB_PASSWORD

# start the profile and provision the workspace + import .env secrets
docker compose -f docker-compose.yml -f compose.infisical.yml --profile infisical up -d
bash scripts/infisical-setup.sh
```

See [compose.infisical.yml](../compose.infisical.yml) and
[scripts/infisical-setup.py](../scripts/infisical-setup.py) for details.

## Golden rules

- **Authentik = Identity** · **Cerulean Vault = Secrets** · **Cerulean = Trust** ·
  **ONYX = Storage** · **Magnate = Revenue** · **NPM Edge = Edge** — everything else is a business function.
- No platform duplicates another's responsibility.
- No credit in commits, footers, or headers to anyone but the project owner.

---

*Rizz Aura · CommunityOps · [Innotel Platform Stack](https://github.com/innotelinc/innotel-platform-stack)*
