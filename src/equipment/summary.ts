/**
 * What an equipment record needs: its impact, the CQV documents that follow
 * from it, the open items in each document, and the numbered checks each
 * protocol contains (shared by the protocols and the traceability matrix).
 *
 * Approach: the GHTF SG3/N99-10 process validation guidance (IQ, OQ, PQ) and
 * ISO 13485:2016 6.3, 7.5.6 and 7.6, with commissioning per ASTM E2500 and
 * the ISPE Baseline Guide on commissioning and qualification.
 */
import { KIND_LABEL, suggestionsFor } from './catalog.ts';
import type { Equipment, UserRequirement, Verify } from './model.ts';

export type Impact = 'direct' | 'indirect' | 'none';
export type Phase = 'URS' | 'VP' | 'CX' | 'IQ' | 'OQ' | 'PQ' | 'RTM' | 'VSR';

export const PHASES: Phase[] = ['URS', 'VP', 'CX', 'IQ', 'OQ', 'PQ', 'RTM', 'VSR'];

export const PHASE_TITLE: Record<Phase, string> = {
  URS: 'User Requirements Specification',
  VP: 'Validation Plan',
  CX: 'Commissioning Record',
  IQ: 'Installation Qualification Protocol',
  OQ: 'Operational Qualification Protocol',
  PQ: 'Performance Qualification Protocol',
  RTM: 'Requirements Traceability Matrix',
  VSR: 'Validation Summary Report',
};

export const PHASE_WHEN: Record<Phase, string> = {
  URS: 'Approved before purchase',
  VP: 'Approved before any qualification',
  CX: 'At the supplier (FAT) and on delivery (SAT)',
  IQ: 'Approved before execution, run at installation',
  OQ: 'Approved before execution, run after IQ',
  PQ: 'Approved before execution, run under routine conditions',
  RTM: 'Updated as each protocol is executed',
  VSR: 'Approved before the equipment is released for use',
};

export const PHASE_SUMMARY: Record<Phase, string> = {
  URS: 'What the equipment has to do, written as testable requirements, each with its acceptance criterion and where it is verified.',
  VP: 'The impact assessment, which qualification phases apply and why, who does what, and how deviations are handled.',
  CX: 'Factory and site acceptance checks: delivery, installation and basic function, before qualification starts.',
  IQ: 'Checks that the equipment is the one specified, installed correctly, documented, calibrated and under maintenance.',
  OQ: 'Tests that the equipment works as specified across its operating ranges, including alarms, interlocks and software.',
  PQ: 'Shows the equipment performs consistently in routine use, with real product, operators and materials.',
  RTM: 'Traces each user requirement to the test that verifies it and the result.',
  VSR: 'Summarizes the results and deviations, and records the decision to release the equipment for use.',
};

/** The verification phase a requirement points at, as a document in the package. */
export const PHASE_OF: Record<Verify, Phase> = { FAT: 'CX', SAT: 'CX', IQ: 'IQ', OQ: 'OQ', PQ: 'PQ', REL: 'VSR' };

export const docIdOf = (e: Equipment, phase: Phase) => `${e.ref}-${phase}`;
export const OPEN = /\[[^\]\n]+\]/;
export const hasOpen = (v: string) => OPEN.test(v);
export const displayName = (e: Equipment) => e.name.trim() || 'Unnamed equipment';

export function impactOf(e: Equipment): Impact | '' {
  if (e.product === 'yes') return 'direct';
  if (e.product === 'no' && e.supports === 'yes') return 'indirect';
  if (e.product === 'no' && e.supports === 'no') return 'none';
  return '';
}

export const IMPACT_LABEL: Record<Impact, string> = {
  direct: 'Direct impact',
  indirect: 'Indirect impact',
  none: 'No impact',
};

export const IMPACT_HINT: Record<Impact, string> = {
  direct: 'It makes, measures or inspects product, or decides acceptance. Full qualification applies.',
  indirect: 'It supports a validated process or controlled environment. Installation and operational qualification apply.',
  none: 'It can’t affect product quality. Commissioning under good engineering practice is enough.',
};

