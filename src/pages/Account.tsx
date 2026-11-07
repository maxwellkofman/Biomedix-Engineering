import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from '../account/AccountContext';
import { api } from '../account/api';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { formatDate } from '../components/Lifecycle';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/account.css';

function useForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = (fn: () => Promise<string>) => async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };
  const note = msg && (
    <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'form-msg form-msg--ok' : 'form-msg form-msg--err'}>
      {msg.text}
    </p>
  );
  return { busy, submit, note };
}

export default function Account() {
  const { user, setUser, signOut, expired } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [deletePw, setDeletePw] = useState('');
  const profile = useForm();
  const password = useForm();
  const danger = useForm();
  if (!user) return null;

  return (
    <AppShell>
      <main className="app-main account-main account-main--narrow">
        <div className="stack suite-head__copy">
          <span className="eyebrow">ACCOUNT</span>
          <h1 className="setup-main__title">{user.name}</h1>
          <p className="setup-main__blurb">
            {user.email} · member since {formatDate(user.createdAt, false)}
          </p>
        </div>

        <form
          className="card card--compact stack account-form"
          aria-labelledby="profile-h"
          onSubmit={profile.submit(async () => {
            const { user: u } = await api.updateAccount({ name: name.trim() });
            setUser(u);
            return 'Saved.';
          })}
        >
          <h2 id="profile-h" className="card__title card__title--sm">
            Profile
          </h2>
          <div className="field">
            <label htmlFor="acct-name" className="field__label">
              Name
            </label>
            <input
              id="acct-name"
              className="input"
              required
              maxLength={120}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="field__hint">Shown on runs you save and sign-offs you record.</p>
          </div>
          <div className="field">
            <span className="field__label">Email</span>
            <span className="account-form__static">{user.email}</span>
          </div>
          {profile.note}
          <div className="button-row">
            <Button type="submit" size="sm" disabled={profile.busy || !name.trim() || name.trim() === user.name}>
              Save profile
            </Button>
          </div>
        </form>

        <form
          className="card card--compact stack account-form"
          aria-labelledby="pw-h"
          onSubmit={password.submit(async () => {
            await api.changePassword({ current, next });
            setCurrent('');
            setNext('');
            return 'Password changed. Other devices were signed out.';
          })}
        >
          <h2 id="pw-h" className="card__title card__title--sm">
            Password
          </h2>
          <input type="text" autoComplete="username" value={user.email} readOnly hidden />
          <div className="field">
            <label htmlFor="pw-current" className="field__label">
              Current password
            </label>
            <input
              id="pw-current"
              type="password"
              className="input"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pw-next" className="field__label">
              New password
            </label>
            <input
              id="pw-next"
              type="password"
              className="input"
              required
              minLength={12}
              autoComplete="new-password"
              aria-describedby="pw-next-hint"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <p id="pw-next-hint" className="field__hint">
              At least 12 characters.
            </p>
          </div>
          {password.note}
          <div className="button-row">
            <Button type="submit" size="sm" disabled={password.busy}>
              Change password
            </Button>
          </div>
        </form>

        <section className="card card--compact stack account-form" aria-labelledby="session-h">
          <h2 id="session-h" className="card__title card__title--sm">
            Session
          </h2>
          <p className="text-muted-sm">Signing out keeps everything in your account. Nothing stays in this browser.</p>
          <div className="button-row">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void signOut().then(() => navigate('/'));
              }}
            >
              Sign out
            </Button>
          </div>
        </section>

        <form
          className="card card--compact stack account-form account-form--danger"
          aria-labelledby="delete-h"
          onSubmit={danger.submit(async () => {
            if (!window.confirm('Delete your account and every project in it? This cannot be undone.')) return 'Not deleted.';
            await api.deleteAccount({ password: deletePw });
            expired();
            navigate('/');
            return 'Deleted.';
          })}
        >
          <h2 id="delete-h" className="card__title card__title--sm">
            Delete account
          </h2>
          <p className="text-muted-sm">
            Deletes your account, every project, run, draft and sign-off record. Export anything you need first: approved
            records may fall under your record retention period.
          </p>
          <div className="field">
            <label htmlFor="delete-pw" className="field__label">
              Password
            </label>
            <input
              id="delete-pw"
              type="password"
              className="input"
              required
              autoComplete="current-password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
            />
          </div>
          {danger.note}
          <div className="button-row">
            <Button type="submit" variant="outline" size="sm" disabled={danger.busy || !deletePw}>
              Delete my account
            </Button>
          </div>
        </form>
      </main>
    </AppShell>
  );
}
