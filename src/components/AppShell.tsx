import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { initials, ROLE_LABEL, useAccount } from '../account/AccountContext';
import { api } from '../account/api';
import { useIntake, type SaveState } from '../intake/IntakeContext';
import { Button, ButtonLink } from './Button';
import { Logo } from './Logo';
import { Popover } from './Popover';
import '../styles/account.css';
import '../styles/org.css';

const NAV = [
  { label: 'Review queue', to: '/app/review' },
  { label: 'Documentation', to: '/app/suite', also: ['/app/setup', '/app/form', '/app/publish', '/app/history', '/app/readiness'] },
  { label: 'Assessments', to: '/app/assessments' },
  { label: 'Agents', to: '/app/agents' },
  { label: 'Trace graph', to: '/app/trace' },
  { label: 'Gates', to: '/app/gates' },
  { label: 'Procedures', to: '/app/procedures' },
];

const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Couldn’t save',
};

function VerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const { dev } = useAccount();
  return (
    <div role="status" className="app-alert app-alert--info">
      <span>
        Confirm your email: we sent a link to <strong>{email}</strong>. Until then you can’t invite people or approve documents.
      </span>
      <span className="button-row button-row--tight">
        {state === 'sent' ? (
          <span>Sent. Check your inbox.</span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={state === 'sending'}
            onClick={() => {
              setState('sending');
              api
                .resendVerification()
                .then(() => setState('sent'))
                .catch((err: Error) => setState(err.message));
            }}
          >
            Send again
          </Button>
        )}
        {dev && (
          <Link to="/dev/mail" className="app-alert__link">
            Dev mailbox
          </Link>
        )}
        {state !== 'idle' && state !== 'sending' && state !== 'sent' && <span>{state}</span>}
      </span>
    </div>
  );
}

