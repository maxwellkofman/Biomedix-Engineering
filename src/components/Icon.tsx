import type { SVGProps } from 'react';

/** Stroke icons from the design. They inherit `currentColor`. */
const paths = {
  chat: (
    <>
      <path d="M6 8h20v13H13l-5 4v-4H6z" />
      <path d="M11 13h10M11 17h6" />
    </>
  ),
  video: (
    <>
      <rect x="4" y="9" width="17" height="14" rx="2" />
      <path d="M21 14l7-4v12l-7-4" />
    </>
  ),
  'doc-check': (
    <>
      <path d="M6 25V7h14l6 6v12z" />
      <path d="M11 18l3 3 6-7" />
    </>
  ),
  'doc-lines': (
    <>
      <path d="M6 25V7h14l6 6v12z" />
      <path d="M10 14h12M10 19h8" />
    </>
  ),
  shield: (
    <>
      <path d="M16 4 6 8v8c0 6 4.5 10 10 12 5.5-2 10-6 10-12V8z" />
      <path d="M12 16l3 3 5-6" />
    </>
  ),
  signature: (
    <>
      <path d="M8 22c2-6 6-6 8 0s6 6 8 0" />
      <path d="M6 27h20" />
    </>
  ),
  lock: (
    <>
      <rect x="7" y="14" width="18" height="13" rx="2" />
      <path d="M11 14v-4a5 5 0 0 1 10 0v4" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 30, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg
      className="check-icon"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

export function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 1.5h5.5L11 4v8.5H3z" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="7" />
      <path d="M9 5.5v4M9 12.3v.2" />
    </svg>
  );
}
