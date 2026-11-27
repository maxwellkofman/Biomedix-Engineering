import { PROCEDURES, TIERS, type Procedure } from '../data/procedures';
import { TOKENS, type Derived, type TokenKey, type TokenValues } from '../intake/derive';
import type { Intake } from '../intake/model';
import { CONTENT, type TemplateCtx } from './content';
import { ASSESSMENT_DOCS } from '../assessments/docs';
import { docProgress, packageDocs, RECORDS, templatesDoc } from '../equipment/docs';
import { kindLabel, PHASE_SUMMARY, PHASE_WHEN } from '../equipment/summary';

/* ---------- Output shapes ---------- */

export type Segment =
  /** `from` names the assessment answer the text came from; `open` marks an item not answered yet. */
  | { kind: 'text'; text: string; from?: string; open?: boolean }
  | { kind: 'token'; key: TokenKey };
export type Block =
  | { kind: 'p'; segs: Segment[] }
  | { kind: 'list'; items: Segment[][] }
  /** Column headings, then rows of cells. widths are percentages for Word. */
  | { kind: 'table'; head: string[]; rows: Segment[][][]; widths?: number[] };

export interface GeneratedSection {
  n: string;
  title: string;
  purpose: string;
  blocks: Block[];
}

export type DocStatus = 'ready' | 'input' | 'na';

/** For documents built from an assessment rather than from setup answers alone. */
export interface DocProgress {
  done: number;
  total: number;
  /** Agent suggestions not yet confirmed, out of all made. */
  suggested: number;
  suggestedTotal: number;
  todo: { label: string; to: string }[];
  /** The assessment page. */
  href: string;
  name: string;
}

export interface GeneratedDoc {
  proc: Procedure;
  tierName: string;
  status: DocStatus;
  /** Why the procedure does not apply (status "na"). */
  reason?: string;
  /** Applies for now, but an unanswered question could rule it out. */
  pending?: string;
  ownerToken: TokenKey;
  header: [string, Segment[]][];
  sections: GeneratedSection[];
  /** Distinct tokens the document uses, and which of those are still missing. */
  used: TokenKey[];
  missing: TokenKey[];
  filledPct: number;
  progress?: DocProgress;
}

/** Open items in a document: missing values plus unfinished assessment items. */
export const openItems = (doc: GeneratedDoc) => doc.missing.length + (doc.progress ? doc.progress.total - doc.progress.done : 0);

export interface Suite {
  docs: GeneratedDoc[];
  applicable: GeneratedDoc[];
  ready: number;
  needsInput: number;
  notApplicable: number;
  filledPct: number;
  /** Each missing value with the documents waiting on it, most-blocking first. */
  missing: { key: TokenKey; docs: string[] }[];
  gateZero: { q: string; segs: Segment[] }[];
}

/* ---------- Parsing ---------- */

const TOKEN_RE = /\{\{(\w+)\}\}/g;

export function parseSegments(text: string): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const key = m[1];
    if (!(key in TOKENS)) throw new Error(`Unknown template token {{${key}}}`);
    if (m.index! > last) segs.push({ kind: 'text', text: text.slice(last, m.index) });
    segs.push({ kind: 'token', key: key as TokenKey });
    last = m.index! + m[0].length;
  }
  if (last < text.length) segs.push({ kind: 'text', text: text.slice(last) });
  return segs;
}

function parseBlocks(text: string): Block[] {
  return text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): Block => {
      const lines = chunk.split('\n');
      if (lines.every((l) => l.startsWith('- '))) {
        return { kind: 'list', items: lines.map((l) => parseSegments(l.slice(2))) };
      }
      return { kind: 'p', segs: parseSegments(chunk.replace(/\n/g, ' ')) };
    });
}

/** A value counts as filled only if it has no [bracketed placeholder] left in it. */
export function isFilled(tokens: TokenValues, key: TokenKey): boolean {
  const v = tokens[key];
  return !!v && !/\[[^\]]+\]/.test(v.value);
}

