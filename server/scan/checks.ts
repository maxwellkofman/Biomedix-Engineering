/**
 * Automated gap checks run over the files a company shares for a gap scan.
 * These are deterministic rules, not a model: they find likely gaps (untraced
 * requirements, risk controls without verification, untestable wording, missing
 * report elements) so the engineer starts from a list. Every finding is held
 * until an engineer keeps or dismisses it; customers only see the reviewed set.
 */
import type { ReadResult, Table } from './extract.ts';

export type DocKind = 'requirements' | 'trace' | 'risk' | 'test' | 'procedure' | 'other';
export type Severity = 'high' | 'medium' | 'low';
export type DeviceType = 'samd' | 'hardware-software' | 'hardware' | 'ivd' | 'unsure' | '';

export const KIND_LABEL: Record<DocKind, string> = {
  requirements: 'Requirements',
  trace: 'Trace matrix',
  risk: 'Risk file',
  test: 'Test report',
  procedure: 'Procedure',
  other: 'Other',
};

export interface ScanFile {
  id: string;
  name: string;
  read: ReadResult;
  kind: DocKind;
}

export interface AutoFinding {
  rule: string;
  severity: Severity;
  area: string;
  title: string;
  detail: string;
  fix: string;
  clause: string;
  fileId: string | null;
}

export interface Coverage {
  area: string;
  files: string[];
  note: string;
}

export interface Context {
  deviceType: DeviceType;
  ai: boolean;
}

const hasSoftware = (t: DeviceType) => t === 'samd' || t === 'hardware-software' || t === 'ivd' || t === 'unsure' || t === '';
const hasHardware = (t: DeviceType) => t !== 'samd';

const Q = {
  inputs: 'ISO 13485:2016 §7.3.3 (21 CFR 820.10)',
  trace: 'ISO 13485:2016 §7.3.2(f) and §7.3.6',
  verification: 'ISO 13485:2016 §7.3.6 (21 CFR 820.10)',
  docs: 'ISO 13485:2016 §4.2.4',
};

/* ---------- Helpers ---------- */

const ID_RE = /\b[A-Z][A-Z0-9]{0,9}(?:[-_][A-Z0-9]{1,8})*[-_]\d{1,5}(?:\.\d{1,3})*\b/g;
const TEST_PREFIX = /^(TC|TP|TR|VT|VER|VP|VR|TST|TEST|VAL|VV|IQ|OQ|PQ|UT|IT|ST|AT)[-_]/;
const RISK_PREFIX = /^(HAZ|HZ|H|RC|RCM|RISK|RSK|FM|FMEA|HS|HA|MIT|CTRL)[-_]/;
const CONTROL_PREFIX = /^(RC|RCM|MIT|CTRL)[-_]/;
const MAX_EXAMPLES = 6;

function ids(s: string) {
  return s.match(ID_RE) ?? [];
}

