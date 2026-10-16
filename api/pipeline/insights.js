import pool from '../db.js';
import { getAccountStats, listMedia, mediaInsights } from '../lib/instagram.js';

const shortCode = (url) => String(url || '').match(/instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/)?.[1] || null;

function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Pulls the latest posts and their lifetime metrics, plus today's follower
// count. Posts are matched to the script that made them (by media id from
// dashboard posting, or by the link saved with "Mark published").
export async function syncInsights() {
  const account = await getAccountStats();
  await pool.query(
    `INSERT INTO ig_account_daily (day, followers, media_count) VALUES ((now() AT TIME ZONE 'Asia/Kolkata')::date, $1, $2)
     ON CONFLICT (day) DO UPDATE SET followers = EXCLUDED.followers, media_count = EXCLUDED.media_count, synced_at = now()`,
    [account.followers ?? null, account.mediaCount ?? null],
  );

  const { rows: scripts } = await pool.query('SELECT id, ig_media_id, published_url FROM scripts WHERE ig_media_id IS NOT NULL OR published_url IS NOT NULL');
  const byMediaId = new Map(scripts.filter((s) => s.ig_media_id).map((s) => [s.ig_media_id, s.id]));
  const byCode = new Map(scripts.filter((s) => shortCode(s.published_url)).map((s) => [shortCode(s.published_url), s.id]));

  const media = await listMedia(60);
  let synced = 0;
  for (const m of media) {
    const isReel = m.media_product_type === 'REELS';
    const i = await mediaInsights(m.id, isReel).catch(() => ({}));
    const scriptId = byMediaId.get(m.id) || byCode.get(shortCode(m.permalink)) || null;
    await pool.query(
      `INSERT INTO ig_media (id, media_type, product_type, permalink, caption, posted_at, thumbnail_url,
         views, reach, likes, comments, shares, saved, interactions, avg_watch_ms, total_watch_ms, script_id, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now())
       ON CONFLICT (id) DO UPDATE SET permalink = EXCLUDED.permalink, caption = EXCLUDED.caption, thumbnail_url = EXCLUDED.thumbnail_url,
         views = EXCLUDED.views, reach = EXCLUDED.reach, likes = EXCLUDED.likes, comments = EXCLUDED.comments, shares = EXCLUDED.shares,
         saved = EXCLUDED.saved, interactions = EXCLUDED.interactions, avg_watch_ms = EXCLUDED.avg_watch_ms, total_watch_ms = EXCLUDED.total_watch_ms,
         script_id = COALESCE(EXCLUDED.script_id, ig_media.script_id), synced_at = now()`,
      [m.id, m.media_type, m.media_product_type, m.permalink, m.caption || null, m.timestamp ? new Date(m.timestamp) : null,
        m.thumbnail_url || m.media_url || null, i.views ?? null, i.reach ?? null, i.likes ?? null, i.comments ?? null, i.shares ?? null,
        i.saved ?? null, i.total_interactions ?? null, i.ig_reels_avg_watch_time ?? null, i.ig_reels_video_view_total_time ?? null, scriptId],
    );
    if (scriptId) await pool.query('UPDATE scripts SET ig_media_id = COALESCE(ig_media_id, $1) WHERE id = $2', [m.id, scriptId]);
    synced += 1;
  }
  return { username: account.username, followers: account.followers, posts: synced };
}

// Everything the Insights page shows.
export async function insightsSummary() {
  const { rows: media } = await pool.query(
    `SELECT m.*, s.title AS script_title, s.audience, s.track, s.series, s.timings->>'duration' AS script_seconds,
       (SELECT count(DISTINCT e.lead_id)::int FROM lead_events e WHERE e.script_id = m.script_id) AS leads
     FROM ig_media m LEFT JOIN scripts s ON s.id = m.script_id
     ORDER BY m.posted_at DESC NULLS LAST`,
  );
  const reels = media.filter((m) => m.product_type === 'REELS');
  const usual = median(reels.map((r) => r.views));
  const enrich = (r) => {
    const reelSeconds = r.script_seconds ? Number(r.script_seconds) + 1.5 : null; // + outro
    return {
      ...r,
      vs_usual: usual && r.views != null ? Math.round((r.views / usual) * 10) / 10 : null,
      avg_watch_s: r.avg_watch_ms != null ? Math.round(r.avg_watch_ms / 100) / 10 : null,
      watch_pct: r.avg_watch_ms != null && reelSeconds ? Math.round((r.avg_watch_ms / 1000 / reelSeconds) * 100) : null,
      engagement_pct: r.reach ? Math.round(((r.interactions || 0) / r.reach) * 1000) / 10 : null,
    };
  };

  const since = (days) => reels.filter((r) => r.posted_at && Date.now() - new Date(r.posted_at) < days * 86_400_000);
  const sum = (arr, k) => arr.reduce((n, r) => n + (r[k] || 0), 0);
  const last30 = since(30);

  const { rows: daily } = await pool.query('SELECT day, followers FROM ig_account_daily ORDER BY day DESC LIMIT 31');
  const followersNow = daily[0]?.followers ?? null;
  const weekAgo = daily.find((d) => Date.now() - new Date(d.day) >= 6.5 * 86_400_000);

  // Which kind of reel works: average views by series.
  const groups = new Map();
  for (const r of reels) {
    const key = r.track === 'first-job' ? 'Pehli Job' : r.series || (r.script_id ? 'Other agent reels' : 'Posted outside the agent');
    const g = groups.get(key) || { series: key, reels: 0, views: 0, shares_saves: 0, leads: 0 };
    g.reels += 1; g.views += r.views || 0; g.shares_saves += (r.shares || 0) + (r.saved || 0); g.leads += r.leads || 0;
    groups.set(key, g);
  }

  const { rows: [last] } = await pool.query('SELECT max(synced_at) AS at FROM ig_media');
  return {
    synced_at: last?.at || null,
    followers: followersNow,
    followers_change_7d: followersNow != null && weekAgo ? followersNow - weekAgo.followers : null,
    reels_30d: last30.length,
    views_30d: sum(last30, 'views'),
    reach_30d: sum(last30, 'reach'),
    shares_saves_30d: sum(last30, 'shares') + sum(last30, 'saved'),
    leads_30d: sum(last30, 'leads'),
    usual_views: Math.round(usual),
    by_series: [...groups.values()].map((g) => ({ ...g, avg_views: Math.round(g.views / g.reels) })).sort((a, b) => b.avg_views - a.avg_views),
    media: media.map(enrich),
  };
}
