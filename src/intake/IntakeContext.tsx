/**
 * The customer's working set: answers, confirmations and the documentation
 * generated from them.
 *
 * Signed out, answers stay in this browser (localStorage). Signed in, they
 * belong to a project in the account: edits autosave, each "Create
 * documentation" saves a run, and every changed document gets a new draft
 * that can go through technical review and approval.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAccount } from '../account/AccountContext';
import { api, ApiError, type Confirmed, type DraftMeta, type ProjectPayload, type Run, type Signoff, type SignoffKind } from '../account/api';
import { computeReadiness, lifecycle, type DocLifecycle, type Readiness } from '../compliance/readiness';
import { contentHash } from '../lib/hash';
import { docHref, missingHref } from '../lib/links';
import { buildSuite, docToMarkdown, type Suite } from '../templates/generate';
import { derive, resolveTokens, type Derived, type TokenKey, type TokenValues } from './derive';
import { EMPTY_INTAKE, EXAMPLE_INTAKE, type Intake, type IntakeSection } from './model';

const GUEST_KEY = 'biomedix.intake.v1';
const activeKey = (userId: string) => `biomedix.project.${userId}`;

/** Fill in any fields missing from stored answers, so fields added later get their defaults. */
export function mergeIntake(partial: Partial<Intake> | undefined): Intake {
  const intake = { ...EMPTY_INTAKE } as Intake;
  for (const k of Object.keys(EMPTY_INTAKE) as IntakeSection[]) {
    Object.assign(intake, { [k]: { ...EMPTY_INTAKE[k], ...(partial?.[k] ?? {}) } });
  }
  return intake;
}

export const isStarted = (ix: Intake) => JSON.stringify(ix) !== JSON.stringify(EMPTY_INTAKE);

/** Where the working answers came from: this browser, or a project id. */
interface Working {
  source: string;
  intake: Intake;
  confirmed: Confirmed;
}

function loadGuest(): Working {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { intake?: Partial<Intake>; confirmed?: Confirmed };
      return { source: 'guest', intake: mergeIntake(parsed.intake), confirmed: parsed.confirmed ?? {} };
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return { source: 'guest', intake: EMPTY_INTAKE, confirmed: {} };
}

function saveGuest(w: Working) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ intake: w.intake, confirmed: w.confirmed }));
  } catch {
    /* ignore: the flow still works for this visit */
  }
}

function clearGuest() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    /* ignore */
  }
}

function remember(userId: string, projectId: string) {
  try {
    localStorage.setItem(activeKey(userId), projectId);
  } catch {
    /* ignore */
  }
}

function recall(userId: string): string | null {
  try {
    return localStorage.getItem(activeKey(userId));
  } catch {
    return null;
  }
}

interface Remote {
  id: string;
  drafts: Record<string, DraftMeta>;
  signoffs: Signoff[];
  runs: Run[];
}

export type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export interface SignoffExtra {
  note?: string;
  signer?: string;
  method?: string;
  reference?: string;
}

interface IntakeContextValue {
  intake: Intake;
  derived: Derived;
  tokens: TokenValues;
  suite: Suite;
  started: boolean;
  update: <S extends IntakeSection>(section: S, patch: Partial<Intake[S]>) => void;
  loadExample: () => void;
  reset: () => void;

  /** False while the account's project is loading. */
  ready: boolean;
  mode: 'guest' | 'account';
  projectId: string | null;
  loadError: string | null;
  saveState: SaveState;
  runs: Run[];
  signoffs: Signoff[];
  /** Per applicable document: its saved drafts and sign-offs relative to the current content. */
  lives: Record<string, DocLifecycle>;
  markdown: Record<string, string>;
  readiness: Readiness;
  confirmed: Confirmed;
  confirm: (keys: TokenKey[]) => void;
  unconfirm: (key: TokenKey) => void;
  createRun: (note?: string) => Promise<Run>;
  signoff: (docId: string, kind: SignoffKind, extra?: SignoffExtra) => Promise<void>;
  submitReady: () => Promise<number>;
  openProject: (id: string) => Promise<void>;
  newProject: (from?: 'blank' | 'guest') => Promise<string>;
  /** Answers left in this browser from before sign-in, not yet saved to a project. */
  guestDraft: Intake | null;
  discardGuest: () => void;
  retry: () => void;
}

const IntakeContext = createContext<IntakeContextValue | null>(null);

