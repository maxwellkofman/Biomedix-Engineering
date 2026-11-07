import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../account/AccountContext';
import { api, type DevMail as Mail, type StaffRole } from '../account/api';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { formatDate } from '../components/Lifecycle';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/account.css';
import '../styles/org.css';

/** Turns the links in an email into in-app links, so you can follow them in this tab. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <pre className="mail__body">
      {parts.map((p, i) => {
        if (!/^https?:\/\//.test(p)) return p;
        const u = new URL(p);
        return u.origin === window.location.origin ? (
          <Link key={i} to={u.pathname + u.search}>
            {p}
          </Link>
        ) : (
          <a key={i} href={p}>
            {p}
          </a>
        );
      })}
    </pre>
  );
}

/** /dev/mail — every email the app sent, while the server runs in dev mode. */
export default function DevMail() {
  const { status, user, dev, refresh } = useAccount();
  const [mail, setMail] = useState<Mail[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .devMail()
      .then((r) => {
        setMail(r.messages);
        setOpen((o) => o ?? r.messages[0]?.id ?? null);
      })
      .catch(() => setError('Dev tools are off on this server. They run with npm run dev, or with BIOMEDIX_DEV=1.'));
  }, []);
  useEffect(load, [load]);

  const setRole = (r: StaffRole) => void api.devStaff(r).then(refresh);

  return (
    <AppShell>
      <main className="app-main account-main">
        <div className="suite-head">
          <div className="stack suite-head__copy">
            <span className="eyebrow">DEV MODE</span>
            <h1 className="setup-main__title">Mailbox</h1>
            <p className="setup-main__blurb">
              Emails the app sent: verification, password reset, invitations and security notices. In production they go out through
              BIOMEDIX_MAIL_WEBHOOK and aren’t stored.
            </p>
          </div>
          {dev && (
            <div className="button-row">
              <Button variant="outline" onClick={load}>
                Refresh
              </Button>
              <Button variant="text" onClick={() => void api.clearDevMail().then(load)}>
                Clear
              </Button>
            </div>
          )}
        </div>
        {error ? (
          <p className="notice notice--warn">{error}</p>
        ) : !mail ? (
          <p className="text-muted-sm">Loading…</p>
        ) : !mail.length ? (
          <p className="text-muted-sm">No emails yet.</p>
        ) : (
          <div className="mailbox">
            <ul className="list-reset card card--compact mailbox__list">
              {mail.map((m) => (
                <li key={m.id}>
                  <button type="button" className={`mailbox__item${open === m.id ? ' mailbox__item--on' : ''}`} aria-pressed={open === m.id} onClick={() => setOpen(m.id)}>
                    <span className="mailbox__subject">{m.subject}</span>
                    <span className="text-muted-sm">
                      {m.to} · {formatDate(m.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {mail.find((m) => m.id === open) && (
              <article className="card card--compact stack mail">
                <h2 className="card__title card__title--sm">{mail.find((m) => m.id === open)!.subject}</h2>
                <span className="text-muted-sm">To {mail.find((m) => m.id === open)!.to}</span>
                <Body text={mail.find((m) => m.id === open)!.body} />
              </article>
            )}
          </div>
        )}

        {dev && status === 'signed-in' && user && (
          <section className="card card--compact stack account-form" aria-labelledby="dev-staff-h">
            <h2 id="dev-staff-h" className="card__title card__title--sm">
              Test as Biomedix staff
            </h2>
            <p className="text-muted-sm">
              Give your own account a staff role to try the reviewer workspace. You’re currently{' '}
              <strong>{user.staffRole ? `a Biomedix ${user.staffRole}` : 'a customer'}</strong>. Reviewers can’t review drafts they
              submitted themselves, so use a second account for the customer side.
            </p>
            <div className="button-row button-row--tight">
              <Button size="sm" variant={user.staffRole === '' ? 'primary' : 'outline'} onClick={() => setRole('')}>
                Customer
              </Button>
              <Button size="sm" variant={user.staffRole === 'reviewer' ? 'primary' : 'outline'} onClick={() => setRole('reviewer')}>
                Reviewer
              </Button>
              <Button size="sm" variant={user.staffRole === 'admin' ? 'primary' : 'outline'} onClick={() => setRole('admin')}>
                Admin
              </Button>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
