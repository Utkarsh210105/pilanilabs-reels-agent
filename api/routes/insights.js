import { Router } from 'express';
import { startJob, runningJob } from '../lib/jobs.js';
import { syncInsights, insightsSummary } from '../pipeline/insights.js';
import pool from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const summary = await insightsSummary();
    const running = await runningJob('sync_insights');
    res.json({ ...summary, syncing: Boolean(running) });
  } catch (err) { next(err); }
});

// Refresh from Instagram now (takes ~10-30s for a few dozen posts).
router.post('/sync', async (req, res, next) => {
  try {
    const running = await runningJob('sync_insights');
    if (running) return res.status(202).json({ job_id: running.id, already: true });
    res.status(202).json({ job_id: await startJob('sync_insights', 'manual', () => syncInsights()) });
  } catch (err) { next(err); }
});

// Link a post to the script that made it (for reels posted before the
// dashboard could post, or posted by hand). { script_id } or null to unlink.
router.patch('/media/:id', async (req, res, next) => {
  try {
    const scriptId = req.body?.script_id || null;
    const { rows: [m] } = await pool.query('SELECT id, permalink, posted_at FROM ig_media WHERE id = $1', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Post not found; refresh Insights first' });
    await pool.query('UPDATE scripts SET ig_media_id = NULL WHERE ig_media_id = $1', [m.id]);
    await pool.query('UPDATE ig_media SET script_id = $1 WHERE id = $2', [scriptId, m.id]);
    if (scriptId) {
      await pool.query(
        `UPDATE scripts SET ig_media_id = $1, published_url = $2, published_at = COALESCE(published_at, $3),
           status = CASE WHEN status IN ('approved', 'rendered') THEN 'published' ELSE status END, updated_at = now()
         WHERE id = $4`,
        [m.id, m.permalink, m.posted_at, scriptId],
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Scripts that can be linked to a post: made into a reel, not linked yet.
router.get('/linkable-scripts', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, audience, track, status FROM scripts
       WHERE status IN ('approved', 'rendered', 'published') AND ig_media_id IS NULL
       ORDER BY updated_at DESC LIMIT 50`,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
