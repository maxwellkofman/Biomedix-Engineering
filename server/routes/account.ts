/** Personal settings: profile, sign-in email, password, two-factor authentication, sessions, deleting the account. */
import { ownerCount, sessionPayload } from '../access.ts';
import { audit, auditJson, type AuditRow } from '../audit.ts';
import {
  clearCookie,
  createToken,
  endOtherSessions,
  endSession,
  hashPassword,
  userRow,
  verifyPassword,
} from '../auth.ts';
import { getDb, tx } from '../db.ts';
import { email, HttpError, hit, limit, newPassword, now, password, route, str, type Ctx, type Route } from '../http.ts';
import { sendMail } from '../mail.ts';
import { hashRecovery, newRecoveryCodes, newSecret, otpauthUri, seal, unseal, verifyCode } from '../totp.ts';
import { checkSecondFactor } from './auth.ts';

const DAY = 86400_000;

/** Re-checks the password for sensitive changes. */
export async function reauth(c: Ctx, key = 'password') {
  limit(`reauth:${c.user.id}`, 10, 15 * 60_000, 'Too many password attempts. Wait 15 minutes and try again.');
  const row = userRow(c.user.id);
  if (!(await verifyPassword(password(c.body, key), row.password_hash))) {
    hit(`reauth:${c.user.id}`);
    throw new HttpError(403, 'Your password is incorrect.', 'bad_password');
  }
  return row;
}

function recoveryLeft(userId: string) {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').get(userId) as { n: number }).n;
}

function storeRecoveryCodes(userId: string) {
  const codes = newRecoveryCodes();
  tx((d) => {
    d.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
    const ins = d.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
    for (const code of codes) ins.run(userId, hashRecovery(code));
  });
  return codes;
}

