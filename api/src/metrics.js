import { Router } from "express";
import config from "./config.js";
import { HttpError, identify, requireUser, userId } from "./auth.js";
import { query } from "./db.js";

// Simple usage metrics: events recorded as things happen, read back as daily counts.
// Everyone sees their own numbers in their library; only admins see everyone's.

export const record = (kind, userId, n = 1) =>
  query("INSERT INTO events (kind, user_id, n) VALUES ($1, $2, $3)", [kind, userId, n])
    .catch((e) => console.warn(`couldn't record ${kind}:`, e.message)); // metrics never break a request

const isAdmin = (user) => !!user && config.admin.subs.includes(user.sub);
const RANGES = new Set([7, 30, 90]);
const VISIT_GAP = "30 minutes"; // reloads within this count as one visit

// daily totals of one event kind over the last `days` days (UTC), optionally for one user
async function daily(kind, days, user = null) {
  const { rows } = await query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day, coalesce(sum(e.n), 0)::int AS n
     FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d
     LEFT JOIN events e ON e.kind = $2 AND e.at >= d AND e.at < d + interval '1 day'
       AND ($3::uuid IS NULL OR e.user_id = $3)
     GROUP BY d ORDER BY d`, [days, kind, user]);
  return rows;
}

async function totals(user = null) {
  const { rows } = await query(
    `SELECT kind, coalesce(sum(n), 0)::int AS n FROM events
     WHERE $1::uuid IS NULL OR user_id = $1 GROUP BY kind`, [user]);
  const by = Object.fromEntries(rows.map((r) => [r.kind, r.n]));
  return { tileSets: by.tile_set_created ?? 0, mosaics: by.mosaic_created ?? 0, images: by.images_added ?? 0, visits: by.visit ?? 0 };
}

const rangeOf = (req) => {
  const days = Number(req.query.days ?? 30);
  if (!RANGES.has(days)) throw new HttpError(400, "days must be 7, 30 or 90.");
  return days;
};

const router = Router();

// A page view. Works signed in or not; the visitor id is a random value from the browser.
router.post("/visits", async (req, res) => {
  const visitor = String(req.body?.visitor || "");
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(visitor)) throw new HttpError(400, "Missing visitor id.");
  const who = await identify(req.get("authorization"));
  const user = who ? await userId(who) : null;
  await query(
    `INSERT INTO events (kind, user_id, visitor)
     SELECT 'visit', $1, $2
     WHERE NOT EXISTS (SELECT 1 FROM events WHERE kind = 'visit' AND visitor = $2 AND at > now() - interval '${VISIT_GAP}')`,
    [user, visitor]);
  res.status(204).end();
});

// who am I, and may I see the admin panel
router.get("/me", requireUser, (req, res) => res.json({ ...req.user, isAdmin: isAdmin(req.user) }));

// the signed-in user's own numbers, for their library
router.get("/stats/me", requireUser, async (req, res) => {
  const days = rangeOf(req), me = req.user.id;
  const [all, tileSets, mosaics, images, visits] = await Promise.all([
    totals(me), daily("tile_set_created", days, me), daily("mosaic_created", days, me),
    daily("images_added", days, me), daily("visit", days, me),
  ]);
  res.json({ days, totals: all, series: { tileSets, mosaics, images, visits } });
});

// everyone's numbers; admins only (anyone else gets a plain 404)
router.get("/admin/stats", requireUser, async (req, res) => {
  if (!isAdmin(req.user)) throw new HttpError(404, "Not found.");
  const days = rangeOf(req);
  const [all, people, tileSets, mosaics, images, visits, newUsers] = await Promise.all([
    totals(),
    query(`SELECT (SELECT count(*) FROM users)::int AS users,
                  (SELECT count(DISTINCT visitor) FROM events WHERE kind = 'visit')::int AS visitors`),
    daily("tile_set_created", days), daily("mosaic_created", days), daily("images_added", days), daily("visit", days),
    query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day, count(u.id)::int AS n
       FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d
       LEFT JOIN users u ON u.created_at >= d AND u.created_at < d + interval '1 day'
       GROUP BY d ORDER BY d`, [days]),
  ]);
  res.json({
    days,
    totals: { ...all, ...people.rows[0] },
    series: { tileSets, mosaics, images, visits, newUsers: newUsers.rows },
  });
});

export default router;
