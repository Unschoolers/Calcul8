# Shopify production polish — browser evidence

Chromium ran a deterministic fixture that mounts the public `ShopifyLotIntegration`, `AppDialogShell`, and `AppFormLayout` components with the real Vuetify instance, Vuetify styles, `app.css`, and English/French-Canadian catalogs. Fixture callbacks return local deterministic data and never call an API or write to a merchant store.

The dedicated Playwright config builds the fixture with the app Vite config and serves it with Vite preview. The dev server cannot import the existing CommonJS inventory adapter directly; this test-only build path uses the app’s normal bundling and leaves production dependencies and domain code unchanged.

## Automated results

The following is the historical result of the completed Chromium run (19 cases). The production picker-heading wrapping, focus handoff, and binding-label contrast fixes were included in that run. Later edits to the fixture's parent title (`editLotTitle`), the French Save label, an additional linked-binding title geometry assertion, the default Playwright exclusion, and the fixture output path were not rerun in a browser. The four screenshots below are preserved from the historical run and were not recaptured. In particular, the historical created-state screenshot used a synthetic managed listing; it demonstrates the rendered binding card and success message only, not a real create response, linked-stock values, or current-status provenance. The corrected fixture now models the linked create response and later status read, but was not browser-rerun. The user explicitly waived any further Playwright, UI, or screenshot checks for closure. Fresh code, component, and type verification is the final release gate.

- 19 Playwright cases passed in Chromium: 16 combinations across 320, 390, 412, and 1366px; English and French-Canadian; light and dark themes; plus picker-to-preview focus/cancel, immediate draft binding and success, and the 320px long-title/reduced-height/enlarged-text case.
- The binding matrix checks product status, linked stock values, 4.5:1 minimum metadata-label contrast, no horizontal page overflow, reachable sticky actions, and no browser page errors.
- The empty-search transition closes the picker before opening the preview, focuses the preview heading, then returns focus to the visible parent create trigger after cancel. No hidden picker action retains focus.
- The historical long-title case checked the picker heading within the 320px viewport at 125% text size and the unbroken search-result title within its scroll pane. The additional linked-binding `scrollWidth <= clientWidth` assertion was added afterward and has not been executed; its validation was waived with the final browser rerun.
- Five covering Vue test files passed (38 tests). `npm run typecheck:tests:web` passed with the fixture, Playwright spec, and dedicated configs included.
- RED evidence: before the scoped fixes, the preview heading did not receive focus after empty-search Create; light binding metadata labels measured 1.05:1 contrast; and the enlarged French picker heading overflowed its text box. The regression assertions failed for those expected reasons before fixes.

## Screenshots

| View | Evidence |
|---|---|
| Linked stock at 320px, French, light | [linked-stock-320-fr-light.png](linked-stock-320-fr-light.png) |
| Draft preview at 320px, English, light | [draft-preview-320-en-light.png](draft-preview-320-en-light.png) |
| Created binding and confirmation at 390px, French, dark | [draft-created-390-fr-dark.png](draft-created-390-fr-dark.png) |
| Long product title at 320px, French, light, 125% text | [long-title-search-320-fr-light.png](long-title-search-320-fr-light.png) |

## Root rulings retained

> Ruling: canonical error/status contracts live in apps/api/src/shared with frontend re-exports — deployed API only packages API tree — cost if wrong: relocate pure modules, no migration.

> Ruling: connection ownership is account/workspace/requested store; lot methods also guard lot identity — connection has no lot input — cost if wrong: extend redirect guard, no migration.

> Ruling: track typed error operation in existing scoped state — selected IDs cannot distinguish failed create vs link — cost if wrong: remove field/guards, no migration.

> Ruling: explicit conflict refresh finding an authoritative binding clears stale pending link selection, preserves unsaved metadata — otherwise pending IDs block Save — cost if wrong: reselect pending variant, no stock/product write or migration.

> Ruling: fixture-only Vite configuration may prebundle the existing shared CommonJS inventory adapter, or use fixture build/preview — dev browser cannot directly import its CommonJS default; preserve production/domain code — cost if wrong: replace test-server configuration, no product change or migration.

> Ruling: retain historical screenshots solely as fixture-rendering illustrations; exclude final browser, native-device, assistive-technology and live-store claims — user explicitly waived further UI checks and environments unavailable — cost if wrong: rerun validation later, no product/state migration.

> Task5 reviewer cross-task checks resolved: catalogHandlers.ts50-63 strips stored status, matches product/variant/inventory identity, guard admits live enum only. shared/shopify-stock.ts13-22 validates quantities safe integers and ISO timestamp. AppDialogShell/theme/native browser appearance deferred Task6.

This is historical browser evidence only. The final edited revision has no fresh browser, UI, or screenshot verification by explicit user waiver. Native Android appearance, assistive technology on real devices, and development-store transactions were not exercised; no merchant connection or live store was available or used.
