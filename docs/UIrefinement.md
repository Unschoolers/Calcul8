# UI Refinement Backlog

This is the must-do UI/UX backlog for turning Calcul8 from a workable app into a consistent, professional, mobile-first product. It is based on the current frontend structure, especially `src/App.html`, `src/styles/app.css`, `src/components/shell`, `src/components/windows`, `src/components/windows/game/styles`, `src/spectator`, and `src/styles/spectator.css`.

The goal is not to repaint screens one by one. The goal is to create one coherent interface system, then bring every screen into it without losing the app's practical workflow density.

## Definition Of Pixel-Perfect Done

Every item below is done only when the affected screens pass these checks:

- Mobile-first at 360x740 and 390x844, tablet at 768x1024, desktop at 1280x800 and 1440x900.
- Light and dark themes have intentional contrast, surface, border, shadow, and focus states.
- English and French text fit without clipping, overlap, layout jumps, or missing diacritics.
- Touch targets are at least 44px for primary controls, icon-only controls have tooltips or clear accessible labels, and destructive actions are visually distinct.
- Screens use shared spacing, typography, radius, elevation, icon, empty-state, loading, error, and dialog patterns unless an exception is documented.
- Visual QA screenshots exist for changed top-level screens and modals.

## Critical

### 1. Create One Mobile-First App Shell Contract

**Problem:** The root shell mixes a dense top app bar, bottom navigation, fixed FAB stacks, sticky windows, disabled wrappers, and per-screen mobile behavior. It works, but each screen negotiates its own layout against the nav and FAB zones.

**Scope:** `src/App.html`, `src/styles/app.css`, `src/components/shell/AppShellTopBar.*`, all top-level window shells.

**Must do:**

- Define fixed layout zones for app bar, content, bottom navigation, snackbars, and contextual actions.
- Replace ad hoc FAB bottom offsets with a shared action placement contract that respects safe areas and bottom navigation.
- Standardize when actions live in headers, sticky footers, FABs, speed dials, section cards, or modal footers.
- Make the no-lot and disabled-tab states use one blocking surface instead of dimming large page regions with mixed pointer behavior.
- Document one desktop/tablet/mobile navigation pattern and remove per-screen exceptions unless required by workflow.

**Acceptance:**

- No primary action overlaps bottom nav, snackbars, modals, or sticky sheet content on mobile.
- Switching tabs does not change global chrome height or cause visible layout jumps.
- Every top-level tab has a clear first action and a predictable location for secondary actions.

### 2. Establish Shared Design Tokens Before More Screen Polish

**Problem:** Styling is scattered across `app.css`, shell CSS, window CSS, game CSS, and spectator CSS. Radius, shadows, gradients, typography, spacing, hardcoded colors, and one-off surface treatments vary widely.

**Scope:** `src/styles/app.css`, `src/vuetify.ts`, `src/components/**/*.css`, `src/styles/spectator.css`, Vue component scoped styles.

**Phase progress:**

- 100% - Inventory current token drift and classify exceptions for game art, spectator presentation, imported brand assets, and user-selected colors.
- 100% - Add the shared token foundation for spacing, radius, elevation, stroke, focus, type scale, section width, sticky offsets, action zones, status colors, and motion.
- 100% - Migrate global app chrome to tokens: root background wash, focus rings, shell widths, default action sizing, bottom nav, FAB offsets, transition timings, and shared profit/price helpers.
- 100% - Migrate high-signal screen surfaces to tokens: shell/auth/workspace, Live, Singles, Portfolio, and reusable report/modal surfaces.
- 100% - Run a hardcoded visual-value scan, document remaining exceptions, and verify TypeScript/build safety for the touched frontend files.

**Continuation progress:**

- 100% - Expand token vocabulary for fields, selected rows, interactive shadows, media shadows, inverse strokes, cost/market accents, and dark-theme field overrides.
- 100% - Reduce remaining hardcoded values in Singles mobile list, editor preview, search, thumbnail, pricing, and sticky toolbar surfaces.
- 100% - Add spectator-local presentation tokens so the public spectator page has one source for its expressive palette, surfaces, borders, radii, shadows, and status colors.
- 100% - Normalize leftover font-weight, radius, and inset-shadow literals in Live, Portfolio, shell account, auth, report, and global lot-selector styles.
- 100% - Re-run the hardcoded-value scan and frontend build after the second-pass token migration.

