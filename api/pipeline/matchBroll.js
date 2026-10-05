import pool from '../db.js';
import { chatJson, SCRIPT_MODEL } from '../lib/llm.js';
import { searchPexelsVideos } from '../lib/pexels.js';
import { wordCount } from './checks.js';
import { getScript } from './generateScript.js';

const CANDIDATES = 6;

// A small thumbnail is plenty to judge a clip and keeps the vision call cheap.
function thumb(url) {
  return url.replace(/([?&])h=\d+/, '$1h=360').replace(/([?&])w=\d+/, '$1w=203');
}

// Claude looks at the candidates' thumbnails next to the spoken line and picks
// one, or none. Same idea as the Namhya engine's matchBroll: a wrong clip is
// worse than no clip, and a stranger's face reads as a second presenter.
// A clip must score at least this for relevance to be used; below it the
// line stays on Ajay. Picking "the best of a bad batch" is what made B-roll
// look random.
const MIN_RELEVANCE = 7;

async function pickClip({ line, query, audience, candidates, context }) {
  const content = [{
    type: 'text',
    text: `A short vertical reel for ${audience === 'b2b' ? 'business leaders in India' : 'everyday people in India'}. A presenter (Ajay) speaks every line; on some lines, stock B-roll covers the screen while his voice continues.

REEL TOPIC: ${context.title}
PREVIOUS LINE: ${context.prev || '(start of reel)'}
THIS LINE (needs B-roll): "${line}"
NEXT LINE: ${context.next || '(end of reel)'}
Stock search used: "${query}"
${context.chosen.length ? `Clips already chosen for this reel (keep a consistent look and do not repeat the same kind of shot): ${context.chosen.join(' / ')}` : ''}

Below are ${candidates.length} candidate clips, numbered from 0. Each clip has its uploader's title and 3 frames from its start, middle and end. Judge what the footage actually shows, using the title to confirm it. Never assume a specific object (a particular machine, product or place) unless it is clearly identifiable and the title agrees; dark machinery is not a cipher machine just because the line mentions one.

Score each clip's RELEVANCE 0-10: would a viewer immediately connect this footage with what Ajay is saying on this line, in the context of the reel topic? 9-10: shows the line's actual subject. 7-8: clearly related and supports the point. 4-6: loosely related or generic (someone at a laptop for a line that is not about using a laptop). 0-3: unrelated.

A clip is disqualified (score 0) if, in any frame:
- a person's face is prominent and turned towards the camera, or they appear to be talking (they would look like a second presenter). Hands, backs, over-the-shoulder shots and small background figures are fine
- readable brand logos, app names, watermarks or text that could contradict the line are visible
- it looks cheesy or staged in a way a sceptical ${audience === 'b2b' ? 'executive' : 'viewer'} would notice

Prefer Indian settings or people when the line is about India or everyday Indian life.

Reply with JSON only: {"scores": [<one number per clip, in order>], "best": <index of the highest-scoring clip>, "reason": "one short line on why the best clip fits, or why none do", "better_query": "<a different, more specific 2-5 word stock search to try if no clip scores ${MIN_RELEVANCE}+, else empty>"}`,
  }];
  candidates.forEach((c, i) => {
    content.push({ type: 'text', text: `Clip ${i}${c.title ? ` (title: "${c.title}")` : ''}:` });
    const frames = c.frames?.length ? c.frames : [thumb(c.preview_url)];
    for (const url of frames) content.push({ type: 'image_url', image_url: { url } });
  });

  const out = await chatJson({ model: SCRIPT_MODEL, temperature: 0, maxTokens: 400, user: content });
  const scores = Array.isArray(out?.scores) ? out.scores.map(Number) : [];
  const best = Number.isInteger(out?.best) && out.best >= 0 && out.best < candidates.length ? out.best : null;
  const score = best !== null ? scores[best] : null;
  const pick = best !== null && score >= MIN_RELEVANCE ? best : null;
  return { pick, score, reason: String(out?.reason || ''), betterQuery: String(out?.better_query || '').trim() };
}

async function candidatesFor(query, { minSeconds, exclude, orientation }) {
  const clips = await searchPexelsVideos(query, { orientation, perPage: 15 });
  return clips
    .filter((c) => !exclude.has(c.id) && c.duration >= minSeconds)
    .slice(0, CANDIDATES);
}

