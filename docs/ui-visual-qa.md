# UI Visual QA

This repo now has a small Playwright smoke path for real screens. It is intentionally not the full visual QA matrix from `docs/UIrefinement.md`; it is the fast local check for blank pages, major layout drift, horizontal overflow, and local screenshots on seeded desktop/mobile app-shell tabs.

## Smoke Command

Run the smoke screenshots:

```powershell
npm run test:visual
```

The smoke suite starts Vite dev on `127.0.0.1:4177`, uses `/nologin`, seeds one realistic local-first lot with sales, then captures Config, Live, Sales, and Portfolio in:

- desktop, English, light theme
- mobile, French, dark theme

Each screen also gets a page-level horizontal overflow assertion before the screenshot. Screenshots and traces are local Playwright artifacts under `test-results/` and are ignored by git.

## When To Run

Use the smoke path for UI work that touches the app shell, responsive spacing, shared cards/panels/dialogs/tables/forms, top-level tabs, mobile navigation, theme tokens, or French copy fit.

This is not a replacement for the broader visual QA backlog. The remaining full matrix still needs tracked visual baselines, tablet coverage, high-risk modals, Whatnot review/import, games and spectator pages, public reports, and more targeted component overflow assertions.
