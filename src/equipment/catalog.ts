/**
 * Equipment types and the user requirements suggested for each. Suggestions
 * are a starting point: values the team has to supply are in [brackets], and
 * each one is edited or removed on the equipment page.
 *
 * Wording follows the INCOSE Guide to Writing Requirements: one "shall" per
 * requirement, an active subject, measurable criteria, and EARS patterns
 * ("When…", "While…") for triggered behaviour.
 */
import { uid } from '../assessments/model.ts';
import { newEquipment, type EqKind, type Equipment, type EquipmentAnswers, type Priority, type Verify } from './model.ts';

export const KIND_LABEL: Record<Exclude<EqKind, ''>, string> = {
  measuring: 'Measuring or test instrument',
  production: 'Production or process equipment',
  environmental: 'Controlled environment or storage',
  'test-system': 'Automated test system or fixture',
  utility: 'Utility or support system',
};

export const KIND_HINT: Record<Exclude<EqKind, ''>, string> = {
  measuring: 'Gauges, simulators, meters, calipers, balances',
  production: 'Sealers, dispensers, presses, curing ovens, laser markers',
  environmental: 'Chambers, refrigerators, freezers, incubators, clean benches',
  'test-system': 'End-of-line testers, custom rigs, automated inspection',
  utility: 'Compressed air, purified water, HVAC, nitrogen',
};

export const SOFTWARE_LABEL: Record<Exclude<Equipment['software'], ''>, string> = {
  none: 'No software',
  firmware: 'Fixed firmware',
  configurable: 'Configurable software',
  custom: 'Custom software',
};

export const SOFTWARE_HINT: Record<Exclude<Equipment['software'], ''>, string> = {
  none: 'Mechanical or analog only',
  firmware: 'Embedded, not changed by users',
  configurable: 'Settings, recipes or limits users can change',
  custom: 'Written or scripted for you',
};

export const VERIFY_LABEL: Record<Verify, string> = {
  FAT: 'Factory acceptance test',
  SAT: 'Site acceptance test',
  IQ: 'Installation qualification',
  OQ: 'Operational qualification',
  PQ: 'Performance qualification',
  REL: 'Release review',
};

export const SECTIONS = [
  'Operation and performance',
  'Installation and utilities',
  'Controls, alarms and interlocks',
  'Software and data',
  'Safety',
  'Calibration and maintenance',
  'Documentation and training',
] as const;

/** A guess from the name, so equipment from the setup answers starts with a type. */
export function guessKind(name: string): EqKind {
  const n = name.toLowerCase();
  if (/fixture|\brig\b|end[- ]of[- ]line|test (station|system)|\bate\b|vision|inspection system/.test(n)) return 'test-system';
  if (/chamber|freezer|fridge|refrigerat|incubator|clean ?bench|laminar|storage|cabinet|stability/.test(n)) return 'environmental';
  if (/compress(ed|or) air|water|hvac|nitrogen|vacuum|steam|chiller/.test(n)) return 'utility';
  if (/simulator|gauge|meter|tester|caliper|micrometer|scale|balance|scope|analy[sz]er|thermometer|thermocouple|probe|load cell/.test(n)) return 'measuring';
  if (/sealer|welder|dispens|press|mold|mould|laser|printer|cutter|cure|curing|oven|packag|crimp|extrud|bonder|coater/.test(n)) return 'production';
  return '';
}

export interface RequirementSuggestion {
  key: string;
  section: (typeof SECTIONS)[number];
  text: string;
  criterion: string;
  method: string;
  verify: Verify;
  priority: Priority;
  /** Offered only when this holds. */
  when?: (e: Equipment) => boolean;
}

const sw = (e: Equipment) => e.software === 'configurable' || e.software === 'custom';
const anySw = (e: Equipment) => e.software === 'firmware' || sw(e);
const rec = (e: Equipment) => e.records === 'yes';
const cal = (e: Equipment) => e.calibration === 'yes';
const machine = (e: Equipment) => e.kind === 'production' || e.kind === 'test-system';

