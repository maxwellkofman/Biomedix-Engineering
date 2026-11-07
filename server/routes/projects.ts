/**
 * Projects (one per device), runs, drafts and the customer's sign-offs.
 * A project belongs to a company; access follows the person's role there.
 * Runs, drafts and sign-offs are append-only.
 */
import { createHash, randomUUID } from 'node:crypto';
import { contentHash } from '../../src/lib/hash.ts';
import { approverNames, projectAccess, requireVerified, type ProjectRow } from '../access.ts';
import { audit } from '../audit.ts';
import { getDb, tx } from '../db.ts';
import { HttpError, now, obj, route, str, type Ctx, type Json, type Route } from '../http.ts';
import { reauth } from './account.ts';

function readiness(body: Json): number | undefined {
  const v = body.readiness;
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, 'readiness must be a number.');
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function latestDrafts(projectId: string) {
  const rows = getDb()
    .prepare(
      `SELECT doc_id, draft, run_number, hash, filled_pct, created_at FROM drafts d
       WHERE project_id = ? AND draft = (SELECT MAX(draft) FROM drafts WHERE project_id = d.project_id AND doc_id = d.doc_id)`,
    )
    .all(projectId) as { doc_id: string; draft: number; run_number: number; hash: string; filled_pct: number; created_at: string }[];
  return Object.fromEntries(
    rows.map((r) => [r.doc_id, { draft: r.draft, runNumber: r.run_number, hash: r.hash, filledPct: r.filled_pct, createdAt: r.created_at }]),
  );
}

export function signoffs(projectId: string, docId?: string) {
  return (
    getDb()
      .prepare(`SELECT * FROM signoffs WHERE project_id = ? ${docId ? 'AND doc_id = ?' : ''} ORDER BY created_at, rowid`)
      .all(...(docId ? [projectId, docId] : [projectId])) as Record<string, string | number>[]
  ).map((r) => ({
    id: r.id,
    docId: r.doc_id,
    draft: r.draft,
    kind: r.kind,
    signer: r.signer,
    signerEmail: r.signer_email,
    note: r.note,
    method: r.method,
    reference: r.reference,
    createdAt: r.created_at,
  }));
}

function runList(projectId: string, withIntake: boolean) {
  return (
    getDb().prepare(`SELECT * FROM runs WHERE project_id = ? ORDER BY number DESC`).all(projectId) as Record<string, string | number>[]
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
      orgId: row.org_id,
      intake: JSON.parse(row.intake),
      confirmed: JSON.parse(row.confirmed),
      readiness: row.readiness,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    drafts: latestDrafts(row.id),
    signoffs: signoffs(row.id),
    runs: runList(row.id, false),
    approvers: approverNames(row.org_id),
  };
}

