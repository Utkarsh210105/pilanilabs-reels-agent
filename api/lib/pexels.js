// Pexels video search (https://www.pexels.com/api/documentation/#videos-search).
// Free for commercial use, no attribution required; we still keep the
// creator's name with every pick so it can be credited in the caption.

function bestFile(video) {
  const mp4s = (video.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.width && f.height);
  // Closest to 1080x1920 without going above 1920 tall (4K files are huge
  // and get scaled down anyway).
  const usable = mp4s.filter((f) => Math.max(f.width, f.height) <= 1920);
  const pool = usable.length ? usable : mp4s;
  return pool.sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;
}

function toClip(video) {
  const file = bestFile(video);
  if (!file) return null;
  const preview = (video.video_files || [])
    .filter((f) => f.file_type === 'video/mp4' && f.height && f.height <= 960)
    .sort((a, b) => b.height - a.height)[0];
  // Pexels returns ~15 frames spread across the clip. The picker looks at the
  // start, middle and end: a single thumbnail can show hands on a résumé
  // while a second later someone talks to camera.
  const pics = (video.video_pictures || []).map((p) => p.picture).filter(Boolean);
  const frames = pics.length >= 3
    ? [pics[1] ?? pics[0], pics[Math.floor(pics.length / 2)], pics[pics.length - 2]].map((u) => `${u}?auto=compress&w=320`)
    : [];
  // The uploader's title, from the page URL slug ("person-doing-truck-engine-7565179").
  // Small dark frames are easy to misread (engine valves looked like cipher
  // rotors); the title grounds what the clip actually is.
  const slug = (video.url || '').match(/\/video\/(.+?)-\d+\/?$/)?.[1] || '';
  const title = slug.replace(/-/g, ' ');
  return {
    source: 'pexels',
    id: String(video.id),
    title,
    frames,
    page_url: video.url,
    video_url: file.link,
    preview_video_url: preview?.link || file.link,
    preview_url: video.image,
    width: file.width,
    height: file.height,
    duration: video.duration,
    credit: video.user?.name ? `${video.user.name} / Pexels` : 'Pexels',
  };
}

export async function searchPexelsVideos(query, { orientation = 'portrait', perPage = 10 } = {}) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error('PEXELS_API_KEY is not configured');
  const params = new URLSearchParams({ query, orientation, per_page: String(perPage), size: 'medium' });
  const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) throw new Error('Pexels rate limit reached; try again in an hour');
  if (!res.ok) throw new Error(`Pexels search failed (${res.status})`);
  const data = await res.json();
  return (data.videos || []).map(toClip).filter(Boolean);
}
