/** Client for demo requests and gap scans (server/routes/requests.ts). */
import { ApiError, call } from '../account/api';

export type DeviceType = 'samd' | 'hardware-software' | 'hardware' | 'ivd' | 'unsure';
export type Stage = 'concept' | 'prototype' | 'verification' | 'submission' | 'market';
export type Severity = 'high' | 'medium' | 'low';
export type ScanStatus = 'uploading' | 'received' | 'in_review' | 'sent' | 'withdrawn';
export type LeadStatus = 'new' | 'contacted' | 'scheduled' | 'closed';

export interface PublicConfig {
  bookingUrl: string;
  scanHours: number;
  retentionDays: number;
  limits: { files: number; fileBytes: number; totalBytes: number };
  accept: string[];
  deviceTypes: Record<DeviceType, string>;
  stages: Record<Stage, string>;
}

export interface ScanFileInfo {
  id: string;
  name: string;
  size: number;
  kind: string;
  kindLabel: string;
  pages: number | null;
  readStatus: 'pending' | 'read' | 'partial' | 'unreadable';
  readNote: string;
  deleted: boolean;
}

export interface ReportFinding {
  id: string;
  severity: Severity;
  area: string;
  title: string;
  detail: string;
  fix: string;
  clause: string;
  file: string | null;
}

export interface Coverage {
  area: string;
  files: string[];
  note: string;
}

export interface Report {
  reviewer: string;
  sentAt: string | null;
  summary: string;
  findings: ReportFinding[];
  coverage: Coverage[];
}

export interface ScanInfo {
  id: string;
  status: ScanStatus;
  focus: string;
  createdAt: string;
  submittedAt: string | null;
  dueAt: string | null;
  sentAt: string | null;
  filesDeleted: boolean;
  files: ScanFileInfo[];
  report: Report | null;
}

export interface RequestInfo {
  id: string;
  name: string;
  email: string;
  company: string;
  device: string;
  deviceType: string;
  stage: string;
  createdAt: string;
  demo: { wanted: boolean; scheduledAt: string | null; bookingUrl: string };
  scan: ScanInfo | null;
}

export interface NewRequest {
  name: string;
  email: string;
  company: string;
  role?: string;
  device?: string;
  deviceType?: DeviceType | '';
  stage?: Stage | '';
  ai?: boolean;
  message?: string;
  focus?: string;
  demo: boolean;
  scan: boolean;
  permission?: boolean;
  source?: string;
  orgId?: string;
  website?: string;
}

export interface MyRequest {
  id: string;
  token: string;
  company: string;
  createdAt: string;
  demo: { wanted: boolean; scheduledAt: string | null };
  scan: { status: ScanStatus; dueAt: string | null; sentAt: string | null; findings: number | null } | null;
}

export interface StaffRequest {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  device: string;
  deviceType: string;
  stage: string;
  ai: boolean;
  message: string;
  wantsDemo: boolean;
  scheduledAt: string | null;
  status: LeadStatus;
  notes: string;
  source: string;
  signedIn: boolean;
  createdAt: string;
  scan: { id: string; status: ScanStatus; dueAt: string | null } | null;
}

export interface StaffScanItem {
  id: string;
  company: string;
  name: string;
  email: string;
  deviceType: string;
  status: ScanStatus;
  submittedAt: string | null;
  dueAt: string | null;
  sentAt: string | null;
  reviewer: string;
  reviewerIsYou: boolean;
  files: number;
  openFindings: number;
  keptFindings: number;
}

export interface StaffFinding extends ReportFinding {
  fileId: string | null;
  source: 'auto' | 'engineer';
  rule: string;
  status: 'open' | 'kept' | 'dismissed';
  edited: boolean;
}

export interface StaffScanDetail {
  request: {
    id: string;
    name: string;
    email: string;
    company: string;
    role: string;
    device: string;
    deviceType: string;
    stage: string;
    ai: boolean;
    message: string;
    wantsDemo: boolean;
    scheduledAt: string | null;
    createdAt: string;
  };
  scan: {
    id: string;
    status: ScanStatus;
    focus: string;
    submittedAt: string | null;
    dueAt: string | null;
    sentAt: string | null;
    reviewer: string;
    reviewerId: string | null;
    summary: string;
    filesDeleted: boolean;
    coverage: Coverage[];
  };
  files: (ScanFileInfo & { sha256: string })[];
  findings: StaffFinding[];
  report: Report;
}

