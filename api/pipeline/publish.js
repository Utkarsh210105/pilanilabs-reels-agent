import path from 'path';
import pool from '../db.js';
import { publishReel } from '../lib/instagram.js';
import { getScript } from './generateScript.js';
import { MEDIA_DIR } from './renderReel.js';

const MAX_CAPTION = 2200;
const MAX_HASHTAGS = 5;

// The caption as it will be posted: the script's caption plus its hashtags.
export function defaultCaption(script) {
  const tags = (script.hashtags || []).slice(0, MAX_HASHTAGS).map((h) => `#${h}`).join(' ');
  return [script.caption || '', tags].filter(Boolean).join('\n\n');
}

export function validateCaption(caption) {
  const text = String(caption || '').trim();
  if (!text) return 'Caption is empty.';
  if (text.length > MAX_CAPTION) return `Caption is ${text.length} characters; Instagram allows ${MAX_CAPTION}.`;
  const tags = text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || [];
  if (tags.length > MAX_HASHTAGS) return `Caption has ${tags.length} hashtags; Instagram allows ${MAX_HASHTAGS}.`;
  return null;
}

// Saves what to post and when. Publishing itself happens in publishNow,
// either right away (route) or when the scheduler finds it due.
export async function queuePublish(id, { caption, coverMs, publishAt }) {
  const script = await getScript(id);
  if (!script.final_video) throw Object.assign(new Error('Render the reel before posting it.'), { status: 400 });
  if (script.status === 'published' || script.publish_status === 'posted') throw Object.assign(new Error('This reel is already posted.'), { status: 409 });
  if (script.publish_status === 'publishing') throw Object.assign(new Error('This reel is being posted right now.'), { status: 409 });
  const text = (caption ?? defaultCaption(script)).trim();
  const problem = validateCaption(text);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
  const when = publishAt ? new Date(publishAt) : null;
  if (when && Number.isNaN(when.getTime())) throw Object.assign(new Error('Invalid schedule time.'), { status: 400 });

  const { rows } = await pool.query(
    `UPDATE scripts SET publish_status = $1, publish_at = $2, publish_caption = $3, publish_cover_ms = $4,
       publish_error = NULL, updated_at = now() WHERE id = $5 RETURNING *`,
    [when && when > new Date() ? 'scheduled' : 'publishing', when, text, Number.isFinite(coverMs) ? Math.round(coverMs) : null, id],
  );
  return rows[0];
}

export async function cancelScheduled(id) {
  const { rows } = await pool.query(
    "UPDATE scripts SET publish_status = NULL, publish_at = NULL, updated_at = now() WHERE id = $1 AND publish_status = 'scheduled' RETURNING *",
    [id],
  );
  if (!rows[0]) throw Object.assign(new Error('Nothing scheduled for this reel.'), { status: 400 });
  return rows[0];
}

export async function publishNow(id) {
  const { rows: [s] } = await pool.query(
    "UPDATE scripts SET publish_status = 'publishing', updated_at = now() WHERE id = $1 AND publish_status IN ('publishing', 'scheduled') RETURNING *",
    [id],
  );
  if (!s) throw new Error('This reel is not queued for posting.');
  try {
    const r = await publishReel({ file: path.join(MEDIA_DIR, s.final_video), caption: s.publish_caption, coverMs: s.publish_cover_ms });
    await pool.query(
      `UPDATE scripts SET publish_status = 'posted', ig_media_id = $1, published_url = COALESCE($2, published_url),
         published_at = now(), status = 'published', updated_at = now() WHERE id = $3`,
      [r.mediaId, r.permalink, id],
    );
    return r;
  } catch (err) {
    await pool.query("UPDATE scripts SET publish_status = 'failed', publish_error = $1, updated_at = now() WHERE id = $2", [err.message.slice(0, 500), id]);
    throw err;
  }
}

// Called every minute by the scheduler: posts what is due, oldest first,
// one at a time.
export async function publishDue() {
  const { rows } = await pool.query(
    "SELECT id FROM scripts WHERE publish_status = 'scheduled' AND publish_at <= now() ORDER BY publish_at LIMIT 3",
  );
  const done = [];
  for (const r of rows) {
    try { done.push({ id: r.id, ...(await publishNow(r.id)) }); } catch (err) { done.push({ id: r.id, error: err.message }); }
  }
  return done;
}
