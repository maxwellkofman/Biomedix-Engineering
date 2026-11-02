import { useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { AlertIcon, FileIcon } from '../components/Icon';
import { AGENT_FOR_PROCEDURE, PROCEDURES, TIERS, reviewOfferFor } from '../data/procedures';
import '../styles/app.css';

const DEFAULT_ID = 'SOP-003';

export default function ProcedureLibrary() {
  const [selectedId, setSelectedId] = useState(DEFAULT_ID);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TIERS.map((tier) => ({
      ...tier,
      items: PROCEDURES.filter(
        (d) => d.g === tier.key && (!q || `${d.id} ${d.title} ${d.basis}`.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const doc = PROCEDURES.find((d) => d.id === selectedId) ?? PROCEDURES[0];
  const tierName = TIERS.find((t) => t.key === doc.g)?.name ?? TIERS[0].name;
  const runsWith = doc.planned ? 'Planned' : (AGENT_FOR_PROCEDURE[doc.id] ?? 'Trace agent');

  return (
    <AppShell
      project="[Company] · Example SaMD project"
      user={{ initials: 'MK', label: 'Signed-in user', tone: 'muted' }}
    >
      <aside aria-label="Procedures" className="app-sidebar">
        <div className="stack app-sidebar__head app-sidebar__filter">
          <label htmlFor="tpl-filter" className="field-label">
            Filter procedures
          </label>
          <input
            id="tpl-filter"
            type="search"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ID, title or standard"
          />
        </div>
        {groups.map((group) => (
          <div key={group.key} className="stack proc-group">
            <div className="proc-group__head">
              <span className="mono">{group.name}</span>
              <span>{group.items.length}</span>
            </div>
            {group.items.map((d) => {
              const on = d.id === doc.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  onClick={() => setSelectedId(d.id)}
                  className={`proc-item${on ? ' proc-item--on' : ''}`}
                >
                  <span className="mono proc-item__id">{d.id}</span>
                  <span className="proc-item__title">{d.title}</span>
                </button>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && <p className="app-sidebar__empty">No procedures match that filter.</p>}
      </aside>

      <main className="app-main app-main--library">
        <div className="stack proc-head">
          <span className="eyebrow proc-head__tier">{tierName}</span>
          <div className="proc-head__title-row">
            <span className="mono proc-head__id">{doc.id}</span>
            <h1 className="proc-head__title">{doc.title}</h1>
          </div>
          <p className="proc-head__summary">{doc.summary}</p>
        </div>

        {doc.planned && (
          <div role="status" className="notice notice--warn">
            Planned. The outline below is the intended structure; agents cannot run this procedure yet.
          </div>
        )}

        <div className="facts">
          {[
            ['Basis', doc.basis],
            ['Owner', doc.owner],
            ['Needed by', doc.when],
            ['Runs with', runsWith],
          ].map(([k, v]) => (
            <div key={k} className="facts__cell">
              <span className="facts__key">{k}</span>
              <span className="facts__value">{v}</span>
            </div>
          ))}
        </div>

        <div className="button-row">
          <Button variant="primary">Run agent on my project</Button>
          <Button variant="outline">Preview tailored draft</Button>
          <Button variant="text">Export .docx</Button>
        </div>

        <div className="library-grid">
          <section aria-labelledby="outline-h" className="card outline">
            <div className="outline__head">
              <h2 id="outline-h" className="outline__title">Procedure outline</h2>
              <span className="text-muted-sm">{doc.sections.length} sections</span>
            </div>
            <ol className="list-reset stack">
              {doc.sections.map((s, i) => (
                <li key={s.t} className="outline__row">
                  <span className="mono outline__num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="stack outline__text">
                    <span className="outline__name">{s.t}</span>
                    <span className="outline__desc">{s.d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="stack outline__header-note">
              <span className="outline__header-label">EVERY RELEASED COPY CARRIES THE STANDARD HEADER</span>
              <span className="mono outline__header-text">
                {doc.id} / Rev [A] · Effective [YYYY-MM-DD] · Approved by [Name, title, e-signature]
              </span>
            </div>
          </section>

          <div className="stack review-grid__side">
            <section aria-labelledby="review-h" className="card card--night card--compact oversight-panel">
              <div className="outline__head">
                <h2 id="review-h" className="card__title card__title--sm">Human oversight</h2>
                <span className="oversight-panel__aside">Sign-off path</span>
              </div>
              <ol className="list-reset stack oversight-panel__steps">
                <li className="oversight-panel__step">
                  <span className="step-dot">1</span>
                  <span className="stack">
                    <span className="oversight-panel__name">Agent draft · {runsWith}</span>
                    <span className="oversight-panel__desc">Labeled AI-generated, with model version and sources</span>
                  </span>
                </li>
                <li className="oversight-panel__step">
                  <span className="step-dot step-dot--on">2</span>
                  <span className="stack">
                    <span className="oversight-panel__name">Technical review · Biomedix Engineering</span>
                    <span className="oversight-panel__desc">Signature meaning: technical review, never approval</span>
                  </span>
                </li>
                <li className="oversight-panel__step">
                  <span className="step-dot">3</span>
                  <span className="stack">
                    <span className="oversight-panel__name">Approval · [Company]</span>
                    <span className="oversight-panel__desc">Process owner and management representative</span>
                  </span>
                </li>
              </ol>
              <p className="oversight-panel__offer">{reviewOfferFor(doc.id)}</p>
              <div className="button-row button-row--tight">
                <Button variant="bright" size="sm">
                  Ask an engineer
                </Button>
                <Button variant="outline-night" size="sm">
                  Book a 30-min consult
                </Button>
              </div>
              <span className="oversight-panel__fine">
                Engineer on call · replies within [1 business day] · this procedure and your project are attached
                automatically
              </span>
            </section>

            <section aria-labelledby="records-h" className="card card--compact">
              <h2 id="records-h" className="card__title card__title--sm">Records and forms</h2>
              <ul className="list-reset stack record-list">
                {doc.records.map((r) => (
                  <li key={r}>
                    <FileIcon />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="creates-h" className="card card--compact">
              <h2 id="creates-h" className="card__title card__title--sm">Creates in the trace graph</h2>
              <div className="tag-row tag-row--loose">
                {doc.creates.map((c) => (
                  <span key={c} className="pill pill--mint">
                    {c}
                  </span>
                ))}
              </div>
            </section>

            <section aria-labelledby="checks-h" className="card card--compact">
              <h2 id="checks-h" className="card__title card__title--sm">Gap checks the agents run</h2>
              <ul className="list-reset stack gap-checks">
                {doc.checks.map((k) => (
                  <li key={k}>
                    <AlertIcon />
                    <span>{k}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <p className="text-muted-sm">
          Agent outputs are drafts until a Biomedix engineer reviews them and your team approves them. Your management
          owns every released document. Not regulatory advice.
        </p>
      </main>
    </AppShell>
  );
}
