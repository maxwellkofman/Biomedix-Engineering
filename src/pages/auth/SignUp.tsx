import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ROLE_LABEL, useAccount } from '../../account/AccountContext';
import { api, type InviteInfo } from '../../account/api';
import { Button } from '../../components/Button';
import { PasswordField } from '../../components/forms';
import { isStarted, useIntake } from '../../intake/IntakeContext';
import { safeNext } from '../../lib/links';
import { AuthError, AuthLayout } from './AuthLayout';

export default function SignUp() {
  const { status, signUp } = useAccount();
  const { intake, mode } = useIntake();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite') ?? '';
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(intake.company.name);
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLocal = mode === 'guest' && isStarted(intake);

  useEffect(() => {
    if (!inviteToken) return;
    api
      .inviteInfo(inviteToken)
      .then(setInvite)
      .catch((err: Error) => setInviteError(err.message));
  }, [inviteToken]);

  if (status === 'signed-in' && !busy) return <Navigate to={inviteToken ? `/invite/${inviteToken}` : safeNext(params.get('next'))} replace />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signUp({
        name: name.trim(),
        email: invite ? invite.email : email.trim(),
        password,
        company: invite ? undefined : company.trim(),
        invite: inviteToken || undefined,
        acceptTerms: terms,
      });
      navigate(invite ? '/app/dashboard' : `/app/welcome${params.get('next') ? `?next=${encodeURIComponent(safeNext(params.get('next')))}` : ''}`, {
        replace: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const signInLink = `/sign-in${params.get('next') ? `?next=${encodeURIComponent(safeNext(params.get('next')))}` : inviteToken ? `?next=${encodeURIComponent(`/invite/${inviteToken}`)}` : ''}`;

  return (
    <AuthLayout
      eyebrow={invite ? 'JOIN YOUR TEAM' : 'CREATE AN ACCOUNT'}
      title={invite ? `Join ${invite.orgName} on Biomedix.` : 'Your quality system, ready for review.'}
      points={
        invite
          ? [
              `${invite.inviter} invited you as ${invite.roleLabel.toLowerCase()}`,
              invite.approver ? 'You can approve documents for the company' : 'Work on the same projects as your team',
              'Every change is kept as a draft with its own history',
            ]
          : [
              'A workspace for your company and your team',
              'Answers save as you type, on any device',
              'Each run keeps a draft of every document that changed',
              'Biomedix engineers sign the technical review; you approve',
            ]
      }
      cardTitle={invite ? 'Create your account' : 'Create your company account'}
      foot={
        <>
          <p className="text-muted-sm auth__switch">
            Already have an account? <Link to={signInLink}>Sign in</Link>
          </p>
          {!invite && (
            <Link to="/app/suite" className="text-muted-sm auth__skip">
              Continue without an account
            </Link>
          )}
        </>
      }
    >
      {status === 'unavailable' ? (
        <p className="notice notice--warn">
          Accounts aren’t available on this server. You can keep working without one: your answers stay in this browser.{' '}
          <Link to="/app/suite">Back to the app</Link>
        </p>
      ) : inviteError ? (
        <AuthError>{inviteError}</AuthError>
      ) : inviteToken && !invite ? (
        <p className="text-muted-sm">Checking your invitation…</p>
      ) : (
        <form
          className="stack auth__form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label htmlFor="su-name" className="field__label">
              Your name
            </label>
            <input id="su-name" className="input" autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            <p className="field__hint">Printed on runs you save and documents you sign.</p>
          </div>
          {invite ? (
            <div className="field">
              <span className="field__label">Work email</span>
              <span className="account-form__static">{invite.email}</span>
              <p className="field__hint">The address your invitation was sent to.</p>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="su-email" className="field__label">
                  Work email
                </label>
                <input id="su-email" type="email" className="input" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <p className="field__hint">We’ll send a link to confirm it.</p>
              </div>
              <div className="field">
                <label htmlFor="su-company" className="field__label">
                  Company name
                </label>
                <input
                  id="su-company"
                  className="input"
                  autoComplete="organization"
                  required
                  maxLength={120}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
                <p className="field__hint">Your company’s workspace. You’ll be its owner and can invite your team.</p>
              </div>
            </>
          )}
          <PasswordField id="su-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" meter />
          <label className="check">
            <input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>I agree to the Biomedix terms of service and privacy policy.</span>
          </label>
          {hasLocal && !invite && <p className="text-muted-sm">The answers you’ve entered in this browser become your company’s first project.</p>}
          {invite && (
            <p className="text-muted-sm">
              Role: <strong>{ROLE_LABEL[invite.role]}</strong>
              {invite.approver && ' · approver'}
            </p>
          )}
          {error && <AuthError>{error}</AuthError>}
          <Button type="submit" size="lg" disabled={busy || status === 'loading'}>
            {busy ? 'Creating account…' : invite ? `Join ${invite.orgName}` : 'Create account'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
