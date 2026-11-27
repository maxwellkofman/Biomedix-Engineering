/**
 * Equipment validation (CQV) documents. Each piece of equipment gets a
 * package: URS, validation plan, commissioning record, IQ, OQ and PQ
 * protocols, traceability matrix and summary report, as far as its impact
 * calls for them. The same builders with an empty record produce the blank
 * templates in CQV-T1–8.
 *
 * Protocols are templates for execution: result, pass/fail and signature
 * columns are left empty to be completed on the executed copy.
 */
import type { TokenKey } from '../intake/derive';
import type { Block, GeneratedSection, Segment } from '../templates/generate';
import { ans, mark, or, p, section, txt, yesNo } from '../templates/blocks';
import { SECTIONS, SOFTWARE_LABEL, VERIFY_LABEL } from './catalog';
import { newEquipment, type Equipment, type UserRequirement } from './model';
import {
  asksPq,
  asksRecords,
  displayName,
  docChecks,
  docIdOf,
  IMPACT_HINT,
  IMPACT_LABEL,
  impactOf,
  kindLabel,
  PHASE_SUMMARY,
  PHASE_TITLE,
  PHASE_WHEN,
  PHASES,
  protocolRows,
  rationaleOf,
  summarizeEquipment,
  traceOf,
  type EquipmentSummary,
  type Phase,
} from './summary';

type Cell = string | Segment[];
type Tpl = (text: string) => Segment[];

const tbl = (head: string[], rows: Cell[][], widths?: number[]): Block => ({
  kind: 'table',
  head,
  rows: rows.map((r) => r.map((c) => (typeof c === 'string' ? txt(c) : c))),
  widths,
});
const blankRows = (n: number, cols: number, first?: (i: number) => string): Cell[][] =>
  Array.from({ length: n }, (_, i) => Array.from({ length: cols }, (_, k) => (k === 0 && first ? first(i) : '')));

const make = (e: Equipment) => {
  const v = [e.manufacturer, e.model].map((x) => x.trim()).filter(Boolean).join(' ');
  return v ? mark('Manufacturer and model', v) : '[Manufacturer and model]';
};
const nameOf = (e: Equipment) => or(e.name, '[Equipment name]');
const ownerCell = (e: Equipment, tpl: Tpl, owner: TokenKey): Segment[] => (e.owner.trim() ? txt(mark('System owner', e.owner.trim())) : tpl(`{{${owner}}}`));

export const ownerFor = (e: Equipment): TokenKey =>
  e.kind === 'production' || e.kind === 'environmental' || e.kind === 'utility' ? 'opsLead' : 'engLead';

const sectionOrder = (s: string) => {
  const i = (SECTIONS as readonly string[]).indexOf(s);
  return i < 0 ? SECTIONS.length : i;
};
const reqText = (r: UserRequirement) => `${r.ref}: ${or(r.text, '[Requirement]', 'Requirement')}`;

interface Ctx {
  e: Equipment;
  sum: EquipmentSummary;
  phases: Phase[];
  tpl: Tpl;
  blank: boolean;
  owner: TokenKey;
}

const idOf = (c: Ctx, ph: Phase) => docIdOf(c.e, ph);
const has = (c: Ctx, ph: Phase) => c.phases.includes(ph);

function identity(c: Ctx): Block {
  const { e } = c;
  return p(
    txt(
      `${e.ref} ${nameOf(e)}: ${kindLabel(e)}, ${make(e)}, installed at ${or(e.location, '[Location]')}. Intended use: ${or(e.purpose, '[Intended use]', 'Intended use')}`,
    ),
  );
}

function signoff(rows: string[]): Block {
  return tbl(['Role', 'Name', 'Signature', 'Date'], rows.map((r) => [r, '', '', '']), [28, 28, 26, 18]);
}

function instruments(): Block {
  return tbl(['Test instrument', 'Equipment ID', 'Calibration due', 'Used in steps'], blankRows(3, 4), [34, 22, 20, 24]);
}