/** PQ is asked about for equipment that runs or holds something; a measuring instrument is covered by calibration and OQ. */
export const asksPq = (e: Equipment) => impactOf(e) === 'direct' && !!e.kind && e.kind !== 'measuring';
export const asksRecords = (e: Equipment) => e.software !== '' && e.software !== 'none';

export function phasesOf(e: Equipment): Phase[] {
  const impact = impactOf(e);
  const cx = e.fat === 'yes' || e.sat === 'yes';
  if (impact === '') return ['URS', 'VP'];
  if (impact === 'none') return ['URS', 'CX'];
  return [
    'URS',
    'VP',
    ...(cx ? (['CX'] as Phase[]) : []),
    'IQ',
    'OQ',
    ...(impact === 'direct' && asksPq(e) && e.pq === 'yes' ? (['PQ'] as Phase[]) : []),
    'RTM',
    'VSR',
  ];
}

/** Why this impact and these phases, in words for the validation plan. */
export function rationaleOf(e: Equipment): string {
  const impact = impactOf(e);
  if (!impact) return '';
  const parts: string[] = [];
  if (impact === 'direct')
    parts.push('The equipment makes, measures or inspects product, or its results decide whether product is accepted (ISO 13485 7.5.6 and 7.6).');
  else if (impact === 'indirect')
    parts.push('The equipment supports a validated process or a controlled environment but does not itself decide product quality.');
  else parts.push('The equipment can’t affect product quality, so qualification isn’t required; commissioning is recorded as good engineering practice.');
  if (impact === 'direct' && asksPq(e))
    parts.push(
      e.pq === 'yes'
        ? 'Its output isn’t fully verified by later inspection or test, so performance qualification is required (ISO 13485 7.5.6).'
        : e.pq === 'no'
          ? 'Its output is fully verified by later inspection or test, so performance qualification isn’t required.'
          : '',
    );
  if (impact !== 'none' && e.kind === 'measuring')
    parts.push('As a measuring instrument it is covered by calibration under SOP-015, so performance qualification isn’t required.');
  if (e.calibration === 'yes') parts.push('It is calibrated and listed in the equipment register (FRM-018).');
  if (e.software === 'configurable' || e.software === 'custom')
    parts.push('Its software is configurable, so access control, configuration and backup are tested in OQ (SOP-014).');
  if (e.records === 'yes') parts.push('It keeps electronic quality records, so 21 CFR Part 11 controls are tested in OQ and the system is listed in FRM-019.');
  return parts.filter(Boolean).join(' ');
}

/* ---------- Open items ---------- */

export interface EqCheck {
  key: string;
  label: string;
  /** Element id on the equipment page. */
  anchor: string;
  ok: boolean;
  docs: Phase[];
}

