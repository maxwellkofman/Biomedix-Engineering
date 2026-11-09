/**
 * ISO 14971:2019 risk assessment: hazards identified for the device, risks
 * estimated on a severity by probability matrix, controls chosen in the
 * order 7.1 requires and verified, and residual risk evaluated, alone and
 * overall.
 *
 * The scales and matrix implement SOP-003. Hazards suggested here come from
 * the device profile (ISO 14971 Annex C questions and ISO/TR 24971 Annex A);
 * they are a starting point for the team, not a complete analysis.
 */
import type { Derived } from '../intake/derive';
import type { Intake } from '../intake/model';
import { uid, type ControlType, type Hazard, type RiskAnswers, type RiskControl, type Zone } from './model';

export const SEVERITY = [
  { n: 1, code: 'S1', name: 'Negligible', desc: 'Inconvenience or temporary discomfort; no injury' },
  { n: 2, code: 'S2', name: 'Minor', desc: 'Temporary injury or impairment that needs no medical intervention' },
  { n: 3, code: 'S3', name: 'Serious', desc: 'Injury or impairment that needs medical intervention' },
  { n: 4, code: 'S4', name: 'Critical', desc: 'Permanent impairment or life-threatening injury' },
  { n: 5, code: 'S5', name: 'Catastrophic', desc: 'Death' },
] as const;

export const PROBABILITY = [
  { n: 1, name: 'Improbable', desc: 'Fewer than 1 in 1,000,000 uses' },
  { n: 2, name: 'Remote', desc: '1 in 1,000,000 to 1 in 100,000 uses' },
  { n: 3, name: 'Occasional', desc: '1 in 100,000 to 1 in 10,000 uses' },
  { n: 4, name: 'Probable', desc: '1 in 10,000 to 1 in 1,000 uses' },
  { n: 5, name: 'Frequent', desc: 'More than 1 in 1,000 uses' },
] as const;

/** Rows are severity 1–5, columns probability 1–5. */
export const DEFAULT_MATRIX = ['AAAAR', 'AAARR', 'AARRU', 'ARRUU', 'RRUUU'].join('');

export const ZONE_LABEL: Record<Zone, string> = { A: 'Acceptable', R: 'Reduce further', U: 'Unacceptable' };
export const ZONE_HINT: Record<Zone, string> = {
  A: 'Acceptable without further reduction.',
  R: 'Reduce as far as possible. Acceptable only with a documented benefit-risk rationale.',
  U: 'Not acceptable. Reduce it, or show the medical benefit outweighs it (ISO 14971 7.4).',
};

export const CONTROL_TYPE_LABEL: Record<Exclude<ControlType, ''>, string> = {
  design: 'Inherent safety by design',
  protective: 'Protective measure',
  information: 'Information for safety',
};

export const CATEGORIES = [
  'Energy',
  'Biological and chemical',
  'Operational',
  'Information',
  'Software',
  'Cybersecurity',
  'AI and data',
  'Use error',
  'Environment',
] as const;

export const matrixOf = (r: RiskAnswers) => (/^[ARU]{25}$/.test(r.matrix) ? r.matrix : DEFAULT_MATRIX);

export function zone(matrix: string, severity: number, probability: number): Zone | null {
  if (severity < 1 || severity > 5 || probability < 1 || probability > 5) return null;
  return matrix[(severity - 1) * 5 + (probability - 1)] as Zone;
}

export const sevLabel = (n: number) => (n ? `${SEVERITY[n - 1].code} ${SEVERITY[n - 1].name}` : 'Not rated');
export const probLabel = (n: number) => (n ? PROBABILITY[n - 1].name : 'Not rated');

/* ---------- Suggested hazards ---------- */

interface Suggestion {
  key: string;
  category: (typeof CATEGORIES)[number];
  hazard: string;
  sequence: string;
  situation: string;
  harm: string;
  severity: number;
  software?: boolean;
  controls: [ControlType, string][];
  when: (ix: Intake, d: Derived) => boolean;
  /** Why it was suggested. */
  because: string;
}

