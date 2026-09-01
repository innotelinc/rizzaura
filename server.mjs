import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PERSONALITIES, CENSUS, BATTLE_CATS, FEED_TEMPLATES, CASH_SHOP } from "./src/data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PORT = process.env.PORT || 4173;
const VOTE_LIMIT = 10; // votes per IP per day

/* ------------------------- tiny .env loader (zero deps) ------------------------- */
function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
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

// Apply a confirmed order (called from the webhook). Orders are keyed by
// Stripe Checkout session id so /api/order/:id can report back to the client.
function applyOrder(o) {
  state.orders[o.sessionId] = o;
  // keep the orders log bounded — it only exists for /api/order/:id lookups
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
  } else if (o.product === "golden") {
    const p = getPerson(o.target);
    if (p) {
      state.pAura[o.target] = getAura(o.target) + 500;
      pushFeed({
        icon: "💸",
        text: `Someone dropped <b>cash</b> on a Golden Upvote for <b>${p.name}</b> (+500 Aura) 💸 Pure glaze.`,
        ts: Date.now(),
      });
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
const todayKey = () => new Date().toISOString().slice(0, 10);
const getPerson = (id) => PERSONALITIES.find((p) => p.id === id);
const getAura = (id) => state.pAura[id] ?? getPerson(id).aura;
const pushFeed = (evt) => {
  state.feed.unshift(evt);
  if (state.feed.length > 30) state.feed.pop();
};
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function twoRandomIds() {
  let a = pick(PERSONALITIES),
    b = pick(PERSONALITIES);
  while (b.id === a.id) b = pick(PERSONALITIES);
  return [a.id, b.id];
}
function makeEvent() {
  const t = pick(FEED_TEMPLATES);
  const [a, b] = twoRandomIds();
  return {
    icon: pick(["🔥", "💀", "🫡", "👑", "🏆", "⚡", "🧢", "🤝"]),
    text: t
      .replaceAll("{a}", getPerson(a).name)
      .replaceAll("{b}", getPerson(b).name)
      .replaceAll("{n}", rnd(50, 900).toLocaleString("en-US")),
    ts: Date.now(),
  };
}
function newBattle() {
  const [a, b] = twoRandomIds();
  state.battle = { a, b, cat: pick(BATTLE_CATS), voted: false, winner: null, loser: null };
}

/* ------------------------- state ------------------------- */
let state = {
  pAura: {},
  censusCounts: {},
  feed: [],
  battle: null,
  votesByIp: {},
  censusByIp: {},
  players: 12847,
  bids: [], // paid Clout Board slots: { id, name, handle, emoji, cents, verified, ts }
  orders: {}, // paid orders keyed by Stripe session id
};

function seedCensus() {
  CENSUS.forEach((q) => {
    if (!state.censusCounts[q.id]) state.censusCounts[q.id] = q.options.map(() => rnd(4, 25));
  });
}
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      state = { ...state, ...s };
    }
  } catch (e) {
    console.error("Failed to load state:", e.message);
  }
  if (!state.censusCounts || !Object.keys(state.censusCounts).length) state.censusCounts = {};
  seedCensus();
  if (!state.feed || !state.feed.length) {
    state.feed = [];
    for (let i = 0; i < 8; i++) pushFeed(makeEvent());
  }
  if (!state.battle || !state.battle.a) newBattle();
  if (!Array.isArray(state.bids)) state.bids = [];
  if (!state.orders || typeof state.orders !== "object") state.orders = {};
  if (!state.bids.length) seedBids();
}

// A few demo slots so the board doesn't look empty before the first real bid.
// Delete them from data/state.json anytime — they're just hype.
function seedBids() {
  const now = Date.now();
  const demos = [
    ["Lil' Bro Inc.", "@lilbro", "🤑", 42000, now - 86400000 * 2],
    ["The Group Chat", "@groupchat", "💬", 25000, now - 86400000],
    ["Glizzy Gang", "@glizzy", "🌭", 10000, now - 3600000 * 5],
    ["Ur Mom's Friend", "@umf", "👩‍👧", 5000, now - 3600000],
    ["Speed's Manager", "@speedmgmt", "🧢", 3000, now - 1800000],
  ];
  state.bids = demos.map(([name, handle, emoji, cents, ts]) => ({
    id: "demo-" + name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
    name,
    handle,
    emoji,
    cents,
    verified: true,
    ts,
  }));
}
function saveState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STATE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error("Failed to save state:", e.message);
  }
}

