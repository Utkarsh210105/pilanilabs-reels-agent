import { Router } from 'express';
import pool from '../db.js';
import { runJob, startJob } from '../lib/jobs.js';
import { matchBrollForScript, chooseBroll, searchBroll } from '../pipeline/matchBroll.js';
import { renderReel, MEDIA_DIR } from '../pipeline/renderReel.js';
import { probe } from '../lib/ffmpeg.js';
import { createWriteStream } from 'fs';
import { mkdir, rename, rm } from 'fs/promises';
import { pipeline } from 'stream/promises';
import path from 'path';

const MAX_UPLOAD_BYTES = 1024 ** 3;
import {
  createScript, getScript, rewriteScript, updateScript, recheckScript, setStatus,
} from '../pipeline/generateScript.js';
import { heygenPlainText, heygenDevanagariText } from '../pipeline/heygenText.js';

const router = Router();

// GET /api/scripts?status=draft&audience=b2c
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    const where = [];
    for (const key of ['status', 'audience', 'kind']) {
      if (req.query[key]) {
        params.push(req.query[key]);
        where.push(`s.${key} = $${params.length}`);
      }
    }
    const { rows } = await pool.query(
      `SELECT s.id, s.audience, s.series, s.kind, s.title, s.status, s.word_count, s.est_seconds, s.version,
         s.created_at, s.updated_at, s.approved_at,
         jsonb_array_length(s.segments) AS segment_count,
         (SELECT count(*) FROM jsonb_array_elements(s.flags) f WHERE f->>'severity' = 'error')::int AS error_count,
         (SELECT count(*) FROM jsonb_array_elements(s.flags) f WHERE f->>'severity' = 'warn')::int AS warn_count,
         n.title AS news_title, n.source AS news_source
       FROM scripts s LEFT JOIN news_items n ON n.id = s.news_item_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY s.created_at DESC LIMIT 200`,
      params,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/scripts/broll-search?q=... for the Swap panel.
router.get('/broll-search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'q is required' });
    res.json(await searchBroll(q));
  } catch (err) { next(err); }
});

router.get('/counts', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT status, audience, count(*)::int AS n FROM scripts GROUP BY status, audience');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const script = await getScript(req.params.id);
    const [{ rows: news }, { rows: versions }, { rows: reel }] = await Promise.all([
      pool.query('SELECT id, url, source, title, summary, published_at, b2b_angle, b2c_angle FROM news_items WHERE id = $1', [script.news_item_id]),
      pool.query('SELECT version, reason, created_at FROM script_versions WHERE script_id = $1 ORDER BY version DESC', [script.id]),
      pool.query(
        `SELECT r.id, r.url, r.views, r.outperform, r.thumbnail, r.transcript, r.analysis, c.handle
         FROM creator_reels r JOIN creators c ON c.id = r.creator_id WHERE r.id = $1`,
        [script.source_reel_id],
      ),
    ]);
    const { rows: [lc] } = await pool.query('SELECT count(DISTINCT lead_id)::int AS n FROM lead_events WHERE script_id = $1', [script.id]);
    res.json({ ...script, news: news[0] || null, versions, source_reel: reel[0] || null, lead_count: lc.n });
  } catch (err) { next(err); }
});