const harmSeverity = (ix: Intake) => ({ none: 1, 'non-serious': 2, serious: 4, death: 5 })[ix.tech.worstHarm as 'none'] ?? 4;
const lay = (ix: Intake) => /patient|home|lay|caregiver|consumer/i.test(`${ix.device.users} ${ix.device.environment}`);

export function suggestionsFor(ix: Intake, d: Derived): (Suggestion & { severity: number })[] {
  const sw = harmSeverity(ix);
  const contact = ix.device.patientContact;
  const list: Suggestion[] = [
    {
      key: 'bio-contact',
      category: 'Biological and chemical',
      hazard: 'Patient-contacting materials that are cytotoxic, irritating or sensitizing',
      sequence: 'The device or its adhesive stays in contact with the patient for the intended duration.',
      situation: 'Prolonged contact with a material that irritates or sensitizes',
      harm: contact === 'implant' ? 'Local tissue reaction, inflammation or systemic toxicity' : 'Skin irritation or allergic reaction',
      severity: contact === 'implant' ? 4 : 2,
      controls: [
        ['design', 'Patient-contacting materials evaluated under ISO 10993-1 for the contact type and duration'],
        ['information', 'Instructions for use describe skin reactions and when to stop using the device'],
      ],
      when: (x) => !!x.device.patientContact && x.device.patientContact !== 'none',
      because: 'patient contact',
    },
    {
      key: 'sterility',
      category: 'Biological and chemical',
      hazard: 'Loss of sterility',
      sequence: 'The sterile barrier is damaged in transport, or the device is used after its expiry date.',
      situation: 'A non-sterile device is used on the patient',
      harm: 'Infection',
      severity: 4,
      controls: [
        ['design', 'Sterilization process validated (SOP-009) and packaging validated to ISO 11607'],
        ['information', 'Label says not to use if the package is damaged, and shows the expiry date'],
      ],
      when: (x) => x.device.sterile === 'yes',
      because: 'supplied sterile',
    },
    {
      key: 'electrical',
      category: 'Energy',
      hazard: 'Electrical energy: leakage current or a battery fault',
      sequence: 'Insulation fails or the battery is damaged or short-circuited while the device is on the patient.',
      situation: 'Patient exposed to leakage current or battery heat',
      harm: 'Electric shock or burn',
      severity: 3,
      controls: [['design', 'Basic safety to IEC 60601-1: patient leakage limits and battery protection circuit']],
      when: (_x, dd) => dd.hasHardware === true,
      because: 'hardware',
    },
    {
      key: 'thermal',
      category: 'Energy',
      hazard: 'Heat from electronics or the battery',
      sequence: 'The device runs hot during charging or continuous use against the skin.',
      situation: 'Skin in contact with a surface above safe temperature limits',
      harm: 'Low-temperature burn',
      severity: 3,
      controls: [['design', 'Applied-part surface temperature within IEC 60601-1 limits, verified under worst-case load']],
      when: (x, dd) => dd.hasHardware === true && !!x.device.patientContact && x.device.patientContact !== 'none',
      because: 'hardware in contact with the patient',
    },
    {
      key: 'mechanical',
      category: 'Energy',
      hazard: 'Mechanical: sharp edges, pinch points or detached small parts',
      sequence: 'The device is handled, worn or dropped, and a part breaks or detaches.',
      situation: 'Patient or user handles a sharp or detached part',
      harm: 'Cut, abrasion or choking on a small part',
      severity: 2,
      controls: [['design', 'Edges radiused and parts retained; drop and mechanical strength tests to IEC 60601-1']],
      when: (_x, dd) => dd.hasHardware === true,
      because: 'hardware',
    },
    {
      key: 'emc',
      category: 'Environment',
      hazard: 'Electromagnetic interference',
      sequence: 'Nearby equipment such as phones or other medical devices emits interference during use.',
      situation: 'The device malfunctions or gives wrong readings without the user noticing',
      harm: 'Delayed or incorrect diagnosis or treatment',
      severity: 3,
      controls: [['design', 'Electromagnetic compatibility to IEC 60601-1-2 for the intended environment']],
      when: (_x, dd) => dd.hasHardware === true,
      because: 'electronics',
    },
    {
      key: 'shelf-life',
      category: 'Environment',
      hazard: 'Degradation after storage',
      sequence: 'The device or a consumable is stored past its shelf life or outside its storage conditions.',
      situation: 'A degraded device or consumable is used',
      harm: 'Device fails during use, delaying diagnosis or treatment',
      severity: 2,
      controls: [
        ['design', 'Shelf life established by accelerated and real-time aging tests'],
        ['information', 'Expiry date and storage conditions on the label'],
      ],
      when: (x, dd) => dd.hasHardware !== false && !!x.device.shelfLife.trim(),
      because: 'stated shelf life',
    },
    {
      key: 'sw-output',
      category: 'Software',
      hazard: 'Software failure produces wrong or missing output',
      sequence: 'A software defect corrupts a calculation, display or alert, and the user acts on it.',
      situation: 'Clinician or patient acts on incorrect or missing information',
      harm: 'Delayed or incorrect diagnosis or treatment',
      severity: sw,
      software: true,
      controls: [
        ['design', 'Software developed under IEC 62304 for its safety class, with risk-control requirements verified by test (SW-SOP-001)'],
      ],
      when: (_x, dd) => dd.hasSoftware === true,
      because: 'software',
    },
    {
      key: 'data-integrity',
      category: 'Software',
      hazard: 'Data lost or corrupted in storage or transfer',
      sequence: 'Data is dropped, truncated or attributed to the wrong patient while stored or sent.',
      situation: 'Clinician reviews incomplete or wrongly attributed data',
      harm: 'Missed or delayed diagnosis',
      severity: Math.min(sw, 4),
      software: true,
      controls: [
        ['design', 'Integrity checks on stored and transferred data, with acknowledged transfer and retry'],
        ['protective', 'Patient identifiers checked at each transfer; gaps in data flagged to the user'],
      ],
      when: (_x, dd) => dd.hasSoftware === true,
      because: 'software that stores or moves data',
    },
    {
      key: 'connectivity',
      category: 'Operational',
      hazard: 'Loss of connection or delayed transmission',
      sequence: 'The network, Bluetooth link or cloud service is unavailable while data or alerts are being sent.',
      situation: 'An alert or result reaches the clinician late or not at all',
      harm: 'Delayed treatment',
      severity: Math.min(sw, 4),
      controls: [
        ['protective', 'Connection loss is detected and shown to the user and clinician; data is buffered and resent'],
        ['information', 'Instructions for use state the device isn’t for emergency or real-time monitoring, if that applies'],
      ],
      when: (_x, dd) => dd.connected === true,
      because: 'network connection',
    },
    {
      key: 'cyber',
      category: 'Cybersecurity',
      hazard: 'Unauthorized access to, or tampering with, the device or its data',
      sequence: 'An attacker exploits a vulnerability or stolen credentials to read or change data or commands.',
      situation: 'Device behaves wrongly or a clinician acts on altered data',
      harm: 'Incorrect diagnosis or treatment; disclosure of health data',
      severity: sw,
      software: true,
      controls: [
        ['design', 'Authentication, authorization and encryption in transit and at rest, from the threat model (SW-SOP-002)'],
        ['protective', 'Vulnerability monitoring and patching under the SBOM and cybersecurity plan'],
      ],
      when: (_x, dd) => dd.connected === true && dd.hasSoftware !== false,
      because: 'cyber device',
    },
    {
      key: 'ai-fn',
      category: 'AI and data',
      hazard: 'Model misses a true condition (false negative)',
      sequence: 'The model’s output is below threshold for a patient who has the condition.',
      situation: 'Condition not flagged for clinician review',
      harm: 'Delayed diagnosis or treatment',
      severity: sw,
      software: true,
      controls: [
        ['design', 'Sensitivity acceptance criteria pre-specified and met on a sequestered test set (SW-SOP-003)'],
        ['information', 'Labeling states the output supports, and doesn’t replace, clinician review'],
      ],
      when: (_x, dd) => dd.ai === true,
      because: 'AI-enabled function',
    },
    {
      key: 'ai-fp',
      category: 'AI and data',
      hazard: 'Model flags a condition that isn’t there (false positive)',
      sequence: 'The model’s output is above threshold for a patient without the condition.',
      situation: 'Patient referred for follow-up they don’t need',
      harm: 'Unnecessary tests or treatment; anxiety',
      severity: 2,
      software: true,
      controls: [['design', 'Specificity acceptance criteria pre-specified and met on a sequestered test set']],
      when: (_x, dd) => dd.ai === true,
      because: 'AI-enabled function',
    },
    {
      key: 'ai-subgroup',
      category: 'AI and data',
      hazard: 'Lower model performance in a patient subgroup',
      sequence: 'Training data under-represents a subgroup (for example by age, sex, skin tone or comorbidity).',
      situation: 'Patients in that subgroup get less accurate results',
      harm: 'Missed or delayed diagnosis in that subgroup',
      severity: sw,
      software: true,
      controls: [
        ['design', 'Subgroup analysis with acceptance criteria for each pre-specified subgroup'],
        ['information', 'Model card and labeling state the populations the model was evaluated on'],
      ],
      when: (_x, dd) => dd.ai === true,
      because: 'AI-enabled function',
    },
    {
      key: 'ai-drift',
      category: 'AI and data',
      hazard: 'Model performance drifts after release or retraining',
      sequence: 'Input data in the field shifts, or a retrained model behaves differently from the cleared one.',
      situation: 'Performance drops below the cleared level without anyone noticing',
      harm: 'Missed or incorrect diagnosis',
      severity: sw,
      software: true,
      controls: [
        ['protective', 'Field monitoring with drift thresholds and owners (SW-SOP-003)'],
        ['design', 'Model changes only through the PCCP or a new submission, each re-verified on the sequestered test set'],
      ],
      when: (x, dd) => dd.ai === true && x.tech.modelUpdates === 'retrained',
      because: 'model retrained after release',
    },
    {
      key: 'use-error',
      category: 'Use error',
      hazard: 'Device applied, set up or operated incorrectly',
      sequence: 'A user misreads an instruction or the interface and applies or operates the device the wrong way.',
      situation: lay(ix) ? 'Device used incorrectly at home without a clinician present' : 'Device used incorrectly during care',
      harm: 'Poor-quality or missing data, delaying diagnosis or treatment',
      severity: 3,
      controls: [
        ['design', 'Usability engineering to IEC 62366-1, with a summative evaluation by representative users'],
        ['information', 'Illustrated quick-start guide and in-product prompts for the critical tasks'],
      ],
      when: () => true,
      because: lay(ix) ? 'lay users or home use' : 'every device',
    },
    {
      key: 'labeling',
      category: 'Information',
      hazard: 'Instructions for use missing, unclear or not available',
      sequence: 'The user can’t find or understand the instructions, warnings or contraindications.',
      situation: 'Device used outside its indications or without the warnings',
      harm: 'Injury or delayed treatment from misuse',
      severity: 3,
      controls: [
        ['information', 'Labeling reviewed against the indications and checked for readability (SOP-013)'],
        ...(ix.operations.labeling === 'eifu'
          ? ([['protective', 'Electronic instructions stay available offline, with a paper copy on request']] as [ControlType, string][])
          : []),
      ],
      when: () => true,
      because: 'every device',
    },
  ];
  return list.filter((x) => x.when(ix, d));
}

