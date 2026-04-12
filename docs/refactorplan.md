# Calcul8 Refactor Plan

Items grouped by priority. Completed work is removed, not tracked.

---

## Medium

### Centralize API base URL resolution and failure handling

Frontend API base URL handling is still duplicated and runtime checks are scattered:

- `resolveApiBaseUrl()` in `src/app-core/methods/ui/api-client.ts`
- `resolveCardsApiBaseUrl()` in `src/components/windows/singles/useSinglesCatalogSearch.ts`

Current callers usually guard missing configuration correctly, so this is not a critical bug. The risk is drift: future API consumers can easily re-implement base URL lookup or handle missing config differently.

Unify API base URL resolution behind one shared helper and standardize the missing-configuration behavior so new frontend API code fails consistently.

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

