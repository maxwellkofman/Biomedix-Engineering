/** Client for "Ask an engineer" threads and the Biomedix staff overview (server/routes/help.ts). */
import { call, type AuditEntry, type SessionPayload } from '../account/api';

export type ThreadStatus = 'open' | 'answered' | 'closed';

export interface Thread {
  id: string;
  orgId: string;
  orgName: string;
  subject: string;
  context: string;
  contextLabel: string;
  status: ThreadStatus;
  asker: string;
  answeredBy: string;
  messages: number;
  lastBody: string;
  lastFromStaff: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HelpMessage {
  id: string;
  author: string;
  staff: boolean;
  body: string;
  createdAt: string;
}

export interface ThreadDetail {
  thread: Thread;
  messages: HelpMessage[];
}

export interface StaffOverview {
  role: string;
  queues: { reviews: number; scans: number; scansOverdue: number; requests: number; questions: number };
  docs: { draft: number; in_review: number; returned: number; awaiting_approval: number; approved: number };
  totals: { orgs: number; users: number; projects: number; newOrgs: number; newUsers: number; avgReadiness: number };
  reviews: { projectId: string; docId: string; title: string; orgName: string; device: string; at: string }[];
  scans: { id: string; company: string; status: string; dueAt: string | null; overdue: boolean; reviewer: string; openFindings: number }[];
  requests: { id: string; name: string; company: string; wantsDemo: boolean; createdAt: string }[];
  questions: Thread[];
  companies: { id: string; name: string; createdAt: string; members: number; projects: number; readiness: number }[];
  activity: (AuditEntry & { orgName: string })[];
}

const enc = encodeURIComponent;

export const helpApi = {
  list: (orgId: string) => call<{ threads: Thread[] }>('GET', `/orgs/${enc(orgId)}/help`),
  ask: (orgId: string, b: { body: string; context?: string; contextLabel?: string; projectId?: string }) =>
    call<ThreadDetail>('POST', `/orgs/${enc(orgId)}/help`, b),
  get: (id: string) => call<ThreadDetail>('GET', `/help/${enc(id)}`),
  reply: (id: string, body: string) => call<ThreadDetail>('POST', `/help/${enc(id)}/messages`, { body }),
  setStatus: (id: string, status: 'open' | 'closed') => call<ThreadDetail>('PATCH', `/help/${enc(id)}`, { status }),
  staffList: (state: ThreadStatus | 'all') => call<{ threads: Thread[]; counts: Partial<Record<ThreadStatus, number>> }>('GET', `/staff/help?state=${state}`),
  overview: () => call<StaffOverview>('GET', '/staff/overview'),
  demo: (as: 'user' | 'admin') => call<SessionPayload>('POST', '/dev/demo', { as }),
};

export const THREAD_LABEL: Record<ThreadStatus, string> = { open: 'With an engineer', answered: 'Answered', closed: 'Closed' };
