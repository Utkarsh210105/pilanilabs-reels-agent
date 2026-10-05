// Built dashboard is served by the API itself, so same origin (''). The Vite
// dev server (npm run dev in dashboard/) talks to the API on 4100.
const ORIGIN = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4100' : '');
const BASE = `${ORIGIN}/api`;

export const mediaUrl = (rel) => `${ORIGIN}/media/${rel}`;
export const finalDownloadUrl = (id) => `${BASE}/scripts/${id}/final.mp4`;

// Upload with progress (fetch cannot report upload progress).
export function uploadAvatarVideo(id, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${BASE}/scripts/${id}/avatar-video`);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed: could not reach the API'));
    xhr.send(file);
  });
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  config: () => request('/config'),
  jobs: () => request('/jobs'),

  news: (params = {}) => request(`/news?${new URLSearchParams(params)}`),
  dismissNews: (id) => request(`/news/${id}/dismiss`, { method: 'POST' }),
  startSync: () => request('/news/sync', { method: 'POST' }),
  lastSync: () => request('/news/sync'),

  scripts: (params = {}) => request(`/scripts?${new URLSearchParams(params)}`),
  scriptCounts: () => request('/scripts/counts'),
  script: (id) => request(`/scripts/${id}`),
  scriptVersion: (id, v) => request(`/scripts/${id}/versions/${v}`),
  createScript: (body) => request('/scripts', { method: 'POST', body }),
  updateScript: (id, body) => request(`/scripts/${id}`, { method: 'PUT', body }),
  rewriteScript: (id, feedback) => request(`/scripts/${id}/rewrite`, { method: 'POST', body: { feedback } }),
  recheckScript: (id) => request(`/scripts/${id}/recheck`, { method: 'POST' }),
  setStatus: (id, body) => request(`/scripts/${id}/status`, { method: 'POST', body }),
  matchBroll: (id, force = false) => request(`/scripts/${id}/broll`, { method: 'POST', body: { force } }),
  chooseBroll: (id, segment, clip) => request(`/scripts/${id}/broll/${segment}`, { method: 'PUT', body: { clip } }),
  searchBroll: (q) => request(`/scripts/broll-search?${new URLSearchParams({ q })}`),
  leads: (params = {}) => request(`/leads?${new URLSearchParams(params)}`),
  leadsSummary: () => request('/leads/summary'),
  leadsSetup: () => request('/leads/setup'),
  updateLead: (id, body) => request(`/leads/${id}`, { method: 'PATCH', body }),
  creators: () => request('/creators'),
  addCreator: (body) => request('/creators', { method: 'POST', body }),
  removeCreator: (id) => request(`/creators/${id}`, { method: 'DELETE' }),
  scrapeCreator: (id) => request(`/creators/${id}/scrape`, { method: 'POST' }),
  scrapeStatus: () => request('/creators/scrape-status'),
  creatorReels: (params = {}) => request(`/creators/reels?${new URLSearchParams(params)}`),
  dismissReel: (id) => request(`/creators/reels/${id}/dismiss`, { method: 'POST' }),
  renderStatus: (id) => request(`/scripts/${id}/render`),
  rerender: (id) => request(`/scripts/${id}/render`, { method: 'POST' }),
  heygenText: (id, script) => request(`/scripts/${id}/heygen${script ? `?script=${script}` : ''}`),
};
