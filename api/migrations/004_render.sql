-- Phase 2b: the HeyGen avatar video uploaded for a script, the word timings
-- worked out from it, and the assembled reel. Paths are relative to MEDIA_DIR.
--
-- timings: { "duration": 57.3, "match_ratio": 0.93,
--            "words": [{ "w": "OpenAI", "start": 0.12, "end": 0.48, "seg": 0 }],
--            "segments": [{ "start": 0.12, "end": 4.9 }] }
ALTER TABLE scripts
  ADD COLUMN avatar_video text,
  ADD COLUMN avatar_uploaded_at timestamptz,
  ADD COLUMN timings jsonb,
  ADD COLUMN final_video text,
  ADD COLUMN rendered_at timestamptz;
