import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, EyeOff, Plus, RefreshCw, Sparkles, Trash2, TrendingUp } from 'lucide-react';
import { api, mediaUrl } from '../api/client.js';
import { ErrorBox, PageHeader, Spinner, timeAgo, useLoad } from '../components/ui.jsx';

const fmt = (n) => (n == null ? '–' : Number(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Number(n) >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

function ReelCard({ reel, busy, onDraft, onDismiss }) {
  const [open, setOpen] = useState(false);
  const a = reel.analysis;
  const hot = reel.outperform >= 2;
  return (
    <li className="card flex min-w-0 flex-col gap-3 p-3 sm:flex-row" style={{ opacity: reel.status === 'used' ? 0.7 : 1 }}>
      <a href={reel.url} target="_blank" rel="noreferrer" className="relative shrink-0 self-start overflow-hidden rounded-md bg-hover" style={{ width: 96, aspectRatio: '9 / 16' }}>
        {reel.thumbnail && <img src={mediaUrl(reel.thumbnail)} alt="" loading="lazy" className="h-full w-full object-cover" />}
        <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">{fmt(reel.views)}</span>
      </a>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-mono">@{reel.handle}</span>
          <span className="font-mono font-semibold text-ink">{fmt(reel.views)} views</span>
          {reel.outperform != null && (
            <span className="chip" style={{ color: hot ? 'var(--c-ok)' : 'var(--c-muted)' }} title="Views compared with this creator's median reel">
              <TrendingUp size={11} /> {reel.outperform.toFixed(1)}x usual
            </span>
          )}
          {reel.posted_at && <span>{timeAgo(reel.posted_at)}</span>}
          {reel.status === 'used' && <span className="chip">script drafted</span>}
          {reel.status === 'failed' && <span className="chip" style={{ color: 'var(--c-bad)' }} title={reel.error}>analysis failed</span>}
        </div>

        {a ? (
          <>
            <p className="font-medium break-words">"{a.hook_line}"</p>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
              <dt className="label">Hook</dt><dd>{a.hook_device}</dd>
              <dt className="label">Topic</dt><dd>{a.topic}{a.angle ? ` · ${a.angle}` : ''}</dd>
              <dt className="label">Why</dt><dd className="text-muted">{a.why_it_works}</dd>
              {a.pilani_idea && <><dt className="label" style={{ color: 'var(--c-gold-ink)' }}>Our idea</dt><dd>{a.pilani_idea}</dd></>}
            </dl>
            {open && (
              <div className="mt-2 grid gap-2 text-sm">
                {a.beats?.length > 0 && <p><span className="label">Beats </span>{a.beats.join(' → ')}</p>}
                {reel.transcript && <p className="rounded-md bg-hover p-2 text-muted">{reel.transcript}</p>}
              </div>
            )}
            <button className="mt-1 text-xs text-muted underline" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'} transcript and beats</button>
          </>
        ) : (
          <p className="text-sm text-muted">{(reel.caption || '').slice(0, 160) || 'No caption'}{reel.status === 'new' && ' · not analysed (only the top reels are)'}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {a && ['b2c', 'b2b'].map((aud) => (
            <button key={aud} className="btn" disabled={!!busy} onClick={() => onDraft(reel, aud)}>
              {busy === `${reel.id}:${aud}` ? <><Spinner size={14} /> Writing (~40s)</> : <><Sparkles size={14} /> {aud.toUpperCase()} reel</>}
            </button>
          ))}
          <a className="btn" href={reel.url} target="_blank" rel="noreferrer">Watch <ExternalLink size={12} /></a>
          <button className="btn ml-auto text-muted" disabled={!!busy} onClick={() => onDismiss(reel)}><EyeOff size={14} /> Dismiss</button>
        </div>
      </div>
    </li>
  );
}

export default function Creators() {
  const navigate = useNavigate();
  const [creators, cErr, reloadCreators] = useLoad(() => api.creators());
  const [creator, setCreator] = useState('');
  const [sort, setSort] = useState('views');
  const [reels, rErr, reloadReels] = useLoad(() => api.creatorReels({ sort, ...(creator && { creator }) }), [creator, sort]);
  const [handle, setHandle] = useState('');
  const [audience, setAudience] = useState('b2c');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [job, setJob] = useState(null);

  // Follow a running scrape (Apify takes a few minutes).
  useEffect(() => {
    let live = true;
    let timer;
    let wasRunning = false;
    const poll = async () => {
      try {
        const j = await api.scrapeStatus();
        if (!live) return;
        if (wasRunning && j?.status !== 'running') { reloadCreators(); reloadReels(); }
        wasRunning = j?.status === 'running';
        setJob(j);
      } catch { /* shown elsewhere */ }
      if (live) timer = setTimeout(poll, wasRunning ? 4000 : 30_000);
    };
    poll();
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status === 'running']);

  const add = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const c = await api.addCreator({ handle, audience });
      setHandle('');
      reloadCreators();
      await api.scrapeCreator(c.id);
      setJob({ status: 'running', started_at: new Date().toISOString(), detail: c.id });
    } catch (err) { setError(err); }
  };

  const scrape = async (c) => {
    setError(null);
    try {
      await api.scrapeCreator(c.id);
      setJob({ status: 'running', started_at: new Date().toISOString(), detail: c.id });
    } catch (err) { setError(err); }
  };

  const draft = async (reel, aud) => {
    setBusy(`${reel.id}:${aud}`);
    setError(null);
    try {
      const s = await api.createScript({ audience: aud, kind: 'inspired', source_reel_id: reel.id });
      navigate(`/scripts/${s.id}`);
    } catch (err) { setError(err); setBusy(null); }
  };

  const running = job?.status === 'running';
  const runningHandle = running && creators?.find((c) => c.id === job.detail)?.handle;

  return (
    <>
      <PageHeader title="Creator reels" sub="Their best-performing reels, why they worked, and original Pilani scripts built on the same techniques. Scraped every Monday." />

      <section className="card mb-4 grid min-w-0 grid-cols-1 gap-3 p-4">
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <input className="input min-w-0 flex-1" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Instagram handle or profile link, e.g. vaibhavsisinty" aria-label="Instagram handle" />
          <select className="input w-auto" value={audience} onChange={(e) => setAudience(e.target.value)} aria-label="Audience">
            <option value="b2c">B2C</option>
            <option value="b2b">B2B</option>
          </select>
          <button className="btn btn-primary" disabled={!handle.trim() || running}><Plus size={14} /> Add and scrape</button>
        </form>
        {running && <p className="flex items-center gap-2 text-sm"><Spinner size={14} /> Scraping {runningHandle ? `@${runningHandle}` : 'creators'}, then transcribing and analysing the top reels. This takes a few minutes.</p>}
        {job?.status === 'failed' && !running && <ErrorBox error={{ message: `Last scrape failed: ${job.error}` }} />}
        <ErrorBox error={error || cErr} />

        {creators?.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {creators.map((c) => (
              <li key={c.id} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-sm">
                <button className={creator === c.id ? 'font-semibold text-gold-ink' : ''} onClick={() => setCreator(creator === c.id ? '' : c.id)}>@{c.handle}</button>
                <span className="text-xs text-muted">{c.reel_count} reels · {c.analyzed_count} analysed{c.median_views ? ` · median ${fmt(c.median_views)}` : ''}</span>
                <button className="btn px-1.5 py-0.5" disabled={running} onClick={() => scrape(c)} title="Scrape now"><RefreshCw size={12} /></button>
                <button className="btn btn-danger px-1.5 py-0.5" onClick={async () => { if (confirm(`Remove @${c.handle} and their reels?`)) { await api.removeCreator(c.id); if (creator === c.id) setCreator(''); reloadCreators(); reloadReels(); } }} title="Remove"><Trash2 size={12} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="label">Sort</span>
        {[['views', 'Most views'], ['outperform', 'Beat their usual'], ['recent', 'Newest']].map(([v, l]) => (
          <button key={v} className={`btn ${sort === v ? 'btn-primary' : ''}`} onClick={() => setSort(v)}>{l}</button>
        ))}
      </div>

      <ErrorBox error={rErr} />
      {reels && reels.length === 0 && <div className="card p-8 text-center text-sm text-muted">No reels yet. Add a creator above.</div>}
      <ul className="grid min-w-0 grid-cols-1 gap-3">
        {(reels || []).map((r) => (
          <ReelCard key={r.id} reel={r} busy={busy} onDraft={draft} onDismiss={async (x) => { await api.dismissReel(x.id); reloadReels(); }} />
        ))}
      </ul>
    </>
  );
}