// Tries the script's own query, then Claude's suggested query, then the same
// query in landscape (center-cropped to 9:16 at assembly). Stops at the first
// clip Claude accepts.
async function matchSegment({ seg, audience, exclude, context }) {
  const minSeconds = Math.max(3, Math.ceil(wordCount(seg.text) / 2.5));
  const attempts = [{ query: seg.broll_query, orientation: 'portrait' }];
  const tried = [];
  let shown = [];

  // Best acceptable pick so far. A borderline pick (7) still gets one try
  // with Claude's more specific search, and the higher score wins.
  let best = null;
  for (let i = 0; i < attempts.length && i < 3; i++) {
    const { query, orientation } = attempts[i];
    const candidates = await candidatesFor(query, { minSeconds, exclude, orientation });
    tried.push(`${query} (${orientation}): ${candidates.length} clips`);
    if (!candidates.length) {
      if (orientation === 'portrait') attempts.push({ query, orientation: 'landscape' });
      continue;
    }
    if (!shown.length) shown = candidates;

    const { pick, score, reason, betterQuery } = await pickClip({ line: seg.text, query, audience, candidates, context });
    if (pick !== null && (!best || score > best.score)) {
      best = { status: 'picked', clip: candidates[pick], candidates, reason, score, query };
    }
    if (best && best.score >= 8) break;
    if (pick === null) tried[tried.length - 1] += `, best only ${score ?? 0}/10 (${reason})`;
    if (betterQuery && !attempts.some((a) => a.query === betterQuery)) {
      attempts.push({ query: betterQuery, orientation: 'portrait' });
    } else if (!best && orientation === 'portrait') {
      attempts.push({ query, orientation: 'landscape' });
    }
  }
  if (best) return best;
  return { status: 'none', clip: null, candidates: shown, reason: `No relevant clip, so Ajay stays on screen for this line. Tried ${tried.join('; ')}`, query: seg.broll_query };
}

// Finds B-roll for every B-roll segment of a script. Picks already made for
// the same line and query are kept (so a reviewer's swap survives), unless
// `force` is set. The same clip is never used twice in one reel.
// Clips already used in other reels from the last 30 days: both audiences
// post to the same accounts, and followers notice the same shot twice.
async function recentlyUsedClipIds(exceptScriptId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT b.value->'clip'->>'id' AS id
     FROM scripts s, jsonb_each(s.broll) b
     WHERE s.id <> $1 AND s.status <> 'rejected' AND s.updated_at > now() - interval '30 days'
       AND b.value->'clip'->>'id' IS NOT NULL`,
    [exceptScriptId],
  );
  return rows.map((r) => r.id);
}

export async function matchBrollForScript(id, { force = false } = {}) {
  const script = await getScript(id);
  const broll = force ? {} : { ...(script.broll || {}) };
  const used = new Set([
    ...Object.values(broll).map((b) => b.clip?.id).filter(Boolean),
    ...await recentlyUsedClipIds(id),
  ]);
  const results = [];

  for (const [i, seg] of script.segments.entries()) {
    const key = String(i);
    if (seg.visual !== 'broll') { delete broll[key]; continue; }
    const prev = broll[key];
    if (prev && prev.text === seg.text && prev.query === seg.broll_query && prev.status === 'picked') continue;
    if (prev?.clip) used.delete(prev.clip.id);

    const context = {
      title: script.title,
      prev: script.segments[i - 1]?.text,
      next: script.segments[i + 1]?.text,
      chosen: Object.values(broll).filter((b) => b.clip).map((b) => b.reason).slice(0, 4),
    };
    const m = await matchSegment({ seg, audience: script.audience, exclude: used, context });
    if (m.clip) used.add(m.clip.id);
    broll[key] = { ...m, query: seg.broll_query, text: seg.text, picked_at: new Date().toISOString() };
    results.push({ segment: i, status: m.status });
  }

  // Picks for segments that no longer exist (after an edit removed lines).
  for (const key of Object.keys(broll)) {
    if (Number(key) >= script.segments.length) delete broll[key];
  }

  const { rows } = await pool.query('UPDATE scripts SET broll = $1, updated_at = now() WHERE id = $2 RETURNING *', [JSON.stringify(broll), id]);
  return { script: rows[0], results };
}

// Reviewer picks a different candidate (or a clip from a fresh search).
export async function chooseBroll(id, segment, clip) {
  const script = await getScript(id);
  const key = String(segment);
  const seg = script.segments[segment];
  if (!seg || seg.visual !== 'broll') throw new Error('That segment is not a B-roll segment');
  const current = script.broll?.[key] || { candidates: [] };
  const candidates = current.candidates?.some((c) => c.id === clip.id) ? current.candidates : [clip, ...(current.candidates || [])].slice(0, 12);
  const broll = {
    ...script.broll,
    [key]: { ...current, status: 'picked', clip, candidates, reason: 'Chosen by reviewer', query: seg.broll_query, text: seg.text, picked_at: new Date().toISOString() },
  };
  const { rows } = await pool.query('UPDATE scripts SET broll = $1, updated_at = now() WHERE id = $2 RETURNING *', [JSON.stringify(broll), id]);
  return rows[0];
}

// Raw search for the Swap panel: portrait first, landscape if that is thin.
export async function searchBroll(query) {
  const portrait = await searchPexelsVideos(query, { orientation: 'portrait', perPage: 12 });
  if (portrait.length >= 6) return portrait;
  const landscape = await searchPexelsVideos(query, { orientation: 'landscape', perPage: 12 - portrait.length });
  return [...portrait, ...landscape];
}
