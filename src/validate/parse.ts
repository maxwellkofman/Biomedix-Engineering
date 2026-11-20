/**
 * Turns a document into units the rules read: Markdown (the app's own export
 * and most model output), or plain text extracted from Word and PDF files.
 */
import type { CheckDoc, DocType, Pathway, Unit, UnitKind } from './types.ts';

/* ---------- Markdown ---------- */

/** Strips inline Markdown so rules see the words, not the markup. */
export function inline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:https?:|mailto:|#|\/)[^)]*\)/g, '$1')
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([|*_`#[\]\\])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return body.split(/(?<!\\)\|/).map((c) => c.trim());
}

const isSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const LIST_RE = /^\s*(?:[-*+•]|\d{1,3}[.)])\s+/;

export function parseMarkdown(md: string, fallbackTitle = 'Untitled document'): CheckDoc {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const units: Unit[] = [];
  let section = '';
  let title = '';
  let tables = 0;
  const add = (kind: UnitKind, text: string, line: number, extra: Partial<Unit> = {}) => {
    const t = kind === 'cell' ? text : inline(text);
    if (!t) return;
    units.push({ i: units.length, kind, text: t, section, line, ...extra });
  };

  let para: string[] = [];
  let paraLine = 0;
  const flush = () => {
    if (para.length) add('p', para.join(' '), paraLine);
    para = [];
  };

  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    const line = raw.trimEnd();
    const ln = n + 1;
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      const start = n;
      n++;
      while (n < lines.length && !/^\s*```/.test(lines[n])) n++;
      // Code blocks don't belong in a controlled document; keep a marker so the markup rule sees it.
      units.push({ i: units.length, kind: 'p', text: '```', section, line: start + 1 });
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      flush();
      while (n < lines.length && !lines[n].includes('-->')) n++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      const text = inline(h[2]);
      if (h[1].length === 1 && !title) {
        title = text;
        add('title', text, ln);
      } else {
        section = text.replace(/^\d+(\.\d+)*\.?\s+/, '');
        units.push({ i: units.length, kind: 'heading', text, section, line: ln, level: h[1].length - 1 });
      }
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      continue;
    }
    if (/^\s*\|/.test(line) && n + 1 < lines.length && isSeparator(lines[n + 1])) {
      flush();
      const table = tables++;
      const head = splitRow(line).map(inline);
      head.forEach((c, j) => add('cell', c, ln, { col: c, head: true, table, row: 0, c: j }));
      n += 2;
      let row = 1;
      while (n < lines.length && /^\s*\|/.test(lines[n])) {
        const cells = splitRow(lines[n]);
        const r = row++;
        cells.forEach((c, j) => add('cell', inline(c), n + 1, { col: head[j] ?? '', table, row: r, c: j }));
        n++;
      }
      n--;
      continue;
    }
    if (LIST_RE.test(line)) {
      flush();
      let text = line.replace(LIST_RE, '').replace(/^\[[ xX]\]\s+/, '');
      while (n + 1 < lines.length && /^\s{2,}\S/.test(lines[n + 1]) && !LIST_RE.test(lines[n + 1])) text += ' ' + lines[++n].trim();
      add('li', text, ln);
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    const text = quote ? quote[1] : line.trim();
    if (!para.length) paraLine = ln;
    para.push(text);
  }
  flush();
  return { id: idOf(title), title: title || fallbackTitle, type: guessType(units), format: 'markdown', units };
}

/* ---------- Plain text (Word, PDF, pasted) ---------- */

