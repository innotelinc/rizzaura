# Rizz Aura 🔥

The global aura leaderboard. Rank creators, brands, streamers, athletes, and your friends —
earn clout, collect aura, and prove who's really the main character. Or skip the grind and
**buy the board**: paid slots rank at the top of the leaderboard, outbid.lol style —
**rank is what you pay.** 💰

"Got Aura? Prove It. Got Cash? Prove It Faster."

## Stack

- **Frontend:** React 18 + Vite 5 (`src/`)
- **Backend:** plain Node `http` server (`server.mjs`) — serves `dist/` + the `/api` JSON API
- **State:** a single `data/state.json` file (votes, aura deltas, battles, census, feed, bids)
- **Payments:** Stripe Checkout via Stripe's REST API over `fetch` — still zero npm deps
- **Tooling:** ESLint (flat config) + Prettier

No database, no framework. One Node process is the whole app.

## Cash Shop 💰 (monetization)

Three real-money products, all handled by Stripe Checkout (hosted payment page, no card data
ever touches this server):

| Product                  | Price          | What you get                                                                                                                                                      |
| ------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Board Slot**           | $3+ (you pick) | A slot at the TOP of the Aura Leaderboard. Slots sort by amount paid — outbid everyone to become #1, above every celebrity. Ships with the ✓ Aura Verified badge. |
| **Cash Golden Upvote**   | $2             | +500 Aura to any celebrity, with a public feed shoutout.                                                                                                          |
| **Permanent Flex Frame** | $5             | Permanent golden glow around your profile card.                                                                                                                   |

### Stripe setup

