/**
 * The Biomedix side: reviewers sign technical reviews across customer companies;
 * admins also see every company and user and grant staff roles.
 */
import { requireStaff, type ProjectRow } from '../access.ts';
import { audit } from '../audit.ts';
import { getDb } from '../db.ts';
import { countStates, docStates, type DocState } from '../docstates.ts';
import { HttpError, route, str, type Route } from '../http.ts';
import { sendMail } from '../mail.ts';
import { reauth } from './account.ts';
import { draftsOf, recordSignoff, signoffs } from './projects.ts';

const STATE_FOR: Record<string, DocState> = {
  submitted: 'in_review',
  returned: 'returned',
  reviewed: 'awaiting_approval',
  approved: 'approved',
};

export const staffRoutes: Route[] = [
  route('GET', '/staff/reviews', (c) => {
    requireStaff(c.user, ['reviewer', 'admin'], c.dev);
    const state = STATE_FOR[c.query.get('state') ?? 'submitted'] ?? 'in_review';
    const all = docStates("r.kind IS NOT NULL", []);
    const orgs = new Map(
      (getDb().prepare('SELECT id, name FROM orgs').all() as { id: string; name: string }[]).map((o) => [o.id, o.name]),
    );
    const items = all
      .filter((s) => s.state === state)
      .map((s) => ({
        orgId: s.org_id,
        orgName: orgs.get(s.org_id) ?? '',
        projectId: s.project_id,
        company: s.company ?? '',
        device: s.device ?? '',
        docId: s.doc_id,
        title: s.title,
        draft: s.draft,
        filledPct: s.filled_pct,
        runNumber: s.run_number,
        at: s.signed_at ?? s.draft_at,
        by: s.signer ?? '',
        byYou: s.signer_id === c.user.id,
      }));
    return { items, counts: countStates(all) };
  }),

  route('GET', '/staff/reviews/:projectId/:docId', (c) => {
    requireStaff(c.user, ['reviewer', 'admin'], c.dev);
    const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(c.params.projectId) as ProjectRow | undefined;
    if (!row) throw new HttpError(404, 'Project not found.');
    const docId = c.params.docId;
    const drafts = draftsOf(row.id, docId);
    if (!drafts.length) throw new HttpError(404, 'No saved drafts for this document.');
    const org = getDb().prepare('SELECT id, name FROM orgs WHERE id = ?').get(row.org_id) as { id: string; name: string };
    const intake = JSON.parse(row.intake) as { company?: { name?: string }; device?: { name?: string } };
    return {
      org,
      project: { id: row.id, company: intake.company?.name ?? '', device: intake.device?.name ?? '' },
      docId,
      latest: drafts[0],
      previous: drafts[1] ?? null,
      signoffs: signoffs(row.id, docId),
    };
  }),

  route('POST', '/staff/reviews/:projectId/:docId', async (c) => {
    requireStaff(c.user, ['reviewer', 'admin'], c.dev);
    if (!c.user.emailVerified) throw new HttpError(403, 'Confirm your email address before you sign reviews.', 'verify_email');
    const kind = str(c.body, 'kind', { max: 10, required: true });
    if (kind !== 'review' && kind !== 'return') throw new HttpError(400, 'Unknown sign-off.');
    const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(c.params.projectId) as ProjectRow | undefined;
    if (!row) throw new HttpError(404, 'Project not found.');
    const note = str(c.body, 'note', { max: 4000 });
    if (kind === 'return' && !note) throw new HttpError(400, 'Say what needs to change.');
    if (kind === 'review') await reauth(c);
    const docId = c.params.docId;
    const draft = Number(c.body.draft);
    const out = recordSignoff(row, docId, draft, kind, c, {
      note,
      method: kind === 'review' ? 'Biomedix e-signature (password)' : '',
      reference: '',
    });
    audit({
      orgId: row.org_id,
      userId: c.user.id,
      actor: `${c.user.name} (Biomedix)`,
      action: kind === 'review' ? 'doc.reviewed' : 'doc.returned',
      target: `${docId} draft ${draft}`,
      detail: note ? { note: note.slice(0, 300) } : {},
      ip: c.ip,
    });
    return out;
  }),

  /* ---------- Admin ---------- */

  route('GET', '/staff/orgs', (c) => {
    requireStaff(c.user, ['admin'], c.dev);
    const states = docStates('1 = 1', []);
    return {
      orgs: (
        getDb()
          .prepare(
            `SELECT o.id, o.name, o.require_mfa, o.created_at,
               (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) AS members,
               (SELECT COUNT(*) FROM projects p WHERE p.org_id = o.id) AS projects,
               (SELECT ROUND(AVG(readiness)) FROM projects p WHERE p.org_id = o.id) AS readiness,
               (SELECT group_concat(u.name, ', ') FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = o.id AND m.role = 'owner') AS owners,
               (SELECT MAX(updated_at) FROM projects p WHERE p.org_id = o.id) AS active
             FROM orgs o ORDER BY COALESCE(active, o.created_at) DESC`,
          )
          .all() as Record<string, string | number | null>[]
      ).map((o) => ({
        id: o.id,
        name: o.name,
        requireMfa: !!o.require_mfa,
        createdAt: o.created_at,
        members: o.members,
        projects: o.projects,
        readiness: o.readiness ?? 0,
        owners: o.owners ?? '',
        lastActiveAt: o.active,
        docs: countStates(states.filter((s) => s.org_id === o.id)),
      })),
    };
  }),

  route('GET', '/staff/users', (c) => {
    requireStaff(c.user, ['admin'], c.dev);
    const q = `%${(c.query.get('q') ?? '').trim().slice(0, 100)}%`;
    return {
      users: (
        getDb()
          .prepare(
            `SELECT u.id, u.name, u.email, u.created_at, u.email_verified_at, u.totp_enabled_at, u.staff_role,
               (SELECT group_concat(o.name, ', ') FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = u.id) AS orgs,
               (SELECT MAX(last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen
             FROM users u WHERE u.name LIKE ? OR u.email LIKE ? ORDER BY u.created_at DESC LIMIT 200`,
          )
          .all(q, q) as Record<string, string | number | null>[]
      ).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.created_at,
        emailVerified: !!u.email_verified_at,
        mfaEnabled: !!u.totp_enabled_at,
        staffRole: u.staff_role || '',
        orgs: u.orgs ?? '',
        lastActiveAt: u.last_seen,
      })),
    };
  }),

  /** Support action for someone who lost their phone and recovery codes. */
  route('POST', '/staff/users/:id/reset-mfa', async (c) => {
    requireStaff(c.user, ['admin'], c.dev);
    await reauth(c);
    const target = getDb().prepare('SELECT id, name, email, totp_enabled_at FROM users WHERE id = ?').get(c.params.id) as
      | { id: string; name: string; email: string; totp_enabled_at: string | null }
      | undefined;
    if (!target) throw new HttpError(404, 'User not found.');
    if (!target.totp_enabled_at) throw new HttpError(409, `${target.name} doesn’t have two-factor on.`);
    getDb()
      .prepare('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, totp_last_step = 0 WHERE id = ?')
      .run(target.id);
    getDb().prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(target.id);
    getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    audit({ userId: target.id, actor: `${c.user.name} (Biomedix)`, action: 'mfa.disabled', detail: { by: 'Biomedix support' }, ip: c.ip });
    sendMail(target.email, 'mfa-changed', { name: target.name, state: 'turned off by Biomedix support' }, c);
    return { ok: true };
  }),

  route('PATCH', '/staff/users/:id', (c) => {
    requireStaff(c.user, ['admin'], c.dev);
    const role = str(c.body, 'staffRole', { max: 20 });
    if (!['', 'reviewer', 'admin'].includes(role)) throw new HttpError(400, 'Unknown staff role.');
    const target = getDb().prepare('SELECT id, name, email, staff_role, email_verified_at FROM users WHERE id = ?').get(c.params.id) as
      | { id: string; name: string; email: string; staff_role: string; email_verified_at: string | null }
      | undefined;
    if (!target) throw new HttpError(404, 'User not found.');
    if (role && !target.email_verified_at) throw new HttpError(409, `${target.name} needs to confirm their email first.`);
    if (target.staff_role === 'admin' && role !== 'admin') {
      const { n } = getDb().prepare(`SELECT COUNT(*) AS n FROM users WHERE staff_role = 'admin'`).get() as { n: number };
      if (n === 1) throw new HttpError(409, 'Biomedix needs at least one admin.');
    }
    getDb().prepare('UPDATE users SET staff_role = ? WHERE id = ?').run(role, target.id);
    audit({ userId: target.id, actor: c.user.name, action: 'staff.role_changed', target: target.email, detail: { from: target.staff_role, to: role }, ip: c.ip });
    return { ok: true };
  }),
];
