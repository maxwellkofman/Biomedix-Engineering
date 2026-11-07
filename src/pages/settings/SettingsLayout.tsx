import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAccount } from '../../account/AccountContext';
import { AppShell } from '../../components/AppShell';
import '../../styles/app.css';
import '../../styles/flow.css';
import '../../styles/account.css';
import '../../styles/org.css';

const link = ({ isActive }: { isActive: boolean }) => `settings-nav__link${isActive ? ' settings-nav__link--on' : ''}`;

/** Settings: your account on top, the active company below. */
export function SettingsLayout({ eyebrow, title, blurb, children }: { eyebrow: string; title: string; blurb?: ReactNode; children: ReactNode }) {
  const { org, user } = useAccount();
  return (
    <AppShell>
      <aside aria-label="Settings" className="app-sidebar settings-side">
        <div className="stack app-sidebar__head">
          <h1 className="app-sidebar__title">Settings</h1>
          <span className="app-sidebar__sub">{user?.email}</span>
        </div>
        <nav className="stack settings-nav" aria-label="Settings sections">
          <span className="settings-nav__group">Your account</span>
          <NavLink to="/app/settings/profile" className={link}>
            Profile
          </NavLink>
          <NavLink to="/app/settings/security" className={link}>
            Password and two-factor
          </NavLink>
          <NavLink to="/app/settings/sessions" className={link}>
            Signed-in devices
          </NavLink>
          <span className="settings-nav__group">{org?.name ?? 'Company'}</span>
          <NavLink to="/app/settings/company" className={link} end>
            Company
          </NavLink>
          {org && (
            <>
              <NavLink to="/app/settings/members" className={link}>
                Members and roles
              </NavLink>
              <NavLink to="/app/settings/activity" className={link}>
                Activity log
              </NavLink>
            </>
          )}
        </nav>
      </aside>
      <main className="app-main settings-main">
        <div className="stack suite-head__copy">
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="setup-main__title">{title}</h2>
          {blurb && <p className="setup-main__blurb">{blurb}</p>}
        </div>
        {children}
      </main>
    </AppShell>
  );
}

export function SettingsCard({ title, id, children, danger = false, aside }: { title: string; id: string; children: ReactNode; danger?: boolean; aside?: ReactNode }) {
  return (
    <section className={`card card--compact stack account-form${danger ? ' account-form--danger' : ''}`} aria-labelledby={id}>
      <div className="outline__head">
        <h3 id={id} className="card__title card__title--sm">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
