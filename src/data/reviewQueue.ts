export type ReviewStep = 'review' | 'approval' | 'returned';
export type CheckResult = 'pass' | 'gap' | 'note';

export interface ReviewItem {
  key: string;
  agent: string;
  age: string;
  step: ReviewStep;
  ref: string;
  title: string;
  summary: string;
  fields: [label: string, value: string][];
  reasoning: string;
  sources: string[];
  checks: [result: CheckResult, label: string][];
}

export const STEP_FILTERS: { step: ReviewStep; label: string }[] = [
  { step: 'review', label: 'Biomedix review' },
  { step: 'approval', label: 'Your approval' },
  { step: 'returned', label: 'Returned' },
];

export const STEP_LABEL: Record<ReviewStep, string> = {
  review: 'Waiting on Biomedix technical review',
  approval: 'Reviewed · waiting on your approval',
  returned: 'Returned to agent with comments',
};

export const CHECK_LABEL: Record<CheckResult, string> = {
  pass: 'Pass',
  gap: 'Gap',
  note: 'Human',
};

export const REVIEW_ITEMS: ReviewItem[] = [
  {
    key: 'haz',
    agent: 'Risk agent',
    age: '2 h ago',
    step: 'review',
    ref: 'HAZ-014 · RMF-ECG-004',
    title: 'Delayed arrhythmia alert leads to delayed treatment',
    summary:
      'New hazard drafted from the device description and the alert service architecture, linked to an existing risk control.',
    fields: [
      ['Hazard', 'Loss or delay of alert data'],
      ['Sequence', 'Phone OS suspends the app; alert queued but not pushed'],
      ['Hazardous situation', 'Clinician unaware of a sustained arrhythmia'],
      ['Harm', 'Delayed treatment'],
      ['Severity', 'S4 proposed · human decision'],
      ['P1 × P2', 'P1 = 1 (software); P2 = P3 proposed'],
      ['Risk control', 'RC-007 watchdog re-sends unacknowledged alerts'],
      ['Residual risk', 'Not evaluated: control not verified'],
    ],
    reasoning:
      'Software failure probability cannot be estimated, so P1 is set to 1 per SOP-003. Severity is proposed from the intended use but left for a person to confirm.',
    sources: ['SOP-003 §3', 'ISO 14971 5.4–5.5', 'SRS-031', 'S3 architecture v0.6'],
    checks: [
      ['pass', 'Hazard, situation and harm all present'],
      ['pass', 'Linked to a software requirement'],
      ['gap', 'RC-007 has no verification of effectiveness'],
      ['note', 'Severity needs human confirmation'],
    ],
  },
  {
    key: 'di',
    agent: 'Design controls agent',
    age: '5 h ago',
    step: 'review',
    ref: 'DI-012 · DHF-ECG-003',
    title: 'Alert latency at most 60 s at the 95th percentile',
    summary: 'Design input derived from user need UN-004 with a proposed acceptance criterion and test method.',
    fields: [
      ['User need', 'UN-004 Clinician sees an arrhythmia alert within 60 s'],
      ['Requirement', 'End-to-end alert latency ≤ 60 s, 95th percentile'],
      ['Type', 'Performance'],
      ['Acceptance', '≥ 95% of 300 simulated events within 60 s'],
      ['Method', 'Test on the released build'],
      ['Essential output', 'Yes, proposed'],
    ],
    reasoning:
      'The user need is not testable as written. The agent proposed a measurable latency and a sample size; the confidence level behind 300 events should be confirmed.',
    sources: ['SOP-002 §2', 'DHF-T3', 'WI-002 statistics'],
    checks: [
      ['pass', 'Input is testable'],
      ['pass', 'Traces to a user need'],
      ['note', 'Sample-size rationale needs review'],
    ],
  },
  {
    key: 'chg',
    agent: 'Change agent',
    age: 'Yesterday',
    step: 'review',
    ref: 'CR-0031',
    title: 'Retrained arrhythmia model v1.4 on new site data',
    summary: 'Change impact and regulatory assessment drafted for a model retraining.',
    fields: [
      ['Change', 'Model weights retrained with Site C data'],
      ['Downstream items', '7 tests to re-run, model card, labeling performance table'],
      ['Inside PCCP?', 'Yes, proposed: within description of modifications M-2'],
      ['Path', 'Implement under PCCP; no new submission'],
      ['Subgroups', 'Re-evaluation required for all 6 pre-specified subgroups'],
    ],
    reasoning:
      'The change matches modification M-2 (retraining on new data, same architecture and inputs). The PCCP protocol requires the full subgroup evaluation before release.',
    sources: ['SW-SOP-003 §5', 'S7 PCCP M-2', 'FDA PCCP guidance (Aug 2025)'],
    checks: [
      ['pass', 'All downstream items identified'],
      ['note', 'Regulatory path is a human decision'],
      ['gap', 'Subgroup results not attached yet'],
    ],
  },
  {
    key: 'capa',
    agent: 'CAPA agent',
    age: 'Yesterday',
    step: 'approval',
    ref: 'CAPA-2026-004',
    title: 'Repeat electrode adhesion failures in wear testing',
    summary:
      'Opened from a trend trigger: 3 related nonconformances in 90 days. Reviewed by Biomedix; awaiting your approval.',
    fields: [
      ['Trigger', 'NC-2026-011, -014, -019 within 90 days'],
      ['Problem statement', 'Adhesive lift at 48–72 h in 3 of 20 test subjects'],
      ['Containment', 'Hold lot L-0921'],
      ['Effectiveness check', 'Zero lift events in the next 40 wear-days'],
    ],
    reasoning:
      'Three nonconformances with the same failure mode crossed the CAPA trigger in SOP-007. Root cause is left open for the team.',
    sources: ['SOP-007 §2', 'NC-2026-011', 'NC-2026-019'],
    checks: [
      ['pass', 'Trigger criteria met'],
      ['pass', 'Biomedix technical review signed'],
      ['note', 'Root cause still open'],
    ],
  },
  {
    key: 'sbom',
    agent: 'Submission agent',
    age: '3 days ago',
    step: 'returned',
    ref: 'S8 · SBOM v2.3.1',
    title: 'SBOM and support status for release 2.3.1',
    summary: 'Returned by the Biomedix reviewer: two components missing end-of-support dates.',
    fields: [
      ['Components', '142'],
      ['Known CVEs', '1 medium, controlled'],
      ['Missing data', 'End-of-support for 2 components'],
      ['Reviewer comment', 'Add supplier support dates before resubmitting'],
    ],
    reasoning: 'Generated from the build pipeline and matched against vulnerability feeds.',
    sources: ['SW-SOP-002 §3', 'Build 2.3.1'],
    checks: [
      ['pass', 'Machine-readable format'],
      ['gap', 'Support status incomplete'],
    ],
  },
];
