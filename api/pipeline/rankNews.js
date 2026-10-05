import pool from '../db.js';
import { chatJson, FAST_MODEL } from '../lib/llm.js';
import { audiences } from '../config/audiences.js';

const BATCH = 15;

function clampScore(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(10, Math.max(0, v)) : null;
}

// Scores every unscored article 0-10 for each audience and writes a one-line
// angle for each, so the dashboard can show "why this is a reel" at a glance.
export async function rankNews() {
  const { rows } = await pool.query(
    `SELECT id, source, title, summary FROM news_items
     WHERE status = 'new' ORDER BY published_at DESC NULLS LAST LIMIT 60`,
  );
  let scored = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const list = batch
      .map((r, n) => `[${n}] (${r.source}) ${r.title}\n${(r.summary || '').slice(0, 400)}`)
      .join('\n\n');

    const result = await chatJson({
      model: FAST_MODEL,
      temperature: 0.2,
      maxTokens: 3000,
      system: `You pick AI news stories for short vertical video reels for PilaniLabs, an Indian AI education company. Score each story 0-10 for two audiences:

b2b: ${audiences.b2b.listener}
b2c: ${audiences.b2c.listener}

Score high only if the story is real news about AI (a launch, a big move by a company or government, a finding, a risk) AND a 45-second reel about it would genuinely interest that audience. Score 0-2 for: war, military strikes, violence, deaths, disasters or partisan politics (an education brand should not build a reel on a tragedy, even if AI is involved), not about AI, opinion pieces with no news, funding rounds nobody outside tech cares about, deals, podcasts, product roundups, sponsored posts, and stories that would need a lot of background to explain. Consider India relevance a plus.

For each story also write the angle for each audience in one short line: what the reel would tell them.

Reply with JSON only: {"items": [{"i": 0, "b2b": 7, "b2c": 4, "b2b_angle": "...", "b2c_angle": "...", "reason": "one short line"}]}`,
      user: list,
    });

    const items = Array.isArray(result?.items) ? result.items : [];
    for (const it of items) {
      const row = batch[it.i];
      if (!row) continue;
      await pool.query(
        `UPDATE news_items SET b2b_score = $1, b2c_score = $2, b2b_angle = $3, b2c_angle = $4,
           rank_reason = $5, status = 'scored' WHERE id = $6 AND status = 'new'`,
        [clampScore(it.b2b), clampScore(it.b2c), it.b2b_angle || null, it.b2c_angle || null, it.reason || null, row.id],
      );
      scored += 1;
    }
  }

  return { scored, considered: rows.length };
}
