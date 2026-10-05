import { api } from '../api/client.js';
import { AudienceChip, ErrorBox, PageHeader, Spinner, timeAgo, useLoad } from '../components/ui.jsx';

const JOB_COLOR = { running: 'var(--c-warn)', completed: 'var(--c-ok)', failed: 'var(--c-bad)' };

function jobSummary(job) {
  const r = job.result;
  if (!r) return '';
  if (job.type === 'daily_run') return `${r.ingest?.inserted ?? 0} new stories, ${r.drafted?.length ?? 0} drafted${r.errors?.length ? `, ${r.errors.length} failed` : ''}`;
  if (job.type === 'fetch_news') return `${r.ingest?.inserted ?? 0} new stories, ${r.rank?.scored ?? 0} scored`;
  if (r.title) return r.title;
  return '';
}

export default function Settings() {
  const [config, error] = useLoad(() => api.config());
  const [jobs, jobsError] = useLoad(() => api.jobs());

  return (
    <>
      <PageHeader title="Settings" sub="Read-only. Edit the files in api/config and restart the API to change these." />
      <ErrorBox error={error} />
      {!config && !error && <div className="flex items-center gap-2 text-muted"><Spinner /> Loading</div>}

      {config && (
        <div className="grid gap-6">
          {!config.llmConfigured && <ErrorBox error={{ message: 'OPENROUTER_API_KEY is not set in api/.env, so scripts cannot be written.' }} />}

          <section>
            <h2 className="label mb-2">Audiences · api/config/audiences.js</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.values(config.audiences).map((a) => (
                <div key={a.id} className="card p-4 text-sm">
                  <div className="mb-2 flex items-center gap-2"><AudienceChip audience={a.id} /> <span className="font-medium">{a.label}</span></div>
                  <p className="text-muted">{a.listener}</p>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="label">Language</dt><dd>{a.language}</dd>
                    <dt className="label">Length</dt><dd>{a.targetWords[0]}–{a.targetWords[1]} words</dd>
                    <dt className="label">Series</dt><dd>{[...new Set(Object.values(a.series))].join(' · ')}</dd>
                    <dt className="label">Default CTA</dt><dd>{a.ctaFallback}</dd>
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="label mb-2">Offerings · api/config/brand.js</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(config.offerings).flatMap(([aud, list]) => list.map((o) => (
                <div key={o.id} className="card p-4 text-sm">
                  <div className="mb-1 flex items-center gap-2"><AudienceChip audience={aud} /> <span className="font-medium">{o.name}</span></div>
                  <ul className="list-disc pl-5 text-muted">{o.facts.map((f) => <li key={f}>{f}</li>)}</ul>
                  <div className="mt-2 text-xs"><span className="label">CTA</span> {o.cta}</div>
                </div>
              )))}
            </div>
          </section>

          <section>
            <h2 className="label mb-2">News sources · api/config/sources.js</h2>
            <ul className="card divide-y divide-line text-sm">
              {config.sources.map((s) => (
                <li key={s.url} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                  <span>{s.name}</span><span className="truncate font-mono text-xs text-muted">{s.url}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <section className="mt-6">
        <h2 className="label mb-2">Recent jobs</h2>
        <ErrorBox error={jobsError} />
        <ul className="card divide-y divide-line text-sm">
          {(jobs || []).length === 0 && <li className="px-4 py-3 text-muted">No jobs yet.</li>}
          {(jobs || []).map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <span className="chip" style={{ color: JOB_COLOR[j.status] }}>{j.status}</span>
              <span className="font-mono text-xs">{j.type}</span>
              <span className="text-muted">{j.detail}</span>
              <span className="min-w-0 flex-1 truncate">{j.error ? <span style={{ color: 'var(--c-bad)' }}>{j.error}</span> : jobSummary(j)}</span>
              <span className="text-xs text-muted">{timeAgo(j.started_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
