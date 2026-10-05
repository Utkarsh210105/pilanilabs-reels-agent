import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
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

export default function NewReel() {
  const navigate = useNavigate();
  const [config, configError] = useLoad(() => api.config());
  const [audience, setAudience] = useState('b2c');
  const [kind, setKind] = useState('custom');
  const [offering, setOffering] = useState('');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const offerings = config?.offerings?.[audience] || [];
  const chosenOffering = offering || offerings[0]?.id || '';
  const canSubmit = kind === 'promo' ? !!chosenOffering : brief.trim().length > 5;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const script = await api.createScript({ audience, kind, offering: kind === 'promo' ? chosenOffering : undefined, brief: brief.trim() || undefined });
      navigate(`/scripts/${script.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="New reel" sub="News reels are drafted from the AI news page. Use this for promos and tips." />
      <ErrorBox error={configError} />
      <form onSubmit={submit} className="card grid max-w-2xl gap-5 p-5">
        <fieldset>
          <legend className="label mb-2">Audience</legend>
          <div className="flex flex-wrap gap-2">
            {[['b2c', 'B2C · Everyone (Hinglish)'], ['b2b', 'B2B · CXOs (English)']].map(([v, label]) => (
              <button type="button" key={v} className={`btn ${audience === v ? 'btn-primary' : ''}`} onClick={() => { setAudience(v); setOffering(''); }}>{label}</button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label mb-2">Type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {KINDS.map(([v, label, desc]) => (
              <button
                type="button"
                key={v}
                onClick={() => setKind(v)}
                className="card p-3 text-left hover:bg-hover"
                style={kind === v ? { borderColor: 'var(--c-gold)', boxShadow: '0 0 0 1px var(--c-gold)' } : undefined}
              >
                <div className="font-medium">{label}</div>
                <div className="mt-1 text-xs text-muted">{desc}</div>
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
          <span className="label">{kind === 'promo' ? 'Direction (optional)' : 'Topic'}</span>
          <textarea className="input mt-1" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={BRIEF_HINTS[audience][kind]} />
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
