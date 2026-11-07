import type { ReactNode } from 'react';

/**
 * Renders the Markdown that docToMarkdown writes (headings, a field table,
 * quotes, lists and paragraphs) as React elements. Text is never parsed as HTML.
 */
export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (line.startsWith('# ')) {
      out.push(<h2 key={i} className="md__h1">{line.slice(2)}</h2>);
      i++;
    } else if (line.startsWith('## ')) {
      out.push(<h3 key={i} className="md__h2">{line.slice(3)}</h3>);
      i++;
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i]
          .slice(1, -1)
          .split(/(?<!\\)\|/)
          .map((c) => c.trim().replace(/\\\|/g, '|'));
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      // First row is the header (Field | Value).
      const body = rows.slice(1);
      out.push(
        <dl key={i} className="paper__header md__table">
          {body.map((r) => (
            <div key={r[0]} className="deflist__row">
              <dt>{r[0]}</dt>
              <dd>{r[1]}</dd>
            </div>
          ))}
        </dl>,
      );
    } else if (line.startsWith('> ')) {
      out.push(<p key={i} className="md__quote">{line.slice(2)}</p>);
      i++;
    } else if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      out.push(
        <ul key={i}>
          {items.map((it, k) => (
            <li key={k}>{it}</li>
          ))}
        </ul>,
      );
    } else {
      out.push(<p key={i}>{line}</p>);
      i++;
    }
  }
  return <div className="md">{out}</div>;
}
