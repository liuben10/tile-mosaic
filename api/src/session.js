import { Router } from "express";
import config from "./config.js";
import { HttpError, verifyIdToken } from "./auth.js";

// "Remember me next time": the browser hands its Cognito refresh token to the API,
// which keeps it in an HttpOnly cookie that page scripts can't read. On the next
// visit the browser asks for a fresh ID token and the API redeems the cookie.
// Without "remember me" none of this is used and no cookie is ever set.

const COOKIE = "tm_session";
const MAX_AGE = 30 * 24 * 3600; // seconds; matches the Cognito refresh token lifetime (accounts.tf)
const { auth, region } = config;

function readCookie(req) {
  for (const part of (req.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setCookie(req, res, value, maxAge) {
  res.append("Set-Cookie", [
    `${COOKIE}=${encodeURIComponent(value)}`,
    "Path=/api/session",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(req.secure ? ["Secure"] : []), // the site is plain HTTP until it gets a domain and TLS
  ].join("; "));
}
const clearCookie = (req, res) => setCookie(req, res, "", 0);

// the same call the browser makes, from the server
async function cognito(action, body) {
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String(data.__type || "").split("#").pop();
    if (code === "NotAuthorizedException") return null; // expired, revoked or forged
    throw new Error(`Cognito ${action} failed: ${code || res.status}`);
  }
  return data;
}

// refresh token -> { email, idToken, expiresIn }, or null if Cognito no longer accepts it
async function redeem(refreshToken) {
  if (auth.mode === "dev") {
    const email = refreshToken.startsWith("dev:") ? refreshToken.slice(4) : "";
    return /^[^@\s]+@[^@\s]+$/.test(email) ? { email } : null;
  }
  const r = await cognito("InitiateAuth", {
    ClientId: auth.clientId, AuthFlow: "REFRESH_TOKEN_AUTH", AuthParameters: { REFRESH_TOKEN: refreshToken },
  });
  if (!r) return null;
  const who = await verifyIdToken(r.AuthenticationResult.IdToken);
  if (!who) return null;
  return { email: who.email, idToken: r.AuthenticationResult.IdToken, expiresIn: r.AuthenticationResult.ExpiresIn };
}

const router = Router();

// Remember this browser. Body: { refreshToken } (Cognito) or { email } (local dev mode).
router.post("/", async (req, res) => {
  const token = auth.mode === "dev" ? `dev:${String(req.body?.email || "").trim().toLowerCase()}` : req.body?.refreshToken;
  if (typeof token !== "string" || token.length < 5 || token.length > 3500) throw new HttpError(400, "Missing sign-in token.");
  const session = await redeem(token); // only remember a token Cognito accepts
  if (!session) throw new HttpError(401, "Your sign-in has expired. Sign in again.");
  setCookie(req, res, token, MAX_AGE);
  res.json(session);
});

// Sign back in from the cookie: a fresh ID token, or 401 if there's nothing (valid) to remember.
router.post("/refresh", async (req, res) => {
  const token = readCookie(req);
  const session = token && await redeem(token);
  if (!session) {
    if (token) clearCookie(req, res);
    throw new HttpError(401, "Not signed in.");
  }
  res.json(session);
});

// Sign out: forget this browser and revoke the refresh token everywhere.
router.delete("/", async (req, res) => {
  const token = readCookie(req);
  if (token && auth.mode === "cognito") {
    await cognito("RevokeToken", { ClientId: auth.clientId, Token: token }).catch((e) => console.warn(e.message));
  }
  clearCookie(req, res);
  res.status(204).end();
});

export default router;
