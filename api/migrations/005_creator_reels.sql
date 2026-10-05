-- Creators whose Instagram reels the agent studies (Namhya engine pattern:
-- scrape, find the outperformers, learn why they work, write our own).
CREATE TABLE creators (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle          text NOT NULL UNIQUE,
  audience        text NOT NULL DEFAULT 'b2c' CHECK (audience IN ('b2b', 'b2c')),
  notes           text,
  active          boolean NOT NULL DEFAULT true,
  median_views    bigint,
  last_scraped_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per reel. `outperform` is views ÷ the creator's median views, so a
-- reel doing 5x their usual is visible even for a creator whose every reel
-- gets big numbers. `analysis` is Claude's breakdown of why it works:
-- { hook_line, hook_device, topic, angle, beats: [...], why_it_works, cta, best_for }
CREATE TABLE creator_reels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    uuid NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
  short_code    text NOT NULL UNIQUE,
  url           text NOT NULL,
  caption       text,
  views         bigint,
  likes         bigint,
  comments      bigint,
  duration      real,
  posted_at     timestamptz,
  thumbnail     text,
  outperform    real,
  transcript    text,
  language      text,
  analysis      jsonb,
  status        text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'analyzed', 'failed', 'used', 'dismissed')),
  error         text,
  scraped_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creator_reels_creator_idx ON creator_reels (creator_id, views DESC);

ALTER TABLE creator_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;

-- Scripts can now be "inspired" by a creator reel.
ALTER TABLE scripts DROP CONSTRAINT scripts_kind_check;
ALTER TABLE scripts ADD CONSTRAINT scripts_kind_check CHECK (kind IN ('news', 'promo', 'custom', 'inspired'));
ALTER TABLE scripts ADD COLUMN source_reel_id uuid REFERENCES creator_reels (id) ON DELETE SET NULL;
