-- Reels agent schema. Unlike the Namhya engine, migrations are tracked in git
-- and applied by scripts/migrate.js, so the schema never lives only on one laptop.
-- gen_random_uuid() is built in since Postgres 13 (Supabase runs 15+).

-- One row per article pulled from an RSS source. Scored separately for each
-- audience, since a story that matters to a CXO (a model's enterprise pricing)
-- is often not the one that matters to a student (a free tool they can use today).
CREATE TABLE news_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url           text NOT NULL UNIQUE,
  source        text NOT NULL,
  title         text NOT NULL,
  summary       text,
  content       text,
  published_at  timestamptz,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  b2b_score     smallint,
  b2c_score     smallint,
  b2b_angle     text,
  b2c_angle     text,
  rank_reason   text,
  status        text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'scored', 'used', 'dismissed'))
);
CREATE INDEX news_items_published_idx ON news_items (published_at DESC);
CREATE INDEX news_items_status_idx ON news_items (status);

-- A reel script. The spoken script is stored as ordered segments (not one
-- markdown blob), because Phase 2 cuts B-roll in and out at segment
-- boundaries and needs each line's visual plan attached to it.
--
-- segments: [{ "text": "...", "visual": "avatar" | "broll",
--              "broll_query": "...", "on_screen_text": "..." }]
-- flags:    [{ "code": "...", "severity": "error" | "warn", "message": "...", "segment": 2 }]
-- claims:   [{ "claim": "...", "supported": true | false, "evidence": "..." }]
CREATE TABLE scripts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience        text NOT NULL CHECK (audience IN ('b2b', 'b2c')),
  series          text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('news', 'promo', 'custom')),
  news_item_id    uuid REFERENCES news_items (id) ON DELETE SET NULL,
  offering        text,
  brief           text,
  title           text NOT NULL,
  segments        jsonb NOT NULL DEFAULT '[]',
  caption         text,
  hashtags        text[] NOT NULL DEFAULT '{}',
  flags           jsonb NOT NULL DEFAULT '[]',
  claims          jsonb NOT NULL DEFAULT '[]',
  word_count      integer NOT NULL DEFAULT 0,
  est_seconds     integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'approved', 'rejected', 'rendered', 'published')),
  review_notes    text,
  model           text,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz
);
CREATE INDEX scripts_status_idx ON scripts (status, created_at DESC);
CREATE INDEX scripts_news_item_idx ON scripts (news_item_id);

-- Every edit or rewrite keeps the previous version, so a regenerate never
-- loses a line the reviewer liked.
CREATE TABLE script_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id   uuid NOT NULL REFERENCES scripts (id) ON DELETE CASCADE,
  version     integer NOT NULL,
  title       text NOT NULL,
  segments    jsonb NOT NULL,
  caption     text,
  hashtags    text[] NOT NULL DEFAULT '{}',
  reason      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (script_id, version)
);

-- Background runs (daily news, script generation), so the dashboard can show
-- what ran, what failed and why.
CREATE TABLE jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL,
  status       text NOT NULL DEFAULT 'running'
               CHECK (status IN ('running', 'completed', 'failed')),
  detail       text,
  result       jsonb,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX jobs_started_idx ON jobs (started_at DESC);
