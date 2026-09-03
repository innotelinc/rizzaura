<div align="center">

# 🔥 Rizz Aura — Global Leaderboard Platform

**The self-hosted aura leaderboard. Rank creators, brands, streamers, athletes, and your friends — earn clout, collect aura, form teams, win competitions, and prove who's really the main character.**

Real-time leaderboards, achievements and badges, seasonal championships, a Hall of Fame,
and AI-powered achievement recommendations. Or skip the grind and **buy the board**: paid
slots rank at the top, outbid.lol style — **rank is what you pay.** 💰

"Got Aura? Prove It. Got Cash? Prove It Faster."

[![Build & publish](https://github.com/innotelinc/rizzaura-platform/actions/workflows/build-and-publish.yml/badge.svg)](https://github.com/innotelinc/rizzaura-platform/actions/workflows/build-and-publish.yml)
[![Release](https://github.com/innotelinc/rizzaura-platform/actions/workflows/release.yml/badge.svg)](https://github.com/innotelinc/rizzaura-platform/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/innotelinc/rizzaura-platform?color=f97316)](https://github.com/innotelinc/rizzaura-platform/releases)

</div>

> **About Rizz Aura** — the self-hosted aura leaderboard platform for ranking creators,
> brands, streamers, athletes, and friends: real-time leaderboards, achievements and
> badges, seasonal championships, a Hall of Fame, AI-powered achievement
> recommendations, and paid board slots — with Authentik SSO and a zero-dependency Node
> API. **Landing page:** [github.com/innotelinc/rizzaura-platform](https://github.com/innotelinc/rizzaura-platform)

---

## ✨ Features

- **Real-time leaderboards** — SSE-driven global + paid board, live updates.
- **Achievements & badges** — 35 badges across bronze/silver/gold/platinum
  tiers (voting, aura milestones, battles, census, teams, competitions,
  prestige, longevity), auto-evaluated as you play.
- **Seasonal rankings** — 28-day seasons; the top 20 personalities and top 10
  players are immortalized in the Hall of Fame each rollover.
- **Hall of Fame & prestige** — season snapshots forever; finishing top 10
  earns prestige and the Hall of Famer badge.
- **AI-powered achievement recommendations** — an OpenAI-compatible endpoint
  (OmniRoute by default, or OpenAI/Groq/Together/Ollama) suggests which
  badges to chase, with a rule-based fallback when no key is configured.
- **Teams & competitions** — form teams, join live competitions, and win the
  platform championship.
- **Cash Shop** — Board Slots, Cash Golden Upvotes, Permanent Flex Frames via
  Stripe Checkout.

## Architecture

Six services, each its own Docker image and its own subdomain, fronted by
Nginx Proxy Manager:

| Service       | URL                  | Port | What it is                                                    |
| ------------- | -------------------- | ---- | ------------------------------------------------------------- |
| **app**       | `app.<domain>`       | 3010 | Main app: battles, census, market, cash shop, profile         |
| **rankings**  | `rankings.<domain>`  | 3011 | Real-time leaderboards, seasons, Hall of Fame, prestige       |
| **community** | `community.<domain>` | 3012 | Live feed, teams, competitions, census                        |
| **admin**     | `admin.<domain>`     | 3013 | Admin control center (Authentik `rizz-aura-admins` role only) |
| **api**       | `api.<domain>`       | 8000 | Zero-dependency Node API: OIDC SSO, SSE, Stripe, AI, state    |
| **auth**      | `auth.<domain>`      | 9000 | Authentik — identity provider + SSO for every service         |

```
Browser ──► Nginx Proxy Manager (wildcard *.<domain> TLS)
                 ├─► app / rankings / community / admin  (nginx SPA containers)
                 ├─► api       (Node, zero deps, SSE real-time)
                 └─► auth      (Authentik: server + worker + postgres + redis)
                 └─► omniroute (optional profile "ai": LLM API proxy on 20128)
```

**The domain is one setting.** `BASE_DOMAIN` in `.env` (default
`rizz.innotel.us`; switch to `rizzaura.net` once DNS propagates) drives every
subdomain, the Authentik public URL, CORS origins, and the frontend
cross-links — change it in one place and re-run `./scripts/setup.sh`.

- **Frontend:** four independent React 18 + Vite 5 SPAs (`apps/`), sharing a
  design system in `apps/shared/`. Each is a separate nginx container.
- **Backend:** plain Node `http` server (`api/`) — no runtime dependencies.
  State lives in a single `data/state.json` (votes, aura, bids, achievements,
  seasons, teams, competitions).
- **Real-time:** Server-Sent Events (`/api/events`) push snapshots + discrete
  events; every frontend falls back to polling when the stream drops.
- **SSO:** Authentik OIDC (authorization-code flow, signed HttpOnly session
  cookies, role-gated admin).
- **Payments:** Stripe Checkout via REST over `fetch`.

## 🚀 Quick start (development)

You need the API on `:8000` and one or more Vite dev servers:

```bash
npm install
npm run serve        # terminal 1: platform API → http://localhost:8000
npm run dev          # terminal 2: main app → http://localhost:5173
npm run dev:rankings # terminal 3: rankings → http://localhost:5174 (optional)
npm run dev:community# terminal 4: community → http://localhost:5175 (optional)
npm run dev:admin    # terminal 5: admin → http://localhost:5176 (optional)
```

Each dev server proxies `/api` to the API, so everything works anonymously.
SSO needs Authentik + a provisioned OIDC client — see below.

## Deploy (Docker + Authentik + NPM)

```bash
git clone https://github.com/innotelinc/rizzaura-platform.git && cd rizzaura-platform
./scripts/setup.sh
```

`setup.sh` (idempotent) does everything:

1. Generates `.env` from `.env.example` with fresh secrets
2. Builds & boots the stack — `docker compose up -d --build`
3. Provisions Authentik (`scripts/provision-authentik.py`): creates the
   **Rizz Aura SSO** OIDC provider (redirect → `api.<domain>/api/auth/callback`),
   the **Rizz Aura** application, and the `rizz-aura-admins` group, then writes
   `AUTHENTIK_CLIENT_ID/SECRET` into `.env` and restarts the API
4. Provisions Nginx Proxy Manager (`scripts/npm-proxy-hosts.py`) — the six
   proxy hosts + **one wildcard `*.<domain>` certificate** via DNS-01
5. Mints the OmniRoute API key and wires it into `AI_API_KEY` (when the AI
   profile is enabled)
6. Smoke-tests `/api/state`, `/api/me`, `/api/seasons`

### Wildcard SSL with TSIG

NPM issues wildcard certificates through DNS-01. For a TSIG/RFC2136
dynamic-DNS setup (e.g. a private BIND master), save the **rfc2136** provider
in NPM → Credentials (TSIG key name, key secret, algorithm, server), note its
credential id, and set:

```
NPM_WILDCARD_CERT=1
NPM_DNS_PROVIDER=rfc2136
NPM_DNS_PROVIDER_CREDENTIALS=<credential id from NPM>
```

`npm-proxy-hosts.py` then requests one Let's Encrypt cert for
`*.<BASE_DOMAIN> + <BASE_DOMAIN>` and attaches it to every host. Re-run
`./scripts/setup.sh` (or the script directly) to sync.

### Manual compose

```bash
cp .env.example .env   # fill in secrets (or run setup.sh)
docker compose up -d --build
python3 scripts/provision-authentik.py   # creates OIDC provider + admin group
docker compose up -d --force-recreate api
python3 scripts/npm-proxy-hosts.py --wildcard --dns-provider rfc2136 \
    --dns-credentials <id>               # when NPM + DNS creds are ready
```

Nginx Proxy Manager itself runs **outside** this compose file (usually port 81) — the stack never starts it, and `npm-proxy-hosts.py` talks to it over the
REST API (`NPM_API_URL`, default `http://127.0.0.1:81`).

## Authentik (SSO)

- Bootstrap admin: `admin@rizz.innotel.us` / `AUTHENTIK_BOOTSTRAP_PASSWORD` (in `.env`).
- The API is the single OIDC client; every frontend redirects to
  `api.<domain>/api/auth/login?next=<origin>`.
- Add users to the **rizz-aura-admins** group to grant admin panel access.
- Admin groups come from Authentik's groups scope; sessions are HttpOnly,
  HMAC-signed cookies (`SESSION_SECRET`).

Without `AUTHENTIK_CLIENT_ID/SECRET` everything still works anonymously —
SSO is additive.

## AI recommendations (OmniRoute)

The achievement recommender calls any OpenAI-compatible `/chat/completions`
endpoint. The stack ships with **OmniRoute**, a self-hosted LLM API proxy, as
an opt-in compose profile:

```bash
# enable the AI gateway (one time)
docker compose --profile ai up -d
# or let setup.sh do it: set OMNIROUTE_INITIAL_PASSWORD in .env and re-run
./scripts/setup.sh
```

`setup.sh` boots the profile, mints an OmniRoute API key through its admin
API, and writes it to `AI_API_KEY` automatically. OmniRoute is exposed at
`http://omniroute:20128/v1` (`AI_BASE_URL`), and `AI_MODEL` selects the model.

To point at a different provider instead (OpenAI, Groq, Together, Ollama,
...), override in `.env`:

```
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

No key configured → recommendations fall back to deterministic rules, so the
feature always works.

## CI / CD

- `.github/workflows/build-and-publish.yml` — builds all five images on every
  push/PR to `main` and on `v*` tags; publishes to
  `ghcr.io/innotelinc/rizzaura-platform/<service>` (`:latest` + tag) on the
  default branch and tags.
- `.github/workflows/release.yml` — on every `v*` tag: publishes images **and**
  creates a GitHub Release with the source bundle + per-service dist bundles +
  checksums.

```bash
git tag -a v2.1.0 -m "Rizz Aura v2.1.0"
git push origin v2.1.0     # images publish + release artifacts attach
```

## API

All endpoints are JSON under `/api`. The dev servers proxy to `:8000`; in
production the frontends talk to `api.<domain>` directly (CORS with
credentials).

| Endpoint                          | Method   | Description                                                          |
| --------------------------------- | -------- | -------------------------------------------------------------------- |
| `/api/state`                      | GET      | Public state: roster, aura, feed, battle, season, bids, teams, comps |
| `/api/events`                     | GET      | **SSE** real-time stream (snapshots + aura/battle/badge/bid events)  |
| `/api/me`                         | GET      | Current session (`{user}` or `{anon:true}`)                          |
| `/api/auth/login`                 | GET      | Redirect to Authentik (`?next=` allowed origin)                      |
| `/api/auth/callback`              | GET      | OIDC code exchange → session cookie → redirect back                  |
| `/api/auth/logout`                | GET      | Clear session, redirect to Authentik end-session                     |
| `/api/claim`                      | POST     | Claim a profile (`{ name }`)                                         |
| `/api/vote`                       | POST     | Up/downvote a personality (`{ id, dir }`, 10 votes/IP/day)           |
| `/api/voterefill`                 | POST     | Refill today's votes                                                 |
| `/api/battle`                     | POST     | Decide the current battle (`{ winnerId }`)                           |
| `/api/census`                     | POST     | Vote in a census question (`{ qid, option }`)                        |
| `/api/golden`                     | POST     | Golden Upvote: +250 aura (`{ target, name }`)                        |
| `/api/achievements`               | GET      | Earned badge grants (optionally `?player=`)                          |
| `/api/achievements/recommend`     | POST     | AI (or rule-based) badge recommendations for the signed-in user      |
| `/api/seasons`                    | GET      | Current season + Hall of Fame                                        |
| `/api/halloffame`                 | GET      | Hall of Fame snapshots                                               |
| `/api/teams`                      | GET/POST | List / create teams (`{ name, tag, emoji }`)                         |
| `/api/teams/:id/join              | leave`   | POST                                                                 | Join / leave a team |
| `/api/competitions`               | POST     | Create a competition (admin) (`{ name, type, days }`)                |
| `/api/competitions/:id/enter`     | POST     | Enter your team into a live competition                              |
| `/api/checkout`                   | POST     | Stripe Checkout session (`{ product: slot\|golden\|frame, ... }`)    |
| `/api/webhook`                    | POST     | Stripe webhook (verified `checkout.session.completed`)               |
| `/api/order/:id`                  | GET      | Look up a paid order by session id                                   |
| `/api/admin/stats`                | GET      | Admin: players, votes, revenue, badges, season                       |
| `/api/admin/achievements/grant`   | POST     | Admin: grant a badge (`{ player, badge }`)                           |
| `/api/admin/achievements/revoke`  | POST     | Admin: revoke a badge                                                |
| `/api/admin/seasons/rollover`     | POST     | Admin: force season rollover → Hall of Fame snapshot                 |
| `/api/admin/competitions/:id/end` | POST     | Admin: end a competition, crown the champion                         |

Client IP comes from `cf-connecting-ip` → `x-forwarded-for` → socket, so it
works behind NPM and/or Cloudflare.

## Scripts

```bash
npm run dev            # main app dev server (:5173)
npm run dev:rankings   # rankings (:5174)
npm run dev:community  # community (:5175)
npm run dev:admin      # admin (:5176)
npm run build          # build all four SPAs
npm run serve          # platform API (:8000)
npm run lint           # eslint .
npm run format:check   # prettier --check .
./scripts/setup.sh                  # one-command deployment bootstrap
./scripts/npm-proxy-hosts.py        # sync NPM proxy hosts (--check to verify)
./scripts/provision-authentik.py    # provision Authentik OIDC provider/app
./scripts/build-release-artifacts.sh# bundle release payloads
```

## Project layout

```
apps/
  app/         # main SPA (battles, census, market, cash shop, profile)
  rankings/    # real-time leaderboards, seasons, hall of fame, prestige
  community/   # feed, teams, competitions
  admin/       # admin control center (role-gated)
  shared/      # design system, API client, SSE hook, formatters
api/           # zero-dep Node server: OIDC, SSE, achievements, seasons, Stripe, AI
scripts/       # setup.sh, npm-proxy-hosts.py, provision-authentik.py, artifacts
.githooks/     # commit-attribution guard (blocks AI/assistant co-author trailers)
```

> Fan-made meme project. Not affiliated with any of the people, brands, or
> games mentioned. All aura is fictional. 💀

## 🏛️ Platform stack

Rizz Aura is the ecosystem's **CommunityOps** platform — leaderboards, reputation, achievements, and competitions in the
[**Innotel Platform Stack**](https://github.com/innotelinc/innotel-platform-stack) — the
canonical single-responsibility architecture where Authentik owns identity, Infisical owns
secrets, Cerulean owns trust, ONYX owns storage, Magnate owns revenue, and every other
platform is a business function that consumes them. See
[docs/stack.md](docs/stack.md) for this platform's owns/consumes boundaries and its
Infisical secret setup.