/* ---------- Applicability ---------- */

export interface Applicability {
  applies: boolean;
  reason?: string;
  pending?: string;
}

function applicability(p: Procedure, ix: Intake, d: Derived): Applicability {
  const needs = (flag: boolean | null, no: string, ask: string): Applicability =>
    flag === false ? { applies: false, reason: no } : flag === null ? { applies: true, pending: ask } : { applies: true };

  switch (p.id) {
    case 'SW-SOP-001':
    case 'S1–S8':
      return needs(d.hasSoftware, 'the device contains no software.', 'Does the device include software?');
    case 'SW-SOP-002': {
      if (d.hasSoftware === false || d.connected === false)
        return { applies: false, reason: 'not a cyber device under section 524B: no software that can connect to networks.' };
      return needs(d.connected, '', 'Does the device connect to networks or other devices?');
    }
    case 'SW-SOP-003':
      return needs(d.ai, 'the device has no AI-enabled device software functions.', 'Does the device use AI or machine learning?');
    case 'SOP-002':
    case 'DHF-T1–7':
      return needs(
        d.designControls,
        'Class I device without software; design controls do not apply under 21 CFR 820.10(c).',
        'What is the device class?',
      );
    case 'SOP-009':
      if (ix.operations.manufacturing === 'none' || d.hasHardware === false)
        return {
          applies: false,
          reason: 'no manufacturing process whose output cannot be fully verified; software builds are verified at release under SOP-008.',
        };
      return d.hasHardware === null ? { applies: true, pending: 'Does the device include hardware?' } : { applies: true };
    case 'CQV-T1–8': {
      const named = ix.equipment.items.length > 0 || !!ix.operations.equipment.trim() || ix.operations.manufacturing === 'in-house';
      if (named || d.hasHardware === true) return { applies: true };
      if (d.hasHardware === false)
        return { applies: false, reason: 'no production, measuring or test equipment is named, and the device has no hardware.' };
      return { applies: true, pending: 'Does the device include hardware?' };
    }
    case 'SOP-015':
      return needs(
        d.hasHardware,
        'software-only device; no monitoring or measuring equipment decides product acceptance.',
        'Does the device include hardware?',
      );
    default:
      return { applies: true };
  }
}

/* ---------- Owners ---------- */

function ownerToken(owner: string): TokenKey {
  const o = owner.toLowerCase();
  if (o.startsWith('ceo /')) return 'mgmtRep';
  if (o === 'ceo') return 'ceo';
  if (o.startsWith('operations')) return 'opsLead';
  if (o.startsWith('engineering')) return 'engLead';
  if (o.startsWith('ml')) return 'mlLead';
  if (o.startsWith('security')) return 'secLead';
  return 'qualityLead';
}

/* ---------- Build ---------- */

export const numberSections = (list: Omit<GeneratedSection, 'n'>[]): GeneratedSection[] =>
  list.map((s, i) => ({ ...s, n: String(i + 1).padStart(2, '0') }));

