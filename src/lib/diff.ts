export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

/** Line diff by longest common subsequence. Documents are a few hundred lines, so O(n·m) is fine. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ kind: 'del', text: a[i++] });
    else out.push({ kind: 'add', text: b[j++] });
  }
  while (i < n) out.push({ kind: 'del', text: a[i++] });
  while (j < m) out.push({ kind: 'add', text: b[j++] });
  return out;
}

/** Collapse long unchanged stretches, keeping `context` lines around each change. */
export function withContext(lines: DiffLine[], context = 2): (DiffLine | { kind: 'gap'; count: number })[] {
  const keep = lines.map((l) => l.kind !== 'same');
  const near = lines.map((_, i) => {
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) if (keep[k]) return true;
    return false;
  });
  const out: (DiffLine | { kind: 'gap'; count: number })[] = [];
  let gap = 0;
  lines.forEach((l, i) => {
    if (near[i]) {
      if (gap) out.push({ kind: 'gap', count: gap });
      gap = 0;
      out.push(l);
    } else gap++;
  });
  if (gap) out.push({ kind: 'gap', count: gap });
  return out;
}
