import { useId, useLayoutEffect, useRef, useState } from "react";

// Small, dependency-free charts for usage metrics: one series per chart, so no legend
// (the card title names it). Columns per day with a hover/keyboard tooltip, and a
// table view so no value depends on hovering.

const fmt = (n) => (n >= 10000 ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n) : n.toLocaleString());
const dayLabel = (d, opts = { month: "short", day: "numeric" }) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

// round the axis top up to a clean whole number, with 2-4 even steps
function niceScale(max) {
  if (max <= 4) return { top: Math.max(1, max), step: 1 };
  const raw = max / 3, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw); // whole numbers: these are counts
  return { top: Math.ceil(max / step) * step, step };
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    // measure now (the observer only reports on a rendered frame), then follow resizes
    setW(Math.round(ref.current.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Daily columns. data: [{ day: "YYYY-MM-DD", n }]
export function ColumnChart({ data, label, unit, height = 160 }) {
  const [wrap, width] = useWidth();
  const [active, setActive] = useState(null);
  const tipId = useId();
  const pad = { top: 8, right: 4, bottom: 22, left: 34 };
  const plotW = Math.max(0, width - pad.left - pad.right), plotH = height - pad.top - pad.bottom;
  const max = Math.max(0, ...data.map((d) => d.n));
  const { top, step } = niceScale(max);
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(1, Math.min(24, band - 2)); // 2px surface gap between neighbours, 24px cap
  const y = (v) => pad.top + plotH - (v / top) * plotH;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const xLabels = data.length ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : [];

  const indexAt = (clientX) => {
    const r = wrap.current.getBoundingClientRect();
    const i = Math.floor((clientX - r.left - pad.left) / band);
    return i >= 0 && i < data.length ? i : null;
  };
  const onKey = (e) => {
    if (!data.length) return;
    const last = data.length - 1;
    const next = { ArrowRight: (active ?? -1) + 1, ArrowLeft: (active ?? data.length) - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  };

  const a = active != null ? data[active] : null;
  const tipLeft = a ? Math.min(Math.max(pad.left + band * (active + 0.5), 60), width - 60) : 0;

  return (
    <div className="chart" ref={wrap} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" tabIndex={0}
          aria-label={`${label}, daily, ${data.length} days. Use the arrow keys to read each day.`}
          aria-describedby={a ? tipId : undefined}
          onPointerMove={(e) => setActive(indexAt(e.clientX))} onPointerLeave={() => setActive(null)}
          onKeyDown={onKey} onBlur={() => setActive(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} className="grid" />
              <text x={pad.left - 6} y={y(v)} className="tick" textAnchor="end" dominantBaseline="middle">{fmt(v)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            if (!d.n) return null;
            const x = pad.left + band * i + (band - barW) / 2, yt = y(d.n), h = pad.top + plotH - yt;
            const r = Math.min(4, barW / 2, h);
            // rounded data end, square at the baseline
            const path = `M${x},${yt + h} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + barW - r} Q${x + barW},${yt} ${x + barW},${yt + r} V${yt + h} Z`;
            return <path key={d.day} d={path} className={i === active ? "bar on" : "bar"} />;
          })}
          {a && <line x1={pad.left + band * (active + 0.5)} x2={pad.left + band * (active + 0.5)} y1={pad.top} y2={pad.top + plotH} className="cursor" />}
          {xLabels.map((i, k) => (
            <text key={i} x={pad.left + band * (i + 0.5)} y={height - 6} className="tick"
              textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}>{dayLabel(data[i].day)}</text>
          ))}
        </svg>
      )}
      {a && (
        <div className="chart-tip" id={tipId} role="status" style={{ left: tipLeft }}>
          <b>{a.n.toLocaleString()}</b> <span>{unit}</span>
          <span className="tip-day">{dayLabel(a.day, { weekday: "short", month: "short", day: "numeric" })}</span>
        </div>
      )}
    </div>
  );
}

// A metric: headline number, the period total, the daily chart, and its table view.
export function MetricCard({ title, total, totalLabel, data, unit, height }) {
  const inRange = data.reduce((s, d) => s + d.n, 0);
  return (
    <section className="metric">
      <header>
        <h3>{title}</h3>
        <p className="metric-value">{fmt(total)}</p>
        <p className="metric-sub">{totalLabel} · <b>{inRange.toLocaleString()}</b> in the last {data.length} days</p>
      </header>
      <ColumnChart data={data} label={title} unit={unit} height={height} />
      <details className="metric-table">
        <summary>Table</summary>
        <table>
          <thead><tr><th scope="col">Day (UTC)</th><th scope="col">{title}</th></tr></thead>
          <tbody>{[...data].reverse().map((d) => <tr key={d.day}><td>{dayLabel(d.day, { year: "numeric", month: "short", day: "numeric" })}</td><td>{d.n.toLocaleString()}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

// 7 / 30 / 90 days, one control above all the charts it scopes
export function RangePicker({ days, onChange }) {
  return (
    <div className="tabs range" role="radiogroup" aria-label="Date range">
      {[7, 30, 90].map((d) => (
        <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? "on" : ""} onClick={() => onChange(d)}>
          Last {d} days
        </button>
      ))}
    </div>
  );
}
