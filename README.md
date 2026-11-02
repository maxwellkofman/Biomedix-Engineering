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

## Structure

- `src/styles/tokens.css` holds the design tokens (colors, fonts, radii); `global.css` holds the shared primitives (buttons, cards, pills, badges, grid); `home.css` and `app.css` hold the page styles.
- `src/components/` contains the shared pieces: `Logo`, `Button` / `ButtonLink`, `AppShell` (product header and nav), and `Icon`.
- `src/data/` contains the review queue items and the procedure library content.
- Text in square brackets (`[YOUR PRICE]`, `[Company]`, `[Reviewer name]`) is a placeholder waiting for real content.
