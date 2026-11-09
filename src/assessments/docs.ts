/**
 * The two assessments as suite documents: FRM-019 (21 CFR Part 11) and
 * RMF-001 (ISO 14971 risk assessment). Built from the assessment answers, so
 * they go through the same drafts, technical review, approval and export as
 * every other document.
 *
 * Customer text is always added as plain text segments, never parsed as a
 * template, so braces in an answer can't be mistaken for a value slot.
 */
import type { Derived } from '../intake/derive';
import type { Intake } from '../intake/model';
import type { Block, DocProgress, GeneratedSection, Segment } from '../templates/generate';
import type { P11Answer } from './model';
import {
  IMPACT_LABEL,
  outOfScopeReason,
  RESULT_LABEL,
  SCOPE_LABEL,
  summarizePart11,
  type P11Control,
} from './part11';
import {
  CATEGORIES,
  CONTROL_TYPE_LABEL,
  DEFAULT_MATRIX,
  PROBABILITY,
  probLabel,
  SEVERITY,
  sevLabel,
  summarizeRisk,
  ZONE_HINT,
  ZONE_LABEL,
} from './risk';

export interface BuildCtx {
  ix: Intake;
  d: Derived;
  tpl: (text: string) => Segment[];
  tplBlocks: (text: string) => Block[];
}

export interface BuiltDoc {
  sections: Omit<GeneratedSection, 'n'>[];
  progress: DocProgress;
}

const txt = (text: string): Segment[] => [{ kind: 'text', text }];
const p = (segs: Segment[]): Block => ({ kind: 'p', segs });
const list = (items: string[]): Block => ({ kind: 'list', items: items.map(txt) });
const table = (head: string[], rows: string[][], widths?: number[]): Block => ({
  kind: 'table',
  head,
  rows: rows.map((r) => r.map(txt)),
  widths,
});
const or = (v: string, fallback: string) => (v.trim() ? v.trim() : fallback);
const yesNo = (v: string, yes = 'Yes', no = 'No') => (v === 'yes' ? yes : v === 'no' ? no : '[Not answered]');
const section = (title: string, purpose: string, blocks: Block[]) => ({ title, purpose, blocks });

/* ---------- FRM-019 ---------- */

function resultText(a: P11Answer | undefined, accepted: boolean) {
  if (!a?.result) return '[Not assessed]';
  const base = accepted ? 'Partly met, accepted on risk' : RESULT_LABEL[a.result];
  return a.suggested ? `${base} (suggested, to confirm)` : base;
}

function controlRows(controls: P11Control[], answers: Record<string, P11Answer>, canAcceptRisk: boolean) {
  return controls.map((c) => {
    const a = answers[c.id];
    const accepted = !!a?.accepted && canAcceptRisk && !!c.discretion && a.result === 'partial';
    return [`${c.id} ${c.title}`, resultText(a, accepted), or(a?.evidence ?? '', '[Evidence needed]')];
  });
}

