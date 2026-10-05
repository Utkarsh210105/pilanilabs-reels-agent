// Burned-in captions as an ASS subtitle file (rendered by ffmpeg's libass).
//
// Captions show the script text in chunks of up to 3 words, with the word
// being spoken highlighted in PilaniLabs gold. Each segment's on-screen text
// shows as a gold banner near the top while that segment plays.
//
// Positions keep clear of the Instagram/YouTube Shorts UI: nothing in the
// bottom ~420px (caption, buttons) or the top ~220px (header).

const W = 1080;
const H = 1920;
const GOLD = '&H004BB8F2'; // #F2B84B as ASS &HAABBGGRR
const WHITE = '&H00FFFFFF';
const BLACK = '&H00000000';
const INK = '&H000F0A0A';

function ts(sec) {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

// ASS treats {} as override blocks and \ as an escape.
function esc(text) {
  return String(text).replace(/\\/g, '/').replace(/[{}]/g, '').replace(/\n/g, ' ');
}

// Groups a segment's words into short caption chunks: at most 3 words or ~18
// characters, and always breaking after punctuation.
export function chunkWords(words) {
  const chunks = [];
  let cur = [];
  const len = (arr) => arr.reduce((n, w) => n + w.w.length + 1, 0);
  for (const w of words) {
    if (cur.length && (cur.length >= 3 || len(cur) + w.w.length > 18 || cur[0].seg !== w.seg)) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
    if (/[.,!?;:]$/.test(w.w)) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// ---- Cards drawn over B-roll -------------------------------------------
// Both are ASS vector drawings and text on top of the playing B-roll, with a
// dark scrim over the footage so the card reads. They slide up and fade in.

const PUBLISHERS = {
  'techcrunch.com': 'TechCrunch', 'theverge.com': 'The Verge', 'openai.com': 'OpenAI',
  'deepmind.google': 'Google DeepMind', 'blog.google': 'Google', 'inc42.com': 'Inc42',
  'economictimes.indiatimes.com': 'Economic Times', 'artificialintelligence-news.com': 'AI News',
  'anthropic.com': 'Anthropic', 'reuters.com': 'Reuters', 'bloomberg.com': 'Bloomberg',
  'wired.com': 'WIRED', 'arstechnica.com': 'Ars Technica', 'nytimes.com': 'The New York Times',
};

// "Hacker News (AI, 150+ points)" is our feed, not the publisher: name the
// site the article is actually on.
export function publisherName(url, fallback) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const known = Object.entries(PUBLISHERS).find(([d]) => host === d || host.endsWith(`.${d}`));
    if (known) return known[1];
    const base = host.split('.').slice(-2, -1)[0] || host;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return fallback?.replace(/\s*\(.*\)$/, '') || '';
  }
}

// Splits "40% cost drop" into { value: "40%", label: "cost drop" }; null if
// the on-screen text has no number.
export function parseStat(text) {
  const m = String(text || '').match(/(?:₹\s?)?\d+(?:[.,]\d+)?(?:\/\d+)?\s?(?:%|x|×|\+|k|K|M|B|cr)?/);
  if (!m) return null;
  const value = m[0].trim();
  const label = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  return { value, label };
}

function wrap(text, perLine, maxLines) {
  const lines = [];
  let cur = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + word).length > perLine) { lines.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s,.;:]+\S*$/, '')}…`;
  }
  return lines;
}

function roundRect(x, y, w, h, r) {
  const X = x + w;
  const Y = y + h;
  return `m ${x + r} ${y} l ${X - r} ${y} b ${X} ${y} ${X} ${y} ${X} ${y + r} l ${X} ${Y - r} b ${X} ${Y} ${X} ${Y} ${X - r} ${Y} l ${x + r} ${Y} b ${x} ${Y} ${x} ${Y} ${x} ${Y - r} l ${x} ${y + r} b ${x} ${y} ${x} ${y} ${x + r} ${y}`;
}

// Slide up 40px and fade: every piece of a card gets the same move so they
// travel together.
const slide = (x, y) => `\\move(${x},${y + 40},${x},${y},0,280)\\fad(220,200)`;

function scrim(start, end, alpha) {
  return `Dialogue: 3,${ts(start)},${ts(end)},Draw,,0,0,0,,{\\an7\\pos(0,0)\\p1\\c&H000000&\\1a&H${alpha}&\\fad(250,200)}m 0 0 l ${W} 0 ${W} ${H} 0 ${H}{\\p0}`;
}

export function headlineCardEvents({ start, end, source, headline, fontName }) {
  const x = 90;
  const y = 430;
  const w = W - 2 * x;
  const lines = wrap(headline, 28, 4);
  const chipText = source.toUpperCase();
  const chipW = Math.min(w - 96, 60 + chipText.length * 25);
  const h = 44 + 62 + 30 + lines.length * 78 + 44;
  return [
    scrim(start, end, '60'),
    `Dialogue: 4,${ts(start)},${ts(end)},Draw,,0,0,0,,{\\an7${slide(0, 0)}\\p1\\c&HFFFFFF&\\bord0\\shad6\\4c&H000000&\\4a&HA0&}${roundRect(x, y, w, h, 34)}{\\p0}`,
    `Dialogue: 5,${ts(start)},${ts(end)},Draw,,0,0,0,,{\\an7${slide(0, 0)}\\p1\\c${GOLD}\\bord0\\shad0}${roundRect(x + 48, y + 44, chipW, 62, 31)}{\\p0}`,
    `Dialogue: 6,${ts(start)},${ts(end)},CardChip,,0,0,0,,{\\an4\\q2${slide(x + 48 + 30, y + 44 + 31)}}${esc(chipText)}`,
    `Dialogue: 6,${ts(start)},${ts(end)},CardText,,0,0,0,,{\\an7\\q2${slide(x + 48, y + 44 + 62 + 30)}}${lines.map(esc).join('\\N')}`,
  ];
}

export function numberCardEvents({ start, end, stat }) {
  const events = [scrim(start, end, '80')];
  const cy = 700;
  // Count up for plain whole numbers ("40%", "3x", "20"), not years or
  // fractions: "1941" counting up from 0 would read as nonsense.
  const m = stat.value.match(/^(\d+)(\s?(?:%|x|×|\+|k|K|M|B|cr)?)$/);
  const n = m ? Number(m[1]) : null;
  const countUp = n !== null && n >= 10 && !(n >= 1900 && n <= 2100);
  const steps = countUp ? 10 : 0;
  const stepLen = 0.06;
  for (let k = 1; k <= steps; k++) {
    const t0 = start + (k - 1) * stepLen;
    const shown = `${Math.round((n * k) / steps)}${m[2]}`;
    const fx = k === 1 ? `\\fad(150,0)` : '';
    events.push(`Dialogue: 6,${ts(t0)},${ts(t0 + stepLen)},StatValue,,0,0,0,,{\\an5\\pos(${W / 2},${cy})${fx}}${esc(shown)}`);
  }
  const valueStart = start + steps * stepLen;
  events.push(`Dialogue: 6,${ts(valueStart)},${ts(end)},StatValue,,0,0,0,,{\\an5\\pos(${W / 2},${cy})\\fad(${steps ? 0 : 200},200)}${esc(stat.value)}`);
  if (stat.label) {
    const lines = wrap(stat.label, 20, 2);
    events.push(`Dialogue: 6,${ts(start + 0.15)},${ts(end)},StatLabel,,0,0,0,,{\\an8\\q2${slide(W / 2, cy + 140)}}${lines.map(esc).join('\\N')}`);
  }
  return events;
}

// Which B-roll lines get which card. The first B-roll line of a news reel
// gets the headline; B-roll lines whose on-screen text has a number get a
// number card. The dashboard shows the same assignment.
export function planCards({ segments, news }) {
  const plan = {};
  const brollIdx = segments.map((s, i) => (s.visual === 'broll' ? i : -1)).filter((i) => i >= 0);
  if (news?.title && brollIdx.length) plan[brollIdx[0]] = { type: 'headline' };
  for (const i of brollIdx) {
    if (plan[i]) continue;
    const stat = parseStat(segments[i].on_screen_text);
    if (stat) plan[i] = { type: 'number', stat };
  }
  return plan;
}

export function buildAss({ timings, segments, news = null, fontName = 'Arial' }) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${fontName},82,${WHITE},${WHITE},${BLACK},&H80000000,-1,0,0,0,100,100,0,0,1,7,3,2,90,90,560,1
Style: Banner,${fontName},60,${INK},${INK},${GOLD},${GOLD},-1,0,0,0,100,100,0,0,3,18,0,8,120,120,300,1
Style: Draw,${fontName},20,${WHITE},${WHITE},${BLACK},${BLACK},0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: CardChip,${fontName},34,${INK},${INK},${BLACK},${BLACK},-1,0,0,0,100,100,1,0,1,0,0,4,0,0,0,1
Style: CardText,${fontName},64,${INK},${INK},${BLACK},${BLACK},-1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: StatValue,${fontName},230,${GOLD},${GOLD},${INK},&H64000000,-1,0,0,0,100,100,0,0,1,6,6,5,0,0,0,1
Style: StatLabel,${fontName},72,${WHITE},${WHITE},${INK},&H64000000,-1,0,0,0,100,100,0,0,1,5,3,8,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = [];
  const chunks = chunkWords(timings.words);
  chunks.forEach((chunk, c) => {
    const next = chunks[c + 1];
    const last = chunk[chunk.length - 1];
    // Hold a chunk until the next one starts, but not through a long pause.
    const chunkEnd = next ? Math.min(next[0].start, last.end + 0.6) : last.end + 0.4;
    chunk.forEach((word, i) => {
      const start = i === 0 ? word.start : word.start;
      const end = i + 1 < chunk.length ? chunk[i + 1].start : chunkEnd;
      if (end <= start) return;
      const text = chunk
        .map((w, k) => (k === i ? `{\\c${GOLD}}${esc(w.w)}{\\c${WHITE}}` : esc(w.w)))
        .join(' ');
      // Layer 10: captions stay above the cards and scrims.
      events.push(`Dialogue: 10,${ts(start)},${ts(end)},Caption,,0,0,0,,${text}`);
    });
  });

  const cards = planCards({ segments, news });
  segments.forEach((seg, s) => {
    const t = timings.segments[s];
    if (!t) return;
    const card = cards[s];
    if (card?.type === 'headline') {
      events.push(...headlineCardEvents({ start: t.start + 0.1, end: Math.min(t.end, t.start + 5), source: news.source, headline: news.title, fontName }));
      return;
    }
    if (card?.type === 'number') {
      events.push(...numberCardEvents({ start: t.start + 0.1, end: Math.min(t.end, t.start + 3.8), stat: card.stat }));
      return;
    }
    if (!seg.on_screen_text) return;
    const end = Math.min(t.end, t.start + 3.5);
    events.push(`Dialogue: 1,${ts(t.start + 0.15)},${ts(end)},Banner,,0,0,0,,{\\fad(120,120)}${esc(seg.on_screen_text)}`);
  });

  return header + events.join('\n') + '\n';
}
