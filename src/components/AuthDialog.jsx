import { useEffect, useRef, useState } from "react";
import AuthForm from "./AuthForm.jsx";

// The log-in form in a dialog, for signing in from the studio.
export default function AuthDialog({ open, onClose }) {
  const ref = useRef(null);
  const [round, setRound] = useState(0); // a fresh form each time it opens

  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) { setRound((r) => r + 1); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose} aria-label="Log in">
      <div className="dialog-head">
        <p className="lede">Save tile sets and mosaics to your library and open them on any device.</p>
        <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {open && <AuthForm key={round} onDone={onClose} />}
    </dialog>
  );
}
