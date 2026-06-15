# UI Refinement Backlog

This file tracks the remaining UI/UX work for Calcul8. It is not a general refactor plan: visual polish, brand quality, motion, accessibility, and perceived reliability are product work and belong here.

Completed refinement items are intentionally removed from this active backlog. Keep this document ordered by current user-visible priority, not by historical checklist numbers.

## Definition Of Done

Every remaining item is done only when the affected screens pass these checks:

- Mobile-first at 360x740 and 390x844, tablet at 768x1024, desktop at 1280x800 and 1440x900.
- Light and dark themes have intentional contrast, surface, border, shadow, and focus states.
- English and French text fit without clipping, overlap, layout jumps, or missing diacritics.
- Touch targets are at least 44px for primary controls, icon-only controls have tooltips or clear accessible labels, and destructive actions are visually distinct.
- Screens use shared spacing, typography, radius, elevation, icon, empty-state, loading, error, and dialog patterns unless an exception is documented.
- Visual QA screenshots exist for changed top-level screens and modals when the change affects layout, theme contrast, responsive behavior, brand polish, or public-facing presentation.

## Current Smoke Evidence

`npm run test:visual` now runs a Playwright smoke path for seeded real app-shell tabs on desktop/light/English and mobile/dark/French. Screenshots are local artifacts only and ignored by git.

The first smoke screenshots surfaced these remaining UI issues:

- Mobile screenshots show fixed bottom navigation and floating actions covering meaningful content, especially Sales charts, Portfolio charts, and lower Config inventory/totals content.
- Mobile French/dark screenshots expose aggressive truncation in the current-inventory selector and dense sale/lot cards, making the active lot and item names hard to verify.
- Mobile Config totals and inventory rows are too cramped: footer metrics can collide with labels/values, and the bottom nav cuts across the item list.
- Desktop Portfolio has chart/card content running close to or underneath persistent navigation, which makes the bottom of dashboards feel unfinished even on a large viewport.

## Critical

### Fix Mobile Shell Overlays And Safe Areas

**Why now:** The first smoke screenshots show the fixed bottom nav and floating action buttons covering real content on mobile. This is critical because the user cannot reliably read Sales charts, Portfolio charts, Config item rows, or footer totals without scrolling around persistent chrome.

**Scope:** App shell bottom navigation, contextual FAB rail, mobile Config, Live, Sales, Portfolio, Game, and report screens.

**Must do:**

- Define one mobile safe-area contract for bottom navigation plus contextual actions.
- Add consistent bottom padding or scroll affordance so the last card, table row, chart, and footer metric are never hidden behind fixed chrome.
- Prevent red primary FABs from overlapping chart cards and dashboard content on mobile.
- Verify 360x740, 390x844, and 412x915 with English/French and both themes.
- Add visual smoke assertions or targeted screenshots for the bottom of each top-level tab.

**Acceptance:**

- The last meaningful element on every top-level mobile tab is readable and tappable without being covered by nav or FAB controls.
- Mobile screenshots show a deliberate relationship between content, fixed navigation, and floating actions.

### Fix Mobile Dense-Card Legibility And Metric Fit

**Why now:** The mobile French/dark screenshots show several places where important text and metrics are technically present but visually hard to use: the current-inventory selector truncates the active lot and metadata, Config totals collide at the bottom, sale cards clamp long item names aggressively, and Portfolio lot/insight cards compress names and values into a narrow row.

**Scope:** Mobile app-shell inventory selector, Config inventory cards and totals, Sales history cards, Portfolio pulse/insight/lot-performance cards, bottom metric bars.

**Must do:**

- Give the current-inventory selector a mobile layout that exposes enough of the lot name, type, source, and date to confirm context without relying on a hidden dropdown.
- Define mobile card rules for long item and lot names: controlled two-line clamps, secondary metadata on its own line, and a detail affordance when text is intentionally abbreviated.
- Rework Config footer metrics so labels and values wrap or stack cleanly instead of colliding, especially in French and dark theme.
- Audit Sales and Portfolio metric chips for long translated labels, currency values, percentages, and profit/loss states.
- Add visual QA captures for dense-data examples with long names, accents, CAD/USD labels, and multiple metric chips.

**Acceptance:**

- A mobile user can identify the active lot, read item names, read metric labels/values, and understand profit/loss state without guessing from clipped text.
- Dense cards preserve hierarchy and spacing at 360px, 390px, and 412px widths in English and French.

### Normalize Recoverable States And Offline/Sync Feedback

**Why now:** The scan still finds many local `v-alert` surfaces and only partial migration to shared `AppEmptyState`, `AppLoadingState`, and `AppErrorState`. Recoverable failures, offline states, sync conflicts, and spectator disconnected states are highly visible because users need to know what happened and what to do next.

