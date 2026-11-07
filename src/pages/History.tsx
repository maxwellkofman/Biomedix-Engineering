import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Run } from '../account/api';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { formatDate } from '../components/Lifecycle';
import { useIntake } from '../intake/IntakeContext';
import type { Intake } from '../intake/model';
import { GROUPS, type Question } from '../intake/questions';
import { useCreateDocs } from '../intake/useCreateDocs';
import { docHref } from '../lib/links';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/account.css';

const QUESTIONS: Question[] = GROUPS.flatMap((g) => g.questions);

function answer(ix: Intake | undefined, q: Question): string {
  const raw = ((ix?.[q.section] as Record<string, string> | undefined)?.[q.key] ?? '').trim();
  return q.options?.find((o) => o.value === raw)?.label ?? raw;
}

const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface AnswerChange {
  label: string;
  before: string;
  after: string;
}

/** Answers that differ between two snapshots, in question order. */
export function answerChanges(before: Intake | undefined, after: Intake | undefined): AnswerChange[] {
  return QUESTIONS.flatMap((q) => {
    const a = answer(before, q);
    const b = answer(after, q);
    return a === b ? [] : [{ label: q.label, before: a, after: b }];
  });
}

export default function History() {
  const { projectId, runs: runMeta, intake, readiness } = useIntake();
  const { create, busy, error } = useCreateDocs();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    api
      .runs(projectId)
      .then((r) => live && setRuns(r.runs))
      .catch((err: Error) => live && setLoadError(err.message));
    return () => {
      live = false;
    };
  }, [projectId, runMeta.length]);

  const sinceLast = useMemo(() => (runs?.[0] ? answerChanges(runs[0].intake, intake) : []), [runs, intake]);
  const changedDocs = readiness.counts.changed;

  return (
    <AppShell>
      <main className="app-main account-main">
        <Link to="/app/suite" className="back-link">
          ← Documentation suite
        </Link>
        <div className="suite-head">
          <div className="stack suite-head__copy">
            <span className="eyebrow">RUN HISTORY</span>
            <h1 className="setup-main__title">Every run of your documentation</h1>
            <p className="setup-main__blurb">
              Each run saves your answers and a new draft of every document they changed. Earlier drafts and their
              sign-offs are kept.
            </p>
          </div>
        </div>

        <section className="card card--compact history-now" aria-labelledby="now-h">
          <div className="stack">
            <h2 id="now-h" className="card__title card__title--sm">
              Since {runs?.length ? `run ${runs[0].number}` : 'you started'}
            </h2>
            <p className="text-muted-sm">
              {!runs?.length
                ? 'No runs yet. Create documentation to save the first one.'
                : sinceLast.length || changedDocs
                  ? `${sinceLast.length} answer${sinceLast.length === 1 ? '' : 's'} changed · ${changedDocs} document${changedDocs === 1 ? '' : 's'} would get a new draft.`
                  : 'Nothing changed. Your saved drafts match your answers.'}
            </p>
            {error && (
              <p role="alert" className="form-msg form-msg--err">
                {error}
              </p>
            )}
          </div>
          <Button disabled={busy || (!!runs?.length && !sinceLast.length && !changedDocs)} onClick={() => void create()}>
            {busy ? 'Saving run…' : `Save run ${(runs?.[0]?.number ?? 0) + 1}`}
          </Button>
        </section>

        {loadError && (
          <p role="alert" className="notice notice--warn">
            {loadError}
          </p>
        )}
        {!runs && !loadError && <p className="text-muted-sm">Loading runs…</p>}

        <ol className="list-reset stack run-list">
          {runs?.map((run, i) => {
            const prev = runs[i + 1];
            const changes = answerChanges(prev?.intake, run.intake);
            const touched = run.summary.docs.filter((d) => d.change !== 'same');
            const { counts } = run.summary;
            return (
              <li key={run.number} className="card card--compact run">
                <div className="run__head">
                  <span className="stack">
                    <span className="run__title">
                      Run {run.number}
                      {i === 0 && <span className="stage stage--ok">Latest</span>}
                    </span>
                    <span className="text-muted-sm">
                      {formatDate(run.createdAt)} · {run.createdBy}
                    </span>
                  </span>
                  <span className="run__score" title="Readiness when this run was saved">
                    <strong>{run.summary.readiness}%</strong>
                    <span className="text-muted-sm">readiness</span>
                  </span>
                </div>
                {run.note && <p className="text-sm">{run.note}</p>}
                <div className="tag-row">
                  {counts.new > 0 && <span className="stage stage--info">{counts.new} new</span>}
                  {counts.revised > 0 && <span className="stage stage--warn">{counts.revised} revised</span>}
                  {counts.same > 0 && <span className="stage stage--muted">{counts.same} unchanged</span>}
                  {counts.dropped > 0 && <span className="stage stage--muted">{counts.dropped} no longer required</span>}
                  <span className="stage stage--muted">
                    {prev ? `${changes.length} answer${changes.length === 1 ? '' : 's'} changed` : 'First run'}
                  </span>
                </div>
                {(touched.length > 0 || (prev && changes.length > 0)) && (
                  <details className="run__details">
                    <summary>What changed</summary>
                    <div className="run__cols">
                      {prev && changes.length > 0 && (
                        <div className="stack">
                          <h3 className="run__sub">Answers</h3>
                          <ul className="list-reset stack run__changes">
                            {changes.map((c) => (
                              <li key={c.label}>
                                <span className="run__label">{c.label}</span>
                                <span className="run__diff">
                                  <del>{clip(c.before) || 'blank'}</del> → <ins>{clip(c.after) || 'blank'}</ins>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {touched.length > 0 && (
                        <div className="stack">
                          <h3 className="run__sub">Documents</h3>
                          <ul className="list-reset stack run__changes">
                            {touched.map((d) => (
                              <li key={d.id}>
                                <Link to={`${docHref(d.id)}/history?draft=${d.draft}`} className="run__doc">
                                  <span className="mono">{d.id}</span> {d.title}
                                </Link>
                                <span className="text-muted-sm">
                                  {d.change === 'new' ? 'Draft 1' : `Draft ${d.draft - 1} → ${d.draft}`}
                                </span>
                              </li>
                            ))}
                            {run.summary.dropped.map((id) => (
                              <li key={id}>
                                <span className="mono">{id}</span>{' '}
                                <span className="text-muted-sm">no longer required</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
        {runs && runs.length === 0 && (
          <div className="button-row">
            <ButtonLink to="/app/form">Answer the questionnaire</ButtonLink>
          </div>
        )}
      </main>
    </AppShell>
  );
}
