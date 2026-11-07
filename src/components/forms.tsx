import { useState, type FormEvent, type ReactNode } from 'react';
import { scorePassword } from '../lib/password';

/** Busy flag and one success/error message for a form or button. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };
  const onSubmit = (fn: () => Promise<string | void>) => (e: FormEvent) => {
    e.preventDefault();
    void run(fn);
  };
  const note = msg && (
    <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'form-msg form-msg--ok' : 'form-msg form-msg--err'}>
      {msg.text}
    </p>
  );
  return { busy, run, onSubmit, note, setMsg };
}

interface PasswordProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  /** Show the strength meter and hint for a new password. */
  meter?: boolean;
  hint?: ReactNode;
  night?: boolean;
}

/** Password field with a show/hide toggle and, for new passwords, a strength meter. */
export function PasswordField({ id, label, value, onChange, autoComplete, meter = false, hint, night = false }: PasswordProps) {
  const [shown, setShown] = useState(false);
  const s = meter ? scorePassword(value) : null;
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <span className="pw">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          className={`input pw__input${night ? ' input--night' : ''}`}
          autoComplete={autoComplete}
          required
          minLength={meter ? 12 : undefined}
          maxLength={256}
          aria-describedby={meter || hint ? `${id}-hint` : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="pw__toggle"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </span>
      {s && (
        <span className="pw-meter" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < s.score ? `pw-meter__bar pw-meter__bar--${s.score}` : 'pw-meter__bar'} />
          ))}
        </span>
      )}
      {(meter || hint) && (
        <p id={`${id}-hint`} className="field__hint" aria-live="polite">
          {s && value ? s.label : (hint ?? 'At least 12 characters. A short sentence works well.')}
        </p>
      )}
    </div>
  );
}

/** Six-digit code from an authenticator app, or a recovery code. */
export function CodeField({
  id,
  value,
  onChange,
  allowRecovery = false,
  night = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  allowRecovery?: boolean;
  night?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {allowRecovery ? 'Authentication code or recovery code' : 'Authentication code'}
      </label>
      <input
        id={id}
        className={`input code-input${night ? ' input--night' : ''}`}
        inputMode={allowRecovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        pattern={allowRecovery ? undefined : '[0-9 ]{6,7}'}
        maxLength={allowRecovery ? 12 : 7}
        required
        spellCheck={false}
        placeholder={allowRecovery ? '123456 or abcd-efgh' : '123456'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
