import type { Intake, StepId } from './model';

/* ------------------------------------------------------------------ */
/* Determinations the agents draft from the intake (Gate zero).        */
/* ------------------------------------------------------------------ */

export interface Derived {
  hasSoftware: boolean | null;
  hasHardware: boolean | null;
  connected: boolean | null;
  ai: boolean | null;
  designControls: boolean | null;
  safetyClass: 'A' | 'B' | 'C' | null;
  docLevel: 'Basic' | 'Enhanced' | null;
}

const yn = (v: string) => (v === 'yes' ? true : v === 'no' ? false : null);

export function derive(ix: Intake): Derived {
  const hasSoftware = yn(ix.tech.software);
  const cls = ix.regulatory.deviceClass;
  let designControls: boolean | null = null;
  if (cls === 'II' || cls === 'III') designControls = true;
  else if (cls === 'I') designControls = hasSoftware === null ? null : hasSoftware;

  const harm = ix.tech.worstHarm;
  const safetyClass = !harm ? null : harm === 'none' ? 'A' : harm === 'non-serious' ? 'B' : 'C';
  let docLevel: Derived['docLevel'] = null;
  if (cls === 'III' || harm === 'serious' || harm === 'death') docLevel = 'Enhanced';
  else if (harm) docLevel = 'Basic';

  return {
    hasSoftware,
    hasHardware: yn(ix.tech.hardware),
    connected: yn(ix.tech.connected),
    ai: yn(ix.tech.ai),
    designControls,
    safetyClass: hasSoftware === false ? null : safetyClass,
    docLevel: hasSoftware === false ? null : docLevel,
  };
}

/* ------------------------------------------------------------------ */
/* Tokens: the named values templates fill in.                         */
/* ------------------------------------------------------------------ */

export interface TokenDef {
  label: string;
  step: StepId;
  /** Form field id the "needs input" link focuses. */
  field: string;
}