const COMMON: RequirementSuggestion[] = [
  {
    key: 'env',
    section: 'Installation and utilities',
    text: 'The equipment shall meet its specified performance at an ambient temperature of [temperature range, °C] and a relative humidity of [humidity range, %RH].',
    criterion: 'The installed location is within the manufacturer’s specified operating conditions, measured with a calibrated instrument.',
    method: 'Record ambient temperature and humidity at the installed location with a calibrated logger and compare them with the manufacturer’s specification.',
    verify: 'IQ',
    priority: 'essential',
  },
  {
    key: 'power',
    section: 'Installation and utilities',
    text: 'The equipment shall operate from a [supply voltage, frequency and current rating] electrical supply.',
    criterion: 'The supply at the point of use matches the rating on the equipment nameplate.',
    method: 'Compare the nameplate rating with the supply circuit and measure the supply voltage at the outlet.',
    verify: 'IQ',
    priority: 'essential',
    when: (e) => e.kind !== 'utility',
  },
  {
    key: 'label',
    section: 'Calibration and maintenance',
    text: 'The equipment shall carry a label with its unique equipment ID that an operator can read at the point of use.',
    criterion: 'The label is attached and its ID matches the equipment register (FRM-018).',
    method: 'Inspect the label and compare its ID with the equipment register.',
    verify: 'IQ',
    priority: 'essential',
  },
  {
    key: 'pm',
    section: 'Calibration and maintenance',
    text: 'The supplier shall provide a preventive maintenance schedule that lists each task and its interval.',
    criterion: 'Every task in the schedule is entered in the maintenance plan with its interval.',
    method: 'Review the supplier’s schedule against the maintenance plan.',
    verify: 'IQ',
    priority: 'essential',
  },
  {
    key: 'manuals',
    section: 'Documentation and training',
    text: 'The supplier shall provide the operating manual, the maintenance manual and the spare parts list in English.',
    criterion: 'Each document is received, matches the delivered model and is filed with the equipment record.',
    method: 'Check each document against the delivered model and file it.',
    verify: 'IQ',
    priority: 'essential',
  },
  {
    key: 'training',
    section: 'Documentation and training',
    text: 'The supplier shall train [number of operators] operators and [number of maintenance staff] maintenance staff before the equipment is released for use.',
    criterion: 'Training records exist for each trained person, under SOP-005.',
    method: 'Review the training records before release.',
    verify: 'REL',
    priority: 'essential',
  },
];

const CALIBRATION: RequirementSuggestion[] = [
  {
    key: 'cal-cert',
    section: 'Calibration and maintenance',
    text: 'The supplier shall provide a calibration certificate, traceable to SI units, from a laboratory accredited to ISO/IEC 17025.',
    criterion: 'The certificate covers the working range, lists the measurement uncertainty and is in date.',
    method: 'Review the certificate for range, uncertainty, traceability statement and accreditation.',
    verify: 'IQ',
    priority: 'essential',
    when: cal,
  },
  {
    key: 'cal-interval',
    section: 'Calibration and maintenance',
    text: 'The equipment shall hold its specified accuracy for at least [calibration interval, months] between calibrations.',
    criterion: 'The manufacturer’s stability specification supports the interval entered in the equipment register (FRM-018).',
    method: 'Compare the manufacturer’s stability specification with the planned calibration interval.',
    verify: 'IQ',
    priority: 'essential',
    when: cal,
  },
];

