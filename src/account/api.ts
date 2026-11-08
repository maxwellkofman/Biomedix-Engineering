/** Typed client for the API in server/. */
import type { Intake } from '../intake/model';

export type StaffRole = '' | 'reviewer' | 'admin';
export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  staffRole: StaffRole;
}

/** A company the user belongs to, with their role in it. */
export interface Org {
  id: string;
  name: string;
  role: Role;
  approver: boolean;
  requireMfa: boolean;
  createdAt: string;
}

export interface SessionPayload {
  user: User;
  orgs: Org[];
}

export interface ProjectSummary {
  id: string;
  company: string;
  device: string;
  readiness: number;
  runs: number;
  lastRunAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Token key → the value the customer confirmed. A confirmation lapses when the value changes. */
export type Confirmed = Record<string, string>;

export interface DraftMeta {
  draft: number;
  runNumber: number;
  hash: string;
  filledPct: number;
  createdAt: string;
}

export interface Draft extends DraftMeta {
  title: string;
  sha256: string;
  markdown: string;
}

export type SignoffKind = 'submit' | 'review' | 'return' | 'approve';

export interface Signoff {
  id: string;
  docId: string;
  draft: number;
  kind: SignoffKind;
  signer: string;
  signerEmail: string;
  note: string;
  method: string;
  reference: string;
  createdAt: string;
}

export interface RunSummary {
  readiness: number;
  docs: { id: string; title: string; draft: number; change: 'new' | 'revised' | 'same' }[];
  dropped: string[];
  counts: { new: number; revised: number; same: number; dropped: number };
}

export interface Run {
  number: number;
  createdAt: string;
  createdBy: string;
  note: string;
  summary: RunSummary;
  intake?: Intake;
}

export interface ProjectPayload {
  project: {
    id: string;
    orgId: string;
    intake: Partial<Intake>;
    confirmed: Confirmed;
    readiness: number;
    createdAt: string;
    updatedAt: string;
  };
  drafts: Record<string, DraftMeta>;
  signoffs: Signoff[];
  runs: Run[];
  approvers: string[];
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  approver: boolean;
  emailVerified: boolean;
  mfaEnabled: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  approver: boolean;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  createdAt: string;
  ip?: string;
}

export type DocState = 'draft' | 'in_review' | 'returned' | 'awaiting_approval' | 'approved';
export type DocCounts = Record<DocState, number>;

export interface AttentionItem {
  projectId: string;
  project: string;
  docId: string;
  title: string;
  draft: number;
  at: string;
  by: string;
  note: string;
}

export interface Dashboard {
  org: { id: string; name: string; requireMfa: boolean; createdAt: string };
  you: { role: Role; approver: boolean };
  projects: (ProjectSummary & { docs: DocCounts })[];
  totals: DocCounts & { projects: number };
  attention: { approvals: AttentionItem[]; returned: AttentionItem[]; inReview: number };
  team: { userId: string; name: string; role: Role; approver: boolean }[];
  teamCount: number;
  teamWithoutMfa: number;
  pendingInvites: number;
  activity: AuditEntry[];
}

export interface SessionInfo {
  id: string;
  current: boolean;
  device: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  remember: boolean;
}

export interface Security {
  mfaEnabled: boolean;
  mfaEnabledAt: string | null;
  recoveryCodesLeft: number;
  passwordChangedAt: string;
  events: AuditEntry[];
}

export interface InviteInfo {
  orgName: string;
  inviter: string;
  email: string;
  role: Role;
  roleLabel: string;
  approver: boolean;
  expiresAt: string;
  accountExists: boolean;
}

export interface ReviewItem {
  orgId: string;
  orgName: string;
  projectId: string;
  company: string;
  device: string;
  docId: string;
  title: string;
  draft: number;
  filledPct: number;
  runNumber: number;
  at: string;
  by: string;
  byYou: boolean;
}

export interface ReviewDetail {
  org: { id: string; name: string };
  project: { id: string; company: string; device: string };
  docId: string;
  latest: Draft;
  previous: Draft | null;
  signoffs: Signoff[];
}

export interface StaffOrg {
  id: string;
  name: string;
  requireMfa: boolean;
  createdAt: string;
  members: number;
  projects: number;
  readiness: number;
  owners: string;
  lastActiveAt: string | null;
  docs: DocCounts;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  staffRole: StaffRole;
  orgs: string;
  lastActiveAt: string | null;
}

export interface DevMail {
  id: string;
  to: string;
  subject: string;
  template: string;
  body: string;
  createdAt: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Lets the account layer hear about sign-outs and policy blocks from any request. */
type Listener = (err: ApiError) => void;
const listeners = new Set<Listener>();
export function onApiError(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function call<T>(method: string, path: string, body?: unknown, opts: { keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  const payload = body ?? (method === 'GET' ? undefined : {});
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: payload !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      keepalive: opts.keepalive,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the Biomedix server. Check your connection and try again.');
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    // A static host without the API answers with the app's HTML or a 404 page.
    throw new ApiError(res.status === 200 ? 503 : res.status, 'Accounts aren’t available on this server.');
  }
  const data = await res.json();
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error ?? 'Something went wrong.', data?.code);
    for (const fn of listeners) fn(err);
    throw err;
  }
  return data as T;
}

const q = (o: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString();
  return s ? `?${s}` : '';
};

export const api = {
  /* Auth */
  session: () => call<{ user: User | null; orgs: Org[]; dev: boolean; mail: boolean }>('GET', '/auth/session'),
  signUp: (b: { name: string; email: string; password: string; company?: string; invite?: string; acceptTerms: boolean }) =>
    call<SessionPayload & { joined: string | null }>('POST', '/auth/sign-up', b),
  signIn: (b: { email: string; password: string; remember: boolean }) =>
    call<SessionPayload | { mfa: true; ticket: string }>('POST', '/auth/sign-in', b),
  signInMfa: (b: { ticket: string; code: string }) =>
    call<SessionPayload & { recoveryCodesLeft?: number }>('POST', '/auth/sign-in/mfa', b),
  signOut: () => call<{ ok: true }>('POST', '/auth/sign-out'),
  verifyEmail: (token: string) => call<{ ok: true; email: string; signedIn: boolean }>('POST', '/auth/verify-email', { token }),
  resendVerification: () => call<{ ok: true; already?: boolean }>('POST', '/auth/verify-email/resend'),
  forgotPassword: (email: string) => call<{ ok: true }>('POST', '/auth/forgot-password', { email }),
  checkReset: (token: string) => call<{ email: string }>('POST', '/auth/reset-password/check', { token }),
  resetPassword: (token: string, password: string) => call<{ ok: true; email: string }>('POST', '/auth/reset-password', { token, password }),
  confirmEmailChange: (token: string) => call<{ ok: true; email: string }>('POST', '/auth/confirm-email-change', { token }),
  inviteInfo: (token: string) => call<InviteInfo>('POST', '/invites/lookup', { token }),
  acceptInvite: (token: string) => call<SessionPayload & { orgId: string }>('POST', '/invites/accept', { token }),

  /* Account */
  updateAccount: (b: { name: string }) => call<SessionPayload>('PATCH', '/account', b),
  changeEmail: (b: { email: string; password: string }) => call<{ ok: true; pending: string }>('POST', '/account/email', b),
  changePassword: (b: { current: string; next: string }) => call<{ ok: true }>('POST', '/account/password', b),
  security: () => call<Security>('GET', '/account/security'),
  mfaSetup: (password: string) => call<{ secret: string; uri: string }>('POST', '/account/mfa/setup', { password }),
  mfaEnable: (code: string) => call<SessionPayload & { codes: string[] }>('POST', '/account/mfa/enable', { code }),
  mfaDisable: (b: { password: string; code: string }) => call<SessionPayload>('POST', '/account/mfa/disable', b),
  recoveryCodes: (password: string) => call<{ codes: string[] }>('POST', '/account/mfa/recovery-codes', { password }),
  sessions: () => call<{ sessions: SessionInfo[] }>('GET', '/account/sessions'),
  endSession: (id: string) => call<{ ok: true; current: boolean }>('DELETE', `/account/sessions/${encodeURIComponent(id)}`),
  endOtherSessions: () => call<{ ok: true; count: number }>('POST', '/account/sessions/revoke-others'),
  deleteAccount: (b: { password: string }) => call<{ ok: true; deletedCompanies: string[] }>('DELETE', '/account', b),

  /* Companies */
  createOrg: (name: string) => call<SessionPayload & { orgId: string }>('POST', '/orgs', { name }),
  org: (id: string) =>
    call<{ org: Dashboard['org']; you: Dashboard['you']; counts: { members: number; projects: number; withoutMfa: number } }>('GET', `/orgs/${id}`),
  updateOrg: (id: string, b: { name?: string; requireMfa?: boolean }) => call<SessionPayload>('PATCH', `/orgs/${id}`, b),
  deleteOrg: (id: string, b: { password: string; confirm: string }) => call<SessionPayload>('DELETE', `/orgs/${id}`, b),
  leaveOrg: (id: string) => call<SessionPayload>('POST', `/orgs/${id}/leave`),
  members: (id: string) => call<{ members: Member[]; you: Dashboard['you']; invites: Invite[] }>('GET', `/orgs/${id}/members`),
  updateMember: (id: string, userId: string, b: { role?: Role; approver?: boolean }) =>
    call<SessionPayload & { members: Member[] }>('PATCH', `/orgs/${id}/members/${userId}`, b),
  removeMember: (id: string, userId: string) => call<{ members: Member[] }>('DELETE', `/orgs/${id}/members/${userId}`),
  invite: (id: string, b: { email: string; role: Role; approver: boolean }) =>
    call<{ link: string; invites: Invite[] }>('POST', `/orgs/${id}/invites`, b),
  resendInvite: (id: string, inviteId: string) => call<{ link: string; invites: Invite[] }>('POST', `/orgs/${id}/invites/${inviteId}/resend`),
  revokeInvite: (id: string, inviteId: string) => call<{ invites: Invite[] }>('DELETE', `/orgs/${id}/invites/${inviteId}`),
  audit: (id: string, o: { before?: number; type?: string; limit?: number } = {}) =>
    call<{ entries: AuditEntry[]; more: boolean }>('GET', `/orgs/${id}/audit${q(o)}`),
  dashboard: (id: string) => call<Dashboard>('GET', `/orgs/${id}/dashboard`),

  /* Projects */
  projects: (orgId: string) => call<{ projects: ProjectSummary[] }>('GET', `/orgs/${orgId}/projects`),
  createProject: (orgId: string, b: { intake?: Intake; confirmed?: Confirmed; readiness?: number }) =>
    call<ProjectPayload>('POST', `/orgs/${orgId}/projects`, b),
  project: (id: string) => call<ProjectPayload>('GET', `/projects/${id}`),
  saveProject: (id: string, b: { intake: Intake; confirmed: Confirmed; readiness: number }, keepalive = false) =>
    call<{ updatedAt: string }>('PUT', `/projects/${id}`, b, { keepalive }),
  deleteProject: (id: string) => call<{ ok: true }>('DELETE', `/projects/${id}`),
  runs: (id: string) => call<{ runs: Run[] }>('GET', `/projects/${id}/runs`),
  createRun: (
    id: string,
    b: {
      intake: Intake;
      confirmed: Confirmed;
      readiness: number;
      note?: string;
      docs: { id: string; title: string; markdown: string; filledPct: number }[];
    },
  ) => call<{ run: Run; drafts: Record<string, DraftMeta> }>('POST', `/projects/${id}/runs`, b),
  drafts: (id: string, docId: string) => call<{ drafts: Draft[] }>('GET', `/projects/${id}/docs/${encodeURIComponent(docId)}/drafts`),
  signoff: (id: string, b: { docId: string; draft: number; kind: 'submit' | 'approve'; note?: string; password?: string; reference?: string }) =>
    call<{ signoffs: Signoff[] }>('POST', `/projects/${id}/signoffs`, b),

  /* Biomedix staff */
  reviews: (state: 'submitted' | 'returned' | 'reviewed' | 'approved') =>
    call<{ items: ReviewItem[]; counts: DocCounts }>('GET', `/staff/reviews${q({ state })}`),
  review: (projectId: string, docId: string) => call<ReviewDetail>('GET', `/staff/reviews/${projectId}/${encodeURIComponent(docId)}`),
  signReview: (projectId: string, docId: string, b: { kind: 'review' | 'return'; draft: number; note: string; password?: string }) =>
    call<{ signoffs: Signoff[] }>('POST', `/staff/reviews/${projectId}/${encodeURIComponent(docId)}`, b),
  staffOrgs: () => call<{ orgs: StaffOrg[] }>('GET', '/staff/orgs'),
  staffUsers: (query = '') => call<{ users: StaffUser[] }>('GET', `/staff/users${q({ q: query })}`),
  setStaffRole: (id: string, staffRole: StaffRole) => call<{ ok: true }>('PATCH', `/staff/users/${id}`, { staffRole }),
  resetUserMfa: (id: string, password: string) => call<{ ok: true }>('POST', `/staff/users/${id}/reset-mfa`, { password }),

  /* Dev mode */
  devMail: () => call<{ messages: DevMail[] }>('GET', '/dev/mail'),
  clearDevMail: () => call<{ ok: true }>('DELETE', '/dev/mail'),
  devStaff: (staffRole: StaffRole) => call<{ ok: true }>('POST', '/dev/staff', { staffRole }),
};
