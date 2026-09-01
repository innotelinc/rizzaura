import { PERSONALITIES, RANK_TITLES, FEED_TEMPLATES } from "./data";

/* ------------------------- randomness / formatting ------------------------- */
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const fmt = (n) => n.toLocaleString("en-US");

/* ------------------------- personalities ------------------------- */
export function getPerson(id) {
  return PERSONALITIES.find((p) => p.id === id);
}
export function getAura(state, id) {
  return state.pAura[id] ?? getPerson(id).aura;
}

/* ------------------------- feed ------------------------- */
export function makeEvent() {
  const t = pick(FEED_TEMPLATES);
  const ids = [...PERSONALITIES].map((p) => p.id);
  let a = pick(ids),
    b = pick(ids);
  while (b === a) b = pick(ids);
  return t
    .replaceAll("{a}", getPerson(a).name)
    .replaceAll("{b}", getPerson(b).name)
    .replaceAll("{n}", fmt(rnd(50, 900)));
}
export function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

/* ------------------------- ranks ------------------------- */
export function rankOf(aura) {
  for (const r of RANK_TITLES) if (aura >= r.min) return r;
  return RANK_TITLES[RANK_TITLES.length - 1];
}
export function percentile(state, aura) {
  const above = PERSONALITIES.filter((p) => getAura(state, p.id) > aura).length;
  return { pct: Math.round((above / PERSONALITIES.length) * 100), isTop: above === 0 };
}
export function votesLeftToday(state) {
  const today = new Date().toISOString().slice(0, 10);
  return state.votes.date === today ? Math.max(0, 10 - state.votes.used) : 10;
}
