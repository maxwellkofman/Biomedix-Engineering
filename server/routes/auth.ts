/**
 * Signing up, in and out; email verification; password reset; invitations.
 *
 * Sign-in is one step, or two when the account has two-factor authentication:
 * the password returns a 5-minute ticket, and the ticket plus a code (or a
 * recovery code) starts the session.
 */
import { randomUUID } from 'node:crypto';
import { sessionPayload, ROLE_LABEL, type Role } from '../access.ts';
import { audit } from '../audit.ts';
import {
  countAttempt,
  createToken,
  dummyPasswordHash,
  endAllSessions,
  endSession,
  findToken,
  hashPassword,
  sha256,
  startSession,
  useToken,
  userRow,
  verifyPassword,
  type User,
  type UserRow,
} from '../auth.ts';
import { getDb, tx } from '../db.ts';
import { bool, clearHits, email, hit, HttpError, limit, newPassword, now, open, password, route, str, type Ctx, type Route } from '../http.ts';
import { mailConfigured, sendMail } from '../mail.ts';
import { hashRecovery, unseal, verifyCode } from '../totp.ts';

const MIN = 60_000;
const DAY = 86400_000;
const SIGN_IN_LIMIT = 'Too many sign-in attempts. Wait 15 minutes and try again.';

/** BIOMEDIX_ADMIN_EMAIL becomes a Biomedix admin once that address is verified. */
export function bootstrapAdmin(userId: string) {
  const admin = process.env.BIOMEDIX_ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin) return;
  getDb()
    .prepare(
      `UPDATE users SET staff_role = 'admin'
       WHERE id = ? AND lower(email) = ? AND email_verified_at IS NOT NULL AND staff_role = ''`,
    )
    .run(userId, admin);
}

export function sendVerification(c: Ctx<unknown>, u: { id: string; email: string; name: string }) {
  const token = createToken(u.id, 'verify', DAY, { email: u.email });
  sendMail(u.email, 'verify', { name: u.name, url: `${c.appUrl}/verify-email?token=${token}` }, c);
}

/** Checks a 6-digit code or a recovery code. Recovery codes work once. */
export function checkSecondFactor(u: UserRow, code: string): 'totp' | 'recovery' | null {
  if (!u.totp_secret || !u.totp_enabled_at) return null;
  const digits = code.replace(/\s/g, '');
  if (/^\d{6}$/.test(digits)) {
    const step = verifyCode(unseal(u.totp_secret), digits, u.totp_last_step);
    if (step === null) return null;
    getDb().prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, u.id);
    return 'totp';
  }
  const r = getDb()
    .prepare('UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
    .run(now(), u.id, hashRecovery(code));
  return Number(r.changes) ? 'recovery' : null;
}

