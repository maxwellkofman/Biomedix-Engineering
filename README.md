# Biomedix Engineering

Marketing site and product screens for Biomedix Engineering, an AI-native QMS with engineer sign-off.

## Run

```bash
npm install
npm run dev
```

## Routes

| Path | Screen |
| --- | --- |
| `/` | Landing page |
| `/app/review` | Review queue (agent outputs waiting on a person) |
| `/app/procedures` | Procedure library |
| `/app/setup/:step` | Setup wizard: company, device, technology, regulatory, operations, team |
| `/app/suite` | Documentation suite: every required procedure, auto-filled from setup |
| `/app/suite/:docId` | One tailored procedure, with export and submit-for-review |

## Documentation flow

1. **Setup** (`src/pages/Setup.tsx`) collects answers into `Intake` (`src/intake/model.ts`). Answers persist in `localStorage`. The agent reads the free-text description for hints (software, hardware, connectivity, AI) and can draft the intended use statement.
2. **Derive** (`src/intake/derive.ts`) works out the gate zero determinations — design controls, 524B cyber device, IEC 62304 safety class, FDA documentation level, PCCP — and resolves every template token, with fallbacks (e.g. the CEO as management representative) marked as *derived* so the customer confirms them.
3. **Generate** (`src/templates/generate.ts`) decides which procedures apply (with a written justification for each one that doesn't, fed into QM-001), renders each section from `src/templates/content.ts`, and tracks which tokens are filled or missing.
4. **Review**: filled values are highlighted, derived values dashed, missing ones link straight to the setup field. Documents export as Markdown or print to PDF, and *Submit for technical review* puts them in the review queue.

To tailor another section, add a body for it in `src/templates/content.ts` using `{{token}}` slots from `TOKENS` in `derive.ts`; sections without a body get a generic scoped draft.

## Structure

- `src/styles/tokens.css` holds the design tokens (colors, fonts, radii); `global.css` holds the shared primitives (buttons, cards, pills, badges, grid); `home.css` and `app.css` hold the page styles.
- `src/components/` contains the shared pieces: `Logo`, `Button` / `ButtonLink`, `AppShell` (product header and nav), and `Icon`.
- `src/data/` contains the review queue items and the procedure library content.
- Text in square brackets (`[YOUR PRICE]`, `[Company]`, `[Reviewer name]`) is a placeholder waiting for real content.
