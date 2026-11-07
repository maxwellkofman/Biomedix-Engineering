/**
 * SQLite storage (Node's built-in node:sqlite, no native build step).
 * The database file lives in BIOMEDIX_DATA_DIR (default ./data).
 * Runs, drafts and sign-offs are append-only: nothing rewrites history.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function dataDir() {
  return resolve(process.env.BIOMEDIX_DATA_DIR ?? 'data');
}

/** Each entry runs once, in order; PRAGMA user_version records how many have run. */
const MIGRATIONS: (string | ((d: DatabaseSync) => void))[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    intake TEXT NOT NULL,
    confirmed TEXT NOT NULL DEFAULT '{}',
    readiness INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX projects_user ON projects(user_id, updated_at);
  CREATE TABLE runs (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    intake TEXT NOT NULL,
    summary TEXT NOT NULL,
    PRIMARY KEY (project_id, number)
  );
  CREATE TABLE drafts (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_id TEXT NOT NULL,
    draft INTEGER NOT NULL,
    run_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    hash TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    filled_pct INTEGER NOT NULL,
    markdown TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, doc_id, draft)
  );
  CREATE TABLE signoffs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_id TEXT NOT NULL,
    draft INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('submit', 'review', 'return', 'approve')),
    user_id TEXT NOT NULL,
    signer TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX signoffs_project ON signoffs(project_id, created_at);
  `,

  // v2: company workspaces, roles, invites, email verification, password reset,
  // two-factor sign-in, session details, an audit log and Biomedix staff roles.
  (d) => {
    d.exec(`
      CREATE TABLE orgs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        require_mfa INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE memberships (
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
        approver INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        PRIMARY KEY (org_id, user_id)
      );
      CREATE INDEX memberships_user ON memberships(user_id);
      CREATE TABLE invites (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        email TEXT NOT NULL COLLATE NOCASE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
        approver INTEGER NOT NULL DEFAULT 0,
        token_hash TEXT NOT NULL UNIQUE,
        invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        revoked_at TEXT
      );
      CREATE INDEX invites_org ON invites(org_id, created_at);
      CREATE TABLE tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );
      CREATE INDEX tokens_user ON tokens(user_id, purpose);
      CREATE TABLE recovery_codes (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used_at TEXT,
        PRIMARY KEY (user_id, code_hash)
      );
      CREATE TABLE outbox (
        id TEXT PRIMARY KEY,
        to_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        template TEXT NOT NULL,
        body TEXT,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        error TEXT
      );
      CREATE TABLE audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT,
        user_id TEXT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '{}',
        ip TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX audit_org ON audit(org_id, id);
      CREATE INDEX audit_user ON audit(user_id, id);

      ALTER TABLE users ADD COLUMN email_verified_at TEXT;
      ALTER TABLE users ADD COLUMN staff_role TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN totp_secret TEXT;
      ALTER TABLE users ADD COLUMN totp_pending TEXT;
      ALTER TABLE users ADD COLUMN totp_enabled_at TEXT;
      ALTER TABLE users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN password_changed_at TEXT;

      ALTER TABLE sessions ADD COLUMN id TEXT;
      ALTER TABLE sessions ADD COLUMN ip TEXT NOT NULL DEFAULT '';
      ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';
      ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
      ALTER TABLE sessions ADD COLUMN remember INTEGER NOT NULL DEFAULT 1;
      UPDATE sessions SET id = lower(hex(randomblob(9))), last_seen_at = created_at;

      ALTER TABLE runs ADD COLUMN user_id TEXT;
      ALTER TABLE signoffs ADD COLUMN signer_email TEXT NOT NULL DEFAULT '';

      CREATE TEMP TABLE user_org (user_id TEXT PRIMARY KEY, org_id TEXT NOT NULL);
    `);

    // Every existing account gets a company workspace that owns its projects.
    const users = d.prepare('SELECT id, name, created_at FROM users').all() as { id: string; name: string; created_at: string }[];
    const latestCompany = d.prepare(
      `SELECT json_extract(intake, '$.company.name') AS c FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`,
    );
    const addOrg = d.prepare('INSERT INTO orgs (id, name, created_by, created_at) VALUES (?, ?, ?, ?)');
    const addMember = d.prepare(
      `INSERT INTO memberships (org_id, user_id, role, approver, created_at) VALUES (?, ?, 'owner', 1, ?)`,
    );
    const map = d.prepare('INSERT INTO user_org (user_id, org_id) VALUES (?, ?)');
    for (const u of users) {
      const company = (latestCompany.get(u.id) as { c: string | null } | undefined)?.c;
      const orgId = randomUUID();
      addOrg.run(orgId, company || `${u.name}’s company`, u.id, u.created_at);
      addMember.run(orgId, u.id, u.created_at);
      map.run(u.id, orgId);
    }

    // Projects now belong to the company, not the person who created them.
    d.exec(`
      CREATE TABLE projects_v2 (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        intake TEXT NOT NULL,
        confirmed TEXT NOT NULL DEFAULT '{}',
        readiness INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO projects_v2 (id, org_id, created_by, intake, confirmed, readiness, created_at, updated_at)
        SELECT p.id, m.org_id, p.user_id, p.intake, p.confirmed, p.readiness, p.created_at, p.updated_at
        FROM projects p JOIN user_org m ON m.user_id = p.user_id;
      UPDATE runs SET user_id = (SELECT user_id FROM projects WHERE projects.id = runs.project_id);
      DROP TABLE projects;
      ALTER TABLE projects_v2 RENAME TO projects;
      CREATE INDEX projects_org ON projects(org_id, updated_at);
      DROP TABLE user_org;
    `);
  },
];

let db: DatabaseSync | null = null;

/** Opens (and migrates) the database on first use, so importing this file has no side effects. */
export function getDb(): DatabaseSync {
  if (db) return db;
  const file = process.env.BIOMEDIX_DB ?? join(dataDir(), 'biomedix.db');
  if (file !== ':memory:') mkdirSync(join(file, '..'), { recursive: true });
  const d = new DatabaseSync(file);
  // Foreign keys stay off while migrations rebuild tables, then are checked and switched on.
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 3000;');
  const { user_version: version } = d.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = version; v < MIGRATIONS.length; v++) {
    d.exec('BEGIN');
    try {
      const m = MIGRATIONS[v];
      if (typeof m === 'string') d.exec(m);
      else m(d);
      const broken = d.prepare('PRAGMA foreign_key_check').all();
      if (broken.length) throw new Error(`Migration ${v + 1} left ${broken.length} broken references.`);
      d.exec(`PRAGMA user_version = ${v + 1}`);
      d.exec('COMMIT');
    } catch (err) {
      d.exec('ROLLBACK');
      throw err;
    }
  }
  d.exec('PRAGMA foreign_keys = ON');
  db = d;
  return d;
}

/** Runs fn inside a transaction. node:sqlite is synchronous, so nothing interleaves. */
export function tx<T>(fn: (d: DatabaseSync) => T): T {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const out = fn(d);
    d.exec('COMMIT');
    return out;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}
