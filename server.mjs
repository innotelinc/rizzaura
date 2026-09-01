import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONALITIES, CENSUS, BATTLE_CATS, FEED_TEMPLATES } from "./src/data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PORT = process.env.PORT || 4173;
const VOTE_LIMIT = 10; // votes per IP per day

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

function publicState() {
  return {
    pAura: state.pAura,
    censusCounts: state.censusCounts,
    feed: state.feed,
    battle: state.battle,
    players: state.players,
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
