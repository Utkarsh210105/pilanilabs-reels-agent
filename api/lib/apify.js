// Apify Instagram Reel scraper — the same actor the Namhya engine uses. It
// returns a public account's reels with real view counts (videoPlayCount)
// and a downloadable videoUrl.
const INSTAGRAM_REELS_ACTOR = 'apify~instagram-reel-scraper';

export async function scrapeInstagramReels(username, resultsLimit = 30) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN is not configured');
  const url = `https://api.apify.com/v2/acts/${INSTAGRAM_REELS_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: [username], resultsLimit }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const body = await res.text();
    if (/usage hard limit/i.test(body)) throw new Error('Apify monthly usage limit reached for this token');
    throw new Error(`Apify scrape failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error('Apify returned an unexpected response');
  // A private or missing account comes back as a single { error } item.
  if (items.length === 1 && items[0].error) throw new Error(`Instagram: ${items[0].errorDescription || items[0].error}`);
  return items;
}
