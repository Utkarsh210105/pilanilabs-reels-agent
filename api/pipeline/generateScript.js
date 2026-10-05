import pool from '../db.js';
import { chatJson, SCRIPT_MODEL, FAST_MODEL } from '../lib/llm.js';
import { audiences } from '../config/audiences.js';
import { brand } from '../config/brand.js';
import { normalizeSegments, runChecks, hasErrors, spokenText, wordCount, estimateSeconds, copiedPhrases, originalityFlags } from './checks.js';
import { checkClaims, claimFlags } from './factCheck.js';

// The reel's closing line: the comment-keyword CTA when the ManyChat loop is
// on, otherwise the audience's plain "follow for more".
export function ctaFor(audience) {
  return brand.engagement?.enabled ? brand.engagement.cta[audience.id] : audience.ctaFallback;
}

export function findOffering(audienceId, offeringId) {
  const list = brand.offerings[audienceId] || [];
  return list.find((o) => o.id === offeringId) || null;
}

function offeringFactsText(offering) {
  return `${offering.name}\n${offering.facts.map((f) => `- ${f}`).join('\n')}\nCall to action: ${offering.cta}`;
}

// Format examples, one per audience. Labelled as format-only so the model
// does not reuse their topics or hooks.
const EXAMPLES = {
  b2b: [
    { text: 'Your competitors just got a new analyst that works for free.', visual: 'avatar', broll_query: '', on_screen_text: 'A free analyst?' },
    { text: '[Company] just opened its research agent to every business customer.', visual: 'broll', broll_query: 'office team laptops meeting', on_screen_text: '' },
    { text: 'It reads hundreds of sources and writes a cited brief in minutes.', visual: 'broll', broll_query: 'person reading reports screen', on_screen_text: 'Minutes, not days' },
    { text: 'Here is what that means for you. The first draft of market research is no longer the expensive part. Judgement is.', visual: 'avatar', broll_query: '', on_screen_text: '' },
    { text: 'So this week, pick one recurring research task in your team and run it through an agent. Measure the hours saved.', visual: 'avatar', broll_query: '', on_screen_text: '1 task. Measure hours.' },
    { text: 'Follow for your weekly AI brief.', visual: 'avatar', broll_query: '', on_screen_text: '' },
  ],
  b2c: [
    { text: 'Aap ChatGPT ko Google ki tarah use kar rahe ho? Yahi galti hai.', visual: 'avatar', broll_query: '', on_screen_text: 'Yahi galti hai' },
    { text: 'Ek line ka sawaal doge, toh ek line ka generic jawab milega.', visual: 'broll', broll_query: 'person typing phone frustrated', on_screen_text: '' },
    { text: 'Isko ek role do, apna context do, aur batao answer kaisa chahiye.', visual: 'avatar', broll_query: '', on_screen_text: 'Role + Context + Format' },
    { text: 'Jaise, tum ek HR manager ho, meri resume dekho aur teen weak points batao, bullet points mein.', visual: 'broll', broll_query: 'laptop resume document desk', on_screen_text: '' },
    { text: 'Farak khud dekh loge. Aaj hi try karo.', visual: 'avatar', broll_query: '', on_screen_text: '' },
    { text: 'Aise aur AI tips ke liye follow karo.', visual: 'avatar', broll_query: '', on_screen_text: '' },
  ],
};

