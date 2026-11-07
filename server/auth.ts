/**
 * Passwords are hashed with scrypt and a per-user salt. Sessions are random
 * 256-bit tokens in an HttpOnly cookie; only their SHA-256 is stored.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDb } from './db.ts';

const COOKIE = 'bx_session';
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
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

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

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

export function startSession(req: IncomingMessage, res: ServerResponse, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  getDb()
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha256(token), userId, now.toISOString(), expires.toISOString());
  setCookie(req, res, token, SESSION_DAYS * 86400);
}

function setCookie(req: IncomingMessage, res: ServerResponse, value: string, maxAge: number) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function endSession(req: IncomingMessage, res: ServerResponse) {
  const token = readCookie(req, COOKIE);
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setCookie(req, res, '', 0);
}

/** Signs out every other device, e.g. after a password change. */
export function endOtherSessions(req: IncomingMessage, userId: string) {
  const token = readCookie(req, COOKIE);
  getDb()
    .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
    .run(userId, token ? sha256(token) : '');
}

export function sessionUser(req: IncomingMessage): User | null {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at AS createdAt, s.expires_at AS expiresAt
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(sha256(token)) as (User & { expiresAt: string }) | undefined;
  if (!row) return null;
  if (row.expiresAt < new Date().toISOString()) {
    getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, createdAt: row.createdAt };
}

/* ---------- Brute-force protection: 10 failed sign-ins per email and per IP per 15 minutes ---------- */

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();

function recent(key: string) {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

export function tooManyFailures(ip: string, email: string) {
  return recent(`ip:${ip}`).length >= MAX_FAILURES * 3 || recent(`email:${email.toLowerCase()}`).length >= MAX_FAILURES;
}

export function recordFailure(ip: string, email: string) {
  for (const key of [`ip:${ip}`, `email:${email.toLowerCase()}`]) failures.set(key, [...recent(key), Date.now()]);
}

export function clearFailures(email: string) {
  failures.delete(`email:${email.toLowerCase()}`);
}
