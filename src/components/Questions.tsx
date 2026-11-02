import { useMemo, type ReactNode } from 'react';
import { useIntake } from '../intake/IntakeContext';
import { detectFromDescription, draftIntendedUse, type TokenKey } from '../intake/derive';
import type { Intake, IntakeSection } from '../intake/model';
import { answerOf, fieldId, tokensFor, type Question, type QuestionCtx, type QuestionGroup } from '../intake/questions';
import { Button } from './Button';
import { ChoiceField, TextField } from './Field';

function useCtx(): QuestionCtx {
  const { intake, derived, tokens } = useIntake();
  return { ix: intake, d: derived, tokens };
}

/** Which applicable documents use each token, for the "Fills" line on the form. */
function useFillsIndex() {
  const { suite } = useIntake();
  return useMemo(() => {
    const map = new Map<TokenKey, string[]>();
    suite.applicable.forEach((doc) => doc.used.forEach((k) => map.set(k, [...(map.get(k) ?? []), doc.proc.id])));
    return map;
  }, [suite]);
}

function Fills({ q }: { q: Question }) {
  const index = useFillsIndex();
  const ids = [...new Set(tokensFor(q).flatMap((k) => index.get(k) ?? []))];
  if (!ids.length) return null;
  const shown = ids.slice(0, 4).join(', ');
  return (
    <span className="fills">
      Fills {ids.length} document{ids.length > 1 ? 's' : ''}: {shown}
      {ids.length > 4 ? ` +${ids.length - 4} more` : ''}
    </span>
  );
}

function QuestionInput({ q, showFills }: { q: Question; showFills?: boolean }) {
  const { intake, update } = useIntake();
  const ctx = useCtx();
  const id = fieldId(q);
  const value = answerOf(intake, q);
  const onChange = (v: string) => update(q.section, { [q.key]: v } as Partial<Intake[IntakeSection]>);
  const hintText = typeof q.hint === 'function' ? q.hint(ctx) : q.hint;
  const hint: ReactNode =
    hintText || showFills ? (
      <>
        {hintText}
        {hintText && showFills ? ' ' : null}
        {showFills && <Fills q={q} />}
      </>
    ) : undefined;

  if (q.kind === 'choice') {
    return <ChoiceField id={id} label={q.label} value={value} options={q.options ?? []} onChange={onChange} hint={hint} />;
  }
  return (
    <TextField
      id={id}
      label={q.label}
      value={value}
      onChange={onChange}
      placeholder={q.placeholder}
      rows={q.kind === 'textarea' ? (q.rows ?? 3) : undefined}
      type={q.kind === 'date' ? 'date' : 'text'}
      hint={hint}
      action={
        q.action === 'draftIntendedUse' ? (
          <Button
            variant="text"
            size="sm"
            className="field__action"
            onClick={() => update('device', { intendedUse: draftIntendedUse(intake) })}
          >
            Draft from my answers
          </Button>
        ) : undefined
      }
    />
  );
}

/** Renders one group's visible questions, pairing consecutive half-width ones into a row. */
export function QuestionGroupCard({ group, showFills }: { group: QuestionGroup; showFills?: boolean }) {
  const ctx = useCtx();
  const visible = group.questions.filter((q) => !q.showIf || q.showIf(ctx));
  if (!visible.length) return null;

  const rows: Question[][] = [];
  for (let i = 0; i < visible.length; i++) {
    const q = visible[i];
    const next = visible[i + 1];
    if (q.half && next?.half) {
      rows.push([q, next]);
      i++;
    } else rows.push([q]);
  }

  return (
    <section className="card card--compact form-group">
      <h3 className="form-group__title">{group.title}</h3>
      {group.note && (
        <p className="form-group__note">
          {group.note.text}
          {group.note.link && (
            <>
              <a href={group.note.link.href} target="_blank" rel="noreferrer">
                {group.note.link.label}
              </a>
              {group.note.link.after}
            </>
          )}
        </p>
      )}
      {rows.map((row) =>
        row.length === 2 ? (
          <div key={fieldId(row[0])} className="field-row">
            <QuestionInput q={row[0]} showFills={showFills} />
            <QuestionInput q={row[1]} showFills={showFills} />
          </div>
        ) : (
          <QuestionInput key={fieldId(row[0])} q={row[0]} showFills={showFills} />
        ),
      )}
      {group.detections && <Detections />}
    </section>
  );
}

/** Suggestions the agent read from the free-text description. */
export function Detections() {
  const { intake, update } = useIntake();
  const found = detectFromDescription(intake.device.description).filter((d) => !intake.tech[d.field]);
  if (!found.length) return null;
  return (
    <div className="detect" role="status">
      <div className="stack detect__text">
        <span className="detect__title">The agent read your description</span>
        <span className="detect__list">
          {found.map((d) => (
            <span key={d.field} className="pill pill--mint">
              {d.label} · “{d.evidence}”
            </span>
          ))}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => update('tech', Object.fromEntries(found.map((d) => [d.field, 'yes'])))}
      >
        Apply to technology answers
      </Button>
    </div>
  );
}
