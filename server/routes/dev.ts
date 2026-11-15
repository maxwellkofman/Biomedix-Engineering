/**
 * Development helpers, mounted only when the API runs in dev mode (the Vite dev
 * server, or BIOMEDIX_DEV=1): a mailbox showing every email the app sent, and a
 * switch to give your own account a Biomedix staff role for testing.
 */
import { randomUUID } from 'node:crypto';
import { EXAMPLE_INTAKE } from '../../src/intake/model.ts';
import { sessionPayload } from '../access.ts';
import { hashPassword, startSession } from '../auth.ts';
import { getDb, tx } from '../db.ts';
import { HttpError, now, open, route, str, type Route } from '../http.ts';

const DEMO = {
  user: { email: 'demo.user@biomedix.test', name: 'Dana Demo', staff: '' },
  admin: { email: 'demo.admin@biomedix.test', name: 'Alex Admin', staff: 'admin' },
} as const;

/** Creates the demo account on first use: a customer with the example device, or a Biomedix admin. */
async function demoUser(kind: keyof typeof DEMO): Promise<string> {
  const who = DEMO[kind];
  const existing = getDb().prepare('SELECT id FROM users WHERE email = ?').get(who.email) as { id: string } | undefined;
  if (existing) return existing.id;
  const hash = await hashPassword(randomUUID() + randomUUID());
  const id = randomUUID();
  const t = now();
  tx((d) => {
    d.prepare(
      'INSERT INTO users (id, email, name, password_hash, created_at, password_changed_at, email_verified_at, staff_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, who.email, who.name, hash, t, t, t, who.staff);
    if (kind === 'user') {
      const orgId = randomUUID();
      d.prepare('INSERT INTO orgs (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run(orgId, EXAMPLE_INTAKE.company.name, id, t);
      d.prepare(`INSERT INTO memberships (org_id, user_id, role, approver, created_at) VALUES (?, ?, 'owner', 1, ?)`).run(orgId, id, t);
      d.prepare(
        'INSERT INTO projects (id, org_id, created_by, intake, confirmed, readiness, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
      ).run(randomUUID(), orgId, id, JSON.stringify(EXAMPLE_INTAKE), '{}', t, t);
      const threadId = randomUUID();
      const q = 'Our patch talks to a phone app over Bluetooth, and the app talks to our cloud. Does that make the patch itself a cyber device, or only the app?';
      d.prepare(
        `INSERT INTO help_threads (id, org_id, user_id, asker, asker_email, subject, context, context_label, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, '/app/suite/SW-SOP-002', 'SW-SOP-002 Cybersecurity', 'open', ?, ?)`,
      ).run(threadId, orgId, id, who.name, who.email, q.slice(0, 89) + '…', t, t);
      d.prepare('INSERT INTO help_messages (id, thread_id, user_id, author, staff, body, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)').run(
        randomUUID(),
        threadId,
        id,
        who.name,
        q,
        t,
      );
    }
  });
  return id;
}

export const devRoutes: Route[] = [
  open('GET', '/dev/mail', () => ({
    messages: (
      getDb().prepare('SELECT * FROM outbox ORDER BY created_at DESC LIMIT 50').all() as Record<string, string | null>[]
    ).map((m) => ({ id: m.id, to: m.to_email, subject: m.subject, template: m.template, body: m.body ?? '', createdAt: m.created_at })),
  })),
  open('DELETE', '/dev/mail', () => {
    getDb().prepare('DELETE FROM outbox').run();
    return { ok: true };
  }),
  /** One-click sign-in to a demo customer or a demo Biomedix admin, so both sides can be shown without setup. */
  open('POST', '/dev/demo', async (c) => {
    const kind = str(c.body, 'as', { max: 10, required: true });
    if (kind !== 'user' && kind !== 'admin') throw new HttpError(400, 'as must be user or admin.');
    const id = await demoUser(kind);
    if (kind === 'admin') await demoUser('user');
    startSession(c.req, c.res, id, false);
    return sessionPayload(id);
  }),
  route('POST', '/dev/staff', (c) => {
    const role = str(c.body, 'staffRole', { max: 20 });
    if (!['', 'reviewer', 'admin'].includes(role)) throw new HttpError(400, 'Unknown staff role.');
    getDb().prepare('UPDATE users SET staff_role = ? WHERE id = ?').run(role, c.user.id);
    return { ok: true };
  }),
];