**Scope:** Shell offline/sync surfaces, Workspace modals, Whatnot, Singles, Live, Sales, Portfolio, Game, spectator pages.

**Must do:**

- Finish shared components or contracts for empty, loading, retryable error, permission blocked, offline, sync pending, sync failed, conflict recovery, and public disconnected states.
- Replace screen-local alert-only states where the user needs a clear title, explanation, and action.
- Separate blocking states from informational states visually and behaviorally.
- Make retry, recovery, and local-first behavior explicit in user-facing copy.
- Ensure public spectator dead-session and disconnected realtime states are readable without technical errors.

**Acceptance:**

- Recoverable paths never show a raw failure or compact alert as the only explanation.
- Similar failures look and behave the same across private app screens and public spectator surfaces.

## High

### Refine Dark-Theme Hierarchy And Contrast

**Why now:** Shared dark tokens, dark bottom navigation, integrated dark alert surfaces, and first-pass Live/Sales/Portfolio metadata hierarchy are in place. The remaining risk is that Config, the current-inventory selector, FAB hierarchy, and edge states have not had the same screenshot-backed polish pass yet.

**Scope:** Mobile dark theme across app shell, current inventory selector, Config cards, Live panel, Sales history, Portfolio cards, bottom navigation, contextual FABs.

**Must do:**

- Finish the dark contrast pass for Config fieldsets, current-inventory selector metadata, dense item cards, and footer metric labels.
- Reduce visual competition between large red/pink FABs and dark card/dashboard content on mobile.
- Verify focus, selected, disabled, destructive, offline, and recoverable alert states in dark screenshots.
- Add targeted mobile dark screenshots with long French lot/item names and multiple metric chips.

**Acceptance:**

- Dark mode has a clear information hierarchy from title to body to metadata to chrome.
- Secondary text remains readable without overpowering primary values or actions.

### Rebalance Desktop Dashboard Density And Vertical Rhythm

**Why now:** Shared desktop chart max-height, dashboard gap, and card-width tokens now cap Live, Sales, and Portfolio dashboard density. The remaining risk is lower-page composition and the persistent bottom navigation relationship once screenshots include more seeded desktop content.

**Scope:** Desktop Live, Sales, Portfolio, chart/dashboard cards, page gutters, bottom nav relationship, large empty states.

**Must do:**

- Verify the new dashboard width/chart/rhythm tokens against 1280x800 and 1440x900 screenshots with seeded content.
- Continue reducing single-card empty-stage feeling where Live has only one active panel.
- Keep dashboard sections clear of persistent navigation and contextual actions on 1280x800 and 1440x900.
- Review whether desktop top-level navigation should continue occupying a bottom bar when dashboards need vertical space.
- Add desktop smoke examples with enough content to show first-screen and lower-page behavior.

**Acceptance:**

- Desktop tabs feel intentionally composed, with balanced density and no content visually trapped under fixed chrome.
- Chart and dashboard sections scale up gracefully without becoming oversized blocks.

### Polish Brand And Public-Facing Surfaces

**Why now:** This is UI refinement work, so first impressions matter. Auth, splash, spectator pages, shared links, generated reports, and app icons are the surfaces users and viewers judge before they understand the app's workflow depth.

**Scope:** Auth gate, splash, app shell brand moments, spectator pages, share/report surfaces, icons/assets.

**Must do:**

- Define brand usage rules for logo size, icon treatment, title copy, accent color, and public-facing hierarchy.
- Make auth, splash, spectator, share, and report surfaces feel like one product family without turning operational screens into landing pages.
- Audit app icons and public pages on high-density mobile screens.
- Keep expressive treatment for spectator/game/result moments while preserving calm operational screens.

**Acceptance:**

- Public-facing screens are polished enough to share with customers/viewers.
- Brand moments feel intentional and connected across auth, splash, spectator, and reports.

### Add Accessibility Polish Beyond Basic Labels

**Why now:** The app has many accessible labels, focus helpers, and roles, but dense interactive workflows still need a consistent accessibility pass across dialogs, sticky controls, data lists, game controls, and spectator pages.

**Scope:** Shell, navigation, dialogs, forms, data lists, game controls, spectator pages.

**Must do:**

- Verify heading order and landmark structure for the main app and spectator pages.
- Confirm keyboard order in dialogs, sticky action bars, game controls, import previews, report tables, and image-preview flows.
- Standardize visible focus states through the design system.
- Ensure color is never the only signal for profit/loss, live/ended, selected/unselected, or destructive states.
- Pair this work with visual QA snapshots at high zoom where layout risk is high.

**Acceptance:**

