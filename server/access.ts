/**
 * Who can do what. A company (org) owns projects; people belong to it with a role:
 *   owner  – everything, including deleting the company and managing owners
 *   admin  – manage members, invitations, security policy and projects
 *   editor – answer the questionnaire, save runs, submit drafts for review
 *   viewer – read only
 * Approving documents is a separate designation (`approver`), as QMS document
 * control names who may approve, independent of who administers the workspace.
 * Biomedix staff (users.staff_role) sign technical reviews from their own workspace.
 */
import { toUser, userRow, type User } from './auth.ts';
import { getDb } from './db.ts';
import { HttpError } from './http.ts';

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer'];
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };
export type Perm = 'view' | 'edit' | 'manage' | 'own';
const NEED: Record<Perm, number> = { view: 0, edit: 1, manage: 2, own: 3 };

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

export interface OrgRow {
  id: string;
  name: string;
  require_mfa: number;
  created_by: string | null;
  created_at: string;
}

export interface Member {
  role: Role;
  approver: boolean;
}

export function can(role: Role, perm: Perm) {
  return RANK[role] >= NEED[perm];
}

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as string[]).includes(v);
}

export function orgsFor(userId: string) {
  return (
    getDb()
      .prepare(
        `SELECT o.id, o.name, o.require_mfa, o.created_at, m.role, m.approver
         FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY o.name COLLATE NOCASE`,
      )
      .all(userId) as (OrgRow & { role: Role; approver: number })[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    approver: !!r.approver,
    requireMfa: !!r.require_mfa,
    createdAt: r.created_at,
  }));
}

export function sessionPayload(userId: string) {
  return { user: toUser(userRow(userId)), orgs: orgsFor(userId) };
}

/** The company and the user's membership, if they may `perm` in it. */
export function orgAccess(user: User, orgId: string, perm: Perm): { org: OrgRow; m: Member } {
  const row = getDb()
    .prepare(
      `SELECT o.*, m.role AS m_role, m.approver AS m_approver
       FROM orgs o JOIN memberships m ON m.org_id = o.id AND m.user_id = ? WHERE o.id = ?`,
    )
    .get(user.id, orgId) as (OrgRow & { m_role: Role; m_approver: number }) | undefined;
  if (!row) throw new HttpError(404, 'Company not found.');
  if (row.require_mfa && !user.mfaEnabled)
    throw new HttpError(403, `${row.name} requires two-factor authentication. Turn it on in your security settings to continue.`, 'mfa_required');
  if (!can(row.m_role, perm)) throw new HttpError(403, `Your role in ${row.name} (${ROLE_LABEL[row.m_role]}) doesn’t allow this.`, 'forbidden');
  const { m_role, m_approver, ...org } = row;
  return { org, m: { role: m_role, approver: !!m_approver } };
}

export interface ProjectRow {
  id: string;
  org_id: string;
  created_by: string | null;
  intake: string;
  confirmed: string;
  readiness: number;
  created_at: string;
  updated_at: string;
}

export function projectAccess(user: User, projectId: string, perm: Perm) {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRow | undefined;
  if (!row) throw new HttpError(404, 'Project not found.');
  try {
    return { row, ...orgAccess(user, row.org_id, perm) };
  } catch (err) {
    // Don't reveal that a project exists in a company you're not in.
    if (err instanceof HttpError && err.status === 404) throw new HttpError(404, 'Project not found.');
    throw err;
  }
}

export function ownerCount(orgId: string) {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM memberships WHERE org_id = ? AND role = 'owner'`).get(orgId) as { n: number }).n;
}

export function requireVerified(user: User, what: string) {
  if (!user.emailVerified) throw new HttpError(403, `Confirm your email address before you ${what}.`, 'verify_email');
}

export function requireStaff(user: User, roles: ('reviewer' | 'admin')[], dev: boolean) {
  if (!user.staffRole || !roles.includes(user.staffRole as 'reviewer' | 'admin'))
    throw new HttpError(403, 'This area is for Biomedix staff.', 'forbidden');
  const mfa = process.env.BIOMEDIX_STAFF_MFA ?? (dev ? 'optional' : 'required');
  if (mfa === 'required' && !user.mfaEnabled)
    throw new HttpError(403, 'Biomedix staff accounts need two-factor authentication. Turn it on in your security settings.', 'mfa_required');
}

/** Approvers named on documents waiting for approval. */
export function approverNames(orgId: string) {
  return (
    getDb()
      .prepare(
        `SELECT u.name FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.org_id = ? AND m.approver = 1 ORDER BY u.name COLLATE NOCASE`,
      )
      .all(orgId) as { name: string }[]
  ).map((r) => r.name);
}
