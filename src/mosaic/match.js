import { rgbToLab, rgbToHex } from "./color.js";
import { tileCells } from "./tiles.js";
import { sampleTarget } from "./target.js";

// Each tile becomes a g×g grid of colours. In "cell" mode a tile's transparent areas show the
// target's own colour, so each sub-cell is weighted by how much of it the sprite actually covers.
export function buildIndex(tiles, bg, cellMode, metric, g) {
  const n = tiles.length, m = g * g, P = new Float32Array(n * m * 3), W = new Float32Array(n * m);
  tiles.forEach((t, i) => {
    const c = tileCells(t, g);
    let wsum = 0;
    for (let s = 0; s < m; s++) wsum += c[s * 4 + 3];
    for (let s = 0; s < m; s++) {
      const pr = c[s * 4], pg = c[s * 4 + 1], pb = c[s * 4 + 2], cov = c[s * 4 + 3];
      let rgb;
      if (cellMode) { rgb = cov > 1e-3 ? [pr / cov, pg / cov, pb / cov] : [0, 0, 0]; W[i * m + s] = cov / wsum; }
      else { const k = 1 - cov; rgb = [pr + bg[0] * k, pg + bg[1] * k, pb + bg[2] * k]; W[i * m + s] = 1 / m; }
      const v = metric === "lab" ? rgbToLab(...rgb) : rgb, o = (i * m + s) * 3;
      P[o] = v[0]; P[o + 1] = v[1]; P[o + 2] = v[2];
    }
  });
  return { n, m, P, W, cache: new Map() };
}

// k closest tiles to the cell's colour grid T, by weighted mean squared distance
export function nearest(idx, T, k, key) {
  if (key !== undefined) { const hit = idx.cache.get(key); if (hit) return hit; }
  const { n, m, P, W } = idx, best = [], dist = [];
  for (let i = 0; i < n; i++) {
    const lim = best.length < k ? Infinity : dist[best.length - 1];
    let d = 0;
    for (let s = 0; s < m && d < lim; s++) {
      const o = (i * m + s) * 3, t = s * 3;
      const a = P[o] - T[t], b = P[o + 1] - T[t + 1], c = P[o + 2] - T[t + 2];
      d += W[i * m + s] * (a * a + b * b + c * c);
    }
    if (d >= lim) continue;
    let j = Math.min(best.length, k - 1);
    while (j > 0 && dist[j - 1] > d) { best[j] = best[j - 1]; dist[j] = dist[j - 1]; j--; }
    best[j] = i; dist[j] = d;
  }
  const res = { best, dist };
  if (key !== undefined) idx.cache.set(key, res);
  return res;
}

// Quick 1×1 trial on a small grid: which background colour gives the lowest average error?
export function bestBackground(tiles, target, metric) {
  const cols = 48, rows = Math.max(1, Math.round(cols * target.height / target.width)), n = cols * rows;
  const px = sampleTarget(target, cols, rows, "#808080"), cells = [];
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < n * 4; i += 4) {
    mr += px[i]; mg += px[i + 1]; mb += px[i + 2];
    cells.push(metric === "lab" ? rgbToLab(px[i], px[i + 1], px[i + 2]) : [px[i], px[i + 1], px[i + 2]]);
  }
  const cands = [[255, 255, 255], [0, 0, 0], [128, 128, 128], [mr / n, mg / n, mb / n].map(Math.round)];
  let best = cands[0], bestErr = Infinity;
  for (const bg of cands) {
    const idx = buildIndex(tiles, bg, false, metric, 1);
    let e = 0;
    for (const v of cells) e += Math.sqrt(nearest(idx, v, 1).dist[0]);
    if (e < bestErr) { bestErr = e; best = bg; }
  }
  return rgbToHex(best);
}
