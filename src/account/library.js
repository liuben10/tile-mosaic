// Saving to and loading from the user's library. Files go straight from the browser
// to S3 through short-lived presigned URLs; the API only handles the metadata.

const TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" };
const typeOf = (f) => (TYPES[f.type?.split("/")[1]] && f.type) || TYPES[(f.name.split(".").pop() || "").toLowerCase()] || null;

async function sha256(blob) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function mapLimit(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

async function put(url, blob, type) {
  const res = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": type } });
  if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
}

// Save the files behind the current tiles as a named set. onProgress(message) reports along the way.
export async function saveTileSet(api, name, files, onProgress) {
  const usable = files.filter((f) => typeOf(f) && f.size > 0);
  const hashed = [];
  for (let i = 0; i < usable.length; i++) {
    const f = usable[i];
    hashed.push({ file: f, name: f.webkitRelativePath || f.name, sha256: await sha256(f), bytes: f.size, contentType: typeOf(f) });
    if (i % 50 === 0) onProgress?.(`Preparing… ${i + 1} / ${usable.length}`);
  }
  const res = await api("tile-sets", {
    method: "POST",
    body: { name, tiles: hashed.map(({ name, sha256, bytes, contentType }) => ({ name, sha256, bytes, contentType })) },
  });
  const bySha = new Map(hashed.map((h) => [h.sha256, h]));
  let done = 0;
  await mapLimit(res.uploads, 6, async (u) => {
    const h = bySha.get(u.sha256);
    await put(u.url, h.file, h.contentType);
    if (++done % 10 === 0 || done === res.uploads.length) onProgress?.(`Uploading… ${done} / ${res.uploads.length}`);
  });
  const fin = await api(`tile-sets/${res.id}/complete`, { method: "POST" });
  if (fin.missing) throw new Error(`${fin.missing} tiles didn't upload. Try saving again.`);
  return { id: res.id, tileCount: res.tileCount, uploaded: res.uploads.length };
}

// Fetch a saved set back as File objects, ready for readTiles().
export async function loadTileSet(api, id, onProgress) {
  const set = await api(`tile-sets/${id}`);
  const files = new Array(set.tiles.length);
  let done = 0;
  await mapLimit(set.tiles, 12, async (t, i) => {
    const res = await fetch(t.url);
    if (!res.ok) throw new Error(`Couldn't download ${t.name}.`);
    files[i] = new File([await res.blob()], t.name.split("/").pop(), { type: t.contentType });
    if (++done % 25 === 0) onProgress?.(`Downloading tiles… ${done} / ${set.tiles.length}`);
  });
  return { set, files };
}

// A small preview of a canvas, as WebP where the browser can encode it.
async function thumbnail(canvas, max = 480) {
  const k = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(canvas.width * k)); c.height = Math.max(1, Math.round(canvas.height * k));
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high"; x.drawImage(canvas, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/webp", 0.85));
}

export async function saveMosaic(api, { canvas, png, title, targetName, tileSetId, settings }) {
  const thumb = await thumbnail(canvas);
  const res = await api("mosaics", {
    method: "POST",
    body: {
      title, targetName, tileSetId, settings, width: canvas.width, height: canvas.height,
      bytes: png.size, thumbBytes: thumb.size, thumbType: thumb.type || "image/png",
    },
  });
  await Promise.all([put(res.uploadUrl, png, "image/png"), put(res.thumbUploadUrl, thumb, thumb.type || "image/png")]);
  await api(`mosaics/${res.id}/complete`, { method: "POST" });
  return res.id;
}
