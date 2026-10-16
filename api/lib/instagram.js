// Instagram Content Publishing API ("Instagram API with Instagram Login").
// Posts reels to the connected professional account. Instagram downloads the
// video from a public link (see lib/publicMedia.js for the temporary one).
//
// Flow: create a REELS container from video_url → wait until Instagram has
// processed it → publish → read the permalink.
// Docs: developers.facebook.com/docs/instagram-platform/content-publishing
import pool from '../db.js';

const VERSION = process.env.IG_GRAPH_VERSION || 'v23.0';
const GRAPH = `https://graph.instagram.com/${VERSION}`;

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
}

// The token refreshed by the agent wins over the one first pasted in .env.
async function token() {
  const t = (await getSetting('ig_access_token')) || process.env.IG_ACCESS_TOKEN;
  if (!t) throw new Error('Instagram is not connected: set IG_ACCESS_TOKEN in api/.env (see README, "Posting to Instagram")');
  return t;
}

async function graph(path, { method = 'GET', params = {}, body } = {}) {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', await token());
  const res = await fetch(url, { method, body, signal: AbortSignal.timeout(60_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new Error(`Instagram API: ${e.error_user_msg || e.message || res.status}${e.code ? ` (code ${e.code})` : ''}`);
  }
  return data;
}

// The connected account, e.g. { id, username } — also a cheap check that
// the token works.
export async function getAccount() {
  const me = await graph('me', { params: { fields: 'user_id,username,account_type' } });
  return { id: me.user_id || me.id, username: me.username, accountType: me.account_type };
}

// Long-lived tokens last 60 days; refreshing (allowed once a token is a day
// old) gives another 60. Run weekly by the scheduler.
export async function refreshToken() {
  const current = await token();
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', current);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Token refresh failed: ${data.error?.message || res.status}`);
  await setSetting('ig_access_token', data.access_token);
  return { expiresInDays: Math.round((data.expires_in || 0) / 86400) };
}

async function waitUntilProcessed(containerId, { timeoutMs = 10 * 60_000 } = {}) {
  const started = Date.now();
  for (;;) {
    const c = await graph(containerId, { params: { fields: 'status_code,status' } });
    if (c.status_code === 'FINISHED') return;
    if (c.status_code === 'ERROR' || c.status_code === 'EXPIRED') {
      throw new Error(`Instagram could not process the video: ${c.status || c.status_code}`);
    }
    if (Date.now() - started > timeoutMs) throw new Error('Instagram is still processing the video after 10 minutes');
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// Creates a reel container from a public video URL and waits until Instagram
// has downloaded and processed it. Nothing is visible on the account until
// publishContainer runs. (The Instagram-Login API needs video_url; it does
// not take direct uploads.)
export async function prepareReel({ videoUrl, caption, coverMs }) {
  const account = await getAccount();
  const container = await graph(`${account.id}/media`, {
    method: 'POST',
    params: {
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: true,
      thumb_offset: Number.isFinite(coverMs) ? Math.max(0, Math.round(coverMs)) : undefined,
    },
  });
  await waitUntilProcessed(container.id);
  return { accountId: account.id, username: account.username, containerId: container.id };
}

// Posts a reel and returns { mediaId, permalink }. coverMs picks the cover
// frame (milliseconds into the video).
export async function publishReel({ videoUrl, caption, coverMs }) {
  const { accountId, username, containerId } = await prepareReel({ videoUrl, caption, coverMs });
  const published = await graph(`${accountId}/media_publish`, { method: 'POST', params: { creation_id: containerId } });
  const media = await graph(published.id, { params: { fields: 'permalink' } }).catch(() => ({}));
  return { mediaId: published.id, permalink: media.permalink || null, username };
}

// ---- Insights (needs instagram_business_manage_insights) ------------------

export async function getAccountStats() {
  const me = await graph('me', { params: { fields: 'user_id,username,followers_count,media_count' } });
  return { id: me.user_id || me.id, username: me.username, followers: me.followers_count, mediaCount: me.media_count };
}

// The account's most recent posts (reels and feed), newest first.
export async function listMedia(limit = 60) {
  const out = [];
  let after;
  while (out.length < limit) {
    const page = await graph('me/media', {
      params: { fields: 'id,media_type,media_product_type,timestamp,permalink,caption,thumbnail_url,media_url', limit: Math.min(50, limit - out.length), after },
    });
    out.push(...(page.data || []));
    after = page.paging?.cursors?.after;
    if (!page.paging?.next || !after) break;
  }
  return out;
}

const REEL_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'];
const FEED_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'];

const metricValue = (m) => m?.values?.[0]?.value ?? m?.total_value?.value ?? null;

// Lifetime metrics for one post. Asks for all at once; if Instagram rejects
// one (older posts, feed vs reel differences), asks one by one and skips
// the ones it refuses.
export async function mediaInsights(id, isReel) {
  const metrics = isReel ? REEL_METRICS : FEED_METRICS;
  const result = {};
  try {
    const r = await graph(`${id}/insights`, { params: { metric: metrics.join(',') } });
    for (const m of r.data || []) result[m.name] = metricValue(m);
    return result;
  } catch {
    for (const metric of metrics) {
      const r = await graph(`${id}/insights`, { params: { metric } }).catch(() => null);
      if (r?.data?.[0]) result[metric] = metricValue(r.data[0]);
    }
    return result;
  }
}

export const instagramConfigured = async () => Boolean((await getSetting('ig_access_token')) || process.env.IG_ACCESS_TOKEN);
