import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAccount } from '../../account/AccountContext';
import { Button } from '../../components/Button';
import { requestsApi, uploadFile, type DeviceType, type PublicConfig, type Stage } from '../../requests/api';
import { RequestLayout, Uploader, type Pending } from './parts';

type Mode = 'demo' | 'scan';

const COPY: Record<Mode, { eyebrow: string; title: string; lead: string }> = {
  demo: {
    eyebrow: 'BOOK A DEMO',
    title: 'See the agents work on a device like yours.',
    lead: '30 minutes with a Biomedix engineer. Tell us what you’re building and we’ll show the design controls, risk and trace agents on something close to it, with time for your questions.',
  },
  scan: {
    eyebrow: 'FREE GAP SCAN',
    title: 'See what the agents find in your design file.',
    lead: 'Share your trace matrix, requirements, risk file or test reports. Automated checks flag likely gaps; a Biomedix engineer reviews every one and sends you a report.',
  },
};

const CHECKS = [
  'Requirements a tester can’t verify as written',
  'Requirements with no verification linked, or missing from the trace matrix',
  'Hazards without severity, and risk controls without evidence they work',
  'Test reports missing acceptance criteria, sample size or the version tested',
  'Software and security basics: safety class, SOUP and SBOM, security risks',
];

/** Steps a person has to send their files: upload each, then submit. Returns the number that failed. */
export async function sendFiles(token: string, queue: Pending[], setQueue: (fn: (q: Pending[]) => Pending[]) => void) {
  let failed = 0;
  for (const p of queue) {
    if (p.state === 'done') continue;
    setQueue((q) => q.map((x) => (x.key === p.key ? { ...x, state: 'uploading', progress: 0, error: undefined } : x)));
    try {
      await uploadFile(token, p.file, (progress) => setQueue((q) => q.map((x) => (x.key === p.key ? { ...x, progress } : x))));
      setQueue((q) => q.map((x) => (x.key === p.key ? { ...x, state: 'done', progress: 1 } : x)));
    } catch (err) {
      failed++;
      setQueue((q) => q.map((x) => (x.key === p.key ? { ...x, state: 'error', error: err instanceof Error ? err.message : 'Upload failed.' } : x)));
    }
  }
  return failed;
}

