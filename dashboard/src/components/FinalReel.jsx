import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Upload, AlertTriangle } from 'lucide-react';
import { api, mediaUrl, finalDownloadUrl, uploadAvatarVideo } from '../api/client.js';
import { ErrorBox, Spinner } from './ui.jsx';

function elapsed(since) {
  const s = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Upload the HeyGen video, follow the render, then play/download the reel.
export default function FinalReel({ script, onRendered }) {
  const [job, setJob] = useState(null);
  const [upload, setUpload] = useState(null); // 0..1 while uploading
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [, tick] = useState(0);
  const input = useRef(null);
  const running = job?.status === 'running';

  // Polls every 2s while a render runs (the timer ticks with it), every 20s
  // otherwise.
  useEffect(() => {
    let live = true;
    let wasRunning = false;
    let timer;
    const poll = async () => {
      try {
        const j = await api.renderStatus(script.id);
        if (!live) return;
        if (wasRunning && j?.status === 'completed') onRendered();
        wasRunning = j?.status === 'running';
        setJob(j);
      } catch (e) { if (live) setError(e); }
      if (live) {
        tick((t) => t + 1);
        timer = setTimeout(poll, wasRunning ? 2000 : 20_000);
      }
    };
    poll();
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script.id, upload === null && running]);

  const send = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError(new Error('Choose the MP4 video downloaded from HeyGen.')); return; }
    setError(null);
    setUpload(0);
    try {
      await uploadAvatarVideo(script.id, file, setUpload);
      setJob({ status: 'running', started_at: new Date().toISOString(), result: { stage: 'Starting' } });
    } catch (e) { setError(e); } finally { setUpload(null); }
  };

  const rerender = async () => {
    setError(null);
    try {
      await api.rerender(script.id);
      setJob({ status: 'running', started_at: new Date().toISOString(), result: { stage: 'Starting' } });
    } catch (e) { setError(e); }
  };

  const result = job?.status === 'completed' ? job.result : null;
  const lowMatch = result && result.match_ratio < 0.6;

  return (
    <section className="card p-4">
      <h2 className="label mb-3">Final reel</h2>

      {script.final_video && !running && (
        <>
          <video
            key={script.final_video}
            src={mediaUrl(script.final_video)}
            controls
            playsInline
            className="mx-auto mb-3 w-full max-w-[260px] rounded-md bg-black"
            style={{ aspectRatio: '9 / 16' }}
          />
          <div className="mb-3 flex flex-wrap gap-2">
            <a className="btn btn-primary" href={finalDownloadUrl(script.id)}><Download size={14} /> Download MP4</a>
            <button className="btn" onClick={rerender} title="After swapping a B-roll clip"><RefreshCw size={14} /> Re-render</button>
          </div>
          {result && (
            <p className="mb-2 text-xs text-muted">
              {result.seconds}s · {result.broll_used}/{result.broll_lines} B-roll clips · captions matched {Math.round(result.match_ratio * 100)}%
              {!result.music && ' · no music (add tracks to api/assets/music)'}
            </p>
          )}
          {lowMatch && (
            <p className="mb-2 flex items-start gap-1 text-xs" style={{ color: 'var(--c-warn)' }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Only {Math.round(result.match_ratio * 100)}% of words matched the voice. Check that the captions stay in sync, especially if the HeyGen text was changed.
            </p>
          )}
        </>
      )}

      {running && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <Spinner /> {job.result?.stage || 'Working'}… <span className="font-mono text-xs text-muted">{elapsed(job.started_at)}</span>
        </div>
      )}
      {job?.status === 'failed' && !running && <div className="mb-3"><ErrorBox error={{ message: `Render failed: ${job.error}` }} /></div>}

      {!running && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); send(e.dataTransfer.files?.[0]); }}
          className="rounded-md border border-dashed p-4 text-center text-sm"
          style={{ borderColor: dragging ? 'var(--c-gold)' : 'var(--c-line)' }}
        >
          {upload !== null ? (
            <div className="grid gap-2">
              <span>Uploading {Math.round(upload * 100)}%</span>
              <div className="h-1.5 overflow-hidden rounded bg-hover"><div className="h-full bg-gold" style={{ width: `${upload * 100}%` }} /></div>
            </div>
          ) : (
            <>
              <p className="mb-2 text-muted">{script.final_video ? 'Replace the HeyGen video' : 'Drop the HeyGen MP4 here'}</p>
              <button className="btn" onClick={() => input.current?.click()}><Upload size={14} /> Choose video</button>
              <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => { send(e.target.files?.[0]); e.target.value = ''; }} />
              <p className="mt-2 text-xs text-muted">Adds B-roll, captions, logo and outro automatically. About 1 minute.</p>
            </>
          )}
        </div>
      )}
      <ErrorBox error={error} />
    </section>
  );
}
