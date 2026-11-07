import { useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { QuestionGroupCard } from '../components/Questions';
import { SuitePreview } from '../components/SuitePreview';
import { useIntake } from '../intake/IntakeContext';
import { STEPS } from '../intake/model';
import { GROUPS, progress } from '../intake/questions';
import { useCreateDocs } from '../intake/useCreateDocs';
import '../styles/app.css';
import '../styles/flow.css';

/** Scroll to and focus the field named in the URL hash (used by "needs input" links). */
export function useFocusFromHash(dep: unknown) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.focus({ preventScroll: true });
    }
  }, [dep, hash]);
}

export function ResetButton({ to }: { to: string }) {
  const { reset } = useIntake();
  const navigate = useNavigate();
  return (
    <Button
      variant="text"
      size="sm"
      onClick={() => {
        if (window.confirm('Clear all answers?')) {
          reset();
          navigate(to);
        }
      }}
    >
      Clear answers
    </Button>
  );
}

export default function Setup() {
  const { step } = useParams();
  const { intake, derived, tokens, loadExample } = useIntake();
  const { create, busy, error } = useCreateDocs();
  useFocusFromHash(step);

  const index = STEPS.findIndex((s) => s.id === step);
  if (index === -1) return <Navigate to="/app/setup/company" replace />;
  const current = STEPS[index];
  const next = STEPS[index + 1];
  const prev = STEPS[index - 1];
  const ctx = { ix: intake, d: derived, tokens };

  return (
    <AppShell>
      <aside aria-label="Setup steps" className="app-sidebar app-sidebar--sticky">
        <div className="stack app-sidebar__head">
          <h1 className="app-sidebar__title">Set up your QMS</h1>
          <span className="app-sidebar__sub">Answer once. Agents fill in every procedure.</span>
        </div>
        <ol className="list-reset stack steps">
          {STEPS.map((s, i) => {
            const { done, total } = progress(ctx, s.id);
            const on = s.id === current.id;
            return (
              <li key={s.id}>
                <Link
                  to={`/app/setup/${s.id}`}
                  aria-current={on ? 'step' : undefined}
                  className={`steps__item${on ? ' steps__item--on' : ''}`}
                >
                  <span className={`steps__num${total && done === total ? ' steps__num--done' : ''}`}>{i + 1}</span>
                  <span className="stack">
                    <span className="steps__label">{s.label}</span>
                    <span className="steps__count">
                      {done} of {total} answered
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="steps__tools">
          <Button variant="outline" size="sm" onClick={loadExample}>
            Fill with example
          </Button>
          <ResetButton to="/app/setup/company" />
        </div>
        <Link to="/app/form" className="switch-link">
          Prefer one page? Switch to the form →
        </Link>
      </aside>

      <main className="app-main setup-main">
        <div className="stack setup-main__head">
          <span className="eyebrow">
            STEP {index + 1} OF {STEPS.length}
          </span>
          <h2 className="setup-main__title">{current.label}</h2>
          <p className="setup-main__blurb">{current.blurb}</p>
        </div>

        <form className="stack setup-form" onSubmit={(e) => e.preventDefault()}>
          {GROUPS.filter((g) => g.step === current.id).map((g) => (
            <QuestionGroupCard key={g.title} group={g} />
          ))}
        </form>

        <div className="setup-nav">
          {prev ? (
            <ButtonLink to={`/app/setup/${prev.id}`} variant="outline">
              ← {prev.label}
            </ButtonLink>
          ) : (
            <span />
          )}
          {next ? (
            <ButtonLink to={`/app/setup/${next.id}`} variant="primary">
              Next: {next.label} →
            </ButtonLink>
          ) : (
            <Button variant="primary" onClick={() => void create()} disabled={busy}>
              {busy ? 'Saving run…' : 'Create documentation suite →'}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="notice notice--warn">
            {error}
          </p>
        )}
      </main>

      <SuitePreview />
    </AppShell>
  );
}
