import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Clipboard, ExternalLink } from 'lucide-react';
import { api } from '../api/client.js';
import { AudienceChip, ErrorBox, PageHeader, Spinner, timeAgo, useLoad } from '../components/ui.jsx';

const STAGES = ['new', 'in_community', 'contacted', 'qualified', 'customer', 'lost'];
const STAGE_LABEL = { new: 'New', in_community: 'In community', contacted: 'Contacted', qualified: 'Qualified', customer: 'Customer', lost: 'Lost' };

function Copy({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn px-2 py-1" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}>
      {done ? <Check size={12} /> : <Clipboard size={12} />} {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Setup() {
  const [setup] = useLoad(() => api.leadsSetup());
  const [open, setOpen] = useState(false);
  if (!setup) return null;
  const url = `${setup.public_url || 'https://YOUR-PUBLIC-ADDRESS'}${setup.path}`;
  const body = JSON.stringify({
    manychat_id: '{{user_id}}',
    ig_username: '{{ig_username}}',
    name: '{{full_name}}',
    keyword: setup.keyword,
    comment: '{{last_input_text}}',
    followed: 'true',
  }, null, 2);
  return (
    <section className="card mb-4 p-4">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-medium">ManyChat setup</span>
        <span className="text-sm text-muted">· keyword "{setup.keyword}"{setup.public_url ? '' : ' · public address not set yet'}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-3 text-sm">
          <p className="text-muted">In your ManyChat comment automation, after the DM with the community link, add an <strong>External Request</strong> step:</p>
          <dl className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
            <dt className="label pt-1">Method</dt><dd className="font-mono">POST</dd>
            <dt className="label pt-1">URL</dt>
            <dd className="flex min-w-0 items-center gap-2"><code className="input min-w-0 truncate py-1">{url}</code><Copy text={url} /></dd>
            <dt className="label pt-1">Header</dt>
            <dd className="flex min-w-0 items-center gap-2"><code className="input min-w-0 truncate py-1">X-Webhook-Secret: {setup.secret || '(set LEADS_WEBHOOK_SECRET)'}</code>{setup.secret && <Copy text={setup.secret} />}</dd>
            <dt className="label pt-1">Body (JSON)</dt>
            <dd className="min-w-0"><pre className="input overflow-auto font-mono text-xs">{body}</pre><div className="mt-1"><Copy text={body} /></div></dd>
          </dl>
          <p className="text-xs text-muted">In ManyChat, insert the variables with its "+ Add variable" button rather than typing the {'{{ }}'} names. Put this step after the follow check so <code>followed</code> is true. Keep the secret private.</p>
          {!setup.public_url && <p className="text-xs" style={{ color: 'var(--c-warn)' }}>ManyChat needs a public address to reach this laptop. See the README section "Public address for ManyChat".</p>}
        </div>
      )}
    </section>
  );
}

export default function Leads() {
  const [summary] = useLoad(() => api.leadsSummary());
  const [script, setScript] = useState('');
  const [leads, error, reload] = useLoad(() => api.leads(script ? { script } : {}), [script]);
  const [openId, setOpenId] = useState(null);
  const [saving, setSaving] = useState(null);

  const setStage = async (lead, stage) => {
    setSaving(lead.id);
    try { await api.updateLead(lead.id, { stage }); reload(); } finally { setSaving(null); }
  };

  return (
    <>
      <PageHeader title="Leads" sub={`People who commented "${summary?.keyword || 'AI'}" and got the community link by DM, and which reel brought them.`} />
      <Setup />

      {summary && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[['Total leads', summary.total], ['This week', summary.this_week], ['Followed first', summary.followed]].map(([l, v]) => (
            <div key={l} className="card p-4"><div className="label">{l}</div><div className="mt-1 font-mono text-2xl font-semibold">{v}</div></div>
          ))}
        </div>
      )}

      {summary?.per_reel?.length > 0 && (
        <section className="card mb-4 p-4">
          <h2 className="label mb-2">Leads per reel</h2>
          <ul className="grid gap-1 text-sm">
            {summary.per_reel.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="w-10 text-right font-mono font-semibold">{r.leads}</span>
                <AudienceChip audience={r.audience} />
                <Link to={`/scripts/${r.id}`} className="min-w-0 flex-1 truncate hover:underline">{r.title}</Link>
                <button className={`btn px-2 py-0.5 ${script === r.id ? 'btn-primary' : ''}`} onClick={() => setScript(script === r.id ? '' : r.id)}>{script === r.id ? 'Showing' : 'Show'}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ErrorBox error={error} />
      {!leads && !error && <div className="flex items-center gap-2 text-muted"><Spinner /> Loading</div>}
      {leads && leads.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">No leads yet. They appear here as soon as ManyChat sends the first one.</div>
      )}
      <ul className="grid gap-2">
        {(leads || []).map((l) => (
          <li key={l.id} className="card p-3">
            <div className="flex flex-wrap items-center gap-3">
              <button className="text-muted" onClick={() => setOpenId(openId === l.id ? null : l.id)} aria-label="Details">
                {openId === l.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.name || l.ig_username || 'Unknown'}</div>
                {l.ig_username && (
                  <a href={`https://instagram.com/${l.ig_username}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:underline">
                    @{l.ig_username} <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <span className="text-xs text-muted">{l.touches} comment{l.touches === 1 ? '' : 's'} · {timeAgo(l.last_seen_at)}</span>
              {l.followed && <span className="chip" style={{ color: 'var(--c-ok)' }}>follows</span>}
              <select className="input w-auto py-1 text-xs" value={l.stage} disabled={saving === l.id} onChange={(e) => setStage(l, e.target.value)} aria-label="Stage">
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
            </div>
            {openId === l.id && (
              <ul className="mt-2 grid gap-1 border-t border-line pt-2 text-sm">
                {(l.events || []).map((e, i) => (
                  <li key={i} className="flex flex-wrap gap-2">
                    <span className="text-xs text-muted">{timeAgo(e.at)}</span>
                    {e.script_id ? <Link to={`/scripts/${e.script_id}`} className="hover:underline">{e.title}</Link> : <span className="text-muted">Reel unknown</span>}
                    {e.attribution === 'latest_reel' && <span className="text-xs text-muted">(assumed: latest reel)</span>}
                    {e.comment && <span className="text-muted">"{e.comment}"</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
