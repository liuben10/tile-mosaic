import { useAccount } from "../account/AccountContext.jsx";

// Header controls: switch between the studio and the library, and sign in or out.
export default function AccountBar({ view, onView, onSignIn }) {
  const acct = useAccount();
  if (!acct.enabled) return null;
  return (
    <nav className="account" aria-label="Account">
      {acct.user ? (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={view === "studio"} className={view === "studio" ? "on" : ""} onClick={() => onView("studio")}>Studio</button>
            <button role="tab" aria-selected={view === "library"} className={view === "library" ? "on" : ""} onClick={() => onView("library")}>My library</button>
          </div>
          <span className="who" title={acct.user.email}>{acct.user.email}</span>
          <button className="btn" type="button" onClick={() => { acct.signOut(); onView("home"); }}>Sign out</button>
        </>
      ) : (
        <button className="btn primary" type="button" onClick={onSignIn}>Sign in</button>
      )}
    </nav>
  );
}