export function pendingSuggestions(ix: Intake, d: Derived) {
  const taken = new Set([...ix.risk.hazards.map((h) => h.key).filter(Boolean), ...ix.risk.dismissed]);
  return suggestionsFor(ix, d).filter((x) => !taken.has(x.key));
}

const ref3 = (n: number) => String(n).padStart(3, '0');

export function newControl(h: Hazard, text = '', type: ControlType = ''): RiskControl {
  return { id: uid('rc-'), ref: `RC-${h.ref.replace(/^H-?/, '')}.${h.nextControl}`, text, type, implemented: '', effective: '' };
}

/** Adds a hazard (blank, or from a suggestion) and returns the updated answers. */
export function addHazard(r: RiskAnswers, from?: ReturnType<typeof suggestionsFor>[number]): RiskAnswers {
  const ref = `H-${ref3(r.nextRef)}`;
  let h: Hazard = {
    id: uid('hz-'),
    ref,
    key: from?.key ?? '',
    category: from?.category ?? '',
    hazard: from?.hazard ?? '',
    sequence: from?.sequence ?? '',
    situation: from?.situation ?? '',
    harm: from?.harm ?? '',
    software: from?.software ?? false,
    severity: from?.severity ?? 0,
    probability: 0,
    controls: [],
    nextControl: 1,
    // Controls usually lower probability, not severity, so the residual severity starts at the initial one.
    residualSeverity: from?.controls.length ? from.severity : 0,
    residualProbability: 0,
    newRisks: '',
    benefit: '',
    link: '',
  };
  for (const [type, text] of from?.controls ?? []) {
    h = { ...h, controls: [...h.controls, newControl(h, text, type)], nextControl: h.nextControl + 1 };
  }
  return { ...r, hazards: [...r.hazards, h], nextRef: r.nextRef + 1 };
}