function deviations(): Block {
  return tbl(
    ['#', 'Step', 'What happened', 'Effect on product and on the validation', 'Resolution', 'Closed by and date'],
    blankRows(3, 6, (i) => String(i + 1)),
    [5, 9, 24, 24, 22, 16],
  );
}

function rowsTable(c: Ctx, phase: 'IQ' | 'OQ' | 'PQ' | 'FAT' | 'SAT'): Block {
  const rows = protocolRows(c.e, phase);
  return tbl(
    ['Step', 'Check', 'Method', 'Expected result', 'Actual result', 'Pass or fail', 'By and date'],
    rows.map((r) => [
      r.id,
      r.fromAnswers ? `${r.ref}: ${or(r.check, '[Requirement]', 'Requirement')}` : r.check,
      r.fromAnswers ? or(r.method, '[Test method]', 'Test method') : r.method,
      r.fromAnswers ? or(r.expected, '[Acceptance criterion]', 'Acceptance criterion') : r.expected,
      '',
      '',
      '',
    ]),
    [7, 20, 19, 19, 15, 9, 11],
  );
}

function prerequisites(c: Ctx, phase: 'IQ' | 'OQ' | 'PQ'): Block {
  const items = [
    `${idOf(c, 'URS')} User Requirements Specification is approved.`,
    `${idOf(c, 'VP')} Validation Plan is approved.`,
    ...(has(c, 'CX') && phase === 'IQ' ? [`${idOf(c, 'CX')} Commissioning Record is complete, or its open items are assessed as not affecting IQ.`] : []),
    ...(phase === 'OQ' ? [`${idOf(c, 'IQ')} is executed, and its deviations are closed or assessed as not affecting OQ.`] : []),
    ...(phase === 'PQ'
      ? [
          `${idOf(c, 'OQ')} is executed, and its deviations are closed or assessed as not affecting PQ.`,
          'Operators are trained on the work instruction for routine use.',
        ]
      : []),
    'This protocol is approved before execution starts.',
    'Each person who executes it is trained on this protocol and on good documentation practice.',
  ];
  return { kind: 'list', items: items.map(txt) };
}

const executionNote = p(
  txt(
    'Record each result when it is observed, in ink or in a validated electronic system, and attach raw data where the method produces it. Correct an entry with a single line through it, the reason, initials and date. A step that does not meet its expected result is a deviation: record it below and do not continue past a step that the deviation affects.',
  ),
);

/* ---------- URS ---------- */

