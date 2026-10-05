import { Router } from 'express';
import pool from '../db.js';
import { startJob, runningJob } from '../lib/jobs.js';
import { dailyRun } from '../pipeline/dailyRun.js';

const router = Router();

// GET /api/news?status=scored&audience=b2c&days=3
router.get('/', async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 3, 30);
    const params = [days];
    let where = "fetched_at > now() - make_interval(days => $1)";
    if (req.query.status) {
      params.push(req.query.status);
      where += ` AND status = $${params.length}`;
    } else {
      where += " AND status <> 'dismissed'";
    }
    const order = req.query.audience === 'b2c' ? 'b2c_score' : req.query.audience === 'b2b' ? 'b2b_score' : 'GREATEST(b2b_score, b2c_score)';
    const { rows } = await pool.query(
      `SELECT id, url, source, title, summary, published_at, fetched_at, b2b_score, b2c_score,
         b2b_angle, b2c_angle, rank_reason, status, length(content) AS content_length
       FROM news_items WHERE ${where}
       ORDER BY ${order} DESC NULLS LAST, published_at DESC NULLS LAST LIMIT 200`,
      params,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/:id/dismiss', async (req, res, next) => {
  try {
    await pool.query("UPDATE news_items SET status = 'dismissed' WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// "Sync news" in the dashboard: the same run as 6am (fetch, score, draft the
// top stories), on demand. Only one runs at a time; a second press while one
// is running gets that job back so the dashboard can follow it.
router.post('/sync', async (req, res, next) => {
  try {
    const running = await runningJob('daily_run');
    if (running) return res.status(409).json({ error: 'A sync is already running', job_id: running.id });
    const jobId = await startJob('daily_run', 'manual sync', () => dailyRun());
    res.status(202).json({ job_id: jobId });
  } catch (err) { next(err); }
});

// Latest sync (running or finished), for the sidebar status line.
router.get('/sync', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, status, detail, result, error, started_at, finished_at FROM jobs
       WHERE type = 'daily_run' ORDER BY started_at DESC LIMIT 1`,
    );
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

export default router;
