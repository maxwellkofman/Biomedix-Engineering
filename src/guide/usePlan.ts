import { useMemo } from 'react';
import { useIntake } from '../intake/IntakeContext';
import { buildPlan } from './plan';
import { openQuestions } from './questions';

export function usePlan() {
  const { intake, derived, tokens, suite, readiness, mode, readOnly, canApprove } = useIntake();
  return useMemo(
    () =>
      buildPlan(intake, suite, readiness, {
        signedIn: mode === 'account',
        canEdit: !readOnly,
        canApprove,
        questionsLeft: openQuestions({ ix: intake, d: derived, tokens }, suite).length,
      }),
    [intake, derived, tokens, suite, readiness, mode, readOnly, canApprove],
  );
}
