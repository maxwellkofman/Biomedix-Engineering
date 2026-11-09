import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../account/AccountContext';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { CHECK_LABEL, REVIEW_ITEMS, STEP_FILTERS, STEP_LABEL, type ReviewItem, type ReviewStep } from '../data/reviewQueue';
import { AGENT_FOR_PROCEDURE } from '../data/procedures';
import type { DocReadiness } from '../compliance/readiness';
import { useIntake } from '../intake/IntakeContext';
import { TOKENS, type TokenValues } from '../intake/derive';
import { docHref } from '../lib/links';
import '../styles/app.css';

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

interface QueueItem extends ReviewItem {
  /** Set for the customer's own saved drafts; unset for the example items. */
  docId?: string;
  draft?: number;
  reviewer?: string;
  returnNote?: string;
}

const STEP_FOR_STAGE: Partial<Record<string, ReviewStep>> = {
  submitted: 'review',
  reviewed: 'approval',
  returned: 'returned',
};

/** Turn a submitted draft into a queue item. */
function itemFromDoc(d: DocReadiness, tokens: TokenValues): QueueItem | null {
  const { doc, life } = d;
  const step = STEP_FOR_STAGE[life.stage];
  if (!life.latest || !step) return null;
  const val = (k: keyof typeof TOKENS) => tokens[k]?.value ?? `[${TOKENS[k].label}]`;
  const derivedUsed = d.unconfirmed;
  const last = life.history[life.history.length - 1];
  return {
    key: `doc-${doc.proc.id}`,
    docId: doc.proc.id,
    draft: life.latest.draft,
    reviewer: life.review?.signer,
    returnNote: life.returned?.note,
    agent: AGENT_FOR_PROCEDURE[doc.proc.id] ?? 'Trace agent',
    age: ago(last.createdAt),
    step,
    ref: `${doc.proc.id} · Rev A, draft ${life.latest.draft}`,
    title: `${doc.proc.title}, tailored for ${val('device')}`,
    summary: doc.progress
      ? `${doc.proc.title} completed by ${val('company')} in the ${doc.progress.name} and submitted. ${doc.progress.done} of ${doc.progress.total} items done.`
      : `Procedure drafted from ${val('company')}'s setup answers and submitted by the customer. ${life.latest.filledPct}% of values were filled automatically.`,
    fields: [
      ['Document', `${doc.proc.id} ${doc.proc.title}`],
      ['Device', val('device')],
      ['Draft', `${life.latest.draft}, saved in run ${life.latest.runNumber}`],
      ['Owner', val(doc.ownerToken)],
      ['Approver', val('mgmtRep')],
      ['Sections', String(doc.sections.length)],
      ['Values filled', `${doc.used.length - doc.missing.length} of ${doc.used.length}`],
      ...(doc.progress ? [['Assessment items', `${doc.progress.done} of ${doc.progress.total}`] as [string, string]] : []),
    ],
    reasoning:
      'Sections follow the Biomedix template for this procedure. Values come from the setup answers; derived values such as safety class and cyber status are proposals until the customer confirms them.',
    sources: doc.proc.basis.split(';').map((s) => s.trim()),
    checks: [
      ['pass', 'All template sections present'] as ['pass', string],
      ...(life.changed ? [['note', 'Customer has changed answers since this draft'] as ['note', string]] : []),
      ...doc.missing.map((k) => ['gap', `${TOKENS[k].label} not provided`] as ['gap', string]),
      ...(doc.progress?.todo ?? []).slice(0, 5).map((t) => ['gap', t.label] as ['gap', string]),
      ...(doc.progress?.suggested ? [['note', `${doc.progress.suggested} agent suggestions not confirmed by the customer`] as ['note', string]] : []),
      ...derivedUsed.slice(0, 3).map((k) => ['note', `${TOKENS[k].label} derived by the agent, not confirmed`] as ['note', string]),
    ],
  };
}

type StepState = 'active' | 'done' | 'waiting' | 'returned';

