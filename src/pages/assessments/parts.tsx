import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '../../components/Button';
import { docHref } from '../../lib/links';
import '../../styles/app.css';
import '../../styles/flow.css';
import '../../styles/account.css';
import '../../styles/org.css';
import '../../styles/assess.css';

export interface SegOption {
  value: string;
  label: string;
  hint?: string;
  tone?: 'ok' | 'warn' | 'bad' | 'muted';
}

/** A radio group drawn as a row of buttons. */
export function Seg({
  name,
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
  hideLabel,
}: {
  name: string;
  label: ReactNode;
  value: string;
  options: SegOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: ReactNode;
  hideLabel?: boolean;
}) {
  return (
    <fieldset className="asm-seg" disabled={disabled}>
      <legend className={hideLabel ? 'visually-hidden' : 'asm-seg__label'}>{label}</legend>
      <div className="asm-seg__opts">
        {options.map((o) => (
          <label
            key={o.value}
            className={`asm-seg__opt${value === o.value ? ` asm-seg__opt--on asm-seg__opt--${o.tone ?? 'ok'}` : ''}`}
            title={o.hint}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </fieldset>
  );
}

export const YES_NO: SegOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No', tone: 'muted' },
];

/** A labelled text input or textarea that can be read-only. */
export function Text({
  id,
  label,
  value,
  onChange,
  rows,
  placeholder,
  disabled,
  type = 'text',
  hint,
  max = 2000,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'date';
  hint?: ReactNode;
  max?: number;
}) {
  return (
    <div className="field asm-field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      {rows ? (
        <textarea
          id={id}
          rows={rows}
          className="input input--area"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={max}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          className="input"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={max}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="stack asm-progress">
      <div className="asm-progress__top">
        <span className="asm-progress__label">{label}</span>
        <strong>{pct}%</strong>
      </div>
      <div className="meter" aria-hidden="true">
        <span className="meter__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-muted-sm">
        {done} of {total} items done
      </span>
    </div>
  );
}

/** Page head shared by both assessments. */
export function AssessmentHead({
  eyebrow,
  title,
  blurb,
  docId,
  children,
}: {
  eyebrow: string;
  title: string;
  blurb: ReactNode;
  docId: string;
  children: ReactNode;
}) {
  return (
    <>
      <Link to="/app/assessments" className="back-link">
        ← Assessments
      </Link>
      <div className="asm-head">
        <div className="stack asm-head__copy">
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="setup-main__title">{title}</h1>
          <p className="setup-main__blurb">{blurb}</p>
        </div>
        <aside className="card card--compact stack asm-head__status" aria-label="Progress">
          {children}
          <ButtonLink to={docHref(docId)} variant="outline" size="sm">
            View {docId} →
          </ButtonLink>
        </aside>
      </div>
    </>
  );
}

export function ReadOnlyNote({ readOnly }: { readOnly: boolean }) {
  if (!readOnly) return null;
  return (
    <p role="status" className="notice">
      You have view-only access to this company, so the assessment can’t be changed here.
    </p>
  );
}

/**
 * Opens and scrolls to the element named in the URL hash. `open` is called
 * with the hash first so a collapsed card can expand before scrolling.
 */
export function useHashTarget(open: (hash: string) => void) {
  useEffect(() => {
    const go = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;
      open(hash);
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (!el) return;
        el.scrollIntoView({ block: 'start' });
        const focusable = el.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
        focusable?.focus({ preventScroll: true });
      });
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
    // Only on mount and on hash changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
