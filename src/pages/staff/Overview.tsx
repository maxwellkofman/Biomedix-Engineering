import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../account/api';
import { AppShell } from '../../components/AppShell';
import { ThreadList, ThreadView } from '../../components/AskEngineer';
import { helpApi, type StaffOverview as Overview, type Thread, type ThreadStatus } from '../../help/api';
import { describeAudit, timeAgo } from '../../lib/audit';
import { formatWhen } from '../../requests/api';
import { Blocked, StaffNav } from './Staff';
import '../../styles/app.css';
import '../../styles/flow.css';
import '../../styles/account.css';
import '../../styles/org.css';
import '../../styles/clean.css';

function Queue({
  to,
  label,
  count,
  note,
  alert,
}: {
  to: string;
  label: string;
  count: number;
  note: string;
  alert?: boolean;
}) {
  return (
    <Link to={to} className={`queue-tile${count ? ' queue-tile--busy' : ''}${alert ? ' queue-tile--alert' : ''}`}>
      <span className="queue-tile__count">{count}</span>
      <span className="stack queue-tile__text">
        <span className="queue-tile__label">{label}</span>
        <span className="text-muted-sm">{note}</span>
      </span>
    </Link>
  );
}

function Panel({ title, to, empty, children }: { title: string; to: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="card card--compact stack">
      <div className="outline__head">
        <h2 className="card__title card__title--sm">{title}</h2>
        <Link to={to} className="text-muted-sm">
          Open queue →
        </Link>
      </div>
      {children.length ? <ul className="list-reset stack admin-list">{children}</ul> : <p className="text-muted-sm">{empty}</p>}
    </section>
  );
}

