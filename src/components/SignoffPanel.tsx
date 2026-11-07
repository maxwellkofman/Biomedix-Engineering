import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useIntake } from '../intake/IntakeContext';
import { TOKENS, type TokenKey } from '../intake/derive';
import { docHref, missingHref } from '../lib/links';
import type { GeneratedDoc } from '../templates/generate';
import { Button, ButtonLink } from './Button';
import { formatDate } from './Lifecycle';

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** Save → technical review → approval, for one document. */
export function SignoffPanel({ doc }: { doc: GeneratedDoc }) {
  const { mode, lives, readiness, tokens, createRun, signoff } = useIntake();
  const life = lives[doc.proc.id];
  const score = readiness.docs.find((d) => d.doc.proc.id === doc.proc.id);
  const act = useAction();
  const [approver, setApprover] = useState(tokens.mgmtRep?.value ?? '');
  const [method, setMethod] = useState(tokens.eSignature?.value ?? '');
  const [reference, setReference] = useState('');
  const id = doc.proc.id;

  const body = (() => {
    if (mode === 'guest') {
      return (
        <>
          <p className="oversight-panel__offer oversight-panel__offer--flush">
            Create a free account to save drafts, send them to a Biomedix engineer for technical review and record your
            approval.
          </p>
          <ButtonLink to={`/sign-up?next=${encodeURIComponent(docHref(id))}`} variant="bright" size="sm">
            Create an account
          </ButtonLink>
          <Link to={`/sign-in?next=${encodeURIComponent(docHref(id))}`} className="oversight-panel__link">
            I have an account
          </Link>
        </>
      );
    }
    if (!life?.latest || life.changed) {
      const nextDraft = (life?.latest?.draft ?? 0) + 1;
      return (
        <>
          <p className="oversight-panel__offer oversight-panel__offer--flush">
            {life?.latest
              ? `Your answers changed this document since draft ${life.latest.draft}. Save a run to create draft ${nextDraft}; sign-offs on draft ${life.latest.draft} don't carry over.`
              : 'Save a run to create draft 1. Saved drafts can be sent for technical review.'}
          </p>
          <Button variant="bright" size="sm" disabled={act.busy} onClick={() => act.run(() => createRun())}>
            {act.busy ? 'Saving…' : `Save run · draft ${nextDraft}`}
          </Button>
        </>
      );
    }
    const n = life.latest.draft;
    switch (life.stage) {
      case 'draft':
        return (
          <>
            <p className="oversight-panel__offer oversight-panel__offer--flush">
              A Biomedix engineer reviews draft {n} and signs a technical review. Approval stays with{' '}
              {tokens.mgmtRep?.value ?? 'your management representative'}.
            </p>
            <Button variant="bright" size="sm" disabled={act.busy} onClick={() => act.run(() => signoff(id, 'submit'))}>
              {act.busy ? 'Sending…' : `Submit draft ${n} for technical review`}
            </Button>
            {score && !score.complete && (
              <span className="oversight-panel__fine">
                You can submit with gaps; the reviewer will return it with comments.
              </span>
            )}
          </>
        );
      case 'submitted':
        return (
          <>
            <p className="oversight-panel__offer oversight-panel__offer--flush">
              Draft {n} is with Biomedix technical review since {formatDate(life.history[life.history.length - 1].createdAt)}.
            </p>
            <ButtonLink to="/app/review" variant="outline-night" size="sm">
              Open review queue
            </ButtonLink>
          </>
        );
      case 'returned':
        return (
          <>
            <blockquote className="oversight-panel__quote">
              {life.returned?.note}
              <footer>
                {life.returned?.signer}, {life.returned && formatDate(life.returned.createdAt)}
              </footer>
            </blockquote>
            <p className="oversight-panel__fine">
              Change the answers the reviewer asked about, then save a run to create draft {n + 1}.
            </p>
            <div className="button-row button-row--tight">
              <ButtonLink to="/app/form" variant="bright" size="sm">
                Edit answers
              </ButtonLink>
              <Button
                variant="outline-night"
                size="sm"
                disabled={act.busy}
                onClick={() => act.run(() => signoff(id, 'submit'))}
              >
                Resubmit as is
              </Button>
            </div>
          </>
        );
      case 'reviewed':
        return (
          <form
            className="stack approval-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act.run(() => signoff(id, 'approve', { signer: approver, method, reference }));
            }}
          >
            <p className="oversight-panel__offer oversight-panel__offer--flush">
              Technical review signed by {life.review?.signer} on {life.review && formatDate(life.review.createdAt, false)}.
              Record your approval once it's signed.
            </p>
            <label className="field__label" htmlFor={`approver-${id}`}>
              Approver
            </label>
            <input
              id={`approver-${id}`}
              className="input input--night"
              value={approver}
              required
              onChange={(e) => setApprover(e.target.value)}
            />
            <label className="field__label" htmlFor={`method-${id}`}>
              Signed with
            </label>
            <input
              id={`method-${id}`}
              className="input input--night"
              value={method}
              placeholder="e.g. DocuSign with its Part 11 module"
              onChange={(e) => setMethod(e.target.value)}
            />
            <label className="field__label" htmlFor={`ref-${id}`}>
              Signature reference
            </label>
            <input
              id={`ref-${id}`}
              className="input input--night"
              value={reference}
              placeholder="Envelope or agreement ID"
              onChange={(e) => setReference(e.target.value)}
            />
            <Button type="submit" variant="bright" size="sm" disabled={act.busy || !approver.trim()}>
              {act.busy ? 'Recording…' : `Record approval of draft ${n}`}
            </Button>
            <span className="oversight-panel__fine">
              The signature itself stays in your e-signature system; this records who approved which draft.
            </span>
          </form>
        );
      case 'approved':
        return (
          <>
            <p className="oversight-panel__offer oversight-panel__offer--flush">
              Draft {n} approved by {life.approval?.signer} on {life.approval && formatDate(life.approval.createdAt, false)}
              {life.approval?.method ? ` (${life.approval.method}${life.approval.reference ? `, ${life.approval.reference}` : ''})` : ''}.
            </p>
            <span className="oversight-panel__fine">
              If an answer this document uses changes, the next run creates a new draft that needs review again.
            </span>
          </>
        );
    }
  })();

  return (
    <section className="card card--night card--compact oversight-panel" aria-labelledby={`signoff-${id}`}>
      <h2 id={`signoff-${id}`} className="card__title card__title--sm">
        Sign-off
      </h2>
      {mode === 'account' && life?.latest && (
        <ol className="list-reset signoff-mini" aria-label="Sign-off path">
          {(
            [
              ['Saved', true],
              ['Reviewed', !!life.review && !life.changed],
              ['Approved', !!life.approval && !life.changed],
            ] as const
          ).map(([label, done]) => (
            <li key={label} className={done ? 'signoff-mini__done' : undefined}>
              {label}
            </li>
          ))}
        </ol>
      )}
      {body}
      {act.error && (
        <p role="alert" className="oversight-panel__error">
          {act.error}
        </p>
      )}
      {mode === 'account' && life?.latest && (
        <Link to={`${docHref(id)}/history`} className="oversight-panel__link">
          Revision history · {life.latest.draft} draft{life.latest.draft > 1 ? 's' : ''} →
        </Link>
      )}
    </section>
  );
}