function urs(c: Ctx): Omit<GeneratedSection, 'n'>[] {
  const { e, tpl } = c;
  const verifyIn = has(c, 'RTM')
    ? `Each requirement is traced to its verification in ${idOf(c, 'RTM')}.`
    : has(c, 'CX')
      ? `Each requirement is verified in ${idOf(c, 'CX')}.`
      : `Each requirement is verified in the protocols that ${idOf(c, 'VP')} sets.`;
  const out = [
    section('Purpose and scope', 'What this specification covers and how it is used', [
      p(
        tpl(
          `This specification states what {{company}} requires of the equipment below before it is bought, installed or used. It is the basis for choosing the supplier, for commissioning and for qualification. ${verifyIn}`,
        ),
      ),
    ]),
    section('Equipment and intended use', 'Identification and what it is for', [
      tbl(
        ['Item', 'Detail'],
        [
          ['Equipment ID', `${e.ref}${e.asset.trim() ? ` (asset ${ans('Asset ID', e.asset)})` : ''}`],
          ['Name', nameOf(e)],
          ['Type', kindLabel(e)],
          ['Manufacturer and model', make(e)],
          ['Serial number', e.serial.trim() ? mark('Serial number', e.serial.trim()) : 'Recorded at installation (IQ)'],
          ['Location', or(e.location, '[Location]')],
          ['System owner', ownerCell(e, tpl, c.owner)],
          ['Intended use', or(e.purpose, '[Intended use]', 'Intended use')],
        ],
        [28, 72],
      ),
    ]),
    section('Impact and applicable requirements', 'Why it is validated, and to what', [
      ...impactBlocks(c),
      p(txt('Regulations and standards that apply:')),
      {
        kind: 'list',
        items: [
          '21 CFR Part 820 (Quality Management System Regulation), which incorporates ISO 13485:2016 by reference',
          'ISO 13485:2016 6.3, infrastructure and its maintenance',
          ...(e.kind === 'measuring' || e.calibration === 'yes' ? ['ISO 13485:2016 7.6, control of monitoring and measuring equipment (SOP-015)'] : []),
          ...(e.kind && e.kind !== 'measuring' && e.kind !== 'utility' ? ['ISO 13485:2016 7.5.6, validation of processes (SOP-009)'] : []),
          ...(e.software === 'configurable' || e.software === 'custom' ? ['ISO 13485:2016 4.1.6 and 7.5.6, validation of software used in production and the quality system (SOP-014)'] : []),
          ...(e.records === 'yes' ? ['21 CFR Part 11, electronic records and electronic signatures (FRM-019)'] : []),
        ].map(txt),
      },
    ]),
  ];

  const groups = [...new Set(e.requirements.map((r) => r.section || 'Other'))].sort((a, b) => sectionOrder(a) - sectionOrder(b));
  if (c.blank || !e.requirements.length) {
    out.push(
      section('Requirements', 'Each requirement, its acceptance criterion and where it is verified', [
        p(txt(`Group requirements under these headings: ${SECTIONS.join('; ')}.`)),
        tbl(['ID', 'Requirement', 'Acceptance criterion', 'Priority', 'Verified in'], blankRows(c.blank ? 5 : 1, 5, (i) => (c.blank ? `UR-${String(i + 1).padStart(2, '0')}` : '[Requirements to be added]')), [8, 36, 30, 12, 14]),
      ]),
    );
  } else {
    for (const g of groups) {
      const reqs = e.requirements.filter((r) => (r.section || 'Other') === g);
      out.push(
        section(`Requirements: ${g.toLowerCase()}`, `${reqs.length} requirement${reqs.length === 1 ? '' : 's'}`, [
          tbl(
            ['ID', 'Requirement', 'Acceptance criterion', 'Priority', 'Verified in'],
            reqs.map((r) => [
              r.ref,
              or(r.text, '[Requirement]', 'Requirement'),
              or(r.criterion, '[Acceptance criterion]', 'Acceptance criterion'),
              r.priority === 'essential' ? 'Essential' : 'Desirable',
              VERIFY_LABEL[r.verify],
            ]),
            [8, 36, 30, 12, 14],
          ),
        ]),
      );
    }
  }
  out.push(
    section('Conventions', 'How requirements are written and judged', [
      p(
        txt(
          `Each requirement is a single “shall” statement that a test, inspection or document review can verify. Essential requirements are met before the equipment is released for use. A desirable requirement that is not met is recorded, with the reason, in ${has(c, 'VSR') ? idOf(c, 'VSR') : has(c, 'CX') ? idOf(c, 'CX') : 'the summary report'}.`,
        ),
      ),
    ]),
    section('Change control', 'Changing this specification', [
      p(
        txt(
          'Changes to this specification are made under SOP-001. A change after approval is assessed for its effect on completed commissioning and qualification, and the traceability matrix is updated in the same change.',
        ),
      ),
    ]),
  );
  return out;
}

function impactBlocks(c: Ctx): Block[] {
  const { e } = c;
  const impact = impactOf(e);
  const rows: Cell[][] = [
    ['Does it make, measure or inspect product, or decide whether product is accepted?', yesNo(e.product)],
    ...(e.product !== 'yes' ? [['Does it support a validated process or controlled environment?', yesNo(e.supports)] as Cell[]] : []),
    ...(asksPq(e) || c.blank
      ? [['Does it run a process whose result isn’t fully verified afterwards, or hold product under controlled conditions?', yesNo(e.pq)] as Cell[]]
      : []),
    ['Does it need calibration?', yesNo(e.calibration)],
    ['What software does it have?', e.software ? SOFTWARE_LABEL[e.software] : '[Not answered]'],
    ...(asksRecords(e) || c.blank ? [['Does it create or keep electronic quality records?', yesNo(e.records)] as Cell[]] : []),
  ];
  const result = impact
    ? `${IMPACT_LABEL[impact]}. ${IMPACT_HINT[impact]} ${rationaleOf(e)}`
    : c.blank
      ? 'Result: ☐ Direct impact ☐ Indirect impact ☐ No impact, with the reason.'
      : '[Impact to be decided from the answers above]';
  return [
    tbl(['Impact question', 'Answer'], rows, [72, 28]),
    p(txt(result)),
    ...(e.rationale.trim() ? [p(txt(`Notes: ${ans('Impact rationale', e.rationale)}`))] : []),
  ];
}

