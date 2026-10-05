import Parser from 'rss-parser';
import pool from '../db.js';
import { sources, MAX_ARTICLE_AGE_HOURS } from '../config/sources.js';
import { htmlToText, extractArticleText } from '../lib/text.js';

const parser = new Parser();
const USER_AGENT = 'Mozilla/5.0 (compatible; PilaniLabsReelsAgent/0.1; +https://www.pilanilabs.com)';

// Fetched with fetch() rather than parser.parseURL: DeepMind and Economic
// Times hang on rss-parser's own HTTP client, and it doesn't follow redirects
// the way fetch does.
async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(20_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parser.parseString(await res.text());
}

// Feeds usually carry only a teaser; the fact check needs the article body.
// A site that blocks the fetch still leaves the feed text to work with.
async function fetchArticleBody(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return '';
    return extractArticleText(await res.text());
  } catch {
    return '';
  }
}

// Hacker News items link to the discussion page in <comments> and to the
// article itself in <link>; either way the article is what we store.
function itemUrl(item) {
  return (item.link || item.guid || '').trim();
}

// Runs fn over items with at most `limit` in flight: article pages are the
// slow part (one slow site used to hold up the whole run).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const PER_SOURCE = 12;

async function ingestSource(source, cutoff) {
  const feed = await fetchFeed(source.url);
  const fresh = feed.items.filter((item) => {
    const t = Date.parse(item.isoDate || item.pubDate || '');
    return itemUrl(item) && (!Number.isFinite(t) || t >= cutoff);
  }).slice(0, PER_SOURCE);

  const { rows: existing } = await pool.query('SELECT url FROM news_items WHERE url = ANY($1)', [fresh.map(itemUrl)]);
  const known = new Set(existing.map((r) => r.url));
  const todo = fresh.filter((item) => !known.has(itemUrl(item)));

  const added = await mapLimit(todo, 4, async (item) => {
    const url = itemUrl(item);
    const summary = htmlToText(item.contentSnippet || item.summary || item.content || '').slice(0, 1500);
    const feedBody = htmlToText(item['content:encoded'] || item.content || '');
    const pageBody = feedBody.length > 1500 ? '' : await fetchArticleBody(url);
    const content = (pageBody.length > feedBody.length ? pageBody : feedBody).slice(0, 12000);
    const published = Date.parse(item.isoDate || item.pubDate || '');

    const { rowCount } = await pool.query(
      `INSERT INTO news_items (url, source, title, summary, content, published_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (url) DO NOTHING`,
      [url, source.name, htmlToText(item.title || '').slice(0, 500), summary, content || null,
        Number.isFinite(published) ? new Date(published) : null],
    );
    return rowCount;
  });
  return added.reduce((a, b) => a + b, 0);
}

export async function ingestNews() {
  const cutoff = Date.now() - MAX_ARTICLE_AGE_HOURS * 3600_000;
  const perSource = {};

  const results = await Promise.allSettled(sources.map((s) => ingestSource(s, cutoff)));
  let inserted = 0;
  results.forEach((r, i) => {
    const name = sources[i].name;
    if (r.status === 'fulfilled') {
      perSource[name] = r.value;
      inserted += r.value;
    } else {
      // One dead feed should not stop the others.
      perSource[name] = `error: ${r.reason?.message || r.reason}`;
      console.error(`[ingest] ${name}: ${r.reason?.message || r.reason}`);
    }
  });

  return { inserted, perSource };
}
