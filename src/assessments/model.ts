/**
 * Answers for the two assessments: the 21 CFR Part 11 assessment (FRM-019)
 * and the ISO 14971 risk assessment (RMF-001). They are stored with the rest
 * of the project's answers, so they autosave, travel with each saved run and
 * stay in this browser when signed out.
 */

export type YN = '' | 'yes' | 'no';

/* ---------- Part 11 ---------- */

export type P11Result = '' | 'met' | 'partial' | 'gap' | 'na';
export type P11Impact = '' | 'high' | 'medium' | 'low';

export interface P11Answer {
  result: P11Result;
  /** How the control is met, what falls short, or why it doesn't apply. */
  evidence: string;
  /** For a partial or gap: what will be done about it. */
  action: string;
  owner: string;
  due: string;
  /** A partial control under FDA enforcement discretion, accepted on the system's documented risk. */
  accepted: boolean;
  /** Drafted from a known system profile and not yet confirmed by the customer. */
  suggested: boolean;
}

export interface P11System {
  id: string;
  /** Profile the suggestions came from ('' for a system the customer added). */
  preset: string;
  name: string;
  use: string;
  /** Holds records that FDA regulations or ISO 13485 require (predicate rules). */
  records: YN;
  /** The electronic record is the one relied on, rather than a signed paper copy. */
  relied: YN;
  /** Applies electronic signatures in place of handwritten ones. */
  signatures: YN;
  /** Access is controlled by someone other than the people responsible for the records (11.30). */
  open: YN;
  impact: P11Impact;
  /** The scope answers were drafted from a profile and not yet confirmed. */
  suggestedScope: boolean;
  answers: Record<string, P11Answer>;
}

export interface Part11Answers {
  systems: P11System[];
  /** Suggested systems the customer removed, so they aren't offered again. */
  dismissed: string[];
  /** Company-wide controls, answered once. */
  company: Record<string, P11Answer>;
}

export const EMPTY_P11_ANSWER: P11Answer = {
  result: '',
  evidence: '',
  action: '',
  owner: '',
  due: '',
  accepted: false,
  suggested: false,
};

export const EMPTY_PART11: Part11Answers = { systems: [], dismissed: [], company: {} };

/* ---------- Risk ---------- */

export type ControlType = '' | 'design' | 'protective' | 'information';

export interface RiskControl {
  id: string;
  ref: string;
  text: string;
  type: ControlType;
  /** Where implementation is verified (e.g. a test or inspection record). */
  implemented: string;
  /** Where effectiveness is verified. */
  effective: string;
}

export interface Hazard {
  id: string;
  /** H-001 style reference; never reused after a hazard is deleted. */
  ref: string;
  /** The suggestion it came from ('' if the customer added it). */
  key: string;
  category: string;
  hazard: string;
  sequence: string;
  situation: string;
  harm: string;
  /** Caused by a software failure: the failure's probability is taken as 1 (SOP-003). */
  software: boolean;
  /** 1–5, 0 until rated. */
  severity: number;
  probability: number;
  controls: RiskControl[];
  nextControl: number;
  residualSeverity: number;
  residualProbability: number;
  /** Controls reviewed for new hazards or effects on other risks (ISO 14971 7.6). */
  newRisks: YN;
  /** Benefit-risk rationale when the residual risk isn't acceptable (ISO 14971 7.4). */
  benefit: string;
  /** Design inputs or requirements the controls trace to. */
  link: string;
}

export type Zone = 'A' | 'R' | 'U';

export interface RiskAnswers {
  /** 25 zones, severity 1–5 by probability 1–5, row by row. Empty means the default matrix. */
  matrix: string;
  hazards: Hazard[];
  /** Suggested hazards the customer removed. */
  dismissed: string[];
  nextRef: number;
  overall: {
    method: string;
    benefits: string;
    disclosure: string;
    conclusion: '' | 'acceptable' | 'not-acceptable';
  };
}

export const EMPTY_RISK: RiskAnswers = {
  matrix: '',
  hazards: [],
  dismissed: [],
  nextRef: 1,
  overall: { method: '', benefits: '', disclosure: '', conclusion: '' },
};

/* ---------- Helpers ---------- */