/* ---------- Validation plan ---------- */

function excludedReason(c: Ctx, ph: Phase): string {
  const { e } = c;
  if (ph === 'CX') return 'No: no factory or site acceptance test is planned';
  if (ph === 'PQ') {
    if (e.kind === 'measuring') return 'No: a measuring instrument is covered by calibration and OQ';
    if (impactOf(e) === 'indirect') return 'No: indirect impact';
    if (e.pq === 'no') return 'No: its output is fully verified afterwards';
    return '[Decided by the impact answers]';
  }
  return '[Decided by the impact answers]';
}

function vp(c: Ctx): Omit<GeneratedSection, 'n'>[] {
  const { e, tpl } = c;
  const pqRuns = /^\d+$/.test(e.pqRuns.trim()) ? e.pqRuns.trim() : '';
  return [
    section('Purpose and scope', 'What is validated and what releases it for use', [
      p(
        tpl(
          'This plan sets out how {{company}} commissions and qualifies the equipment below for its intended use, and the evidence that releases it for use. It follows SOP-009 and SOP-015, the GHTF SG3/N99-10 process validation guidance and, for commissioning, ASTM E2500.',
        ),
      ),
      identity(c),
    ]),
    section('Impact assessment', 'Whether and how it can affect product quality', impactBlocks(c)),
    section('Validation approach', 'Which documents apply, in what order', [
      tbl(
        ['Document', 'Included', 'When'],
        PHASES.map((ph) => [
          `${idOf(c, ph)} ${PHASE_TITLE[ph]}`,
          has(c, ph) || c.blank ? 'Yes' : excludedReason(c, ph),
          PHASE_WHEN[ph],
        ]),
        [44, 28, 28],
      ),
      p(
        txt(
          'Phases run in the order above. Each protocol is approved before it is executed, and a phase starts only when the one before it is complete or its open deviations are assessed as not affecting it. Commissioning results are referenced in IQ or OQ instead of being repeated when they were recorded under an approved protocol with Quality oversight.',
        ),
      ),
      ...(has(c, 'PQ') || c.blank
        ? [p(txt(`Performance qualification runs ${pqRuns ? mark('PQ runs', pqRuns) : '[Number of PQ runs]'} consecutive runs under routine conditions.`))]
        : []),
    ]),
    section('Roles and responsibilities', 'Who writes, executes and approves', [
      tbl(
        ['Role', 'Responsibility'],
        [
          [
            [...txt('System owner: '), ...ownerCell(e, tpl, c.owner)],
            'Writes the URS, provides operators and the work instruction for routine use, and keeps the equipment in its qualified state.',
          ],
          [tpl('Validation lead: {{engLead}}'), 'Writes and executes the protocols, records results and deviations, and writes the summary report.'],
          [tpl('Quality: {{qualityLead}}'), 'Approves this plan, each protocol and the summary report, and decides on deviations that affect product.'],
          [
            txt(`Supplier: ${e.manufacturer.trim() ? mark('Manufacturer', e.manufacturer.trim()) : '[Supplier]'}`),
            'Supplies documentation, the factory acceptance test where planned, installation support and training.',
          ],
        ],
        [34, 66],
      ),
    ]),
    section('Acceptance criteria and deviations', 'When a step passes, and what happens when it doesn’t', [
      p(
        txt(
          'A step passes when its actual result meets its expected result. A step that doesn’t is a deviation: it is recorded on the protocol, assessed for its effect on product and on the validation, and resolved before the phase is closed. A deviation that affects product already made is handled as a nonconformance under SOP-006, and as a CAPA under SOP-007 when it meets the CAPA criteria. The validation is complete when every essential requirement has a passing result in the traceability matrix.',
        ),
      ),
    ]),
    section('Test instruments and records', 'Calibrated instruments and good documentation practice', [
      p(
        txt(
          'Instruments used to test the equipment are calibrated, listed in the equipment register (FRM-018), and recorded on the protocol with their calibration due dates. Results are recorded when they are observed, in ink or in a validated electronic system, with raw data attached where the method produces it. Executed protocols are records under SOP-001.',
        ),
      ),
    ]),
    section('Keeping it validated', 'Calibration, maintenance, review every 2 years and revalidation', [
      {
        kind: 'list',
        items: [
          ...(e.calibration === 'yes' || c.blank ? ['Calibration at the interval in FRM-018, under SOP-015.'] : []),
          'Preventive maintenance under the maintenance plan, with each task recorded.',
          'A review every 2 years of calibration, maintenance, deviation and change records, confirming the equipment stays in its validated state.',
        ].map(txt),
      },
      p(txt('These changes are assessed under change control, and the requalification needed is recorded before the equipment returns to use:')),
      {
        kind: 'list',
        items: [
          'Relocation, a major repair or replacement of a critical part.',
          ...(e.software && e.software !== 'none' ? ['A software or firmware update.'] : c.blank ? ['A software or firmware update.'] : []),
          'A change to its intended use, set points or operating ranges.',
          'An out-of-tolerance calibration result, or a trend in nonconformances linked to it.',
        ].map(txt),
      },
    ]),
  ];
}