export const TOKENS = {
  company: { label: 'Company name', step: 'company', field: 'company.name' },
  address: { label: 'Company address', step: 'company', field: 'company.address' },
  device: { label: 'Device name', step: 'device', field: 'device.name' },
  intendedUse: { label: 'Intended use', step: 'device', field: 'device.intendedUse' },
  indications: { label: 'Indications for use', step: 'device', field: 'device.indications' },
  users: { label: 'Intended users', step: 'device', field: 'device.users' },
  environment: { label: 'Use environment', step: 'device', field: 'device.environment' },
  lifetime: { label: 'Expected device lifetime', step: 'device', field: 'device.lifetime' },
  patientContact: { label: 'Patient contact', step: 'device', field: 'device.patientContact' },
  sterility: { label: 'Sterility', step: 'device', field: 'device.sterile' },
  shelfLife: { label: 'Shelf life', step: 'device', field: 'device.shelfLife' },
  deviceType: { label: 'Device type', step: 'technology', field: 'tech.software' },
  platforms: { label: 'Software platforms', step: 'technology', field: 'tech.platforms' },
  worstHarm: { label: 'Worst harm from a software failure', step: 'technology', field: 'tech.worstHarm' },
  safetyClass: { label: 'IEC 62304 safety class', step: 'technology', field: 'tech.worstHarm' },
  docLevel: { label: 'FDA documentation level', step: 'technology', field: 'tech.worstHarm' },
  cyberStatus: { label: 'Cyber device determination', step: 'technology', field: 'tech.connected' },
  aiStatus: { label: 'AI determination', step: 'technology', field: 'tech.ai' },
  modelUpdates: { label: 'Model update approach', step: 'technology', field: 'tech.modelUpdates' },
  pccpStatus: { label: 'PCCP decision', step: 'technology', field: 'tech.pccp' },
  thirdPartyModel: { label: 'Third-party or foundation models', step: 'technology', field: 'tech.thirdPartyModel' },
  deviceClass: { label: 'Device class', step: 'regulatory', field: 'regulatory.deviceClass' },
  productCode: { label: 'Product code', step: 'regulatory', field: 'regulatory.productCode' },
  regulation: { label: 'Regulation number', step: 'regulatory', field: 'regulatory.regulation' },
  pathway: { label: 'Regulatory pathway', step: 'regulatory', field: 'regulatory.pathway' },
  predicate: { label: 'Predicate device', step: 'regulatory', field: 'regulatory.predicate' },
  targetSubmission: { label: 'Target submission date', step: 'regulatory', field: 'regulatory.targetSubmission' },
  designControls: { label: 'Design controls determination', step: 'regulatory', field: 'regulatory.deviceClass' },
  manufacturer: { label: 'Manufacturer', step: 'operations', field: 'operations.manufacturing' },
  suppliers: { label: 'Critical suppliers', step: 'operations', field: 'operations.suppliers' },
  qmsTools: { label: 'QMS tools', step: 'operations', field: 'operations.qmsTools' },
  devTools: { label: 'Development tools', step: 'operations', field: 'operations.devTools' },
  equipment: { label: 'Test and measuring equipment', step: 'operations', field: 'operations.equipment' },
  labeling: { label: 'Labeling format', step: 'operations', field: 'operations.labeling' },
  udiAgency: { label: 'UDI issuing agency', step: 'operations', field: 'operations.udiAgency' },
  docSystem: { label: 'Document control system', step: 'quality', field: 'qms.docSystem' },
  siteUrl: { label: 'Document system location', step: 'quality', field: 'qms.siteUrl' },
  eSignature: { label: 'Electronic signature method', step: 'quality', field: 'qms.eSignature' },
  retention: { label: 'Record retention period', step: 'quality', field: 'qms.retention' },
  trainingWindow: { label: 'Training window', step: 'quality', field: 'qms.trainingDays' },
  capaTargets: { label: 'CAPA timing targets', step: 'quality', field: 'qms.capaTargets' },
  auditFrequency: { label: 'Internal audit frequency', step: 'quality', field: 'qms.auditFrequency' },
  reviewFrequency: { label: 'Management review frequency', step: 'quality', field: 'qms.reviewFrequency' },
  complaintChannels: { label: 'Complaint channels', step: 'quality', field: 'qms.complaintChannels' },
  ceo: { label: 'CEO / top management', step: 'team', field: 'team.ceo' },
  mgmtRep: { label: 'Management representative', step: 'team', field: 'team.managementRep' },
  qualityLead: { label: 'Quality lead', step: 'team', field: 'team.quality' },
  engLead: { label: 'Engineering lead', step: 'team', field: 'team.engineering' },
  opsLead: { label: 'Operations lead', step: 'team', field: 'team.operations' },
  regLead: { label: 'Regulatory lead', step: 'team', field: 'team.regulatory' },
  mlLead: { label: 'ML lead', step: 'team', field: 'team.ml' },
  secLead: { label: 'Security lead', step: 'team', field: 'team.security' },
} satisfies Record<string, TokenDef>;

export type TokenKey = keyof typeof TOKENS;

export interface TokenValue {
  value: string;
  /** True when the value was derived or defaulted rather than typed by the customer. */
  auto: boolean;
  /** A derived value the customer has confirmed (see IntakeContext). */
  confirmed?: boolean;
}

export type TokenValues = Partial<Record<TokenKey, TokenValue>>;

const PATHWAY_LABEL: Record<string, string> = {
  '510k': 'Traditional 510(k)',
  'de-novo': 'De Novo classification request',
  pma: 'Premarket approval (PMA)',
  exempt: '510(k)-exempt',
};

const HARM_LABEL: Record<string, string> = {
  none: 'no injury possible',
  'non-serious': 'non-serious injury',
  serious: 'serious injury',
  death: 'death',
};

