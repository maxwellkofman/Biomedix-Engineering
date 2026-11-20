/**
 * Command-line document checker, for checking the generator's output (and any
 * Markdown or text file) against the writing rules in src/validate.
 *
 *   npm run check:docs                     # example device, summary
 *   npm run check:docs -- --details        # every finding
 *   npm run check:docs -- --blank          # template text with no answers
 *   npm run check:docs -- --intake my.json # answers from a file (an Intake, or { intake })
 *   npm run check:docs -- --file draft.md  # any Markdown or text file
 *   npm run check:docs -- --csv out.csv    # write all findings as CSV
 *   npm run check:docs -- --fail-on warning
 *   npm run check:docs -- --self-test      # each rule's example: the bad text is flagged, the good one isn't
 *
 * Exits 1 when template wording (not setup answers) has a finding at or above
 * --fail-on (default: error), so it can run in CI.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { derive, resolveTokens } from '../src/intake/derive.ts';
import { EMPTY_INTAKE, EXAMPLE_INTAKE, mergeIntake, type Intake } from '../src/intake/model.ts';
import { buildSuite } from '../src/templates/generate.ts';
import { checkSuite } from '../src/validate/generated.ts';
import { checkDoc, excerpt, guessPathway, parseMarkdown, parseText, reportsToCsv, RULE_BY_ID, RULES, tally, type Report, type Severity } from '../src/validate/index.ts';

// Piping into `head` closes stdout early; that's not an error.
process.stdout.on('error', (err: NodeJS.ErrnoException) => process.exit(err.code === 'EPIPE' ? 0 : 1));

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const RANK: Record<Severity, number> = { error: 0, warning: 1, note: 2 };
const failOn = (value('fail-on') ?? 'error') as Severity | 'none';
const tty = process.stdout.isTTY;
const c = (code: string, s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n - 1) + '…' : s + ' '.repeat(n - s.length));
const SEV = { error: c('31', 'error  '), warning: c('33', 'warning'), note: c('2', 'note   ') };

if (flag('self-test')) {
  let failed = 0;
  for (const rule of RULES) {
    if (!rule.example) continue;
    const disabled = new Set(RULES.filter((r) => r.id !== rule.id).map((r) => r.id));
    const run = (text: string) => {
      const doc = parseText(`Example\n\n${text}`);
      doc.type = rule.types?.[0] ?? 'procedure';
      return checkDoc(doc, { disabled, pathway: rule.id === 'fda-status-claim' ? '510k' : '' }).findings.length;
    };
    const bad = run(rule.example.bad);
    const good = rule.example.good === '(delete)' ? 0 : run(rule.example.good);
    const pass = bad > 0 && good === 0;
    if (!pass) failed++;
    console.log(`${pass ? c('32', 'pass') : c('31', 'FAIL')}  ${pad(rule.id, 22)} bad: ${bad} finding${bad === 1 ? '' : 's'}, good: ${good}`);
  }
  console.log(failed ? c('31', `${failed} rule example${failed === 1 ? '' : 's'} failed`) : c('32', 'Every rule example behaves.'));
  process.exit(failed ? 1 : 0);
}

let reports: Report[];
let gateCount = 0;

const file = value('file');
if (file) {
  const text = readFileSync(file, 'utf8');
  const doc = /\.(md|markdown)$/i.test(file) ? parseMarkdown(text, file) : parseText(text, file);
  reports = [checkDoc(doc, { pathway: guessPathway(text) })];
  gateCount = reports[0].findings.filter((f) => failOn !== 'none' && RANK[f.severity] <= RANK[failOn]).length;
} else {
  let ix: Intake = flag('blank') ? EMPTY_INTAKE : EXAMPLE_INTAKE;
  const path = value('intake');
  if (path) {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { intake?: Partial<Intake> } & Partial<Intake>;
    ix = mergeIntake(raw.intake ?? raw);
  }
  const d = derive(ix);
  const tokens = resolveTokens(ix, d);
  const suite = buildSuite(ix, d, tokens);
  const res = checkSuite(suite, tokens, { pathway: ix.regulatory.pathway });
  reports = res.reports;
  gateCount = reports.reduce(
    (n, r) => n + r.findings.filter((f) => f.rule !== 'open-input' && !f.answer && failOn !== 'none' && RANK[f.severity] <= RANK[failOn]).length,
    0,
  );
  console.log(
    `${c('1', `${ix.company.name || 'Blank answers'} · ${ix.device.name || 'no device'}`)}: ${reports.length} documents · ${res.template} findings in template wording · ${res.answers} in setup answers · ${res.open} values still needed\n`,
  );
}

console.log(c('2', `${pad('Document', 44)}${pad('Errors', 8)}${pad('Warnings', 10)}Notes`));
for (const r of reports) console.log(`${pad(`${r.doc.id ?? ''} ${r.doc.title}`.trim(), 44)}${pad(String(r.counts.error), 8)}${pad(String(r.counts.warning), 10)}${r.counts.note}`);

console.log(`\n${c('1', 'By rule')}`);
for (const t of tally(reports)) console.log(`  ${SEV[t.severity]}  ${pad(t.name, 46)}${pad(String(t.count), 6)}${c('2', `${t.docs} doc${t.docs === 1 ? '' : 's'}${t.fromAnswers ? `, ${t.fromAnswers} from answers` : ''}`)}`);

if (flag('details')) {
  const only = value('rule');
  for (const r of reports) {
    const list = r.findings.filter((f) => !only || f.rule === only);
    if (!list.length) continue;
    console.log(`\n${c('1', `${r.doc.id ?? ''} ${r.doc.title}`.trim())}`);
    for (const f of list) {
      const u = r.units[f.unit];
      const x = excerpt(u, f, 45);
      console.log(`  ${SEV[f.severity]}  ${RULE_BY_ID.get(f.rule)!.name}${u.section ? c('2', ` · ${u.section}`) : ''}${f.answer ? c('36', ` · answer: ${f.answer}`) : ''}`);
      console.log(`           ${x.before}${c('7', x.hit)}${x.after}`);
      console.log(`           ${c('2', f.message)}${f.replace ? c('32', ` → ${f.replace}`) : ''}`);
    }
  }
}

const csv = value('csv');
if (csv) {
  writeFileSync(csv, reportsToCsv(reports));
  console.log(`\nWrote ${csv}`);
}

if (gateCount && failOn !== 'none') {
  console.log(`\n${c('31', `${gateCount} finding${gateCount === 1 ? '' : 's'} at or above “${failOn}”${file ? '' : ' in template wording'}.`)}`);
  process.exit(1);
}
