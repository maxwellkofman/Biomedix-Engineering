import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { Detections, QuestionInput } from '../components/Questions';
import { useIntake } from '../intake/IntakeContext';
import { useCreateDocs } from '../intake/useCreateDocs';
import { answerOf, fieldId, visibleQuestions } from '../intake/questions';
import { isScopeQuestion, openQuestions } from '../guide/questions';
import { usePlan } from '../guide/usePlan';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/clean.css';

/**
 * The guide: describe the device, then answer one question at a time. Questions
 * that decide scope come first, then whichever answer fills the most documents.
 */
export default function Start() {
  const { intake, derived, tokens, suite, update, loadExample, started, readOnly, mode } = useIntake();
  const plan = usePlan();
  const { create, busy, error } = useCreateDocs();
  const [draft, setDraft] = useState(intake.device.description);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);

  const ctx = useMemo(() => ({ ix: intake, d: derived, tokens }), [intake, derived, tokens]);
  const visible = useMemo(() => visibleQuestions(ctx), [ctx]);
  const open = useMemo(() => openQuestions(ctx, suite), [ctx, suite]);
  const queue = [...open.filter((q) => !skipped.includes(fieldId(q))), ...open.filter((q) => skipped.includes(fieldId(q)))];
  const current = (currentId && visible.find((q) => fieldId(q) === currentId)) || queue[0] || null;
  const described = !!intake.device.description.trim();
  // Pin the question on screen: typing an answer must not swap it for the next one.
  const firstId = queue[0] ? fieldId(queue[0]) : null;
  const pinnedGone = !!currentId && !visible.some((q) => fieldId(q) === currentId);
  useEffect(() => {
    if (pinnedGone) setCurrentId(firstId);
    else if (!currentId && firstId && described) setCurrentId(firstId);
  }, [currentId, firstId, pinnedGone, described]);
  // Once the opening questions are answered the agent can draft: offer the documents before the details.
  const scopeLeft = open.filter(isScopeQuestion).length;
  const [hadScope] = useState(() => scopeLeft > 0 || !described);
  const [keepGoing, setKeepGoing] = useState(false);
  const milestone = hadScope && !keepGoing && scopeLeft === 0 && open.length > 0 && !(current && isScopeQuestion(current));

  const go = () => {
    if (!current) return;
    const id = fieldId(current);
    // Still unanswered (or still holding a placeholder): it goes to the back of the queue.
    if (open.some((q) => fieldId(q) === id)) setSkipped((s) => [...s.filter((x) => x !== id), id]);
    setTrail((t) => [...t, id]);
    const rest = queue.filter((q) => fieldId(q) !== id);
    setCurrentId(rest[0] ? fieldId(rest[0]) : null);
  };
  const back = () => {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    setTrail((t) => t.slice(0, -1));
    setCurrentId(prev);
  };

  const describe = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    update('device', { description: draft.trim() });
  };

  /* ---------- Step 1: describe the device ---------- */
  if (!described) {
    return (
      <AppShell>
        <main className="app-main guide">
          <div className="stack guide__col">
            <span className="eyebrow">START HERE</span>
            <h1 className="guide__title">What are you building?</h1>
            <p className="guide__lead">
              Describe your device in a few sentences: what it does, who uses it, and whether it has software, connects to anything or uses
              AI. The agent works out which procedures you need and starts drafting them.
            </p>
            <form className="stack guide__ask" onSubmit={describe}>
              <label htmlFor="guide-description" className="visually-hidden">
                Describe your device
              </label>
              <textarea
                id="guide-description"
                className="input input--area guide__prompt"
                rows={5}
                value={draft}
                maxLength={4000}
                disabled={readOnly}
                placeholder="e.g. A wearable ECG patch that streams to a phone app over Bluetooth. A machine learning model in our cloud detects atrial fibrillation and alerts the clinician."
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="button-row">
                <Button type="submit" size="lg" disabled={!draft.trim() || readOnly}>
                  Start drafting
                </Button>
                {!started && !readOnly && (
                  <Button variant="text" onClick={loadExample}>
                    Or load an example device
                  </Button>
                )}
              </div>
            </form>
            <p className="text-muted-sm">
              Nothing is sent anywhere yet{mode === 'guest' ? ': answers stay in this browser until you create an account' : ''}. A Biomedix
              engineer reviews every document before your team approves it.
            </p>
          </div>
        </main>
      </AppShell>
    );
  }

  /* ---------- Step 2: one question at a time ---------- */
  const left = queue.length;
  return (
    <AppShell>
      <main className="app-main guide">
        <div className="stack guide__col">
          <div className="stack guide__status">
            <div className="guide__status-top">
              <span className="eyebrow">YOUR GUIDE</span>
              <span className="text-muted-sm">
                {suite.applicable.length} documents drafted · {suite.filledPct}% filled from your answers
              </span>
            </div>
            <div className="meter" role="img" aria-label={`Documents ${suite.filledPct}% filled`}>
              <span className="meter__fill" style={{ width: `${suite.filledPct}%` }} />
            </div>
          </div>

          <Detections />

          {milestone ? (
            <section className="card stack guide__card" aria-labelledby="guide-milestone">
              <span className="guide__count">Enough to start</span>
              <h1 id="guide-milestone" className="guide__title guide__title--sm">
                The agent has drafted {suite.applicable.length} documents.
              </h1>
              <p className="guide__lead">
                {open.length} details are still blank, such as who owns each process and your suppliers. They’re highlighted in the documents,
                and you can fill them in now or later.
              </p>
              <div className="button-row">
                <Button onClick={() => void create()} disabled={busy}>
                  {busy ? 'Saving…' : 'See my documents'}
                </Button>
                <Button variant="outline" onClick={() => setKeepGoing(true)}>
                  Keep answering
                </Button>
              </div>
            </section>
          ) : current ? (
            <form
              className="card stack guide__card"
              onSubmit={(e) => {
                e.preventDefault();
                go();
              }}
            >
              <span className="guide__count">
                {left > 1 ? `${left} questions left` : 'Last question'}
                {skipped.includes(fieldId(current)) ? ' · skipped earlier' : ''}
              </span>
              <QuestionInput key={fieldId(current)} q={current} showFills />
              <div className="guide__nav">
                <Button type="submit" disabled={readOnly}>
                  {answerOf(intake, current).trim() ? 'Next' : 'Skip for now'}
                </Button>
                {trail.length > 0 && (
                  <Button variant="text" onClick={back}>
                    Back
                  </Button>
                )}
                <Link to="/app/form" className="guide__all">
                  See all questions
                </Link>
              </div>
            </form>
          ) : (
            <section className="card stack guide__card" aria-labelledby="guide-done">
              <span className="guide__count">No questions left</span>
              <h1 id="guide-done" className="guide__title guide__title--sm">
                That’s everything the agent needs.
              </h1>
              <p className="guide__lead">
                {suite.applicable.length} documents are drafted for {intake.device.name || 'your device'}.{' '}
                {plan.current && plan.current.key !== 'answer' ? `Next: ${plan.current.title.toLowerCase()}.` : ''}
              </p>
              {error && (
                <p role="alert" className="form-msg form-msg--err">
                  {error}
                </p>
              )}
              <div className="button-row">
                <Button onClick={() => void create()} disabled={busy || readOnly}>
                  {busy ? 'Saving…' : 'See my documents'}
                </Button>
                <ButtonLink to="/app/dashboard" variant="outline">
                  Back to home
                </ButtonLink>
              </div>
            </section>
          )}

          {current && !milestone && (
            <p className="text-muted-sm guide__foot">
              The agent only asks what it can’t work out, and proposes the rest for you to confirm. Skipped questions come back at the end.
              You can stop any time: <Link to="/app/suite">your documents</Link> update as you answer.
            </p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
