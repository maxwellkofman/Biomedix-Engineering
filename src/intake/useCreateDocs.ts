import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIntake } from './IntakeContext';

/**
 * "Create documentation": signed in, this saves a run (new drafts for every
 * document that changed) before opening the suite; signed out, it just opens it.
 */
export function useCreateDocs() {
  const { mode, createRun } = useIntake();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (busy) return;
    setError(null);
    if (mode !== 'account') return navigate('/app/suite?created=1');
    setBusy(true);
    try {
      const run = await createRun();
      navigate(`/app/suite?created=1&run=${run.number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this run.');
    } finally {
      setBusy(false);
    }
  };
  return { create, busy, error };
}