export function resolveTokens(ix: Intake, d: Derived): TokenValues {
  const out: TokenValues = {};
  const typed = (k: TokenKey, v: string) => {
    if (v.trim()) out[k] = { value: v.trim(), auto: false };
  };
  const auto = (k: TokenKey, v: string | null | undefined) => {
    if (v && v.trim()) out[k] = { value: v.trim(), auto: true };
  };

  typed('company', ix.company.name);
  typed('address', ix.company.address);
  typed('device', ix.device.name);
  typed('intendedUse', ix.device.intendedUse);
  typed('indications', ix.device.indications);
  typed('users', ix.device.users);
  typed('environment', ix.device.environment);
  typed('platforms', ix.tech.platforms);
  typed('productCode', ix.regulatory.productCode);
  typed('regulation', ix.regulatory.regulation);
  typed('predicate', ix.regulatory.predicate);
  typed('targetSubmission', ix.regulatory.targetSubmission);
  typed('suppliers', ix.operations.suppliers);
  typed('qmsTools', ix.operations.qmsTools);
  typed('devTools', ix.operations.devTools);
  typed('thirdPartyModel', ix.tech.thirdPartyModel);

  if (ix.regulatory.deviceClass) out.deviceClass = { value: `Class ${ix.regulatory.deviceClass}`, auto: false };
  if (ix.regulatory.pathway) out.pathway = { value: PATHWAY_LABEL[ix.regulatory.pathway], auto: false };
  if (ix.tech.worstHarm) out.worstHarm = { value: HARM_LABEL[ix.tech.worstHarm], auto: false };
  if (ix.tech.modelUpdates)
    out.modelUpdates = {
      value: ix.tech.modelUpdates === 'locked' ? 'locked model, changed only by new release' : 'model retrained on new data under change control',
      auto: false,
    };

  // Device type from hardware / software answers.
  if (d.hasSoftware !== null && d.hasHardware !== null) {
    auto(
      'deviceType',
      d.hasHardware && d.hasSoftware
        ? 'hardware device with device software functions'
        : d.hasSoftware
          ? 'software as a medical device (SaMD)'
          : 'hardware device without software',
    );
  }

  if (d.safetyClass) auto('safetyClass', `Class ${d.safetyClass} (proposed)`);
  if (d.docLevel) auto('docLevel', `${d.docLevel} documentation (proposed)`);

  if (d.designControls !== null) {
    auto(
      'designControls',
      d.designControls
        ? ix.regulatory.deviceClass === 'I'
          ? 'design controls apply (software-automated Class I device, 21 CFR 820.10(c))'
          : `design controls apply (Class ${ix.regulatory.deviceClass} device)`
        : 'design controls do not apply (Class I device without software); confirm exemption',
    );
  }

  if (d.connected !== null && d.hasSoftware !== null) {
    auto(
      'cyberStatus',
      d.connected && d.hasSoftware
        ? 'cyber device under section 524B (includes software and can connect to networks)'
        : 'not a cyber device under section 524B',
    );
  }

  if (d.ai !== null) {
    auto('aiStatus', d.ai ? 'AI-enabled device software function' : 'no AI-enabled device software functions');
    if (!d.ai) auto('thirdPartyModel', 'Not applicable');
  }

  if (d.ai === false) auto('pccpStatus', 'not applicable (no AI-enabled functions)');
  else if (ix.tech.pccp === 'yes') auto('pccpStatus', 'a PCCP will be included in the marketing submission');
  else if (ix.tech.pccp === 'no') auto('pccpStatus', 'no PCCP planned; each model change is assessed for a new submission');

  if (ix.operations.manufacturing === 'in-house' && ix.company.name) auto('manufacturer', `${ix.company.name} (in-house)`);
  else if (ix.operations.manufacturing === 'contract') typed('manufacturer', ix.operations.contractManufacturer);
  else if (ix.operations.manufacturing === 'none')
    auto('manufacturer', 'no physical manufacturing; software is released under SOP-008');

  // Device characteristics
  typed('lifetime', ix.device.lifetime);
  typed('shelfLife', ix.device.shelfLife);
  const CONTACT: Record<string, string> = {
    none: 'no patient contact; biocompatibility does not apply',
    surface: 'surface contact with intact skin; biocompatibility evaluated under ISO 10993-1',
    external: 'externally communicating; biocompatibility evaluated under ISO 10993-1',
    implant: 'implanted; biocompatibility evaluated under ISO 10993-1',
  };
  if (ix.device.patientContact) out.patientContact = { value: CONTACT[ix.device.patientContact], auto: false };
  else if (d.hasHardware === false) auto('patientContact', CONTACT.none);
  if (ix.device.sterile === 'yes')
    out.sterility = { value: 'supplied sterile; the sterilization process is validated under SOP-009', auto: false };
  else if (ix.device.sterile === 'no') out.sterility = { value: 'supplied non-sterile', auto: false };
  else if (d.hasHardware === false) auto('sterility', 'not applicable (software only)');

  // Operations
  typed('equipment', ix.operations.equipment);
  const LABELING: Record<string, string> = {
    paper: 'printed labels and instructions for use',
    eifu: 'printed device and package labels, with electronic instructions for use',
    software: 'labeling displayed in the software (about screen, help and instructions for use)',
  };
  if (ix.operations.labeling) out.labeling = { value: LABELING[ix.operations.labeling], auto: false };
  else if (d.hasHardware === false && d.hasSoftware) auto('labeling', LABELING.software);
  if (ix.operations.udiAgency) out.udiAgency = { value: ix.operations.udiAgency, auto: false };
  else auto('udiAgency', 'GS1 (proposed)');

  // Quality system: answers, else common defaults marked as proposals
  const DOCSYS: Record<string, string> = {
    sharepoint: 'a Microsoft SharePoint document library with version history',
    google: 'Google Drive shared drives with version history',
    eqms: 'a validated eQMS',
    other: 'the document system listed in the software register',
  };
  if (ix.qms.docSystem) out.docSystem = { value: DOCSYS[ix.qms.docSystem], auto: false };
  else if (/sharepoint|microsoft 365|office 365|m365|onedrive/i.test(ix.operations.qmsTools)) auto('docSystem', DOCSYS.sharepoint);
  else if (/google/i.test(ix.operations.qmsTools)) auto('docSystem', DOCSYS.google);
  typed('siteUrl', ix.qms.siteUrl);

  const ESIG: Record<string, string> = {
    biomedix: 'Part 11 electronic signatures in the Biomedix platform',
    docusign: 'DocuSign with its Part 11 module',
    adobe: 'Adobe Acrobat Sign with Part 11 controls enabled',
    'wet-ink': 'handwritten signatures on the printed copy, scanned into the record',
  };
  if (ix.qms.eSignature) out.eSignature = { value: ESIG[ix.qms.eSignature], auto: false };

  const lifetime = ix.device.lifetime.trim();
  const RETENTION: Record<string, string> = {
    'lifetime-2': `the lifetime of the device${lifetime ? ` (${lifetime})` : ''}, and not less than 2 years from release`,
    '10': '10 years from release of the last device or version',
    '15': '15 years from release of the last device or version',
  };
  if (ix.qms.retention) out.retention = { value: RETENTION[ix.qms.retention], auto: false };
  else auto('retention', RETENTION['lifetime-2']);

  const days = ix.qms.trainingDays.trim();
  if (days) out.trainingWindow = { value: `${days.replace(/\s*days?$/i, '')} days`, auto: false };
  else auto('trainingWindow', '30 days (proposed)');

  const CAPA: Record<string, string> = {
    standard: 'high risk 30 days, medium 60 days, low 90 days',
    fast: 'high risk 15 days, medium 30 days, low 60 days',
  };
  if (ix.qms.capaTargets) out.capaTargets = { value: CAPA[ix.qms.capaTargets], auto: false };
  else auto('capaTargets', `${CAPA.standard} (proposed)`);

  const FREQ: Record<string, string> = { annual: 'every 12 months', semiannual: 'every 6 months', quarterly: 'every quarter' };
  if (ix.qms.auditFrequency) out.auditFrequency = { value: FREQ[ix.qms.auditFrequency], auto: false };
  else auto('auditFrequency', 'every 12 months (proposed)');
  if (ix.qms.reviewFrequency) out.reviewFrequency = { value: FREQ[ix.qms.reviewFrequency], auto: false };
  else auto('reviewFrequency', 'every 12 months (proposed)');
  typed('complaintChannels', ix.qms.complaintChannels);

  // People, with sensible fallbacks marked as auto so they get confirmed.
  typed('ceo', ix.team.ceo);
  typed('mgmtRep', ix.team.managementRep);
  if (!out.mgmtRep && ix.team.ceo) auto('mgmtRep', ix.team.ceo);
  typed('qualityLead', ix.team.quality);
  if (!out.qualityLead && out.mgmtRep) auto('qualityLead', out.mgmtRep.value);
  typed('engLead', ix.team.engineering);
  typed('opsLead', ix.team.operations);
  if (!out.opsLead && ix.team.engineering) auto('opsLead', ix.team.engineering);
  typed('regLead', ix.team.regulatory);
  if (!out.regLead && out.qualityLead) auto('regLead', out.qualityLead.value);
  typed('mlLead', ix.team.ml);
  typed('secLead', ix.team.security);
  if (!out.secLead && ix.team.engineering) auto('secLead', ix.team.engineering);

  return out;
}

