/**
 * Checks the app's own generated documents. Works from the segments, not the
 * Markdown export, so each finding knows whether its text came from the
 * template (a fix for Biomedix) or from a setup answer (a fix for the customer).
 */
import { TOKENS, type TokenValues } from '../intake/derive.ts';
import { isFilled, type GeneratedDoc, type Segment, type Suite } from '../templates/generate.ts';
import { checkDoc, datedStandardsOf, glossaryOf } from './index.ts';
import type { CheckDoc, CheckOptions, DocType, Report, Span, Unit, UnitKind } from './types.ts';

export function docTypeFor(id: string): DocType {
  if (/^(?:SOP|QM|SW-SOP|WI)-/.test(id)) return 'procedure';
  if (/^DHF-T/.test(id)) return 'requirements';
  if (/^S\d/.test(id)) return 'submission';
  if (/^RMF-/.test(id)) return 'risk';
  if (/^FRM-/.test(id)) return 'record';
  return 'other';
}

function render(segs: Segment[], tokens: TokenValues): { text: string; spans: Span[] } {
  let text = '';
  const spans: Span[] = [];
  for (const s of segs) {
    if (s.kind === 'text') {
      if (s.from) spans.push({ start: text.length, end: text.length + s.text.length, label: s.from, missing: s.open });
      text += s.text;
      continue;
    }
    const v = tokens[s.key];
    const label = TOKENS[s.key].label;
    const start = text.length;
    text += v?.value ?? `[${label}]`;
    spans.push({ start, end: text.length, label, missing: !isFilled(tokens, s.key) });
  }
  return { text, spans };
}

export function docFromGenerated(doc: GeneratedDoc, tokens: TokenValues): CheckDoc {
  const units: Unit[] = [];
  let section = '';
  let tables = 0;
  const add = (kind: UnitKind, segs: Segment[], extra: Partial<Unit> = {}) => {
    const { text, spans } = render(segs, tokens);
    if (!text.trim()) return;
    units.push({ i: units.length, kind, text, section, spans: spans.length ? spans : undefined, ...extra });
  };
  const plain = (text: string): Segment[] => [{ kind: 'text', text }];

  add('title', plain(`${doc.proc.id} ${doc.proc.title}`));
  doc.header.forEach(([name, segs]) => add('field', segs, { col: name }));
  add('p', plain(doc.proc.summary));
  for (const s of doc.sections) {
    section = s.title;
    add('heading', plain(`${s.n}. ${s.title}`), { level: 1 });
    for (const b of s.blocks) {
      if (b.kind === 'p') add('p', b.segs);
      else if (b.kind === 'list') b.items.forEach((it) => add('li', it));
      else {
        const table = tables++;
        b.head.forEach((h, c) => add('cell', plain(h), { col: h, head: true, table, row: 0, c }));
        b.rows.forEach((r, ri) => r.forEach((cell, c) => add('cell', cell, { col: b.head[c] ?? '', table, row: ri + 1, c })));
      }
    }
  }
  section = 'Records and forms';
  add('heading', plain('Records and forms'), { level: 1 });
  doc.proc.records.forEach((r) => add('li', plain(r)));
  return { id: doc.proc.id, title: doc.proc.title, type: docTypeFor(doc.proc.id), format: 'generated', units };
}

/** Every document ID the suite defines: procedures, expanded ranges, and the forms each procedure lists. */
export function suiteIds(suite: Suite): Set<string> {
  const ids = new Set<string>();
  for (const d of suite.docs) {
    const id = d.proc.id;
    ids.add(id);
    const range = /^(DHF-T|S)(\d)–(?:S)?(\d)$/.exec(id);
    if (range) for (let n = Number(range[2]); n <= Number(range[3]); n++) ids.add(`${range[1]}${n}`);
    for (const r of d.proc.records) {
      const m = /^([A-Z]{2,6}(?:-[A-Z]{1,4})?-\d{2,4})\b/.exec(r);
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

export interface SuiteCheck {
  reports: Report[];
  /** Findings in template wording (Biomedix to fix) vs. in setup answers (customer to fix). */
  template: number;
  answers: number;
  open: number;
}

export function checkSuite(suite: Suite, tokens: TokenValues, opts: CheckOptions = {}): SuiteCheck {
  const docs = suite.applicable.map((d) => docFromGenerated(d, tokens));
  const glossary = glossaryOf(docs);
  const datedStandards = datedStandardsOf(docs);
  const knownIds = suiteIds(suite);
  const reports = docs.map((d) => checkDoc(d, { knownIds, glossary, datedStandards, ...opts }));
  let template = 0;
  let answers = 0;
  let open = 0;
  for (const r of reports)
    for (const f of r.findings) {
      if (f.rule === 'open-input') open++;
      else if (f.answer) answers++;
      else template++;
    }
  return { reports, template, answers, open };
}
