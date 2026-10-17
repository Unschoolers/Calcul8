# Task 1: Preserve pending Mystery Grid settlements

## Result

Mystery Grid auto-reset now checks live pending inventory issues when scheduling and again at each delayed callback. If an issue appears during the reset animation, the callback stops the reset and clears the reset-animation flag. Preview resets retain their existing behavior.

Manual live resets return without changing session state or running persistence/publication ports while pending inventory issues exist. This preserves pending sale payloads and required lot selections.

## Regression coverage

- The actual fourth live grid reveal records three successful sales, then a failed `addWheelSaleToLot`; the persisted `pendingSale` remains after auto-reset timers, and no auto-reset timer is scheduled.
- A final multi-lot reveal retains its `requiresLotSelection` issue after timers.
- An issue added after timer scheduling prevents reset.
- An issue added after reset animation begins prevents the delayed reset callback.
- Manual live reset retains both a persisted sale and a required lot selection, and does not call persistence or publication ports.
- Full grids reset in normal and reduced-motion modes; preview auto-reset remains independent of live obligations.

## Verification

- RED: before the implementation, focused regressions showed the pending issue array cleared on auto-reset and manual reset, and the delayed reset callback changed reset state despite a new issue.
- GREEN: `VITEST_MAX_WORKERS=1 npm test -- tests/mystery-grid.test.ts tests/game-session-reset.test.ts tests/wheel-session-panel.test.ts` — 3 files passed, 30 tests passed.
- `npm run typecheck` — passed (`tsc --noEmit`).
- `git diff --check` — passed.

## Limitations

The full `npm run verify` suite was not run; validation was limited to the three focused suites and frontend TypeScript typecheck requested for this task.

## SHA-256

- `src/components/windows/game/commands/mysteryGridMethods.ts`: `bcd70f3e5bcb536592dc4bb9796d5439a664a22ff4548c0a1606ae3fd777d5c1`
- `src/components/windows/game/services/wheelSessionState.ts`: `afcbcaeb0e4626824b40b1fae0115195bd179424c91ba40da55cb55db677a6f2`
- `tests/mystery-grid.test.ts`: `e3175207844fadb00d3a6aa135aad146402d367016778951cc5147f4ca80cf7c`
- `tests/game-session-reset.test.ts`: `27e58f2d2fe40027820b1b272acd017b4696d790567f4608a7334010af7ffa30`
