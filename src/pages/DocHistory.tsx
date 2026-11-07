import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type Draft, type Signoff } from '../account/api';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { formatDate, StageTag } from '../components/Lifecycle';
import { Markdown } from '../components/Markdown';
import { useIntake } from '../intake/IntakeContext';
import { diffLines, withContext } from '../lib/diff';
import { docHref } from '../lib/links';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/account.css';

const SIGNOFF_LABEL: Record<Signoff['kind'], string> = {
  submit: 'Submitted for technical review',
  review: 'Technical review signed',
  return: 'Returned with comments',
  approve: 'Approved',
};

/** "current" is the unsaved content from today's answers. */
type Version = { key: string; label: string; markdown: string; draft?: Draft };

export default function DocHistory() {
  const { docId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { suite, projectId, lives, markdown, signoffs, runs } = useIntake();
  const doc = suite.docs.find((d) => d.proc.id === docId);
  const life = lives[docId];
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    api
      .drafts(projectId, docId)
      .then((r) => live && setDrafts(r.drafts))
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [projectId, docId, runs.length]);

  const versions = useMemo<Version[]>(() => {
    const list: Version[] = (drafts ?? []).map((d) => ({ key: String(d.draft), label: `Draft ${d.draft}`, markdown: d.markdown, draft: d }));
    if (markdown[docId] && (!life?.latest || life.changed))
      list.unshift({ key: 'current', label: 'Current answers (not saved)', markdown: markdown[docId] });
    return list;
  }, [drafts, markdown, docId, life]);

  if (!doc) return <Navigate to="/app/suite" replace />;

  const selectedKey = params.get('draft') ?? versions[0]?.key;
  const idx = Math.max(0, versions.findIndex((v) => v.key === selectedKey));
  const selected = versions[idx];
  const previous = versions[idx + 1];
  const diff = selected && previous && compare ? withContext(diffLines(previous.markdown, selected.markdown)) : null;
  const added = diff?.filter((l) => l.kind === 'add').length ?? 0;
  const removed = diff?.filter((l) => l.kind === 'del').length ?? 0;

  return (
    <AppShell>
      <aside aria-label="Drafts" className="app-sidebar app-sidebar--sticky">
        <Link to={docHref(docId)} className="back-link">
          ← {doc.proc.id} {doc.proc.title}
        </Link>
        <div className="stack app-sidebar__head">
          <h1 className="app-sidebar__title">Revision history</h1>
          <span className="app-sidebar__sub">
            Rev A · {drafts?.length ?? 0} saved draft{drafts?.length === 1 ? '' : 's'}
          </span>
        </div>
        {doc.status !== 'na' && <StageTag life={life} />}
        {!drafts && !error && <p className="text-muted-sm">Loading drafts…</p>}
        {error && (
          <p role="alert" className="notice notice--warn">
            {error}
          </p>
        )}
        <ol className="list-reset stack version-list">
          {versions.map((v, i) => {
            const offs = v.draft ? signoffs.filter((s) => s.docId === docId && s.draft === v.draft!.draft) : [];
            return (
              <li key={v.key}>
                <button
                  type="button"
                  aria-pressed={i === idx}
                  className={`version${i === idx ? ' version--on' : ''}`}
                  onClick={() => setParams({ draft: v.key }, { replace: true })}
                >
                  <span className="version__title">{v.label}</span>
                  <span className="version__meta">
                    {v.draft
                      ? `Run ${v.draft.runNumber} · ${formatDate(v.draft.createdAt)} · ${v.draft.filledPct}% filled`
                      : 'Saved as the next draft when you save a run'}
                  </span>
                  {offs.length > 0 && (
                    <ul className="list-reset version__offs">
                      {offs.map((s) => (
                        <li key={s.id} className={`version__off version__off--${s.kind}`}>
                          {SIGNOFF_LABEL[s.kind]} · {s.signer} · {formatDate(s.createdAt, false)}
                          {s.note && <q>{s.note}</q>}
                          {s.kind === 'approve' && s.method && (
                            <span>
                              {' '}
                              ({s.method}
                              {s.reference && `, ${s.reference}`})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <main className="app-main doc-main">
        {!selected ? (
          drafts && <p className="text-muted-sm">No drafts saved yet. Create documentation to save draft 1.</p>
        ) : (
          <>
            <div className="history-bar">
              <div className="stack">
                <span className="eyebrow">{doc.proc.id}</span>
                <h2 className="proc-head__title history-bar__title">{selected.label}</h2>
                {selected.draft && (
                  <span className="text-muted-sm mono" title="SHA-256 of this draft, recorded when it was saved">
                    SHA-256 {selected.draft.sha256.slice(0, 16)}…
                  </span>
                )}
              </div>
              {previous && (
                <div className="button-row button-row--tight">
                  <Button variant={compare ? 'primary' : 'outline'} size="sm" onClick={() => setCompare(true)}>
                    Changes from {previous.label.split(' (')[0].toLowerCase()}
                  </Button>
                  <Button variant={compare ? 'outline' : 'primary'} size="sm" onClick={() => setCompare(false)}>
                    Full text
                  </Button>
                </div>
              )}
            </div>

            {diff ? (
              <section className="card diff" aria-label={`Changes: ${added} lines added, ${removed} removed`}>
                <p className="diff__summary">
                  <ins>+{added}</ins> <del>−{removed}</del> lines
                </p>
                {added + removed === 0 ? (
                  <p className="text-muted-sm">No text changes.</p>
                ) : (
                  <ol className="list-reset diff__lines">
                    {diff.map((l, i) =>
                      l.kind === 'gap' ? (
                        <li key={i} className="diff__gap">
                          {l.count} unchanged line{l.count > 1 ? 's' : ''}
                        </li>
                      ) : (
                        <li key={i} className={`diff__line diff__line--${l.kind}`}>
                          <span className="diff__mark" aria-hidden="true">
                            {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}
                          </span>
                          <span className="visually-hidden">{l.kind === 'add' ? 'Added: ' : l.kind === 'del' ? 'Removed: ' : ''}</span>
                          {l.text || ' '}
                        </li>
                      ),
                    )}
                  </ol>
                )}
              </section>
            ) : (
              <article className="card paper">
                <Markdown text={selected.markdown} />
              </article>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