interface InviteRow {
  id: string;
  org_id: string;
  email: string;
  role: Role;
  approver: number;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

function pendingInvite(token: string): InviteRow | null {
  if (!token || token.length > 100) return null;
  const row = getDb().prepare('SELECT * FROM invites WHERE token_hash = ?').get(sha256(token)) as InviteRow | undefined;
  if (!row || row.accepted_at || row.revoked_at || row.expires_at < now()) return null;
  return row;
}

const INVITE_GONE = 'This invitation has expired, was withdrawn or was already used. Ask the person who invited you for a new one.';

function joinOrg(user: User, invite: InviteRow, ip: string) {
  tx((d) => {
    const exists = d.prepare('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?').get(invite.org_id, user.id);
    if (!exists)
      d.prepare('INSERT INTO memberships (org_id, user_id, role, approver, created_at) VALUES (?, ?, ?, ?, ?)').run(
        invite.org_id,
        user.id,
        invite.role,
        invite.approver,
        now(),
      );
    d.prepare('UPDATE invites SET accepted_at = ? WHERE id = ?').run(now(), invite.id);
    // Opening the invitation link proves the address.
    d.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(now(), user.id);
  });
  audit({ orgId: invite.org_id, userId: user.id, actor: user.name, action: 'member.joined', target: user.email, detail: { role: invite.role, approver: !!invite.approver }, ip });
  bootstrapAdmin(user.id);
}

async function signUp(c: Ctx<User | null>) {
  const inviteToken = str(c.body, 'invite', { max: 100 });
  const invite = inviteToken ? pendingInvite(inviteToken) : null;
  if (inviteToken && !invite) throw new HttpError(410, INVITE_GONE, 'invite_gone');
  const e = invite ? invite.email.toLowerCase() : email(c.body);
  const name = str(c.body, 'name', { max: 120, required: true });
  const pw = newPassword(c.body, 'password', { email: e, name });
  const company = invite ? '' : str(c.body, 'company', { max: 120, required: true });
  if (c.body.acceptTerms !== true) throw new HttpError(400, 'Accept the terms of service to create an account.');
  limit(`signup:${c.ip}`, 10, 60 * MIN, 'Too many new accounts from this network. Try again in an hour.');
  if (getDb().prepare('SELECT 1 FROM users WHERE email = ?').get(e))
    throw new HttpError(409, 'An account with this email already exists. Sign in instead.', 'email_taken');
  hit(`signup:${c.ip}`, 60 * MIN);

  const hash = await hashPassword(pw);
  const id = randomUUID();
  const t = now();
  let orgId: string | null = null;
  tx((d) => {
    d.prepare(
      'INSERT INTO users (id, email, name, password_hash, created_at, password_changed_at, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, e, name, hash, t, t, invite ? t : null);
    if (!invite) {
      orgId = randomUUID();
      d.prepare('INSERT INTO orgs (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run(orgId, company, id, t);
      d.prepare(`INSERT INTO memberships (org_id, user_id, role, approver, created_at) VALUES (?, ?, 'owner', 1, ?)`).run(orgId, id, t);
    }
  });
  const user = sessionPayload(id).user;
  audit({ userId: id, actor: name, action: 'account.created', target: e, ip: c.ip });
  if (invite) joinOrg(user, invite, c.ip);
  else {
    audit({ orgId, userId: id, actor: name, action: 'org.created', target: company, ip: c.ip });
    sendVerification(c, user);
  }
  startSession(c.req, c.res, id, true);
  return { ...sessionPayload(id), joined: invite?.org_id ?? null };
}

async function signIn(c: Ctx<User | null>) {
  const e = email(c.body);
  const pw = password(c.body);
  const remember = bool(c.body, 'remember') ?? true;
  limit(`signin:ip:${c.ip}`, 30, 15 * MIN, SIGN_IN_LIMIT);
  limit(`signin:email:${e}`, 10, 15 * MIN, SIGN_IN_LIMIT);
  const row = getDb().prepare('SELECT * FROM users WHERE email = ?').get(e) as UserRow | undefined;
  const ok = await verifyPassword(pw, row?.password_hash ?? (await dummyPasswordHash()));
  if (!row || !ok) {
    hit(`signin:ip:${c.ip}`);
    hit(`signin:email:${e}`);
    if (row) audit({ userId: row.id, actor: row.name, action: 'sign_in.failed', detail: { reason: 'password' }, ip: c.ip });
    throw new HttpError(401, 'That email and password don’t match an account.');
  }
  clearHits(`signin:email:${e}`);
  if (row.totp_enabled_at) {
    const ticket = createToken(row.id, 'mfa', 5 * MIN, { remember });
    return { mfa: true, ticket };
  }
  startSession(c.req, c.res, row.id, remember);
  bootstrapAdmin(row.id);
  audit({ userId: row.id, actor: row.name, action: 'sign_in', detail: { method: 'password', remember }, ip: c.ip });
  return sessionPayload(row.id);
}

async function signInMfa(c: Ctx<User | null>) {
  const ticket = str(c.body, 'ticket', { max: 100, required: true });
  const code = str(c.body, 'code', { max: 20, required: true });
  const t = findToken(ticket, 'mfa');
  if (!t) throw new HttpError(401, 'Your sign-in timed out. Enter your password again.', 'mfa_expired');
  if (countAttempt(t) > 5) {
    useToken(t);
    throw new HttpError(429, 'Too many codes tried. Enter your password again.', 'mfa_expired');
  }
  const u = userRow(t.user_id);
  const method = checkSecondFactor(u, code);
  if (!method) {
    audit({ userId: u.id, actor: u.name, action: 'sign_in.failed', detail: { reason: 'code' }, ip: c.ip });
    throw new HttpError(401, 'That code didn’t work. Check the time on your phone and try the newest code.');
  }
  useToken(t);
  const { remember } = JSON.parse(t.data) as { remember?: boolean };
  startSession(c.req, c.res, u.id, remember ?? true);
  bootstrapAdmin(u.id);
  audit({ userId: u.id, actor: u.name, action: 'sign_in', detail: { method: method === 'totp' ? 'password + authenticator' : 'password + recovery code', remember }, ip: c.ip });
  const left = (getDb().prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').get(u.id) as { n: number }).n;
  return { ...sessionPayload(u.id), recoveryCodesLeft: method === 'recovery' ? left : undefined };
}

function verifyEmail(c: Ctx<User | null>) {
  const token = str(c.body, 'token', { max: 100, required: true });
  const t = findToken(token, 'verify');
  const u = t && userRow(t.user_id);
  if (!t || !u || (JSON.parse(t.data) as { email?: string }).email !== u.email)
    throw new HttpError(410, 'This link has expired or was already used. Sign in and send a new one.', 'link_invalid');
  useToken(t);
  getDb().prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(now(), u.id);
  bootstrapAdmin(u.id);
  audit({ userId: u.id, actor: u.name, action: 'email.verified', target: u.email, ip: c.ip });
  return { ok: true, email: u.email, signedIn: c.user?.id === u.id };
}

function resendVerification(c: Ctx) {
  if (c.user.emailVerified) return { ok: true, already: true };
  limit(`verify:${c.user.id}`, 3, 15 * MIN, 'We’ve sent a few already. Check your spam folder, or wait 15 minutes.');
  hit(`verify:${c.user.id}`);
  sendVerification(c, c.user);
  return { ok: true };
}

function forgotPassword(c: Ctx<User | null>) {
  const e = email(c.body);
  limit(`forgot:ip:${c.ip}`, 20, 15 * MIN);
  limit(`forgot:email:${e}`, 3, 15 * MIN, 'We’ve sent a few already. Check your spam folder, or wait 15 minutes.');
  hit(`forgot:ip:${c.ip}`);
  hit(`forgot:email:${e}`);
  const u = getDb().prepare('SELECT id, name, email FROM users WHERE email = ?').get(e) as { id: string; name: string; email: string } | undefined;
  if (u) {
    const token = createToken(u.id, 'reset', 60 * MIN);
    sendMail(u.email, 'reset', { name: u.name, url: `${c.appUrl}/reset-password?token=${token}` }, c);
    audit({ userId: u.id, actor: u.name, action: 'password.reset_requested', ip: c.ip });
  }
  // Same answer either way, so this can't be used to find out who has an account.
  return { ok: true };
}

function checkReset(c: Ctx<User | null>) {
  const t = findToken(str(c.body, 'token', { max: 100, required: true }), 'reset');
  if (!t) throw new HttpError(410, 'This reset link has expired or was already used. Ask for a new one.', 'link_invalid');
  return { email: userRow(t.user_id).email };
}

async function resetPassword(c: Ctx<User | null>) {
  const t = findToken(str(c.body, 'token', { max: 100, required: true }), 'reset');
  if (!t) throw new HttpError(410, 'This reset link has expired or was already used. Ask for a new one.', 'link_invalid');
  const u = userRow(t.user_id);
  const pw = newPassword(c.body, 'password', { email: u.email, name: u.name });
  const hash = await hashPassword(pw);
  useToken(t);
  getDb()
    .prepare('UPDATE users SET password_hash = ?, password_changed_at = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')
    .run(hash, now(), now(), u.id);
  getDb().prepare(`DELETE FROM tokens WHERE user_id = ? AND purpose = 'mfa'`).run(u.id);
  endAllSessions(u.id);
  clearHits(`signin:email:${u.email}`);
  audit({ userId: u.id, actor: u.name, action: 'password.reset', ip: c.ip });
  sendMail(u.email, 'password-changed', { name: u.name, url: `${c.appUrl}/forgot-password` }, c);
  return { ok: true, email: u.email };
}

function confirmEmailChange(c: Ctx<User | null>) {
  const t = findToken(str(c.body, 'token', { max: 100, required: true }), 'email-change');
  if (!t) throw new HttpError(410, 'This link has expired or was already used. Request the change again.', 'link_invalid');
  const u = userRow(t.user_id);
  const next = String((JSON.parse(t.data) as { email?: string }).email ?? '');
  if (!next) throw new HttpError(410, 'This link isn’t valid.', 'link_invalid');
  if (getDb().prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(next, u.id))
    throw new HttpError(409, 'Another account already uses that email.');
  useToken(t);
  getDb().prepare('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?').run(next, now(), u.id);
  audit({ userId: u.id, actor: u.name, action: 'email.changed', detail: { from: u.email, to: next }, ip: c.ip });
  sendMail(u.email, 'email-changed', { name: u.name, email: next }, c);
  return { ok: true, email: next };
}

function inviteInfo(c: Ctx<User | null>) {
  const invite = pendingInvite(str(c.body, 'token', { max: 100, required: true }));
  if (!invite) throw new HttpError(410, INVITE_GONE, 'invite_gone');
  const org = getDb().prepare('SELECT name FROM orgs WHERE id = ?').get(invite.org_id) as { name: string };
  const inviter = invite.invited_by
    ? (getDb().prepare('SELECT name FROM users WHERE id = ?').get(invite.invited_by) as { name: string } | undefined)?.name
    : undefined;
  return {
    orgName: org.name,
    inviter: inviter ?? 'Your colleague',
    email: invite.email,
    role: invite.role,
    roleLabel: ROLE_LABEL[invite.role],
    approver: !!invite.approver,
    expiresAt: invite.expires_at,
    accountExists: !!getDb().prepare('SELECT 1 FROM users WHERE email = ?').get(invite.email),
  };
}

function acceptInvite(c: Ctx) {
  const invite = pendingInvite(str(c.body, 'token', { max: 100, required: true }));
  if (!invite) throw new HttpError(410, INVITE_GONE, 'invite_gone');
  if (invite.email.toLowerCase() !== c.user.email.toLowerCase())
    throw new HttpError(403, `This invitation is for ${invite.email}. Sign in with that email to accept it.`, 'wrong_account');
  joinOrg(c.user, invite, c.ip);
  return { orgId: invite.org_id, ...sessionPayload(c.user.id) };
}

export const authRoutes: Route[] = [
  open('GET', '/auth/session', (c) => ({
    ...(c.user ? sessionPayload(c.user.id) : { user: null, orgs: [] }),
    dev: c.dev,
    mail: mailConfigured(),
  })),
  open('POST', '/auth/sign-up', signUp, 201),
  open('POST', '/auth/sign-in', signIn),
  open('POST', '/auth/sign-in/mfa', signInMfa),
  open('POST', '/auth/sign-out', (c) => {
    if (c.user) audit({ userId: c.user.id, actor: c.user.name, action: 'sign_out', ip: c.ip });
    endSession(c.req, c.res);
    return { ok: true };
  }),
  open('POST', '/auth/verify-email', verifyEmail),
  route('POST', '/auth/verify-email/resend', resendVerification),
  open('POST', '/auth/forgot-password', forgotPassword),
  open('POST', '/auth/reset-password/check', checkReset),
  open('POST', '/auth/reset-password', resetPassword),
  open('POST', '/auth/confirm-email-change', confirmEmailChange),
  open('POST', '/invites/lookup', inviteInfo),
  route('POST', '/invites/accept', acceptInvite),
];
