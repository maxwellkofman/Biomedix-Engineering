import { useMemo, useState, type FormEvent } from 'react';
import { AppShell } from '../../components/AppShell';
import { Button } from '../../components/Button';
import { useIntake } from '../../intake/IntakeContext';
import { EMPTY_P11_ANSWER, type P11Answer, type P11Impact, type P11System, type Part11Answers } from '../../assessments/model';
import {
  answerState,
  canAccept,
  discretionNote,
  IMPACT_HINT,
  makeSystem,
  outOfScopeReason,
  RESULT_LABEL,
  SCOPE_LABEL,
  scopeComplete,
  summarizePart11,
  type P11Control,
  type SystemSummary,
} from '../../assessments/part11';
import { AssessmentHead, plural, Progress, ReadOnlyNote, Seg, Text, useHashTarget, YES_NO, type SegOption } from './parts';

const RESULTS: SegOption[] = [
  { value: 'met', label: 'Met' },
  { value: 'partial', label: 'Partly met', tone: 'warn' },
  { value: 'gap', label: 'Not met', tone: 'bad' },
  { value: 'na', label: 'N/A', tone: 'muted' },
];

const IMPACTS: SegOption[] = (['high', 'medium', 'low'] as const).map((v) => ({
  value: v,
  label: v[0].toUpperCase() + v.slice(1),
  hint: IMPACT_HINT[v],
  tone: v === 'high' ? 'warn' : 'ok',
}));

const STATUS: Record<SystemSummary['status'], [string, string]> = {
  incomplete: ['status--input', 'In progress'],
  out: ['status--na', 'Not in scope'],
  compliant: ['status--ready', 'All controls met'],
  findings: ['status--input', 'Findings to fix'],
};

const GROUPS: { key: P11Control['group']; title: string }[] = [
  { key: 'records', title: 'Electronic records · 11.10' },
  { key: 'open', title: 'Open system · 11.30' },
  { key: 'signatures', title: 'Electronic signatures · 11.50 to 11.300' },
];

const ctlAnchor = (owner: string, id: string) => `ctl-${owner}-${id}`;

function ControlRow({
  owner,
  control: c,
  answer,
  impact,
  disabled,
  onChange,
}: {
  owner: string;
  control: P11Control;
  answer: P11Answer | undefined;
  impact: P11Impact | 'company';
  disabled: boolean;
  onChange: (patch: Partial<P11Answer>) => void;
}) {
  const a = answer ?? EMPTY_P11_ANSWER;
  const st = answerState(answer, c, impact);
  const id = ctlAnchor(owner, c.id);
  const acceptable = canAccept(c, impact) && a.result === 'partial';
  const chip =
    st.state === 'open'
      ? ['asm-chip--open', 'To do']
      : st.state === 'finding'
        ? ['asm-chip--warn', 'Finding']
        : st.state === 'accepted'
          ? ['asm-chip--muted', 'Accepted on risk']
          : ['asm-chip--ok', a.result === 'na' ? 'Not applicable' : 'Met'];
  return (
    <li id={id} className={`asm-ctl${a.suggested ? ' asm-ctl--suggested' : ''}`}>
      <div className="asm-ctl__head">
        <span className="mono asm-ctl__id">{c.id}</span>
        <span className="asm-ctl__title">{c.title}</span>
        <span className={`asm-chip ${chip[0]}`}>{chip[1]}</span>
        {a.suggested && (
          <span className="asm-chip asm-chip--suggested" title="Drafted from the system’s profile. Check it against your configuration.">
            Suggested
          </span>
        )}
      </div>
      <p className="asm-ctl__req">{c.requirement}</p>
      <p className="field__hint">
        {c.hint}
        {c.discretion && impact !== 'company' && <> {discretionNote(impact)}</>}
      </p>
      <Seg
        name={`${id}-result`}
        label={`${c.id} result`}
        hideLabel
        value={a.result}
        options={RESULTS}
        disabled={disabled}
        onChange={(v) => onChange({ result: v as P11Answer['result'], accepted: v === 'partial' ? a.accepted : false })}
      />
      {a.result && (
        <Text
          id={`${id}-evidence`}
          label={a.result === 'met' ? 'Evidence' : a.result === 'na' ? 'Why it doesn’t apply' : 'What falls short'}
          value={a.evidence}
          rows={2}
          disabled={disabled}
          onChange={(v) => onChange({ evidence: v })}
          placeholder={a.result === 'met' ? 'How the control is met, and where the proof is' : undefined}
        />
      )}
      {(a.result === 'partial' || a.result === 'gap') && (
        <>
          {acceptable && (
            <label className="check asm-check">
              <input type="checkbox" checked={a.accepted} disabled={disabled} onChange={(e) => onChange({ accepted: e.target.checked })} />
              <span>Accept on this system’s documented risk instead of fixing it (FDA enforcement discretion)</span>
            </label>
          )}
          {!(acceptable && a.accepted) && (
            <div className="stack asm-action">
              <Text
                id={`${id}-action`}
                label="Corrective action"
                value={a.action}
                rows={2}
                disabled={disabled}
                onChange={(v) => onChange({ action: v })}
              />
              <div className="field-row">
                <Text id={`${id}-owner`} label="Owner" value={a.owner} max={200} disabled={disabled} onChange={(v) => onChange({ owner: v })} />
                <Text id={`${id}-due`} label="Due" type="date" value={a.due} max={40} disabled={disabled} onChange={(v) => onChange({ due: v })} />
              </div>
            </div>
          )}
        </>
      )}
      <div className="asm-ctl__foot">
        {st.missing && <span className="asm-todo">To do: {st.missing}</span>}
        {a.suggested && !disabled && (
          <Button size="sm" variant="outline" onClick={() => onChange({ suggested: false })}>
            Confirm
          </Button>
        )}
      </div>
    </li>
  );
}

