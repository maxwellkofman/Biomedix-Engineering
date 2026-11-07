/** Where each saved document stands: its latest draft and the last sign-off on that draft. */
import { getDb } from './db.ts';

export type DocState = 'draft' | 'in_review' | 'returned' | 'awaiting_approval' | 'approved';

const STATE: Record<string, DocState> = {
  submit: 'in_review',
  return: 'returned',
  review: 'awaiting_approval',
  approve: 'approved',
};

export interface DocStateRow {
  project_id: string;
  org_id: string;
  doc_id: string;
  draft: number;
  title: string;
  filled_pct: number;
  run_number: number;
  draft_at: string;
  kind: string | null;
  signed_at: string | null;
  signer: string | null;
  signer_id: string | null;
  note: string | null;
  company: string | null;
  device: string | null;
  state: DocState;
}

/** `where` is a trusted SQL fragment over aliases p (projects), l (latest draft) and r (last sign-off). */
export function docStates(where: string, params: (string | number)[]): DocStateRow[] {
  const rows = getDb()
    .prepare(
      `WITH latest AS (
         SELECT d.project_id, d.doc_id, d.draft, d.title, d.filled_pct, d.run_number, d.created_at AS draft_at
         FROM drafts d
         WHERE d.draft = (SELECT MAX(x.draft) FROM drafts x WHERE x.project_id = d.project_id AND x.doc_id = d.doc_id)
       ),
       ranked AS (
         SELECT s.project_id, s.doc_id, s.draft, s.kind, s.created_at, s.signer, s.user_id, s.note,
           ROW_NUMBER() OVER (PARTITION BY s.project_id, s.doc_id, s.draft ORDER BY s.created_at DESC, s.rowid DESC) AS rn
         FROM signoffs s
       )
       SELECT l.*, p.org_id, r.kind, r.created_at AS signed_at, r.signer, r.user_id AS signer_id, r.note,
         json_extract(p.intake, '$.company.name') AS company, json_extract(p.intake, '$.device.name') AS device
       FROM latest l
       JOIN projects p ON p.id = l.project_id
       LEFT JOIN ranked r ON r.project_id = l.project_id AND r.doc_id = l.doc_id AND r.draft = l.draft AND r.rn = 1
       WHERE ${where}
       ORDER BY COALESCE(r.created_at, l.draft_at) DESC`,
    )
    .all(...params) as unknown as Omit<DocStateRow, 'state'>[];
  return rows.map((r) => ({ ...r, state: r.kind ? STATE[r.kind] : 'draft' }));
}

export function countStates(rows: DocStateRow[]) {
  const out: Record<DocState, number> = { draft: 0, in_review: 0, returned: 0, awaiting_approval: 0, approved: 0 };
  for (const r of rows) out[r.state]++;
  return out;
}