/** A generated document from its sections: header, used and missing values, status. */
export function assembleDoc(
  p: Procedure,
  a: Applicability,
  owner: TokenKey,
  sections: GeneratedSection[],
  tokens: TokenValues,
  progress?: DocProgress,
  extraHeader: [string, Segment[]][] = [],
): GeneratedDoc {
  const header: [string, Segment[]][] = [
    ['Document', parseSegments(`${p.id} ${p.title}`)],
    ['Organization', parseSegments('{{company}}')],
    ['Device in scope', parseSegments('{{device}}')],
    ...extraHeader,
    ['Revision', parseSegments('A (initial release)')],
    ['Owner', parseSegments(`{{${owner}}}`)],
    ['Approved by', parseSegments(p.g === 'eq' ? '{{qualityLead}}' : '{{mgmtRep}}')],
    ['Basis', parseSegments(p.basis)],
  ];

  const used = new Set<TokenKey>();
  const collect = (segs: Segment[]) => segs.forEach((s) => s.kind === 'token' && used.add(s.key));
  header.forEach(([, segs]) => collect(segs));
  sections.forEach((s) =>
    s.blocks.forEach((b) =>
      b.kind === 'p' ? collect(b.segs) : b.kind === 'list' ? b.items.forEach(collect) : b.rows.forEach((r) => r.forEach(collect)),
    ),
  );
  const usedList = [...used];
  const missing = usedList.filter((k) => !isFilled(tokens, k));
  const parts = usedList.length + (progress?.total ?? 0);
  const filledPct = parts ? Math.round(((usedList.length - missing.length + (progress?.done ?? 0)) / parts) * 100) : 100;

  return {
    proc: p,
    tierName: TIERS.find((t) => t.key === p.g)?.name ?? '',
    status: !a.applies ? 'na' : missing.length || (progress && progress.done < progress.total) ? 'input' : 'ready',
    reason: a.reason,
    pending: a.pending,
    ownerToken: owner,
    header,
    sections,
    used: usedList,
    missing,
    filledPct,
    progress,
  };
}


const genericBody = (purpose: string) =>
  `${purpose}.\n\nScope at {{company}}: {{device}}. Responsible: OWNER.`;

export function buildSuite(ix: Intake, d: Derived, tokens: TokenValues): Suite {
  const app = PROCEDURES.map((p) => ({ p, a: applicability(p, ix, d) }));
  const applicableProcs = app.filter((x) => x.a.applies).map((x) => x.p);
  const excluded = app.filter((x) => !x.a.applies).map((x) => ({ proc: x.p, reason: x.a.reason ?? '' }));


  const docs = app.map(({ p, a }): GeneratedDoc => {
    const owner = ownerToken(p.owner);
    const ctx: TemplateCtx = { ix, d, applicable: applicableProcs, excluded, owner: `{{${owner}}}` };
    const bodies = CONTENT[p.id] ?? [];

    const built = ASSESSMENT_DOCS[p.id]?.({ ix, d, tpl: parseSegments, tplBlocks: parseBlocks });
    const sections = built
      ? numberSections(built.sections)
      : p.id === 'CQV-T1–8'
        ? numberSections(templatesDoc(parseSegments))
        : p.sections.map((s, i) => {
            const body = bodies[i]?.(ctx) ?? genericBody(s.d);
            return {
              n: String(i + 1).padStart(2, '0'),
              title: s.t,
              purpose: s.d,
              blocks: parseBlocks(body.replace(/OWNER/g, `{{${owner}}}`)),
            };
          });
    return assembleDoc(p, a, owner, sections, tokens, built?.progress);
  });

  // One package per piece of equipment, after the fixed procedures.
  for (const e of ix.equipment.items) {
    for (const x of packageDocs(e, parseSegments)) {
      const proc: Procedure = {
        g: 'eq',
        id: x.id,
        title: x.title,
        basis:
          x.phase === 'URS' || x.phase === 'VP'
            ? 'ISO 13485 6.3, 7.5.6, 7.6; 21 CFR 820.10'
            : x.phase === 'PQ'
              ? 'ISO 13485 7.5.6; GHTF SG3/N99-10'
              : 'ISO 13485 6.3, 7.5.6, 7.6; GHTF SG3/N99-10',
        owner: x.owner === 'opsLead' ? 'Operations' : 'Engineering',
        when: PHASE_WHEN[x.phase],
        summary: PHASE_SUMMARY[x.phase],
        sections: [],
        records: RECORDS[x.phase],
        creates: [],
        checks: [],
      };
      docs.push(
        assembleDoc(proc, { applies: true }, x.owner, numberSections(x.sections), tokens, docProgress(x), [
          ['Equipment', parseSegments(`${e.ref} ${e.name.trim() || 'Unnamed equipment'} (${kindLabel(e)})`)],
        ]),
      );
    }
  }

  const applicable = docs.filter((x) => x.status !== 'na');
  const totalUsed = applicable.reduce((n, x) => n + x.used.length + (x.progress?.total ?? 0), 0);
  const totalMissing = applicable.reduce((n, x) => n + x.missing.length + (x.progress ? x.progress.total - x.progress.done : 0), 0);

  const missingMap = new Map<TokenKey, string[]>();
  applicable.forEach((doc) => doc.missing.forEach((k) => missingMap.set(k, [...(missingMap.get(k) ?? []), doc.proc.id])));
  const missing = [...missingMap.entries()]
    .map(([key, ids]) => ({ key, docs: ids }))
    .sort((a, b) => b.docs.length - a.docs.length);

  const gateZero = [
    ['Device software function?', '{{deviceType}}'],
    ['Classification and pathway', '{{deviceClass}} · {{productCode}} · {{pathway}}'],
    ['Do design controls apply?', '{{designControls}}'],
    ['Cyber device under 524B?', '{{cyberStatus}}'],
    ['AI-enabled, and a PCCP?', '{{aiStatus}}; {{pccpStatus}}'],
    ['Documentation level and safety class', '{{docLevel}} · IEC 62304 {{safetyClass}}'],
  ].map(([q, t]) => ({ q, segs: parseSegments(t) }));

  return {
    docs,
    applicable,
    ready: applicable.filter((x) => x.status === 'ready').length,
    needsInput: applicable.filter((x) => x.status === 'input').length,
    notApplicable: docs.length - applicable.length,
    filledPct: totalUsed ? Math.round(((totalUsed - totalMissing) / totalUsed) * 100) : 0,
    missing,
    gateZero,
  };
}

