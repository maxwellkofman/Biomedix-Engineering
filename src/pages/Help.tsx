import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccount } from '../account/AccountContext';
import { AppShell } from '../components/AppShell';
import { AskForm, ThreadList, ThreadView } from '../components/AskEngineer';
import { ButtonLink } from '../components/Button';
import { helpApi, type Thread } from '../help/api';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/account.css';
import '../styles/clean.css';

/** /app/help — every question the company has asked a Biomedix engineer, with the answers. */
export default function Help() {
  const { status, org } = useAccount();
  const [params, setParams] = useSearchParams();
  const selected = params.get('open');
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!org) return;
    helpApi
      .list(org.id)
      .then((r) => {
        setThreads(r.threads);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [org]);
  useEffect(load, [load]);

  const select = (id: string | null) => setParams(id ? { open: id } : {}, { replace: true });
  const signedIn = status === 'signed-in' && !!org;

  return (
    <AppShell>
      <main className="app-main help-main">
        <div className="stack home-head__copy">
          <span className="eyebrow">HELP FROM A PERSON</span>
          <h1 className="home-head__title">Ask a Biomedix engineer</h1>
          <p className="setup-main__blurb">
            The agent drafts your documents. Engineers answer questions, review every document, and can walk you through anything on a call.
          </p>
        </div>

        {!signedIn ? (
          <section className="card stack help-guest">
            <p>
              {status === 'signed-in'
                ? 'Create or join a company to send questions to an engineer.'
                : 'Sign in to send a question, or book a call and talk an engineer through your device.'}
            </p>
            <div className="button-row">
              {status !== 'signed-in' && <ButtonLink to="/sign-in?next=/app/help">Sign in</ButtonLink>}
              <ButtonLink to="/demo" variant="outline">
                Book a call
              </ButtonLink>
              <ButtonLink to="/gap-scan" variant="text">
                Free gap scan of your files
              </ButtonLink>
            </div>
          </section>
        ) : (
          <div className="help-grid">
            <div className="stack">
              <section className="card card--compact stack" aria-labelledby="ask-h">
                <h2 id="ask-h" className="card__title card__title--sm">
                  New question
                </h2>
                <AskForm
                  id="ask-page"
                  onSent={(d) => {
                    load();
                    select(d.thread.id);
                  }}
                />
              </section>
              <section className="stack" aria-labelledby="threads-h">
                <h2 id="threads-h" className="card__title card__title--sm">
                  Your company’s questions
                </h2>
                {error && (
                  <p role="alert" className="notice notice--warn">
                    {error}
                  </p>
                )}
                {threads && threads.length === 0 && <p className="text-muted-sm">None yet.</p>}
                {threads && threads.length > 0 && <ThreadList threads={threads} selected={selected} onSelect={select} />}
              </section>
              <p className="text-muted-sm">
                Prefer to talk? <a href="/demo">Book a call</a>, or send files for a <a href="/gap-scan">free gap scan</a>.
              </p>
            </div>
            <section className="card stack help-detail" aria-live="polite">
              {selected ? (
                <ThreadView key={selected} id={selected} onChange={load} />
              ) : (
                <p className="text-muted-sm">Select a question to read the answer and reply.</p>
              )}
            </section>
          </div>
        )}
      </main>
    </AppShell>
  );
}
