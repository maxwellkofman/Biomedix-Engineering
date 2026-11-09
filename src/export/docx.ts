/**
 * Word (.docx) output for the tailored procedures. The `docx` library is
 * loaded on demand so it stays out of the main bundle.
 */
import { TOKENS, type TokenValues } from '../intake/derive';
import { isFilled, type GeneratedDoc, type Segment, type Suite } from '../templates/generate';

type Docx = typeof import('docx');

let lib: Promise<Docx> | null = null;
const loadDocx = () => (lib ??= import('docx'));

const INK = '111A17';
const MUTED = '4A5651';
const ACCENT = '0D6B5A';
const SHADE = 'F5F6F3';

function runs(d: Docx, segs: Segment[], tokens: TokenValues, base: { bold?: boolean; size?: number } = {}) {
  return segs.map((s) => {
    if (s.kind === 'text') return new d.TextRun({ text: s.text, ...base });
    if (isFilled(tokens, s.key)) return new d.TextRun({ text: tokens[s.key]!.value, ...base });
    const label = tokens[s.key]?.value ?? `[${TOKENS[s.key].label} — needs input]`;
    return new d.TextRun({ text: label, highlight: 'yellow', ...base });
  });
}

function cell(d: Docx, children: InstanceType<Docx['Paragraph']>[], opts: { width: number; shade?: boolean }) {
  return new d.TableCell({
    children,
    width: { size: opts.width, type: d.WidthType.PERCENTAGE },
    shading: opts.shade ? { type: d.ShadingType.CLEAR, fill: SHADE, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

const textPara = (d: Docx, text: string, o: { bold?: boolean; color?: string; size?: number } = {}) =>
  new d.Paragraph({ children: [new d.TextRun({ text, ...o })] });

function keyValueTable(d: Docx, rows: [string, InstanceType<Docx['TextRun']>[]][]) {
  return new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: rows.map(
      ([k, v]) =>
        new d.TableRow({
          children: [
            cell(d, [textPara(d, k, { color: MUTED })], { width: 28, shade: true }),
            cell(d, [new d.Paragraph({ children: v })], { width: 72 }),
          ],
        }),
    ),
  });
}

/** A table of assessment data. Wide tables use a smaller font so they fit a portrait page. */
function dataTable(d: Docx, head: string[], rows: Segment[][][], tokens: TokenValues, widths?: number[]) {
  const size = head.length > 5 ? 16 : 18;
  const w = (i: number) => widths?.[i] ?? Math.floor(100 / head.length);
  return new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: [
      new d.TableRow({
        tableHeader: true,
        children: head.map((h, i) => cell(d, [textPara(d, h, { bold: true, size })], { width: w(i), shade: true })),
      }),
      ...rows.map(
        (r) =>
          new d.TableRow({
            cantSplit: true,
            children: r.map((c, i) => cell(d, [new d.Paragraph({ children: runs(d, c, tokens, { size }) })], { width: w(i) })),
          }),
      ),
    ],
  });
}

function signatureTable(d: Docx, tokens: TokenValues) {
  const head = ['Signature meaning', 'Name and title', 'Signature', 'Date'];
  const approver = tokens.mgmtRep?.value ?? '[Management representative]';
  const rows = [
    ['Authored', 'AI agent, model [version], on behalf of the process owner'],
    ['Technical review', '[Reviewer name], Biomedix Engineering'],
    ['Approval', approver],
  ];
  return new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: [
      new d.TableRow({
        tableHeader: true,
        children: head.map((h) => cell(d, [textPara(d, h, { bold: true })], { width: 25, shade: true })),
      }),
      ...rows.map(
        ([m, n]) =>
          new d.TableRow({
            children: [m, n, '', ''].map((t) => cell(d, [textPara(d, t)], { width: 25 })),
          }),
      ),
    ],
  });
}

