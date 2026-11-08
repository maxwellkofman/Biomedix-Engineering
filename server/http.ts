/** Request plumbing shared by the API routes: errors, input checks, JSON in and out, and a tiny router. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { User } from './auth.ts';

export type Json = Record<string, unknown>;

export class HttpError extends Error {
  status: number;
  /** Machine-readable reason the browser can act on, e.g. "mfa_required". */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface Ctx<U = User> {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Json;
  user: U;
  sessionId: string | null;
  ip: string;
  dev: boolean;
  /** Absolute origin for links in emails, e.g. https://app.biomedix.example */
  appUrl: string;
}

export type Handler<U = User> = (c: Ctx<U>) => unknown | Promise<unknown>;

export interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  auth: 'public' | 'user';
  status: number;
  handler: Handler<User | null>;
  /** The handler reads the request body itself (file uploads); see upload(). */
  raw?: boolean;
}

/** Returned by a handler that has already written its own response (file downloads). */
export const SENT = Symbol('sent');

function compile(pattern: string) {
  const keys: string[] = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/:(\w+)/g, (_, k: string) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '$',
  );
  return { re, keys };
}

/** A route that needs a signed-in user. */
export function route(method: string, pattern: string, handler: Handler<User>, status = 200): Route {
  return { method, ...compile(pattern), auth: 'user', status, handler: handler as Handler<User | null> };
}

/** A route anyone can call; `user` is set when a session is present. */
export function open(method: string, pattern: string, handler: Handler<User | null>, status = 200): Route {
  return { method, ...compile(pattern), auth: 'public', status, handler };
}

/**
 * A public PUT whose body is the file itself (Content-Type application/octet-stream),
 * read with readRaw(). PUT can't be sent cross-site without a CORS preflight.
 */
export function upload(pattern: string, handler: Handler<User | null>, status = 200): Route {
  return { method: 'PUT', ...compile(pattern), auth: 'public', status, handler, raw: true };
}

/* ---------- Input helpers ---------- */

export function str(body: Json, key: string, { max = 500, required = false, trim = true } = {}): string {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${key} is required.`);
    return '';
  }
  if (typeof v !== 'string') throw new HttpError(400, `${key} must be text.`);
  if (v.length > max) throw new HttpError(400, `${key} is too long.`);
  const out = trim ? v.trim() : v;
  if (required && !out) throw new HttpError(400, `${key} is required.`);
  return out;
}

export function bool(body: Json, key: string): boolean | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new HttpError(400, `${key} must be true or false.`);
  return v;
}

export function obj(body: Json, key: string, maxBytes = 200_000): Json | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, `${key} must be an object.`);
  if (JSON.stringify(v).length > maxBytes) throw new HttpError(400, `${key} is too large.`);
  return v as Json;
}

export function email(body: Json, key = 'email'): string {
  const e = str(body, key, { max: 254, required: true }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Enter a valid email address.');
  return e;
}

export function password(body: Json, key = 'password'): string {
  const v = body[key];
  if (typeof v !== 'string' || !v) throw new HttpError(400, 'Enter your password.');
  if (v.length > 256) throw new HttpError(400, 'Password is too long.');
  return v;
}

export const MIN_PASSWORD = 12;
const COMMON = new Set([
  'password1234',
  'password12345',
  'password123456',
  '123456789012',
  '1234567890123',
  'qwertyuiopas',
  'qwerty123456',
  'iloveyou1234',
  'letmein12345',
  'welcome12345',
  'administrator',
  'changeme1234',
  'passwordpassword',
  'aaaaaaaaaaaa',
]);

/** A new password: long enough, not a well-known one, not the person's email or name. */
export function newPassword(body: Json, key: string, who: { email: string; name?: string }): string {
  const v = password(body, key);
  if (v.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters.`);
  const lower = v.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(v)) throw new HttpError(400, 'That password is too easy to guess. Try a short sentence.');
  const local = who.email.split('@')[0].toLowerCase();
  if (lower === who.email.toLowerCase() || (local.length >= 4 && lower.includes(local)))
    throw new HttpError(400, 'Don’t use your email address in your password.');
  if (who.name && lower === who.name.toLowerCase().replace(/\s+/g, '')) throw new HttpError(400, 'Don’t use your name as your password.');
  return v;
}

export function clientIp(req: IncomingMessage) {
  return req.socket.remoteAddress ?? 'unknown';
}

export const now = () => new Date().toISOString();

/* ---------- JSON in and out ---------- */

const MAX_BODY = 6 * 1024 * 1024;

export function readBody(req: IncomingMessage): Promise<Json> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new HttpError(413, 'Request too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return ok({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        ok(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch {
        fail(new HttpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', fail);
  });
}

/** Reads a raw request body up to max bytes. */
export function readRaw(req: IncomingMessage, max: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? -1);
  if (declared > max) return Promise.reject(new HttpError(413, `Files can be up to ${Math.round(max / 1024 / 1024)} MB.`));
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        fail(new HttpError(413, `Files can be up to ${Math.round(max / 1024 / 1024)} MB.`));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

export function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}

/**
 * State-changing requests must come from this site. POST bodies must be JSON, which
 * a cross-site HTML form can't send; PUT, PATCH and DELETE can't be sent cross-site
 * at all without a CORS preflight, which this API never grants.
 */
export function checkOrigin(req: IncomingMessage, raw = false) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const type = req.headers['content-type'] ?? '';
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || !!req.headers['transfer-encoding'];
  if (raw) {
    if (req.method !== 'PUT' || !type.startsWith('application/octet-stream')) throw new HttpError(415, 'Send the file as application/octet-stream.');
  } else if ((req.method === 'POST' || hasBody) && !type.startsWith('application/json')) throw new HttpError(415, 'Send JSON.');
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      /* fall through to the mismatch error */
    }
    if (originHost !== host) throw new HttpError(403, 'Cross-site request refused.');
  }
}

/* ---------- Rate limits (in memory, per process) ---------- */

const hits = new Map<string, number[]>();

function recent(key: string, windowMs: number) {
  const t = Date.now();
  const list = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
  if (list.length) hits.set(key, list);
  else hits.delete(key);
  return list;
}

/** Counts attempts per key; throws 429 once `max` is reached inside the window. */
export function limit(key: string, max: number, windowMs: number, message = 'Too many attempts. Wait a few minutes and try again.') {
  if (recent(key, windowMs).length >= max) throw new HttpError(429, message);
}
export function hit(key: string, windowMs = 15 * 60_000) {
  hits.set(key, [...recent(key, windowMs), Date.now()]);
}
export function clearHits(key: string) {
  hits.delete(key);
}
