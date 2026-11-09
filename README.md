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

`npm start` serves the built site and the API on `PORT` (default 3000). Data is stored in SQLite at `BIOMEDIX_DATA_DIR` (default `./data`); back up that folder, including `secret.key`, which encrypts two-factor secrets. A static host (Netlify, Vercel static) can serve the app without the API: everything works except accounts, and answers stay in the browser.

Production settings:

| Variable | What it does |
| --- | --- |
| `BIOMEDIX_APP_URL` | The public `https://` address. Links in emails use it; without it they use the request's Host header. |
| `BIOMEDIX_MAIL_WEBHOOK` | URL that receives every email as JSON `{to, subject, text, html}`: your email provider's API, or a Power Automate / Zapier flow. Without it, emails aren't delivered. |
| `BIOMEDIX_MAIL_WEBHOOK_TOKEN` | Sent as `Authorization: Bearer …` to the webhook, if set. |
| `BIOMEDIX_ADMIN_EMAIL` | This address becomes the first Biomedix admin once it signs up and confirms its email. |
| `BIOMEDIX_SECRET_KEY` | 64 hex characters to encrypt two-factor secrets, instead of `data/secret.key`. |
| `BIOMEDIX_STAFF_MFA` | `required` (default in production) or `optional`: whether Biomedix staff need two-factor. |
| `BIOMEDIX_DEV` | `1` turns on the dev mailbox in production builds; `0` turns it off in `npm run dev`. |
| `BIOMEDIX_BOOKING_URL` | Your scheduling page (`https://`), e.g. a Calendly event or Microsoft Bookings page. Shown after someone asks for a demo. Calendly pages are embedded with the person's name and email filled in, and a booking moves the request to *Demo booked*. Without it, people are told you'll email times. |
| `BIOMEDIX_SALES_EMAIL` | Who hears about new demo requests and gap scans (comma-separated). Default: every Biomedix staff account, then `BIOMEDIX_ADMIN_EMAIL`. |
| `BIOMEDIX_SCAN_HOURS` | Gap scan turnaround promised to requesters (default 48). |
| `BIOMEDIX_SCAN_RETENTION_DAYS` | Days after a gap scan report is sent before the uploaded files are deleted (default 30). |

Staff roles can also be set from the command line where the database lives:

```bash
npm run staff -- grant someone@biomedix.example reviewer
```

In `npm run dev`, emails aren't sent: open **/dev/mail** to read them and follow their links. The same page can give your own account a Biomedix staff role for testing.

## Routes

| Path | Screen |
| --- | --- |
| `/` | Landing page |
| `/demo` | Book a demo: a short form, then the scheduler; optionally add files for a gap scan (`/demo?scan=1` starts with it on) |
| `/gap-scan` | Free gap scan: upload files, with an optional call to walk through the results |
| `/request/:token` | The requester's private page: pick a demo time, upload files, follow the scan, read and print the report, delete their files |
| `/app/review` | Review queue (agent outputs waiting on a person) |
| `/app/procedures` | Procedure library |
| `/app/form` | QMS questionnaire: every question on one page, each showing the documents it fills |
| `/app/setup/:step` | Guided setup: the same questions in seven steps |
| `/app/suite` | Documentation suite: every required procedure, auto-filled from setup |
| `/app/suite/:docId` | One tailored procedure, with Word/Markdown export and submit-for-review |
| `/app/publish` | Publish to SharePoint: library preview, direct upload, ZIP download, PowerShell script |
| `/app/readiness` | Compliance readiness: score, four checks per procedure, next steps, agent proposals, requirements matrix |
| `/app/assessments` | Assessments overview: progress on the Part 11 and risk assessments |
| `/app/assessments/part11` | 21 CFR Part 11 assessment: systems, scope, risk, controls, findings (writes FRM-019) |
| `/app/assessments/risk` | ISO 14971 risk assessment: acceptability matrix, hazards, controls, residual and overall risk (writes RMF-001) |
| `/app/history` | Run history: every saved run, the answers it changed and the documents it revised (account) |
| `/app/suite/:docId/history` | Revision history of one document: every draft, its sign-offs, and line-by-line changes (account) |
| `/app/dashboard` | Company dashboard: totals, items that need you, every project's readiness and document pipeline, team, recent activity (account) |
| `/app/welcome` | Setup checklist after sign-up (account) |
| `/app/settings/profile` · `security` · `sessions` | Your name and sign-in email; password and two-factor; signed-in devices (account) |
| `/app/settings/company` · `members` · `activity` | Company name, two-factor policy, leave or delete; members, roles, approvers and invitations; the activity log (account) |
| `/staff/reviews` | Biomedix reviewer workspace: drafts submitted by every company, with changes from the previous draft (staff) |
| `/staff/admin` | Biomedix admin: every company and person, staff roles, two-factor reset (staff admin) |
| `/staff/scans`, `/staff/scans/:id` | Gap scan queue with due times; one scan's files, automated findings to keep, edit or dismiss, your own findings, summary and send (staff) |
| `/staff/requests` | Every demo request and gap scan, with status (new, contacted, demo booked, closed) and notes (staff) |
| `/sign-in`, `/sign-up` | Sign-in (with a two-factor step) and sign-up (creates your company, or joins one from an invitation) |
| `/forgot-password`, `/reset-password` | Password reset by emailed link |
| `/verify-email`, `/confirm-email` | Email confirmation for new accounts and changed addresses |
| `/invite/:token` | Accept an invitation to a company |
| `/dev/mail` | Dev mailbox (dev mode only) |

