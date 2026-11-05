import { canvasOf } from "./util.js";

// A target is { source, width, height, name, previewUrl }; source is anything drawImage accepts.
export async function loadTargetFile(file) {
  const bmp = await createImageBitmap(file);
  return { source: bmp, width: bmp.width, height: bmp.height, name: file.name, previewUrl: URL.createObjectURL(file) };
}

// Shrink the target to cols×rows pixels, one per cell, over `bgHex` where it is transparent.
export function sampleTarget(target, cols, rows, bgHex) {
  // halve repeatedly so a big reduction averages pixels instead of skipping them
  let cur = target.source, w = target.width, h = target.height;
  while (w >= cols * 4 && h >= rows * 4) {
    const nw = Math.ceil(w / 2), nh = Math.ceil(h / 2), c = canvasOf(nw, nh), x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(cur, 0, 0, w, h, 0, 0, nw, nh); cur = c; w = nw; h = nh;
  }
  const c = canvasOf(cols, rows), x = c.getContext("2d", { willReadFrequently: true });
  x.fillStyle = bgHex; x.fillRect(0, 0, cols, rows);
  x.imageSmoothingQuality = "high"; x.drawImage(cur, 0, 0, w, h, 0, 0, cols, rows);
  return x.getImageData(0, 0, cols, rows).data;
}
