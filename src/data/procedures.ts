export type TierKey = 't1' | 't2' | 't3' | 'sw';

export interface ProcedureSection {
  /** Section title */
  t: string;
  /** One-line description */
  d: string;
}

export interface Procedure {
  g: TierKey;
  id: string;
  title: string;
  basis: string;
  owner: string;
  when: string;
  summary: string;
  planned?: boolean;
  sections: ProcedureSection[];
  records: string[];
  creates: string[];
  checks: string[];
}

export const AGENT_FOR_PROCEDURE: Record<string, string> = {
  'QM-001': 'Design controls agent', 'SOP-001': 'Trace agent', 'SOP-002': 'Design controls agent', 'DHF-T1–7': 'Design controls agent',
  'SOP-003': 'Risk agent', 'SOP-004': 'CAPA agent', 'SOP-005': 'Trace agent', 'SOP-006': 'CAPA agent', 'SOP-007': 'CAPA agent',
  'SOP-008': 'Trace agent', 'SOP-009': 'Trace agent', 'SOP-010': 'Submission agent', 'SOP-011': 'CAPA agent', 'SOP-012': 'CAPA agent',
  'SOP-013': 'Submission agent', 'SOP-014': 'Trace agent', 'SOP-015': 'Trace agent',
  'SW-SOP-001': 'Design controls agent', 'SW-SOP-002': 'Risk agent', 'SW-SOP-003': 'Change agent', 'S1–S8': 'Submission agent'
};
export const TIERS: { key: TierKey; name: string }[] = [
  { key: 't1', name: 'FOUNDATION · BEFORE DESIGN WORK' },
  { key: 't2', name: 'OPERATE · BEFORE VERIFICATION' },
  { key: 't3', name: 'MARKET · BEFORE DISTRIBUTION' },
  { key: 'sw', name: 'SaMD AND AI' }
];
function S(t: string, d: string): ProcedureSection {
  return { t, d };
}
export const PROCEDURES: Procedure[] = [
  { g: 't1', id: 'QM-001', title: 'Quality Manual and Quality Policy', basis: 'ISO 13485 4.1, 4.2.2, 5; 21 CFR 820.10', owner: 'CEO / Management Representative', when: 'Before design work', summary: 'Defines what the quality system covers, who is responsible, and how processes connect. Points to SOPs rather than repeating them.',
    sections: [S('Company and scope', 'Activities actually performed; outsourced activities named'), S('Terminology and QMSR mapping', 'Medical Device File, design and development file, production record; DHF/DMR/DHR as declared synonyms'), S('Exclusions and non-applicable clauses', 'Design controls apply per 21 CFR 820.10(c), including software-automated Class I'), S('Quality policy', 'Signed by top management'), S('Risk management policy', 'How risk acceptability criteria are set (ISO 14971 4.2)'), S('Quality objectives', 'Process and product measures, reviewed at management review'), S('Organization and responsibilities', 'Top management, management representative, process owners'), S('Outsourced processes', 'Process, supplier and control for each'), S('Process map and regulatory requirements matrix', 'Each FDA requirement mapped to its SOP, tier and trigger'), S('Management review', 'Frequency and pointer to SOP-012')],
    records: ['Signed quality policy', 'Regulatory requirements matrix', 'Outsourced process register'], creates: ['Quality objective'], checks: ['Every FDA-specific requirement has an owning SOP', 'Quality objectives have a measure and a target'] },
  { g: 't1', id: 'SOP-001', title: 'Document and Record Control', basis: 'ISO 13485 4.2.4, 4.2.5; 21 CFR 820.35; Part 11', owner: 'Quality', when: 'Before design work', summary: 'Only approved, current revisions are used, and every quality record stays legible, retrievable and protected from change.',
    sections: [S('Purpose and scope', 'Paper and electronic documents and records'), S('Document numbering', 'QM, SOP, WI, FRM, SPEC, DHF and RMF prefixes; lettered revisions'), S('Creating and approving documents', 'Author, independent reviewer, process owner and Quality approval'), S('Changing documents', 'Change request with impact on product, risk, training and filings'), S('External documents', 'Standards and regulations register, checked on a set interval'), S('Electronic records and signatures', 'Part 11 controls, signature linking and the FDA certification letter'), S('Record retention', 'Includes complaint, servicing and UDI records under 820.35'), S('Forms', 'Change request, master list, external document register')],
    records: ['FRM-001 Document Change Request', 'FRM-002 Master Document List', 'FRM-003 External Document Register'], creates: ['Document', 'Change request'], checks: ['Released document cites an obsolete revision', 'Record changed without an audit trail'] },
  { g: 't1', id: 'SOP-002', title: 'Design and Development Control', basis: 'ISO 13485 7.3; 21 CFR 820.10(c)', owner: 'Engineering', when: 'Before design inputs are set', summary: 'Every project runs through planned, reviewed phases, and every design output traces back to an input and forward to verification evidence.',
    sections: [S('Purpose and scope', 'New devices, design changes and IDE builds'), S('Phases and gates', 'Gate zero, planning, inputs, outputs, freeze, verification, validation, transfer, release'), S('Design reviews', 'Functions concerned, recorded findings, actions closed before the next gate'), S('Essential design outputs', 'Outputs flagged as essential for safe and proper use'), S('Verification and validation', 'Protocols first, sample-size rationale, connected-use configurations, human factors'), S('Design changes', 'Impact review and documented 510(k) change assessment'), S('Design and development file', 'One file per project with an index of records')],
    records: ['DHF-T1 to T7', 'WI-001 Regulatory strategy and change assessment', 'WI-002 Statistical techniques'], creates: ['User need', 'Design input', 'Design output', 'Verification', 'Validation', 'Design change'], checks: ['Design input with no verification', 'Output not traced to an input', 'Test run on a superseded build'] },
  { g: 't1', id: 'DHF-T1–7', title: 'Design File Templates', basis: 'ISO 13485 7.3.2–7.3.10', owner: 'Engineering', when: 'Through the design project', summary: 'Seven fill-in records that form the core of each project design and development file.',
    sections: [S('T1 Design and development plan', 'Regulatory strategy, traceability method, resources, sub-plans'), S('T2 User needs', 'Need, source, user and environment, linked inputs'), S('T3 Design inputs', 'Testable requirement, acceptance criterion, method, essential flag'), S('T4 Traceability matrix', 'Need to input to output to verification, validation and risk control'), S('T5 Design review record', 'Version reviewed, attendees, decision, actions'), S('T6 V&V summary', 'Sample-size rationale, build ID, calibrated equipment ID'), S('T7 Design transfer checklist', 'Medical Device File, labeling inspection, UDI, registration and listing')],
    records: ['DHF-[project]-NNN records'], creates: ['User need', 'Design input', 'Design review', 'Verification'], checks: ['Missing sample-size rationale', 'Verification cites overdue equipment'] },
  { g: 't1', id: 'SOP-003', title: 'Risk Management', basis: 'ISO 14971:2019; ISO/TR 24971', owner: 'Quality and Engineering', when: 'Before design inputs are frozen', summary: 'Hazards are identified top-down, risks estimated and controlled, and overall residual risk judged against benefit across the whole lifecycle.',
    sections: [S('Purpose and scope', 'Design inputs through post-market; one risk management file per project'), S('Process', 'Plan, analyze, evaluate, control, residual risk, report, post-production'), S('Severity and probability scales', 'P1 for the hazardous situation times P2 for harm; software failure set to P1 = 1'), S('Risk acceptability matrix', 'Implements the risk management policy in QM-001'), S('Risk management plan', 'Scope, responsibilities, criteria, verification, review points'), S('Hazard analysis and FMEAs', 'HAZ records fed by design, use and process FMEAs'), S('Risk control verification', 'Implementation and effectiveness, risks introduced by controls'), S('Overall residual risk', 'Method, benefit-risk, disclosure in labeling'), S('Risk management review and report', 'Approved before release')],
    records: ['Risk management plan', 'Hazard analysis', 'dFMEA, uFMEA, pFMEA', 'Risk management report'], creates: ['Hazard', 'Risk control'], checks: ['Risk control without verification of effectiveness', 'Hazard with no control decision'] },
  { g: 't1', id: 'SOP-004', title: 'Supplier and Purchasing Controls', basis: 'ISO 13485 4.1.5, 7.4', owner: 'Operations and Quality', when: 'Before the first critical purchase', summary: 'Suppliers are approved before use, with controls proportional to how much they can affect safety and performance.',
    sections: [S('Purpose and scope', 'Components, contract manufacturing, testing, software, cloud, model and data vendors'), S('Supplier classification', 'Critical, major, minor with minimum qualification'), S('Process', 'Evaluate, approve, purchase with change notice, verify, monitor'), S('Supplier corrective action', 'SCAR route into nonconformance and CAPA'), S('Approved supplier list', 'Scope, basis, status and next review'), S('Supplier evaluation form', 'Certifications, method, findings, quality agreement')],
    records: ['FRM-004 Supplier Evaluation', 'FRM-005 Approved Supplier List'], creates: ['Supplier'], checks: ['Critical supplier with no quality agreement', 'Supplier review overdue'] },
  { g: 't1', id: 'SOP-005', title: 'Training and Competency', basis: 'ISO 13485 6.2', owner: 'Quality', when: 'Before anyone performs QMS work', summary: 'No one performs quality-affecting work until trained on the governing procedure and the training is recorded.',
    sections: [S('Purpose and scope', 'Employees, contractors and temporary staff'), S('Process', 'Training window with task gating on revised documents'), S('Competency by role', 'Education, experience and required training per role'), S('Training matrix', 'Person by document revision'), S('Training record', 'Method, trainer, effectiveness check')],
    records: ['FRM-006 Training Matrix', 'FRM-007 Training Record'], creates: ['Training record'], checks: ['Task performed without current training'] },

  { g: 't2', id: 'SOP-006', title: 'Nonconforming Product', basis: 'ISO 13485 8.3; 21 CFR 806', owner: 'Quality', when: 'Before design verification', summary: 'Anything that fails a requirement is identified, contained and recorded before anyone decides what to do with it.',
    sections: [S('Purpose and scope', 'Product, builds, labeling and test articles at any stage'), S('Identify, contain, record', 'Quarantine or block the build; report within a set time'), S('Evaluate and disposition', 'Rework, use as is with justification, scrap, return'), S('Escalation to CAPA', 'Repeated, systemic or high-risk issues'), S('After delivery', 'Advisory notice and 21 CFR 806 assessment'), S('Nonconformance report', 'FRM-010')],
    records: ['FRM-010 Nonconformance Report'], creates: ['Nonconformance'], checks: ['Use as is with no justification', 'High-risk NC with no CAPA decision'] },
  { g: 't2', id: 'SOP-007', title: 'Corrective and Preventive Action', basis: 'ISO 13485 8.5.2, 8.5.3', owner: 'Quality', when: 'Before design verification', summary: 'CAPA is reserved for systemic or high-risk problems and closes only when a pre-defined effectiveness check passes.',
    sections: [S('Purpose and scope', 'Sources: NCs, complaints, audits, monitoring, trends'), S('When to open a CAPA', 'Trigger table that makes the line deliberate'), S('Process', 'Contain, investigate, act, verify effectiveness, close'), S('Timing targets', 'By risk level, with approved extensions'), S('CAPA record', 'FRM-011')],
    records: ['FRM-011 CAPA Record'], creates: ['CAPA'], checks: ['CAPA closed without an effectiveness check', 'Overdue CAPA with no extension'] },
  { g: 't2', id: 'SOP-008', title: 'Production and Process Controls', basis: 'ISO 13485 7.5.1–7.5.11, 8.2.6; 21 CFR 820.35(c)', owner: 'Operations', when: 'Before design transfer', summary: 'Every lot or software release is built from released specifications, traceable, inspected, and released by an authorized signature.',
    sections: [S('Purpose and scope', 'In-house, outsourced and software release'), S('Controls', 'Work instructions, environment, identification, traceability, preservation'), S('Release', 'Complete record, inspections passed, labeling checked, signed'), S('Software release record', 'Build, commit, SBOM, tests, UDI'), S('Production record', 'FRM-012, replacing the device history record')],
    records: ['FRM-012 Production Record'], creates: ['Production record'], checks: ['Release with no labeling inspection'] },
  { g: 't2', id: 'SOP-009', title: 'Process Validation', basis: 'ISO 13485 7.5.6, 7.5.7', owner: 'Operations and Quality', when: 'Before design transfer', summary: 'Processes whose output cannot be fully verified are validated before routine use and revalidated when they change.',
    sections: [S('Deciding whether to validate', 'Recorded decision per process'), S('IQ, OQ, PQ', 'Installation, operating window, consistent performance'), S('Revalidation triggers', 'Equipment, material, supplier, software or site changes'), S('Protocol and report', 'FRM-013 with statistical rationale')],
    records: ['FRM-013 Validation Protocol and Report', 'Process validation master list'], creates: ['Process validation'], checks: ['Unverifiable process with no validation'] },
  { g: 't2', id: 'SOP-010', title: 'Medical Device File', basis: 'ISO 13485 4.2.3', owner: 'Engineering', when: 'Design transfer', summary: 'One index per device type of the released documents needed to build, test, label, ship and service it.',
    sections: [S('Purpose and scope', 'Replaces the device master record under QMSR'), S('MDF index', 'Sections a to f plus FDA labeling, UDI and listing additions'), S('Maintenance', 'Updated in the same change record as any listed document')],
    records: ['MDF index'], creates: ['Medical Device File'], checks: ['MDF lists a superseded revision'] },
  { g: 't2', id: 'SOP-011', title: 'Internal Audit', basis: 'ISO 13485 8.2.4', owner: 'Quality', when: 'Within 12 months of QMS release', summary: 'Every process is audited each cycle by someone who did not do the work; findings are corrected and verified.',
    sections: [S('Audit program', 'Risk-weighted plan, auditor independence and qualification'), S('Process', 'Plan, conduct, grade, report, respond, verify'), S('Writing for an FDA reader', 'Objective evidence; these records are now inspectable'), S('Audit plan and report', 'FRM-014')],
    records: ['FRM-014 Audit Plan and Report'], creates: ['Audit finding'], checks: ['Major finding with no CAPA'] },
  { g: 't2', id: 'SOP-012', title: 'Management Review', basis: 'ISO 13485 5.6; ISO 14971 4.2', owner: 'CEO', when: 'Within 12 months of QMS release', summary: 'Top management reviews every required input, decides actions with owners and dates, and signs a record an investigator can read.',
    sections: [S('Attendees', 'Chair, quorum, input owners'), S('Required inputs', 'ISO 13485 5.6.2 a to l plus risk process suitability'), S('Required outputs', 'Improvements, regulatory changes, resources'), S('Management review record', 'FRM-015')],
    records: ['FRM-015 Management Review Record'], creates: ['Review action'], checks: ['Required input missing from the record'] },
  { g: 't2', id: 'SOP-013', title: 'Labeling and Packaging Controls', basis: '21 CFR 820.45; Parts 801, 830', owner: 'Quality', when: 'Before design transfer', summary: 'No labeling is released until approved and checked, and no device ships until inspection confirms its labeling and packaging.',
    sections: [S('Scope', 'Labels, IFU, packaging and in-software labeling'), S('Process', 'Approve, check accuracy, record release, prevent mix-ups, inspect'), S('UDI', 'UDI-DI assignment, GUDID entry, UDI per lot or release'), S('Labeling inspection record', 'FRM-016')],
    records: ['FRM-016 Labeling Inspection Record'], creates: ['Labeling item'], checks: ['Release with no UDI recorded'] },
  { g: 't2', id: 'SOP-014', title: 'QMS Software Validation', basis: 'ISO 13485 4.1.6; FDA CSA guidance (Feb 2026)', owner: 'Quality', when: 'Before any tool holds QMS records', summary: 'Every production and QMS tool is listed, its intended use stated, its risk rated, and assurance applied in proportion.',
    sections: [S('Scope', 'eQMS, trackers, CI, spreadsheets, AI drafting tools'), S('Inventory and intended use', 'Feature by feature where risk differs'), S('Risk determination', 'High process risk or not'), S('Assurance activities', 'Scripted, unscripted, vendor evidence'), S('Software assurance record', 'FRM-017')],
    records: ['FRM-017 Software Assurance Record', 'Software register'], creates: ['Tool'], checks: ['Tool in use with no assurance record'] },
  { g: 't2', id: 'SOP-015', title: 'Monitoring and Measuring Equipment', basis: 'ISO 13485 7.6', owner: 'Engineering', when: 'Before design verification', summary: 'Equipment that decides acceptance is calibrated against traceable standards, and out-of-tolerance findings reopen prior results.',
    sections: [S('Register', 'Range, accuracy needed and interval'), S('Calibration and traceability', 'Traceable to national standards; status labels'), S('Out of tolerance', 'NC plus impact on prior results'), S('Equipment register', 'FRM-018')],
    records: ['FRM-018 Equipment Register'], creates: ['Equipment'], checks: ['Test cites overdue equipment'] },

  { g: 't3', id: 'SOP-016', title: 'Complaint Handling and MDR', basis: 'ISO 13485 8.2.2, 8.2.3; 21 CFR 803, 820.35(a)', owner: 'Quality', when: 'Before first external user', planned: true, summary: 'Every complaint is received, evaluated, investigated where needed and assessed for medical device reporting.',
    sections: [S('Intake', 'Channels, including pilot sites and beta users'), S('Evaluation and investigation', 'Including the rationale when no investigation is needed'), S('MDR decision', 'Reportability criteria and timelines'), S('Trending', 'Feeds CAPA and management review')],
    records: ['Complaint record'], creates: ['Complaint'], checks: ['Complaint with no MDR decision'] },
  { g: 't3', id: 'SOP-017', title: 'Corrections and Removals', basis: '21 CFR 806; ISO 13485 7.2.3, 8.3.3', owner: 'Quality', when: 'Before commercial distribution', planned: true, summary: 'Field actions are decided, documented and reported when required.',
    sections: [S('Decision', 'Health risk assessment and report decision'), S('Advisory notices', 'Content and distribution'), S('Records', 'Kept even when no report is filed')],
    records: ['Field action record'], creates: ['Field action'], checks: ['NC after delivery with no 806 assessment'] },
  { g: 't3', id: 'SOP-018', title: 'Registration, Listing and UDI', basis: '21 CFR 807, 830', owner: 'Quality', when: 'Before commercial distribution', planned: true, summary: 'Establishment registration, device listing and UDI data are filed and kept current.',
    sections: [S('Registration and listing', 'Annual updates and change triggers'), S('UDI program', 'Issuing agency, DI assignment, GUDID'), S('Maintenance', 'Changes that require new DIs')],
    records: ['Registration and listing log', 'GUDID records'], creates: ['UDI-DI'], checks: ['Released version with no UDI-DI'] },

  { g: 'sw', id: 'SW-SOP-001', title: 'Software Lifecycle', basis: 'IEC 62304:2006+A1:2015; FDA software submission guidance (2023)', owner: 'Engineering', when: 'Before software requirements', summary: 'Device software is planned, built, verified and released under configuration control, with rigor set by its safety class.',
    sections: [S('Purpose and scope', 'Firmware, apps, cloud back ends, ML models'), S('Safety classification', 'Class A, B or C after external risk controls'), S('Activities by class', 'What each class requires, clause by clause'), S('Process', 'Plan, specify, design, implement, test, release, maintain'), S('SOUP and OTS software', 'Listed, reviewed for anomalies, shared with the SBOM'), S('Premarket documentation map', 'Basic and Enhanced elements to source records')],
    records: ['S1 Development Plan', 'S2 Requirements', 'S3 Architecture and SOUP', 'S5 Anomaly List'], creates: ['Software requirement', 'SOUP item', 'Anomaly'], checks: ['Software risk control with no test', 'Release with unevaluated anomalies'] },
  { g: 'sw', id: 'SW-SOP-002', title: 'Cybersecurity', basis: 'FD&C Act 524B; FDA cybersecurity guidance (Feb 2026)', owner: 'Security lead', when: 'Before architecture is frozen', summary: 'Security is designed in, assessed as its own risk process that feeds safety risk, and maintained with an SBOM and patch plan.',
    sections: [S('Purpose and scope', 'Connected devices and 524B cyber devices'), S('Secure product development framework', 'Architecture views, threat model, security risk, requirements, testing'), S('SBOM', 'Machine-readable, per release, with support status'), S('Vulnerability management', 'Monitor, assess, remediate, disclose, report'), S('Roles', 'Named security lead'), S('Submission outputs', 'What a cyber device submission must include')],
    records: ['S8 Threat Model and SBOM Register', 'Security risk management report'], creates: ['Threat', 'SBOM component'], checks: ['Threat linked to harm with no control', 'Component past end of support'] },
  { g: 'sw', id: 'SW-SOP-003', title: 'AI/ML Model Lifecycle and PCCP', basis: 'FDA PCCP guidance (Aug 2025); AI lifecycle draft guidance (Jan 2025)', owner: 'ML lead', when: 'Before data collection for training', summary: 'Models are trained on documented, partitioned data, evaluated across subgroups, and changed only through a classified change path.',
    sections: [S('Purpose and scope', 'Locked, retrained and third-party models'), S('Data management', 'Provenance, patient-level partitions, sequestered test set'), S('Development and evaluation', 'Pre-specified endpoints and subgroup analysis'), S('Transparency', 'Model card feeds labeling'), S('Change classification', 'Inside PCCP, letter to file, or new submission'), S('PCCP', 'Modifications, protocol, impact assessment'), S('Field monitoring', 'Drift metrics, thresholds, owners'), S('Third-party and foundation models', 'Pinned versions, re-verification on change')],
    records: ['S6 Data Management Plan and Model Card', 'S7 PCCP'], creates: ['Dataset', 'Model version'], checks: ['Test set accessed before protocol approval', 'Subgroup below acceptance criteria'] },
  { g: 'sw', id: 'S1–S8', title: 'Software Design File Templates', basis: 'IEC 62304; FDA software and AI guidances', owner: 'Engineering', when: 'Through the software project', summary: 'Eight fill-in records that join DHF-T1 to T7 for software-driven devices.',
    sections: [S('S1 Software development plan', 'Lifecycle, tools, configuration, verification'), S('S2 Software requirements', 'Risk-control flag and verification link'), S('S3 Architecture and SOUP list', 'Items, interfaces, segregation'), S('S4 Regulatory determination', 'Device status, pathway, 524B, AI, documentation level'), S('S5 Anomaly list', 'Risk rationale for release'), S('S6 Data management and model card', 'Datasets, performance, limitations'), S('S7 PCCP', 'Planned modifications and protocol'), S('S8 Threat model and SBOM', 'STRIDE threats linked to hazards')],
    records: ['DHF-[project]-S1 to S8'], creates: ['Software requirement', 'Threat', 'Model version'], checks: ['Requirement with no test link'] }
];

/** The expert-service line shown under the sign-off path for a procedure. */
export function reviewOfferFor(id: string): string {
  if (id === 'SOP-011') return 'Available: outsourced internal audit by an auditor who did not build your quality system.';
  if (id === 'SOP-002' || id === 'DHF-T1–7')
    return 'Available: independent reviewer at each design review, plus technical review of this document.';
  if (id === 'SOP-012')
    return 'Available: technical review of the record. Management review itself stays with your top management.';
  return 'Every agent output gets a Biomedix technical review before it goes to your approvers.';
}