/* ---------- Evaluation ---------- */

export interface HazardIssue {
  key: string;
  text: string;
  /** Blocks completion (open item), or a warning for the reviewer. */
  kind: 'open' | 'warn';
}

export interface HazardSummary {
  hazard: Hazard;
  initial: Zone | null;
  residual: Zone | null;
  /** Residual risk accepted on a benefit-risk rationale. */
  onBenefit: boolean;
  done: number;
  total: number;
  issues: HazardIssue[];
  complete: boolean;
}

export function summarizeHazard(h: Hazard, matrix: string): HazardSummary {
  const issues: HazardIssue[] = [];
  let done = 0;
  let total = 0;
  const item = (ok: boolean, key: string, text: string) => {
    total++;
    if (ok) done++;
    else issues.push({ key, text, kind: 'open' });
  };
  item(!!(h.hazard.trim() && h.situation.trim() && h.harm.trim()), 'describe', 'Describe the hazard, hazardous situation and harm');
  item(h.severity > 0, 'severity', 'Rate the severity of the harm');
  item(h.probability > 0, 'probability', 'Estimate the probability of harm');
  const initial = zone(matrix, h.severity, h.probability);
  const hasControls = h.controls.length > 0;
  item(initial === 'A' || hasControls, 'control', 'Add a risk control: this risk isn’t acceptable as it stands');
  for (const c of h.controls) {
    item(!!c.text.trim() && !!c.type, `${c.id}-what`, `${c.ref}: describe the control and its type`);
    item(!!c.implemented.trim(), `${c.id}-impl`, `${c.ref}: record where implementation is verified`);
    item(!!c.effective.trim(), `${c.id}-eff`, `${c.ref}: record where effectiveness is verified`);
  }
  let residual: Zone | null = initial;
  if (hasControls) {
    item(h.residualSeverity > 0 && h.residualProbability > 0, 'residual', 'Rate the residual risk after controls');
    residual = zone(matrix, h.residualSeverity, h.residualProbability);
    item(!!h.newRisks, 'new-risks', 'Say whether the controls introduce new hazards (ISO 14971 7.6)');
  }
  const needsBenefit = residual === 'R' || residual === 'U';
  if (needsBenefit) item(!!h.benefit.trim(), 'benefit', 'Give the benefit-risk rationale for the residual risk (ISO 14971 7.4)');

  if (hasControls && h.residualSeverity && h.severity && h.residualSeverity < h.severity)
    issues.push({ key: 'sev-down', text: 'Controls usually reduce probability, not severity. Justify the lower severity.', kind: 'warn' });
  if (hasControls && initial !== 'A' && h.controls.every((c) => c.type === 'information'))
    issues.push({
      key: 'info-only',
      text: 'Information for safety is the only control. ISO 14971 7.1 asks for design and protective measures first, where practicable.',
      kind: 'warn',
    });
  if (h.newRisks === 'yes')
    issues.push({ key: 'new-risk-yes', text: 'The controls introduce new hazards: add them to the register.', kind: 'warn' });

  return {
    hazard: h,
    initial,
    residual,
    onBenefit: needsBenefit && !!h.benefit.trim(),
    done,
    total,
    issues,
    complete: done === total,
  };
}

