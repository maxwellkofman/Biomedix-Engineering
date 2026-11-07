/**
 * The Biomedix account API, mounted at /api. Written as a Connect-style
 * middleware so the Vite dev and preview servers and the production server
 * (server/start.ts) all run the same code.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { contentHash } from '../src/lib/hash.ts';
import {
  clearFailures,
  dummyPasswordHash,
  endOtherSessions,
  endSession,
  hashPassword,
  recordFailure,
  sessionUser,
  startSession,
  tooManyFailures,
  verifyPassword,
  type User,
} from './auth.ts';
import { getDb, tx } from './db.ts';

type Next = (err?: unknown) => void;
type Json = Record<string, unknown>;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  params: string[];
  body: Json;
  user: User;
}

type Handler = (c: Ctx) => unknown | Promise<unknown>;

const MAX_BODY = 6 * 1024 * 1024;
const MIN_PASSWORD = 12;
const now = () => new Date().toISOString();

/* ---------- Input helpers ---------- */

function str(body: Json, key: string, { max = 500, required = false, trim = true } = {}): string {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${key} is required.`);
    return '';
  }
  if (typeof v !== 'string') throw new HttpError(400, `${key} must be text.`);
  if (v.length > max) throw new HttpError(400, `${key} is too long.`);
  return trim ? v.trim() : v;
}

function obj(body: Json, key: string, maxBytes = 200_000): Json | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, `${key} must be an object.`);
  if (JSON.stringify(v).length > maxBytes) throw new HttpError(400, `${key} is too large.`);
  return v as Json;
}

function readiness(body: Json): number | undefined {
  const v = body.readiness;
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, 'readiness must be a number.');
  return Math.max(0, Math.min(100, Math.round(v)));
}

function email(body: Json): string {
  const e = str(body, 'email', { max: 254, required: true }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Enter a valid email address.');
  return e;
}

function password(body: Json, key = 'password'): string {
  const v = body[key];
  if (typeof v !== 'string' || !v) throw new HttpError(400, 'Password is required.');
  if (v.length > 256) throw new HttpError(400, 'Password is too long.');
  return v;
}

function newPassword(body: Json, key: string): string {
  const v = password(body, key);
  if (v.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters.`);
  return v;
}

function clientIp(req: IncomingMessage) {
  return req.socket.remoteAddress ?? 'unknown';
}

/* ---------- Data access ---------- */

const userJson = (u: User) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt });

interface ProjectRow {
  id: string;
  user_id: string;
  intake: string;
  confirmed: string;
  readiness: number;
  created_at: string;
  updated_at: string;
}

function ownProject(user: User, id: string): ProjectRow {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, user.id) as
    | ProjectRow
    | undefined;
  if (!row) throw new HttpError(404, 'Project not found.');
  return row;
}

function latestDrafts(projectId: string) {
  const rows = getDb()
    .prepare(
      `SELECT doc_id, draft, run_number, hash, filled_pct, created_at FROM drafts d
       WHERE project_id = ? AND draft = (SELECT MAX(draft) FROM drafts WHERE project_id = d.project_id AND doc_id = d.doc_id)`,
    )
    .all(projectId) as { doc_id: string; draft: number; run_number: number; hash: string; filled_pct: number; created_at: string }[];
  return Object.fromEntries(
    rows.map((r) => [
      r.doc_id,
      { draft: r.draft, runNumber: r.run_number, hash: r.hash, filledPct: r.filled_pct, createdAt: r.created_at },
    ]),
  );
}

function signoffs(projectId: string) {
  return (
    getDb()
      .prepare('SELECT * FROM signoffs WHERE project_id = ? ORDER BY created_at, rowid')
      .all(projectId) as Record<string, string | number>[]
  ).map((r) => ({
    id: r.id,
    docId: r.doc_id,
    draft: r.draft,
    kind: r.kind,
    signer: r.signer,
    note: r.note,
    method: r.method,
    reference: r.reference,
    createdAt: r.created_at,
  }));
}

function runList(projectId: string, withIntake: boolean) {
  return (
    getDb()
      .prepare(`SELECT * FROM runs WHERE project_id = ? ORDER BY number DESC`)
      .all(projectId) as Record<string, string | number>[]
  ).map((r) => ({
    number: r.number,
    createdAt: r.created_at,
    createdBy: r.created_by,
    note: r.note,
    summary: JSON.parse(String(r.summary)),
    ...(withIntake ? { intake: JSON.parse(String(r.intake)) } : {}),
  }));
}