function systemPrompt(audience) {
  return `You write short vertical video (Reels / YouTube Shorts / LinkedIn) scripts for ${brand.name}, an Indian AI education company. A HeyGen AI avatar speaks every line to camera; some lines are covered by stock B-roll footage while the avatar's voice continues.

WHO IS WATCHING: ${audience.listener}

VOICE:
${audience.voice.map((v) => `- ${v}`).join('\n')}

HOOK: The first line must stop the scroll in under 3 seconds, ideally under 15 words. Good hook devices for this audience: ${audience.hookStyles.join('; ')}.

STRUCTURE: hook, then the core story or tip in 3-5 short beats, then why it matters to the viewer, then the call to action. ${audience.targetWords[0]}-${audience.targetWords[1]} spoken words in total (about 40-55 seconds).

SEGMENTS: Split the script into 5-9 segments, one or two spoken sentences each. For each segment choose:
- "visual": "avatar" (presenter on camera) or "broll" (stock footage covers the screen, voice continues). The first segment (hook) and the call to action are always "avatar". Use "broll" for lines describing something that can be shown: people using phones/laptops, offices, factories, cities in India, data centres, charts, robots. Use "avatar" for opinions, advice, and direct address. Aim for 30-50% of segments as broll, and never more than 2 broll segments in a row.
- "broll_query": for broll segments only, a 2-5 word English search query for a stock video site like Pexels. It must describe the SUBJECT of that line in concrete, filmable terms, not a generic stand-in: for a line about a WWII cipher, "vintage typewriter cipher machine" or "old war documents archive", not "person using laptop". Stock sites have no logos, brand products or real named people, so never put a company, product or person name in the query ("person using AI chatbot on phone", not "ChatGPT app"). Avoid the overused generic shots (hands typing on a laptop, someone looking at a screen) unless the line is literally about that. If a line's subject cannot be shown with real stock footage (an announcement, a benchmark score, an abstract idea), make that segment "avatar" instead.
- "on_screen_text": optional short text overlay, max 6 words, for the key number or takeaway of that segment. Leave empty for most segments.

RULES:
- Write for the ear: short sentences, contractions, no lists read out as "firstly, secondly".
- Never use em dashes, emojis, hashtags, stage directions or brackets in spoken text.
- Never say a URL; say "link in bio" or "link in the caption".
- Say "${brand.spokenName}" (two words) when naming the company.
- ${brand.presenterName ? `The presenter is ${brand.presenterName} (${brand.presenterNote}) and speaks in first person. Do not invent personal stories, clients or experiences for him. He may introduce himself by name only in promotional reels, never in news reels.` : 'Never give the presenter a name or a personal backstory.'}
- Never mention prices, fees, discounts or "limited seats"/"offer ends" urgency.
- Never mention or compare competitors of ${brand.name} (other training or course companies).
- Never promise freebies or engagement bait that ${brand.name} has not set up: no "comment X to get the guide/roadmap/PDF", no giveaways.${brand.engagement?.enabled ? `
- The ONLY comment call to action that exists: viewers comment the word "${brand.engagement.keyword}" and get ${brand.engagement.offer} by DM. The final segment must be this call to action, close to: "${brand.engagement.cta[audience.id]}". Keep the keyword exactly "${brand.engagement.keyword}". The caption's last line repeats it, e.g. Comment "${brand.engagement.keyword}" for the WhatsApp community link 👇` : ''}
- Avoid clichés: game changer, revolutionize, unleash, dive in, delve, buckle up, the future is here, landscape, seamless.
- Only state facts that are in the SOURCE given to you. Never invent numbers, dates, prices, quotes or features. If the source is unclear, say less rather than guess.
- Avoid "today", "yesterday" or specific weekdays for news timing; the reel may post days later. Use "this week" or "just".

ALSO WRITE:
- "title": a short internal title for the dashboard (max 8 words).
- "caption": the post caption, 1-3 short lines ${audience.language === 'hinglish' ? 'in Hinglish' : 'in English'}, ending with the call to action. No hashtags in it.
- "hashtags": 4-7 hashtags without the # sign, mixing broad and specific. Ideas: ${audience.hashtagHints.join(', ')}.

FORMAT EXAMPLE (for structure and tone only, do not reuse its topic or lines):
${JSON.stringify({ segments: EXAMPLES[audience.id] }, null, 1)}

Reply with JSON only: {"title": "...", "segments": [{"text": "...", "visual": "avatar", "broll_query": "", "on_screen_text": ""}], "caption": "...", "hashtags": ["..."]}`;
}

// Builds the task text and the source the fact check compares against.
function taskFor({ audience, kind, newsItem, offering, brief, reel }) {
  if (kind === 'news') {
    const angle = audience.id === 'b2b' ? newsItem.b2b_angle : newsItem.b2c_angle;
    const source = `${newsItem.title}\n(${newsItem.source}${newsItem.published_at ? `, ${new Date(newsItem.published_at).toDateString()}` : ''})\n\n${newsItem.content || newsItem.summary || ''}`;
    return {
      source,
      task: `Write a "${audience.series.news}" news reel about this story.
${angle ? `Suggested angle: ${angle}` : ''}
${brief ? `Direction from the team: ${brief}` : ''}
End with: "${ctaFor(audience)}" (you may rephrase it naturally). You may mention ${brand.spokenName} once near the end if it fits naturally, but this is a news reel, not an ad.

SOURCE:
${source.slice(0, 10000)}`,
    };
  }
  if (kind === 'promo') {
    const source = offeringFactsText(offering);
    return {
      source,
      task: `Write a "${audience.series.promo}" promotional reel for this ${brand.name} offering. Lead with the viewer's problem or ambition, not the product. Only use the facts listed.
${brief ? `Direction from the team: ${brief}` : ''}

SOURCE (the only facts you may state about the offering):
${source}
How ${brand.name} trains: ${brand.howWeTrain.join('; ')}.

Company proof points you may also use: ${brand.proofPoints.join('; ')}.`,
    };
  }
  if (kind === 'inspired') {
    const a = reel.analysis || {};
    return {
      source: null,
      copySource: reel.transcript || '',
      task: `Write an ORIGINAL "${audience.series.custom}" reel for ${brand.spokenName}, using what made another creator's reel outperform. That reel got ${Number(reel.views || 0).toLocaleString('en-IN')} views${reel.outperform ? `, ${Number(reel.outperform).toFixed(1)}x their usual` : ''}.

WHAT MADE IT WORK (use these techniques):
- Hook device: ${a.hook_device || 'unknown'}
- Topic: ${a.topic || 'unknown'}
- Angle / promise: ${a.angle || 'unknown'}
- Beat structure: ${(a.beats || []).join(' → ') || 'unknown'}
- CTA move: ${a.cta || 'unknown'}
- Why it worked: ${a.why_it_works || 'unknown'}
${a.pilani_idea ? `- Suggested ${brand.spokenName} idea: ${a.pilani_idea}` : ''}
${brief ? `\nDirection from the team: ${brief}` : ''}

THEIR TRANSCRIPT (for reference only):
${(reel.transcript || '(none)').slice(0, 3000)}

RULES FOR USING IT:
- Stay on the SAME topic as their reel (${a.topic || 'see transcript'}): the topic is a big part of why it worked. The suggested idea above is only a hint; ignore it if it changes the topic.
- Use the same hook device (your own hook line) and the same kind of promise to the viewer.
${/^news|^opinion/i.test(a.reel_type || '') || /launch|announce|news/i.test(a.topic || '')
    ? `- THIS IS A NEWS-STYLE REEL. Do NOT retell their explainer. Shape: hook (1 line) → the news itself in at most 2 short lines → then the ${brand.spokenName} angle for the rest of the reel: what this means for the viewer's ${audience.id === 'b2b' ? 'business and team' : 'job, studies or daily life'}, and one concrete AI skill, habit or way of thinking it shows they should learn. At least 60% of the spoken words must be this angle, which their reel does not have. Do not reuse their analogies, examples, statistics or "the catch" points.`
    : '- Use a similar beat structure and pacing, but with your own examples and steps.'}
- Keep it within ${audience.targetWords[0]}-${audience.targetWords[1]} words.
- Never claim ${brand.spokenName} offers anything beyond these facts: ${[...brand.howWeTrain, ...(brand.offerings[audience.id] || []).flatMap((o) => o.facts)].join('; ')}. No invented lessons, free guides, roadmaps, PDFs, "comment X to get Y" offers, or giveaways.
- Every line must be in your own words. Never reuse a sentence or a distinctive phrase from their transcript; no run of 5 words may match it.
- Translating their lines into Hinglish still counts as copying. Choose your OWN examples, list items, steps and order; if they list 5 things, do not list the same 5. Covering the same tool or news is fine; retelling their reel is not.
- Never mention, name or refer to the other creator or their channel.
- Their claims are not verified. Only state facts you are confident are true and widely known; drop or soften anything uncertain.
- End with: "${ctaFor(audience)}" (you may rephrase it naturally).`,
    };
  }
  return {
    source: null,
    task: `Write a "${audience.series.custom}" reel on this topic from the team:
${brief}

There is no source article, so stick to well-established, widely known facts, avoid specific numbers unless certain, and prefer practical tips the viewer can try. End with: "${ctaFor(audience)}" (you may rephrase it naturally).`,
  };
}

async function draft({ audience, task, extra }) {
  const out = await chatJson({
    model: SCRIPT_MODEL,
    temperature: 0.8,
    maxTokens: 3000,
    system: systemPrompt(audience),
    user: extra ? `${task}\n\n${extra}` : task,
  });
  return {
    title: String(out?.title || 'Untitled reel').slice(0, 120),
    segments: normalizeSegments(out?.segments),
    caption: String(out?.caption || '').trim(),
    hashtags: (Array.isArray(out?.hashtags) ? out.hashtags : [])
      .map((h) => String(h).replace(/^#/, '').replace(/\s+/g, ''))
      .filter(Boolean)
      .slice(0, 8),
  };
}

// Draft, check, and redo once if the code checks or the fact check found an
// error. The second pass is told exactly what failed.
async function draftChecked({ audience, task, source, copySource, extra }) {
  const allFlags = async (segments, claims) => [
    ...runChecks(segments, audience.id),
    ...claimFlags(claims),
    ...(copySource ? copiedPhrases(segments, copySource) : []),
    ...(copySource ? await originalityFlags(segments, copySource, chatJson, SCRIPT_MODEL) : []),
  ];
  let result = await draft({ audience, task, extra });
  let claims = await checkClaims(result.segments, source);
  let flags = await allFlags(result.segments, claims);

  // One automatic redo; two when the problem is copying a source reel, since
  // a script that copies another creator must not reach the queue as is.
  const maxRedos = copySource ? 2 : 1;
  for (let redo = 0; redo < maxRedos && hasErrors(flags); redo++) {
    if (redo > 0 && !flags.some((f) => ['too_close_to_source', 'copied_phrase'].includes(f.code))) break;
    const problems = flags.filter((f) => f.severity === 'error').map((f) => `- ${f.message}`).join('\n');
    const redoExtra = `${extra ? `${extra}\n\n` : ''}Your previous draft had these problems. Fix all of them and keep what was good:\n${problems}\n\nPrevious draft:\n${JSON.stringify(result.segments)}`;
    result = await draft({ audience, task, extra: redoExtra });
    claims = await checkClaims(result.segments, source);
    flags = await allFlags(result.segments, claims);
  }

  const words = wordCount(spokenText(result.segments));
  return { ...result, claims, flags, word_count: words, est_seconds: estimateSeconds(words) };
}

async function loadNewsItem(id) {
  const { rows } = await pool.query('SELECT * FROM news_items WHERE id = $1', [id]);
  if (!rows[0]) throw new Error('News item not found');
  return rows[0];
}

async function loadReel(id) {
  const { rows } = await pool.query('SELECT * FROM creator_reels WHERE id = $1', [id]);
  if (!rows[0]) throw new Error('Creator reel not found');
  return rows[0];
}

export async function createScript({ audience: audienceId, kind, news_item_id, offering: offeringId, brief, source_reel_id }) {
  const audience = audiences[audienceId];
  if (!audience) throw new Error(`Unknown audience "${audienceId}"`);
  if (!['news', 'promo', 'custom', 'inspired'].includes(kind)) throw new Error(`Unknown kind "${kind}"`);

  let newsItem = null;
  let offering = null;
  let reel = null;
  if (kind === 'inspired') {
    if (!source_reel_id) throw new Error('source_reel_id is required for an inspired reel');
    reel = await loadReel(source_reel_id);
    if (!reel.analysis) throw new Error('That reel has not been analysed yet');
  } else if (kind === 'news') {
    if (!news_item_id) throw new Error('news_item_id is required for a news reel');
    newsItem = await loadNewsItem(news_item_id);
  } else if (kind === 'promo') {
    offering = findOffering(audienceId, offeringId);
    if (!offering) throw new Error(`Unknown ${audienceId} offering "${offeringId}"`);
  } else if (!brief?.trim()) {
    throw new Error('A topic/brief is required for a custom reel');
  }

  const { task, source, copySource } = taskFor({ audience, kind, newsItem, offering, brief, reel });
  const s = await draftChecked({ audience, task, source, copySource });

  const { rows } = await pool.query(
    `INSERT INTO scripts (audience, series, kind, news_item_id, offering, brief, title, segments, caption, hashtags,
       flags, claims, word_count, est_seconds, model, source_reel_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
    [audienceId, audience.series[kind] || audience.series.custom, kind, newsItem?.id ?? null, offering?.id ?? null, brief || null, s.title,
      JSON.stringify(s.segments), s.caption, s.hashtags, JSON.stringify(s.flags), JSON.stringify(s.claims),
      s.word_count, s.est_seconds, SCRIPT_MODEL, reel?.id ?? null],
  );
  if (newsItem) await pool.query("UPDATE news_items SET status = 'used' WHERE id = $1", [newsItem.id]);
  if (reel) await pool.query("UPDATE creator_reels SET status = 'used' WHERE id = $1", [reel.id]);
  return rows[0];
}

