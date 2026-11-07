/**
 * Compliance readiness: how close the documentation suite is to done.
 *
 * Every required document is scored on four checks, equally weighted:
 *   1. Values filled        share of its values answered (an open scope question counts as one more)
 *   2. Proposals confirmed  share of agent-derived values the customer confirmed
 *   3. Technical review     a Biomedix technical review is signed on the current content
 *   4. Approved             the customer's approver signed the current content
 * Readiness is the average across required documents, rounded down, so 100%
 * means every required procedure is approved as it stands today.
 */
import type { DraftMeta, Signoff } from '../account/api';
import { TOKENS, type TokenKey, type TokenValues } from '../intake/derive';
import type { StepId } from '../intake/model';
import { isFilled, type GeneratedDoc, type Suite } from '../templates/generate';
import { REQUIREMENT_GROUPS, type Requirement } from './requirements';

/* ---------- Document lifecycle ---------- */

export type DocStage = 'unsaved' | 'draft' | 'submitted' | 'returned' | 'reviewed' | 'approved';

export interface DocLifecycle {
  /** Latest saved draft, if any run has saved this document. */
  latest?: DraftMeta;
  /** Current content differs from the latest saved draft (or was never saved). */
  changed: boolean;
  /** Stage of the latest saved draft. */
  stage: DocStage;
  /** Sign-offs on the latest draft, oldest first. */
  history: Signoff[];
  review?: Signoff;
  approval?: Signoff;
  returned?: Signoff;
}

const STAGE_AFTER: Record<Signoff['kind'], DocStage> = {
  submit: 'submitted',
  return: 'returned',
  review: 'reviewed',
  approve: 'approved',
};

export function lifecycle(hash: string, latest: DraftMeta | undefined, signoffs: Signoff[], docId: string): DocLifecycle {
  if (!latest) return { changed: true, stage: 'unsaved', history: [] };
  const history = signoffs.filter((s) => s.docId === docId && s.draft === latest.draft);
  const last = history[history.length - 1];
  const find = (k: Signoff['kind']) => [...history].reverse().find((s) => s.kind === k);
  return {
    latest,
    changed: latest.hash !== hash,
    stage: last ? STAGE_AFTER[last.kind] : 'draft',
    history,
    review: last && (last.kind === 'review' || last.kind === 'approve') ? find('review') : undefined,
    approval: last?.kind === 'approve' ? last : undefined,
    returned: last?.kind === 'return' ? last : undefined,
  };
}

/* ---------- Scoring ---------- */

export type CheckKey = 'filled' | 'confirmed' | 'reviewed' | 'approved';

export interface DocReadiness {
  doc: GeneratedDoc;
  life: DocLifecycle;
  filled: number;
  derived: TokenKey[];
  unconfirmed: TokenKey[];
  confirmed: number;
  reviewed: boolean;
  approved: boolean;
  /** Complete draft: every value filled and every proposal confirmed. */
  complete: boolean;
  score: number;
  /** 0 drafting, 1 complete, 2 reviewed, 3 approved. */
  level: 0 | 1 | 2 | 3;
}

export interface Check {
  key: CheckKey;
  label: string;
  hint: string;
  /** Documents that pass this check. */
  done: number;
  total: number;
  pct: number;
}

export interface Proposal {
  key: TokenKey;
  value: string;
  docs: string[];
}

export type RequirementState = 'na' | 'drafting' | 'complete' | 'reviewed' | 'met';

export interface RequirementStatus extends Requirement {
  state: RequirementState;
  covering: DocReadiness[];
}

export interface NextAction {
  key: string;
  title: string;
  detail: string;
  to?: string;
  run?: 'save-run' | 'submit-ready' | 'confirm-all';
}

export interface Readiness {
  pct: number;
  docs: DocReadiness[];
  checks: Check[];
  proposals: Proposal[];
  requirements: { name: string; items: RequirementStatus[] }[];
  requirementsMet: number;
  requirementsTotal: number;
  next: NextAction[];
  counts: { approved: number; reviewed: number; inReview: number; returned: number; readyToSubmit: number; changed: number };
}

