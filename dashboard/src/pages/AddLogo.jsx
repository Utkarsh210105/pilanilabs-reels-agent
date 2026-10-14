import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { addLogoToVideo } from '../api/client.js';
import { ErrorBox, PageHeader, Spinner } from '../components/ui.jsx';

// For videos edited somewhere else (e.g. fully in HeyGen): add only the
// PilaniLabs symbol, nothing else changes.
export default function AddLogo() {
  const [stage, setStage] = useState('idle'); // idle | uploading | processing | done
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);

  const send = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError(new Error('Choose a video file (MP4).')); return; }
    setError(null);
    setResult(null);
    setStage('uploading');
    setProgress(0);
    try {
      const r = await addLogoToVideo(file, setProgress, () => setStage('processing'));
      setResult(r);
      setStage('done');
    } catch (e) {
      setError(e);
      setStage('idle');
    }
  };

  const busy = stage === 'uploading' || stage === 'processing';

  return (
    <>
      <PageHeader title="Add logo" sub="For a reel you finished elsewhere (e.g. fully edited in HeyGen): adds only the PilaniLabs symbol. Size, captions and audio stay exactly as they are." />

      <section className="card max-w-2xl p-5">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) send(e.dataTransfer.files?.[0]); }}
          className="rounded-md border border-dashed p-8 text-center text-sm"
          style={{ borderColor: dragging ? 'var(--c-gold)' : 'var(--c-line)' }}
        >
          {stage === 'uploading' && (
            <div className="grid gap-2">
              <span>Uploading {Math.round(progress * 100)}%</span>
              <div className="h-1.5 overflow-hidden rounded bg-hover"><div className="h-full bg-gold" style={{ width: `${progress * 100}%` }} /></div>
            </div>
          )}
          {stage === 'processing' && (
            <p className="flex items-center justify-center gap-2"><Spinner /> Finding the clearest spot and adding the logo… (about 30–60 seconds)</p>
          )}
          {(stage === 'idle' || stage === 'done') && (
            <>
              <p className="mb-3 text-muted">{stage === 'done' ? 'Do another video' : 'Drop your finished MP4 here'}</p>
              <button className="btn btn-primary" onClick={() => input.current?.click()}><Upload size={14} /> Choose video</button>
              <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => { send(e.target.files?.[0]); e.target.value = ''; }} />
            </>
          )}
        </div>
        <div className="mt-3"><ErrorBox error={error} /></div>

        {result && (
          <div className="mt-5 grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
            <video src={result.url} controls playsInline className="w-full rounded-md bg-black" style={{ aspectRatio: `${result.width} / ${result.height}` }} />
            <div className="text-sm">
              <p className="font-medium">Logo added.</p>
              <p className="mt-1 text-muted">Placed at <strong>{result.spot}</strong>: the spot with the least text and graphics under it across this video. {result.width}×{result.height}, {result.seconds}s, original audio.</p>
              <a className="btn btn-primary mt-3" href={result.download}><Download size={14} /> Download MP4</a>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
