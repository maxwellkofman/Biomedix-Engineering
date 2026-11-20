/**
 * Runs the rules over a document and returns findings with where they are,
 * which rule raised them and, for generated documents, whether the text came
 * from the template or from a customer's setup answer.
 */
import { sentences, wordCount } from './parse.ts';
import { STANDARDS } from './catalog.ts';
import { definitions, RULE_BY_ID, RULES, standardHits } from './rules.ts';
import type { Category, CheckDoc, CheckOptions, Finding, Hit, Report, Rule, Sentence, Severity, Unit } from './types.ts';

export * from './types.ts';
export { parseMarkdown, parseText, guessType, guessPathway } from './parse.ts';
export { RULES, RULE_BY_ID } from './rules.ts';
export { CATALOG_DATE } from './catalog.ts';

/** Sections that list rather than require: requirement and style rules skip them. */
const REFERENCE_SECTION = /\b(?:definitions?|terms|abbreviations|acronyms|glossary|references?|revision history|change history|document history|records and forms)\b/i;
const LIGHT: Category[] = ['release', 'citations'];
/** Claims and terms matter in headings and header fields too. */
const EVERYWHERE = new Set(['fda-spelling', 'fda-status-claim', 'promotional', 'qmsr-terms', 'safety-absolute']);

function appliesTo(rule: Rule, u: Unit): boolean {
  if (u.kind === 'title' || u.kind === 'heading' || u.head || u.kind === 'field') return LIGHT.includes(rule.category) || EVERYWHERE.has(rule.id);
  if (REFERENCE_SECTION.test(u.section) && (rule.category === 'requirements' || rule.category === 'clarity')) return false;
  return true;
}

const SEV_ORDER: Record<Severity, number> = { error: 0, warning: 1, note: 2 };

export function checkDoc(doc: CheckDoc, opts: CheckOptions = {}): Report {
  const rules = RULES.filter((r) => !opts.disabled?.has(r.id) && (!r.types || r.types.includes(doc.type)));
  const raw: Finding[] = [];
  let words = 0;
  let nSentences = 0;
  let nReq = 0;

  const push = (rule: Rule, u: Unit, h: Hit) => {
    if (h.end <= h.start) h = { ...h, end: Math.min(u.text.length, h.start + 1) };
    const over = (u.spans ?? []).filter((sp) => h.start < sp.end && h.end > sp.start);
    if (rule.id !== 'open-input' && over.some((sp) => sp.missing)) return; // the missing value is reported once, as an open input
    raw.push({
      rule: rule.id,
      severity: h.severity ?? rule.severity,
      unit: u.i,
      start: h.start,
      end: h.end,
      message: h.message ?? rule.message,
      replace: h.replace,
      answer: over[0]?.label,
    });
  };

  const sentenceRules = rules.filter((r) => r.sentence);
  for (const u of doc.units) {
    if (u.kind === 'p' || u.kind === 'li' || u.kind === 'cell') words += wordCount(u.text);
    const active = sentenceRules.filter((r) => appliesTo(r, u));
    if (!active.length) continue;
    const parts = u.kind === 'cell' && u.head ? [{ text: u.text, offset: 0 }] : sentences(u.text);
    for (const part of parts) {
      const req = /\bshall\b/i.test(part.text) || (doc.type === 'requirements' && /\bmust\b/i.test(part.text));
      const s: Sentence = { unit: u, text: part.text, offset: part.offset, req, words: wordCount(part.text), doc, opts };
      if (u.kind !== 'title' && u.kind !== 'heading' && !u.head) {
        nSentences++;
        if (req) nReq++;
      }
      for (const r of active) {
        if (r.reqOnly && !req) continue;
        for (const h of r.sentence!(s)) push(r, u, { ...h, start: h.start + part.offset, end: h.end + part.offset });
      }
    }
  }

  for (const r of rules) {
    if (!r.doc) continue;
    for (const h of r.doc(doc, opts)) {
      const u = doc.units[h.unit];
      if (u && (r.id === 'open-input' || r.category === 'structure' || r.category === 'consistency' || appliesTo(r, u) || r.id === 'empty-section')) push(r, u, h);
    }
  }

  // One finding per rule per place.
  const findings: Finding[] = [];
  const key = (f: Finding) => `${f.rule}:${f.unit}`;
  const byPlace = new Map<string, Finding[]>();
  for (const f of raw) {
    const list = byPlace.get(key(f)) ?? [];
    if (list.some((g) => f.start < g.end && f.end > g.start)) continue;
    list.push(f);
    byPlace.set(key(f), list);
    findings.push(f);
  }
  findings.sort((a, b) => a.unit - b.unit || a.start - b.start || SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

  const counts: Record<Severity, number> = { error: 0, warning: 0, note: 0 };
  findings.forEach((f) => counts[f.severity]++);
  return {
    doc: { id: doc.id, title: doc.title, type: doc.type, format: doc.format },
    units: doc.units,
    findings,
    counts,
    stats: { words, sentences: nSentences, requirements: nReq },
  };
}

/** Acronyms defined anywhere in a set of documents, so each document can lean on the set's definitions. */
export function glossaryOf(docs: CheckDoc[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of docs) for (const [acr, v] of definitions(d)) if (!out.has(acr)) out.set(acr, v.long);
  return out;
}

/** Standards whose edition at least one document in the set gives. */
export function datedStandardsOf(docs: CheckDoc[]): Set<string> {
  const out = new Set<string>();
  for (const d of docs) for (const u of d.units) for (const h of standardHits(u.text)) if (h.year && STANDARDS[h.num]) out.add(h.num);
  return out;
}

/* ---------- Summaries and exports ---------- */

export interface RuleTally {
  rule: string;
  name: string;
  category: Category;
  severity: Severity;
  count: number;
  docs: number;
  fromAnswers: number;
}

export function tally(reports: Report[]): RuleTally[] {
  const m = new Map<string, RuleTally & { docSet: Set<string> }>();
  for (const r of reports)
    for (const f of r.findings) {
      const rule = RULE_BY_ID.get(f.rule)!;
      const t = m.get(f.rule) ?? { rule: f.rule, name: rule.name, category: rule.category, severity: rule.severity, count: 0, docs: 0, fromAnswers: 0, docSet: new Set<string>() };
      t.count++;
      if (f.answer) t.fromAnswers++;
      t.docSet.add(r.doc.id ?? r.doc.title);
      t.docs = t.docSet.size;
      if (SEV_ORDER[f.severity] < SEV_ORDER[t.severity]) t.severity = f.severity;
      m.set(f.rule, t);
    }
  return [...m.values()]
    .map(({ docSet: _d, ...t }) => t)
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.count - a.count);
}