- Core workflows are usable with keyboard, screen reader basics, and high zoom.
- Focus, disabled, selected, live, and destructive states are visible in both themes.

### Refine Motion And Perceived Performance

**Why now:** The repo still has many local transitions and animations across app chrome, spectator pages, game stage, Singles, Portfolio, and Live. Motion is cosmetic, but it strongly affects perceived quality and comfort.

**Scope:** App shell, startup splash, tab transitions, modals, cards, loading states, game stage, spectator pages.

**Must do:**

- Define motion durations/easing for screen transitions, modal transitions, hover/press, loading, and game-only celebration.
- Replace local timing literals with shared motion tokens where practical.
- Add or verify reduced-motion behavior everywhere motion is decorative, including spectator and game presentation paths.
- Use stable skeletons/placeholders where async data causes layout jumps.
- Keep operational screens subtle; reserve high-energy animation for game and spectator moments.

**Acceptance:**

- Motion supports comprehension and polish without making work screens feel noisy.
- Reduced-motion users get stable, comfortable alternatives.

## Medium

### Expand Visual QA Coverage Beyond Smoke

**Why now:** The smoke path is done, but it intentionally covers only seeded app-shell Config, Live, Sales, and Portfolio states on desktop/light/English and mobile/dark/French. The missing coverage is still useful, but it is no longer the top blocker now that a local visual QA command exists.

**Scope:** Tablet fixtures, high-risk modals, Whatnot import/review, Game wheel/grid/bracket, spectator pages, Portfolio reports, high-zoom checks, deeper overflow assertions.

**Must do:**

- Add tablet fixtures for the top-level tabs and dashboards.
- Add targeted screenshots for high-risk modals and review flows, especially Whatnot import/review and Portfolio reports.
- Add spectator and public-share captures so public-facing polish is covered.
- Add Game wheel/grid/bracket captures for both operator and spectator contexts.
- Extend overflow assertions beyond page-level overflow to nav labels, dialog titles, chips, table/list rows, sticky action bars, and French copy.

**Acceptance:**

- Broad UI changes can prove they did not regress tablet layout, public pages, game/spectator screens, reports, modals, or dense translated text.
- Visual QA remains fast enough for local use by keeping smoke and expanded coverage separable.

### Reduce Section, Card, And Toolbar Duplication

**Why now:** Large UI files are still a maintenance risk. The scan shows especially large Singles, Portfolio, Live, Config, Game, and spectator style/template files. This is not just code cleanup: duplicated visual patterns make future UI polish inconsistent.

**Scope:** `SinglesConfigWindow.css`, `PortfolioWindow.html`, `LiveSinglesPanel.*`, `ConfigWindow.*`, `GameWindow.*`, game style files, spectator styles.

**Must do:**

- Extract shared section, toolbar, summary, metric, and mobile-list patterns before adding new variants.
- Keep screen-specific CSS for genuinely screen-specific layout, game artwork, or public presentation.
- Move repeated token-sized values into app tokens.
- Split oversized templates when a section has its own state, actions, and responsive behavior.
- Use component props instead of copy-pasted class families where practical.

**Acceptance:**

- New UI work reuses existing components/classes by default.
- Large screens become easier to scan and polish without breaking unrelated sections.

### Add A Lightweight UI Component Gallery

**Why now:** Shared primitives now exist, but there is no single place to inspect them across themes, languages, and states. That slows down polish and makes visual drift harder to notice.

**Scope:** A local-only dev route, Storybook-like harness, or documentation page, depending on repo fit.

**Must do:**

- Show buttons, dialogs, state blocks, KPI cards, data cards, toolbars, chips, form fields, and table/list rows.
- Include light/dark, English/French, mobile/desktop examples.
- Include destructive, disabled, loading, selected, sync/error, offline, and empty states.
- Keep it dev-only and out of production navigation unless intentionally exposed.

**Acceptance:**

- UI changes can be reviewed in isolation before touching production screens.
- Designers/developers can compare states without opening every workflow.

## Low

### Clean Up One-Off Visual Debt

**Why now:** Once shared contracts exist, leftover one-off CSS will keep pulling screens away from the system. This is lower priority than visible quality gaps, but it should follow each completed UI slice.

**Scope:** Screen CSS, scoped Vue styles, global overrides, inline styles.

**Must do:**

- Remove unused selectors after component extraction.
- Replace inline styles with component props or tokenized classes.
- Delete duplicate section-card, chip, status, and sticky-action implementations.
- Keep only documented exceptions for game art, spectator presentation, user-selected colors, and third-party embedded UI.

**Acceptance:**

- CSS is smaller, easier to scan, and organized around reusable system primitives.
- Future UI work starts from shared components instead of copying a nearby screen.
