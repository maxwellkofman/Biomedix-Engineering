/**
 * Shows checker findings: the document with each finding marked in place, and
 * the findings beside it. Selecting one scrolls to the other.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CATEGORY_LABEL,
  excerpt,
  RULE_BY_ID,
  SEVERITY_LABEL,
  type Category,
  type Finding,
  type Report,
  type RuleTally,
  type Severity,
  type Unit,
} from '../validate/index.ts';
import type { SuiteCheck } from '../validate/generated.ts';
import '../styles/checker.css';

const SEVERITIES: Severity[] = ['error', 'warning', 'note'];
const RANK: Record<Severity, number> = { error: 0, warning: 1, note: 2 };

export type Source = 'all' | 'template' | 'answers' | 'open';
export const sourceOf = (f: Finding): Exclude<Source, 'all'> => (f.rule === 'open-input' ? 'open' : f.answer ? 'answers' : 'template');

export function SeverityChip({ s }: { s: Severity }) {
  return <span className={`chk-sev chk-sev--${s}`}>{SEVERITY_LABEL[s]}</span>;
}

export function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Counts ---------- */

export function SeverityFilter({
  counts,
  shown,
  onChange,
}: {
  counts: Record<Severity, number>;
  shown: Set<Severity>;
  onChange: (next: Set<Severity>) => void;
}) {
  return (
    <div className="chk-counts" role="group" aria-label="Show findings by severity">
      {SEVERITIES.map((s) => (
        <button
          key={s}
          type="button"
          className={`chk-count chk-count--${s}`}
          aria-pressed={shown.has(s)}
          onClick={() => {
            const next = new Set(shown);
            if (next.has(s)) next.delete(s);
            else next.add(s);
            onChange(next);
          }}
        >
          <strong>{counts[s]}</strong>
          <span>{SEVERITY_LABEL[s].toLowerCase()}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- One finding ---------- */

function FindingItem({ f, unit, k, on, onSelect }: { f: Finding; unit: Unit; k: number; on: boolean; onSelect: (k: number) => void }) {
  const rule = RULE_BY_ID.get(f.rule)!;
  const x = excerpt(unit, f, 60);
  return (
    <li id={`chk-f-${k}`} className={`chk-f${on ? ' chk-f--on' : ''}`}>
      <button type="button" className="chk-f__head" aria-expanded={on} onClick={() => onSelect(k)}>
        <SeverityChip s={f.severity} />
        <span className="chk-f__rule">{rule.name}</span>
        {unit.section && <span className="chk-f__where">{unit.section}</span>}
      </button>
      <p className="chk-f__msg">{f.message}</p>
      <blockquote className="chk-f__quote">
        {x.before}
        <mark className={`chk-mark chk-mark--${f.severity}`}>{x.hit || ' '}</mark>
        {x.after}
      </blockquote>
      {f.replace && (
        <p className="chk-f__fix">
          Suggested: <ins>{f.replace}</ins>
        </p>
      )}
      {f.answer && f.rule !== 'open-input' && <p className="chk-f__answer">From the setup answer “{f.answer}”. The customer changes this, not the template.</p>}
      {on && <p className="chk-f__why">{rule.why}</p>}
      <p className="chk-f__src">{rule.source}</p>
    </li>
  );
}

/* ---------- The document with marks ---------- */

function marked(u: Unit, list: { f: Finding; k: number }[], selected: number | null, onSelect: (k: number) => void) {
  const cuts = new Set([0, u.text.length]);
  for (const { f } of list) cuts.add(Math.min(f.start, u.text.length)).add(Math.min(f.end, u.text.length));
  for (const sp of u.spans ?? []) cuts.add(sp.start).add(sp.end);
  const pts = [...cuts].sort((a, b) => a - b);
  const firstMark = new Set<number>();
  return pts.slice(0, -1).map((a, i) => {
    const b = pts[i + 1];
    const text = u.text.slice(a, b);
    const cover = list.filter(({ f }) => f.start < b && f.end > a);
    const span = (u.spans ?? []).find((sp) => sp.start < b && sp.end > a);
    let node: ReactNode = text;
    if (span) node = <span className={`chk-ans${span.missing ? ' chk-ans--missing' : ''}`} title={`From the setup answer: ${span.label}`}>{text}</span>;
    if (!cover.length) return <span key={a}>{node}</span>;
    const worst = cover.reduce((w, c) => (RANK[c.f.severity] < RANK[w] ? c.f.severity : w), 'note' as Severity);
    const anchors = cover.filter((c) => !firstMark.has(c.k));
    anchors.forEach((c) => firstMark.add(c.k));
    return (
      <mark
        key={a}
        id={anchors.length ? `chk-m-${anchors[0].k}` : undefined}
        className={`chk-mark chk-mark--${worst}${cover.some((c) => c.k === selected) ? ' chk-mark--on' : ''}`}
        title={cover.map((c) => RULE_BY_ID.get(c.f.rule)!.name).join(' · ')}
        onClick={() => onSelect(cover[0].k)}
      >
        {node}
      </mark>
    );
  });
}

function DocText({ report, items, selected, onSelect }: { report: Report; items: { f: Finding; k: number }[]; selected: number | null; onSelect: (k: number) => void }) {
  const byUnit = useMemo(() => {
    const m = new Map<number, { f: Finding; k: number }[]>();
    for (const it of items) m.set(it.f.unit, [...(m.get(it.f.unit) ?? []), it]);
    return m;
  }, [items]);

  const blocks: ReactNode[] = [];
  const units = report.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const body = marked(u, byUnit.get(u.i) ?? [], selected, onSelect);
    if (u.kind === 'cell') {
      const t = u.table;
      const cells: Unit[] = [];
      while (i < units.length && units[i].kind === 'cell' && units[i].table === t) cells.push(units[i++]);
      i--;
      const rows = new Map<number, Unit[]>();
      cells.forEach((c) => rows.set(c.row ?? 0, [...(rows.get(c.row ?? 0) ?? []), c]));
      blocks.push(
        <div key={`t${u.i}`} className="chk-doc__tablewrap">
          <table className="chk-doc__table">
            <tbody>
              {[...rows.entries()].map(([r, cs]) => (
                <tr key={r}>
                  {cs.map((c) => {
                    const Cell = c.head ? 'th' : 'td';
                    return <Cell key={c.i}>{marked(c, byUnit.get(c.i) ?? [], selected, onSelect)}</Cell>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (u.kind === 'title') blocks.push(<h2 key={u.i} className="chk-doc__title">{body}</h2>);
    else if (u.kind === 'heading') blocks.push(<h3 key={u.i} className="chk-doc__h">{body}</h3>);
    else if (u.kind === 'field')
      blocks.push(
        <p key={u.i} className="chk-doc__field">
          <span className="chk-doc__fieldname">{u.col}</span> {body}
        </p>,
      );
    else if (u.kind === 'li') blocks.push(<p key={u.i} className="chk-doc__li">{body}</p>);
    else blocks.push(<p key={u.i}>{body}</p>);
  }
  return <div className="chk-doc">{blocks}</div>;
}

/* ---------- A report ---------- */

export function ReportView({
  report,
  generated = false,
  rule,
  onClearRule,
  toolbar,
}: {
  report: Report;
  /** Generated documents: offer the template / answers / open-values filter. */
  generated?: boolean;
  rule?: string | null;
  onClearRule?: () => void;
  toolbar?: ReactNode;
}) {
  const [shown, setShown] = useState<Set<Severity>>(new Set(SEVERITIES));
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [source, setSource] = useState<Source>('all');
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => setSelected(null), [report]);

  const all = useMemo(() => report.findings.map((f, k) => ({ f, k })), [report]);
  const items = all.filter(
    ({ f }) =>
      shown.has(f.severity) &&
      (cat === 'all' || RULE_BY_ID.get(f.rule)!.category === cat) &&
      (source === 'all' || sourceOf(f) === source) &&
      (!rule || f.rule === rule),
  );
  const cats = useMemo(() => {
    const m = new Map<Category, number>();
    report.findings.forEach((f) => {
      const c = RULE_BY_ID.get(f.rule)!.category;
      m.set(c, (m.get(c) ?? 0) + 1);
    });
    return [...m.entries()];
  }, [report]);

  const select = (k: number, from: 'list' | 'doc') => {
    setSelected(k);
    requestAnimationFrame(() => document.getElementById(from === 'list' ? `chk-m-${k}` : `chk-f-${k}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  return (
    <div className="stack chk-report">
      <div className="chk-toolbar">
        <SeverityFilter counts={report.counts} shown={shown} onChange={setShown} />
        {toolbar}
      </div>
      <div className="chk-filters">
        <div className="button-row button-row--tight" role="group" aria-label="Show findings by kind">
          <button type="button" className={`pill${cat === 'all' ? ' pill--active' : ''}`} aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
            All kinds
          </button>
          {cats.map(([c, n]) => (
            <button key={c} type="button" className={`pill${cat === c ? ' pill--active' : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
              {CATEGORY_LABEL[c]} · {n}
            </button>
          ))}
        </div>
        {generated && (
          <label className="chk-select">
            <span>Text from</span>
            <select className="input input--sm" value={source} onChange={(e) => setSource(e.target.value as Source)}>
              <option value="all">Anywhere</option>
              <option value="template">Template wording (Biomedix fixes)</option>
              <option value="answers">Setup answers (customer fixes)</option>
              <option value="open">Values still needed</option>
            </select>
          </label>
        )}
        {rule && (
          <button type="button" className="pill pill--active" onClick={onClearRule}>
            Only “{RULE_BY_ID.get(rule)?.name}” ✕
          </button>
        )}
      </div>

      {!report.findings.length ? (
        <p className="notice chk-clean">No findings. The rules found nothing to change in this document; an engineer still reviews it.</p>
      ) : (
        <div className="chk-split">
          <section className="card chk-split__doc" aria-label="Document with findings marked">
            <DocText report={report} items={items} selected={selected} onSelect={(k) => select(k, 'doc')} />
          </section>
          <section className="chk-split__list" aria-label="Findings">
            <p className="text-muted-sm">
              {items.length === all.length ? `${all.length} finding${all.length === 1 ? '' : 's'}` : `${items.length} of ${all.length} findings`} · select one to find it in the text
            </p>
            {items.length ? (
              <ol className="list-reset stack chk-flist">
                {items.map(({ f, k }) => (
                  <FindingItem key={k} f={f} k={k} unit={report.units[f.unit]} on={selected === k} onSelect={(kk) => select(kk, 'list')} />
                ))}
              </ol>
            ) : (
              <p className="text-muted-sm">Nothing matches these filters.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------- A suite of generated documents ---------- */

export function RuleTable({ rows, onPick }: { rows: RuleTally[]; onPick: (rule: string) => void }) {
  if (!rows.length) return <p className="text-muted-sm">No findings.</p>;
  return (
    <div className="chk-tablewrap">
      <table className="chk-table">
        <thead>
          <tr>
            <th scope="col">Rule</th>
            <th scope="col">Severity</th>
            <th scope="col" className="num">
              Findings
            </th>
            <th scope="col" className="num">
              Documents
            </th>
            <th scope="col" className="num">
              From answers
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.rule}>
              <td>
                <button type="button" className="chk-link" onClick={() => onPick(t.rule)}>
                  {t.name}
                </button>
                <span className="chk-table__sub">{CATEGORY_LABEL[t.category]}</span>
              </td>
              <td>
                <SeverityChip s={t.severity} />
              </td>
              <td className="num">{t.count}</td>
              <td className="num">{t.docs}</td>
              <td className="num">{t.fromAnswers || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocTable({ check, rule, onOpen }: { check: SuiteCheck; rule: string | null; onOpen: (id: string) => void }) {
  const rows = check.reports
    .map((r) => {
      const fs = rule ? r.findings.filter((f) => f.rule === rule) : r.findings;
      const c: Record<Severity, number> = { error: 0, warning: 0, note: 0 };
      fs.forEach((f) => c[f.severity]++);
      return { r, c, n: fs.length };
    })
    .filter((x) => !rule || x.n)
    .sort((a, b) => b.c.error - a.c.error || b.c.warning - a.c.warning || b.n - a.n);
  return (
    <div className="chk-tablewrap">
      <table className="chk-table">
        <thead>
          <tr>
            <th scope="col">Document</th>
            {SEVERITIES.map((s) => (
              <th key={s} scope="col" className="num">
                {SEVERITY_LABEL[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ r, c }) => (
            <tr key={r.doc.id}>
              <td>
                <button type="button" className="chk-link" onClick={() => onOpen(r.doc.id!)}>
                  <span className="mono">{r.doc.id}</span> {r.doc.title}
                </button>
              </td>
              {SEVERITIES.map((s) => (
                <td key={s} className={`num${c[s] && s !== 'note' ? ` chk-num--${s}` : ''}`}>
                  {c[s] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
