import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAccount } from '../../account/AccountContext';
import { ApiError } from '../../account/api';
import { helpApi } from '../../help/api';
import { Button } from '../../components/Button';
import { CodeField, PasswordField } from '../../components/forms';
import { isStarted, useIntake } from '../../intake/IntakeContext';
import { safeNext } from '../../lib/links';
import { AuthError, AuthLayout, AuthNote } from './AuthLayout';

const NOTICES: Record<string, string> = {
  reset: 'Password changed and every device signed out. Sign in with your new password.',
  deleted: 'Your account was deleted.',
  'signed-out': 'You’re signed out.',
  expired: 'Your session ended. Sign in again to continue.',
};

export default function SignIn() {
  const { status, signIn, completeSignIn, dev, apply } = useAccount();
  const { intake, mode } = useIntake();
  const [params] = useSearchParams();
  const location = useLocation();
  const state = (location.state ?? {}) as { email?: string; notice?: string };
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();

  const [email, setEmail] = useState(state.email ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notice = NOTICES[state.notice ?? params.get('notice') ?? ''];

  if (status === 'signed-in' && !busy) return <Navigate to={next} replace />;

  const submitPassword = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await signIn(email.trim(), password, remember);
      if ('ticket' in r) {
        setTicket(r.ticket);
        setPassword('');
        setBusy(false);
      } else navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!ticket) return;
    setBusy(true);
    setError(null);
    try {
      const r = await completeSignIn(ticket, code.trim());
      if (r.recoveryCodesLeft !== undefined)
        navigate('/app/settings/security', { replace: true, state: { recoveryLeft: r.recoveryCodesLeft } });
      else navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'mfa_expired') {
        setTicket(null);
        setCode('');
      }
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  /** Dev mode only: a ready-made customer or Biomedix admin account. */
  const demo = async (as: 'user' | 'admin') => {
    setBusy(true);
    setError(null);
    try {
      apply(await helpApi.demo(as));
      navigate(as === 'admin' ? '/staff' : '/app/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const nextQuery = params.get('next') ? `?next=${encodeURIComponent(next)}` : '';

  if (ticket)
    return (
      <AuthLayout eyebrow="SIGN IN" title="One more step." cardTitle="Two-factor authentication">
        <form
          className="stack auth__form"
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode();
          }}
        >
          <p className="text-muted-sm">
            {recovery
              ? 'Enter one of the recovery codes you saved when you turned on two-factor. Each code works once.'
              : 'Open your authenticator app and enter the 6-digit code for Biomedix.'}
          </p>
          <CodeField id="signin-code" value={code} onChange={setCode} allowRecovery={recovery} />
          {error && <AuthError>{error}</AuthError>}
          <Button type="submit" size="lg" disabled={busy || !code.trim()}>
            {busy ? 'Checking…' : 'Verify and sign in'}
          </Button>
        </form>
        <div className="auth__links">
          <button type="button" className="link-button" onClick={() => setRecovery((v) => !v)}>
            {recovery ? 'Use my authenticator app' : 'Use a recovery code'}
          </button>
          <button
            type="button"
            className="link-button link-button--muted"
            onClick={() => {
              setTicket(null);
              setCode('');
              setError(null);
            }}
          >
            Back
          </button>
        </div>
        <p className="text-muted-sm">
          Lost your phone and your recovery codes? Contact your company’s Biomedix owner or Biomedix support to regain access.
        </p>
      </AuthLayout>
    );

  return (
    <AuthLayout
      eyebrow="SIGN IN"
      title="Pick up where you left off."
      points={[
        'One next step, every time you sign in',
        'Send drafts to a Biomedix engineer for review',
        'Approve documents with an e-signature',
      ]}
      cardTitle="Sign in to Biomedix"
      foot={
        <>
          <p className="text-muted-sm auth__switch">
            New to Biomedix? <Link to={`/sign-up${nextQuery}`}>Create an account</Link>
          </p>
          <Link to="/app/suite" className="text-muted-sm auth__skip">
            Continue without an account
          </Link>
        </>
      }
    >
      {status === 'unavailable' ? (
        <p className="notice notice--warn">
          Accounts aren’t available on this server. You can keep working without one: your answers stay in this browser.{' '}
          <Link to="/app/suite">Back to the app</Link>
        </p>
      ) : (
        <form
          className="stack auth__form"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPassword();
          }}
        >
          {notice && <AuthNote>{notice}</AuthNote>}
          <div className="field">
            <label htmlFor="signin-email" className="field__label">
              Work email
            </label>
            <input
              id="signin-email"
              type="email"
              className="input"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <PasswordField id="signin-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <div className="auth__row">
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Keep me signed in for 30 days</span>
            </label>
            <Link to="/forgot-password" state={{ email }} className="auth__forgot">
              Forgot password?
            </Link>
          </div>
          {mode === 'guest' && isStarted(intake) && (
            <p className="text-muted-sm">After you sign in, you can save the answers you’ve entered in this browser as a project.</p>
          )}
          {error && <AuthError>{error}</AuthError>}
          <Button type="submit" size="lg" disabled={busy || status === 'loading'}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          {!remember && <p className="text-muted-sm">On a shared computer: you’ll be signed out after 12 hours or when the browser closes.</p>}
          {dev && (
            <div className="stack demo-logins">
              <span className="demo-logins__label">Demo mode: sign in with one click</span>
              <div className="button-row button-row--tight">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void demo('user')}>
                  Demo customer
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void demo('admin')}>
                  Demo Biomedix admin
                </Button>
              </div>
              <span className="text-muted-sm">Only shown while the dev mailbox is on. Turn it off before sharing a public link.</span>
            </div>
          )}
        </form>
      )}
    </AuthLayout>
  );
}
