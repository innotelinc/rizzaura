// Shared API client. In dev each Vite app proxies /api to the API server, so
// the default base is "/api". Production builds bake in VITE_API_BASE
// (e.g. https://api.rizzaura.net) via the Dockerfile.
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

export function apiUrl(path) {
  return API_BASE + path;
}
