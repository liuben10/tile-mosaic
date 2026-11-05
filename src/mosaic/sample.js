// Built-in demo data, so the app opens showing a finished mosaic.
import { makeTile } from "./tiles.js";
import { canvasOf, mulberry32 } from "./util.js";

// 180 symmetric 12×12 pixel critters in assorted colours
export function makeSampleTiles() {
  const rand = mulberry32(7), tiles = [], N = 12;
  for (let s = 0; s < 180; s++) {
    const c = canvasOf(N, N), x = c.getContext("2d");
    const grey = s % 9 === 0;
    const h = rand() * 360, sat = grey ? 0 : 35 + rand() * 60, l = 14 + rand() * 72;
    const body = `hsl(${h} ${sat}% ${l}%)`, shade = `hsl(${h} ${sat}% ${Math.max(5, l - 14)}%)`;
    const accent = `hsl(${(h + 150 + rand() * 60) % 360} ${sat}% ${Math.min(92, l + 22)}%)`;
    const outline = `hsl(${h} ${sat * 0.6}% ${Math.max(6, l - 34)}%)`;
    const on = [];
    for (let y = 0; y < N; y++) for (let i = 0; i < N / 2; i++) {
      const dx = (N / 2 - 0.5 - i) / (N / 2), dy = (y - N / 2 + 0.5) / (N / 2);
      on[y * N + i] = on[y * N + (N - 1 - i)] = rand() < 1.15 - Math.hypot(dx * 0.8, dy);
    }
    const at = (i, y) => i >= 0 && y >= 0 && i < N && y < N && on[y * N + i];
    for (let y = 0; y < N; y++) for (let i = 0; i < N; i++) {
      if (at(i, y)) { x.fillStyle = y > N * 0.66 ? shade : (rand() < 0.12 ? accent : body); x.fillRect(i, y, 1, 1); }
      else if (at(i - 1, y) || at(i + 1, y) || at(i, y - 1) || at(i, y + 1)) { x.fillStyle = outline; x.fillRect(i, y, 1, 1); }
    }
    const ey = 3 + Math.floor(rand() * 3), ex = 2 + Math.floor(rand() * 2);
    if (at(ex, ey)) { x.fillStyle = l > 50 ? "#111" : "#fff"; x.fillRect(ex, ey, 1, 1); x.fillRect(N - 1 - ex, ey, 1, 1); }
    tiles.push(makeTile(`sprite-${String(s + 1).padStart(3, "0")}.png`, c, N, N));
  }
  return tiles;
}

// a 640×480 sunset over mountains and water
export function makeSampleTarget() {
  const W = 640, H = 480, c = canvasOf(W, H);
  const x = c.getContext("2d"), rand = mulberry32(42), horizon = H * 0.64;
  let g = x.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, "#14204f"); g.addColorStop(0.45, "#5b3f86"); g.addColorStop(0.8, "#e0716a"); g.addColorStop(1, "#ffc46b");
  x.fillStyle = g; x.fillRect(0, 0, W, horizon);
  g = x.createRadialGradient(430, horizon - 40, 10, 430, horizon - 40, 170);
  g.addColorStop(0, "rgba(255,236,170,1)"); g.addColorStop(0.28, "rgba(255,214,120,.95)"); g.addColorStop(0.3, "rgba(255,190,110,.45)"); g.addColorStop(1, "rgba(255,160,100,0)");
  x.fillStyle = g; x.fillRect(0, 0, W, horizon);
  const ridge = (base, amp, color, seed) => {
    const r = mulberry32(seed); x.fillStyle = color; x.beginPath(); x.moveTo(0, horizon);
    let y = base;
    for (let px = 0; px <= W; px += 16) { y += (r() - 0.5) * amp; y = Math.min(horizon - 4, Math.max(base - amp * 2, y)); x.lineTo(px, y); }
    x.lineTo(W, horizon); x.closePath(); x.fill();
  };
  ridge(horizon - 90, 34, "#6b4a7e", 3); ridge(horizon - 55, 30, "#3e2c5c", 5); ridge(horizon - 24, 18, "#22193a", 9);
  g = x.createLinearGradient(0, horizon, 0, H); g.addColorStop(0, "#3d3a6e"); g.addColorStop(1, "#0d1230");
  x.fillStyle = g; x.fillRect(0, horizon, W, H - horizon);
  for (let i = 0; i < 26; i++) {
    const y = horizon + 6 + i * 6.5, w = 120 - i * 3.5 + rand() * 30;
    x.fillStyle = `rgba(255,${200 - i * 3},${120 - i * 2},${0.75 - i * 0.025})`; x.fillRect(430 - w / 2 + (rand() - 0.5) * 20, y, w, 3);
  }
  x.fillStyle = "#090c1f"; x.beginPath(); x.moveTo(0, H); x.lineTo(0, H - 70);
  x.quadraticCurveTo(120, H - 120, 250, H - 50); x.quadraticCurveTo(320, H - 20, 360, H); x.closePath(); x.fill();
  return { source: c, width: W, height: H, name: "sample-sunset.png", previewUrl: c.toDataURL("image/png"), sample: true };
}
