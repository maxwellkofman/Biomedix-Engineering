/**
 * The path from a blank workspace to an approved quality system, as six
 * steps. The dashboard and the guide show the first unfinished step as the
 * one thing to do next, so nobody has to work out where they are.
 */
import type { Readiness } from '../compliance/readiness';
import type { Intake } from '../intake/model';
import type { Suite } from '../templates/generate';

export type StepKey = 'describe' | 'answer' | 'confirm' | 'assess' | 'send' | 'approve';
export type StepState = 'done' | 'current' | 'todo';

export interface PlanStep {
  key: StepKey;
  n: number;
  title: string;
  /** Who does it: you, the agent, or a Biomedix engineer. */
  who: 'You' | 'You and the agent' | 'Biomedix engineer and you';
  detail: string;
  state: StepState;
  /** Where the step is done. */
  to?: string;
  cta?: string;
  /** Runs in place instead of navigating. */
  run?: 'send';
}

export interface Plan {
  steps: PlanStep[];
  current: PlanStep | null;
  done: number;
  /** Questions still open in the guide. */
  questionsLeft: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildPlan(
  ix: Intake,
  suite: Suite,
  readiness: Readiness,
  opts: { signedIn: boolean; canEdit: boolean; canApprove: boolean; questionsLeft: number },
): Plan {
  const described = !!(ix.device.description.trim() || ix.device.name.trim());
  const questionsLeft = opts.questionsLeft;
  const proposals = readiness.proposals.length;
  // Equipment packages are drafted as equipment arrives; they don't hold up the first release.
  const assessments = suite.applicable.filter((d) => d.progress && d.proc.g !== 'eq');
  const assessLeft = assessments.reduce((n, d) => n + (d.progress!.total - d.progress!.done) + d.progress!.suggested, 0);
  const docs = readiness.docs;
  const n = docs.length;
  const sent = docs.filter((d) => !d.life.changed && ['submitted', 'reviewed', 'approved'].includes(d.life.stage)).length;
  const approved = readiness.counts.approved;
  const awaiting = readiness.counts.reviewed;
  const inReview = readiness.counts.inReview;
  const returned = readiness.counts.returned;

  const raw: Omit<PlanStep, 'state' | 'n'>[] = [
    {
      key: 'describe',
      title: 'Describe your device',
      who: 'You',
      detail: described ? ix.device.name || 'Described' : 'A few sentences is enough for the agent to start.',
      to: '/app/start',
      cta: 'Describe your device',
    },
    {
      key: 'answer',
      title: 'Answer the agent’s questions',
      who: 'You and the agent',
      detail: !described
        ? 'One at a time, most useful first.'
        : questionsLeft
          ? `${plural(questionsLeft, 'question')} left · ${suite.filledPct}% of your documents filled`
          : `Every question answered · ${plural(n, 'document')} drafted`,
      to: '/app/start',
      cta: questionsLeft ? `Answer ${plural(questionsLeft, 'question')}` : 'Review answers',
    },
    {
      key: 'confirm',
      title: 'Check what the agent worked out',
      who: 'You and the agent',
      detail: proposals ? `${plural(proposals, 'proposal')} to confirm, such as safety class and who approves` : 'Every proposal confirmed',
      to: '/app/readiness#proposals',
      cta: `Confirm ${plural(proposals, 'proposal')}`,
    },
    {
      key: 'assess',
      title: 'Complete the two assessments',
      who: 'You and the agent',
      detail: assessLeft
        ? assessments.map((d) => `${d.proc.id === 'FRM-019' ? 'Part 11' : 'Risk'} ${Math.round((d.progress!.done / Math.max(1, d.progress!.total)) * 100)}%`).join(' · ')
        : 'Part 11 and risk assessments complete',
      to: '/app/assessments',
      cta: 'Open the assessments',
    },
    {
      key: 'send',
      title: 'Send your documents to an engineer',
      who: 'You',
      detail: !opts.signedIn
        ? 'Create a free account to save drafts and send them for review.'
        : returned
          ? `${plural(returned, 'document')} came back with comments`
          : sent === n && n
            ? `All ${n} documents sent`
            : `${sent} of ${n} sent for technical review`,
      ...(!opts.signedIn
        ? { to: '/sign-up?next=/app/dashboard', cta: 'Create an account' }
        : returned
          ? { to: '/app/review', cta: 'See the comments' }
          : { run: 'send' as const, cta: 'Save and send for review' }),
    },
    {
      key: 'approve',
      title: 'Engineer review, then your approval',
      who: 'Biomedix engineer and you',
      detail:
        approved === n && n
          ? `All ${n} documents approved`
          : [inReview && `${inReview} with an engineer`, awaiting && `${awaiting} waiting for approval`, `${approved} of ${n} approved`].filter(Boolean).join(' · '),
      ...(awaiting ? { to: '/app/review', cta: opts.canApprove ? `Approve ${plural(awaiting, 'document')}` : 'See what’s waiting' } : {}),
    },
  ];

  const isDone: Record<StepKey, boolean> = {
    describe: described,
    answer: described && questionsLeft === 0,
    confirm: described && proposals === 0,
    assess: described && assessLeft === 0,
    send: opts.signedIn && n > 0 && sent === n,
    approve: n > 0 && approved === n,
  };
  let found = false;
  const steps = raw.map((s, i): PlanStep => {
    const done = isDone[s.key];
    const state: StepState = done ? 'done' : found ? 'todo' : 'current';
    if (!done) found = true;
    return { ...s, n: i + 1, state };
  });
  // While everything is with the engineer there is nothing for the customer to press.
  const current = steps.find((s) => s.state === 'current') ?? null;
  if (current && !opts.canEdit && current.key !== 'approve') {
    current.cta = undefined;
    current.run = undefined;
    current.to = undefined;
    current.detail += ' · you have view-only access';
  }
  return { steps, current, done: steps.filter((s) => s.state === 'done').length, questionsLeft };
}