/* ---------- Commissioning ---------- */

function cx(c: Ctx): Omit<GeneratedSection, 'n'>[] {
  const { e } = c;
  const none = impactOf(e) === 'none';
  const fat = e.fat === 'yes' || c.blank;
  const sat = e.sat === 'yes' || none || c.blank;
  const out = [
    section('Purpose and scope', 'Delivery, installation and basic function', [
      p(
        txt(
          none
            ? 'This equipment can’t affect product quality, so commissioning under good engineering practice is the only verification before use; no qualification follows.'
            : `This record covers commissioning before qualification: checks at the supplier and on delivery that the equipment is complete, installed and working. Results recorded here are referenced in ${idOf(c, 'IQ')} and ${idOf(c, 'OQ')} instead of being repeated where the validation plan allows.`,
        ),
      ),
      identity(c),
      ...(none ? impactBlocks(c) : []),
    ]),
  ];
  if (fat)
    out.push(
      section('Factory acceptance test', 'At the supplier, before shipment', [
        p(txt(`Location and date of the test: ________. Supplier representative: ________.`)),
        rowsTable(c, 'FAT'),
      ]),
    );
  if (sat)
    out.push(
      section(none ? 'Acceptance checks' : 'Site acceptance test', 'On delivery and installation', [rowsTable(c, 'SAT')]),
    );
  out.push(
    section('Punch list', 'Open items from commissioning, each closed or assessed before qualification', [
      tbl(['#', 'Item', 'Owner', 'Due', 'Closed by and date'], blankRows(3, 5, (i) => String(i + 1)), [6, 46, 16, 14, 18]),
    ]),
    section('Sign-off', none ? 'Release for use' : 'Commissioning complete', [
      ...(none
        ? [p(txt('When every check passes and the punch list is closed, the system owner releases the equipment for use and updates the equipment register (FRM-018).'))]
        : []),
      signoff(['Executed by', 'Reviewed by', ...(fat ? ['Supplier representative'] : []), ...(none ? ['Released for use by'] : [])]),
    ]),
  );
  return out;
}

/* ---------- IQ, OQ, PQ ---------- */

