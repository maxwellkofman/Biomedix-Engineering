import { Link } from 'react-router-dom';
import { useIntake } from '../intake/IntakeContext';
import { TOKENS, type TokenKey } from '../intake/derive';
import { isFilled, type Segment } from '../templates/generate';

/** Renders template text: filled values are marked, missing ones link to the setup field that supplies them. */
export function Segments({ segs }: { segs: Segment[] }) {
  return (
    <>
      {segs.map((s, i) => (s.kind === 'text' ? <span key={i}>{s.text}</span> : <Token key={i} k={s.key} />))}
    </>
  );
}

export function Token({ k }: { k: TokenKey }) {
  const { tokens } = useIntake();
  const def = TOKENS[k];
  const v = tokens[k];
  if (v && isFilled(tokens, k)) {
    return (
      <mark
        className={`tok ${v.auto ? 'tok--auto' : 'tok--filled'}`}
        title={v.auto ? `${def.label}: derived from your answers — confirm` : `${def.label}: from your answers`}
      >
        {v.value}
      </mark>
    );
  }
  return (
    <Link className="tok tok--missing" to={missingHref(k)} title={`${def.label}: needs input`}>
      {v?.value ?? `[${def.label}]`}
    </Link>
  );
}

export function missingHref(k: TokenKey) {
  const def = TOKENS[k];
  return `/app/setup/${def.step}#${def.field}`;
}
