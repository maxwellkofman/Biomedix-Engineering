# Biomedix Engineering

Marketing site and product screens for Biomedix Engineering, an AI-native QMS with engineer sign-off.

## Run

Needs Node.js 22.18 or newer (the account server uses Node's built-in SQLite and runs TypeScript directly).

```bash
npm install
npm run dev
```

`npm run dev` serves the app and the account API together at http://localhost:5173. For production:

```bash
npm run build
npm start
```

`npm start` serves the built site and the API on `PORT` (default 3000). Data is stored in SQLite at `BIOMEDIX_DATA_DIR` (default `./data`); back up that folder. A static host (Netlify, Vercel static) can serve the app without the API: everything works except accounts, and answers stay in the browser.

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
| `/app/readiness` | Compliance readiness: score, four checks per procedure, next steps, agent proposals, requirements matrix |
| `/app/history` | Run history: every saved run, the answers it changed and the documents it revised (account) |
| `/app/suite/:docId/history` | Revision history of one document: every draft, its sign-offs, and line-by-line changes (account) |
| `/app/projects` | Projects: one per device, with readiness, runs and import of answers made before signing in (account) |
| `/app/account` | Profile, password, sign out, delete account (account) |
| `/sign-in`, `/sign-up` | Account sign-in and sign-up |

## Documentation flow

1. **Questions** live in one bank, `src/intake/questions.ts`, rendered both as the single-page form (`QuestionForm.tsx`) and the guided steps (`Setup.tsx`). Answers go into `Intake` (`src/intake/model.ts`). Answers persist in `localStorage`. The agent reads the free-text description for hints (software, hardware, connectivity, AI) and can draft the intended use statement.
2. **Derive** (`src/intake/derive.ts`) works out the gate zero determinations — design controls, 524B cyber device, IEC 62304 safety class, FDA documentation level, PCCP — and resolves every template token, with fallbacks (e.g. the CEO as management representative) marked as *derived* so the customer confirms them.
3. **Generate** (`src/templates/generate.ts`) decides which procedures apply (with a written justification for each one that doesn't, fed into QM-001), renders each section from `src/templates/content.ts`, and tracks which tokens are filled or missing.
4. **Review**: filled values are highlighted, derived values dashed, missing ones link straight to the setup field. Documents export as Markdown or print to PDF, and *Submit for technical review* puts them in the review queue.

5. **Publish** (`src/export/`): `structure.ts` lays out the SharePoint library from the answers (only folders the device needs); `docx.ts` writes each procedure as a Word draft; `package.ts` builds the ZIP, master document list, README and PnP PowerShell script; `sharepoint.ts` creates the library, columns, folders and files through Microsoft Graph, never overwriting existing files.

## Accounts, runs and drafts

- **Accounts** (`server/`): email and password (scrypt-hashed, 12 characters minimum), sessions in an HttpOnly, SameSite=Lax cookie (only a SHA-256 of the token is stored), sign-in rate limiting, and cross-site request checks on every change. Changing the password signs out other devices.
- **Projects**: one per device. Answers autosave as you type. On first sign-up, answers already entered in the browser become the first project; later sign-ins offer to import them.
- **Runs**: each *Create documentation* saves a run, which stores a snapshot of the answers and a new **draft** of every document whose text changed (Rev A, draft 1, 2, 3…). Unchanged documents keep their draft. Runs, drafts and sign-offs are append-only, and each draft stores a SHA-256 of its text.
- **Sign-off**: a saved draft is submitted for technical review, then signed or returned with comments in the review queue, and then approved, with the approver, signature method and reference recorded. Approval records who approved which draft; the signature itself stays in the customer's e-signature system. A new draft needs review again. In this build the account owner can sign reviews from the queue to demonstrate the flow; separate Biomedix reviewer accounts are not built yet.

## Compliance readiness

`src/compliance/readiness.ts` scores each required procedure on four checks, a quarter each: values filled, agent proposals confirmed, technical review signed on the current text, and approved on the current text. Readiness is the average across required procedures, rounded down, so 100% means every procedure the device needs is approved as it stands. The requirements matrix (`src/compliance/requirements.ts`) maps ISO 13485, FDA and standards requirements to the procedures that meet them, following each procedure's basis in the library. It covers what the library addresses; it is not a full clause-by-clause gap assessment.

## SharePoint sign-in

"Create it in SharePoint for me" needs a Microsoft Entra ID app registration:

- Platform: Single-page application, redirect URI `https://<your-host>/redirect.html`
- Microsoft Graph delegated permissions: `Sites.Manage.All`, `Sites.ReadWrite.All` (some tenants require admin consent)
- Put the client ID in `.env` as `VITE_M365_CLIENT_ID` (see `.env.example`), or paste it on the Publish page

Microsoft doesn't let apps switch on minor versions or required check-out, so the Publish page links to the library settings for that last step. The PowerShell script does set both.

To tailor another section, add a body for it in `src/templates/content.ts` using `{{token}}` slots from `TOKENS` in `derive.ts`; sections without a body get a generic scoped draft.

## Structure

- `src/styles/tokens.css` holds the design tokens (colors, fonts, radii); `global.css` holds the shared primitives (buttons, cards, pills, badges, grid); `home.css` and `app.css` hold the page styles.
- `src/components/` contains the shared pieces: `Logo`, `Button` / `ButtonLink`, `AppShell` (product header and nav), `Icon`, `SignoffPanel` and `Lifecycle`.
- `src/account/` holds the API client and sign-in state; `src/intake/IntakeContext.tsx` holds the working answers and syncs them to the active project.
- `server/` holds the account API (`api.ts`), sign-in (`auth.ts`), storage (`db.ts`) and the production server (`start.ts`).
- `src/data/` contains the review queue items and the procedure library content.
- Text in square brackets (`[YOUR PRICE]`, `[Company]`, `[Reviewer name]`) is a placeholder waiting for real content.
