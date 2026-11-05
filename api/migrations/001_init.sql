-- Users come from Cognito; `sub` is Cognito's stable user id.
CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub          text NOT NULL UNIQUE,
  email        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- One row per distinct image a user has uploaded, keyed by content hash, so the
-- same sprite saved in several tile sets is stored once.
CREATE TABLE tiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  content_type text NOT NULL,
  bytes        integer NOT NULL CHECK (bytes > 0),
  s3_key       text NOT NULL,
  uploaded     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sha256)
);

CREATE TABLE tile_sets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  tile_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tile_sets_user_created ON tile_sets (user_id, created_at DESC);

-- Membership, with the file's name inside that set.
CREATE TABLE tile_set_tiles (
  tile_set_id uuid NOT NULL REFERENCES tile_sets(id) ON DELETE CASCADE,
  tile_id     uuid NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    integer NOT NULL,
  PRIMARY KEY (tile_set_id, tile_id)
);
CREATE INDEX tile_set_tiles_tile ON tile_set_tiles (tile_id);

CREATE TABLE mosaics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  target_name text,
  tile_set_id uuid REFERENCES tile_sets(id) ON DELETE SET NULL,
  width       integer NOT NULL,
  height      integer NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}',
  bytes       bigint NOT NULL,
  thumb_bytes integer NOT NULL,
  s3_key      text NOT NULL,
  thumb_key   text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mosaics_user_created ON mosaics (user_id, created_at DESC);
