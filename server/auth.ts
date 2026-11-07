/**
 * Passwords are hashed with scrypt and a per-user salt. Sessions are random
 * 256-bit tokens in an HttpOnly cookie; only their SHA-256 is stored. One-time
 * links (email verification, password reset, invites) work the same way.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDb } from './db.ts';

const COOKIE = 'bx_session';
const REMEMBER_DAYS = 30;
const SHORT_HOURS = 12;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export type StaffRole = '' | 'reviewer' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  staffRole: StaffRole;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
  email_verified_at: string | null;
  staff_role: string;
  totp_secret: string | null;
  totp_pending: string | null;
  totp_enabled_at: string | null;
  totp_last_step: number;
  password_changed_at: string | null;
}

export function toUser(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    createdAt: r.created_at,
    emailVerified: !!r.email_verified_at,
    mfaEnabled: !!r.totp_enabled_at,
    staffRole: (['reviewer', 'admin'].includes(r.staff_role) ? r.staff_role : '') as StaffRole,
  };
}

export function userRow(id: string): UserRow {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
}

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((ok, fail) => scrypt(password, salt, keylen, opts, (err, key) => (err ? fail(err) : ok(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scryptAsync(password, salt, keylen, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(key, expected);
}

/** A fixed hash to compare against when the email is unknown, so timing doesn't reveal which emails exist. */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash() {
  return (dummyHash ??= hashPassword(randomBytes(12).toString('hex')));
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

function isHttps(req: IncomingMessage) {
  const proto = req.headers['x-forwarded-proto'];
  return (typeof proto === 'string' && proto.split(',')[0].trim() === 'https') || 'encrypted' in req.socket;
}

/* ---------- Sessions ---------- */

/** remember: 30 days and a persistent cookie; otherwise 12 hours and a cookie that ends with the browser. */
export function startSession(req: IncomingMessage, res: ServerResponse, userId: string, remember = true) {
  const token = randomBytes(32).toString('base64url');
  const t = new Date();
  const expires = new Date(t.getTime() + (remember ? REMEMBER_DAYS * 86400_000 : SHORT_HOURS * 3600_000));
  const ua = String(req.headers['user-agent'] ?? '').slice(0, 300);
  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, id, user_id, created_at, expires_at, last_seen_at, ip, user_agent, remember)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sha256(token),
      randomBytes(9).toString('base64url'),
      userId,
      t.toISOString(),
      expires.toISOString(),
      t.toISOString(),
      req.socket.remoteAddress ?? '',
      ua,
      remember ? 1 : 0,
    );
  setCookie(req, res, token, remember ? REMEMBER_DAYS * 86400 : null);
}

function setCookie(req: IncomingMessage, res: ServerResponse, value: string, maxAge: number | null) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`);
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearCookie(req: IncomingMessage, res: ServerResponse) {
  setCookie(req, res, '', 0);
}

export function endSession(req: IncomingMessage, res: ServerResponse) {
  const token = readCookie(req, COOKIE);
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  clearCookie(req, res);
}

/** Signs out every other device, e.g. after a password change. */
export function endOtherSessions(userId: string, keepSessionId: string | null) {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?').run(userId, keepSessionId);
}

export function endAllSessions(userId: string) {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** The signed-in user and their session id, or null. Refreshes last_seen_at at most every 5 minutes. */
export function sessionUser(req: IncomingMessage): { user: User; sessionId: string } | null {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const hash = sha256(token);
  const row = getDb()
    .prepare(
      `SELECT u.*, s.id AS session_id, s.expires_at AS session_expires, s.last_seen_at AS session_seen
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(hash) as (UserRow & { session_id: string; session_expires: string; session_seen: string | null }) | undefined;
  if (!row) return null;
  const t = new Date();
  if (row.session_expires < t.toISOString()) {
    getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
    return null;
  }
  if (!row.session_seen || t.getTime() - new Date(row.session_seen).getTime() > 5 * 60_000) {
    getDb()
      .prepare('UPDATE sessions SET last_seen_at = ?, ip = ? WHERE token_hash = ?')
      .run(t.toISOString(), req.socket.remoteAddress ?? '', hash);
  }
  return { user: toUser(row), sessionId: row.session_id };
}

/* ---------- One-time tokens: email verification, password reset, email change, sign-in second step ---------- */

export type TokenPurpose = 'verify' | 'reset' | 'email-change' | 'mfa';

export interface TokenRow {
  token_hash: string;
  user_id: string;
  purpose: TokenPurpose;
  data: string;
  attempts: number;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

/** Creates a single-use token and returns the raw value (only its hash is stored). Earlier unused tokens for the same purpose stop working. */
export function createToken(userId: string, purpose: TokenPurpose, ttlMs: number, data: Record<string, unknown> = {}) {
  const token = randomBytes(32).toString('base64url');
  const t = new Date();
  const d = getDb();
  d.prepare('DELETE FROM tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL').run(userId, purpose);
  d.prepare(
    'INSERT INTO tokens (token_hash, user_id, purpose, data, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(sha256(token), userId, purpose, JSON.stringify(data), t.toISOString(), new Date(t.getTime() + ttlMs).toISOString());
  return token;
}

/** A usable token (unexpired, unused), without using it up. */
export function findToken(token: string, purpose: TokenPurpose): TokenRow | null {
  if (!token || token.length > 100) return null;
  const row = getDb()
    .prepare('SELECT * FROM tokens WHERE token_hash = ? AND purpose = ?')
    .get(sha256(token), purpose) as TokenRow | undefined;
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) return null;
  return row;
}

export function useToken(row: TokenRow) {
  getDb().prepare('UPDATE tokens SET used_at = ? WHERE token_hash = ?').run(new Date().toISOString(), row.token_hash);
}

export function countAttempt(row: TokenRow) {
  getDb().prepare('UPDATE tokens SET attempts = attempts + 1 WHERE token_hash = ?').run(row.token_hash);
  return row.attempts + 1;
}

/** Drops expired and used tokens and sessions; cheap enough to run on startup and now and then. */
export function sweep() {
  const t = new Date().toISOString();
  const d = getDb();
  d.prepare('DELETE FROM sessions WHERE expires_at < ?').run(t);
  d.prepare('DELETE FROM tokens WHERE expires_at < ? OR used_at IS NOT NULL').run(t);
}