**Broader continuation progress:**

- 100% - Scan the remaining CSS and Vue style clusters outside the first token pass and classify core app UI separately from game art and public presentation exceptions.
- 100% - Migrate Sales window status, history, forecast, chart, list, pill, and section surfaces to shared radius, stroke, typography, and motion tokens.
- 100% - Migrate Config window cards, summary hero, fee popover, toggles, summary pills, and price-link list to shared radius, stroke, shadow, typography, and surface tokens.
- 100% - Re-run targeted hardcoded-value checks for Sales and Config and verify the frontend build after the broader pass.

**Surface-token hardening progress:**

- 100% - Fold the section-3 dialog, card, table, sticky action, and mobile dialog contracts back into the shared token vocabulary.
- 100% - Tokenize shared surface backgrounds, table state backgrounds, sticky blur, text tone aliases, and mobile fullscreen dialog dimensions.
- 100% - Tokenize remaining core app-chrome literals for skip links, highlighted prices, FAB badge sizing, tab slide distance, mobile shell padding, lot chip width, Stripe shell height, and lot-selector labels.
- 100% - Re-run targeted token scans, whitespace checks, and the frontend build after the hardening pass.

**Remaining documented exceptions after this phase:**

- Game art, wheel-stage/game-board presentation, spectator-local presentation tokens, splash/brand moments, and generated public/share surfaces may keep hardcoded visual values when they are deliberately expressive rather than core app chrome.
- User-selected prize colors, sales-user colors, card artwork, and third-party embedded UI are data/content values, not design-system tokens.
- The global `v-card` radius is now token-gated as a compatibility guard; removing the broad selector entirely belongs to item 12 after repeated section/card patterns move to explicit shared components.
- Singles still has deep, screen-specific density/layout styling that should be cleaned during items 3, 6, and 12 rather than forced into this token foundation pass.
- Verification for this phase: `npm run build` passes after the token imports and CSS migrations.

**Must do:**

- Add app-level CSS tokens for spacing, radius, elevation, stroke, focus, type scale, section width, sticky offsets, and motion duration.
- Keep theme colors in Vuetify/theme tokens and derived CSS variables, not repeated hex or RGB literals.
- Cap standard card radius at 8px unless a component is intentionally circular, pill-shaped, or media-focused.
- Define standard elevations for flat, raised, sticky, modal, and active surfaces.
- Replace hardcoded success/error/warning/profit colors with semantic tokens that work in light and dark themes.
- Remove global overrides such as broad `.v-card { border-radius: ... !important; }` once local components have explicit contracts.

**Acceptance:**

- New screens can be built without inventing spacing, shadow, radius, or color values.
- A hardcoded color scan has documented exceptions only for logos, imported brand assets, generated game art, or user-selected prize colors.
- Light and dark theme screenshots show the same hierarchy and no dark-theme-only assumptions.

### 3. Normalize Cards, Panels, Dialogs, Tables, And Forms

**Problem:** Whatnot, Singles, Live, Sales, Portfolio, Workspace, and Game screens all use their own combinations of `v-card`, title bars, section headers, alerts, tables, sticky actions, and compact controls.

**Scope:** `src/components/shell`, `src/components/windows`, `src/components/live-price`, shared UI helpers/components to be introduced as needed.

**Phase progress:**

- 100% - Inventory reusable surface drift across core app CSS and classify core app surfaces separately from game art, spectator presentation, and user/content colors.
- 100% - Add shared app-level CSS contracts for dialog cards, dialog title/content/actions, section cards, summary panels, sticky action footers, table wrappers, and data tables.
- 100% - Migrate high-visibility dialog/table surfaces to shared contracts: Whatnot review, Whatnot CSV import, Sale editor, Workspace dialogs, and Portfolio report.
- 75% - Normalize existing cards, panels, forms, and list/table shells through tokenized CSS in Sales, Config, Live, Singles, Portfolio, and shell surfaces.
- 45% - Extract reusable Vue shell components for section card, KPI/stat card, toolbar/filter bar, empty/loading/error states, confirmation dialog, destructive warning, and sticky action footer.
- 100% - Re-run targeted surface scans and frontend build after the first normalization pass.

