# Vue Testing Library Design

## Goal

Add a fast, maintainable Vue Testing Library test layer that verifies ten representative user interactions across the Calcul8 web application. The layer complements the existing unit, template-compilation, and visual smoke tests; it does not replace them or add browser end-to-end tests.

## Scope

The first delivery installs Vue Testing Library and its DOM environment, provides a shared rendering harness for Vue and Vuetify components, and introduces ten DOM-level scenario tests. Each scenario renders a real component, interacts through user-observable controls, and checks a visible result, emitted update, or mocked boundary call.

The suite deliberately excludes Playwright, live APIs, Cosmos, browser authentication, and real persistence. Those boundaries are represented by explicit context callbacks or component props.

## Test Runtime

`@testing-library/vue` will run under Vitest with jsdom. The dedicated Vue test configuration will:

- use the Vue Vite plugin and jsdom environment;
- load a setup module that registers automatic DOM cleanup and matcher support;
- retain an opt-in `npm run test:vue` script so existing node-based unit suites remain unchanged;
- include only DOM-oriented Vue Testing Library test files.

The test-support render helper will install the real Vuetify plugin and accept a small `appCtx` object. Components already use `ctx` or the injected `appCtx` bridge, so tests can supply only the translations, reactive values, and boundary functions each scenario needs. Tests will query accessible roles, labels, and rendered text; test ids are reserved for dynamic collections that cannot be located accessibly.

## Scenario Suite

The first ten scenarios are distributed across the product rather than concentrated in one feature.

1. **Live pricing:** selecting the increase-price control emits the next price.
2. **Live pricing:** selecting a displayed price scenario emits that scenario's price.
3. **Live pricing:** a remaining-price gap presents the user with the back-to-target recommendation.
4. **Sales:** a seller can populate the sale editor's required details and submit a valid sale through its supplied save boundary.
5. **Sales:** cancelling the sale editor closes it without invoking the save boundary.
6. **Whatnot import:** a recognized CSV preflight renders its importable/skipped totals and enables preparation for review.
7. **Whatnot import:** an incomplete mapping keeps preparation disabled and lets the seller close the import dialog.
8. **Authentication:** an available Google fallback presents its action and invokes the supplied sign-in boundary.
9. **Workspace:** cancelling an open workspace dialog clears only its local dialog state and does not call the join/create boundary.
10. **Profit calculator:** a user without paid access sees the upgrade affordance and cannot apply a protected pricing calculation.

If a selected component proves too tightly coupled to the full application lifecycle, the test will target its smallest existing child component or dialog with the same user-visible outcome. Production behavior will not be changed merely to make it testable; any necessary seam must be a reusable, typed component boundary.

## Boundaries and Maintainability

No root-app mount is part of this delivery. Mounting the full shell would pull session bootstrap, storage hydration, and network coordination into every test, making feedback slower and failures less diagnostic. Scenario tests instead own a short context factory per feature area and mock only external effects.

The tests must not assert Vuetify's implementation details, CSS classes, internal component state, or translation keys. They should assert what a seller can see and do in English, with a minimal translation function in test context. French remains covered by the existing i18n contract tests; each new test must leave all user-facing production strings translatable.

## Verification

The implementation will use test-driven cycles: first add each failing scenario, observe the expected failure, then add only the configuration, harness, or production seam needed to make it pass. The focused Vue suite, the web test typecheck, and the normal web verification command will be run before completion. Dependency additions will use the lockfile and stay in `devDependencies`.
