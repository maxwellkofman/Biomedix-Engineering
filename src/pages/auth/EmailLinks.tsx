import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ROLE_HINT, useAccount } from '../../account/AccountContext';
import { api, type InviteInfo } from '../../account/api';
import { Button, ButtonLink } from '../../components/Button';
import { AuthError, AuthLayout, AuthNote } from './AuthLayout';

/** Runs a one-time link exactly once, even when React mounts the effect twice in development. */
function useOnce<T>(fn: () => Promise<T>, enabled: boolean) {
  const started = useRef(false);
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    fn()
      .then(setResult)
      .catch((err: Error) => setError(err.message));
  }, [enabled]);
  return { result, error };
}

/** /verify-email?token= (new account) and /confirm-email?token= (changed address). */
export function VerifyEmail({ change = false }: { change?: boolean }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { status, refresh } = useAccount();
  const { result, error } = useOnce(
    async () => {
      const r = change ? await api.confirmEmailChange(token) : await api.verifyEmail(token);
      await refresh();
      return r;
    },
    !!token && status !== 'loading',
  );

  return (
    <AuthLayout eyebrow={change ? 'NEW EMAIL' : 'CONFIRM EMAIL'} title={change ? 'Changing your sign-in email.' : 'Confirming your email.'} cardTitle={result ? 'Email confirmed' : 'One moment'}>
      {!token ? (
        <AuthError>This link is incomplete. Copy the whole link from the email.</AuthError>
      ) : error ? (
        <>
          <AuthError>{error}</AuthError>
          {status === 'signed-in' ? (
            <ButtonLink to={change ? '/app/settings/profile' : '/app/welcome'}>{change ? 'Back to your profile' : 'Send a new link'}</ButtonLink>
          ) : (
            <ButtonLink to="/sign-in">Sign in</ButtonLink>
          )}
        </>
      ) : result ? (
        <>
          <AuthNote>
            {change ? `You now sign in with ${result.email}.` : `${result.email} is confirmed. You can now invite your team and approve documents.`}
          </AuthNote>
          {status === 'signed-in' ? (
            <ButtonLink to={change ? '/app/settings/profile' : '/app/welcome'}>Continue</ButtonLink>
          ) : (
            <ButtonLink to="/sign-in">Sign in</ButtonLink>
          )}
        </>
      ) : (
        <p className="text-muted-sm">Checking your link…</p>
      )}
    </AuthLayout>
  );
}

/** /invite/:token — accept an invitation to a company. */
export function AcceptInvite() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { status, user, apply, signOut } = useAccount();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .inviteInfo(token)
      .then(setInfo)
      .catch((err: Error) => setError(err.message));
  }, [token]);

  const here = `/invite/${token}`;
  const mismatch = info && user && info.email.toLowerCase() !== user.email.toLowerCase();

  return (
    <AuthLayout
      eyebrow="INVITATION"
      title={info ? `${info.inviter} invited you to ${info.orgName}.` : 'You’ve been invited to Biomedix.'}
      points={info ? [`Role: ${info.roleLabel} — ${ROLE_HINT[info.role].toLowerCase()}`, ...(info.approver ? ['You’ll be able to approve documents'] : [])] : undefined}
      cardTitle={info ? `Join ${info.orgName}` : 'Invitation'}
    >
      {error ? (
        <AuthError>{error}</AuthError>
      ) : !info || status === 'loading' ? (
        <p className="text-muted-sm">Checking your invitation…</p>
      ) : status === 'signed-in' && mismatch ? (
        <>
          <p className="text-muted-sm">
            This invitation is for <strong>{info.email}</strong>, but you’re signed in as <strong>{user!.email}</strong>.
          </p>
          <Button onClick={() => void signOut()}>Sign out and continue</Button>
        </>
      ) : status === 'signed-in' ? (
        <>
          <p className="text-muted-sm">
            Accept to add {info.orgName} to your companies. You can switch between companies from the top bar.
          </p>
          <Button
            size="lg"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              api
                .acceptInvite(token)
                .then((r) => {
                  apply(r, r.orgId);
                  navigate('/app/dashboard', { replace: true });
                })
                .catch((err: Error) => {
                  setError(err.message);
                  setBusy(false);
                });
            }}
          >
            {busy ? 'Joining…' : `Join ${info.orgName}`}
          </Button>
        </>
      ) : info.accountExists ? (
        <>
          <p className="text-muted-sm">
            <strong>{info.email}</strong> already has a Biomedix account. Sign in to accept.
          </p>
          <ButtonLink to={`/sign-in?next=${encodeURIComponent(here)}`} size="lg">
            Sign in to accept
          </ButtonLink>
        </>
      ) : (
        <>
          <p className="text-muted-sm">
            Create an account for <strong>{info.email}</strong> to join. The invitation works until{' '}
            {new Date(info.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.
          </p>
          <ButtonLink to={`/sign-up?invite=${encodeURIComponent(token)}`} size="lg">
            Create my account
          </ButtonLink>
        </>
      )}
    </AuthLayout>
  );
}
