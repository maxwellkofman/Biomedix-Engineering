/**
 * The plan as the customer sees it: one "next step" card with a single
 * button, and the six steps underneath as a short checklist.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlan } from '../guide/usePlan';
import type { PlanStep } from '../guide/plan';
import { useIntake } from '../intake/IntakeContext';
import { Button, ButtonLink } from './Button';
import '../styles/clean.css';

/** Saves a run if anything changed, then sends every complete draft for technical review. */
function useSend() {
  const { createRun, submitReady, readiness } = useIntake();
  const [phase, setPhase] = useState<'idle' | 'saving' | 'sending'>('idle');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = readiness.counts.changed;

  // Sending waits until the saved run shows up in the document states.
  useEffect(() => {
    if (phase !== 'sending' || changed > 0) return;
    let live = true;
    submitReady()
      .then((n) => live && setMsg({ ok: true, text: n ? `${n} document${n === 1 ? '' : 's'} sent to a Biomedix engineer for technical review.` : 'Saved. Nothing new was ready to send.' }))
      .catch((err: Error) => live && setMsg({ ok: false, text: err.message }))
      .finally(() => live && setPhase('idle'));
    return () => {
      live = false;
    };
  }, [phase, changed, submitReady]);

  const send = async () => {
    setMsg(null);
    try {
      if (changed > 0) {
        setPhase('saving');
        await createRun();
      }
      setPhase('sending');
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Couldn’t save your documents.' });
      setPhase('idle');
    }
  };
  return { send, busy: phase !== 'idle', msg };
}

export function NextStep() {
  const plan = usePlan();
  const { send, busy, msg } = useSend();
  const s = plan.current;
  if (!s)
    return (
      <section className="next" aria-labelledby="next-h">
        <span className="eyebrow eyebrow--on-night">ALL SIX STEPS DONE</span>
        <h2 id="next-h" className="next__title">
          Every document is approved.
        </h2>
        <p className="next__detail">Keep it current: when your design changes, update your answers and the agent redrafts what’s affected.</p>
        <div className="button-row">
          <ButtonLink to="/app/publish" variant="bright">
            Publish to SharePoint
          </ButtonLink>
        </div>
      </section>
    );
  const waiting = s.key === 'approve' && !s.cta;
  return (
    <section className="next" aria-labelledby="next-h">
      <span className="eyebrow eyebrow--on-night">
        NEXT STEP · {s.n} OF {plan.steps.length}
      </span>
      <h2 id="next-h" className="next__title">
        {waiting ? 'An engineer is reviewing your documents.' : s.title}
      </h2>
      <p className="next__detail">{waiting ? `${s.detail}. Nothing for you to do until they reply; you’ll get an email.` : s.detail}</p>
      <div className="button-row">
        {s.run === 'send' ? (
          <Button variant="bright" size="lg" disabled={busy} onClick={() => void send()}>
            {busy ? 'Working…' : s.cta}
          </Button>
        ) : s.to && s.cta ? (
          <ButtonLink to={s.to} variant="bright" size="lg">
            {s.cta}
          </ButtonLink>
        ) : null}
        <span className="next__who">{s.who}</span>
      </div>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`next__msg${msg.ok ? '' : ' next__msg--err'}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

function Mark({ s }: { s: PlanStep }) {
  return (
    <span className={`plan__mark plan__mark--${s.state}`} aria-hidden="true">
      {s.state === 'done' ? '✓' : s.n}
    </span>
  );
}

export function PlanList() {
  const plan = usePlan();
  return (
    <section className="card card--compact stack plan" aria-labelledby="plan-h">
      <div className="outline__head">
        <h2 id="plan-h" className="card__title card__title--sm">
          Your path
        </h2>
        <span className="text-muted-sm">
          {plan.done} of {plan.steps.length} done
        </span>
      </div>
      <ol className="list-reset plan__list">
        {plan.steps.map((s) => {
          const body = (
            <>
              <Mark s={s} />
              <span className="stack plan__text">
                <span className="plan__title">
                  {s.title}
                  <span className="visually-hidden">{s.state === 'done' ? ' (done)' : s.state === 'current' ? ' (next)' : ''}</span>
                </span>
                <span className="text-muted-sm">{s.detail}</span>
              </span>
            </>
          );
          return (
            <li key={s.key} className={`plan__step plan__step--${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
              {s.to ? (
                <Link to={s.to} className="plan__link">
                  {body}
                </Link>
              ) : (
                <span className="plan__link">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
