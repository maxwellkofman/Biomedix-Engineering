import { Link } from 'react-router-dom';

interface LogoMarkProps {
  size?: number;
}

export function LogoMark({ size = 28 }: LogoMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="5" cy="14" r="3.5" stroke="var(--color-accent-light)" strokeWidth="2" />
      <circle cx="23" cy="6" r="3.5" stroke="var(--color-accent-light)" strokeWidth="2" />
      <circle cx="23" cy="22" r="3.5" stroke="var(--color-accent-light)" strokeWidth="2" />
      <path
        d="M8.3 12.5 19.7 7.5M8.3 15.5l11.4 5"
        stroke="var(--color-on-night)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface LogoProps {
  to?: string;
  /** "site" for the marketing header, "app" for the compact product header. */
  variant?: 'site' | 'app';
}

export function Logo({ to = '/', variant = 'site' }: LogoProps) {
  const compact = variant === 'app';
  return (
    <Link to={to} className={`logo${compact ? ' logo--compact' : ''}`}>
      <LogoMark size={compact ? 24 : 28} />
      <span className="logo__word">Biomedix Engineering</span>
    </Link>
  );
}
