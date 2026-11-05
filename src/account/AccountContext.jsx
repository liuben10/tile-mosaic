import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as cognito from "./cognito.js";

// Signed-in state and an authenticated fetch for the rest of the app.
// When there is no API (the site served as plain static files), accounts are simply off.

const KEY = "tile-mosaic.session";
const Ctx = createContext(null);
export const useAccount = () => useContext(Ctx);

function loadSession() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function storeSession(s) {
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function AccountProvider({ children }) {
  const [auth, setAuth] = useState(null);          // { mode: "cognito" | "dev" | "off", ... }
  const [session, setSession] = useState(loadSession);
  const sessionRef = useRef(session);
  const refreshing = useRef(null);

  const update = useCallback((s) => { sessionRef.current = s; storeSession(s); setSession(s); }, []);

  useEffect(() => {
    fetch("api/config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((c) => setAuth(c.auth))
      .catch(() => setAuth({ mode: "off" }));
  }, []);

  // a valid ID token, refreshed if it's about to expire; null when signed out
  const token = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return null;
    if (auth?.mode === "dev") return `Dev ${s.email}`;
    if (Date.now() < s.expiresAt) return `Bearer ${s.idToken}`;
    refreshing.current ??= cognito.refresh(auth, s)
      .then((n) => { update(n); return n; })
      .catch((e) => { if (e.code === "NotAuthorizedException") update(null); throw e; })
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
    ready: auth !== null,
    enabled: !!auth && auth.mode !== "off",
    mode: auth?.mode,
    user: session ? { email: session.email } : null,
    api,
    signIn: async (email, password) => {
      email = email.trim().toLowerCase();
      update(auth.mode === "dev" ? { email } : await cognito.signIn(auth, email, password));
    },
    signUp: (email, password) => cognito.signUp(auth, email.trim().toLowerCase(), password),
    confirmSignUp: (email, code) => cognito.confirmSignUp(auth, email.trim().toLowerCase(), code.trim()),
    resendCode: (email) => cognito.resendCode(auth, email.trim().toLowerCase()),
    forgotPassword: (email) => cognito.forgotPassword(auth, email.trim().toLowerCase()),
    confirmForgotPassword: (email, code, pw) => cognito.confirmForgotPassword(auth, email.trim().toLowerCase(), code.trim(), pw),
    signOut: () => {
      const s = sessionRef.current;
      if (s && auth?.mode === "cognito") cognito.revoke(auth, s);
      update(null);
    },
  }), [auth, session, api, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
