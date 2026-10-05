import { Link } from 'react-router-dom';
import { useState } from 'react';
import { AlertCircle, AlertTriangle, Clock } from 'lucide-react';
import { api } from '../api/client.js';
import { AudienceChip, StatusChip, ErrorBox, PageHeader, Spinner, timeAgo, useLoad } from '../components/ui.jsx';

const STATUSES = ['draft', 'approved', 'rendered', 'published', 'rejected'];
const STATUS_LABEL = { draft: 'To review', approved: 'Approved', rendered: 'Rendered', published: 'Published', rejected: 'Rejected' };

export default function Queue() {
  const [status, setStatus] = useState('draft');
  const [audience, setAudience] = useState('');
  // The audience filter also offers tracks, as "track:<id>".
  const filter = audience.startsWith('track:') ? { track: audience.slice(6) } : audience ? { audience } : {};
  const [scripts, error] = useLoad(() => api.scripts({ status, ...filter }), [status, audience]);
  const [counts] = useLoad(() => api.scriptCounts(), [status]);

  const countFor = (s) => (counts || []).filter((c) => c.status === s && (!audience || audience.startsWith('track:') || c.audience === audience)).reduce((n, c) => n + c.n, 0);

  return (
    <>
      <PageHeader title="Review queue" sub="Approve a script, then paste it into HeyGen." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button key={s} className={`btn ${status === s ? 'btn-primary' : ''}`} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s]} <span className="opacity-60">{countFor(s)}</span>
            </button>
          ))}
        </div>
        <select className="input ml-auto w-auto" value={audience} onChange={(e) => setAudience(e.target.value)} aria-label="Audience">
          <option value="">All audiences</option>
          <option value="b2b">B2B · CXOs</option>
          <option value="b2c">B2C · Everyone</option>
          <option value="track:first-job">Pehli Job with AI</option>
        </select>
      </div>

      <ErrorBox error={error} />
      {!scripts && !error && <div className="flex items-center gap-2 text-muted"><Spinner /> Loading</div>}
      {scripts && scripts.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">
          Nothing here. {status === 'draft' && <>Draft one from <Link className="text-gold-ink underline" to="/news">AI news</Link> or <Link className="text-gold-ink underline" to="/new">a new reel</Link>.</>}
        </div>
      )}

      <ul className="grid gap-2">
        {(scripts || []).map((s) => (
          <li key={s.id} className="min-w-0">
            <Link to={`/scripts/${s.id}`} className="card flex min-w-0 flex-col gap-2 p-4 hover:bg-hover sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <AudienceChip audience={s.audience} />
                  {s.track && <span className="chip" style={{ color: 'var(--c-gold-ink)' }}>{s.track === 'first-job' ? 'Pehli Job' : s.track}</span>}
                  <span className="label">{s.series}</span>
                </div>
                <div className="truncate font-medium">{s.title}</div>
                {s.news_title && <div className="truncate text-xs text-muted">{s.news_source}: {s.news_title}</div>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted">
                {s.error_count > 0 && <span className="flex items-center gap-1" style={{ color: 'var(--c-bad)' }}><AlertCircle size={13} />{s.error_count}</span>}
                {s.warn_count > 0 && <span className="flex items-center gap-1" style={{ color: 'var(--c-warn)' }}><AlertTriangle size={13} />{s.warn_count}</span>}
                <span className="flex items-center gap-1 font-mono"><Clock size={13} />~{s.est_seconds}s</span>
                <StatusChip status={s.status} />
                <span className="w-16 text-right">{timeAgo(s.created_at)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
