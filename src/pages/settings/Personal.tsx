import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import qrcode from 'qrcode-generator';
import { useAccount } from '../../account/AccountContext';
import { api, type Security as SecurityInfo, type SessionInfo } from '../../account/api';
import { Button } from '../../components/Button';
import { CodeField, PasswordField, useSubmit } from '../../components/forms';
import { formatDate } from '../../components/Lifecycle';
import { describeAudit, timeAgo } from '../../lib/audit';
import { SettingsCard, SettingsLayout } from './SettingsLayout';

/* ---------- Profile ---------- */

export function Profile() {
  const { user, apply, expired } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [deletePw, setDeletePw] = useState('');
  const profile = useSubmit();
  const emailForm = useSubmit();
  const danger = useSubmit();
  if (!user) return null;

  return (
    <SettingsLayout eyebrow="YOUR ACCOUNT" title="Profile" blurb={`Member since ${formatDate(user.createdAt, false)}.`}>
      <SettingsCard title="Name" id="name-h">
        <form
          className="stack account-form"
          onSubmit={profile.onSubmit(async () => {
            apply(await api.updateAccount({ name: name.trim() }));
            return 'Saved.';
          })}
        >
          <div className="field">
            <label htmlFor="acct-name" className="field__label">
              Full name
            </label>
            <input id="acct-name" className="input" required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="field__hint">Printed on runs you save and on documents you submit, review or approve.</p>
          </div>
          {profile.note}
          <div className="button-row">
            <Button type="submit" size="sm" disabled={profile.busy || !name.trim() || name.trim() === user.name}>
              Save name
            </Button>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard
        title="Sign-in email"
        id="email-h"
        aside={<span className={`stage stage--${user.emailVerified ? 'ok' : 'warn'}`}>{user.emailVerified ? 'Confirmed' : 'Not confirmed'}</span>}
      >
        <p className="account-form__static">{user.email}</p>
        <form
          className="stack account-form"
          onSubmit={emailForm.onSubmit(async () => {
            const r = await api.changeEmail({ email: newEmail.trim(), password: emailPw });
            setNewEmail('');
            setEmailPw('');
            return `We sent a confirmation link to ${r.pending}. Your email changes when you open it.`;
          })}
        >
          <input type="text" autoComplete="username" value={user.email} readOnly hidden />
          <div className="field-row">
            <div className="field">
              <label htmlFor="new-email" className="field__label">
                New email
              </label>
              <input id="new-email" type="email" className="input" required autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <PasswordField id="email-pw" label="Current password" value={emailPw} onChange={setEmailPw} autoComplete="current-password" />
          </div>
          {emailForm.note}
          <div className="button-row">
            <Button type="submit" size="sm" variant="outline" disabled={emailForm.busy || !newEmail || !emailPw}>
              Change email
            </Button>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard title="Delete account" id="delete-h" danger>
        <form
          className="stack account-form"
          onSubmit={danger.onSubmit(async () => {
            if (!window.confirm('Delete your account? Companies where you’re the only member are deleted with it. This can’t be undone.')) return;
            await api.deleteAccount({ password: deletePw });
            expired();
            navigate('/sign-in', { replace: true, state: { notice: 'deleted' } });
          })}
        >
          <p className="text-muted-sm">
            Removes you from every company. Companies where you’re the only member are deleted with their projects, runs, drafts and
            sign-offs. If you’re the only owner of a company with other members, make someone else an owner first. Approved records may
            fall under your record retention period: export what you need before deleting.
          </p>
          <input type="text" autoComplete="username" value={user.email} readOnly hidden />
          <PasswordField id="delete-pw" label="Password" value={deletePw} onChange={setDeletePw} autoComplete="current-password" />
          {danger.note}
          <div className="button-row">
            <Button type="submit" variant="outline" size="sm" disabled={danger.busy || !deletePw}>
              Delete my account
            </Button>
          </div>
        </form>
      </SettingsCard>
    </SettingsLayout>
  );
}

/* ---------- Password and two-factor ---------- */