async function sourceForScript(script) {
  if (script.kind === 'inspired' && script.source_reel_id) {
    const reel = await loadReel(script.source_reel_id);
    return taskFor({ audience: audiences[script.audience], kind: 'inspired', reel, brief: script.brief });
  }
  if (script.kind === 'news' && script.news_item_id) {
    const n = await loadNewsItem(script.news_item_id);
    return taskFor({ audience: audiences[script.audience], kind: 'news', newsItem: n, brief: script.brief });
  }
  if (script.kind === 'promo') {
    const offering = findOffering(script.audience, script.offering);
    if (offering) return taskFor({ audience: audiences[script.audience], kind: 'promo', offering, brief: script.brief });
  }
  return taskFor({ audience: audiences[script.audience], kind: 'custom', brief: script.brief || script.title });
}

export async function getScript(id) {
  const { rows } = await pool.query('SELECT * FROM scripts WHERE id = $1', [id]);
  if (!rows[0]) throw new Error('Script not found');
  return rows[0];
}

async function saveVersion(script, reason) {
  await pool.query(
    `INSERT INTO script_versions (script_id, version, title, segments, caption, hashtags, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (script_id, version) DO NOTHING`,
    [script.id, script.version, script.title, JSON.stringify(script.segments), script.caption, script.hashtags, reason],
  );
}