**Continuation progress:**

- 100% - Add reusable `AppSectionCard` and `AppEmptyState` shell primitives backed by the shared surface and empty-state classes.
- 100% - Migrate Sales history, Sales chart, Sales forecast, Portfolio chart, Portfolio lot performance, and Portfolio sales-by-person panels onto the shared section-card primitive.
- 100% - Replace repeated Sales and Portfolio inline empty-state markup with the shared empty-state primitive.
- 100% - Re-run component usage scans, whitespace checks, typecheck, and frontend build after the component extraction pass.
- 100% - Add reusable `AppStickyActionFooter` and migrate Sale editor, Portfolio report, and Singles editor action footers onto the shared sticky footer primitive.
- 100% - Re-run sticky footer component scans, focused modal/window tests, whitespace checks, typecheck, and frontend build after the sticky footer pass.

**Must do:**

- Create shared shell components for screen section, KPI/stat card, toolbar/filter bar, empty state, loading state, error state, confirmation dialog, destructive warning, and sticky action footer.
- Standardize dialog anatomy: title, supporting copy, content, destructive/secondary/primary actions, fullscreen behavior on mobile.
- Standardize form density, label position, helper/error text behavior, prefixes, numeric fields, and segmented controls.
- Standardize data table/list transformations for mobile: desktop tables become mobile cards/lists with the same sorting/filtering semantics.
- Move duplicated title bars and summary pill treatments into reusable components or documented classes.

**Acceptance:**

- A Whatnot review modal, Singles editor, Sale editor, Workspace modal, and Portfolio report modal feel like one product family.
- Mobile dialogs use fullscreen or bottom-sheet behavior consistently.
- Compact controls remain readable and tappable in French.

### 4. Make Complex Workflows Mobile-First, Not Desktop-First Shrunk Down

**Problem:** Several workflows contain dense tables, multi-column editors, heavy charts, or inspector panels. Some have mobile-specific workarounds, but the design language is not unified.

**Scope:** `WhatnotCsvImportDialog`, `WhatnotReviewDialog`, `SinglesConfigWindow`, `SinglesPurchasingCard`, `LiveSinglesPanel`, `PortfolioWindow`, `GameWindow`, wheel inspector/game panels.

**Phase progress:**

- 100% - Inventory the first dense workflow targets and start with Whatnot import because it combines CSV preview, review decisions, grouping, and long mobile scroll.
- 100% - Replace the Whatnot CSV preview's horizontal-table-only mobile experience with a mapped mobile card list while keeping the compact desktop table.
- 100% - Add a sticky mobile review-progress summary to the Whatnot review dialog so pending/manual rows and import-ready rows remain visible while scrolling.
- 100% - Stack Whatnot review row action toggles on mobile so create/update/skip actions stay readable and tappable in French.
- 50% - Convert Singles CSV import, Singles editor, Live Singles, and Portfolio dense chart/list flows to the same summary-first mobile pattern.
- 0% - Define and apply one mobile inspector pattern for game configuration across wheel, mystery grid, and bracket modes.
- 100% - Re-run targeted mobile workflow scans, typecheck, and frontend build after the first mobile-first pass.

**Continuation progress:**

- 100% - Extend the mobile CSV preview pattern to Singles import with a fullscreen mobile dialog, sticky mapping summary, and card-based first-five-row preview.
- 100% - Keep Singles CSV desktop behavior intact with the existing compact table while hiding horizontal table preview on narrow screens.
- 100% - Re-run Singles CSV mobile workflow scans, locale parsing, targeted Singles tests, typecheck, and frontend build after the second mobile-first pass.
- 100% - Make Live Singles selected-item controls stack into full-width thumb-friendly groups on mobile while preserving the desktop pricing grid.
- 100% - Make Live Singles totals and the convert action sticky at the bottom on mobile so the active sale state stays visible during long selected-item lists.
- 100% - Re-run Live Singles targeted tests, typecheck, and frontend build after the third mobile-first pass.

**Must do:**

