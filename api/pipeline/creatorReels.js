import { mkdir, rm } from 'fs/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import pool from '../db.js';
import { scrapeInstagramReels } from '../lib/apify.js';
import { runFfmpeg } from '../lib/ffmpeg.js';
import { transcribeWords } from '../lib/whisper.js';
import { chatJson, SCRIPT_MODEL } from '../lib/llm.js';
import { brand } from '../config/brand.js';
import { MEDIA_DIR } from './renderReel.js';

// Active creators post several reels a day: 30 covered under a week for
// vaibhavsisinty. 80 reaches back about a month, where proven hits are.
const SCRAPE_LIMIT = Number(process.env.CREATOR_SCRAPE_LIMIT ?? 80);
// Reels keep gaining views for days; "usual" views come only from reels old
// enough to have settled, or fresh reels drag the median down and every
// older reel looks like a 400x outlier.
const SETTLED_DAYS = 3;
// Only the best reels get the (slower, paid) transcribe + analyse step.
const ANALYZE_TOP = Number(process.env.CREATOR_ANALYZE_TOP ?? 6);

function median(nums) {
  const s = nums.filter((n) => n > 0).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

async function download(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

// Instagram's CDN links are signed and expire within days, so thumbnails are
// saved locally at scrape time (the Namhya engine re-hosts for the same reason).
async function saveThumbnail(url, shortCode) {
  if (!url) return null;
  const dir = path.join(MEDIA_DIR, 'thumbs');
  await mkdir(dir, { recursive: true });
  const rel = `thumbs/${shortCode}.jpg`;
  try {
    await download(url, path.join(MEDIA_DIR, rel));
    return rel;
  } catch {
    return null;
  }
}

// What was actually said, from the reel's own audio (the Namhya engine only
// had captions and had to guess the script).
async function transcribeReel(videoUrl, shortCode) {
  const dir = path.join(MEDIA_DIR, 'tmp');
  await mkdir(dir, { recursive: true });
  const video = path.join(dir, `${shortCode}.mp4`);
  const audio = path.join(dir, `${shortCode}.mp3`);
  try {
    await download(videoUrl, video);
    await runFfmpeg(['-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio]);
    // Asked for Latin script so a Hinglish reel comes back as Roman
    // Hinglish, readable next to our own scripts.
    const r = await transcribeWords(audio, { prompt: 'Hinglish in Roman script: aap, kya, hai, ye, AI, ChatGPT.' });
    return r.text.trim();
  } finally {
    await rm(video, { force: true }).catch(() => {});
    await rm(audio, { force: true }).catch(() => {});
  }
}

async function analyzeReel({ transcript, caption, views, outperform }) {
  return chatJson({
    model: SCRIPT_MODEL,
    temperature: 0.2,
    maxTokens: 1200,
    system: `You are a short-form video strategist. You study reels that performed unusually well and explain, precisely, what made them work, so a different brand (${brand.name}, an Indian AI education company for leaders and everyday people) can use the same techniques in its own original reels.`,
    user: `This reel got ${views?.toLocaleString('en-IN') ?? 'unknown'} views, ${outperform ? `${outperform.toFixed(1)}x the creator's usual` : 'unknown vs usual'}.

TRANSCRIPT (spoken):
${transcript || '(no speech)'}

CAPTION:
${(caption || '').slice(0, 1500)}

Reply with JSON only:
{
  "hook_line": "the opening line as spoken",
  "hook_device": "the technique, e.g. 'curiosity gap', 'you are doing X wrong', 'shocking stat', 'free tool reveal', 'myth vs truth'",
  "topic": "what the reel is about, in a few words",
  "angle": "the specific take or promise to the viewer",
  "beats": ["beat 1 in a few words", "beat 2", "..."],
  "cta": "the call to action move",
  "why_it_works": "2-3 sentences on why this outperformed",
  "language": "english | hinglish | hindi",
  "reel_type": "news (explains a launch/event) | tutorial (shows how to do something) | opinion | story",
  "best_for": "b2b | b2c | both",
  "pilani_idea": "one or two sentences"
}

pilani_idea: an original ${brand.name} reel on the SAME topic, using the same hook technique, built around ${brand.name}'s angle: what this means for the viewer (their job, business or daily life) and which AI skill or habit it teaches them. It must be a different reel, not a retelling: for a news reel, the news is the first line and the viewer's takeaway is the rest. Do not reuse this reel's own examples, lists or analogies. Never invent quotes, statistics or news (for example "X just said..."); describe the idea, not facts.
The only things ${brand.name} offers are: ${[...brand.howWeTrain, ...brand.offerings.b2b.map((o) => o.name), ...brand.offerings.b2c.map((o) => o.name)].join('; ')}. Never mention free courses, guides, student counts or anything else not in that list; leave the call to action out of pilani_idea.`,
  });
}

export async function scrapeCreator(creatorId) {
  const { rows: [creator] } = await pool.query('SELECT * FROM creators WHERE id = $1', [creatorId]);
  if (!creator) throw new Error('Creator not found');

  const items = await scrapeInstagramReels(creator.handle, SCRAPE_LIMIT);
  const withViews = items
    .filter((x) => x.shortCode && (x.type === 'Video' || x.videoUrl))
    .map((x) => ({ ...x, views: x.videoPlayCount || x.videoViewCount || 0 }));
  const settledCutoff = Date.now() - SETTLED_DAYS * 86_400_000;
  const settled = withViews.filter((x) => x.timestamp && Date.parse(x.timestamp) < settledCutoff);
  const med = median((settled.length >= 5 ? settled : withViews).map((x) => x.views));

  let upserted = 0;
  for (const x of withViews) {
    const thumb = await saveThumbnail(x.displayUrl, x.shortCode);
    const { rowCount } = await pool.query(
      `INSERT INTO creator_reels (creator_id, short_code, url, caption, views, likes, comments, duration, posted_at, thumbnail, outperform)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (short_code) DO UPDATE SET
         views = EXCLUDED.views, likes = EXCLUDED.likes, comments = EXCLUDED.comments,
         outperform = EXCLUDED.outperform, thumbnail = COALESCE(EXCLUDED.thumbnail, creator_reels.thumbnail),
         scraped_at = now()`,
      [creator.id, x.shortCode, x.url || `https://www.instagram.com/reel/${x.shortCode}/`, x.caption || null,
        x.views || null, x.likesCount ?? null, x.commentsCount ?? null, x.videoDuration ?? null,
        x.timestamp ? new Date(x.timestamp) : null, thumb, med ? x.views / med : null],
    );
    upserted += rowCount;
  }
  await pool.query('UPDATE creators SET median_views = $1, last_scraped_at = now() WHERE id = $2', [med || null, creator.id]);

  // Transcribe and analyse the top performers not done yet. videoUrl links
  // expire, so this happens in the same run as the scrape.
  const byUrl = new Map(withViews.map((x) => [x.shortCode, x]));
  const { rows: todo } = await pool.query(
    `SELECT id, short_code, caption, views, outperform FROM creator_reels
     WHERE creator_id = $1 AND status = 'new' AND short_code = ANY($2)
     ORDER BY views DESC NULLS LAST LIMIT $3`,
    [creator.id, [...byUrl.keys()], ANALYZE_TOP],
  );
  const analyzed = [];
  for (const r of todo) {
    try {
      const src = byUrl.get(r.short_code);
      const transcript = src?.videoUrl ? await transcribeReel(src.videoUrl, r.short_code) : '';
      const analysis = await analyzeReel({ transcript, caption: r.caption, views: Number(r.views), outperform: r.outperform });
      await pool.query(
        "UPDATE creator_reels SET transcript = $1, language = $2, analysis = $3, status = 'analyzed', error = NULL WHERE id = $4",
        [transcript || null, analysis?.language || null, JSON.stringify(analysis), r.id],
      );
      analyzed.push(r.short_code);
    } catch (err) {
      await pool.query("UPDATE creator_reels SET status = 'failed', error = $1 WHERE id = $2", [err.message.slice(0, 500), r.id]);
    }
  }

  return { handle: creator.handle, reels: withViews.length, upserted, median_views: med, analyzed: analyzed.length };
}

// Re-runs the analysis from the stored transcript (no scraping, no Whisper),
// e.g. after the analysis prompt changes.
export async function reanalyzeReel(id) {
  const { rows: [r] } = await pool.query('SELECT * FROM creator_reels WHERE id = $1', [id]);
  if (!r) throw new Error('Creator reel not found');
  if (!r.transcript && !r.caption) throw new Error('Nothing to analyse: no transcript or caption');
  const analysis = await analyzeReel({ transcript: r.transcript, caption: r.caption, views: Number(r.views), outperform: r.outperform });
  const { rows } = await pool.query(
    "UPDATE creator_reels SET analysis = $1, language = $2, status = CASE WHEN status = 'used' THEN 'used' ELSE 'analyzed' END, error = NULL WHERE id = $3 RETURNING *",
    [JSON.stringify(analysis), analysis?.language || null, id],
  );
  return rows[0];
}

export async function scrapeActiveCreators() {
  const { rows } = await pool.query('SELECT id FROM creators WHERE active ORDER BY handle');
  const results = [];
  for (const c of rows) {
    try { results.push(await scrapeCreator(c.id)); } catch (err) { results.push({ creator: c.id, error: err.message }); }
  }
  return results;
}
