/**
 * Equipment validation exports: one equipment's package as a ZIP of Word
 * files, the blank CQV templates, and the equipment register as CSV.
 */
import type { TokenValues } from '../intake/derive';
import { blankTemplates } from '../equipment/docs';
import type { Equipment } from '../equipment/model';
import { displayName, IMPACT_LABEL, kindLabel, PHASE_SUMMARY, PHASE_WHEN, summarizeEquipment } from '../equipment/summary';
import { assembleDoc, numberSections, parseSegments, type GeneratedDoc } from '../templates/generate';
import { docToDocx } from './docx';
import { docFileName, safeName } from './structure';

/** The blank templates as documents, ready for Word. */
export function blankTemplateDocs(tokens: TokenValues): GeneratedDoc[] {
  return blankTemplates(parseSegments).map((t) =>
    assembleDoc(
      {
        g: 'eq',
        id: t.id,
        title: t.title,
        basis: 'ISO 13485 6.3, 7.5.6, 7.6; GHTF SG3/N99-10',
        owner: 'Operations and Quality',
        when: PHASE_WHEN[t.phase],
        summary: PHASE_SUMMARY[t.phase],
        sections: [],
        records: [],
        creates: [],
        checks: [],
      },
      { applies: true },
      'qualityLead',
      numberSections(t.sections),
      tokens,
      undefined,
      [['Equipment', parseSegments('EQ-NNN [Equipment name]')]],
    ),
  );
}

export async function docsZip(folder: string, docs: GeneratedDoc[], tokens: TokenValues, extra: Record<string, string> = {}) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const root = zip.folder(safeName(folder))!;
  for (const d of docs) root.file(docFileName(d), await docToDocx(d, tokens));
  for (const [name, text] of Object.entries(extra)) root.file(name, text);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export const packageFolder = (e: Equipment) => safeName(`${e.ref} ${displayName(e)}`);

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** FRM-018 style register of every piece of equipment in validation. */
export function equipmentRegisterCsv(items: Equipment[], status: (docId: string) => string): string {
  const rows = [['Equipment ID', 'Name', 'Type', 'Manufacturer', 'Model', 'Serial number', 'Asset ID', 'Location', 'Impact', 'Calibrated', 'Documents', 'Open items']];
  for (const e of items) {
    const sum = summarizeEquipment(e);
    rows.push([
      e.ref,
      displayName(e),
      e.kind ? kindLabel(e) : '',
      e.manufacturer,
      e.model,
      e.serial,
      e.asset,
      e.location,
      sum.impact ? IMPACT_LABEL[sum.impact] : 'Not assessed',
      e.calibration === 'yes' ? 'Yes' : e.calibration === 'no' ? 'No' : '',
      sum.phases.map((ph) => `${e.ref}-${ph} (${status(`${e.ref}-${ph}`)})`).join('; '),
      String(sum.total - sum.done),
    ]);
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
