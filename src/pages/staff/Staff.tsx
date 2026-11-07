import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useAccount } from '../../account/AccountContext';
import { api, ApiError, type ReviewDetail, type ReviewItem, type StaffOrg, type StaffRole, type StaffUser } from '../../account/api';
import { AppShell } from '../../components/AppShell';
import { Button, ButtonLink } from '../../components/Button';
import { PasswordField, useSubmit } from '../../components/forms';
import { formatDate } from '../../components/Lifecycle';
import { Markdown } from '../../components/Markdown';
import { timeAgo } from '../../lib/audit';
import { diffLines, withContext } from '../../lib/diff';
import '../../styles/app.css';
import '../../styles/flow.css';
import '../../styles/account.css';
import '../../styles/org.css';

type Tab = 'submitted' | 'returned' | 'reviewed' | 'approved';
const TABS: { key: Tab; label: string; count: 'in_review' | 'returned' | 'awaiting_approval' | 'approved' }[] = [
  { key: 'submitted', label: 'To review', count: 'in_review' },
  { key: 'returned', label: 'Returned', count: 'returned' },
  { key: 'reviewed', label: 'Awaiting customer approval', count: 'awaiting_approval' },
  { key: 'approved', label: 'Approved', count: 'approved' },
];

const KIND_LABEL = { submit: 'Submitted', review: 'Technical review signed', return: 'Returned', approve: 'Approved' } as const;

function StaffNav() {
  const { user } = useAccount();
  return (
    <nav className="staff-tabs" aria-label="Biomedix">
      <NavLink to="/staff/reviews" className={({ isActive }) => `pill${isActive ? ' pill--active' : ''}`}>
        Technical reviews
      </NavLink>
      {user?.staffRole === 'admin' && (
        <NavLink to="/staff/admin" className={({ isActive }) => `pill${isActive ? ' pill--active' : ''}`}>
          Companies and people
        </NavLink>
      )}
    </nav>
  );
}

function Blocked({ error }: { error: ApiError | Error }) {
  const mfa = error instanceof ApiError && error.code === 'mfa_required';
  return (
    <AppShell>
      <main className="app-main account-main account-main--narrow">
        <span className="eyebrow">BIOMEDIX</span>
        <h1 className="setup-main__title">{mfa ? 'Turn on two-factor first.' : 'This area is for Biomedix staff.'}</h1>
        <p className="setup-main__blurb">{error.message}</p>
        <div className="button-row">
          <ButtonLink to={mfa ? '/app/settings/security' : '/app/dashboard'}>{mfa ? 'Security settings' : 'Back to the dashboard'}</ButtonLink>
        </div>
      </main>
    </AppShell>
  );
}

/* ---------- Technical reviews ---------- */

