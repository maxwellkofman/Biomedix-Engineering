import { TOKENS, type TokenKey } from '../intake/derive';

export function docHref(id: string) {
  return `/app/suite/${encodeURIComponent(id)}`;
}

/** The setup field that supplies a value. */
export function missingHref(k: TokenKey) {
  const def = TOKENS[k];
  return `/app/setup/${def.step}#${def.field}`;
}

/** Only same-site paths, so ?next= can't send someone to another site. */
export function safeNext(raw: string | null | undefined, fallback = '/app/dashboard') {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : fallback;
}
