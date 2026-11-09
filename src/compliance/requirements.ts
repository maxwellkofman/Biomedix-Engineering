/**
 * The regulatory requirements matrix: each requirement and the procedures
 * that meet it, following the "basis" of each procedure in the library.
 * QM-001 points to this same mapping. This lists what the Biomedix library
 * addresses; it is not a full clause-by-clause gap assessment.
 */
export interface Requirement {
  ref: string;
  title: string;
  docs: string[];
}

export interface RequirementGroup {
  name: string;
  items: Requirement[];
}

export const REQUIREMENT_GROUPS: RequirementGroup[] = [
  {
    name: 'ISO 13485:2016, incorporated into 21 CFR 820 (QMSR)',
    items: [
      { ref: '4.1', title: 'Quality management system', docs: ['QM-001'] },
      { ref: '4.1.5', title: 'Outsourced processes', docs: ['QM-001', 'SOP-004'] },
      { ref: '4.1.6', title: 'Validation of QMS software', docs: ['SOP-014', 'FRM-019'] },
      { ref: '4.2.2', title: 'Quality manual', docs: ['QM-001'] },
      { ref: '4.2.3', title: 'Medical device file', docs: ['SOP-010'] },
      { ref: '4.2.4', title: 'Control of documents', docs: ['SOP-001'] },
      { ref: '4.2.5', title: 'Control of records', docs: ['SOP-001'] },
      { ref: '5.1–5.5', title: 'Management responsibility, quality policy and objectives', docs: ['QM-001'] },
      { ref: '5.6', title: 'Management review', docs: ['SOP-012'] },
      { ref: '6.2', title: 'Competence and training', docs: ['SOP-005'] },
      { ref: '7.1', title: 'Planning of product realization, including risk management', docs: ['SOP-003', 'RMF-001'] },
      { ref: '7.2.3', title: 'Customer communication, feedback and advisory notices', docs: ['SOP-016', 'SOP-017'] },
      { ref: '7.3', title: 'Design and development', docs: ['SOP-002', 'DHF-T1–7'] },
      { ref: '7.4', title: 'Purchasing', docs: ['SOP-004'] },
      { ref: '7.5', title: 'Production and service provision', docs: ['SOP-008'] },
      { ref: '7.5.6–7.5.7', title: 'Process and sterilization validation', docs: ['SOP-009'] },
      { ref: '7.6', title: 'Monitoring and measuring equipment', docs: ['SOP-015'] },
      { ref: '8.2.2–8.2.3', title: 'Complaint handling and regulatory reporting', docs: ['SOP-016'] },
      { ref: '8.2.4', title: 'Internal audit', docs: ['SOP-011'] },
      { ref: '8.2.6', title: 'Monitoring and measurement of product', docs: ['SOP-008'] },
      { ref: '8.3', title: 'Nonconforming product', docs: ['SOP-006'] },
      { ref: '8.5.2–8.5.3', title: 'Corrective and preventive action', docs: ['SOP-007'] },
    ],
  },
  {
    name: 'FDA-specific requirements',
    items: [
      { ref: '820.10(c)', title: 'Design controls for Class II, III and software Class I devices', docs: ['SOP-002'] },
      { ref: '820.35', title: 'Complaint, servicing and UDI records', docs: ['SOP-001', 'SOP-008', 'SOP-016'] },
      { ref: '820.45', title: 'Device labeling and packaging controls', docs: ['SOP-013'] },
      { ref: 'Part 11', title: 'Electronic records and signatures', docs: ['SOP-001', 'FRM-019'] },
      { ref: 'Part 803', title: 'Medical device reporting', docs: ['SOP-016'] },
      { ref: 'Part 806', title: 'Corrections and removals', docs: ['SOP-006', 'SOP-017'] },
      { ref: 'Parts 807, 830', title: 'Registration, listing and UDI', docs: ['SOP-013', 'SOP-018'] },
    ],
  },
  {
    name: 'Standards and FDA guidance',
    items: [
      { ref: 'ISO 14971', title: 'Risk management for medical devices', docs: ['SOP-003', 'RMF-001'] },
      { ref: 'IEC 62304', title: 'Medical device software lifecycle', docs: ['SW-SOP-001', 'S1–S8'] },
      { ref: 'FD&C 524B', title: 'Cybersecurity of cyber devices', docs: ['SW-SOP-002'] },
      { ref: 'PCCP', title: 'AI-enabled device software functions and change control plans', docs: ['SW-SOP-003'] },
    ],
  },
];
