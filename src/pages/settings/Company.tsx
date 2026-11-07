import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { can, initials, ROLE_HINT, ROLE_LABEL, useAccount } from '../../account/AccountContext';
import { api, type AuditEntry, type Invite, type Member, type Role } from '../../account/api';
import { Button } from '../../components/Button';
import { PasswordField, useSubmit } from '../../components/forms';
import { formatDate } from '../../components/Lifecycle';
import { useIntake } from '../../intake/IntakeContext';
import { describeAudit, timeAgo } from '../../lib/audit';
import { SettingsCard, SettingsLayout } from './SettingsLayout';

const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer'];

function CreateCompany({ first = false }: { first?: boolean }) {
  const { apply } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const form = useSubmit();
  return (
    <SettingsCard title={first ? 'Create your company' : 'Create another company'} id="new-org-h">
      <form
        className="stack account-form"
        onSubmit={form.onSubmit(async () => {
          const r = await api.createOrg(name.trim());
          apply(r, r.orgId);
          navigate('/app/dashboard');
        })}
      >
        <p className="text-muted-sm">
          {first
            ? 'You aren’t in a company yet. Create one to start projects, or ask a colleague to invite you to theirs.'
            : 'For a separate legal manufacturer or a client you consult for. Each company has its own members, projects and activity log.'}
        </p>
        <div className="field">
          <label htmlFor="org-new-name" className="field__label">
            Company name
          </label>
          <input id="org-new-name" className="input" required maxLength={120} autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {form.note}
        <div className="button-row">
          <Button type="submit" size="sm" disabled={form.busy || !name.trim()}>
            Create company
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

/* ---------- Company ---------- */

export function CompanySettings() {
  const { org, user, apply } = useAccount();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [name, setName] = useState(org?.name ?? '');
  const [counts, setCounts] = useState<{ members: number; projects: number; withoutMfa: number } | null>(null);
  const [confirm, setConfirm] = useState('');
  const [pw, setPw] = useState('');
  const general = useSubmit();
  const policy = useSubmit();
  const leave = useSubmit();
  const danger = useSubmit();

  useEffect(() => {
    setName(org?.name ?? '');
    if (!org) return;
    api
      .org(org.id)
      .then((r) => setCounts(r.counts))
      .catch(() => setCounts(null));
  }, [org?.id, org?.name, org?.requireMfa]);

  if (!org || !user)
    return (
      <SettingsLayout eyebrow="COMPANY" title="No company yet">
        <CreateCompany first />
      </SettingsLayout>
    );

  const manage = can(org, 'manage');
  const own = can(org, 'own');

  return (
    <SettingsLayout
      eyebrow="COMPANY"
      title={org.name}
      blurb={`You’re ${ROLE_LABEL[org.role].toLowerCase()}${org.approver ? ' and an approver' : ''}. ${counts ? `${counts.members} member${counts.members === 1 ? '' : 's'} · ${counts.projects} project${counts.projects === 1 ? '' : 's'}.` : ''}`}
    >
      {params.get('new') && <CreateCompany />}

      <SettingsCard title="Company name" id="org-name-h">
        <form
          className="stack account-form"
          onSubmit={general.onSubmit(async () => {
            apply(await api.updateOrg(org.id, { name: name.trim() }));
            return 'Saved.';
          })}
        >
          <div className="field">
            <label htmlFor="org-name" className="field__label">
              Legal manufacturer name
            </label>
            <input
              id="org-name"
              className="input"
              required
              maxLength={120}
              disabled={!manage}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="field__hint">How the company appears to your team and to Biomedix reviewers. Documents use the name from your answers.</p>
          </div>
          {general.note}
          {manage && (
            <div className="button-row">
              <Button type="submit" size="sm" disabled={general.busy || !name.trim() || name.trim() === org.name}>
                Save
              </Button>
            </div>
          )}
        </form>
      </SettingsCard>

      <SettingsCard
        title="Security policy"
        id="policy-h"
        aside={<span className={`stage stage--${org.requireMfa ? 'ok' : 'muted'}`}>{org.requireMfa ? 'Two-factor required' : 'Two-factor optional'}</span>}
      >
        <p className="text-muted-sm">
          Require every member to use two-factor authentication. Members without it can’t open the company’s projects until they turn
          it on. Recommended for anyone using Biomedix as part of a 21 CFR Part 11 system.
          {counts && counts.withoutMfa > 0 && ` ${counts.withoutMfa} member${counts.withoutMfa === 1 ? ' doesn’t' : 's don’t'} have it yet.`}
        </p>
        {policy.note}
        {manage && (
          <div className="button-row">
            <Button
              size="sm"
              variant={org.requireMfa ? 'outline' : 'primary'}
              disabled={policy.busy}
              onClick={() =>
                void policy.run(async () => {
                  apply(await api.updateOrg(org.id, { requireMfa: !org.requireMfa }));
                  return org.requireMfa ? 'Two-factor is now optional.' : 'Two-factor is now required for every member.';
                })
              }
            >
              {org.requireMfa ? 'Make two-factor optional' : 'Require two-factor for everyone'}
            </Button>
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Your membership" id="leave-h">
        <p className="text-muted-sm">Leaving removes your access to {org.name}’s projects. Someone will need to invite you to come back.</p>
        {leave.note}
        <div className="button-row">
          <Button
            size="sm"
            variant="outline"
            disabled={leave.busy}
            onClick={() =>
              void leave.run(async () => {
                if (!window.confirm(`Leave ${org.name}?`)) return;
                apply(await api.leaveOrg(org.id));
                navigate('/app/dashboard');
              })
            }
          >
            Leave {org.name}
          </Button>
        </div>
      </SettingsCard>

      {!params.get('new') && <CreateCompany />}

      {own && (
        <SettingsCard title="Delete company" id="org-delete-h" danger>
          <form
            className="stack account-form"
            onSubmit={danger.onSubmit(async () => {
              apply(await api.deleteOrg(org.id, { password: pw, confirm }));
              navigate('/app/dashboard');
            })}
          >
            <p className="text-muted-sm">
              Deletes {org.name} for everyone, with every project, run, draft and sign-off record. Export the documentation you need to
              keep first.
            </p>
            <div className="field-row">
              <div className="field">
                <label htmlFor="org-confirm" className="field__label">
                  Type <strong>{org.name}</strong> to confirm
                </label>
                <input id="org-confirm" className="input" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <PasswordField id="org-del-pw" label="Your password" value={pw} onChange={setPw} autoComplete="current-password" />
            </div>
            {danger.note}
            <div className="button-row">
              <Button type="submit" variant="outline" size="sm" disabled={danger.busy || confirm !== org.name || !pw}>
                Delete company
              </Button>
            </div>
          </form>
        </SettingsCard>
      )}
    </SettingsLayout>
  );
}

/* ---------- Members ---------- */

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="copy-link">
      <input className="input copy-link__input mono" readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.target.select()} />
      <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  );
}

export function Members() {
  const { org, user, apply } = useAccount();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [approver, setApprover] = useState(false);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const inviteForm = useSubmit();
  const rows = useSubmit();
  const manage = can(org, 'manage');
  const isOwner = org?.role === 'owner';

  const load = useCallback(() => {
    if (!org) return;
    api
      .members(org.id)
      .then((r) => {
        setMembers(r.members);
        setInvites(r.invites);
      })
      .catch((err: Error) => rows.setMsg({ ok: false, text: err.message }));
  }, [org?.id]);
  useEffect(load, [load]);

  if (!org || !user) return null;

  // Optimistic: the control changes at once and reverts if the server says no.
  const update = (m: Member, patch: { role?: Role; approver?: boolean }) => {
    setMembers((list) => list?.map((x) => (x.userId === m.userId ? { ...x, ...patch } : x)) ?? null);
    void rows.run(async () => {
      try {
        const r = await api.updateMember(org.id, m.userId, patch);
        setMembers(r.members);
        apply(r);
        return `Updated ${m.name}.`;
      } catch (err) {
        load();
        throw err;
      }
    });
  };

  const approvers = (members ?? []).filter((m) => m.approver).length;

  return (
    <SettingsLayout
      eyebrow="COMPANY"
      title="Members and roles"
      blurb="Roles decide what each person can change. Approvers sign documents for the company, separately from their role."
    >
      {manage && (
        <SettingsCard title="Invite people" id="invite-h">
          <form
            className="stack account-form"
            onSubmit={inviteForm.onSubmit(async () => {
              const to = email.trim();
              const r = await api.invite(org.id, { email: to, role, approver });
              setInvites(r.invites);
              setLink({ email: to, url: r.link });
              setEmail('');
              setApprover(false);
              return `Invitation sent to ${to}.`;
            })}
          >
            <div className="invite-row">
              <div className="field">
                <label htmlFor="inv-email" className="field__label">
                  Work email
                </label>
                <input id="inv-email" type="email" className="input" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="inv-role" className="field__label">
                  Role
                </label>
                <select id="inv-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLES.filter((r) => r !== 'owner' || isOwner).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="check invite-row__check">
                <input type="checkbox" checked={approver} onChange={(e) => setApprover(e.target.checked)} />
                <span>Can approve documents</span>
              </label>
            </div>
            <p className="field__hint">{ROLE_HINT[role]}.</p>
            {inviteForm.note}
            {link && (
              <div className="stack">
                <span className="text-muted-sm">Or send {link.email} this link yourself. It works once, for 7 days.</span>
                <CopyLink link={link.url} />
              </div>
            )}
            <div className="button-row">
              <Button type="submit" size="sm" disabled={inviteForm.busy || !email || !user.emailVerified}>
                Send invitation
              </Button>
              {!user.emailVerified && <span className="text-muted-sm">Confirm your email first.</span>}
            </div>
          </form>
        </SettingsCard>
      )}

      <SettingsCard
        title={members ? `${members.length} member${members.length === 1 ? '' : 's'}` : 'Members'}
        id="members-h"
        aside={<span className="text-muted-sm">{approvers ? `${approvers} approver${approvers === 1 ? '' : 's'}` : 'No approvers yet'}</span>}
      >
        {rows.note}
        {!members ? (
          <p className="text-muted-sm">Loading…</p>
        ) : (
          <ul className="list-reset member-list">
            {members.map((m) => {
              const you = m.userId === user.id;
              const editable = manage && (isOwner || m.role !== 'owner');
              return (
                <li key={m.userId} className="member">
                  <span className="avatar avatar--sm" aria-hidden="true">
                    {initials(m.name)}
                  </span>
                  <span className="stack member__main">
                    <span className="member__name">
                      {m.name} {you && <span className="text-muted-sm">(you)</span>}
                    </span>
                    <span className="text-muted-sm member__meta">
                      {m.email}
                      {!m.emailVerified && ' · email not confirmed'}
                      {m.mfaEnabled ? ' · 2FA on' : ' · 2FA off'}
                      {m.lastActiveAt ? ` · active ${timeAgo(m.lastActiveAt)}` : ' · not signed in yet'}
                    </span>
                  </span>
                  <span className="member__controls">
                    {editable ? (
                      <>
                        <label className="visually-hidden" htmlFor={`role-${m.userId}`}>
                          Role for {m.name}
                        </label>
                        <select
                          id={`role-${m.userId}`}
                          className="input input--sm"
                          value={m.role}
                          disabled={rows.busy}
                          onChange={(e) => update(m, { role: e.target.value as Role })}
                        >
                          {ROLES.filter((r) => r !== 'owner' || isOwner).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <label className="check check--sm">
                          <input type="checkbox" checked={m.approver} disabled={rows.busy} onChange={(e) => update(m, { approver: e.target.checked })} />
                          <span>Approver</span>
                        </label>
                        {!you && (
                          <Button
                            size="sm"
                            variant="text"
                            disabled={rows.busy}
                            onClick={() =>
                              void rows.run(async () => {
                                if (!window.confirm(`Remove ${m.name} from ${org.name}?`)) return;
                                const r = await api.removeMember(org.id, m.userId);
                                setMembers(r.members);
                                return `Removed ${m.name}.`;
                              })
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="role-tag">
                        {ROLE_LABEL[m.role]}
                        {m.approver && ' · approver'}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsCard>

      {manage && invites.length > 0 && (
        <SettingsCard title="Pending invitations" id="pending-h">
          <ul className="list-reset member-list">
            {invites.map((i) => (
              <li key={i.id} className="member">
                <span className="avatar avatar--sm avatar--ghost" aria-hidden="true">
                  @
                </span>
                <span className="stack member__main">
                  <span className="member__name">{i.email}</span>
                  <span className="text-muted-sm">
                    {ROLE_LABEL[i.role]}
                    {i.approver && ' · approver'} · invited by {i.invitedBy || 'someone'} {timeAgo(i.createdAt)} ·{' '}
                    {i.expired ? 'expired' : `expires ${formatDate(i.expiresAt, false)}`}
                  </span>
                </span>
                <span className="member__controls">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rows.busy}
                    onClick={() =>
                      void rows.run(async () => {
                        const r = await api.resendInvite(org.id, i.id);
                        setInvites(r.invites);
                        setLink({ email: i.email, url: r.link });
                        return `Sent a new invitation to ${i.email}.`;
                      })
                    }
                  >
                    {i.expired ? 'Send again' : 'Resend'}
                  </Button>
                  <Button
                    size="sm"
                    variant="text"
                    disabled={rows.busy}
                    onClick={() =>
                      void rows.run(async () => {
                        const r = await api.revokeInvite(org.id, i.id);
                        setInvites(r.invites);
                        return `Withdrew the invitation to ${i.email}.`;
                      })
                    }
                  >
                    Withdraw
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </SettingsCard>
      )}

      <SettingsCard title="What each role can do" id="roles-h">
        <div className="table-wrap">
        <table className="readiness-table role-table">
          <thead>
            <tr>
              <th scope="col">Can</th>
              {ROLES.map((r) => (
                <th key={r} scope="col">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Read documentation, runs and history', 4],
                ['Answer questions, save runs, submit for review', 3],
                ['Create projects', 3],
                ['Delete projects, invite and manage members', 2],
                ['Change the security policy', 2],
                ['Manage owners, delete the company', 1],
              ] as const
            ).map(([label, n]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {ROLES.map((r, i) => (
                  <td key={r}>{i < n ? <span className="check-mark check-mark--done">✓</span> : <span className="check-mark">—</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="text-muted-sm">
          <strong>Approver</strong> can be given to anyone. Approvers record approval of documents that a Biomedix engineer has reviewed,
          by re-entering their password: an electronic signature with the meaning “Approved”.
        </p>
      </SettingsCard>
    </SettingsLayout>
  );
}

/* ---------- Activity ---------- */

const TYPES = [
  ['', 'Everything'],
  ['doc', 'Sign-offs'],
  ['run', 'Runs'],
  ['project', 'Projects'],
  ['member', 'Members'],
  ['invite', 'Invitations'],
  ['org', 'Company'],
] as const;

export function Activity() {
  const { org } = useAccount();
  const { projectId } = useIntake();
  const [type, setType] = useState('');
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (before?: number) => {
      if (!org) return;
      api
        .audit(org.id, { type, before })
        .then((r) => {
          setEntries((prev) => (before && prev ? [...prev, ...r.entries] : r.entries));
          setMore(r.more);
        })
        .catch((err: Error) => setError(err.message));
    },
    [org, type],
  );
  useEffect(() => {
    setEntries(null);
    load();
  }, [load, projectId]);

  if (!org) return null;

  return (
    <SettingsLayout
      eyebrow="COMPANY"
      title="Activity log"
      blurb="Every change to the company, its members, projects and sign-offs, with who did it and when. Entries can’t be edited or deleted."
    >
      <div role="group" aria-label="Filter activity" className="app-sidebar__pills activity-filter">
        {TYPES.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={type === key} className={`pill${type === key ? ' pill--active' : ''}`} onClick={() => setType(key)}>
            {label}
          </button>
        ))}
      </div>
      <section className="card card--compact" aria-label="Activity">
        {error && <p className="form-msg form-msg--err">{error}</p>}
        {!entries ? (
          <p className="text-muted-sm">Loading…</p>
        ) : !entries.length ? (
          <p className="text-muted-sm">Nothing yet.</p>
        ) : (
          <ul className="list-reset activity">
            {entries.map((e) => (
              <li key={e.id} className="activity__row">
                <span className={`activity__dot activity__dot--${e.action.split('.')[0]}`} aria-hidden="true" />
                <span className="stack activity__main">
                  <span>
                    <strong>{e.actor}</strong> {describeAudit(e)}
                  </span>
                  <span className="text-muted-sm">
                    {formatDate(e.createdAt)}
                    {e.ip ? ` · ${e.ip}` : ''}
                    {typeof e.detail.note === 'string' && e.detail.note ? ` · “${e.detail.note}”` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {more && entries && (
          <div className="button-row">
            <Button size="sm" variant="outline" onClick={() => load(entries[entries.length - 1].id)}>
              Show older
            </Button>
          </div>
        )}
      </section>
    </SettingsLayout>
  );
}
