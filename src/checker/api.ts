import { ApiError, call } from '../account/api';

export interface Extracted {
  name: string;
  text: string;
  status: 'read' | 'partial' | 'unreadable';
  note: string;
  pages: number | null;
}

export const checkerApi = {
  /** Confirms the signed-in user is Biomedix staff (with two-factor where required). */
  access: () => call<{ ok: true }>('GET', '/staff/checker'),

  /** Reads a Word or PDF file on the server and returns its text. Nothing is stored. */
  async extract(file: File): Promise<Extracted> {
    const res = await fetch(`/api/staff/checker/extract?name=${encodeURIComponent(file.name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    const data = (await res.json().catch(() => ({}))) as Partial<Extracted> & { error?: string; code?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? `Couldn’t read ${file.name}.`, data.code);
    return data as Extracted;
  },
};

/* ---------- Rules switched off in this browser ---------- */

const KEY = 'biomedix.checker.disabled';

export function loadDisabled(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveDisabled(set: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}
