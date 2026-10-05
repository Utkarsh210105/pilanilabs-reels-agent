import { useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../api/client.js';
import { Spinner, timeAgo } from './ui.jsx';

// Pages listen for this to reload once a sync has drafted new scripts.
export const SYNCED_EVENT = 'reels:synced';

function summary(job) {
  const r = job?.result;
  if (!r) return '';
  const drafted = r.drafted?.length ?? 0;
  return `${r.ingest?.inserted ?? 0} new stories · ${drafted} reel${drafted === 1 ? '' : 's'} drafted`;
}

function elapsed(since) {
  const s = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Runs the same pipeline as the 6am job (fetch news, score, draft the top
// stories) on demand, and follows it until it finishes.
export default function SyncButton() {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [, tick] = useState(0);
  const wasRunning = useRef(false);
  const running = job?.status === 'running';

  // Poll every 3s while a sync runs, every minute otherwise (the 6am run can
  // start while the dashboard is open).
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const latest = await api.lastSync();
        if (!live) return;
        if (wasRunning.current && latest?.status !== 'running') {
          window.dispatchEvent(new Event(SYNCED_EVENT));
        }
        wasRunning.current = latest?.status === 'running';
        setJob(latest);
        setError(null);
      } catch (e) {
        if (live) setError(e);
      }
    };
    poll();
    const id = setInterval(poll, running ? 3000 : 60_000);
    return () => { live = false; clearInterval(id); };
  }, [running]);

  // Re-render every second while running so the elapsed timer moves.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = async () => {
    setError(null);
    try {
      await api.startSync();
    } catch (e) {
      if (e.status !== 409) setError(e);
    }
    wasRunning.current = true;
    setJob((j) => ({ ...(j || {}), status: 'running', started_at: new Date().toISOString(), result: null, error: null }));
  };

  return (
    <div className="grid gap-1.5">
      <button className="btn btn-primary w-full justify-center" onClick={start} disabled={running}>
        {running ? <Spinner size={14} /> : <RefreshCw size={14} />}
        {running ? `Syncing ${elapsed(job.started_at)}` : 'Sync news'}
      </button>
      <div className="text-xs text-muted" aria-live="polite">
        {running && 'Fetching, scoring and drafting. About 2–4 minutes.'}
        {!running && job?.status === 'completed' && <>Last sync {timeAgo(job.finished_at)}<br />{summary(job)}</>}
        {!running && job?.status === 'failed' && (
          <span className="flex items-start gap-1" style={{ color: 'var(--c-bad)' }}>
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> Last sync failed: {job.error}
          </span>
        )}
        {!job && !error && 'Auto-sync daily at 6:00 IST'}
        {error && <span style={{ color: 'var(--c-bad)' }}>{error.message}</span>}
      </div>
    </div>
  );
}