export function projectList(orgId: string) {
  return (
    getDb()
      .prepare(
        `SELECT p.id, p.readiness, p.created_at, p.updated_at,
           json_extract(p.intake, '$.company.name') AS company,
           json_extract(p.intake, '$.device.name') AS device,
           (SELECT COUNT(*) FROM runs r WHERE r.project_id = p.id) AS runs,
           (SELECT MAX(created_at) FROM runs r WHERE r.project_id = p.id) AS last_run,
           (SELECT name FROM users u WHERE u.id = p.created_by) AS creator
         FROM projects p WHERE p.org_id = ? ORDER BY p.updated_at DESC`,
      )
      .all(orgId) as Record<string, string | number | null>[]
  ).map((r) => ({
    id: String(r.id),
    company: r.company ?? '',
    device: r.device ?? '',
    readiness: r.readiness,
    runs: r.runs,
    lastRunAt: r.last_run,
    createdBy: r.creator ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

const label = (intake: Json | undefined) => {
  const ix = (intake ?? {}) as { device?: { name?: string }; company?: { name?: string } };
  return ix.device?.name || ix.company?.name || 'Untitled project';
};

export function createProject(c: Ctx, orgId: string) {
  const { n } = getDb().prepare('SELECT COUNT(*) AS n FROM projects WHERE org_id = ?').get(orgId) as { n: number };
  if (n >= 100) throw new HttpError(400, 'A company can have up to 100 projects.');
  const id = randomUUID();
  const t = now();
  const intake = obj(c.body, 'intake') ?? {};
  getDb()
    .prepare(
      'INSERT INTO projects (id, org_id, created_by, intake, confirmed, readiness, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, orgId, c.user.id, JSON.stringify(intake), JSON.stringify(obj(c.body, 'confirmed') ?? {}), readiness(c.body) ?? 0, t, t);
  audit({ orgId, userId: c.user.id, actor: c.user.name, action: 'project.created', target: label(intake), ip: c.ip });
  return projectPayload(getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as ProjectRow);
}

export const projectRoutes: Route[] = [
  route('GET', '/projects/:id', (c) => projectPayload(projectAccess(c.user, c.params.id, 'view').row)),

  route('PUT', '/projects/:id', (c) => {
    const { row } = projectAccess(c.user, c.params.id, 'edit');
    const intake = obj(c.body, 'intake');
    const confirmed = obj(c.body, 'confirmed');
    const r = readiness(c.body);
    const t = now();
    getDb()
      .prepare('UPDATE projects SET intake = ?, confirmed = ?, readiness = ?, updated_at = ? WHERE id = ?')
      .run(intake ? JSON.stringify(intake) : row.intake, confirmed ? JSON.stringify(confirmed) : row.confirmed, r ?? row.readiness, t, row.id);
    return { updatedAt: t };
  }),

  route('DELETE', '/projects/:id', (c) => {
    const { row } = projectAccess(c.user, c.params.id, 'manage');
    getDb().prepare('DELETE FROM projects WHERE id = ?').run(row.id);
    audit({ orgId: row.org_id, userId: c.user.id, actor: c.user.name, action: 'project.deleted', target: label(JSON.parse(row.intake)), ip: c.ip });
    return { ok: true };
  }),

  route('GET', '/projects/:id/runs', (c) => ({ runs: runList(projectAccess(c.user, c.params.id, 'view').row.id, true) })),

  route('POST', '/projects/:id/runs', (c) => {
    const { row } = projectAccess(c.user, c.params.id, 'edit');
    const intake = obj(c.body, 'intake');
    if (!intake) throw new HttpError(400, 'intake is required.');
    const confirmed = obj(c.body, 'confirmed');
    const score = readiness(c.body) ?? 0;
    const note = str(c.body, 'note', { max: 500 });
    const docs = c.body.docs;
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
      const { n } = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM runs WHERE project_id = ?').get(row.id) as { n: number };
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
          new: changes.filter((x) => x.change === 'new').length,
          revised: changes.filter((x) => x.change === 'revised').length,
          same: changes.filter((x) => x.change === 'same').length,
          dropped: dropped.length,
        },
      };
      db.prepare(
        'INSERT INTO runs (project_id, number, created_at, created_by, user_id, note, intake, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(row.id, n, t, c.user.name, c.user.id, note, JSON.stringify(intake), JSON.stringify(summary));
      db.prepare('UPDATE projects SET intake = ?, confirmed = ?, readiness = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(intake),
        confirmed ? JSON.stringify(confirmed) : row.confirmed,
        score,
        t,
        row.id,
      );
      return { number: n, createdAt: t, createdBy: c.user.name, note, summary };
    });
    audit({
      orgId: row.org_id,
      userId: c.user.id,
      actor: c.user.name,
      action: 'run.saved',
      target: label(intake),
      detail: { run: run.number, new: run.summary.counts.new, revised: run.summary.counts.revised, readiness: score },
      ip: c.ip,
    });
    return { run, drafts: latestDrafts(row.id) };
  }),

  route('GET', '/projects/:id/docs/:docId/drafts', (c) => {
    const { row } = projectAccess(c.user, c.params.id, 'view');
    const docId = c.params.docId;
    return { drafts: draftsOf(row.id, docId) };
  }),

  route('POST', '/projects/:id/signoffs', async (c) => {
    const kind = str(c.body, 'kind', { max: 10, required: true });
    if (kind !== 'submit' && kind !== 'approve')
      throw new HttpError(403, 'Technical review is signed by Biomedix reviewers from their own workspace.');
    const { row, org, m } = projectAccess(c.user, c.params.id, kind === 'submit' ? 'edit' : 'view');
    let method = '';
    if (kind === 'approve') {
      if (!m.approver) throw new HttpError(403, `You aren’t an approver in ${org.name}. An owner or admin can make you one.`, 'forbidden');
      requireVerified(c.user, 'approve documents');
      // An electronic signature: the signer re-enters their password (21 CFR 11.200).
      await reauth(c);
      method = c.user.mfaEnabled ? 'Biomedix e-signature (password, two-factor account)' : 'Biomedix e-signature (password)';
    }
    const docId = str(c.body, 'docId', { max: 40, required: true });
    const draft = Number(c.body.draft);
    const note = str(c.body, 'note', { max: 4000 });
    const reference = str(c.body, 'reference', { max: 200 });
    const out = recordSignoff(row, docId, draft, kind, c, { note, method, reference });
    audit({
      orgId: row.org_id,
      userId: c.user.id,
      actor: c.user.name,
      action: kind === 'submit' ? 'doc.submitted' : 'doc.approved',
      target: `${docId} draft ${draft}`,
      detail: { project: label(JSON.parse(row.intake)) },
      ip: c.ip,
    });
    return out;
  }),
];

export function draftsOf(projectId: string, docId: string) {
  return (
    getDb()
      .prepare(
        `SELECT draft, run_number, title, hash, sha256, filled_pct, markdown, created_at FROM drafts
         WHERE project_id = ? AND doc_id = ? ORDER BY draft DESC`,
      )
      .all(projectId, docId) as Record<string, string | number>[]
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
}

const ALLOWED: Record<string, (string | undefined)[]> = {
  submit: [undefined, 'return'],
  review: ['submit'],
  return: ['submit'],
  approve: ['review'],
};
const WHY: Record<string, string> = {
  submit: 'This draft is already in review or signed.',
  review: 'Only a draft waiting on technical review can be signed.',
  return: 'Only a draft waiting on technical review can be returned.',
  approve: 'Approval needs a signed technical review on this draft.',
};

/** Appends a sign-off after checking it follows from the last one on the latest draft. */
export function recordSignoff(
  row: ProjectRow,
  docId: string,
  draft: number,
  kind: 'submit' | 'review' | 'return' | 'approve',
  c: Ctx,
  extra: { note: string; method: string; reference: string },
) {
  return tx((db) => {
    const latest = db.prepare('SELECT MAX(draft) AS d FROM drafts WHERE project_id = ? AND doc_id = ?').get(row.id, docId) as {
      d: number | null;
    };
    if (!latest.d) throw new HttpError(409, 'Save a run first: this document has no saved draft.');
    if (draft !== latest.d) throw new HttpError(409, `Draft ${draft} was superseded by draft ${latest.d}.`);
    const last = db
      .prepare('SELECT kind, user_id FROM signoffs WHERE project_id = ? AND doc_id = ? AND draft = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
      .get(row.id, docId, draft) as { kind: string; user_id: string } | undefined;
    if (!ALLOWED[kind].includes(last?.kind)) throw new HttpError(409, WHY[kind]);
    if (kind === 'return' && !extra.note) throw new HttpError(400, 'Say what needs to change.');
    if ((kind === 'review' || kind === 'return') && last?.user_id === c.user.id)
      throw new HttpError(403, 'You submitted this draft, so another reviewer has to review it.', 'self_review');
    db.prepare(
      `INSERT INTO signoffs (id, project_id, doc_id, draft, kind, user_id, signer, signer_email, note, method, reference, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), row.id, docId, draft, kind, c.user.id, c.user.name, c.user.email, extra.note, extra.method, extra.reference, now());
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), row.id);
    return { signoffs: signoffs(row.id) };
  });
}
