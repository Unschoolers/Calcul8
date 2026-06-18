# 14. Adopt frontend utility libraries through shared wrappers

Date: 2026-06-17

## Status

Accepted

## Context

VueUse was added to reduce hand-rolled browser observer code and make responsive chart sizing more reliable. Directly importing a utility library throughout the app would make bundle control, lifecycle behavior, and future replacement harder.

The app also needs strict theme-aware and mobile-safe behavior. Utility libraries should help with that, not become another scattered dependency boundary.

## Decision

Frontend utility libraries enter the app through shared wrappers under `src/app-core`.

VueUse currently enters through `src/app-core/ui/vueuse.ts`, which wraps `useResizeObserver` as `observeElementResize`. Feature code imports that wrapper instead of importing `@vueuse/core` directly.

New utility-library adoption should follow the same pattern: one narrow adapter, explicit lifecycle ownership, focused tests, and bundle-size awareness.

## Consequences

Feature code stays easier to test and easier to change if the library API changes.

Bundle growth remains visible because app code has a small number of third-party entry points.

Shared wrappers become part of the architecture contract and should be documented or tested when they support layout, storage, network, or security behavior.
