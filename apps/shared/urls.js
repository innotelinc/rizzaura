// Platform subdomain links. The base domain is baked at build time via
// VITE_BASE_DOMAIN (compose passes ${BASE_DOMAIN}) and defaults to
// rizz.innotel.us — switch to rizzaura.net by changing BASE_DOMAIN in .env
// and rebuilding. Dev servers fall back to the default since they proxy /api.
export const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || "rizz.innotel.us";

export const subdomain = (name) => `https://${name}.${BASE_DOMAIN}`;

export const SITE = {
  app: subdomain("app"),
  rankings: subdomain("rankings"),
  community: subdomain("community"),
  admin: subdomain("admin"),
  api: subdomain("api"),
  auth: subdomain("auth"),
};