/** "Chrome on macOS" from a user-agent string; good enough to recognise your own devices. */
function describeAgent(ua: string) {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /node|curl|undici/i.test(ua)
              ? 'Script'
              : 'Browser';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

const SECURITY_ACTIONS = [
  'sign_in',
  'sign_in.failed',
  'sign_out',
  'password.changed',
  'password.reset',
  'password.reset_requested',
  'mfa.enabled',
  'mfa.disabled',
  'mfa.recovery_regenerated',
  'email.changed',
  'email.verified',
  'sessions.revoked',
  'account.created',
];

export const accountRoutes: Route[] = [
  route('PATCH', '/account', (c) => {
    const name = str(c.body, 'name', { max: 120, required: true });
    getDb().prepare('UPDATE users SET name = ? WHERE id = ?').run(name, c.user.id);
    return sessionPayload(c.user.id);
  }),

  route('POST', '/account/email', async (c) => {
    const next = email(c.body, 'email');
    await reauth(c);
    if (next === c.user.email.toLowerCase()) throw new HttpError(400, 'That’s already your email.');
    if (getDb().prepare('SELECT 1 FROM users WHERE email = ?').get(next)) throw new HttpError(409, 'Another account already uses that email.');
    limit(`email-change:${c.user.id}`, 3, 60 * 60_000, 'You’ve asked a few times already. Try again in an hour.');
    hit(`email-change:${c.user.id}`, 60 * 60_000);
    const token = createToken(c.user.id, 'email-change', DAY, { email: next });
    sendMail(next, 'email-change', { name: c.user.name, email: next, url: `${c.appUrl}/confirm-email?token=${token}` }, c);
    return { ok: true, pending: next };
  }),

  route('POST', '/account/password', async (c) => {
    await reauth(c, 'current');
    const next = newPassword(c.body, 'next', c.user);
    getDb()
      .prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?')
      .run(await hashPassword(next), now(), c.user.id);
    endOtherSessions(c.user.id, c.sessionId);
    audit({ userId: c.user.id, actor: c.user.name, action: 'password.changed', ip: c.ip });
    sendMail(c.user.email, 'password-changed', { name: c.user.name, url: `${c.appUrl}/forgot-password` }, c);
    return { ok: true };
  }),

  route('GET', '/account/security', (c) => {
    const row = userRow(c.user.id);
    const marks = SECURITY_ACTIONS.map(() => '?').join(', ');
    const events = (
      getDb()
        .prepare(`SELECT * FROM audit WHERE user_id = ? AND org_id IS NULL AND action IN (${marks}) ORDER BY id DESC LIMIT 15`)
        .all(c.user.id, ...SECURITY_ACTIONS) as unknown as AuditRow[]
    ).map((r) => auditJson(r, true));
    return {
      mfaEnabled: !!row.totp_enabled_at,
      mfaEnabledAt: row.totp_enabled_at,
      recoveryCodesLeft: recoveryLeft(c.user.id),
      passwordChangedAt: row.password_changed_at ?? row.created_at,
      events,
    };
  }),

  /* ---------- Two-factor authentication ---------- */

  route('POST', '/account/mfa/setup', async (c) => {
    await reauth(c);
    if (c.user.mfaEnabled) throw new HttpError(409, 'Two-factor authentication is already on.');
    const secret = newSecret();
    getDb().prepare('UPDATE users SET totp_pending = ? WHERE id = ?').run(seal(secret), c.user.id);
    return { secret, uri: otpauthUri(secret, c.user.email) };
  }),

  route('POST', '/account/mfa/enable', (c) => {
    const code = str(c.body, 'code', { max: 12, required: true });
    const row = userRow(c.user.id);
    if (row.totp_enabled_at) throw new HttpError(409, 'Two-factor authentication is already on.');
    if (!row.totp_pending) throw new HttpError(409, 'Start setup again: the key expired.');
    limit(`mfa-enable:${c.user.id}`, 10, 15 * 60_000);
    const secret = unseal(row.totp_pending);
    const step = verifyCode(secret, code, 0);
    if (step === null) {
      hit(`mfa-enable:${c.user.id}`);
      throw new HttpError(400, 'That code didn’t match. Check your phone’s clock is set automatically, then try the newest code.');
    }
    getDb()
      .prepare('UPDATE users SET totp_secret = ?, totp_pending = NULL, totp_enabled_at = ?, totp_last_step = ? WHERE id = ?')
      .run(seal(secret), now(), step, c.user.id);
    const codes = storeRecoveryCodes(c.user.id);
    audit({ userId: c.user.id, actor: c.user.name, action: 'mfa.enabled', ip: c.ip });
    sendMail(c.user.email, 'mfa-changed', { name: c.user.name, state: 'turned on' }, c);
    return { codes, ...sessionPayload(c.user.id) };
  }),

  route('POST', '/account/mfa/disable', async (c) => {
    const row = await reauth(c);
    if (!row.totp_enabled_at) throw new HttpError(409, 'Two-factor authentication is already off.');
    const required = getDb()
      .prepare(`SELECT o.name FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? AND o.require_mfa = 1`)
      .all(c.user.id) as { name: string }[];
    if (required.length)
      throw new HttpError(409, `${required.map((r) => r.name).join(', ')} requires two-factor authentication, so it has to stay on.`);
    if (c.user.staffRole && (process.env.BIOMEDIX_STAFF_MFA ?? (c.dev ? 'optional' : 'required')) === 'required')
      throw new HttpError(409, 'Biomedix staff accounts need two-factor authentication, so it has to stay on.');
    if (!checkSecondFactor(row, str(c.body, 'code', { max: 20, required: true })))
      throw new HttpError(400, 'That code didn’t work. Use a code from your authenticator app or a recovery code.');
    getDb()
      .prepare('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, totp_last_step = 0 WHERE id = ?')
      .run(c.user.id);
    getDb().prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(c.user.id);
    audit({ userId: c.user.id, actor: c.user.name, action: 'mfa.disabled', ip: c.ip });
    sendMail(c.user.email, 'mfa-changed', { name: c.user.name, state: 'turned off' }, c);
    return sessionPayload(c.user.id);
  }),

  route('POST', '/account/mfa/recovery-codes', async (c) => {
    await reauth(c);
    if (!c.user.mfaEnabled) throw new HttpError(409, 'Turn on two-factor authentication first.');
    const codes = storeRecoveryCodes(c.user.id);
    audit({ userId: c.user.id, actor: c.user.name, action: 'mfa.recovery_regenerated', ip: c.ip });
    return { codes };
  }),

  /* ---------- Sessions ---------- */

  route('GET', '/account/sessions', (c) => ({
    sessions: (
      getDb()
        .prepare(
          `SELECT id, created_at, last_seen_at, expires_at, ip, user_agent, remember FROM sessions
           WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`,
        )
        .all(c.user.id, now()) as Record<string, string | number>[]
    ).map((s) => ({
      id: s.id,
      current: s.id === c.sessionId,
      device: describeAgent(String(s.user_agent)),
      ip: s.ip,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      expiresAt: s.expires_at,
      remember: !!s.remember,
    })),
  })),

  route('DELETE', '/account/sessions/:id', (c) => {
    const r = getDb().prepare('DELETE FROM sessions WHERE user_id = ? AND id = ?').run(c.user.id, c.params.id);
    if (!Number(r.changes)) throw new HttpError(404, 'That session already ended.');
    if (c.params.id === c.sessionId) clearCookie(c.req, c.res);
    audit({ userId: c.user.id, actor: c.user.name, action: 'sessions.revoked', detail: { count: 1 }, ip: c.ip });
    return { ok: true, current: c.params.id === c.sessionId };
  }),

  route('POST', '/account/sessions/revoke-others', (c) => {
    const { n } = getDb().prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND id IS NOT ?').get(c.user.id, c.sessionId) as { n: number };
    endOtherSessions(c.user.id, c.sessionId);
    audit({ userId: c.user.id, actor: c.user.name, action: 'sessions.revoked', detail: { count: n }, ip: c.ip });
    return { ok: true, count: n };
  }),

  /* ---------- Delete ---------- */

  route('DELETE', '/account', async (c) => {
    await reauth(c);
    const owned = getDb()
      .prepare(
        `SELECT o.id, o.name, (SELECT COUNT(*) FROM memberships x WHERE x.org_id = o.id) AS members
         FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? AND m.role = 'owner'`,
      )
      .all(c.user.id) as { id: string; name: string; members: number }[];
    const blocking = owned.filter((o) => o.members > 1 && ownerCount(o.id) === 1);
    if (blocking.length)
      throw new HttpError(
        409,
        `You’re the only owner of ${blocking.map((o) => o.name).join(', ')}. Make someone else an owner, or delete the company, first.`,
        'sole_owner',
      );
    const solo = owned.filter((o) => o.members === 1);
    const shared = getDb()
      .prepare(
        `SELECT m.org_id FROM memberships m WHERE m.user_id = ?
         AND (SELECT COUNT(*) FROM memberships x WHERE x.org_id = m.org_id) > 1`,
      )
      .all(c.user.id) as { org_id: string }[];
    endSession(c.req, c.res);
    tx((d) => {
      for (const o of solo) d.prepare('DELETE FROM orgs WHERE id = ?').run(o.id);
      d.prepare('DELETE FROM users WHERE id = ?').run(c.user.id);
    });
    for (const o of shared)
      audit({ orgId: o.org_id, actor: c.user.name, action: 'member.left', target: c.user.email, detail: { reason: 'account deleted' }, ip: c.ip });
    return { ok: true, deletedCompanies: solo.map((o) => o.name) };
  }),
];

