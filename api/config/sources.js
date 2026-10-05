// RSS sources for the daily AI news run. Keep these to sources that publish
// full or substantial summaries in the feed: the fact check can only confirm
// a claim against text it actually has.
//
// Checked September 2026. Left out on purpose: VentureBeat (answers bots
// with 429), Analytics India Magazine (malformed XML) and the Google blog
// feed (redirects and times out); DeepMind's feed covers Google's AI news.
export const sources = [
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { name: 'AI News', url: 'https://www.artificialintelligence-news.com/feed/' },
  { name: 'Hacker News (AI, 150+ points)', url: 'https://hnrss.org/newest?q=AI+OR+LLM+OR+OpenAI+OR+Anthropic+OR+Gemini&points=150' },
  { name: 'Economic Times AI', url: 'https://economictimes.indiatimes.com/tech/artificial-intelligence/rssfeeds/119215726.cms' },
  { name: 'Inc42', url: 'https://inc42.com/feed/' },
];

// Articles older than this are skipped at ingest: a reel about week-old AI
// news is already stale on Instagram.
export const MAX_ARTICLE_AGE_HOURS = 72;
