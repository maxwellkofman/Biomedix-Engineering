import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAccount } from '../account/AccountContext';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { isStarted, useIntake } from '../intake/IntakeContext';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/account.css';

/** Only same-site paths, so ?next= can't send someone to another site. */
function safeNext(raw: string | null) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/app/suite';
}

export default function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { status, signIn, signUp } = useAccount();
  const { intake, mode: workMode } = useIntake();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signingUp = mode === 'sign-up';
  const hasLocal = workMode === 'guest' && isStarted(intake);

  if (status === 'signed-in' && !busy) return <Navigate to={next} replace />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (signingUp) await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const other = `${signingUp ? '/sign-in' : '/sign-up'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <div className="auth">
      <header className="auth__top">
        <Logo variant="app" />
      </header>
      <main className="auth__main">
        <div className="auth__intro">
          <span className="eyebrow eyebrow--on-night">{signingUp ? 'CREATE AN ACCOUNT' : 'SIGN IN'}</span>
          <h1 className="auth__title">
            {signingUp ? 'Keep every run of your documentation.' : 'Pick up where you left off.'}
          </h1>
          <ul className="list-reset stack auth__points">
            <li>Answers save as you type, on any device</li>
            <li>Each run keeps a draft of every document that changed</li>
            <li>Send drafts for technical review and record approval</li>
            <li>See your compliance readiness climb to 100%</li>
          </ul>
        </div>

        <section className="card auth__card" aria-labelledby="auth-h">
          <h2 id="auth-h" className="card__title">
            {signingUp ? 'Create your account' : 'Sign in to Biomedix'}
          </h2>
          {status === 'unavailable' ? (
            <p className="notice notice--warn">
              Accounts aren’t available on this server. You can keep working without one: your answers stay in this
              browser. <Link to="/app/suite">Back to the app</Link>
            </p>
          ) : (
            <form
              className="stack auth__form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {signingUp && (
                <div className="field">
                  <label htmlFor="auth-name" className="field__label">
                    Your name
                  </label>
                  <input
                    id="auth-name"
                    className="input"
                    autoComplete="name"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="auth-email" className="field__label">
                  Work email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="auth-password" className="field__label">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  className="input"
                  autoComplete={signingUp ? 'new-password' : 'current-password'}
                  required
                  minLength={signingUp ? 12 : undefined}
                  aria-describedby={signingUp ? 'auth-password-hint' : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {signingUp && (
                  <p id="auth-password-hint" className="field__hint">
                    At least 12 characters. A short sentence works well.
                  </p>
                )}
              </div>
              {hasLocal && (
                <p className="text-muted-sm">
                  {signingUp
                    ? 'The answers you’ve entered in this browser become your first project.'
                    : 'After you sign in, you can save the answers you’ve entered in this browser as a project.'}
                </p>
              )}
              {error && (
                <p role="alert" className="auth__error">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" disabled={busy || status === 'loading'}>
                {busy ? (signingUp ? 'Creating account…' : 'Signing in…') : signingUp ? 'Create account' : 'Sign in'}
              </Button>
            </form>
          )}
          <p className="text-muted-sm auth__switch">
            {signingUp ? 'Already have an account?' : 'New to Biomedix?'} <Link to={other}>{signingUp ? 'Sign in' : 'Create an account'}</Link>
          </p>
          <Link to="/app/suite" className="text-muted-sm auth__skip">
            Continue without an account
          </Link>
        </section>
      </main>
    </div>
  );
}
