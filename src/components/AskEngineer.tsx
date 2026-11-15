/**
 * "Ask an engineer": the way to reach a person. A question becomes a thread
 * that Biomedix staff answer; the asker gets an email and sees the reply here.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from '../account/AccountContext';
import { helpApi, THREAD_LABEL, type Thread, type ThreadDetail } from '../help/api';
import { useIntake } from '../intake/IntakeContext';
import { timeAgo } from '../lib/audit';
import { Button, ButtonLink } from './Button';
import { Popover } from './Popover';
import '../styles/clean.css';

/** What the person is looking at, sent with the question so the engineer has context. */
export function usePageContext(): { context: string; label: string } {
  const { pathname } = useLocation();
  const { suite } = useIntake();
  const doc = /^\/app\/suite\/([^/]+)/.exec(pathname);
  if (doc) {
    const id = decodeURIComponent(doc[1]);
    const d = suite.docs.find((x) => x.proc.id === id);
    return { context: pathname, label: d ? `${d.proc.id} ${d.proc.title}` : id };
  }
  const NAMED: [RegExp, string][] = [
    [/^\/app\/assessments\/part11/, 'Part 11 assessment'],
    [/^\/app\/assessments\/risk/, 'Risk assessment'],
    [/^\/app\/assessments/, 'Assessments'],
    [/^\/app\/start/, 'Setup guide'],
    [/^\/app\/(form|setup)/, 'Questionnaire'],
    [/^\/app\/suite/, 'Documents'],
    [/^\/app\/readiness/, 'Readiness'],
    [/^\/app\/review/, 'Reviews'],
    [/^\/app\/publish/, 'Publish to SharePoint'],
  ];
  const hit = NAMED.find(([re]) => re.test(pathname));
  return { context: hit ? pathname : '', label: hit?.[1] ?? '' };
}

export function AskForm({
  onSent,
  rows = 3,
  id = 'ask-body',
  label = 'Your question',
}: {
  onSent?: (d: ThreadDetail) => void;
  rows?: number;
  id?: string;
  label?: string;
}) {
  const { org } = useAccount();
  const { projectId } = useIntake();
  const { context, label: contextLabel } = usePageContext();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!org || !body.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = await helpApi.ask(org.id, { body: body.trim(), context, contextLabel, projectId: projectId ?? undefined });
      setBody('');
      setMsg({ ok: true, text: 'Sent to a Biomedix engineer. You’ll get an email when they reply.' });
      onSent?.(d);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Couldn’t send your question.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack ask" onSubmit={send}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <textarea
        id={id}
        className="input input--area"
        rows={rows}
        maxLength={4000}
        value={body}
        placeholder="e.g. Does our device need a usability study before the 510(k)?"
        onChange={(e) => setBody(e.target.value)}
      />
      {contextLabel && <span className="text-muted-sm">The engineer will see you asked from: {contextLabel}</span>}
      <div className="button-row button-row--tight">
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : 'Ask an engineer'}
        </Button>
      </div>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'form-msg form-msg--ok' : 'form-msg form-msg--err'}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

