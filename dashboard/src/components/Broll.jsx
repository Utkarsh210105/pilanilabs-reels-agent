import { useState } from 'react';
import { ExternalLink, Search, Shuffle, X } from 'lucide-react';
import { api } from '../api/client.js';
import { ErrorBox, Spinner } from './ui.jsx';

// 9:16 thumbnail that plays the clip on hover (landscape clips are shown
// center-cropped, the way they will be cut into the reel).
function ClipThumb({ clip, width = 88, onClick, selected }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative shrink-0 overflow-hidden rounded-md bg-black"
      style={{ width, aspectRatio: '9 / 16', outline: selected ? '2px solid var(--c-gold)' : 'none', outlineOffset: 2 }}
      aria-label={`Clip by ${clip.credit}`}
    >
      {hover
        ? <video src={clip.preview_video_url} autoPlay muted loop playsInline className="h-full w-full object-cover" />
        : <img src={clip.preview_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
      <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">{clip.duration}s</span>
    </button>
  );
}

function SwapModal({ scriptId, segment, pick, query, onClose, onChosen }) {
  const [q, setQ] = useState(query);
  const [results, setResults] = useState(pick?.candidates || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const search = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try { setResults(await api.searchBroll(q)); } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const choose = async (clip) => {
    setBusy(true);
    try { onChosen(await api.chooseBroll(scriptId, segment, clip)); } catch (err) { setError(err); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-3xl overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-mono font-semibold">Choose B-roll for line #{segment + 1}</h2>
          <button className="btn px-2" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <form onSubmit={search} className="mb-4 flex gap-2">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Pexels" aria-label="Search Pexels" />
          <button className="btn" disabled={busy || !q.trim()}>{busy ? <Spinner size={14} /> : <Search size={14} />} Search</button>
        </form>
        <ErrorBox error={error} />
        <p className="mb-3 text-xs text-muted">Hover to play. Click to use it for this line.</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {results.map((c) => (
            <div key={c.id} className="grid gap-1">
              <ClipThumb clip={c} width="100%" selected={pick?.clip?.id === c.id} onClick={() => choose(c)} />
              <span className="truncate text-[10px] text-muted">{c.width > c.height ? 'landscape · ' : ''}{c.credit}</span>
            </div>
          ))}
          {!results.length && !busy && <p className="col-span-full text-sm text-muted">No clips. Try another search.</p>}
        </div>
      </div>
    </div>
  );
}

// The B-roll pick for one segment, shown inside the segment editor.
export function BrollPick({ scriptId, segment, seg, pick, onUpdated }) {
  const [open, setOpen] = useState(false);
  const stale = pick && (pick.text !== seg.text || pick.query !== seg.broll_query);

  return (
    <div className="mt-3 flex gap-3 border-t border-line pt-3">
      {pick?.clip
        ? <ClipThumb clip={pick.clip} onClick={() => setOpen(true)} />
        : <div className="flex shrink-0 items-center justify-center rounded-md border border-dashed border-line text-center text-[11px] text-muted" style={{ width: 88, aspectRatio: '9 / 16' }}>{pick ? 'No clip' : 'Not picked yet'}</div>}
      <div className="min-w-0 flex-1 text-sm">
        <div className="label mb-1 flex flex-wrap items-center gap-2">
          B-roll clip
          {pick?.status === 'preview' && <span className="chip normal-case" style={{ color: 'var(--c-warn)' }} title="Free Pexels preview. The AI check runs when you approve.">Preview · not AI-checked</span>}
          {pick?.status === 'picked' && <span className="chip normal-case" style={{ color: 'var(--c-ok)' }}>AI-checked{pick.score ? ` ${pick.score}/10` : ''}</span>}
        </div>
        {stale && <p className="mb-1 text-xs" style={{ color: 'var(--c-warn)' }}>The line or search changed since this was picked. Click Find B-roll to update.</p>}
        {pick?.reason && <p className="text-xs text-muted">{pick.reason}</p>}
        {pick?.clip && (
          <a href={pick.clip.page_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:underline">
            {pick.clip.credit} <ExternalLink size={11} />
          </a>
        )}
        <div className="mt-2">
          <button type="button" className="btn px-2 py-1" onClick={() => setOpen(true)}><Shuffle size={13} /> {pick?.clip ? 'Swap' : 'Choose'}</button>
        </div>
      </div>
      {open && (
        <SwapModal
          scriptId={scriptId}
          segment={segment}
          pick={pick}
          query={seg.broll_query}
          onClose={() => setOpen(false)}
          onChosen={(s) => { setOpen(false); onUpdated(s); }}
        />
      )}
    </div>
  );
}
