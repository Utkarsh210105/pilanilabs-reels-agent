import pool from '../db.js';
import { ingestNews } from './ingestNews.js';
import { rankNews } from './rankNews.js';
import { createScript } from './generateScript.js';

// How many news reels to draft per audience each morning. B2C grows on
// volume; B2B on consistency, so the defaults differ.
const DAILY_DRAFTS = {
  b2b: Number(process.env.DAILY_B2B_DRAFTS ?? 1),
  b2c: Number(process.env.DAILY_B2C_DRAFTS ?? 2),
};
const MIN_SCORE = Number(process.env.MIN_NEWS_SCORE ?? 7);

// Fetch news, score it, then draft scripts for the best unused stories. A
// story drafted for one audience is marked used, so the two audiences never
// get the same story on the same morning (and the shared feed never shows
// the same news twice in a row).
export async function dailyRun() {
  const ingest = await ingestNews();
  const rank = await rankNews();
  const drafted = [];
  const errors = [];

  for (const audience of ['b2b', 'b2c']) {
    const scoreCol = audience === 'b2b' ? 'b2b_score' : 'b2c_score';
    const { rows } = await pool.query(
      `SELECT id, title FROM news_items
       WHERE status = 'scored' AND ${scoreCol} >= $1
         AND (published_at IS NULL OR published_at > now() - interval '48 hours')
         -- Headline-only stories leave the writer guessing and the fact check
         -- with nothing to check against; they can still be drafted by hand.
         AND length(coalesce(content, '')) >= 800
       ORDER BY ${scoreCol} DESC, published_at DESC NULLS LAST
       LIMIT $2`,
      [MIN_SCORE, DAILY_DRAFTS[audience]],
    );
    for (const item of rows) {
      try {
        const script = await createScript({ audience, kind: 'news', news_item_id: item.id });
        drafted.push({ audience, script_id: script.id, title: script.title });
      } catch (err) {
        errors.push({ audience, news_item: item.title, error: err.message });
      }
    }
  }

  return { ingest, rank, drafted, errors };
}