export function IntakeProvider({ children }: { children: ReactNode }) {
  const { status, user, expired } = useAccount();
  const [working, setWorking] = useState<Working>(loadGuest);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guestDraft, setGuestDraft] = useState<Intake | null>(null);
  const [attempt, setAttempt] = useState(0);

  const mode = status === 'signed-in' ? 'account' : 'guest';
  const userId = user?.id ?? null;
  const dirty = useRef(false);
  const editSeq = useRef(0);
  const workingRef = useRef(working);
  workingRef.current = working;
  const projectRef = useRef<string | null>(null);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) expired();
    },
    [expired],
  );

  const apply = useCallback(
    (p: ProjectPayload) => {
      const id = p.project.id;
      projectRef.current = id;
      dirty.current = false;
      if (userId) remember(userId, id);
      setWorking({ source: id, intake: mergeIntake(p.project.intake), confirmed: p.project.confirmed ?? {} });
      setRemote({ id, drafts: p.drafts, signoffs: p.signoffs, runs: p.runs });
      setSaveState('saved');
      setLoadError(null);
      setReady(true);
    },
    [userId],
  );

  /* ---------- Load whatever the account status calls for ---------- */
  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'signed-in' || !userId) {
      projectRef.current = null;
      dirty.current = false;
      setRemote(null);
      setGuestDraft(null);
      setWorking(loadGuest());
      setSaveState('idle');
      setLoadError(null);
      setReady(true);
      return;
    }
    let live = true;
    setReady(false);
    (async () => {
      try {
        const { projects } = await api.projects();
        const guest = loadGuest();
        const guestStarted = isStarted(guest.intake);
        let id = recall(userId);
        if (!projects.some((p) => p.id === id)) id = projects[0]?.id ?? null;
        let payload: ProjectPayload;
        if (!id) {
          // First sign-in: the answers from this browser become the first project.
          payload = await api.createProject(guestStarted ? { intake: guest.intake, confirmed: guest.confirmed } : {});
          if (guestStarted) clearGuest();
        } else {
          payload = await api.project(id);
        }
        if (!live) return;
        apply(payload);
        setGuestDraft(id && guestStarted ? guest.intake : null);
      } catch (err) {
        if (!live) return;
        fail(err);
        projectRef.current = null;
        setWorking({ source: 'none', intake: EMPTY_INTAKE, confirmed: {} });
        setLoadError(err instanceof Error ? err.message : 'Could not load your project.');
        setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [status, userId, apply, fail, attempt]);

  /* ---------- Persist ---------- */
  useEffect(() => {
    if (working.source === 'guest' && mode === 'guest' && ready) saveGuest(working);
  }, [working, mode, ready]);

  const computedRef = useRef<{ readiness: Readiness; suite: Suite; markdown: Record<string, string>; lives: Record<string, DocLifecycle>; tokens: TokenValues } | null>(null);

  const flush = useCallback(
    async (keepalive = false) => {
      const id = projectRef.current;
      const w = workingRef.current;
      if (!id || !dirty.current || w.source !== id) return;
      const seq = editSeq.current;
      setSaveState('saving');
      try {
        await api.saveProject(
          id,
          { intake: w.intake, confirmed: w.confirmed, readiness: computedRef.current?.readiness.pct ?? 0 },
          keepalive,
        );
        if (editSeq.current === seq) {
          dirty.current = false;
          setSaveState('saved');
        }
      } catch (err) {
        fail(err);
        setSaveState('error');
      }
    },
    [fail],
  );

  useEffect(() => {
    if (mode !== 'account' || !dirty.current || working.source !== projectRef.current) return;
    setSaveState('unsaved');
    const t = setTimeout(() => void flush(), 800);
    return () => clearTimeout(t);
  }, [working, mode, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush(true);
    };
    const onUnload = () => void flush(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [flush]);

  /* ---------- Edits ---------- */
  const edit = useCallback((fn: (w: Working) => Working) => {
    dirty.current = true;
    editSeq.current++;
    setWorking(fn);
  }, []);

  const update = useCallback(
    <S extends IntakeSection>(section: S, patch: Partial<Intake[S]>) =>
      edit((w) => ({ ...w, intake: { ...w.intake, [section]: { ...w.intake[section], ...patch } } })),
    [edit],
  );
  const loadExample = useCallback(() => edit((w) => ({ ...w, intake: EXAMPLE_INTAKE })), [edit]);
  const reset = useCallback(() => edit((w) => ({ ...w, intake: EMPTY_INTAKE, confirmed: {} })), [edit]);
  const confirm = useCallback(
    (keys: TokenKey[]) =>
      edit((w) => {
        const tokens = computedRef.current?.tokens ?? {};
        const add = Object.fromEntries(keys.flatMap((k) => (tokens[k] ? [[k, tokens[k]!.value]] : [])));
        return { ...w, confirmed: { ...w.confirmed, ...add } };
      }),
    [edit],
  );
  const unconfirm = useCallback(
    (key: TokenKey) =>
      edit((w) => {
        const next = { ...w.confirmed };
        delete next[key];
        return { ...w, confirmed: next };
      }),
    [edit],
  );

  /* ---------- Derived state ---------- */
  const computed = useMemo(() => {
    const derived = derive(working.intake);
    const raw = resolveTokens(working.intake, derived);
    const tokens: TokenValues = {};
    for (const k of Object.keys(raw) as TokenKey[]) {
      const v = raw[k]!;
      tokens[k] = v.auto && working.confirmed[k] === v.value ? { ...v, confirmed: true } : v;
    }
    const suite = buildSuite(working.intake, derived, tokens);
    const markdown: Record<string, string> = {};
    const lives: Record<string, DocLifecycle> = {};
    for (const d of suite.applicable) {
      const id = d.proc.id;
      markdown[id] = docToMarkdown(d, tokens);
      lives[id] = lifecycle(contentHash(markdown[id]), remote?.drafts[id], remote?.signoffs ?? [], id);
    }
    const readiness = computeReadiness(suite, tokens, lives, { signedIn: mode === 'account', docHref, missingHref });
    return { derived, tokens, suite, markdown, lives, readiness };
  }, [working, remote, mode]);
  computedRef.current = computed;

  /* ---------- Runs and sign-offs ---------- */
  const createRun = useCallback(
    async (note?: string) => {
      const id = projectRef.current;
      if (!id) throw new Error('Sign in to save runs.');
      const w = workingRef.current;
      const c = computedRef.current!;
      const seq = editSeq.current;
      const docs = c.suite.applicable.map((d) => ({
        id: d.proc.id,
        title: d.proc.title,
        markdown: c.markdown[d.proc.id],
        filledPct: d.filledPct,
      }));
      try {
        const { run, drafts } = await api.createRun(id, {
          intake: w.intake,
          confirmed: w.confirmed,
          readiness: c.readiness.pct,
          note,
          docs,
        });
        if (editSeq.current === seq) {
          dirty.current = false;
          setSaveState('saved');
        }
        setRemote((r) => (r && r.id === id ? { ...r, drafts, runs: [run, ...r.runs] } : r));
        return run;
      } catch (err) {
        fail(err);
        throw err;
      }
    },
    [fail],
  );

  const signoff = useCallback(
    async (docId: string, kind: SignoffKind, extra: SignoffExtra = {}) => {
      const id = projectRef.current;
      if (!id) throw new Error('Sign in to send documents for sign-off.');
      const life = computedRef.current?.lives[docId];
      if (!life?.latest) throw new Error('Save a run first: this document has no saved draft.');
      if (life.changed && (kind === 'submit' || kind === 'approve'))
        throw new Error('This document changed since its last saved draft. Save a run first.');
      try {
        const { signoffs } = await api.signoff(id, { docId, draft: life.latest.draft, kind, ...extra });
        setRemote((r) => (r && r.id === id ? { ...r, signoffs } : r));
      } catch (err) {
        fail(err);
        throw err;
      }
    },
    [fail],
  );

  const submitReady = useCallback(async () => {
    const docs = computedRef.current?.readiness.docs ?? [];
    const ready = docs.filter(
      (d) => d.complete && !d.life.changed && (d.life.stage === 'draft' || d.life.stage === 'returned'),
    );
    for (const d of ready) await signoff(d.doc.proc.id, 'submit');
    return ready.length;
  }, [signoff]);

  const openProject = useCallback(
    async (pid: string) => {
      await flush();
      setReady(false);
      try {
        apply(await api.project(pid));
      } catch (err) {
        fail(err);
        setReady(true);
        throw err;
      }
    },
    [apply, flush, fail],
  );

  const newProject = useCallback(
    async (from: 'blank' | 'guest' = 'blank') => {
      await flush();
      const guest = from === 'guest' ? loadGuest() : null;
      const payload = await api.createProject(guest ? { intake: guest.intake, confirmed: guest.confirmed } : {});
      if (guest) {
        clearGuest();
        setGuestDraft(null);
      }
      apply(payload);
      return payload.project.id;
    },
    [apply, flush],
  );

  const discardGuest = useCallback(() => {
    clearGuest();
    setGuestDraft(null);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo<IntakeContextValue>(
    () => ({
      intake: working.intake,
      ...computed,
      started: isStarted(working.intake),
      update,
      loadExample,
      reset,
      ready: ready && status !== 'loading',
      mode,
      projectId: remote?.id ?? null,
      loadError,
      saveState,
      runs: remote?.runs ?? [],
      signoffs: remote?.signoffs ?? [],
      confirmed: working.confirmed,
      confirm,
      unconfirm,
      createRun,
      signoff,
      submitReady,
      openProject,
      newProject,
      guestDraft,
      discardGuest,
      retry,
    }),
    [
      working,
      computed,
      update,
      loadExample,
      reset,
      ready,
      status,
      mode,
      remote,
      loadError,
      saveState,
      confirm,
      unconfirm,
      createRun,
      signoff,
      submitReady,
      openProject,
      newProject,
      guestDraft,
      discardGuest,
      retry,
    ],
  );

  return <IntakeContext.Provider value={value}>{children}</IntakeContext.Provider>;
}

export function useIntake() {
  const ctx = useContext(IntakeContext);
  if (!ctx) throw new Error('useIntake must be used inside <IntakeProvider>');
  return ctx;
}
