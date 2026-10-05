import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, ArrowLeft, Check, Clipboard, ClipboardCheck, ExternalLink, Film, History,
  Plus, RefreshCw, Save, ShieldCheck, Sparkles, Trash2, User, X,
} from 'lucide-react';
import { api } from '../api/client.js';
import { AudienceChip, StatusChip, ErrorBox, FlagRow, ClaimRow, Spinner, timeAgo } from '../components/ui.jsx';
import { BrollPick } from '../components/Broll.jsx';
import FinalReel from '../components/FinalReel.jsx';

const EDITABLE = ['draft', 'rejected'];
const countWords = (t) => t.split(/\s+/).filter(Boolean).length;

function SegmentEditor({ seg, index, total, editable, onChange, onMove, onRemove, flags, scriptId, pick, onBrollUpdated, card }) {
  const isBroll = seg.visual === 'broll';
  return (
    <li className="card p-3" style={{ borderLeft: `3px solid ${isBroll ? 'var(--c-gold)' : 'var(--c-line)'}` }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted">#{index + 1}</span>
        <div className="flex overflow-hidden rounded-md border border-line">
          {[['avatar', User, 'Avatar'], ['broll', Film, 'B-roll']].map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              disabled={!editable}
              onClick={() => onChange({ ...seg, visual: v })}
              className={`flex items-center gap-1 px-2 py-1 font-mono text-[11px] font-semibold uppercase ${seg.visual === v ? 'bg-gold text-[#0A0A0F]' : 'text-muted'}`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-muted">{countWords(seg.text)}w</span>
        {card && <span className="chip" style={{ color: 'var(--c-gold-ink)' }} title="Drawn over the B-roll in the final reel">{card}</span>}
        {editable && (
          <div className="ml-auto flex gap-1">
            <button className="btn px-2" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp size={13} /></button>
            <button className="btn px-2" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown size={13} /></button>
            <button className="btn btn-danger px-2" onClick={onRemove} aria-label="Remove segment"><Trash2 size={13} /></button>
          </div>
        )}
      </div>
      <textarea
        className="input"
        rows={2}
        value={seg.text}
        readOnly={!editable}
        onChange={(e) => onChange({ ...seg, text: e.target.value })}
        aria-label={`Segment ${index + 1} spoken text`}
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {isBroll && (
          <label className="block">
            <span className="label">Stock footage search</span>
            <input className="input mt-1" value={seg.broll_query} readOnly={!editable} onChange={(e) => onChange({ ...seg, broll_query: e.target.value })} placeholder="e.g. people typing on laptops office" />
          </label>
        )}
        <label className="block">
          <span className="label">On-screen text</span>
          <input className="input mt-1" value={seg.on_screen_text} readOnly={!editable} onChange={(e) => onChange({ ...seg, on_screen_text: e.target.value })} placeholder="optional, max 6 words" />
        </label>
      </div>
      {flags.length > 0 && <ul className="mt-2 grid gap-1">{flags.map((f, i) => <FlagRow key={i} flag={f} />)}</ul>}
      {isBroll && <BrollPick scriptId={scriptId} segment={index} seg={seg} pick={pick} onUpdated={onBrollUpdated} />}
    </li>
  );
}

function HeygenPanel({ script }) {
  const [mode, setMode] = useState(script.audience === 'b2c' ? 'devanagari' : 'plain');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api.heygenText(script.id, mode === 'devanagari' ? 'devanagari' : '')
      .then((r) => live && setText(r.text), (e) => live && setError(e))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [script.id, script.version, mode]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="label">Copy for HeyGen</h2>
        {script.audience === 'b2c' && (
          <select className="input w-auto py-1 text-xs" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Script">
            <option value="devanagari">Hindi in Devanagari</option>
            <option value="plain">Roman (as written)</option>
          </select>
        )}
      </div>
      {script.audience === 'b2c' && mode === 'devanagari' && (
        <p className="mb-2 text-xs text-muted">HeyGen's Hindi voices pronounce Devanagari far better than Roman Hinglish. English words stay in English.</p>
      )}
      <ErrorBox error={error} />
      <pre className="input max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm">{loading ? 'Preparing…' : text}</pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={copy} disabled={!text || loading}>
          {copied ? <ClipboardCheck size={14} /> : <Clipboard size={14} />} {copied ? 'Copied' : 'Copy script'}
        </button>
        <a className="btn" href="https://app.heygen.com/home" target="_blank" rel="noreferrer">
          Open HeyGen <ExternalLink size={13} />
        </a>
      </div>
      <p className="mt-2 text-xs text-muted">Portrait 9:16. Each paragraph is one segment, so B-roll cuts land on the pauses.</p>
    </section>
  );
}

export default function ScriptPage() {
  const { id } = useParams();
  const [script, setScript] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [notes, setNotes] = useState('');
  const [viewVersion, setViewVersion] = useState(null);

  const load = (s) => {
    setScript(s);
    setDraft({ title: s.title, segments: s.segments, caption: s.caption || '', hashtags: s.hashtags.join(' ') });
    setNotes(s.review_notes || '');
  };

  useEffect(() => {
    setScript(null);
    api.script(id).then(load, setError);
  }, [id]);

  const dirty = useMemo(() => script && draft && (
    draft.title !== script.title
    || JSON.stringify(draft.segments) !== JSON.stringify(script.segments)
    || draft.caption !== (script.caption || '')
    || draft.hashtags !== script.hashtags.join(' ')
  ), [script, draft]);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (error && !script) return <ErrorBox error={error} />;
  if (!script || !draft) return <div className="flex items-center gap-2 text-muted"><Spinner /> Loading</div>;

  const editable = EDITABLE.includes(script.status);
  const errors = script.flags.filter((f) => f.severity === 'error');
  const general = script.flags.filter((f) => f.segment === undefined);
  const words = draft.segments.reduce((n, s) => n + countWords(s.text), 0);
  // Same rule as planCards in api/pipeline/captions.js: headline on the first
  // B-roll line of a news reel, a number card on B-roll lines whose on-screen
  // text has a number.
  const firstBroll = draft.segments.findIndex((s) => s.visual === 'broll');
  const cardFor = (i) => {
    const s = draft.segments[i];
    if (s.visual !== 'broll') return null;
    if (script.kind === 'news' && script.news && i === firstBroll) return 'Headline card';
    return /\d/.test(s.on_screen_text || '') ? 'Number card' : null;
  };
  const brollCount = draft.segments.reduce((c, s, i) => {
    if (s.visual !== 'broll') return c;
    return { total: c.total + 1, picked: c.picked + (script.broll?.[String(i)]?.clip ? 1 : 0) };
  }, { total: 0, picked: 0 });

  const run = async (label, fn) => {
    setBusy(label);
    setError(null);
    try {
      const updated = await fn();
      if (updated?.id) {
        const full = await api.script(updated.id);
        load(full);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy('');
    }
  };

  const save = () => run('save', () => api.updateScript(script.id, {
    title: draft.title,
    segments: draft.segments,
    caption: draft.caption,
    hashtags: draft.hashtags.split(/[\s,]+/).filter(Boolean),
  }));

  const approve = () => {
    const override = errors.length > 0;
    if (override && !confirm(`This script still has ${errors.length} error(s). Approve anyway?`)) return;
    run('approve', () => api.setStatus(script.id, { status: 'approved', review_notes: notes || undefined, override }));
  };

  const setSeg = (i, seg) => setDraft((d) => ({ ...d, segments: d.segments.map((s, j) => (j === i ? seg : s)) }));
  const moveSeg = (i, dir) => setDraft((d) => {
    const segs = [...d.segments];
    [segs[i], segs[i + dir]] = [segs[i + dir], segs[i]];
    return { ...d, segments: segs };
  });
  const removeSeg = (i) => setDraft((d) => ({ ...d, segments: d.segments.filter((_, j) => j !== i) }));
  const addSeg = () => setDraft((d) => ({ ...d, segments: [...d.segments, { text: '', visual: 'avatar', broll_query: '', on_screen_text: '' }] }));

  const showVersion = async (v) => {
    try { setViewVersion(await api.scriptVersion(script.id, v)); } catch (e) { setError(e); }
  };

  return (
    <div>
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Review queue</Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <AudienceChip audience={script.audience} />
            <span className="label">{script.series}</span>
            <StatusChip status={script.status} />
            <span className="font-mono text-xs text-muted">v{script.version} · {words} words · ~{Math.round(words / 2.5)}s</span>
          </div>
          <input
            className="w-full bg-transparent font-mono text-xl font-semibold outline-none md:text-2xl"
            value={draft.title}
            readOnly={!editable}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            aria-label="Title"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <button className="btn" onClick={save} disabled={!dirty || !!busy}>{busy === 'save' ? <Spinner size={14} /> : <Save size={14} />} Save</button>
          )}
          {script.status === 'draft' && (
            <>
              <button className="btn btn-danger" disabled={!!busy || dirty} onClick={() => run('reject', () => api.setStatus(script.id, { status: 'rejected', review_notes: notes || undefined }))}><X size={14} /> Reject</button>
              <button className="btn btn-primary" disabled={!!busy || dirty} onClick={approve} title={dirty ? 'Save your edits first' : ''}>{busy === 'approve' ? <Spinner size={14} /> : <Check size={14} />} Approve</button>
            </>
          )}
          {['approved', 'rejected'].includes(script.status) && (
            <button className="btn" disabled={!!busy} onClick={() => run('draft', () => api.setStatus(script.id, { status: 'draft' }))}>Back to draft</button>
          )}
          {script.status === 'approved' && (
            <button className="btn btn-primary" disabled={!!busy} onClick={() => run('rendered', () => api.setStatus(script.id, { status: 'rendered' }))}><Film size={14} /> Mark rendered</button>
          )}
          {script.status === 'rendered' && (
            <>
              <button className="btn" disabled={!!busy} onClick={() => run('approved', () => api.setStatus(script.id, { status: 'approved' }))}>Back to approved</button>
              <button
                className="btn btn-primary"
                disabled={!!busy}
                onClick={() => {
                  const url = prompt('Paste the Instagram link of the posted reel (used to match "AI" comments to this reel). Leave empty if not on Instagram.', '');
                  if (url === null) return;
                  run('published', () => api.setStatus(script.id, { status: 'published', published_url: url }));
                }}
              >
                <Check size={14} /> Mark published
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4"><ErrorBox error={error} /></div>
      {dirty && <div className="mb-4 text-sm" style={{ color: 'var(--c-warn)' }}>Unsaved edits. Save, then re-check facts before approving.</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {general.length > 0 && (
            <section className="card mb-4 p-4">
              <h2 className="label mb-2">Checks</h2>
              <ul className="grid gap-1.5">{general.map((f, i) => <FlagRow key={i} flag={f} />)}</ul>
            </section>
          )}

          {draft.segments.some((s) => s.visual === 'broll') && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted">
                {brollCount.picked}/{brollCount.total} B-roll lines have a clip
                {script.status === 'draft' && brollCount.picked === 0 && ' · picked automatically on approve'}
              </span>
              <button
                className="btn"
                disabled={!!busy || dirty}
                title={dirty ? 'Save your edits first' : ''}
                onClick={async () => {
                  setBusy('broll');
                  setError(null);
                  try {
                    const s = await api.matchBroll(script.id);
                    setScript((prev) => ({ ...prev, broll: s.broll }));
                  } catch (e) { setError(e); } finally { setBusy(''); }
                }}
              >
                {busy === 'broll' ? <><Spinner size={14} /> Finding clips…</> : <><Film size={14} /> Find B-roll</>}
              </button>
            </div>
          )}

          <ol className="grid gap-2">
            {draft.segments.map((seg, i) => (
              <SegmentEditor
                key={i}
                seg={seg}
                index={i}
                total={draft.segments.length}
                editable={editable}
                onChange={(s) => setSeg(i, s)}
                onMove={(dir) => moveSeg(i, dir)}
                onRemove={() => removeSeg(i)}
                flags={dirty ? [] : script.flags.filter((f) => f.segment === i)}
                scriptId={script.id}
                pick={script.broll?.[String(i)]}
                onBrollUpdated={(s) => setScript((prev) => ({ ...prev, broll: s.broll }))}
                card={cardFor(i)}
              />
            ))}
          </ol>
          {editable && <button className="btn mt-2" onClick={addSeg}><Plus size={14} /> Add segment</button>}

          <section className="card mt-6 grid gap-3 p-4">
            <label className="block">
              <span className="label">Caption</span>
              <textarea className="input mt-1" rows={3} value={draft.caption} readOnly={!editable} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Hashtags (space separated, no #)</span>
              <input className="input mt-1" value={draft.hashtags} readOnly={!editable} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} />
            </label>
          </section>
        </div>

        <aside className="grid content-start gap-4">
          {['approved', 'rendered', 'published'].includes(script.status) && (
            <FinalReel script={script} onRendered={() => api.script(script.id).then(load, setError)} />
          )}
          {['approved', 'rendered'].includes(script.status) && <HeygenPanel script={script} />}

          {editable && (
            <section className="card p-4">
              <h2 className="label mb-2">Rewrite with feedback</h2>
              <textarea className="input" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="e.g. Punchier hook, fewer numbers, end with the workshop" />
              <button className="btn mt-2" disabled={!!busy || dirty} onClick={() => run('rewrite', () => api.rewriteScript(script.id, feedback)).then(() => setFeedback(''))}>
                {busy === 'rewrite' ? <Spinner size={14} /> : <Sparkles size={14} />} {busy === 'rewrite' ? 'Rewriting (~30s)' : 'Rewrite'}
              </button>
              <p className="mt-2 text-xs text-muted">The current version is kept in history.</p>
            </section>
          )}

          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="label">Fact check</h2>
              <button className="btn px-2 py-1" disabled={!!busy || dirty} onClick={() => run('recheck', () => api.recheckScript(script.id))}>
                {busy === 'recheck' ? <Spinner size={13} /> : <ShieldCheck size={13} />} Re-check
              </button>
            </div>
            {script.claims.length === 0
              ? <p className="text-sm text-muted">No factual claims found.</p>
              : <ul className="grid gap-2">{script.claims.map((c, i) => <ClaimRow key={i} claim={c} />)}</ul>}
          </section>

          {script.news && (
            <section className="card p-4">
              <h2 className="label mb-2">Source</h2>
              <a href={script.news.url} target="_blank" rel="noreferrer" className="flex items-start gap-1 font-medium hover:underline">
                {script.news.title} <ExternalLink size={13} className="mt-1 shrink-0" />
              </a>
              <div className="mt-1 text-xs text-muted">{script.news.source}{script.news.published_at && ` · ${timeAgo(script.news.published_at)}`}</div>
              {script.news.summary && <p className="mt-2 line-clamp-6 text-sm text-muted">{script.news.summary}</p>}
            </section>
          )}
          {script.status === 'published' && (
            <section className="card p-4">
              <h2 className="label mb-2">Posted</h2>
              {script.published_url
                ? <a href={script.published_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm hover:underline">View on Instagram <ExternalLink size={12} /></a>
                : <p className="text-sm text-muted">No Instagram link saved.</p>}
              <p className="mt-2 text-sm"><Link to="/leads" className="font-mono font-semibold hover:underline">{script.lead_count ?? 0} leads</Link> from this reel</p>
            </section>
          )}
          {script.source_reel && (
            <section className="card p-4">
              <h2 className="label mb-2">Inspired by</h2>
              <a href={script.source_reel.url} target="_blank" rel="noreferrer" className="flex items-start gap-1 font-medium hover:underline">
                @{script.source_reel.handle} · {Number(script.source_reel.views || 0).toLocaleString('en-IN')} views <ExternalLink size={13} className="mt-1 shrink-0" />
              </a>
              {script.source_reel.analysis && (
                <dl className="mt-2 grid gap-1 text-sm">
                  <div><dt className="label inline">Hook </dt><dd className="inline">{script.source_reel.analysis.hook_device}</dd></div>
                  <div><dt className="label inline">Why it worked </dt><dd className="inline text-muted">{script.source_reel.analysis.why_it_works}</dd></div>
                </dl>
              )}
              <p className="mt-2 text-xs text-muted">Same technique, our own words: any 5-word run copied from their transcript is flagged as an error.</p>
            </section>
          )}
          {script.brief && (
            <section className="card p-4">
              <h2 className="label mb-2">Brief</h2>
              <p className="text-sm">{script.brief}</p>
            </section>
          )}

          <section className="card p-4">
            <h2 className="label mb-2">Review notes</h2>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Saved when you approve or reject" />
          </section>

          {script.versions.length > 0 && (
            <section className="card p-4">
              <h2 className="label mb-2 flex items-center gap-1"><History size={13} /> History</h2>
              <ul className="grid gap-1 text-sm">
                {script.versions.map((v) => (
                  <li key={v.version}>
                    <button className="text-left hover:underline" onClick={() => showVersion(v.version)}>
                      <span className="font-mono text-xs text-muted">v{v.version}</span> {v.reason} <span className="text-xs text-muted">· {timeAgo(v.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {viewVersion && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewVersion(null)}>
          <div className="card max-h-[85vh] w-full max-w-2xl overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono font-semibold">v{viewVersion.version}: {viewVersion.title}</h2>
              <button className="btn px-2" onClick={() => setViewVersion(null)} aria-label="Close"><X size={14} /></button>
            </div>
            <ol className="grid gap-2 text-sm">
              {viewVersion.segments.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="chip shrink-0" style={{ color: s.visual === 'broll' ? 'var(--c-gold-ink)' : 'var(--c-muted)' }}>{s.visual}</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
            {editable && (
              <button
                className="btn mt-4"
                onClick={() => {
                  setDraft({ ...draft, title: viewVersion.title, segments: viewVersion.segments, caption: viewVersion.caption || '', hashtags: viewVersion.hashtags.join(' ') });
                  setViewVersion(null);
                }}
              >
                <RefreshCw size={14} /> Load into editor
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
