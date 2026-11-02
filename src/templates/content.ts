/**
 * Section bodies for the tailored drafts. Each body is a function of the
 * customer's answers and returns text with {{token}} slots; the generator
 * fills the slots and flags anything still missing.
 *
 * Text format: blank line = new paragraph; lines starting "- " = list.
 * Sections without a body here get the generic body in generate.ts.
 */
import type { Derived } from '../intake/derive';
import type { Intake } from '../intake/model';
import type { Procedure } from '../data/procedures';

export interface TemplateCtx {
  ix: Intake;
  d: Derived;
  applicable: Procedure[];
  excluded: { proc: Procedure; reason: string }[];
  /** The owning role as a token, e.g. "{{qualityLead}}". */
  owner: string;
}

type Body = (c: TemplateCtx) => string;

const roleLines = (c: TemplateCtx) =>
  [
    '- Top management: {{ceo}}',
    '- Management representative: {{mgmtRep}}',
    '- Quality: {{qualityLead}}',
    '- Engineering: {{engLead}}',
    '- Operations: {{opsLead}}',
    '- Regulatory: {{regLead}}',
    c.d.ai !== false && '- Machine learning: {{mlLead}}',
    c.d.connected !== false && '- Security: {{secLead}}',
  ]
    .filter(Boolean)
    .join('\n');