function examples(lines: string[], max = MAX_EXAMPLES) {
  const shown = lines.slice(0, max).map((l) => `- ${l.length > 180 ? `${l.slice(0, 177)}…` : l}`);
  if (lines.length > max) shown.push(`- …and ${lines.length - max} more`);
  return shown.join('\n');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function sentences(text: string) {
  return text
    .split(/\n|(?<=[.;])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const empty = (v: string | undefined) => !v || /^(-|–|—|n\/?a|none|tbd|tbc|\?|x)$/i.test(v.trim());

/* ---------- Tables ---------- */

type Col = 'id' | 'text' | 'verif' | 'result' | 'risk' | 'hazard' | 'harm' | 'severity' | 'probability' | 'control' | 'effectiveness' | 'residual';

const TRACE_ORDER: [Col, RegExp][] = [
  ['result', /result|status|outcome|verdict|pass ?\/ ?fail/i],
  ['verif', /verif|test|protocol|evidence|method/i],
  ['risk', /risk|hazard|\bhaz\b/i],
  ['id', /(^|\s|_)(id|#|no\.?|number|ref(erence)?|key)$|^(id|ref|#)\b/i],
  ['text', /requirement|description|design input|user need|statement|text|title|specification|name/i],
];
const RISK_ORDER: [Col, RegExp][] = [
  ['residual', /residual|post[- ]?(mitigation|control)|after control|final risk/i],
  ['severity', /^s$|^sev\.?$|severity/i],
  ['probability', /^[po]$|^occ\.?$|probab|occurrence|likelihood|frequency/i],
  ['effectiveness', /effectiveness|verification|verified|evidence/i],
  ['control', /control|mitigat|countermeasure|measure/i],
  ['hazard', /hazard|failure mode|hazardous situation|cause|sequence of events/i],
  ['harm', /harm|effect|consequence|injury/i],
  ['id', /(^|\s|_)(id|#|no\.?|ref)$|^(id|ref|#)\b/i],
];

function mapHeader(cells: string[], order: [Col, RegExp][]) {
  const map = new Map<Col, number>();
  cells.forEach((cell, i) => {
    if (!cell || cell.length > 60) return;
    for (const [key, re] of order) {
      if (map.has(key)) continue;
      if (re.test(cell)) {
        map.set(key, i);
        return;
      }
    }
  });
  return map;
}

interface Header {
  row: number;
  cols: Map<Col, number>;
}

function findHeader(t: Table, order: [Col, RegExp][], need: (m: Map<Col, number>) => boolean): Header | null {
  let best: Header | null = null;
  for (let r = 0; r < Math.min(t.rows.length, 15); r++) {
    const cols = mapHeader(t.rows[r], order);
    if (need(cols) && (!best || cols.size > best.cols.size)) best = { row: r, cols };
  }
  return best;
}

const traceHeader = (t: Table) => findHeader(t, TRACE_ORDER, (m) => m.has('verif') && (m.has('id') || m.has('text')));
const riskHeader = (t: Table) => findHeader(t, RISK_ORDER, (m) => (m.has('hazard') || m.has('harm')) && (m.has('severity') || m.has('probability') || m.has('control')));

interface Row {
  label: string;
  get: (c: Col) => string;
}

function dataRows(t: Table, h: Header): Row[] {
  const out: Row[] = [];
  for (let r = h.row + 1; r < t.rows.length; r++) {
    const cells = t.rows[r];
    const get = (c: Col) => (h.cols.has(c) ? (cells[h.cols.get(c)!] ?? '').trim() : '');
    const filled = cells.filter(Boolean).length;
    if (filled < 2) continue; // section headings and blank rows
    const id = get('id');
    const text = get('text') || get('hazard');
    const label = [id, text].filter(Boolean).join(': ') || `${t.sheet} row ${r + 1}`;
    out.push({ label: label.length > 140 ? `${label.slice(0, 137)}…` : label, get });
  }
  return out;
}

/* ---------- Classification ---------- */

const NAME_HINTS: [DocKind, RegExp][] = [
  ['trace', /trace|rtm|matrix/i],
  ['risk', /risk|fmea|hazard|14971|\bpha\b|\bfta\b|\bhaz/i],
  ['test', /test|verif|v&v|vnv|protocol|\breport\b|\btr[-_ ]?\d|validation/i],
  ['requirements', /requirement|\bsrs\b|\bprd\b|\burs\b|\bspec|design[-_ ]?input|user[-_ ]?need|\bsysrs\b|\breq/i],
  ['procedure', /\bsop\b|procedure|work[-_ ]?instruction|policy|manual|\bwi[-_ ]?\d/i],
];

function count(text: string, re: RegExp) {
  return (text.match(re) ?? []).length;
}

export function classify(name: string, read: ReadResult): DocKind {
  if (read.status === 'unreadable') return NAME_HINTS.find(([, re]) => re.test(name))?.[0] ?? 'other';
  if (read.tables.some((t) => riskHeader(t))) return 'risk';
  if (read.tables.some((t) => traceHeader(t)) && !/report|protocol/i.test(name)) return 'trace';
  const text = read.text.slice(0, 400_000);
  const words = Math.max(200, text.split(/\s+/).length);
  const per = (n: number) => (n * 1000) / words;
  const score: Record<DocKind, number> = {
    requirements: per(count(text, /\bshall\b/gi)) + per(count(text, /\b(user needs?|design inputs?|requirements?)\b/gi)) * 0.5,
    trace: per(count(text, /\btrac(e|eability)\b/gi)) * 2,
    risk: per(count(text, /\b(hazard(ous)?|harm|severity|probability|occurrence|risk control|mitigation|rpn|fmea)\b/gi)),
    test: per(count(text, /\b(test case|expected result|actual result|acceptance criteria|pass(ed)?|fail(ed)?|protocol|test procedure)\b/gi)),
    procedure: per(count(text, /\b(purpose|scope|responsibilit(y|ies)|records?|procedure)\b/gi)) * 0.6,
    other: 1.5,
  };
  for (const [kind, re] of NAME_HINTS) if (re.test(name)) score[kind] += 4;
  return (Object.entries(score) as [DocKind, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

/* ---------- Rules ---------- */

const VAGUE = [
  'user-friendly', 'user friendly', 'easy', 'easily', 'intuitive', 'intuitively', 'fast', 'quick', 'quickly', 'rapid', 'rapidly',
  'appropriate', 'appropriately', 'adequate', 'adequately', 'sufficient', 'sufficiently', 'reasonable', 'reasonably', 'as needed',
  'as required', 'as appropriate', 'if possible', 'where possible', 'etc', 'and/or', 'robust', 'seamless', 'seamlessly',
  'state of the art', 'state-of-the-art', 'minimal', 'optimal', 'efficient', 'flexible', 'high quality', 'user-centric',
];
const VAGUE_RE = new RegExp(`(?<![\\w-])(${VAGUE.map((v) => v.replace(/[/-]/g, '\\$&').replace(/ /g, '\\s+')).join('|')})(?![\\w-])`, 'i');
const MEASURE_RE = /\d+(\.\d+)?\s?(ms|s|sec|seconds?|min|minutes?|h|hrs?|hours?|%|mm|cm|m|km|kg|g|mg|µg|ug|ml|mL|l|°C|°F|C|V|mV|mA|A|W|Hz|kHz|bpm|dB|days?|weeks?|months?|years?|cycles?|N|kPa|mmHg|clicks?|steps?|taps?)\b/;
const PLACEHOLDER_RE = /\b(TBD|TBC|TBA|TODO|FIXME)\b|\bto be (determined|confirmed|defined|decided)\b|\[(insert|add|tbd)[^\]]*\]|\?\?\?|\bX{3,}\b|\bXX%/i;

function requirementStatements(f: ScanFile) {
  const out: { id: string; text: string }[] = [];
  if (f.kind === 'trace') {
    for (const t of f.read.tables) {
      const h = traceHeader(t);
      if (!h) continue;
      for (const r of dataRows(t, h)) {
        const text = r.get('text');
        if (text) out.push({ id: r.get('id'), text });
      }
    }
    return out;
  }
  for (const s of sentences(f.read.text)) {
    if (!/\b(shall|must)\b/i.test(s) || s.length < 15) continue;
    out.push({ id: ids(s).find((x) => !TEST_PREFIX.test(x) && !RISK_PREFIX.test(x)) ?? '', text: s });
  }
  return out;
}

function vagueTerms(f: ScanFile): AutoFinding | null {
  const hits: string[] = [];
  for (const r of requirementStatements(f)) {
    const m = VAGUE_RE.exec(r.text);
    if (!m || MEASURE_RE.test(r.text)) continue;
    const text = r.id && r.text.startsWith(r.id) ? r.text.slice(r.id.length).replace(/^[\s:|.–-]+/, '') : r.text;
    hits.push(`${r.id ? `${r.id}: ` : ''}“${text.length > 140 ? `${text.slice(0, 137)}…` : text}” (“${m[1].toLowerCase()}”)`);
  }
  if (!hits.length) return null;
  return {
    rule: 'vague-terms',
    severity: 'medium',
    area: 'Design inputs',
    title: `${plural(hits.length, 'requirement')} can’t be verified as written`,
    detail: `These use words a tester can’t measure, and give no value or unit to check against:\n${examples(hits)}`,
    fix: 'Rewrite each as a measurable criterion with a value, unit and condition, for example “within 2 s of detection” instead of “quickly”.',
    clause: Q.inputs,
    fileId: f.id,
  };
}

function placeholders(f: ScanFile): AutoFinding | null {
  const lines = f.read.text.split('\n').filter((l) => PLACEHOLDER_RE.test(l));
  if (!lines.length) return null;
  const key = f.kind === 'requirements' || f.kind === 'trace' ? 'inputs' : f.kind === 'test' ? 'verification' : f.kind === 'risk' ? 'risk' : 'docs';
  const AREA: Record<string, string> = { inputs: 'Design inputs', verification: 'Verification', risk: 'Risk management', docs: 'Document control' };
  const CLAUSE: Record<string, string> = { inputs: Q.inputs, verification: Q.verification, risk: 'ISO 14971:2019 §4.5', docs: Q.docs };
  return {
    rule: 'placeholders',
    severity: f.kind === 'other' || f.kind === 'procedure' ? 'low' : 'medium',
    area: AREA[key],
    title: `${plural(lines.length, 'placeholder')} still open`,
    detail: `Items marked TBD, TBC or left as placeholders:\n${examples(lines)}`,
    fix: 'Resolve each placeholder, or record it as an open item with an owner and due date before the next design review.',
    clause: CLAUSE[key],
    fileId: f.id,
  };
}

function traceTables(f: ScanFile): AutoFinding[] {
  const out: AutoFinding[] = [];
  const noVerif: string[] = [];
  const noResult: string[] = [];
  const failed: string[] = [];
  const dup = new Map<string, Set<string>>();
  let rows = 0;
  let hasResultCol = false;
  for (const t of f.read.tables) {
    const h = traceHeader(t);
    if (!h) continue;
    hasResultCol ||= h.cols.has('result');
    for (const r of dataRows(t, h)) {
      if (!r.get('id') && !r.get('text')) continue;
      rows++;
      const id = r.get('id');
      if (id) dup.set(id, (dup.get(id) ?? new Set()).add(r.get('text')));
      const v = r.get('verif');
      if (empty(v)) {
        noVerif.push(r.label);
        continue;
      }
      if (!h.cols.has('result')) continue;
      const res = r.get('result');
      if (/\b(fail(ed)?|not met|nok|no[- ]go|rejected)\b/i.test(res)) failed.push(`${r.label} (${res})`);
      else if (empty(res) || /\b(pending|in progress|not (yet )?(run|tested|executed|started)|open|blocked|planned|scheduled)\b/i.test(res)) noResult.push(r.label);
    }
  }
  if (!rows) return out;
  if (noVerif.length)
    out.push({
      rule: 'trace-no-verification',
      severity: 'high',
      area: 'Traceability',
      title: `${plural(noVerif.length, 'requirement')} of ${rows} ${noVerif.length === 1 ? 'has' : 'have'} no verification linked`,
      detail: `No test, inspection or analysis is linked to:\n${examples(noVerif)}`,
      fix: 'Link each requirement to the test or analysis that verifies it. If one is verified by inspection or by design, say so in the matrix.',
      clause: Q.trace,
      fileId: f.id,
    });
  if (failed.length)
    out.push({
      rule: 'trace-failed',
      severity: 'high',
      area: 'Verification',
      title: `${plural(failed.length, 'verification')} failed`,
      detail: `The matrix records a failed result for:\n${examples(failed)}`,
      fix: 'Record the action for each failure (design change, retest or justified deviation) and link the evidence before the gate.',
      clause: Q.verification,
      fileId: f.id,
    });
  if (noResult.length)
    out.push({
      rule: 'trace-no-result',
      severity: 'medium',
      area: 'Verification',
      title: `${plural(noResult.length, 'linked verification')} ${noResult.length === 1 ? 'has' : 'have'} no recorded result`,
      detail: `A test is linked but the result is empty or pending:\n${examples(noResult)}`,
      fix: 'Record the result and point to the signed report for each, or mark it as planned with a target date.',
      clause: Q.verification,
      fileId: f.id,
    });
  if (!hasResultCol)
    out.push({
      rule: 'trace-no-result-column',
      severity: 'low',
      area: 'Verification',
      title: 'The trace matrix doesn’t record verification results',
      detail: 'Tests are linked, but there is no result or status column, so the matrix can’t show which requirements are verified.',
      fix: 'Add a result column (pass, fail, not run) with a reference to the report, so the matrix shows readiness at a glance.',
      clause: Q.verification,
      fileId: f.id,
    });
  const dupes = [...dup].filter(([, texts]) => texts.size > 1).map(([id]) => id);
  if (dupes.length)
    out.push({
      rule: 'trace-duplicate-ids',
      severity: 'medium',
      area: 'Traceability',
      title: `${plural(dupes.length, 'ID')} used for different requirements`,
      detail: `The same ID points to more than one requirement:\n${examples(dupes)}`,
      fix: 'Give each requirement a unique, permanent ID, and never reuse an ID after a requirement is deleted.',
      clause: Q.trace,
      fileId: f.id,
    });
  return out;
}

function riskTables(f: ScanFile): AutoFinding[] {
  const out: AutoFinding[] = [];
  const noSev: string[] = [];
  const noProb: string[] = [];
  const noEff: string[] = [];
  let rows = 0;
  let effCol = false;
  let probCol = false;
  for (const t of f.read.tables) {
    const h = riskHeader(t);
    if (!h) continue;
    effCol ||= h.cols.has('effectiveness');
    probCol ||= h.cols.has('probability');
    for (const r of dataRows(t, h)) {
      if (!r.get('hazard') && !r.get('harm')) continue;
      rows++;
      if (h.cols.has('severity') && empty(r.get('severity'))) noSev.push(r.label);
      if (h.cols.has('probability') && empty(r.get('probability'))) noProb.push(r.label);
      if (h.cols.has('effectiveness') && !empty(r.get('control')) && empty(r.get('effectiveness'))) noEff.push(r.label);
    }
  }
  if (!rows) return out;
  if (noSev.length)
    out.push({
      rule: 'risk-no-severity',
      severity: 'high',
      area: 'Risk management',
      title: `${plural(noSev.length, 'hazard')} ${noSev.length === 1 ? 'has' : 'have'} no severity`,
      detail: `Severity of harm isn’t estimated for:\n${examples(noSev)}`,
      fix: 'Estimate the severity of the harm for each hazardous situation using the scale defined in your risk management plan.',
      clause: 'ISO 14971:2019 §5.5',
      fileId: f.id,
    });
  if (noProb.length)
    out.push({
      rule: 'risk-no-probability',
      severity: 'medium',
      area: 'Risk management',
      title: `${plural(noProb.length, 'hazard')} ${noProb.length === 1 ? 'has' : 'have'} no probability`,
      detail: `Probability of occurrence of harm isn’t estimated for:\n${examples(noProb)}`,
      fix: 'Estimate the probability for each, or record the rationale where it can’t be estimated (ISO 14971 allows this if justified).',
      clause: 'ISO 14971:2019 §5.5',
      fileId: f.id,
    });
  if (noEff.length)
    out.push({
      rule: 'risk-no-effectiveness',
      severity: 'high',
      area: 'Risk management',
      title: `${plural(noEff.length, 'risk control')} without verification of effectiveness`,
      detail: `A control is listed but no evidence shows it works:\n${examples(noEff)}`,
      fix: 'Link each control to the test or analysis that verifies it is implemented and effective.',
      clause: 'ISO 14971:2019 §7.2',
      fileId: f.id,
    });
  if (!effCol)
    out.push({
      rule: 'risk-no-effectiveness-column',
      severity: 'medium',
      area: 'Risk management',
      title: 'The risk table doesn’t record verification of risk controls',
      detail: 'There is no column for how each risk control was verified, so implementation and effectiveness can’t be traced from this file.',
      fix: 'Add a column linking each control to its verification (test ID or report), and keep it current as tests complete.',
      clause: 'ISO 14971:2019 §7.2',
      fileId: f.id,
    });
  if (!probCol && rows)
    out.push({
      rule: 'risk-no-probability-column',
      severity: 'low',
      area: 'Risk management',
      title: 'The risk table doesn’t estimate probability',
      detail: 'Only severity is recorded. Risk acceptability normally combines severity and probability of harm.',
      fix: 'Add probability (before and after controls), or document in the plan why risk is evaluated on severity alone.',
      clause: 'ISO 14971:2019 §5.5 and §4.4',
      fileId: f.id,
    });
  return out;
}

function riskElements(files: ScanFile[], ctx: Context): AutoFinding[] {
  const risk = files.filter((f) => f.kind === 'risk' && f.read.status !== 'unreadable');
  if (!risk.length) return [];
  const text = risk.map((f) => f.read.text).join('\n');
  const one = risk.length === 1 ? risk[0].id : null;
  const where = risk.length === 1 ? 'the risk file' : 'the risk files';
  const checks: { rule: string; re: RegExp; severity: Severity; title: string; fix: string; clause: string; when?: boolean }[] = [
    {
      rule: 'risk-acceptability',
      re: /acceptab|risk matrix|risk acceptance|risk evaluation criteria/i,
      severity: 'high',
      title: 'No criteria for risk acceptability',
      fix: 'Define acceptability criteria in the risk management plan (for example a severity × probability matrix) and evaluate each risk against them.',
      clause: 'ISO 14971:2019 §4.4 and §6',
    },
    {
      rule: 'risk-effectiveness',
      re: /effectiveness/i,
      severity: 'high',
      title: 'No verification of risk control effectiveness',
      fix: 'For each risk control, record how its implementation and effectiveness were verified and link the evidence.',
      clause: 'ISO 14971:2019 §7.2',
    },
    {
      rule: 'risk-use-error',
      re: /use error|use-related|usability|human factors|62366|misuse|user error|foreseeable/i,
      severity: 'medium',
      title: 'No use-related hazards',
      fix: 'Add hazards from use error and reasonably foreseeable misuse, fed by your use specification and usability engineering file.',
      clause: 'ISO 14971:2019 §5.2; IEC 62366-1',
    },
    {
      rule: 'risk-overall',
      re: /overall residual risk|overall risk/i,
      severity: 'medium',
      title: 'No evaluation of overall residual risk',
      fix: 'Evaluate overall residual risk against the method and criteria in your plan, and record the conclusion in the risk management report.',
      clause: 'ISO 14971:2019 §8',
    },
    {
      rule: 'risk-benefit',
      re: /benefit[- ]?(\/ ?)?risk|risk[- ]?(\/ ?)?benefit|benefits? (outweigh|of the device)/i,
      severity: 'medium',
      title: 'No benefit-risk analysis',
      fix: 'Where a residual risk isn’t acceptable on its own, record why the medical benefits outweigh it.',
      clause: 'ISO 14971:2019 §7.4 and §8',
    },
    {
      rule: 'risk-post-production',
      re: /post-?production|production and post|post-?market|complaints?|field (data|information|feedback)/i,
      severity: 'medium',
      title: 'No production and post-production feedback',
      fix: 'Describe how complaints, service and field data feed back into the risk file, and who reviews them.',
      clause: 'ISO 14971:2019 §10',
    },
    {
      rule: 'risk-security',
      re: /cyber|security|threat|vulnerab|unauthori[sz]ed|attack/i,
      severity: 'medium',
      title: 'No security risks in the risk file',
      fix: 'Run a threat model and link security risks and their controls into the risk file. Cyber devices need this in the premarket submission.',
      clause: 'FD&C Act §524B; FDA premarket cybersecurity guidance',
      when: hasSoftware(ctx.deviceType),
    },
    {
      rule: 'risk-plan',
      re: /risk management plan/i,
      severity: 'low',
      title: 'No risk management plan found',
      fix: 'Share the plan with the next scan, or write one: scope, responsibilities, acceptability criteria, verification and post-production activities.',
      clause: 'ISO 14971:2019 §4.4',
    },
  ];
  return checks
    .filter((c) => c.when !== false && !c.re.test(text))
    .map((c) => ({
      rule: c.rule,
      severity: c.severity,
      area: c.rule === 'risk-security' ? 'Cybersecurity' : 'Risk management',
      title: c.title,
      detail: `We didn’t find this in ${where}. It may live in a document you didn’t share.`,
      fix: c.fix,
      clause: c.clause,
      fileId: one,
    }));
}

function testElements(f: ScanFile, ctx: Context): AutoFinding[] {
  const text = f.read.text;
  if (f.read.status === 'unreadable' || text.length < 200) return [];
  const out: AutoFinding[] = [];
  const add = (rule: string, severity: Severity, title: string, fix: string, clause = Q.verification, detail = 'We didn’t find this in the report.') =>
    out.push({ rule, severity, area: 'Verification', title, detail, fix, clause, fileId: f.id });
  const software = hasSoftware(ctx.deviceType);
  if (!/acceptance criteri|pass(\s*\/\s*fail)? criteri|expected (result|outcome|value)|success criteri|specification limit/i.test(text))
    add('test-acceptance', 'high', 'No acceptance criteria', 'State the acceptance criterion for each test case before it runs, traced to the requirement it verifies.');
  const lines = text.split('\n');
  const fails = lines.filter((l) => /\b(fail(ed)?|not met|did not meet)\b(?!\s?-?\s?(safe|over|soft))/i.test(l) && !/pass\s*\/\s*fail|fail\s*\/\s*pass|if .* fail/i.test(l));
  if (!/\b(pass(ed)?|fail(ed)?|met|not met|conforms?|complies)\b/i.test(text))
    add('test-no-results', 'high', 'No recorded results', 'Record the actual result and a pass or fail verdict for each test case.');
  else if (fails.length) {
    const handled = /deviation|anomal|nonconform|\bcapa\b|retest|re-test|root cause|investigat|corrective/i.test(text);
    add(
      'test-failed',
      handled ? 'medium' : 'high',
      `${plural(fails.length, 'failed result')}${handled ? '' : ' with no recorded action'}`,
      'Record the disposition of each failure (fix and retest, or a justified deviation) and link it from the trace matrix.',
      Q.verification,
      `${handled ? 'Check each failure has an action recorded:' : 'Failures with no deviation, investigation or retest recorded:'}\n${examples(fails)}`,
    );
  }
  if (!/serial|\blot\b|batch|part (number|no)|\bp\/n\b|revision|\brev\.?\s?[a-z0-9]|version|\bbuild\b|firmware|\bsw\b ?v|\bv\d+\.\d+/i.test(text))
    add(
      'test-item-id',
      'medium',
      software ? 'The software version tested isn’t identified' : 'The test article isn’t identified',
      software ? 'Record the software version or build tested and the test configuration.' : 'Record serial or lot numbers and the design revision of the units tested.',
      software ? 'IEC 62304 §5.7.5; ISO 13485:2016 §7.3.6' : Q.verification,
    );
  if (hasHardware(ctx.deviceType) && ctx.deviceType !== '' && !/sample size|\bn\s?=\s?\d|number of (samples|units|devices|specimens)|(units|samples|devices) (were )?tested|statistical|confidence/i.test(text))
    add('test-sample-size', 'medium', 'No sample size or rationale', 'State how many units were tested and why that number is enough (statistical rationale or a referenced standard).');
  if (!/(tested|performed|executed|conducted|run|verified) by|tester|operator|signature|signed|approved by|reviewed by|prepared by/i.test(text))
    add('test-who', 'medium', 'Who ran the test isn’t recorded', 'Record who performed the test and who reviewed the results, with dates.', software ? 'IEC 62304 §5.7.5; ISO 13485:2016 §7.3.6' : Q.verification);
  if (!/\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/. ](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/. ,]+(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2},? (19|20)\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.](19|20)?\d{2}\b/i.test(text))
    add('test-date', 'low', 'No test dates', 'Record the date each test was run.', software ? 'IEC 62304 §5.7.5' : Q.verification);
  if (!/deviation|anomal|nonconform|discrepanc|exception/i.test(text))
    add('test-deviations', 'low', 'No deviations section', 'Add a deviations section, and say “none” when there were none, so a reviewer knows it was considered.');
  if (!/conclusion|summary|overall result|disposition/i.test(text))
    add('test-conclusion', 'low', 'No conclusion', 'End with a conclusion stating whether the design output meets the input requirements tested.');
  return out;
}

function requirementsDoc(f: ScanFile): AutoFinding[] {
  const reqs = requirementStatements(f);
  if (f.kind !== 'requirements' || reqs.length < 5) return [];
  const out: AutoFinding[] = [];
  const noId = reqs.filter((r) => !r.id);
  if (noId.length / reqs.length > 0.4)
    out.push({
      rule: 'req-no-ids',
      severity: 'medium',
      area: 'Traceability',
      title: `${plural(noId.length, 'requirement')} ${noId.length === 1 ? 'has' : 'have'} no ID`,
      detail: `Requirements without an ID can’t be traced to verification:\n${examples(noId.map((r) => r.text))}`,
      fix: 'Give every requirement a unique ID (for example SRS-012) and use it in the trace matrix and test protocols.',
      clause: Q.trace,
      fileId: f.id,
    });
  const compound = reqs.filter((r) => (r.text.match(/\b(shall|must)\b/gi) ?? []).length > 1);
  if (compound.length)
    out.push({
      rule: 'req-compound',
      severity: 'low',
      area: 'Design inputs',
      title: `${plural(compound.length, 'statement')} combine${compound.length === 1 ? 's' : ''} several requirements`,
      detail: `Each of these holds more than one “shall”, so one test can pass part of it:\n${examples(compound.map((r) => r.text))}`,
      fix: 'Split them so each requirement can be verified and traced on its own.',
      clause: Q.inputs,
      fileId: f.id,
    });
  return out;
}

function crossFile(files: ScanFile[]): AutoFinding[] {
  const out: AutoFinding[] = [];
  const read = files.filter((f) => f.read.status !== 'unreadable');
  const trace = read.filter((f) => f.kind === 'trace');
  const reqDocs = read.filter((f) => f.kind === 'requirements');
  const tests = read.filter((f) => f.kind === 'test');
  const risks = read.filter((f) => f.kind === 'risk');
  const traceIds = new Set(trace.flatMap((f) => ids(f.read.text)));

  if (trace.length && reqDocs.length) {
    const reqIds = [...new Set(reqDocs.flatMap((f) => requirementStatements(f).map((r) => r.id).filter(Boolean)))];
    const missing = reqIds.filter((id) => !traceIds.has(id));
    if (missing.length && reqIds.length)
      out.push({
        rule: 'req-not-in-trace',
        severity: 'high',
        area: 'Traceability',
        title: `${plural(missing.length, 'requirement')} of ${reqIds.length} ${missing.length === 1 ? 'is' : 'are'} missing from the trace matrix`,
        detail: `These IDs appear in ${reqDocs.map((f) => f.name).join(', ')} but not in ${trace.map((f) => f.name).join(', ')}:\n${examples(missing)}`,
        fix: 'Add each to the matrix with its verification, or mark it deleted in the requirements document.',
        clause: Q.trace,
        fileId: reqDocs.length === 1 ? reqDocs[0].id : null,
      });
  }

  if (trace.length && tests.length) {
    const testText = tests.map((f) => f.read.text).join('\n');
    const testIds = new Set(ids(testText).filter((x) => TEST_PREFIX.test(x)));
    if (testIds.size) {
      const referenced = [...new Set(trace.flatMap((f) => ids(f.read.text).filter((x) => TEST_PREFIX.test(x))))];
      const missing = referenced.filter((id) => !testIds.has(id));
      if (missing.length)
        out.push({
          rule: 'trace-test-not-found',
          severity: 'medium',
          area: 'Verification',
          title: `${plural(missing.length, 'linked test')} not found in the reports shared`,
          detail: `The trace matrix links these, but none of the test reports mention them:\n${examples(missing)}`,
          fix: 'Check the reports exist and are approved, or correct the IDs in the matrix. If they’re in reports you didn’t share, ignore this.',
          clause: Q.verification,
          fileId: trace.length === 1 ? trace[0].id : null,
        });
    }
  }

  if (risks.length && (trace.length || tests.length)) {
    const controls = [...new Set(risks.flatMap((f) => ids(f.read.text).filter((x) => CONTROL_PREFIX.test(x))))];
    const evidence = [...trace, ...tests].map((f) => f.read.text).join('\n');
    const missing = controls.filter((id) => !evidence.includes(id));
    if (missing.length)
      out.push({
        rule: 'risk-control-untraced',
        severity: 'medium',
        area: 'Risk management',
        title: `${plural(missing.length, 'risk control')} not traced to verification`,
        detail: `These controls appear in the risk file but not in the trace matrix or test reports:\n${examples(missing)}`,
        fix: 'Trace each risk control to the requirement that implements it and the test that verifies it.',
        clause: 'ISO 14971:2019 §7.2',
        fileId: risks.length === 1 ? risks[0].id : null,
      });
  }
  return out;
}

function softwareChecks(files: ScanFile[], ctx: Context): AutoFinding[] {
  if (!hasSoftware(ctx.deviceType)) return [];
  const design = files.filter((f) => f.read.status !== 'unreadable' && ['requirements', 'trace', 'risk', 'test'].includes(f.kind));
  if (!design.length) return [];
  const text = files.map((f) => f.read.text).join('\n');
  const out: AutoFinding[] = [];
  const detail = 'We didn’t find this in any file you shared. It may live in a document you didn’t share.';
  if (!/62304|software safety class|safety classification|class [abc]\b|documentation level|basic documentation|enhanced documentation|level of concern/i.test(text))
    out.push({
      rule: 'sw-safety-class',
      severity: 'medium',
      area: 'Software',
      title: 'No software safety class or documentation level',
      detail,
      fix: 'Classify the software (IEC 62304 class A, B or C) and decide FDA’s documentation level (Basic or Enhanced); both set how much evidence you need.',
      clause: 'IEC 62304 §4.3; FDA guidance on device software functions (2023)',
      fileId: null,
    });
  if (!/\bSOUP\b|off[- ]the[- ]shelf|\bOTS\b|third[- ]party (software|librar|component)|open[- ]source|\bSBOM\b|software bill of materials/i.test(text))
    out.push({
      rule: 'sw-soup',
      severity: 'medium',
      area: 'Software',
      title: 'No SOUP list or software bill of materials',
      detail,
      fix: 'List every third-party and open-source component with its version and known anomalies. Cyber devices must include an SBOM in the submission.',
      clause: 'IEC 62304 §8.1.2; FD&C Act §524B(b)(3)',
      fileId: null,
    });
  if (!/known (residual )?anomal|unresolved anomal|known (issues|defects|bugs)|bug list|defect list|open defects/i.test(text))
    out.push({
      rule: 'sw-anomalies',
      severity: 'low',
      area: 'Software',
      title: 'No list of known anomalies',
      detail,
      fix: 'Keep a list of unresolved anomalies with an evaluation of each one’s effect on safety, and include it at release.',
      clause: 'IEC 62304 §5.8.2',
      fileId: null,
    });
  if (ctx.ai && !/training (data|set)|test (data|set)|tuning (data|set)|dataset|data partition|model (card|version)|\bPCCP\b|predetermined change|subgroup|bias|drift|performance monitoring/i.test(text))
    out.push({
      rule: 'ai-model-evidence',
      severity: 'low',
      area: 'AI',
      title: 'No model development or data management evidence',
      detail,
      fix: 'Document training, tuning and test data sources and partitioning, subgroup performance, and how the model is monitored after release; consider a PCCP for planned updates.',
      clause: 'FDA guidance on AI-enabled device software functions; FDA PCCP guidance',
      fileId: null,
    });
  return out;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function runChecks(files: ScanFile[], ctx: Context): { findings: AutoFinding[]; coverage: Coverage[] } {
  const findings: AutoFinding[] = [];
  for (const f of files) {
    if (f.read.status === 'unreadable') continue;
    if (f.kind === 'requirements' || f.kind === 'trace') {
      const v = vagueTerms(f);
      if (v) findings.push(v);
    }
    const p = placeholders(f);
    if (p) findings.push(p);
    if (f.kind === 'trace') findings.push(...traceTables(f));
    if (f.kind === 'risk') findings.push(...riskTables(f));
    if (f.kind === 'test') findings.push(...testElements(f, ctx));
    findings.push(...requirementsDoc(f));
  }
  findings.push(...riskElements(files, ctx), ...crossFile(files), ...softwareChecks(files, ctx));
  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const by = (k: DocKind) => files.filter((f) => f.kind === k).map((f) => f.name);
  const AREAS: { area: string; kinds: DocKind[]; missing: string }[] = [
    { area: 'Requirements and design inputs', kinds: ['requirements'], missing: 'Not shared, so wording and completeness of requirements weren’t checked.' },
    { area: 'Traceability', kinds: ['trace'], missing: 'No trace matrix shared, so links from requirements to verification weren’t checked.' },
    { area: 'Risk management', kinds: ['risk'], missing: 'No risk file shared, so hazards and risk controls weren’t checked.' },
    { area: 'Verification', kinds: ['test'], missing: 'No test reports shared, so verification evidence wasn’t checked.' },
    { area: 'Procedures', kinds: ['procedure'], missing: 'No procedures shared.' },
  ];
  const coverage: Coverage[] = AREAS.map((a) => {
    const names = a.kinds.flatMap(by);
    return { area: a.area, files: names, note: names.length ? '' : a.missing };
  });
  const other = by('other');
  if (other.length) coverage.push({ area: 'Other documents', files: other, note: 'Read by an engineer; automated checks only looked for open placeholders.' });
  return { findings, coverage };
}
