import { useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { CHECK_LABEL, REVIEW_ITEMS, STEP_FILTERS, STEP_LABEL, type ReviewItem } from '../data/reviewQueue';
import { AGENT_FOR_PROCEDURE } from '../data/procedures';
import { useIntake } from '../intake/IntakeContext';
import { TOKENS, type TokenValues } from '../intake/derive';
import type { GeneratedDoc } from '../templates/generate';
import '../styles/app.css';

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

/** Turn a customer-submitted tailored draft into a queue item. */
function itemFromDoc(doc: GeneratedDoc, at: string, tokens: TokenValues): ReviewItem {
  const val = (k: keyof typeof TOKENS) => tokens[k]?.value ?? `[${TOKENS[k].label}]`;
  const derivedUsed = doc.used.filter((k) => tokens[k]?.auto && !doc.missing.includes(k));
  return {
    key: `doc-${doc.proc.id}`,
    agent: AGENT_FOR_PROCEDURE[doc.proc.id] ?? 'Trace agent',
    age: ago(at),
    step: 'review',
    ref: `${doc.proc.id} · Rev A`,
    title: `${doc.proc.title}, tailored for ${val('device')}`,
    summary: `Procedure drafted from ${val('company')}'s setup answers and submitted by the customer. ${doc.filledPct}% of values were filled automatically.`,
    fields: [
      ['Document', `${doc.proc.id} ${doc.proc.title}`],
      ['Device', val('device')],
      ['Owner', val(doc.ownerToken)],
      ['Approver', val('mgmtRep')],
      ['Sections', String(doc.sections.length)],
      ['Values filled', `${doc.used.length - doc.missing.length} of ${doc.used.length}`],
    ],
    reasoning:
      'Sections follow the Biomedix template for this procedure. Values come from the setup answers; derived values such as safety class and cyber status are proposals the customer has not confirmed.',
    sources: doc.proc.basis.split(';').map((s) => s.trim()),
    checks: [
      ['pass', 'All template sections present'] as ['pass', string],
      ...doc.missing.map((k) => ['gap', `${TOKENS[k].label} not provided`] as ['gap', string]),
      ...derivedUsed.slice(0, 3).map((k) => ['note', `${TOKENS[k].label} derived by the agent`] as ['note', string]),
    ],
  };
}

type StepState = 'active' | 'done' | 'waiting' | 'returned';

function signOffPath(item: ReviewItem): { review: [StepState, string]; approval: [StepState, string] } {
  const review: [StepState, string] =
    item.step === 'review'
      ? ['active', 'In your queue']
      : item.step === 'returned'
        ? ['returned', 'Returned with comments']
        : ['done', 'Signed · [Reviewer name]'];
  const approval: [StepState, string] =
    item.step === 'approval' ? ['active', 'Waiting on [approver]'] : ['waiting', 'Locked until review is signed'];
  return { review, approval };
}

export default function ReviewQueue() {
  const { suite, submitted, tokens } = useIntake();
  const items = useMemo(() => {
    const fromCustomer = submitted.flatMap((s) => {
      const doc = suite.docs.find((d) => d.proc.id === s.id);
      return doc ? [itemFromDoc(doc, s.at, tokens)] : [];
    });
    return [...fromCustomer, ...REVIEW_ITEMS];
  }, [submitted, suite, tokens]);
  const [selectedKey, setSelectedKey] = useState(items[0].key);
  const current = items.find((i) => i.key === selectedKey) ?? items[0];
  const path = signOffPath(current);

  return (
    <AppShell
      project="[Company] · ECG patch SaMD"
      user={{ initials: 'BE', label: 'Signed in as a Biomedix reviewer' }}
    >
      <aside aria-label="Queue" className="app-sidebar app-sidebar--wide app-sidebar--sticky">
        <div className="stack app-sidebar__head">
          <h1 className="app-sidebar__title">Review queue</h1>
          <span className="app-sidebar__sub">Agent outputs waiting on a person</span>
        </div>
        <div role="group" aria-label="Filter by step" className="app-sidebar__pills">
          {STEP_FILTERS.map((f, i) => (
            <span key={f.step} className={`pill${i === 0 ? ' pill--active' : ''}`}>
              {f.label} · {items.filter((it) => it.step === f.step).length}
            </span>
          ))}
        </div>
        <div className="stack queue">
          {items.map((item) => {
            const on = item.key === selectedKey;
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
        </div>
      </aside>

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
            <span className="signoff__label">3 · [COMPANY] APPROVAL</span>
            <span className="signoff__status">{path.approval[1]}</span>
          </li>
        </ol>

        <div className="stack record-head">
          <div className="record-head__meta">
            <span className="mono record-head__ref">{current.ref}</span>
            <span className="record-head__ai">AI-generated · model [version]</span>
          </div>
          <h2 className="record-head__title">{current.title}</h2>
          <p className="record-head__summary">{current.summary}</p>
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
            Signing records a Part 11 e-signature with the meaning <strong>Technical review</strong>. It does not approve
            the record; approval stays with [Company].
          </p>
          <div className="button-row">
            <Button variant="bright">Sign technical review</Button>
            <Button variant="outline-night">Return to agent with comments</Button>
            <Button variant="text-night">Edit draft</Button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
