import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Signoff } from '../account/api';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { stageOf } from '../components/Lifecycle';
import type { DocLifecycle } from '../compliance/readiness';
import { useIntake } from '../intake/IntakeContext';
import { blankTemplateDocs } from '../export/equipment';
import { buildTree, countTree, type QmsFile } from '../export/structure';
import { Seg } from './assessments/parts';
import { Tree } from './Publish';
import '../styles/app.css';
import '../styles/flow.css';
import '../styles/assess.css';
import '../styles/equipment.css';

type Which = 'all' | 'approved';

const KIND: Record<Signoff['kind'], string> = {
  submit: 'Sent for technical review',
  review: 'Technical review signed',
  return: 'Returned with comments',
  approve: 'Approved',
};

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const csv = (rows: string[][]) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

/** Revision and status as the master list shows them. */
function statusFrom(life: DocLifecycle | undefined): { revision: string; status: string } {
  if (!life?.latest) return { revision: 'A', status: 'Draft, not saved' };
  const s = stageOf(life).text.replace(/^Draft \d+ · /, '');
  return {
    revision: `A, draft ${life.latest.draft}`,
    status: life.changed ? `Changed since draft ${life.latest.draft}` : s === `Draft ${life.latest.draft} saved` ? 'Draft' : s[0].toUpperCase() + s.slice(1),
  };
}