/** Product chrome: dark top bar with app nav, readiness, company, project and account. */
export function AppShell({ children }: { children: ReactNode }) {
  const { status, user, orgs, org, dev, signOut } = useAccount();
  const { intake, started, readiness, mode, saveState, loadError, retry, guestDraft, newProject, discardGuest, readOnly, projectId, switchOrg } =
    useIntake();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const project = intake.device.name || (mode === 'account' ? 'Untitled project' : '[Device]');
  const nav = mode === 'account' ? [{ label: 'Dashboard', to: '/app/dashboard' }, ...NAV] : NAV;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__left">
            <Logo variant="app" />
            <nav aria-label="App" className="app-nav">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `app-nav__link${isActive || ('also' in item && item.also?.some((p) => pathname.startsWith(p))) ? ' active' : ''}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              {user?.staffRole && (
                <NavLink to="/staff/reviews" className={({ isActive }) => `app-nav__link app-nav__link--staff${isActive || pathname.startsWith('/staff') ? ' active' : ''}`}>
                  Biomedix
                </NavLink>
              )}
            </nav>
          </div>
          <div className="app-header__right">
            {started && (
              <Link
                to="/app/readiness"
                className="readiness-chip"
                aria-label={`Compliance readiness ${readiness.pct}%`}
                title="Compliance readiness: how close your documentation is to approved"
              >
                <span className="readiness-chip__label">Readiness</span>
                <strong className="readiness-chip__value">{readiness.pct}%</strong>
                <span className="readiness-chip__meter" aria-hidden="true">
                  <span style={{ width: `${readiness.pct}%` }} />
                </span>
              </Link>
            )}
            {mode === 'account' ? (
              <span className="app-header__context">
                <Popover
                  buttonClass="org-switch"
                  ariaLabel={`Company: ${org?.name ?? 'none'}. Switch company`}
                  align="end"
                  label={
                    <>
                      <span className="org-switch__name">{org?.name ?? 'No company'}</span>
                      <span className="org-switch__caret" aria-hidden="true" />
                    </>
                  }
                >
                  {(close) => (
                    <div className="menu">
                      <span className="menu__label">Companies</span>
                      <ul className="list-reset">
                        {orgs.map((o) => (
                          <li key={o.id}>
                            <button
                              type="button"
                              className={`menu__item${o.id === org?.id ? ' menu__item--on' : ''}`}
                              aria-current={o.id === org?.id ? 'true' : undefined}
                              onClick={() => {
                                close();
                                if (o.id !== org?.id) void switchOrg(o.id).then(() => navigate('/app/dashboard'));
                              }}
                            >
                              <span className="menu__item-main">{o.name}</span>
                              <span className="menu__item-meta">
                                {ROLE_LABEL[o.role]}
                                {o.approver ? ' · approver' : ''}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <span className="menu__rule" />
                      {org && (
                        <>
                          <Link to="/app/settings/company" className="menu__item">
                            Company settings
                          </Link>
                          <Link to="/app/settings/members" className="menu__item">
                            Members
                          </Link>
                        </>
                      )}
                      <Link to="/app/settings/company?new=1" className="menu__item">
                        Create a company
                      </Link>
                    </div>
                  )}
                </Popover>
                {projectId && (
                  <Link to="/app/dashboard#projects" className="app-header__project app-header__project--link" title={`${project} · switch project`}>
                    <span className="app-header__project-name">{project}</span>
                    {saveState !== 'idle' && !readOnly && (
                      <span className={`save-state save-state--${saveState}`} role="status" title={SAVE_LABEL[saveState]}>
                        {SAVE_LABEL[saveState]}
                      </span>
                    )}
                    {readOnly && (
                      <span className="save-state" title="View only">
                        View only
                      </span>
                    )}
                  </Link>
                )}
              </span>
            ) : (
              <span className="app-header__project">
                {intake.company.name || '[Company]'} · {project}
              </span>
            )}
            {status === 'signed-in' && user ? (
              <Popover
                buttonClass="avatar avatar--button"
                ariaLabel={`Account menu for ${user.name}`}
                label={initials(user.name)}
              >
                {() => (
                  <div className="menu">
                    <span className="menu__who">
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                    </span>
                    <span className="menu__rule" />
                    <Link to="/app/settings/profile" className="menu__item">
                      Profile
                    </Link>
                    <Link to="/app/settings/security" className="menu__item">
                      Security {user.mfaEnabled ? '' : <span className="menu__badge">2FA off</span>}
                    </Link>
                    <Link to="/app/settings/sessions" className="menu__item">
                      Signed-in devices
                    </Link>
                    {user.staffRole && (
                      <>
                        <span className="menu__rule" />
                        <Link to="/staff/reviews" className="menu__item">
                          Biomedix reviews
                        </Link>
                        <Link to="/staff/scans" className="menu__item">
                          Gap scans
                        </Link>
                        <Link to="/staff/requests" className="menu__item">
                          Demo requests
                        </Link>
                        {user.staffRole === 'admin' && (
                          <Link to="/staff/admin" className="menu__item">
                            Biomedix admin
                          </Link>
                        )}
                      </>
                    )}
                    {dev && (
                      <Link to="/dev/mail" className="menu__item">
                        Dev mailbox
                      </Link>
                    )}
                    <span className="menu__rule" />
                    <button type="button" className="menu__item" onClick={() => void signOut().then(() => navigate('/sign-in', { state: { notice: 'signed-out' } }))}>
                      Sign out
                    </button>
                  </div>
                )}
              </Popover>
            ) : status === 'guest' ? (
              <span className="button-row button-row--tight">
                <ButtonLink to={`/sign-in?next=${encodeURIComponent(pathname)}`} variant="outline-night" size="sm">
                  Sign in
                </ButtonLink>
              </span>
            ) : null}
          </div>
        </div>
      </header>
      {user && !user.emailVerified && <VerifyBanner email={user.email} />}
      {loadError && (
        <div role="alert" className="app-alert">
          <span>Couldn’t load your project: {loadError}</span>
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
      {readOnly && org && projectId && !pathname.startsWith('/app/settings') && (
        <div role="status" className="app-alert app-alert--muted">
          <span>
            You’re a viewer in {org.name}: you can read everything but not change answers or submit documents.
          </span>
        </div>
      )}
      {guestDraft && !readOnly && org && (
        <div role="status" className="app-alert app-alert--info">
          <span>
            Answers for {guestDraft.device.name || guestDraft.company.name || 'a device'} from before you signed in are still in this
            browser.
          </span>
          <span className="button-row button-row--tight">
            <Button size="sm" onClick={() => void newProject('guest')}>
              Save as a project in {org.name}
            </Button>
            <Button variant="text" size="sm" onClick={discardGuest}>
              Discard
            </Button>
          </span>
        </div>
      )}
      <div className="app-body">{children}</div>
    </div>
  );
}
