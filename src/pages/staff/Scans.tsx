import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAccount } from '../../account/AccountContext';
import { ApiError } from '../../account/api';
import { AppShell } from '../../components/AppShell';
import { Button } from '../../components/Button';
import { timeAgo } from '../../lib/audit';
import {
  formatBytes,
  formatWhen,
  requestsApi,
  SCAN_STATUS_LABEL,
  SEVERITY_LABEL,
  type FindingInput,
  type LeadStatus,
  type Severity,
  type StaffFinding,
  type StaffRequest,
  type StaffScanDetail,
  type StaffScanItem,
} from '../../requests/api';
import { DetailText, Report, SeverityBadge } from '../requests/parts';
import { Blocked, StaffNav } from './Staff';
import '../../styles/app.css';
import '../../styles/flow.css';
import '../../styles/account.css';
import '../../styles/org.css';
import '../../styles/requests.css';

/** "due in 5 h" / "3 h overdue", for a 48-hour turnaround. */
function dueText(iso: string | null) {
  if (!iso) return '';
  const h = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000);
  if (h < 0) return `${-h} h overdue`;
  if (h < 1) return 'due within the hour';
  return h < 48 ? `due in ${h} h` : `due ${formatWhen(iso)}`;
}
const overdue = (iso: string | null) => !!iso && new Date(iso).getTime() < Date.now();

/* ---------- Queue ---------- */

const SCAN_TABS = [
  { key: 'todo', label: 'To review' },
  { key: 'sent', label: 'Sent' },
  { key: 'other', label: 'Uploading or withdrawn' },
  { key: 'all', label: 'All' },
] as const;
type ScanTab = (typeof SCAN_TABS)[number]['key'];

