// Deterministic script checks. Like cleanScript in the Namhya engine, anything
// that can be fixed or caught in code is, so it never depends on the model
// following an instruction.
import { audiences } from '../config/audiences.js';
import { brand } from '../config/brand.js';
import { tracks } from '../config/tracks.js';

// Spoken-rate estimate for a HeyGen voice at normal pace (~150 wpm).
const WORDS_PER_SECOND = 2.5;

// The most visible "written by AI" phrases, plus hype that reads badly to a
// sceptical executive. Matched case-insensitively on whole phrases.
const BANNED_PHRASES = [
  'game changer', 'game-changer', 'revolutionize', 'revolutionise', 'revolutionary',
  "in today's fast-paced", 'in today’s fast-paced', 'buckle up', "let's dive in", 'dive into', 'delve',
  'unlock the power', 'unleash', 'the future is here', 'trust me', "you won't believe",
  'mind-blowing', 'mind blowing', 'supercharge', 'harness the power', 'landscape', 'seamless',
  'hey guys', 'smash that', 'in conclusion',
];

// Common Hindi words (same approach as the Namhya engine): real Hinglish has
// plenty of them, a script the model left in plain English has almost none.
const HINDI_WORDS = /\b(hai|hain|ho|kya|aap|aapko|aapke|aapki|apna|apni|mera|meri|main|maine|ke|ki|ko|se|ka|nahi|nahin|bhi|toh|ye|yeh|wo|woh|par|aur|lekin|mujhe|hum|hoon|raha|rahi|rahe|karta|karti|karo|karein|kar|sakte|sakta|sakti|abhi|sirf|bas|kaise|kyun|matlab|agar|wala|wali|chahiye|dekho|socho|log|logon)\b/g;

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/gu;

