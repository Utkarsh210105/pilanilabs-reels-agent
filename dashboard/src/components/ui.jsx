import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

export function AudienceChip({ audience }) {
  return (
    <span className="chip" style={{ color: `var(--c-${audience})` }}>
      {audience === 'b2b' ? 'B2B' : 'B2C'}
    </span>
  );
}

const STATUS_COLOR = { draft: 'var(--c-muted)', approved: 'var(--c-ok)', rejected: 'var(--c-bad)', rendered: 'var(--c-gold-ink)', published: 'var(--c-b2b)' };

export function StatusChip({ status }) {
  return <span className="chip" style={{ color: STATUS_COLOR[status] }}>{status}</span>;
}

export function Spinner({ size = 16 }) {
  return <Loader2 size={size} className="spin" />;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="card flex items-start gap-2 p-3 text-sm" style={{ color: 'var(--c-bad)', borderColor: 'currentColor' }}>
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{error.message || String(error)}</span>
    </div>
  );
}

export function FlagRow({ flag }) {
  const isError = flag.severity === 'error';
  const Icon = isError ? AlertCircle : AlertTriangle;
  return (
    <li className="flex items-start gap-2 text-sm" style={{ color: isError ? 'var(--c-bad)' : 'var(--c-warn)' }}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span className="text-ink">
        {flag.segment !== undefined && <span className="font-mono text-xs text-muted">#{flag.segment + 1} </span>}
        {flag.message}
      </span>
    </li>
  );
}

export function ClaimRow({ claim }) {
  const meta = claim.supported === true
    ? { Icon: CheckCircle2, color: 'var(--c-ok)' }
    : claim.supported === false
      ? { Icon: AlertCircle, color: 'var(--c-bad)' }
      : { Icon: HelpCircle, color: 'var(--c-warn)' };
  return (
    <li className="flex items-start gap-2 text-sm">
      <meta.Icon size={15} className="mt-0.5 shrink-0" style={{ color: meta.color }} />
      <div>
        <div>{claim.claim}</div>
        {claim.evidence && <div className="mt-0.5 text-xs text-muted">{claim.evidence}</div>}
      </div>
    </li>
  );
}

// Loads data on mount, whenever deps change, and after a news sync finishes;
// returns [data, error, reload].
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const reload = () => setTick((t) => t + 1);
    window.addEventListener('reels:synced', reload);
    return () => window.removeEventListener('reels:synced', reload);
  }, []);
  useEffect(() => {
    let live = true;
    fn().then(
      (data) => live && setState({ data, error: null }),
      (error) => live && setState((s) => ({ data: s.data, error })),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return [state.data, state.error, () => setTick((t) => t + 1)];
}

export function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function PageHeader({ title, sub, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
