/**
 * /staff/checker — the internal document checker. Runs the writing rules in
 * src/validate over generated documents, pasted or uploaded drafts (including
 * text from a model), and shows each finding in place with the rule behind it.
 */
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../account/api';
import { AppShell } from '../../components/AppShell';
import { Button } from '../../components/Button';
import { checkerApi, loadDisabled, saveDisabled } from '../../checker/api';
import { DocTable, download, ReportView, RuleTable, SeverityChip } from '../../checker/Results';
import { derive, resolveTokens } from '../../intake/derive';
import { useIntake } from '../../intake/IntakeContext';
import { EMPTY_INTAKE, EXAMPLE_INTAKE } from '../../intake/model';
import { buildSuite } from '../../templates/generate';
import { checkSuite, docTypeFor } from '../../validate/generated.ts';
import {
  CATALOG_DATE,
  CATEGORY_LABEL,
  checkDoc,
  DOC_TYPE_LABEL,
  guessPathway,
  parseMarkdown,
  parseText,
  PATHWAY_LABEL,
  reportsToCsv,
  reportToMarkdown,
  RULES,
  tally,
  type Category,
  type DocType,
  type Pathway,
} from '../../validate/index.ts';
import { Blocked, StaffNav } from './Staff';
import '../../styles/app.css';
import '../../styles/flow.css';
import '../../styles/account.css';
import '../../styles/org.css';
import '../../styles/clean.css';
import '../../styles/checker.css';

type Tab = 'suite' | 'paste' | 'rules';
const TABS: { key: Tab; label: string }[] = [
  { key: 'suite', label: 'Generated documents' },
  { key: 'paste', label: 'Paste or upload a draft' },
  { key: 'rules', label: 'Rules' },
];

const SAMPLE = `Sure! Here is a draft SOP for complaint handling that you can customize for your organization.

# SOP-042 Complaint Handling

## 1. Purpose

It is important to note that this procedure covers complaints about our revolutionary, FDA-approved ECG patch, which is 100% accurate.

## 2. Scope

Applies to all complaints, including but not limited to emails, calls, etc.

## 3. Procedure

- Complaints should be logged in a timely manner and reviewed periodically.
- The complaint handler shall record the complaint and shall notify the Quality Lead.
- It shall be closed as appropriate.
- MDRs are filed within 30 days per 21 CFR 820.198 and 21 CFR 803.50.
- E-signatures meet 21 CFR 11.10(l); the complaint system is Part 11 compliant software.
- The DHF and DMR are updated under the Quality System Regulation.
- Management review records are not available to FDA investigators.
- FDA guidance requires a PCCP for every AI/ML-based SaMD.
- Risk is estimated per ISO 14971:2007 from the probability of the hazard.
- Records are retained for [insert retention period].

I hope this helps! Let me know if you need anything else.
`;

const looksLikeMarkdown = (t: string) => /^#{1,6}\s|^\s*\|.*\|\s*$|^\s*[-*]\s/m.test(t);

export function StaffChecker() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'suite') as Tab;
  const [blocked, setBlocked] = useState<Error | null>(null);
  const [disabled, setDisabled] = useState<Set<string>>(() => loadDisabled());
  const location = useLocation();
  const handoff = location.state as { text?: string; title?: string; docId?: string } | null;

  useEffect(() => {
    checkerApi.access().catch((err: Error) => setBlocked(err));
  }, []);
  useEffect(() => {
    if (handoff?.text && tab !== 'paste') setParams({ tab: 'paste' }, { replace: true });
    // Only on arrival from a review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (blocked) return <Blocked error={blocked instanceof ApiError ? blocked : new Error(blocked.message)} />;

  const toggleRule = (id: string) => {
    const next = new Set(disabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDisabled(next);
    saveDisabled(next);
  };

  return (
    <AppShell>
      <main className="app-main dash-main chk-main">
        <div className="stack home-head__copy">
          <span className="eyebrow">BIOMEDIX · INTERNAL</span>
          <h1 className="home-head__title">Document checker</h1>
          <p className="setup-main__blurb">
            Checks drafts against FDA and QMSR wording, regulation and standard citations, and requirement-writing rules from INCOSE, EARS and ISO/IEC/IEEE 29148. It
            is a rule set, not a model: every finding names its rule and source, and an engineer decides.
          </p>
        </div>
        <StaffNav />
        <nav className="button-row button-row--tight" aria-label="Checker">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`pill${tab === t.key ? ' pill--active' : ''}`} aria-pressed={tab === t.key} onClick={() => setParams({ tab: t.key }, { replace: true })}>
              {t.label}
            </button>
          ))}
        </nav>
        {disabled.size > 0 && tab !== 'rules' && (
          <p className="text-muted-sm">
            {disabled.size} rule{disabled.size === 1 ? ' is' : 's are'} switched off in this browser.{' '}
            <button type="button" className="chk-link" onClick={() => setParams({ tab: 'rules' }, { replace: true })}>
              Change
            </button>
          </p>
        )}
        {tab === 'suite' && <SuiteTab disabled={disabled} />}
        {tab === 'paste' && <PasteTab disabled={disabled} handoff={handoff} />}
        {tab === 'rules' && <RulesTab disabled={disabled} onToggle={toggleRule} />}
      </main>
    </AppShell>
  );
}