export function checksOf(e: Equipment): EqCheck[] {
  const a = (field: string) => `${e.id}-${field}`;
  const out: EqCheck[] = [];
  const add = (key: string, label: string, field: string, ok: boolean, docs: Phase[]) => out.push({ key, label, anchor: a(field), ok, docs });
  const all = PHASES;
  const impact = impactOf(e);

  add('name', 'Name the equipment', 'name', !!e.name.trim(), all);
  add('kind', 'Choose the type of equipment', 'kind', !!e.kind, ['URS', 'VP']);
  add('make', 'Enter the manufacturer and model', 'manufacturer', !!e.manufacturer.trim() && !!e.model.trim(), ['URS', 'VP', 'IQ', 'CX']);
  add('location', 'Enter where it is installed', 'location', !!e.location.trim(), ['URS', 'CX', 'IQ']);
  add('purpose', 'Describe what it is used for', 'purpose', !!e.purpose.trim() && !hasOpen(e.purpose), ['URS', 'VP', 'VSR']);
  add('product', 'Answer whether it makes, measures or decides on product', 'product', e.product !== '', ['URS', 'VP']);
  if (e.product === 'no') add('supports', 'Answer whether it supports a validated process', 'supports', e.supports !== '', ['URS', 'VP']);
  if (asksPq(e)) add('pq', 'Answer whether its output is fully verified afterwards', 'pq', e.pq !== '', ['VP', 'PQ']);
  add('calibration', 'Answer whether it needs calibration', 'calibration', e.calibration !== '', ['URS', 'VP', 'IQ']);
  add('software', 'Choose what software it has', 'software', e.software !== '', ['URS', 'VP', 'IQ']);
  if (asksRecords(e)) add('records', 'Answer whether it keeps electronic quality records', 'records', e.records !== '', ['URS', 'VP']);
  if (impact && impact !== 'none') {
    add('fat', 'Answer whether there is a factory acceptance test', 'fat', e.fat !== '', ['VP']);
    add('sat', 'Answer whether there is a site acceptance test', 'sat', e.sat !== '', ['VP']);
  }
  add('reqs', 'Add the user requirements', 'reqs', e.requirements.length > 0, ['URS', 'RTM']);

  const phases = phasesOf(e);
  for (const r of e.requirements) {
    const where = `req-${r.id}`;
    const target = PHASE_OF[r.verify];
    add(`${r.id}-text`, `${r.ref}: fill in the requirement`, where, !!r.text.trim() && !hasOpen(r.text), ['URS', 'RTM', target]);
    add(`${r.id}-crit`, `${r.ref}: fill in the acceptance criterion`, where, !!r.criterion.trim() && !hasOpen(r.criterion), ['URS', target]);
    if (r.verify !== 'REL') add(`${r.id}-method`, `${r.ref}: describe the test method`, where, !!r.method.trim() && !hasOpen(r.method), [target]);
    if (impact && !phases.includes(target))
      add(
        `${r.id}-phase`,
        `${r.ref}: verified in ${r.verify}, which this equipment doesn’t have`,
        where,
        false,
        ['URS', 'RTM'],
      );
  }
  if (phases.includes('PQ')) {
    add('pqRuns', 'Set the number of PQ runs', 'pqRuns', /^\d+$/.test(e.pqRuns.trim()), ['PQ', 'VP']);
    add('pqSpec', 'Name the product specification PQ samples are tested to', 'pqSpec', !!e.pqSpec.trim() && !hasOpen(e.pqSpec), ['PQ']);
  }
  return out;
}

export interface EquipmentSummary {
  equipment: Equipment;
  impact: Impact | '';
  phases: Phase[];
  checks: EqCheck[];
  done: number;
  total: number;
  pendingSuggestions: number;
  complete: boolean;
}

export function summarizeEquipment(e: Equipment): EquipmentSummary {
  const checks = checksOf(e);
  const done = checks.filter((c) => c.ok).length;
  return {
    equipment: e,
    impact: impactOf(e),
    phases: phasesOf(e),
    checks,
    done,
    total: checks.length,
    pendingSuggestions: e.kind ? suggestionsFor(e).length : 0,
    complete: done === checks.length,
  };
}

/** Open items for one document of the package. */
export function docChecks(sum: EquipmentSummary, phase: Phase) {
  return sum.checks.filter((c) => c.docs.includes(phase));
}

/* ---------- Protocol rows ---------- */

