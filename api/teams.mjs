import crypto from "node:crypto";
import { getState, getUser, pushFeed, saveState } from "./state.mjs";
import { broadcast } from "./sse.mjs";
import { evaluateAchievements } from "./achievements.mjs";

/* ------------------------- teams ------------------------- */
export function listTeams() {
  return getState().teams;
}
export function createTeam(user, { name, tag, emoji }) {
  const state = getState();
  const n = String(name || "")
    .trim()
    .slice(0, 24);
  if (!n) return { error: "name required" };
  if (user.teamId) return { error: "leave your current team first" };
  const id = "t_" + crypto.randomBytes(4).toString("hex");
  const team = {
    id,
    name: n,
    tag:
      String(tag || "")
        .trim()
        .slice(0, 4)
        .toUpperCase() || "TEAM",
    emoji: String(emoji || "🤝").slice(0, 2),
    captain: user.sub,
    members: [user.sub],
    createdTs: Date.now(),
  };
  state.teams[id] = team;
  user.teamId = id;
  user.teamsFounded = (user.teamsFounded || 0) + 1;
  user.teamSize = team.members.length;
  pushFeed({
    icon: "🤝",
    text: `<b>${user.name}</b> founded <b>${team.name}</b> ${team.emoji} — new team on the scene.`,
    ts: Date.now(),
  });
  saveState();
  evaluateAchievements(user.sub);
  broadcast({ type: "team", payload: { id, name: team.name } });
  return { ok: true, team: teamView(team) };
}
export function joinTeam(user, teamId) {
  const state = getState();
  const t = state.teams[teamId];
  if (!t) return { error: "no such team" };
  if (user.teamId) return { error: "leave your current team first" };
  if (t.members.includes(user.sub)) return { error: "already a member" };
  t.members.push(user.sub);
  user.teamId = teamId;
  user.teamSize = t.members.length;
  pushFeed({
    icon: "🤝",
    text: `<b>${user.name}</b> joined <b>${t.name}</b> ${t.emoji}`,
    ts: Date.now(),
  });
  saveState();
  evaluateAchievements(user.sub);
  broadcast({ type: "team", payload: { id: teamId, name: t.name } });
  return { ok: true, team: teamView(t) };
}
export function leaveTeam(user, teamId) {
  const state = getState();
  const t = state.teams[teamId];
  if (!t) return { error: "no such team" };
  if (!t.members.includes(user.sub)) return { error: "not a member" };
  t.members = t.members.filter((s) => s !== user.sub);
  user.teamId = null;
  user.teamSize = 0;
  if (!t.members.length) delete state.teams[teamId];
  saveState();
  broadcast({ type: "team", payload: { id: teamId } });
  return { ok: true };
}
export function teamView(t) {
  return {
    id: t.id,
    name: t.name,
    tag: t.tag,
    emoji: t.emoji,
    captain: t.captain,
    members: t.members.length,
    aura: t.members.reduce((sum, s) => sum + (getUser(s)?.aura || 0), 0),
  };
}

/* ------------------------- competitions ------------------------- */
export function createCompetition(user, { name, type, days }) {
  const state = getState();
  const n = String(name || "")
    .trim()
    .slice(0, 40);
  if (!n) return { error: "name required" };
  if (!["aura", "votes"].includes(type)) return { error: "type must be aura or votes" };
  const dur = Math.max(1, Math.min(30, Number(days) || 3)) * 86400000;
  const id = "c_" + crypto.randomBytes(4).toString("hex");
  const comp = {
    id,
    name: n,
    type,
    startsAt: Date.now(),
    endsAt: Date.now() + dur,
    status: "live",
    teams: [],
    scores: {},
    createdBy: user.sub,
  };
  state.competitions[id] = comp;
  pushFeed({
    icon: "🏟️",
    text: `A new competition just dropped: <b>${n}</b> (${type === "aura" ? "Aura Sprint" : "Vote Storm"}) — enter with your team!`,
    ts: Date.now(),
  });
  saveState();
  broadcast({ type: "competition", payload: { id, name: n } });
  return { ok: true, competition: comp };
}
export function enterCompetition(user, compId) {
  const state = getState();
  const c = state.competitions[compId];
  if (!c) return { error: "no such competition" };
  if (c.status !== "live") return { error: "competition is over" };
  if (Date.now() > c.endsAt) {
    c.status = "ended";
    saveState();
    return { error: "competition is over" };
  }
  if (!user.teamId) return { error: "join a team first" };
  if (!c.teams.includes(user.teamId)) {
    c.teams.push(user.teamId);
    c.scores[user.teamId] = c.scores[user.teamId] || 0;
  }
  user.competitions = (user.competitions || 0) + 1;
  saveState();
  evaluateAchievements(user.sub);
  broadcast({ type: "competition", payload: { id: compId } });
  return { ok: true };
}
export function endCompetition(compId) {
  const state = getState();
  const c = state.competitions[compId];
  if (!c) return { error: "no such competition" };
  if (c.status === "ended") return { ok: true, competition: c };
  c.status = "ended";
  // winner = highest team score
  const entries = Object.entries(c.scores || {}).sort((a, b) => b[1] - a[1]);
  const winnerId = entries[0]?.[0];
  if (winnerId) {
    const t = state.teams[winnerId];
    pushFeed({
      icon: "🏆",
      text: `<b>${t?.name || winnerId}</b> ${t?.emoji || ""} won <b>${c.name}</b> — champions of the platform!`,
      ts: Date.now(),
    });
    for (const sub of t?.members || []) {
      const u = getUser(sub);
      if (u) {
        u.wins = (u.wins || 0) + 1;
        evaluateAchievements(sub);
      }
    }
  }
  saveState();
  broadcast({ type: "competition", payload: { id: compId, ended: true } });
  return { ok: true, competition: c };
}

/* Called on vote/battle by authenticated users to accrue competition scores. */
export function accrueCompetition(user, type, amount) {
  const state = getState();
  if (!user.teamId) return;
  const now = Date.now();
  for (const c of Object.values(state.competitions)) {
    if (c.status !== "live" || c.type !== type) continue;
    if (now < c.startsAt || now > c.endsAt) continue;
    if (!c.teams.includes(user.teamId)) continue;
    c.scores[user.teamId] = (c.scores[user.teamId] || 0) + amount;
  }
}