export function StaffReviews() {
  const { user } = useAccount();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('state'))?.key ?? 'submitted') as Tab;
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [blocked, setBlocked] = useState<Error | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [compare, setCompare] = useState(true);
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');
  const sign = useSubmit();
  /** Outlives the selection: after signing, the next draft opens and this says what happened. */
  const [flash, setFlash] = useState<string | null>(null);
  const key = params.get('doc');

  const loadList = useCallback(() => {
    api
      .reviews(tab)
      .then((r) => {
        setItems(r.items);
        setCounts(r.counts);
      })
      .catch((err: Error) => (err instanceof ApiError && err.status === 403 ? setBlocked(err) : setItems([])));
  }, [tab]);
  useEffect(loadList, [loadList]);

  const current = items?.find((i) => `${i.projectId}:${i.docId}` === key) ?? items?.[0];
  useEffect(() => {
    setDetail(null);
    setNote('');
    setPassword('');
    sign.setMsg(null);
    if (!current) return;
    api
      .review(current.projectId, current.docId)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [current?.projectId, current?.docId, current?.draft]);

  const diff = useMemo(
    () => (detail?.previous && compare ? withContext(diffLines(detail.previous.markdown, detail.latest.markdown)) : null),
    [detail, compare],
  );

  if (blocked) return <Blocked error={blocked} />;

  const act = (kind: 'review' | 'return') =>
    sign.run(async () => {
      if (!current || !detail) return;
      if (kind === 'return' && !note.trim()) throw new Error('Say what needs to change before returning it.');
      await api.signReview(current.projectId, current.docId, { kind, draft: detail.latest.draft, note: note.trim(), password: kind === 'review' ? password : undefined });
      setFlash(
        kind === 'review'
          ? `Signed the technical review of ${current.docId} draft ${detail.latest.draft} (${current.orgName}).`
          : `Returned ${current.docId} with your comments (${current.orgName}).`,
      );
      setParams({ state: tab }, { replace: true });
      loadList();
    });

  const added = diff?.filter((l) => l.kind === 'add').length ?? 0;
  const removed = diff?.filter((l) => l.kind === 'del').length ?? 0;

  return (
    <AppShell>
      <aside aria-label="Review queue" className="app-sidebar app-sidebar--wide app-sidebar--sticky">
        <div className="stack app-sidebar__head">
          <span className="eyebrow">BIOMEDIX</span>
          <h1 className="app-sidebar__title">Technical reviews</h1>
          <span className="app-sidebar__sub">Drafts customers submitted, across every company</span>
        </div>
        <StaffNav />
        <div role="group" aria-label="Filter by state" className="app-sidebar__pills">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              className={`pill${tab === t.key ? ' pill--active' : ''}`}
              onClick={() => setParams({ state: t.key }, { replace: true })}
            >
              {t.label} · {counts[t.count] ?? 0}
            </button>
          ))}
        </div>
        <div className="stack queue">
          {!items ? (
            <p className="text-muted-sm">Loading…</p>
          ) : !items.length ? (
            <p className="text-muted-sm queue-empty">Nothing here.</p>
          ) : (
            items.map((it) => {
              const on = current && it.projectId === current.projectId && it.docId === current.docId;
              return (
                <button
                  key={`${it.projectId}:${it.docId}`}
                  type="button"
                  aria-pressed={!!on}
                  className={`queue-item${on ? ' queue-item--on' : ''}`}
                  onClick={() => setParams({ state: tab, doc: `${it.projectId}:${it.docId}` }, { replace: true })}
                >
                  <span className="queue-item__meta">
                    <span className="mono queue-item__agent">{it.orgName}</span>
                    <span>{timeAgo(it.at)}</span>
                  </span>
                  <span className="queue-item__title">
                    {it.docId} {it.title}
                  </span>
                  <span className="queue-item__step">
                    {it.device || 'Untitled device'} · draft {it.draft} · {it.by}
                    {it.byYou ? ' (you)' : ''}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <main className="app-main">
        {flash && (
          <p role="status" className="notice staff-flash">
            {flash}
          </p>
        )}
        {!current ? (
          <div className="stack">
            <span className="eyebrow">TECHNICAL REVIEW</span>
            <h2 className="setup-main__title">{items ? 'Nothing waiting.' : 'Loading…'}</h2>
            {items && <p className="setup-main__blurb">When a customer submits a draft for technical review it appears here.</p>}
          </div>
        ) : !detail ? (
          <p className="text-muted-sm">Loading the draft…</p>
        ) : (
          <>
            <div className="stack record-head">
              <div className="record-head__meta">
                <span className="mono record-head__ref">
                  {detail.docId} · draft {detail.latest.draft} · run {detail.latest.runNumber}
                </span>
                <span className="record-head__ai">{detail.latest.filledPct}% of values filled</span>
              </div>
              <h2 className="record-head__title">{detail.latest.title}</h2>
              <p className="record-head__summary">
                {detail.org.name} · {detail.project.device || 'Untitled device'} · saved {formatDate(detail.latest.createdAt)} · SHA-256{' '}
                <span className="mono">{detail.latest.sha256.slice(0, 12)}…</span>
              </p>
            </div>

            <div className="review-grid">
              <div className="stack">
                {detail.previous && (
                  <div className="button-row button-row--tight">
                    <Button size="sm" variant={compare ? 'primary' : 'outline'} onClick={() => setCompare(true)}>
                      Changes from draft {detail.previous.draft}
                    </Button>
                    <Button size="sm" variant={compare ? 'outline' : 'primary'} onClick={() => setCompare(false)}>
                      Full text
                    </Button>
                  </div>
                )}
                {diff ? (
                  <section className="card diff" aria-label={`Changes: ${added} lines added, ${removed} removed`}>
                    <p className="diff__summary">
                      <ins>+{added}</ins> <del>−{removed}</del> lines
                    </p>
                    <ol className="list-reset diff__lines">
                      {diff.map((l, i) =>
                        l.kind === 'gap' ? (
                          <li key={i} className="diff__gap">
                            {l.count} unchanged line{l.count > 1 ? 's' : ''}
                          </li>
                        ) : (
                          <li key={i} className={`diff__line diff__line--${l.kind}`}>
                            <span className="diff__mark" aria-hidden="true">
                              {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}
                            </span>
                            <span className="visually-hidden">{l.kind === 'add' ? 'Added: ' : l.kind === 'del' ? 'Removed: ' : ''}</span>
                            {l.text || ' '}
                          </li>
                        ),
                      )}
                    </ol>
                  </section>
                ) : (
                  <article className="card paper">
                    <Markdown text={detail.latest.markdown} />
                  </article>
                )}
              </div>

              <div className="stack review-grid__side">
                <section className="card card--compact card--gap-10" aria-labelledby="hist-h">
                  <h3 id="hist-h" className="card__title card__title--sm">
                    Sign-off history
                  </h3>
                  <ul className="list-reset stack version__offs">
                    {detail.signoffs.map((s) => (
                      <li key={s.id} className={`version__off version__off--${s.kind}`}>
                        Draft {s.draft} · {KIND_LABEL[s.kind]} · {s.signer} · {formatDate(s.createdAt)}
                        {s.note && <q>{s.note}</q>}
                      </li>
                    ))}
                  </ul>
                </section>

                {tab === 'submitted' && (
                  <section className="card card--night sign-panel" aria-labelledby="sign-h">
                    <h3 id="sign-h" className="sign-panel__title">
                      Your review of draft {detail.latest.draft}
                    </h3>
                    {current.byYou ? (
                      <p className="sign-panel__note">You submitted this draft, so another Biomedix reviewer has to review it.</p>
                    ) : (
                      <form
                        className="stack"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act('review');
                        }}
                      >
                        <label htmlFor="review-note" className="sign-panel__label">
                          Comments for {detail.org.name}
                        </label>
                        <textarea
                          id="review-note"
                          rows={4}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="What you checked, what needs to change, what the approver should know"
                          className="sign-panel__input"
                        />
                        <input type="text" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
                        <PasswordField
                          id="review-pw"
                          label="Your password, to sign"
                          value={password}
                          onChange={setPassword}
                          autoComplete="current-password"
                          night
                          hint="Signing needs your password; returning doesn’t."
                        />
                        <p className="sign-panel__note">
                          Signing records {user?.name}, {user?.email}, the time and the draft’s SHA-256 with the meaning{' '}
                          <strong>Technical review</strong>. Approval stays with the customer.
                        </p>
                        {sign.note}
                        <div className="button-row">
                          <Button type="submit" variant="bright" disabled={sign.busy || !password}>
                            Sign technical review
                          </Button>
                          <Button variant="outline-night" disabled={sign.busy} onClick={() => void act('return')}>
                            Return with comments
                          </Button>
                        </div>
                      </form>
                    )}
                  </section>
                )}
                {tab !== 'submitted' && sign.note}
              </div>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}

/* ---------- Admin: companies and people ---------- */

export function StaffAdmin() {
  const { user, refresh } = useAccount();
  const [orgs, setOrgs] = useState<StaffOrg[] | null>(null);
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [q, setQ] = useState('');
  const [blocked, setBlocked] = useState<Error | null>(null);
  const [resetFor, setResetFor] = useState<StaffUser | null>(null);
  const [pw, setPw] = useState('');
  const act = useSubmit();

  const loadUsers = useCallback((query: string) => {
    api
      .staffUsers(query)
      .then((r) => setUsers(r.users))
      .catch((err: Error) => setBlocked(err));
  }, []);

  useEffect(() => {
    api
      .staffOrgs()
      .then((r) => setOrgs(r.orgs))
      .catch((err: Error) => setBlocked(err));
    loadUsers('');
  }, [loadUsers]);

  useEffect(() => {
    const t = setTimeout(() => loadUsers(q), 250);
    return () => clearTimeout(t);
  }, [q, loadUsers]);

  if (blocked) return <Blocked error={blocked} />;

  return (
    <AppShell>
      <main className="app-main staff-main">
        <div className="stack suite-head__copy">
          <span className="eyebrow">BIOMEDIX ADMIN</span>
          <h1 className="setup-main__title">Companies and people</h1>
          <p className="setup-main__blurb">Every customer company and account. Grant reviewer access to Biomedix engineers here.</p>
        </div>
        <StaffNav />
        {act.note}

        <section className="card card--compact stack" aria-labelledby="orgs-h">
          <div className="outline__head">
            <h2 id="orgs-h" className="card__title card__title--sm">
              Companies
            </h2>
            <span className="text-muted-sm">{orgs?.length ?? 0}</span>
          </div>
          <div className="table-wrap">
            <table className="readiness-table admin-table">
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">Owners</th>
                  <th scope="col">Members</th>
                  <th scope="col">Projects</th>
                  <th scope="col">Readiness</th>
                  <th scope="col">In review</th>
                  <th scope="col">Approved</th>
                  <th scope="col">Two-factor</th>
                  <th scope="col">Active</th>
                </tr>
              </thead>
              <tbody>
                {orgs?.map((o) => (
                  <tr key={o.id}>
                    <th scope="row">{o.name}</th>
                    <td>{o.owners}</td>
                    <td>{o.members}</td>
                    <td>{o.projects}</td>
                    <td>{o.readiness}%</td>
                    <td>{o.docs.in_review}</td>
                    <td>{o.docs.approved}</td>
                    <td>{o.requireMfa ? 'Required' : 'Optional'}</td>
                    <td>{timeAgo(o.lastActiveAt ?? o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card card--compact stack" aria-labelledby="users-h">
          <div className="outline__head">
            <h2 id="users-h" className="card__title card__title--sm">
              People
            </h2>
            <label className="admin-search">
              <span className="visually-hidden">Search people</span>
              <input className="input input--sm" type="search" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          {resetFor && (
            <form
              className="card card--compact stack admin-reset"
              onSubmit={act.onSubmit(async () => {
                await api.resetUserMfa(resetFor.id, pw);
                setResetFor(null);
                setPw('');
                loadUsers(q);
                return `Two-factor turned off for ${resetFor.name}. They’ve been signed out everywhere and emailed.`;
              })}
            >
              <p className="text-muted-sm">
                Turn off two-factor for <strong>{resetFor.name}</strong> ({resetFor.email})? Only do this after confirming who they are,
                for example on a call. They’ll be signed out everywhere and should set it up again.
              </p>
              <input type="text" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
              <PasswordField id="reset-pw" label="Your password" value={pw} onChange={setPw} autoComplete="current-password" />
              <div className="button-row button-row--tight">
                <Button type="submit" size="sm" disabled={act.busy || !pw}>
                  Turn off their two-factor
                </Button>
                <Button size="sm" variant="text" onClick={() => setResetFor(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
          <div className="table-wrap">
            <table className="readiness-table admin-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Companies</th>
                  <th scope="col">Email</th>
                  <th scope="col">Two-factor</th>
                  <th scope="col">Last active</th>
                  <th scope="col">Biomedix role</th>
                </tr>
              </thead>
              <tbody>
                {users?.map((u) => (
                  <tr key={u.id}>
                    <th scope="row">
                      <span className="stack">
                        <span>
                          {u.name} {u.id === user?.id && <span className="text-muted-sm">(you)</span>}
                        </span>
                        <span className="text-muted-sm">{u.email}</span>
                      </span>
                    </th>
                    <td>{u.orgs || '—'}</td>
                    <td>{u.emailVerified ? 'Confirmed' : 'Not confirmed'}</td>
                    <td>
                      {u.mfaEnabled ? (
                        <Button size="sm" variant="text" onClick={() => setResetFor(u)}>
                          On · reset
                        </Button>
                      ) : (
                        'Off'
                      )}
                    </td>
                    <td>{u.lastActiveAt ? timeAgo(u.lastActiveAt) : 'Never'}</td>
                    <td>
                      <label className="visually-hidden" htmlFor={`staff-${u.id}`}>
                        Biomedix role for {u.name}
                      </label>
                      <select
                        id={`staff-${u.id}`}
                        className="input input--sm"
                        value={u.staffRole}
                        disabled={act.busy}
                        onChange={(e) => {
                          const role = e.target.value as StaffRole;
                          void act.run(async () => {
                            await api.setStaffRole(u.id, role);
                            loadUsers(q);
                            if (u.id === user?.id) await refresh();
                            return `${u.name} is ${role ? `now a Biomedix ${role}` : 'no longer Biomedix staff'}.`;
                          });
                        }}
                      >
                        <option value="">Customer</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
