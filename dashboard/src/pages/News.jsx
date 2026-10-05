import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, EyeOff, Sparkles } from 'lucide-react';
import { api } from '../api/client.js';
import { ErrorBox, PageHeader, Spinner, timeAgo, useLoad } from '../components/ui.jsx';

function Score({ label, value, color }) {
  if (value === null || value === undefined) return <span className="font-mono text-xs text-muted">{label} –</span>;
  return (
    <span className="font-mono text-xs" style={{ color: value >= 7 ? color : 'var(--c-muted)' }}>
      {label} <strong className="text-sm">{value}</strong>
    </span>
  );
}

export default function News() {
  const navigate = useNavigate();
  const [audience, setAudience] = useState('');
  const [days, setDays] = useState(3);
  const [items, error, reload] = useLoad(() => api.news({ days, ...(audience && { audience }) }), [audience, days]);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  const draftFor = async (item, aud) => {
    setBusy(`${item.id}:${aud}`);
    setActionError(null);
    try {
      const script = await api.createScript({ audience: aud, kind: 'news', news_item_id: item.id });
      navigate(`/scripts/${script.id}`);
    } catch (e) {
      setActionError(e);
      setBusy(null);
    }
  };

  const dismiss = async (item) => {
    try { await api.dismissNews(item.id); reload(); } catch (e) { setActionError(e); }
  };

  return (
    <>
      <PageHeader title="AI news" sub="Synced at 6:00 IST daily, or any time with Sync news in the sidebar. Draft a reel from any story." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="label">Sort by</span>
        {[['', 'Best for either'], ['b2b', 'B2B score'], ['b2c', 'B2C score']].map(([v, label]) => (
          <button key={v} className={`btn ${audience === v ? 'btn-primary' : ''}`} onClick={() => setAudience(v)}>{label}</button>
        ))}
        <select className="input ml-auto w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time range">
          <option value={1}>Last 24 hours</option>
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
        </select>
      </div>

      <div className="mb-4 grid gap-2"><ErrorBox error={error} /><ErrorBox error={actionError} /></div>
      {!items && !error && <div className="flex items-center gap-2 text-muted"><Spinner /> Loading</div>}
      {items && items.length === 0 && <div className="card p-8 text-center text-sm text-muted">No news yet. Click <strong>Fetch now</strong>.</div>}

      <ul className="grid gap-3">
        {(items || []).map((n) => (
          <li key={n.id} className="card p-4" style={{ opacity: n.status === 'used' ? 0.65 : 1 }}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <a href={n.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 font-medium hover:underline">
                  {n.title} <ExternalLink size={13} className="mt-1 shrink-0 text-muted" />
                </a>
                <div className="mt-1 text-xs text-muted">
                  {n.source} · {timeAgo(n.published_at || n.fetched_at)}
                  {n.status === 'used' && ' · reel drafted'}
                  {!n.content_length && ' · headline only, fact check will be limited'}
                </div>
              </div>
              <div className="flex shrink-0 gap-3">
                <Score label="B2B" value={n.b2b_score} color="var(--c-b2b)" />
                <Score label="B2C" value={n.b2c_score} color="var(--c-b2c)" />
              </div>
            </div>

            {(n.b2b_angle || n.b2c_angle) && (
              <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {n.b2b_angle && <div><dt className="label" style={{ color: 'var(--c-b2b)' }}>B2B angle</dt><dd>{n.b2b_angle}</dd></div>}
                {n.b2c_angle && <div><dt className="label" style={{ color: 'var(--c-b2c)' }}>B2C angle</dt><dd>{n.b2c_angle}</dd></div>}
              </dl>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {['b2b', 'b2c'].map((aud) => (
                <button key={aud} className="btn" disabled={!!busy} onClick={() => draftFor(n, aud)}>
                  {busy === `${n.id}:${aud}` ? <><Spinner size={14} /> Writing (~40s)</> : <><Sparkles size={14} /> {aud.toUpperCase()} reel</>}
                </button>
              ))}
              <button className="btn ml-auto text-muted" onClick={() => dismiss(n)} disabled={!!busy}><EyeOff size={14} /> Dismiss</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
