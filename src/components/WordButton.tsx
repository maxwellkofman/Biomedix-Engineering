import { useState } from 'react';
import { useIntake } from '../intake/IntakeContext';
import type { GeneratedDoc } from '../templates/generate';
import { Button, type ButtonSize, type ButtonVariant } from './Button';

/** Generates the tailored procedure as a Word document and downloads it. */
export function WordButton({
  doc,
  variant = 'outline',
  size = 'md',
  label = 'Word (.docx)',
}: {
  doc: GeneratedDoc;
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
}) {
  const { tokens } = useIntake();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const [{ docToDocx }, { downloadBlob }, { docFileName }] = await Promise.all([
            import('../export/docx'),
            import('../export/package'),
            import('../export/structure'),
          ]);
          downloadBlob(docFileName(doc), await docToDocx(doc, tokens));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Preparing…' : label}
    </Button>
  );
}
