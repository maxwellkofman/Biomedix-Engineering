/**
 * The question bank. Both the step-by-step setup and the single-page form
 * render from this list, so a question added here shows up in both.
 */
import { TOKENS, type Derived, type TokenKey, type TokenValues } from './derive';
import type { Intake, IntakeSection, StepId } from './model';

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export interface QuestionCtx {
  ix: Intake;
  d: Derived;
  tokens: TokenValues;
}

export interface Question {
  section: IntakeSection;
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'date' | 'choice';
  options?: Option[];
  placeholder?: string;
  rows?: number;
  hint?: string | ((c: QuestionCtx) => string | undefined);
  showIf?: (c: QuestionCtx) => boolean;
  /** Lay out next to the following question on wide screens. */
  half?: boolean;
  /** Tokens this answer feeds beyond the ones whose field is this question. */
  alsoFeeds?: TokenKey[];
  action?: 'draftIntendedUse';
}

export interface QuestionGroup {
  step: StepId;
  title: string;
  note?: { text: string; link?: { href: string; label: string; after: string } };
  /** Show the description reader under this group. */
  detections?: boolean;
  questions: Question[];
}

export const fieldId = (q: Pick<Question, 'section' | 'key'>) => `${q.section}.${q.key}`;

/** Tokens an answer fills, used to show "fills these documents" next to each question. */
export function tokensFor(q: Question): TokenKey[] {
  const id = fieldId(q);
  const own = (Object.keys(TOKENS) as TokenKey[]).filter((k) => TOKENS[k].field === id);
  return [...new Set([...own, ...(q.alsoFeeds ?? [])])];
}

const YES_NO: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const fallbackHint =
  (k: TokenKey) =>
  ({ tokens }: QuestionCtx) =>
    tokens[k]?.auto ? `Left blank, so the agent uses ${tokens[k]!.value}. Confirm or name someone else.` : undefined;

const proposedHint =
  (k: TokenKey) =>
  ({ tokens }: QuestionCtx) =>
    tokens[k]?.auto ? `Left blank, so the documents propose: ${tokens[k]!.value}.` : undefined;

