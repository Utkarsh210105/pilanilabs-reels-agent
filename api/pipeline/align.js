import { phoneticKey } from './transliterate.js';

// Lines the script's words up with Whisper's timed words.
//
// Captions show the script text (spelled the way we wrote it), not Whisper's
// transcript, so each script word needs a time. Whisper's words are matched
// to script words with a fuzzy LCS; script words with no match ("forty
// percent" vs "40%", or a Hinglish word Whisper spelled differently) get times
// spread evenly between the matched words around them.

// \p{M} keeps Devanagari vowel signs (ा ि े...), which are marks, not letters.
export function normWord(w) {
  return String(w).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function similar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  // Short words ("the"/"then", "ho"/"hi") differ by one letter and mean
  // different things, so they must match exactly.
  if (Math.min(a.length, b.length) <= 3) return false;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length) >= 0.75;
}

// Longest common subsequence under similar(); returns [scriptIndex, asrIndex] pairs.
function matchPairs(script, asr) {
  const n = script.length;
  const m = asr.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = similar(script[i], asr[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (similar(script[i], asr[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

// segments: the script's segments; asrWords: [{ word, start, end }];
// duration: the audio length in seconds.
export function alignScript(segments, asrWords, duration) {
  const words = [];
  segments.forEach((seg, s) => {
    for (const w of seg.text.split(/\s+/).filter(Boolean)) words.push({ w, seg: s, start: null, end: null });
  });
  const asr = asrWords.filter((w) => normWord(w.word));
  // Compared by a loose phonetic key, which also turns Whisper's Devanagari
  // (for Hindi speech) into Roman so it can match a Roman Hinglish script.
  const pairs = matchPairs(words.map((w) => phoneticKey(normWord(w.w))), asr.map((w) => phoneticKey(normWord(w.word))));
  for (const [i, j] of pairs) {
    words[i].start = asr[j].start;
    words[i].end = asr[j].end;
  }

  // Fill unmatched runs by spreading them evenly across the gap between the
  // neighbouring matched words (or the start/end of the speech).
  const speechStart = asr[0]?.start ?? 0;
  const speechEnd = asr[asr.length - 1]?.end ?? duration;
  let i = 0;
  while (i < words.length) {
    if (words[i].start !== null) { i++; continue; }
    let k = i;
    while (k < words.length && words[k].start === null) k++;
    const from = i > 0 ? words[i - 1].end : speechStart;
    const to = k < words.length ? words[k].start : speechEnd;
    const step = Math.max(0, to - from) / (k - i);
    for (let x = i; x < k; x++) {
      words[x].start = from + step * (x - i);
      words[x].end = from + step * (x - i + 1);
    }
    i = k;
  }

  // A segment runs from its first word to the next segment's first word, so
  // B-roll covers the pause after a line too; the last one runs to the end.
  const segTimes = segments.map((_, s) => {
    const first = words.find((w) => w.seg === s);
    return { start: first ? first.start : 0, end: 0 };
  });
  segTimes.forEach((t, s) => {
    t.end = s + 1 < segTimes.length ? segTimes[s + 1].start : Math.max(duration, t.start);
  });
  if (segTimes.length) segTimes[0].start = 0;

  const round = (x) => Math.round(x * 1000) / 1000;
  return {
    duration: round(duration),
    match_ratio: words.length ? round(pairs.length / words.length) : 0,
    words: words.map((w) => ({ w: w.w, start: round(w.start), end: round(w.end), seg: w.seg })),
    segments: segTimes.map((t) => ({ start: round(t.start), end: round(t.end) })),
  };
}
