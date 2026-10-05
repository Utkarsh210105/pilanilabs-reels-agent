-- Scripts can belong to a track (api/config/tracks.js), e.g. 'first-job'.
ALTER TABLE scripts ADD COLUMN track text;
CREATE INDEX scripts_track_idx ON scripts (track, created_at DESC);