/** Values the agent derived, with a confirm action for each. */
export function ProposalList({ keys, compact = false }: { keys: TokenKey[]; compact?: boolean }) {
  const { tokens, confirm, unconfirm } = useIntake();
  const open = keys.filter((k) => !tokens[k]?.confirmed);
  if (!keys.length) return null;
  return (
    <div className={`stack proposals${compact ? ' proposals--compact' : ''}`}>
      <ul className="list-reset stack proposals__list">
        {keys.map((k) => {
          const v = tokens[k];
          if (!v) return null;
          return (
            <li key={k} className={`proposal${v.confirmed ? ' proposal--done' : ''}`}>
              <span className="stack proposal__text">
                <span className="proposal__label">{TOKENS[k].label}</span>
                <span className={compact ? 'proposal__value proposal__value--sm' : 'proposal__value'}>{v.value}</span>
              </span>
              <span className="proposal__actions">
                {v.confirmed ? (
                  <>
                    <span className="proposal__ok">Confirmed</span>
                    <Button variant="text" size="sm" onClick={() => unconfirm(k)}>
                      Undo
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => confirm([k])}>
                      Confirm
                    </Button>
                    <Link to={missingHref(k)} className="proposal__change">
                      Change
                    </Link>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {open.length > 1 && (
        <Button variant="primary" size="sm" onClick={() => confirm(open)}>
          Confirm all {open.length}
        </Button>
      )}
    </div>
  );
}