function part11Doc({ ix, tpl }: BuildCtx): BuiltDoc {
  const sum = summarizePart11(ix);
  const sections: Omit<GeneratedSection, 'n'>[] = [];

  sections.push(
    section('Scope and approach', 'Which systems are assessed, and how', [
      p(
        tpl(
          'This assessment covers each computerized system {{company}} uses to create, change, keep or sign quality records for {{device}}. It is kept under SOP-001 and updated before a system is added or its use changes.',
        ),
      ),
      p(
        txt(
          'Applicability follows FDA’s guidance “Part 11, Electronic Records; Electronic Signatures — Scope and Application” (2003). Part 11 applies to records that predicate rules require (21 CFR 820, which incorporates ISO 13485, and Parts 803, 806 and 830) when they are kept and relied on in electronic form, and to electronic signatures used in place of handwritten ones.',
        ),
      ),
      p(
        txt(
          'Controls are set by risk. FDA applies enforcement discretion to validation, copies, retention and audit trails (11.10(a), (b), (c), (e) and (k)(2)) when they follow a documented risk assessment. The predicate rules still apply: ISO 13485 4.1.6 requires validation of quality system software, and 4.2.5 requires records to stay legible, retrievable and protected from change. Each system is rated High, Medium or Low on how much a wrong or lost record could affect product quality or patient safety.',
        ),
      ),
      p(
        txt(
          'Each control is Met, Partly met, Not met, or Not applicable with a reason. Partly met and Not met results carry a corrective action. A partly met control under enforcement discretion, on a Medium or Low risk system, may instead be accepted on that documented risk.',
        ),
      ),
    ]),
  );

  const inv: Block[] = [];
  if (!sum.systems.length) inv.push(p(txt('[Systems to be listed]')));
  else
    inv.push(
      table(
        ['System', 'Used for', 'Required records', 'Relied on electronically', 'E-signatures', 'Access', 'Risk', 'Determination'],
        sum.systems.map(({ system: s, scope }) => [
          or(s.name, '[Unnamed system]'),
          or(s.use, '—'),
          yesNo(s.records),
          s.records === 'yes' ? yesNo(s.relied) : '—',
          yesNo(s.signatures),
          scope === 'out' || scope === 'unknown' ? '—' : yesNo(s.open, 'Open', 'Closed'),
          s.impact ? IMPACT_LABEL[s.impact] : scope === 'out' ? '—' : '[Not rated]',
          SCOPE_LABEL[scope] + (s.suggestedScope ? ' (suggested, to confirm)' : ''),
        ]),
        [14, 18, 10, 11, 10, 9, 8, 20],
      ),
    );
  const out = sum.systems.filter((x) => x.scope === 'out');
  if (out.length) {
    inv.push(p(txt('Systems not in scope, with the reason:')));
    inv.push(list(out.map((x) => `${or(x.system.name, 'Unnamed system')}: ${outOfScopeReason(x.system)}`)));
  }
  if (sum.pendingSystems.length)
    inv.push(p(txt(`Still to decide: ${sum.pendingSystems.map((x) => x.name).join(', ')}, named in the setup answers.`)));
  sections.push(section('Systems and scope', 'Every system that holds quality records or signatures, and whether Part 11 applies', inv));

  sections.push(
    section(
      'Company-wide controls',
      'Training, accountability, identity and the FDA certification letter',
      sum.company.length
        ? [table(['Control', 'Result', 'Evidence or rationale'], controlRows(sum.company, ix.part11.company, false), [30, 18, 52])]
        : [p(txt('Not assessed: no system is in scope yet.'))],
    ),
  );

  for (const x of sum.systems) {
    if (x.scope !== 'records' && x.scope !== 'records-signatures') continue;
    const s = x.system;
    sections.push(
      section(
        or(s.name, 'Unnamed system'),
        `${SCOPE_LABEL[x.scope]} · ${s.impact ? `${IMPACT_LABEL[s.impact]} risk` : 'risk not rated'}`,
        [
          p(txt(`Used for: ${or(s.use, '[Use to be described]')}. ${s.open === 'yes' ? 'Open system: 11.30 applies.' : 'Closed system: your company controls who has access.'}`)),
          table(['Control', 'Result', 'Evidence or rationale'], controlRows(x.controls, s.answers, s.impact !== 'high'), [30, 18, 52]),
        ],
      ),
    );
  }

  const fx: Block[] = [];
  if (!sum.findings.length) fx.push(p(txt(sum.complete ? 'No findings.' : 'No findings so far.')));
  else
    fx.push(
      table(
        ['#', 'System', 'Control', 'Finding', 'Corrective action', 'Owner', 'Due'],
        sum.findings.map((f, i) => [
          String(i + 1),
          f.system,
          `${f.control.id} ${f.control.title}`,
          `${RESULT_LABEL[f.answer.result as 'partial']}: ${f.answer.evidence.trim()}`,
          f.answer.action.trim(),
          or(f.answer.owner, '[Owner]'),
          or(f.answer.due, '[Date]'),
        ]),
        [4, 13, 15, 26, 24, 10, 8],
      ),
    );
  if (sum.accepted.length) {
    fx.push(p(txt('Partly met controls accepted on documented risk (FDA enforcement discretion):')));
    fx.push(
      table(
        ['System', 'Control', 'Rationale'],
        sum.accepted.map((f) => [f.system, `${f.control.id} ${f.control.title}`, f.answer.evidence.trim()]),
        [22, 28, 50],
      ),
    );
  }
  sections.push(section('Findings and corrective actions', 'What falls short and what will be done', fx));

  const concl: Block[] = [];
  if (!sum.complete) {
    concl.push(
      p(
        txt(
          `Assessment in progress: ${sum.done} of ${sum.total} items complete${sum.suggested ? `, ${sum.suggested} suggestion${sum.suggested > 1 ? 's' : ''} to confirm` : ''}.`,
        ),
      ),
    );
  } else {
    const clean = sum.systems.filter((x) => x.status === 'compliant').length;
    concl.push(
      p(
        txt(
          `${sum.inScope} of ${sum.systems.length} system${sum.systems.length === 1 ? '' : 's'} in scope. ${clean} meet${clean === 1 ? 's' : ''} every applicable control${sum.accepted.length ? ' or have documented risk acceptances' : ''}. ${sum.findings.length ? `${sum.findings.length} finding${sum.findings.length === 1 ? ' has a' : 's have'} corrective action${sum.findings.length === 1 ? '' : 's'}; findings that meet CAPA criteria are opened under SOP-007.` : 'There are no findings.'}`,
        ),
      ),
    );
    const cert = ix.part11.company['11.100(c)'];
    if (sum.company.some((c) => c.id === '11.100(c)') && cert?.result !== 'met' && cert?.result !== 'na')
      concl.push(p(txt('Electronic signatures are not relied on until the 11.100(c) certification letter has been sent to FDA.')));
  }
  concl.push(
    p(
      tpl(
        'Assessed by {{qualityLead}}. Reviewed at each management review (SOP-012) and whenever a listed system, its configuration or its use changes.',
      ),
    ),
  );
  sections.push(section('Conclusion', 'Overall result and when it is reviewed again', concl));

  return {
    sections,
    progress: {
      done: sum.done,
      total: sum.total,
      suggested: sum.suggested,
      suggestedTotal: sum.suggestedTotal,
      todo: [
        ...sum.pendingSystems.slice(0, 3).map((x) => ({ label: `Add or dismiss ${x.name}`, to: '/app/assessments/part11#p11-systems' })),
        ...sum.todo.slice(0, 8).map((t) => ({ label: t.label, to: `/app/assessments/part11#${t.anchor}` })),
      ],
      href: '/app/assessments/part11',
      name: 'Part 11 assessment',
    },
  };
}