export const CONTENT: Record<string, (Body | undefined)[]> = {
  'QM-001': [
    () =>
      '{{company}}, {{address}}, designs and develops {{device}}, a {{deviceType}}.\n\nThe quality system covers design and development, purchasing, production and release, labeling, distribution, complaint handling and post-market activities for this device. Manufacturing: {{manufacturer}}.',
    () =>
      'This manual uses the terms of the Quality Management System Regulation (QMSR, 21 CFR 820) and ISO 13485:2016:\n\n- Medical Device File (MDF): replaces the device master record\n- Design and development file: replaces the design history file (DHF)\n- Production record: replaces the device history record (DHR)\n\nLegacy DHF, DMR and DHR references in older records are declared synonyms.',
    (c) => {
      const lines = c.excluded.map((e) => `- ${e.proc.id} ${e.proc.title}: ${e.reason}`);
      return (
        'Design controls: {{designControls}}.\n\n' +
        (lines.length
          ? `The following procedures are not applicable to {{device}}, with justification:\n\n${lines.join('\n')}`
          : 'No ISO 13485 clauses are excluded or marked not applicable.')
      );
    },
    () =>
      '{{company}} is committed to providing {{device}} that is safe and effective for {{users}}, to meeting applicable regulatory requirements, and to maintaining the effectiveness of the quality management system.\n\nSigned for top management: {{ceo}}.',
    () =>
      'Risk acceptability criteria are based on applicable standards, the generally acknowledged state of the art, and the benefit to the intended patient population: {{indications}}\n\nThe criteria are defined in SOP-003 and reviewed at each management review.',
    () =>
      'Proposed objectives, confirmed at the first management review:\n\n- Zero released records without the required signatures\n- All CAPAs closed within their risk-based target, or with an approved extension\n- 100% of design inputs traced to verification before design freeze\n- Training on revised procedures completed before the effective date',
    roleLines,
    () =>
      '- Manufacturing: {{manufacturer}}\n- Critical suppliers: {{suppliers}}\n- QMS and records tools: {{qmsTools}}\n\nEach outsourced process is controlled under SOP-004 with a quality agreement.',
    (c) =>
      'Released procedures that make up the quality system for {{device}}:\n\n' +
      c.applicable.map((p) => `- ${p.id} ${p.title}`).join('\n'),
    () => 'Management review is held at least every 12 months, chaired by {{ceo}}, under SOP-012.',
  ],

  'SOP-002': [
    () => 'Applies to {{device}} and every design change to it. Determination: {{designControls}}.',
    () =>
      'Phases: gate zero, planning, design inputs, design outputs, design freeze, verification, validation, design transfer and release.\n\nRegulatory pathway: {{pathway}}. Target submission: {{targetSubmission}}.',
    () =>
      'Each gate ends with a design review attended by {{engLead}}, {{qualityLead}} and an individual without direct responsibility for the stage being reviewed.',
    () => 'Essential design outputs are flagged in DHF-T3 and listed in the Medical Device File for {{device}}.',
    () =>
      'Verification and validation use protocols approved before testing, with a sample-size rationale under WI-002. Validation is performed with {{users}} in {{environment}}, or a simulation of it.',
    () =>
      'Every change is reviewed for its effect on risk, verification, labeling and the marketing authorization. Changes are assessed against {{predicate}} using FDA guidance on deciding when to submit a new 510(k).',
    () => 'One design and development file is kept for {{device}}, indexed in DHF-T1.',
  ],

  'SOP-003': [
    () =>
      'Applies to {{device}} across its lifecycle. Intended use: {{intendedUse}}\n\nOne risk management file is kept, owned by {{qualityLead}} with {{engLead}}.',
    undefined,
    (c) =>
      'Severity is rated S1 (negligible) to S5 (catastrophic). Probability is P1 × P2: the probability that a hazardous situation occurs, times the probability that it leads to harm.' +
      (c.d.hasSoftware !== false
        ? '\n\nSoftware failure probability cannot be estimated, so P1 = 1 for software failures. Worst credible harm from a software failure: {{worstHarm}}.'
        : ''),
  ],

  'SOP-004': [
    () =>
      'Applies to all suppliers to {{company}} that can affect {{device}}, including:\n\n- Manufacturing: {{manufacturer}}\n- Critical suppliers: {{suppliers}}',
    () =>
      'Critical suppliers (direct effect on safety or performance) are qualified by audit or questionnaire and sign a quality agreement before first use. Proposed critical suppliers: {{manufacturer}}; {{suppliers}}.',
  ],

  'SOP-005': [
    () => 'Applies to every employee and contractor of {{company}} performing work that affects {{device}}.',
    undefined,
    roleLines,
  ],

  'SOP-008': [
    () => 'Applies to production and release of {{device}}. Manufacturing: {{manufacturer}}.',
    undefined,
    () => 'Each lot or release is released by {{qualityLead}} after the production record is complete.',
    () => 'Software release records come from {{devTools}} and include the build ID, commit, SBOM and test results.',
  ],

  'SOP-010': [() => 'One Medical Device File is kept for {{device}} ({{deviceClass}}, product code {{productCode}}).'],

  'SOP-012': [() => 'Chair: {{ceo}}. Quorum: {{mgmtRep}} and {{qualityLead}}, plus each input owner.'],

  'SOP-013': [
    () => 'Applies to all labeling for {{device}}, including in-software labeling and the instructions for use.',
    () => 'Labeling is approved by {{regLead}} and checked against the cleared indications: {{indications}}',
    () => 'UDI-DIs are assigned per version of {{device}} and entered in GUDID under product code {{productCode}}.',
  ],

  'SOP-014': [
    () => 'Applies to every tool that creates or holds quality records: {{qmsTools}}; {{devTools}}.',
    () => 'Initial inventory: {{qmsTools}}; {{devTools}}. Each entry records the intended use of the features used.',
  ],

  'SOP-016': [() => 'Complaints about {{device}} are received from {{users}} through every channel, including pilot sites.'],

  'SOP-018': [
    () =>
      '{{company}} registers its establishment and lists {{device}}: {{deviceClass}}, product code {{productCode}}, {{regulation}}.',
  ],

  'SW-SOP-001': [
    () => 'Applies to all software in {{device}}: {{platforms}}.',
    () =>
      'Software safety class: {{safetyClass}}, based on worst credible harm from a software failure ({{worstHarm}}) before external risk controls.',
    undefined,
    () => 'Development runs in {{devTools}}. Plan, requirements, architecture and tests are linked in the trace graph.',
    undefined,
    () => 'FDA documentation level: {{docLevel}}. Each premarket element maps to an S-record in S1–S8.',
  ],

  'SW-SOP-002': [
    () => 'Applies to {{device}}. Determination: {{cyberStatus}}.',
    () => 'Architecture views cover {{platforms}}. Threat modeling uses STRIDE and links threats to hazards in SOP-003.',
    () => 'A machine-readable SBOM is generated from {{devTools}} for every release.',
    undefined,
    () => 'Security lead: {{secLead}}. Coordinated vulnerability disclosure contact: [security contact email].',
  ],

  'SW-SOP-003': [
    () =>
      'Applies to {{device}}: {{aiStatus}}. Model update approach: {{modelUpdates}}. Third-party or foundation models: {{thirdPartyModel}}.',
    () => 'Datasets are partitioned at the patient level; the test set is sequestered and accessed only under an approved protocol. Data owner: {{mlLead}}.',
    () => 'Endpoints and subgroups are pre-specified for {{indications}}',
    undefined,
    undefined,
    () => 'PCCP decision: {{pccpStatus}}.',
    () => 'Field performance is monitored by {{mlLead}} with drift thresholds set in the S6 model card.',
  ],

  'S1–S8': [
    () => 'Software development plan for {{device}}: {{platforms}}. Tools: {{devTools}}. Safety class {{safetyClass}}.',
    undefined,
    undefined,
    () =>
      '- Device status: {{deviceType}}\n- Classification: {{deviceClass}}, product code {{productCode}}, {{regulation}}\n- Pathway: {{pathway}}; predicate {{predicate}}\n- Design controls: {{designControls}}\n- Cybersecurity: {{cyberStatus}}\n- AI: {{aiStatus}}; {{pccpStatus}}\n- Documentation level: {{docLevel}}; IEC 62304 {{safetyClass}}',
  ],

  'DHF-T1–7': [
    () =>
      'Design and development plan for {{device}}. Pathway: {{pathway}}; target submission {{targetSubmission}}. Design lead: {{engLead}}.',
    () => 'User needs are collected from {{users}} in {{environment}}.',
  ],
};
