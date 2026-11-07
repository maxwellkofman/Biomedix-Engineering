import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { ReadinessRing, StageTag } from '../components/Lifecycle';
import { ProposalList } from '../components/SignoffPanel';
import type { NextAction, RequirementState } from '../compliance/readiness';
import { useIntake } from '../intake/IntakeContext';
import type { TokenKey } from '../intake/derive';
import { docHref } from '../lib/links';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/account.css';

const STATE_LABEL: Record<RequirementState, string> = {
  met: 'Met',
  reviewed: 'Awaiting approval',
  complete: 'Ready for review',
  drafting: 'Drafting',
  na: 'Not applicable',
};
const STATE_TONE: Record<RequirementState, string> = {
  met: 'ok',
  reviewed: 'info',
  complete: 'info',
  drafting: 'warn',
  na: 'muted',
};

const pct = (n: number) => `${Math.floor(n * 100)}%`;

function Mark({ value }: { value: number | boolean }) {
  const n = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  return (
    <span className={`check-mark${n === 1 ? ' check-mark--done' : n > 0 ? ' check-mark--part' : ''}`}>
      {n === 1 ? '✓' : typeof value === 'boolean' ? '—' : pct(n)}
    </span>
  );
}

export default function Readiness() {
  const { readiness, suite, started, mode, createRun, submitReady, loadExample } = useIntake();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (a: NextAction) => {
    setBusy(a.key);
    setMsg(null);
    try {
      if (a.run === 'save-run') {
        const r = await createRun();
        const n = r.summary.counts.new + r.summary.counts.revised;
        setMsg({ ok: true, text: `Run ${r.number} saved: ${n} document${n === 1 ? '' : 's'} got a new draft.` });
      } else if (a.run === 'submit-ready') {
        const n = await submitReady();
        setMsg({ ok: true, text: `${n} document${n === 1 ? '' : 's'} sent for technical review.` });
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };

  if (!started) {
    return (
      <AppShell>
        <main className="app-main suite-empty">
          <span className="eyebrow">COMPLIANCE READINESS</span>
          <h1 className="setup-main__title">Answer the questionnaire to see how close you are.</h1>
          <p className="setup-main__blurb">
            Readiness tracks every required procedure from first answer to approval, and maps each one to the FDA and ISO
            requirements it meets.
          </p>
          <div className="button-row">
            <ButtonLink to="/app/form">Open the questionnaire</ButtonLink>
            <Button variant="text" onClick={loadExample}>
              Try it with an example device
            </Button>
          </div>
        </main>
      </AppShell>
    );
  }

  const allDerived = [...new Set(readiness.docs.flatMap((d) => d.derived))] as TokenKey[];
  allDerived.sort(
    (a, b) =>
      readiness.docs.filter((d) => d.derived.includes(b)).length - readiness.docs.filter((d) => d.derived.includes(a)).length,
  );
  const n = suite.applicable.length;

  return (
    <AppShell>
      <main className="app-main readiness-main">
        <section className="card readiness-hero" aria-labelledby="ready-h">
          <ReadinessRing pct={readiness.pct} />
          <div className="stack readiness-hero__copy">
            <span className="eyebrow">COMPLIANCE READINESS</span>
            <h1 id="ready-h" className="setup-main__title">
              {readiness.pct === 100
                ? 'Every required procedure is approved.'
                : readiness.pct >= 75
                  ? 'Nearly there.'
                  : readiness.pct >= 40
                    ? 'Well under way.'
                    : 'Getting started.'}
            </h1>
            <p className="setup-main__blurb">
              {readiness.counts.approved} of {n} required procedures approved · {readiness.requirementsMet} of{' '}
              {readiness.requirementsTotal} requirements met. 100% means every procedure your device needs is filled in,
              confirmed, technically reviewed and approved as it stands today.
            </p>
            {mode === 'guest' && (
              <p className="notice notice--warn">
                Review and approval need saved drafts, so they stay at 0% until you{' '}
                <Link to="/sign-up?next=/app/readiness">create an account</Link>.
              </p>
            )}
          </div>
        </section>

        <div className="readiness-grid">
          <div className="stack">
            <section className="card card--compact" aria-labelledby="checks-h">
              <h2 id="checks-h" className="card__title card__title--sm">
                Four checks per procedure
              </h2>
              <ul className="list-reset stack check-list">
                {readiness.checks.map((c, i) => (
                  <li key={c.key} className="check-row">
                    <span className="mono check-row__num">{i + 1}</span>
                    <span className="stack check-row__main">
                      <span className="check-row__top">
                        <span className="check-row__label">{c.label}</span>
                        <span className="check-row__pct">{c.pct}%</span>
                      </span>
                      <span className="meter" aria-hidden="true">
                        <span className="meter__fill" style={{ width: `${c.pct}%` }} />
                      </span>
                      <span className="text-muted-sm">
                        {c.hint} · {c.done} of {c.total} procedures
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-sm">
                Each check is a quarter of a procedure’s score; readiness is the average across required procedures. A new
                draft resets review and approval for that procedure.
              </p>
            </section>

            <section className="card card--compact" aria-labelledby="docs-h">
              <h2 id="docs-h" className="card__title card__title--sm">
                Procedures
              </h2>
              <div className="table-wrap">
                <table className="readiness-table">
                  <thead>
                    <tr>
                      <th scope="col">Procedure</th>
                      <th scope="col">Filled</th>
                      <th scope="col">Confirmed</th>
                      <th scope="col">Reviewed</th>
                      <th scope="col">Approved</th>
                      <th scope="col">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readiness.docs.map((d) => (
                      <tr key={d.doc.proc.id}>
                        <th scope="row">
                          <Link to={docHref(d.doc.proc.id)} className="readiness-table__doc">
                            <span className="mono">{d.doc.proc.id}</span>
                            <span>{d.doc.proc.title}</span>
                          </Link>
                          {mode === 'account' && <StageTag life={d.life} />}
                        </th>
                        <td>
                          <Mark value={d.filled} />
                        </td>
                        <td>
                          <Mark value={d.confirmed} />
                        </td>
                        <td>
                          <Mark value={d.reviewed} />
                        </td>
                        <td>
                          <Mark value={d.approved} />
                        </td>
                        <td className="readiness-table__score">{pct(d.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card card--compact" aria-labelledby="req-h">
              <div className="outline__head">
                <h2 id="req-h" className="card__title card__title--sm">
                  Requirements matrix
                </h2>
                <span className="text-muted-sm">
                  {readiness.requirementsMet} of {readiness.requirementsTotal} met
                </span>
              </div>
              <p className="text-muted-sm">
                Each requirement and the procedures that meet it, from the procedure library. A requirement is met when every
                procedure covering it is approved.
              </p>
              {readiness.requirements.map((g) => (
                <div key={g.name} className="stack req-group">
                  <h3 className="req-group__name">{g.name}</h3>
                  <ul className="list-reset req-list">
                    {g.items.map((r) => (
                      <li key={r.ref} className={`req${r.state === 'na' ? ' req--na' : ''}`}>
                        <span className="mono req__ref">{r.ref}</span>
                        <span className="stack req__main">
                          <span className="req__title">{r.title}</span>
                          <span className="req__docs">
                            {r.state === 'na'
                              ? `${r.docs.join(', ')} not required for this device (justified in QM-001)`
                              : r.covering.map((d, i) => (
                                  <span key={d.doc.proc.id}>
                                    {i > 0 && ', '}
                                    <Link to={docHref(d.doc.proc.id)}>{d.doc.proc.id}</Link>
                                  </span>
                                ))}
                          </span>
                        </span>
                        <span className={`stage stage--${STATE_TONE[r.state]}`}>
                          {r.state === 'complete' && r.covering.every((d) => d.life.stage === 'submitted' && !d.life.changed)
                            ? 'In review'
                            : STATE_LABEL[r.state]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </div>

          <div className="stack readiness-side">
            <section className="card card--night card--compact next-card" aria-labelledby="next-h">
              <h2 id="next-h" className="card__title card__title--sm">
                What to do next
              </h2>
              {readiness.next.length === 0 ? (
                <p className="next-card__done">Nothing left. Every required procedure is approved.</p>
              ) : (
                <ol className="list-reset stack next-list">
                  {readiness.next.map((a) => (
                    <li key={a.key} className="next-item">
                      <span className="stack">
                        <span className="next-item__title">{a.title}</span>
                        <span className="next-item__detail">{a.detail}</span>
                      </span>
                      {a.run ? (
                        <Button variant="bright" size="sm" disabled={!!busy} onClick={() => void run(a)}>
                          {busy === a.key ? 'Working…' : a.run === 'save-run' ? 'Save run' : 'Send'}
                        </Button>
                      ) : (
                        a.to && (
                          <ButtonLink to={a.to} variant="outline-night" size="sm">
                            Go
                          </ButtonLink>
                        )
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {msg && (
                <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'next-card__ok' : 'oversight-panel__error'}>
                  {msg.text}
                </p>
              )}
            </section>

            <section id="proposals" className="card card--compact" aria-labelledby="prop-h">
              <div className="outline__head">
                <h2 id="prop-h" className="card__title card__title--sm">
                  Agent proposals
                </h2>
                <span className="text-muted-sm">
                  {allDerived.length - readiness.proposals.length} of {allDerived.length} confirmed
                </span>
              </div>
              {allDerived.length ? (
                <>
                  <p className="text-muted-sm">
                    Values the agent derived or defaulted. Confirm each one, or change the answer it comes from.
                  </p>
                  <ProposalList keys={allDerived} />
                </>
              ) : (
                <p className="text-muted-sm">Every value comes straight from your answers.</p>
              )}
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
