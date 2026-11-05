import { useState } from "react";
import { useAccount } from "../account/AccountContext.jsx";

const TITLES = { signIn: "Log in", signUp: "Create an account", confirm: "Confirm your email", forgot: "Reset your password", reset: "Choose a new password" };
const PASSWORD_RULE = "At least 8 characters, with upper and lower case letters and a number.";

// Log in, create an account, confirm the emailed code, or reset a password.
// Used on the front page and in the sign-in dialog; onDone runs once signed in.
export default function AuthForm({ onDone, heading = true }) {
  const acct = useAccount();
  const [view, setView] = useState("signIn"); // signIn | signUp | confirm | forgot | reset
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const dev = acct.mode === "dev";
  const off = acct.ready && !acct.enabled;

  // creating an account or choosing a new password needs the password typed twice
  const needsConfirm = view === "signUp" || view === "reset";
  const mismatch = needsConfirm && confirm.length > 0 && confirm !== password;
  const blocked = busy || !acct.ready || off || (needsConfirm && confirm !== password);

  const go = (v, m = null) => { setView(v); setMsg(m); setCode(""); setConfirm(""); };

  async function finish() {
    await acct.signIn(username, password, remember);
    setPassword(""); setConfirm("");
    onDone?.();
  }

  async function submit(e) {
    e.preventDefault();
    if (needsConfirm && confirm !== password) return setMsg({ text: "The passwords don't match.", err: true });
    setBusy(true); setMsg(null);
    try {
      if (view === "signIn") {
        try { await finish(); }
        catch (err) {
          if (err.code === "UserNotConfirmedException") { await acct.resendCode(username).catch(() => {}); return go("confirm", { text: err.message }); }
          throw err;
        }
      } else if (view === "signUp") {
        const { confirmed } = await acct.signUp(username, email, password);
        if (confirmed) await finish();
        else go("confirm", { text: `We sent a code to ${email}. Enter it to finish creating your account.` });
      } else if (view === "confirm") {
        await acct.confirmSignUp(username, code);
        if (password) await finish();
        else go("signIn", { text: "Email confirmed. Log in to continue." });
      } else if (view === "forgot") {
        await acct.forgotPassword(username);
        go("reset", { text: "If that account exists, we emailed it a code." });
      } else if (view === "reset") {
        await acct.confirmForgotPassword(username, code, password);
        await finish();
      }
    } catch (err) {
      setMsg({ text: err.message, err: true });
    } finally {
      setBusy(false);
    }
  }

  const fixedUser = view === "confirm" || view === "reset";
  const showPassword = view === "signIn" || view === "signUp" || view === "reset";
  const showRemember = view !== "forgot";

  return (
    <form onSubmit={submit} className="auth">
      {heading && <h2 className="auth-title">{TITLES[view]}</h2>}
      {dev && <p className="note">Local development mode: any username works, and the password isn't checked.</p>}
      {off && <p className="msg">Accounts are unavailable right now. You can still use the studio without one.</p>}

      <label className="input">
        <span>{view === "signIn" || view === "forgot" ? "Username or email" : "Username"}</span>
        <input required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={128}
          value={username} onChange={(e) => setUsername(e.target.value)} readOnly={fixedUser} />
      </label>

      {view === "signUp" && (
        <label className="input">
          <span>Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <small>For your confirmation code and password resets.</small>
        </label>
      )}

      {fixedUser && (
        <label className="input">
          <span>Code from the email</span>
          <input inputMode="numeric" required autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
      )}

      {showPassword && (
        <label className="input">
          <span>{view === "reset" ? "New password" : "Password"}</span>
          <input type="password" required={!dev} minLength={dev ? undefined : 8} value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={view === "signIn" ? "current-password" : "new-password"} />
          {needsConfirm && !dev && <small>{PASSWORD_RULE}</small>}
        </label>
      )}

      {needsConfirm && (
        <label className="input">
          <span>Confirm password</span>
          <input type="password" required={!dev} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
            aria-invalid={mismatch} aria-describedby={mismatch ? "pw-mismatch" : undefined} />
          {mismatch && <small id="pw-mismatch" className="bad">The passwords don't match.</small>}
        </label>
      )}

      {showRemember && (
        <label className="check remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember me next time</span>
        </label>
      )}
      {remember && showRemember && <p className="note">Keeps you logged in on this browser for up to 30 days with a cookie. Leave it off on shared computers.</p>}

      {msg && <p className={msg.err ? "msg err" : "msg"} role="status">{msg.text}</p>}

      {view === "signIn" && (
        <div className="auth-buttons">
          <button className="btn primary" type="submit" disabled={blocked}>{busy ? "Logging in…" : "Log in"}</button>
          <button className="btn" type="button" disabled={busy} onClick={() => go("signUp")}>Create account</button>
        </div>
      )}
      {view === "signUp" && (
        <div className="auth-buttons">
          <button className="btn primary" type="submit" disabled={blocked}>{busy ? "Creating…" : "Create account"}</button>
          <button className="btn" type="button" disabled={busy} onClick={() => go("signIn")}>Back to log in</button>
        </div>
      )}
      {(view === "confirm" || view === "forgot" || view === "reset") && (
        <button className="btn primary wide" type="submit" disabled={blocked}>
          {busy ? "Working…" : { confirm: "Confirm", forgot: "Send code", reset: "Set password" }[view]}
        </button>
      )}

      {!dev && (
        <div className="auth-links">
          {view === "signIn" && <button type="button" className="link" onClick={() => go("forgot")}>Forgot password?</button>}
          {view === "confirm" && <button type="button" className="link" disabled={busy}
            onClick={() => acct.resendCode(username).then(() => setMsg({ text: "Sent a new code." }), (e) => setMsg({ text: e.message, err: true }))}>
            Send a new code</button>}
          {(view === "forgot" || view === "reset" || view === "confirm") && <button type="button" className="link" onClick={() => go("signIn")}>Back to log in</button>}
        </div>
      )}
    </form>
  );
}