export function excerpt(u: Unit, f: Pick<Finding, 'start' | 'end'>, pad = 70): { before: string; hit: string; after: string } {
  const a = Math.max(0, f.start - pad);
  const b = Math.min(u.text.length, f.end + pad);
  const cutA = a > 0 ? u.text.indexOf(' ', a) + 1 || a : 0;
  const cutB = b < u.text.length ? u.text.lastIndexOf(' ', b) : u.text.length;
  return {
    before: (cutA > 0 ? '…' : '') + u.text.slice(cutA, f.start),
    hit: u.text.slice(f.start, f.end),
    after: u.text.slice(f.end, Math.max(f.end, cutB)) + (cutB < u.text.length ? '…' : ''),
  };
}

const csvCell = (v: string | number | undefined) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportsToCsv(reports: Report[]): string {
  const head = ['Document', 'Title', 'Section', 'Line', 'Severity', 'Rule', 'Category', 'Text', 'Finding', 'Suggested wording', 'From answer', 'Source'];
  const rows = reports.flatMap((r) =>
    r.findings.map((f) => {
      const u = r.units[f.unit];
      const rule = RULE_BY_ID.get(f.rule)!;
      return [r.doc.id ?? '', r.doc.title, u.section, u.line ?? '', f.severity, rule.name, rule.category, u.text.slice(f.start, f.end), f.message, f.replace ?? '', f.answer ?? '', rule.source];
    }),
  );
  return [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function reportToMarkdown(r: Report): string {
  const out = [`# Document check: ${r.doc.id ? `${r.doc.id} ` : ''}${r.doc.title}`, '', `${r.counts.error} must fix · ${r.counts.warning} should fix · ${r.counts.note} to consider`, ''];
  for (const f of r.findings) {
    const u = r.units[f.unit];
    const rule = RULE_BY_ID.get(f.rule)!;
    const x = excerpt(u, f, 50);
    out.push(
      `- **${f.severity.toUpperCase()} · ${rule.name}**${u.section ? ` (${u.section})` : ''}: ${f.message}`,
      `  > ${x.before}**${x.hit}**${x.after}`,
      ...(f.replace ? [`  Suggested: ${f.replace}`] : []),
      ...(f.answer ? [`  From the setup answer: ${f.answer}`] : []),
      `  Source: ${rule.source}`,
    );
  }
  return out.join('\n') + '\n';
}
