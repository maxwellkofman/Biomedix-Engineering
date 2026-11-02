import type { ReactNode } from 'react';

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  rows?: number;
  type?: 'text' | 'date';
  action?: ReactNode;
}

export function TextField({ id, label, value, onChange, hint, placeholder, rows, type = 'text', action }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <div className="field__top">
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        {action}
      </div>
      {rows ? (
        <textarea
          id={id}
          rows={rows}
          className="input input--area"
          value={value}
          placeholder={placeholder}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          className="input"
          value={value}
          placeholder={placeholder}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

interface ChoiceFieldProps {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (value: string) => void;
  hint?: ReactNode;
}

/** Radio group drawn as selectable cards. The first radio carries `id` so links can focus it. */
export function ChoiceField({ id, label, value, options, onChange, hint }: ChoiceFieldProps) {
  return (
    <fieldset className="field choice">
      <legend className="field__label">{label}</legend>
      <div className="choice__options">
        {options.map((o, i) => (
          <label key={o.value} className={`choice__option${value === o.value ? ' choice__option--on' : ''}`}>
            <input
              id={i === 0 ? id : undefined}
              type="radio"
              name={id}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className="stack">
              <span className="choice__label">{o.label}</span>
              {o.hint && <span className="choice__hint">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </fieldset>
  );
}

export const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
