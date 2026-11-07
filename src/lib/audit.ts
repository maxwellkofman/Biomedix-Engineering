import type { AuditEntry } from '../account/api';

const ROLE: Record<string, string> = { owner: 'owner', admin: 'admin', editor: 'editor', viewer: 'viewer' };
const s = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

/** "Ada Owner invited eve@acme.test as editor" — one line per activity log entry. */
export function describeAudit(e: AuditEntry, { personal = false } = {}): string {
  const d = e.detail ?? {};
  const t = e.target;
  switch (e.action) {
    case 'org.created':
      return `created the company ${t}`;
    case 'org.renamed':
      return `renamed the company from ${s(d.from)} to ${s(d.to)}`;
    case 'org.mfa_required':
      return 'required two-factor authentication for every member';
    case 'org.mfa_optional':
      return 'made two-factor authentication optional';
    case 'org.deleted':
      return `deleted the company ${t}`;
    case 'member.invited':
      return `invited ${t} as ${ROLE[s(d.role)] ?? s(d.role)}${d.approver ? ' and approver' : ''}`;
    case 'member.joined':
      return `joined as ${ROLE[s(d.role)] ?? s(d.role)}${d.approver ? ' and approver' : ''}`;
    case 'member.role_changed':
      return `changed ${t}’s role from ${s(d.from)} to ${s(d.to)}`;
    case 'member.approver_added':
      return `made ${t} an approver`;
    case 'member.approver_removed':
      return `removed ${t} as an approver`;
    case 'member.removed':
      return `removed ${t} from the company`;
    case 'member.left':
      return d.reason ? `left the company (${s(d.reason)})` : 'left the company';
    case 'invite.revoked':
      return `withdrew the invitation to ${t}`;
    case 'project.created':
      return `created the project ${t}`;
    case 'project.deleted':
      return `deleted the project ${t}`;
    case 'run.saved': {
      const n = Number(d.new ?? 0) + Number(d.revised ?? 0);
      return `saved run ${s(d.run)} of ${t}: ${n} new draft${n === 1 ? '' : 's'}, readiness ${s(d.readiness)}%`;
    }
    case 'doc.submitted':
      return `submitted ${t} for technical review`;
    case 'doc.reviewed':
      return `signed the technical review of ${t}`;
    case 'doc.returned':
      return `returned ${t} with comments`;
    case 'doc.approved':
      return `approved ${t}`;
    // Personal security events read as "You …" or stand alone.
    case 'sign_in':
      return `Signed in${d.method ? ` with ${s(d.method)}` : ''}`;
    case 'sign_in.failed':
      return d.reason === 'code' ? 'Sign-in failed: wrong two-factor code' : 'Sign-in failed: wrong password';
    case 'sign_out':
      return 'Signed out';
    case 'password.changed':
      return 'Changed password';
    case 'password.reset':
      return 'Reset password from an emailed link';
    case 'password.reset_requested':
      return 'Asked for a password reset link';
    case 'mfa.enabled':
      return 'Turned on two-factor authentication';
    case 'mfa.disabled':
      return 'Turned off two-factor authentication';
    case 'mfa.recovery_regenerated':
      return 'Generated new recovery codes';
    case 'email.changed':
      return `Changed sign-in email from ${s(d.from)} to ${s(d.to)}`;
    case 'email.verified':
      return `Confirmed ${t}`;
    case 'sessions.revoked':
      return `Signed out ${s(d.count)} other device${d.count === 1 ? '' : 's'}`;
    case 'account.created':
      return 'Created the account';
    case 'staff.role_changed':
      return `${personal ? '' : `${t}: `}Biomedix staff role ${s(d.to) || 'removed'}`;
    default:
      return `${e.action.replace(/[._]/g, ' ')} ${t}`.trim();
  }
}

export function timeAgo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h ago`;
  if (min < 60 * 24 * 30) return `${Math.round(min / 1440)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
