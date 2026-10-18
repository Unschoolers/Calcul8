# Sol6.1 integration review

## Task5 shared batch helper only

SPEC COMPLIANCE: APPROVED. CODE QUALITY: APPROVED. Original0212e29 + followupb2362dd. Read full helper and tests; independent focused helper run3/3 passed. Rejects malformed/incomplete/non2xx responses, handles409/412 incl424peers. Stock implementation remains pending.

Baseline source main ef1da9a reconfirmed remote unchanged. Dependency installs completed. Prior baseline2598 tests passed before environment reset at this same source; final verification will rerun against reconstructed integration.

## Task1

SPEC COMPLIANCE: APPROVED. CODE QUALITY: APPROVED. Reviewed actual reset scheduling, both callbacks and manual reset engine boundary. Independent three-file run30/30 passed (TZ=UTC); pendingSale and required source selections preserved, preview remains independent. Integrated d3ab9cf via cherry-pick.

## Task10

SPEC COMPLIANCE: APPROVED. CODE QUALITY: APPROVED. Reviewed prevalidation before side effects,250 processing, original frontend error retention path and regressions. Independent full importService23/23 and UI7/7 passed with TZ=UTC. Three old grouping tests fail on BOTH baseline and worker in runtime default Asia/Bangkok; UTC run matches CI and resolves them without production changes. Integrated dd3b103 and ed9fc2d via cherry-pick.

## Pending Task2 review

Pre-fairness/config/mode guards now cover prior findings. CHANGES REQUIRED: animation/proof completion remains unguarded and releases lock before awaited proof request; stale old completion can write into new context or overlap a new same-config spin. Awaiting regression and owning-completion fix.

## Task4

SPEC COMPLIANCE: APPROVED. CODE QUALITY: APPROVED. No-op branches no longer assign unsent current payload signature to baseline. Actual pull→push regressions exercise queue and normal snapshot policy; independent sync-service/sync-status run36/36 passed (UTC). Integrated484fdfe by cherry-pick.

## Task2 follow-up

SPEC COMPLIANCE: APPROVED. CODE QUALITY: APPROVED. Reviewed synchronous acquisition, token-owned cleanup, mode/source snapshots and monotonic real apply/load/mode/reset invalidation. Followup09cf2d1 checks owned animation and post-proof completion; lock held through proof+landing. Independent spin/config90/90 passed (UTC). Existing adjacent grid tests independently validated in Task1. Root added a warning for unexpected visual/completion exceptions so the new cleanup catch does not silently hide persistence/landing failures. Original9319fc5 + followup09cf2d1 integrated by cherry-pick.

## Task11

SPEC COMPLIANCE: APPROVED. CODE QUALITY: APPROVED. Both merge paths add normalized row quantity; sync/append and ambiguous matches retain semantics. Independent import suite21/21 passed (UTC). Integrated7bb67d2 by cherry-pick.

## Pending Task3

CHANGES REQUIRED: manual scope equality omits monotonic workspace revision from captureWorkspaceScopeGuard; A→B→A before lot hydration can retain all compared fields. Request central guard capture and real scope-setter regressions. Late401/retry ownership changes otherwise reviewed.

## Task3 follow-up

SPEC COMPLIANCE: APPROVED. CODE QUALITY: APPROVED. Central scope visit guard and lot hydration revision now fence dispatch, hydration, conflict GET and retry completion. Captured URL/body scope uses centralized helpers, auth operates on real app and optional ownership guards stop late401/retries/CSRF side effects from expiring newer auth. Bounded conflict retry preserves queued edits. Independent four-suite65/65 passed (UTC). Integrated4c783e6 +1ebe59f by cherry-pick.

## Continuation verification — 2026-10-17

Integrated Task 8 candidate f7463eb as 0c49bd0 after Sol source review. Added a real-coordinator happy-path regression (3ffb971); both local-edit timing regressions and explicit force overwrite remain covered. Corrected the older CSV regression to expect existing 2 + imported 5 + imported 1 = 8 (c54fa18).

