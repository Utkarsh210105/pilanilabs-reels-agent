-- Instagram Insights, synced from the API every few hours. One row per post
-- (reels and feed posts, including ones posted outside the dashboard), linked
-- to its script when it was made by the agent.
CREATE TABLE ig_media (
  id              text PRIMARY KEY,
  media_type      text,
  product_type    text,
  permalink       text,
  caption         text,
  posted_at       timestamptz,
  thumbnail_url   text,
  views           integer,
  reach           integer,
  likes           integer,
  comments        integer,
  shares          integer,
  saved           integer,
  interactions    integer,
  avg_watch_ms    integer,
  total_watch_ms  bigint,
  script_id       uuid REFERENCES scripts (id) ON DELETE SET NULL,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ig_media_posted_idx ON ig_media (posted_at DESC);

-- Follower count once a day, for growth over time.
CREATE TABLE ig_account_daily (
  day          date PRIMARY KEY,
  followers    integer,
  media_count  integer,
  synced_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ig_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_account_daily ENABLE ROW LEVEL SECURITY;