## Documentation flow

1. **Questions** live in one bank, `src/intake/questions.ts`, rendered both as the single-page form (`QuestionForm.tsx`) and the guided steps (`Setup.tsx`). Answers go into `Intake` (`src/intake/model.ts`). Answers persist in `localStorage`. The agent reads the free-text description for hints (software, hardware, connectivity, AI) and can draft the intended use statement.
2. **Derive** (`src/intake/derive.ts`) works out the gate zero determinations — design controls, 524B cyber device, IEC 62304 safety class, FDA documentation level, PCCP — and resolves every template token, with fallbacks (e.g. the CEO as management representative) marked as *derived* so the customer confirms them.
3. **Generate** (`src/templates/generate.ts`) decides which procedures apply (with a written justification for each one that doesn't, fed into QM-001), renders each section from `src/templates/content.ts`, and tracks which tokens are filled or missing.
4. **Review**: filled values are highlighted, derived values dashed, missing ones link straight to the setup field. Documents export as Markdown or print to PDF, and *Submit for technical review* puts them in the review queue.

5. **Publish** (`src/export/`): `structure.ts` lays out the SharePoint library from the answers (only folders the device needs); `docx.ts` writes each procedure as a Word draft; `package.ts` builds the ZIP, master document list, README and PnP PowerShell script; `sharepoint.ts` creates the library, columns, folders and files through Microsoft Graph, never overwriting existing files.

## Assessments

Two assessments sit next to the procedures. Each is a checklist the customer works through, and each produces a document in the suite (`src/assessments/docs.ts`), so it is saved in runs, reviewed, approved, exported to Word and published to SharePoint like any procedure. Answers are stored with the rest of the project's answers (`intake.part11`, `intake.risk`).

**21 CFR Part 11 (FRM-019)**, `src/assessments/part11.ts`
- Systems come from the setup answers (document system, e-signature tool, QMS and development tools, and the Biomedix platform). Known systems (Biomedix, SharePoint, Google Drive, DocuSign, Acrobat Sign) bring suggested answers marked *Suggested* until the customer confirms them; others start blank.
- Scope follows FDA's 2003 Scope and Application guidance: predicate-rule records relied on electronically, or electronic signatures used in place of handwritten ones. Each system in scope is rated High, Medium or Low risk.
- Controls: 11.10(a) to (k), 11.30 for open systems, 11.50, 11.70, 11.100(a), 11.200 and 11.300 for signatures, and company-wide 11.10(i), 11.10(j), 11.100(b) and 11.100(c). Partly met and Not met need a corrective action. A partly met control under enforcement discretion (11.10(a), (b), (c), (e), (k)(2)) on a Medium or Low risk system can instead be accepted on documented risk.

**ISO 14971 risk assessment (RMF-001)**, `src/assessments/risk.ts`
- Severity S1 to S5 and probability per use, on the SOP-003 matrix (editable per device; Acceptable, Reduce further, Unacceptable).
- Hazards suggested from the device profile (patient contact, sterility, hardware, software, connectivity, AI, use and labeling) with typical controls; the team adds or dismisses each and adds its own. References (H-001, RC-001.1) are never reused.
- Each hazard needs a sequence of events, hazardous situation, harm, severity and probability; a control when it isn't acceptable; implementation and effectiveness evidence for each control; residual rating and a 7.6 new-hazard check; a benefit-risk rationale when residual risk isn't acceptable. It warns when a control lowers severity or when information for safety is the only control.
- Overall residual risk (clause 8): method, benefits, disclosure and the decision.

Both feed readiness: their checklist items count toward *Values filled*, unconfirmed suggestions toward *Agent proposals confirmed*, and FRM-019 and RMF-001 join the Part 11, ISO 14971, 4.1.6 and 7.1 rows of the requirements matrix.

## Accounts, companies and roles

**Who uses Biomedix**

| | Who | Can |
| --- | --- | --- |
| **Company** | The legal manufacturer. Owns projects, members and the activity log. A person can belong to several and switch from the top bar. | |
| Owner | Founder, head of quality | Everything, including making owners and deleting the company |
| Admin | QA/RA lead | Members, invitations, the two-factor policy, projects |
| Editor | Engineers, regulatory | Answer questions, save runs, submit drafts for review |
| Viewer | Auditors, investors, consultants | Read everything, change nothing |
| Approver (any role) | Management representative | Approve reviewed drafts with an e-signature |
| **Biomedix staff** | Reviewer | Sign or return technical reviews across every company |
| | Admin | Also see every company and person, grant staff roles, reset two-factor |

Approver is a separate designation, not a role, because QMS document control names who may approve independently of who administers the workspace. Roles are enforced by the server; the interface only hides what you can't do.

**Sign-in flow**

- **Sign up** with name, work email, company name and password (12+ characters, common passwords refused, strength meter). This creates the company with you as owner and approver, signs you in, and sends a confirmation email. Answers entered before signing up become the company's first project. A **welcome checklist** follows: confirm email, answer the questionnaire, invite your team, turn on two-factor.
- **Confirm email**: a single-use link valid for 24 hours. Until then you can work but can't invite people or approve documents.
- **Invitations**: admins invite by email with a role and approver flag. The link works once for 7 days and can also be copied. Opening it signs you up (email fixed to the invitation, confirmed automatically) or, if you already have an account, adds the company to it.
- **Sign in** with email and password, then a 6-digit code from an authenticator app, or a recovery code, if two-factor is on. *Keep me signed in* gives a 30-day session; otherwise it lasts 12 hours and ends with the browser. Failed attempts are rate-limited by email and network.
- **Forgot password**: always gives the same answer, so it can't reveal who has an account. The link works once for an hour; resetting signs out every device and sends a notice.
- **Two-factor** (TOTP, RFC 6238): scan a QR code, confirm a code, save 10 single-use recovery codes. Codes can't be replayed. Owners and admins can **require two-factor** for the whole company; members without it are held at a setup screen. A Biomedix admin can reset two-factor for someone who lost their phone, after confirming who they are.
- **Account settings**: change name or sign-in email (confirmed by link to the new address, with a notice to the old one), change password (signs out other devices), see and sign out **signed-in devices**, recent security activity, delete the account (blocked while you're the only owner of a company with other members).
- **Activity log**: every company event (members, invitations, projects, runs, submissions, reviews, approvals) with who, when and from where. It's append-only.

**Security**: passwords use scrypt; sessions, one-time links and recovery codes are stored only as hashes; two-factor secrets are encrypted with AES-256-GCM; cookies are HttpOnly and SameSite=Lax; every change must be JSON from this site. Approvals and technical reviews need the signer's password again (21 CFR 11.200), and record their name, email, time, meaning and the draft's SHA-256. A reviewer can't review a draft they submitted.

**Not built yet**: single sign-on with Microsoft Entra ID (a natural fit alongside SharePoint), billing and plans, automatic sign-out after inactivity, and pages for the terms of service and privacy policy that sign-up refers to.

## Demo requests and gap scans

**Book a demo** collects a short form first and opens the scheduler second, rather than sending people straight to a Calendly link. The form keeps the lead even if they never pick a time, tells the engineer what to prepare (device, type, stage, AI), and fills the scheduler in for them. Set `BIOMEDIX_BOOKING_URL` to your Calendly or Microsoft Bookings page (Bookings comes with Microsoft 365 Business, alongside SharePoint).

**Gap scan**, start to finish:

1. The requester fills the same form, adds up to 10 files (PDF, Word, Excel, CSV, text; 25 MB each, 60 MB in total) and confirms they may share them. Files are checked against their extension and stored in the database, never served back to the requester.
2. **Automated checks** (`server/scan/`) read the text and tables, sort each file into requirements, trace matrix, risk file, test report or procedure, and flag likely gaps with the clause behind each and what to do:
   - requirements that can't be verified as written (vague words with no measurable value), open TBDs, requirements without IDs or combining several "shall"s;
   - trace matrix rows with no verification, failed or missing results, duplicate IDs; requirements missing from the matrix; linked tests not found in the reports shared;
   - risk tables without severity, probability or verification of control effectiveness; risk files without acceptability criteria, use errors, benefit-risk, overall residual risk, post-production feedback or (for software) security risks; risk controls not traced to verification;
   - test reports without acceptance criteria, results, the item or software version tested, sample size (hardware), who ran it, dates, deviations or a conclusion;
   - for software: safety class or documentation level, SOUP/SBOM, known anomalies; for AI, model and data evidence.
   These are rules, not a language model. Scanned PDFs and old `.doc`/`.xls` files skip them and go to the engineer as they are.
3. The team is emailed. An engineer claims the scan in **/staff/scans**, keeps, edits or dismisses every automated finding, adds their own, writes a summary and sends it. The report can't be sent while any automated finding is unreviewed, and nothing reaches the requester before then.
4. The requester gets an email linking to their private page with the report, grouped by priority, with what the scan covered and didn't. They can print it or save it as PDF.
5. Files are deleted `BIOMEDIX_SCAN_RETENTION_DAYS` after the report, after a day if the upload is abandoned, or straight away if the requester asks. Findings and the report stay.

Spam protection: a hidden honeypot field and rate limits per network and per email address.

## Runs and drafts

- **Projects**: one per device, owned by the company. Answers autosave as you type.
- **Runs**: each *Create documentation* saves a run, which stores a snapshot of the answers and a new **draft** of every document whose text changed (Rev A, draft 1, 2, 3…). Unchanged documents keep their draft. Runs, drafts and sign-offs are append-only, and each draft stores a SHA-256 of its text.
- **Sign-off**: an editor submits a saved draft; a Biomedix reviewer signs the technical review or returns it with comments; an approver in the company approves it. A new draft needs review again.

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
- `src/account/` holds the API client and sign-in state (user, companies, active company); `src/intake/IntakeContext.tsx` holds the working answers and syncs them to the active company's project.
- `src/pages/auth/`, `src/pages/settings/` and `src/pages/staff/` hold the sign-in flows, settings and the Biomedix staff workspace.
- `src/pages/requests/` holds the demo and gap scan forms, the requester's page and the report; `src/requests/api.ts` their API client.
- `server/scan/` reads uploaded files (`extract.ts`, with `zip.ts` for Word and Excel) and runs the gap checks (`checks.ts`).
- `server/` holds the API: `api.ts` mounts the routes in `server/routes/` (auth, account, orgs, projects, requests, staff, dev); `access.ts` decides who can do what; `auth.ts` handles passwords, sessions and one-time links; `totp.ts` two-factor; `mail.ts` email; `audit.ts` the activity log; `db.ts` storage and migrations; `start.ts` the production server; `cli.ts` staff roles.
- `src/data/` contains the review queue items and the procedure library content.
- `src/assessments/` holds the Part 11 and risk assessment models, checks and document builders; `src/pages/assessments/` their pages.
- Text in square brackets (`[YOUR PRICE]`, `[Company]`, `[Reviewer name]`) is a placeholder waiting for real content.
