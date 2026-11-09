import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Button } from '../../components/Button';
import { useIntake } from '../../intake/IntakeContext';
import type { ControlType, Hazard, RiskAnswers, RiskControl, Zone } from '../../assessments/model';
import {
  addHazard,
  CATEGORIES,
  CONTROL_TYPE_LABEL,
  DEFAULT_MATRIX,
  newControl,
  PROBABILITY,
  SEVERITY,
  summarizeRisk,
  ZONE_HINT,
  ZONE_LABEL,
  type HazardSummary,
} from '../../assessments/risk';
import { AssessmentHead, plural, Progress, ReadOnlyNote, Seg, Text, useHashTarget, YES_NO } from './parts';

function ZoneChip({ zone, label }: { zone: Zone | null; label?: string }) {
  if (!zone) return <span className="asm-zone asm-zone--none">{label ? `${label}: ` : ''}Not rated</span>;
  return (
    <span className={`asm-zone asm-zone--${zone}`} title={ZONE_HINT[zone]}>
      {label ? `${label}: ` : ''}
      {ZONE_LABEL[zone]}
    </span>
  );
}

function RateSelect({
  id,
  label,
  value,
  kind,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  kind: 'severity' | 'probability';
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  const opts = kind === 'severity' ? SEVERITY.map((s) => [s.n, `${s.code} ${s.name}`, s.desc]) : PROBABILITY.map((p) => [p.n, p.name, p.desc]);
  const desc = value ? (opts[value - 1][2] as string) : undefined;
  return (
    <div className="field asm-field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <select id={id} className="input" value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0}>Not rated</option>
        {opts.map(([n, name]) => (
          <option key={n as number} value={n as number}>
            {name as string}
          </option>
        ))}
      </select>
      {desc && <p className="field__hint">{desc}</p>}
    </div>
  );
}

function ControlEditor({
  c,
  disabled,
  onChange,
  onRemove,
}: {
  c: RiskControl;
  disabled: boolean;
  onChange: (p: Partial<RiskControl>) => void;
  onRemove: () => void;
}) {
  return (
    <li className="stack asm-rc">
      <div className="asm-rc__head">
        <span className="mono asm-ctl__id">{c.ref}</span>
        {!disabled && (
          <button type="button" className="link-button link-button--muted" onClick={onRemove} aria-label={`Remove control ${c.ref}`}>
            Remove
          </button>
        )}
      </div>
      <Text id={`${c.id}-text`} label="Measure" value={c.text} rows={2} max={800} disabled={disabled} onChange={(v) => onChange({ text: v })} />
      <div className="field asm-field">
        <label htmlFor={`${c.id}-type`} className="field__label">
          Type (ISO 14971 7.1 order)
        </label>
        <select
          id={`${c.id}-type`}
          className="input"
          value={c.type}
          disabled={disabled}
          onChange={(e) => onChange({ type: e.target.value as ControlType })}
        >
          <option value="">Choose</option>
          {(Object.keys(CONTROL_TYPE_LABEL) as Exclude<ControlType, ''>[]).map((k, i) => (
            <option key={k} value={k}>
              {i + 1}. {CONTROL_TYPE_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <Text
          id={`${c.id}-impl`}
          label="Implementation verified by"
          value={c.implemented}
          max={200}
          placeholder="e.g. VER-012 design review, inspection record"
          disabled={disabled}
          onChange={(v) => onChange({ implemented: v })}
        />
        <Text
          id={`${c.id}-eff`}
          label="Effectiveness verified by"
          value={c.effective}
          max={200}
          placeholder="e.g. VER-020 test report, summative usability study"
          disabled={disabled}
          onChange={(v) => onChange({ effective: v })}
        />
      </div>
    </li>
  );
}

function HazardEditor({
  sum,
  disabled,
  patch,
  remove,
}: {
  sum: HazardSummary;
  disabled: boolean;
  patch: (p: Partial<Hazard>) => void;
  remove: () => void;
}) {
  const h = sum.hazard;
  const set = (k: keyof Hazard) => (v: string) => patch({ [k]: v } as Partial<Hazard>);
  const patchControl = (id: string, p: Partial<RiskControl>) => patch({ controls: h.controls.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const open = sum.issues.filter((i) => i.kind === 'open');
  const warns = sum.issues.filter((i) => i.kind === 'warn');
  return (
    <div className="stack asm-hz__body">
      <div className="field-row">
        <div className="field asm-field">
          <label htmlFor={`${h.id}-cat`} className="field__label">
            Category
          </label>
          <select id={`${h.id}-cat`} className="input" value={h.category} disabled={disabled} onChange={(e) => patch({ category: e.target.value })}>
            <option value="">Choose</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
            {h.category && !CATEGORIES.includes(h.category as (typeof CATEGORIES)[number]) && <option>{h.category}</option>}
          </select>
        </div>
        <Text id={`${h.id}-link`} label="Traces to design inputs" value={h.link} max={200} placeholder="e.g. DI-014, SRS-031" disabled={disabled} onChange={set('link')} />
      </div>
      <Text id={`${h.id}-hazard`} label="Hazard" value={h.hazard} max={600} disabled={disabled} onChange={set('hazard')} />
      <Text
        id={`${h.id}-sequence`}
        label="Foreseeable sequence of events"
        value={h.sequence}
        rows={2}
        max={1200}
        disabled={disabled}
        onChange={set('sequence')}
      />
      <div className="field-row">
        <Text id={`${h.id}-situation`} label="Hazardous situation" value={h.situation} max={600} disabled={disabled} onChange={set('situation')} />
        <Text id={`${h.id}-harm`} label="Harm" value={h.harm} max={600} disabled={disabled} onChange={set('harm')} />
      </div>
      <label className="check asm-check">
        <input type="checkbox" checked={h.software} disabled={disabled} onChange={(e) => patch({ software: e.target.checked })} />
        <span>Caused by a software failure: its probability is taken as 1, so rate how likely harm is once it fails (SOP-003)</span>
      </label>

      <div className="asm-rate">
        <RateSelect id={`${h.id}-sev`} label="Severity" kind="severity" value={h.severity} disabled={disabled} onChange={(n) => patch({ severity: n })} />
        <RateSelect
          id={`${h.id}-prob`}
          label="Probability of harm"
          kind="probability"
          value={h.probability}
          disabled={disabled}
          onChange={(n) => patch({ probability: n })}
        />
        <div className="stack asm-rate__out">
          <span className="field__label">Risk before control</span>
          <ZoneChip zone={sum.initial} />
        </div>
      </div>

      <section className="stack" aria-label={`${h.ref} risk controls`}>
        <h4 className="asm-sub">Risk controls</h4>
        {h.controls.length ? (
          <ul className="list-reset stack">
            {h.controls.map((c) => (
              <ControlEditor
                key={c.id}
                c={c}
                disabled={disabled}
                onChange={(p) => patchControl(c.id, p)}
                onRemove={() => patch({ controls: h.controls.filter((x) => x.id !== c.id) })}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-sm">
            {sum.initial === 'A' ? 'Acceptable before control: no control needed, though you can still add one.' : 'No controls yet.'}
          </p>
        )}
        {!disabled && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              patch({
                controls: [...h.controls, newControl(h)],
                nextControl: h.nextControl + 1,
                residualSeverity: h.residualSeverity || h.severity,
              })
            }
          >
            Add a control
          </Button>
        )}
      </section>

      {h.controls.length > 0 && (
        <section className="stack" aria-label={`${h.ref} residual risk`}>
          <h4 className="asm-sub">Residual risk</h4>
          <div className="asm-rate">
            <RateSelect
              id={`${h.id}-rsev`}
              label="Severity after control"
              kind="severity"
              value={h.residualSeverity}
              disabled={disabled}
              onChange={(n) => patch({ residualSeverity: n })}
            />
            <RateSelect
              id={`${h.id}-rprob`}
              label="Probability after control"
              kind="probability"
              value={h.residualProbability}
              disabled={disabled}
              onChange={(n) => patch({ residualProbability: n })}
            />
            <div className="stack asm-rate__out">
              <span className="field__label">Residual risk</span>
              <ZoneChip zone={sum.residual} />
            </div>
          </div>
          <Seg
            name={`${h.id}-new`}
            label="Do these controls introduce new hazards or change other risks? (ISO 14971 7.6)"
            value={h.newRisks}
            options={YES_NO}
            disabled={disabled}
            onChange={(v) => patch({ newRisks: v as Hazard['newRisks'] })}
          />
        </section>
      )}
      {(sum.residual === 'R' || sum.residual === 'U') && (
        <Text
          id={`${h.id}-benefit`}
          label="Benefit-risk rationale (ISO 14971 7.4)"
          value={h.benefit}
          rows={3}
          disabled={disabled}
          onChange={set('benefit')}
          hint={
            sum.residual === 'U'
              ? 'Explain why further control isn’t practicable and why the medical benefit outweighs this risk, with the evidence.'
              : 'Show the risk is reduced as far as possible and is outweighed by the benefit.'
          }
        />
      )}

      {(open.length > 0 || warns.length > 0) && (
        <ul className="list-reset stack asm-issues">
          {open.map((i) => (
            <li key={i.key} className="asm-todo">
              To do: {i.text}
            </li>
          ))}
          {warns.map((i) => (
            <li key={i.key} className="asm-warn">
              {i.text}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="button-row">
          <Button
            size="sm"
            variant="text"
            onClick={() => {
              if (window.confirm(`Delete ${h.ref}? Its reference won’t be reused.`)) remove();
            }}
          >
            Delete {h.ref}
          </Button>
        </div>
      )}
    </div>
  );
}

const METHOD =
  'The cross-functional team reviewed all residual risks together, including their combined effect, risks with common causes and the contribution of each hazard category, against the acceptability criteria in SOP-003 and the benefits of the intended use. Comparable devices on the market were considered as a reference.';

type Filter = 'all' | 'open' | 'high';

export default function RiskPage() {
  const { intake, derived, update, readOnly, tokens } = useIntake();
  const r = intake.risk;
  const sum = useMemo(() => summarizeRisk(intake, derived), [intake, derived]);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<Filter>('all');

  useHashTarget((hash) => {
    const h = r.hazards.find((x) => hash === `hz-${x.id}`);
    if (h) setOpenIds((o) => new Set(o).add(h.id));
  });

  const set = (next: Partial<RiskAnswers>) => update('risk', next);
  const toggle = (id: string) =>
    setOpenIds((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const patchHazard = (id: string, p: Partial<Hazard>) => set({ hazards: r.hazards.map((h) => (h.id === id ? { ...h, ...p } : h)) });
  const addFrom = (keys: string[] | null) => {
    let next = r;
    if (keys === null) next = addHazard(next);
    else for (const s of sum.pending.filter((x) => keys.includes(x.key))) next = addHazard(next, s);
    set({ hazards: next.hazards, nextRef: next.nextRef });
    if (keys === null) setOpenIds((o) => new Set(o).add(next.hazards[next.hazards.length - 1].id));
  };
  const cycle = (i: number) => {
    const m = sum.matrix.split('');
    m[i] = m[i] === 'A' ? 'R' : m[i] === 'R' ? 'U' : 'A';
    const v = m.join('');
    set({ matrix: v === DEFAULT_MATRIX ? '' : v });
  };

  const rows = sum.hazards.filter((h) =>
    filter === 'open' ? !h.complete : filter === 'high' ? h.residual === 'U' || h.residual === 'R' || h.initial === 'U' : true,
  );
  const o = r.overall;
  const setOverall = (p: Partial<RiskAnswers['overall']>) => set({ overall: { ...o, ...p } });
  const device = tokens.device?.value ?? 'your device';

  return (
    <AppShell>
      <main className="app-main asm-main">
        <AssessmentHead
          eyebrow="ISO 14971 RISK ASSESSMENT · RMF-001"
          title={`Hazards, risks and controls for ${device}`}
          docId="RMF-001"
          blurb={
            <>
              Identify each hazard and the sequence of events that leads to harm. Rate severity and probability on the SOP-003 matrix, then
              control the risk in the order ISO 14971 requires: design first, then protective measures, then information for safety. Verify
              each control, and judge the residual risk on its own and overall.
            </>
          }
        >
          <Progress done={sum.done} total={sum.total} label="Assessment" />
          <ul className="list-reset asm-facts">
            <li>
              <strong>{sum.hazards.length}</strong> {sum.hazards.length === 1 ? 'hazard' : 'hazards'},{' '}
              <strong>{sum.counts.controls}</strong> {sum.counts.controls === 1 ? 'control' : 'controls'}
            </li>
            <li>
              <strong>{sum.counts.residualU}</strong> unacceptable after control
              {sum.counts.onBenefit ? ` · ${sum.counts.onBenefit} on benefit-risk` : ''}
            </li>
            {sum.counts.unverified > 0 && (
              <li>
                <strong>{sum.counts.unverified}</strong> {sum.counts.unverified === 1 ? 'control' : 'controls'} without effectiveness evidence
              </li>
            )}
            {sum.pending.length > 0 && (
              <li>
                <strong>{sum.pending.length}</strong> suggested {sum.pending.length === 1 ? 'hazard' : 'hazards'} to review
              </li>
            )}
          </ul>
        </AssessmentHead>
        <ReadOnlyNote readOnly={readOnly} />

        <section className="card stack asm-card" aria-labelledby="risk-criteria-h">
          <div className="asm-card__head">
            <h2 id="risk-criteria-h" className="card__title">
              Risk acceptability criteria
            </h2>
            <span className="text-muted-sm">{sum.matrix === DEFAULT_MATRIX ? 'SOP-003 default' : 'Set for this device'}</span>
          </div>
          <div className="asm-criteria">
            <div className="table-wrap">
              <table className="asm-matrix" aria-label="Risk acceptability matrix">
                <thead>
                  <tr>
                    <th scope="col">Severity \ probability</th>
                    {PROBABILITY.map((p) => (
                      <th key={p.n} scope="col" title={p.desc}>
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...SEVERITY].reverse().map((s) => (
                    <tr key={s.n}>
                      <th scope="row" title={s.desc}>
                        {s.code} {s.name}
                      </th>
                      {PROBABILITY.map((p) => {
                        const i = (s.n - 1) * 5 + p.n - 1;
                        const z = sum.matrix[i] as Zone;
                        return (
                          <td key={p.n}>
                            <button
                              type="button"
                              className={`asm-cell asm-zone--${z}`}
                              disabled={readOnly}
                              onClick={() => cycle(i)}
                              aria-label={`${s.code} ${s.name}, ${p.name}: ${ZONE_LABEL[z]}. Change`}
                            >
                              {ZONE_LABEL[z]}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="stack asm-criteria__key">
              {(['A', 'R', 'U'] as const).map((z) => (
                <p key={z} className="text-muted-sm">
                  <ZoneChip zone={z} /> {ZONE_HINT[z]}
                </p>
              ))}
              <p className="text-muted-sm">
                Select a cell to change its zone. Probability is per use: {PROBABILITY.map((p) => `${p.name} ${p.desc.toLowerCase()}`).join('; ')}.
              </p>
              {sum.matrix !== DEFAULT_MATRIX && !readOnly && (
                <Button size="sm" variant="text" onClick={() => set({ matrix: '' })}>
                  Reset to the SOP-003 default
                </Button>
              )}
            </div>
          </div>
        </section>

        {sum.pending.length > 0 && (
          <section className="card stack asm-card" id="risk-suggestions" aria-labelledby="risk-sug-h">
            <div className="asm-card__head">
              <h2 id="risk-sug-h" className="card__title">
                Suggested from your device profile
              </h2>
              {!readOnly && sum.pending.length > 1 && (
                <Button size="sm" onClick={() => addFrom(sum.pending.map((x) => x.key))}>
                  Add all {sum.pending.length}
                </Button>
              )}
            </div>
            <p className="text-muted-sm">
              A starting point from your setup answers, with typical controls. Add the ones that apply, then rate probability and record the
              verification. It isn’t a complete hazard analysis: add hazards from your design, use and process FMEAs too.
            </p>
            <ul className="list-reset stack">
              {sum.pending.map((x) => (
                <li key={x.key} className="asm-pending__item">
                  <span className="stack">
                    <span className="asm-pending__name">{x.hazard}</span>
                    <span className="text-muted-sm">
                      {x.category} · harm: {x.harm.toLowerCase()} · {SEVERITY[x.severity - 1].code} · because of {x.because}
                    </span>
                  </span>
                  {!readOnly && (
                    <span className="button-row button-row--tight">
                      <Button size="sm" variant="outline" onClick={() => addFrom([x.key])} aria-label={`Add ${x.hazard}`}>
                        Add
                      </Button>
                      <Button size="sm" variant="text" onClick={() => set({ dismissed: [...r.dismissed, x.key] })} aria-label={`Dismiss ${x.hazard}`}>
                        Doesn’t apply
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card stack asm-card" id="risk-register" aria-labelledby="risk-reg-h">
          <div className="asm-card__head">
            <h2 id="risk-reg-h" className="card__title">
              Risk register
            </h2>
            <div className="button-row button-row--tight" role="group" aria-label="Show">
              {(
                [
                  ['all', `All · ${sum.hazards.length}`],
                  ['open', `With open items · ${sum.hazards.filter((h) => !h.complete).length}`],
                  ['high', 'Not acceptable'],
                ] as [Filter, string][]
              ).map(([k, l]) => (
                <button key={k} type="button" className={`pill${filter === k ? ' pill--active' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {sum.hazards.length === 0 ? (
            <p className="text-muted-sm">No hazards yet. Add the suggestions above, or add your own.</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-sm">Nothing matches this filter.</p>
          ) : (
            <ul className="list-reset stack asm-hzs">
              {rows.map((x) => {
                const h = x.hazard;
                const open = openIds.has(h.id);
                const left = x.total - x.done;
                return (
                  <li key={h.id} id={`hz-${h.id}`} className={`asm-hz${open ? ' asm-hz--open' : ''}`}>
                    <button type="button" className="asm-hz__row" aria-expanded={open} onClick={() => toggle(h.id)}>
                      <span className="mono asm-hz__ref">{h.ref}</span>
                      <span className="stack asm-hz__main">
                        <span className="asm-hz__title">{h.hazard || 'New hazard'}</span>
                        <span className="text-muted-sm">
                          {h.harm ? `Harm: ${h.harm}` : 'Harm not described'}
                          {h.controls.length ? ` · ${plural(h.controls.length, 'control')}` : ''}
                        </span>
                      </span>
                      <span className="asm-hz__zones">
                        <ZoneChip zone={x.initial} label="Before" />
                        {h.controls.length > 0 && <ZoneChip zone={x.residual} label="After" />}
                      </span>
                      <span className={`status ${x.complete ? 'status--ready' : 'status--input'}`}>{x.complete ? 'Complete' : `${left} to do`}</span>
                    </button>
                    {open && <HazardEditor sum={x} disabled={readOnly} patch={(p) => patchHazard(h.id, p)} remove={() => set({ hazards: r.hazards.filter((y) => y.id !== h.id) })} />}
                  </li>
                );
              })}
            </ul>
          )}
          {!readOnly && (
            <div className="button-row">
              <Button variant="outline" onClick={() => addFrom(null)}>
                Add a hazard
              </Button>
              {r.dismissed.length > 0 && (
                <Button variant="text" size="sm" onClick={() => set({ dismissed: [] })}>
                  Show {plural(r.dismissed.length, 'dismissed suggestion')} again
                </Button>
              )}
            </div>
          )}
        </section>

        <section className="card stack asm-card" id="risk-overall" aria-labelledby="risk-overall-h">
          <div className="asm-card__head">
            <h2 id="risk-overall-h" className="card__title">
              Overall residual risk
            </h2>
            <span className="text-muted-sm">ISO 14971 clause 8 · decided by top management</span>
          </div>
          <Text
            id="risk-method"
            label="How overall residual risk was evaluated"
            value={o.method}
            rows={3}
            max={3000}
            disabled={readOnly}
            onChange={(v) => setOverall({ method: v })}
            hint={
              !o.method && !readOnly ? (
                <button type="button" className="link-button" onClick={() => setOverall({ method: METHOD })}>
                  Use the standard method
                </button>
              ) : undefined
            }
          />
          <Text
            id="risk-benefits"
            label="Medical benefits of the device"
            value={o.benefits}
            rows={3}
            max={3000}
            disabled={readOnly}
            onChange={(v) => setOverall({ benefits: v })}
            placeholder="The clinical benefit for the indicated patients, with the evidence (clinical data, literature, comparable devices)"
          />
          <Text
            id="risk-disclosure"
            label="How significant residual risks are disclosed"
            value={o.disclosure}
            rows={2}
            max={3000}
            disabled={readOnly}
            onChange={(v) => setOverall({ disclosure: v })}
            placeholder="e.g. Warnings and precautions in the instructions for use, section 4"
          />
          <Seg
            name="risk-conclusion"
            label="Decision"
            value={o.conclusion}
            options={[
              { value: 'acceptable', label: 'Acceptable in relation to the benefits' },
              { value: 'not-acceptable', label: 'Not acceptable', tone: 'bad' },
            ]}
            disabled={readOnly}
            onChange={(v) => setOverall({ conclusion: v as RiskAnswers['overall']['conclusion'] })}
            hint={
              sum.counts.residualU && o.conclusion === 'acceptable'
                ? `${plural(sum.counts.residualU, 'risk')} stay unacceptable after control. Each needs a benefit-risk rationale before this decision holds.`
                : 'Recorded in the risk management report and approved before release.'
            }
          />
        </section>
      </main>
    </AppShell>
  );
}