router.get('/:id/versions/:version', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM script_versions WHERE script_id = $1 AND version = $2',
      [req.params.id, Number(req.params.version)],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Generation takes 20-60s (draft, fact check, maybe one redo). The request
// waits for it, and it is also recorded as a job so a failure is visible.
router.post('/', async (req, res, next) => {
  try {
    const { audience, kind, news_item_id, offering, brief, source_reel_id } = req.body || {};
    const script = await runJob('generate_script', `${audience} ${kind}`, () =>
      createScript({ audience, kind, news_item_id, offering, brief, source_reel_id }));
    res.status(201).json(script);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    res.json(await updateScript(req.params.id, req.body || {}));
  } catch (err) { next(err); }
});

router.post('/:id/rewrite', async (req, res, next) => {
  try {
    const script = await runJob('rewrite_script', req.params.id, () => rewriteScript(req.params.id, req.body?.feedback));
    res.json(script);
  } catch (err) { next(err); }
});

router.post('/:id/recheck', async (req, res, next) => {
  try {
    res.json(await recheckScript(req.params.id));
  } catch (err) { next(err); }
});

router.post('/:id/status', async (req, res, next) => {
  try {
    const script = await setStatus(req.params.id, req.body || {});
    // B-roll is picked as soon as a script is approved, so the clips are
    // ready by the time the HeyGen video comes back.
    if (script.status === 'approved' && process.env.PEXELS_API_KEY) {
      await startJob('match_broll', script.id, () => matchBrollForScript(script.id).then((r) => r.results));
    }
    res.json(script);
  } catch (err) { next(err); }
});

// Finds B-roll for every B-roll segment (~5s per segment). force: re-pick all.
router.post('/:id/broll', async (req, res, next) => {
  try {
    const { script } = await runJob('match_broll', req.params.id, () => matchBrollForScript(req.params.id, { force: !!req.body?.force }));
    res.json(script);
  } catch (err) { next(err); }
});

// Upload the HeyGen video (raw request body, any video/* type), then render
// the reel in the background. The dashboard follows GET /:id/render.
router.put('/:id/avatar-video', async (req, res, next) => {
  const tmp = path.join(MEDIA_DIR, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  try {
    const script = await getScript(req.params.id);
    if (!['approved', 'rendered'].includes(script.status)) {
      return res.status(400).json({ error: 'Approve the script before uploading its video' });
    }
    if (Number(req.headers['content-length'] || 0) > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: 'Video is larger than 1 GB' });
    }
    await mkdir(path.join(MEDIA_DIR, script.id), { recursive: true });
    await pipeline(req, createWriteStream(tmp));

    const info = await probe(tmp).catch(() => null);
    if (!info?.hasVideo || !info.hasAudio || info.duration < 3) {
      await rm(tmp, { force: true });
      return res.status(400).json({ error: 'That file is not a video with sound. Upload the MP4 downloaded from HeyGen.' });
    }
    const rel = `${script.id}/avatar-${Date.now()}.mp4`;
    await rename(tmp, path.join(MEDIA_DIR, rel));
    await pool.query('UPDATE scripts SET avatar_video = $1, avatar_uploaded_at = now(), updated_at = now() WHERE id = $2', [rel, script.id]);
    if (script.avatar_video) await rm(path.join(MEDIA_DIR, script.avatar_video), { force: true }).catch(() => {});

    const jobId = await startRender(script.id);
    res.status(202).json({ job_id: jobId, duration: info.duration, width: info.width, height: info.height });
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    next(err);
  }
});

async function startRender(scriptId) {
  const running = await pool.query(
    "SELECT id FROM jobs WHERE type = 'render_reel' AND detail = $1 AND status = 'running' AND started_at > now() - interval '20 minutes'",
    [scriptId],
  );
  if (running.rows[0]) return running.rows[0].id;
  return startJob('render_reel', scriptId, (jobId) => renderReel(scriptId, jobId));
}

// Re-render (after swapping a clip, or if a render failed).
router.post('/:id/render', async (req, res, next) => {
  try {
    const script = await getScript(req.params.id);
    if (!script.avatar_video) return res.status(400).json({ error: 'Upload the HeyGen video first' });
    res.status(202).json({ job_id: await startRender(script.id) });
  } catch (err) { next(err); }
});

// Latest render job for this script, for the dashboard's progress line.
router.get('/:id/render', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, status, result, error, started_at, finished_at FROM jobs
       WHERE type = 'render_reel' AND detail = $1 ORDER BY started_at DESC LIMIT 1`,
      [req.params.id],
    );
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

// The finished reel as a download (a cross-origin <a download> would just
// open it in a new tab).
router.get('/:id/final.mp4', async (req, res, next) => {
  try {
    const script = await getScript(req.params.id);
    if (!script.final_video) return res.status(404).json({ error: 'No rendered reel yet' });
    const name = `${script.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'reel'}.mp4`;
    res.download(path.join(MEDIA_DIR, script.final_video), name);
  } catch (err) { next(err); }
});

// Reviewer swaps the clip for one segment.
router.put('/:id/broll/:segment', async (req, res, next) => {
  try {
    const clip = req.body?.clip;
    if (!clip?.id || !clip?.video_url) return res.status(400).json({ error: 'clip is required' });
    res.json(await chooseBroll(req.params.id, Number(req.params.segment), clip));
  } catch (err) { next(err); }
});

// GET /api/scripts/:id/heygen?script=devanagari
router.get('/:id/heygen', async (req, res, next) => {
  try {
    const script = await getScript(req.params.id);
    const text = req.query.script === 'devanagari'
      ? await heygenDevanagariText(script)
      : heygenPlainText(script.segments);
    res.json({ text });
  } catch (err) { next(err); }
});

export default router;
