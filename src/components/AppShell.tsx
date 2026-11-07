import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { initials, useAccount } from '../account/AccountContext';
import { useIntake, type SaveState } from '../intake/IntakeContext';
import { Button, ButtonLink } from './Button';
import { Logo } from './Logo';
import '../styles/account.css';

const NAV = [
  { label: 'Review queue', to: '/app/review' },
  { label: 'Documentation', to: '/app/suite', also: ['/app/setup', '/app/form', '/app/publish', '/app/history', '/app/readiness'] },
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

/** Product chrome: dark top bar with app nav, readiness, project and account. */
export function AppShell({ children }: { children: ReactNode }) {
  const { status, user } = useAccount();
  const { intake, started, readiness, mode, saveState, loadError, retry, guestDraft, newProject, discardGuest } = useIntake();
  const { pathname } = useLocation();
  const label =
    intake.company.name || intake.device.name
      ? `${intake.company.name || '[Company]'} · ${intake.device.name || '[Device]'}`
      : mode === 'account'
        ? 'Untitled project'
        : '[Company] · [Device]';

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__left">
            <Logo variant="app" />
            <nav aria-label="App" className="app-nav">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `app-nav__link${isActive || item.also?.some((p) => pathname.startsWith(p)) ? ' active' : ''}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
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
              <Link to="/app/projects" className="app-header__project app-header__project--link" title={`${label} · switch project`}>
                <span className="app-header__project-name">{label}</span>
                {saveState !== 'idle' && (
                  <span className={`save-state save-state--${saveState}`} role="status">
                    {SAVE_LABEL[saveState]}
                  </span>
                )}
              </Link>
            ) : (
              <span className="app-header__project">{label}</span>
            )}
            {status === 'signed-in' && user ? (
              <Link to="/app/account" className="avatar" aria-label={`Account: ${user.name}`} title={user.name}>
                {initials(user.name)}
              </Link>
            ) : status === 'guest' ? (
              <ButtonLink to={`/sign-in?next=${encodeURIComponent(pathname)}`} variant="outline-night" size="sm">
                Sign in
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </header>
      {loadError && (
        <div role="alert" className="app-alert">
          <span>Couldn’t load your project: {loadError}</span>
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
      {guestDraft && (
        <div role="status" className="app-alert app-alert--info">
          <span>
            Answers for {guestDraft.device.name || guestDraft.company.name || 'a device'} from before you signed in are still
            in this browser.
          </span>
          <span className="button-row button-row--tight">
            <Button size="sm" onClick={() => void newProject('guest')}>
              Save as a new project
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
