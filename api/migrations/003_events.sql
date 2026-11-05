-- Activity history for the admin panel and each user's own stats. Kept separately from
-- the library tables so deleting a tile set or mosaic doesn't erase that it was made.
CREATE TABLE events (
  id      bigserial PRIMARY KEY,
  kind    text NOT NULL CHECK (kind IN ('visit', 'tile_set_created', 'mosaic_created', 'images_added')),
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  visitor text,                         -- random id kept by the browser, to count unique visitors
  n       integer NOT NULL DEFAULT 1,   -- images_added: how many new images
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_kind_at ON events (kind, at);
CREATE INDEX events_user_kind_at ON events (user_id, kind, at);
CREATE INDEX events_visitor_at ON events (visitor, at) WHERE kind = 'visit';

-- what already happened before events were recorded
INSERT INTO events (kind, user_id, at) SELECT 'tile_set_created', user_id, created_at FROM tile_sets;
INSERT INTO events (kind, user_id, at) SELECT 'mosaic_created', user_id, created_at FROM mosaics WHERE status = 'ready';
INSERT INTO events (kind, user_id, n, at)
  SELECT 'images_added', user_id, count(*), min(created_at) FROM tiles WHERE uploaded
  GROUP BY user_id, date_trunc('day', created_at);
