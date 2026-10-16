-- Posting reels to Instagram from the dashboard (Instagram Content Publishing
-- API). A script can be posted now or scheduled; the agent records what was
-- posted and the resulting link.
ALTER TABLE scripts
  ADD COLUMN publish_status text CHECK (publish_status IN ('scheduled', 'publishing', 'posted', 'failed')),
  ADD COLUMN publish_at timestamptz,
  ADD COLUMN publish_caption text,
  ADD COLUMN publish_cover_ms integer,
  ADD COLUMN publish_error text,
  ADD COLUMN ig_media_id text;
CREATE INDEX scripts_publish_due_idx ON scripts (publish_at) WHERE publish_status = 'scheduled';

-- Small key/value store for settings the agent changes itself, e.g. the
-- Instagram token, which is refreshed every few weeks (so it cannot live
-- only in .env).
CREATE TABLE app_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
