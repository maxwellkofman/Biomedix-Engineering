/** Company workspaces: settings, members and roles, invitations, the activity log and the dashboard. */
import { randomBytes, randomUUID } from 'node:crypto';
import { can, isRole, orgAccess, ownerCount, requireVerified, ROLE_LABEL, sessionPayload, type Role } from '../access.ts';
import { audit, auditJson, type AuditRow } from '../audit.ts';
import { sha256 } from '../auth.ts';
import { getDb, tx } from '../db.ts';
import { countStates, docStates } from '../docstates.ts';
import { bool, email, hit, HttpError, limit, now, route, str, type Ctx, type Route } from '../http.ts';
import { sendMail } from '../mail.ts';
import { reauth } from './account.ts';
import { createProject, projectList } from './projects.ts';

const INVITE_DAYS = 7;

function orgJson(o: { id: string; name: string; require_mfa: number; created_at: string }) {
  return { id: o.id, name: o.name, requireMfa: !!o.require_mfa, createdAt: o.created_at };
}

interface InviteRow {
  id: string;
  email: string;
  role: Role;
  approver: number;
  invited_by: string | null;
  inviter: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

function inviteJson(r: InviteRow) {
  return {
    id: r.id,
    email: r.email,
    role: r.role,
    approver: !!r.approver,
    invitedBy: r.inviter ?? '',
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    expired: r.expires_at < now(),
  };
}

function invites(orgId: string) {
  return (
    getDb()
      .prepare(
        `SELECT i.*, u.name AS inviter FROM invites i LEFT JOIN users u ON u.id = i.invited_by
         WHERE i.org_id = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?
         ORDER BY i.created_at DESC`,
      )
      .all(orgId, new Date(Date.now() - 30 * 86400_000).toISOString()) as unknown as InviteRow[]
  ).map(inviteJson);
}

function members(orgId: string) {
  return (
    getDb()
      .prepare(
        `SELECT u.id, u.name, u.email, u.email_verified_at, u.totp_enabled_at, m.role, m.approver, m.created_at,
           (SELECT MAX(last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen
         FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ?
         ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, u.name COLLATE NOCASE`,
      )
      .all(orgId) as Record<string, string | number | null>[]
  ).map((r) => ({
    userId: r.id,
    name: r.name,
    email: r.email,
    role: r.role as Role,
    approver: !!r.approver,
    emailVerified: !!r.email_verified_at,
    mfaEnabled: !!r.totp_enabled_at,
    joinedAt: r.created_at,
    lastActiveAt: r.last_seen,
  }));
}

function sendInvite(c: Ctx, orgName: string, to: string, role: Role, token: string) {
  const url = `${c.appUrl}/invite/${token}`;
  sendMail(to, 'invite', { inviter: c.user.name, org: orgName, role: ROLE_LABEL[role].toLowerCase(), url }, c);
  return url;
}

function newInviteToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token), expires: new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString() };
}

const projectName = (company: unknown, device: unknown) => String(device || company || 'Untitled project');

