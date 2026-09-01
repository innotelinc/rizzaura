import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import { CASH_SHOP, CENSUS, PERSONALITIES, FEED_TEMPLATES } from "./data.mjs";
import {
  getState,
  getUser,
  userView,
  getPerson,
  getAura,
  pushFeed,
  escapeHtml,
  loadState,
  saveState,
  newBattle,
  todayKey,
  touchNo1,
  topPlayers,
  publicState,
} from "./state.mjs";
import {
  authConfig,
  readSession,
  sessionCookie,
  clearCookie,
  isAdmin,
  buildLoginUrl,
  verifyLoginState,
  exchangeCode,
  buildLogoutUrl,
  corsHeaders,
  clientIp,
} from "./auth.mjs";
import { handleSse, broadcast, startHeartbeat } from "./sse.mjs";
import { evaluateAchievements, aiRecommendations } from "./achievements.mjs";
import { rolloverSeason } from "./seasons.mjs";
import {
  createTeam,
  joinTeam,
  leaveTeam,
  teamView,
  createCompetition,
  enterCompetition,
  endCompetition,
  accrueCompetition,
} from "./teams.mjs";

const PORT = process.env.PORT || 8000;
const VOTE_LIMIT = 10; // votes per IP per day

/* ------------------------- tiny .env loader (zero deps) ------------------------- */
function loadEnv() {
  try {
    const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
          v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  } catch {
    /* no .env file — env vars come from the shell / docker */
  }
}
loadEnv();

/* ------------------------- Stripe (Cash Shop) ------------------------- */
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

async function stripePost(pathname, params) {
  const r = await fetch("https://api.stripe.com/v1" + pathname, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + STRIPE_SECRET,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json();
  if (!r.ok) {
    const err = new Error(j.error?.message || "stripe error " + r.status);
    err.status = r.status;
    throw err;
  }
  return j;
}

function applyOrder(o) {
  const state = getState();
  state.orders[o.sessionId] = o;
  const keys = Object.keys(state.orders);
  if (keys.length > 500) delete state.orders[keys[0]];
  if (o.product === "slot") {
    const name = String(o.name || "Anonymous");
    const entry = {
      id: o.sessionId,
      name,
      handle: o.handle || "@" + name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
      emoji: o.emoji || "😎",
      cents: o.cents || 300,
      verified: true,
      ts: Date.now(),
    };
    state.bids.push(entry);
    pushFeed({
      icon: "💰",
      text: `<b>${escapeHtml(name)}</b> just bought a spot on the Clout Board for <b>$${(entry.cents / 100).toFixed(2)}</b> 👑 Rank is what you pay.`,
      ts: Date.now(),
    });
    broadcast({ type: "bid", payload: entry });
  } else if (o.product === "golden") {
    const p = getPerson(o.target);
    if (p) {
      state.pAura[o.target] = getAura(o.target) + 500;
      pushFeed({
        icon: "💸",
        text: `Someone dropped <b>cash</b> on a Golden Upvote for <b>${p.name}</b> (+500 Aura) 💸 Pure glaze.`,
        ts: Date.now(),
      });
      broadcast({ type: "aura", payload: { id: o.target, aura: state.pAura[o.target] } });
    }
  } else if (o.product === "frame") {
    pushFeed({
      icon: "✨",
      text: `Someone copped the <b>Permanent Flex Frame</b> 💸 Now they glow forever.`,
      ts: Date.now(),
    });
  }
}

/* ------------------------- helpers ------------------------- */
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const secure = () => /^https:/.test(process.env.APP_URL || "");

function votesUsed(ip) {
  const row = getState().votesByIp[ip];
  return row && row.date === todayKey() ? row.used : 0;
}
function markVote(ip) {
  const s = getState();
  s.votesByIp[ip] = { date: todayKey(), used: votesUsed(ip) + 1 };
  return s.votesByIp[ip].used;
}

/* User bookkeeping on actions: bump stats, accrue competition scores, then
 * evaluate badges. Called for authenticated sessions only. */
function userAction(req, fn) {
  const user = readSession(req);
  if (!user) return;
  const u = getUser(user.sub);
  if (!u) return;
  fn(u);
  accrueCompetition(u, "aura", 1);
  evaluateAchievements(user.sub);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("bad json"));
      }
    });
    req.on("error", reject);
  });
}
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5e6) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function json(res, code, data, extra = {}) {
  res.writeHead(code, { "Content-Type": "application/json", ...extra });
  res.end(JSON.stringify(data));
}

