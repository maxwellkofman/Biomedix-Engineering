/**
 * Development helpers, mounted only when the API runs in dev mode (the Vite dev
 * server, or BIOMEDIX_DEV=1): a mailbox showing every email the app sent, and a
 * switch to give your own account a Biomedix staff role for testing.
 */
import { getDb } from '../db.ts';
import { HttpError, open, route, str, type Route } from '../http.ts';

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
  route('POST', '/dev/staff', (c) => {
    const role = str(c.body, 'staffRole', { max: 20 });
    if (!['', 'reviewer', 'admin'].includes(role)) throw new HttpError(400, 'Unknown staff role.');
    getDb().prepare('UPDATE users SET staff_role = ? WHERE id = ?').run(role, c.user.id);
    return { ok: true };
  }),
];
