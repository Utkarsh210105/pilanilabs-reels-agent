-- B-roll picks per segment, keyed by segment index ("0", "3", ...):
-- { "query": "...", "text": "...", "status": "picked" | "none",
--   "clip": { source, id, page_url, video_url, preview_url, width, height, duration, credit },
--   "candidates": [clip, ...], "reason": "...", "picked_at": "..." }
-- "query" and "text" record what the pick was made for, so an edit to the
-- line shows the pick as stale instead of silently keeping a mismatched clip.
ALTER TABLE scripts ADD COLUMN broll jsonb NOT NULL DEFAULT '{}';
