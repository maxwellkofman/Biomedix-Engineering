/**
 * Shapes for the document checker. The checker is a rule set, not a model:
 * every finding names the rule that raised it and the guideline behind it, so
 * an engineer can judge it. Shared by the browser and the server (Node strips
 * the types), so imports in this folder carry their .ts extension.
 */

export type Severity = 'error' | 'warning' | 'note';

export type Category = 'release' | 'fda' | 'citations' | 'requirements' | 'clarity' | 'consistency' | 'structure';

export type DocType = 'procedure' | 'requirements' | 'risk' | 'submission' | 'labeling' | 'record' | 'other';

export type Pathway = '510k' | 'de-novo' | 'pma' | 'exempt' | '';

export type UnitKind = 'title' | 'heading' | 'p' | 'li' | 'cell' | 'field';

/** A run of text inside a unit that came from a setup answer, not the template. */
export interface Span {
  start: number;
  end: number;
  label: string;
  /** The answer is missing or still a [placeholder]. */
  missing?: boolean;
}

/** One block of text: a heading, paragraph, list item, table cell or header field. */
export interface Unit {
  i: number;
  kind: UnitKind;
  text: string;
  /** The nearest heading above it. */
  section: string;
  line?: number;
  /** Table column heading, or the header field name. */
  col?: string;
  /** True for table heading cells. */
  head?: boolean;
  /** Heading level (1 = top section). */
  level?: number;
  /** Table cells: which table in the document, which row, which column (from 0). */
  table?: number;
  row?: number;
  c?: number;
  spans?: Span[];
}

export interface CheckDoc {
  id?: string;
  title: string;
  type: DocType;
  format: 'markdown' | 'text' | 'generated';
  units: Unit[];
}

export interface CheckOptions {
  pathway?: Pathway;
  /** Rule ids to skip. */
  disabled?: ReadonlySet<string>;
  /** Document ids that exist (for cross-reference checks). Omit to skip that check. */
  knownIds?: ReadonlySet<string>;
  /** Acronyms defined elsewhere in the same set of documents. */
  glossary?: ReadonlyMap<string, string>;
  /** Standards (by number) whose edition another document in the set gives. */
  datedStandards?: ReadonlySet<string>;
}

export interface Finding {
  rule: string;
  severity: Severity;
  unit: number;
  start: number;
  end: number;
  message: string;
  /** What to write instead, when the fix is mechanical. */
  replace?: string;
  /** The setup answer the flagged text came from. */
  answer?: string;
}

export interface Report {
  doc: { id?: string; title: string; type: DocType; format: CheckDoc['format'] };
  units: Unit[];
  findings: Finding[];
  counts: Record<Severity, number>;
  stats: { words: number; sentences: number; requirements: number };
}

/** A sentence (or list item) handed to sentence rules. Offsets are within the unit. */
export interface Sentence {
  unit: Unit;
  text: string;
  offset: number;
  /** Holds "shall" (or "must" in a requirements document): a requirement statement. */
  req: boolean;
  words: number;
  doc: CheckDoc;
  opts: CheckOptions;
}

/** Offsets in a hit are within the sentence (sentence rules) or the unit (document rules). */
export interface Hit {
  start: number;
  end: number;
  message?: string;
  replace?: string;
  severity?: Severity;
}

export interface DocHit extends Hit {
  unit: number;
}

export interface Rule {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  /** The guideline or regulation behind the rule. */
  source: string;
  /** Why it matters, in a sentence. */
  why: string;
  /** Default message for a hit. */
  message: string;
  example?: { bad: string; good: string };
  /** Only for these document types. */
  types?: DocType[];
  /** Only requirement statements. */
  reqOnly?: boolean;
  sentence?: (s: Sentence) => Hit[];
  doc?: (d: CheckDoc, o: CheckOptions) => DocHit[];
}

export const SEVERITY_LABEL: Record<Severity, string> = { error: 'Must fix', warning: 'Should fix', note: 'Consider' };

export const CATEGORY_LABEL: Record<Category, string> = {
  release: 'Release blockers',
  fda: 'FDA language',
  citations: 'Citations',
  requirements: 'Requirement wording',
  clarity: 'Plain language',
  consistency: 'Consistency',
  structure: 'Document structure',
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  procedure: 'Procedure or quality manual',
  requirements: 'Requirements or design file',
  risk: 'Risk management file',
  submission: 'Submission section',
  labeling: 'Labeling or IFU',
  record: 'Record or assessment',
  other: 'Other',
};

export const PATHWAY_LABEL: Record<Pathway, string> = {
  '510k': '510(k)',
  'de-novo': 'De Novo',
  pma: 'PMA',
  exempt: '510(k)-exempt',
  '': 'Not known',
};