const PROTOCOL_PURPOSE: Record<'IQ' | 'OQ' | 'PQ', string> = {
  IQ: 'This protocol verifies that the equipment is the one specified, is installed correctly in its intended location with the utilities it needs, and has its documentation, calibration and maintenance in place.',
  OQ: 'This protocol verifies that the equipment operates as its requirements specify across its operating ranges, including its alarms, interlocks and software functions, with worst-case conditions challenged where the requirement calls for it.',
  PQ: 'This protocol shows that the equipment performs consistently in routine use: with routine operators, materials and set points, over repeated runs, and that its output meets the product specification.',
};

function protocol(c: Ctx, phase: 'IQ' | 'OQ' | 'PQ'): Omit<GeneratedSection, 'n'>[] {
  const { e } = c;
  const runsN = /^\d+$/.test(e.pqRuns.trim()) ? Math.min(Number(e.pqRuns.trim()), 12) : 3;
  const out = [
    section('Purpose and scope', `${PHASE_TITLE[phase].replace(' Protocol', '')} of ${e.ref}`, [p(txt(PROTOCOL_PURPOSE[phase])), identity(c)]),
    section('Prerequisites', 'Confirmed before execution starts', [prerequisites(c, phase)]),
    section('Test instruments', 'Calibrated instruments used during execution', [instruments()]),
  ];
  if (phase === 'PQ')
    out.push(
      section('Runs', 'Routine conditions, recorded run by run', [
        p(
          txt(
            `${/^\d+$/.test(e.pqRuns.trim()) ? mark('PQ runs', e.pqRuns.trim()) : '[Number of PQ runs]'} consecutive runs at routine set points, by trained operators following the work instruction for routine use. When routine use involves more than one operator or material lot, the runs include at least two of each. Samples from each run are tested to ${or(e.pqSpec, '[Product specification]', 'Product specification')}, with sample sizes from the statistical rationale in WI-002.`,
          ),
        ),
        tbl(['Run', 'Date', 'Operator', 'Material lots', 'Set points', 'Samples tested', 'Result'], blankRows(runsN, 7, (i) => String(i + 1)), [7, 12, 15, 16, 18, 16, 16]),
      ]),
    );
  out.push(
    section(phase === 'PQ' ? 'Acceptance criteria' : 'Checks and tests', 'Each step with its method and expected result', [executionNote, rowsTable(c, phase)]),
    section('Deviations', 'Steps that did not meet their expected result', [deviations()]),
    section('Execution sign-off', 'Who executed and reviewed this protocol', [
      signoff(['Executed by', 'Reviewed by', 'Results approved by Quality']),
    ]),
  );
  return out;
}

/* ---------- Traceability and report ---------- */

function rtm(c: Ctx): Omit<GeneratedSection, 'n'>[] {
  const { e } = c;
  const reqs = [...e.requirements].sort((a, b) => sectionOrder(a.section) - sectionOrder(b.section));
  return [
    section('Purpose', 'From each requirement to its evidence', [
      p(
        txt(
          `This matrix traces each requirement in ${idOf(c, 'URS')} to the step that verifies it. The result and deviation columns are completed as each protocol is executed. It is complete when every essential requirement has a passing result.`,
        ),
      ),
    ]),
    section('Traceability matrix', 'Requirement, verification and result', [
      reqs.length && !c.blank
        ? tbl(
            ['Requirement', 'Priority', 'Verified in', 'Step', 'Result', 'Deviation'],
            reqs.map((r) => [
              reqText(r),
              r.priority === 'essential' ? 'Essential' : 'Desirable',
              VERIFY_LABEL[r.verify],
              traceOf(e, r) || `Not traced: ${r.verify} isn’t part of this validation`,
              '',
              '',
            ]),
            [38, 11, 15, 16, 10, 10],
          )
        : tbl(['Requirement', 'Priority', 'Verified in', 'Step', 'Result', 'Deviation'], blankRows(c.blank ? 5 : 1, 6, () => (c.blank ? '' : '[Requirements to be added]')), [38, 11, 15, 16, 10, 10]),
    ]),
  ];
}

