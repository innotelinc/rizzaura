import crypto from "node:crypto";

/* Authentik OIDC (authorization code flow) + stateless signed session cookies.
 *
 * The API is the single OIDC client for the whole platform: every frontend
 * (app, rankings, community, admin) redirects here for login and reads its
 * session from /api/me. Sessions are HttpOnly cookies, HMAC-signed with
 * SESSION_SECRET, so no server-side session store is needed.
 *
 * Without AUTHENTIK_CLIENT_ID/SECRET configured, every auth endpoint answers
 * `not_configured` and the platform still works fully anonymously — SSO is
 * additive, not a hard dependency.
 */

const DAY = 86400000;

export const authConfig = () => ({
  issuer: (process.env.AUTHENTIK_ISSUER || "https://auth.rizzaura.net").replace(/\/$/, ""),
  clientId: process.env.AUTHENTIK_CLIENT_ID || "",
  clientSecret: process.env.AUTHENTIK_CLIENT_SECRET || "",
  sessionSecret: process.env.SESSION_SECRET || "",
  adminGroup: process.env.AUTHENTIK_ADMIN_GROUP || "rizz-aura-admins",
  apiUrl: (process.env.API_URL || "http://localhost:8000").replace(/\/$/, ""),
  appOrigins: (process.env.APP_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});

let discoveryCache = null;
async function discovery() {
  const { issuer } = authConfig();
  if (discoveryCache && discoveryCache.exp > Date.now()) return discoveryCache.doc;
  const r = await fetch(issuer + "/.well-known/openid-configuration", {
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error("authentik discovery failed: HTTP " + r.status);
  const doc = await r.json();
  discoveryCache = { doc, exp: Date.now() + 3600000 };
  return doc;
}

/* ------------------------- signed cookie ------------------------- */
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}
function sign(payload) {
  return crypto
    .createHmac("sha256", authConfig().sessionSecret)
    .update(payload)
    .digest("base64url");
}
export function signSession(user) {
  const body = b64url(JSON.stringify(user));
  return `${body}.${sign(body)}`;
}
function verifySession(token) {
  if (!authConfig().sessionSecret) return null;
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expect = sign(body);
  const a = Buffer.from(expect);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
export const COOKIE = "rizz_session";
export function readSession(req) {
  const header = req.headers.cookie || "";
  const m = header
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + "="));
  if (!m) return null;
  return verifySession(m.slice(COOKIE.length + 1));
}
export function sessionCookie(user, secure) {
  return `${COOKIE}=${signSession(user)}; Path=/; HttpOnly; Max-Age=${7 * DAY}; SameSite=None${secure ? "; Secure" : ""}`;
}
export function clearCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=None${secure ? "; Secure" : ""}`;
}

/* ------------------------- oidc helpers ------------------------- */
export function isAdmin(user) {
  return !!(user && (user.groups || []).includes(authConfig().adminGroup));
}

export function userFromOidc(info) {
  const groups = Array.isArray(info.groups)
    ? info.groups
    : Array.isArray(info["goauthentik.io/groups"]) // some Authentik versions nest them
      ? info["goauthentik.io/groups"]
      : [];
  return {
    sub: String(info.sub || ""),
    name: String(info.name || info.preferred_username || info.email || "Player"),
    email: String(info.email || ""),
    groups,
    isAdmin: groups.includes(authConfig().adminGroup),
  };
}

export async function buildLoginUrl(next) {
  const cfg = authConfig();
  const doc = await discovery();
  const state = makeLoginState();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.apiUrl + "/api/auth/callback",
    response_type: "code",
    scope: "openid profile email goauthentik.io/providers/oauth2/scope-groups",
    state,
    prompt: "login",
  });
  if (next) params.set("next", next);
  return doc.authorization_endpoint + "?" + params.toString();
}

/* State = expiry + random + HMAC over (purpose, expiry, random). Callback
 * verifies the signature AND that the state is < 10 minutes old (replay-safe). */
function makeLoginState() {
  const exp = Date.now() + 10 * 60 * 1000;
  const rand = b64url(crypto.randomBytes(24));
  return `${exp}.${rand}.${sign("login:" + exp + ":" + rand)}`;
}
export function verifyLoginState(state) {
  const [expStr, rand, sig] = String(state || "").split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !rand || !sig) return false;
  if (exp < Date.now()) return false; // expired
  const expect = Buffer.from(sign("login:" + exp + ":" + rand));
  const got = Buffer.from(sig);
  return expect.length === got.length && crypto.timingSafeEqual(expect, got);
}

export async function exchangeCode(code) {
  const cfg = authConfig();
  const doc = await discovery();
  const r = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.apiUrl + "/api/auth/callback",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  const tok = await r.json();
  if (!r.ok)
    throw new Error("token exchange failed: " + (tok.error_description || tok.error || r.status));
  const ur = await fetch(doc.userinfo_endpoint, {
    headers: { Authorization: "Bearer " + (tok.access_token || "") },
    signal: AbortSignal.timeout(10000),
  });
  const info = await ur.json();
  if (!ur.ok) throw new Error("userinfo failed: " + r.status);
  return userFromOidc(info);
}

export async function buildLogoutUrl() {
  try {
    const doc = await discovery();
    return doc.end_session_endpoint || "";
  } catch {
    return "";
  }
}

/* ------------------------- cors ------------------------- */
export function corsHeaders(req) {
  const cfg = authConfig();
  const origin = req.headers.origin || "";
  const allowed = !origin || cfg.appOrigins.length === 0 || cfg.appOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin || "*" : "null",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

/* ------------------------- ip ------------------------- */
export function clientIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress
  );
}