export function scoreDoc(doc: GeneratedDoc, tokens: TokenValues, life: DocLifecycle): DocReadiness {
  const pendingPenalty = doc.pending ? 1 : 0;
  const total = doc.used.length + pendingPenalty;
  const filled = total ? (doc.used.length - doc.missing.length) / total : 1;
  const derived = doc.used.filter((k) => tokens[k]?.auto && isFilled(tokens, k));
  const unconfirmed = derived.filter((k) => !tokens[k]?.confirmed);
  const confirmed = derived.length ? (derived.length - unconfirmed.length) / derived.length : 1;
  const current = !life.changed;
  const reviewed = current && !!life.review;
  const approved = current && !!life.approval;
  const complete = filled === 1 && confirmed === 1;
  const score = (filled + confirmed + (reviewed ? 1 : 0) + (approved ? 1 : 0)) / 4;
  const level = approved && complete ? 3 : reviewed && complete ? 2 : complete ? 1 : 0;
  return { doc, life, filled, derived, unconfirmed, confirmed, reviewed, approved, complete, score, level };
}

const pendingStep = (q: string): StepId => (/class/i.test(q) ? 'regulatory' : 'technology');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function computeReadiness(
  suite: Suite,
  tokens: TokenValues,
  lives: Record<string, DocLifecycle>,
  opts: {
    signedIn: boolean;
    docHref: (id: string) => string;
    missingHref: (k: TokenKey) => string;
    /** Signed-in role allows editing (defaults to true). */
    canEdit?: boolean;
    /** Signed-in user is one of the company's approvers. */
    canApprove?: boolean;
    approvers?: string[];
  },
): Readiness {
  const docs = suite.applicable.map((d) => scoreDoc(d, tokens, lives[d.proc.id]));
  const n = docs.length;
  const pct = n ? Math.floor((docs.reduce((s, d) => s + d.score, 0) / n) * 100) : 0;

  const check = (key: CheckKey, label: string, hint: string, pass: (d: DocReadiness) => number): Check => {
    const sum = docs.reduce((s, d) => s + pass(d), 0);
    return {
      key,
      label,
      hint,
      done: docs.filter((d) => pass(d) === 1).length,
      total: n,
      pct: n ? Math.floor((sum / n) * 100) : 0,
    };
  };
  const checks: Check[] = [
    check('filled', 'Values filled', 'Every value in the document comes from an answer', (d) => d.filled),
    check('confirmed', 'Agent proposals confirmed', 'You confirmed each value the agent derived', (d) => d.confirmed),
    check('reviewed', 'Technical review signed', 'A Biomedix engineer signed the current draft', (d) => (d.reviewed ? 1 : 0)),
    check('approved', 'Approved', 'Your approver signed the current draft', (d) => (d.approved ? 1 : 0)),
  ];

  // Unconfirmed agent proposals across required documents, most-used first.
  const pmap = new Map<TokenKey, string[]>();
  docs.forEach((d) => d.unconfirmed.forEach((k) => pmap.set(k, [...(pmap.get(k) ?? []), d.doc.proc.id])));
  const proposals = [...pmap.entries()]
    .map(([key, ids]) => ({ key, value: tokens[key]!.value, docs: ids }))
    .sort((a, b) => b.docs.length - a.docs.length);

  // Requirements matrix.
  const byId = new Map(docs.map((d) => [d.doc.proc.id, d]));
  const LEVEL_STATE: RequirementState[] = ['drafting', 'complete', 'reviewed', 'met'];
  const requirements = REQUIREMENT_GROUPS.map((g) => ({
    name: g.name,
    items: g.items.map((r): RequirementStatus => {
      const covering = r.docs.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
      const state: RequirementState = covering.length
        ? LEVEL_STATE[Math.min(...covering.map((d) => d.level))]
        : 'na';
      return { ...r, state, covering };
    }),
  }));
  const applicableReqs = requirements.flatMap((g) => g.items).filter((r) => r.state !== 'na');

  // Counts for next steps.
  const current = (d: DocReadiness) => !d.life.changed;
  const readyToSubmit = docs.filter(
    (d) => d.complete && current(d) && (d.life.stage === 'draft' || d.life.stage === 'returned'),
  );
  const changed = docs.filter((d) => d.life.changed);
  const inReview = docs.filter((d) => current(d) && d.life.stage === 'submitted');
  const returned = docs.filter((d) => current(d) && d.life.stage === 'returned');
  const awaitingApproval = docs.filter((d) => d.reviewed && !d.approved);

  const next: NextAction[] = [];
  suite.missing.slice(0, 3).forEach((m) =>
    next.push({
      key: `missing-${m.key}`,
      title: `Answer “${TOKENS[m.key].label}”`,
      detail: `Fills ${plural(m.docs.length, 'document')}`,
      to: opts.missingHref(m.key),
    }),
  );
  [...new Set(suite.applicable.flatMap((d) => (d.pending ? [d.pending] : [])))].slice(0, 2).forEach((q) =>
    next.push({
      key: `pending-${q}`,
      title: `Answer “${q}”`,
      detail: 'Decides which procedures your device needs',
      to: `/app/setup/${pendingStep(q)}`,
    }),
  );
  if (proposals.length)
    next.push({
      key: 'confirm',
      title: `Confirm ${plural(proposals.length, 'agent proposal')}`,
      detail: `Used in ${plural(new Set(proposals.flatMap((p) => p.docs)).size, 'document')}`,
      to: '/app/readiness#proposals',
    });
  if (!opts.signedIn)
    next.push({
      key: 'account',
      title: 'Create an account to save your documents',
      detail: 'Saved drafts can go to technical review and approval',
      to: '/sign-up?next=/app/readiness',
    });
  else if (changed.length && opts.canEdit !== false)
    next.push({
      key: 'save',
      title: 'Save a new run',
      detail: `${plural(changed.length, 'document')} changed since the last saved draft`,
      run: 'save-run',
    });
  if (opts.signedIn && returned.length && opts.canEdit !== false)
    next.push({
      key: 'returned',
      title: `Address comments on ${plural(returned.length, 'document')}`,
      detail: 'The reviewer returned them; revise your answers and save a new run',
      to: opts.docHref(returned[0].doc.proc.id),
    });
  if (opts.signedIn && readyToSubmit.length && opts.canEdit !== false)
    next.push({
      key: 'submit',
      title: `Send ${plural(readyToSubmit.length, 'document')} for technical review`,
      detail: 'Complete drafts with every value filled and confirmed',
      run: 'submit-ready',
    });
  if (awaitingApproval.length && (!opts.signedIn || opts.canApprove))
    next.push({
      key: 'approve',
      title: `Record approval for ${plural(awaitingApproval.length, 'document')}`,
      detail: 'Technical review is signed; approval stays with your company',
      to: opts.docHref(awaitingApproval[0].doc.proc.id),
    });
  else if (awaitingApproval.length)
    next.push({
      key: 'approve',
      title: `${plural(awaitingApproval.length, 'document')} waiting on approval`,
      detail: opts.approvers?.length
        ? `Approvers in your company: ${opts.approvers.join(', ')}`
        : 'Nobody in your company is an approver yet. An owner or admin can name one in Members.',
      to: opts.approvers?.length ? '/app/review' : '/app/settings/members',
    });
  if (inReview.length)
    next.push({
      key: 'in-review',
      title: `${plural(inReview.length, 'document')} with Biomedix technical review`,
      detail: 'Nothing for you to do until they come back',
      to: '/app/review',
    });

  return {
    pct,
    docs,
    checks,
    proposals,
    requirements,
    requirementsMet: applicableReqs.filter((r) => r.state === 'met').length,
    requirementsTotal: applicableReqs.length,
    next,
    counts: {
      approved: docs.filter((d) => d.approved).length,
      reviewed: awaitingApproval.length,
      inReview: inReview.length,
      returned: returned.length,
      readyToSubmit: readyToSubmit.length,
      changed: changed.length,
    },
  };
}
