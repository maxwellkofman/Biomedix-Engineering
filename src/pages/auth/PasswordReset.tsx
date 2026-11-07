import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAccount } from '../../account/AccountContext';
import { api } from '../../account/api';
import { Button, ButtonLink } from '../../components/Button';
import { PasswordField } from '../../components/forms';
import { AuthError, AuthLayout, AuthNote } from './AuthLayout';

/** Step 1: ask for a reset link. Always answers the same way, so it can't reveal who has an account. */
export function ForgotPassword() {
  const { dev } = useAccount();
  const location = useLocation();
  const [email, setEmail] = useState(((location.state ?? {}) as { email?: string }).email ?? '');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthLayout
      eyebrow="RESET PASSWORD"
      title="Locked out? It happens."
      cardTitle={sent ? 'Check your inbox' : 'Reset your password'}
      foot={
        <p className="text-muted-sm auth__switch">
          Remembered it? <Link to="/sign-in">Back to sign in</Link>
        </p>
      }
    >
      {sent ? (
        <>
          <AuthNote>
            If {email} has a Biomedix account, we’ve sent it a link to choose a new password. The link works for one hour.
          </AuthNote>
          <p className="text-muted-sm">No email after a few minutes? Check your spam folder, or make sure you used your work address.</p>
          {dev && (
            <ButtonLink to="/dev/mail" variant="outline" size="sm">
              Open the dev mailbox
            </ButtonLink>
          )}
        </>
      ) : (
        <form
          className="stack auth__form"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            api
              .forgotPassword(email.trim())
              .then(() => setSent(true))
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        >
          <p className="text-muted-sm">Enter the email you sign in with and we’ll send you a link to choose a new password.</p>
          <div className="field">
            <label htmlFor="fp-email" className="field__label">
              Work email
            </label>
            <input id="fp-email" type="email" className="input" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <AuthError>{error}</AuthError>}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

/** Step 2: the link from the email. Choosing a new password signs out every device. */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { status, expired } = useAccount();
  const [email, setEmail] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(token ? null : 'This link is incomplete. Copy the whole link from the email.');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .checkReset(token)
      .then((r) => setEmail(r.email))
      .catch((err: Error) => setLinkError(err.message));
  }, [token]);

  return (
    <AuthLayout eyebrow="RESET PASSWORD" title="Choose a new password." cardTitle="New password">
      {linkError ? (
        <>
          <AuthError>{linkError}</AuthError>
          <ButtonLink to="/forgot-password">Send a new link</ButtonLink>
        </>
      ) : !email ? (
        <p className="text-muted-sm">Checking your link…</p>
      ) : (
        <form
          className="stack auth__form"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            api
              .resetPassword(token, password)
              .then((r) => {
                if (status === 'signed-in') expired();
                navigate('/sign-in', { replace: true, state: { email: r.email, notice: 'reset' } });
              })
              .catch((err: Error) => {
                setError(err.message);
                setBusy(false);
              });
          }}
        >
          <p className="text-muted-sm">
            For <strong>{email}</strong>. Every device signed in to this account will be signed out.
          </p>
          <input type="text" autoComplete="username" value={email} readOnly hidden />
          <PasswordField id="rp-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" meter />
          {error && <AuthError>{error}</AuthError>}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
