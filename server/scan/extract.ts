/**
 * Turns an uploaded design file into text and tables the automated checks can read:
 * PDF (text layer), Word .docx, Excel .xlsx, CSV, plain text and Markdown.
 * Older .doc and .xls files, scans and password-protected files are passed to
 * the engineer without automated checks.
 */
import { unzip, ZipError } from './zip.ts';

export interface Table {
  sheet: string;
  rows: string[][];
}

export interface ReadResult {
  text: string;
  tables: Table[];
  pages: number | null;
  status: 'read' | 'partial' | 'unreadable';
  note: string;
}

export const ACCEPT = ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.md', '.doc', '.xls'] as const;

const MAX_TEXT = 2_000_000;
const MAX_ROWS = 5000;
const MAX_COLS = 60;
const MAX_PAGES = 400;

export function extOf(name: string) {
  const m = /\.[a-z0-9]+$/i.exec(name);
  return m ? m[0].toLowerCase() : '';
}

/** Refuses files whose content doesn't match their extension. Returns an error message or null. */
export function checkSignature(name: string, data: Buffer): string | null {
  const ext = extOf(name);
  if (!(ACCEPT as readonly string[]).includes(ext)) return `We can’t take ${ext || 'files without an extension'}. Use PDF, Word, Excel, CSV or text.`;
  const head = data.subarray(0, 8);
  const zip = head[0] === 0x50 && head[1] === 0x4b;
  const ole = head.readUInt32BE(0) === 0xd0cf11e0;
  if (ext === '.pdf' && data.subarray(0, 1024).indexOf('%PDF-') < 0) return `${name} doesn’t look like a PDF.`;
  if ((ext === '.docx' || ext === '.xlsx') && !zip) return ole ? `${name} is password-protected or an older format. Save it as a normal ${ext} file.` : `${name} doesn’t look like a ${ext} file.`;
  if ((ext === '.doc' || ext === '.xls') && !ole) return `${name} doesn’t look like a ${ext} file.`;
  if (['.csv', '.txt', '.md'].includes(ext) && data.subarray(0, 4096).includes(0)) return `${name} doesn’t look like a text file.`;
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeXml(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e] ?? m;
  });
}

const clean = (s: string) => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

/* ---------- Word ---------- */

/** Text runs, tabs, breaks and paragraph ends from WordprocessingML, in order. Table rows stay on one line. */
function wordText(xml: string) {
  let out = '';
  let cell = 0;
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<\/w:p>|<w:tc[\s>]|<\/w:tc>|<\/w:tr>/g;
  for (let m: RegExpExecArray | null; (m = re.exec(xml)); ) {
    const tok = m[0];
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (tok.startsWith('<w:tab')) out += '\t';
    else if (tok.startsWith('<w:br')) out += cell ? ' ' : '\n';
    else if (tok.startsWith('<w:tc')) cell++;
    else if (tok === '</w:tc>') {
      cell = Math.max(0, cell - 1);
      out += ' | ';
    } else if (tok === '</w:tr>') out += '\n';
    else out += cell ? ' ' : '\n';
  }
  return out;
}

function readDocx(data: Buffer): ReadResult {
  const files = unzip(data, (n) => n === 'word/document.xml');
  const xml = files.get('word/document.xml')?.toString('utf8');
  if (!xml) return unreadable('No document body found in this Word file.');
  const tables: Table[] = [];
  let t = 0;
  for (const tbl of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []) {
    const rows: string[][] = [];
    for (const tr of tbl.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) ?? []) {
      const cells = (tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) ?? []).slice(0, MAX_COLS).map((tc) => clean(wordText(tc).replace(/\s*\|\s*$/, '').replace(/\n+/g, ' ')));
      if (cells.some(Boolean)) rows.push(cells);
      if (rows.length >= MAX_ROWS) break;
    }
    if (rows.length) tables.push({ sheet: `Table ${++t}`, rows });
  }
  const text = wordText(xml)
    .split('\n')
    .map((l) => clean(l).replace(/^\|\s*|\s*\|$/g, '').replace(/(\s*\|\s*)+/g, ' | '))
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT);
  return { text, tables, pages: null, status: text ? 'read' : 'unreadable', note: text ? '' : 'The document has no text.' };
}

/* ---------- Excel ---------- */

function colIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(data: Buffer): ReadResult {
  const files = unzip(data, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const wb = files.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const strings = (files.get('xl/sharedStrings.xml')?.toString('utf8').match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) =>
    decodeXml((si.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('')),
  );
  const targets = new Map<string, string>();
  for (const r of rels.match(/<Relationship\s[^>]*>/g) ?? []) {
    const id = /Id="([^"]+)"/.exec(r)?.[1];
    const target = /Target="([^"]+)"/.exec(r)?.[1];
    if (id && target) targets.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const sheets = (wb.match(/<sheet\s[^>]*\/?>/g) ?? []).map((s) => ({
    name: decodeXml(/name="([^"]*)"/.exec(s)?.[1] ?? 'Sheet'),
    path: targets.get(/r:id="([^"]+)"/.exec(s)?.[1] ?? '') ?? '',
  }));
  const tables: Table[] = [];
  for (const sheet of sheets) {
    const xml = files.get(sheet.path)?.toString('utf8');
    if (!xml) continue;
    const rows: string[][] = [];
    for (const row of xml.match(/<row[\s>][\s\S]*?<\/row>/g) ?? []) {
      const cells: string[] = [];
      for (const c of row.match(/<c\s[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = /r="([A-Z]+)\d+"/.exec(c)?.[1];
        const type = /\st="(\w+)"/.exec(c)?.[1] ?? 'n';
        const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
        let value = '';
        if (type === 's' && v !== undefined) value = strings[Number(v)] ?? '';
        else if (type === 'inlineStr') value = decodeXml((c.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (v !== undefined) value = decodeXml(v);
        const i = ref ? colIndex(ref) : cells.length;
        if (i >= MAX_COLS) continue;
        cells[i] = clean(value);
      }
      const filled = Array.from(cells, (x) => x ?? '');
      if (filled.some(Boolean)) rows.push(filled);
      if (rows.length >= MAX_ROWS) break;
    }
    if (rows.length) tables.push({ sheet: sheet.name, rows });
  }
  const text = tablesText(tables);
  return { text, tables, pages: null, status: tables.length ? 'read' : 'unreadable', note: tables.length ? '' : 'The workbook has no filled-in cells.' };
}

/* ---------- CSV and text ---------- */

function parseCsv(src: string): string[][] {
  const first = src.slice(0, src.indexOf('\n') > 0 ? src.indexOf('\n') : src.length);
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === delim) {
      row.push(clean(cell));
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(clean(cell));
      cell = '';
      if (row.some(Boolean)) rows.push(row.slice(0, MAX_COLS));
      row = [];
      if (rows.length >= MAX_ROWS) break;
    } else cell += ch;
  }
  row.push(clean(cell));
  if (row.some(Boolean) && rows.length < MAX_ROWS) rows.push(row.slice(0, MAX_COLS));
  return rows;
}

function tablesText(tables: Table[]) {
  return tables
    .map((t) => t.rows.map((r) => r.filter(Boolean).join(' | ')).join('\n'))
    .join('\n')
    .slice(0, MAX_TEXT);
}

function decodeText(data: Buffer) {
  const s = data.toString('utf8');
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/* ---------- PDF ---------- */

async function readPdf(data: Buffer): Promise<ReadResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
  }).promise;
  try {
    const pages = doc.numPages;
    let text = '';
    for (let n = 1; n <= Math.min(pages, MAX_PAGES) && text.length < MAX_TEXT; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str + (item.hasEOL ? '\n' : ' ');
      }
      text += '\n';
      page.cleanup();
    }
    text = text
      .split('\n')
      .map(clean)
      .filter(Boolean)
      .join('\n')
      .slice(0, MAX_TEXT);
    const perPage = text.length / Math.max(1, pages);
    if (text.length < 40) return { text: '', tables: [], pages, status: 'unreadable', note: 'No text layer: this looks like a scanned PDF. An engineer will read it.' };
    if (perPage < 150) return { text, tables: [], pages, status: 'partial', note: 'Parts of this PDF look scanned, so automated checks only saw some of it.' };
    const note = pages > MAX_PAGES ? `Automated checks read the first ${MAX_PAGES} of ${pages} pages.` : '';
    return { text, tables: [], pages, status: note ? 'partial' : 'read', note };
  } finally {
    await doc.destroy();
  }
}

function unreadable(note: string): ReadResult {
  return { text: '', tables: [], pages: null, status: 'unreadable', note };
}

export async function readFile(name: string, data: Buffer): Promise<ReadResult> {
  const ext = extOf(name);
  try {
    switch (ext) {
      case '.pdf':
        return await readPdf(data);
      case '.docx':
        return readDocx(data);
      case '.xlsx':
        return readXlsx(data);
      case '.csv': {
        const rows = parseCsv(decodeText(data));
        const tables = rows.length ? [{ sheet: name, rows }] : [];
        return { text: tablesText(tables), tables, pages: null, status: rows.length ? 'read' : 'unreadable', note: rows.length ? '' : 'The file is empty.' };
      }
      case '.txt':
      case '.md': {
        const text = decodeText(data).slice(0, MAX_TEXT);
        return { text, tables: [], pages: null, status: text.trim() ? 'read' : 'unreadable', note: text.trim() ? '' : 'The file is empty.' };
      }
      case '.doc':
      case '.xls':
        return unreadable(`Older ${ext} format: automated checks skip it, an engineer will read it. Save as ${ext}x to include it next time.`);
      default:
        return unreadable('Unsupported file type.');
    }
  } catch (err) {
    const msg = err instanceof ZipError ? err.message : err instanceof Error && /password/i.test(err.message) ? 'The file is password-protected.' : 'We couldn’t read this file automatically.';
    return unreadable(`${msg} An engineer will open it.`);
  }
}
