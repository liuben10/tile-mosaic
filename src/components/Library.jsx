import { useCallback, useEffect, useState } from "react";
import { useAccount } from "../account/AccountContext.jsx";
import { MetricCard, RangePicker } from "./Charts.jsx";

const fmtDate = (s) => new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const fmtBytes = (n) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// The signed-in user's saved mosaics and tile sets.
export default function Library({ onUseTileSet, refreshKey }) {
  const { api } = useAccount();
  const [tab, setTab] = useState("mosaics");
  const [mosaics, setMosaics] = useState(null);
  const [sets, setSets] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // id of the item being worked on

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, s] = await Promise.all([api("mosaics"), api("tile-sets")]);
      setMosaics(m); setSets(s);
    } catch (e) { setError(e.message); }
  }, [api]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function act(id, fn) {
    setBusy(id); setError(null);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  }

  const download = (m) => act(m.id, async () => {
    const { url } = await api(`mosaics/${m.id}/download`);
    const a = document.createElement("a"); a.href = url; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  });
  const removeMosaic = (m) => confirm(`Delete “${m.title}”? This can't be undone.`) &&
    act(m.id, async () => { await api(`mosaics/${m.id}`, { method: "DELETE" }); setMosaics((l) => l.filter((x) => x.id !== m.id)); });
  const removeSet = (s) => confirm(`Delete the tile set “${s.name}”? Mosaics made with it are kept.`) &&
    act(s.id, async () => { await api(`tile-sets/${s.id}`, { method: "DELETE" }); setSets((l) => l.filter((x) => x.id !== s.id)); });
  const useSet = (s) => act(s.id, () => onUseTileSet(s));

  return (
    <section className="library">
      <MyStats refreshKey={refreshKey} />
      <div className="lib-head">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "mosaics"} className={tab === "mosaics" ? "on" : ""} onClick={() => setTab("mosaics")}>
            Mosaics{mosaics ? ` · ${mosaics.length}` : ""}</button>
          <button role="tab" aria-selected={tab === "sets"} className={tab === "sets" ? "on" : ""} onClick={() => setTab("sets")}>
            Tile sets{sets ? ` · ${sets.length}` : ""}</button>
        </div>
        <button className="btn" type="button" onClick={load}>Refresh</button>
      </div>
      {error && <p className="status err">{error}</p>}

      {tab === "mosaics" && (
        mosaics === null ? <p className="empty">Loading…</p>
        : !mosaics.length ? <p className="empty">No saved mosaics yet. Build one in the studio and press <b>Save to library</b>.</p>
        : <ul className="grid">
            {mosaics.map((m) => (
              <li key={m.id} className="card">
                <div className="thumb"><img src={m.thumbUrl} alt="" loading="lazy" /></div>
                <div className="card-body">
                  <b title={m.title}>{m.title}</b>
                  <span className="meta">{m.width.toLocaleString()} × {m.height.toLocaleString()} px · {fmtBytes(m.bytes)}</span>
                  <span className="meta">{fmtDate(m.createdAt)}{m.tileSetName ? ` · ${m.tileSetName}` : ""}</span>
                </div>
                <div className="card-actions">
                  <button className="btn primary" type="button" disabled={busy === m.id} onClick={() => download(m)}>Download</button>
                  <button className="btn" type="button" disabled={busy === m.id} onClick={() => removeMosaic(m)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
      )}

      {tab === "sets" && (
        sets === null ? <p className="empty">Loading…</p>
        : !sets.length ? <p className="empty">No saved tile sets yet. Load a folder of tiles in the studio and press <b>Save to library</b>.</p>
        : <ul className="sets">
            {sets.map((s) => (
              <li key={s.id} className="card set">
                <div className="set-previews">
                  {s.previews.map((u, i) => <img key={i} src={u} alt="" loading="lazy" />)}
                </div>
                <div className="card-body">
                  <b title={s.name}>{s.name}</b>
                  <span className="meta">{s.tileCount.toLocaleString()} tiles · {fmtDate(s.createdAt)}{s.complete ? "" : " · upload incomplete"}</span>
                </div>
                <div className="card-actions">
                  <button className="btn primary" type="button" disabled={busy === s.id} onClick={() => useSet(s)}>
                    {busy === s.id ? "Loading…" : "Use these tiles"}</button>
                  <button className="btn" type="button" disabled={busy === s.id} onClick={() => removeSet(s)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
      )}
    </section>
  );
}

// The signed-in user's own activity, at the top of their library.
function MyStats({ refreshKey }) {
  const { api, user } = useAccount();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let live = true;
    api(`stats/me?days=${days}`).then((s) => live && setStats(s), () => {});
    return () => { live = false; };
  }, [api, days, refreshKey]);

  return (
    <section className="my-stats" aria-label="Your activity">
      <div className="lib-head">
        <h2 className="section-title">Your activity</h2>
        <RangePicker days={days} onChange={setDays} />
      </div>
      {stats && (
        <div className="metrics compact">
          <MetricCard title="Tile sets created" total={stats.totals.tileSets} totalLabel="all time" data={stats.series.tileSets} unit="tile sets" height={110} />
          <MetricCard title="Mosaics created" total={stats.totals.mosaics} totalLabel="all time" data={stats.series.mosaics} unit="mosaics" height={110} />
          <MetricCard title="Images uploaded" total={stats.totals.images} totalLabel="all time" data={stats.series.images} unit="images" height={110} />
          <MetricCard title="Visits" total={stats.totals.visits} totalLabel="all time" data={stats.series.visits} unit="visits" height={110} />
        </div>
      )}
      {user?.id && <p className="meta account-id">Your account id: <code>{user.id}</code></p>}
    </section>
  );
}
