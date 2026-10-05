-- Leads from the ManyChat comment-to-DM loop. One row per person; one event
-- per keyword comment, so a person who comments on three reels is one lead
-- with three touches, each attributed to its reel.
CREATE TABLE leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manychat_id     text UNIQUE,
  ig_username     text,
  ig_id           text,
  name            text,
  followed        boolean,
  stage           text NOT NULL DEFAULT 'new'
                  CHECK (stage IN ('new', 'in_community', 'contacted', 'qualified', 'customer', 'lost')),
  notes           text,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_last_seen_idx ON leads (last_seen_at DESC);
CREATE UNIQUE INDEX leads_ig_username_idx ON leads (lower(ig_username)) WHERE ig_username IS NOT NULL;

CREATE TABLE lead_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  script_id   uuid REFERENCES scripts (id) ON DELETE SET NULL,
  keyword     text,
  comment     text,
  post_url    text,
  raw         jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_events_lead_idx ON lead_events (lead_id, created_at DESC);
CREATE INDEX lead_events_script_idx ON lead_events (script_id);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;

-- The posted reel's link, so a lead from that reel can be attributed to it.
ALTER TABLE scripts ADD COLUMN published_url text;
ALTER TABLE scripts ADD COLUMN published_at timestamptz;
