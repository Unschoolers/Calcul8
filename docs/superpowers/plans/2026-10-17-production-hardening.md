# Production integrity hardening

User authorized fourteen Luna implementation tasks and independent Sol validation. No backup/restore work, production changes, main push or deployment. Prepare a feature PR. Base ef1da9afc0a036f637ba6816e8e5788640e6e6a9.

The prior scratch environment was reset before feature branches were published. Prior local commits are unavailable. Reconstruct from the accepted audit and explicit Sol findings below; no prior success claim transfers to reconstructed code without verification.

## Tasks and dependencies

1. Preserve pending Mystery Grid settlements across delayed/manual reset.
2. Acquire spin lock before first await; guard scope/auth/config/mode/display changes and own cleanup.
3. Scope live-price queue by auth/workspace/lot visit; one bounded conflict retry; real-app auth effects only for owning request.
4. No-op pull must preserve unsent dirty baseline.
5. Server atomic inventory validation across all sale IDs and trusted external writers; batch status fail closed; snapshot meta CAS.
6. Refresh revocation wins all rotation races; expire blocked; credential-bound logout invalidates successor access sessions even when old access expired/missing.
7. Durable chase obligation before animation, stable sale retry identity, compatible codecs. Depends1/2.
8. Clean409 recovery must not deadlock or let queued readers overwrite concurrent local edits. Depends4.
9. Idempotent sale mutation replay including tombstones, canonical payload+baseVersion identity, atomic storage. Depends5.
10. Reject Whatnot CSV above250 before side effects.
11. CSV merges add row quantity, preserve sync/append semantics.
12. CAD portfolio aggregation: native calculations first, final monetary values converted once, charts/customer/user/quickview labeled CAD; editor native.
13. Exact active-generation reads with post-query meta verification; supersession markers retain24h, preserve fresh/active/unknown, fail-closed publication.
14. HTTP realtime catch-up must not overwrite newer WS update/delete or scope/lot visit; prevent fetch cache side effects and storms. Depends3.

## Execution

One isolated worktree per task; six child slots maximum, reserve Sol review capacity. Worker tests one Vitest worker. Add meaningful failing regressions, fix, focused tests/types, commit. Root reviews and integrates approved commits then verify:all and Android config check. No deployment.

## Review rulings retained

- Same numeric config ID is insufficient: real apply/load, mode live/config A-B-A, mutable display/source and reset must invalidate stale outcomes; actual record methods must be tested.
- Pricing lotHydrationRevision must be captured before queue/hydration and checked before each dispatch/completion/retry. Passing spread-copy app hides auth changes; separate captured request scope from real app. Late401 must not clear newer auth.
- Clean409 direct pull avoids circular await, but ordinary queued external pull callers must share its guard/result so edits survive both during response and subsequent queue drain. ForceApply remains explicit.
- Stock guard read/create precedes authoritative data; contention rereads/revalidates whole state; sale transaction also CAS-replaces captured meta without changing it. Trusted Shopify/Whatnot bypass rejection of real external orders but advance same guard. Overlay snapshot/entities by sale ID incl tombstones. Singles per-entry plus total, bulk sealed/open-pack constraints. Nonincreasing historical oversold edits must remain possible without moving excess consumption to another entry.
- Cosmos resolved batch can contain failures: exact expected result count, top code and every status must be valid2xx; malformed fails closed;409/412 retry bounded.
- Refresh logout must validate current/immediate-previous secret on fresh row, owner constraint when verified access owner exists, work with refresh cookie alone, CAS revoke before deleting associated access row, retain association until successful delete so retry can finish. Test actual auth+repository with in-memory ETag transport and handler expiry ordering.
- Snapshot retention clock begins at confirmed supersession, not generation creation. Null metadata only equals null; present metadata requires matching nonempty ETag/version/generation. Cleanup awaited best effort after confirmed publication; never report failed batch success.
- Sales replay fingerprint includes sorted canonical operation+scope+lot+sale+original baseVersion+payload and is stored atomically. Same ID changed request409; later mutation cannot be rolled back.
- CAD conversion occurs after native fee/profit/forecast calculations, once. Counts/percentages/native sale editor stay native.

## Final continuation rulings

Six tasks1/2/3/4/10/11 survived in remote2a5258b. Reconstruct remaining tasks5/6/7/8/9/12/13/14 from accepted behavior; publish EACH worker committed candidate to its own remote branch before final review, so interruptions cannot erase completed work. No main/deployment.

- Inventory: supported paid unlinked singles count aggregate capacity; reject forged nonempty references. Wheel0 is legitimate noninventory paidspot; pack/RTYH requirepositive consumption. Nonincreasing historical edits cannot shift consumption to another entry/resource. Honor entity-mode vs legacy snapshot semantics; snapshot-only delete materializes tombstone. Shared meta/preset loader guard-first, exact generation, bounded churn409.
- Logout: valid refresh capability current/previous secret works without old access. Supported verified-access-only fallback must also win rotation races. Use stable server-only family link on access sessions, setnew and conditionally backfill legacyold BEFORE rotationCAS, rereadlink when query misses, owner-bound family revoke despite associationchange. Deleteold+successor beforeclearing association; failure retryable/no false success.
- Retention tests must actually discover active marked candidate, preserve fresh/unmarked, keep old generation after partialstaging or finalmetadata412, provecleanup awaited and rejection best effort. Preserve both changed-valid AND missing ETag cases.
- CAD: normalize finitepositive rate BEFORE native crosscurrency costs/fees/profit/forecast and final conversion, not just final helper. Reports desktop/mobile and copied/savedTSV explicitlyCAD.
- Realtime: catchup broad app.pullCloudSync() can overwrite WS before laterentityguards; guard the ACTUAL fullsync pre-apply stage or avoid its unsafeentityeffects. Tests must use real sync coordinator/pull with deferredHTTP plusWS event, not mocked app.pullCloudSync. PreserveTask8 queuedreader coalescing and explicitforceApply semantics.