/* ---------- Generated documents ---------- */

type SuiteSource = 'example' | 'workspace' | 'blank';

function SuiteTab({ disabled }: { disabled: Set<string> }) {
  const workspace = useIntake();
  const hasWorkspace = !!(workspace.intake.company.name || workspace.intake.device.name);
  const [source, setSource] = useState<SuiteSource>(hasWorkspace ? 'workspace' : 'example');
  const [open, setOpen] = useState<string | null>(null);
  const [rule, setRule] = useState<string | null>(null);

  const check = useMemo(() => {
    if (source === 'workspace')
      return { check: checkSuite(workspace.suite, workspace.tokens, { pathway: workspace.intake.regulatory.pathway, disabled }), ix: workspace.intake };
    const ix = source === 'blank' ? EMPTY_INTAKE : EXAMPLE_INTAKE;
    const d = derive(ix);
    const tokens = resolveTokens(ix, d);
    return { check: checkSuite(buildSuite(ix, d, tokens), tokens, { pathway: ix.regulatory.pathway, disabled }), ix };
  }, [source, workspace.suite, workspace.tokens, workspace.intake, disabled]);

  const rows = useMemo(() => tally(check.check.reports), [check]);
  const report = open ? check.check.reports.find((r) => r.doc.id === open) : null;
  const label =
    source === 'blank' ? 'Blank answers (template text only)' : `${check.ix.company.name || 'Unnamed company'} · ${check.ix.device.name || 'unnamed device'}`;

  return (
    <div className="stack chk-tab">
      <div className="chk-toolbar">
        <label className="chk-select">
          <span>Check the documents generated for</span>
          <select
            className="input input--sm"
            value={source}
            onChange={(e) => {
              setSource(e.target.value as SuiteSource);
              setOpen(null);
            }}
          >
            {hasWorkspace && (
              <option value="workspace">
                This workspace: {workspace.intake.company.name || 'unnamed'} · {workspace.intake.device.name || 'unnamed device'}
              </option>
            )}
            <option value="example">Example device (Example Cardio, ECG patch)</option>
            <option value="blank">Blank answers (template text only)</option>
          </select>
        </label>
        <Button size="sm" variant="outline" onClick={() => download(`document-check-${source}.csv`, reportsToCsv(check.check.reports), 'text/csv')}>
          Download all findings (CSV)
        </Button>
      </div>

      {report ? (
        <>
          <div className="button-row button-row--tight chk-back">
            <Button size="sm" variant="text" onClick={() => setOpen(null)}>
              ← All documents
            </Button>
            <span className="text-muted-sm">{label}</span>
          </div>
          <h2 className="card__title">
            <span className="mono">{report.doc.id}</span> {report.doc.title}
          </h2>
          <ReportView
            report={report}
            generated
            rule={rule}
            onClearRule={() => setRule(null)}
            toolbar={
              <Button size="sm" variant="outline" onClick={() => download(`${report.doc.id}-check.md`, reportToMarkdown(report), 'text/markdown')}>
                Download (Markdown)
              </Button>
            }
          />
        </>
      ) : (
        <>
          <section className="chk-tiles" aria-label="Where the findings are">
            <div className="chk-tile">
              <strong>{check.check.template}</strong>
              <span>in template wording</span>
              <span className="text-muted-sm">Biomedix fixes these in the templates</span>
            </div>
            <div className="chk-tile">
              <strong>{check.check.answers}</strong>
              <span>in setup answers</span>
              <span className="text-muted-sm">The customer’s own text</span>
            </div>
            <div className="chk-tile">
              <strong>{check.check.open}</strong>
              <span>values still needed</span>
              <span className="text-muted-sm">Blanks the setup answers leave</span>
            </div>
          </section>
          <div className="admin-grid chk-grid">
            <section className="card card--compact stack" aria-labelledby="chk-docs-h">
              <div className="outline__head">
                <h2 id="chk-docs-h" className="card__title card__title--sm">
                  {check.check.reports.length} documents{rule ? ` with “${rows.find((r) => r.rule === rule)?.name ?? rule}”` : ''}
                </h2>
                {rule && (
                  <button type="button" className="chk-link text-muted-sm" onClick={() => setRule(null)}>
                    Show all
                  </button>
                )}
              </div>
              <DocTable check={check.check} rule={rule} onOpen={setOpen} />
            </section>
            <section className="card card--compact stack" aria-labelledby="chk-rules-h">
              <h2 id="chk-rules-h" className="card__title card__title--sm">
                By rule
              </h2>
              <p className="text-muted-sm">Pick a rule to see the documents it flags.</p>
              <RuleTable rows={rows} onPick={(r) => setRule(r === rule ? null : r)} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Paste or upload ---------- */

function PasteTab({ disabled, handoff }: { disabled: Set<string>; handoff: { text?: string; title?: string; docId?: string } | null }) {
  const [text, setText] = useState(handoff?.text ?? '');
  const [name, setName] = useState(handoff?.title ?? '');
  const [type, setType] = useState<DocType | 'auto'>(handoff?.docId ? docTypeFor(handoff.docId) : 'auto');
  const [pathway, setPathway] = useState<Pathway | 'auto'>('auto');
  const [format, setFormat] = useState<'auto' | 'markdown' | 'text'>('auto');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(handoff?.text ? { ok: true, text: `Loaded ${handoff.title ?? 'the draft'} from the review queue.` } : null);
  const deferred = useDeferredValue(text);

  const result = useMemo(() => {
    if (!deferred.trim()) return null;
    const md = format === 'markdown' || (format === 'auto' && looksLikeMarkdown(deferred));
    const doc = md ? parseMarkdown(deferred, name || 'Pasted draft') : parseText(deferred, name || 'Pasted draft');
    const guessedType = doc.type;
    if (type !== 'auto') doc.type = type;
    const guessedPathway = guessPathway(deferred);
    const report = checkDoc(doc, { pathway: pathway === 'auto' ? guessedPathway : pathway, disabled });
    return { report, md, guessedType, guessedPathway };
  }, [deferred, name, type, pathway, format, disabled]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    setBusy(true);
    try {
      if (/\.(md|markdown|txt)$/i.test(file.name)) {
        setText(await file.text());
        setFormat(/\.txt$/i.test(file.name) ? 'text' : 'markdown');
      } else {
        const x = await checkerApi.extract(file);
        setText(x.text);
        setFormat('text');
        if (x.status !== 'read') setMsg({ ok: false, text: x.note || 'Only part of this file could be read.' });
      }
      setName(file.name.replace(/\.[a-z0-9]+$/i, ''));
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Couldn’t read the file.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack chk-tab">
      <section className="card stack chk-input">
        <div className="chk-input__row">
          <label className="field__label" htmlFor="chk-text">
            Draft to check
          </label>
          <div className="button-row button-row--tight">
            <label className="btn btn--outline btn--sm chk-file">
              {busy ? 'Reading…' : 'Upload Word, PDF, Markdown or text'}
              <input type="file" accept=".docx,.pdf,.md,.markdown,.txt" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            <Button
              size="sm"
              variant="text"
              onClick={() => {
                setText(SAMPLE);
                setName('Sample model-drafted SOP');
                setFormat('markdown');
                setMsg(null);
              }}
            >
              Try a sample
            </Button>
            {text && (
              <Button
                size="sm"
                variant="text"
                onClick={() => {
                  setText('');
                  setName('');
                  setMsg(null);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <textarea
          id="chk-text"
          className="input input--area chk-textarea"
          rows={text ? 8 : 6}
          value={text}
          placeholder="Paste a procedure, requirement set, risk file or submission section, for example a draft written by a language model. Markdown or plain text."
          onChange={(e) => setText(e.target.value)}
        />
        <p className="text-muted-sm">Pasted text stays in this browser. Word and PDF files are read on the server in memory and not stored.</p>
        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'form-msg form-msg--ok' : 'form-msg form-msg--err'}>
            {msg.text}
          </p>
        )}
        {result && (
          <div className="chk-opts">
            <label className="chk-select">
              <span>Document type</span>
              <select className="input input--sm" value={type} onChange={(e) => setType(e.target.value as DocType | 'auto')}>
                <option value="auto">Detect: {DOC_TYPE_LABEL[result.guessedType]}</option>
                {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => (
                  <option key={t} value={t}>
                    {DOC_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="chk-select">
              <span>FDA pathway</span>
              <select className="input input--sm" value={pathway} onChange={(e) => setPathway(e.target.value as Pathway | 'auto')}>
                <option value="auto">Detect: {PATHWAY_LABEL[result.guessedPathway]}</option>
                {(['510k', 'de-novo', 'pma', 'exempt'] as Pathway[]).map((p) => (
                  <option key={p} value={p}>
                    {PATHWAY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="chk-select">
              <span>Read as</span>
              <select className="input input--sm" value={format} onChange={(e) => setFormat(e.target.value as 'auto' | 'markdown' | 'text')}>
                <option value="auto">Detect: {result.md ? 'Markdown' : 'plain text'}</option>
                <option value="markdown">Markdown</option>
                <option value="text">Plain text (from Word or PDF)</option>
              </select>
            </label>
          </div>
        )}
      </section>

      {result && (
        <ReportView
          report={result.report}
          toolbar={
            <div className="button-row button-row--tight">
              <Button size="sm" variant="outline" onClick={() => download(`${name || 'draft'}-check.md`, reportToMarkdown(result.report), 'text/markdown')}>
                Download (Markdown)
              </Button>
              <Button size="sm" variant="outline" onClick={() => download(`${name || 'draft'}-check.csv`, reportsToCsv([result.report]), 'text/csv')}>
                CSV
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}

/* ---------- Rules ---------- */

function RulesTab({ disabled, onToggle }: { disabled: Set<string>; onToggle: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<Category, typeof RULES>();
    RULES.forEach((r) => m.set(r.category, [...(m.get(r.category) ?? []), r]));
    return [...m.entries()];
  }, []);
  return (
    <div className="stack chk-tab">
      <p className="text-muted-sm">
        {RULES.length} rules. Citations are checked against the Biomedix catalog of 21 CFR sections and standard editions, last checked {CATALOG_DATE}; anything not in it is
        reported as “can’t confirm”, never as wrong. Switching a rule off applies in this browser only.
      </p>
      {groups.map(([cat, rules]) => (
        <section key={cat} className="stack" aria-labelledby={`chk-cat-${cat}`}>
          <h2 id={`chk-cat-${cat}`} className="card__title card__title--sm">
            {CATEGORY_LABEL[cat]}
          </h2>
          <ul className="list-reset chk-rules">
            {rules.map((r) => (
              <li key={r.id} className={`card card--compact stack chk-rule${disabled.has(r.id) ? ' chk-rule--off' : ''}`}>
                <div className="chk-rule__head">
                  <SeverityChip s={r.severity} />
                  <strong>{r.name}</strong>
                  <label className="chk-rule__toggle">
                    <input type="checkbox" checked={!disabled.has(r.id)} onChange={() => onToggle(r.id)} /> On
                  </label>
                </div>
                <p className="chk-rule__why">{r.why}</p>
                {r.example && (
                  <p className="chk-rule__ex">
                    <del>{r.example.bad}</del> <span aria-hidden="true">→</span> <ins>{r.example.good}</ins>
                  </p>
                )}
                <p className="text-muted-sm">
                  {r.types ? r.types.map((t) => DOC_TYPE_LABEL[t]).join(', ') : 'Every document'}
                  {r.reqOnly ? ' · requirement statements (“shall”) only' : ''}
                </p>
                <p className="chk-f__src">{r.source}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