1. Create a Stripe account at https://dashboard.stripe.com (test mode is fine for dev).
2. Copy `.env.example` to `.env` and fill in:
   - `STRIPE_SECRET_KEY` — from https://dashboard.stripe.com/apikeys (`sk_test_...`)
   - `STRIPE_WEBHOOK_SECRET` — create a webhook endpoint → `https://<your-host>/api/webhook`,
     event `checkout.session.completed`, then copy its `whsec_...` signing secret
   - `APP_URL` — your public URL (http://localhost:4173 for local dev)
3. For local webhook testing, the Stripe CLI is easiest:
   ```bash
   stripe listen --forward-to localhost:4173/api/webhook
   ```
   then buy something in the Cash Shop and watch the bid land on the board.

The Cash Shop degrades gracefully: without keys, `/api/checkout` returns `not_configured` and
buyers just get a friendly "not live yet 💀" toast. A few demo bids are seeded into
`data/state.json` so the board looks alive pre-launch — delete them from that file anytime.

> Paid spots are fan hype, not endorsements, and are separate from the vote-driven free board.
> All aura is fictional. Stripe requires buyers to be 18+ (there's a checkbox).

## Quick start (development)

You need two terminals — the API server on `:4173` and the Vite dev server on `:5173` (which
proxies `/api` to the API server):

```bash
npm install
npm run serve   # terminal 1: API + static server → http://localhost:4173
npm run dev     # terminal 2: Vite dev server → http://localhost:5173
```

Open http://localhost:5173 — edits hot-reload.

## Production

```bash
npm run build   # compile the React app into dist/
npm run serve   # serve dist/ + API on :4173
```

The server has zero runtime npm dependencies, so the container is tiny.

## Docker

```bash
docker build -t rizz-aura .
docker run -d -p 4173:4173 -v rizz-aura-data:/app/data rizz-aura
```

Or with Compose (one command, volume included):

```bash
docker compose up -d        # build + start → http://localhost:4173
docker compose down         # stop (keeps the rizz-aura-data volume)
docker compose down -v      # stop and wipe state
```

`data/state.json` lives in the named volume, so votes and aura survive restarts.
The image runs as a non-root user and includes a `HEALTHCHECK` against `/api/state`.

## Deploying behind Nginx Proxy Manager (rizzaura.net)

The whole app is one origin on one port, so you need exactly **one proxy host**:

| Setting            | Value                                              |
| ------------------ | -------------------------------------------------- |
| Domain Names       | `rizzaura.net` + `www.rizzaura.net` (one cert)     |
| Scheme             | `https` (request a Let's Encrypt cert in NPM)      |
| Forward Hostname   | `127.0.0.1` (app on host) or container name / host |
| Forward Port       | `4173`                                             |
| WebSockets Support | OFF (the app polls over HTTP)                      |
| Locations          | none — catch-all. No separate `/api` block.        |

- **NPM on the host, app in Docker:** bind the app to localhost only — change the compose
  ports mapping to `"127.0.0.1:4173:4173"` — and forward to `127.0.0.1:4173`.
- **Both in Docker:** put them on the same Docker network and forward to the container name
  (`rizz-aura`) on port `4173` instead of an IP.
- **Stripe webhook:** a path on the main host — `https://rizzaura.net/api/webhook`. No extra
  proxy host, no `/api` location.
- `.env` must have `APP_URL=https://rizzaura.net` so Stripe redirects buyers back correctly.
- Client IP for vote limits comes from `cf-connecting-ip` → `x-forwarded-for` → socket IP,
  so it works behind NPM and/or Cloudflare unchanged.

## CI

`.github/workflows/docker-image.yml` builds the Docker image on every push/PR, and on the
default branch and version tags it also pushes the image to GitHub Container Registry
(`ghcr.io/<owner>/<repo>`). Pull it with:

```bash
docker pull ghcr.io/<owner>/<repo>:latest
```

## API

All endpoints are JSON. The dev server proxies `/api` to `:4173`; in production the same
server handles both.

| Endpoint          | Method | Description                                                                            |
| ----------------- | ------ | -------------------------------------------------------------------------------------- |
| `/api/state`      | GET    | Public state: aura deltas, census counts, feed, battle, player count                   |     | `/api/claim` | POST | Claim your aura + enter the leaderboard (`{ name }`) |
| `/api/vote`       | POST   | Up/downvote a personality (`{ id, dir }`, 10 votes/IP/day)                             |
| `/api/voterefill` | POST   | Refill today's votes                                                                   |
| `/api/battle`     | POST   | Decide the current battle (`{ winnerId }`)                                             |
| `/api/census`     | POST   | Vote in a census question (`{ qid, option }`)                                          |
| `/api/golden`     | POST   | Golden Upvote: +250 aura to a personality (`{ target, name }`)                         |
| `/api/checkout`   | POST   | Create a Stripe Checkout session (`{ product: slot\|golden\|frame, ... }`) → `{ url }` |
| `/api/webhook`    | POST   | Stripe webhook (`checkout.session.completed`) — verifies & applies orders              |
| `/api/order/:id`  | GET    | Look up a paid order by Checkout session id (used after redirect)                      |

`/api/state` also returns `bids` — the paid board slots, sorted by amount on the client.

Client IP is taken from `cf-connecting-ip` (or `x-forwarded-for`, falling back to the socket
address), so it works behind Cloudflare and plain reverse proxies.

## Scripts

```bash
npm run dev          # Vite dev server (:5173)
npm run build        # production build → dist/
npm run serve        # API + static server (:4173)
npm run lint         # eslint .
npm run lint:fix     # eslint . --fix
npm run format       # prettier --write .
npm run format:check # prettier --check .
```

## Project layout

```
src/
  components/   # React UI: Ticker, Nav, Hero, Leaderboard, Battles, Feed, ...
  store.jsx     # context, provider, actions
  reducer.js    # reducer + localStorage persistence
  api.js        # fetch wrapper
  helpers.js    # pure helpers (fmt, getAura, rankOf, ...)
  data.js       # personalities, census, market, feed templates
server.mjs      # Node HTTP server: static + /api + background simulation
Dockerfile      # two-stage build, no node_modules in the runtime image
docker-compose.yml
```

> Fan-made meme project. Not affiliated with any of the people, brands, or games mentioned.
> All aura is fictional. 💀