/** Help button for the app header. */
export function HelpButton() {
  const { status, org } = useAccount();
  const { pathname } = useLocation();
  return (
    <Popover buttonClass="help-btn" ariaLabel="Ask an engineer" label={<>Ask an engineer</>}>
      {() => (
        <div className="stack help-pop">
          <strong className="help-pop__title">Ask a Biomedix engineer</strong>
          {status === 'signed-in' && org ? (
            <>
              <p className="text-muted-sm">A person reads every question. The agent drafts; engineers answer and review.</p>
              <AskForm id="ask-pop" />
              <Link to="/app/help" className="help-pop__all">
                Your questions and answers →
              </Link>
            </>
          ) : (
            <>
              <p className="text-muted-sm">
                {status === 'signed-in'
                  ? 'Create or join a company first, then you can send questions to an engineer.'
                  : 'Sign in to send a question to an engineer, or book a call and talk one through your device.'}
              </p>
              <div className="button-row button-row--tight">
                {status !== 'signed-in' && (
                  <ButtonLink to={`/sign-in?next=${encodeURIComponent(pathname)}`} size="sm">
                    Sign in
                  </ButtonLink>
                )}
                <ButtonLink to="/demo" variant="outline" size="sm">
                  Book a call
                </ButtonLink>
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

export function ThreadStatus({ t }: { t: Pick<Thread, 'status'> }) {
  return <span className={`status ${t.status === 'answered' ? 'status--ready' : t.status === 'open' ? 'status--input' : 'status--na'}`}>{THREAD_LABEL[t.status]}</span>;
}

/** One question with its replies, and a box to reply. Staff see the same view from their side. */
export function ThreadView({ id, staff = false, onChange }: { id: string; staff?: boolean; onChange?: (t: Thread) => void }) {
  const [data, setData] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (d: ThreadDetail) => {
      setData(d);
      setError(null);
      onChange?.(d.thread);
    },
    // onChange is a fresh function each render; only the thread id matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  useEffect(() => {
    let live = true;
    setData(null);
    helpApi
      .get(id)
      .then((d) => live && setData(d))
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [id]);

  const act = async (fn: () => Promise<ThreadDetail>) => {
    setBusy(true);
    try {
      apply(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !data)
    return (
      <p role="alert" className="notice notice--warn">
        {error}
      </p>
    );
  if (!data) return <p className="text-muted-sm">Loading…</p>;
  const t = data.thread;
  return (
    <div className="stack thread">
      <div className="thread__head">
        <div className="stack thread__title">
          <h2 className="card__title card__title--sm">{t.subject}</h2>
          <span className="text-muted-sm">
            {staff ? `${t.asker} · ${t.orgName}` : `Asked by ${t.asker}`}
            {t.contextLabel ? ` · from ${t.contextLabel}` : ''}
          </span>
        </div>
        <ThreadStatus t={t} />
      </div>
      <ol className="list-reset stack thread__msgs">
        {data.messages.map((m) => (
          <li key={m.id} className={`msg${m.staff ? ' msg--staff' : ''}`}>
            <span className="msg__who">
              {m.author}
              {m.staff ? ' · Biomedix engineer' : ''} <span className="msg__when">{timeAgo(m.createdAt)}</span>
            </span>
            <p className="msg__body">{m.body}</p>
          </li>
        ))}
      </ol>
      {t.status === 'closed' ? (
        <div className="button-row button-row--tight">
          <span className="text-muted-sm">This question is closed.</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => helpApi.setStatus(t.id, 'open'))}>
            Reopen
          </Button>
        </div>
      ) : (
        <form
          className="stack ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            void act(() => helpApi.reply(t.id, body.trim())).then(() => setBody(''));
          }}
        >
          <label htmlFor={`reply-${t.id}`} className="field__label">
            {staff ? 'Your answer' : 'Reply'}
          </label>
          <textarea id={`reply-${t.id}`} className="input input--area" rows={staff ? 5 : 3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="button-row button-row--tight">
            <Button type="submit" size="sm" disabled={busy || !body.trim()}>
              {staff ? 'Send answer' : 'Send reply'}
            </Button>
            <Button size="sm" variant="text" disabled={busy} onClick={() => void act(() => helpApi.setStatus(t.id, 'closed'))}>
              {staff ? 'Close without replying' : 'Mark as resolved'}
            </Button>
          </div>
          {error && (
            <p role="alert" className="form-msg form-msg--err">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

/** A list of questions; the selected one opens beside (or below) it. */
export function ThreadList({ threads, selected, onSelect, staff = false }: { threads: Thread[]; selected: string | null; onSelect: (id: string) => void; staff?: boolean }) {
  return (
    <ul className="list-reset stack thread-list">
      {threads.map((t) => (
        <li key={t.id}>
          <button type="button" className={`thread-row${selected === t.id ? ' thread-row--on' : ''}`} aria-current={selected === t.id ? 'true' : undefined} onClick={() => onSelect(t.id)}>
            <span className="stack thread-row__main">
              <span className="thread-row__subject">{t.subject}</span>
              <span className="text-muted-sm">
                {staff ? `${t.orgName} · ${t.asker}` : t.lastFromStaff ? `${t.answeredBy || 'Engineer'} replied` : `${t.asker} asked`} · {timeAgo(t.updatedAt)}
              </span>
            </span>
            <ThreadStatus t={t} />
          </button>
        </li>
      ))}
    </ul>
  );
}