/** /staff — the Biomedix home screen: everything waiting on staff, then the business at a glance. */
export function StaffOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [blocked, setBlocked] = useState<Error | null>(null);

  useEffect(() => {
    helpApi
      .overview()
      .then(setData)
      .catch((err: Error) => setBlocked(err));
  }, []);

  if (blocked) return <Blocked error={blocked instanceof ApiError ? blocked : new Error(blocked.message)} />;
  const q = data?.queues;
  const waiting = q ? q.reviews + q.scans + q.requests + q.questions : 0;
  const admin = data?.role === 'admin';

  return (
    <AppShell>
      <main className="app-main dash-main">
        <div className="stack home-head__copy">
          <span className="eyebrow">BIOMEDIX {admin ? 'ADMIN' : 'REVIEWER'}</span>
          <h1 className="home-head__title">{!data ? 'Loading…' : waiting ? `${waiting} thing${waiting === 1 ? '' : 's'} waiting on Biomedix` : 'Nothing is waiting on Biomedix'}</h1>
        </div>
        <StaffNav />

        {data && q && (
          <>
            <section className="queue-tiles" aria-label="Queues">
              <Queue to="/staff/reviews" label="Technical reviews" count={q.reviews} note="Drafts submitted by customers" />
              <Queue
                to="/staff/scans"
                label="Gap scans"
                count={q.scans}
                note={q.scansOverdue ? `${q.scansOverdue} overdue` : 'To review and send'}
                alert={q.scansOverdue > 0}
              />
              <Queue to="/staff/questions" label="Questions" count={q.questions} note="From customers, unanswered" />
              <Queue to="/staff/requests" label="New requests" count={q.requests} note="Demos and gap scans to follow up" />
            </section>

            <div className="admin-grid">
              <Panel title="Oldest reviews" to="/staff/reviews" empty="No drafts are waiting for technical review.">
                {data.reviews.map((r) => (
                  <li key={`${r.projectId}-${r.docId}`}>
                    <Link to={`/staff/reviews?doc=${encodeURIComponent(`${r.projectId}:${r.docId}`)}`} className="admin-row">
                      <span className="stack admin-row__main">
                        <span className="admin-row__title">
                          <span className="mono">{r.docId}</span> {r.title}
                        </span>
                        <span className="text-muted-sm">
                          {r.orgName}
                          {r.device ? ` · ${r.device}` : ''}
                        </span>
                      </span>
                      <span className="text-muted-sm">{timeAgo(r.at)}</span>
                    </Link>
                  </li>
                ))}
              </Panel>

              <Panel title="Gap scans due" to="/staff/scans" empty="No gap scans to review.">
                {data.scans.map((s) => (
                  <li key={s.id}>
                    <Link to={`/staff/scans/${s.id}`} className="admin-row">
                      <span className="stack admin-row__main">
                        <span className="admin-row__title">{s.company}</span>
                        <span className="text-muted-sm">
                          {s.reviewer ? `With ${s.reviewer}` : 'Unclaimed'} · {s.openFindings} finding{s.openFindings === 1 ? '' : 's'} to decide
                        </span>
                      </span>
                      <span className={`status ${s.overdue ? 'status--input' : 'status--na'}`}>{s.overdue ? 'Overdue' : `Due ${formatWhen(s.dueAt)}`}</span>
                    </Link>
                  </li>
                ))}
              </Panel>

              <Panel title="Unanswered questions" to="/staff/questions" empty="No questions are waiting for an answer.">
                {data.questions.map((t) => (
                  <li key={t.id}>
                    <Link to={`/staff/questions?open=${t.id}`} className="admin-row">
                      <span className="stack admin-row__main">
                        <span className="admin-row__title">{t.subject}</span>
                        <span className="text-muted-sm">
                          {t.orgName} · {t.asker}
                        </span>
                      </span>
                      <span className="text-muted-sm">{timeAgo(t.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </Panel>

              <Panel title="New demo and gap scan requests" to="/staff/requests" empty="No new requests.">
                {data.requests.map((r) => (
                  <li key={r.id}>
                    <Link to="/staff/requests" className="admin-row">
                      <span className="stack admin-row__main">
                        <span className="admin-row__title">{r.company}</span>
                        <span className="text-muted-sm">
                          {r.name} · {r.wantsDemo ? 'wants a demo' : 'gap scan only'}
                        </span>
                      </span>
                      <span className="text-muted-sm">{timeAgo(r.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </Panel>
            </div>

            <section className="card card--compact stack" aria-labelledby="biz-h">
              <h2 id="biz-h" className="card__title card__title--sm">
                Customers at a glance
              </h2>
              <dl className="admin-facts">
                {(
                  [
                    ['Companies', data.totals.orgs, data.totals.newOrgs ? `${data.totals.newOrgs} new this week` : 'none new this week'],
                    ['People', data.totals.users, data.totals.newUsers ? `${data.totals.newUsers} new this week` : 'none new this week'],
                    ['Projects', data.totals.projects, `average readiness ${data.totals.avgReadiness}%`],
                    ['Documents approved', data.docs.approved, `${data.docs.awaiting_approval} waiting on customers`],
                  ] as [string, number, string][]
                ).map(([k, v, sub]) => (
                  <div key={k} className="admin-facts__cell">
                    <dt>{k}</dt>
                    <dd>
                      <strong>{v}</strong>
                      <span className="text-muted-sm">{sub}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {admin && (
              <div className="admin-grid">
                <section className="card card--compact stack">
                  <div className="outline__head">
                    <h2 className="card__title card__title--sm">Newest companies</h2>
                    <Link to="/staff/admin" className="text-muted-sm">
                      All companies and people →
                    </Link>
                  </div>
                  {data.companies.length ? (
                    <ul className="list-reset stack admin-list">
                      {data.companies.map((o) => (
                        <li key={o.id} className="admin-row">
                          <span className="stack admin-row__main">
                            <span className="admin-row__title">{o.name}</span>
                            <span className="text-muted-sm">
                              {o.members} {o.members === 1 ? 'person' : 'people'} · {o.projects} project{o.projects === 1 ? '' : 's'} · joined {timeAgo(o.createdAt)}
                            </span>
                          </span>
                          <span className="text-muted-sm">{o.projects ? `${o.readiness}% ready` : 'No project yet'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-sm">No companies yet.</p>
                  )}
                </section>
                <section className="card card--compact stack">
                  <h2 className="card__title card__title--sm">Recent customer activity</h2>
                  {data.activity.length ? (
                    <ul className="list-reset stack admin-list">
                      {data.activity.map((a) => (
                        <li key={a.id} className="admin-row">
                          <span className="stack admin-row__main">
                            <span className="admin-row__title">{describeAudit(a)}</span>
                            <span className="text-muted-sm">{a.orgName}</span>
                          </span>
                          <span className="text-muted-sm">{timeAgo(a.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-sm">Nothing yet.</p>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}

const TABS: { key: ThreadStatus | 'all'; label: string }[] = [
  { key: 'open', label: 'Unanswered' },
  { key: 'answered', label: 'Answered' },
  { key: 'closed', label: 'Closed' },
];

/** /staff/questions — questions customers asked an engineer. */
export function StaffQuestions() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('state'))?.key ?? 'open') as ThreadStatus;
  const selected = params.get('open');
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [counts, setCounts] = useState<Partial<Record<ThreadStatus, number>>>({});
  const [blocked, setBlocked] = useState<Error | null>(null);

  const load = useCallback(() => {
    helpApi
      .staffList(tab)
      .then((r) => {
        setThreads(r.threads);
        setCounts(r.counts);
      })
      .catch((err: Error) => (err instanceof ApiError && err.status === 403 ? setBlocked(err) : setThreads([])));
  }, [tab]);
  useEffect(load, [load]);

  if (blocked) return <Blocked error={blocked} />;
  const go = (next: Record<string, string>) => setParams(next, { replace: true });

  return (
    <AppShell>
      <main className="app-main dash-main">
        <div className="stack home-head__copy">
          <span className="eyebrow">BIOMEDIX</span>
          <h1 className="home-head__title">Questions from customers</h1>
        </div>
        <StaffNav />
        <div className="button-row button-row--tight" role="group" aria-label="Show">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`pill${tab === t.key ? ' pill--active' : ''}`} aria-pressed={tab === t.key} onClick={() => go({ state: t.key })}>
              {t.label}
              {counts[t.key as ThreadStatus] ? ` · ${counts[t.key as ThreadStatus]}` : ''}
            </button>
          ))}
        </div>
        <div className="help-grid">
          <div className="stack">
            {!threads ? (
              <p className="text-muted-sm">Loading…</p>
            ) : threads.length ? (
              <ThreadList staff threads={threads} selected={selected} onSelect={(id) => go({ state: tab, open: id })} />
            ) : (
              <p className="text-muted-sm">{tab === 'open' ? 'No questions are waiting for an answer.' : 'Nothing here.'}</p>
            )}
          </div>
          <section className="card stack help-detail" aria-live="polite">
            {selected ? <ThreadView key={selected} id={selected} staff onChange={load} /> : <p className="text-muted-sm">Select a question to answer it.</p>}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