/** Short random id. Works outside secure contexts, unlike crypto.randomUUID. */
export function uid(prefix = ''): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return prefix + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const s = (v: unknown, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');
const n = (v: unknown) => (typeof v === 'number' && v >= 0 && v <= 5 ? Math.round(v) : 0);
const yn = (v: unknown): YN => (v === 'yes' || v === 'no' ? v : '');
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

function answer(v: unknown): P11Answer {
  const a = isObj(v) ? v : {};
  return {
    result: pick(a.result, ['', 'met', 'partial', 'gap', 'na'] as const, ''),
    evidence: s(a.evidence),
    action: s(a.action),
    owner: s(a.owner, 200),
    due: s(a.due, 40),
    accepted: a.accepted === true,
    suggested: a.suggested === true,
  };
}

const answers = (v: unknown) =>
  Object.fromEntries(Object.entries(isObj(v) ? v : {}).map(([k, x]) => [k.slice(0, 40), answer(x)]));

/** Stored answers can come from older versions or another browser: keep only well-formed fields. */
export function normalizePart11(v: unknown): Part11Answers {
  const p = isObj(v) ? v : {};
  const systems = (Array.isArray(p.systems) ? p.systems : []).filter(isObj).slice(0, 40);
  return {
    systems: systems.map((x) => ({
      id: s(x.id, 40) || uid('sys-'),
      preset: s(x.preset, 80),
      name: s(x.name, 120),
      use: s(x.use, 400),
      records: yn(x.records),
      relied: yn(x.relied),
      signatures: yn(x.signatures),
      open: yn(x.open),
      impact: pick(x.impact, ['', 'high', 'medium', 'low'] as const, ''),
      suggestedScope: x.suggestedScope === true,
      answers: answers(x.answers),
    })),
    dismissed: (Array.isArray(p.dismissed) ? p.dismissed : []).filter((x): x is string => typeof x === 'string').slice(0, 80),
    company: answers(p.company),
  };
}

export function normalizeRisk(v: unknown): RiskAnswers {
  const r = isObj(v) ? v : {};
  const hazards = (Array.isArray(r.hazards) ? r.hazards : []).filter(isObj).slice(0, 200);
  const o = isObj(r.overall) ? r.overall : {};
  const matrix = typeof r.matrix === 'string' && /^[ARU]{25}$/.test(r.matrix) ? r.matrix : '';
  const list = hazards.map((h, i) => {
    const controls = (Array.isArray(h.controls) ? h.controls : []).filter(isObj).slice(0, 20);
    return {
      id: s(h.id, 40) || uid('hz-'),
      ref: s(h.ref, 20) || `H-${String(i + 1).padStart(3, '0')}`,
      key: s(h.key, 60),
      category: s(h.category, 60),
      hazard: s(h.hazard, 600),
      sequence: s(h.sequence, 1200),
      situation: s(h.situation, 600),
      harm: s(h.harm, 600),
      software: h.software === true,
      severity: n(h.severity),
      probability: n(h.probability),
      controls: controls.map((c, k) => ({
        id: s(c.id, 40) || uid('rc-'),
        ref: s(c.ref, 24) || `${s(h.ref, 20).replace(/^H/, 'RC')}.${k + 1}`,
        text: s(c.text, 800),
        type: pick(c.type, ['', 'design', 'protective', 'information'] as const, ''),
        implemented: s(c.implemented, 200),
        effective: s(c.effective, 200),
      })),
      nextControl: typeof h.nextControl === 'number' && h.nextControl > controls.length ? Math.floor(h.nextControl) : controls.length + 1,
      residualSeverity: n(h.residualSeverity),
      residualProbability: n(h.residualProbability),
      newRisks: yn(h.newRisks),
      benefit: s(h.benefit, 2000),
      link: s(h.link, 200),
    };
  });
  const maxRef = Math.max(0, ...list.map((h) => Number(/(\d+)$/.exec(h.ref)?.[1] ?? 0)));
  return {
    matrix,
    hazards: list,
    dismissed: (Array.isArray(r.dismissed) ? r.dismissed : []).filter((x): x is string => typeof x === 'string').slice(0, 80),
    nextRef: Math.max(typeof r.nextRef === 'number' ? Math.floor(r.nextRef) : 1, maxRef + 1),
    overall: {
      method: s(o.method, 3000),
      benefits: s(o.benefits, 3000),
      disclosure: s(o.disclosure, 3000),
      conclusion: pick(o.conclusion, ['', 'acceptable', 'not-acceptable'] as const, ''),
    },
  };
}
