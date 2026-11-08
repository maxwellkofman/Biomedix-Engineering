/**
 * Demo requests and gap scans.
 *
 * Anyone can ask for a demo, a free gap scan, or both. Each request gets a private
 * link (/request/<token>) where the requester picks a demo time, uploads files,
 * follows the scan and reads the report. Uploaded files go through automated
 * checks (server/scan/); a Biomedix engineer keeps or dismisses each finding,
 * adds their own and sends the report. Nothing reaches the requester before that.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { requireStaff } from '../access.ts';
import { getDb, tx } from '../db.ts';
import { bool, email, hit, HttpError, limit, now, open, readRaw, route, SENT, str, upload, type Ctx, type Route } from '../http.ts';
import { sendMail } from '../mail.ts';
import { classify, KIND_LABEL, runChecks, type DeviceType, type DocKind, type ScanFile } from '../scan/checks.ts';
import { ACCEPT, checkSignature, readFile } from '../scan/extract.ts';
import { seal, unseal } from '../totp.ts';
import type { User } from '../auth.ts';

const MB = 1024 * 1024;
const HOUR = 60 * 60_000;
export const LIMITS = { files: 10, fileBytes: 25 * MB, totalBytes: 60 * MB };

const scanHours = () => Math.max(1, Number(process.env.BIOMEDIX_SCAN_HOURS) || 48);
const retentionDays = () => Math.max(1, Number(process.env.BIOMEDIX_SCAN_RETENTION_DAYS) || 30);

/** A Calendly, Microsoft Bookings or similar scheduling page. https only. */
function bookingUrl() {
  const raw = process.env.BIOMEDIX_BOOKING_URL?.trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

export const DEVICE_TYPES: Record<Exclude<DeviceType, ''>, string> = {
  samd: 'Software only (SaMD)',
  'hardware-software': 'Hardware with software',
  hardware: 'Hardware only',
  ivd: 'Diagnostic (IVD)',
  unsure: 'Not sure yet',
};
export const STAGES: Record<string, string> = {
  concept: 'Idea or concept',
  prototype: 'Building prototypes',
  verification: 'Design verification',
  submission: 'Preparing a submission',
  market: 'On the market',
};
const INQUIRY_STATUS = ['new', 'contacted', 'scheduled', 'closed'] as const;

/* ---------- Rows ---------- */

interface InquiryRow {
  id: string;
  token_hash: string;
  token_sealed: string;
  name: string;
  email: string;
  company: string;
  role: string;
  device: string;
  device_type: string;
  stage: string;
  ai: number;
  message: string;
  wants_demo: number;
  scheduled_at: string | null;
  status: string;
  notes: string;
  source: string;
  user_id: string | null;
  org_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ScanRow {
  id: string;
  inquiry_id: string;
  status: 'uploading' | 'received' | 'in_review' | 'sent' | 'withdrawn';
  focus: string;
  reviewer_id: string | null;
  reviewer_name: string;
  summary: string;
  coverage: string;
  created_at: string;
  submitted_at: string | null;
  due_at: string | null;
  sent_at: string | null;
  files_deleted_at: string | null;
  updated_at: string;
}

interface FileRow {
  id: string;
  scan_id: string;
  name: string;
  size: number;
  sha256: string;
  kind: DocKind;
  pages: number | null;
  read_status: string;
  read_note: string;
  has_content: number;
  created_at: string;
}

interface FindingRow {
  id: string;
  scan_id: string;
  file_id: string | null;
  source: 'auto' | 'engineer';
  rule: string;
  severity: 'high' | 'medium' | 'low';
  area: string;
  title: string;
  detail: string;
  fix: string;
  clause: string;
  status: 'open' | 'kept' | 'dismissed';
  edited: number;
  position: number;
  created_at: string;
  updated_at: string;
}

const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const db = () => getDb();

function byToken(token: string): InquiryRow {
  const q = /^[\w-]{20,100}$/.test(token)
    ? (db().prepare('SELECT * FROM inquiries WHERE token_hash = ?').get(sha256(token)) as InquiryRow | undefined)
    : undefined;
  if (!q) throw new HttpError(404, 'This link isn’t valid. Check you copied all of it, or ask us for a new one.');
  return q;
}

const scanOf = (inquiryId: string) => db().prepare('SELECT * FROM gap_scans WHERE inquiry_id = ?').get(inquiryId) as ScanRow | undefined;
const scanById = (id: string) => {
  const s = db().prepare('SELECT * FROM gap_scans WHERE id = ?').get(id) as ScanRow | undefined;
  if (!s) throw new HttpError(404, 'Gap scan not found.');
  return s;
};
const inquiryById = (id: string) => db().prepare('SELECT * FROM inquiries WHERE id = ?').get(id) as InquiryRow;
const filesOf = (scanId: string) =>
  db()
    .prepare(
      `SELECT id, scan_id, name, size, sha256, kind, pages, read_status, read_note, content IS NOT NULL AS has_content, created_at
       FROM gap_scan_files WHERE scan_id = ? ORDER BY created_at, name`,
    )
    .all(scanId) as unknown as FileRow[];
const findingsOf = (scanId: string) => db().prepare('SELECT * FROM gap_findings WHERE scan_id = ? ORDER BY position, created_at').all(scanId) as unknown as FindingRow[];

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/* ---------- Views ---------- */

function fileView(f: FileRow, staff = false) {
  return {
    id: f.id,
    name: f.name,
    size: f.size,
    kind: f.kind,
    kindLabel: KIND_LABEL[f.kind] ?? 'Other',
    pages: f.pages,
    readStatus: f.read_status,
    readNote: f.read_note,
    deleted: !f.has_content,
    ...(staff ? { sha256: f.sha256 } : {}),
  };
}

function findingView(f: FindingRow, names: Map<string, string>, staff = false) {
  return {
    id: f.id,
    severity: f.severity,
    area: f.area,
    title: f.title,
    detail: f.detail,
    fix: f.fix,
    clause: f.clause,
    file: f.file_id ? (names.get(f.file_id) ?? null) : null,
    ...(staff ? { fileId: f.file_id, source: f.source, rule: f.rule, status: f.status, edited: !!f.edited } : {}),
  };
}

function reportOf(s: ScanRow, files: FileRow[]) {
  const names = new Map(files.map((f) => [f.id, f.name]));
  const findings = findingsOf(s.id)
    .filter((f) => f.status === 'kept')
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.position - b.position)
    .map((f) => findingView(f, names));
  return {
    reviewer: s.reviewer_name,
    sentAt: s.sent_at,
    summary: s.summary,
    findings,
    coverage: JSON.parse(s.coverage) as { area: string; files: string[]; note: string }[],
  };
}

function scanView(s: ScanRow) {
  const files = filesOf(s.id);
  return {
    id: s.id,
    status: s.status,
    focus: s.focus,
    createdAt: s.created_at,
    submittedAt: s.submitted_at,
    dueAt: s.due_at,
    sentAt: s.sent_at,
    filesDeleted: !!s.files_deleted_at,
    files: files.map((f) => fileView(f)),
    report: s.status === 'sent' ? reportOf(s, files) : null,
  };
}

function requestView(q: InquiryRow) {
  const s = scanOf(q.id);
  return {
    id: q.id,
    name: q.name,
    email: q.email,
    company: q.company,
    device: q.device,
    deviceType: q.device_type,
    stage: q.stage,
    createdAt: q.created_at,
    demo: { wanted: !!q.wants_demo, scheduledAt: q.scheduled_at, bookingUrl: bookingUrl() },
    scan: s ? scanView(s) : null,
  };
}

/* ---------- Email ---------- */

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function formatDue(iso: string) {
  return `${new Date(iso).toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} UTC`;
}

function gapCount(findings: { severity: string }[]) {
  if (!findings.length) return 'no gaps';
  const by = (s: string) => findings.filter((f) => f.severity === s).length;
  const parts = [['high', by('high')], ['medium', by('medium')], ['low', by('low')]].filter(([, n]) => n).map(([s, n]) => `${n} ${s}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `${list}-priority ${findings.length === 1 ? 'gap' : 'gaps'}`;
}

/** Where new requests are announced: BIOMEDIX_SALES_EMAIL, else every verified Biomedix staff account, else BIOMEDIX_ADMIN_EMAIL. */
function teamRecipients(): string[] {
  const env = (process.env.BIOMEDIX_SALES_EMAIL ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (env.length) return env;
  const staff = (db().prepare(`SELECT email FROM users WHERE staff_role != '' AND email_verified_at IS NOT NULL`).all() as { email: string }[]).map((s) => s.email);
  if (staff.length) return staff;
  const admin = process.env.BIOMEDIX_ADMIN_EMAIL?.trim();
  if (admin) return [admin];
  if (!warnedTeam) {
    warnedTeam = true;
    console.warn('[requests] Nobody to tell about new demo requests and gap scans. Set BIOMEDIX_SALES_EMAIL.');
  }
  return [];
}
let warnedTeam = false;

const requestLink = (c: Ctx<User | null>, q: InquiryRow) => `${c.appUrl}/request/${unseal(q.token_sealed)}`;

function announceRequest(c: Ctx<User | null>, q: InquiryRow, withScan: boolean) {
  const kind = q.wants_demo && withScan ? 'a demo and a gap scan' : q.wants_demo ? 'a demo' : 'a gap scan';
  const label = q.wants_demo && withScan ? 'demo and gap scan request' : q.wants_demo ? 'demo request' : 'gap scan request';
  for (const to of teamRecipients())
    sendMail(
      to,
      'request-team',
      {
        kind,
        label,
        name: q.name,
        email: q.email,
        role: q.role,
        company: q.company,
        device: q.device,
        deviceType: DEVICE_TYPES[q.device_type as keyof typeof DEVICE_TYPES] ?? '',
        stage: STAGES[q.stage] ?? '',
        message: q.message.slice(0, 600),
        url: `${c.appUrl}/staff/requests`,
      },
      c,
    );
  if (q.wants_demo) {
    const booking = bookingUrl();
    sendMail(q.email, 'demo-received', { name: firstName(q.name), booking: booking ? '1' : '', url: requestLink(c, q) }, c);
  }
}

/* ---------- Analysis ---------- */

async function analyse(q: InquiryRow, s: ScanRow) {
  const files = filesOf(s.id);
  const content = db().prepare('SELECT content FROM gap_scan_files WHERE id = ?');
  const update = db().prepare('UPDATE gap_scan_files SET kind = ?, pages = ?, read_status = ?, read_note = ? WHERE id = ?');
  const inputs: ScanFile[] = [];
  for (const f of files) {
    const row = content.get(f.id) as { content: Uint8Array | null } | undefined;
    if (!row?.content) continue;
    const read = await readFile(f.name, Buffer.from(row.content));
    const kind = classify(f.name, read);
    update.run(kind, read.pages, read.status, read.note, f.id);
    inputs.push({ id: f.id, name: f.name, read, kind });
  }
  const { findings, coverage } = runChecks(inputs, { deviceType: (q.device_type || '') as DeviceType, ai: !!q.ai });
  const t = now();
  tx((d) => {
    const add = d.prepare(
      `INSERT INTO gap_findings (id, scan_id, file_id, source, rule, severity, area, title, detail, fix, clause, status, position, created_at, updated_at)
       VALUES (?, ?, ?, 'auto', ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    );
    findings.forEach((f, i) => add.run(randomUUID(), s.id, f.fileId, f.rule, f.severity, f.area, f.title, f.detail, f.fix, f.clause, i, t, t));
    d.prepare('UPDATE gap_scans SET coverage = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(coverage), t, s.id);
  });
  return findings.length;
}

/* ---------- Input ---------- */

function choice<T extends string>(body: Record<string, unknown>, key: string, allowed: readonly T[]): T | '' {
  const v = str(body, key, { max: 40 });
  if (v && !allowed.includes(v as T)) throw new HttpError(400, `Unknown ${key}.`);
  return v as T | '';
}

function fileName(raw: string | null) {
  const name = (raw ?? '')
    .replace(/^.*[\\/]/, '')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .trim()
    .slice(-200);
  if (!name || !/\.[a-z0-9]+$/i.test(name)) throw new HttpError(400, 'Send the file name with its extension.');
  return name;
}

function openScan(s: ScanRow | undefined): ScanRow {
  if (!s) throw new HttpError(404, 'This request has no gap scan.');
  if (s.status !== 'uploading') throw new HttpError(409, 'Files are locked once the scan is submitted.');
  return s;
}

function staffScan(c: Ctx, id: string, { editable = true } = {}) {
  requireStaff(c.user, ['reviewer', 'admin'], c.dev);
  const s = scanById(id);
  if (editable && (s.status === 'sent' || s.status === 'withdrawn'))
    throw new HttpError(409, s.status === 'sent' ? 'This report has already been sent.' : 'The requester withdrew this scan.');
  if (editable && s.status === 'uploading') throw new HttpError(409, 'The requester hasn’t finished uploading yet.');
  return s;
}

const SEVERITIES = ['high', 'medium', 'low'] as const;

function findingFields(body: Record<string, unknown>, partial: boolean) {
  const out: Record<string, string> = {};
  const sev = body.severity;
  if (sev !== undefined || !partial) {
    if (!SEVERITIES.includes(sev as (typeof SEVERITIES)[number])) throw new HttpError(400, 'Choose high, medium or low.');
    out.severity = sev as string;
  }
  for (const [k, max, req] of [
    ['title', 200, true],
    ['area', 60, false],
    ['detail', 6000, false],
    ['fix', 3000, false],
    ['clause', 200, false],
  ] as const) {
    if (partial && body[k] === undefined) continue;
    out[k] = str(body, k, { max, required: req });
  }
  return out;
}

/* ---------- Retention ---------- */

/** Deletes uploaded files a set time after the report is sent, and abandoned uploads after a day. Findings stay. */
export function sweepRequests() {
  const d = getDb();
  const t = now();
  const cutoff = new Date(Date.now() - retentionDays() * 24 * HOUR).toISOString();
  const stale = new Date(Date.now() - 24 * HOUR).toISOString();
  const expired = d
    .prepare(`SELECT id FROM gap_scans WHERE files_deleted_at IS NULL AND ((status = 'sent' AND sent_at < ?) OR (status = 'uploading' AND created_at < ?))`)
    .all(cutoff, stale) as { id: string }[];
  for (const { id } of expired) {
    d.prepare('UPDATE gap_scan_files SET content = NULL WHERE scan_id = ?').run(id);
    d.prepare(`UPDATE gap_scans SET files_deleted_at = ?, status = CASE status WHEN 'uploading' THEN 'withdrawn' ELSE status END, updated_at = ? WHERE id = ?`).run(t, t, id);
  }
}

/* ---------- Routes ---------- */

export const requestRoutes: Route[] = [
  open('GET', '/public/config', () => ({
    bookingUrl: bookingUrl(),
    scanHours: scanHours(),
    retentionDays: retentionDays(),
    limits: LIMITS,
    accept: ACCEPT,
    deviceTypes: DEVICE_TYPES,
    stages: STAGES,
  })),

  open(
    'POST',
    '/public/inquiries',
    (c) => {
      // Bots fill every field, including the hidden one; they get a link that leads nowhere.
      if (str(c.body, 'website', { max: 500 })) return { token: randomBytes(32).toString('base64url') };
      limit(`inq:ip:${c.ip}`, 8, HOUR, 'Too many requests from your network. Try again in an hour.');
      const mail = email(c.body);
      limit(`inq:email:${mail}`, 4, HOUR, 'You’ve sent a few requests already. We’ll be in touch, or try again in an hour.');
      const name = str(c.body, 'name', { max: 120, required: true });
      const company = str(c.body, 'company', { max: 160, required: true });
      const demo = bool(c.body, 'demo') ?? false;
      const scan = bool(c.body, 'scan') ?? false;
      if (!demo && !scan) throw new HttpError(400, 'Choose a demo, a gap scan or both.');
      if (scan && c.body.permission !== true) throw new HttpError(400, 'Confirm you’re allowed to share these files with Biomedix.');
      const fields = {
        role: str(c.body, 'role', { max: 120 }),
        device: str(c.body, 'device', { max: 600 }),
        deviceType: choice(c.body, 'deviceType', Object.keys(DEVICE_TYPES)),
        stage: choice(c.body, 'stage', Object.keys(STAGES)),
        ai: bool(c.body, 'ai') ?? false,
        message: str(c.body, 'message', { max: 4000 }),
        focus: str(c.body, 'focus', { max: 4000 }),
        source: str(c.body, 'source', { max: 40 }),
      };
      const orgId = str(c.body, 'orgId', { max: 64 });
      const member =
        c.user && orgId ? !!db().prepare('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?').get(orgId, c.user.id) : false;
      hit(`inq:ip:${c.ip}`, HOUR);
      hit(`inq:email:${mail}`, HOUR);

      const token = randomBytes(32).toString('base64url');
      const id = randomUUID();
      const t = now();
      tx((d) => {
        d.prepare(
          `INSERT INTO inquiries (id, token_hash, token_sealed, name, email, company, role, device, device_type, stage, ai, message,
             wants_demo, source, user_id, org_id, ip, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          sha256(token),
          seal(token),
          name,
          mail,
          company,
          fields.role,
          fields.device,
          fields.deviceType,
          fields.stage,
          fields.ai ? 1 : 0,
          fields.message,
          demo ? 1 : 0,
          fields.source,
          c.user?.id ?? null,
          member ? orgId : null,
          c.ip,
          t,
          t,
        );
        if (scan)
          d.prepare(`INSERT INTO gap_scans (id, inquiry_id, status, focus, created_at, updated_at) VALUES (?, ?, 'uploading', ?, ?, ?)`).run(
            randomUUID(),
            id,
            fields.focus,
            t,
            t,
          );
      });
      // A scan is announced once its files are in; a demo straight away.
      if (demo) announceRequest(c, inquiryById(id), scan);
      return { token };
    },
    201,
  ),

  open('GET', '/public/requests/:token', (c) => requestView(byToken(c.params.token))),

  upload(
    '/public/requests/:token/files',
    async (c) => {
      const q = byToken(c.params.token);
      const s = openScan(scanOf(q.id));
      limit(`upload:${c.ip}`, 80, HOUR, 'Too many uploads. Try again in an hour.');
      const name = fileName(c.query.get('name'));
      const existing = filesOf(s.id);
      if (existing.length >= LIMITS.files) throw new HttpError(400, `Up to ${LIMITS.files} files per scan.`);
      const data = await readRaw(c.req, LIMITS.fileBytes);
      hit(`upload:${c.ip}`, HOUR);
      if (!data.length) throw new HttpError(400, `${name} is empty.`);
      const total = existing.reduce((n, f) => n + f.size, 0) + data.length;
      if (total > LIMITS.totalBytes) throw new HttpError(413, `Up to ${LIMITS.totalBytes / MB} MB in total per scan.`);
      const bad = checkSignature(name, data);
      if (bad) throw new HttpError(400, bad);
      const hash = sha256(data);
      if (existing.some((f) => f.sha256 === hash)) throw new HttpError(409, `You already added ${name}.`);
      const id = randomUUID();
      db()
        .prepare(`INSERT INTO gap_scan_files (id, scan_id, name, size, sha256, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, s.id, name, data.length, hash, data, now());
      return fileView(filesOf(s.id).find((f) => f.id === id)!);
    },
    201,
  ),

  open('DELETE', '/public/requests/:token/files/:fileId', (c) => {
    const q = byToken(c.params.token);
    const s = openScan(scanOf(q.id));
    db().prepare('DELETE FROM gap_scan_files WHERE id = ? AND scan_id = ?').run(c.params.fileId, s.id);
    return requestView(q);
  }),

  open('POST', '/public/requests/:token/submit', async (c) => {
    const q = byToken(c.params.token);
    const s = scanOf(q.id);
    if (!s) throw new HttpError(404, 'This request has no gap scan.');
    if (s.status !== 'uploading') return requestView(q);
    const files = filesOf(s.id);
    if (!files.length) throw new HttpError(400, 'Add at least one file.');
    const t = now();
    const due = new Date(Date.now() + scanHours() * HOUR).toISOString();
    // Flip the state first so a double submit can't run the checks twice.
    const flipped = db()
      .prepare(`UPDATE gap_scans SET status = 'received', submitted_at = ?, due_at = ?, updated_at = ? WHERE id = ? AND status = 'uploading'`)
      .run(t, due, t, s.id);
    if (!flipped.changes) return requestView(q);
    let flagged = 0;
    try {
      flagged = await analyse(q, s);
    } catch (err) {
      console.error('[gap-scan] automated checks failed', err);
    }
    const fileText = count(files.length, 'file');
    sendMail(q.email, 'scan-received', { name: firstName(q.name), files: fileText, due: formatDue(due), url: requestLink(c, q) }, c);
    if (!q.wants_demo) announceRequest(c, q, true);
    for (const to of teamRecipients())
      sendMail(
        to,
        'scan-team',
        { name: q.name, company: q.company, files: fileText, findings: count(flagged, 'possible gap'), due: formatDue(due), url: `${c.appUrl}/staff/scans/${s.id}` },
        c,
      );
    return requestView(q);
  }),

  open('POST', '/public/requests/:token/scan', (c) => {
    const q = byToken(c.params.token);
    if (c.body.permission !== true) throw new HttpError(400, 'Confirm you’re allowed to share these files with Biomedix.');
    const focus = str(c.body, 'focus', { max: 4000 });
    const existing = scanOf(q.id);
    if (existing && existing.status !== 'withdrawn') throw new HttpError(409, 'This request already has a gap scan.');
    const t = now();
    tx((d) => {
      if (existing) d.prepare('DELETE FROM gap_scans WHERE id = ?').run(existing.id);
      d.prepare(`INSERT INTO gap_scans (id, inquiry_id, status, focus, created_at, updated_at) VALUES (?, ?, 'uploading', ?, ?, ?)`).run(randomUUID(), q.id, focus, t, t);
    });
    return requestView(q);
  }),

  open('POST', '/public/requests/:token/scheduled', (c) => {
    const q = byToken(c.params.token);
    if (!q.wants_demo) throw new HttpError(400, 'This request isn’t for a demo.');
    const t = now();
    db()
      .prepare(
        `UPDATE inquiries SET scheduled_at = ?, status = CASE WHEN status IN ('new', 'contacted') THEN 'scheduled' ELSE status END, updated_at = ? WHERE id = ?`,
      )
      .run(t, t, q.id);
    return requestView(inquiryById(q.id));
  }),

  open('POST', '/public/requests/:token/delete-files', (c) => {
    const q = byToken(c.params.token);
    const s = scanOf(q.id);
    if (!s) throw new HttpError(404, 'This request has no gap scan.');
    const t = now();
    tx((d) => {
      d.prepare('UPDATE gap_scan_files SET content = NULL WHERE scan_id = ?').run(s.id);
      d.prepare(
        `UPDATE gap_scans SET files_deleted_at = COALESCE(files_deleted_at, ?), status = CASE WHEN status = 'sent' THEN status ELSE 'withdrawn' END, updated_at = ? WHERE id = ?`,
      ).run(t, t, s.id);
    });
    return requestView(q);
  }),

  /* ---------- Signed-in requester ---------- */

  route('GET', '/requests', (c) => {
    const rows = db().prepare('SELECT * FROM inquiries WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(c.user.id) as unknown as InquiryRow[];
    return {
      requests: rows.map((q) => {
        const s = scanOf(q.id);
        const kept = s?.status === 'sent' ? (db().prepare(`SELECT COUNT(*) AS n FROM gap_findings WHERE scan_id = ? AND status = 'kept'`).get(s.id) as { n: number }).n : null;
        return {
          id: q.id,
          token: unseal(q.token_sealed),
          company: q.company,
          createdAt: q.created_at,
          demo: { wanted: !!q.wants_demo, scheduledAt: q.scheduled_at },
          scan: s ? { status: s.status, dueAt: s.due_at, sentAt: s.sent_at, findings: kept } : null,
        };
      }),
    };
  }),

  /* ---------- Biomedix staff ---------- */

  route('GET', '/staff/requests', (c) => {
    requireStaff(c.user, ['reviewer', 'admin'], c.dev);
    const filter = c.query.get('status') ?? 'open';
    const where = filter === 'all' ? '1' : filter === 'open' ? `q.status != 'closed'` : `q.status = ?`;
    const args = filter === 'all' || filter === 'open' ? [] : [filter];
    const rows = db()
      .prepare(
        `SELECT q.*, s.id AS scan_id, s.status AS scan_status, s.due_at AS scan_due
         FROM inquiries q LEFT JOIN gap_scans s ON s.inquiry_id = q.id
         WHERE ${where} ORDER BY q.created_at DESC LIMIT 200`,
      )
      .all(...args) as unknown as (InquiryRow & { scan_id: string | null; scan_status: string | null; scan_due: string | null })[];
    const counts = Object.fromEntries(
      (db().prepare('SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status').all() as { status: string; n: number }[]).map((r) => [r.status, r.n]),
    );
    return {
      counts,
      requests: rows.map((q) => ({
        id: q.id,
        name: q.name,
        email: q.email,
        company: q.company,
        role: q.role,
        device: q.device,
        deviceType: DEVICE_TYPES[q.device_type as keyof typeof DEVICE_TYPES] ?? '',
        stage: STAGES[q.stage] ?? '',
        ai: !!q.ai,
        message: q.message,
        wantsDemo: !!q.wants_demo,
        scheduledAt: q.scheduled_at,
        status: q.status,
        notes: q.notes,
        source: q.source,
        signedIn: !!q.user_id,
        createdAt: q.created_at,
        scan: q.scan_id ? { id: q.scan_id, status: q.scan_status, dueAt: q.scan_due } : null,
      })),
    };
  }),

  route('PATCH', '/staff/requests/:id', (c) => {
    requireStaff(c.user, ['reviewer', 'admin'], c.dev);
    const q = db().prepare('SELECT id FROM inquiries WHERE id = ?').get(c.params.id);
    if (!q) throw new HttpError(404, 'Request not found.');
    const status = c.body.status === undefined ? undefined : choice(c.body, 'status', INQUIRY_STATUS);
    const notes = c.body.notes === undefined ? undefined : str(c.body, 'notes', { max: 8000, trim: false });
    if (status === '') throw new HttpError(400, 'Unknown status.');
    const t = now();
    if (status) db().prepare('UPDATE inquiries SET status = ?, updated_at = ? WHERE id = ?').run(status, t, c.params.id);
    if (notes !== undefined) db().prepare('UPDATE inquiries SET notes = ?, updated_at = ? WHERE id = ?').run(notes, t, c.params.id);
    return { ok: true };
  }),

  route('GET', '/staff/scans', (c) => {
    requireStaff(c.user, ['reviewer', 'admin'], c.dev);
    const state = c.query.get('state') ?? 'todo';
    const where =
      state === 'sent' ? `s.status = 'sent'` : state === 'all' ? '1' : state === 'other' ? `s.status IN ('uploading', 'withdrawn')` : `s.status IN ('received', 'in_review')`;
    const rows = db()
      .prepare(
        `SELECT s.*, q.company, q.name, q.email, q.device_type,
           (SELECT COUNT(*) FROM gap_scan_files f WHERE f.scan_id = s.id) AS files,
           (SELECT COUNT(*) FROM gap_findings g WHERE g.scan_id = s.id AND g.status = 'open') AS open_findings,
           (SELECT COUNT(*) FROM gap_findings g WHERE g.scan_id = s.id AND g.status = 'kept') AS kept_findings
         FROM gap_scans s JOIN inquiries q ON q.id = s.inquiry_id
         WHERE ${where}
         ORDER BY CASE WHEN s.status IN ('received', 'in_review') THEN s.due_at END ASC, s.updated_at DESC LIMIT 200`,
      )
      .all() as unknown as (ScanRow & { company: string; name: string; email: string; device_type: string; files: number; open_findings: number; kept_findings: number })[];
    const counts = Object.fromEntries(
      (db().prepare('SELECT status, COUNT(*) AS n FROM gap_scans GROUP BY status').all() as { status: string; n: number }[]).map((r) => [r.status, r.n]),
    );
    return {
      counts,
      scans: rows.map((s) => ({
        id: s.id,
        company: s.company,
        name: s.name,
        email: s.email,
        deviceType: DEVICE_TYPES[s.device_type as keyof typeof DEVICE_TYPES] ?? '',
        status: s.status,
        submittedAt: s.submitted_at,
        dueAt: s.due_at,
        sentAt: s.sent_at,
        reviewer: s.reviewer_name,
        reviewerIsYou: s.reviewer_id === c.user.id,
        files: s.files,
        openFindings: s.open_findings,
        keptFindings: s.kept_findings,
      })),
    };
  }),

  route('GET', '/staff/scans/:id', (c) => {
    const s = staffScan(c, c.params.id, { editable: false });
    const q = inquiryById(s.inquiry_id);
    const files = filesOf(s.id);
    const names = new Map(files.map((f) => [f.id, f.name]));
    return {
      request: {
        id: q.id,
        name: q.name,
        email: q.email,
        company: q.company,
        role: q.role,
        device: q.device,
        deviceType: DEVICE_TYPES[q.device_type as keyof typeof DEVICE_TYPES] ?? '',
        stage: STAGES[q.stage] ?? '',
        ai: !!q.ai,
        message: q.message,
        wantsDemo: !!q.wants_demo,
        scheduledAt: q.scheduled_at,
        createdAt: q.created_at,
      },
      scan: {
        id: s.id,
        status: s.status,
        focus: s.focus,
        submittedAt: s.submitted_at,
        dueAt: s.due_at,
        sentAt: s.sent_at,
        reviewer: s.reviewer_name,
        reviewerId: s.reviewer_id,
        summary: s.summary,
        filesDeleted: !!s.files_deleted_at,
        coverage: JSON.parse(s.coverage),
      },
      files: files.map((f) => fileView(f, true)),
      findings: findingsOf(s.id).map((f) => findingView(f, names, true)),
      report: reportOf(s, files),
    };
  }),

  route('GET', '/staff/scans/:id/files/:fileId', (c) => {
    staffScan(c, c.params.id, { editable: false });
    const f = db().prepare('SELECT name, content FROM gap_scan_files WHERE id = ? AND scan_id = ?').get(c.params.fileId, c.params.id) as
      | { name: string; content: Uint8Array | null }
      | undefined;
    if (!f) throw new HttpError(404, 'File not found.');
    if (!f.content) throw new HttpError(410, 'This file has been deleted.');
    const ascii = f.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    c.res.statusCode = 200;
    c.res.setHeader('Content-Type', 'application/octet-stream');
    c.res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    c.res.setHeader('Content-Length', String(f.content.byteLength));
    c.res.setHeader('Cache-Control', 'no-store');
    c.res.setHeader('X-Content-Type-Options', 'nosniff');
    c.res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    c.res.end(Buffer.from(f.content));
    return SENT;
  }),

  route('POST', '/staff/scans/:id/claim', (c) => {
    const s = staffScan(c, c.params.id);
    db()
      .prepare(`UPDATE gap_scans SET reviewer_id = ?, reviewer_name = ?, status = 'in_review', updated_at = ? WHERE id = ?`)
      .run(c.user.id, c.user.name, now(), s.id);
    return { ok: true };
  }),

  route('PATCH', '/staff/scans/:id', (c) => {
    const s = staffScan(c, c.params.id);
    const summary = str(c.body, 'summary', { max: 8000, trim: false });
    db().prepare('UPDATE gap_scans SET summary = ?, updated_at = ? WHERE id = ?').run(summary, now(), s.id);
    return { ok: true };
  }),

  route(
    'POST',
    '/staff/scans/:id/findings',
    (c) => {
      const s = staffScan(c, c.params.id);
      const f = findingFields(c.body, false);
      const fileId = str(c.body, 'fileId', { max: 64 }) || null;
      if (fileId && !filesOf(s.id).some((x) => x.id === fileId)) throw new HttpError(400, 'That file isn’t part of this scan.');
      const t = now();
      const pos = (db().prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM gap_findings WHERE scan_id = ?').get(s.id) as { p: number }).p;
      const id = randomUUID();
      db()
        .prepare(
          `INSERT INTO gap_findings (id, scan_id, file_id, source, rule, severity, area, title, detail, fix, clause, status, position, created_at, updated_at)
           VALUES (?, ?, ?, 'engineer', '', ?, ?, ?, ?, ?, ?, 'kept', ?, ?, ?)`,
        )
        .run(id, s.id, fileId, f.severity, f.area || 'General', f.title, f.detail ?? '', f.fix ?? '', f.clause ?? '', pos, t, t);
      return { id };
    },
    201,
  ),

  route('PATCH', '/staff/scans/:id/findings/:findingId', (c) => {
    const s = staffScan(c, c.params.id);
    const row = db().prepare('SELECT * FROM gap_findings WHERE id = ? AND scan_id = ?').get(c.params.findingId, s.id) as FindingRow | undefined;
    if (!row) throw new HttpError(404, 'Finding not found.');
    const f = findingFields(c.body, true);
    const status = c.body.status === undefined ? undefined : choice(c.body, 'status', ['open', 'kept', 'dismissed'] as const);
    const sets = Object.keys(f).map((k) => `${k} = ?`);
    const args: (string | number)[] = Object.values(f);
    if (sets.length) sets.push('edited = 1');
    if (status) {
      sets.push('status = ?');
      args.push(status);
    }
    if (!sets.length) return { ok: true };
    db()
      .prepare(`UPDATE gap_findings SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...args, now(), row.id);
    return { ok: true };
  }),

  route('DELETE', '/staff/scans/:id/findings/:findingId', (c) => {
    const s = staffScan(c, c.params.id);
    const row = db().prepare('SELECT source FROM gap_findings WHERE id = ? AND scan_id = ?').get(c.params.findingId, s.id) as { source: string } | undefined;
    if (!row) throw new HttpError(404, 'Finding not found.');
    if (row.source !== 'engineer') throw new HttpError(400, 'Dismiss automated findings instead; they stay on record.');
    db().prepare('DELETE FROM gap_findings WHERE id = ?').run(c.params.findingId);
    return { ok: true };
  }),

  route('POST', '/staff/scans/:id/send', (c) => {
    const s = staffScan(c, c.params.id);
    if (!c.user.emailVerified) throw new HttpError(403, 'Confirm your email address before you send reports.', 'verify_email');
    if (s.reviewer_id && s.reviewer_id !== c.user.id && c.user.staffRole !== 'admin')
      throw new HttpError(403, `${s.reviewer_name} is reviewing this scan. Take it over first if you need to send it.`);
    const pending = (db().prepare(`SELECT COUNT(*) AS n FROM gap_findings WHERE scan_id = ? AND status = 'open'`).get(s.id) as { n: number }).n;
    if (pending) throw new HttpError(400, `Keep or dismiss the ${count(pending, 'remaining automated finding')} first.`);
    if (!s.summary.trim()) throw new HttpError(400, 'Write a summary for the requester first.');
    const t = now();
    db()
      .prepare(`UPDATE gap_scans SET status = 'sent', sent_at = ?, reviewer_id = ?, reviewer_name = ?, updated_at = ? WHERE id = ?`)
      .run(t, c.user.id, c.user.name, t, s.id);
    const q = inquiryById(s.inquiry_id);
    const kept = findingsOf(s.id).filter((f) => f.status === 'kept');
    sendMail(q.email, 'scan-report', { name: firstName(q.name), company: q.company, reviewer: c.user.name, findings: gapCount(kept), url: requestLink(c, q) }, c);
    return { ok: true };
  }),
];
