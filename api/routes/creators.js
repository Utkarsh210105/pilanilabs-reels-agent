import { Router } from 'express';
import pool from '../db.js';
import { startJob, runningJob } from '../lib/jobs.js';
import { scrapeCreator, reanalyzeReel } from '../pipeline/creatorReels.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, (SELECT count(*) FROM creator_reels r WHERE r.creator_id = c.id)::int AS reel_count,
         (SELECT count(*) FROM creator_reels r WHERE r.creator_id = c.id AND r.status = 'analyzed')::int AS analyzed_count
       FROM creators c ORDER BY c.created_at`,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Accepts "vaibhavsisinty", "@vaibhavsisinty" or a profile URL.
router.post('/', async (req, res, next) => {
  try {
    const raw = String(req.body?.handle || '').trim();
    const handle = raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0].toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(handle)) return res.status(400).json({ error: 'That is not a valid Instagram handle' });
    const audience = req.body?.audience === 'b2b' ? 'b2b' : 'b2c';
    const { rows } = await pool.query(
      `INSERT INTO creators (handle, audience, notes) VALUES ($1, $2, $3)
       ON CONFLICT (handle) DO UPDATE SET active = true, audience = EXCLUDED.audience RETURNING *`,
      [handle, audience, req.body?.notes || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM creators WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Scrape one creator now (Apify ~1-3 min, then transcribe + analyse the top reels).
router.post('/:id/scrape', async (req, res, next) => {
  try {
    const running = await runningJob('scrape_creator');
    if (running) return res.status(409).json({ error: 'A creator scrape is already running', job_id: running.id });
    const jobId = await startJob('scrape_creator', req.params.id, () => scrapeCreator(req.params.id));
    res.status(202).json({ job_id: jobId });
  } catch (err) { next(err); }
});

router.get('/scrape-status', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, status, detail, result, error, started_at, finished_at FROM jobs WHERE type = 'scrape_creator' ORDER BY started_at DESC LIMIT 1",
    );
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

// GET /api/creators/reels?creator=<id>&sort=views|outperform|recent
router.get('/reels', async (req, res, next) => {
  try {
    const params = [];
    let where = "r.status <> 'dismissed'";
    if (req.query.creator) {
      params.push(req.query.creator);
      where += ` AND r.creator_id = $${params.length}`;
    }
    const order = req.query.sort === 'outperform' ? 'r.outperform DESC NULLS LAST'
      : req.query.sort === 'recent' ? 'r.posted_at DESC NULLS LAST' : 'r.views DESC NULLS LAST';
    const { rows } = await pool.query(
      `SELECT r.*, c.handle FROM creator_reels r JOIN creators c ON c.id = r.creator_id
       WHERE ${where} ORDER BY (r.status IN ('analyzed', 'used')) DESC, ${order} LIMIT 200`,
      params,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/reels/:id/reanalyze', async (req, res, next) => {
  try {
    res.json(await reanalyzeReel(req.params.id));
  } catch (err) { next(err); }
});

router.post('/reels/:id/dismiss', async (req, res, next) => {
  try {
    await pool.query("UPDATE creator_reels SET status = 'dismissed' WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
