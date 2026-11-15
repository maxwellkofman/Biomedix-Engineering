/**
 * Which questions the guide still needs to ask, most useful first.
 *
 * The questionnaire has about fifty questions, but most have a sensible
 * default the agent proposes (and the customer confirms later). The guide
 * asks only what it can't work out: questions that decide which documents
 * the device needs, and questions whose answer is still missing from a
 * required document.
 */
import { answerOf, fieldId, tokensFor, visibleQuestions, type Question, type QuestionCtx } from '../intake/questions';
import type { TokenKey } from '../intake/derive';
import { isFilled, type Suite } from '../templates/generate';

/** Asked first, in this order: they decide which documents the device needs. */
const FIRST = [
  'company.name',
  'device.name',
  'device.description',
  'tech.software',
  'tech.hardware',
  'tech.connected',
  'tech.ai',
  'regulatory.deviceClass',
  'tech.worstHarm',
  'device.intendedUse',
];

/** One of the opening questions that decide which documents the device needs. */
export const isScopeQuestion = (q: Question) => FIRST.includes(fieldId(q));

const PLACEHOLDER = /\[[^\]]+\]/;

export function openQuestions(ctx: QuestionCtx, suite: Suite): Question[] {
  const uses = new Map<TokenKey, number>();
  suite.applicable.forEach((d) => d.used.forEach((k) => uses.set(k, (uses.get(k) ?? 0) + 1)));
  const weight = (q: Question) => tokensFor(q).reduce((n, k) => n + (uses.get(k) ?? 0), 0);
  const feedsMissing = (q: Question) => tokensFor(q).some((k) => uses.has(k) && !isFilled(ctx.tokens, k));
  const isOpen = (q: Question) => {
    const a = answerOf(ctx.ix, q).trim();
    // An answer that still holds a [placeholder] isn't an answer yet.
    return a ? PLACEHOLDER.test(a) : FIRST.includes(fieldId(q)) || feedsMissing(q);
  };
  const rank = (q: Question) => {
    const i = FIRST.indexOf(fieldId(q));
    return i >= 0 ? i - 1000 : -weight(q);
  };
  return visibleQuestions(ctx)
    .map((q, i) => ({ q, i }))
    .filter((x) => isOpen(x.q))
    .sort((a, b) => rank(a.q) - rank(b.q) || a.i - b.i)
    .map((x) => x.q);
}
