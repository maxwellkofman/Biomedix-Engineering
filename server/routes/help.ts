/**
 * "Ask an engineer": questions from a company's members to Biomedix staff,
 * kept as threads so the answer stays with the question. Also the staff
 * overview: one screen of everything waiting on Biomedix.
 */
import { randomUUID } from 'node:crypto';
import { orgAccess, requireStaff } from '../access.ts';
import { audit, auditJson, type AuditRow } from '../audit.ts';
import type { User } from '../auth.ts';
import { getDb, tx } from '../db.ts';
import { countStates, docStates } from '../docstates.ts';
import { hit, HttpError, limit, now, route, str, type Ctx, type Route } from '../http.ts';
import { sendMail } from '../mail.ts';
import { teamRecipients } from './requests.ts';

interface ThreadRow {
  id: string;
  org_id: string;
  project_id: string | null;
  user_id: string | null;
  asker: string;
  asker_email: string;
  subject: string;
  context: string;
  context_label: string;
  status: 'open' | 'answered' | 'closed';
  answered_by: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  user_id: string | null;
  author: string;
  staff: number;
  body: string;
  created_at: string;
}

const isStaff = (u: User) => !!u.staffRole;

function threadJson(t: ThreadRow & { org_name?: string; messages?: number; last_body?: string; last_staff?: number }) {
  return {
    id: t.id,
    orgId: t.org_id,
    orgName: t.org_name ?? '',
    subject: t.subject,
    context: t.context,
    contextLabel: t.context_label,
    status: t.status,
    asker: t.asker,
    answeredBy: t.answered_by,
    messages: t.messages ?? 0,
    lastBody: t.last_body ?? '',
    lastFromStaff: !!t.last_staff,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

const LIST = `SELECT t.*, o.name AS org_name,
    (SELECT COUNT(*) FROM help_messages m WHERE m.thread_id = t.id) AS messages,
    (SELECT body FROM help_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS last_body,
    (SELECT staff FROM help_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS last_staff
  FROM help_threads t JOIN orgs o ON o.id = t.org_id`;

/** The thread, if this person may read it: a member of its company, or Biomedix staff. */
function threadFor(c: Ctx, id: string): { t: ThreadRow & { org_name: string }; staff: boolean } {
  const t = getDb().prepare(`${LIST} WHERE t.id = ?`).get(id) as unknown as (ThreadRow & { org_name: string }) | undefined;
  if (!t) throw new HttpError(404, 'That question no longer exists.');
  if (isStaff(c.user)) {
    requireStaff(c.user, ['reviewer', 'admin'], c.dev);
    return { t, staff: true };
  }
  orgAccess(c.user, t.org_id, 'view');
  return { t, staff: false };
}

function detail(t: ThreadRow & { org_name: string }) {
  const messages = getDb().prepare('SELECT * FROM help_messages WHERE thread_id = ? ORDER BY created_at, rowid').all(t.id) as unknown as MessageRow[];
  return {
    thread: { ...threadJson(t), messages: messages.length },
    messages: messages.map((m) => ({ id: m.id, author: m.author, staff: !!m.staff, body: m.body, createdAt: m.created_at })),
  };
}

function addMessage(threadId: string, u: User, staff: boolean, body: string, t: string) {
  getDb()
    .prepare('INSERT INTO help_messages (id, thread_id, user_id, author, staff, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), threadId, u.id, u.name, staff ? 1 : 0, body, t);
}

const question = (c: Ctx) => str(c.body, 'body', { max: 4000, required: true });
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export const helpRoutes: Route[] = [
  route('GET', '/orgs/:id/help', (c) => {
    const { org } = orgAccess(c.user, c.params.id, 'view');
    const rows = getDb().prepare(`${LIST} WHERE t.org_id = ? ORDER BY t.updated_at DESC LIMIT 100`).all(org.id) as unknown as ThreadRow[];
    return { threads: rows.map(threadJson) };
  }),

  route(
    'POST',
    '/orgs/:id/help',
    (c) => {
      const { org } = orgAccess(c.user, c.params.id, 'view');
      const body = question(c);
      const context = str(c.body, 'context', { max: 200 });
      const contextLabel = str(c.body, 'contextLabel', { max: 200 });
      const projectId = str(c.body, 'projectId', { max: 60 });
      limit(`help:${c.user.id}`, 20, 60 * 60_000, 'You’ve asked a lot of questions this hour. Try again later, or book a call.');
      hit(`help:${c.user.id}`, 60 * 60_000);
      const owned = projectId && getDb().prepare('SELECT 1 FROM projects WHERE id = ? AND org_id = ?').get(projectId, org.id);
      const id = randomUUID();
      const t = now();
      const subject = short(body.split('\n')[0].trim(), 90);
      tx((d) => {
        d.prepare(
          `INSERT INTO help_threads (id, org_id, project_id, user_id, asker, asker_email, subject, context, context_label, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
        ).run(id, org.id, owned ? projectId : null, c.user.id, c.user.name, c.user.email, subject, context.startsWith('/') ? context : '', contextLabel, t, t);
        addMessage(id, c.user, false, body, t);
      });
      audit({ orgId: org.id, userId: c.user.id, actor: c.user.name, action: 'help.asked', target: subject, ip: c.ip });
      for (const to of teamRecipients())
        sendMail(
          to,
          'help-team',
          { company: org.name, name: c.user.name, subject, body: short(body, 1200), context: contextLabel, url: `${c.appUrl}/staff/questions?open=${id}` },
          { dev: c.dev },
        );
      return detail(getDb().prepare(`${LIST} WHERE t.id = ?`).get(id) as unknown as ThreadRow & { org_name: string });
    },
    201,
  ),

  route('GET', '/help/:id', (c) => detail(threadFor(c, c.params.id).t)),

  route('POST', '/help/:id/messages', (c) => {
    const { t, staff } = threadFor(c, c.params.id);
    const body = question(c);
    limit(`help-reply:${c.user.id}`, 60, 60 * 60_000);
    hit(`help-reply:${c.user.id}`, 60 * 60_000);
    const at = now();
    tx((d) => {
      addMessage(t.id, c.user, staff, body, at);
      d.prepare('UPDATE help_threads SET status = ?, answered_by = ?, updated_at = ? WHERE id = ?').run(
        staff ? 'answered' : 'open',
        staff ? c.user.name : t.answered_by,
        at,
        t.id,
      );
    });
    if (staff) {
      audit({ orgId: t.org_id, userId: c.user.id, actor: `${c.user.name} (Biomedix)`, action: 'help.answered', target: t.subject, ip: c.ip });
      sendMail(
        t.asker_email,
        'help-reply',
        { name: t.asker.split(' ')[0], engineer: c.user.name, subject: t.subject, body: short(body, 1200), url: `${c.appUrl}/app/help?open=${t.id}` },
        { dev: c.dev },
      );
    } else
      for (const to of teamRecipients())
        sendMail(
          to,
          'help-team',
          { company: t.org_name, name: c.user.name, subject: t.subject, body: short(body, 1200), context: t.context_label, url: `${c.appUrl}/staff/questions?open=${t.id}` },
          { dev: c.dev },
        );
    return detail(getDb().prepare(`${LIST} WHERE t.id = ?`).get(t.id) as unknown as ThreadRow & { org_name: string });
  }),

  route('PATCH', '/help/:id', (c) => {
    const { t } = threadFor(c, c.params.id);
    const status = str(c.body, 'status', { max: 10, required: true });
    if (status !== 'closed' && status !== 'open') throw new HttpError(400, 'status must be open or closed.');
    getDb().prepare('UPDATE help_threads SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), t.id);
    return detail(getDb().prepare(`${LIST} WHERE t.id = ?`).get(t.id) as unknown as ThreadRow & { org_name: string });
  }),

  route('GET', '/staff/help', (c) => {
    requireStaff(c.user, ['reviewer', 'admin'], c.dev);
    const state = c.query.get('state') ?? 'open';
    const where = state === 'all' ? '1' : state === 'answered' ? `t.status = 'answered'` : state === 'closed' ? `t.status = 'closed'` : `t.status = 'open'`;
    const rows = getDb()
      .prepare(`${LIST} WHERE ${where} ORDER BY CASE WHEN t.status = 'open' THEN t.updated_at END ASC, t.updated_at DESC LIMIT 200`)
      .all() as unknown as ThreadRow[];
    const counts = Object.fromEntries(
      (getDb().prepare('SELECT status, COUNT(*) AS n FROM help_threads GROUP BY status').all() as { status: string; n: number }[]).map((r) => [r.status, r.n]),
    );
    return { threads: rows.map(threadJson), counts };
  }),

  /** Everything waiting on Biomedix, for the staff home screen. */
  route('GET', '/staff/overview', (c) => {
    requireStaff(c.user, ['reviewer', 'admin'], c.dev);
    const d = getDb();
    const n = (sql: string, ...args: (string | number)[]) => (d.prepare(sql).get(...args) as { n: number }).n;
    const t = now();
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const orgNames = new Map((d.prepare('SELECT id, name FROM orgs').all() as { id: string; name: string }[]).map((o) => [o.id, o.name]));

    const states = docStates('r.kind IS NOT NULL', []);
    const inReview = states.filter((s) => s.state === 'in_review').sort((a, b) => (a.signed_at ?? '').localeCompare(b.signed_at ?? ''));
    const scans = d
      .prepare(
        `SELECT s.id, s.status, s.due_at, s.reviewer_name, q.company,
           (SELECT COUNT(*) FROM gap_findings g WHERE g.scan_id = s.id AND g.status = 'open') AS open_findings
         FROM gap_scans s JOIN inquiries q ON q.id = s.inquiry_id
         WHERE s.status IN ('received', 'in_review') ORDER BY s.due_at ASC LIMIT 5`,
      )
      .all() as { id: string; status: string; due_at: string | null; reviewer_name: string | null; company: string; open_findings: number }[];
    const requests = d
      .prepare(`SELECT id, name, company, wants_demo, created_at FROM inquiries WHERE status = 'new' ORDER BY created_at DESC LIMIT 5`)
      .all() as { id: string; name: string; company: string; wants_demo: number; created_at: string }[];
    const questions = d.prepare(`${LIST} WHERE t.status = 'open' ORDER BY t.updated_at ASC LIMIT 5`).all() as unknown as ThreadRow[];
    const admin = c.user.staffRole === 'admin';

    return {
      role: c.user.staffRole,
      queues: {
        reviews: inReview.length,
        scans: n(`SELECT COUNT(*) AS n FROM gap_scans WHERE status IN ('received', 'in_review')`),
        scansOverdue: n(`SELECT COUNT(*) AS n FROM gap_scans WHERE status IN ('received', 'in_review') AND due_at < ?`, t),
        requests: n(`SELECT COUNT(*) AS n FROM inquiries WHERE status = 'new'`),
        questions: n(`SELECT COUNT(*) AS n FROM help_threads WHERE status = 'open'`),
      },
      docs: countStates(states),
      totals: {
        orgs: n('SELECT COUNT(*) AS n FROM orgs'),
        users: n('SELECT COUNT(*) AS n FROM users'),
        projects: n('SELECT COUNT(*) AS n FROM projects'),
        newOrgs: n('SELECT COUNT(*) AS n FROM orgs WHERE created_at >= ?', weekAgo),
        newUsers: n('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', weekAgo),
        avgReadiness: Math.round((d.prepare('SELECT AVG(readiness) AS a FROM projects').get() as { a: number | null }).a ?? 0),
      },
      reviews: inReview.slice(0, 5).map((s) => ({
        projectId: s.project_id,
        docId: s.doc_id,
        title: s.title,
        orgName: orgNames.get(s.org_id) ?? '',
        device: s.device ?? '',
        at: s.signed_at ?? s.draft_at,
      })),
      scans: scans.map((s) => ({
        id: s.id,
        company: s.company,
        status: s.status,
        dueAt: s.due_at,
        overdue: !!s.due_at && s.due_at < t,
        reviewer: s.reviewer_name ?? '',
        openFindings: s.open_findings,
      })),
      requests: requests.map((r) => ({ id: r.id, name: r.name, company: r.company, wantsDemo: !!r.wants_demo, createdAt: r.created_at })),
      questions: questions.map(threadJson),
      // Company names and activity across customers are for admins only.
      companies: admin
        ? (
            d
              .prepare(
                `SELECT o.id, o.name, o.created_at,
                   (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) AS members,
                   (SELECT COUNT(*) FROM projects p WHERE p.org_id = o.id) AS projects,
                   (SELECT MAX(readiness) FROM projects p WHERE p.org_id = o.id) AS readiness
                 FROM orgs o ORDER BY o.created_at DESC LIMIT 6`,
              )
              .all() as { id: string; name: string; created_at: string; members: number; projects: number; readiness: number | null }[]
          ).map((o) => ({ id: o.id, name: o.name, createdAt: o.created_at, members: o.members, projects: o.projects, readiness: o.readiness ?? 0 }))
        : [],
      activity: admin
        ? (d.prepare('SELECT * FROM audit WHERE org_id IS NOT NULL ORDER BY id DESC LIMIT 8').all() as unknown as AuditRow[]).map((r) => ({
            ...auditJson(r, false),
            orgName: orgNames.get(r.org_id ?? '') ?? '',
          }))
        : [],
    };
  }),
];
