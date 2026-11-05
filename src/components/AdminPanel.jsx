import { useEffect, useState } from "react";
import { useAccount } from "../account/AccountContext.jsx";
import { MetricCard, RangePicker } from "./Charts.jsx";

// Everyone's activity, for admins only. The API checks the account id on every request;
// this page is just hidden from everyone else.
export default function AdminPanel() {
  const { api } = useAccount();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    setError(null);
    api(`admin/stats?days=${days}`).then((s) => live && setStats(s), (e) => live && setError(e.status === 404 ? "This page isn't available." : e.message));
    return () => { live = false; };
  }, [api, days]);

  if (error) return <main className="wrap admin"><p className="msg err">{error}</p></main>;
  const t = stats?.totals, s = stats?.series;

  return (
    <main className="wrap admin">
      <div className="admin-head">
        <h2>Admin · usage</h2>
        <RangePicker days={days} onChange={setDays} />
      </div>
      {!stats ? <p className="meta">Loading…</p> : (
        <div className="metrics">
          <MetricCard title="Unique users" total={t.users} totalLabel={`accounts · ${t.visitors.toLocaleString()} unique visitors`} data={s.newUsers} unit="new accounts" />
          <MetricCard title="Visits" total={t.visits} totalLabel="all time" data={s.visits} unit="visits" />
          <MetricCard title="Tile sets created" total={t.tileSets} totalLabel="all time" data={s.tileSets} unit="tile sets" />
          <MetricCard title="Mosaics created" total={t.mosaics} totalLabel="all time" data={s.mosaics} unit="mosaics" />
          <MetricCard title="Images uploaded" total={t.images} totalLabel="all time, each image counted once per user" data={s.images} unit="images" />
        </div>
      )}
      <p className="meta">Days are in UTC. Reloads within 30 minutes count as one visit.</p>
    </main>
  );
}