function signOffPath(item: QueueItem, company: string): { review: [StepState, string]; approval: [StepState, string] } {
  const review: [StepState, string] =
    item.step === 'review'
      ? ['active', item.docId ? 'With a Biomedix engineer' : 'In your queue']
      : item.step === 'returned'
        ? ['returned', 'Returned with comments']
        : ['done', `Signed · ${item.reviewer ?? '[Reviewer name]'}`];
  const approval: [StepState, string] =
    item.step === 'approval'
      ? ['active', `Waiting on ${item.docId ? company : '[approver]'}`]
      : ['waiting', 'Locked until review is signed'];
  return { review, approval };
}

export default function ReviewQueue() {
  const { user } = useAccount();
  const { readiness, tokens, mode, canApprove, approvers, projectId } = useIntake();
  const items = useMemo<QueueItem[]>(() => {
    if (mode === 'guest') return REVIEW_ITEMS;
    return readiness.docs.flatMap((d) => {
      const it = itemFromDoc(d, tokens);
      return it ? [it] : [];
    });
  }, [mode, readiness, tokens]);
  const [filter, setFilter] = useState<ReviewStep>('review');
  const shown = items.filter((i) => i.step === filter);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const current = shown.find((i) => i.key === selectedKey) ?? shown[0];
  const company = tokens.company?.value ?? '[Company]';

  const path = current ? signOffPath(current, company) : null;

  return (
    <AppShell>
      <aside aria-label="Queue" className="app-sidebar app-sidebar--wide app-sidebar--sticky">
        <div className="stack app-sidebar__head">
          <h1 className="app-sidebar__title">Review queue</h1>
          <span className="app-sidebar__sub">Agent outputs waiting on a person</span>
        </div>
        <div role="group" aria-label="Filter by step" className="app-sidebar__pills">
          {STEP_FILTERS.map((f) => (
            <button
              key={f.step}
              type="button"
              aria-pressed={filter === f.step}
              onClick={() => setFilter(f.step)}
              className={`pill${filter === f.step ? ' pill--active' : ''}`}
            >
              {f.label} · {items.filter((it) => it.step === f.step).length}
            </button>
          ))}
        </div>
        <div className="stack queue">
          {shown.map((item) => {
            const on = item.key === current?.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedKey(item.key)}
                className={`queue-item${on ? ' queue-item--on' : ''}`}
              >
                <span className="queue-item__meta">
                  <span className="mono queue-item__agent">{item.agent}</span>
                  <span>{item.age}</span>
                </span>
                <span className="queue-item__title">{item.title}</span>
                <span className="queue-item__step">{STEP_LABEL[item.step]}</span>
              </button>
            );
          })}
          {!shown.length && <p className="text-muted-sm queue-empty">Nothing here.</p>}
        </div>
        {mode === 'guest' && (
          <p className="text-muted-sm">
            Example items. <Link to="/sign-up?next=/app/review">Create an account</Link> to send your own documents for
            review.
          </p>
        )}
      </aside>

      {!current || !path ? (
        <main className="app-main queue-empty-main">
          <span className="eyebrow">REVIEW QUEUE</span>
          <h2 className="setup-main__title">
            {items.length ? 'Nothing in this list.' : 'No documents waiting on review.'}
          </h2>
          <p className="setup-main__blurb">
            {items.length
              ? 'Pick another list on the left.'
              : 'Documents you submit for technical review show up here. Complete drafts are ready to send from the readiness page.'}
          </p>
          <div className="button-row">
            <ButtonLink to="/app/readiness">Open readiness</ButtonLink>
            <ButtonLink to="/app/suite" variant="outline">
              Documentation suite
            </ButtonLink>
          </div>
        </main>
      ) : (
      <main className="app-main">
        <ol aria-label="Sign-off path" className="list-reset signoff">
          <li className="signoff__step signoff__step--done">
            <span className="signoff__label">1 · AGENT DRAFT</span>
            <span className="signoff__status">{current.agent} · done</span>
          </li>
          <li className={`signoff__step signoff__step--${path.review[0]}`}>
            <span className="signoff__label">2 · BIOMEDIX TECHNICAL REVIEW</span>
            <span className="signoff__status">{path.review[1]}</span>
          </li>
          <li className={`signoff__step signoff__step--${path.approval[0]}`}>
            <span className="signoff__label">3 · {current.docId ? company.toUpperCase() : '[COMPANY]'} APPROVAL</span>
            <span className="signoff__status">{path.approval[1]}</span>
          </li>
        </ol>

        <div className="stack record-head">
          <div className="record-head__meta">
            <span className="mono record-head__ref">{current.ref}</span>
            <span className="record-head__ai">{current.docId ? 'AI-generated from setup answers' : 'AI-generated · model [version]'}</span>
          </div>
          <h2 className="record-head__title">{current.title}</h2>
          <p className="record-head__summary">{current.summary}</p>
          {current.docId && (
            <Link to={docHref(current.docId)} className="record-head__open">
              Open the full document →
            </Link>
          )}
        </div>

        <div className="review-grid">
          <section aria-labelledby="draft-h" className="card card--compact">
            <h3 id="draft-h" className="card__title card__title--sm">Proposed by the agent</h3>
            <dl className="deflist">
              {current.fields.map(([k, v]) => (
                <div key={k} className="deflist__row">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="stack review-grid__side">
            <section aria-labelledby="why-h" className="card card--compact card--gap-10">
              <h3 id="why-h" className="card__title card__title--sm">Agent's reasoning and sources</h3>
              <p className="text-sm ink-2">{current.reasoning}</p>
              <div className="tag-row">
                {current.sources.map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>
            </section>
            <section aria-labelledby="checks-h" className="card card--compact card--gap-10">
              <h3 id="checks-h" className="card__title card__title--sm">Automated checks</h3>
              <ul className="list-reset stack checks">
                {current.checks.map(([result, label]) => (
                  <li key={label} className="checks__row">
                    <span className={`badge badge--${result}`}>{CHECK_LABEL[result]}</span>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        {!current.docId ? (
          <section aria-labelledby="sign-h" className="card card--night sign-panel">
            <h3 id="sign-h" className="sign-panel__title">Your review</h3>
            <label htmlFor="review-note" className="sign-panel__label">
              Comments for the agent and the approver
            </label>
            <textarea
              id="review-note"
              rows={3}
              placeholder="What you checked, what you changed, what the approver should know"
              className="sign-panel__input"
            />
            <p className="sign-panel__note">
              Signing records a Part 11 e-signature with the meaning <strong>Technical review</strong>. It does not
              approve the record; approval stays with [Company].
            </p>
            <div className="button-row">
              <Button variant="bright">Sign technical review</Button>
              <Button variant="outline-night">Return to agent with comments</Button>
              <Button variant="text-night">Edit draft</Button>
            </div>
          </section>
        ) : current.step === 'review' ? (
          <section aria-labelledby="sign-h" className="card card--night sign-panel">
            <h3 id="sign-h" className="sign-panel__title">
              With Biomedix technical review
            </h3>
            <p className="sign-panel__note">
              Draft {current.draft} was submitted {current.age.toLowerCase()}. A Biomedix engineer reads it, signs the technical review
              or returns it with comments. Nothing for you to do until then.
            </p>
            {user?.staffRole && (
              <div className="button-row">
                <ButtonLink to={`/staff/reviews?doc=${encodeURIComponent(`${projectId}:${current.docId}`)}`} variant="bright">
                  Open in the reviewer workspace
                </ButtonLink>
              </div>
            )}
          </section>
        ) : (
          <section aria-labelledby="sign-h" className="card card--night sign-panel">
            <h3 id="sign-h" className="sign-panel__title">
              {current.step === 'approval' ? `Waiting on ${company} approval` : 'Returned with comments'}
            </h3>
            <p className="sign-panel__note">
              {current.step === 'approval'
                ? canApprove
                  ? `Technical review signed by ${current.reviewer}. Read the document, then approve it with your password.`
                  : `Technical review signed by ${current.reviewer}. Waiting on ${approvers.length ? approvers.join(', ') : 'an approver'}.`
                : current.returnNote}
            </p>
            <div className="button-row">
              <ButtonLink to={docHref(current.docId)} variant="bright">
                {current.step === 'approval' ? (canApprove ? 'Review and approve' : 'Open the document') : 'Open the document'}
              </ButtonLink>
            </div>
          </section>
        )}
      </main>
      )}
    </AppShell>
  );
}
