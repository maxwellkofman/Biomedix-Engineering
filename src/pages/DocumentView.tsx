import { Link, Navigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { FileIcon } from '../components/Icon';
import { missingHref, Segments } from '../components/Segments';
import { useIntake } from '../intake/IntakeContext';
import { TOKENS } from '../intake/derive';
import { docToMarkdown, downloadText } from '../templates/generate';
import { WordButton } from '../components/WordButton';
import { ProposalList, SignoffPanel } from '../components/SignoffPanel';
import { StageTag } from '../components/Lifecycle';
import { docHref, StatusPill } from './Suite';
import '../styles/app.css';
import '../styles/flow.css';

export default function DocumentView() {
  const { docId = '' } = useParams();
  const { suite, tokens, mode, lives, readiness } = useIntake();
  const doc = suite.docs.find((d) => d.proc.id === docId);
  if (!doc) return <Navigate to="/app/suite" replace />;

  const list = suite.applicable;
  const pos = list.indexOf(doc);
  const prev = pos > 0 ? list[pos - 1] : undefined;
  const next = pos >= 0 && pos < list.length - 1 ? list[pos + 1] : undefined;
  const life = lives[doc.proc.id];
  const score = readiness.docs.find((d) => d.doc.proc.id === doc.proc.id);
  const draftLabel =
    mode !== 'account' || doc.status === 'na'
      ? 'AI-generated draft · Rev A'
      : life?.latest && !life.changed
        ? `AI-generated · Rev A, draft ${life.latest.draft}`
        : `AI-generated · Rev A, draft ${(life?.latest?.draft ?? 0) + 1} (not saved)`;

  return (
    <AppShell>
      <aside aria-label="Sections" className="app-sidebar app-sidebar--sticky">
        <Link to="/app/suite" className="back-link">
          ← Documentation suite
        </Link>
        <div className="stack app-sidebar__head">
          <span className="mono proc-item__id">{doc.proc.id}</span>
          <span className="app-sidebar__title doc-nav__title">{doc.proc.title}</span>
        </div>
        <nav aria-label="Sections in this document">
          <ol className="list-reset stack doc-nav">
            {doc.sections.map((s) => (
              <li key={s.n}>
                <a href={`#s-${s.n}`} className="doc-nav__link">
                  <span className="mono outline__num">{s.n}</span>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <main className="app-main doc-main">
        <div className="stack proc-head">
          <span className="eyebrow proc-head__tier">{doc.tierName}</span>
          <div className="proc-head__title-row">
            <span className="mono proc-head__id">{doc.proc.id}</span>
            <h1 className="proc-head__title">{doc.proc.title}</h1>
          </div>
          <div className="record-head__meta">
            <StatusPill doc={doc} />
            {mode === 'account' && doc.status !== 'na' && <StageTag life={life} />}
            <span className="record-head__ai">{draftLabel}</span>
          </div>
        </div>

        {doc.status === 'na' && (
          <div role="status" className="notice notice--warn">
            Not applicable to your device: {doc.reason} This justification is recorded in QM-001.
          </div>
        )}
        {doc.pending && (
          <div role="status" className="notice notice--warn">
            Included for now. It may drop out when you answer: {doc.pending}
          </div>
        )}

        <article className="card paper">
          <dl className="paper__header">
            {doc.header.map(([k, segs]) => (
              <div key={k} className="deflist__row">
                <dt>{k}</dt>
                <dd>
                  <Segments segs={segs} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="paper__summary">{doc.proc.summary}</p>

          {doc.sections.map((s) => (
            <section key={s.n} id={`s-${s.n}`} className="paper__section">
              <h2 className="paper__h">
                <span className="mono outline__num">{s.n}</span> {s.title}
              </h2>
              {s.blocks.map((b, i) =>
                b.kind === 'p' ? (
                  <p key={i}>
                    <Segments segs={b.segs} />
                  </p>
                ) : b.kind === 'list' ? (
                  <ul key={i}>
                    {b.items.map((it, j) => (
                      <li key={j}>
                        <Segments segs={it} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div key={i} className="table-wrap paper__table-wrap">
                    <table className="paper__table">
                      <thead>
                        <tr>
                          {b.head.map((h) => (
                            <th key={h} scope="col">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {b.rows.map((r, j) => (
                          <tr key={j}>
                            {r.map((c, k) => (
                              <td key={k}>
                                <Segments segs={c} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ),
              )}
            </section>
          ))}

          <section className="paper__section">
            <h2 className="paper__h">Records and forms</h2>
            <ul className="list-reset stack record-list">
              {doc.proc.records.map((r) => (
                <li key={r}>
                  <FileIcon />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>
        </article>

        <div className="setup-nav">
          {prev ? (
            <ButtonLink to={docHref(prev.proc.id)} variant="outline">
              ← {prev.proc.id}
            </ButtonLink>
          ) : (
            <span />
          )}
          {next && (
            <ButtonLink to={docHref(next.proc.id)} variant="outline">
              {next.proc.id} →
            </ButtonLink>
          )}
        </div>
      </main>

      <aside aria-label="Document status" className="setup-preview">
        {doc.progress && (
          <section className="card card--compact" aria-labelledby="assess-h">
            <h2 id="assess-h" className="card__title card__title--sm">
              Assessment
            </h2>
            <div className="meter" aria-hidden="true">
              <span className="meter__fill" style={{ width: `${Math.round((doc.progress.done / Math.max(1, doc.progress.total)) * 100)}%` }} />
            </div>
            <p className="text-muted-sm">
              {doc.progress.done} of {doc.progress.total} items done
              {doc.progress.suggested ? ` · ${doc.progress.suggested} suggestion${doc.progress.suggested > 1 ? 's' : ''} to review` : ''}. This
              document is written from the {doc.progress.name}.
            </p>
            {doc.progress.todo.length > 0 && (
              <ul className="list-reset stack missing-list">
                {doc.progress.todo.slice(0, 5).map((t) => (
                  <li key={t.label}>
                    <Link to={t.to} className="missing-list__item">
                      <span>{t.label}</span>
                      <span className="missing-list__count">Open →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <ButtonLink to={doc.progress.href} size="sm">
              Open the {doc.progress.name}
            </ButtonLink>
          </section>
        )}

        <section className="card card--compact">
          <h2 className="card__title card__title--sm">Auto-fill</h2>
          <div className="meter" aria-hidden="true">
            <span className="meter__fill" style={{ width: `${doc.filledPct}%` }} />
          </div>
          <p className="text-muted-sm">
            {doc.used.length - doc.missing.length} of {doc.used.length} values filled from your answers.
          </p>
          <div className="legend">
            <span className="tok tok--filled">Your answer</span>
            <span className="tok tok--auto">Derived · confirm</span>
            <span className="tok tok--missing">Needs input</span>
          </div>
          {doc.missing.length > 0 && (
            <ul className="list-reset stack missing-list">
              {doc.missing.map((k) => (
                <li key={k}>
                  <Link to={missingHref(k)} className="missing-list__item">
                    <span>{TOKENS[k].label}</span>
                    <span className="missing-list__count">Add →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {score && score.derived.length > 0 && (
          <section className="card card--compact" aria-labelledby="proposals-h">
            <div className="outline__head">
              <h2 id="proposals-h" className="card__title card__title--sm">
                Agent proposals
              </h2>
              <span className="text-muted-sm">
                {score.derived.length - score.unconfirmed.length} of {score.derived.length} confirmed
              </span>
            </div>
            <p className="text-muted-sm">Values the agent derived from your answers. Confirm each one or change the answer.</p>
            <ProposalList keys={score.derived} compact />
          </section>
        )}

        {doc.status !== 'na' && <SignoffPanel doc={doc} />}

        <section className="card card--compact">
          <h2 className="card__title card__title--sm">Export</h2>
          <div className="button-row button-row--tight">
            <WordButton doc={doc} size="sm" variant="primary" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadText(`${doc.proc.id}-${doc.proc.title.replace(/\W+/g, '-')}.md`, docToMarkdown(doc, tokens))}
            >
              Markdown
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print or PDF
            </Button>
          </div>
        </section>
      </aside>
    </AppShell>
  );
}