- Redesign complex flows around progressive disclosure: summary first, focused editor second, advanced details behind tabs/drawers/accordions.
- Use sticky mobile summaries for financial totals and pending required actions.
- Replace cramped horizontal table behavior with mobile list/card views where row actions stay visible.
- Define one mobile inspector pattern for game configuration and reuse it across wheel, mystery grid, and bracket modes.
- Ensure config mode and live mode have visibly different states without changing the user's mental model.

**Acceptance:**

- A user can complete a lot setup, live price update, sale entry, Whatnot review, and game session flow on a 390px-wide screen without horizontal scrolling.
- Every multi-step flow has a clear current state, next action, and safe cancel/close path.

## High

### 5. Unify Screen Personality Without Flattening The Product

**Problem:** Game, spectator, auth, singles, portfolio, live pricing, and Whatnot surfaces currently have separate visual personalities. Some are playful, some are operational, some are heavily gradient/card-based.

**Scope:** Auth gate, shell, Config, Live, Sales, Game, Portfolio, Singles, Whatnot, spectator pages.

**Must do:**

- Define the base product style as operational and polished: quiet surfaces, strong hierarchy, dense but readable data, restrained decoration.
- Reserve expressive visual treatment for game stages, spectator pages, and celebratory/result states.
- Align section headers, metric cards, status chips, and CTA buttons across every window.
- Make brand moments deliberate: auth, splash, public spectator, and generated reports should feel connected without overpowering work screens.

**Acceptance:**

- The app no longer feels like several separately styled tools inside one shell.
- Expressive screens still feel premium, but operational screens stay scannable and calm.

### 6. Finish Theme-Aware Styling And Remove Hardcoded Visual Drift

**Problem:** The codebase still has many hardcoded colors, white/black assumptions, gradients, and shadows. Spectator styling is especially standalone and dark-first.

**Scope:** `src/styles/app.css`, `src/styles/spectator.css`, `src/components/shell/*.css`, `src/components/windows/**/*.css`, scoped Vue styles.

**Must do:**

- Convert hardcoded app UI colors to Vuetify `--v-theme-*` variables or documented semantic tokens.
- Add explicit light-mode and dark-mode checks for spectator, game, modals, charts, and reports.
- Replace translucent white/black borders with theme-aware stroke tokens.
- Define semantic profit, loss, warning, live, inactive, claimed, selected, and disabled colors.
- Keep user-generated/game-generated prize colors isolated from system UI colors.

**Acceptance:**

- A color scan can distinguish intentional dynamic/game colors from UI system colors.
- No surface depends on white text, black backgrounds, or dark-only contrast.

### 7. Complete The Bilingual UI Contract

**Problem:** The main app has i18n coverage, but public spectator pages and some fallback strings remain hardcoded. Some French copy misses diacritics, which makes the UI feel unfinished.

**Scope:** `src/app-core/i18n`, `src/spectator`, `src/spectator-main.ts`, fallback copy in TS/HTML/Vue files.

**Must do:**

- Add spectator i18n support with a visible language toggle.
- Move hardcoded spectator strings into English/French locale files.
- Audit French locale files for missing diacritics: `coûts`, `configuré`, `résultat`, `sélectionné`, `révision`, `intégration`, `échec`, `réussie`, `liés`, `à`.
- Replace component fallback strings with translation keys when the text is user-facing.
- Verify French text fit in buttons, nav items, chips, tables, dialogs, and mobile cards.

**Acceptance:**

- Spectator pages are completely usable in English and French.
- No visible user-facing string is English-only unless it is a brand, product name, file format, or third-party term.

### 8. Build A Visual QA Harness For Real Screens

**Problem:** The repo has focused unit tests, but UI consistency needs visual checks. Without screenshots, regressions in spacing, overflow, dark/light mode, and French text will keep slipping in.

**Scope:** Playwright or existing browser test setup, top-level tabs, modals, spectator pages, reports.

**Must do:**

- Add screenshot coverage for each top-level tab in light and dark themes.
- Add mobile/tablet/desktop screenshot fixtures for the highest-risk screens: Singles config, Whatnot review/import, Live singles, Portfolio, Game wheel/grid/bracket, spectator pages.
- Add text-overflow checks for nav buttons, dialog titles, chips, table/list rows, and sticky action bars.
- Add a visual QA checklist that designers and developers can run before merging major UI changes.

