import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { StageTag } from '../components/Lifecycle';
import { useIntake } from '../intake/IntakeContext';
import {
  addEquipment,
  addRequirement,
  KIND_HINT,
  KIND_LABEL,
  namesFromSetup,
  SECTIONS,
  SOFTWARE_HINT,
  SOFTWARE_LABEL,
  suggestionsFor,
  VERIFY_LABEL,
} from '../equipment/catalog';
import { MAX_EQUIPMENT, VERIFY, type EqKind, type Equipment, type EquipmentAnswers, type UserRequirement, type Verify } from '../equipment/model';
import {
  asksPq,
  asksRecords,
  displayName,
  docIdOf,
  hasOpen,
  IMPACT_HINT,
  IMPACT_LABEL,
  PHASE_TITLE,
  summarizeEquipment,
  type EquipmentSummary,
  type Impact,
} from '../equipment/summary';
import { docHref } from '../lib/links';
import { plural, Progress, ReadOnlyNote, Seg, Text, useHashTarget, YES_NO } from './assessments/parts';
import { StatusPill } from './Suite';
import '../styles/equipment.css';

function ImpactChip({ impact }: { impact: Impact | '' }) {
  return <span className={`eqv-impact eqv-impact--${impact || 'none-yet'}`}>{impact ? IMPACT_LABEL[impact] : 'Impact not assessed'}</span>;
}

const KINDS = Object.keys(KIND_LABEL) as Exclude<EqKind, ''>[];
const SOFTWARE = Object.keys(SOFTWARE_LABEL) as Exclude<Equipment['software'], ''>[];

