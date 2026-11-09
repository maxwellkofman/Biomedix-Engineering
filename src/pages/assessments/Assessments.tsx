import { Link } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { StageTag } from '../../components/Lifecycle';
import { useIntake } from '../../intake/IntakeContext';
import { summarizePart11 } from '../../assessments/part11';
import { summarizeRisk } from '../../assessments/risk';
import { docHref } from '../../lib/links';
import { plural, Progress } from './parts';

export default function Assessments() {
  const { intake, derived, suite, lives, mode } = useIntake();
  const p11 = summarizePart11(intake);
  const risk = summarizeRisk(intake, derived);
  const cards = [
    {
      id: 'FRM-019',
      to: '/app/assessments/part11',
      eyebrow: '21 CFR PART 11',
      title: 'Electronic records and signatures',
      body: 'Which of your systems Part 11 covers, and whether each one meets the record and signature controls. Controls are set by the risk of each system’s records.',
      sum: p11,
      facts: [
        `${p11.inScope} of ${plural(p11.systems.length, 'system')} in scope`,
        plural(p11.findings.length, 'finding'),
        p11.suggested ? `${plural(p11.suggested, 'suggestion')} to review` : '',
      ],
      go: p11.systems.length ? 'Continue the assessment →' : 'Start with the systems from your answers →',
    },
    {
      id: 'RMF-001',
      to: '/app/assessments/risk',
      eyebrow: 'ISO 14971 RISK',
      title: 'Hazards, risks and controls',
      body: 'Hazard identification, risk estimation on the SOP-003 matrix, controls with verification, and residual risk, alone and overall.',
      sum: risk,
      facts: [
        plural(risk.hazards.length, 'hazard'),
        `${risk.counts.residualU} unacceptable after control`,
        risk.pending.length ? `${plural(risk.pending.length, 'suggested hazard')} to review` : '',
      ],
      go: risk.hazards.length ? 'Continue the assessment →' : 'Start with the suggested hazards →',
    },
  ];
  return (
    <AppShell>
      <main className="app-main asm-main">
        <div className="stack asm-head__copy">
          <span className="eyebrow">ASSESSMENTS</span>
          <h1 className="setup-main__title">Assessments for {intake.device.name || 'your device'}</h1>
          <p className="setup-main__blurb">
            Each assessment is a checklist you work through, with suggestions drafted from your setup answers. It produces a controlled
            record in your documentation suite, which goes through technical review and approval like every other document.
          </p>
        </div>
        <div className="asm-index">
          {cards.map((c) => {
            const doc = suite.applicable.find((d) => d.proc.id === c.id);
            return (
              <section key={c.id} className="card stack asm-index__card" aria-labelledby={`${c.id}-h`}>
                <span className="eyebrow">
                  {c.eyebrow} · {c.id}
                </span>
                <h2 id={`${c.id}-h`} className="card__title">
                  <Link to={c.to}>{c.title}</Link>
                </h2>
                <p className="card__body">{c.body}</p>
                <Progress done={c.sum.done} total={c.sum.total} label="Progress" />
                <ul className="list-reset asm-facts">
                  {c.facts.filter(Boolean).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <div className="asm-index__foot">
                  <Link to={c.to} className="mode-card__go">
                    {c.go}
                  </Link>
                  {doc && (
                    <span className="asm-index__doc">
                      <Link to={docHref(c.id)}>View {c.id}</Link>
                      {mode === 'account' && <StageTag life={lives[c.id]} />}
                    </span>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
