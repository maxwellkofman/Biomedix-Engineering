import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type ButtonVariant =
  | 'primary'
  | 'bright'
  | 'outline'
  | 'outline-night'
  | 'text'
  | 'text-night';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

function classes(variant: ButtonVariant, size: ButtonSize, extra?: string) {
  return ['btn', `btn--${variant}`, size !== 'md' && `btn--${size}`, extra].filter(Boolean).join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={classes(variant, size, className)} {...rest} />;
}

interface ButtonLinkProps {
  /** In-app routes start with "/"; anything else (e.g. "#start") renders a plain anchor. */
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

export function ButtonLink({ to, variant = 'primary', size = 'md', className, children }: ButtonLinkProps) {
  const cls = classes(variant, size, className);
  if (to.startsWith('/')) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} className={cls}>
      {children}
    </a>
  );
}