function SystemCard({
  sum,
  open,
  setOpen,
  disabled,
  patch,
  patchAnswer,
  remove,
}: {
  sum: SystemSummary;
  open: boolean;
  setOpen: (v: boolean) => void;
  disabled: boolean;
  patch: (p: Partial<P11System>) => void;
  patchAnswer: (ctl: string, p: Partial<P11Answer>) => void;
  remove: () => void;
}) {
  const s = sum.system;
  const inScope = sum.scope === 'records' || sum.scope === 'records-signatures';
  const [cls, label] = STATUS[sum.status];
  const pendingSug = Object.values(s.answers).filter((a) => a.suggested).length + (s.suggestedScope ? 1 : 0);
  const name = s.name.trim() || 'Unnamed system';
  const editScope = (p: Partial<P11System>) => patch({ ...p, suggestedScope: false });
  return (
    <li id={`sys-${s.id}`} className="card card--compact asm-sys">
      <button type="button" className="asm-sys__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="stack asm-sys__name">
          <span className="asm-sys__title">{name}</span>
          <span className="text-muted-sm">
            {SCOPE_LABEL[sum.scope]}
            {s.impact && inScope ? ` · ${s.impact} risk` : ''} · {sum.done} of {sum.total} done
            {sum.findings ? ` · ${plural(sum.findings, 'finding')}` : ''}
          </span>
        </span>
        <span className={`status ${cls}`}>{label}</span>
        <span className="asm-sys__caret" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="stack asm-sys__body">
          <div className="field-row">
            <Text id={`${s.id}-name`} label="System" value={s.name} max={120} disabled={disabled} onChange={(v) => patch({ name: v })} />
            <Text id={`${s.id}-use`} label="Used for" value={s.use} max={400} disabled={disabled} onChange={(v) => patch({ use: v })} />
          </div>

          <section className="stack asm-scope" aria-label={`${name}: scope`}>
            <h3 className="asm-sub">Does Part 11 apply?</h3>
            {s.suggestedScope && (
              <div className="asm-suggest" role="status">
                <span>These answers come from the {name} profile. Check them against how you use it.</span>
                {!disabled && (
                  <Button size="sm" variant="outline" onClick={() => patch({ suggestedScope: false })}>
                    Confirm scope
                  </Button>
                )}
              </div>
            )}
            <Seg
              name={`${s.id}-records`}
              label="Does it create, change or keep records that FDA regulations or ISO 13485 require?"
              hint="Design and development records, complaint files, CAPA, training, supplier, production and release records."
              value={s.records}
              options={YES_NO}
              disabled={disabled}
              onChange={(v) => editScope({ records: v as P11System['records'], relied: v === 'no' ? '' : s.relied })}
            />
            {s.records === 'yes' && (
              <Seg
                name={`${s.id}-relied`}
                label="Is the electronic record the one you rely on?"
                hint="Answer No only if a signed paper copy is the official record and this system just produces it."
                value={s.relied}
                options={YES_NO}
                disabled={disabled}
                onChange={(v) => editScope({ relied: v as P11System['relied'] })}
              />
            )}
            <Seg
              name={`${s.id}-signatures`}
              label="Does it apply electronic signatures in place of handwritten ones?"
              hint="Approvals, reviews or other signatures a regulation or your procedures require."
              value={s.signatures}
              options={YES_NO}
              disabled={disabled}
              onChange={(v) => editScope({ signatures: v as P11System['signatures'] })}
            />
            {inScope && (
              <>
                <Seg
                  name={`${s.id}-open`}
                  label="Who controls access to it?"
                  hint="A cloud tool where your admins decide who has access is a closed system, even though the vendor hosts it."
                  value={s.open}
                  options={[
                    { value: 'no', label: 'Your company (closed)' },
                    { value: 'yes', label: 'Someone else (open)', tone: 'warn' },
                  ]}
                  disabled={disabled}
                  onChange={(v) => editScope({ open: v as P11System['open'] })}
                />
                <Seg
                  name={`${s.id}-impact`}
                  label="How much could a wrong or lost record here affect product quality or patient safety?"
                  hint={s.impact ? IMPACT_HINT[s.impact] : 'This sets how far validation, audit trail, copies and retention need to go.'}
                  value={s.impact}
                  options={IMPACTS}
                  disabled={disabled}
                  onChange={(v) => editScope({ impact: v as P11Impact })}
                />
              </>
            )}
            <p className={`asm-verdict asm-verdict--${sum.scope}`}>
              <strong>{SCOPE_LABEL[sum.scope]}.</strong>{' '}
              {sum.scope === 'out'
                ? outOfScopeReason(s)
                : sum.scope === 'unknown'
                  ? 'Answer the questions above.'
                  : !scopeComplete(s)
                    ? 'Say who controls access and rate the risk.'
                    : `${sum.controls.length} controls apply.`}
            </p>
          </section>

          {inScope &&
            GROUPS.map((g) => {
              const list = sum.controls.filter((c) => c.group === g.key);
              if (!list.length) return null;
              return (
                <section key={g.key} className="stack" aria-label={`${name}: ${g.title}`}>
                  <h3 className="asm-sub">{g.title}</h3>
                  <ul className="list-reset stack asm-ctls">
                    {list.map((c) => (
                      <ControlRow
                        key={c.id}
                        owner={s.id}
                        control={c}
                        answer={s.answers[c.id]}
                        impact={s.impact}
                        disabled={disabled}
                        onChange={(p) => patchAnswer(c.id, p)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}

          {!disabled && (
            <div className="button-row asm-sys__actions">
              {pendingSug > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patch({
                      suggestedScope: false,
                      answers: Object.fromEntries(Object.entries(s.answers).map(([k, a]) => [k, { ...a, suggested: false }])),
                    })
                  }
                >
                  Confirm all {pendingSug} suggestions for {name}
                </Button>
              )}
              <Button
                size="sm"
                variant="text"
                onClick={() => {
                  if (window.confirm(`Remove ${name} and its answers from the assessment?`)) remove();
                }}
              >
                Remove system
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function Part11Page() {
  const { intake, update, readOnly } = useIntake();
  const p11 = intake.part11;
  const sum = useMemo(() => summarizePart11(intake), [intake]);
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const first = sum.systems.find((x) => x.status === 'incomplete');
    return new Set(first ? [first.system.id] : []);
  });
  const [newName, setNewName] = useState('');

  useHashTarget((hash) => {
    const sys = p11.systems.find((x) => hash === `sys-${x.id}` || hash.startsWith(`ctl-${x.id}-`));
    if (sys) setOpenIds((o) => new Set(o).add(sys.id));
  });

  const set = (next: Partial<Part11Answers>) => update('part11', next);
  const setOpen = (id: string, v: boolean) =>
    setOpenIds((o) => {
      const n = new Set(o);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  const patchSystem = (id: string, patch: Partial<P11System>) =>
    set({ systems: p11.systems.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const patchAnswer = (sysId: string, ctl: string, patch: Partial<P11Answer>) => {
    const sys = p11.systems.find((x) => x.id === sysId);
    if (!sys) return;
    // Editing a suggested answer is reviewing it.
    const next = { ...EMPTY_P11_ANSWER, ...sys.answers[ctl], suggested: false, ...patch };
    patchSystem(sysId, { answers: { ...sys.answers, [ctl]: next } });
  };
  const patchCompany = (ctl: string, patch: Partial<P11Answer>) =>
    set({ company: { ...p11.company, [ctl]: { ...EMPTY_P11_ANSWER, ...p11.company[ctl], suggested: false, ...patch } } });
  const addSystems = (keys: string[]) => {
    const add = sum.pendingSystems.filter((x) => keys.includes(x.key)).map((x) => makeSystem(x));
    set({ systems: [...p11.systems, ...add] });
    if (add[0]) setOpen(add[0].id, true);
  };
  const addCustom = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const s = { ...makeSystem(null), name };
    set({ systems: [...p11.systems, s] });
    setOpen(s.id, true);
    setNewName('');
  };

  return (
    <AppShell>
      <main className="app-main asm-main">
        <AssessmentHead
          eyebrow="21 CFR PART 11 ASSESSMENT · FRM-019"
          title="Electronic records and signatures"
          docId="FRM-019"
          blurb={
            <>
              List each system that holds quality records or signatures. Part 11 applies when you rely on the electronic record, or sign
              electronically. Controls are set by risk, as FDA’s 2003 Scope and Application guidance allows. Validation, audit trail,
              copies and retention can be lighter for low-risk records, but ISO 13485 still requires them.
            </>
          }
        >
          <Progress done={sum.done} total={sum.total} label="Assessment" />
          <ul className="list-reset asm-facts">
            <li>
              <strong>{sum.inScope}</strong> of {plural(sum.systems.length, 'system')} in scope
            </li>
            <li>
              <strong>{sum.findings.length}</strong> {sum.findings.length === 1 ? 'finding' : 'findings'} with corrective actions
            </li>
            {sum.suggested > 0 && (
              <li>
                <strong>{sum.suggested}</strong> {sum.suggested === 1 ? 'suggestion' : 'suggestions'} to review
              </li>
            )}
          </ul>
        </AssessmentHead>
        <ReadOnlyNote readOnly={readOnly} />

        <section className="card stack asm-card" id="p11-systems" aria-labelledby="p11-systems-h">
          <div className="asm-card__head">
            <h2 id="p11-systems-h" className="card__title">
              Systems
            </h2>
            <span className="text-muted-sm">{plural(p11.systems.length, 'system')}</span>
          </div>

          {sum.pendingSystems.length > 0 && (
            <div className="stack asm-pending">
              <div className="asm-pending__head">
                <span className="stack">
                  <strong>From your setup answers</strong>
                  <span className="text-muted-sm">
                    Profiles fill in suggested answers you then check. Tools without a profile start blank.
                  </span>
                </span>
                {!readOnly && sum.pendingSystems.length > 1 && (
                  <Button size="sm" onClick={() => addSystems(sum.pendingSystems.map((x) => x.key))}>
                    Add all {sum.pendingSystems.length}
                  </Button>
                )}
              </div>
              <ul className="list-reset stack">
                {sum.pendingSystems.map((x) => (
                  <li key={x.key} className="asm-pending__item">
                    <span className="stack">
                      <span className="asm-pending__name">
                        {x.name}
                        {x.profiled && <span className="asm-chip asm-chip--suggested">Profile</span>}
                      </span>
                      <span className="text-muted-sm">
                        {x.use || 'Use to be described'} · from {x.from}
                      </span>
                    </span>
                    {!readOnly && (
                      <span className="button-row button-row--tight">
                        <Button size="sm" variant="outline" onClick={() => addSystems([x.key])} aria-label={`Add ${x.name}`}>
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="text"
                          aria-label={`Dismiss ${x.name}`}
                          onClick={() => set({ dismissed: [...p11.dismissed, x.key] })}
                        >
                          Not used for records
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p11.systems.length > 0 && (
            <ul className="list-reset stack asm-systems">
              {sum.systems.map((x) => (
                <SystemCard
                  key={x.system.id}
                  sum={x}
                  open={openIds.has(x.system.id)}
                  setOpen={(v) => setOpen(x.system.id, v)}
                  disabled={readOnly}
                  patch={(p) => patchSystem(x.system.id, p)}
                  patchAnswer={(ctl, p) => patchAnswer(x.system.id, ctl, p)}
                  remove={() =>
                    set({
                      systems: p11.systems.filter((s) => s.id !== x.system.id),
                      dismissed: x.system.preset ? [...new Set([...p11.dismissed, x.system.preset])] : p11.dismissed,
                    })
                  }
                />
              ))}
            </ul>
          )}

          {!readOnly && (
            <form className="asm-add" onSubmit={addCustom}>
              <Text
                id="p11-new-system"
                label="Add another system"
                value={newName}
                max={120}
                onChange={setNewName}
                placeholder="e.g. Greenlight Guru, an Excel CAPA log, a LIMS"
              />
              <Button type="submit" variant="outline" disabled={!newName.trim()}>
                Add system
              </Button>
            </form>
          )}
          {p11.dismissed.length > 0 && !readOnly && (
            <Button variant="text" size="sm" onClick={() => set({ dismissed: [] })}>
              Show {plural(p11.dismissed.length, 'dismissed suggestion')} again
            </Button>
          )}
        </section>

        <section className="card stack asm-card" id="p11-company" aria-labelledby="p11-company-h">
          <div className="asm-card__head">
            <h2 id="p11-company-h" className="card__title">
              Company-wide controls
            </h2>
            {sum.company.length > 0 && (
              <span className="text-muted-sm">
                {sum.companyDone} of {sum.company.length} done
              </span>
            )}
          </div>
          {sum.company.length ? (
            <ul className="list-reset stack asm-ctls">
              {sum.company.map((c) => (
                <ControlRow
                  key={c.id}
                  owner="company"
                  control={c}
                  answer={p11.company[c.id]}
                  impact="company"
                  disabled={readOnly}
                  onChange={(p) => patchCompany(c.id, p)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-muted-sm">These appear once a system is in scope: training, the accountability policy, identity checks and the FDA letter.</p>
          )}
        </section>

        <section className="card stack asm-card" aria-labelledby="p11-findings-h">
          <div className="asm-card__head">
            <h2 id="p11-findings-h" className="card__title">
              Findings and corrective actions
            </h2>
            <span className="text-muted-sm">{plural(sum.findings.length, 'finding')}</span>
          </div>
          {sum.findings.length ? (
            <div className="table-wrap">
              <table className="paper__table asm-table">
                <thead>
                  <tr>
                    <th scope="col">System</th>
                    <th scope="col">Control</th>
                    <th scope="col">Finding</th>
                    <th scope="col">Corrective action</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {sum.findings.map((f) => {
                    const owner = f.owner;
                    return (
                      <tr key={`${f.owner}-${f.control.id}`}>
                        <td>{f.system}</td>
                        <td>
                          <a href={`#${ctlAnchor(owner, f.control.id)}`} className="mono">
                            {f.control.id}
                          </a>{' '}
                          {f.control.title}
                        </td>
                        <td>
                          <span className={`asm-chip ${f.answer.result === 'gap' ? 'asm-chip--bad' : 'asm-chip--warn'}`}>
                            {RESULT_LABEL[f.answer.result as 'gap']}
                          </span>{' '}
                          {f.answer.evidence}
                        </td>
                        <td>{f.answer.action}</td>
                        <td>{f.answer.owner || <span className="asm-todo">Not set</span>}</td>
                        <td>{f.answer.due || <span className="asm-todo">Not set</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-sm">
              None yet. A control marked Partly met or Not met becomes a finding once it has a corrective action.
            </p>
          )}
          {sum.accepted.length > 0 && (
            <p className="text-muted-sm">
              {plural(sum.accepted.length, 'partly met control')} accepted on documented risk:{' '}
              {sum.accepted.map((f) => `${f.system} ${f.control.id}`).join(', ')}.
            </p>
          )}
        </section>
      </main>
    </AppShell>
  );
}
