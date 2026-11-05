import { useEffect, useRef, useState } from "react";
import { useAccount } from "../account/AccountContext.jsx";
import { WorkflowStrip } from "./Showcase.jsx";

// Sign in, create an account, confirm the emailed code, or reset a password.
export default function AuthDialog({ open, onClose }) {
  const acct = useAccount();
  const ref = useRef(null);
  const [view, setView] = useState("signIn"); // signIn | signUp | confirm | forgot | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const dev = acct.mode === "dev";

  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) { setMsg(null); setView("signIn"); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);

  const go = (v, m = null) => { setView(v); setMsg(m); setCode(""); };

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (view === "signIn") {
        try { await acct.signIn(email, password, remember); }
        catch (err) {
          if (err.code === "UserNotConfirmedException") { await acct.resendCode(email).catch(() => {}); return go("confirm", { text: err.message }); }
          throw err;
        }
        setPassword(""); onClose();
      } else if (view === "signUp") {
        await acct.signUp(email, password);
        go("confirm", { text: `We sent a code to ${email}.` });
      } else if (view === "confirm") {
        await acct.confirmSignUp(email, code);
        if (password) { await acct.signIn(email, password, remember); setPassword(""); onClose(); }
        else go("signIn", { text: "Email confirmed. Sign in to continue." });
      } else if (view === "forgot") {
        await acct.forgotPassword(email);
        go("reset", { text: `If there's an account for ${email}, we sent it a code.` });
      } else if (view === "reset") {
        await acct.confirmForgotPassword(email, code, password);
        await acct.signIn(email, password, remember); setPassword(""); onClose();
      }
    } catch (err) {
      setMsg({ text: err.message, err: true });
    } finally {
      setBusy(false);
    }
  }

  const title = { signIn: "Sign in", signUp: "Create an account", confirm: "Confirm your email", forgot: "Reset your password", reset: "Choose a new password" }[view];
  const action = { signIn: "Sign in", signUp: "Create account", confirm: "Confirm", forgot: "Send code", reset: "Set password" }[view];
  const needsPassword = view === "signIn" ? !dev : view === "signUp" || view === "reset";

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit} className="auth">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="lede">Save tile sets and mosaics to your library and open them on any device.</p>
        {dev && <p className="note">Local development mode: any email signs you in, no password.</p>}

        <label className="input">
          <span>Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            readOnly={view === "confirm" || view === "reset"} autoFocus />
        </label>
        {(view === "confirm" || view === "reset") && (
          <label className="input">
            <span>Code from the email</span>
            <input inputMode="numeric" required autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
        )}
        {needsPassword && (
          <label className="input">
            <span>{view === "reset" ? "New password" : "Password"}</span>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={view === "signIn" ? "current-password" : "new-password"} />
            {view !== "signIn" && <small>At least 8 characters, with upper and lower case letters and a number.</small>}
          </label>
        )}

        {(view === "signIn" || view === "confirm" || view === "reset") && (
          <label className="check remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Remember me next time</span>
          </label>
        )}
        {remember && view !== "signUp" && view !== "forgot" && <p className="note">Keeps you signed in on this browser for up to 30 days with a cookie. Leave it off on shared computers.</p>}

        {msg && <p className={msg.err ? "msg err" : "msg"} role="status">{msg.text}</p>}
        <button className="btn primary wide" type="submit" disabled={busy}>{busy ? "Working…" : action}</button>

        {!dev && (
          <div className="auth-links">
            {view === "signIn" && <>
              <button type="button" className="link" onClick={() => go("signUp")}>Create an account</button>
              <button type="button" className="link" onClick={() => go("forgot")}>Forgot password?</button>
            </>}
            {view === "signUp" && <button type="button" className="link" onClick={() => go("signIn")}>I already have an account</button>}
            {view === "confirm" && <button type="button" className="link" disabled={busy}
              onClick={() => acct.resendCode(email).then(() => setMsg({ text: "Sent a new code." }), (e) => setMsg({ text: e.message, err: true }))}>
              Send a new code</button>}
            {(view === "forgot" || view === "reset") && <button type="button" className="link" onClick={() => go("signIn")}>Back to sign in</button>}
          </div>
        )}
      </form>
      <aside className="auth-showcase">
        <WorkflowStrip />
      </aside>
    </dialog>
  );
}