/* ---------- Export ---------- */

function segsToText(segs: Segment[], tokens: TokenValues): string {
  return segs
    .map((s) => {
      if (s.kind === 'text') return s.text;
      const v = tokens[s.key];
      return v ? v.value : `[${TOKENS[s.key].label} — needs input]`;
    })
    .join('');
}

export function docToMarkdown(doc: GeneratedDoc, tokens: TokenValues): string {
  const out: string[] = [`# ${doc.proc.id} ${doc.proc.title}`, ''];
  out.push('| Field | Value |', '| --- | --- |');
  doc.header.forEach(([k, segs]) => out.push(`| ${k} | ${segsToText(segs, tokens).replace(/\|/g, '\\|')} |`));
  out.push('', `> ${doc.proc.summary}`, '');
  out.push('> AI-generated draft. Not effective until technical review and approval are signed.', '');
  doc.sections.forEach((s) => {
    out.push(`## ${s.n}. ${s.title}`, '');
    s.blocks.forEach((b) => {
      if (b.kind === 'p') out.push(segsToText(b.segs, tokens), '');
      else if (b.kind === 'list') {
        b.items.forEach((it) => out.push(`- ${segsToText(it, tokens)}`));
        out.push('');
      } else {
        const cell = (t: string) => t.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ') || ' ';
        out.push(`| ${b.head.map(cell).join(' | ')} |`, `| ${b.head.map(() => '---').join(' | ')} |`);
        b.rows.forEach((r) => out.push(`| ${r.map((c) => cell(segsToText(c, tokens))).join(' | ')} |`));
        out.push('');
      }
    });
  });
  out.push('## Records and forms', '', ...doc.proc.records.map((r) => `- ${r}`), '');
  return out.join('\n');
}

export function suiteToMarkdown(suite: Suite, tokens: TokenValues): string {
  const company = tokens.company?.value ?? '[Company]';
  const device = tokens.device?.value ?? '[Device]';
  const head = [
    `# Documentation suite: ${company} · ${device}`,
    '',
    `${suite.applicable.length} procedures required · ${suite.filledPct}% auto-filled · ${suite.notApplicable} not applicable`,
    '',
  ];
  return [...head, ...suite.applicable.map((d) => docToMarkdown(d, tokens) + '\n---\n')].join('\n');
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
