import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface Props {
  /** Contents of the toggle button. */
  label: ReactNode;
  /** Accessible name when the label is only an icon or initials. */
  ariaLabel?: string;
  buttonClass?: string;
  align?: 'start' | 'end';
  children: (close: () => void) => ReactNode;
}

/** A button that opens a panel of links. Closes on Escape, outside clicks and navigation. */
export function Popover({ label, ariaLabel, buttonClass = '', align = 'end', children }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="popover" ref={root}>
      <button
        ref={button}
        type="button"
        className={buttonClass}
        aria-expanded={open}
        aria-controls={id}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div id={id} className={`popover__panel popover__panel--${align}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
