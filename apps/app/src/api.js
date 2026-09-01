export const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export async function api(path, opts = {}) {
  const r = await fetch(API_BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "server error");
  return j;
}
