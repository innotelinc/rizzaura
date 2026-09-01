export const API_BASE = "/api";

export async function api(path, opts = {}) {
  const r = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "server error");
  return j;
}
