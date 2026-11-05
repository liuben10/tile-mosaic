import { hexToRgb, rgbToLab } from "./color.js";
import { buildIndex, nearest, bestBackground } from "./match.js";
import { sampleTarget } from "./target.js";
import { scaledTile } from "./tiles.js";
import { canvasOf, mulberry32, nextFrame } from "./util.js";

const MAX_SIDE = 16384, MAX_AREA = 120e6; // stay inside browser canvas limits

// Grid size and the tile size actually used (shrunk if the output would be too big for a canvas).
export function layout(settings, target) {
  const cols = settings.cols;
  const rows = target ? Math.max(1, Math.round(cols * target.height / target.width)) : 0;
  let ts = settings.tileSize;
  while (ts > 2 && (cols * ts > MAX_SIDE || rows * ts > MAX_SIDE || cols * rows * ts * ts > MAX_AREA)) ts--;
  return { cols, rows, ts, capped: ts !== settings.tileSize };
}

/**
 * Build the mosaic. Resolves to null if isCancelled() turns true part-way through.
 * onProgress(fraction, row, rows) reports progress between chunks of rows.
 */
export async function buildMosaic({ tiles, target, settings, onProgress, isCancelled }) {
  const t0 = performance.now();
  const { cols, rows, ts } = layout(settings, target);
  const cellMode = settings.bgMode === "cell";
  const bgHex = settings.bgMode === "auto" ? bestBackground(tiles, target, settings.metric) : settings.bgColor;
  const bg = hexToRgb(bgHex);

  const g = settings.detail, m = g * g, sw = cols * g;
  const px = sampleTarget(target, sw, rows * g, bgHex);
  const idx = buildIndex(tiles, bg, cellMode, settings.metric, g);
  const c = canvasOf(cols * ts, rows * ts), x = c.getContext("2d");
  if (!x) throw new Error("This browser couldn't create an image that large. Lower the tile size or tiles across.");
  if (!cellMode) { x.fillStyle = bgHex; x.fillRect(0, 0, c.width, c.height); }

  const labCache = new Map(), toSpace = settings.metric === "lab"
    ? (r, gg, b) => { const key = (r << 16) | (gg << 8) | b; let v = labCache.get(key); if (!v) labCache.set(key, v = rgbToLab(r, gg, b)); return v; }
    : (r, gg, b) => [r, gg, b];
  const rand = mulberry32(1234), variety = settings.variety, k = variety + (settings.avoidRepeats ? 2 : 0);
  const tint = settings.tint / 100;
  const pick = new Int32Array(cols * rows).fill(-1), used = new Uint8Array(tiles.length);
  const T = new Float32Array(m * 3), scaled = new Map();
  let last = performance.now(), errSum = 0;

  for (let y = 0; y < rows; y++) {
    for (let col = 0; col < cols; col++) {
      const p = y * cols + col;
      let r = 0, gr = 0, b = 0;
      for (let sy = 0; sy < g; sy++) for (let sx = 0; sx < g; sx++) {
        const i = ((y * g + sy) * sw + col * g + sx) * 4, v = toSpace(px[i], px[i + 1], px[i + 2]), o = (sy * g + sx) * 3;
        T[o] = v[0]; T[o + 1] = v[1]; T[o + 2] = v[2];
        r += px[i]; gr += px[i + 1]; b += px[i + 2];
      }
      r = Math.round(r / m); gr = Math.round(gr / m); b = Math.round(b / m);
      const { best, dist } = nearest(idx, T, k, g === 1 ? ((r >> 2) << 12) | ((gr >> 2) << 6) | (b >> 2) : undefined);
      let order = best.map((_, j) => j);
      if (settings.avoidRepeats && best.length > 1) {
        const left = col ? pick[p - 1] : -1, up = y ? pick[p - cols] : -1;
        const f = order.filter((j) => best[j] !== left && best[j] !== up);
        if (f.length) order = f;
      }
      const j = order[Math.floor(rand() * Math.min(variety, order.length))], t = best[j];
      pick[p] = t; used[t] = 1; errSum += Math.sqrt(dist[j]);
      const dx = col * ts, dy = y * ts;
      if (cellMode) { x.fillStyle = `rgb(${r},${gr},${b})`; x.fillRect(dx, dy, ts, ts); }
      x.drawImage(scaledTile(scaled, tiles, t, ts, settings.pixelArt), dx, dy);
      if (tint > 0) { x.globalAlpha = tint; x.fillStyle = `rgb(${r},${gr},${b})`; x.fillRect(dx, dy, ts, ts); x.globalAlpha = 1; }
    }
    if (performance.now() - last > 32) {
      onProgress?.((y + 1) / rows, y + 1, rows);
      await nextFrame();
      if (isCancelled?.()) return null;
      last = performance.now();
    }
  }

  return {
    canvas: c, bgHex, cols, rows,
    error: errSum / (cols * rows),
    distinct: used.reduce((a, v) => a + v, 0),
    ms: Math.round(performance.now() - t0),
  };
}
