/**
 * Append-only activity log. Company events carry org_id; personal security
 * events (sign-ins, password and two-factor changes) carry only user_id.
 */
import { getDb } from './db.ts';

export interface AuditEntry {
  orgId?: string | null;
  userId?: string | null;
  actor: string;
  action: string;
  target?: string;
  detail?: Record<string, unknown>;
  ip?: string;
}

export function audit(e: AuditEntry) {
  getDb()
    .prepare('INSERT INTO audit (org_id, user_id, actor, action, target, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      e.orgId ?? null,
      e.userId ?? null,
      e.actor,
      e.action,
      e.target ?? '',
      JSON.stringify(e.detail ?? {}),
      e.ip ?? '',
      new Date().toISOString(),
    );
}

export interface AuditRow {
  id: number;
  org_id: string | null;
  user_id: string | null;
  actor: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
  created_at: string;
}

export function auditJson(r: AuditRow, withIp: boolean) {
  return {
    id: r.id,
    actor: r.actor,
    action: r.action,
    target: r.target,
    detail: JSON.parse(r.detail),
    createdAt: r.created_at,
    ...(withIp ? { ip: r.ip } : {}),
  };
}
