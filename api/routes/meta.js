import { Router } from 'express';
import pool from '../db.js';
import { audiences } from '../config/audiences.js';
import { brand } from '../config/brand.js';
import { sources } from '../config/sources.js';

const router = Router();

// Read-only config for the dashboard: audiences, offerings and sources live
// in api/config so they are versioned with the code that relies on them.
router.get('/config', (req, res) => {
  res.json({
    audiences,
    offerings: brand.offerings,
    brand: { name: brand.name, website: brand.website, proofPoints: brand.proofPoints },
    sources,
    llmConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  });
});

router.get('/jobs', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, type, status, detail, result, error, started_at, finished_at FROM jobs ORDER BY started_at DESC LIMIT 30',
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
