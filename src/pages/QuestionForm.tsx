import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { QuestionGroupCard } from '../components/Questions';
import { SuitePreview } from '../components/SuitePreview';
import { useIntake } from '../intake/IntakeContext';
import { STEPS } from '../intake/model';
import { GROUPS, progress } from '../intake/questions';
import { useCreateDocs } from '../intake/useCreateDocs';
import { ResetButton, useFocusFromHash } from './Setup';
import '../styles/app.css';
import '../styles/flow.css';

/** All questions on one page. Answer what you can, then create the documentation. */
export default function QuestionForm() {
  const { intake, derived, tokens, suite, loadExample, mode, runs } = useIntake();
  const { create, busy, error } = useCreateDocs();
  useFocusFromHash('form');
  const ctx = { ix: intake, d: derived, tokens };
  const all = progress(ctx);

  return (
    <AppShell>
      <aside aria-label="Form sections" className="app-sidebar app-sidebar--sticky">
        <div className="stack app-sidebar__head">
          <h1 className="app-sidebar__title">QMS questionnaire</h1>
          <span className="app-sidebar__sub">
            {all.done} of {all.total} questions answered
          </span>
        </div>
        <div className="meter form-meter" aria-hidden="true">
          <span className="meter__fill" style={{ width: `${all.total ? (all.done / all.total) * 100 : 0}%` }} />
        </div>
        <nav aria-label="Jump to section">
          <ol className="list-reset stack steps">
            {STEPS.map((s, i) => {
              const { done, total } = progress(ctx, s.id);
              return (
                <li key={s.id}>
                  <a href={`#sec-${s.id}`} className="steps__item">
                    <span className={`steps__num${total && done === total ? ' steps__num--done' : ''}`}>{i + 1}</span>
                    <span className="stack">
                      <span className="steps__label">{s.label}</span>
                      <span className="steps__count">
                        {done} of {total} answered
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="steps__tools">
          <Button variant="outline" size="sm" onClick={loadExample}>
            Fill with example
          </Button>
          <ResetButton to="/app/form" />
        </div>
        <Link to="/app/setup/company" className="switch-link">
          Prefer one step at a time? Switch to guided setup →
        </Link>
      </aside>

      <main className="app-main setup-main">
        <div className="stack setup-main__head">
          <span className="eyebrow">QMS QUESTIONNAIRE</span>
          <h2 className="setup-main__title">Answer what you know. We draft the rest.</h2>
          <p className="setup-main__blurb">
            Every answer fills the documents listed under it. Skip anything you're unsure of: the agents propose common
            defaults and flag what still needs a person.
          </p>
        </div>

        <form
          className="stack setup-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          {STEPS.map((s, i) => (
            <div key={s.id} id={`sec-${s.id}`} className="stack form-section">
              <div className="form-section__head">
                <span className="mono form-section__num">{String(i + 1).padStart(2, '0')}</span>
                <span className="stack">
                  <h3 className="form-section__title">{s.label}</h3>
                  <span className="text-muted-sm">{s.blurb}</span>
                </span>
              </div>
              {GROUPS.filter((g) => g.step === s.id).map((g) => (
                <QuestionGroupCard key={g.title} group={g} showFills />
              ))}
            </div>
          ))}

          <section className="card card--night create-panel">
            <div className="stack create-panel__copy">
              <h3 className="create-panel__title">Create my documentation</h3>
              <p className="create-panel__text">
                {suite.applicable.length} procedures will be drafted for your device, {suite.filledPct}% filled from your
                answers. {suite.notApplicable > 0 && `${suite.notApplicable} don't apply and are justified in the quality manual. `}
                {mode === 'account'
                  ? `Saved to your account as run ${(runs[0]?.number ?? 0) + 1}. Change answers any time and create again: documents that change get a new draft.`
                  : 'You can come back and change answers at any time.'}
              </p>
              {error && (
                <p role="alert" className="create-panel__error">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" variant="bright" size="lg" disabled={busy}>
              {busy ? 'Saving run…' : 'Create documentation →'}
            </Button>
          </section>
        </form>
      </main>

      <SuitePreview>
        <Button size="sm" onClick={() => void create()} disabled={busy}>
          {busy ? 'Saving run…' : 'Create documentation'}
        </Button>
      </SuitePreview>
    </AppShell>
  );
}
