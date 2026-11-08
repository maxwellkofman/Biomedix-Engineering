import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../../account/AccountContext';
import { Logo } from '../../components/Logo';
import { formatBytes, formatWhen, SEVERITY_LABEL, type PublicConfig, type Report as ReportData, type ScanFileInfo, type Severity } from '../../requests/api';
import '../../styles/app.css';
import '../../styles/flow.css';
import '../../styles/account.css';
import '../../styles/org.css';
import '../../styles/requests.css';

/* ---------- Page chrome for the public request pages ---------- */

export function RequestLayout({ children }: { children: ReactNode }) {
  const { status } = useAccount();
  return (
    <div className="rq">
      <header className="night rq__top">
        <div className="container site-header">
          <Logo />
          <nav aria-label="Primary" className="site-nav">
            <Link to="/#how" className="site-nav__link">
              How it works
            </Link>
            <Link to="/gap-scan" className="site-nav__link">
              Free gap scan
            </Link>
            <Link to={status === 'signed-in' ? '/app/dashboard' : '/sign-in'} className="site-nav__link">
              {status === 'signed-in' ? 'Dashboard' : 'Sign in'}
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="rq__foot">
        <div className="container rq__foot-inner">
          <span>© 2026 Biomedix Engineering</span>
          <span>Biomedix engineers sign as technical reviewers. Your management approves and owns every quality system decision.</span>
        </div>
      </footer>
    </div>
  );
}

/* ---------- File picker with client-side checks ---------- */

export interface Pending {
  key: string;
  file: File;
  progress: number;
  state: 'ready' | 'uploading' | 'done' | 'error';
  error?: string;
}

const ext = (name: string) => (/\.[a-z0-9]+$/i.exec(name)?.[0] ?? '').toLowerCase();

/** Adds files to the queue, refusing types, sizes and counts the server would refuse. Returns messages for any refused. */
export function addFiles(queue: Pending[], files: File[], cfg: PublicConfig, uploaded: ScanFileInfo[] = []) {
  const problems: string[] = [];
  const next = [...queue];
  for (const file of files) {
    const total = [...next.map((p) => p.file.size), ...uploaded.map((f) => f.size)].reduce((a, b) => a + b, 0);
    if (!cfg.accept.includes(ext(file.name))) problems.push(`${file.name}: use PDF, Word, Excel, CSV or text.`);
    else if (file.size === 0) problems.push(`${file.name} is empty.`);
    else if (file.size > cfg.limits.fileBytes) problems.push(`${file.name} is over ${formatBytes(cfg.limits.fileBytes)}.`);
    else if (next.length + uploaded.length >= cfg.limits.files) problems.push(`Up to ${cfg.limits.files} files per scan.`);
    else if (total + file.size > cfg.limits.totalBytes) problems.push(`Up to ${formatBytes(cfg.limits.totalBytes)} in total.`);
    else if (next.some((p) => p.file.name === file.name && p.file.size === file.size) || uploaded.some((f) => f.name === file.name && f.size === file.size))
      problems.push(`${file.name} is already in the list.`);
    else next.push({ key: `${file.name}:${file.size}:${file.lastModified}`, file, progress: 0, state: 'ready' });
  }
  return { queue: next, problems: [...new Set(problems)] };
}

interface UploaderProps {
  cfg: PublicConfig;
  queue: Pending[];
  setQueue: (q: Pending[]) => void;
  uploaded?: ScanFileInfo[];
  onRemoveUploaded?: (id: string) => void;
  disabled?: boolean;
  id?: string;
}