function vsr(c: Ctx): Omit<GeneratedSection, 'n'>[] {
  const { e, tpl } = c;
  const executed = (['CX', 'IQ', 'OQ', 'PQ'] as Phase[]).filter((ph) => has(c, ph) || c.blank);
  const rel = e.requirements.filter((r) => r.verify === 'REL');
  return [
    section('Purpose and scope', 'What was validated, against which plan', [
      p(
        tpl(
          `This report summarizes the commissioning and qualification of the equipment below against ${idOf(c, 'VP')}, and records whether it is released for use at {{company}}.`,
        ),
      ),
      identity(c),
    ]),
    section('Results by phase', 'Each executed protocol and its outcome', [
      tbl(
        ['Document', 'Executed between', 'Result', 'Deviations'],
        executed.map((ph) => [`${idOf(c, ph)} ${PHASE_TITLE[ph]}`, '', '', '']),
        [44, 20, 16, 20],
      ),
    ]),
    section('Deviations', 'Every deviation raised during the validation', [
      tbl(['#', 'Document and step', 'What happened', 'Effect on product and on the validation', 'Resolution'], blankRows(3, 5, (i) => String(i + 1)), [6, 18, 26, 26, 24]),
    ]),
    section('Requirements', 'Traceability and requirements verified by document review', [
      p(txt(`Every essential requirement has a passing result in ${idOf(c, 'RTM')}: ☐ Yes ☐ No. Desirable requirements not met, with the reason: ________.`)),
      ...(rel.length && !c.blank
        ? [
            tbl(
              ['Requirement', 'Evidence reviewed', 'Result'],
              rel.map((r) => [reqText(r), or(r.criterion, '[Acceptance criterion]', 'Acceptance criterion'), '']),
              [46, 38, 16],
            ),
          ]
        : []),
    ]),
    section('Conclusion and release', 'The decision, any restrictions, and what starts on release', [
      p(txt('☐ Released for use. ☐ Released with the restrictions below. ☐ Not released.')),
      p(txt('Restrictions: ________')),
      p(
        tpl(
          `On release, {{qualityLead}} updates the equipment register (FRM-018) to “In use”${e.calibration === 'yes' || c.blank ? ', the calibration schedule starts' : ''}, preventive maintenance starts, and the equipment is added to the review every 2 years set in ${idOf(c, 'VP')}.`,
        ),
      ),
    ]),
  ];
}

const BUILDERS: Record<Phase, (c: Ctx) => Omit<GeneratedSection, 'n'>[]> = {
  URS: urs,
  VP: vp,
  CX: cx,
  IQ: (c) => protocol(c, 'IQ'),
  OQ: (c) => protocol(c, 'OQ'),
  PQ: (c) => protocol(c, 'PQ'),
  RTM: rtm,
  VSR: vsr,
};

export const RECORDS: Record<Phase, string[]> = {
  URS: ['Approved URS, filed with the purchase record'],
  VP: ['Approved validation plan'],
  CX: ['Executed commissioning record with supplier test records'],
  IQ: ['Executed IQ protocol with raw data and deviations'],
  OQ: ['Executed OQ protocol with raw data and deviations'],
  PQ: ['Executed PQ protocol with run records, sample results and deviations'],
  RTM: ['Completed traceability matrix'],
  VSR: ['Approved validation summary report', 'Equipment register (FRM-018) entry updated to “In use”'],
};

export interface EquipmentDoc {
  id: string;
  phase: Phase;
  equipment: Equipment;
  title: string;
  owner: TokenKey;
  sections: Omit<GeneratedSection, 'n'>[];
  sum: EquipmentSummary;
}

/** Every document in one equipment's package. */
export function packageDocs(e: Equipment, tpl: Tpl): EquipmentDoc[] {
  const sum = summarizeEquipment(e);
  const owner = ownerFor(e);
  const c: Ctx = { e, sum, phases: sum.phases, tpl, blank: false, owner };
  return sum.phases.map((phase) => ({
    id: docIdOf(e, phase),
    phase,
    equipment: e,
    title: `${PHASE_TITLE[phase]}: ${displayName(e)}`,
    owner,
    sections: BUILDERS[phase](c),
    sum,
  }));
}