export function cleanSpoken(text) {
  return String(text || '')
    .replace(/[    ]/g, ' ')
    .replace(/‑/g, '-')
    // An em dash reads as AI-written and HeyGen pauses oddly on it.
    .replace(/\s*[—]\s*/g, ', ')
    .replace(/\s+–\s+/g, ', ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(EMOJI, '')
    // Stage directions like [pause] would be read out loud by the avatar.
    .replace(/\[[^\]]*\]/g, '')
    // Hashtags belong in the caption, not the voice track.
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

export function normalizeSegments(segments) {
  return (Array.isArray(segments) ? segments : [])
    .map((s) => {
      const visual = s?.visual === 'broll' ? 'broll' : 'avatar';
      return {
        text: cleanSpoken(s?.text),
        visual,
        broll_query: visual === 'broll' ? String(s?.broll_query || '').trim().slice(0, 80) : '',
        on_screen_text: String(s?.on_screen_text || '').replace(EMOJI, '').trim().slice(0, 60),
      };
    })
    .filter((s) => s.text.length > 0);
}

export function spokenText(segments) {
  return segments.map((s) => s.text).join(' ');
}

export function wordCount(text) {
  return String(text).split(/\s+/).filter(Boolean).length;
}

export function estimateSeconds(words) {
  return Math.round(words / WORDS_PER_SECOND);
}

export function hinglishRatio(text) {
  const lower = String(text).toLowerCase();
  const words = wordCount(lower) || 1;
  return (lower.match(HINDI_WORDS) || []).length / words;
}

// Returns flags: { code, severity: 'error' | 'warn', message, segment? }.
// 'error' flags trigger the automatic rewrite at generation time and must be
// overridden explicitly to approve; 'warn' flags are shown to the reviewer.
export function runChecks(segments, audienceId, trackId = null) {
  const audience = audiences[audienceId];
  const flags = [];
  const all = spokenText(segments);
  const words = wordCount(all);
  const [minWords, maxWords] = audience.targetWords;

  if (segments.length < 4) {
    flags.push({ code: 'too_few_segments', severity: 'error', message: `Only ${segments.length} segments; a reel needs at least 4 so B-roll can cut in and out.` });
  }
  if (words > maxWords * 1.25) {
    flags.push({ code: 'too_long', severity: 'error', message: `${words} words (~${estimateSeconds(words)}s). Keep it under ${maxWords} words so it stays under a minute.` });
  } else if (words > maxWords) {
    flags.push({ code: 'long', severity: 'warn', message: `${words} words (~${estimateSeconds(words)}s), a bit over the ${maxWords}-word target.` });
  } else if (words < minWords * 0.75) {
    flags.push({ code: 'too_short', severity: 'error', message: `Only ${words} words (~${estimateSeconds(words)}s). Aim for ${minWords}-${maxWords}.` });
  }

  if (segments[0] && segments[0].visual !== 'avatar') {
    flags.push({ code: 'hook_not_avatar', severity: 'error', message: 'The hook (first line) must be the avatar on camera, not B-roll.', segment: 0 });
  }
  const hookWords = segments[0] ? wordCount(segments[0].text) : 0;
  if (hookWords > 20) {
    flags.push({ code: 'long_hook', severity: 'warn', message: `Hook is ${hookWords} words. Under 15 lands faster in the first 3 seconds.`, segment: 0 });
  }
  const last = segments[segments.length - 1];
  if (last && last.visual !== 'avatar') {
    flags.push({ code: 'cta_not_avatar', severity: 'warn', message: 'The call to action usually works better with the avatar on camera.', segment: segments.length - 1 });
  }
  if (!segments.some((s) => s.visual === 'broll')) {
    flags.push({ code: 'no_broll', severity: 'warn', message: 'No B-roll segments; the whole reel would be a talking head.' });
  }

  let brollRun = 0;
  segments.forEach((s, i) => {
    if (s.visual === 'broll' && !s.broll_query) {
      flags.push({ code: 'missing_broll_query', severity: 'error', message: 'B-roll segment has no stock-footage search query.', segment: i });
    }
    brollRun = s.visual === 'broll' ? brollRun + wordCount(s.text) : 0;
    if (brollRun > 45) {
      flags.push({ code: 'long_broll_run', severity: 'warn', message: 'The avatar is off screen for over ~18 seconds here; cut back to the avatar sooner.', segment: i });
      brollRun = 0;
    }

    const lower = s.text.toLowerCase();
    const banned = BANNED_PHRASES.filter((p) => lower.includes(p));
    if (banned.length) {
      flags.push({ code: 'banned_phrase', severity: 'error', message: `Cliché/AI-sounding phrase: "${banned.join('", "')}".`, segment: i });
    }
    // Brand rule: prices are never said in a reel.
    if (/₹|\$\s?\d|\b(rs\.?|inr|rupees?|fees?|price|pricing|discount|lakh)\b/i.test(`${s.text} ${s.on_screen_text}`)) {
      flags.push({ code: 'price_mentioned', severity: 'error', message: 'Mentions a price, fee or discount; PilaniLabs reels never state prices.', segment: i });
    }
    if (audience.language === 'hinglish' && /\b(tum|tumhe|tumhara|tumhari|tu|tera|teri)\b/i.test(s.text)) {
      flags.push({ code: 'informal_address', severity: 'warn', message: 'Uses "tum"/"tu"; Ajay addresses viewers as "aap" (fine if it is quoting a prompt to an AI tool).', segment: i });
    }
    // "Comment LEARN to get the roadmap" promises something nobody set up.
    // The configured keyword ("AI") is real: ManyChat answers it.
    // Track keywords ("JOB" → roadmap) are real too.
    const keyword = trackId ? tracks[trackId]?.engagement?.keyword : (brand.engagement?.enabled ? brand.engagement.keyword : null);
    const usesKeyword = keyword && new RegExp(`\\b${keyword}\\b`).test(s.text) && /comment/i.test(s.text);
    for (const rule of (trackId && tracks[trackId]?.forbidden) || []) {
      if (rule.re.test(s.text) || rule.re.test(s.on_screen_text || '')) {
        flags.push({ code: 'misleading_promise', severity: 'error', message: rule.why, segment: i });
      }
    }
    if (!usesKeyword && /\bcomment\b.{0,40}\b(likho|karo|below|for|to get)\b|\bcomment (mein|me|below)\b/i.test(s.text)) {
      flags.push({ code: 'comment_bait', severity: 'error', message: 'Asks viewers to comment for a freebie that does not exist. Use the normal call to action.', segment: i });
    }
    if (/https?:\/\/|www\.|\.(com|in|ai|io)\b/i.test(s.text)) {
      flags.push({ code: 'spoken_url', severity: 'warn', message: 'A URL is spoken aloud; say "link in bio" / "link in the caption" instead.', segment: i });
    }
    if (!brand.presenterName && /\b(my name is|mera naam|i am [A-Z][a-z]+ from|main [A-Z][a-z]+ hoon)\b/.test(s.text)) {
      flags.push({ code: 'presenter_named', severity: 'error', message: 'The presenter introduces themselves by name; the avatar has no approved name.', segment: i });
    }
  });

  if (audience.language === 'hinglish') {
    const ratio = hinglishRatio(all);
    if (ratio < 0.12) {
      flags.push({ code: 'not_hinglish', severity: 'error', message: `Reads as plain English (${Math.round(ratio * 100)}% Hindi words); B2C reels are in Hinglish.` });
    }
  }

  return flags;
}

// Copy guard for scripts inspired by another creator's reel: any run of 5+
// words shared with their transcript is an error. We borrow what made the
// reel work (hook device, structure, topic), never its lines.
const COPY_RUN = 5;

function tokens(text) {
  return String(text || '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
}

export function copiedPhrases(segments, sourceText) {
  const src = tokens(sourceText);
  if (src.length < COPY_RUN) return [];
  const grams = new Set();
  for (let i = 0; i + COPY_RUN <= src.length; i++) grams.add(src.slice(i, i + COPY_RUN).join(' '));
  const flags = [];
  segments.forEach((seg, s) => {
    const t = tokens(seg.text);
    for (let i = 0; i + COPY_RUN <= t.length; i++) {
      const g = t.slice(i, i + COPY_RUN).join(' ');
      if (grams.has(g)) {
        flags.push({ code: 'copied_phrase', severity: 'error', message: `Same wording as the source reel: "${g}…". Rephrase in our own words.`, segment: s });
        break;
      }
    }
  });
  return flags;
}

// The 5-word guard cannot see a translation (their English reel retold in
// Hinglish). Claude compares meaning across languages: same topic and
// technique is fine; the same examples/list/sequence is not.
export async function originalityFlags(segments, sourceText, chatJson, model) {
  if (!sourceText || sourceText.length < 80) return [];
  const out = await chatJson({
    model,
    temperature: 0,
    maxTokens: 600,
    user: `Compare a NEW short-video script with a SOURCE reel transcript (they may be in different languages: English, Hindi, Hinglish).

ALLOWED overlap (never counts as copying): the same topic, tool, product or news; the same hook technique; the same overall structure (intro → examples → how to start → call to action); factual steps anyone would give (e.g. "open the app, install the plugin").

COPYING (the only thing you score): the source's specific creative content reused, translated or reworded: its particular examples or demos, its list items, its sequence of specific points, its jokes, stories or distinctive lines.

Different examples of the same kind (the source animates a perfume bottle, the new script animates a cup of chai) are NOT copying. Having a list of examples at all is structure, not copying. The tool's main selling point is part of the topic, not copying.

First list the allowed overlaps, then the copied elements, then score ONLY the copied elements 0-10 (0 = no specific content reused; 5 = one or two specific examples reused; 10 = a translation or paraphrase of the whole reel).

NEW SCRIPT:
${segments.map((s) => s.text).join(' ')}

SOURCE TRANSCRIPT:
${sourceText.slice(0, 4000)}

Reply with JSON only: {"allowed": ["..."], "copied": ["short description of each copied element"], "score": <0-10>}`,
  });
  const score = Number(out?.score);
  if (!(score >= 7) || !Array.isArray(out?.copied) || out.copied.length === 0) return [];
  const what = Array.isArray(out.copied) && out.copied.length ? ` Copied: ${out.copied.slice(0, 3).join('; ')}.` : '';
  return [{ code: 'too_close_to_source', severity: 'error', message: `Too close to the source reel (${score}/10): it retells their content instead of using their technique.${what} Use your own examples and points.` }];
}

export function hasErrors(flags) {
  return flags.some((f) => f.severity === 'error');
}