// Rewrites a script with the reviewer's feedback, keeping the old version.
export async function rewriteScript(id, feedback) {
  const script = await getScript(id);
  if (!['draft', 'rejected'].includes(script.status)) throw new Error(`Cannot rewrite a script that is ${script.status}`);
  const audience = audiences[script.audience];
  const { task, source, copySource } = await sourceForScript(script);
  const extra = `Here is the current draft. Revise it following the reviewer's feedback; keep everything the feedback does not ask to change.
Reviewer feedback: ${feedback || 'Make it sharper and more engaging.'}

Current draft:
${JSON.stringify({ title: script.title, segments: script.segments, caption: script.caption, hashtags: script.hashtags })}`;
  const s = await draftChecked({ audience, task, source, copySource, extra });

  await saveVersion(script, `before rewrite: ${feedback || '(no feedback)'}`.slice(0, 500));
  const { rows } = await pool.query(
    `UPDATE scripts SET title = $1, segments = $2, caption = $3, hashtags = $4, flags = $5, claims = $6,
       word_count = $7, est_seconds = $8, status = 'draft', version = version + 1, updated_at = now()
     WHERE id = $9 RETURNING *`,
    [s.title, JSON.stringify(s.segments), s.caption, s.hashtags, JSON.stringify(s.flags), JSON.stringify(s.claims),
      s.word_count, s.est_seconds, id],
  );
  return rows[0];
}