export interface ProtocolRow {
  id: string;
  /** The user requirement verified, if any. */
  ref: string;
  check: string;
  method: string;
  expected: string;
  /** Text the team entered (requirement, method, criterion), labelled for the document checker. */
  fromAnswers: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

function standardRows(e: Equipment, phase: 'IQ' | 'OQ' | 'PQ' | 'FAT' | 'SAT'): Omit<ProtocolRow, 'id'>[] {
  const make = [e.manufacturer, e.model].map((x) => x.trim()).filter(Boolean).join(' ') || '[Manufacturer and model]';
  const sw = e.software === 'configurable' || e.software === 'custom';
  const base = { ref: '', fromAnswers: false };
  switch (phase) {
    case 'FAT':
      return [
        { ...base, check: 'Equipment matches the purchase order', method: 'Compare model, options and quantities with the purchase order.', expected: `${make} with the options ordered.` },
        { ...base, check: 'Supplier test records', method: 'Review the supplier’s own test records for this unit.', expected: 'Records are complete and every result passes.' },
      ];
    case 'SAT':
      return [
        { ...base, check: 'Delivery condition', method: 'Inspect packaging and equipment on arrival.', expected: 'No shipping damage; packing list complete.' },
        { ...base, check: 'Installation by the supplier', method: 'Confirm installation against the supplier’s installation instructions.', expected: 'Installed as instructed; the supplier’s punch list is closed or listed below.' },
        { ...base, check: 'Basic function', method: 'Power up and run the start-up checks in the operating manual.', expected: 'Starts without error and completes the start-up checks.' },
      ];
    case 'IQ':
      return [
        {
          ...base,
          check: 'Equipment identification',
          method: 'Read the nameplate and compare it with the URS and the purchase order.',
          expected: `${make}${e.serial.trim() ? `, serial number ${e.serial.trim()}` : ''}. Record the serial number.`,
        },
        {
          ...base,
          check: 'Location',
          method: 'Confirm the installed location and its clearances.',
          expected: `Installed at ${e.location.trim() || '[Location]'}, with the clearances in the installation manual.`,
        },
        { ...base, check: 'Utilities', method: 'Verify each utility connection at the point of use.', expected: 'Each utility matches the URS and the manufacturer’s requirements.' },
        ...(e.calibration === 'yes'
          ? [
              {
                ...base,
                check: 'Calibration status',
                method: 'Review the calibration certificate and the equipment register (FRM-018).',
                expected: 'Calibrated, certificate on file, entered in FRM-018 with its due date, and a status label attached.',
              },
            ]
          : []),
        ...(e.software && e.software !== 'none'
          ? [
              {
                ...base,
                check: 'Software and firmware version',
                method: 'Read the version on the equipment.',
                expected: 'The version is recorded and matches the approved configuration.',
              },
            ]
          : []),
        ...(sw
          ? [
              {
                ...base,
                check: 'Configuration record and backup',
                method: 'Export the configuration and file the backup.',
                expected: 'A configuration record and a backup exist and are filed with the equipment record.',
              },
            ]
          : []),
        {
          ...base,
          check: 'Maintenance',
          method: 'Review the maintenance plan.',
          expected: 'Preventive maintenance tasks and intervals are entered in the maintenance plan.',
        },
        {
          ...base,
          check: 'Equipment register',
          method: 'Review the equipment register (FRM-018).',
          expected: `The equipment is listed as ${e.asset.trim() || e.ref} with status “In qualification”.`,
        },
      ];
    case 'OQ':
      return [
        {
          ...base,
          check: 'Operating instructions',
          method: 'Execute the tests below using the draft work instruction for routine use.',
          expected: 'The work instruction is usable as written; any change needed is recorded as a deviation.',
        },
      ];
    case 'PQ':
      return [
        {
          ...base,
          check: 'Process parameters',
          method: 'Review the run records for each critical parameter.',
          expected: 'Every critical parameter stayed within its tolerance in every run.',
        },
        {
          ...base,
          check: 'Product samples',
          method: 'Test the samples from each run to the product specification.',
          expected: `Every sample from every run meets ${e.pqSpec.trim() || '[Product specification]'}.`,
        },
      ];
  }
}

/** The numbered rows of a protocol: standard checks first, then each requirement verified there. */
export function protocolRows(e: Equipment, phase: 'IQ' | 'OQ' | 'PQ' | 'FAT' | 'SAT'): ProtocolRow[] {
  const reqs = e.requirements.filter((r) => r.verify === phase);
  const rows: Omit<ProtocolRow, 'id'>[] = [
    ...standardRows(e, phase),
    ...reqs.map((r) => ({ ref: r.ref, check: r.text, method: r.method, expected: r.criterion, fromAnswers: true })),
  ];
  return rows.map((r, i) => ({ ...r, id: `${phase}-${pad(i + 1)}` }));
}

/** Where each requirement is verified: the protocol row id, or the report section for release checks. */
export function traceOf(e: Equipment, r: UserRequirement): string {
  if (r.verify === 'REL') return `${docIdOf(e, 'VSR')} §5`;
  const row = protocolRows(e, r.verify).find((x) => x.ref === r.ref);
  return row ? `${docIdOf(e, PHASE_OF[r.verify])} ${row.id}` : '';
}

export const kindLabel = (e: Equipment) => (e.kind ? KIND_LABEL[e.kind] : '[Type of equipment]');