export const GROUPS: QuestionGroup[] = [
  /* ---------------- Company ---------------- */
  {
    step: 'company',
    title: 'Legal manufacturer',
    questions: [
      { section: 'company', key: 'name', label: 'Company name', kind: 'text', placeholder: 'As registered with FDA' },
      { section: 'company', key: 'address', label: 'Address', kind: 'text', placeholder: 'Street, city, state, ZIP' },
      { section: 'company', key: 'stage', label: 'Funding stage', kind: 'text', placeholder: 'Seed, Series A…', half: true },
      { section: 'company', key: 'employees', label: 'Employees', kind: 'text', placeholder: '12', half: true },
    ],
  },

  /* ---------------- Device ---------------- */
  {
    step: 'device',
    title: 'What it is',
    detections: true,
    questions: [
      { section: 'device', key: 'name', label: 'Device name', kind: 'text', placeholder: 'Trade name or working name' },
      {
        section: 'device',
        key: 'description',
        label: 'Plain-language description',
        kind: 'textarea',
        rows: 4,
        placeholder:
          'What the device is, how it works, and what it connects to. The agent reads this to pre-fill other answers.',
        alsoFeeds: ['deviceType', 'cyberStatus', 'aiStatus'],
      },
    ],
  },
  {
    step: 'device',
    title: 'Intended use',
    questions: [
      {
        section: 'device',
        key: 'intendedUse',
        label: 'Intended use statement',
        kind: 'textarea',
        rows: 3,
        hint: 'Bracketed text stays flagged as needing input until you replace it.',
        action: 'draftIntendedUse',
      },
      {
        section: 'device',
        key: 'indications',
        label: 'Indications for use',
        kind: 'textarea',
        rows: 2,
        placeholder: 'Patient population, condition, duration',
      },
      { section: 'device', key: 'users', label: 'Intended users', kind: 'text', placeholder: 'Clinicians, patients, caregivers…', half: true },
      { section: 'device', key: 'environment', label: 'Use environment', kind: 'text', placeholder: 'Hospital, clinic, home…', half: true },
    ],
  },
  {
    step: 'device',
    title: 'Physical characteristics',
    questions: [
      {
        section: 'device',
        key: 'patientContact',
        label: 'Does any part touch the patient?',
        kind: 'choice',
        options: [
          { value: 'none', label: 'No contact' },
          { value: 'surface', label: 'Skin surface', hint: 'Patches, cuffs, electrodes' },
          { value: 'external', label: 'Externally communicating', hint: 'Blood path, tissue' },
          { value: 'implant', label: 'Implanted' },
        ],
        hint: 'Decides whether biocompatibility (ISO 10993-1) belongs in your design inputs.',
        showIf: ({ ix }) => ix.tech.hardware !== 'no',
      },
      {
        section: 'device',
        key: 'sterile',
        label: 'Supplied sterile?',
        kind: 'choice',
        options: YES_NO,
        half: true,
        showIf: ({ ix }) => ix.tech.hardware !== 'no',
      },
      {
        section: 'device',
        key: 'lifetime',
        label: 'Expected device lifetime',
        kind: 'text',
        placeholder: 'e.g. 5 years, or single use',
        hint: 'Sets how long records are kept.',
        alsoFeeds: ['retention'],
        half: true,
      },
      {
        section: 'device',
        key: 'shelfLife',
        label: 'Shelf life',
        kind: 'text',
        placeholder: 'e.g. 18 months',
        showIf: ({ ix }) => ix.tech.hardware !== 'no',
      },
    ],
  },

  /* ---------------- Technology ---------------- */
  {
    step: 'technology',
    title: 'What the device is made of',
    detections: true,
    questions: [
      { section: 'tech', key: 'hardware', label: 'Includes hardware?', kind: 'choice', options: YES_NO, half: true, alsoFeeds: ['deviceType'] },
      { section: 'tech', key: 'software', label: 'Includes software?', kind: 'choice', options: YES_NO, half: true, alsoFeeds: ['designControls', 'cyberStatus'] },
      {
        section: 'tech',
        key: 'platforms',
        label: 'Software platforms',
        kind: 'text',
        placeholder: 'Firmware, mobile apps, cloud service, web portal…',
        showIf: ({ ix }) => ix.tech.software !== 'no',
      },
      {
        section: 'tech',
        key: 'worstHarm',
        label: 'Worst credible harm if the software fails, before external risk controls',
        kind: 'choice',
        hint: 'Sets the IEC 62304 safety class and FDA documentation level.',
        options: [
          { value: 'none', label: 'No injury', hint: 'Class A · Basic' },
          { value: 'non-serious', label: 'Non-serious injury', hint: 'Class B · Basic' },
          { value: 'serious', label: 'Serious injury', hint: 'Class C · Enhanced' },
          { value: 'death', label: 'Death', hint: 'Class C · Enhanced' },
        ],
        showIf: ({ ix }) => ix.tech.software !== 'no',
      },
    ],
  },
  {
    step: 'technology',
    title: 'Connectivity and AI',
    questions: [
      {
        section: 'tech',
        key: 'connected',
        label: 'Connects to the internet, a phone, or other devices?',
        kind: 'choice',
        options: YES_NO,
        hint: 'Software that can connect is a cyber device under section 524B.',
        showIf: ({ ix }) => ix.tech.software !== 'no',
      },
      {
        section: 'tech',
        key: 'ai',
        label: 'Uses AI or machine learning?',
        kind: 'choice',
        options: YES_NO,
        showIf: ({ ix }) => ix.tech.software !== 'no',
        alsoFeeds: ['pccpStatus'],
      },
      {
        section: 'tech',
        key: 'modelUpdates',
        label: 'How will the model change after clearance?',
        kind: 'choice',
        options: [
          { value: 'locked', label: 'Locked', hint: 'Changes only with a new release' },
          { value: 'retrained', label: 'Retrained', hint: 'Updated on new data over time' },
        ],
        showIf: ({ ix }) => ix.tech.ai === 'yes',
      },
      {
        section: 'tech',
        key: 'pccp',
        label: 'Will you file a predetermined change control plan (PCCP)?',
        kind: 'choice',
        options: YES_NO,
        showIf: ({ ix }) => ix.tech.ai === 'yes',
      },
      {
        section: 'tech',
        key: 'thirdPartyModel',
        label: 'Third-party or foundation models',
        kind: 'text',
        placeholder: 'Name and version, or None',
        showIf: ({ ix }) => ix.tech.ai === 'yes',
      },
    ],
  },

  /* ---------------- Regulatory ---------------- */
  {
    step: 'regulatory',
    title: 'Classification and pathway',
    note: {
      text: 'Find your product code and regulation in ',
      link: {
        href: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPCD/classification.cfm',
        label: "FDA's product classification database",
        after: '. Not sure yet? Leave them blank and an engineer will help at gate zero.',
      },
    },
    questions: [
      {
        section: 'regulatory',
        key: 'deviceClass',
        label: 'Device class',
        kind: 'choice',
        options: [
          { value: 'I', label: 'Class I' },
          { value: 'II', label: 'Class II' },
          { value: 'III', label: 'Class III' },
        ],
        alsoFeeds: ['designControls', 'docLevel'],
      },
      { section: 'regulatory', key: 'productCode', label: 'Product code', kind: 'text', placeholder: 'Three letters', half: true },
      { section: 'regulatory', key: 'regulation', label: 'Regulation number', kind: 'text', placeholder: '21 CFR 8xx.xxxx', half: true },
      {
        section: 'regulatory',
        key: 'pathway',
        label: 'Pathway',
        kind: 'choice',
        options: [
          { value: '510k', label: '510(k)' },
          { value: 'de-novo', label: 'De Novo' },
          { value: 'pma', label: 'PMA' },
          { value: 'exempt', label: 'Exempt' },
        ],
      },
      { section: 'regulatory', key: 'predicate', label: 'Predicate device', kind: 'text', placeholder: 'Name and 510(k) number', half: true },
      { section: 'regulatory', key: 'targetSubmission', label: 'Target submission date', kind: 'date', half: true },
    ],
  },

  /* ---------------- Operations ---------------- */
  {
    step: 'operations',
    title: 'Manufacturing and suppliers',
    questions: [
      {
        section: 'operations',
        key: 'manufacturing',
        label: 'Who builds the device?',
        kind: 'choice',
        options: [
          { value: 'in-house', label: 'We do', hint: 'In-house production' },
          { value: 'contract', label: 'Contract manufacturer' },
          { value: 'none', label: 'Nothing physical', hint: 'Software only' },
        ],
        alsoFeeds: ['manufacturer'],
      },
      {
        section: 'operations',
        key: 'contractManufacturer',
        label: 'Contract manufacturer',
        kind: 'text',
        showIf: ({ ix }) => ix.operations.manufacturing === 'contract',
        alsoFeeds: ['manufacturer'],
      },
      {
        section: 'operations',
        key: 'suppliers',
        label: 'Critical suppliers',
        kind: 'textarea',
        rows: 2,
        placeholder: 'Components, cloud hosting, test labs, data vendors — comma separated',
      },
      {
        section: 'operations',
        key: 'equipment',
        label: 'Test and measuring equipment that decides pass or fail',
        kind: 'text',
        placeholder: 'e.g. patient simulator, force gauge',
        showIf: ({ ix }) => ix.tech.hardware !== 'no',
      },
    ],
  },
  {
    step: 'operations',
    title: 'Labeling',
    questions: [
      {
        section: 'operations',
        key: 'labeling',
        label: 'How is labeling delivered?',
        kind: 'choice',
        options: [
          { value: 'paper', label: 'Printed', hint: 'Labels and paper IFU' },
          { value: 'eifu', label: 'Printed + eIFU', hint: 'Electronic instructions' },
          { value: 'software', label: 'In the software', hint: 'Software-only devices' },
        ],
        hint: proposedHint('labeling'),
      },
      {
        section: 'operations',
        key: 'udiAgency',
        label: 'UDI issuing agency',
        kind: 'choice',
        options: [
          { value: 'GS1', label: 'GS1' },
          { value: 'HIBCC', label: 'HIBCC' },
          { value: 'ICCBBA', label: 'ICCBBA' },
        ],
        hint: proposedHint('udiAgency'),
      },
    ],
  },
  {
    step: 'operations',
    title: 'Tools',
    questions: [
      {
        section: 'operations',
        key: 'qmsTools',
        label: 'Where quality records live today',
        kind: 'text',
        placeholder: 'Microsoft 365, Google Drive, Notion…',
        alsoFeeds: ['docSystem'],
      },
      { section: 'operations', key: 'devTools', label: 'Development tools', kind: 'text', placeholder: 'GitHub, Jira, CI…' },
    ],
  },

  /* ---------------- Quality system ---------------- */
  {
    step: 'quality',
    title: 'Document control',
    questions: [
      {
        section: 'qms',
        key: 'docSystem',
        label: 'Where will released documents and records live?',
        kind: 'choice',
        options: [
          { value: 'sharepoint', label: 'SharePoint', hint: 'Included with Microsoft 365' },
          { value: 'google', label: 'Google Drive', hint: 'Shared drives' },
          { value: 'eqms', label: 'An eQMS', hint: 'Purchased system' },
          { value: 'other', label: 'Other' },
        ],
        hint: (c) =>
          c.ix.qms.docSystem === 'sharepoint'
            ? 'We create the folder structure and upload the drafts for you after the documents are generated.'
            : proposedHint('docSystem')(c),
      },
      {
        section: 'qms',
        key: 'siteUrl',
        label: 'SharePoint site address',
        kind: 'text',
        placeholder: 'https://yourcompany.sharepoint.com/sites/QMS',
        hint: 'A dedicated site keeps QMS permissions separate from the rest of the company.',
        showIf: ({ ix }) => ix.qms.docSystem === 'sharepoint',
      },
      {
        section: 'qms',
        key: 'eSignature',
        label: 'How will approvals be signed?',
        kind: 'choice',
        options: [
          { value: 'biomedix', label: 'Biomedix platform', hint: 'Part 11 signatures built in' },
          { value: 'docusign', label: 'DocuSign', hint: 'With the Part 11 module' },
          { value: 'adobe', label: 'Adobe Acrobat Sign', hint: 'Part 11 controls' },
          { value: 'wet-ink', label: 'Wet ink', hint: 'Signed, then scanned' },
        ],
        hint: (c) =>
          c.ix.qms.docSystem === 'sharepoint'
            ? 'SharePoint keeps versions and an audit log, but it has no Part 11 signature of its own.'
            : undefined,
      },
      {
        section: 'qms',
        key: 'retention',
        label: 'Keep records for',
        kind: 'choice',
        options: [
          { value: 'lifetime-2', label: 'Device lifetime', hint: 'At least 2 years from release' },
          { value: '10', label: '10 years' },
          { value: '15', label: '15 years' },
        ],
        hint: proposedHint('retention'),
      },
    ],
  },
  {
    step: 'quality',
    title: 'How the system runs',
    questions: [
      {
        section: 'qms',
        key: 'trainingDays',
        label: 'Days to complete training on a revised procedure',
        kind: 'text',
        placeholder: '30',
        hint: proposedHint('trainingWindow'),
        half: true,
      },
      {
        section: 'qms',
        key: 'capaTargets',
        label: 'CAPA closure targets',
        kind: 'choice',
        options: [
          { value: 'standard', label: 'Standard', hint: '30 / 60 / 90 days' },
          { value: 'fast', label: 'Fast', hint: '15 / 30 / 60 days' },
        ],
        hint: proposedHint('capaTargets'),
        half: true,
      },
      {
        section: 'qms',
        key: 'auditFrequency',
        label: 'Internal audit cycle',
        kind: 'choice',
        options: [
          { value: 'annual', label: 'Every 12 months' },
          { value: 'semiannual', label: 'Every 6 months' },
        ],
        hint: proposedHint('auditFrequency'),
      },
      {
        section: 'qms',
        key: 'reviewFrequency',
        label: 'Management review',
        kind: 'choice',
        options: [
          { value: 'annual', label: 'Every 12 months' },
          { value: 'semiannual', label: 'Every 6 months' },
          { value: 'quarterly', label: 'Quarterly' },
        ],
        hint: proposedHint('reviewFrequency'),
      },
      {
        section: 'qms',
        key: 'complaintChannels',
        label: 'Where do complaints and feedback arrive?',
        kind: 'text',
        placeholder: 'Support email, phone line, in-app feedback, sales team…',
      },
    ],
  },

  /* ---------------- Team ---------------- */
  {
    step: 'team',
    title: 'Accountable people',
    note: { text: 'Name and title, e.g. “Jordan Lee, Head of Quality”. One person can hold several roles.' },
    questions: [
      { section: 'team', key: 'ceo', label: 'CEO / top management', kind: 'text', half: true, alsoFeeds: ['mgmtRep'] },
      { section: 'team', key: 'managementRep', label: 'Management representative', kind: 'text', half: true, hint: fallbackHint('mgmtRep') },
      { section: 'team', key: 'quality', label: 'Quality lead', kind: 'text', half: true, hint: fallbackHint('qualityLead') },
      { section: 'team', key: 'engineering', label: 'Engineering lead', kind: 'text', half: true, alsoFeeds: ['opsLead', 'secLead'] },
      { section: 'team', key: 'operations', label: 'Operations lead', kind: 'text', half: true, hint: fallbackHint('opsLead') },
      { section: 'team', key: 'regulatory', label: 'Regulatory lead', kind: 'text', half: true, hint: fallbackHint('regLead') },
      { section: 'team', key: 'ml', label: 'ML lead', kind: 'text', half: true, showIf: ({ d }) => d.ai !== false },
      { section: 'team', key: 'security', label: 'Security lead', kind: 'text', half: true, hint: fallbackHint('secLead'), showIf: ({ d }) => d.connected !== false },
    ],
  },
];

export function visibleQuestions(c: QuestionCtx, step?: StepId) {
  return GROUPS.filter((g) => !step || g.step === step).flatMap((g) => g.questions.filter((q) => !q.showIf || q.showIf(c)));
}

export function answerOf(ix: Intake, q: Question): string {
  return String((ix[q.section] as Record<string, string>)[q.key] ?? '');
}

/** Progress over the questions currently shown. */
export function progress(c: QuestionCtx, step?: StepId) {
  const qs = visibleQuestions(c, step);
  const done = qs.filter((q) => answerOf(c.ix, q).trim()).length;
  return { done, total: qs.length };
}