export function Uploader({ cfg, queue, setQueue, uploaded = [], onRemoveUploaded, disabled, id = 'scan-files' }: UploaderProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const take = (files: File[]) => {
    const r = addFiles(queue, files, cfg, uploaded);
    setQueue(r.queue);
    setProblems(r.problems);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take([...e.dataTransfer.files]);
  };
  const count = queue.length + uploaded.length;
  return (
    <div className="stack uploader">
      <label
        htmlFor={id}
        className={`uploader__zone${over ? ' uploader__zone--over' : ''}${disabled ? ' uploader__zone--off' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <span className="uploader__title">
          Drop files here or <span className="uploader__choose">choose files</span>
        </span>
        <span className="uploader__hint">
          Trace matrix, requirements, risk file or test reports · PDF, Word, Excel, CSV or text · up to {cfg.limits.files} files,{' '}
          {formatBytes(cfg.limits.fileBytes)} each
        </span>
        <input
          ref={input}
          id={id}
          type="file"
          multiple
          disabled={disabled}
          accept={cfg.accept.join(',')}
          className="visually-hidden"
          onChange={(e) => {
            take([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </label>
      {problems.length > 0 && (
        <ul role="alert" className="list-reset uploader__problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {count > 0 && (
        <ul className="list-reset uploader__list" aria-label="Files">
          {uploaded.map((f) => (
            <li key={f.id} className="uploader__item">
              <span className="uploader__name">{f.name}</span>
              <span className="uploader__meta">{formatBytes(f.size)} · uploaded</span>
              {onRemoveUploaded && !disabled && (
                <button type="button" className="link-button link-button--muted" onClick={() => onRemoveUploaded(f.id)} aria-label={`Remove ${f.name}`}>
                  Remove
                </button>
              )}
            </li>
          ))}
          {queue.map((p) => (
            <li key={p.key} className={`uploader__item${p.state === 'error' ? ' uploader__item--err' : ''}`}>
              <span className="uploader__name">{p.file.name}</span>
              <span className="uploader__meta">
                {formatBytes(p.file.size)}
                {p.state === 'uploading' && ` · uploading ${Math.round(p.progress * 100)}%`}
                {p.state === 'done' && ' · uploaded'}
                {p.state === 'error' && ` · ${p.error}`}
              </span>
              {p.state === 'uploading' ? (
                <span className="uploader__bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(p.progress * 100)}%` }} />
                </span>
              ) : (
                p.state !== 'done' &&
                !disabled && (
                  <button
                    type="button"
                    className="link-button link-button--muted"
                    aria-label={`Remove ${p.file.name}`}
                    onClick={() => setQueue(queue.filter((x) => x.key !== p.key))}
                  >
                    Remove
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Report ---------- */

/** Finding detail text: plain sentences, with "- " lines drawn as a list. */
export function DetailText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={blocks.length} className="finding__examples">
          {list.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) list.push(line.slice(2));
    else {
      flush();
      if (line.trim()) blocks.push(<p key={blocks.length}>{line}</p>);
    }
  }
  flush();
  return <div className="finding__detail">{blocks}</div>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`sev sev--${severity}`}>{SEVERITY_LABEL[severity]}</span>;
}

export function Report({ report, company, preview = false }: { report: ReportData; company: string; preview?: boolean }) {
  const by = (s: Severity) => report.findings.filter((f) => f.severity === s);
  return (
    <article className="report" aria-labelledby="report-h">
      <header className="report__head">
        <div className="stack report__title-block">
          <span className="eyebrow">GAP SCAN REPORT{preview ? ' · PREVIEW' : ''}</span>
          <h2 id="report-h" className="report__title">
            {company}
          </h2>
          <p className="text-muted-sm">
            {preview ? 'Not sent yet. ' : ''}
            Technical review by {report.reviewer || '[engineer]'}, Biomedix Engineering
            {report.sentAt ? ` · ${formatWhen(report.sentAt)}` : ''}
          </p>
        </div>
        {!preview && (
          <button type="button" className="btn btn--outline btn--sm report__print" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        )}
      </header>

      <div className="report__counts" aria-label="Gaps by priority">
        {(['high', 'medium', 'low'] as const).map((s) => (
          <div key={s} className={`report__count report__count--${s}`}>
            <span className="report__count-n">{by(s).length}</span>
            <span className="report__count-l">{SEVERITY_LABEL[s]} priority</span>
          </div>
        ))}
      </div>

      {report.summary && (
        <section className="stack report__summary" aria-label="Summary">
          {report.summary
            .split(/\n{2,}/)
            .filter(Boolean)
            .map((p, i) => (
              <p key={i}>{p}</p>
            ))}
        </section>
      )}

      {(['high', 'medium', 'low'] as const).map((s) =>
        by(s).length ? (
          <section key={s} className="stack report__group" aria-labelledby={`grp-${s}`}>
            <h3 id={`grp-${s}`} className="report__group-title">
              {SEVERITY_LABEL[s]} priority <span className="text-muted-sm">· {by(s).length}</span>
            </h3>
            <ol className="list-reset stack report__findings">
              {by(s).map((f) => (
                <li key={f.id} className="finding">
                  <div className="finding__top">
                    <SeverityBadge severity={f.severity} />
                    <span className="finding__area">{f.area}</span>
                    {f.file && <span className="finding__file">{f.file}</span>}
                  </div>
                  <h4 className="finding__title">{f.title}</h4>
                  {f.detail && <DetailText text={f.detail} />}
                  {f.fix && (
                    <p className="finding__fix">
                      <strong>What to do:</strong> {f.fix}
                    </p>
                  )}
                  {f.clause && <p className="finding__clause mono">{f.clause}</p>}
                </li>
              ))}
            </ol>
          </section>
        ) : null,
      )}
      {!report.findings.length && <p className="report__none">We didn’t find gaps in the files you shared.</p>}

      <section className="stack report__coverage" aria-labelledby="cov-h">
        <h3 id="cov-h" className="report__group-title">
          What this scan covered
        </h3>
        <div className="table-wrap">
          <table className="cov-table">
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">Files</th>
              </tr>
            </thead>
            <tbody>
              {report.coverage.map((c) => (
                <tr key={c.area}>
                  <th scope="row">{c.area}</th>
                  <td>{c.files.length ? c.files.join(', ') : <span className="text-muted-sm">{c.note}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="report__disclaimer">
        Automated checks flag likely gaps from the text of your files; a Biomedix engineer reviewed each one and added their own. This is a
        technical review, not regulatory or legal advice, and it doesn’t replace your design reviews or your management’s approval.
      </p>
    </article>
  );
}