function projectPayload(row: ProjectRow) {
  return {
    project: {
      id: row.id,
      intake: JSON.parse(row.intake),
      confirmed: JSON.parse(row.confirmed),
      readiness: row.readiness,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    drafts: latestDrafts(row.id),
    signoffs: signoffs(row.id),
    runs: runList(row.id, false),
  };
}

/* ---------- Handlers ---------- */

async function signUp({ req, res, body }: Omit<Ctx, 'user'>) {
  const e = email(body);
  const name = str(body, 'name', { max: 120, required: true });
  const pw = newPassword(body, 'password');
  const exists = getDb().prepare('SELECT 1 FROM users WHERE email = ?').get(e);
  if (exists) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  const user: User = { id: randomUUID(), email: e, name, createdAt: now() };
  const hash = await hashPassword(pw);
  getDb()
    .prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, user.email, user.name, hash, user.createdAt);
  startSession(req, res, user.id);
  return { user: userJson(user) };
}

async function signIn({ req, res, body }: Omit<Ctx, 'user'>) {
  const e = email(body);
  const pw = password(body);
  const ip = clientIp(req);
  if (tooManyFailures(ip, e)) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');
  const row = getDb()
    .prepare('SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?')
    .get(e) as { id: string; email: string; name: string; password_hash: string; created_at: string } | undefined;
  const ok = await verifyPassword(pw, row?.password_hash ?? (await dummyPasswordHash()));
  if (!row || !ok) {
    recordFailure(ip, e);
    throw new HttpError(401, 'That email and password don’t match an account.');
  }
  clearFailures(e);
  startSession(req, res, row.id);
  return { user: userJson({ id: row.id, email: row.email, name: row.name, createdAt: row.created_at }) };
}

