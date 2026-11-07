import { TOKENS, type TokenKey } from '../intake/derive';

export function docHref(id: string) {
  return `/app/suite/${encodeURIComponent(id)}`;
}

/** The setup field that supplies a value. */
export function missingHref(k: TokenKey) {
  const def = TOKENS[k];
  return `/app/setup/${def.step}#${def.field}`;
}
