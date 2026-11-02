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
| `/app/form` | QMS questionnaire: every question on one page, each showing the documents it fills |
| `/app/setup/:step` | Guided setup: the same questions in seven steps |
| `/app/suite` | Documentation suite: every required procedure, auto-filled from setup |
| `/app/suite/:docId` | One tailored procedure, with Word/Markdown export and submit-for-review |
| `/app/publish` | Publish to SharePoint: library preview, direct upload, ZIP download, PowerShell script |

## Documentation flow

1. **Questions** live in one bank, `src/intake/questions.ts`, rendered both as the single-page form (`QuestionForm.tsx`) and the guided steps (`Setup.tsx`). Answers go into `Intake` (`src/intake/model.ts`). Answers persist in `localStorage`. The agent reads the free-text description for hints (software, hardware, connectivity, AI) and can draft the intended use statement.
2. **Derive** (`src/intake/derive.ts`) works out the gate zero determinations — design controls, 524B cyber device, IEC 62304 safety class, FDA documentation level, PCCP — and resolves every template token, with fallbacks (e.g. the CEO as management representative) marked as *derived* so the customer confirms them.
3. **Generate** (`src/templates/generate.ts`) decides which procedures apply (with a written justification for each one that doesn't, fed into QM-001), renders each section from `src/templates/content.ts`, and tracks which tokens are filled or missing.
4. **Review**: filled values are highlighted, derived values dashed, missing ones link straight to the setup field. Documents export as Markdown or print to PDF, and *Submit for technical review* puts them in the review queue.

5. **Publish** (`src/export/`): `structure.ts` lays out the SharePoint library from the answers (only folders the device needs); `docx.ts` writes each procedure as a Word draft; `package.ts` builds the ZIP, master document list, README and PnP PowerShell script; `sharepoint.ts` creates the library, columns, folders and files through Microsoft Graph, never overwriting existing files.

## SharePoint sign-in

"Create it in SharePoint for me" needs a Microsoft Entra ID app registration:

- Platform: Single-page application, redirect URI `https://<your-host>/redirect.html`
- Microsoft Graph delegated permissions: `Sites.Manage.All`, `Sites.ReadWrite.All` (some tenants require admin consent)
- Put the client ID in `.env` as `VITE_M365_CLIENT_ID` (see `.env.example`), or paste it on the Publish page

Microsoft doesn't let apps switch on minor versions or required check-out, so the Publish page links to the library settings for that last step. The PowerShell script does set both.

To tailor another section, add a body for it in `src/templates/content.ts` using `{{token}}` slots from `TOKENS` in `derive.ts`; sections without a body get a generic scoped draft.

## Structure

- `src/styles/tokens.css` holds the design tokens (colors, fonts, radii); `global.css` holds the shared primitives (buttons, cards, pills, badges, grid); `home.css` and `app.css` hold the page styles.
- `src/components/` contains the shared pieces: `Logo`, `Button` / `ButtonLink`, `AppShell` (product header and nav), and `Icon`.
- `src/data/` contains the review queue items and the procedure library content.
- Text in square brackets (`[YOUR PRICE]`, `[Company]`, `[Reviewer name]`) is a placeholder waiting for real content.
