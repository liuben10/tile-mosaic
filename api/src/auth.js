import { createRemoteJWKSet, jwtVerify } from "jose";
import config from "./config.js";
import { query } from "./db.js";

const { auth, region } = config;
const issuer = `https://cognito-idp.${region}.amazonaws.com/${auth.userPoolId}`;
const jwks = auth.mode === "cognito" ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) : null;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Who is calling: { sub, email } from a verified Cognito ID token.
async function identify(header) {
  if (!header) return null;
  const [scheme, value] = header.split(" ", 2);

  if (auth.mode === "dev") {
    // local testing only (refused in production by config.js): "Dev someone@example.com"
    if (scheme !== "Dev" || !/^[^@\s]+@[^@\s]+$/.test(value || "")) return null;
    return { sub: `dev:${value.toLowerCase()}`, email: value.toLowerCase() };
  }

  if (scheme !== "Bearer" || !value) return null;
  return verifyIdToken(value);
}

// { sub, email } from a Cognito ID token, or null if it isn't a valid one from our user pool
export async function verifyIdToken(token) {
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: auth.clientId });
    if (payload.token_use !== "id") return null;
    return { sub: payload.sub, email: payload.email ?? null };
  } catch {
    return null;
  }
}

// sub -> user id, so a busy user doesn't cost a write on every request
const known = new Map();

async function userId({ sub, email }) {
  const hit = known.get(sub);
  if (hit && hit.email === email && Date.now() - hit.at < 10 * 60_000) return hit.id;
  const { rows } = await query(
    `INSERT INTO users (sub, email) VALUES ($1, $2)
     ON CONFLICT (sub) DO UPDATE SET email = EXCLUDED.email, last_seen_at = now()
     RETURNING id`, [sub, email]);
  if (known.size > 5000) known.clear();
  known.set(sub, { id: rows[0].id, email, at: Date.now() });
  return rows[0].id;
}

// Express middleware: 401 unless signed in; sets req.user = { id, email }.
export async function requireUser(req, _res, next) {
  const who = await identify(req.get("authorization"));
  if (!who) throw new HttpError(401, "Sign in to use your library.");
  req.user = { id: await userId(who), email: who.email };
  next();
}

// What the browser needs to talk to Cognito itself.
export const publicAuthConfig = () =>
  auth.mode === "dev"
    ? { mode: "dev" }
    : { mode: "cognito", region, userPoolId: auth.userPoolId, clientId: auth.clientId };