/* ------------------------- server ------------------------- */
const server = http.createServer(async (req, res) => {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const ip = clientIp(req);

  try {
    /* ── identity ─────────────────────────────────────────────── */
    if (pathname === "/api/me" && req.method === "GET") {
      const session = readSession(req);
      if (!session) return json(res, 200, { anon: true });
      const u = userView(session.sub);
      if (!u) return json(res, 200, { anon: true });
      return json(res, 200, { user: { ...u, isAdmin: session.isAdmin } });
    }

    if (pathname === "/api/auth/login" && req.method === "GET") {
      if (!authConfig().clientId) return json(res, 200, { ok: false, error: "not_configured" });
      const next = url.searchParams.get("next") || "";
      const safeNext = next && authConfig().appOrigins.some((o) => next.startsWith(o)) ? next : "";
      try {
        const loginUrl = await buildLoginUrl(safeNext);
        res.writeHead(302, { Location: loginUrl });
        res.end();
      } catch (e) {
        json(res, 502, { ok: false, error: "authentik unreachable: " + e.message });
      }
      return;
    }

    if (pathname === "/api/auth/callback" && req.method === "GET") {
      const code = url.searchParams.get("code") || "";
      const state = url.searchParams.get("state") || "";
      const next = url.searchParams.get("next") || "";
      if (!verifyLoginState(state)) return json(res, 400, { ok: false, error: "bad state" });
      try {
        const user = await exchangeCode(code);
        if (!user.sub) return json(res, 400, { ok: false, error: "no subject" });
        const u = getUser(user.sub);
        u.name = user.name;
        u.email = user.email;
        saveState();
        evaluateAchievements(user.sub);
        const target =
          next && authConfig().appOrigins.some((o) => next.startsWith(o)) ? next : APP_URL;
        res.writeHead(302, {
          Location: target,
          "Set-Cookie": sessionCookie(user, secure()),
        });
        res.end();
      } catch (e) {
        json(res, 502, { ok: false, error: "auth failed: " + e.message });
      }
      return;
    }

    if (pathname === "/api/auth/logout" && req.method === "GET") {
      let loc = APP_URL;
      try {
        loc = (await buildLogoutUrl()) || APP_URL;
      } catch {
        /* fall back to app root */
      }
      res.writeHead(302, { Location: loc, "Set-Cookie": clearCookie(secure()) });
      res.end();
      return;
    }

    /* ── real-time events (SSE) ───────────────────────────────── */
    if (pathname === "/api/events" && req.method === "GET") {
      handleSse(req, res);
      return;
    }

    /* ── public state ─────────────────────────────────────────── */
    if (pathname === "/api/state" && req.method === "GET") {
      return json(res, 200, publicState());
    }

    /* ── achievements ─────────────────────────────────────────── */
    if (pathname === "/api/achievements" && req.method === "GET") {
      const state = getState();
      const player = url.searchParams.get("player");
      const earned = player
        ? state.achievements.filter((a) => a.player === player)
        : state.achievements;
      return json(res, 200, { earned });
    }

    if (pathname === "/api/achievements/recommend" && req.method === "POST") {
      const session = readSession(req);
      if (!session) return json(res, 401, { ok: false, error: "sign in first" });
      const u = getUser(session.sub);
      if (!u || !u.name) return json(res, 400, { ok: false, error: "claim a profile first" });
      const recs = await aiRecommendations(u);
      return json(res, 200, { ok: true, ...recs });
    }

    /* ── seasons / hall of fame ───────────────────────────────── */
    if (pathname === "/api/seasons" && req.method === "GET") {
      const state = getState();
      return json(res, 200, { season: state.season, hallOfFame: state.hallOfFame });
    }
    if (pathname === "/api/halloffame" && req.method === "GET") {
      const state = getState();
      return json(res, 200, { hallOfFame: state.hallOfFame });
    }

    /* ── teams ────────────────────────────────────────────────── */
    if (pathname === "/api/teams" && req.method === "GET") {
      const state = getState();
      return json(res, 200, { teams: Object.values(state.teams).map(teamView) });
    }
    if (pathname === "/api/teams" && req.method === "POST") {
      const session = readSession(req);
      if (!session) return json(res, 401, { ok: false, error: "sign in first" });
      const u = getUser(session.sub);
      const body = await readBody(req);
      const out = createTeam(u, body);
      return out.error ? json(res, 400, { ok: false, error: out.error }) : json(res, 200, out);
    }
    if (pathname.startsWith("/api/teams/") && req.method === "POST") {
      const session = readSession(req);
      if (!session) return json(res, 401, { ok: false, error: "sign in first" });
      const u = getUser(session.sub);
      const parts = pathname.split("/");
      const teamId = parts[3];
      const action = parts[4];
      const out =
        action === "join"
          ? joinTeam(u, teamId)
          : action === "leave"
            ? leaveTeam(u, teamId)
            : { error: "unknown action" };
      return out.error ? json(res, 400, { ok: false, error: out.error }) : json(res, 200, out);
    }

    /* ── competitions ─────────────────────────────────────────── */
    if (pathname === "/api/competitions" && req.method === "POST") {
      const session = readSession(req);
      if (!session) return json(res, 401, { ok: false, error: "sign in first" });
      const u = getUser(session.sub);
      if (!isAdmin(session)) return json(res, 403, { ok: false, error: "admins only" });
      const body = await readBody(req);
      const out = createCompetition(u, body);
      return out.error ? json(res, 400, { ok: false, error: out.error }) : json(res, 200, out);
    }
    if (pathname.startsWith("/api/competitions/") && req.method === "POST") {
      const session = readSession(req);
      if (!session) return json(res, 401, { ok: false, error: "sign in first" });
      const u = getUser(session.sub);
      const parts = pathname.split("/");
      const compId = parts[3];
      const out = enterCompetition(u, compId);
      return out.error ? json(res, 400, { ok: false, error: out.error }) : json(res, 200, out);
    }

    /* ── admin ────────────────────────────────────────────────── */
    if (pathname.startsWith("/api/admin/")) {
      const session = readSession(req);
      if (!session || !isAdmin(session)) return json(res, 403, { ok: false, error: "admins only" });

      if (pathname === "/api/admin/stats" && req.method === "GET") {
        const state = getState();
        return json(res, 200, {
          players: state.players,
          users: Object.values(state.users).filter((u) => u.name).length,
          votesToday: Object.values(state.votesByIp)
            .filter((r) => r.date === todayKey())
            .reduce((s, r) => s + r.used, 0),
          orders: Object.values(state.orders).length,
          revenueCents: Object.values(state.orders).reduce((s, o) => s + (o.cents || 0), 0),
          bids: state.bids.length,
          badges: state.achievements.length,
          season: state.season,
          topPlayers: topPlayers(10).map((u) => ({
            name: u.name,
            aura: u.aura,
            prestige: u.prestige,
          })),
        });
      }
      if (pathname === "/api/admin/achievements/grant" && req.method === "POST") {
        const { player, badge } = await readBody(req);
        const u = getUser(player);
        if (!u) return json(res, 404, { ok: false, error: "no such player" });
        if (!u.badges.includes(badge)) u.badges.push(badge);
        saveState();
        return json(res, 200, { ok: true });
      }
      if (pathname === "/api/admin/achievements/revoke" && req.method === "POST") {
        const { player, badge } = await readBody(req);
        const u = getUser(player);
        if (!u) return json(res, 404, { ok: false, error: "no such player" });
        u.badges = (u.badges || []).filter((b) => b !== badge);
        saveState();
        return json(res, 200, { ok: true });
      }
      if (pathname === "/api/admin/seasons/rollover" && req.method === "POST") {
        const season = rolloverSeason(true);
        return json(res, 200, { ok: true, season });
      }
      if (pathname.startsWith("/api/admin/competitions/") && req.method === "POST") {
        const compId = pathname.split("/")[4];
        const out = endCompetition(compId);
        return out.error ? json(res, 400, { ok: false, error: out.error }) : json(res, 200, out);
      }
      return json(res, 404, { ok: false, error: "not found" });
    }

    /* ── voting ───────────────────────────────────────────────── */
    if (pathname === "/api/vote" && req.method === "POST") {
      const { id, dir } = await readBody(req);
      const p = getPerson(id);
      if (!p || ![1, -1].includes(dir)) return json(res, 400, { ok: false, error: "bad payload" });
      if (votesUsed(ip) >= VOTE_LIMIT)
        return json(res, 200, { ok: false, reason: "limit", remaining: 0 });
      getState().pAura[id] = Math.max(100, getAura(id) + dir * 5);
      const used = markVote(ip);
      pushFeed({
        icon: dir > 0 ? "⬆️" : "⬇️",
        text:
          dir > 0
            ? `<b>${p.name}</b> got pumped +5 Aura ⬆️`
            : `<b>${p.name}</b> got dumped -5 Aura ⬇️`,
        ts: Date.now(),
      });
      userAction(req, (u) => {
        u.votesCast += 1;
        u.aura += dir * 5;
        accrueCompetition(u, "votes", 1);
      });
      saveState();
      broadcast({ type: "aura", payload: { id, aura: getState().pAura[id] } });
      return json(res, 200, { ok: true, aura: getState().pAura[id], remaining: VOTE_LIMIT - used });
    }

    if (pathname === "/api/voterefill" && req.method === "POST") {
      const row = getState().votesByIp[ip];
      if (row && row.date === todayKey()) row.used = Math.max(0, row.used - 10);
      else getState().votesByIp[ip] = { date: todayKey(), used: 0 };
      saveState();
      return json(res, 200, { ok: true, remaining: VOTE_LIMIT - votesUsed(ip) });
    }

    if (pathname === "/api/battle" && req.method === "POST") {
      const { winnerId } = await readBody(req);
      const state = getState();
      if (!state.battle || state.battle.voted)
        return json(res, 200, { ok: false, error: "battle already decided" });
      const a = getPerson(state.battle.a),
        b = getPerson(state.battle.b);
      if (winnerId !== a.id && winnerId !== b.id)
        return json(res, 400, { ok: false, error: "bad payload" });
      const winner = winnerId === a.id ? a : b;
      const loser = winnerId === a.id ? b : a;
      state.pAura[winner.id] = getAura(winner.id) + 60;
      state.pAura[loser.id] = Math.max(100, getAura(loser.id) - 15);
      state.battle = { ...state.battle, voted: true, winner: winner.id, loser: loser.id };
      pushFeed({
        icon: "⚔️",
        text: `<b>${winner.name}</b> mogged <b>${loser.name}</b> in ${state.battle.cat} 💀`,
        ts: Date.now(),
      });
      userAction(req, (u) => {
        u.battlesWon += 1;
        u.aura += 60;
      });
      saveState();
      setTimeout(() => {
        newBattle();
        saveState();
        broadcast({ type: "battle", payload: getState().battle });
      }, 1800);
      broadcast({ type: "battle", payload: state.battle });
      return json(res, 200, { ok: true, winner: winner.id, loser: loser.id });
    }

    if (pathname === "/api/census" && req.method === "POST") {
      const { qid, option } = await readBody(req);
      const state = getState();
      const q = CENSUS.find((x) => x.id === qid);
      if (!q || !Number.isInteger(option) || option < 0 || option >= q.options.length)
        return json(res, 400, { ok: false, error: "bad payload" });
      const key = ip + "|" + qid;
      if (state.censusByIp[key])
        return json(res, 200, { ok: false, reason: "already", counts: state.censusCounts[qid] });
      state.censusByIp[key] = true;
      state.censusCounts[qid] = state.censusCounts[qid] || q.options.map(() => 0);
      state.censusCounts[qid][option]++;
      userAction(req, (u) => {
        u.censusVotes += 1;
        u.aura += 2;
      });
      saveState();
      broadcast({ type: "census", payload: { qid, counts: state.censusCounts[qid] } });
      return json(res, 200, { ok: true, counts: state.censusCounts[qid] });
    }

    if (pathname === "/api/golden" && req.method === "POST") {
      const { target, name } = await readBody(req);
      const p = getPerson(target);
      if (!p) return json(res, 400, { ok: false, error: "bad payload" });
      getState().pAura[target] = getAura(target) + 250;
      pushFeed({
        icon: "🏆",
        text: `<b>${escapeHtml(String(name || "Someone"))}</b> bought a Golden Upvote for <b>${p.name}</b> (+250 Aura) 🏆`,
        ts: Date.now(),
      });
      userAction(req, (u) => {
        u.goldenGifts += 1;
      });
      saveState();
      broadcast({ type: "aura", payload: { id: target, aura: getState().pAura[target] } });
      return json(res, 200, { ok: true, aura: getState().pAura[target] });
    }

    if (pathname === "/api/claim" && req.method === "POST") {
      const { name } = await readBody(req);
      getState().players++;
      pushFeed({
        icon: "👋",
        text: `<b>${escapeHtml(String(name || "Someone"))}</b> just claimed their Aura and entered the leaderboard ⚡`,
        ts: Date.now(),
      });
      const session = readSession(req);
      if (session) {
        const u = getUser(session.sub);
        u.name = String(name || u.name || "Player").slice(0, 20);
        u.aura = Math.max(u.aura, 100);
        evaluateAchievements(session.sub);
      }
      saveState();
      broadcast({ type: "player", payload: { players: getState().players } });
      return json(res, 200, { ok: true, players: getState().players });
    }

    /* ── Cash Shop (Stripe) ───────────────────────────────────── */
    if (pathname === "/api/checkout" && req.method === "POST") {
      if (!STRIPE_SECRET) return json(res, 200, { ok: false, error: "not_configured" });
      const { product, name, handle, emoji, target, amount } = await readBody(req);
      let unitAmount = 0;
      let productName = "Rizz Aura Flex";
      let metadata = { product: String(product || ""), ip };
      if (product === "slot") {
        const n = String(name || "")
          .trim()
          .slice(0, 20);
        if (!n) return json(res, 400, { ok: false, error: "name required" });
        const cents = Math.max(CASH_SHOP.slot.minCents, Math.round(Number(amount) || 0));
        if (!Number.isFinite(cents)) return json(res, 400, { ok: false, error: "bad amount" });
        unitAmount = cents;
        productName = "Aura Board Slot — " + n;
        metadata = {
          product: "slot",
          name: n,
          handle: String(handle || "")
            .trim()
            .slice(0, 20),
          emoji: String(emoji || "😎"),
          ip,
        };
      } else if (product === "golden") {
        const p = getPerson(target);
        if (!p) return json(res, 400, { ok: false, error: "bad target" });
        unitAmount = CASH_SHOP.golden.price;
        productName = "Cash Golden Upvote → " + p.name;
        metadata = { product: "golden", target: p.id, ip };
      } else if (product === "frame") {
        unitAmount = CASH_SHOP.frame.price;
        productName = "Permanent Flex Frame";
        metadata = { product: "frame", ip };
      } else {
        return json(res, 400, { ok: false, error: "bad payload" });
      }
      const session = await stripePost("/checkout/sessions", {
        mode: "payment",
        success_url: APP_URL + "/?paid=1&session={CHECKOUT_SESSION_ID}",
        cancel_url: APP_URL + "/?paid=0",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(unitAmount),
        "line_items[0][price_data][product_data][name]": productName,
        "metadata[product]": metadata.product,
        "metadata[name]": metadata.name || "",
        "metadata[handle]": metadata.handle || "",
        "metadata[emoji]": metadata.emoji || "",
        "metadata[target]": metadata.target || "",
      });
      return json(res, 200, { ok: true, url: session.url, id: session.id });
    }

    if (pathname === "/api/webhook" && req.method === "POST") {
      const raw = await readRawBody(req);
      if (!STRIPE_WEBHOOK_SECRET) return json(res, 400, { ok: false, error: "not_configured" });
      const sig = req.headers["stripe-signature"] || "";
      const tMatch = sig.match(/t=(\d+)/);
      const vMatch = sig.match(/v1=([0-9a-f]+)/);
      if (!tMatch || !vMatch) return json(res, 400, { ok: false, error: "bad signature" });
      if (Math.abs(Date.now() / 1000 - Number(tMatch[1])) > 300)
        return json(res, 400, { ok: false, error: "expired signature" });
      const expected = crypto
        .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
        .update(tMatch[1] + "." + raw)
        .digest("hex");
      const a = Buffer.from(expected);
      const b = Buffer.from(vMatch[1]);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
        return json(res, 400, { ok: false, error: "bad signature" });
      const evt = JSON.parse(raw);
      if (evt.type === "checkout.session.completed") {
        const s = evt.data.object;
        const m = s.metadata || {};
        applyOrder({
          sessionId: s.id,
          product: m.product,
          name: m.name,
          handle: m.handle,
          emoji: m.emoji,
          target: m.target,
          cents: s.amount_total || 0,
        });
        saveState();
      }
      return json(res, 200, { ok: true });
    }

    if (pathname.startsWith("/api/order/") && req.method === "GET") {
      const sessionId = decodeURIComponent(pathname.slice("/api/order/".length));
      const o = getState().orders[sessionId];
      return json(res, 200, o ? { ok: true, order: o } : { ok: false, pending: true });
    }

    return json(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    json(res, 400, { ok: false, error: e.message });
  }
});

/* ------------------------- background simulation ------------------------- */
setInterval(() => {
  const state = getState();
  const n = Math.random() < 0.35 ? 2 : 1;
  // aura drift across the roster
  for (let i = 0; i < n; i++) {
    const p = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
    state.pAura[p.id] = Math.max(100, getAura(p.id) + rnd(-35, 90));
  }
  if (Math.random() < 0.8) {
    const t = pick(FEED_TEMPLATES);
    const ids = PERSONALITIES.map((x) => x.id);
    let a = pick(ids),
      b = pick(ids);
    while (b === a) b = pick(ids);
    pushFeed({
      icon: pick(["🔥", "💀", "🫡", "👑", "🏆", "⚡", "🧢", "🤝"]),
      text: t
        .replaceAll("{a}", getPerson(a)?.name || a)
        .replaceAll("{b}", getPerson(b)?.name || b)
        .replaceAll("{n}", rnd(50, 900).toLocaleString("en-US")),
      ts: Date.now(),
    });
  }
  touchNo1();
  // auto-rollover when a season ends
  if (getState().season && Date.now() >= getState().season.endsAt) rolloverSeason(false);
  saveState();
}, 6000);

/* ------------------------- boot ------------------------- */
loadState();
startHeartbeat(publicState);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Rizz Aura API listening on http://0.0.0.0:${PORT}`);
});
