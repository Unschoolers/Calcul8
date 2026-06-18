# 12. One app shell

Date: 2026-06-17

## Status

Accepted

## Context

Recent UI work exposed too many intermediate tablet and desktop layouts. Sales, live pricing, portfolio, and setup screens could switch at different breakpoints, creating awkward in-between states and repeated CSS fixes.

The app is a real mobile-first workflow tool, not a proof of concept. The shell owns persistent navigation, contextual actions, snackbars, current inventory controls, and window content. If each screen invents its own layout contract, mobile and tablet regressions are hard to catch and expensive to maintain.

## Decision

The authenticated PWA keeps one shared app shell contract with named zones for content, tabs, contextual actions, bottom navigation, and snackbar placement.

Screens should prefer two primary layout modes: mobile/tablet and desktop. Desktop layouts should switch at the large breakpoint unless there is a specific product reason to split earlier. Shared primitives own repeated responsive behavior: KPI grids, panels, cards, tables, dialogs, action rails, chart wrappers, and theme-aware surfaces.

Container queries and shared design tokens are preferred over patching individual media queries when a component needs to respond to its own width.

## Consequences

Tablet and mobile should usually share one layout path.

Desktop screens can become denser, but the switch must be consistent and tested.

New UI work has to reuse shared primitives first. A new one-off responsive pattern needs a clear reason and a test that locks the intended behavior.
