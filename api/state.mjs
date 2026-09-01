import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CENSUS, FEED_TEMPLATES, PERSONALITIES, ACHIEVEMENTS } from "./data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, "..", "data");
export const STATE_FILE = path.join(DATA_DIR, "state.json");

/* ------------------------- state shape ------------------------- */
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
  // platform accounts (keyed by Authentik sub)
  users: {},
  achievements: [], // grants: { player, badge, ts }
  season: null, // { id, name, startedAt, endsAt }
  hallOfFame: [], // [{ season: { id, name }, endedAt, personalities: [...], players: [...] }]
  teams: {}, // { id: { id, name, tag, emoji, captain, members: [sub], createdTs } }
  competitions: {}, // { id: { id, name, type, startsAt, endsAt, status, teams: [teamId], scores: {} } }
};

export function getState() {
  return state;
}

/* ------------------------- helpers ------------------------- */
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const todayKey = () => new Date().toISOString().slice(0, 10);
export const getPerson = (id) => PERSONALITIES.find((p) => p.id === id);
export const getAura = (id) => state.pAura[id] ?? getPerson(id)?.aura ?? 100;
export const pushFeed = (evt) => {
  state.feed.unshift(evt);
  if (state.feed.length > 30) state.feed.pop();
};
export const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

/* ------------------------- user records ------------------------- */
export function getUser(sub) {
  if (!sub) return null;
  if (!state.users[sub]) {
    state.users[sub] = {
      sub,
      name: "",
      email: "",
      avatar: "😎",
      joinedTs: Date.now(),
      aura: 100,
      votesCast: 0,
      battlesWon: 0,
      censusVotes: 0,
      goldenGifts: 0,
      competitions: 0,
      wins: 0,
      prestige: 0,
      hitNo1: false,
      no1Days: 0,
      no1Since: null,
      teamId: null,
      badges: [],
    };
  }
  return state.users[sub];
}

export function userView(sub) {
  const u = getUser(sub);
  if (!u) return null;
  return {
    sub: u.sub,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    joinedTs: u.joinedTs,
    aura: u.aura,
    votesCast: u.votesCast,
    battlesWon: u.battlesWon,
    censusVotes: u.censusVotes,
    goldenGifts: u.goldenGifts,
    competitions: u.competitions,
    wins: u.wins,
    prestige: u.prestige,
    hitNo1: u.hitNo1,
    no1Days: u.no1Days,
    teamId: u.teamId,
    badges: (u.badges || []).map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean),
  };
}

export function touchNo1() {
  // Track how long the current top player has held #1 (for diamond-hands).
  const top = topPlayers(1)[0];
  if (!top) return;
  const u = getUser(top.sub);
  if (!u) return;
  if (!u.hitNo1) {
    u.hitNo1 = true;
    u.no1Since = Date.now();
  }
  u.no1Days = Math.round((Date.now() - u.no1Since) / 86400000);
}

export function topPlayers(n) {
  return Object.values(state.users)
    .filter((u) => u.name)
    .sort((a, b) => b.aura - a.aura)
    .slice(0, n);
}

/* ------------------------- seeding ------------------------- */
function seedCensus() {
  CENSUS.forEach((q) => {
    if (!state.censusCounts[q.id]) state.censusCounts[q.id] = q.options.map(() => rnd(4, 25));
  });
}
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
export function newBattle() {
  const [a, b] = twoRandomIds();
  state.battle = {
    a,
    b,
    cat: pick(["Rizz", "Aura", "Drip", "Influence", "Main Character Energy", "Fanbase"]),
    voted: false,
    winner: null,
    loser: null,
  };
}
export function seedSeason() {
  if (state.season && state.season.id) return;
  state.season = {
    id: "S1",
    name: "Season One",
    startedAt: Date.now(),
    endsAt: Date.now() + 28 * 86400000,
  };
}
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

/* ------------------------- persistence ------------------------- */
export function loadState() {
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
  if (!state.users || typeof state.users !== "object") state.users = {};
  if (!Array.isArray(state.achievements)) state.achievements = [];
  if (!state.hallOfFame || !Array.isArray(state.hallOfFame)) state.hallOfFame = [];
  if (!state.teams || typeof state.teams !== "object") state.teams = {};
  if (!state.competitions || typeof state.competitions !== "object") state.competitions = {};
  seedSeason();
  saveState();
}

export function saveState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STATE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error("Failed to save state:", e.message);
  }
}

/* ------------------------- public view ------------------------- */
export function publicState() {
  const activeComps = Object.values(state.competitions).filter((c) => c.status === "live");
  return {
    roster: PERSONALITIES.map((p) => ({
      id: p.id,
      name: p.name,
      handle: p.handle,
      cat: p.cat,
      emoji: p.emoji,
      aura: p.aura,
    })),
    pAura: state.pAura,
    censusCounts: state.censusCounts,
    feed: state.feed,
    battle: state.battle,
    players: state.players,
    bids: state.bids,
    season: state.season,
    hallOfFame: state.hallOfFame,
    teams: Object.values(state.teams).map((t) => ({
      id: t.id,
      name: t.name,
      tag: t.tag,
      emoji: t.emoji,
      captain: t.captain,
      members: t.members.length,
      aura: t.members.reduce((sum, sub) => sum + (getUser(sub)?.aura || 0), 0),
    })),
    competitions: activeComps.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      teams: (c.teams || [])
        .map((tid) => {
          const t = state.teams[tid];
          return t
            ? {
                id: t.id,
                name: t.name,
                tag: t.tag,
                emoji: t.emoji,
                score: c.scores?.[tid] || 0,
                members: t.members.length,
              }
            : null;
        })
        .filter(Boolean),
    })),
  };
}