export default function RequestForm({ mode }: { mode: Mode }) {
  const { user, org } = useAccount();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [mail, setMail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [device, setDevice] = useState('');
  const [deviceType, setDeviceType] = useState<DeviceType | ''>('');
  const [stage, setStage] = useState<Stage | ''>('');
  const [ai, setAi] = useState(false);
  const [message, setMessage] = useState('');
  const [focus, setFocus] = useState('');
  const [demo, setDemo] = useState(true);
  const [scan, setScan] = useState(mode === 'scan' || params.get('scan') === '1');
  const [permission, setPermission] = useState(false);
  const [website, setWebsite] = useState('');
  const [queue, setQueueState] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[mode];

  useEffect(() => {
    requestsApi
      .config()
      .then(setCfg)
      .catch((err: Error) => setCfgError(err.message));
  }, []);

  // Signed-in people don't retype what we know.
  useEffect(() => {
    if (!user) return;
    setName((v) => v || user.name);
    setMail((v) => v || user.email);
    setCompany((v) => v || org?.name || '');
  }, [user, org]);

  const wantsDemo = mode === 'demo' || demo;
  const wantsScan = mode === 'scan' || scan;

  const submit = async () => {
    if (wantsScan && !queue.length) return setError('Add at least one file for the gap scan.');
    setError(null);
    setBusy('Sending…');
    try {
      const { token } = await requestsApi.create({
        name: name.trim(),
        email: mail.trim(),
        company: company.trim(),
        role: role.trim(),
        device: device.trim(),
        deviceType,
        stage,
        ai,
        message: message.trim(),
        focus: focus.trim(),
        demo: wantsDemo,
        scan: wantsScan,
        permission: wantsScan ? permission : undefined,
        source: mode === 'demo' ? (wantsScan ? 'demo+scan' : 'demo') : 'gap-scan',
        orgId: org?.id,
        website,
      });
      if (wantsScan) {
        setBusy(`Uploading ${queue.length === 1 ? 'your file' : `${queue.length} files`}…`);
        const failed = await sendFiles(token, queue, setQueueState);
        if (failed) {
          // The request exists; the status page lets them retry the failed files.
          navigate(`/request/${token}`, { state: { uploadFailed: failed } });
          return;
        }
        setBusy('Running automated checks…');
        await requestsApi.submit(token);
      }
      navigate(`/request/${token}`, { state: { fresh: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(null);
    }
  };

  const label = busy ?? (wantsDemo && wantsScan ? 'Book a demo and send files' : wantsScan ? 'Send for a gap scan' : 'Book a demo');

  return (
    <RequestLayout>
      <main className="container rq__main">
        <div className="rq__grid">
          <div className="stack rq__intro">
            <span className="eyebrow">{copy.eyebrow}</span>
            <h1 className="rq__title">{copy.title}</h1>
            <p className="lead">{copy.lead}</p>

            {mode === 'demo' ? (
              <ol className="list-reset stack rq__steps">
                <li>
                  <span className="rq__step-n mono">01</span>
                  <span>
                    <strong>Tell us about your device.</strong> Two minutes; it shapes what we show.
                  </span>
                </li>
                <li>
                  <span className="rq__step-n mono">02</span>
                  <span>
                    <strong>Pick a time.</strong> The scheduler opens as soon as you send this, with your details filled in.
                  </span>
                </li>
                <li>
                  <span className="rq__step-n mono">03</span>
                  <span>
                    <strong>Optional: add a free gap scan.</strong> Share files and we’ll walk you through what we found on the call.
                  </span>
                </li>
              </ol>
            ) : (
              <div className="stack rq__checks">
                <h2 className="rq__sub">What the checks look for</h2>
                <ul className="list-reset stack">
                  {CHECKS.map((c) => (
                    <li key={c} className="rq__check">
                      {c}
                    </li>
                  ))}
                </ul>
                <p className="text-muted-sm">
                  Every flagged gap is reviewed by a Biomedix engineer before you see it, with the clause behind it and what to do next.
                  Report within {cfg?.scanHours ?? 48} hours.
                </p>
              </div>
            )}

            <div className="card card--compact stack rq__trust">
              <h2 className="rq__sub">Your files stay yours</h2>
              <p className="text-muted-sm">
                Only Biomedix engineers can open them. They’re never used to train models, and they’re deleted {cfg?.retentionDays ?? 30} days
                after your report, or whenever you ask. Need an NDA first? Book the demo without files and we’ll send one.
              </p>
            </div>
          </div>

          <section className="card rq__card" aria-labelledby="rq-h">
            <h2 id="rq-h" className="card__title">
              {mode === 'demo' ? 'Your details' : 'Send your files'}
            </h2>
            {cfgError && <p className="auth__error">{cfgError}</p>}
            <form
              className="stack rq__form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="field-row">
                <div className="field">
                  <label htmlFor="rq-name" className="field__label">
                    Your name
                  </label>
                  <input id="rq-name" className="input" required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="rq-email" className="field__label">
                    Work email
                  </label>
                  <input id="rq-email" className="input" type="email" required maxLength={254} autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="rq-company" className="field__label">
                    Company
                  </label>
                  <input id="rq-company" className="input" required maxLength={160} autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="rq-role" className="field__label">
                    Your role <span className="field__optional">optional</span>
                  </label>
                  <input id="rq-role" className="input" maxLength={120} autoComplete="organization-title" placeholder="e.g. CTO, quality lead" value={role} onChange={(e) => setRole(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="rq-device" className="field__label">
                  What are you building?
                </label>
                <textarea
                  id="rq-device"
                  className="input input--area"
                  rows={2}
                  maxLength={600}
                  placeholder="e.g. A wearable ECG patch and app that detects atrial fibrillation"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="rq-type" className="field__label">
                    Device type
                  </label>
                  <select id="rq-type" className="input" value={deviceType} onChange={(e) => setDeviceType(e.target.value as DeviceType | '')}>
                    <option value="">Choose…</option>
                    {cfg && Object.entries(cfg.deviceTypes).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rq-stage" className="field__label">
                    Where you are
                  </label>
                  <select id="rq-stage" className="input" value={stage} onChange={(e) => setStage(e.target.value as Stage | '')}>
                    <option value="">Choose…</option>
                    {cfg && Object.entries(cfg.stages).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <label className="check">
                <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
                <span>It uses AI or machine learning</span>
              </label>

              {mode === 'demo' && (
                <div className="field">
                  <label htmlFor="rq-message" className="field__label">
                    Anything you’d like us to cover? <span className="field__optional">optional</span>
                  </label>
                  <textarea
                    id="rq-message"
                    className="input input--area"
                    rows={3}
                    maxLength={4000}
                    placeholder="e.g. How the risk agent handles software hazards; what a 510(k) package looks like"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
              )}

              {mode === 'demo' ? (
                <label className="check rq__toggle">
                  <input type="checkbox" checked={scan} onChange={(e) => setScan(e.target.checked)} />
                  <span>
                    <strong>Add a free gap scan</strong>
                    <span className="text-muted-sm"> Share files now and we’ll walk you through what we found on the call.</span>
                  </span>
                </label>
              ) : (
                <label className="check rq__toggle">
                  <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
                  <span>
                    <strong>Book a 30-minute call to walk through the results</strong>
                    <span className="text-muted-sm"> Recommended. You’ll pick a time on the next screen.</span>
                  </span>
                </label>
              )}

              {wantsScan && cfg && (
                <fieldset className="stack rq__scan">
                  <legend className="field__label">Files for the gap scan</legend>
                  <Uploader cfg={cfg} queue={queue} setQueue={setQueueState} disabled={!!busy} />
                  <div className="field">
                    <label htmlFor="rq-focus" className="field__label">
                      Anything we should focus on? <span className="field__optional">optional</span>
                    </label>
                    <textarea
                      id="rq-focus"
                      className="input input--area"
                      rows={2}
                      maxLength={4000}
                      placeholder="e.g. We have a design review in three weeks; is the trace matrix ready?"
                      value={focus}
                      onChange={(e) => setFocus(e.target.value)}
                    />
                  </div>
                  <label className="check">
                    <input type="checkbox" required checked={permission} onChange={(e) => setPermission(e.target.checked)} />
                    <span>I’m allowed to share these files with Biomedix for this review.</span>
                  </label>
                </fieldset>
              )}

              <div className="rq__hp" aria-hidden="true">
                <label htmlFor="rq-website">Website</label>
                <input id="rq-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>

              {error && (
                <p role="alert" className="auth__error">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" disabled={!!busy || !cfg}>
                {label}
              </Button>
              <p className="text-muted-sm rq__fine">
                We’ll only use your details to arrange the demo and send your report. No newsletters unless you ask.
              </p>
            </form>
          </section>
        </div>
      </main>
    </RequestLayout>
  );
}
