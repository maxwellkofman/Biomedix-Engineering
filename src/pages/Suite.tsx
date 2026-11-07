import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ReadinessRing, StageTag } from '../components/Lifecycle';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { missingHref, Segments } from '../components/Segments';
import { TIERS } from '../data/procedures';
import { useIntake } from '../intake/IntakeContext';
import { TOKENS } from '../intake/derive';
import { downloadText, suiteToMarkdown, type GeneratedDoc } from '../templates/generate';
import { docHref } from '../lib/links';
import '../styles/app.css';
import '../styles/flow.css';

export { docHref };

export function StatusPill({ doc }: { doc: GeneratedDoc }) {
  if (doc.status === 'na') return <span className="status status--na">Not applicable</span>;
  if (doc.status === 'ready') return <span className="status status--ready">Ready for review</span>;
  return <span className="status status--input">Needs input · {doc.missing.length}</span>;
}

export default function Suite() {
  const { suite, tokens, started, loadExample, intake, mode, lives, readiness, runs } = useIntake();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const created = params.get('created') === '1';

  if (!started) {
    return (
      <AppShell>
        <main className="app-main suite-empty">
          <span className="eyebrow">DOCUMENTATION SUITE</span>
          <h1 className="setup-main__title">Answer a few questions. Get every required procedure, drafted.</h1>
          <p className="setup-main__blurb">
            Tell us about your company, device and team. The agents work out which procedures FDA expects for your
            device and fill in everything they can. You review what's left.
          </p>
          <div className="mode-grid">
            <Link to="/app/form" className="card mode-card">
              <span className="eyebrow">SINGLE FORM</span>
              <span className="mode-card__title">Answer one questionnaire</span>
              <span className="card__body">
                Every question on one page, each showing which documents it fills. Best if you have the details to hand.
              </span>
              <span className="mode-card__go">Open the form →</span>
            </Link>
            <Link to="/app/setup/company" className="card mode-card">
              <span className="eyebrow">GUIDED</span>
              <span className="mode-card__title">Go step by step</span>
              <span className="card__body">Seven short steps with a live preview of your suite as you answer.</span>
              <span className="mode-card__go">Start setup →</span>
            </Link>
          </div>
          <div className="button-row">
            <Button
              variant="text"
              onClick={() => {
                loadExample();
                navigate('/app/suite?created=1');
              }}
            >
              Or try it with an example device
            </Button>
          </div>
        </main>
      </AppShell>
    );
  }

  const company = tokens.company?.value ?? 'your company';
  const runNo = Number(params.get('run'));
  const run = runNo ? runs.find((r) => r.number === runNo) : undefined;

  return (
    <AppShell>
      <main className="app-main suite-main">
        <div className="suite-head">
          <div className="stack suite-head__copy">
            <span className="eyebrow">DOCUMENTATION SUITE</span>
            <h1 className="setup-main__title">Procedures and records for {company}</h1>
            <p className="setup-main__blurb">
              Highlighted values come from your setup answers. Dashed ones were derived by the agent — confirm them.
              Amber items still need input.
            </p>
          </div>
          <div className="button-row">
            <ButtonLink to="/app/form" variant="outline">
              Edit answers
            </ButtonLink>
            {mode === 'account' && (
              <ButtonLink to="/app/history" variant="outline">
                History{runs.length ? ` · ${runs.length} run${runs.length > 1 ? 's' : ''}` : ''}
              </ButtonLink>
            )}
            <Button
              variant="outline"
              onClick={() =>
                downloadText(`${(tokens.company?.value ?? 'qms').replace(/\W+/g, '-')}-documentation-suite.md`, suiteToMarkdown(suite, tokens))
              }
            >
              Export all (.md)
            </Button>
            <ButtonLink to="/app/publish">Publish to SharePoint</ButtonLink>
          </div>
        </div>

        {created && (
          <div role="status" className="created-banner">
            <div className="stack">
              <strong>
                {run ? `Run ${run.number} saved to your account.` : 'Your documentation is created.'}
              </strong>
              <span>
                {run
                  ? [
                      run.summary.counts.new && `${run.summary.counts.new} new`,
                      run.summary.counts.revised && `${run.summary.counts.revised} revised with a new draft`,
                      run.summary.counts.same && `${run.summary.counts.same} unchanged`,
                      run.summary.counts.dropped && `${run.summary.counts.dropped} no longer required`,
                    ]
                      .filter(Boolean)
                      .join(', ') + '. '
                  : `${suite.applicable.length} procedures drafted, ${suite.filledPct}% filled from your answers. `}
                {suite.missing.length
                  ? `${suite.missing.length} answer${suite.missing.length > 1 ? 's' : ''} would fill the rest.`
                  : 'Nothing left to fill.'}{' '}
                Readiness is {readiness.pct}%.
                {mode === 'guest' && ' Answers are saved in this browser only.'}
              </span>
            </div>
            <div className="button-row">
              {mode === 'guest' && (
                <ButtonLink to="/sign-up?next=/app/suite" variant="primary">
                  Save to an account
                </ButtonLink>
              )}
              <ButtonLink to="/app/publish" variant={intake.qms.docSystem === 'sharepoint' ? 'primary' : 'outline'}>
                {intake.qms.docSystem === 'sharepoint' ? 'Set up SharePoint →' : 'Download or publish →'}
              </ButtonLink>
              <Button variant="text" onClick={() => setParams({}, { replace: true })}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <div className="facts suite-stats">
          {[
            ['Compliance readiness', `${readiness.pct}%`],
            ['Required procedures', String(suite.applicable.length)],
            ['Auto-filled', `${suite.filledPct}%`],
            ['Ready for review', String(suite.ready)],
            ['Need input', String(suite.needsInput)],
            ['Not applicable', String(suite.notApplicable)],
          ].map(([k, v]) => (
            <div key={k} className="facts__cell">
              <span className="facts__key">{k}</span>
              <span className="suite-stats__value">{v}</span>
            </div>
          ))}
        </div>
        <div className="meter meter--lg" aria-label={`${suite.filledPct}% auto-filled`} role="img">
          <span className="meter__fill" style={{ width: `${suite.filledPct}%` }} />
        </div>

        <div className="suite-grid">
          <div className="stack suite-tiers">
            {TIERS.map((tier) => {
              const docs = suite.docs.filter((d) => d.proc.g === tier.key);
              return (
                <section key={tier.key} aria-labelledby={`tier-${tier.key}`} className="card card--compact suite-tier">
                  <div className="outline__head">
                    <h2 id={`tier-${tier.key}`} className="mono suite-tier__name">
                      {tier.name}
                    </h2>
                    <span className="text-muted-sm">{docs.filter((d) => d.status !== 'na').length} required</span>
                  </div>
                  <ul className="list-reset">
                    {docs.map((doc) => (
                      <li key={doc.proc.id} className={`doc-row${doc.status === 'na' ? ' doc-row--na' : ''}`}>
                        <Link to={docHref(doc.proc.id)} className="doc-row__link">
                          <span className="mono doc-row__id">{doc.proc.id}</span>
                          <span className="stack doc-row__main">
                            <span className="doc-row__title">{doc.proc.title}</span>
                            <span className="doc-row__sub">
                              {doc.status === 'na'
                                ? doc.reason
                                : doc.pending
                                  ? `Included until you answer: ${doc.pending}`
                                  : `${doc.proc.sections.length} sections · owner `}
                              {doc.status !== 'na' && !doc.pending && <Segments segs={[{ kind: 'token', key: doc.ownerToken }]} />}
                            </span>
                          </span>
                          <span className="stack doc-row__status">
                            <StatusPill doc={doc} />
                            {doc.status !== 'na' && (
                              <span className="meter meter--sm" aria-hidden="true">
                                <span className="meter__fill" style={{ width: `${doc.filledPct}%` }} />
                              </span>
                            )}
                            {mode === 'account' && doc.status !== 'na' && <StageTag life={lives[doc.proc.id]} />}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="stack suite-side">
            <Link to="/app/readiness" className="card card--compact readiness-mini">
              <ReadinessRing pct={readiness.pct} size={88} />
              <span className="stack">
                <span className="card__title card__title--sm">Compliance readiness</span>
                <span className="text-muted-sm">
                  {readiness.counts.approved} of {suite.applicable.length} procedures approved ·{' '}
                  {readiness.requirementsMet} of {readiness.requirementsTotal} requirements met
                </span>
                <span className="mode-card__go">See what's left →</span>
              </span>
            </Link>
            <section aria-labelledby="missing-h" className="card card--compact">
              <h2 id="missing-h" className="card__title card__title--sm">
                What's still missing
              </h2>
              {suite.missing.length === 0 ? (
                <p className="text-sm ink-2">Nothing. Every required procedure is filled in and ready for technical review.</p>
              ) : (
                <>
                  <p className="text-muted-sm">Each answer fills every document that uses it.</p>
                  <ul className="list-reset stack missing-list">
                    {suite.missing.map((m) => (
                      <li key={m.key}>
                        <Link to={missingHref(m.key)} className="missing-list__item">
                          <span>{TOKENS[m.key].label}</span>
                          <span className="missing-list__count">
                            {m.docs.length} doc{m.docs.length > 1 ? 's' : ''}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section aria-labelledby="gate-h" className="card card--night card--compact gate-card">
              <h2 id="gate-h" className="card__title card__title--sm">
                Gate zero determination
              </h2>
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
              <p className="gate-card__note">Drafted by the agent. A Biomedix engineer and your team sign it.</p>
            </section>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
