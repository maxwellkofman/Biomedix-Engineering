import type { DocLifecycle } from '../compliance/readiness';

export type StageTone = 'ok' | 'info' | 'warn' | 'muted';

/** One-line state of a document's saved draft and its sign-offs. */
export function stageOf(life: DocLifecycle | undefined): { text: string; tone: StageTone } {
  if (!life || !life.latest) return { text: 'Not saved yet', tone: 'muted' };
  const n = life.latest.draft;
  if (life.changed) return { text: `Changed since draft ${n}`, tone: 'warn' };
  switch (life.stage) {
    case 'submitted':
      return { text: `Draft ${n} · in technical review`, tone: 'info' };
    case 'returned':
      return { text: `Draft ${n} · returned with comments`, tone: 'warn' };
    case 'reviewed':
      return { text: `Draft ${n} · reviewed, awaiting approval`, tone: 'info' };
    case 'approved':
      return { text: `Draft ${n} · approved`, tone: 'ok' };
    default:
      return { text: `Draft ${n} saved`, tone: 'muted' };
  }
}

export function StageTag({ life }: { life: DocLifecycle | undefined }) {
  const s = stageOf(life);
  return <span className={`stage stage--${s.tone}`}>{s.text}</span>;
}

export function formatDate(iso: string, withTime = true) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

/** A readiness ring: the percentage in the middle, the arc filled to match. */
export function ReadinessRing({ pct, size = 132 }: { pct: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% ready`} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line-soft)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring__value">
        {pct}%
      </text>
    </svg>
  );
}