/* ------------------------- ip helpers ------------------------- */
function clientIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress
  );
}
function votesUsed(ip) {
  const row = state.votesByIp[ip];
  return row && row.date === todayKey() ? row.used : 0;
}
function markVote(ip) {
  state.votesByIp[ip] = { date: todayKey(), used: votesUsed(ip) + 1 };
  return state.votesByIp[ip].used;
}

/* ------------------------- server ------------------------- */
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".map": "application/json",
  ".woff2": "font/woff2",
};

function serveStatic(req, res, pathname) {
  let filePath = path.join(DIST, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(DIST, "index.html"), (err2, index) => {
        if (err2) {
          res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(index);
      });
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  });
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

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// Raw body (no JSON parse) — Stripe webhook signatures are computed over the
// exact bytes of the payload, so we must verify before parsing.
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

function publicState() {
  return {
    pAura: state.pAura,
    censusCounts: state.censusCounts,
    feed: state.feed,
    battle: state.battle,
    players: state.players,
    bids: state.bids,
  };
}

const server = http.createServer(async (req, res) => {
  // CORS (for dev server on another port)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const ip = clientIp(req);

  try {
    if (pathname === "/api/state" && req.method === "GET") {
      json(res, 200, publicState());
      return;
    }

    if (pathname === "/api/checkout" && req.method === "POST") {
      if (!STRIPE_SECRET) {
        json(res, 200, { ok: false, error: "not_configured" });
        return;
      }
      const { product, name, handle, emoji, target, amount } = await readBody(req);
      let unitAmount = 0;
      let productName = "Rizz Aura Flex";
      let metadata = { product: String(product || ""), ip };
      if (product === "slot") {
        const n = String(name || "")
          .trim()
          .slice(0, 20);
        if (!n) {
          json(res, 400, { ok: false, error: "name required" });
          return;
        }
        const cents = Math.max(CASH_SHOP.slot.minCents, Math.round(Number(amount) || 0));
        if (!Number.isFinite(cents)) {
          json(res, 400, { ok: false, error: "bad amount" });
          return;
        }
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
        if (!p) {
          json(res, 400, { ok: false, error: "bad target" });
          return;
        }
        unitAmount = CASH_SHOP.golden.price;
        productName = "Cash Golden Upvote → " + p.name;
        metadata = { product: "golden", target: p.id, ip };
      } else if (product === "frame") {
        unitAmount = CASH_SHOP.frame.price;
        productName = "Permanent Flex Frame";
        metadata = { product: "frame", ip };
      } else {
        json(res, 400, { ok: false, error: "bad payload" });
        return;
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
      json(res, 200, { ok: true, url: session.url, id: session.id });
      return;
    }

    if (pathname === "/api/webhook" && req.method === "POST") {
      const raw = await readRawBody(req);
      if (!STRIPE_WEBHOOK_SECRET) {
        json(res, 400, { ok: false, error: "not_configured" });
        return;
      }
      const sig = req.headers["stripe-signature"] || "";
      const tMatch = sig.match(/t=(\d+)/);
      const vMatch = sig.match(/v1=([0-9a-f]+)/);
      if (!tMatch || !vMatch) {
        json(res, 400, { ok: false, error: "bad signature" });
        return;
      }
      // replay protection: reject signatures older than 5 minutes
      if (Math.abs(Date.now() / 1000 - Number(tMatch[1])) > 300) {
        json(res, 400, { ok: false, error: "expired signature" });
        return;
      }
      const expected = crypto
        .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
        .update(tMatch[1] + "." + raw)
        .digest("hex");
      const a = Buffer.from(expected);
      const b = Buffer.from(vMatch[1]);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        json(res, 400, { ok: false, error: "bad signature" });
        return;
      }
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
      json(res, 200, { ok: true });
      return;
    }

    if (pathname.startsWith("/api/order/") && req.method === "GET") {
      const sessionId = decodeURIComponent(pathname.slice("/api/order/".length));
      const o = state.orders[sessionId];
      json(res, 200, o ? { ok: true, order: o } : { ok: false, pending: true });
      return;
    }

    if (pathname === "/api/vote" && req.method === "POST") {
      const { id, dir } = await readBody(req);
      const p = getPerson(id);
      if (!p || ![1, -1].includes(dir)) {
        json(res, 400, { ok: false, error: "bad payload" });
        return;
      }
      if (votesUsed(ip) >= VOTE_LIMIT) {
        json(res, 200, { ok: false, reason: "limit", remaining: 0 });
        return;
      }
      state.pAura[id] = Math.max(100, getAura(id) + dir * 5);
      const used = markVote(ip);
      pushFeed({
        icon: dir > 0 ? "⬆️" : "⬇️",
        text:
          dir > 0
            ? `<b>${p.name}</b> got pumped +5 Aura ⬆️`
            : `<b>${p.name}</b> got dumped -5 Aura ⬇️`,
        ts: Date.now(),
      });
      saveState();
      json(res, 200, { ok: true, aura: state.pAura[id], remaining: VOTE_LIMIT - used });
      return;
    }

    if (pathname === "/api/voterefill" && req.method === "POST") {
      const row = state.votesByIp[ip];
      if (row && row.date === todayKey()) row.used = Math.max(0, row.used - 10);
      else state.votesByIp[ip] = { date: todayKey(), used: 0 };
      saveState();
      json(res, 200, { ok: true, remaining: VOTE_LIMIT - votesUsed(ip) });
      return;
    }

    if (pathname === "/api/battle" && req.method === "POST") {
      const { winnerId } = await readBody(req);
      if (!state.battle || state.battle.voted) {
        json(res, 200, { ok: false, error: "battle already decided" });
        return;
      }
      const a = getPerson(state.battle.a),
        b = getPerson(state.battle.b);
      if (winnerId !== a.id && winnerId !== b.id) {
        json(res, 400, { ok: false, error: "bad payload" });
        return;
      }
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
      saveState();
      setTimeout(() => {
        newBattle();
        saveState();
      }, 1800);
      json(res, 200, { ok: true, winner: winner.id, loser: loser.id });
      return;
    }

    if (pathname === "/api/census" && req.method === "POST") {
      const { qid, option } = await readBody(req);
      const q = CENSUS.find((x) => x.id === qid);
      if (!q || !Number.isInteger(option) || option < 0 || option >= q.options.length) {
        json(res, 400, { ok: false, error: "bad payload" });
        return;
      }
      const key = ip + "|" + qid;
      if (state.censusByIp[key]) {
        json(res, 200, { ok: false, reason: "already", counts: state.censusCounts[qid] });
        return;
      }
      state.censusByIp[key] = true;
      state.censusCounts[qid] = state.censusCounts[qid] || q.options.map(() => 0);
      state.censusCounts[qid][option]++;
      saveState();
      json(res, 200, { ok: true, counts: state.censusCounts[qid] });
      return;
    }

    if (pathname === "/api/golden" && req.method === "POST") {
      const { target, name } = await readBody(req);
      const p = getPerson(target);
      if (!p) {
        json(res, 400, { ok: false, error: "bad payload" });
        return;
      }
      state.pAura[target] = getAura(target) + 250;
      pushFeed({
        icon: "🏆",
        text: `<b>${escapeHtml(String(name || "Someone"))}</b> bought a Golden Upvote for <b>${p.name}</b> (+250 Aura) 🏆`,
        ts: Date.now(),
      });
      saveState();
      json(res, 200, { ok: true, aura: state.pAura[target] });
      return;
    }

    if (pathname === "/api/claim" && req.method === "POST") {
      const { name } = await readBody(req);
      state.players++;
      pushFeed({
        icon: "👋",
        text: `<b>${escapeHtml(String(name || "Someone"))}</b> just claimed their Aura and entered the leaderboard ⚡`,
        ts: Date.now(),
      });
      saveState();
      json(res, 200, { ok: true, players: state.players });
      return;
    }

    if (pathname.startsWith("/api/")) {
      json(res, 404, { ok: false, error: "not found" });
      return;
    }

    serveStatic(req, res, pathname);
  } catch (e) {
    json(res, 400, { ok: false, error: e.message });
  }
});

/* ------------------------- simulation ------------------------- */
setInterval(() => {
  const n = Math.random() < 0.35 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const p = pick(PERSONALITIES);
    state.pAura[p.id] = Math.max(100, getAura(p.id) + rnd(-35, 90));
  }
  if (Math.random() < 0.8) pushFeed(makeEvent());
  saveState();
}, 6000);

/* ------------------------- boot ------------------------- */
loadState();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Rizz Aura server listening on http://0.0.0.0:${PORT}`);
  console.log(`Serving ${DIST}`);
});
