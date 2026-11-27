/**
 * Equipment validation answers: one record per piece of equipment, each with
 * its impact assessment and user requirements. Stored with the rest of the
 * project's answers, like the assessments, so they autosave and travel with
 * each saved run.
 */
import { uid, type YN } from '../assessments/model.ts';

export type EqKind = '' | 'measuring' | 'production' | 'environmental' | 'test-system' | 'utility';
export type EqSoftware = '' | 'none' | 'firmware' | 'configurable' | 'custom';
/** Where a requirement is verified. "REL" is the document review before release. */
export type Verify = 'FAT' | 'SAT' | 'IQ' | 'OQ' | 'PQ' | 'REL';
export type Priority = 'essential' | 'desirable';

export interface UserRequirement {
  id: string;
  /** UR-01 style; never reused within the equipment after a requirement is deleted. */
  ref: string;
  /** The suggestion it came from ('' when the team wrote it). */
  key: string;
  section: string;
  text: string;
  criterion: string;
  /** How the protocol tests it. */
  method: string;
  verify: Verify;
  priority: Priority;
}

export interface Equipment {
  id: string;
  /** EQ-001 style; never reused after the equipment is deleted. */
  ref: string;
  /** The setup answer it was suggested from ('' when the team added it). */
  key: string;
  name: string;
  manufacturer: string;
  model: string;
  serial: string;
  /** The company's own asset or equipment ID, if different from the reference. */
  asset: string;
  location: string;
  purpose: string;
  /** Who owns the equipment day to day. */
  owner: string;
  kind: EqKind;
  /** Makes, measures or inspects product, or decides whether product is accepted. */
  product: YN;
  /** Supports a validated process or controlled environment without deciding product quality. */
  supports: YN;
  /** Runs a process whose result isn't fully verified afterwards, or holds product under controlled conditions. */
  pq: YN;
  calibration: YN;
  software: EqSoftware;
  /** Creates or keeps electronic quality records. */
  records: YN;
  fat: YN;
  sat: YN;
  rationale: string;
  pqRuns: string;
  pqSpec: string;
  requirements: UserRequirement[];
  nextReq: number;
  /** Suggested requirements the team removed, so they aren't offered again. */
  dismissed: string[];
}

export interface EquipmentAnswers {
  items: Equipment[];
  /** Equipment suggested from the setup answers that the team removed. */
  dismissed: string[];
  nextRef: number;
}

export const EMPTY_EQUIPMENT: EquipmentAnswers = { items: [], dismissed: [], nextRef: 1 };

export const MAX_EQUIPMENT = 30;

export function newEquipment(ref: string, p: Partial<Equipment> = {}): Equipment {
  return {
    id: uid('eq-'),
    ref,
    key: '',
    name: '',
    manufacturer: '',
    model: '',
    serial: '',
    asset: '',
    location: '',
    purpose: '',
    owner: '',
    kind: '',
    product: '',
    supports: '',
    pq: '',
    calibration: '',
    software: '',
    records: '',
    fat: '',
    sat: '',
    rationale: '',
    pqRuns: '',
    pqSpec: '',
    requirements: [],
    nextReq: 1,
    dismissed: [],
    ...p,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const s = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const yn = (v: unknown): YN => (v === 'yes' || v === 'no' ? v : '');
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const strings = (v: unknown, n: number) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').slice(0, n);
const num = (v: unknown) => /(\d+)$/.exec(typeof v === 'string' ? v : '')?.[1];

export const VERIFY: readonly Verify[] = ['FAT', 'SAT', 'IQ', 'OQ', 'PQ', 'REL'];

/** Stored answers can come from older versions or another browser: keep only well-formed fields. */
export function normalizeEquipment(v: unknown): EquipmentAnswers {
  const e = isObj(v) ? v : {};
  const items = (Array.isArray(e.items) ? e.items : []).filter(isObj).slice(0, MAX_EQUIPMENT);
  const list = items.map((x, i): Equipment => {
    const reqs = (Array.isArray(x.requirements) ? x.requirements : []).filter(isObj).slice(0, 120);
    const requirements = reqs.map(
      (r, k): UserRequirement => ({
        id: s(r.id, 40) || uid('ur-'),
        ref: s(r.ref, 12) || `UR-${String(k + 1).padStart(2, '0')}`,
        key: s(r.key, 60),
        section: s(r.section, 80),
        text: s(r.text, 1000),
        criterion: s(r.criterion, 1000),
        method: s(r.method, 1000),
        verify: pick(r.verify, VERIFY, 'OQ'),
        priority: pick(r.priority, ['essential', 'desirable'] as const, 'essential'),
      }),
    );
    const maxReq = Math.max(0, ...requirements.map((r) => Number(num(r.ref) ?? 0)));
    return {
      id: s(x.id, 40) || uid('eq-'),
      ref: s(x.ref, 12) || `EQ-${String(i + 1).padStart(3, '0')}`,
      key: s(x.key, 120),
      name: s(x.name, 120),
      manufacturer: s(x.manufacturer, 120),
      model: s(x.model, 120),
      serial: s(x.serial, 80),
      asset: s(x.asset, 40),
      location: s(x.location, 160),
      purpose: s(x.purpose, 1000),
      owner: s(x.owner, 160),
      kind: pick(x.kind, ['', 'measuring', 'production', 'environmental', 'test-system', 'utility'] as const, ''),
      product: yn(x.product),
      supports: yn(x.supports),
      pq: yn(x.pq),
      calibration: yn(x.calibration),
      software: pick(x.software, ['', 'none', 'firmware', 'configurable', 'custom'] as const, ''),
      records: yn(x.records),
      fat: yn(x.fat),
      sat: yn(x.sat),
      rationale: s(x.rationale, 2000),
      pqRuns: s(x.pqRuns, 20),
      pqSpec: s(x.pqSpec, 200),
      requirements,
      nextReq: Math.max(typeof x.nextReq === 'number' ? Math.floor(x.nextReq) : 1, maxReq + 1),
      dismissed: strings(x.dismissed, 80),
    };
  });
  // References must stay unique: a hand-edited or merged record could repeat one.
  const seen = new Set<string>();
  for (const x of list) {
    if (seen.has(x.ref)) x.ref = '';
    seen.add(x.ref);
  }
  const maxRef = Math.max(0, ...list.map((x) => Number(num(x.ref) ?? 0)));
  let next = Math.max(typeof e.nextRef === 'number' ? Math.floor(e.nextRef) : 1, maxRef + 1);
  for (const x of list) if (!x.ref) x.ref = `EQ-${String(next++).padStart(3, '0')}`;
  return { items: list, dismissed: strings(e.dismissed, 80), nextRef: next };
}