const SOFTWARE: RequirementSuggestion[] = [
  {
    key: 'sw-version',
    section: 'Software and data',
    text: 'The equipment shall display its software or firmware version.',
    criterion: 'The displayed version matches the version in the approved configuration.',
    method: 'Read the version from the equipment and compare it with the approved configuration record.',
    verify: 'IQ',
    priority: 'essential',
    when: anySw,
  },
  {
    key: 'sw-login',
    section: 'Software and data',
    text: 'The equipment shall require a unique user ID and password before a user changes a setting, recipe or limit.',
    criterion: 'A change attempt without signing in is refused, and a change after signing in is attributed to that user.',
    method: 'Attempt a change without signing in, then sign in and make the change; check the attribution.',
    verify: 'OQ',
    priority: 'essential',
    when: sw,
  },
  {
    key: 'sw-roles',
    section: 'Software and data',
    text: 'The equipment shall allow only users with the [administrator or engineer] role to change set points, recipes and limits.',
    criterion: 'An operator account can’t change a set point, recipe or limit; an engineer account can.',
    method: 'Attempt each change with an operator account and with an engineer account.',
    verify: 'OQ',
    priority: 'essential',
    when: sw,
  },
  {
    key: 'sw-backup',
    section: 'Software and data',
    text: 'The equipment shall export its complete configuration to a backup file and restore it from that file.',
    criterion: 'After a restore, every setting matches the configuration record.',
    method: 'Export the configuration, change a setting, restore from the file and compare every setting with the record.',
    verify: 'OQ',
    priority: 'essential',
    when: sw,
  },
  {
    key: 'rec-meta',
    section: 'Software and data',
    text: 'The equipment shall store each result with the date, the time, the equipment ID and the user ID.',
    criterion: 'Each test record contains all four fields, and the time agrees with the reference clock within 1 minute.',
    method: 'Create three records and inspect each one against a reference clock.',
    verify: 'OQ',
    priority: 'essential',
    when: rec,
  },
  {
    key: 'rec-audit',
    section: 'Software and data',
    text: 'The equipment shall keep a secure, computer-generated, time-stamped audit trail of each creation, change and deletion of an electronic record (21 CFR 11.10(e)).',
    criterion: 'Each test action appears in the audit trail with the user, the date, the time, and the old and new values.',
    method: 'Create, change and delete a test record, then review the audit trail entries.',
    verify: 'OQ',
    priority: 'essential',
    when: rec,
  },
  {
    key: 'rec-protect',
    section: 'Software and data',
    text: 'The equipment shall prevent users from deleting or overwriting a saved electronic record.',
    criterion: 'Delete and overwrite attempts are refused for every role except the administrator, and an administrator deletion is recorded in the audit trail.',
    method: 'Attempt to delete and overwrite a saved record with each role.',
    verify: 'OQ',
    priority: 'essential',
    when: rec,
  },
  {
    key: 'rec-copy',
    section: 'Software and data',
    text: 'The equipment shall produce accurate and complete copies of its records in human-readable and electronic form (21 CFR 11.10(b)).',
    criterion: 'An exported copy matches the stored record field for field.',
    method: 'Export three records and compare each with the record on screen.',
    verify: 'OQ',
    priority: 'essential',
    when: rec,
  },
];

