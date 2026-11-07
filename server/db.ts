/**
 * SQLite storage (Node's built-in node:sqlite, no native build step).
 * The database file lives in BIOMEDIX_DATA_DIR (default ./data).
 * Runs, drafts and sign-offs are append-only: nothing rewrites history.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS: string[] = [
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
];

let db: DatabaseSync | null = null;

/** Opens (and migrates) the database on first use, so importing this file has no side effects. */
export function getDb(): DatabaseSync {
  if (db) return db;
  const file = process.env.BIOMEDIX_DB ?? join(resolve(process.env.BIOMEDIX_DATA_DIR ?? 'data'), 'biomedix.db');
  if (file !== ':memory:') mkdirSync(join(file, '..'), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  const { user_version: version } = d.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = version; v < MIGRATIONS.length; v++) {
    d.exec('BEGIN');
    try {
      d.exec(MIGRATIONS[v]);
      d.exec(`PRAGMA user_version = ${v + 1}`);
      d.exec('COMMIT');
    } catch (err) {
      d.exec('ROLLBACK');
      throw err;
    }
  }
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