/** Open items in one document of a package, as assessment progress. */
export function docProgress(d: EquipmentDoc) {
  const checks = docChecks(d.sum, d.phase);
  const done = checks.filter((x) => x.ok).length;
  const pending = d.phase === 'URS' ? d.sum.pendingSuggestions : 0;
  return {
    done,
    total: checks.length,
    suggested: pending,
    suggestedTotal: pending,
    todo: checks.filter((x) => !x.ok).slice(0, 8).map((x) => ({ label: x.label, to: `/app/equipment#${x.anchor}` })),
    href: `/app/equipment#eq-${d.equipment.id}`,
    name: `${d.equipment.ref} package`,
  };
}

/* ---------- Blank templates ---------- */

export const TEMPLATE_IDS: Record<Phase, string> = {
  URS: 'CQV-T1',
  VP: 'CQV-T2',
  CX: 'CQV-T3',
  IQ: 'CQV-T4',
  OQ: 'CQV-T5',
  PQ: 'CQV-T6',
  RTM: 'CQV-T7',
  VSR: 'CQV-T8',
};

/** A blank template for each document, built from an empty equipment record. */
export function blankTemplates(tpl: Tpl): { phase: Phase; id: string; title: string; sections: Omit<GeneratedSection, 'n'>[] }[] {
  const e = newEquipment('EQ-NNN');
  const c: Ctx = { e, sum: summarizeEquipment(e), phases: PHASES, tpl, blank: true, owner: 'opsLead' };
  return PHASES.map((phase) => ({
    phase,
    id: TEMPLATE_IDS[phase],
    title: `${PHASE_TITLE[phase]} Template`,
    sections: BUILDERS[phase](c),
  }));
}

const plain = (segs: Segment[]) => segs.map((x) => (x.kind === 'text' ? x.text : `{{${x.key}}}`)).join('');

/** Wording shared by several templates is written out the first time only. */
function once(b: Block, seen: Set<string>): Block[] {
  if (b.kind === 'p') {
    const k = plain(b.segs);
    if (seen.has(k)) return [];
    seen.add(k);
    return [b];
  }
  if (b.kind === 'list') {
    const items = b.items.filter((it) => {
      const k = plain(it);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return items.length ? [{ ...b, items }] : [];
  }
  return [b];
}

/** CQV-T1–8 as one controlled document: each template's sections, in order. */
export function templatesDoc(tpl: Tpl): Omit<GeneratedSection, 'n'>[] {
  const seen = new Set<string>();
  const intro = section('Using these templates', 'One package per piece of equipment, sized by its impact', [
    p(
      tpl(
        'These CQV (commissioning, qualification and validation) templates are used for every piece of production, process, measuring and test equipment, and for utilities and controlled environments, that {{company}} brings into use. Each piece gets an equipment ID (EQ-NNN) and its own package, with document IDs formed from the equipment ID and the template, for example EQ-001-IQ. The impact assessment in the URS and the validation plan decides which templates apply:',
      ),
    ),
    {
      kind: 'list',
      items: [
        'Direct impact: user requirements specification (URS), validation plan, installation qualification (IQ), operational qualification (OQ), traceability matrix and summary report. Add performance qualification (PQ) when the output isn’t fully verified afterwards. Add a commissioning record when there is a factory acceptance test (FAT) or site acceptance test (SAT).',
        'Indirect impact: the same without PQ.',
        'No impact: URS and commissioning record only.',
      ].map(txt),
    },
    p(txt('Text in square brackets is replaced for each piece of equipment. Result, pass or fail, and signature columns are completed on the executed copy.')),
  ]);
  return [
    intro,
    ...blankTemplates(tpl).map((t) =>
      section(`${t.id} ${PHASE_TITLE[t.phase]}`, PHASE_SUMMARY[t.phase], [
        ...t.sections.flatMap((s, i) => [p(txt(`${i + 1}. ${s.title}. ${s.purpose}.`)), ...s.blocks.flatMap((b) => once(b, seen))]),
      ]),
    ),
  ];
}