const BY_KIND: Record<Exclude<EqKind, ''>, RequirementSuggestion[]> = {
  measuring: [
    {
      key: 'm-range',
      section: 'Operation and performance',
      text: 'The equipment shall measure [measured quantity] from [lowest value] to [highest value] [unit].',
      criterion: 'Readings at the low, middle and high points of the range are within the accuracy requirement.',
      method: 'Apply a calibrated reference at the low, middle and high points of the range and record each reading.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'm-accuracy',
      section: 'Operation and performance',
      text: 'The equipment shall measure with an error of no more than ±[accuracy limit] across its working range.',
      criterion: 'The error at each test point is within ±[accuracy limit], and the reference uncertainty is no more than one quarter of the limit.',
      method: 'Compare readings with a calibrated reference at five points across the range, three readings at each point.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'm-resolution',
      section: 'Operation and performance',
      text: 'The equipment shall display readings with a resolution of [resolution and unit] or finer.',
      criterion: 'The smallest displayed increment is [resolution and unit] or smaller.',
      method: 'Inspect the display while the reference changes by one increment.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'm-repeat',
      section: 'Operation and performance',
      text: 'The equipment shall repeat a measurement of the same reference within [repeatability limit].',
      criterion: 'Ten repeated readings of one reference fall within [repeatability limit] of each other.',
      method: 'Take ten readings of one reference at mid-range without adjusting the equipment.',
      verify: 'OQ',
      priority: 'essential',
    },
  ],
  production: [
    {
      key: 'p-param',
      section: 'Operation and performance',
      text: 'The equipment shall control [critical process parameter] to within ±[tolerance and unit] of its set point.',
      criterion: 'The parameter, measured with a calibrated instrument, stays within tolerance at the lowest and highest set points for [test duration].',
      method: 'Run at the lowest and highest set points and log the parameter with a calibrated instrument for the test duration.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'p-range',
      section: 'Operation and performance',
      text: 'The equipment shall accept set points for [critical process parameter] from [lowest set point] to [highest set point] [unit].',
      criterion: 'Both limits can be entered and run, and a value outside them is refused.',
      method: 'Enter each limit and run a cycle, then try a value just outside each limit.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'p-rate',
      section: 'Operation and performance',
      text: 'The equipment shall process at least [number of units] units per hour.',
      criterion: 'A timed run of one hour completes at least [number of units] units.',
      method: 'Time a one-hour run at the routine set points and count completed units.',
      verify: 'PQ',
      priority: 'desirable',
    },
    {
      key: 'p-alarm',
      section: 'Controls, alarms and interlocks',
      text: 'When [critical process parameter] goes outside its tolerance, the equipment shall stop the cycle and display an alarm.',
      criterion: 'Each challenge stops the cycle and shows the alarm, and the affected unit is identified.',
      method: 'Force the parameter outside each tolerance limit during a cycle and observe the response.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'p-contact',
      section: 'Operation and performance',
      text: 'The equipment shall have product-contact surfaces made of [product-contact material].',
      criterion: 'Material certificates for each product-contact part match the approved material.',
      method: 'Review the material certificates against the parts list.',
      verify: 'IQ',
      priority: 'essential',
    },
    {
      key: 'p-clean',
      section: 'Calibration and maintenance',
      text: 'The equipment shall withstand cleaning with [cleaning agent] at the frequency in the work instruction without damage to surfaces or seals.',
      criterion: 'Surfaces and seals show no corrosion, swelling or cracking after [number of cleaning cycles] cleaning cycles.',
      method: 'Clean the product-contact surfaces for the stated number of cycles and inspect them.',
      verify: 'OQ',
      priority: 'desirable',
    },
  ],
  environmental: [
    {
      key: 'e-hold',
      section: 'Operation and performance',
      text: 'The equipment shall hold every mapped location within ±[tolerance and unit] of its [set point and unit] set point.',
      criterion: 'Every mapping probe stays within tolerance for [mapping duration, hours], empty (OQ) and loaded (PQ).',
      method: 'Place calibrated probes at the corners and centre of the usable volume and log for the mapping duration.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'e-recover',
      section: 'Operation and performance',
      text: 'When the door closes after being open for [door-open time, seconds], the equipment shall return every mapped location to within tolerance in no more than [recovery time, minutes].',
      criterion: 'All probes are back within tolerance within the recovery time in each of three door-open tests.',
      method: 'Open the door for the stated time, close it and time the recovery of each probe; repeat three times.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'e-alarm',
      section: 'Controls, alarms and interlocks',
      text: 'When a monitored location stays outside tolerance for more than [alarm delay, minutes], the equipment shall raise a local alarm and send a notification to [notification recipient].',
      criterion: 'The alarm sounds and the notification arrives within the alarm delay plus 1 minute.',
      method: 'Drive the set point outside tolerance and record when the alarm sounds and when the notification arrives.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'e-power',
      section: 'Controls, alarms and interlocks',
      text: 'When power returns after an outage, the equipment shall resume control at its last set point without operator action.',
      criterion: 'After a 5-minute outage the equipment restarts at its last set point and the outage is recorded.',
      method: 'Remove power for 5 minutes, restore it and observe the restart.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'e-log',
      section: 'Software and data',
      text: 'The equipment shall record the controlled conditions at intervals of no more than [logging interval, minutes].',
      criterion: 'The log for the mapping period has no gap longer than the logging interval.',
      method: 'Review the log for the mapping period for gaps.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'e-volume',
      section: 'Installation and utilities',
      text: 'The equipment shall provide a usable volume of at least [usable volume and unit].',
      criterion: 'The measured usable volume, inside the mapped boundary, meets the requirement.',
      method: 'Measure the usable volume inside the mapped boundary.',
      verify: 'IQ',
      priority: 'essential',
    },
  ],
  'test-system': [
    {
      key: 't-sequence',
      section: 'Operation and performance',
      text: 'The equipment shall run each test step in the order defined in [test specification ID].',
      criterion: 'The executed sequence and its records match the test specification step by step.',
      method: 'Run one unit and compare the sequence and records with the test specification.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 't-limits',
      section: 'Operation and performance',
      text: 'The equipment shall compare each measured value with its approved pass and fail limits and record the result.',
      criterion: 'Values just inside and just outside each limit give the expected pass and fail results.',
      method: 'Apply reference values just inside and just outside each limit and check the recorded result.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 't-fail',
      section: 'Controls, alarms and interlocks',
      text: 'When a unit fails a test step, the equipment shall record the unit as failed and prevent it from being recorded as passed.',
      criterion: 'A failed unit can’t be passed without a new, recorded test.',
      method: 'Fail a unit at one step, then try to record it as passed.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 't-golden',
      section: 'Operation and performance',
      text: 'The equipment shall fail a known-bad reference unit in each of [number of runs] consecutive runs.',
      criterion: 'The known-bad unit fails in every run, and the known-good unit passes in every run.',
      method: 'Test a known-good and a known-bad reference unit for the stated number of runs.',
      verify: 'PQ',
      priority: 'essential',
    },
  ],
  utility: [
    {
      key: 'u-quality',
      section: 'Operation and performance',
      text: 'The system shall deliver [utility] that meets [quality specification] at every point of use.',
      criterion: 'Samples from each point of use meet the specification.',
      method: 'Sample each point of use and test against the specification.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'u-supply',
      section: 'Operation and performance',
      text: 'The system shall supply [utility] at [pressure or flow and unit] at every point of use during peak demand.',
      criterion: 'Pressure or flow at each point of use stays within the requirement with all users running.',
      method: 'Measure at each point of use with every connected user running.',
      verify: 'OQ',
      priority: 'essential',
    },
    {
      key: 'u-alarm',
      section: 'Controls, alarms and interlocks',
      text: 'When the supply falls below [low limit and unit], the system shall raise an alarm at [alarm location].',
      criterion: 'The alarm is raised at the low limit in each of three challenges.',
      method: 'Reduce the supply to the low limit three times and record the alarm.',
      verify: 'OQ',
      priority: 'essential',
    },
  ],
};