`TZ=UTC VITEST_MAX_WORKERS=2 npm run verify:all` exited 0: web 1717 tests, Vue 214 tests, API 690 tests; realtime verification, production/test types, shared contracts, security scan and build passed. Android compliance script with --skip-dependency-insight passed (targetSdk 36, billing 8.3.0). This checkpoint covers the seven integrated tasks only; remaining worker candidates are not yet validated as a combined branch.

Remote checkpoint publication was rejected by automatic approval review because explicit destination authorization for Unschoolers/Calcul8 is absent from the visible transcript. No bypass or alternative publication attempted. Local implementation and review continue.

### Independent Sol follow-up: Tasks 8 and 13

Sol reviewed Task13 7a0136f + ff95810 and approved within scope; 27 focused tests passed. Best-effort failed retirement markers may leave orphan generations unmarked; no active generation is retired on failed publication.

Sol found that metadata payload signatures deliberately omit sales, allowing a concurrent local sale change to be overwritten by a legacy conflict-recovery snapshot. Added a separate pre-dispatch local sales fingerprint (active, stored and cached views), checked by recovery pre-GET, post-response/JSON, and immediately before apply. Two real-payload/default-apply tests (during POST and recovery GET, two ordinary queued pulls) both fail without the new predicate and pass with it; persisted and in-memory sales remain unchanged. Sol independently approved the correction and passed production typecheck plus 37 sync-service tests. No-op pushes skip fingerprint work.

### Task 12 Sol review

Sol independently traced native-first conversion/fees/profit/forecasts, customer/user/history paths and report/TSV labels; 217 focused tests passed. Required explicit CAD labels on performance gain/loss summary were added in 7316c92 after integrating59b9979 as aa4120c. Six integrated focused suites passed (203 tests).

### Remaining review blockers

Task5 source candidates fe6d693/6f3ae67 not approved standalone: Sol found historical oversold resource shifting into valid state and positive singles sales with zero summed physical lines; fixes delegated into Task9 shared module. Task6 f46a0a2 not approved yet: legacy access fallback delete can race rotation; failed cleanup response cleared credentials before retry. Worker adding stateful regressions and conditional cleanup. Task14 candidate3406572 awaits independent Sol review. Task7 and9 remain in implementation.

### Nine-task integration gate

After integrating Tasks12/13 and Sol-required labels, `TZ=UTC VITEST_MAX_WORKERS=2 npm run verify:all` exited0: web1729, Vue214, API700 tests, plus realtime checks, production/test typechecks, shared contracts, security scan and build. Remaining Tasks5/6/7/9/14 still await closing independent review findings. Publication remains blocked by destination authorization; no remote write retried.

### Final independent server review — Tasks 5, 6, 9

Sol approved auth f46a0a2/0a753c5/b150cdd and inventory/replay fe6d693/6f3ae67/6fbea58/810f962. Independent checks: 46 auth tests and 53 repository/HTTP sales tests, API typecheck and diff check passed. Task6 uses separate fresh bearer bootstrap access/families; actual concurrent rotation/logout and retry regressions cover cleanup. Task9 adds an immutable scope-wide mutation identity document atomically with guard, sale/tombstone and unchanged metadata CAS; omitted baseVersion checks version0, fingerprints preserve omitted-vs-explicit0, old replay/reused changed ID conflicts. Raw orphan snapshot fallback removed to match canonical preset-only reads. The extra ledger document per sale mutation is retained to enforce identity across later edits. Root integrated approved source as264076f/0da4f7b/f175995 and9b7ef13/691e419/c209f2c/ad7f393. Twelve tasks are integrated; Task7/14 client review remains open.

### Final client approval and complete integration gate

Sol approved Task7 5fc50b0/10520a0/f8bd5fb and Task14 3406572/e83c7af/2c45752, including actual loadLot child HTTP races, dirty state, bounded follow-up, queue ownership and realtime chase visibility/source checks. Root integrated these changes and Sol independently validated their overlap (157 standard +2 Vue tests). Full gate initially caught an obsolete batch-button template assertion; updated in fb7267f after verifying reviewed eligible-ordinary-sales behavior. Targeted33 tests passed. Fresh combined verify:all exited0: web1760, Vue215, API743; types, shared, security, realtime and builds passed. Android configuration compliance and diff check passed. Full details: final-review.md. Publication remains blocked by automatic review; no bypass or remote write retry attempted.
