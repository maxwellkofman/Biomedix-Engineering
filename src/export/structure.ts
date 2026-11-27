/**
 * The QMS library layout: one tree used for the on-screen preview, the ZIP
 * download, the PowerShell script and the direct SharePoint upload.
 */
import type { Intake } from '../intake/model';
import type { TokenValues } from '../intake/derive';
import type { GeneratedDoc, Suite } from '../templates/generate';

export type QmsFile =
  | { kind: 'doc'; name: string; doc: GeneratedDoc }
  /** A blank template derived from a controlled document: exported, but not a master-list entry. */
  | { kind: 'template'; name: string; doc: GeneratedDoc }
  /** A generated register or record (CSV or text). */
  | { kind: 'text'; name: string; text: string; type: string }
  | { kind: 'gate-zero'; name: string }
  | { kind: 'master-list'; name: string }
  | { kind: 'readme'; name: string };

export interface QmsFolder {
  name: string;
  /** Shown in the preview and the README. */
  purpose?: string;
  folders: QmsFolder[];
  files: QmsFile[];
}

/** SharePoint and Windows reject these characters in names. */
export function safeName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#%]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
}

const folder = (name: string, purpose?: string, folders: QmsFolder[] = [], files: QmsFile[] = []): QmsFolder => ({
  name: safeName(name),
  purpose,
  folders,
  files,
});

export const docFileName = (doc: GeneratedDoc, ext = 'docx') => safeName(`${doc.proc.id} ${doc.proc.title}`) + '.' + ext;

export interface TreeOptions {
  /** Only these documents are exported (default: every required document). */
  include?: (doc: GeneratedDoc) => boolean;
  /** Blank CQV templates, as separate files under Forms and Templates. */
  templates?: GeneratedDoc[];
  /** Extra files in 05 Records/Equipment Validation (e.g. the equipment register). */
  equipmentFiles?: QmsFile[];
  /** Extra files in 05 Records/Document Control (e.g. the approval record). */
  controlFiles?: QmsFile[];
}

