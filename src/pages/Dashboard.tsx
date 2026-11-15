import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { can, initials, ROLE_LABEL, useAccount } from '../account/AccountContext';
import { api, type AttentionItem, type Dashboard as DashboardData, type DocCounts } from '../account/api';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { formatDate, ReadinessRing } from '../components/Lifecycle';
import { AskForm, ThreadStatus } from '../components/AskEngineer';
import { NextStep, PlanList } from '../components/PlanBlock';
import { helpApi, type Thread } from '../help/api';
import { useIntake } from '../intake/IntakeContext';
import { describeAudit, timeAgo } from '../lib/audit';
import { docHref } from '../lib/links';
import { formatWhen, requestsApi, SCAN_STATUS_LABEL, type MyRequest } from '../requests/api';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/account.css';
import '../styles/org.css';
import '../styles/requests.css';
import '../styles/clean.css';

const PIPELINE: { key: keyof DocCounts; label: string }[] = [
  { key: 'approved', label: 'Approved' },
  { key: 'awaiting_approval', label: 'Awaiting approval' },
  { key: 'in_review', label: 'In Biomedix review' },
  { key: 'returned', label: 'Returned' },
  { key: 'draft', label: 'Saved draft' },
];

function Pipeline({ docs }: { docs: DocCounts }) {
  const total = PIPELINE.reduce((n, p) => n + docs[p.key], 0);
  if (!total) return <p className="text-muted-sm">No saved drafts yet.</p>;
  return (
    <div className="stack pipeline">
      <span className="pipeline__bar" aria-hidden="true">
        {PIPELINE.map((p) => (docs[p.key] ? <span key={p.key} className={`pipeline__seg pipeline__seg--${p.key}`} style={{ flex: docs[p.key] }} /> : null))}
      </span>
      <ul className="list-reset pipeline__legend">
        {PIPELINE.filter((p) => docs[p.key]).map((p) => (
          <li key={p.key}>
            <span className={`pipeline__dot pipeline__seg--${p.key}`} aria-hidden="true" />
            {docs[p.key]} {p.label.toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}

const hello = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

interface Step {
  key: string;
  done: boolean;
  title: string;
  detail: string;
  to: string;
  cta: string;
}

/** Setup checklist shown after sign-up and on the dashboard until it's done. */
export function useGettingStarted(data: DashboardData | null): Step[] {
  const { user, org } = useAccount();
  const { started } = useIntake();
  if (!user || !org) return [];
  const manage = can(org, 'manage');
  return [
    {
      key: 'email',
      done: user.emailVerified,
      title: 'Confirm your email',
      detail: `We sent a link to ${user.email}. Needed to invite people and sign documents.`,
      to: '/app/settings/profile',
      cta: 'Details',
    },
    {
      key: 'answers',
      done: started,
      title: 'Answer the questionnaire',
      detail: 'About 15 minutes. Your answers fill in every procedure your device needs.',
      to: '/app/form',
      cta: 'Start',
    },
    ...(manage
      ? [
          {
            key: 'team',
            done: !!data && (data.teamCount > 1 || data.pendingInvites > 0),
            title: 'Invite your team',
            detail: 'Quality, regulatory and engineering colleagues. Choose who can edit and who approves.',
            to: '/app/settings/members',
            cta: 'Invite',
          },
        ]
      : []),
    {
      key: 'mfa',
      done: user.mfaEnabled,
      title: 'Turn on two-factor authentication',
      detail: 'Protects the e-signatures recorded with your account.',
      to: '/app/settings/security',
      cta: 'Set up',
    },
  ];
}

export function GettingStarted({ steps, heading = true }: { steps: Step[]; heading?: boolean }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="card card--compact stack getting-started" aria-labelledby="gs-h">
      {heading && (
        <div className="outline__head">
          <h2 id="gs-h" className="card__title card__title--sm">
            Get set up
          </h2>
          <span className="text-muted-sm">
            {done} of {steps.length} done
          </span>
        </div>
      )}
      <ol className="list-reset stack gs-list">
        {steps.map((s) => (
          <li key={s.key} className={`gs-item${s.done ? ' gs-item--done' : ''}`}>
            <span className="gs-item__mark" aria-hidden="true">
              {s.done ? '✓' : ''}
            </span>
            <span className="stack gs-item__main">
              <span className="gs-item__title">
                {s.title}
                {s.done && <span className="visually-hidden"> (done)</span>}
              </span>
              {!s.done && <span className="text-muted-sm">{s.detail}</span>}
            </span>
            {!s.done && (
              <ButtonLink to={s.to} size="sm" variant="outline">
                {s.cta}
              </ButtonLink>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function NoCompany() {
  const { apply, user } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="app-main account-main account-main--narrow">
      <span className="eyebrow">COMPANY</span>
      <h1 className="setup-main__title">You’re not in a company yet.</h1>
      <p className="setup-main__blurb">
        Projects belong to a company workspace. Create one for your company, or ask a colleague to invite {user?.email ?? 'you'} to
        theirs.
      </p>
      <form
        className="card card--compact stack account-form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          api
            .createOrg(name.trim())
            .then((r) => {
              apply(r, r.orgId);
              navigate('/app/dashboard');
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        <div className="field">
          <label htmlFor="nc-name" className="field__label">
            Company name
          </label>
          <input id="nc-name" className="input" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p className="form-msg form-msg--err">{error}</p>}
        <div className="button-row">
          <Button type="submit" disabled={busy || !name.trim()}>
            Create company
          </Button>
        </div>
      </form>
    </main>
  );
}

/** The signed-in person's demo requests and gap scans, linking to each one's status page. */
function MyRequests() {
  const [rows, setRows] = useState<MyRequest[] | null>(null);
  useEffect(() => {
    requestsApi
      .mine()
      .then((r) => setRows(r.requests))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return null;
  // Nothing to show until there's a request; the gap scan is offered from the Help page.
  if (!rows.length) return null;
  return (
    <section className="card card--compact stack" aria-labelledby="req-h">
      <div className="outline__head">
        <h2 id="req-h" className="card__title card__title--sm">
          Gap scans and demos
        </h2>
        <Link to="/gap-scan" className="text-muted-sm">
          New scan →
        </Link>
      </div>
      <ul className="list-reset stack dash-requests">
        {rows.slice(0, 4).map((r) => (
          <li key={r.id} className="dash-requests__item">
            <Link to={`/request/${r.token}`}>
              {r.scan ? 'Gap scan' : 'Demo'} · {r.company}
            </Link>
            <span className="text-muted-sm">
              {r.scan
                ? r.scan.status === 'sent'
                  ? `Report ready · ${r.scan.findings ?? 0} gap${r.scan.findings === 1 ? '' : 's'}`
                  : r.scan.status === 'received' || r.scan.status === 'in_review'
                    ? `With an engineer · report by ${formatWhen(r.scan.dueAt)}`
                    : SCAN_STATUS_LABEL[r.scan.status]
                : r.demo.scheduledAt
                  ? 'Demo booked'
                  : 'Demo requested'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ask an engineer, with the latest question's status. */
function HelpCard() {
  const { org } = useAccount();
  const [threads, setThreads] = useState<Thread[]>([]);
  const load = useCallback(() => {
    if (org) helpApi.list(org.id).then((r) => setThreads(r.threads)).catch(() => setThreads([]));
  }, [org]);
  useEffect(load, [load]);
  const active = threads.filter((t) => t.status !== 'closed').slice(0, 3);
  return (
    <section className="card card--compact stack" aria-labelledby="help-h">
      <div className="outline__head">
        <h2 id="help-h" className="card__title card__title--sm">
          Ask an engineer
        </h2>
        {threads.length > 0 && (
          <Link to="/app/help" className="text-muted-sm">
            View all
          </Link>
        )}
      </div>
      <p className="text-muted-sm">The agent drafts. A Biomedix engineer answers questions and reviews every document.</p>
      {active.length > 0 && (
        <ul className="list-reset stack help-recent">
          {active.map((t) => (
            <li key={t.id}>
              <Link to={`/app/help?open=${t.id}`} className="help-recent__item">
                <span className="help-recent__subject">{t.subject}</span>
                <ThreadStatus t={t} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <AskForm id="ask-home" rows={2} onSent={load} />
    </section>
  );
}

/** The same home screen before sign-in: the path, and a prompt to save the work. */
function GuestHome() {
  const { intake, started, readiness, suite } = useIntake();
  return (
    <AppShell>
      <main className="app-main dash-main">
        <div className="home-head">
          <div className="stack home-head__copy">
            <h1 className="home-head__title">{started ? intake.device.name || 'Your quality system' : 'Welcome to Biomedix.'}</h1>
            <p className="text-muted-sm">
              {started
                ? `${suite.applicable.length} documents drafted · ${readiness.pct}% ready · saved in this browser only`
                : 'Describe your device and the agent drafts the quality system it needs. An engineer reviews every document.'}
            </p>
          </div>
        </div>
        <NextStep />
        <div className="dash-grid">
          <div className="stack">
            <PlanList />
          </div>
          <div className="stack dash-side">
            <section className="card card--compact stack" aria-labelledby="save-h">
              <h2 id="save-h" className="card__title card__title--sm">
                Save your work
              </h2>
              <p className="text-muted-sm">
                A free account keeps your answers and drafts, lets you send documents to an engineer, and records approvals.
              </p>
              <div className="button-row button-row--tight">
                <ButtonLink to="/sign-up?next=/app/dashboard" size="sm">
                  Create an account
                </ButtonLink>
                <ButtonLink to="/sign-in?next=/app/dashboard" variant="outline" size="sm">
                  Sign in
                </ButtonLink>
              </div>
            </section>
            <section className="card card--compact stack" aria-labelledby="talk-h">
              <h2 id="talk-h" className="card__title card__title--sm">
                Talk to an engineer
              </h2>
              <p className="text-muted-sm">Walk through your device with a Biomedix engineer, or send your files for a free gap scan.</p>
              <div className="button-row button-row--tight">
                <ButtonLink to="/demo" variant="outline" size="sm">
                  Book a call
                </ButtonLink>
                <ButtonLink to="/gap-scan" variant="text" size="sm">
                  Free gap scan
                </ButtonLink>
              </div>
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

export default function Dashboard() {
  const { status } = useAccount();
  return status === 'signed-in' ? <CompanyHome /> : <GuestHome />;
}

function CompanyHome() {
  const { org, user } = useAccount();
  const { projectId, openProject, newProject, readiness, intake } = useIntake();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(() => window.location.hash === '#projects');

  const load = useCallback(() => {
    if (!org) return;
    api
      .dashboard(org.id)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [org]);
  useEffect(load, [load, projectId]);

  if (!org || !user)
    return (
      <AppShell>
        <NoCompany />
      </AppShell>
    );

  const guard = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const openDoc = (it: AttentionItem) =>
    guard(`item-${it.projectId}-${it.docId}`, async () => {
      if (it.projectId !== projectId) await openProject(it.projectId);
      navigate(docHref(it.docId));
    });

  const open = (id: string, to = '/app/suite') =>
    guard(`open-${id}`, async () => {
      if (id !== projectId) await openProject(id);
      navigate(to);
    });

  const projects = (data?.projects ?? []).map((p) =>
    p.id === projectId ? { ...p, device: intake.device.name, company: intake.company.name, readiness: readiness.pct } : p,
  );
  const attention = data?.attention;
  const noApprover = data && !data.team.some((m) => m.approver);
  const todo = (attention?.approvals.length ?? 0) + (attention?.returned.length ?? 0);

  return (
    <AppShell>
      <main className="app-main dash-main">
        <div className="home-head">
          <div className="stack home-head__copy">
            <h1 className="home-head__title">
              {hello()}, {user.name.split(' ')[0]}.
            </h1>
            <p className="text-muted-sm">
              {org.name} · {intake.device.name || 'Untitled project'} · you’re {ROLE_LABEL[org.role].toLowerCase()}
              {org.approver ? ' and an approver' : ''}
            </p>
          </div>
          <Link to="/app/readiness" className="home-ring" aria-label={`Readiness ${readiness.pct}%. See details`}>
            <ReadinessRing pct={readiness.pct} size={64} />
            <span className="stack">
              <strong>Readiness</strong>
              <span className="text-muted-sm">
                {readiness.counts.approved} of {readiness.docs.length} approved
              </span>
            </span>
          </Link>
        </div>

        {error && (
          <p role="alert" className="notice notice--warn">
            {error}
          </p>
        )}

        <NextStep />

        <div className="dash-grid">
          <div className="stack">
            <PlanList />

            {(todo > 0 || (noApprover && can(org, 'manage'))) && (
            <section className="card card--compact stack" aria-labelledby="att-h">
              <div className="outline__head">
                <h2 id="att-h" className="card__title card__title--sm">
                  Needs your attention
                </h2>
                {attention && attention.inReview > 0 && (
                  <Link to="/app/review" className="text-muted-sm">
                    {attention.inReview} with Biomedix review →
                  </Link>
                )}
              </div>
              {!data ? (
                <p className="text-muted-sm">Loading…</p>
              ) : (
                <ul className="list-reset attention">
                  {attention!.approvals.map((it) => (
                    <li key={`a-${it.projectId}-${it.docId}`} className="attention__item">
                      <span className="stage stage--info">Approve</span>
                      <span className="stack attention__main">
                        <span className="attention__title">
                          <span className="mono">{it.docId}</span> {it.title} · draft {it.draft}
                        </span>
                        <span className="text-muted-sm">
                          {it.project} · reviewed by {it.by} {timeAgo(it.at)}
                        </span>
                      </span>
                      <Button size="sm" disabled={!!busy} onClick={() => void openDoc(it)}>
                        Review and approve
                      </Button>
                    </li>
                  ))}
                  {attention!.returned.map((it) => (
                    <li key={`r-${it.projectId}-${it.docId}`} className="attention__item">
                      <span className="stage stage--warn">Returned</span>
                      <span className="stack attention__main">
                        <span className="attention__title">
                          <span className="mono">{it.docId}</span> {it.title} · draft {it.draft}
                        </span>
                        <span className="text-muted-sm">
                          {it.project} · {it.by}: “{it.note}”
                        </span>
                      </span>
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void openDoc(it)}>
                        Open
                      </Button>
                    </li>
                  ))}
                  {noApprover && can(org, 'manage') && (
                    <li className="attention__item">
                      <span className="stage stage--warn">Team</span>
                      <span className="stack attention__main">
                        <span className="attention__title">Nobody can approve documents yet</span>
                        <span className="text-muted-sm">Name at least one approver, usually your management representative.</span>
                      </span>
                      <ButtonLink size="sm" variant="outline" to="/app/settings/members">
                        Members
                      </ButtonLink>
                    </li>
                  )}
                  {!todo && !(noApprover && can(org, 'manage')) && (
                    <li className="attention__empty">
                      {attention!.inReview
                        ? 'You’re all caught up. Biomedix is reviewing your submitted documents.'
                        : 'You’re all caught up.'}
                    </li>
                  )}
                </ul>
              )}
            </section>
            )}

            <details
              id="projects"
              className="card card--compact fold"
              open={showProjects}
              onToggle={(e) => setShowProjects((e.target as HTMLDetailsElement).open)}
            >
              <summary className="fold__summary">
                <span id="proj-h" className="card__title card__title--sm">
                  Projects
                </span>
                <span className="text-muted-sm">{data ? `${projects.length} · one per device` : ''}</span>
              </summary>
              <div className="stack fold__body">
              {can(org, 'edit') && (
                <div className="button-row button-row--tight">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === 'new'}
                    onClick={() =>
                      void guard('new', async () => {
                        await newProject('blank');
                        navigate('/app/start');
                      })
                    }
                  >
                    New project
                  </Button>
                </div>
              )}
              {!data ? (
                <p className="text-muted-sm">Loading projects…</p>
              ) : !projects.length ? (
                <div className="card card--compact">
                  <p className="text-muted-sm">
                    No projects yet.{' '}
                    {can(org, 'edit') ? 'Start one with “New project”.' : 'An editor or admin can create the first one.'}
                  </p>
                </div>
              ) : (
                <ul className="list-reset project-grid">
                  {projects.map((p) => {
                    const active = p.id === projectId;
                    return (
                      <li key={p.id} className={`card card--compact project-card${active ? ' project-card--active' : ''}`}>
                        <div className="project-card__top">
                          <span className="stack">
                            <span className="eyebrow">{active ? 'OPEN NOW' : 'PROJECT'}</span>
                            <span className="project-card__title">{p.device || 'Untitled device'}</span>
                            <span className="text-muted-sm">{p.company || 'Company not entered'}</span>
                          </span>
                          <ReadinessRing pct={p.readiness} size={64} />
                        </div>
                        <Pipeline docs={p.docs} />
                        <dl className="project-card__facts">
                          <div>
                            <dt>Runs</dt>
                            <dd>{p.runs}</dd>
                          </div>
                          <div>
                            <dt>Last run</dt>
                            <dd>{p.lastRunAt ? formatDate(p.lastRunAt, false) : 'None yet'}</dd>
                          </div>
                          <div>
                            <dt>Saved</dt>
                            <dd>{timeAgo(p.updatedAt)}</dd>
                          </div>
                        </dl>
                        <div className="button-row button-row--tight">
                          <Button size="sm" variant={active ? 'primary' : 'outline'} disabled={!!busy} onClick={() => void open(p.id)}>
                            {active ? 'Open documentation' : 'Open'}
                          </Button>
                          <Button size="sm" variant="text" disabled={!!busy} onClick={() => void open(p.id, '/app/readiness')}>
                            Readiness
                          </Button>
                          {can(org, 'manage') && (
                            <Button
                              size="sm"
                              variant="text"
                              disabled={!!busy}
                              onClick={() => {
                                const name = p.device || p.company || 'this untitled project';
                                if (!window.confirm(`Delete ${name}? Its answers, runs, drafts and sign-off records are deleted for good.`)) return;
                                void guard(`delete-${p.id}`, async () => {
                                  await api.deleteProject(p.id);
                                  const rest = projects.filter((x) => x.id !== p.id);
                                  if (p.id === projectId) {
                                    if (rest.length) await openProject(rest[0].id);
                                    else await newProject('blank');
                                  } else load();
                                });
                              }}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              </div>
            </details>
          </div>

          <div className="stack dash-side">
            <HelpCard />

            <MyRequests />

            <details className="card card--compact fold">
              <summary className="fold__summary">
                <span className="card__title card__title--sm">Team and activity</span>
                <span className="text-muted-sm">
                  {data ? `${data.teamCount} ${data.teamCount === 1 ? 'person' : 'people'}` : ''}
                </span>
              </summary>
              <div className="stack fold__body">
            <section className="stack" aria-labelledby="team-h">
              <div className="outline__head">
                <h2 id="team-h" className="card__title card__title--sm">
                  Team
                </h2>
                <Link to="/app/settings/members" className="text-muted-sm">
                  {data ? `${data.teamCount} member${data.teamCount === 1 ? '' : 's'}` : 'Members'} →
                </Link>
              </div>
              <ul className="list-reset team-list">
                {data?.team.map((m) => (
                  <li key={m.userId} className="team-list__item">
                    <span className="avatar avatar--sm" aria-hidden="true">
                      {initials(m.name)}
                    </span>
                    <span className="stack">
                      <span className="team-list__name">{m.name}</span>
                      <span className="text-muted-sm">
                        {ROLE_LABEL[m.role]}
                        {m.approver ? ' · approver' : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {data && can(org, 'manage') && (data.pendingInvites > 0 || (data.teamWithoutMfa > 0 && !org.requireMfa)) && (
                <p className="text-muted-sm">
                  {data.pendingInvites > 0 && `${data.pendingInvites} invitation${data.pendingInvites === 1 ? '' : 's'} pending. `}
                  {data.teamWithoutMfa > 0 && !org.requireMfa && (
                    <>
                      {data.teamWithoutMfa} without two-factor. <Link to="/app/settings/company">Require it</Link>
                    </>
                  )}
                </p>
              )}
            </section>

            <section className="stack" aria-labelledby="act-h">
              <div className="outline__head">
                <h2 id="act-h" className="card__title card__title--sm">
                  Recent activity
                </h2>
                <Link to="/app/settings/activity" className="text-muted-sm">
                  Full log →
                </Link>
              </div>
              <ul className="list-reset activity activity--compact">
                {data?.activity.map((e) => (
                  <li key={e.id} className="activity__row">
                    <span className={`activity__dot activity__dot--${e.action.split('.')[0]}`} aria-hidden="true" />
                    <span className="stack activity__main">
                      <span>
                        <strong>{e.actor}</strong> {describeAudit(e)}
                      </span>
                      <span className="text-muted-sm">{timeAgo(e.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
              </div>
            </details>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

/** /app/welcome — right after sign-up. */
export function Welcome() {
  const { org, user } = useAccount();
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    if (org) api.dashboard(org.id).then(setData).catch(() => setData(null));
  }, [org]);
  const steps = useGettingStarted(data);
  if (!user) return null;
  return (
    <AppShell>
      <main className="app-main account-main account-main--narrow">
        <span className="eyebrow">WELCOME</span>
        <h1 className="setup-main__title">Welcome to Biomedix, {user.name.split(' ')[0]}.</h1>
        <p className="setup-main__blurb">
          {org ? `${org.name} is set up and you’re its owner.` : 'Your account is ready.'} A few things to do first; you can come back to any
          of them from the dashboard.
        </p>
        <GettingStarted steps={steps} heading={false} />
        <div className="button-row">
          <ButtonLink to="/app/form">Answer the questionnaire</ButtonLink>
          <ButtonLink to="/app/dashboard" variant="outline">
            Go to the dashboard
          </ButtonLink>
        </div>
      </main>
    </AppShell>
  );
}