const SAFETY: RequirementSuggestion[] = [
  {
    key: 'safety-elec',
    section: 'Safety',
    text: 'The equipment shall conform to IEC 61010-1 for electrical equipment for measurement, control and laboratory use.',
    criterion: 'A certification mark or the manufacturer’s declaration of conformity is on file.',
    method: 'Review the certification mark or declaration of conformity.',
    verify: 'IQ',
    priority: 'essential',
    when: (e) => e.kind === 'measuring' || e.kind === 'environmental',
  },
  {
    key: 'safety-machine',
    section: 'Safety',
    text: 'The equipment shall conform to [machinery electrical safety standard, such as NFPA 79 or IEC 60204-1].',
    criterion: 'The manufacturer’s declaration of conformity is on file.',
    method: 'Review the declaration of conformity.',
    verify: 'IQ',
    priority: 'essential',
    when: machine,
  },
  {
    key: 'safety-estop',
    section: 'Safety',
    text: 'When the emergency stop is pressed, the equipment shall stop all hazardous motion within [stop time, milliseconds].',
    criterion: 'Motion stops within the stop time in each of three tests, and the equipment can’t restart until the stop is reset.',
    method: 'Press the emergency stop during motion three times and time the stop.',
    verify: 'OQ',
    priority: 'essential',
    when: machine,
  },
  {
    key: 'safety-guard',
    section: 'Safety',
    text: 'While a guard is open, the equipment shall prevent a cycle from starting.',
    criterion: 'A start command with each guard open is refused.',
    method: 'Open each guard in turn and try to start a cycle.',
    verify: 'OQ',
    priority: 'essential',
    when: (e) => e.kind === 'production',
  },
];

/** Suggestions for this equipment that it doesn't already have and the team hasn't dismissed. */
export function suggestionsFor(e: Equipment): RequirementSuggestion[] {
  const all = [...(e.kind ? BY_KIND[e.kind] : []), ...COMMON, ...CALIBRATION, ...SOFTWARE, ...SAFETY];
  const have = new Set(e.requirements.map((r) => r.key).filter(Boolean));
  return all.filter((s) => (!s.when || s.when(e)) && !have.has(s.key) && !e.dismissed.includes(s.key));
}

/** Names of equipment in the setup answers, split on commas, "and" and semicolons. */
export function namesFromSetup(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,;\n]|\band\b/i)
        .map((x) => x.trim().replace(/\.$/, ''))
        .filter((x) => x.length > 1 && x.length <= 120),
    ),
  ];
}

/** Adds a requirement, from a suggestion or blank, with the next UR reference. */
export function addRequirement(e: Equipment, s?: RequirementSuggestion): Equipment {
  const ref = `UR-${String(e.nextReq).padStart(2, '0')}`;
  const r = {
    id: uid('ur-'),
    ref,
    key: s?.key ?? '',
    section: s?.section ?? 'Operation and performance',
    text: s?.text ?? '',
    criterion: s?.criterion ?? '',
    method: s?.method ?? '',
    verify: s?.verify ?? ('OQ' as Verify),
    priority: s?.priority ?? ('essential' as Priority),
  };
  return { ...e, requirements: [...e.requirements, r], nextReq: e.nextReq + 1 };
}

/** Adds equipment with the next EQ reference. */
export function addEquipment(a: EquipmentAnswers, p: Partial<Equipment> = {}): EquipmentAnswers {
  const ref = `EQ-${String(a.nextRef).padStart(3, '0')}`;
  const kind = p.kind ?? (p.name ? guessKind(p.name) : '');
  const e = newEquipment(ref, { ...p, kind, calibration: p.calibration ?? (kind === 'measuring' ? 'yes' : '') });
  return { ...a, items: [...a.items, e], nextRef: a.nextRef + 1 };
}