// A manual edit from the dashboard. Code checks rerun right away; the fact
// check keeps its previous result until the reviewer asks for a recheck,
// which the dashboard prompts for after any edit.
export async function updateScript(id, { title, segments, caption, hashtags }) {
  const script = await getScript(id);
  if (!['draft', 'rejected'].includes(script.status)) throw new Error(`Cannot edit a script that is ${script.status}; move it back to draft first`);

  const segs = normalizeSegments(segments ?? script.segments);
  const words = wordCount(spokenText(segs));
  const copySource = script.source_reel_id ? (await loadReel(script.source_reel_id)).transcript : null;
  const flags = [...runChecks(segs, script.audience), ...claimFlags(script.claims), ...(copySource ? copiedPhrases(segs, copySource) : [])];
  const tags = (hashtags ?? script.hashtags).map((h) => String(h).replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean);

  await saveVersion(script, 'before manual edit');
  const { rows } = await pool.query(
    `UPDATE scripts SET title = $1, segments = $2, caption = $3, hashtags = $4, flags = $5,
       word_count = $6, est_seconds = $7, version = version + 1, updated_at = now()
     WHERE id = $8 RETURNING *`,
    [title ?? script.title, JSON.stringify(segs), caption ?? script.caption, tags, JSON.stringify(flags),
      words, estimateSeconds(words), id],
  );
  return rows[0];
}