function baseDocument(
  d: Docx,
  o: { title: string; docId: string; company: string; children: (InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>)[] },
) {
  return new d.Document({
    creator: 'Biomedix Engineering',
    title: o.title,
    description: 'AI-generated draft. Not effective until technical review and approval are signed.',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: INK }, paragraph: { spacing: { after: 120, line: 288 } } },
        title: { run: { font: 'Calibri', size: 40, bold: true, color: INK } },
        heading1: { run: { font: 'Calibri', size: 28, bold: true, color: INK }, paragraph: { spacing: { before: 320, after: 120 } } },
        heading2: { run: { font: 'Calibri', size: 24, bold: true, color: ACCENT }, paragraph: { spacing: { before: 240, after: 80 } } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
        headers: {
          default: new d.Header({
            children: [
              new d.Paragraph({
                children: [
                  new d.TextRun({ text: `${o.company} · ${o.docId} · Rev A`, color: MUTED, size: 18 }),
                  new d.TextRun({ text: '    DRAFT — not effective until approved', color: 'B45309', size: 18, bold: true }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new d.Footer({
            children: [
              new d.Paragraph({
                alignment: d.AlignmentType.RIGHT,
                children: [
                  new d.TextRun({
                    color: MUTED,
                    size: 18,
                    children: ['Uncontrolled when printed · Page ', d.PageNumber.CURRENT, ' of ', d.PageNumber.TOTAL_PAGES],
                  }),
                ],
              }),
            ],
          }),
        },
        children: o.children,
      },
    ],
  });
}

/** One tailored procedure as a Word document. */
export async function docToDocx(doc: GeneratedDoc, tokens: TokenValues): Promise<Blob> {
  const d = await loadDocx();
  const company = tokens.company?.value ?? '[Company]';
  const children: (InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>)[] = [];

  children.push(
    new d.Paragraph({ heading: d.HeadingLevel.TITLE, children: [new d.TextRun(`${doc.proc.id} ${doc.proc.title}`)] }),
    keyValueTable(
      d,
      doc.header.map(([k, segs]) => [k, runs(d, segs, tokens)]),
    ),
    new d.Paragraph({ spacing: { before: 200 }, children: [new d.TextRun({ text: doc.proc.summary, italics: true, color: MUTED })] }),
  );

  for (const s of doc.sections) {
    children.push(new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: [new d.TextRun(`${Number(s.n)}. ${s.title}`)] }));
    for (const b of s.blocks) {
      if (b.kind === 'p') children.push(new d.Paragraph({ children: runs(d, b.segs, tokens) }));
      else if (b.kind === 'list') b.items.forEach((it) => children.push(new d.Paragraph({ bullet: { level: 0 }, children: runs(d, it, tokens) })));
      else {
        children.push(dataTable(d, b.head, b.rows, tokens, b.widths));
        children.push(new d.Paragraph({ children: [] }));
      }
    }
  }

  children.push(new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: [new d.TextRun('Records and forms')] }));
  doc.proc.records.forEach((r) => children.push(new d.Paragraph({ bullet: { level: 0 }, children: [new d.TextRun(r)] })));

  children.push(new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: [new d.TextRun('Revision history')] }));
  children.push(
    new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      rows: [
        new d.TableRow({
          tableHeader: true,
          children: ['Rev', 'Description', 'Effective date'].map((h, i) =>
            cell(d, [textPara(d, h, { bold: true })], { width: [12, 58, 30][i], shade: true }),
          ),
        }),
        new d.TableRow({
          children: ['A', 'Initial release', '[YYYY-MM-DD]'].map((t, i) => cell(d, [textPara(d, t)], { width: [12, 58, 30][i] })),
        }),
      ],
    }),
  );

  children.push(new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: [new d.TextRun('Signatures')] }));
  children.push(signatureTable(d, tokens));

  return d.Packer.toBlob(baseDocument(d, { title: `${doc.proc.id} ${doc.proc.title}`, docId: doc.proc.id, company, children }));
}

/** The gate zero determination as a record for the regulatory folder. */
export async function gateZeroDocx(suite: Suite, tokens: TokenValues): Promise<Blob> {
  const d = await loadDocx();
  const company = tokens.company?.value ?? '[Company]';
  const device = tokens.device?.value ?? '[Device]';
  const children = [
    new d.Paragraph({ heading: d.HeadingLevel.TITLE, children: [new d.TextRun('Gate Zero Regulatory Determination')] }),
    new d.Paragraph({ children: [new d.TextRun({ text: `${company} · ${device}`, color: MUTED })] }),
    new d.Paragraph({
      children: [
        new d.TextRun(
          'Answered before any agent runs. Drafted from the setup answers; a Biomedix engineer and the company sign the determination.',
        ),
      ],
    }),
    keyValueTable(
      d,
      suite.gateZero.map((g) => [g.q, runs(d, g.segs, tokens)]),
    ),
    new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: [new d.TextRun('Procedures that do not apply')] }),
    ...(suite.docs.filter((x) => x.status === 'na').length
      ? suite.docs
          .filter((x) => x.status === 'na')
          .map((x) => new d.Paragraph({ bullet: { level: 0 }, children: [new d.TextRun(`${x.proc.id} ${x.proc.title}: ${x.reason}`)] }))
      : [new d.Paragraph({ children: [new d.TextRun('None. Every procedure in the library applies.')] })]),
    new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: [new d.TextRun('Signatures')] }),
    signatureTable(d, tokens),
  ];
  return d.Packer.toBlob(baseDocument(d, { title: 'Gate Zero Regulatory Determination', docId: 'S4', company, children }));
}
