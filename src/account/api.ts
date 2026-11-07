/** Typed client for the account API in server/api.ts. */
import type { Intake } from '../intake/model';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface ProjectSummary {
  id: string;
  company: string;
  device: string;
  readiness: number;
  runs: number;
  lastRunAt: string | null;
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
    intake: Partial<Intake>;
    confirmed: Confirmed;
    readiness: number;
    createdAt: string;
    updatedAt: string;
  };
  drafts: Record<string, DraftMeta>;
  signoffs: Signoff[];
  runs: Run[];
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: unknown, opts: { keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong.');
  return data as T;
}

export const api = {
  session: () => call<{ user: User | null }>('GET', '/auth/session'),
  signUp: (b: { name: string; email: string; password: string }) => call<{ user: User }>('POST', '/auth/sign-up', b),
  signIn: (b: { email: string; password: string }) => call<{ user: User }>('POST', '/auth/sign-in', b),
  signOut: () => call<{ ok: true }>('POST', '/auth/sign-out', {}),
  updateAccount: (b: { name: string }) => call<{ user: User }>('PATCH', '/account', b),
  changePassword: (b: { current: string; next: string }) => call<{ ok: true }>('POST', '/account/password', b),
  deleteAccount: (b: { password: string }) => call<{ ok: true }>('DELETE', '/account', b),

  projects: () => call<{ projects: ProjectSummary[] }>('GET', '/projects'),
  createProject: (b: { intake?: Intake; confirmed?: Confirmed; readiness?: number }) =>
    call<ProjectPayload>('POST', '/projects', b),
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
  drafts: (id: string, docId: string) =>
    call<{ drafts: Draft[] }>('GET', `/projects/${id}/docs/${encodeURIComponent(docId)}/drafts`),
  signoff: (
    id: string,
    b: { docId: string; draft: number; kind: SignoffKind; note?: string; signer?: string; method?: string; reference?: string },
  ) => call<{ signoffs: Signoff[] }>('POST', `/projects/${id}/signoffs`, b),
};