export async function recheckScript(id) {
  const script = await getScript(id);
  const { source, copySource } = await sourceForScript(script);
  const claims = await checkClaims(script.segments, source);
  const flags = [
    ...runChecks(script.segments, script.audience),
    ...claimFlags(claims),
    ...(copySource ? copiedPhrases(script.segments, copySource) : []),
    ...(copySource ? await originalityFlags(script.segments, copySource, chatJson, SCRIPT_MODEL) : []),
  ];
  const { rows } = await pool.query(
    'UPDATE scripts SET claims = $1, flags = $2, updated_at = now() WHERE id = $3 RETURNING *',
    [JSON.stringify(claims), JSON.stringify(flags), id],
  );
  return rows[0];
}

const TRANSITIONS = {
  draft: ['approved', 'rejected'],
  rejected: ['draft'],
  approved: ['draft', 'rendered'],
  rendered: ['published', 'approved'],
  published: [],
};

export async function setStatus(id, { status, review_notes, override, published_url }) {
  const script = await getScript(id);
  if (!TRANSITIONS[script.status]?.includes(status)) {
    throw new Error(`Cannot move a script from ${script.status} to ${status}`);
  }
  if (status === 'approved' && hasErrors(script.flags) && !override) {
    const err = new Error('This script still has errors. Fix them, or approve with override.');
    err.status = 409;
    throw err;
  }
  const { rows } = await pool.query(
    `UPDATE scripts SET status = $1, review_notes = COALESCE($2, review_notes),
       approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
       published_at = CASE WHEN $1 = 'published' THEN now() ELSE published_at END,
       published_url = COALESCE($4, published_url), updated_at = now()
     WHERE id = $3 RETURNING *`,
    [status, review_notes ?? null, id, published_url?.trim() || null],
  );
  return rows[0];
}
