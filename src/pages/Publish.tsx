import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { TextField } from '../components/Field';
import { useIntake } from '../intake/IntakeContext';
import { buildZip, downloadBlob, powershellScript, type PackageOptions } from '../export/package';
import {
  loadConfig,
  publishToSharePoint,
  redirectUri,
  saveConfig,
  signIn,
  type LogLine,
  type M365Config,
  type PublishResult,
  type Session,
} from '../export/sharepoint';
import { buildTree, countTree, type QmsFolder } from '../export/structure';
import '../styles/app.css';
import '../styles/flow.css';

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M6 8h5M6 11h4" />
    </svg>
  );
}

function Tree({ folder, depth = 0 }: { folder: QmsFolder; depth?: number }) {
  return (
    <ul className={`list-reset tree${depth ? ' tree--nested' : ''}`}>
      {folder.folders.map((f) => (
        <li key={f.name}>
          <details open={depth === 0 && (f.files.length > 0 || f.folders.length > 0) && f.files.length < 30}>
            <summary className="tree__folder">
              <FolderIcon />
              <span className="tree__name">{f.name}</span>
              {f.purpose && <span className="tree__purpose">{f.purpose}</span>}
              {f.files.length > 0 && <span className="tree__count">{f.files.length}</span>}
            </summary>
            {(f.folders.length > 0 || f.files.length > 0) && <Tree folder={f} depth={depth + 1} />}
          </details>
        </li>
      ))}
      {folder.files.map((file) => (
        <li key={file.name} className="tree__file">
          <DocIcon />
          <span className="tree__name">{file.name}</span>
          {file.kind === 'doc' && file.doc.missing.length > 0 && (
            <span className="status status--input">{file.doc.missing.length} to fill</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function Publish() {
  const { suite, tokens, intake, started, update } = useIntake();
  const [libraryName, setLibraryName] = useState('QMS');
  const [config, setConfig] = useState<M365Config>(loadConfig);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<'' | 'zip' | 'signin' | 'publish'>('');
  const [zipProgress, setZipProgress] = useState('');
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState('');

  const tree = useMemo(() => buildTree(suite, intake, tokens), [suite, intake, tokens]);
  const counts = countTree(tree);
  const siteUrl = intake.qms.siteUrl;
  const opts: PackageOptions = { suite, tokens, tree, siteUrl, libraryName: libraryName.trim() || 'QMS' };
  const company = (tokens.company?.value ?? 'QMS').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  async function downloadZip() {
    setBusy('zip');
    setError('');
    try {
      const blob = await buildZip(opts, (d, t) => setZipProgress(`Generating ${d} of ${t}…`));
      downloadBlob(`${company}-QMS.zip`, blob);
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
      setZipProgress('');
    }
  }

  async function connect() {
    setBusy('signin');
    setError('');
    try {
      saveConfig(config);
      setSession(await signIn(config));
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  }

  async function publish() {
    if (!session) return;
    setBusy('publish');
    setError('');
    setResult(null);
    setLog([]);
    try {
      const r = await publishToSharePoint({ ...opts, getToken: session.getToken }, (l) => setLog((prev) => [...prev, l]));
      setResult(r);
    } catch (e) {
      fail(e);
      setLog((prev) => [...prev, { level: 'error', text: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy('');
    }
  }

  if (!started) {
    return (
      <AppShell>
        <main className="app-main suite-empty">
          <span className="eyebrow">PUBLISH TO SHAREPOINT</span>
          <h1 className="setup-main__title">Answer the questionnaire first</h1>
          <p className="setup-main__blurb">The folder structure and documents are built from your answers.</p>
          <div className="button-row">
            <ButtonLink to="/app/form" size="lg">
              Open the questionnaire
            </ButtonLink>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="app-main suite-main">
        <div className="suite-head">
          <div className="stack suite-head__copy">
            <Link to="/app/suite" className="back-link back-link--flush">
              ← Documentation suite
            </Link>
            <span className="eyebrow">PUBLISH YOUR QMS</span>
            <h1 className="setup-main__title">Run your quality system in SharePoint</h1>
            <p className="setup-main__blurb">
              We build a document library laid out the way your procedures expect: {counts.folders} folders and{' '}
              {counts.files} files, every document a Word draft with its ID, revision and owner. SharePoint comes with
              Microsoft 365, so there's no eQMS licence to buy.
            </p>
          </div>
        </div>

        <div className="publish-grid">
          <section aria-labelledby="tree-h" className="card card--compact">
            <div className="outline__head">
              <h2 id="tree-h" className="card__title card__title--sm">
                Library structure
              </h2>
              <span className="text-muted-sm">Built from your answers</span>
            </div>
            <div className="field-row">
              <TextField
                id="qms.siteUrl"
                label="SharePoint site"
                value={siteUrl}
                placeholder="https://yourcompany.sharepoint.com/sites/QMS"
                onChange={(v) => update('qms', { siteUrl: v, docSystem: 'sharepoint' })}
              />
              <TextField id="libraryName" label="Library name" value={libraryName} onChange={setLibraryName} />
            </div>
            <div className="tree-box">
              <div className="tree__root">
                <FolderIcon />
                <span className="tree__name">{libraryName || 'QMS'}</span>
                <span className="tree__purpose">document library</span>
              </div>
              <Tree folder={tree} />
            </div>
            <p className="text-muted-sm">
              Columns added to the library: Document ID, Revision, Status (Draft → In review → Approved → Effective →
              Obsolete), Process owner, Effective date.
            </p>
          </section>

          <div className="stack publish-side">
            <section aria-labelledby="direct-h" className="card card--night card--compact method">
              <span className="method__tag">Recommended</span>
              <h2 id="direct-h" className="card__title card__title--sm">
                Create it in SharePoint for me
              </h2>
              <p className="method__text">
                Sign in with your Microsoft 365 work account. We create the library, its columns and every folder, then
                upload the drafts. Existing files are never overwritten.
              </p>
              {!config.clientId ? (
                <div className="stack method__setup">
                  <p className="method__text">
                    One-time setup by your Microsoft 365 admin: register this app in Microsoft Entra ID.
                  </p>
                  <ol className="method__steps">
                    <li>Entra admin center › App registrations › New registration</li>
                    <li>
                      Platform: Single-page application, redirect URI <code>{redirectUri()}</code>
                    </li>
                    <li>API permissions › Microsoft Graph › Delegated: Sites.Manage.All, Sites.ReadWrite.All</li>
                    <li>Copy the Application (client) ID below</li>
                  </ol>
                  <ConfigFields config={config} onChange={setConfig} />
                </div>
              ) : (
                <details className="method__advanced">
                  <summary>App registration</summary>
                  <ConfigFields config={config} onChange={setConfig} />
                </details>
              )}
              {session ? (
                <>
                  <span className="method__signed">Signed in as {session.username}</span>
                  <Button variant="bright" onClick={publish} disabled={busy !== '' || !siteUrl}>
                    {busy === 'publish' ? 'Creating…' : `Create library in SharePoint`}
                  </Button>
                  {!siteUrl && <span className="method__fine">Enter your SharePoint site address first.</span>}
                </>
              ) : (
                <Button variant="bright" onClick={connect} disabled={busy !== '' || !config.clientId}>
                  {busy === 'signin' ? 'Waiting for sign-in…' : 'Sign in with Microsoft 365'}
                </Button>
              )}
            </section>

            <section aria-labelledby="zip-h" className="card card--compact method">
              <h2 id="zip-h" className="card__title card__title--sm">
                Download and drag in
              </h2>
              <p className="text-sm ink-2">
                No admin needed. Get a ZIP with every folder and Word document, the master document list and a README.
                Create a library in SharePoint and drag the folders in.
              </p>
              <Button variant="outline" onClick={downloadZip} disabled={busy !== ''}>
                {busy === 'zip' ? zipProgress || 'Preparing…' : 'Download QMS folder (.zip)'}
              </Button>
            </section>

            <section aria-labelledby="ps-h" className="card card--compact method">
              <h2 id="ps-h" className="card__title card__title--sm">
                IT admin script
              </h2>
              <p className="text-sm ink-2">
                A PnP PowerShell script that creates the library with versioning, required check-out, columns and
                folders, then uploads the ZIP's contents. It's also inside the ZIP.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  downloadBlob('Setup-SharePoint-QMS.ps1', new Blob([powershellScript(opts)], { type: 'text/plain;charset=utf-8' }))
                }
              >
                Download script (.ps1)
              </Button>
            </section>
          </div>
        </div>

        {error && (
          <div role="alert" className="notice notice--warn">
            {error}
          </div>
        )}

        {(log.length > 0 || result) && (
          <section aria-labelledby="log-h" className="card card--compact">
            <h2 id="log-h" className="card__title card__title--sm">
              {result ? 'Your QMS library is ready' : busy === 'publish' ? 'Creating your library…' : 'Publish log'}
            </h2>
            {result && (
              <div className="stack publish-result">
                <p className="text-sm ink-2">
                  {result.foldersCreated} folders created ({result.foldersExisting} already there), {result.filesUploaded}{' '}
                  files uploaded ({result.filesSkipped} kept as they were)
                  {result.warnings ? `, ${result.warnings} warnings below` : ''}.
                </p>
                <div className="button-row">
                  <ButtonLink to={result.libraryUrl}>Open the library</ButtonLink>
                  <ButtonLink to={result.versioningSettingsUrl} variant="outline">
                    Library settings
                  </ButtonLink>
                </div>
                <p className="text-muted-sm">
                  Last step in SharePoint: Library settings › Versioning settings › turn on minor (draft) versions and
                  require check-out. Microsoft doesn't let apps change those two settings.
                </p>
              </div>
            )}
            <ol className="list-reset publish-log" aria-live="polite">
              {log.map((l, i) => (
                <li key={i} className={`publish-log__line publish-log__line--${l.level}`}>
                  {l.text}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section aria-labelledby="official-h" className="card card--compact">
          <h2 id="official-h" className="card__title card__title--sm">
            Making SharePoint your official QMS
          </h2>
          <ul className="list-reset stack checklist">
            <li>
              <strong>Versions and check-out.</strong> Minor versions are drafts; publishing a major version releases
              Rev A. Required check-out stops two people editing at once.
            </li>
            <li>
              <strong>Permissions.</strong> Only the document control group edits; everyone else reads. Break
              inheritance on the library, not on folders.
            </li>
            <li>
              <strong>Signatures.</strong> SharePoint records who changed what, but it has no Part 11 signature. Sign
              approvals with {tokens.eSignature?.value ?? 'your e-signature tool'}, then set Status to Effective.
            </li>
            <li>
              <strong>Audit trail.</strong> Keep the Microsoft Purview audit log for {tokens.retention?.value ?? 'your retention period'}.
            </li>
            <li>
              <strong>Validation.</strong> SOP-014 in your suite covers validating SharePoint for this intended use
              before you rely on it.
            </li>
          </ul>
        </section>
      </main>
    </AppShell>
  );
}

function ConfigFields({ config, onChange }: { config: M365Config; onChange: (c: M365Config) => void }) {
  return (
    <div className="field-row method__fields">
      <TextField
        id="m365.clientId"
        label="Application (client) ID"
        value={config.clientId}
        placeholder="00000000-0000-0000-0000-000000000000"
        onChange={(v) => onChange({ ...config, clientId: v.trim() })}
      />
      <TextField
        id="m365.tenant"
        label="Tenant"
        value={config.tenant}
        placeholder="organizations"
        onChange={(v) => onChange({ ...config, tenant: v.trim() })}
      />
    </div>
  );
}
