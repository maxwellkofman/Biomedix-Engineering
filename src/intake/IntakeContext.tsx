import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildSuite, type Suite } from '../templates/generate';
import { derive, resolveTokens, type Derived, type TokenValues } from './derive';
import { EMPTY_INTAKE, EXAMPLE_INTAKE, type Intake, type IntakeSection } from './model';

const STORAGE_KEY = 'biomedix.intake.v1';

interface Stored {
  intake: Intake;
  /** Document ids the customer sent for Biomedix technical review, newest first. */
  submitted: { id: string; at: string }[];
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>;
      // Merge section by section so new fields added later get their defaults.
      const intake = { ...EMPTY_INTAKE } as Intake;
      for (const k of Object.keys(EMPTY_INTAKE) as IntakeSection[]) {
        Object.assign(intake, { [k]: { ...EMPTY_INTAKE[k], ...(parsed.intake?.[k] ?? {}) } });
      }
      return { intake, submitted: parsed.submitted ?? [] };
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return { intake: EMPTY_INTAKE, submitted: [] };
}

interface IntakeContextValue {
  intake: Intake;
  derived: Derived;
  tokens: TokenValues;
  suite: Suite;
  started: boolean;
  submitted: Stored['submitted'];
  update: <S extends IntakeSection>(section: S, patch: Partial<Intake[S]>) => void;
  loadExample: () => void;
  reset: () => void;
  submitForReview: (docId: string) => void;
}

const IntakeContext = createContext<IntakeContextValue | null>(null);

export function IntakeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore: the flow still works for this visit */
    }
  }, [state]);

  const update = useCallback(<S extends IntakeSection>(section: S, patch: Partial<Intake[S]>) => {
    setState((s) => ({ ...s, intake: { ...s.intake, [section]: { ...s.intake[section], ...patch } } }));
  }, []);
  const loadExample = useCallback(() => setState((s) => ({ ...s, intake: EXAMPLE_INTAKE })), []);
  const reset = useCallback(() => setState({ intake: EMPTY_INTAKE, submitted: [] }), []);
  const submitForReview = useCallback((docId: string) => {
    setState((s) => ({
      ...s,
      submitted: [{ id: docId, at: new Date().toISOString() }, ...s.submitted.filter((x) => x.id !== docId)],
    }));
  }, []);

  const value = useMemo<IntakeContextValue>(() => {
    const derived = derive(state.intake);
    const tokens = resolveTokens(state.intake, derived);
    const started = JSON.stringify(state.intake) !== JSON.stringify(EMPTY_INTAKE);
    return {
      intake: state.intake,
      derived,
      tokens,
      suite: buildSuite(state.intake, derived, tokens),
      started,
      submitted: state.submitted,
      update,
      loadExample,
      reset,
      submitForReview,
    };
  }, [state, update, loadExample, reset, submitForReview]);

  return <IntakeContext.Provider value={value}>{children}</IntakeContext.Provider>;
}

export function useIntake() {
  const ctx = useContext(IntakeContext);
  if (!ctx) throw new Error('useIntake must be used inside <IntakeProvider>');
  return ctx;
}
