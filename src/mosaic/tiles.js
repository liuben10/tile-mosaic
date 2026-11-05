import { canvasOf, nextFrame } from "./util.js";

const ART_MAX = 256;            // tile art is kept at native size, up to this
const DESC = 48, BLOCKS = 6;    // colour descriptor: 6×6 blocks measured on a 48×48 render

// Turn one image into a tile: trimmed art plus a colour descriptor. Returns null for a blank image.
export function makeTile(name, src, sw, sh) {
  const k = Math.min(1, ART_MAX / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const raw = canvasOf(w, h), rx = raw.getContext("2d", { willReadFrequently: true });
  rx.imageSmoothingQuality = "high"; rx.drawImage(src, 0, 0, w, h);
  const d = rx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, transparent = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = d[(y * w + x) * 4 + 3];
    if (a < 255) transparent = true;
    if (a > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;

  // sprites are trimmed to their visible pixels and centred in a square; opaque photos are centre-cropped
  let sx, sy, cw, ch, side;
  if (transparent) { sx = x0; sy = y0; cw = x1 - x0 + 1; ch = y1 - y0 + 1; side = Math.max(cw, ch); }
  else { side = Math.min(w, h); sx = (w - side) >> 1; sy = (h - side) >> 1; cw = ch = side; }
  const art = canvasOf(side, side);
  art.getContext("2d").drawImage(raw, sx, sy, cw, ch, (side - cw) >> 1, (side - ch) >> 1, cw, ch);

  // premultiplied mean colour + coverage of each block; lets us composite over any background later
  const dc = canvasOf(DESC, DESC), dx = dc.getContext("2d", { willReadFrequently: true });
  dx.imageSmoothingQuality = "high"; dx.drawImage(art, 0, 0, DESC, DESC);
  const p = dx.getImageData(0, 0, DESC, DESC).data, B = DESC / BLOCKS;
  const desc = new Float32Array(BLOCKS * BLOCKS * 4);
  for (let y = 0; y < DESC; y++) for (let x = 0; x < DESC; x++) {
    const i = (y * DESC + x) * 4, a = p[i + 3] / 255, o = (((y / B) | 0) * BLOCKS + ((x / B) | 0)) * 4;
    desc[o] += p[i] * a; desc[o + 1] += p[i + 1] * a; desc[o + 2] += p[i + 2] * a; desc[o + 3] += a;
  }
  for (let i = 0; i < desc.length; i++) desc[i] /= B * B;
  const m = BLOCKS * BLOCKS;
  let pr = 0, pg = 0, pb = 0, cov = 0;
  for (let o = 0; o < desc.length; o += 4) { pr += desc[o]; pg += desc[o + 1]; pb += desc[o + 2]; cov += desc[o + 3]; }
  return { name, art, desc, pr: pr / m, pg: pg / m, pb: pb / m, cov: cov / m };
}

// average the 6×6 blocks down to a g×g grid of [pr, pg, pb, cov]
export function tileCells(t, g) {
  const out = new Float32Array(g * g * 4), span = BLOCKS / g;
  for (let by = 0; by < BLOCKS; by++) for (let bx = 0; bx < BLOCKS; bx++) {
    const s = (((by / span) | 0) * g + ((bx / span) | 0)) * 4, o = (by * BLOCKS + bx) * 4;
    for (let c = 0; c < 4; c++) out[s + c] += t.desc[o + c] / (span * span);
  }
  return out;
}

// a tile's overall colour as seen over `bg`, or its opaque pixels only in "cell" mode
export function tileColor(t, bg, cellMode) {
  if (cellMode) return [t.pr / t.cov, t.pg / t.cov, t.pb / t.cov];
  const k = 1 - t.cov;
  return [t.pr + bg[0] * k, t.pg + bg[1] * k, t.pb + bg[2] * k];
}

export function isImage(f) {
  return /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name);
}

// Read image files into tiles. onProgress(done, total) is called as files are read.
export async function readTiles(files, onProgress) {
  const imgs = files.filter(isImage);
  const tiles = [];
  let failed = 0, empty = 0;
  for (let i = 0; i < imgs.length; i++) {
    try {
      const bmp = await createImageBitmap(imgs[i]);
      const t = makeTile(imgs[i].webkitRelativePath || imgs[i].name, bmp, bmp.width, bmp.height);
      bmp.close();
      if (!t || t.cov < 0.03) empty++; else tiles.push(t);
    } catch { failed++; }
    if (i % 40 === 0) { onProgress?.(i + 1, imgs.length); await nextFrame(); }
  }
  return { tiles, total: imgs.length, empty, failed };
}

// tile art resized to exactly the output tile size; `cache` lives for one build
export function scaledTile(cache, tiles, t, ts, pixelArt) {
  let c = cache.get(t);
  if (c) return c;
  let src = tiles[t].art, w = src.width;
  while (w / 2 >= ts) { // shrink in halves so every source pixel contributes
    const h = Math.max(ts, w >> 1), step = canvasOf(h, h), sx = step.getContext("2d");
    sx.imageSmoothingQuality = "high"; sx.drawImage(src, 0, 0, h, h); src = step; w = h;
  }
  c = canvasOf(ts, ts);
  const x = c.getContext("2d");
  x.imageSmoothingEnabled = !(pixelArt && ts >= w); x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, ts, ts);
  cache.set(t, c);
  return c;
}
