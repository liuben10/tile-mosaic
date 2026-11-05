import { rgbToHex, rgbToLab } from "./color.js";
import { sampleTarget } from "./target.js";
import { tileColor } from "./tiles.js";

// A quick look at how well a set of tiles covers a target's colors, for the tile set
// builder: the target redrawn at low resolution where every cell takes the average color
// of its closest tile, plus the target colors no tile comes near.

const CLOSE = { lab: 12, rgb: 40 }; // a cell this close (ΔE or RGB distance) counts as covered

export function coverage({ target, tiles, bg, cellMode, metric = "lab", cols = 72 }) {
  const rows = Math.max(1, Math.round((cols * target.height) / target.width));
  const px = sampleTarget(target, cols, rows, rgbToHex(bg));
  const pixels = new Uint8ClampedArray(cols * rows * 4);
  if (!tiles.length) return { cols, rows, pixels, covered: 0, avg: null, gaps: [] };

  const space = metric === "lab" ? (r, g, b) => rgbToLab(r, g, b) : (r, g, b) => [r, g, b];
  const colors = tiles.map((t) => tileColor(t, bg, cellMode));
  const points = colors.map((c) => space(...c));
  const memo = new Map(); // nearby target colors share an answer
  const limit = CLOSE[metric] ?? CLOSE.lab;
  const misses = new Map();
  let sum = 0, covered = 0;

  for (let i = 0; i < cols * rows; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let hit = memo.get(key);
    if (!hit) {
      const v = space(r, g, b);
      let best = 0, bd = Infinity;
      for (let j = 0; j < points.length; j++) {
        const p = points[j], d = (p[0] - v[0]) ** 2 + (p[1] - v[1]) ** 2 + (p[2] - v[2]) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      memo.set(key, (hit = { best, d: Math.sqrt(bd) }));
    }
    const c = colors[hit.best];
    pixels[i * 4] = c[0]; pixels[i * 4 + 1] = c[1]; pixels[i * 4 + 2] = c[2]; pixels[i * 4 + 3] = 255;
    sum += hit.d;
    if (hit.d <= limit) covered++;
    else {
      // group missed colors coarsely so the list shows broad gaps, not every shade
      const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const m = misses.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      m.n++; m.r += r; m.g += g; m.b += b;
      misses.set(k, m);
    }
  }

  const total = cols * rows;
  const gaps = [...misses.values()]
    .filter((m) => m.n / total >= 0.01)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((m) => ({ hex: rgbToHex([m.r / m.n, m.g / m.n, m.b / m.n]), share: m.n / total }));
  return { cols, rows, pixels, covered: covered / total, avg: sum / total, gaps };
}
