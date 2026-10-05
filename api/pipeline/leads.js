import pool from '../db.js';

// ManyChat's External Request can send our own JSON fields and/or "Full
// Contact Data", whose exact nesting has varied; look keys up anywhere.
function findKey(obj, keys, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '' && typeof v !== 'object') return v;
  }
  for (const v of Object.values(obj)) {
    const found = findKey(v, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

// ManyChat leaves unfilled placeholders like "{{ig_username}}" as literal text.
const clean = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return !s || /^\{\{.*\}\}$/.test(s) ? null : s;
};

const truthy = (v) => (v === undefined || v === null ? null : /^(true|1|yes)$/i.test(String(v)));

export function parseManychat(body) {
  return {
    manychat_id: clean(findKey(body, ['manychat_id', 'subscriber_id', 'contact_id', 'id'])),
    ig_username: clean(findKey(body, ['ig_username', 'instagram_username', 'username']))?.replace(/^@/, '') || null,
    ig_id: clean(findKey(body, ['ig_id', 'instagram_id'])),
    name: clean(findKey(body, ['name', 'full_name', 'first_name'])),
    keyword: clean(findKey(body, ['keyword'])),
    comment: clean(findKey(body, ['comment', 'last_input_text', 'last_text_input'])),
    post_url: clean(findKey(body, ['post_url', 'media_url', 'post_link', 'permalink'])),
    followed: truthy(findKey(body, ['followed', 'is_follower', 'follows'])),
  };
}

const shortCode = (url) => String(url || '').match(/instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/)?.[1] || null;

// Which of our reels the comment came from: by the post link when ManyChat
// sends one; otherwise the most recently published reel from the last 3
// days, marked as a guess.
async function attribute(postUrl) {
  const code = shortCode(postUrl);
  if (code) {
    const { rows } = await pool.query('SELECT id FROM scripts WHERE published_url LIKE $1 LIMIT 1', [`%${code}%`]);
    if (rows[0]) return { script_id: rows[0].id, how: 'post_link' };
  }
  const { rows } = await pool.query(
    `SELECT id FROM scripts WHERE status = 'published' AND published_at > now() - interval '3 days'
     ORDER BY published_at DESC LIMIT 1`,
  );
  return rows[0] ? { script_id: rows[0].id, how: 'latest_reel' } : { script_id: null, how: 'unknown' };
}

export async function recordLead(body) {
  const p = parseManychat(body);
  if (!p.manychat_id && !p.ig_username) throw Object.assign(new Error('No contact id or Instagram username in the request'), { status: 400 });

  const { rows: [existing] } = await pool.query(
    'SELECT id FROM leads WHERE manychat_id = $1 OR (ig_username IS NOT NULL AND lower(ig_username) = lower($2)) LIMIT 1',
    [p.manychat_id, p.ig_username],
  );
  let leadId;
  if (existing) {
    leadId = existing.id;
    await pool.query(
      `UPDATE leads SET manychat_id = COALESCE(manychat_id, $1), ig_username = COALESCE($2, ig_username),
         ig_id = COALESCE($3, ig_id), name = COALESCE($4, name), followed = COALESCE($5, followed), last_seen_at = now()
       WHERE id = $6`,
      [p.manychat_id, p.ig_username, p.ig_id, p.name, p.followed, leadId],
    );
  } else {
    const { rows } = await pool.query(
      `INSERT INTO leads (manychat_id, ig_username, ig_id, name, followed) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [p.manychat_id, p.ig_username, p.ig_id, p.name, p.followed],
    );
    leadId = rows[0].id;
  }

  const attr = await attribute(p.post_url);
  await pool.query(
    'INSERT INTO lead_events (lead_id, script_id, keyword, comment, post_url, raw) VALUES ($1, $2, $3, $4, $5, $6)',
    [leadId, attr.script_id, p.keyword, p.comment, p.post_url, JSON.stringify({ ...body, _attribution: attr.how })],
  );
  return { lead_id: leadId, new: !existing, attributed_to: attr.script_id, attribution: attr.how };
}