const ENDS_SENTENCE = /[.!?:;]["”')\]]?$/;

function looksLikeHeading(line: string) {
  if (line.length > 90 || line.length < 3) return false;
  if (/[.;,]$/.test(line)) return false;
  const words = line.split(/\s+/).length;
  if (words > 11) return false;
  if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(line)) return true;
  if (/^[A-Z][A-Z0-9 &/,()-]{2,}:?$/.test(line)) return true;
  if (/:$/.test(line) && words <= 6) return true;
  // Title Case: most words capitalised.
  const caps = line.split(/\s+/).filter((w) => /^[A-Z0-9(]/.test(w)).length;
  return words <= 8 && caps / words >= 0.6 && !/\b(shall|must|is|are|will)\b/.test(line);
}

export function parseText(text: string, fallbackTitle = 'Untitled document'): CheckDoc {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  const units: Unit[] = [];
  let section = '';
  let title = '';
  let para = '';
  let paraLine = 0;
  let head: string[] | null = null;
  let tables = -1;
  let row = 0;
  const flush = () => {
    if (para) units.push({ i: units.length, kind: 'p', text: para, section, line: paraLine });
    para = '';
  };

  lines.forEach((line, n) => {
    const ln = n + 1;
    if (!line) {
      flush();
      head = null;
      return;
    }
    if (line.includes(' | ')) {
      flush();
      const cells = line.split(' | ').map((c) => c.trim());
      if (!head) {
        head = cells;
        tables++;
        row = 0;
        cells.forEach((c, j) => c && units.push({ i: units.length, kind: 'cell', text: c, section, line: ln, col: c, head: true, table: tables, row: 0, c: j }));
      } else {
        const h = head;
        const r = ++row;
        cells.forEach((c, j) => c && units.push({ i: units.length, kind: 'cell', text: c, section, line: ln, col: h[j] ?? '', table: tables, row: r, c: j }));
      }
      return;
    }
    head = null;
    if (LIST_RE.test(line)) {
      flush();
      units.push({ i: units.length, kind: 'li', text: line.replace(LIST_RE, ''), section, line: ln });
      return;
    }
    if (!para && looksLikeHeading(line)) {
      if (!title && !units.length) {
        title = line;
        units.push({ i: units.length, kind: 'title', text: line, section, line: ln });
      } else {
        section = line.replace(/^\d+(\.\d+)*\.?\s+/, '').replace(/:$/, '');
        const num = /^(\d+(?:\.\d+)*)\.?\s/.exec(line);
        units.push({ i: units.length, kind: 'heading', text: line, section, line: ln, level: num ? num[1].split('.').length : 1 });
      }
      return;
    }
    // PDF and Word wrap long paragraphs across lines: join until a line ends a sentence.
    if (para && !ENDS_SENTENCE.test(para)) para += ' ' + line;
    else {
      flush();
      para = line;
      paraLine = ln;
    }
  });
  flush();
  return { id: idOf(title), title: title || fallbackTitle, type: guessType(units), format: 'text', units };
}

/** A document ID at the start of the title, e.g. "SOP-001" or "DHF-T1–7". */
function idOf(title: string): string | undefined {
  return /^((?:[A-Z]{1,6}-)+[A-Z]?\d[\dA-Z–-]*)\s/.exec(title)?.[1];
}

/* ---------- Guessing ---------- */

export function guessType(units: Unit[]): DocType {
  const all = units.map((u) => u.text).join('\n');
  const heads = units
    .filter((u) => u.kind === 'heading' || u.kind === 'title')
    .map((u) => u.text.toLowerCase())
    .join('\n');
  const n = (re: RegExp) => (all.match(re) ?? []).length;
  if (/instructions for use|\bifu\b|contraindications?|warnings? and precautions/i.test(heads) || n(/\b(WARNING|CAUTION)\b/g) >= 2) return 'labeling';
  if (/substantial equivalence|predicate|indications for use statement|510\(k\) summary|device description/i.test(heads)) return 'submission';
  if (n(/\b(hazardous situations?|harms?|severity|risk control measures?)\b/gi) >= 4 && /risk/i.test(heads + all.slice(0, 400))) return 'risk';
  if (/\bpurpose\b/.test(heads) && /\bscope\b/.test(heads)) return 'procedure';
  if (/\b(SOP|procedure|quality manual)\b/i.test(heads)) return 'procedure';
  if (n(/\bshall\b/gi) >= 5 && n(/\b(REQ|SRS|SYS|UN|DI|SR|HW|SW)-\d+/g) >= 3) return 'requirements';
  if (/requirements? specification|design inputs?|user needs?/i.test(heads)) return 'requirements';
  return 'other';
}

export function guessPathway(text: string): Pathway {
  if (/\bDe Novo\b/i.test(text)) return 'de-novo';
  if (/\b510\s?\(k\)|\b510k\b/i.test(text)) return '510k';
  if (/\bPMA\b|premarket approval application/i.test(text)) return 'pma';
  return '';
}

/* ---------- Sentences ---------- */

const ABBREV = /\b(e\.g|i\.e|etc|vs|No|Nos|Fig|Figs|Sec|Secs|Inc|Ltd|Co|Corp|U\.S|St|Dr|Mr|Ms|Mrs|approx|Rev|Ver|Ref|Vol|cf|al|Art|Para|Cl|Ch|pp|p)\.$/i;

/** Splits a unit into sentences with their offsets. List items and cells usually hold one. */
export function sentences(text: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  const re = /[.!?;](?=["”')\]]?\s+["“(]?[A-Z0-9[])/g;
  let start = 0;
  for (const m of text.matchAll(re)) {
    const end = m.index! + 1;
    const piece = text.slice(start, end);
    if (m[0] === '.' && (ABBREV.test(piece) || /\b[A-Z]\.$/.test(piece))) continue;
    push(start, end);
    start = end;
  }
  push(start, text.length);
  return out;

  function push(a: number, b: number) {
    const raw = text.slice(a, b);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, offset: a + lead });
  }
}

export const wordCount = (s: string) => (s.match(/[A-Za-z0-9][\w'’()-]*/g) ?? []).length;
