# Calcul8 Refactor Plan

Items grouped by priority. Completed work is removed, not tracked.

---

## Medium

### Consolidate duplicated API error parsing helpers

Multiple frontend method modules independently parse error JSON by checking `error` and `message` fields with the same fallback behavior.

- `src/app-core/methods/sales-live-api.ts`
- `src/app-core/methods/wheel-fairness-api.ts`
- `src/app-core/methods/ui/workspace-members.ts`

Move this into one shared helper so error contract changes do not drift across features.

### Consolidate duplicated API function error handlers

The HTTP/telemetry/error-response flow is duplicated between:

- `apps/api/src/functions/sync-function-helpers.ts` (`handleSyncFunctionError`)
- `apps/api/src/functions/salesLive.ts` (`handleEntityError`)

Both perform near-identical status extraction, warn-level telemetry for `401/403/409`, context logging, and `errorResponse(...)` mapping. Extract the shared path and keep only endpoint-specific behavior where needed.

### Add tests for whatnotRepository.ts

326 lines with zero direct tests. Service-level tests exist for callers but the repository itself is untested.

### Add tests for workspace-members.ts

179 lines extracted from `workspaces.ts` with no test coverage.

### Consolidate realtime endpoint URL constants

Room naming is now centralized in the shared `workspace-realtime-rooms` module. Remaining cleanup is only the endpoint/domain configuration still split across files:

- `DEFAULT_REALTIME_PUBLISH_URL` in `apps/api/src/lib/realtime.ts`
- `FALLBACK_REALTIME_SOCKET_URL`, `PROD_REALTIME_SOCKET_URL`, and the `whatfees.ca` host check in `src/app-core/methods/ui/workspace-realtime.ts`

Unify those defaults so domain or host changes do not require edits in multiple apps.

---

## Low

### Define workspace billing and access model

Intentionally deferred. Current state: workspace creation, membership, sync, and collaboration are open to all signed-in users. `hasProAccess` is personal-only. The `buildEntitlementDocumentId("workspace", ...)` ID scheme is ready but unused.

When workspace licensing ships:

- Introduce a separate workspace billing domain — do not stretch personal Pro into team licensing
- Add workspace billing state and workspace-level entitlement APIs
- Compute effective access by scope (`personalHasProAccess`, `workspacePlan`, `workspaceSeatStatus`, `effectiveFeatureAccess`)
- Move workspace feature gates to workspace plan/seat status
- Keep personal Pro checks for personal scope only
- Expose billing source in UI copy (personal Pro vs workspace-paid)
- Prefer grace-first rollout with enforcement behind a flag
- Candidate model: workspace subscription with per-member pricing (~$5/user/month)

### Consider splitting sales-chart-config.ts

746 lines — largest file in app-core. May benefit from extracting chart-type-specific configuration into separate modules. Tests exist.
