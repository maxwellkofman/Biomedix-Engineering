import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';
import '../../styles/app.css';
import '../../styles/flow.css';
import '../../styles/account.css';
import '../../styles/org.css';

interface Props {
  eyebrow: string;
  title: ReactNode;
  points?: string[];
  cardTitle: string;
  children: ReactNode;
  foot?: ReactNode;
}

/** Dark split layout shared by sign-in, sign-up, password reset, verification and invitations. */
export function AuthLayout({ eyebrow, title, points, cardTitle, children, foot }: Props) {
  return (
    <div className="auth">
      <header className="auth__top">
        <Logo variant="app" />
      </header>
      <main className="auth__main">
        <div className="auth__intro">
          <span className="eyebrow eyebrow--on-night">{eyebrow}</span>
          <h1 className="auth__title">{title}</h1>
          {points && (
            <ul className="list-reset stack auth__points">
              {points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        <section className="card auth__card" aria-labelledby="auth-h">
          <h2 id="auth-h" className="card__title">
            {cardTitle}
          </h2>
          {children}
          {foot}
        </section>
      </main>
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="auth__error">
      {children}
    </p>
  );
}

export function AuthNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="auth__note">
      {children}
    </p>
  );
}
