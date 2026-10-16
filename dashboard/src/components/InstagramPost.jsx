import { useEffect, useState } from 'react';
import { CalendarClock, ExternalLink, Send, X } from 'lucide-react';
import { api } from '../api/client.js';
import { ErrorBox, Spinner, useLoad } from './ui.jsx';

const countTags = (t) => (t.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;

// Default schedule: today 8pm IST (or tomorrow if past), as a datetime-local value.
function tonightAt8() {
  const d = new Date();
  d.setHours(20, 0, 0, 0);
  if (d < new Date()) d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Post a rendered reel to Instagram now, or schedule it.
export default function InstagramPost({ script, onChanged }) {
  const [ig] = useLoad(() => api.instagram());
  const [info, setInfo] = useState(null);
  const [caption, setCaption] = useState('');
  const [coverSec, setCoverSec] = useState(1);
  const [when, setWhen] = useState(tonightAt8());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);

  const load = async () => {
    const i = await api.publishInfo(script.id);
    setInfo(i);
    setCaption((c) => c || i.caption || i.default_caption || '');
    return i;
  };
  useEffect(() => { load().catch(setError); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [script.id]);

  // Follow a post in progress (upload + Instagram processing, ~1-3 min).
  useEffect(() => {
    if (info?.publish_status !== 'publishing') return undefined;
    const t = setInterval(async () => {
      const i = await load().catch(() => null);
      if (i && i.publish_status !== 'publishing') { clearInterval(t); onChanged?.(); }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.publish_status]);

  if (!script.final_video) return null;
  const tags = countTags(caption);
  const tooLong = caption.length > 2200;
  const status = info?.publish_status;

  const post = async (scheduled) => {
    const target = scheduled ? new Date(when) : null;
    const question = scheduled
      ? `Schedule this reel to post on @${ig?.username || 'your account'} at ${target.toLocaleString('en-IN')}?`
      : `Post this reel to @${ig?.username || 'your account'} now? It will be public.`;
    if (!confirm(question)) return;
    setBusy(scheduled ? 'schedule' : 'post');
    setError(null);
    try {
      await api.publish(script.id, { caption, cover_ms: Math.round(coverSec * 1000), publish_at: scheduled ? target.toISOString() : undefined });
      await load();
      onChanged?.();
    } catch (e) { setError(e); } finally { setBusy(''); }
  };

  return (
    <section className="card p-4">
      <h2 className="label mb-3">Post to Instagram</h2>

      {ig && !ig.connected && (
        <p className="mb-3 text-sm" style={{ color: 'var(--c-warn)' }}>
          Instagram is not connected yet. {ig.error ? `(${ig.error}) ` : ''}See the README section "Posting to Instagram".
        </p>
      )}

      {status === 'posted' || script.status === 'published' ? (
        <div className="text-sm">
          <p className="font-medium" style={{ color: 'var(--c-ok)' }}>Posted ✓</p>
          {info?.published_url && <a href={info.published_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 hover:underline">View on Instagram <ExternalLink size={12} /></a>}
        </div>
      ) : status === 'publishing' ? (
        <p className="flex items-center gap-2 text-sm"><Spinner /> Uploading and posting… Instagram takes 1–3 minutes to process a reel.</p>
      ) : status === 'scheduled' ? (
        <div className="grid gap-2 text-sm">
          <p className="flex items-center gap-2"><CalendarClock size={15} /> Scheduled for <strong>{new Date(info.publish_at).toLocaleString('en-IN')}</strong></p>
          <p className="text-xs text-muted">Posts automatically while the agent is running at that time.</p>
          <button className="btn btn-danger w-fit" disabled={!!busy} onClick={async () => { setBusy('cancel'); try { await api.cancelPublish(script.id); await load(); } catch (e) { setError(e); } finally { setBusy(''); } }}><X size={14} /> Cancel schedule</button>
        </div>
      ) : (
        <div className="grid gap-3">
          {status === 'failed' && <ErrorBox error={{ message: `Last attempt failed: ${info.publish_error}` }} />}
          <label className="block">
            <span className="label">Caption</span>
            <textarea className="input mt-1" rows={7} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <span className="mt-1 block text-xs" style={{ color: tooLong || tags > 5 ? 'var(--c-bad)' : 'var(--c-muted)' }}>
              {caption.length}/2200 characters · {tags}/5 hashtags · first line shows in the feed
            </span>
          </label>
          <label className="block">
            <span className="label">Cover frame (seconds into the reel)</span>
            <input className="input mt-1 w-28" type="number" min="0" step="0.5" value={coverSec} onChange={(e) => setCoverSec(Number(e.target.value))} />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button className="btn btn-primary" disabled={!!busy || !ig?.connected || tooLong || tags > 5 || !caption.trim()} onClick={() => post(false)}>
              {busy === 'post' ? <Spinner size={14} /> : <Send size={14} />} Post now
            </button>
            <span className="text-xs text-muted">or</span>
            <input className="input w-auto py-1" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Schedule time" />
            <button className="btn" disabled={!!busy || !ig?.connected || tooLong || tags > 5 || !caption.trim() || new Date(when) <= new Date()} onClick={() => post(true)}>
              {busy === 'schedule' ? <Spinner size={14} /> : <CalendarClock size={14} />} Schedule
            </button>
          </div>
          <p className="text-xs text-muted">Turn on Instagram's "AI info" label from the app after posting if the presenter is an AI avatar.</p>
        </div>
      )}
      <div className="mt-2"><ErrorBox error={error} /></div>
    </section>
  );
}