**Acceptance:**

- A UI refactor can prove it did not break mobile layout, theme contrast, or French text fit.
- The screenshot harness is part of the local verification path for major UI work.

### 9. Standardize Data-Dense Financial Presentation

**Problem:** Profit, margin, cost, revenue, target price, market value, fees, and forecast data are displayed differently across Live, Sales, Singles, Portfolio, Config, and reports.

**Scope:** `src/components/live-price`, Live windows, Sales window, Singles purchasing/selling cards, Portfolio window/report, calculation summaries.

**Must do:**

- Create shared money, percent, margin, delta, and status display components/classes.
- Define positive/negative/neutral/target styling once.
- Align decimal precision, currency labels, abbreviations, and tooltip/help behavior.
- Use the same density rules for KPI cards, summary pills, and report tables.
- Keep financial hierarchy consistent: primary value, secondary value, explanation, action.

**Acceptance:**

- The same business metric looks and reads the same everywhere.
- Users can compare screens without relearning color or typography semantics.

## Medium

### 10. Align Icons, Labels, And Action Taxonomy

**Problem:** The app uses many icon-only controls, FABs, speed-dial actions, status icons, and destructive controls. Some actions are clear only because the user already knows the screen.

**Scope:** Shell, modals, Game controls, Sales speed dial, Singles editor, Whatnot dialogs, Portfolio report.

**Must do:**

- Define icon choices for create, edit, delete, reset, sync, import, export, verify, copy, share, live, settings, close, expand, collapse, and help.
- Give every icon-only button an accessible label and hover tooltip where supported.
- Use text buttons only for commands that benefit from visible wording.
- Make destructive controls use consistent color, placement, confirmation, and copy.
- Normalize primary/secondary/tertiary/destructive button variants.

**Acceptance:**

- A user can predict what an icon does before clicking it.
- Similar actions use the same icon and variant across screens.

### 11. Normalize Empty, Loading, Error, Offline, And Sync States

**Problem:** Empty states, warnings, skeletons, offline notices, sync statuses, and conflict errors are implemented screen by screen. Some are polished, others are compact alerts or fallback text.

**Scope:** Shell sync/offline states, Workspace modals, Whatnot, Singles, Live, Sales, Portfolio, Game, spectator.

**Must do:**

- Create shared state components for empty, loading, retryable error, permission blocked, offline, sync pending, sync failed, and conflict resolution.
- Give every state a consistent title/body/action structure.
- Separate blocking states from informational states visually and behaviorally.
- Make retry actions clear and local-first behavior explicit.
- Ensure public spectator dead-session and disconnected realtime states are understandable without technical errors.

**Acceptance:**

- The app never shows a raw failure as the only explanation for a recoverable user path.
- Similar failures look and behave the same across features.

### 12. Reduce CSS And Markup Duplication Around Screen Sections

**Problem:** Many window files own their own section title bars, metric cards, sticky footers, summary pills, list cards, and responsive table/list behavior. This makes consistency expensive.

**Scope:** Large files such as `SinglesConfigWindow.css`, `PortfolioWindow.html`, `LiveSinglesPanel.*`, `ConfigWindow.html`, `GameWindow.html`, and game style files.

**Must do:**

- Extract shared section and metric patterns before adding new UI variants.
- Keep screen-specific CSS for genuinely screen-specific layout or game artwork.
- Move repeated token-sized values into app tokens.
- Split oversized templates when a section has its own state, actions, and responsive behavior.
- Use component props instead of copy-pasted class families where practical.

**Acceptance:**

- New UI work reuses existing components/classes by default.
- The largest screens become easier to scan and modify without breaking unrelated sections.

### 13. Add Accessibility Polish Beyond Basic Labels

**Problem:** The app has accessible labels in several places, but dense interactive screens need a consistent accessibility layer, especially on mobile and in modals.

**Scope:** Shell, navigation, dialogs, forms, data lists, game controls, spectator pages.

**Must do:**

