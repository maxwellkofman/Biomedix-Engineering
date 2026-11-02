import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useIntake } from '../intake/IntakeContext';
import { Logo } from './Logo';

const NAV = [
  { label: 'Review queue', to: '/app/review' },
  { label: 'Documentation', to: '/app/suite', also: '/app/setup' },
  { label: 'Agents', to: '/app/agents' },
  { label: 'Trace graph', to: '/app/trace' },
  { label: 'Gates', to: '/app/gates' },
  { label: 'Procedures', to: '/app/procedures' },
];

interface AppShellProps {
  /** Shown until the customer has entered their company and device in setup. */
  project?: string;
  user: { initials: string; label: string; tone?: 'bright' | 'muted' };
  children: ReactNode;
}

/** Product chrome: dark top bar with app nav, project label and avatar. */
export function AppShell({ project = '[Company] · Example SaMD project', user, children }: AppShellProps) {
  const { intake } = useIntake();
  const { pathname } = useLocation();
  const label =
    intake.company.name || intake.device.name
      ? `${intake.company.name || '[Company]'} · ${intake.device.name || '[Device]'}`
      : project;
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
                    `app-nav__link${isActive || (item.also && pathname.startsWith(item.also)) ? ' active' : ''}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="app-header__right">
            <span className="app-header__project">{label}</span>
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