const authed: [method: string, path: RegExp, handler: Handler][] = [
  ['POST', /^\/auth\/sign-out$/, ({ req, res }) => (endSession(req, res), { ok: true })],

  [
    'PATCH',
    /^\/account$/,
    ({ body, user }) => {
      const name = str(body, 'name', { max: 120, required: true });
      getDb().prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);
      return { user: userJson({ ...user, name }) };
    },
  ],
  [
    'POST',
    /^\/account\/password$/,
    async ({ req, body, user }) => {
      const current = password(body, 'current');
      const next = newPassword(body, 'next');
      const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string };
      if (!(await verifyPassword(current, row.password_hash))) throw new HttpError(403, 'Your current password is incorrect.');
      getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), user.id);
      endOtherSessions(req, user.id);
      return { ok: true };
    },
  ],
  [
    'DELETE',
    /^\/account$/,
    async ({ req, res, body, user }) => {
      const pw = password(body);
      const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string };
      if (!(await verifyPassword(pw, row.password_hash))) throw new HttpError(403, 'Your password is incorrect.');
      endSession(req, res);
      getDb().prepare('DELETE FROM users WHERE id = ?').run(user.id);
      return { ok: true };
    },
  ],

  [
    'GET',
    /^\/projects$/,
    ({ user }) => ({
      projects: (
        getDb()
          .prepare(
            `SELECT p.id, p.readiness, p.created_at, p.updated_at,
               json_extract(p.intake, '$.company.name') AS company,
               json_extract(p.intake, '$.device.name') AS device,
               (SELECT COUNT(*) FROM runs r WHERE r.project_id = p.id) AS runs,
               (SELECT MAX(created_at) FROM runs r WHERE r.project_id = p.id) AS last_run
             FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`,
          )
          .all(user.id) as Record<string, string | number | null>[]
      ).map((r) => ({
        id: r.id,
        company: r.company ?? '',
        device: r.device ?? '',
        readiness: r.readiness,
        runs: r.runs,
        lastRunAt: r.last_run,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    }),
  ],
  [
    'POST',
    /^\/projects$/,
    ({ body, user }) => {
      const count = getDb().prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').get(user.id) as { n: number };
      if (count.n >= 50) throw new HttpError(400, 'You can have up to 50 projects.');
      const id = randomUUID();
      const t = now();
      getDb()
        .prepare(
          'INSERT INTO projects (id, user_id, intake, confirmed, readiness, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          user.id,
          JSON.stringify(obj(body, 'intake') ?? {}),
          JSON.stringify(obj(body, 'confirmed') ?? {}),
          readiness(body) ?? 0,
          t,
          t,
        );
      return projectPayload(ownProject(user, id));
    },
  ],
  ['GET', /^\/projects\/([\w-]+)$/, ({ params, user }) => projectPayload(ownProject(user, params[0]))],
  [
    'PUT',
    /^\/projects\/([\w-]+)$/,
    ({ params, body, user }) => {
      const row = ownProject(user, params[0]);
      const intake = obj(body, 'intake');
      const confirmed = obj(body, 'confirmed');
      const r = readiness(body);
      const t = now();
      getDb()
        .prepare('UPDATE projects SET intake = ?, confirmed = ?, readiness = ?, updated_at = ? WHERE id = ?')
        .run(
          intake ? JSON.stringify(intake) : row.intake,
          confirmed ? JSON.stringify(confirmed) : row.confirmed,
          r ?? row.readiness,
          t,
          row.id,
        );
      return { updatedAt: t };
    },
  ],
  [
    'DELETE',
    /^\/projects\/([\w-]+)$/,
    ({ params, user }) => {
      const row = ownProject(user, params[0]);
      getDb().prepare('DELETE FROM projects WHERE id = ?').run(row.id);
      return { ok: true };
    },
  ],

  ['GET', /^\/projects\/([\w-]+)\/runs$/, ({ params, user }) => ({ runs: runList(ownProject(user, params[0]).id, true) })],
  [
    'POST',
    /^\/projects\/([\w-]+)\/runs$/,
    ({ params, body, user }) => {
      const row = ownProject(user, params[0]);
      const intake = obj(body, 'intake');
      if (!intake) throw new HttpError(400, 'intake is required.');
      const confirmed = obj(body, 'confirmed');
      const score = readiness(body) ?? 0;
      const note = str(body, 'note', { max: 500 });
      const docs = body.docs;
      if (!Array.isArray(docs) || docs.length > 80) throw new HttpError(400, 'docs must be a list of documents.');
      const parsed = docs.map((d: Json) => ({
        id: str(d, 'id', { max: 40, required: true }),
        title: str(d, 'title', { max: 200, required: true }),
        // Stored exactly as sent: the browser hashes the same text to tell whether a document changed.
        markdown: str(d, 'markdown', { max: 400_000, required: true, trim: false }),
        filledPct: Math.max(0, Math.min(100, Math.round(Number(d.filledPct) || 0))),
      }));
      if (new Set(parsed.map((d) => d.id)).size !== parsed.length) throw new HttpError(400, 'Duplicate document ids.');

      const run = tx((db) => {
        const t = now();
        const { n } = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM runs WHERE project_id = ?').get(row.id) as {
          n: number;
        };
        const before = latestDrafts(row.id);
        const insert = db.prepare(
          `INSERT INTO drafts (project_id, doc_id, draft, run_number, title, hash, sha256, filled_pct, markdown, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const changes = parsed.map((d) => {
          const prev = before[d.id];
          const hash = contentHash(d.markdown);
          if (prev && prev.hash === hash) return { id: d.id, title: d.title, draft: prev.draft, change: 'same' };
          const draft = (prev?.draft ?? 0) + 1;
          const sha = createHash('sha256').update(d.markdown).digest('hex');
          insert.run(row.id, d.id, draft, n, d.title, hash, sha, d.filledPct, d.markdown, t);
          return { id: d.id, title: d.title, draft, change: prev ? 'revised' : 'new' };
        });
        const included = new Set(parsed.map((d) => d.id));
        const dropped = Object.keys(before).filter((id) => !included.has(id));
        const summary = {
          readiness: score,
          docs: changes,
          dropped,
          counts: {
            new: changes.filter((c) => c.change === 'new').length,
            revised: changes.filter((c) => c.change === 'revised').length,
            same: changes.filter((c) => c.change === 'same').length,
            dropped: dropped.length,
          },
        };
        db.prepare(
          'INSERT INTO runs (project_id, number, created_at, created_by, note, intake, summary) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(row.id, n, t, user.name, note, JSON.stringify(intake), JSON.stringify(summary));
        db.prepare('UPDATE projects SET intake = ?, confirmed = ?, readiness = ?, updated_at = ? WHERE id = ?').run(
          JSON.stringify(intake),
          confirmed ? JSON.stringify(confirmed) : row.confirmed,
          score,
          t,
          row.id,
        );
        return { number: n, createdAt: t, createdBy: user.name, note, summary };
      });
      return { run, drafts: latestDrafts(row.id) };
    },
  ],

  [
    'GET',
    /^\/projects\/([\w-]+)\/docs\/([^/]+)\/drafts$/,
    ({ params, user }) => {
      const row = ownProject(user, params[0]);
      const docId = decodeURIComponent(params[1]);
      const drafts = (
        getDb()
          .prepare(
            `SELECT draft, run_number, title, hash, sha256, filled_pct, markdown, created_at FROM drafts
             WHERE project_id = ? AND doc_id = ? ORDER BY draft DESC`,
          )
          .all(row.id, docId) as Record<string, string | number>[]
      ).map((r) => ({
        draft: r.draft,
        runNumber: r.run_number,
        title: r.title,
        hash: r.hash,
        sha256: r.sha256,
        filledPct: r.filled_pct,
        markdown: r.markdown,
        createdAt: r.created_at,
      }));
      return { drafts };
    },
  ],

  [
    'POST',
    /^\/projects\/([\w-]+)\/signoffs$/,
    ({ params, body, user }) => {
      const row = ownProject(user, params[0]);
      const docId = str(body, 'docId', { max: 40, required: true });
      const draft = Number(body.draft);
      const kind = str(body, 'kind', { max: 10, required: true });
      if (!['submit', 'review', 'return', 'approve'].includes(kind)) throw new HttpError(400, 'Unknown sign-off.');
      const note = str(body, 'note', { max: 4000 });
      const method = str(body, 'method', { max: 200 });
      const reference = str(body, 'reference', { max: 200 });
      let signer = str(body, 'signer', { max: 200 });

      return tx((db) => {
        const latest = db
          .prepare('SELECT MAX(draft) AS d FROM drafts WHERE project_id = ? AND doc_id = ?')
          .get(row.id, docId) as { d: number | null };
        if (!latest.d) throw new HttpError(409, 'Save a run first: this document has no saved draft.');
        if (draft !== latest.d) throw new HttpError(409, `Draft ${draft} was superseded by draft ${latest.d}.`);
        const last = db
          .prepare(
            'SELECT kind FROM signoffs WHERE project_id = ? AND doc_id = ? AND draft = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
          )
          .get(row.id, docId, draft) as { kind: string } | undefined;
        const state = last?.kind;
        const allowed: Record<string, (string | undefined)[]> = {
          submit: [undefined, 'return'],
          review: ['submit'],
          return: ['submit'],
          approve: ['review'],
        };
        if (!allowed[kind].includes(state)) {
          const why: Record<string, string> = {
            submit: 'This draft is already in review or signed.',
            review: 'Only a draft waiting on technical review can be signed.',
            return: 'Only a draft waiting on technical review can be returned.',
            approve: 'Approval needs a signed technical review on this draft.',
          };
          throw new HttpError(409, why[kind]);
        }
        if (kind === 'return' && !note) throw new HttpError(400, 'Say what needs to change.');
        if (kind === 'approve' && !signer) throw new HttpError(400, 'Name the approver.');
        if (!signer) signer = user.name;
        db.prepare(
          `INSERT INTO signoffs (id, project_id, doc_id, draft, kind, user_id, signer, note, method, reference, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(randomUUID(), row.id, docId, draft, kind, user.id, signer, note, method, reference, now());
        db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), row.id);
        return { signoffs: signoffs(row.id) };
      });
    },
  ],
];

/* ---------- Plumbing ---------- */

function readBody(req: IncomingMessage): Promise<Json> {
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

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}

/** State-changing requests must be JSON from this site (blocks cross-site form posts). */
function checkOrigin(req: IncomingMessage) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Send JSON.');
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

export function apiMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return next();
    const path = url.pathname.slice(4) || '/';
    try {
      checkOrigin(req);
      const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);

      if (req.method === 'GET' && path === '/auth/session') {
        const user = sessionUser(req);
        return send(res, 200, { user: user ? userJson(user) : null });
      }
      if (req.method === 'POST' && path === '/auth/sign-up') return send(res, 201, await signUp({ req, res, params: [], body }));
      if (req.method === 'POST' && path === '/auth/sign-in') return send(res, 200, await signIn({ req, res, params: [], body }));

      for (const [method, re, handler] of authed) {
        const m = path.match(re);
        if (!m) continue;
        if (method !== req.method) continue;
        const user = sessionUser(req);
        if (!user) throw new HttpError(401, 'Sign in to continue.');
        return send(res, 200, await handler({ req, res, params: m.slice(1), body, user }));
      }
      throw new HttpError(404, 'Not found.');
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error('[api]', err);
      return send(res, 500, { error: 'Something went wrong on our side. Try again.' });
    }
  };
}
