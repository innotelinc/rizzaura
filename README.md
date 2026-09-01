# Rizz Aura 🔥

The global aura leaderboard. Rank creators, brands, streamers, athletes, and your friends —
earn clout, collect aura, and prove who's really the main character.

"Got Aura? Prove It."

## Stack

- **Frontend:** React 18 + Vite 5 (`src/`)
- **Backend:** plain Node `http` server (`server.mjs`) — serves `dist/` + the `/api` JSON API
- **State:** a single `data/state.json` file (votes, aura deltas, battles, census, feed)
- **Tooling:** ESLint (flat config) + Prettier

No database, no framework, no external services. One Node process is the whole app.

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

| Endpoint          | Method | Description                                                          |
| ----------------- | ------ | -------------------------------------------------------------------- |
| `/api/state`      | GET    | Public state: aura deltas, census counts, feed, battle, player count |
| `/api/claim`      | POST   | Claim your aura + enter the leaderboard (`{ name }`)                 |
| `/api/vote`       | POST   | Up/downvote a personality (`{ id, dir }`, 10 votes/IP/day)           |
| `/api/voterefill` | POST   | Refill today's votes                                                 |
| `/api/battle`     | POST   | Decide the current battle (`{ winnerId }`)                           |
| `/api/census`     | POST   | Vote in a census question (`{ qid, option }`)                        |
| `/api/golden`     | POST   | Golden Upvote: +250 aura to a personality (`{ target, name }`)       |

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
