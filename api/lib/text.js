const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '...', ndash: '-', mdash: '-' };

export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function htmlToText(html) {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|figure|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|br)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// Best-effort article body: the <p> text inside <article> if there is one,
// otherwise every <p> on the page. Paragraphs under 60 characters are mostly
// bylines, captions and "Sign up" boxes, so they are dropped.
export function extractArticleText(html, maxChars = 12000) {
  const scope = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  const paras = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => htmlToText(m[1]))
    .filter((p) => p.length >= 60);
  return paras.join('\n').slice(0, maxChars);
}