function QrCode({ text }: { text: string }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cells: string[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(`M${c + 4} ${r + 4}h1v1h-1z`);
  return (
    <svg className="qr" viewBox={`0 0 ${n + 8} ${n + 8}`} role="img" aria-label="QR code for your authenticator app" shapeRendering="crispEdges">
      <rect width={n + 8} height={n + 8} fill="#fff" />
      <path d={cells.join('')} fill="#111a17" />
    </svg>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Biomedix recovery codes\nEach code works once.\n\n${codes.join('\n')}\n`;
  return (
    <div className="stack recovery">
      <p className="notice notice--warn">
        Save these recovery codes somewhere safe, like your password manager. If you lose your phone, each one signs you in once. This
        is the only time they’re shown.
      </p>
      <ol className="list-reset recovery__codes mono">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="button-row button-row--tight">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <a className="btn btn--outline btn--sm" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="biomedix-recovery-codes.txt">
          Download .txt
        </a>
        <Button size="sm" onClick={onDone}>
          I’ve saved them
        </Button>
      </div>
    </div>
  );
}

export function Security() {
  const { user, apply } = useAccount();
  const location = useLocation();
  const recoveryLeft = ((location.state ?? {}) as { recoveryLeft?: number }).recoveryLeft;
  const [info, setInfo] = useState<SecurityInfo | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const pwForm = useSubmit();
  const mfa = useSubmit();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [mfaPw, setMfaPw] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [panel, setPanel] = useState<'none' | 'start' | 'disable' | 'regen'>('none');

  const load = useCallback(() => {
    api.security().then(setInfo).catch(() => setInfo(null));
  }, []);
  useEffect(load, [load, user?.mfaEnabled]);
  if (!user) return null;

  const reset = () => {
    setPanel('none');
    setSetup(null);
    setMfaPw('');
    setCode('');
    mfa.setMsg(null);
  };

  return (
    <SettingsLayout eyebrow="YOUR ACCOUNT" title="Password and two-factor" blurb="Keep your account, and the e-signatures recorded with it, yours alone.">
      {recoveryLeft !== undefined && (
        <p className="notice notice--warn" role="status">
          You signed in with a recovery code. {recoveryLeft} left.{' '}
          {recoveryLeft < 5 ? 'Generate new codes below, and set up your authenticator again if you lost your phone.' : ''}
        </p>
      )}

      <SettingsCard title="Password" id="pw-h" aside={info && <span className="text-muted-sm">Changed {timeAgo(info.passwordChangedAt)}</span>}>
        <form
          className="stack account-form"
          onSubmit={pwForm.onSubmit(async () => {
            await api.changePassword({ current, next });
            setCurrent('');
            setNext('');
            load();
            return 'Password changed. Other devices were signed out.';
          })}
        >
          <input type="text" autoComplete="username" value={user.email} readOnly hidden />
          <div className="field-row">
            <PasswordField id="pw-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
            <PasswordField id="pw-next" label="New password" value={next} onChange={setNext} autoComplete="new-password" meter />
          </div>
          {pwForm.note}
          <div className="button-row">
            <Button type="submit" size="sm" disabled={pwForm.busy || !current || !next}>
              Change password
            </Button>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard
        title="Two-factor authentication"
        id="mfa-h"
        aside={<span className={`stage stage--${user.mfaEnabled ? 'ok' : 'warn'}`}>{user.mfaEnabled ? 'On' : 'Off'}</span>}
      >
        {codes ? (
          <RecoveryCodes
            codes={codes}
            onDone={() => {
              setCodes(null);
              load();
            }}
          />
        ) : user.mfaEnabled ? (
          <>
            <p className="text-muted-sm">
              Signing in asks for a code from your authenticator app after your password.
              {info && ` On since ${formatDate(info.mfaEnabledAt ?? user.createdAt, false)} · ${info.recoveryCodesLeft} of 10 recovery codes left.`}
            </p>
            {panel === 'none' && (
              <div className="button-row button-row--tight">
                <Button size="sm" variant="outline" onClick={() => setPanel('regen')}>
                  New recovery codes
                </Button>
                <Button size="sm" variant="text" onClick={() => setPanel('disable')}>
                  Turn off
                </Button>
              </div>
            )}
            {panel === 'regen' && (
              <form
                className="stack account-form"
                onSubmit={mfa.onSubmit(async () => {
                  const r = await api.recoveryCodes(mfaPw);
                  reset();
                  setCodes(r.codes);
                })}
              >
                <p className="text-muted-sm">Your old recovery codes stop working.</p>
                <PasswordField id="regen-pw" label="Password" value={mfaPw} onChange={setMfaPw} autoComplete="current-password" />
                {mfa.note}
                <div className="button-row button-row--tight">
                  <Button type="submit" size="sm" disabled={mfa.busy || !mfaPw}>
                    Generate codes
                  </Button>
                  <Button size="sm" variant="text" onClick={reset}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {panel === 'disable' && (
              <form
                className="stack account-form"
                onSubmit={mfa.onSubmit(async () => {
                  apply(await api.mfaDisable({ password: mfaPw, code: code.trim() }));
                  reset();
                  return 'Two-factor authentication is off.';
                })}
              >
                <p className="text-muted-sm">Your account will be protected by your password alone.</p>
                <div className="field-row">
                  <PasswordField id="dis-pw" label="Password" value={mfaPw} onChange={setMfaPw} autoComplete="current-password" />
                  <CodeField id="dis-code" value={code} onChange={setCode} allowRecovery />
                </div>
                {mfa.note}
                <div className="button-row button-row--tight">
                  <Button type="submit" size="sm" variant="outline" disabled={mfa.busy || !mfaPw || !code}>
                    Turn off two-factor
                  </Button>
                  <Button size="sm" variant="text" onClick={reset}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </>
        ) : setup ? (
          <form
            className="stack account-form"
            onSubmit={mfa.onSubmit(async () => {
              const r = await api.mfaEnable(code.trim());
              apply(r);
              reset();
              setCodes(r.codes);
            })}
          >
            <ol className="list-reset stack mfa-steps">
              <li>
                <strong>1. Scan this with your authenticator app</strong>
                <span className="text-muted-sm">Microsoft Authenticator, Google Authenticator, 1Password and others work.</span>
                <div className="mfa-setup">
                  <QrCode text={setup.uri} />
                  <div className="stack">
                    <span className="text-muted-sm">Can’t scan? Enter this key instead:</span>
                    <code className="mfa-key">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                  </div>
                </div>
              </li>
              <li>
                <strong>2. Enter the 6-digit code it shows</strong>
                <CodeField id="mfa-code" value={code} onChange={setCode} />
              </li>
            </ol>
            {mfa.note}
            <div className="button-row button-row--tight">
              <Button type="submit" size="sm" disabled={mfa.busy || code.replace(/\s/g, '').length !== 6}>
                {mfa.busy ? 'Checking…' : 'Turn on two-factor'}
              </Button>
              <Button size="sm" variant="text" onClick={reset}>
                Cancel
              </Button>
            </div>
          </form>
        ) : panel === 'start' ? (
          <form
            className="stack account-form"
            onSubmit={mfa.onSubmit(async () => {
              setSetup(await api.mfaSetup(mfaPw));
              setMfaPw('');
            })}
          >
            <input type="text" autoComplete="username" value={user.email} readOnly hidden />
            <PasswordField id="mfa-pw" label="Confirm your password" value={mfaPw} onChange={setMfaPw} autoComplete="current-password" />
            {mfa.note}
            <div className="button-row button-row--tight">
              <Button type="submit" size="sm" disabled={mfa.busy || !mfaPw}>
                Continue
              </Button>
              <Button size="sm" variant="text" onClick={reset}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-muted-sm">
              Add a second step to sign-in: a 6-digit code from an app on your phone. Strongly recommended for anyone who approves
              documents, and your company can require it.
            </p>
            <div className="button-row">
              <Button size="sm" onClick={() => setPanel('start')}>
                Set up two-factor
              </Button>
            </div>
          </>
        )}
        {!codes && panel === 'none' && !setup && mfa.note}
      </SettingsCard>

      <SettingsCard title="Recent security activity" id="events-h">
        {!info ? (
          <p className="text-muted-sm">Loading…</p>
        ) : (
          <ul className="list-reset activity">
            {info.events.map((e) => (
              <li key={e.id} className="activity__row">
                <span className={`activity__dot${e.action === 'sign_in.failed' ? ' activity__dot--warn' : ''}`} aria-hidden="true" />
                <span className="stack activity__main">
                  <span>{describeAudit(e, { personal: true })}</span>
                  <span className="text-muted-sm">
                    {formatDate(e.createdAt)}
                    {e.ip ? ` · ${e.ip}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </SettingsLayout>
  );
}

/* ---------- Signed-in devices ---------- */

export function Sessions() {
  const { expired } = useAccount();
  const navigate = useNavigate();
  const [list, setList] = useState<SessionInfo[] | null>(null);
  const act = useSubmit();
  const load = useCallback(() => {
    api
      .sessions()
      .then((r) => setList(r.sessions))
      .catch(() => setList([]));
  }, []);
  useEffect(load, [load]);
  const others = (list ?? []).filter((s) => !s.current).length;

  return (
    <SettingsLayout
      eyebrow="YOUR ACCOUNT"
      title="Signed-in devices"
      blurb="Every browser signed in to your account. Sign out any you don’t recognise, then change your password."
    >
      <SettingsCard
        title={list ? `${list.length} active session${list.length === 1 ? '' : 's'}` : 'Sessions'}
        id="sessions-h"
        aside={
          others > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={act.busy}
              onClick={() =>
                void act.run(async () => {
                  const r = await api.endOtherSessions();
                  load();
                  return `Signed out ${r.count} other device${r.count === 1 ? '' : 's'}.`;
                })
              }
            >
              Sign out all others
            </Button>
          )
        }
      >
        {act.note}
        {!list ? (
          <p className="text-muted-sm">Loading…</p>
        ) : (
          <ul className="list-reset session-list">
            {list.map((s) => (
              <li key={s.id} className="session">
                <span className="stack session__main">
                  <span className="session__device">
                    {s.device} {s.current && <span className="stage stage--ok">This device</span>}
                  </span>
                  <span className="text-muted-sm">
                    {s.ip || 'Unknown network'} · signed in {formatDate(s.createdAt)} · active {timeAgo(s.lastSeenAt)}
                  </span>
                  <span className="text-muted-sm">
                    {s.remember ? 'Kept signed in' : 'Short session'} until {formatDate(s.expiresAt)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={s.current ? 'outline' : 'text'}
                  disabled={act.busy}
                  onClick={() =>
                    void act.run(async () => {
                      const r = await api.endSession(s.id);
                      if (r.current) {
                        expired();
                        navigate('/sign-in', { replace: true, state: { notice: 'signed-out' } });
                        return;
                      }
                      load();
                      return 'Signed out that device.';
                    })
                  }
                >
                  Sign out
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </SettingsLayout>
  );
}
