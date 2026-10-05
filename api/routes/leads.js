import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import pool from '../db.js';
import { recordLead } from '../pipeline/leads.js';
import { brand } from '../config/brand.js';

const router = Router();

function secretOk(req) {
  const expected = process.env.LEADS_WEBHOOK_SECRET;
  const given = String(req.get('x-webhook-secret') || req.query.key || '');
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// ManyChat → External Request (POST). Header: X-Webhook-Secret.
router.post('/manychat', async (req, res, next) => {
  try {
    if (!process.env.LEADS_WEBHOOK_SECRET) return res.status(503).json({ error: 'LEADS_WEBHOOK_SECRET is not set on the server' });
    if (!secretOk(req)) return res.status(401).json({ error: 'Wrong or missing webhook secret' });
    res.json(await recordLead(req.body || {}));
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let where = 'true';
    if (req.query.script) {
      params.push(req.query.script);
      where = `l.id IN (SELECT lead_id FROM lead_events WHERE script_id = $1)`;
    }
    const { rows } = await pool.query(
      `SELECT l.*,
         (SELECT count(*) FROM lead_events e WHERE e.lead_id = l.id)::int AS touches,
         (SELECT json_agg(json_build_object('script_id', e.script_id, 'title', s.title, 'at', e.created_at, 'comment', e.comment,
                   'attribution', e.raw->>'_attribution') ORDER BY e.created_at DESC)
          FROM lead_events e LEFT JOIN scripts s ON s.id = e.script_id WHERE e.lead_id = l.id) AS events
       FROM leads l WHERE ${where} ORDER BY l.last_seen_at DESC LIMIT 500`,
      params,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Totals and leads per reel, for the top of the Leads page.
router.get('/summary', async (req, res, next) => {
  try {
    const [{ rows: [t] }, { rows: perReel }] = await Promise.all([
      pool.query(`SELECT count(*)::int total,
          count(*) FILTER (WHERE first_seen_at > now() - interval '7 days')::int this_week,
          count(*) FILTER (WHERE followed)::int followed
        FROM leads`),
      pool.query(`SELECT s.id, s.title, s.audience, s.published_url, s.published_at, count(DISTINCT e.lead_id)::int AS leads
        FROM scripts s JOIN lead_events e ON e.script_id = s.id
        GROUP BY s.id ORDER BY leads DESC LIMIT 20`),
    ]);
    res.json({ ...t, per_reel: perReel, keyword: brand.engagement?.keyword, configured: Boolean(process.env.LEADS_WEBHOOK_SECRET) });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { stage, notes } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE leads SET stage = COALESCE($1, stage), notes = COALESCE($2, notes) WHERE id = $3 RETURNING *',
      [stage || null, notes ?? null, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Lead not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Setup details for the ManyChat External Request (shown on the Leads page).
router.get('/setup', (req, res) => {
  res.json({
    secret: process.env.LEADS_WEBHOOK_SECRET || null,
    public_url: process.env.PUBLIC_URL || null,
    path: '/api/leads/manychat',
    keyword: brand.engagement?.keyword,
  });
});

export default router;