/* ---------- RMF-001 ---------- */

function riskDoc({ ix, d, tpl }: BuildCtx): BuiltDoc {
  const sum = summarizeRisk(ix, d);
  const r = ix.risk;
  const sections: Omit<GeneratedSection, 'n'>[] = [];

  sections.push(
    section('Scope', 'Device, intended use and lifecycle', [
      p(tpl('Risk assessment for {{device}}, a {{deviceType}}. Intended use: {{intendedUse}}')),
      p(tpl('Intended users: {{users}}. Use environment: {{environment}}. Expected lifetime: {{lifetime}}.')),
      p(
        tpl(
          'Performed under SOP-003 Risk Management, following ISO 14971:2019 and ISO/TR 24971:2020. Owner: {{qualityLead}}, with {{engLead}}. It covers hazard identification, risk estimation and evaluation, risk control and residual risk (ISO 14971 clauses 5 to 8), and is updated with design changes and with production and post-production information (clause 10).',
        ),
      ),
    ]),
  );

  const zoneName = (z: string) => ZONE_LABEL[z as 'A'];
  sections.push(
    section('Risk acceptability criteria', 'Severity and probability scales and the acceptability matrix from SOP-003', [
      table(['Severity', 'Name', 'Definition'], SEVERITY.map((x) => [x.code, x.name, x.desc]), [14, 20, 66]),
      table(['Probability', 'Name', 'Definition'], PROBABILITY.map((x) => [String(x.n), x.name, x.desc]), [14, 20, 66]),
      table(
        ['Severity \\ probability', ...PROBABILITY.map((x) => x.name)],
        SEVERITY.map((sv) => [`${sv.code} ${sv.name}`, ...PROBABILITY.map((pr) => zoneName(sum.matrix[(sv.n - 1) * 5 + pr.n - 1]))]),
        [25, 15, 15, 15, 15, 15],
      ),
      list((['A', 'R', 'U'] as const).map((z) => `${ZONE_LABEL[z]}: ${ZONE_HINT[z]}`)),
      p(
        txt(
          `${sum.matrix === DEFAULT_MATRIX ? 'This is the default matrix in SOP-003.' : 'This matrix was set for this device and differs from the SOP-003 default; the change is justified in the risk management plan.'} For software failures the probability of the failure itself can’t be estimated, so it is taken as 1 and the estimate rests on the probability that the failure leads to harm (P1 × P2 in SOP-003).`,
        ),
      ),
    ]),
  );

  const byCat = CATEGORIES.map((c) => [c, r.hazards.filter((h) => h.category === c).length] as const).filter(([, n]) => n);
  const other = r.hazards.filter((h) => !CATEGORIES.includes(h.category as (typeof CATEGORIES)[number])).length;
  const drafted = r.hazards.filter((h) => h.key).length;
  sections.push(
    section('Hazard identification', 'How hazards were found, by category', [
      p(
        txt(
          'Hazards were identified from the intended use and reasonably foreseeable misuse, using the questions in ISO/TR 24971 Annex A and the hazard examples in ISO 14971 Annex C, and with design, use and process FMEAs as they become available.',
        ),
      ),
      ...(r.hazards.length
        ? [
            list([...byCat.map(([c, n]) => `${c}: ${n}`), ...(other ? [`Other: ${other}`] : [])]),
            p(
              txt(
                `${r.hazards.length} hazard${r.hazards.length === 1 ? '' : 's'} in the register: ${drafted} drafted by the agent from the device profile and reviewed by the team, ${r.hazards.length - drafted} added by the team.${sum.pending.length ? ` ${sum.pending.length} more suggested hazard${sum.pending.length === 1 ? ' is' : 's are'} still to be reviewed.` : ''}`,
              ),
            ),
          ]
        : [p(txt('[Hazards to be identified]'))]),
    ]),
  );

  sections.push(
    section('Risk estimation and evaluation', 'Each hazard, its sequence of events, harm and risk before control', [
      r.hazards.length
        ? table(
            ['ID', 'Hazard', 'Sequence of events and hazardous situation', 'Harm', 'Severity', 'Probability', 'Risk'],
            sum.hazards.map(({ hazard: h, initial }) => [
              h.ref,
              or(h.hazard, '[Hazard]') + (h.software ? ' (software failure)' : ''),
              `${or(h.sequence, '[Sequence of events]')} → ${or(h.situation, '[Hazardous situation]')}`,
              or(h.harm, '[Harm]'),
              h.severity ? sevLabel(h.severity) : '[Not rated]',
              h.probability ? probLabel(h.probability) : '[Not rated]',
              initial ? ZONE_LABEL[initial] : '[Not evaluated]',
            ]),
            [7, 17, 28, 16, 11, 10, 11],
          )
        : p(txt('[No hazards yet]')),
    ]),
  );

  const controls = sum.hazards.flatMap(({ hazard: h }) => h.controls.map((c) => ({ h, c })));
  sections.push(
    section('Risk control and verification', 'Measures in the priority order of ISO 14971 7.1, with verification of implementation and effectiveness', [
      p(
        txt(
          'Controls are chosen in this order: inherent safety by design, then protective measures in the device or its manufacture, then information for safety. Each is verified as implemented and as effective (ISO 14971 7.2), and its verification is traced in DHF-T4.',
        ),
      ),
      controls.length
        ? table(
            ['Control', 'Hazard', 'Measure', 'Type', 'Implementation verified', 'Effectiveness verified'],
            controls.map(({ h, c }) => [
              c.ref,
              h.ref,
              or(c.text, '[Measure]'),
              c.type ? CONTROL_TYPE_LABEL[c.type] : '[Type]',
              or(c.implemented, '[Record needed]'),
              or(c.effective, '[Record needed]'),
            ]),
            [10, 8, 34, 16, 16, 16],
          )
        : p(txt('No risk controls yet.')),
    ]),
  );

  const withControls = sum.hazards.filter((x) => x.hazard.controls.length);
  const benefit = sum.hazards.filter((x) => x.residual === 'R' || x.residual === 'U');
  sections.push(
    section('Residual risk evaluation', 'Risk after control, new hazards from controls, and benefit-risk', [
      withControls.length
        ? table(
            ['ID', 'Controls', 'Residual severity', 'Residual probability', 'Residual risk', 'New hazards from controls'],
            withControls.map(({ hazard: h, residual }) => [
              h.ref,
              h.controls.map((c) => c.ref).join(', '),
              h.residualSeverity ? sevLabel(h.residualSeverity) : '[Not rated]',
              h.residualProbability ? probLabel(h.residualProbability) : '[Not rated]',
              residual ? ZONE_LABEL[residual] : '[Not evaluated]',
              h.newRisks === 'yes' ? 'Yes, added to the register' : h.newRisks === 'no' ? 'None' : '[Not reviewed]',
            ]),
            [8, 20, 18, 17, 15, 22],
          )
        : p(txt('No controlled risks yet. Risks acceptable before control keep their initial rating.')),
      ...(benefit.length
        ? [
            p(txt('Residual risks that need a benefit-risk rationale (ISO 14971 7.4):')),
            table(
              ['ID', 'Residual risk', 'Benefit-risk rationale'],
              benefit.map(({ hazard: h, residual }) => [h.ref, ZONE_LABEL[residual!], or(h.benefit, '[Rationale needed]')]),
              [10, 18, 72],
            ),
          ]
        : []),
      ...(sum.hazards.some((x) => x.hazard.link.trim())
        ? [
            p(txt('Traceability to design inputs:')),
            list(sum.hazards.filter((x) => x.hazard.link.trim()).map((x) => `${x.hazard.ref}: ${x.hazard.link.trim()}`)),
          ]
        : []),
    ]),
  );

  const o = r.overall;
  sections.push(
    section('Overall residual risk', 'ISO 14971 clause 8: the combined residual risk against the medical benefit', [
      p(txt(`Method: ${or(o.method, '[How overall residual risk was evaluated]')}`)),
      p(txt(`Medical benefits: ${or(o.benefits, '[Benefits of the device]')}`)),
      p(txt(`Disclosure of residual risks: ${or(o.disclosure, '[How significant residual risks are disclosed to users]')}`)),
      p(
        txt(
          `Decision: ${o.conclusion === 'acceptable' ? 'the overall residual risk is acceptable in relation to the benefits of intended use.' : o.conclusion === 'not-acceptable' ? 'the overall residual risk is not acceptable. The device is not released until it is reduced or the design changes.' : '[Decision to be recorded]'}`,
        ),
      ),
      p(tpl('The decision is made by top management ({{ceo}}) and recorded in the risk management report before release.')),
    ]),
  );

  const warns = sum.hazards.flatMap((x) => x.issues.filter((i) => i.kind === 'warn').map((i) => `${x.hazard.ref}: ${i.text}`));
  sections.push(
    section('Open items and review notes', 'What is left before this assessment is complete', [
      sum.todo.length || sum.pending.length
        ? list([
            ...(sum.pending.length ? [`Review ${sum.pending.length} suggested hazard${sum.pending.length === 1 ? '' : 's'}`] : []),
            ...sum.todo.slice(0, 40).map((t) => t.label),
            ...(sum.todo.length > 40 ? [`And ${sum.todo.length - 40} more`] : []),
          ])
        : p(txt('None. Every hazard is rated, controlled where needed, verified and evaluated.')),
      ...(warns.length ? [p(txt('Notes for the reviewer:')), list(warns)] : []),
    ]),
  );

  return {
    sections,
    progress: {
      done: sum.done,
      total: sum.total,
      suggested: sum.suggested,
      suggestedTotal: sum.suggestedTotal,
      todo: [
        ...(sum.pending.length ? [{ label: `Review ${sum.pending.length} suggested hazards`, to: '/app/assessments/risk#risk-suggestions' }] : []),
        ...sum.todo.slice(0, 8).map((t) => ({ label: t.label, to: `/app/assessments/risk#${t.anchor}` })),
      ],
      href: '/app/assessments/risk',
      name: 'risk assessment',
    },
  };
}

export const ASSESSMENT_DOCS: Record<string, (c: BuildCtx) => BuiltDoc> = {
  'FRM-019': part11Doc,
  'RMF-001': riskDoc,
};
