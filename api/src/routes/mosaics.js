import { Router } from "express";
import config from "../config.js";
import { HttpError } from "../auth.js";
import { query } from "../db.js";
import { deleteObjects, downloadUrl, keys, objectSize, uploadUrl } from "../storage.js";
import { cleanName, isUuid } from "./util.js";

const r = Router();
const lim = config.limits;
const THUMB_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]); // browsers without WebP encoding fall back to PNG

// Your saved mosaics, newest first.
r.get("/", async (req, res) => {
  const { rows } = await query(
    `SELECT m.id, m.title, m.target_name, m.width, m.height, m.bytes, m.settings, m.created_at, m.thumb_key,
            m.tile_set_id, s.name AS tile_set_name
     FROM mosaics m LEFT JOIN tile_sets s ON s.id = m.tile_set_id
     WHERE m.user_id = $1 AND m.status = 'ready' ORDER BY m.created_at DESC`, [req.user.id]);
  res.json(await Promise.all(rows.map(async (m) => ({
    id: m.id, title: m.title, targetName: m.target_name, width: m.width, height: m.height, bytes: Number(m.bytes),
    settings: m.settings, createdAt: m.created_at, tileSetId: m.tile_set_id, tileSetName: m.tile_set_name,
    thumbUrl: await downloadUrl(m.thumb_key),
  }))));
});

// Start saving a mosaic: returns upload URLs for the PNG and its thumbnail. Then call /:id/complete.
r.post("/", async (req, res) => {
  const b = req.body ?? {};
  const width = Number(b.width), height = Number(b.height), bytes = Number(b.bytes), thumbBytes = Number(b.thumbBytes);
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 65535)) throw new HttpError(400, "Invalid mosaic size.");
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > lim.mosaicBytes) throw new HttpError(400, "The mosaic PNG is empty or larger than 300 MB.");
  if (!Number.isInteger(thumbBytes) || thumbBytes < 1 || thumbBytes > lim.thumbBytes) throw new HttpError(400, "Invalid thumbnail.");
  const thumbType = THUMB_TYPES.has(b.thumbType) ? b.thumbType : "image/webp";
  const settings = b.settings && typeof b.settings === "object" && JSON.stringify(b.settings).length < 4000 ? b.settings : {};

  let tileSetId = null;
  if (b.tileSetId) {
    if (!isUuid(b.tileSetId)) throw new HttpError(400, "Invalid tile set.");
    const own = await query("SELECT 1 FROM tile_sets WHERE id = $1 AND user_id = $2", [b.tileSetId, req.user.id]);
    if (own.rows.length) tileSetId = b.tileSetId;
  }

  const { rows } = await query(
    `INSERT INTO mosaics (user_id, title, target_name, tile_set_id, width, height, settings, bytes, thumb_bytes, s3_key, thumb_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '', '') RETURNING id`,
    [req.user.id, cleanName(b.title, "Untitled mosaic"), cleanName(b.targetName, null), tileSetId,
      width, height, settings, bytes, thumbBytes]);
  const id = rows[0].id, key = keys.mosaic(req.user.id, id), thumbKey = keys.thumb(req.user.id, id);
  await query("UPDATE mosaics SET s3_key = $2, thumb_key = $3 WHERE id = $1", [id, key, thumbKey]);

  res.status(201).json({
    id,
    uploadUrl: await uploadUrl(key, "image/png", bytes),
    thumbUploadUrl: await uploadUrl(thumbKey, thumbType, thumbBytes),
  });
});

r.post("/:id/complete", async (req, res) => {
  const m = await ownMosaic(req);
  const [png, thumb] = await Promise.all([objectSize(m.s3_key), objectSize(m.thumb_key)]);
  if (png !== Number(m.bytes) || thumb !== m.thumb_bytes) throw new HttpError(409, "The upload hasn't finished.");
  await query("UPDATE mosaics SET status = 'ready' WHERE id = $1", [m.id]);
  res.json({ id: m.id, status: "ready" });
});

// A short-lived link that downloads the full PNG.
r.get("/:id/download", async (req, res) => {
  const m = await ownMosaic(req);
  const filename = `${m.title.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "mosaic"}.png`;
  res.json({ url: await downloadUrl(m.s3_key, filename) });
});

r.patch("/:id", async (req, res) => {
  const m = await ownMosaic(req);
  const title = cleanName(req.body?.title, m.title);
  await query("UPDATE mosaics SET title = $2 WHERE id = $1", [m.id, title]);
  res.json({ id: m.id, title });
});

r.delete("/:id", async (req, res) => {
  const m = await ownMosaic(req);
  await query("DELETE FROM mosaics WHERE id = $1", [m.id]);
  await deleteObjects([m.s3_key, m.thumb_key]);
  res.status(204).end();
});

async function ownMosaic(req) {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Mosaic not found.");
  const { rows } = await query("SELECT * FROM mosaics WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  if (!rows.length) throw new HttpError(404, "Mosaic not found.");
  return rows[0];
}

export default r;
