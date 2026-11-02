import type { ReactNode } from 'react';
import { useIntake } from '../intake/IntakeContext';
import { ButtonLink } from './Button';
import { Segments } from './Segments';

/** Right-hand live preview: suite progress plus the gate zero determination. */
export function SuitePreview({ children }: { children?: ReactNode }) {
  const { suite, started } = useIntake();
  const pct = started ? suite.filledPct : 0;
  return (
    <aside aria-label="Documentation preview" className="setup-preview">
      <section className="card card--compact preview-card">
        <div className="outline__head">
          <h2 className="card__title card__title--sm">Your documentation suite</h2>
          <span className="text-muted-sm">Live</span>
        </div>
        <div className="meter" aria-hidden="true">
          <span className="meter__fill" style={{ width: `${pct}%` }} />
        </div>
        <dl className="preview-stats">
          <div>
            <dt>Required</dt>
            <dd>{suite.applicable.length}</dd>
          </div>
          <div>
            <dt>Auto-filled</dt>
            <dd>{pct}%</dd>
          </div>
          <div>
            <dt>Ready</dt>
            <dd>{suite.ready}</dd>
          </div>
        </dl>
        {children ?? (
          <ButtonLink to="/app/suite" variant="outline" size="sm">
            Open documentation suite
          </ButtonLink>
        )}
      </section>

      <section className="card card--night card--compact gate-card">
        <h2 className="card__title card__title--sm">Gate zero · drafted by the agent</h2>
        <dl className="gate-card__list">
          {suite.gateZero.map((g) => (
            <div key={g.q}>
              <dt>{g.q}</dt>
              <dd>
                <Segments segs={g.segs} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="gate-card__note">A Biomedix engineer and your team sign the determination.</p>
      </section>
    </aside>
  );
}
