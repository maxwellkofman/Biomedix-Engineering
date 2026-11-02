import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Logo } from './Logo';

const NAV = [
  { label: 'Review queue', to: '/app/review' },
  { label: 'Agents', to: '/app/agents' },
  { label: 'Trace graph', to: '/app/trace' },
  { label: 'Gates', to: '/app/gates' },
  { label: 'Procedures', to: '/app/procedures' },
];

interface AppShellProps {
  project: string;
  user: { initials: string; label: string; tone?: 'bright' | 'muted' };
  children: ReactNode;
}

/** Product chrome: dark top bar with app nav, project switcher and avatar. */
export function AppShell({ project, user, children }: AppShellProps) {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__left">
            <Logo variant="app" />
            <nav aria-label="App" className="app-nav">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} className="app-nav__link">
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="app-header__right">
            <span className="app-header__project">{project}</span>
            <span
              role="img"
              aria-label={user.label}
              className={`avatar${user.tone === 'muted' ? ' avatar--muted' : ''}`}
            >
              {user.initials}
            </span>
          </div>
        </div>
      </header>
      <div className="app-body">{children}</div>
    </div>
  );
}