export default function ExportPage() {
  const { suite, tokens, intake, started, mode, lives, signoffs } = useIntake();
  const signedIn = mode === 'account';
  const [format, setFormat] = useState<'docx' | 'md'>('docx');
  const [which, setWhich] = useState<Which>('all');
  const [templates, setTemplates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const approved = (id: string) => !lives[id]?.changed && lives[id]?.stage === 'approved';
  const counts = useMemo(() => {
    const docs = suite.applicable;
    const eq = docs.filter((d) => d.proc.g === 'eq' && d.proc.id !== 'CQV-T1–8').length;
    return {
      all: docs.length,
      equipment: eq,
      approved: docs.filter((d) => approved(d.proc.id)).length,
      review: docs.filter((d) => !lives[d.proc.id]?.changed && ['submitted', 'reviewed'].includes(lives[d.proc.id]?.stage ?? '')).length,
      input: docs.filter((d) => d.status === 'input').length,
    };
    // lives drive the counts; approved reads them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suite, lives]);

  const include = which === 'approved' && signedIn ? (d: { proc: { id: string } }) => approved(d.proc.id) : undefined;

  // The tree is rebuilt for the download with the real files; this one is for the preview.
  const preview = useMemo(() => {
    const placeholder = (name: string): QmsFile => ({ kind: 'text', name, text: '', type: 'text/csv' });
    return buildTree(suite, intake, tokens, {
      include,
      templates: templates ? blankTemplateDocs(tokens) : [],
      equipmentFiles: intake.equipment.items.length ? [placeholder('FRM-018 Equipment Register (validation).csv')] : [],
      controlFiles: signedIn ? [placeholder('Approval Record.csv')] : [],
    });
    // include changes with which; approved reads lives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suite, intake, tokens, which, templates, signedIn, lives]);
  const files = countTree(preview).files;

  const company = (tokens.company?.value ?? 'QMS').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'QMS';

  async function download() {
    setBusy(true);
    setError('');
    try {
      const [{ buildZip, downloadBlob }, eqx] = await Promise.all([import('../export/package'), import('../export/equipment')]);
      // The preview's placeholders are replaced with the real registers here.
      const status = (id: string) => statusFrom(lives[id]);
      const register = eqx.equipmentRegisterCsv(intake.equipment.items, (id) => {
        const st = status(id);
        return `${st.revision}, ${st.status}`;
      });
      const titles = new Map(suite.applicable.map((d) => [d.proc.id, d.proc.title]));
      const approvals = csv([
        ['Document ID', 'Title', 'Draft', 'Action', 'Signed by', 'Email', 'Signed at (UTC)', 'Method', 'Reference', 'Note'],
        ...signoffs
          .filter((s) => titles.has(s.docId))
          .map((s) => [s.docId, titles.get(s.docId) ?? '', String(s.draft), KIND[s.kind], s.signer, s.signerEmail, s.createdAt, s.method, s.reference, s.note]),
      ]);
      const tree = buildTree(suite, intake, tokens, {
        include,
        templates: templates ? eqx.blankTemplateDocs(tokens) : [],
        equipmentFiles: intake.equipment.items.length
          ? [{ kind: 'text', name: 'FRM-018 Equipment Register (validation).csv', text: register, type: 'text/csv;charset=utf-8' }]
          : [],
        controlFiles: signedIn ? [{ kind: 'text', name: 'Approval Record.csv', text: approvals, type: 'text/csv;charset=utf-8' }] : [],
      });
      const blob = await buildZip(
        { suite, tokens, tree, siteUrl: intake.qms.siteUrl, libraryName: 'QMS', format, status: signedIn ? status : undefined },
        (d, t) => setProgress(`Generating ${d} of ${t}…`),
      );
      downloadBlob(`${company}-all-documents${format === 'md' ? '-markdown' : ''}.zip`, blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  if (!started)
    return (
      <AppShell>
        <main className="app-main suite-empty">
          <span className="eyebrow">EXPORT</span>
          <h1 className="setup-main__title">Nothing to export yet.</h1>
          <p className="setup-main__blurb">Describe your device and the agent drafts every document it needs.</p>
          <div className="button-row">
            <ButtonLink to="/app/start">Describe your device</ButtonLink>
          </div>
        </main>
      </AppShell>
    );

  const nothing = which === 'approved' && counts.approved === 0;

  return (
    <AppShell>
      <main className="app-main exp-main stack">
        <Link to="/app/suite" className="back-link">
          ← Documents
        </Link>
        <div className="stack">
          <span className="eyebrow">EXPORT</span>
          <h1 className="setup-main__title">Export all documents</h1>
          <p className="setup-main__blurb">
            One download with every document: the quality manual and procedures, the assessments, each equipment validation package and the
            templates, in your QMS folder layout, with the master document list and its status for each document.
          </p>
        </div>

        <div className="exp-counts" aria-label="Documents">
          <div className="exp-count">
            <strong>{counts.all}</strong>
            <span className="text-muted-sm">documents</span>
          </div>
          <div className="exp-count">
            <strong>{counts.equipment}</strong>
            <span className="text-muted-sm">in equipment packages</span>
          </div>
          {signedIn && (
            <>
              <div className="exp-count">
                <strong>{counts.approved}</strong>
                <span className="text-muted-sm">approved</span>
              </div>
              <div className="exp-count">
                <strong>{counts.review}</strong>
                <span className="text-muted-sm">in review</span>
              </div>
            </>
          )}
          <div className="exp-count">
            <strong>{counts.input}</strong>
            <span className="text-muted-sm">still need input</span>
          </div>
        </div>

        <div className="exp-grid">
          <section className="card stack exp-opts" aria-labelledby="exp-opts-h">
            <h2 id="exp-opts-h" className="card__title">
              What to export
            </h2>
            <Seg
              name="exp-format"
              label="Format"
              value={format}
              options={[
                { value: 'docx', label: 'Word (.docx)', hint: 'Ready to sign and to upload to SharePoint' },
                { value: 'md', label: 'Markdown (.md)', hint: 'Plain text, for version control or another eQMS' },
              ]}
              onChange={(v) => setFormat(v as 'docx' | 'md')}
            />
            {signedIn ? (
              <Seg
                name="exp-which"
                label="Documents"
                value={which}
                options={[
                  { value: 'all', label: `All ${counts.all}` },
                  { value: 'approved', label: `Approved only (${counts.approved})` },
                ]}
                onChange={(v) => setWhich(v as Which)}
                hint={which === 'all' ? 'Drafts are included; the master list shows each one’s status.' : 'Only documents whose current draft is approved.'}
              />
            ) : (
              <p className="text-muted-sm">
                Every document is a draft until it is reviewed and approved. <Link to="/sign-up?next=/app/export">Save to an account</Link> to send
                documents for review and to export the approval record.
              </p>
            )}
            <label className="check asm-check">
              <input type="checkbox" checked={templates} onChange={(e) => setTemplates(e.target.checked)} />
              <span>Include the eight blank equipment validation templates (CQV-T1 to CQV-T8) as separate files</span>
            </label>
            <p className="text-muted-sm">
              Also included: the master document list (FRM-002){intake.equipment.items.length ? ', the equipment register' : ''}
              {signedIn ? ', the approval record with every review and approval signature' : ''}
              {format === 'docx' ? ' and the SharePoint setup script' : ''}.
            </p>
            {error && (
              <p role="alert" className="notice notice--warn">
                {error}
              </p>
            )}
            <div className="button-row">
              <Button onClick={download} disabled={busy || nothing}>
                {busy ? progress || 'Preparing…' : `Download ${files} files (.zip)`}
              </Button>
              <ButtonLink to="/app/publish" variant="text">
                Publish to SharePoint instead
              </ButtonLink>
            </div>
            {nothing && <p className="text-muted-sm">No document is approved yet.</p>}
          </section>

          <section className="card stack" aria-labelledby="exp-tree-h">
            <h2 id="exp-tree-h" className="card__title card__title--sm">
              Folder layout
            </h2>
            <div className="tree-box">
              <Tree folder={preview} />
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