function RequirementEditor({
  r,
  open,
  toggle,
  disabled,
  patch,
  remove,
}: {
  r: UserRequirement;
  open: boolean;
  toggle: () => void;
  disabled: boolean;
  patch: (p: Partial<UserRequirement>) => void;
  remove: () => void;
}) {
  const todo = [!r.text.trim() || hasOpen(r.text), !r.criterion.trim() || hasOpen(r.criterion), r.verify !== 'REL' && (!r.method.trim() || hasOpen(r.method))].filter(Boolean).length;
  return (
    <li id={`req-${r.id}`} className={`eqv-req${open ? ' eqv-req--open' : ''}`}>
      <button type="button" className="eqv-req__row" aria-expanded={open} onClick={toggle}>
        <span className="mono eqv-req__ref">{r.ref}</span>
        <span className="eqv-req__text">{r.text || 'New requirement'}</span>
        <span className="eqv-req__meta">
          <span className="text-muted-sm">{r.verify}</span>
          {todo ? <span className="status status--input">{todo} to fill</span> : <span className="status status--ready">Done</span>}
        </span>
      </button>
      {open && (
        <div className="stack eqv-req__body">
          <div className="field-row">
            <div className="field asm-field">
              <label htmlFor={`${r.id}-section`} className="field__label">
                Section
              </label>
              <select id={`${r.id}-section`} className="input" value={r.section} disabled={disabled} onChange={(e) => patch({ section: e.target.value })}>
                {SECTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
                {r.section && !(SECTIONS as readonly string[]).includes(r.section) && <option>{r.section}</option>}
              </select>
            </div>
            <div className="field asm-field">
              <label htmlFor={`${r.id}-verify`} className="field__label">
                Verified in
              </label>
              <select id={`${r.id}-verify`} className="input" value={r.verify} disabled={disabled} onChange={(e) => patch({ verify: e.target.value as Verify })}>
                {VERIFY.map((v) => (
                  <option key={v} value={v}>
                    {v === 'REL' ? VERIFY_LABEL[v] : `${v}: ${VERIFY_LABEL[v]}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Text
            id={`${r.id}-text`}
            label="Requirement"
            value={r.text}
            rows={2}
            max={1000}
            disabled={disabled}
            onChange={(v) => patch({ text: v })}
            hint="One “shall” per requirement, with a measurable value. Replace anything in [brackets]."
          />
          <Text
            id={`${r.id}-criterion`}
            label="Acceptance criterion"
            value={r.criterion}
            rows={2}
            max={1000}
            disabled={disabled}
            onChange={(v) => patch({ criterion: v })}
          />
          {r.verify !== 'REL' && (
            <Text id={`${r.id}-method`} label="Test method" value={r.method} rows={2} max={1000} disabled={disabled} onChange={(v) => patch({ method: v })} />
          )}
          <Seg
            name={`${r.id}-priority`}
            label="Priority"
            value={r.priority}
            options={[
              { value: 'essential', label: 'Essential', hint: 'Met before release' },
              { value: 'desirable', label: 'Desirable', hint: 'A gap is recorded in the summary report', tone: 'muted' },
            ]}
            disabled={disabled}
            onChange={(v) => patch({ priority: v as UserRequirement['priority'] })}
          />
          {!disabled && (
            <div className="button-row">
              <Button size="sm" variant="text" onClick={remove}>
                Delete {r.ref}
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function EquipmentEditor({
  sum,
  disabled,
  patch,
  remove,
  openReqs,
  toggleReq,
}: {
  sum: EquipmentSummary;
  disabled: boolean;
  patch: (p: Partial<Equipment>) => void;
  remove: () => void;
  openReqs: Set<string>;
  toggleReq: (id: string) => void;
}) {
  const e = sum.equipment;
  const { suite, lives, mode, tokens } = useIntake();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Equipment) => (v: string) => patch({ [k]: v } as Partial<Equipment>);
  const id = (f: string) => `${e.id}-${f}`;
  const suggestions = e.kind ? suggestionsFor(e) : [];
  const docs = sum.phases.map((ph) => ({ ph, id: docIdOf(e, ph), doc: suite.applicable.find((d) => d.proc.id === docIdOf(e, ph)) }));
  const open = sum.checks.filter((c) => !c.ok);
  const addReqs = (keys: string[] | null) => {
    let next = e;
    if (keys === null) next = addRequirement(next);
    else for (const s of suggestions.filter((x) => keys.includes(x.key))) next = addRequirement(next, s);
    patch({ requirements: next.requirements, nextReq: next.nextReq });
    if (keys === null) toggleReq(next.requirements[next.requirements.length - 1].id);
  };
  const patchReq = (rid: string, p: Partial<UserRequirement>) => patch({ requirements: e.requirements.map((r) => (r.id === rid ? { ...r, ...p } : r)) });

  async function downloadPackage() {
    setBusy(true);
    try {
      const [{ docsZip, packageFolder }, { downloadBlob }] = await Promise.all([import('../export/equipment'), import('../export/package')]);
      const list = docs.flatMap((d) => (d.doc ? [d.doc] : []));
      downloadBlob(`${packageFolder(e)}.zip`, await docsZip(packageFolder(e), list, tokens));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack asm-hz__body eqv-body">
      <section className="stack" aria-labelledby={id('id-h')}>
        <h4 id={id('id-h')} className="asm-sub">
          Identification
        </h4>
        <div className="field-row">
          <div id={id('name')}>
            <Text id={id('name-in')} label="Name" value={e.name} max={120} disabled={disabled} onChange={set('name')} placeholder="e.g. Adhesion peel tester" />
          </div>
          <div className="field asm-field" id={id('kind')}>
            <label htmlFor={id('kind-in')} className="field__label">
              Type
            </label>
            <select id={id('kind-in')} className="input" value={e.kind} disabled={disabled} onChange={(ev) => patch({ kind: ev.target.value as EqKind })}>
              <option value="">Choose</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            {e.kind && <p className="field__hint">{KIND_HINT[e.kind]}</p>}
          </div>
        </div>
        <div className="field-row" id={id('manufacturer')}>
          <Text id={id('manufacturer-in')} label="Manufacturer" value={e.manufacturer} max={120} disabled={disabled} onChange={set('manufacturer')} />
          <Text id={id('model-in')} label="Model" value={e.model} max={120} disabled={disabled} onChange={set('model')} />
        </div>
        <div className="field-row">
          <Text id={id('serial-in')} label="Serial number (optional before delivery)" value={e.serial} max={80} disabled={disabled} onChange={set('serial')} />
          <Text id={id('asset-in')} label="Your asset ID (optional)" value={e.asset} max={40} disabled={disabled} onChange={set('asset')} />
        </div>
        <div className="field-row">
          <div id={id('location')}>
            <Text id={id('location-in')} label="Where it is installed" value={e.location} max={160} disabled={disabled} onChange={set('location')} placeholder="e.g. Test lab, room 104" />
          </div>
          <Text
            id={id('owner-in')}
            label="System owner"
            value={e.owner}
            max={160}
            disabled={disabled}
            onChange={set('owner')}
            hint="Leave blank to use the operations or engineering lead from your team answers."
          />
        </div>
        <div id={id('purpose')}>
          <Text
            id={id('purpose-in')}
            label="What it is used for"
            value={e.purpose}
            rows={2}
            max={1000}
            disabled={disabled}
            onChange={set('purpose')}
            placeholder="e.g. Measures electrode peel force on finished patches for lot release."
          />
        </div>
      </section>

      <section className="stack" aria-labelledby={id('impact-h')}>
        <h4 id={id('impact-h')} className="asm-sub">
          Impact assessment
        </h4>
        <div id={id('product')}>
          <Seg
            name={id('product-in')}
            label="Does it make, measure or inspect product, or decide whether product is accepted?"
            value={e.product}
            options={YES_NO}
            disabled={disabled}
            onChange={(v) => patch({ product: v as Equipment['product'] })}
          />
        </div>
        {e.product === 'no' && (
          <div id={id('supports')}>
            <Seg
              name={id('supports-in')}
              label="Does it support a validated process or a controlled environment (for example a utility or a storage chamber)?"
              value={e.supports}
              options={YES_NO}
              disabled={disabled}
              onChange={(v) => patch({ supports: v as Equipment['supports'] })}
            />
          </div>
        )}
        {asksPq(e) && (
          <div id={id('pq')}>
            <Seg
              name={id('pq-in')}
              label="Does it run a process whose result isn’t fully verified afterwards (a seal, a cure, a bond), or hold product under controlled conditions?"
              value={e.pq}
              options={YES_NO}
              disabled={disabled}
              onChange={(v) => patch({ pq: v as Equipment['pq'] })}
              hint="Yes means performance qualification is needed (ISO 13485 7.5.6)."
            />
          </div>
        )}
        <div id={id('calibration')}>
          <Seg
            name={id('calibration-in')}
            label="Does it need calibration?"
            value={e.calibration}
            options={YES_NO}
            disabled={disabled}
            onChange={(v) => patch({ calibration: v as Equipment['calibration'] })}
          />
        </div>
        <div id={id('software')}>
          <Seg
            name={id('software-in')}
            label="What software does it have?"
            value={e.software}
            options={SOFTWARE.map((k) => ({ value: k, label: SOFTWARE_LABEL[k], hint: SOFTWARE_HINT[k], tone: k === 'none' ? 'muted' : 'ok' }))}
            disabled={disabled}
            onChange={(v) => patch({ software: v as Equipment['software'], ...(v === 'none' ? { records: '' } : {}) })}
          />
        </div>
        {asksRecords(e) && (
          <div id={id('records')}>
            <Seg
              name={id('records-in')}
              label="Does it create or keep electronic quality records?"
              value={e.records}
              options={YES_NO}
              disabled={disabled}
              onChange={(v) => patch({ records: v as Equipment['records'] })}
              hint={e.records === 'yes' ? 'Part 11 requirements are suggested below. Add it to the Part 11 assessment too.' : undefined}
            />
          </div>
        )}
        {sum.impact && sum.impact !== 'none' && (
          <div className="field-row">
            <div id={id('fat')}>
              <Seg
                name={id('fat-in')}
                label="Factory acceptance test at the supplier?"
                value={e.fat}
                options={YES_NO}
                disabled={disabled}
                onChange={(v) => patch({ fat: v as Equipment['fat'] })}
              />
            </div>
            <div id={id('sat')}>
              <Seg
                name={id('sat-in')}
                label="Site acceptance test on delivery?"
                value={e.sat}
                options={YES_NO}
                disabled={disabled}
                onChange={(v) => patch({ sat: v as Equipment['sat'] })}
              />
            </div>
          </div>
        )}
        <div className="eqv-result" role="status">
          <ImpactChip impact={sum.impact} />
          <span className="text-sm ink-2">{sum.impact ? IMPACT_HINT[sum.impact] : 'Answer the questions above to set which documents it needs.'}</span>
        </div>
        <Text id={id('rationale-in')} label="Notes on the impact decision (optional)" value={e.rationale} rows={2} max={2000} disabled={disabled} onChange={set('rationale')} />
        {sum.phases.includes('PQ') && (
          <div className="field-row">
            <div id={id('pqRuns')}>
              <Text id={id('pqRuns-in')} label="Number of PQ runs" value={e.pqRuns} max={3} disabled={disabled} onChange={set('pqRuns')} placeholder="3" />
            </div>
            <div id={id('pqSpec')}>
              <Text
                id={id('pqSpec-in')}
                label="Product specification PQ samples are tested to"
                value={e.pqSpec}
                max={200}
                disabled={disabled}
                onChange={set('pqSpec')}
                placeholder="e.g. SPEC-014 Pouch seal strength"
              />
            </div>
          </div>
        )}
      </section>

      <section className="stack" aria-labelledby={id('reqs-h')} id={id('reqs')}>
        <div className="asm-card__head">
          <h4 id={id('reqs-h')} className="asm-sub">
            User requirements · {e.requirements.length}
          </h4>
          {!disabled && suggestions.length > 1 && (
            <Button size="sm" onClick={() => addReqs(suggestions.map((s) => s.key))}>
              Add all {suggestions.length} suggestions
            </Button>
          )}
        </div>
        {!e.kind && <p className="text-muted-sm">Choose the type of equipment to see suggested requirements.</p>}
        {suggestions.length > 0 && (
          <ul className="list-reset stack eqv-sugs" aria-label="Suggested requirements">
            {suggestions.map((s) => (
              <li key={s.key} className="asm-pending__item">
                <span className="stack">
                  <span className="asm-pending__name">{s.text}</span>
                  <span className="text-muted-sm">
                    {s.section} · verified in {s.verify} · {s.priority}
                  </span>
                </span>
                {!disabled && (
                  <span className="button-row button-row--tight">
                    <Button size="sm" variant="outline" onClick={() => addReqs([s.key])} aria-label={`Add requirement: ${s.text}`}>
                      Add
                    </Button>
                    <Button size="sm" variant="text" onClick={() => patch({ dismissed: [...e.dismissed, s.key] })} aria-label={`Dismiss requirement: ${s.text}`}>
                      Doesn’t apply
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {e.requirements.length > 0 && (
          <ul className="list-reset stack eqv-reqs">
            {e.requirements.map((r) => (
              <RequirementEditor
                key={r.id}
                r={r}
                open={openReqs.has(r.id)}
                toggle={() => toggleReq(r.id)}
                disabled={disabled}
                patch={(p) => patchReq(r.id, p)}
                remove={() => patch({ requirements: e.requirements.filter((x) => x.id !== r.id) })}
              />
            ))}
          </ul>
        )}
        {!disabled && (
          <div className="button-row">
            <Button size="sm" variant="outline" onClick={() => addReqs(null)}>
              Write a requirement
            </Button>
            {e.dismissed.length > 0 && (
              <Button size="sm" variant="text" onClick={() => patch({ dismissed: [] })}>
                Show {plural(e.dismissed.length, 'dismissed suggestion')} again
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="stack" aria-labelledby={id('docs-h')}>
        <div className="asm-card__head">
          <h4 id={id('docs-h')} className="asm-sub">
            Validation package · {plural(docs.length, 'document')}
          </h4>
          <Button size="sm" variant="outline" onClick={downloadPackage} disabled={busy}>
            {busy ? 'Preparing…' : 'Download package (.zip)'}
          </Button>
        </div>
        <ul className="list-reset eqv-docs">
          {docs.map(({ ph, id: docId, doc }) => (
            <li key={docId}>
              <Link to={docHref(docId)} className="eqv-doc">
                <span className="mono eqv-doc__id">{docId}</span>
                <span className="eqv-doc__title">{PHASE_TITLE[ph]}</span>
                {doc &&
                  (mode === 'account' && !lives[docId]?.changed && !['unsaved', 'draft'].includes(lives[docId]?.stage ?? 'unsaved') ? (
                    <StageTag life={lives[docId]} />
                  ) : (
                    <StatusPill doc={doc} />
                  ))}
              </Link>
            </li>
          ))}
        </ul>
        {!sum.impact && <p className="text-muted-sm">The impact answers decide the rest of the package.</p>}
      </section>

      {open.length > 0 && (
        <ul className="list-reset stack asm-issues" aria-label="To do">
          {open.slice(0, 12).map((c) => (
            <li key={c.key} className="asm-todo">
              To do: <a href={`#${c.anchor}`}>{c.label}</a>
            </li>
          ))}
          {open.length > 12 && <li className="text-muted-sm">And {open.length - 12} more</li>}
        </ul>
      )}
      {!disabled && (
        <div className="button-row">
          <Button
            size="sm"
            variant="text"
            onClick={() => {
              if (window.confirm(`Delete ${e.ref} and its ${plural(docs.length, 'document')}? Its reference won’t be reused.`)) remove();
            }}
          >
            Delete {e.ref}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function EquipmentPage() {
  const { intake, update, readOnly, tokens, suite } = useIntake();
  const a = intake.equipment;
  const sums = useMemo(() => a.items.map(summarizeEquipment), [a.items]);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [openReqs, setOpenReqs] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState('');

  useHashTarget((hash) => {
    const e = a.items.find((x) => hash === `eq-${x.id}` || hash.startsWith(`${x.id}-`));
    if (e) setOpenIds((o) => new Set(o).add(e.id));
    const r = a.items.flatMap((x) => x.requirements).find((x) => hash === `req-${x.id}`);
    if (r) {
      const owner = a.items.find((x) => x.requirements.includes(r))!;
      setOpenIds((o) => new Set(o).add(owner.id));
      setOpenReqs((o) => new Set(o).add(r.id));
    }
  });

  const set = (next: Partial<EquipmentAnswers>) => update('equipment', next);
  const flip = (setter: typeof setOpenIds) => (id: string) =>
    setter((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggle = flip(setOpenIds);
  const toggleReq = flip(setOpenReqs);
  const patch = (id: string, p: Partial<Equipment>) => set({ items: a.items.map((x) => (x.id === id ? { ...x, ...p } : x)) });

  const have = new Set(a.items.flatMap((x) => [x.key.toLowerCase(), x.name.trim().toLowerCase()]).filter(Boolean));
  const fromSetup = namesFromSetup(intake.operations.equipment).filter((n) => !have.has(n.toLowerCase()) && !a.dismissed.includes(n.toLowerCase()));
  const full = a.items.length >= MAX_EQUIPMENT;
  const add = (names: string[] | null) => {
    let next = a;
    if (names === null) next = addEquipment(next);
    else for (const n of names.slice(0, MAX_EQUIPMENT - a.items.length)) next = addEquipment(next, { name: n, key: n.toLowerCase() });
    set({ items: next.items, nextRef: next.nextRef });
    if (next.items.length > a.items.length) {
      const last = next.items[next.items.length - 1];
      setOpenIds((o) => new Set(o).add(last.id));
    }
  };

  const docCount = sums.reduce((n, s) => n + s.phases.length, 0);
  const done = sums.reduce((n, s) => n + s.done, 0);
  const total = sums.reduce((n, s) => n + s.total, 0);
  const templates = suite.applicable.some((d) => d.proc.id === 'CQV-T1–8');

  async function downloadBlank() {
    setBusy('blank');
    try {
      const [{ blankTemplateDocs, docsZip }, { downloadBlob }] = await Promise.all([import('../export/equipment'), import('../export/package')]);
      downloadBlob('CQV templates.zip', await docsZip('CQV templates', blankTemplateDocs(tokens), tokens));
    } finally {
      setBusy('');
    }
  }
  async function downloadRegister() {
    const [{ equipmentRegisterCsv }, { downloadBlob }] = await Promise.all([import('../export/equipment'), import('../export/package')]);
    const status = (docId: string) => suite.applicable.find((d) => d.proc.id === docId)?.status === 'ready' ? 'ready for review' : 'needs input';
    downloadBlob('Equipment register.csv', new Blob([equipmentRegisterCsv(a.items, status)], { type: 'text/csv;charset=utf-8' }));
  }

  return (
    <AppShell>
      <main className="app-main asm-main">
        <Link to="/app/assessments" className="back-link">
          ← Assessments
        </Link>
        <div className="asm-head">
          <div className="stack asm-head__copy">
            <span className="eyebrow">EQUIPMENT VALIDATION · CQV</span>
            <h1 className="setup-main__title">Validate new equipment</h1>
            <p className="setup-main__blurb">
              Add each piece of production, measuring or test equipment before you buy or install it. Answer a few impact questions and the agent
              drafts its package: user requirements specification (URS), validation plan, commissioning, installation, operational and performance
              qualification (IQ, OQ, PQ) protocols, traceability matrix and summary report. Each one goes through technical review and approval
              like every other document.
            </p>
          </div>
          <aside className="card card--compact stack asm-head__status" aria-label="Progress">
            <Progress done={done} total={total} label="Equipment answers" />
            <ul className="list-reset asm-facts">
              <li>
                <strong>{a.items.length}</strong> {a.items.length === 1 ? 'piece' : 'pieces'} of equipment, <strong>{docCount}</strong>{' '}
                {docCount === 1 ? 'document' : 'documents'}
              </li>
              {fromSetup.length > 0 && (
                <li>
                  <strong>{fromSetup.length}</strong> named in your setup answers, not added yet
                </li>
              )}
            </ul>
            <Button variant="outline" size="sm" onClick={downloadBlank} disabled={busy !== ''}>
              {busy === 'blank' ? 'Preparing…' : 'Blank templates (.zip)'}
            </Button>
            {a.items.length > 0 && (
              <Button variant="text" size="sm" onClick={downloadRegister}>
                Equipment register (.csv)
              </Button>
            )}
            {templates && (
              <ButtonLink to={docHref('CQV-T1–8')} variant="text" size="sm">
                View CQV-T1–8 →
              </ButtonLink>
            )}
          </aside>
        </div>
        <ReadOnlyNote readOnly={readOnly} />

        {fromSetup.length > 0 && (
          <section className="card stack asm-card" id="eq-suggestions" aria-labelledby="eq-sug-h">
            <div className="asm-card__head">
              <h2 id="eq-sug-h" className="card__title">
                From your setup answers
              </h2>
              {!readOnly && fromSetup.length > 1 && !full && (
                <Button size="sm" onClick={() => add(fromSetup)}>
                  Add all {fromSetup.length}
                </Button>
              )}
            </div>
            <p className="text-muted-sm">Equipment you listed under Operations. Add the pieces that need validating.</p>
            <ul className="list-reset stack">
              {fromSetup.map((n) => (
                <li key={n} className="asm-pending__item">
                  <span className="asm-pending__name">{n}</span>
                  {!readOnly && (
                    <span className="button-row button-row--tight">
                      <Button size="sm" variant="outline" onClick={() => add([n])} disabled={full} aria-label={`Add ${n}`}>
                        Add
                      </Button>
                      <Button size="sm" variant="text" onClick={() => set({ dismissed: [...a.dismissed, n.toLowerCase()] })} aria-label={`Dismiss ${n}`}>
                        Doesn’t need validating
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card stack asm-card" id="eq-register" aria-labelledby="eq-reg-h">
          <div className="asm-card__head">
            <h2 id="eq-reg-h" className="card__title">
              Equipment
            </h2>
            <span className="text-muted-sm">Up to {MAX_EQUIPMENT} per project</span>
          </div>
          {sums.length === 0 ? (
            <p className="text-muted-sm">No equipment yet. Add the suggestions above, or add your own.</p>
          ) : (
            <ul className="list-reset stack asm-hzs">
              {sums.map((x) => {
                const e = x.equipment;
                const isOpen = openIds.has(e.id);
                const left = x.total - x.done;
                return (
                  <li key={e.id} id={`eq-${e.id}`} className={`asm-hz${isOpen ? ' asm-hz--open' : ''}`}>
                    <button type="button" className="asm-hz__row" aria-expanded={isOpen} onClick={() => toggle(e.id)}>
                      <span className="mono asm-hz__ref">{e.ref}</span>
                      <span className="stack asm-hz__main">
                        <span className="asm-hz__title">{displayName(e)}</span>
                        <span className="text-muted-sm">
                          {[e.kind ? KIND_LABEL[e.kind] : 'Type not set', [e.manufacturer, e.model].filter(Boolean).join(' '), plural(e.requirements.length, 'requirement'), plural(x.phases.length, 'document')]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="asm-hz__zones">
                        <ImpactChip impact={x.impact} />
                      </span>
                      <span className={`status ${x.complete ? 'status--ready' : 'status--input'}`}>{x.complete ? 'Complete' : `${left} to do`}</span>
                    </button>
                    {isOpen && (
                      <EquipmentEditor
                        sum={x}
                        disabled={readOnly}
                        patch={(p) => patch(e.id, p)}
                        remove={() => set({ items: a.items.filter((y) => y.id !== e.id) })}
                        openReqs={openReqs}
                        toggleReq={toggleReq}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!readOnly && (
            <div className="button-row">
              <Button variant="outline" onClick={() => add(null)} disabled={full}>
                Add equipment
              </Button>
              {a.dismissed.length > 0 && (
                <Button variant="text" size="sm" onClick={() => set({ dismissed: [] })}>
                  Show {plural(a.dismissed.length, 'dismissed suggestion')} again
                </Button>
              )}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
