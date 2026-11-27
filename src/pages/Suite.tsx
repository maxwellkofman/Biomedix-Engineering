import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { StageTag } from '../components/Lifecycle';
import { Popover } from '../components/Popover';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { missingHref, Segments } from '../components/Segments';
import { TIERS } from '../data/procedures';
import { useIntake } from '../intake/IntakeContext';
import { TOKENS } from '../intake/derive';
import { downloadText, openItems, suiteToMarkdown, type GeneratedDoc } from '../templates/generate';
import { docHref } from '../lib/links';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/org.css';
import '../styles/clean.css';
import '../styles/equipment.css';

export { docHref };

export function StatusPill({ doc }: { doc: GeneratedDoc }) {
  if (doc.status === 'na') return <span className="status status--na">Not applicable</span>;
  if (doc.status === 'ready') return <span className="status status--ready">Ready for review</span>;
  return <span className="status status--input">Needs input · {openItems(doc)}</span>;
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
          <span className="eyebrow">DOCUMENTS</span>
          <h1 className="setup-main__title">No documents yet.</h1>
          <p className="setup-main__blurb">
            Describe your device and the agent drafts every procedure and assessment it needs. You answer what it can’t work out; an engineer
            reviews the result.
          </p>
          <div className="button-row">
            <ButtonLink to="/app/start">Describe your device</ButtonLink>
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
  // One line per assessment page: an equipment package spreads over several documents.
  const assessments = suite.applicable
    .filter((d) => d.progress && (d.progress.done < d.progress.total || d.progress.suggested))
    .filter((d, i, all) => all.findIndex((x) => x.progress!.href === d.progress!.href) === i);
  const runNo = Number(params.get('run'));
  const run = runNo ? runs.find((r) => r.number === runNo) : undefined;

  return (
    <AppShell>
      <main className="app-main suite-main">
        <div className="suite-head">
          <div className="stack suite-head__copy">
            <span className="eyebrow">DOCUMENTS</span>
            <h1 className="setup-main__title">Documents for {company}</h1>
            <p className="suite-line">
              {suite.applicable.length} drafted · {suite.needsInput ? `${suite.needsInput} need input` : 'none need input'} ·{' '}
              {readiness.counts.approved} approved
              {suite.notApplicable ? ` · ${suite.notApplicable} not needed for your device` : ''}
            </p>
          </div>
          <div className="button-row">
            <Popover buttonClass="btn btn--outline" label="More" ariaLabel="More actions">
              {() => (
                <div className="menu more-menu">
                  <Link to="/app/form" className="menu__item">
                    Edit all answers
                  </Link>
                  <Link to="/app/readiness" className="menu__item">
                    Readiness details
                  </Link>
                  {mode === 'account' && (
                    <Link to="/app/history" className="menu__item">
                      Run history{runs.length ? ` (${runs.length})` : ''}
                    </Link>
                  )}
                  <Link to="/app/procedures" className="menu__item">
                    Template library
                  </Link>
                  <button
                    type="button"
                    className="menu__item"
                    onClick={() =>
                      downloadText(`${(tokens.company?.value ?? 'qms').replace(/\W+/g, '-')}-documentation-suite.md`, suiteToMarkdown(suite, tokens))
                    }
                  >
                    One Markdown file
                  </button>
                </div>
              )}
            </Popover>
            <ButtonLink to="/app/export" variant="outline">
              Export all
            </ButtonLink>
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
                    {docs.map((doc, i) => [
                      tier.key === 'eq' && /^EQ-\d+-/.test(doc.proc.id) && docs[i - 1]?.proc.id.split('-').slice(0, 2).join('-') !== doc.proc.id.split('-').slice(0, 2).join('-') && (
                        <li key={`${doc.proc.id}-group`} className="eqv-suite-group">
                          {doc.proc.id.split('-').slice(0, 2).join('-')} · {doc.proc.title.split(': ').slice(1).join(': ')}
                        </li>
                      ),
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
                                  : doc.progress
                                  ? `Assessment · ${doc.progress.done} of ${doc.progress.total} items · owner `
                                  : `${doc.sections.length} sections · owner `}
                              {doc.status !== 'na' && !doc.pending && <Segments segs={[{ kind: 'token', key: doc.ownerToken }]} />}
                            </span>
                          </span>
                          <span className="stack doc-row__status">
                            {mode === 'account' && doc.status !== 'na' && !lives[doc.proc.id]?.changed && !['unsaved', 'draft'].includes(lives[doc.proc.id]?.stage ?? 'unsaved') ? (
                              <StageTag life={lives[doc.proc.id]} />
                            ) : (
                              <StatusPill doc={doc} />
                            )}
                          </span>
                        </Link>
                      </li>,
                    ])}
                  </ul>
                  {tier.key === 'eq' && (
                    <Link to="/app/equipment" className="mode-card__go">
                      {intake.equipment.items.length ? 'Manage equipment →' : 'Add equipment to validate →'}
                    </Link>
                  )}
                </section>
              );
            })}
          </div>

          <div className="stack suite-side">
            <section aria-labelledby="missing-h" className="card card--compact">
              <h2 id="missing-h" className="card__title card__title--sm">
                What's still missing
              </h2>
              {assessments.length > 0 && (
                <ul className="list-reset stack missing-list">
                  {assessments.map((d) => (
                    <li key={d.proc.id}>
                      <Link to={d.progress!.href} className="missing-list__item">
                        <span>
                          {d.progress!.name[0].toUpperCase() + d.progress!.name.slice(1)}
                          {d.proc.g === 'eq' ? '' : ` (${d.proc.id})`}
                        </span>
                        <span className="missing-list__count">
                          {d.progress!.total - d.progress!.done ? `${d.progress!.total - d.progress!.done} left` : `${d.progress!.suggested} to review`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {suite.missing.length === 0 ? (
                <p className="text-sm ink-2">
                  {assessments.length ? 'Every other value is filled in.' : 'Nothing. Every required procedure is filled in and ready for technical review.'}
                </p>
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

            <details className="card card--compact fold">
              <summary className="fold__summary">
                <span className="card__title card__title--sm">What the agent decided about your device</span>
              </summary>
              <div className="stack fold__body gate-fold">
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
              <p className="text-muted-sm">Drafted by the agent. A Biomedix engineer and your team sign it.</p>
              </div>
            </details>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
