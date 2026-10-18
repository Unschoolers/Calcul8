# Task 2: Wheel spin ownership and stale outcome guards

## Changes

- Acquire a per-context spin operation before the first fairness await and set `wheelSpinning` immediately. A second click is ignored while fairness is pending.
- Release the lock from the owning operation only. Fairness errors and pre-animation exits release it; animation completion cannot clear a newer operation's lock.
- Capture the outcome guard and a copy of the displayed slots before fairness resolves. Recheck before recording a live outcome.
- Extend outcome guards to observe wheel mode and the active, editing, displayed config and displayed slots. Scope/auth and reset revision checks remain in place.
- Invalidate pending outcomes when the actual mode handlers transition, and when a real config is loaded or applied, including same-ID operations.

## Regression evidence

New tests first failed against the original implementation: the lock remained false while fairness was deferred, and changing live mode to config during fairness still recorded a sale. The regressions now cover:

- deferred fairness with double-click and the actual live `recordSpinResult` sale path;
- fairness rejection releasing the lock;
- a live-to-config transition whose mode-dependent getters change from a $10 real config to a $20 draft, with no stale sale;
- live → config → live invalidation through the actual mode handlers;
- same-ID config load and apply invalidation;
- an old rejected operation not unlocking a newer operation.

## Verification

- `npx vitest run --config vitest.config.mjs tests/wheel-spin-methods.test.ts tests/wheel-config-session.test.ts tests/mystery-grid.test.ts --pool=forks --maxWorkers=1 --minWorkers=1` — 107 tests passed.
- `npm run typecheck` — passed.
- `npm run typecheck:tests:web` — passed.

## Follow-up review correction

The animation callback now checks both operation ownership and the captured outcome guard on each frame and again after the awaited proof request. It skips stale history, session-save, and landing effects. The operation lock remains held through proof generation and landing, and completion releases it in an owning `finally` path. Added deferred RAF and deferred proof regressions; the proof case also verifies a second spin cannot start while the proof is pending.

Follow-up verification (`TZ=UTC`): 109 focused tests passed; `npm run typecheck`, `npm run typecheck:tests:web`, and `git diff --check` passed.