export function buildTree(suite: Suite, ix: Intake, tokens: TokenValues, opts: TreeOptions = {}): QmsFolder {
  const included = opts.include ? suite.applicable.filter(opts.include) : suite.applicable;
  const has = (id: string) => suite.applicable.some((d) => d.proc.id === id);
  const doc = (id: string): QmsFile[] => {
    const d = included.find((x) => x.proc.id === id);
    return d ? [{ kind: 'doc', name: docFileName(d), doc: d }] : [];
  };
  const equipment = ix.equipment.items
    .map((e) => ({
      e,
      docs: included.filter((d) => d.proc.id.startsWith(`${e.ref}-`)),
    }))
    .filter((x) => x.docs.length);
  const device = safeName(tokens.device?.value ?? (ix.device.name || 'Device'));
  const procedures = included.filter((d) => /^(SOP|SW-SOP)-/.test(d.proc.id));

  const records = folder('05 Records', 'Completed forms and records, one folder per process', [
    folder('Document Control', 'Change requests, master document list, external documents (SOP-001)'),
    folder('Training', 'Training matrix and records (SOP-005)'),
    folder('Suppliers', 'Evaluations, approved supplier list, quality agreements (SOP-004)'),
    folder('Nonconformances', 'Nonconformance reports (SOP-006)'),
    folder('CAPA', 'CAPA records (SOP-007)'),
    folder('Internal Audits', 'Audit plans and reports (SOP-011)'),
    folder('Management Review', 'Management review records (SOP-012)'),
    ...(has('SOP-015') ? [folder('Equipment and Calibration', 'Equipment register and certificates (SOP-015)')] : []),
    ...(has('SOP-009') ? [folder('Process Validation', 'IQ, OQ and PQ protocols and reports (SOP-009)')] : []),
    ...(equipment.length || opts.equipmentFiles?.length
      ? [
          folder(
            'Equipment Validation',
            'One package per piece of equipment: URS, plan, protocols, traceability and report (CQV-T1–8)',
            equipment.map(({ e, docs }) =>
              folder(`${e.ref} ${e.name.trim() || 'Unnamed equipment'}`, undefined, [], docs.map((d) => ({ kind: 'doc', name: docFileName(d), doc: d }))),
            ),
            opts.equipmentFiles ?? [],
          ),
        ]
      : []),
    folder('Complaints and MDR', 'Complaint records and MDR decisions (SOP-016)'),
    folder('Corrections and Removals', 'Field action records (SOP-017)'),
    folder('Software Tool Validation', 'Software register, assurance records and the Part 11 assessment (SOP-014, FRM-019)', [], doc('FRM-019')),
    ...(!has('SOP-002') && has('RMF-001') ? [folder('Risk Management', 'Risk assessment and risk management records (SOP-003)', [], doc('RMF-001'))] : []),
  ]);
  records.folders[0].files.push({ kind: 'master-list', name: 'FRM-002 Master Document List.csv' }, ...(opts.controlFiles ?? []));

  const designFile =
    has('SOP-002') &&
    folder(`06 Design and Development File - ${device}`, 'One file per device project (SOP-002)', [
      folder('01 Design and Development Plan'),
      folder('02 User Needs'),
      folder('03 Design Inputs'),
      folder('04 Design Outputs'),
      folder('05 Design Reviews'),
      folder('06 Verification'),
      folder('07 Validation'),
      folder('08 Design Transfer'),
      folder('09 Design Changes'),
      folder('10 Traceability'),
      folder('11 Risk Management File', 'Plan, risk assessment, FMEAs, report (SOP-003)', [], doc('RMF-001')),
      ...(has('SW-SOP-001') ? [folder('12 Software', 'S1–S8 records (SW-SOP-001)')] : []),
      ...(has('SW-SOP-002') ? [folder('13 Cybersecurity', 'Threat model, SBOM, security risk (SW-SOP-002)')] : []),
      ...(has('SW-SOP-003')
        ? [
            folder('14 AI and Machine Learning', 'Data, models and PCCP (SW-SOP-003)', [
              folder('Data Management'),
              folder('Model Cards'),
              folder('PCCP'),
            ]),
          ]
        : []),
    ]);

  return folder('QMS', undefined, [
    folder('01 Quality Manual', 'The quality manual and policy', [], doc('QM-001')),
    folder(
      '02 Procedures',
      'Procedures (SOPs), released through document control',
      [],
      procedures.map((d) => ({ kind: 'doc', name: docFileName(d), doc: d })),
    ),
    folder('03 Work Instructions', 'Step-level instructions referenced by SOPs (WI-001, WI-002)'),
    folder(
      '04 Forms and Templates',
      'Blank forms and record templates',
      opts.templates?.length
        ? [
            folder(
              'Equipment Validation Templates',
              'CQV-T1 to CQV-T8 as separate files, from CQV-T1–8',
              [],
              opts.templates.map((d) => ({ kind: 'template', name: docFileName(d), doc: d })),
            ),
          ]
        : [],
      [...doc('DHF-T1–7'), ...doc('S1–S8'), ...doc('CQV-T1–8')],
    ),
    records,
    ...(designFile ? [designFile] : []),
    folder(`07 Medical Device File - ${device}`, 'Index of released documents to build, test, label and ship (SOP-010)'),
    folder('08 Production Records', 'Lot and software release records (SOP-008)'),
    folder('09 Regulatory', 'Determinations, submissions, registration and UDI', [
      folder('Submissions'),
      folder('Registration and Listing'),
      folder('UDI'),
    ], [{ kind: 'gate-zero', name: 'Gate Zero Regulatory Determination.docx' }]),
    folder('10 Obsolete', 'Superseded revisions, kept for the retention period'),
  ], [{ kind: 'readme', name: 'README.txt' }]);
}

/** Every folder path, parents before children, without the root. */
export function folderPaths(root: QmsFolder): string[] {
  const out: string[] = [];
  const walk = (f: QmsFolder, prefix: string) =>
    f.folders.forEach((c) => {
      const p = prefix ? `${prefix}/${c.name}` : c.name;
      out.push(p);
      walk(c, p);
    });
  walk(root, '');
  return out;
}

/** Every file with its folder path (without the root). */
export function filePaths(root: QmsFolder): { dir: string; file: QmsFile }[] {
  const out: { dir: string; file: QmsFile }[] = [];
  const walk = (f: QmsFolder, prefix: string) => {
    f.files.forEach((file) => out.push({ dir: prefix, file }));
    f.folders.forEach((c) => walk(c, prefix ? `${prefix}/${c.name}` : c.name));
  };
  walk(root, '');
  return out;
}

export function countTree(root: QmsFolder) {
  return { folders: folderPaths(root).length, files: filePaths(root).length };
}
