import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Sparkles } from 'lucide-react';
import { api } from '../api/client.js';
import { ErrorBox, PageHeader, Spinner, useLoad } from '../components/ui.jsx';

const KINDS = [
  ['promo', 'Promote an offering', 'A workshop or course reel, built only from the facts in api/config/brand.js.'],
  ['custom', 'Tip or topic', 'Any topic, e.g. "3 ChatGPT prompts for job interviews". No source article, so every claim is marked for you to verify.'],
];

const BRIEF_HINTS = {
  b2b: { promo: 'e.g. Aim at manufacturing CEOs; lead with the 90-day plan', custom: 'e.g. Why most AI pilots never reach production, and what leaders should do' },
  b2c: { promo: 'e.g. For college students worried about AI and jobs', custom: 'e.g. 3 ChatGPT prompts that make your resume better' },
};

const cardStyle = (on) => (on ? { borderColor: 'var(--c-gold)', boxShadow: '0 0 0 1px var(--c-gold)' } : undefined);

export default function NewReel() {
  const navigate = useNavigate();
  const [config, configError] = useLoad(() => api.config());
  const [audience, setAudience] = useState('b2c');
  // A plain kind ('promo', 'custom') or 'track:<id>' for a track section.
  const [kind, setKind] = useState('custom');
  const [offering, setOffering] = useState('');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const trackId = kind.startsWith('track:') ? kind.slice(6) : null;
  const track = config?.tracks?.find((t) => t.id === trackId);
  const tracksHere = (config?.tracks || []).filter((t) => t.audience === audience);
  const offerings = config?.offerings?.[audience] || [];
  const chosenOffering = offering || offerings[0]?.id || '';
  const canSubmit = kind === 'promo' ? !!chosenOffering : trackId ? true : brief.trim().length > 5;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = trackId
        ? { audience, kind: 'custom', track: trackId, brief: brief.trim() || undefined }
        : { audience, kind, offering: kind === 'promo' ? chosenOffering : undefined, brief: brief.trim() || undefined };
      const script = await api.createScript(body);
      navigate(`/scripts/${script.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="New reel" sub="News reels are drafted from the AI news page. Use this for promos, tips and track sections." />
      <ErrorBox error={configError} />
      <form onSubmit={submit} className="card grid max-w-2xl gap-5 p-5">
        <fieldset>
          <legend className="label mb-2">Audience</legend>
          <div className="flex flex-wrap gap-2">
            {[['b2c', 'B2C · Everyone (Hinglish)'], ['b2b', 'B2B · CXOs (English)']].map(([v, label]) => (
              <button type="button" key={v} className={`btn ${audience === v ? 'btn-primary' : ''}`} onClick={() => { setAudience(v); setOffering(''); if (kind.startsWith('track:')) setKind('custom'); }}>{label}</button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label mb-2">Type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {KINDS.map(([v, label, desc]) => (
              <button type="button" key={v} onClick={() => setKind(v)} className="card p-3 text-left hover:bg-hover" style={cardStyle(kind === v)}>
                <div className="font-medium">{label}</div>
                <div className="mt-1 text-xs text-muted">{desc}</div>
              </button>
            ))}
            {tracksHere.map((t) => (
              <button type="button" key={t.id} onClick={() => setKind(`track:${t.id}`)} className="card p-3 text-left hover:bg-hover sm:col-span-2" style={cardStyle(kind === `track:${t.id}`)}>
                <div className="flex items-center gap-2 font-medium"><Briefcase size={15} /> {t.label} <span className="label">· {t.series}</span></div>
                <div className="mt-1 text-xs text-muted">For {t.listener.split('.')[0].toLowerCase()}. Ends with: "{t.engagement.cta}"</div>
              </button>
            ))}
          </div>
        </fieldset>

        {kind === 'promo' && (
          <label className="block">
            <span className="label">Offering</span>
            <select className="input mt-1" value={chosenOffering} onChange={(e) => setOffering(e.target.value)}>
              {offerings.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {offerings.find((o) => o.id === chosenOffering) && (
              <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                {offerings.find((o) => o.id === chosenOffering).facts.map((f) => <li key={f}>{f}</li>)}
              </ul>
            )}
          </label>
        )}

        <label className="block">
          <span className="label">{kind === 'promo' ? 'Direction (optional)' : trackId ? 'Topic (optional)' : 'Topic'}</span>
          {track ? (
            <>
              <select className="input mt-1" value={brief} onChange={(e) => setBrief(e.target.value)} aria-label="Topic">
                <option value="">Let the agent pick a fresh topic</option>
                {track.topics.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="input mt-2" value={track.topics.includes(brief) ? '' : brief} onChange={(e) => setBrief(e.target.value)} placeholder="…or type your own topic" />
            </>
          ) : (
            <textarea className="input mt-1" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={BRIEF_HINTS[audience][kind]} />
          )}
        </label>

        <ErrorBox error={error} />
        <div>
          <button className="btn btn-primary" disabled={busy || !canSubmit || config?.llmConfigured === false}>
            {busy ? <><Spinner size={14} /> Writing and fact-checking (~40s)</> : <><Sparkles size={14} /> Write script</>}
          </button>
          {config?.llmConfigured === false && <p className="mt-2 text-sm" style={{ color: 'var(--c-bad)' }}>OPENROUTER_API_KEY is not set in api/.env.</p>}
        </div>
      </form>
    </>
  );
}
