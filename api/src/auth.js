import { createRemoteJWKSet, jwtVerify } from "jose";
import config from "./config.js";
import { query } from "./db.js";

const { auth, region } = config;
const issuer = `https://cognito-idp.${region}.amazonaws.com/${auth.userPoolId}`;
const jwks = auth.mode === "cognito" ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) : null;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Who is calling: { sub, username, email } from a verified Cognito ID token.
async function identify(header) {
  if (!header) return null;
  const [scheme, value] = header.split(" ", 2);

  if (auth.mode === "dev") {
    // local testing only (refused in production by config.js): "Dev <username>"
    const username = devUsername(value);
    if (scheme !== "Dev" || !username) return null;
    return { sub: `dev:${username}`, username, email: null };
  }

  if (scheme !== "Bearer" || !value) return null;
  return verifyIdToken(value);
}

// dev mode trusts any reasonable username (letters, digits and . _ - + @)
export const devUsername = (v) => {
  const u = String(v || "").trim().toLowerCase();
  return /^[a-z0-9._+@-]{1,128}$/.test(u) ? u : null;
};

// { sub, username, email } from a Cognito ID token, or null if it isn't a valid one from our user pool
export async function verifyIdToken(token) {
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: auth.clientId });
    if (payload.token_use !== "id") return null;
    return { sub: payload.sub, username: payload["cognito:username"] ?? null, email: payload.email ?? null };
  } catch {
    return null;
  }
}

// sub -> user id, so a busy user doesn't cost a write on every request
const known = new Map();

async function userId({ sub, username, email }) {
  const hit = known.get(sub);
  if (hit && hit.email === email && hit.username === username && Date.now() - hit.at < 10 * 60_000) return hit.id;
  const { rows } = await query(
    `INSERT INTO users (sub, username, email) VALUES ($1, $2, $3)
     ON CONFLICT (sub) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email, last_seen_at = now()
     RETURNING id`, [sub, username, email]);
  if (known.size > 5000) known.clear();
  known.set(sub, { id: rows[0].id, username, email, at: Date.now() });
  return rows[0].id;
}

// Express middleware: 401 unless signed in; sets req.user = { id, username, email }.
export async function requireUser(req, _res, next) {
  const who = await identify(req.get("authorization"));
  if (!who) throw new HttpError(401, "Sign in to use your library.");
  req.user = { id: await userId(who), username: who.username, email: who.email };
  next();
}

// What the browser needs to talk to Cognito itself.
export const publicAuthConfig = () =>
  auth.mode === "dev"
    ? { mode: "dev" }
    : { mode: "cognito", region, userPoolId: auth.userPoolId, clientId: auth.clientId };