export interface RiskSummary {
  matrix: string;
  hazards: HazardSummary[];
  pending: ReturnType<typeof suggestionsFor>;
  done: number;
  total: number;
  suggested: number;
  suggestedTotal: number;
  counts: { initialU: number; initialR: number; residualU: number; residualR: number; onBenefit: number; controls: number; unverified: number };
  overallTodo: { key: string; label: string }[];
  todo: { key: string; label: string; anchor: string }[];
  complete: boolean;
}

export function summarizeRisk(ix: Intake, d: Derived): RiskSummary {
  const r = ix.risk;
  const matrix = matrixOf(r);
  const hazards = r.hazards.map((h) => summarizeHazard(h, matrix));
  const pending = pendingSuggestions(ix, d);
  const todo: RiskSummary['todo'] = [];
  let done = 0;
  let total = 0;
  if (!hazards.length) {
    total++;
    todo.push({ key: 'add', label: 'Add the hazards for your device', anchor: 'risk-register' });
  }
  for (const h of hazards) {
    done += h.done;
    total += h.total;
    h.issues
      .filter((i) => i.kind === 'open')
      .forEach((i) => todo.push({ key: `${h.hazard.id}-${i.key}`, label: `${h.hazard.ref}: ${i.text}`, anchor: `hz-${h.hazard.id}` }));
  }
  const o = r.overall;
  const overallTodo = [
    !o.method.trim() && { key: 'method', label: 'Describe how overall residual risk was evaluated' },
    !o.benefits.trim() && { key: 'benefits', label: 'State the medical benefits of the device' },
    !o.disclosure.trim() && { key: 'disclosure', label: 'Say how significant residual risks are disclosed to users' },
    !o.conclusion && { key: 'conclusion', label: 'Record the overall residual risk decision' },
  ].filter((x): x is { key: string; label: string } => !!x);
  total += 4;
  done += 4 - overallTodo.length;
  overallTodo.forEach((x) => todo.push({ ...x, anchor: 'risk-overall' }));

  const suggestedTotal = suggestionsFor(ix, d).length;
  const controls = r.hazards.flatMap((h) => h.controls);
  return {
    matrix,
    hazards,
    pending,
    done,
    total,
    suggested: pending.length,
    suggestedTotal,
    counts: {
      initialU: hazards.filter((h) => h.initial === 'U').length,
      initialR: hazards.filter((h) => h.initial === 'R').length,
      residualU: hazards.filter((h) => h.residual === 'U').length,
      residualR: hazards.filter((h) => h.residual === 'R').length,
      onBenefit: hazards.filter((h) => h.onBenefit).length,
      controls: controls.length,
      unverified: controls.filter((c) => !c.effective.trim()).length,
    },
    overallTodo,
    todo,
    complete: done === total && pending.length === 0,
  };
}
