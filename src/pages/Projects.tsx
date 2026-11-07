import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type ProjectSummary } from '../account/api';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { formatDate } from '../components/Lifecycle';
import { useIntake } from '../intake/IntakeContext';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/account.css';

export default function Projects() {
  const { projectId, openProject, newProject, guestDraft, discardGuest, readiness, intake } = useIntake();
  const navigate = useNavigate();
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .projects()
      .then(({ projects }) => setList(projects))
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(load, [load, projectId]);

  const guard = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const open = (id: string) =>
    guard(`open-${id}`, async () => {
      if (id !== projectId) await openProject(id);
      navigate('/app/suite');
    });

  const remove = (p: ProjectSummary) => {
    const name = [p.company, p.device].filter(Boolean).join(' · ') || 'this untitled project';
    if (!window.confirm(`Delete ${name}? Its answers, runs, drafts and sign-off records are deleted for good.`)) return;
    void guard(`delete-${p.id}`, async () => {
      await api.deleteProject(p.id);
      const rest = (list ?? []).filter((x) => x.id !== p.id);
      setList(rest);
      if (p.id === projectId) {
        if (rest.length) await openProject(rest[0].id);
        else await newProject('blank');
      }
    });
  };

  return (
    <AppShell>
      <main className="app-main account-main">
        <div className="suite-head">
          <div className="stack suite-head__copy">
            <span className="eyebrow">PROJECTS</span>
            <h1 className="setup-main__title">Your devices</h1>
            <p className="setup-main__blurb">
              One project per device. Each keeps its own answers, runs, document drafts and sign-offs.
            </p>
          </div>
          <div className="button-row">
            <Button
              disabled={busy === 'new'}
              onClick={() =>
                void guard('new', async () => {
                  await newProject('blank');
                  navigate('/app/form');
                })
              }
            >
              New project
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="notice notice--warn">
            {error}
          </p>
        )}

        {guestDraft && (
          <section className="card card--compact project-import" aria-labelledby="import-h">
            <div className="stack">
              <h2 id="import-h" className="card__title card__title--sm">
                Answers in this browser
              </h2>
              <p className="text-muted-sm">
                {[guestDraft.company.name, guestDraft.device.name].filter(Boolean).join(' · ') || 'Untitled'} — entered
                before you signed in and not saved to your account yet.
              </p>
            </div>
            <div className="button-row button-row--tight">
              <Button size="sm" disabled={busy === 'import'} onClick={() => void guard('import', () => newProject('guest'))}>
                Save as a new project
              </Button>
              <Button variant="text" size="sm" onClick={discardGuest}>
                Discard
              </Button>
            </div>
          </section>
        )}

        {!list ? (
          <p className="text-muted-sm">Loading projects…</p>
        ) : (
          <ul className="list-reset project-grid">
            {list.map((p) => {
              const active = p.id === projectId;
              const company = active ? intake.company.name : p.company;
              const device = active ? intake.device.name : p.device;
              const pct = active ? readiness.pct : p.readiness;
              return (
                <li key={p.id} className={`card card--compact project-card${active ? ' project-card--active' : ''}`}>
                  <div className="project-card__top">
                    <span className="stack">
                      <span className="eyebrow">{active ? 'OPEN NOW' : 'PROJECT'}</span>
                      <span className="project-card__title">{device || 'Untitled device'}</span>
                      <span className="text-muted-sm">{company || 'Company not entered'}</span>
                    </span>
                    <span className="project-card__pct" aria-label={`Readiness ${pct}%`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="meter" aria-hidden="true">
                    <span className="meter__fill" style={{ width: `${pct}%` }} />
                  </div>
                  <dl className="project-card__facts">
                    <div>
                      <dt>Runs</dt>
                      <dd>{p.runs}</dd>
                    </div>
                    <div>
                      <dt>Last run</dt>
                      <dd>{p.lastRunAt ? formatDate(p.lastRunAt, false) : 'None yet'}</dd>
                    </div>
                    <div>
                      <dt>Saved</dt>
                      <dd>{formatDate(p.updatedAt)}</dd>
                    </div>
                  </dl>
                  <div className="button-row button-row--tight">
                    <Button size="sm" variant={active ? 'primary' : 'outline'} disabled={!!busy} onClick={() => void open(p.id)}>
                      {active ? 'Open documentation' : 'Open'}
                    </Button>
                    <Button size="sm" variant="text" disabled={!!busy} onClick={() => remove(p)}>
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