export function StaffScans() {
  const [params, setParams] = useSearchParams();
  const tab = (SCAN_TABS.find((t) => t.key === params.get('state'))?.key ?? 'todo') as ScanTab;
  const [scans, setScans] = useState<StaffScanItem[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [blocked, setBlocked] = useState<Error | null>(null);

  useEffect(() => {
    setScans(null);
    requestsApi
      .staffScans(tab)
      .then((r) => {
        setScans(r.scans);
        setCounts(r.counts);
      })
      .catch((err: Error) => (err instanceof ApiError && err.status === 403 ? setBlocked(err) : setScans([])));
  }, [tab]);

  if (blocked) return <Blocked error={blocked} />;
  const n = (k: ScanTab) =>
    k === 'todo' ? (counts.received ?? 0) + (counts.in_review ?? 0) : k === 'sent' ? (counts.sent ?? 0) : k === 'other' ? (counts.uploading ?? 0) + (counts.withdrawn ?? 0) : Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <AppShell>
      <main className="app-main staff-main">
        <div className="stack suite-head__copy">
          <span className="eyebrow">BIOMEDIX</span>
          <h1 className="setup-main__title">Gap scans</h1>
          <p className="setup-main__blurb">Files companies shared for a free gap scan. Keep or dismiss each automated finding, add your own, and send the report.</p>
        </div>
        <StaffNav />
        <div role="group" aria-label="Filter" className="staff-filter">
          {SCAN_TABS.map((t) => (
            <button key={t.key} type="button" aria-pressed={tab === t.key} className={`pill${tab === t.key ? ' pill--active' : ''}`} onClick={() => setParams({ state: t.key })}>
              {t.label} <span className="pill__count">{n(t.key)}</span>
            </button>
          ))}
        </div>
        <section className="card card--compact stack" aria-label="Gap scans">
          {scans === null ? (
            <p className="text-muted-sm">Loading…</p>
          ) : !scans.length ? (
            <p className="text-muted-sm">{tab === 'todo' ? 'Nothing waiting. New scans arrive here and by email.' : 'None.'}</p>
          ) : (
            <div className="table-wrap">
              <table className="readiness-table admin-table scan-table">
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    <th scope="col">Files</th>
                    <th scope="col">Findings</th>
                    <th scope="col">{tab === 'sent' ? 'Sent' : 'Due'}</th>
                    <th scope="col">Reviewer</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((s) => (
                    <tr key={s.id}>
                      <th scope="row">
                        <Link to={`/staff/scans/${s.id}`} className="scan-table__link">
                          {s.company}
                        </Link>
                        <span className="text-muted-sm scan-table__who">
                          {s.name}
                          {s.deviceType ? ` · ${s.deviceType}` : ''}
                        </span>
                      </th>
                      <td>{s.files}</td>
                      <td>{s.status === 'received' || s.status === 'in_review' ? `${s.openFindings} to review · ${s.keptFindings} kept` : `${s.keptFindings} kept`}</td>
                      <td className={s.status !== 'sent' && overdue(s.dueAt) ? 'scan-table__late' : ''}>
                        {s.status === 'sent' ? timeAgo(s.sentAt!) : s.status === 'received' || s.status === 'in_review' ? dueText(s.dueAt) : '—'}
                      </td>
                      <td>{s.reviewer ? (s.reviewerIsYou ? 'You' : s.reviewer) : <span className="text-muted-sm">Unclaimed</span>}</td>
                      <td>
                        <span className={`rq-status rq-status--${s.status}`}>{SCAN_STATUS_LABEL[s.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}

/* ---------- One scan ---------- */

const EMPTY: FindingInput = { severity: 'medium', area: '', title: '', detail: '', fix: '', clause: '', fileId: null };

function FindingEditor({
  initial,
  files,
  onSave,
  onCancel,
  saveLabel = 'Save',
}: {
  initial: FindingInput;
  files: StaffScanDetail['files'];
  onSave: (f: FindingInput) => Promise<void>;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const [f, setF] = useState<FindingInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FindingInput) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const id = initial.title ? 'fe' : 'fn';
  return (
    <form
      className="stack finding-edit"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSave(f);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Couldn’t save.');
          setBusy(false);
        }
      }}
    >
      <div className="field-row finding-edit__row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-sev`}>
            Priority
          </label>
          <select id={`${id}-sev`} className="input" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as Severity })}>
            {(['high', 'medium', 'low'] as const).map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-area`}>
            Area
          </label>
          <input id={`${id}-area`} className="input" maxLength={60} placeholder="e.g. Risk management" value={f.area ?? ''} onChange={set('area')} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-file`}>
            Found in
          </label>
          <select id={`${id}-file`} className="input" value={f.fileId ?? ''} onChange={(e) => setF({ ...f, fileId: e.target.value || null })}>
            <option value="">Across the files</option>
            {files.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-title`}>
          Gap
        </label>
        <input id={`${id}-title`} className="input" required maxLength={200} value={f.title ?? ''} onChange={set('title')} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-detail`}>
          What we found
        </label>
        <textarea id={`${id}-detail`} className="input input--area" rows={4} maxLength={6000} value={f.detail ?? ''} onChange={set('detail')} />
        <p className="field__hint">Start a line with “- ” to list examples.</p>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-fix`}>
          What to do
        </label>
        <textarea id={`${id}-fix`} className="input input--area" rows={2} maxLength={3000} value={f.fix ?? ''} onChange={set('fix')} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-clause`}>
          Clause
        </label>
        <input id={`${id}-clause`} className="input" maxLength={200} placeholder="e.g. ISO 14971:2019 §7.2" value={f.clause ?? ''} onChange={set('clause')} />
      </div>
      {error && (
        <p role="alert" className="auth__error">
          {error}
        </p>
      )}
      <div className="button-row button-row--tight">
        <Button type="submit" size="sm" disabled={busy}>
          {saveLabel}
        </Button>
        <Button size="sm" variant="text" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const FINDING_FILTERS = [
  { key: 'open', label: 'To review' },
  { key: 'kept', label: 'Kept' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
] as const;

export function StaffScan() {
  const { id = '' } = useParams();
  const { user } = useAccount();
  const [d, setD] = useState<StaffScanDetail | null>(null);
  const [blocked, setBlocked] = useState<Error | null>(null);
  const [filter, setFilter] = useState<(typeof FINDING_FILTERS)[number]['key']>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [summaryState, setSummaryState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [confirmSend, setConfirmSend] = useState(false);
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(
    () =>
      requestsApi
        .staffScan(id)
        .then((r) => {
          setD(r);
          return r;
        })
        .catch((err: Error) => {
          if (err instanceof ApiError && (err.status === 403 || err.status === 404)) setBlocked(err);
          return null;
        }),
    [id],
  );
  useEffect(() => {
    void load().then((r) => {
      if (!r) return;
      setSummary(r.scan.summary);
      setFilter(r.findings.some((f) => f.status === 'open') ? 'open' : 'all');
    });
  }, [load]);

  if (blocked) return <Blocked error={blocked} />;
  if (!d)
    return (
      <AppShell>
        <main className="app-main app-loading" aria-busy="true">
          <span className="app-loading__dot" aria-hidden="true" />
          Loading the gap scan…
        </main>
      </AppShell>
    );

  const editable = d.scan.status === 'received' || d.scan.status === 'in_review';
  const auto = d.findings.filter((f) => f.source === 'auto');
  const reviewed = auto.filter((f) => f.status !== 'open').length;
  const shown = d.findings.filter((f) => filter === 'all' || f.status === filter);
  const mine = d.scan.reviewerId === user?.id;

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    try {
      await fn();
      await load();
      if (ok) setMsg({ ok: true, text: ok });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };
  const update = (f: StaffFinding, b: FindingInput) => act(() => requestsApi.updateFinding(id, f.id, b));
  const saveSummary = async () => {
    if (summaryState !== 'dirty') return;
    setSummaryState('saving');
    try {
      await requestsApi.saveSummary(id, summary);
      setSummaryState('saved');
      setD((x) => (x ? { ...x, scan: { ...x.scan, summary } } : x));
    } catch (err) {
      setSummaryState('dirty');
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Couldn’t save the summary.' });
    }
  };
  const blockers = [
    auto.length - reviewed > 0 && `${auto.length - reviewed} automated finding${auto.length - reviewed === 1 ? '' : 's'} to keep or dismiss`,
    !summary.trim() && 'a summary for the requester',
  ].filter(Boolean) as string[];

  return (
    <AppShell>
      <main className="app-main staff-main scan-main">
        <Link to="/staff/scans" className="text-muted-sm scan-back">
          ← Gap scans
        </Link>
        <div className="scan-head">
          <div className="stack suite-head__copy">
            <span className="eyebrow">GAP SCAN</span>
            <h1 className="setup-main__title">{d.request.company}</h1>
            <p className="setup-main__blurb">
              {d.request.name} · <a href={`mailto:${d.request.email}`}>{d.request.email}</a>
              {d.scan.submittedAt && ` · sent ${timeAgo(d.scan.submittedAt)}`}
            </p>
          </div>
          <div className="stack scan-head__side">
            <span className={`rq-status rq-status--${d.scan.status}`}>{SCAN_STATUS_LABEL[d.scan.status]}</span>
            {editable && <span className={overdue(d.scan.dueAt) ? 'scan-table__late' : 'text-muted-sm'}>{dueText(d.scan.dueAt)}</span>}
            {d.scan.status === 'sent' && <span className="text-muted-sm">Sent {formatWhen(d.scan.sentAt)} by {d.scan.reviewer}</span>}
            {editable && !mine && (
              <Button size="sm" variant={d.scan.reviewerId ? 'outline' : 'primary'} onClick={() => void act(() => requestsApi.claimScan(id), 'You’re the reviewer on this scan.')}>
                {d.scan.reviewerId ? `Take over from ${d.scan.reviewer}` : 'Claim this scan'}
              </Button>
            )}
            {editable && mine && <span className="text-muted-sm">You’re reviewing this</span>}
          </div>
        </div>
        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'form-msg form-msg--ok' : 'form-msg form-msg--err'}>
            {msg.text}
          </p>
        )}

        <div className="scan-grid">
          <div className="stack scan-col">
            {preview ? (
              <>
                <div className="button-row">
                  <Button size="sm" variant="outline" onClick={() => setPreview(false)}>
                    Back to findings
                  </Button>
                </div>
                <Report report={{ ...d.report, summary }} company={d.request.company} preview={d.scan.status !== 'sent'} />
              </>
            ) : (
              <>
                <section className="card card--compact stack" aria-labelledby="fnd-h">
                  <div className="outline__head">
                    <h2 id="fnd-h" className="card__title card__title--sm">
                      Findings
                    </h2>
                    <span className="text-muted-sm">
                      {reviewed} of {auto.length} automated reviewed
                    </span>
                  </div>
                  <span className="scan-progress" aria-hidden="true">
                    <span style={{ width: `${auto.length ? (reviewed / auto.length) * 100 : 100}%` }} />
                  </span>
                  <div role="group" aria-label="Show" className="staff-filter">
                    {FINDING_FILTERS.map((t) => (
                      <button key={t.key} type="button" aria-pressed={filter === t.key} className={`pill${filter === t.key ? ' pill--active' : ''}`} onClick={() => setFilter(t.key)}>
                        {t.label} <span className="pill__count">{t.key === 'all' ? d.findings.length : d.findings.filter((f) => f.status === t.key).length}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {editable && editing === 'new' && (
                  <section className="card card--compact stack" aria-label="New finding">
                    <h3 className="card__title card__title--sm">Add a finding</h3>
                    <FindingEditor
                      initial={EMPTY}
                      files={d.files}
                      saveLabel="Add finding"
                      onCancel={() => setEditing(null)}
                      onSave={async (f) => {
                        await requestsApi.addFinding(id, f);
                        setEditing(null);
                        setFilter('all');
                        await load();
                      }}
                    />
                  </section>
                )}

                <ol className="list-reset stack scan-findings">
                  {shown.map((f) => (
                    <li key={f.id} className={`card card--compact finding finding--staff finding--${f.status}`}>
                      {editing === f.id ? (
                        <FindingEditor
                          initial={{ severity: f.severity, area: f.area, title: f.title, detail: f.detail, fix: f.fix, clause: f.clause, fileId: f.fileId }}
                          files={d.files}
                          onCancel={() => setEditing(null)}
                          onSave={async (b) => {
                            await requestsApi.updateFinding(id, f.id, { ...b, status: f.status === 'open' ? 'kept' : f.status });
                            setEditing(null);
                            await load();
                          }}
                        />
                      ) : (
                        <>
                          <div className="finding__top">
                            <SeverityBadge severity={f.severity} />
                            <span className="finding__area">{f.area}</span>
                            {f.file && <span className="finding__file">{f.file}</span>}
                            <span className="finding__src">
                              {f.source === 'auto' ? (f.edited ? 'Automated, edited' : 'Automated') : 'Engineer'}
                              {f.status !== 'open' && ` · ${f.status === 'kept' ? 'kept' : 'dismissed'}`}
                            </span>
                          </div>
                          <h3 className="finding__title">{f.title}</h3>
                          {f.detail && <DetailText text={f.detail} />}
                          {f.fix && (
                            <p className="finding__fix">
                              <strong>What to do:</strong> {f.fix}
                            </p>
                          )}
                          {f.clause && <p className="finding__clause mono">{f.clause}</p>}
                          {editable && (
                            <div className="button-row button-row--tight finding__actions">
                              {f.status !== 'kept' && (
                                <Button size="sm" onClick={() => void update(f, { status: 'kept' })}>
                                  Keep
                                </Button>
                              )}
                              {f.status !== 'dismissed' && f.source === 'auto' && (
                                <Button size="sm" variant="outline" onClick={() => void update(f, { status: 'dismissed' })}>
                                  Dismiss
                                </Button>
                              )}
                              <Button size="sm" variant="text" onClick={() => setEditing(f.id)}>
                                Edit
                              </Button>
                              {f.source === 'engineer' && (
                                <Button size="sm" variant="text" onClick={() => void act(() => requestsApi.deleteFinding(id, f.id))}>
                                  Delete
                                </Button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                  {!shown.length && <li className="text-muted-sm">Nothing here.</li>}
                </ol>
                {editable && editing !== 'new' && (
                  <div className="button-row">
                    <Button variant="outline" onClick={() => setEditing('new')}>
                      Add a finding
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="stack scan-side" aria-label="Request details">
            <section className="card card--compact stack" aria-labelledby="rep-h">
              <h2 id="rep-h" className="card__title card__title--sm">
                {d.scan.status === 'sent' ? 'Report' : 'Send the report'}
              </h2>
              <div className="field">
                <label htmlFor="scan-summary" className="field__label">
                  Summary for {d.request.name.split(' ')[0]}
                </label>
                <textarea
                  id="scan-summary"
                  className="input input--area"
                  rows={6}
                  maxLength={8000}
                  disabled={!editable}
                  placeholder="Two or three sentences: where they stand, the most important gaps and what to fix first."
                  value={summary}
                  onChange={(e) => {
                    setSummary(e.target.value);
                    setSummaryState('dirty');
                  }}
                  onBlur={() => void saveSummary()}
                />
                {editable && <p className="field__hint">{summaryState === 'saving' ? 'Saving…' : summaryState === 'dirty' ? 'Saves when you click away' : 'Saved'}</p>}
              </div>
              <div className="button-row button-row--tight">
                <Button size="sm" variant="outline" onClick={() => setPreview((v) => !v)}>
                  {preview ? 'Back to findings' : d.scan.status === 'sent' ? 'View the report' : 'Preview the report'}
                </Button>
              </div>
              {editable &&
                (blockers.length ? (
                  <p className="text-muted-sm">Before sending: {blockers.join(' and ')}.</p>
                ) : confirmSend ? (
                  <div className="stack scan-send">
                    <p className="text-muted-sm">
                      Send {d.report.findings.length} finding{d.report.findings.length === 1 ? '' : 's'} to {d.request.email}? The report can’t be changed after.
                    </p>
                    <div className="button-row button-row--tight">
                      <Button
                        size="sm"
                        onClick={() =>
                          void act(async () => {
                            await saveSummary();
                            await requestsApi.sendReport(id);
                            setConfirmSend(false);
                          }, `Report sent to ${d.request.email}.`)
                        }
                      >
                        Send now
                      </Button>
                      <Button size="sm" variant="text" onClick={() => setConfirmSend(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => setConfirmSend(true)}>Send report</Button>
                ))}
            </section>

            <section className="card card--compact stack" aria-labelledby="who-h">
              <h2 id="who-h" className="card__title card__title--sm">
                Request
              </h2>
              <dl className="scan-dl">
                {d.request.role && (
                  <>
                    <dt>Role</dt>
                    <dd>{d.request.role}</dd>
                  </>
                )}
                {d.request.device && (
                  <>
                    <dt>Device</dt>
                    <dd>{d.request.device}</dd>
                  </>
                )}
                <dt>Type</dt>
                <dd>
                  {d.request.deviceType || 'Not given'}
                  {d.request.ai ? ' · uses AI' : ''}
                </dd>
                <dt>Stage</dt>
                <dd>{d.request.stage || 'Not given'}</dd>
                <dt>Demo</dt>
                <dd>{d.request.wantsDemo ? (d.request.scheduledAt ? `Booked ${timeAgo(d.request.scheduledAt)}` : 'Wanted, not booked yet') : 'No'}</dd>
              </dl>
              {d.scan.focus && (
                <blockquote className="scan-quote">
                  <strong>Focus:</strong> {d.scan.focus}
                </blockquote>
              )}
              {d.request.message && <blockquote className="scan-quote">{d.request.message}</blockquote>}
            </section>

            <section className="card card--compact stack" aria-labelledby="files-h">
              <h2 id="files-h" className="card__title card__title--sm">
                Files
              </h2>
              {d.scan.filesDeleted && <p className="text-muted-sm">The files have been deleted.</p>}
              <ul className="list-reset stack scan-files">
                {d.files.map((f) => (
                  <li key={f.id} className="scan-files__item">
                    {f.deleted ? (
                      <span className="scan-files__name">{f.name}</span>
                    ) : (
                      <a href={requestsApi.fileUrl(id, f.id)} className="scan-files__name" download>
                        {f.name}
                      </a>
                    )}
                    <span className="text-muted-sm">
                      {f.kindLabel} · {formatBytes(f.size)}
                      {f.pages ? ` · ${f.pages} p` : ''}
                    </span>
                    {f.readNote && <span className="rq-files__note">{f.readNote}</span>}
                  </li>
                ))}
              </ul>
              <ul className="list-reset stack scan-coverage">
                {d.scan.coverage
                  .filter((c) => !c.files.length)
                  .map((c) => (
                    <li key={c.area} className="text-muted-sm">
                      {c.note}
                    </li>
                  ))}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

/* ---------- Demo requests ---------- */

const LEAD_TABS = [
  { key: 'open', label: 'Open' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'scheduled', label: 'Booked' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
] as const;
type LeadTab = (typeof LEAD_TABS)[number]['key'];
const LEAD_LABEL: Record<LeadStatus, string> = { new: 'New', contacted: 'Contacted', scheduled: 'Demo booked', closed: 'Closed' };

function LeadCard({ r, onChange }: { r: StaffRequest; onChange: () => void }) {
  const [notes, setNotes] = useState(r.notes);
  const [state, setState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const saveNotes = async () => {
    if (state !== 'dirty') return;
    setState('saving');
    try {
      await requestsApi.updateRequest(r.id, { notes });
      setState('saved');
    } catch {
      setState('error');
    }
  };
  return (
    <li className="card card--compact stack lead">
      <div className="lead__top">
        <div className="stack lead__who">
          <h2 className="card__title card__title--sm">{r.company}</h2>
          <span className="text-muted-sm">
            {r.name}
            {r.role ? `, ${r.role}` : ''} · <a href={`mailto:${r.email}`}>{r.email}</a>
            {r.signedIn ? ' · has an account' : ''}
          </span>
        </div>
        <div className="stack lead__side">
          <label className="visually-hidden" htmlFor={`lead-${r.id}`}>
            Status for {r.company}
          </label>
          <select
            id={`lead-${r.id}`}
            className="input input--sm"
            value={r.status}
            onChange={async (e) => {
              await requestsApi.updateRequest(r.id, { status: e.target.value as LeadStatus });
              onChange();
            }}
          >
            {(Object.keys(LEAD_LABEL) as LeadStatus[]).map((s) => (
              <option key={s} value={s}>
                {LEAD_LABEL[s]}
              </option>
            ))}
          </select>
          <span className="text-muted-sm">{timeAgo(r.createdAt)}</span>
        </div>
      </div>
      <div className="lead__tags">
        {r.wantsDemo && <span className="tag">{r.scheduledAt ? 'Demo booked' : 'Demo'}</span>}
        {r.scan && (
          <Link to={`/staff/scans/${r.scan.id}`} className="tag tag--link">
            Gap scan: {SCAN_STATUS_LABEL[r.scan.status].toLowerCase()}
          </Link>
        )}
        {[r.deviceType, r.stage, r.ai && 'AI'].filter(Boolean).map((t) => (
          <span key={t as string} className="tag tag--plain">
            {t}
          </span>
        ))}
      </div>
      {r.device && <p className="lead__device">{r.device}</p>}
      {r.message && <blockquote className="scan-quote">{r.message}</blockquote>}
      <div className="field">
        <label htmlFor={`notes-${r.id}`} className="field__label">
          Notes
        </label>
        <textarea
          id={`notes-${r.id}`}
          className="input input--area"
          rows={2}
          maxLength={8000}
          placeholder="Only Biomedix staff see these."
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setState('dirty');
          }}
          onBlur={() => void saveNotes()}
        />
        <p className="field__hint">{state === 'saving' ? 'Saving…' : state === 'error' ? 'Couldn’t save. Click away to try again.' : state === 'dirty' ? 'Saves when you click away' : ''}</p>
      </div>
    </li>
  );
}

export function StaffRequests() {
  const [params, setParams] = useSearchParams();
  const tab = (LEAD_TABS.find((t) => t.key === params.get('status'))?.key ?? 'open') as LeadTab;
  const [rows, setRows] = useState<StaffRequest[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [blocked, setBlocked] = useState<Error | null>(null);
  const load = useCallback(() => {
    requestsApi
      .staffRequests(tab)
      .then((r) => {
        setRows(r.requests);
        setCounts(r.counts);
      })
      .catch((err: Error) => (err instanceof ApiError && err.status === 403 ? setBlocked(err) : setRows([])));
  }, [tab]);
  useEffect(load, [load]);
  if (blocked) return <Blocked error={blocked} />;
  const n = (k: LeadTab) =>
    k === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : k === 'open' ? (counts.new ?? 0) + (counts.contacted ?? 0) + (counts.scheduled ?? 0) : (counts[k] ?? 0);
  return (
    <AppShell>
      <main className="app-main staff-main">
        <div className="stack suite-head__copy">
          <span className="eyebrow">BIOMEDIX</span>
          <h1 className="setup-main__title">Demo requests</h1>
          <p className="setup-main__blurb">Everyone who asked for a demo or a gap scan. Bookings through the scheduler move to “Demo booked” on their own.</p>
        </div>
        <StaffNav />
        <div role="group" aria-label="Filter" className="staff-filter">
          {LEAD_TABS.map((t) => (
            <button key={t.key} type="button" aria-pressed={tab === t.key} className={`pill${tab === t.key ? ' pill--active' : ''}`} onClick={() => setParams({ status: t.key })}>
              {t.label} <span className="pill__count">{n(t.key)}</span>
            </button>
          ))}
        </div>
        {rows === null ? (
          <p className="text-muted-sm">Loading…</p>
        ) : !rows.length ? (
          <p className="card card--compact text-muted-sm">No requests here yet. They arrive from /demo and /gap-scan.</p>
        ) : (
          <ul className="list-reset stack leads">
            {rows.map((r) => (
              <LeadCard key={`${r.id}:${r.status}`} r={r} onChange={load} />
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
