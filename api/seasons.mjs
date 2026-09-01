import { getState, getUser, getPerson, topPlayers, pushFeed, saveState } from "./state.mjs";
import { HALL_OF_FAME_SIZE, HALL_OF_FAME_PLAYERS, SEASON_LENGTH_MS } from "./data.mjs";
import { broadcast } from "./sse.mjs";
import { evaluateAchievements } from "./achievements.mjs";

/* Roll the current season over: snapshot the top personalities + top players
 * into the Hall of Fame, award prestige to the top-10 players, then start the
 * next season. Safe to call repeatedly (no-ops when no season is due). */
export function rolloverSeason(force = false) {
  const state = getState();
  if (!state.season) return null;
  const due = force || Date.now() >= state.season.endsAt;
  if (!due) return state.season;

  const personalities = Object.entries(state.pAura)
    .map(([id, aura]) => ({ id, aura }))
    .concat(state.bids.map((b) => ({ id: b.id, aura: b.cents, bid: true })))
    .sort((a, b) => b.aura - a.aura)
    .slice(0, HALL_OF_FAME_SIZE)
    .map((e) => ({
      name: e.bid ? e.name : getPerson(e.id)?.name || e.id,
      emoji: e.bid ? e.emoji : undefined,
      aura: e.aura,
      paid: !!e.bid,
    }));

  const players = topPlayers(HALL_OF_FAME_PLAYERS);
  const snapshot = {
    season: { id: state.season.id, name: state.season.name },
    endedAt: Date.now(),
    personalities,
    players: players.map((u) => ({
      sub: u.sub,
      name: u.name,
      avatar: u.avatar,
      aura: u.aura,
      prestige: u.prestige,
    })),
  };
  state.hallOfFame.unshift(snapshot);
  if (state.hallOfFame.length > 12) state.hallOfFame.pop();

  // Prestige + Hall of Famer badge for the season's top-10 players.
  for (const p of players) {
    const u = getUser(p.sub);
    if (!u || !u.name) continue;
    u.prestige = (u.prestige || 0) + 1;
    pushFeed({
      icon: "⭐",
      text: `<b>${u.name}</b> finished <b>${state.season.name}</b> in the top 10 — Hall of Fame bound 🏛️`,
      ts: Date.now(),
    });
    evaluateAchievements(u.sub);
  }

  state.season = {
    id: nextSeasonId(state.season.id),
    name: nextSeasonName(state.season.id),
    startedAt: Date.now(),
    endsAt: Date.now() + SEASON_LENGTH_MS,
  };
  saveState();
  broadcast({ type: "season", payload: snapshot });
  return state.season;
}

function nextSeasonId(id) {
  const m = /^S(\d+)$/.exec(id || "");
  return m ? "S" + (parseInt(m[1], 10) + 1) : "S2";
}
function nextSeasonName(id) {
  const n = parseInt(/^S(\d+)$/.exec(id || "")?.[1] || "1", 10) + 1;
  const ordinals = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
  ];
  return `Season ${ordinals[n] || n}`;
}
