import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as cognito from "./cognito.js";

// Signed-in state and an authenticated fetch for the rest of the app.
// When there is no API (the site served as plain static files), accounts are simply off.
//
// Where the sign-in is kept depends on "Remember me next time":
//  - remembered: the refresh token lives only in an HttpOnly cookie set by the API
//    (api/src/session.js); the page holds just the short-lived ID token, in memory.
//  - not remembered: no cookie. The tokens stay in this tab's sessionStorage, so a
//    reload keeps you signed in but closing the tab signs you out.

const TAB_KEY = "tile-mosaic.session";
// Not a credential: just "this browser chose Remember me", so the front page knows to
// wait for the cookie check instead of showing the log-in box and then jumping away.
const HINT_KEY = "tile-mosaic.remembered";
const hinted = () => { try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return false; } };
const Ctx = createContext(null);
export const useAccount = () => useContext(Ctx);

function loadTabSession() {
  try { return JSON.parse(sessionStorage.getItem(TAB_KEY)) || null; } catch { return null; }
}
function storeSession(s) {
  try {
    if (s && !s.remembered) sessionStorage.setItem(TAB_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(TAB_KEY);
    if (s?.remembered) localStorage.setItem(HINT_KEY, "1");
    else localStorage.removeItem(HINT_KEY);
    localStorage.removeItem(TAB_KEY); // earlier versions kept the whole session here
  } catch { /* storage blocked */ }
}

// the API's session endpoints (they use the cookie, so no Authorization header)
async function sessionCall(path, method, body) {
  const res = await fetch(`api/session${path}`, {
    method, credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}
const remembered = (r) => ({
  username: r.username, email: r.email ?? null, remembered: true,
  idToken: r.idToken ?? null, expiresAt: r.expiresIn ? Date.now() + (r.expiresIn - 60) * 1000 : Infinity,
});

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function AccountProvider({ children }) {
  const [auth, setAuth] = useState(null);          // { mode: "cognito" | "dev" | "off", ... }
  const [session, setSession] = useState(loadTabSession);
  const [restoring, setRestoring] = useState(true); // checking for a remembered sign-in
  const [expectRemembered] = useState(hinted);
  const sessionRef = useRef(session);
  const refreshing = useRef(null);

  const update = useCallback((s) => { sessionRef.current = s; storeSession(s); setSession(s); }, []);

  useEffect(() => {
    fetch("api/config", { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(async (c) => {
        setAuth(c.auth);
        // signed in in this tab already, else try the "remember me" cookie
        if (!sessionRef.current && c.auth.mode !== "off") {
          await sessionCall("/refresh", "POST").then((r) => update(remembered(r)), (e) => {
            if (e.status === 401) update(null); // nothing remembered any more: drop the hint
          });
        }
      })
      .catch(() => setAuth({ mode: "off" }))
      .finally(() => setRestoring(false));
  }, [update]);

  // a valid ID token, refreshed if it's about to expire; null when signed out
  const token = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return null;
    if (auth?.mode === "dev") return `Dev ${s.username}`;
    if (Date.now() < s.expiresAt) return `Bearer ${s.idToken}`;
    refreshing.current ??= (s.remembered ? sessionCall("/refresh", "POST").then(remembered) : cognito.refresh(auth, s))
      .then((n) => { update(n); return n; })
      .catch((e) => { if (e.code === "NotAuthorizedException" || e.status === 401) update(null); throw e; })
      .finally(() => { refreshing.current = null; });
    return `Bearer ${(await refreshing.current).idToken}`;
  }, [auth, update]);

  const api = useCallback(async (path, { method = "GET", body } = {}) => {
    const authz = await token();
    const res = await fetch(`api/${path}`, {
      method,
      headers: { ...(authz ? { Authorization: authz } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) update(null);
    if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
    return data;
  }, [token, update]);

  const value = useMemo(() => ({
    ready: auth !== null && !restoring,
    // still checking a "Remember me" cookie this browser is known to have
    restoringRemembered: expectRemembered && (auth === null || restoring),
    enabled: !!auth && auth.mode !== "off",
    mode: auth?.mode,
    user: session ? { username: session.username ?? session.email, email: session.email ?? null } : null,
    api,
    // remember: keep this browser signed in with the API's cookie (up to 30 days)
    // username may also be the account's verified email
    signIn: async (username, password, remember = false) => {
      username = username.trim();
      if (auth.mode === "dev") {
        username = username.toLowerCase();
        if (remember) await sessionCall("", "POST", { username });
        return update({ username, email: null, remembered: remember });
      }
      const tokens = await cognito.signIn(auth, username, password);
      if (!remember) return update(tokens);
      // hand the refresh token to the API's cookie and keep only the ID token here
      update(remembered(await sessionCall("", "POST", { refreshToken: tokens.refreshToken })));
    },
    // returns { confirmed: true } when no emailed code is needed (local dev mode)
    signUp: async (username, email, password) => {
      if (auth.mode === "dev") return { confirmed: true };
      await cognito.signUp(auth, username.trim(), email.trim().toLowerCase(), password);
      return { confirmed: false };
    },
    confirmSignUp: (username, code) => cognito.confirmSignUp(auth, username.trim(), code.trim()),
    resendCode: (username) => cognito.resendCode(auth, username.trim()),
    forgotPassword: (username) => cognito.forgotPassword(auth, username.trim()),
    confirmForgotPassword: (username, code, pw) => cognito.confirmForgotPassword(auth, username.trim(), code.trim(), pw),
    signOut: () => {
      const s = sessionRef.current;
      if (s?.remembered) sessionCall("", "DELETE").catch(() => {}); // clears the cookie and revokes the token
      else if (s && auth?.mode === "cognito") cognito.revoke(auth, s);
      update(null);
    },
  }), [auth, restoring, expectRemembered, session, api, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
