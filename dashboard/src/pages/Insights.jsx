import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../api/client.js';
import { AudienceChip, ErrorBox, PageHeader, Spinner, timeAgo, useLoad } from '../components/ui.jsx';

const num = (n) => (n == null ? '–' : Number(n) >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

function Stat({ label, value, note }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  );
}

function LinkScript({ media, onLinked }) {
  const [open, setOpen] = useState(false);
  const [scripts, setScripts] = useState(null);
  useEffect(() => { if (open && !scripts) api.linkableScripts().then(setScripts).catch(() => setScripts([])); }, [open, scripts]);
  if (!open) return <button className="text-xs text-muted underline hover:text-ink" onClick={() => setOpen(true)}>Link to script</button>;
  return (
    <select className="input w-full py-1 text-xs" defaultValue="" onChange={async (e) => { if (e.target.value) { await api.linkMedia(media.id, e.target.value); onLinked(); } }} aria-label="Script">
      <option value="">{scripts ? 'Choose the script that made this reel…' : 'Loading…'}</option>
      {(scripts || []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
    </select>
  );
}

export default function Insights() {
  const [data, error, reload] = useLoad(() => api.insights());
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState('REELS');

  const refresh = async () => {
    setSyncing(true);
    try {
      await api.syncInsights();
      // The sync takes ~10-30s; check back until the timestamp moves.
      const before = data?.synced_at;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const d = await api.insights();
        if (!d.syncing && d.synced_at !== before) break;
      }
    } finally { setSyncing(false); reload(); }
  };

  const media = (data?.media || []).filter((m) => filter === 'ALL' || m.product_type === filter);
  const lowWatch = (data?.media || []).filter((m) => m.product_type === 'REELS' && m.avg_watch_s != null && m.avg_watch_s < 8).length;

  return (
    <>
      <PageHeader title="Insights" sub={`From Instagram, refreshed every 6 hours.${data?.synced_at ? ` Last update ${timeAgo(data.synced_at)}.` : ''}`}>
        <button className="btn" onClick={refresh} disabled={syncing}>{syncing ? <Spinner size={14} /> : <RefreshCw size={14} />} {syncing ? 'Refreshing…' : 'Refresh now'}</button>
      </PageHeader>
      <ErrorBox error={error} />
      {!data && !error && <div className="flex items-center gap-2 text-muted"><Spinner /> Loading</div>}
      {data && !data.synced_at && (
        <div className="card p-8 text-center text-sm text-muted">No data yet. Click <strong>Refresh now</strong> (Instagram must be connected with the insights permission).</div>
      )}

      {data?.synced_at && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Followers" value={num(data.followers)} note={data.followers_change_7d != null ? `${data.followers_change_7d >= 0 ? '+' : ''}${data.followers_change_7d} this week` : 'growth shows after a week'} />
            <Stat label="Reels · 30 days" value={data.reels_30d} />
            <Stat label="Views · 30 days" value={num(data.views_30d)} note={`your usual reel: ${num(data.usual_views)} views`} />
            <Stat label="Shares + saves" value={num(data.shares_saves_30d)} note="30 days" />
            <Stat label="Leads · 30 days" value={num(data.leads_30d)} note="from AI/JOB comments" />
          </div>

          {lowWatch > 0 && (
            <div className="card mb-4 flex items-start gap-2 p-3 text-sm" style={{ borderColor: 'var(--c-warn)' }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--c-warn)' }} />
              <span><strong>{lowWatch} reel{lowWatch === 1 ? '' : 's'} held people for under 8 seconds on average.</strong> The first 3 seconds and the length are the biggest levers: put the hook on screen in the first frame and aim for 25–35 second reels.</span>
            </div>
          )}

          {data.by_series.length > 0 && (
            <section className="card mb-4 p-4">
              <h2 className="label mb-2">What's working, by series</h2>
              <ul className="grid gap-1 text-sm">
                {data.by_series.map((g) => (
                  <li key={g.series} className="flex flex-wrap gap-x-4">
                    <span className="min-w-40 font-medium">{g.series}</span>
                    <span className="font-mono text-muted">{g.reels} reels · avg {num(g.avg_views)} views · {g.shares_saves} shares+saves · {g.leads} leads</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Reels are grouped once they are linked to their script (posted from the dashboard, or "Link to script" below).</p>
            </section>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {[['REELS', 'Reels'], ['FEED', 'Posts'], ['ALL', 'All']].map(([v, l]) => (
              <button key={v} className={`btn ${filter === v ? 'btn-primary' : ''}`} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>

          <ul className="grid gap-2">
            {media.map((m) => (
              <li key={m.id} className="card flex min-w-0 gap-3 p-3">
                <a href={m.permalink} target="_blank" rel="noreferrer" className="shrink-0 overflow-hidden rounded-md bg-hover" style={{ width: 64, aspectRatio: m.product_type === 'REELS' ? '9 / 16' : '1 / 1' }}>
                  {m.thumbnail_url && <img src={m.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" />}
                </a>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {m.audience && <AudienceChip audience={m.audience} />}
                    {m.track === 'first-job' && <span className="chip" style={{ color: 'var(--c-gold-ink)' }}>Pehli Job</span>}
                    <span>{m.posted_at ? timeAgo(m.posted_at) : ''}</span>
                    {m.vs_usual != null && <span className="chip" style={{ color: m.vs_usual >= 1.5 ? 'var(--c-ok)' : m.vs_usual < 0.6 ? 'var(--c-bad)' : 'var(--c-muted)' }}>{m.vs_usual}x usual</span>}
                    <a href={m.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">Open <ExternalLink size={11} /></a>
                  </div>
                  <div className="truncate text-sm font-medium">
                    {m.script_id ? <Link to={`/scripts/${m.script_id}`} className="hover:underline">{m.script_title}</Link> : (m.caption || '').split('\n')[0] || 'Untitled post'}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
                    <span><strong>{num(m.views)}</strong> views</span>
                    <span>{num(m.reach)} reach</span>
                    {m.avg_watch_s != null && <span style={{ color: m.avg_watch_s < 8 ? 'var(--c-warn)' : undefined }}>{m.avg_watch_s}s avg watch{m.watch_pct != null ? ` (${m.watch_pct}%)` : ''}</span>}
                    <span>{num(m.likes)} likes</span>
                    <span>{num(m.comments)} comments</span>
                    <span>{num(m.shares)} shares</span>
                    <span>{num(m.saved)} saves</span>
                    {m.engagement_pct != null && <span>{m.engagement_pct}% engaged</span>}
                    {m.script_id && <span>{m.leads || 0} leads</span>}
                  </div>
                  {!m.script_id && m.product_type === 'REELS' && <div className="mt-2 max-w-sm"><LinkScript media={m} onLinked={reload} /></div>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