/* ------------------------------------------------------------------ */
/* Read the free-text description for hints.                            */
/* ------------------------------------------------------------------ */

export interface Detection {
  field: 'hardware' | 'software' | 'connected' | 'ai';
  label: string;
  evidence: string;
}

const PATTERNS: { field: Detection['field']; label: string; re: RegExp }[] = [
  { field: 'software', label: 'Includes software', re: /\b(software|app|application|algorithm|firmware|cloud|portal|platform|saas)\b/i },
  { field: 'hardware', label: 'Includes hardware', re: /\b(patch|wearable|sensor|electrode|implant|catheter|device housing|hardware|probe|cuff|monitor|pump)\b/i },
  { field: 'connected', label: 'Connects to networks', re: /\b(bluetooth|wi-?fi|wireless|cloud|internet|network|streams?|upload|portal|api)\b/i },
  { field: 'ai', label: 'Uses AI or machine learning', re: /\b(ai|a\.i\.|machine learning|ml|deep learning|neural|model|computer vision|llm)\b/i },
];

export function detectFromDescription(text: string): Detection[] {
  if (!text.trim()) return [];
  const found: Detection[] = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) found.push({ field: p.field, label: p.label, evidence: m[0] });
  }
  return found;
}

/** A first draft of the intended use statement from the other device answers. */
export function draftIntendedUse(ix: Intake): string {
  const name = ix.device.name || '[Device name]';
  const firstSentence = ix.device.description.split(/(?<=\.)\s/)[0]?.replace(/\.$/, '') ?? '';
  const what = firstSentence
    ? firstSentence.replace(/^(a|an|the)\s+/i, '').replace(/^(our|this)\s+/i, '')
    : '[what the device does]';
  const users = ix.device.users ? ` by ${ix.device.users.toLowerCase()}` : '';
  const env = ix.device.environment ? ` in ${ix.device.environment.toLowerCase()}` : '';
  return `${name} is intended for use${users}${env}. It is ${/^[aeiou]/i.test(what) ? 'an' : 'a'} ${what}. [Clinical purpose: diagnose, monitor, treat or inform]`;
}
