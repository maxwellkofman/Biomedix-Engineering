import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAccount } from '../../account/AccountContext';
import { Button, ButtonLink } from '../../components/Button';
import { bookingLink, formatBytes, formatWhen, isCalendly, requestsApi, SCAN_STATUS_LABEL, type PublicConfig, type RequestInfo } from '../../requests/api';
import { RequestLayout, Report, Uploader, type Pending } from './parts';
import { sendFiles } from './RequestForm';

const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

function Demo({ req, token, onChange }: { req: RequestInfo; token: string; onChange: (r: RequestInfo) => void }) {
  const [busy, setBusy] = useState(false);
  const url = req.demo.bookingUrl;
  const inline = !!url && isCalendly(url);
  const markBooked = useCallback(async () => {
    setBusy(true);
    try {
      onChange(await requestsApi.scheduled(token));
    } finally {
      setBusy(false);
    }
  }, [token, onChange]);

  // Calendly's inline embed tells the page when a time is booked.
  useEffect(() => {
    if (!inline || req.demo.scheduledAt) return;
    const on = (e: MessageEvent) => {
      if (!/^https:\/\/([\w-]+\.)?calendly\.com$/.test(e.origin)) return;
      if ((e.data as { event?: string })?.event === 'calendly.event_scheduled') void markBooked();
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [inline, req.demo.scheduledAt, markBooked]);

  return (
    <section className="card stack rq-block" aria-labelledby="demo-h">
      <span className="eyebrow">DEMO</span>
      {req.demo.scheduledAt ? (
        <>
          <h2 id="demo-h" className="card__title">
            You’re booked.
          </h2>
          <p className="card__body">
            The calendar invite has the video link. To change the time, use the link in that invite. We’ll come prepared with your device in mind.
          </p>
        </>
      ) : url ? (
        <>
          <h2 id="demo-h" className="card__title">
            Pick a time for your demo
          </h2>
          <p className="card__body">30 minutes with a Biomedix engineer. Your name and email are already filled in.</p>
          {inline ? (
            <iframe className="rq-booking" title="Choose a demo time" src={bookingLink(url, req, true)} loading="lazy" />
          ) : null}
          <div className="button-row">
            <a className={`btn ${inline ? 'btn--outline btn--sm' : 'btn--primary'}`} href={bookingLink(url, req)} target="_blank" rel="noopener noreferrer">
              {inline ? 'Open the scheduler in a new tab' : 'Choose a time'}
            </a>
            {!inline && (
              <Button variant="outline" onClick={() => void markBooked()} disabled={busy}>
                I’ve booked a time
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 id="demo-h" className="card__title">
            We’ll be in touch to set a time.
          </h2>
          <p className="card__body">
            A Biomedix engineer will email {req.email} within one business day with a few times for a 30-minute call.
          </p>
        </>
      )}
    </section>
  );
}

const STEPS = ['Files received', 'Automated checks', 'Engineer review', 'Report'];

function Scan({ req, token, cfg, onChange, uploadFailed }: { req: RequestInfo; token: string; cfg: PublicConfig | null; onChange: (r: RequestInfo) => void; uploadFailed: number }) {
  const scan = req.scan!;
  const [queue, setQueue] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(uploadFailed ? `${uploadFailed === 1 ? 'One file' : `${uploadFailed} files`} didn’t upload. Add ${uploadFailed === 1 ? 'it' : 'them'} again and send.` : null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const send = () =>
    run('Uploading…', async () => {
      if (!queue.length && !scan.files.length) throw new Error('Add at least one file.');
      const failed = await sendFiles(token, queue, setQueue);
      if (failed) throw new Error(`${failed === 1 ? 'One file' : `${failed} files`} didn’t upload. Remove ${failed === 1 ? 'it' : 'them'} or try again.`);
      setBusy('Running automated checks…');
      onChange(await requestsApi.submit(token));
      setQueue([]);
    });

  if (scan.status === 'uploading')
    return (
      <section className="card stack rq-block" aria-labelledby="scan-h">
        <span className="eyebrow">GAP SCAN</span>
        <h2 id="scan-h" className="card__title">
          Add your files
        </h2>
        <p className="card__body">
          Trace matrix, requirements, risk file, test reports: whatever you have. An engineer reviews the automated checks and sends your report
          within {cfg?.scanHours ?? 48} hours of you sending them.
        </p>
        {cfg && (
          <Uploader
            cfg={cfg}
            queue={queue}
            setQueue={setQueue}
            uploaded={scan.files}
            disabled={!!busy}
            onRemoveUploaded={(id) => void run('Removing…', async () => onChange(await requestsApi.removeFile(token, id)))}
          />
        )}
        {error && (
          <p role="alert" className="auth__error">
            {error}
          </p>
        )}
        <div className="button-row">
          <Button onClick={() => void send()} disabled={!!busy || (!queue.length && !scan.files.length)}>
            {busy ?? 'Send for review'}
          </Button>
        </div>
      </section>
    );

  if (scan.status === 'withdrawn')
    return (
      <section className="card stack rq-block" aria-labelledby="scan-h">
        <span className="eyebrow">GAP SCAN</span>
        <h2 id="scan-h" className="card__title">
          You withdrew this gap scan.
        </h2>
        <p className="card__body">Your files were deleted. You can start a new scan from this page whenever you’re ready.</p>
        <div className="button-row">
          <Button variant="outline" onClick={() => void run('Starting…', async () => onChange(await requestsApi.addScan(token, { permission: true, focus: scan.focus })))} disabled={!!busy}>
            Start a new gap scan
          </Button>
        </div>
      </section>
    );

  const step = scan.status === 'sent' ? 4 : 2;
  const deleteFiles = (
    <div className="stack rq-delete">
      {confirmDelete ? (
        <>
          <p className="text-muted-sm">
            {scan.status === 'sent'
              ? 'Delete your files from Biomedix now? The report stays.'
              : 'Withdraw the scan and delete your files? The engineer will stop the review.'}
          </p>
          <div className="button-row button-row--tight">
            <Button size="sm" variant="outline" onClick={() => void run('Deleting…', async () => onChange(await requestsApi.deleteFiles(token)))} disabled={!!busy}>
              {busy ?? (scan.status === 'sent' ? 'Delete files' : 'Withdraw and delete')}
            </Button>
            <button type="button" className="link-button link-button--muted" onClick={() => setConfirmDelete(false)}>
              Keep them
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="link-button link-button--muted" onClick={() => setConfirmDelete(true)}>
          {scan.status === 'sent' ? 'Delete my files' : 'Withdraw and delete my files'}
        </button>
      )}
    </div>
  );

  return (
    <>
      <section className="card stack rq-block" aria-labelledby="scan-h">
        <div className="rq-block__head">
          <span className="eyebrow">GAP SCAN</span>
          <span className={`rq-status rq-status--${scan.status}`}>{SCAN_STATUS_LABEL[scan.status]}</span>
        </div>
        <h2 id="scan-h" className="card__title">
          {scan.status === 'sent' ? 'Your report is ready.' : `An engineer is reviewing your files. Report by ${formatWhen(scan.dueAt)}.`}
        </h2>
        <ol className="list-reset rq-steps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className={`rq-steps__item${i < step ? ' rq-steps__item--done' : i === step ? ' rq-steps__item--now' : ''}`}>
              <span className="rq-steps__dot" aria-hidden="true" />
              <span>{s}</span>
              <span className="visually-hidden">{i < step ? ' (done)' : i === step ? ' (in progress)' : ''}</span>
            </li>
          ))}
        </ol>
        <ul className="list-reset rq-files" aria-label="Your files">
          {scan.files.map((f) => (
            <li key={f.id} className="rq-files__item">
              <span className="rq-files__name">{f.name}</span>
              <span className="text-muted-sm">
                {f.kindLabel} · {formatBytes(f.size)}
                {f.pages ? ` · ${f.pages} page${f.pages === 1 ? '' : 's'}` : ''}
                {f.deleted ? ' · deleted' : ''}
              </span>
              {f.readNote && !f.deleted && <span className="rq-files__note">{f.readNote}</span>}
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="auth__error">
            {error}
          </p>
        )}
        {!scan.filesDeleted ? deleteFiles : <p className="text-muted-sm">Your files have been deleted from Biomedix.</p>}
      </section>
      {scan.report && <Report report={scan.report} company={req.company} />}
    </>
  );
}

function AddScan({ token, onChange }: { token: string; onChange: (r: RequestInfo) => void }) {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(false);
  const [focus, setFocus] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card stack rq-block" aria-labelledby="add-h">
      <span className="eyebrow">OPTIONAL</span>
      <h2 id="add-h" className="card__title">
        Add a free gap scan before your call
      </h2>
      <p className="card__body">Share your trace matrix, risk file or test reports and we’ll walk you through what we found during the demo.</p>
      {open ? (
        <form
          className="stack rq__form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              onChange(await requestsApi.addScan(token, { permission, focus: focus.trim() }));
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Something went wrong.');
            }
          }}
        >
          <div className="field">
            <label htmlFor="as-focus" className="field__label">
              Anything we should focus on? <span className="field__optional">optional</span>
            </label>
            <textarea id="as-focus" className="input input--area" rows={2} maxLength={4000} value={focus} onChange={(e) => setFocus(e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" required checked={permission} onChange={(e) => setPermission(e.target.checked)} />
            <span>I’m allowed to share these files with Biomedix for this review.</span>
          </label>
          {error && <p className="auth__error">{error}</p>}
          <div className="button-row">
            <Button type="submit">Continue to upload</Button>
          </div>
        </form>
      ) : (
        <div className="button-row">
          <Button variant="outline" onClick={() => setOpen(true)}>
            Add a gap scan
          </Button>
        </div>
      )}
    </section>
  );
}

export default function RequestStatus() {
  const { token = '' } = useParams();
  const location = useLocation();
  const { status } = useAccount();
  const state = (location.state ?? {}) as { fresh?: boolean; uploadFailed?: number };
  const [req, setReq] = useState<RequestInfo | null>(null);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requestsApi
      .get(token)
      .then(setReq)
      .catch((err: Error) => setError(err.message));
    requestsApi.config().then(setCfg).catch(() => undefined);
  }, [token]);

  // Check back while the review is under way, so the report appears without a reload.
  useEffect(() => {
    if (!req?.scan || !['received', 'in_review'].includes(req.scan.status)) return;
    const t = window.setInterval(() => requestsApi.get(token).then(setReq).catch(() => undefined), 60_000);
    return () => window.clearInterval(t);
  }, [token, req?.scan?.status]);

  const sent = req?.scan?.status === 'sent';
  return (
    <RequestLayout>
      <main className="container rq__main rq__main--status">
        {error ? (
          <div className="stack rq-head">
            <span className="eyebrow">YOUR REQUEST</span>
            <h1 className="rq__title">We can’t find that request.</h1>
            <p className="lead">{error}</p>
            <div className="button-row">
              <ButtonLink to="/demo">Book a demo</ButtonLink>
              <ButtonLink to="/gap-scan" variant="outline">
                Start a gap scan
              </ButtonLink>
            </div>
          </div>
        ) : !req ? (
          <p className="app-loading" aria-busy="true">
            <span className="app-loading__dot" aria-hidden="true" />
            Loading your request…
          </p>
        ) : (
          <>
            <div className="stack rq-head">
              <span className="eyebrow">{sent ? 'GAP SCAN' : 'YOUR REQUEST'}</span>
              <h1 className="rq__title">{sent ? `Gap scan for ${req.company}` : state.fresh ? `Thanks, ${firstName(req.name)}.` : `${req.company}’s request`}</h1>
              <p className="lead">
                {sent
                  ? 'Reviewed by a Biomedix engineer. Each gap shows where we found it, the clause behind it and what to do next.'
                  : `We sent a copy of this page’s link to ${req.email}. Keep it: it’s how you get back here.`}
              </p>
            </div>
            <div className="rq-blocks">
              {req.demo.wanted && <Demo req={req} token={token} onChange={setReq} />}
              {req.scan ? (
                <Scan req={req} token={token} cfg={cfg} onChange={setReq} uploadFailed={state.uploadFailed ?? 0} />
              ) : (
                req.demo.wanted && <AddScan token={token} onChange={setReq} />
              )}
              <section className="card card--compact stack rq-block rq-next" aria-labelledby="next-h">
                <h2 id="next-h" className="card__title card__title--sm">
                  {sent ? 'Close the gaps' : 'While you wait'}
                </h2>
                <p className="card__body">
                  Answer the QMS questionnaire and Biomedix drafts your procedures, risk file and trace records from your answers, ready for
                  engineer review.
                </p>
                <div className="button-row">
                  <ButtonLink to={status === 'signed-in' ? '/app/dashboard' : '/app/setup/company'} variant="outline">
                    {status === 'signed-in' ? 'Go to your dashboard' : 'Start your documentation suite'}
                  </ButtonLink>
                  {!req.demo.wanted && req.demo.bookingUrl && (
                    <a className="btn btn--text" href={bookingLink(req.demo.bookingUrl, req)} target="_blank" rel="noopener noreferrer">
                      Book a call about the results
                    </a>
                  )}
                </div>
              </section>
            </div>
            <p className="text-muted-sm rq-help">
              Questions? Reply to any email from us. <Link to="/">Biomedix Engineering</Link>
            </p>
          </>
        )}
      </main>
    </RequestLayout>
  );
}
