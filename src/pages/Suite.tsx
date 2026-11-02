import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { missingHref, Segments } from '../components/Segments';
import { TIERS } from '../data/procedures';
import { useIntake } from '../intake/IntakeContext';
import { TOKENS } from '../intake/derive';
import { downloadText, suiteToMarkdown, type GeneratedDoc } from '../templates/generate';
import '../styles/app.css';
import '../styles/flow.css';

const USER = { initials: 'YOU', label: 'Signed in as the customer', tone: 'muted' as const };

export function docHref(id: string) {
  return `/app/suite/${encodeURIComponent(id)}`;
}

export function StatusPill({ doc }: { doc: GeneratedDoc }) {
  if (doc.status === 'na') return <span className="status status--na">Not applicable</span>;
  if (doc.status === 'ready') return <span className="status status--ready">Ready for review</span>;
  return <span className="status status--input">Needs input · {doc.missing.length}</span>;
}

export default function Suite() {
  const { suite, tokens, started, submitted, loadExample } = useIntake();
  const navigate = useNavigate();

  if (!started) {
    return (
      <AppShell user={USER}>
        <main className="app-main suite-empty">
          <span className="eyebrow">DOCUMENTATION SUITE</span>
          <h1 className="setup-main__title">Answer a few questions. Get every required procedure, drafted.</h1>
          <p className="setup-main__blurb">
            Tell us about your company, device and team. The agents work out which procedures FDA expects for your
            device and fill in everything they can. You review what's left.
          </p>
          <div className="button-row">
            <ButtonLink to="/app/setup/company" size="lg">
              Start setup
            </ButtonLink>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                loadExample();
                navigate('/app/suite');
              }}
            >
              Try it with an example device
            </Button>
          </div>
        </main>
      </AppShell>
    );
  }

  const company = tokens.company?.value ?? 'your company';
  const sentIds = new Set(submitted.map((s) => s.id));

  return (
    <AppShell user={USER}>
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
            <ButtonLink to="/app/setup/company" variant="outline">
              Edit answers
            </ButtonLink>
            <Button
              onClick={() =>
                downloadText(`${(tokens.company?.value ?? 'qms').replace(/\W+/g, '-')}-documentation-suite.md`, suiteToMarkdown(suite, tokens))
              }
            >
              Export all (.md)
            </Button>
          </div>
        </div>

        <div className="facts suite-stats">
          {[
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
                            {sentIds.has(doc.proc.id) && <span className="doc-row__sent">In technical review</span>}
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
