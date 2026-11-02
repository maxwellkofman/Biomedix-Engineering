/**
 * Direct publish to SharePoint Online through Microsoft Graph, signed in as
 * the user (delegated permissions). Needs an Entra ID app registration of
 * type "Single-page application"; see the Publish page for setup steps.
 */
import { buildFiles, DOCX_TYPE, type PackageOptions } from './package';
import { folderPaths } from './structure';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['https://graph.microsoft.com/Sites.Manage.All', 'https://graph.microsoft.com/Sites.ReadWrite.All'];
const CONFIG_KEY = 'biomedix.m365.v1';

export interface M365Config {
  clientId: string;
  /** Tenant ID or domain; "organizations" lets any work account sign in. */
  tenant: string;
}

export function loadConfig(): M365Config {
  const env = {
    clientId: (import.meta.env.VITE_M365_CLIENT_ID as string | undefined) ?? '',
    tenant: (import.meta.env.VITE_M365_TENANT as string | undefined) ?? '',
  };
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') as Partial<M365Config>;
    return { clientId: saved.clientId || env.clientId, tenant: saved.tenant || env.tenant || 'organizations' };
  } catch {
    return { clientId: env.clientId, tenant: env.tenant || 'organizations' };
  }
}

export function saveConfig(c: M365Config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export const redirectUri = () => `${window.location.origin}/redirect.html`;

/* ---------- Sign-in ---------- */

type Pca = Awaited<ReturnType<typeof import('@azure/msal-browser')['createStandardPublicClientApplication']>>;
let pcaFor: { key: string; pca: Promise<Pca> } | null = null;

function getPca(c: M365Config) {
  const key = `${c.clientId}|${c.tenant}`;
  if (pcaFor?.key !== key) {
    pcaFor = {
      key,
      pca: import('@azure/msal-browser').then((m) =>
        m.createStandardPublicClientApplication({
          auth: {
            clientId: c.clientId,
            authority: `https://login.microsoftonline.com/${c.tenant || 'organizations'}`,
            redirectUri: redirectUri(),
          },
          cache: { cacheLocation: 'sessionStorage' },
        }),
      ),
    };
  }
  return pcaFor.pca;
}

export interface Session {
  username: string;
  getToken: () => Promise<string>;
}

export async function signIn(c: M365Config): Promise<Session> {
  const pca = await getPca(c);
  const result = await pca.loginPopup({ scopes: SCOPES, prompt: 'select_account' });
  const account = result.account;
  pca.setActiveAccount(account);
  return {
    username: account.username,
    getToken: async () => {
      try {
        return (await pca.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
      } catch {
        return (await pca.acquireTokenPopup({ scopes: SCOPES, account })).accessToken;
      }
    },
  };
}

/* ---------- Graph helpers ---------- */

export class GraphError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Fetcher = typeof fetch;

function graphClient(getToken: () => Promise<string>, fetcher: Fetcher = fetch) {
  return async function graph<T = unknown>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const token = await getToken();
    const isBlob = typeof Blob !== 'undefined' && init.body instanceof Blob;
    const res = await fetcher(path.startsWith('http') ? path : `${GRAPH}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body && !isBlob ? { 'Content-Type': 'application/json' } : {}),
        ...(isBlob ? { 'Content-Type': (init.body as Blob).type || 'application/octet-stream' } : {}),
        ...init.headers,
      },
    });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = Number(res.headers.get('Retry-After') ?? 2 ** attempt);
      await new Promise((r) => setTimeout(r, wait * 1000));
      return graph<T>(path, init, attempt + 1);
    }
    if (!res.ok) {
      let code = String(res.status);
      let message = res.statusText;
      try {
        const body = (await res.json()) as { error?: { code?: string; message?: string } };
        code = body.error?.code ?? code;
        message = body.error?.message ?? message;
      } catch {
        /* not JSON */
      }
      throw new GraphError(res.status, code, message);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  };
}

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** "https://contoso.sharepoint.com/sites/QMS/Shared%20Documents" -> Graph site address. */
export function siteAddress(url: string): string {
  const u = new URL(url.trim());
  if (!/\.sharepoint\.(com|us|de|cn)$/i.test(u.hostname)) throw new Error('That is not a SharePoint Online address.');
  const m = u.pathname.match(/^\/(sites|teams)\/[^/]+/i);
  return m ? `/sites/${u.hostname}:${m[0]}` : `/sites/${u.hostname}`;
}

/* ---------- Publish ---------- */

export type LogLine = { level: 'info' | 'ok' | 'skip' | 'warn' | 'error'; text: string };

export interface PublishResult {
  libraryUrl: string;
  versioningSettingsUrl: string;
  foldersCreated: number;
  foldersExisting: number;
  filesUploaded: number;
  filesSkipped: number;
  warnings: number;
}

const COLUMNS = [
  { name: 'DocumentID', displayName: 'Document ID', text: {} },
  { name: 'Revision', displayName: 'Revision', text: {} },
  {
    name: 'DocStatus',
    displayName: 'Status',
    choice: { choices: ['Draft', 'In review', 'Approved', 'Effective', 'Obsolete'], displayAs: 'dropDownMenu' },
    defaultValue: { value: 'Draft' },
  },
  { name: 'ProcessOwner', displayName: 'Process owner', text: {} },
  { name: 'EffectiveDate', displayName: 'Effective date', dateTime: { format: 'dateOnly' } },
];

export async function publishToSharePoint(
  o: PackageOptions & { getToken: () => Promise<string>; fetcher?: Fetcher },
  log: (l: LogLine) => void,
): Promise<PublishResult> {
  const graph = graphClient(o.getToken, o.fetcher);

  // Site
  const site = await graph<{ id: string; webUrl: string; displayName: string }>(siteAddress(o.siteUrl) + '?$select=id,webUrl,displayName');
  log({ level: 'ok', text: `Connected to site “${site.displayName}”` });

  // Library
  const lists = await graph<{ value: { id: string; displayName: string; webUrl: string; list?: { template?: string } }[] }>(
    `/sites/${site.id}/lists?$select=id,displayName,webUrl,list&$top=999`,
  );
  let library = lists.value.find((l) => l.displayName.toLowerCase() === o.libraryName.toLowerCase());
  if (library && library.list?.template !== 'documentLibrary') {
    throw new Error(`“${o.libraryName}” exists on this site but is not a document library. Choose another name.`);
  }
  if (library) log({ level: 'skip', text: `Library “${library.displayName}” already exists; adding to it` });
  else {
    library = await graph(`/sites/${site.id}/lists`, {
      method: 'POST',
      body: JSON.stringify({ displayName: o.libraryName, list: { template: 'documentLibrary' } }),
    });
    log({ level: 'ok', text: `Created document library “${o.libraryName}”` });
  }
  const lib = library!;

  // Columns
  let warnings = 0;
  const existing = await graph<{ value: { name: string }[] }>(`/sites/${site.id}/lists/${lib.id}/columns?$select=name`);
  const have = new Set(existing.value.map((c) => c.name));
  for (const col of COLUMNS) {
    if (have.has(col.name)) continue;
    try {
      await graph(`/sites/${site.id}/lists/${lib.id}/columns`, { method: 'POST', body: JSON.stringify(col) });
      log({ level: 'ok', text: `Added column “${col.displayName}”` });
    } catch (e) {
      warnings++;
      log({ level: 'warn', text: `Could not add column “${col.displayName}”: ${(e as Error).message}` });
    }
  }

  // Folders, parents first
  const drive = await graph<{ id: string }>(`/sites/${site.id}/lists/${lib.id}/drive?$select=id`);
  let foldersCreated = 0;
  let foldersExisting = 0;
  for (const p of folderPaths(o.tree)) {
    const i = p.lastIndexOf('/');
    const parent = i === -1 ? '' : p.slice(0, i);
    const name = p.slice(i + 1);
    const url = parent ? `/drives/${drive.id}/root:/${encPath(parent)}:/children` : `/drives/${drive.id}/root/children`;
    try {
      await graph(url, {
        method: 'POST',
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
      foldersCreated++;
      log({ level: 'ok', text: `Folder ${p}` });
    } catch (e) {
      if (e instanceof GraphError && e.status === 409) {
        foldersExisting++;
        log({ level: 'skip', text: `Folder ${p} already exists` });
      } else throw e;
    }
  }

  // Files: never overwrite what is already there
  log({ level: 'info', text: 'Generating Word documents…' });
  const files = await buildFiles(o);
  let filesUploaded = 0;
  let filesSkipped = 0;
  for (const f of files) {
    const path = f.dir ? `${f.dir}/${f.name}` : f.name;
    const blob = f.name.endsWith('.docx') ? new Blob([f.blob], { type: DOCX_TYPE }) : f.blob;
    try {
      const item = await graph<{ id: string }>(
        `/drives/${drive.id}/root:/${encPath(path)}:/content?@microsoft.graph.conflictBehavior=fail`,
        { method: 'PUT', body: blob },
      );
      filesUploaded++;
      if (f.meta) {
        try {
          await graph(`/drives/${drive.id}/items/${item.id}/listItem/fields`, { method: 'PATCH', body: JSON.stringify(f.meta) });
        } catch (e) {
          warnings++;
          log({ level: 'warn', text: `Uploaded ${path}, but could not set its columns: ${(e as Error).message}` });
          continue;
        }
      }
      log({ level: 'ok', text: `Uploaded ${path}` });
    } catch (e) {
      if (e instanceof GraphError && e.status === 409) {
        filesSkipped++;
        log({ level: 'skip', text: `Kept existing ${path}` });
      } else throw e;
    }
  }

  const listGuid = encodeURIComponent(`{${lib.id}}`);
  return {
    libraryUrl: lib.webUrl,
    versioningSettingsUrl: `${site.webUrl}/_layouts/15/LstSetng.aspx?List=${listGuid}`,
    foldersCreated,
    foldersExisting,
    filesUploaded,
    filesSkipped,
    warnings,
  };
}