export type FindingInput = Partial<Pick<StaffFinding, 'severity' | 'area' | 'title' | 'detail' | 'fix' | 'clause' | 'status'>> & { fileId?: string | null };

const enc = encodeURIComponent;

export const requestsApi = {
  config: () => call<PublicConfig>('GET', '/public/config'),
  create: (b: NewRequest) => call<{ token: string }>('POST', '/public/inquiries', b),
  get: (token: string) => call<RequestInfo>('GET', `/public/requests/${enc(token)}`),
  removeFile: (token: string, fileId: string) => call<RequestInfo>('DELETE', `/public/requests/${enc(token)}/files/${enc(fileId)}`),
  submit: (token: string) => call<RequestInfo>('POST', `/public/requests/${enc(token)}/submit`),
  addScan: (token: string, b: { permission: boolean; focus: string }) => call<RequestInfo>('POST', `/public/requests/${enc(token)}/scan`, b),
  scheduled: (token: string) => call<RequestInfo>('POST', `/public/requests/${enc(token)}/scheduled`),
  deleteFiles: (token: string) => call<RequestInfo>('POST', `/public/requests/${enc(token)}/delete-files`),
  mine: () => call<{ requests: MyRequest[] }>('GET', '/requests'),

  staffRequests: (status: 'open' | 'all' | LeadStatus) => call<{ requests: StaffRequest[]; counts: Record<string, number> }>('GET', `/staff/requests?status=${status}`),
  updateRequest: (id: string, b: { status?: LeadStatus; notes?: string }) => call<{ ok: true }>('PATCH', `/staff/requests/${enc(id)}`, b),
  staffScans: (state: 'todo' | 'sent' | 'other' | 'all') => call<{ scans: StaffScanItem[]; counts: Record<string, number> }>('GET', `/staff/scans?state=${state}`),
  staffScan: (id: string) => call<StaffScanDetail>('GET', `/staff/scans/${enc(id)}`),
  claimScan: (id: string) => call<{ ok: true }>('POST', `/staff/scans/${enc(id)}/claim`),
  saveSummary: (id: string, summary: string) => call<{ ok: true }>('PATCH', `/staff/scans/${enc(id)}`, { summary }),
  addFinding: (id: string, b: FindingInput) => call<{ id: string }>('POST', `/staff/scans/${enc(id)}/findings`, b),
  updateFinding: (id: string, findingId: string, b: FindingInput) => call<{ ok: true }>('PATCH', `/staff/scans/${enc(id)}/findings/${enc(findingId)}`, b),
  deleteFinding: (id: string, findingId: string) => call<{ ok: true }>('DELETE', `/staff/scans/${enc(id)}/findings/${enc(findingId)}`),
  sendReport: (id: string) => call<{ ok: true }>('POST', `/staff/scans/${enc(id)}/send`),
  fileUrl: (id: string, fileId: string) => `/api/staff/scans/${enc(id)}/files/${enc(fileId)}`,
};

/** Uploads one file as the raw request body, reporting progress (0–1). */
export function uploadFile(token: string, file: File, onProgress: (p: number) => void): Promise<ScanFileInfo> {
  return new Promise((ok, fail) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/public/requests/${enc(token)}/files?name=${enc(file.name)}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: { error?: string } & Partial<ScanFileInfo> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300) ok(data as ScanFileInfo);
      else fail(new ApiError(xhr.status, data.error ?? `Couldn’t upload ${file.name}.`));
    };
    xhr.onerror = () => fail(new ApiError(0, `Couldn’t upload ${file.name}. Check your connection and try again.`));
    xhr.send(file);
  });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatWhen(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Scheduling link with the requester's details filled in where the service supports it. */
export function bookingLink(url: string, who: { name: string; email: string }, embed = false) {
  try {
    const u = new URL(url);
    if (/(^|\.)calendly\.com$/.test(u.hostname)) {
      u.searchParams.set('name', who.name);
      u.searchParams.set('email', who.email);
      if (embed) {
        u.searchParams.set('embed_domain', window.location.host);
        u.searchParams.set('embed_type', 'Inline');
        u.searchParams.set('hide_gdpr_banner', '1');
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

export const isCalendly = (url: string) => {
  try {
    return /(^|\.)calendly\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

export const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };
export const SCAN_STATUS_LABEL: Record<ScanStatus, string> = {
  uploading: 'Waiting for files',
  received: 'With an engineer',
  in_review: 'With an engineer',
  sent: 'Report ready',
  withdrawn: 'Withdrawn',
};