- Verify heading order and landmark structure for the main app and spectator pages.
- Add visible focus states that match the design system.
- Confirm keyboard order in dialogs, sticky action bars, game controls, imports, and report tables.
- Add reduced-motion alternatives for game/spectator animations and splash effects.
- Ensure color is never the only signal for profit/loss, live/ended, selected/unselected, or destructive states.

**Acceptance:**

- Core workflows are usable with keyboard, screen reader basics, reduced motion, and high zoom.
- Focus, disabled, selected, and live states are visible in both themes.

### 14. Tighten Responsive Charts, Tables, And Reports

**Problem:** Portfolio, Sales, Live, and reports contain charts/tables that need deliberate responsive rules rather than case-by-case overflow handling.

**Scope:** Portfolio charts/report modal, Sales charts/history, Live pricing cards, Whatnot/Singles import previews.

**Must do:**

- Define when data tables remain tables and when they become mobile cards.
- Add consistent horizontal scroll affordances only where a true data table is required.
- Align chart legends, axis labels, empty states, and summary cards.
- Make exported/report views visually related to the app but optimized for reading and sharing.
- Verify long names, multiple currencies, and many lots do not break layouts.

**Acceptance:**

- Reports and charts remain readable on mobile, tablet, desktop, and print/export contexts.
- Important numbers are not hidden behind overflow or tiny labels.

## Low

### 15. Refine Motion, Microinteractions, And Perceived Performance

**Problem:** Transitions, hover states, active states, skeletons, splash timing, and game animations are implemented locally. Some feel polished, some are utilitarian.

**Scope:** App shell, startup splash, tab transitions, modals, cards, game stage, spectator pages.

**Must do:**

- Define motion durations/easing for screen transitions, modal transitions, hover/press, loading, and game-only celebration.
- Add reduced-motion behavior everywhere motion is decorative.
- Keep operational screens fast and subtle; reserve high-energy animation for game and spectator moments.
- Use skeletons or stable placeholders where async data causes layout jumps.

**Acceptance:**

- Motion supports comprehension and does not make the app feel noisy.
- Slow network states feel intentional rather than broken.

### 16. Improve Brand Polish Where It Matters

**Problem:** The app has brand elements, but they are not yet consistently applied across auth, splash, shell, spectator, and share/report surfaces.

**Scope:** Auth gate, splash, app shell, spectator pages, generated reports, icons/assets.

**Must do:**

- Define brand usage rules for logo size, icon treatment, accent color, and title copy.
- Make splash/auth/spectator/report feel like the same product family.
- Avoid decorative backgrounds inside operational work surfaces unless they improve hierarchy.
- Ensure app icons and public-facing pages look sharp on high-density mobile screens.

**Acceptance:**

- First impressions look intentional without turning internal workflows into landing pages.
- Public-facing surfaces are polished enough to share with customers/viewers.

### 17. Add A Lightweight UI Component Gallery

**Problem:** Without a place to inspect core UI states, consistency depends on manually finding screens that happen to use a component.

**Scope:** A local-only dev route, Storybook-like harness, or documentation page, depending on repo fit.

**Must do:**

- Show buttons, dialogs, state blocks, KPI cards, data cards, toolbars, chips, form fields, and table/list rows.
- Include light/dark, English/French, mobile/desktop examples.
- Include destructive, disabled, loading, selected, sync/error, and empty states.
- Keep it dev-only and out of production navigation unless intentionally exposed.

**Acceptance:**

- UI changes can be reviewed in isolation before touching production screens.
- Designers/developers can compare states without opening every workflow.

### 18. Clean Up One-Off Visual Debt After The System Lands

**Problem:** Once shared contracts exist, leftover one-off CSS will keep pulling screens away from the system.

**Scope:** All screen CSS, scoped Vue styles, global overrides, inline styles.

**Must do:**

- Remove unused selectors after component extraction.
- Replace inline styles with component props or tokenized classes.
- Delete duplicate section-card, chip, status, and sticky-action implementations.
- Keep only documented exceptions for game art, spectator presentation, user-selected colors, and third-party embedded UI.

**Acceptance:**

- The CSS is smaller, easier to scan, and organized around reusable system primitives.
- Future UI work starts from shared components instead of copying a nearby screen.
