import { Router } from "express";
import config from "../config.js";
import { HttpError } from "../auth.js";
import { query, tx } from "../db.js";
import { deleteObjects, downloadUrl, keys, mapLimit, objectSize, uploadUrl } from "../storage.js";
import { cleanName, isUuid } from "./util.js";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"]);
const PREVIEWS = 12; // tiles shown per set in the library list

const r = Router();

// Your tile sets, newest first, each with a few preview tiles.
r.get("/", async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.name, s.tile_count, s.created_at,
            COALESCE((SELECT array_agg(t.s3_key ORDER BY st.position)
                      FROM (SELECT * FROM tile_set_tiles WHERE tile_set_id = s.id ORDER BY position LIMIT $2) st
                      JOIN tiles t ON t.id = st.tile_id AND t.uploaded), '{}') AS preview_keys,
            NOT EXISTS (SELECT 1 FROM tile_set_tiles st JOIN tiles t ON t.id = st.tile_id
                        WHERE st.tile_set_id = s.id AND NOT t.uploaded) AS complete
     FROM tile_sets s WHERE s.user_id = $1 ORDER BY s.created_at DESC`, [req.user.id, PREVIEWS]);
  res.json(await Promise.all(rows.map(async (s) => ({
    id: s.id, name: s.name, tileCount: s.tile_count, createdAt: s.created_at, complete: s.complete,
    previews: await Promise.all(s.preview_keys.map((k) => downloadUrl(k))),
  }))));
});

// Start saving a set. The body lists every file by content hash; the response has an
// upload URL for each file the user hasn't stored before. Then call /:id/complete.
r.post("/", async (req, res) => {
  const lim = config.limits;
  const name = cleanName(req.body?.name, "Untitled tiles");
  const files = Array.isArray(req.body?.tiles) ? req.body.tiles : [];
  if (!files.length) throw new HttpError(400, "A tile set needs at least one tile.");
  if (files.length > lim.tilesPerSet) throw new HttpError(400, `A tile set can have at most ${lim.tilesPerSet} tiles.`);

  // validate, and drop exact duplicates within the set
  const seen = new Set(), list = [];
  for (const f of files) {
    const sha256 = String(f?.sha256 || "").toLowerCase(), bytes = Number(f?.bytes), type = String(f?.contentType || "");
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new HttpError(400, "Each tile needs a sha256 hash.");
    if (!IMAGE_TYPES.has(type)) throw new HttpError(400, `Unsupported tile type: ${type || "unknown"}`);
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > lim.tileBytes) throw new HttpError(400, "A tile is empty or larger than 10 MB.");
    if (seen.has(sha256)) continue;
    seen.add(sha256);
    list.push({ sha256, bytes, type, name: cleanName(f.name, sha256.slice(0, 12)) });
  }

  const userId = req.user.id;
  const { setId, pending } = await tx(async (c) => {
    const set = await c.query(
      "INSERT INTO tile_sets (user_id, name, tile_count) VALUES ($1, $2, $3) RETURNING id", [userId, name, list.length]);
    const setId = set.rows[0].id;
    // insert new tiles (existing ones are kept as they are), then link them all to the set
    const tiles = await c.query(
      `WITH input AS (
         SELECT * FROM unnest($2::text[], $3::text[], $4::int[], $5::text[]) AS i(sha256, content_type, bytes, s3_key))
       INSERT INTO tiles (user_id, sha256, content_type, bytes, s3_key)
       SELECT $1, sha256, content_type, bytes, s3_key FROM input
       ON CONFLICT (user_id, sha256) DO UPDATE SET sha256 = EXCLUDED.sha256
       RETURNING id, sha256, uploaded, s3_key, content_type, bytes`,
      [userId, list.map((t) => t.sha256), list.map((t) => t.type), list.map((t) => t.bytes),
        list.map((t) => keys.tile(userId, t.sha256))]);
    const bySha = new Map(tiles.rows.map((t) => [t.sha256, t]));
    await c.query(
      `INSERT INTO tile_set_tiles (tile_set_id, tile_id, name, position)
       SELECT $1, * FROM unnest($2::uuid[], $3::text[], $4::int[])`,
      [setId, list.map((t) => bySha.get(t.sha256).id), list.map((t) => t.name), list.map((_, i) => i)]);
    return { setId, pending: tiles.rows.filter((t) => !t.uploaded) };
  });

  const uploads = await mapLimit(pending, 32, async (t) => ({
    sha256: t.sha256, url: await uploadUrl(t.s3_key, t.content_type, t.bytes),
  }));
  res.status(201).json({ id: setId, tileCount: list.length, uploads });
});

// Check S3 for the files this set was waiting on and mark the ones that arrived.
r.post("/:id/complete", async (req, res) => {
  const set = await ownSet(req);
  const { rows } = await query(
    `SELECT t.id, t.s3_key, t.bytes FROM tile_set_tiles st JOIN tiles t ON t.id = st.tile_id
     WHERE st.tile_set_id = $1 AND NOT t.uploaded`, [set.id]);
  const arrived = (await mapLimit(rows, 16, async (t) => (await objectSize(t.s3_key)) === t.bytes ? t.id : null)).filter(Boolean);
  if (arrived.length) await query("UPDATE tiles SET uploaded = true WHERE id = ANY($1::uuid[])", [arrived]);
  res.json({ id: set.id, missing: rows.length - arrived.length });
});

// One set with a download URL for every tile, to load it back into the app.
r.get("/:id", async (req, res) => {
  const set = await ownSet(req);
  const { rows } = await query(
    `SELECT st.name, t.s3_key, t.content_type FROM tile_set_tiles st JOIN tiles t ON t.id = st.tile_id
     WHERE st.tile_set_id = $1 AND t.uploaded ORDER BY st.position`, [set.id]);
  res.json({
    id: set.id, name: set.name, createdAt: set.created_at,
    tiles: await mapLimit(rows, 32, async (t) => ({ name: t.name, contentType: t.content_type, url: await downloadUrl(t.s3_key) })),
  });
});

r.patch("/:id", async (req, res) => {
  const set = await ownSet(req);
  const name = cleanName(req.body?.name, set.name);
  await query("UPDATE tile_sets SET name = $2 WHERE id = $1", [set.id, name]);
  res.json({ id: set.id, name });
});

// Delete a set, and any of its tiles that no other set of yours still uses.
r.delete("/:id", async (req, res) => {
  const set = await ownSet(req);
  const orphans = await tx(async (c) => {
    const ids = (await c.query("SELECT tile_id FROM tile_set_tiles WHERE tile_set_id = $1", [set.id])).rows.map((x) => x.tile_id);
    await c.query("DELETE FROM tile_sets WHERE id = $1", [set.id]);
    const gone = await c.query(
      `DELETE FROM tiles t WHERE t.id = ANY($1::uuid[]) AND t.user_id = $2
         AND NOT EXISTS (SELECT 1 FROM tile_set_tiles st WHERE st.tile_id = t.id)
       RETURNING s3_key`, [ids, req.user.id]);
    return gone.rows.map((x) => x.s3_key);
  });
  await deleteObjects(orphans);
  res.status(204).end();
});

async function ownSet(req) {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Tile set not found.");
  const { rows } = await query("SELECT * FROM tile_sets WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  if (!rows.length) throw new HttpError(404, "Tile set not found.");
  return rows[0];
}

export default r;
