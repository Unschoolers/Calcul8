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

## Critical

### Add Visual QA For Real Screens

**Why now:** The current repo has strong unit/template coverage, but no obvious screenshot/visual-regression command in `package.json`. That leaves the most important UI risks unguarded: French text fit, theme contrast, mobile overflow, modal spacing, and public spectator/report polish.

**Scope:** Top-level tabs, high-risk modals, spectator pages, reports, light/dark themes, English/French.

**Must do:**

- Add browser screenshot coverage for the app shell and each top-level tab in light and dark themes.
- Capture mobile, tablet, and desktop fixtures for Singles config, Whatnot import/review, Live singles, Sales, Portfolio, Game wheel/grid/bracket, spectator pages, and Portfolio reports.
- Add overflow assertions for nav labels, dialog titles, chips, table/list rows, sticky action bars, and French copy.
- Add a local visual QA command and checklist for major UI work.

**Acceptance:**

- A UI refinement can prove it did not break mobile layout, theme contrast, public pages, or French text fit.
- The visual QA path is documented and runnable locally before merging broad UI changes.

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
