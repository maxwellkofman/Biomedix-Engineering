/** Everything the customer tells us during setup. All values are strings so the form stays simple. */

export type YesNo = 'yes' | 'no' | '';

export interface Intake {
  company: { name: string; address: string; stage: string; employees: string };
  device: {
    name: string;
    description: string;
    intendedUse: string;
    indications: string;
    users: string;
    environment: string;
  };
  tech: {
    hardware: YesNo;
    software: YesNo;
    platforms: string;
    connected: YesNo;
    ai: YesNo;
    modelUpdates: '' | 'locked' | 'retrained';
    pccp: YesNo;
    thirdPartyModel: string;
    worstHarm: '' | 'none' | 'non-serious' | 'serious' | 'death';
  };
  regulatory: {
    deviceClass: '' | 'I' | 'II' | 'III';
    productCode: string;
    regulation: string;
    pathway: '' | '510k' | 'de-novo' | 'pma' | 'exempt';
    predicate: string;
    targetSubmission: string;
  };
  operations: {
    manufacturing: '' | 'in-house' | 'contract' | 'none';
    contractManufacturer: string;
    suppliers: string;
    qmsTools: string;
    devTools: string;
  };
  team: {
    ceo: string;
    managementRep: string;
    quality: string;
    engineering: string;
    operations: string;
    regulatory: string;
    ml: string;
    security: string;
  };
}

export type IntakeSection = keyof Intake;

export const EMPTY_INTAKE: Intake = {
  company: { name: '', address: '', stage: '', employees: '' },
  device: { name: '', description: '', intendedUse: '', indications: '', users: '', environment: '' },
  tech: {
    hardware: '',
    software: '',
    platforms: '',
    connected: '',
    ai: '',
    modelUpdates: '',
    pccp: '',
    thirdPartyModel: '',
    worstHarm: '',
  },
  regulatory: { deviceClass: '', productCode: '', regulation: '', pathway: '', predicate: '', targetSubmission: '' },
  operations: { manufacturing: '', contractManufacturer: '', suppliers: '', qmsTools: '', devTools: '' },
  team: { ceo: '', managementRep: '', quality: '', engineering: '', operations: '', regulatory: '', ml: '', security: '' },
};

/**
 * A filled-in example for demos. Classification values are illustrative only:
 * the customer confirms them against FDA's product classification database.
 */
export const EXAMPLE_INTAKE: Intake = {
  company: { name: 'Example Cardio, Inc.', address: '100 Example Street, Boston, MA 02110', stage: 'Seed', employees: '12' },
  device: {
    name: 'Example ECG Patch',
    description:
      'A wearable single-lead ECG patch that streams to a phone app over Bluetooth. A machine learning model in our cloud service detects atrial fibrillation and other sustained arrhythmias and alerts the prescribing clinician through a web portal.',
    intendedUse:
      'Example ECG Patch is intended to record, store and transmit single-lead ECG data and to detect and alert on sustained arrhythmias for review by a clinician.',
    indications:
      'Adult patients who are candidates for ambulatory ECG monitoring for up to 14 days, as prescribed by a physician.',
    users: 'Prescribing clinicians and cardiac technicians; patients apply and wear the patch',
    environment: 'Home use and outpatient clinics',
  },
  tech: {
    hardware: 'yes',
    software: 'yes',
    platforms: 'Patch firmware, iOS and Android apps, AWS cloud service, clinician web portal',
    connected: 'yes',
    ai: 'yes',
    modelUpdates: 'retrained',
    pccp: 'yes',
    thirdPartyModel: 'None',
    worstHarm: 'serious',
  },
  regulatory: {
    deviceClass: 'II',
    productCode: 'DSI',
    regulation: '21 CFR 870.1025',
    pathway: '510k',
    predicate: '[Predicate device and 510(k) number]',
    targetSubmission: '2027-09-30',
  },
  operations: {
    manufacturing: 'contract',
    contractManufacturer: 'Example Contract Manufacturing, LLC',
    suppliers: 'Electrode and adhesive supplier, AWS (cloud hosting), ECG annotation vendor',
    qmsTools: 'Google Workspace, Jira',
    devTools: 'GitHub, GitHub Actions, Jira',
  },
  team: {
    ceo: 'Alex Rivera, CEO',
    managementRep: '',
    quality: 'Jordan Lee, Head of Quality',
    engineering: 'Sam Patel, CTO',
    operations: '',
    regulatory: '',
    ml: 'Priya Shah, ML Lead',
    security: '',
  },
};

export type StepId = 'company' | 'device' | 'technology' | 'regulatory' | 'operations' | 'team';

export const STEPS: { id: StepId; label: string; blurb: string }[] = [
  { id: 'company', label: 'Company', blurb: 'Who is legally responsible for the device' },
  { id: 'device', label: 'Device', blurb: 'What it is, who uses it and where' },
  { id: 'technology', label: 'Technology', blurb: 'Hardware, software, connectivity and AI' },
  { id: 'regulatory', label: 'Regulatory', blurb: 'Classification and pathway' },
  { id: 'operations', label: 'Operations', blurb: 'Manufacturing, suppliers and tools' },
  { id: 'team', label: 'Team', blurb: 'Who owns, reviews and approves' },
];
