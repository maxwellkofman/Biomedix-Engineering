/** Building blocks for documents assembled from answers (assessments, equipment validation). */
import type { Block, Segment } from './generate';

/*
 * Values the customer entered are marked while the document is assembled, and
 * txt() turns the marks into segments that carry the answer's label. The
 * document checker uses the label to tell assessment answers from template
 * wording; renderers only read `text`, so the marks never reach an export.
 */
export const MARK_RE = /\u0001([^\u0002]*)\u0002([^\u0003]*)\u0003|\[([A-Z][^\[\]\n]{2,80})\]/g;
export const mark = (label: string, value: string) => `\u0001${label}\u0002${value}\u0003`;
export const txt = (text: string): Segment[] => {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK_RE)) {
    if (m.index! > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    // A bracketed phrase is an assessment item not answered yet.
    out.push(m[3] !== undefined ? { kind: 'text', text: m[0], from: m[3], open: true } : { kind: 'text', text: m[2], from: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out.length ? out : [{ kind: 'text', text }];
};
/** A customer-entered value, or the fallback when it's empty. A bracketed fallback names the answer. */
export const or = (v: string, fallback: string, label?: string) => {
  const name = label ?? /^\[(.+)\]$/.exec(fallback)?.[1];
  if (!v.trim()) return fallback;
  return name ? mark(name, v.trim()) : v.trim();
};
export const ans = (label: string, v: string) => (v.trim() ? mark(label, v.trim()) : '');
export const p = (segs: Segment[]): Block => ({ kind: 'p', segs });
export const list = (items: string[]): Block => ({ kind: 'list', items: items.map(txt) });
export const table = (head: string[], rows: string[][], widths?: number[]): Block => ({
  kind: 'table',
  head,
  rows: rows.map((r) => r.map(txt)),
  widths,
});
export const yesNo = (v: string, yes = 'Yes', no = 'No') => (v === 'yes' ? yes : v === 'no' ? no : '[Not answered]');
export const section = (title: string, purpose: string, blocks: Block[]) => ({ title, purpose, blocks });