export const orgRoutes: Route[] = [
  route(
    'POST',
    '/orgs',
    (c) => {
      const name = str(c.body, 'name', { max: 120, required: true });
      const { n } = getDb().prepare(`SELECT COUNT(*) AS n FROM memberships WHERE user_id = ? AND role = 'owner'`).get(c.user.id) as { n: number };
      if (n >= 10) throw new HttpError(400, 'You can own up to 10 companies.');
      const id = randomUUID();
      const t = now();
      tx((d) => {
        d.prepare('INSERT INTO orgs (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run(id, name, c.user.id, t);
        d.prepare(`INSERT INTO memberships (org_id, user_id, role, approver, created_at) VALUES (?, ?, 'owner', 1, ?)`).run(id, c.user.id, t);
      });
      audit({ orgId: id, userId: c.user.id, actor: c.user.name, action: 'org.created', target: name, ip: c.ip });
      return { orgId: id, ...sessionPayload(c.user.id) };
    },
    201,
  ),

  route('GET', '/orgs/:id', (c) => {
    const { org, m } = orgAccess(c.user, c.params.id, 'view');
    const count = (sql: string) => (getDb().prepare(sql).get(org.id) as { n: number }).n;
    return {
      org: orgJson(org),
      you: m,
      counts: {
        members: count('SELECT COUNT(*) AS n FROM memberships WHERE org_id = ?'),
        projects: count('SELECT COUNT(*) AS n FROM projects WHERE org_id = ?'),
        withoutMfa: count(
          'SELECT COUNT(*) AS n FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND u.totp_enabled_at IS NULL',
        ),
      },
    };
  }),

  route('PATCH', '/orgs/:id', (c) => {
    const { org } = orgAccess(c.user, c.params.id, 'manage');
    const name = str(c.body, 'name', { max: 120 });
    const requireMfa = bool(c.body, 'requireMfa');
    if (name && name !== org.name) {
      getDb().prepare('UPDATE orgs SET name = ? WHERE id = ?').run(name, org.id);
      audit({ orgId: org.id, userId: c.user.id, actor: c.user.name, action: 'org.renamed', detail: { from: org.name, to: name }, ip: c.ip });
    }
    if (requireMfa !== undefined && requireMfa !== !!org.require_mfa) {
      if (requireMfa && !c.user.mfaEnabled)
        throw new HttpError(409, 'Turn on two-factor authentication for your own account first, so you don’t lock yourself out.');
      getDb().prepare('UPDATE orgs SET require_mfa = ? WHERE id = ?').run(requireMfa ? 1 : 0, org.id);
      audit({ orgId: org.id, userId: c.user.id, actor: c.user.name, action: requireMfa ? 'org.mfa_required' : 'org.mfa_optional', ip: c.ip });
    }
    return sessionPayload(c.user.id);
  }),

  route('DELETE', '/orgs/:id', async (c) => {
    const { org } = orgAccess(c.user, c.params.id, 'own');
    await reauth(c);
    if (str(c.body, 'confirm', { max: 200 }) !== org.name) throw new HttpError(400, `Type ${org.name} to confirm.`);
    getDb().prepare('DELETE FROM orgs WHERE id = ?').run(org.id);
    audit({ userId: c.user.id, actor: c.user.name, action: 'org.deleted', target: org.name, ip: c.ip });
    return sessionPayload(c.user.id);
  }),

  route('POST', '/orgs/:id/leave', (c) => {
    // No access check beyond membership: you can always leave, even before setting up two-factor.
    const m = getDb().prepare('SELECT role FROM memberships WHERE org_id = ? AND user_id = ?').get(c.params.id, c.user.id) as
      | { role: Role }
      | undefined;
    if (!m) throw new HttpError(404, 'Company not found.');
    const org = getDb().prepare('SELECT name FROM orgs WHERE id = ?').get(c.params.id) as { name: string };
    if (m.role === 'owner' && ownerCount(c.params.id) === 1) {
      const { n } = getDb().prepare('SELECT COUNT(*) AS n FROM memberships WHERE org_id = ?').get(c.params.id) as { n: number };
      throw new HttpError(
        409,
        n > 1
          ? `You’re the only owner of ${org.name}. Make someone else an owner before you leave.`
          : `You’re the only member of ${org.name}. Delete the company instead.`,
        'sole_owner',
      );
    }
    getDb().prepare('DELETE FROM memberships WHERE org_id = ? AND user_id = ?').run(c.params.id, c.user.id);
    audit({ orgId: c.params.id, userId: c.user.id, actor: c.user.name, action: 'member.left', target: c.user.email, ip: c.ip });
    return sessionPayload(c.user.id);
  }),

  /* ---------- Members ---------- */

  route('GET', '/orgs/:id/members', (c) => {
    const { org, m } = orgAccess(c.user, c.params.id, 'view');
    return { members: members(org.id), you: m, invites: can(m.role, 'manage') ? invites(org.id) : [] };
  }),

  route('PATCH', '/orgs/:id/members/:userId', (c) => {
    const { org, m } = orgAccess(c.user, c.params.id, 'manage');
    const target = getDb()
      .prepare('SELECT m.role, m.approver, u.name, u.email, u.email_verified_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.user_id = ?')
      .get(org.id, c.params.userId) as { role: Role; approver: number; name: string; email: string; email_verified_at: string | null } | undefined;
    if (!target) throw new HttpError(404, 'That person isn’t a member.');
    const role = c.body.role === undefined ? target.role : c.body.role;
    if (!isRole(role)) throw new HttpError(400, 'Unknown role.');
    const approver = bool(c.body, 'approver') ?? !!target.approver;
    if ((target.role === 'owner' || role === 'owner') && role !== target.role && m.role !== 'owner')
      throw new HttpError(403, 'Only an owner can make or change owners.');
    if (target.role === 'owner' && role !== 'owner' && ownerCount(org.id) === 1)
      throw new HttpError(409, 'A company needs at least one owner. Make someone else an owner first.');
    getDb()
      .prepare('UPDATE memberships SET role = ?, approver = ? WHERE org_id = ? AND user_id = ?')
      .run(role, approver ? 1 : 0, org.id, c.params.userId);
    if (role !== target.role)
      audit({ orgId: org.id, userId: c.user.id, actor: c.user.name, action: 'member.role_changed', target: target.email, detail: { from: target.role, to: role }, ip: c.ip });
    if (approver !== !!target.approver)
      audit({ orgId: org.id, userId: c.user.id, actor: c.user.name, action: approver ? 'member.approver_added' : 'member.approver_removed', target: target.email, ip: c.ip });
    return { members: members(org.id), ...sessionPayload(c.user.id) };
  }),

  route('DELETE', '/orgs/:id/members/:userId', (c) => {
    const { org, m } = orgAccess(c.user, c.params.id, 'manage');
    if (c.params.userId === c.user.id) throw new HttpError(400, 'To remove yourself, leave the company instead.');
    const target = getDb()
      .prepare('SELECT m.role, u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.user_id = ?')
      .get(org.id, c.params.userId) as { role: Role; email: string } | undefined;
    if (!target) throw new HttpError(404, 'That person isn’t a member.');
    if (target.role === 'owner' && m.role !== 'owner') throw new HttpError(403, 'Only an owner can remove an owner.');
    getDb().prepare('DELETE FROM memberships WHERE org_id = ? AND user_id = ?').run(org.id, c.params.userId);
    audit({ orgId: org.id, userId: c.user.id, actor: c.user.name, action: 'member.removed', target: target.email, ip: c.ip });
    return { members: members(org.id) };
  }),

  /* ---------- Invitations ---------- */

  route(
    'POST',
    '/orgs/:id/invites',
    (c) => {
      const { org, m } = orgAccess(c.user, c.params.id, 'manage');
      requireVerified(c.user, 'invite people');
      const to = email(c.body);
      const role = c.body.role ?? 'editor';
      if (!isRole(role)) throw new HttpError(400, 'Unknown role.');
      if (role === 'owner' && m.role !== 'owner') throw new HttpError(403, 'Only an owner can invite another owner.');
      const approver = bool(c.body, 'approver') ?? false;
      if (getDb().prepare('SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND u.email = ?').get(org.id, to))
        throw new HttpError(409, `${to} is already a member of ${org.name}.`);
      limit(`invite:${org.id}`, 50, 86400_000, 'That’s a lot of invitations for one day. Try again tomorrow.');
      hit(`invite:${org.id}`, 86400_000);
      const { token, hash, expires } = newInviteToken();
      const id = randomUUID();
      tx((d) => {
        d.prepare('UPDATE invites SET revoked_at = ? WHERE org_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL').run(now(), org.id, to);
        d.prepare(
          'INSERT INTO invites (id, org_id, email, role, approver, token_hash, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(id, org.id, to, role, approver ? 1 : 0, hash, c.user.id, now(), expires);
      });
      const link = sendInvite(c, org.name, to, role, token);
      audit({ orgId: org.id, userId: c.user.id, actor: c.user.name, action: 'member.invited', target: to, detail: { role, approver }, ip: c.ip });
      return { link, invites: invites(org.id) };
    },
    201,
  ),

  route('POST', '/orgs/:id/invites/:inviteId/resend', (c) => {
    const { org } = orgAccess(c.user, c.params.id, 'manage');
    requireVerified(c.user, 'invite people');
    const inv = getDb()
      .prepare('SELECT * FROM invites WHERE id = ? AND org_id = ? AND accepted_at IS NULL AND revoked_at IS NULL')
      .get(c.params.inviteId, org.id) as InviteRow | undefined;
    if (!inv) throw new HttpError(404, 'That invitation was already used or withdrawn.');
    limit(`resend:${inv.id}`, 3, 60 * 60_000, 'Sent a few times already. Copy the link and send it yourself, or try in an hour.');
    hit(`resend:${inv.id}`, 60 * 60_000);
    const { token, hash, expires } = newInviteToken();
    getDb().prepare('UPDATE invites SET token_hash = ?, expires_at = ?, created_at = ? WHERE id = ?').run(hash, expires, now(), inv.id);
    const link = sendInvite(c, org.name, inv.email, inv.role, token);
    return { link, invites: invites(org.id) };
  }),

  route('DELETE', '/orgs/:id/invites/:inviteId', (c) => {
    const { org } = orgAccess(c.user, c.params.id, 'manage');
    const inv = getDb().prepare('SELECT email FROM invites WHERE id = ? AND org_id = ?').get(c.params.inviteId, org.id) as
      | { email: string }
      | undefined;
    if (!inv) throw new HttpError(404, 'Invitation not found.');
    getDb().prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL').run(now(), c.params.inviteId);
    audit({ orgId: org.id, userId: c.user.id, actor: c.user.name, action: 'invite.revoked', target: inv.email, ip: c.ip });
    return { invites: invites(org.id) };
  }),

  /* ---------- Activity ---------- */

  route('GET', '/orgs/:id/audit', (c) => {
    const { org, m } = orgAccess(c.user, c.params.id, 'view');
    const before = Number(c.query.get('before')) || Number.MAX_SAFE_INTEGER;
    const lim = Math.min(100, Math.max(1, Number(c.query.get('limit')) || 50));
    const type = c.query.get('type') ?? '';
    const prefix = ['member', 'invite', 'org', 'project', 'run', 'doc'].includes(type) ? `${type}.%` : '%';
    const rows = getDb()
      .prepare('SELECT * FROM audit WHERE org_id = ? AND id < ? AND action LIKE ? ORDER BY id DESC LIMIT ?')
      .all(org.id, before, prefix, lim + 1) as unknown as AuditRow[];
    return {
      entries: rows.slice(0, lim).map((r) => auditJson(r, can(m.role, 'manage'))),
      more: rows.length > lim,
    };
  }),

  /* ---------- Projects and the company dashboard ---------- */

  route('GET', '/orgs/:id/projects', (c) => {
    const { org } = orgAccess(c.user, c.params.id, 'view');
    return { projects: projectList(org.id) };
  }),

  route(
    'POST',
    '/orgs/:id/projects',
    (c) => {
      const { org } = orgAccess(c.user, c.params.id, 'edit');
      return createProject(c, org.id);
    },
    201,
  ),

  route('GET', '/orgs/:id/dashboard', (c) => {
    const { org, m } = orgAccess(c.user, c.params.id, 'view');
    const states = docStates('p.org_id = ?', [org.id]);
    const projects = projectList(org.id).map((p) => ({ ...p, docs: countStates(states.filter((s) => s.project_id === p.id)) }));
    const item = (s: (typeof states)[number]) => ({
      projectId: s.project_id,
      project: projectName(s.company, s.device),
      docId: s.doc_id,
      title: s.title,
      draft: s.draft,
      at: s.signed_at ?? s.draft_at,
      by: s.signer ?? '',
      note: s.note ?? '',
    });
    const team = members(org.id);
    const activity = (
      getDb().prepare('SELECT * FROM audit WHERE org_id = ? ORDER BY id DESC LIMIT 8').all(org.id) as unknown as AuditRow[]
    ).map((r) => auditJson(r, false));
    return {
      org: orgJson(org),
      you: m,
      projects,
      totals: { ...countStates(states), projects: projects.length },
      attention: {
        approvals: m.approver ? states.filter((s) => s.state === 'awaiting_approval').map(item) : [],
        returned: can(m.role, 'edit') ? states.filter((s) => s.state === 'returned').map(item) : [],
        inReview: states.filter((s) => s.state === 'in_review').length,
      },
      team: team.slice(0, 8).map(({ userId, name, role, approver }) => ({ userId, name, role, approver })),
      teamCount: team.length,
      teamWithoutMfa: team.filter((t) => !t.mfaEnabled).length,
      pendingInvites: can(m.role, 'manage') ? invites(org.id).filter((i) => !i.expired).length : 0,
      activity,
    };
  }),
];
