# Task 5: Migrate Buyer Profiles, Whatnot, Games, And Spectator Workflows

This feature-domain task follows reviewed shared/auth/workspace/sync/commerce contracts. Work on `main`, use TDD, and permanently remove every buyer, Whatnot, spectator, and game-coordinator aggregate consumer.

## Global constraints

- Preserve buyer-profile local-first/conflict behavior, Whatnot connection/import/review behavior, game public-session behavior, wheel broadcast behavior, and spectator behavior exactly.
- Keep buyer identity, Whatnot provider state, and game state in separate owning contracts. Do not absorb them into commerce, workspace, or runtime.
- Use neutral `ScopedApiContext`, focused workspace ownership capability, auth/session capability, and runtime notifications where needed.
- No `AppContext`, `AppMethodImplementation`, `AppComputedObject`, `as AppContext`, `any`, `unknown`, or anonymous aggregate substitute aliases.
- Do not modify PWA, common UI, watcher, lifecycle, configuration, pricing, sales, or sync behavior.
- Follow TDD by removing feature files from architecture allow-lists and observing RED first.

## Buyer ownership

Create `src/app-core/context/buyers.ts`. Move these methods out of `WorkspaceMethodState` into `BuyerMethodState` without changing signatures:

```ts
hydrateBuyerProfiles(): Promise<void>;
getBuyerProfile(username: string): BuyerProfile | null;
saveBuyerProfile(draft: { username: string; preferredName?: string; tags: string[] }): Promise<"saved" | "pending" | "conflict" | "error">;
retryPendingBuyerProfiles(): Promise<void>;
resolveBuyerProfileConflict(username: string, strategy: "retry" | "reload"): Promise<"saved" | "pending" | "error" | "reloaded">;
```

Update `AppMethodState` to extend `BuyerMethodState` and preserve its exact aggregate surface. Define named buyer API/cache/store/method contexts and migrate aggregate consumers in `src/app-core/methods/ui/buyers`.

## Whatnot and game ownership

- Extend `context/whatnot.ts` with named HTTP, review, status, sales-refresh, connection, and method implementation contexts.
- Extend `context/game.ts` with named public-session, broadcast, and coordinator capability contracts.
- Migrate aggregate consumers in `methods/ui/whatnot`, `methods/ui/spectator`, and `components/windows/game/coordinator/gameControllerState.ts`.
- Replace authenticated-fetch casts with focused structurally compatible contexts; preserve CSRF/session-first options and error behavior.
- Method objects use `FeatureMethodImplementation` with exact method subsets.

## Architecture test cycle

1. Remove all buyer, Whatnot, spectator, and game coordinator files from temporary aggregate allow-lists and add recursive feature assertions.
2. Run `npm run test -- tests/context-contracts.test.ts`; record the correct RED failures.
3. Migrate until GREEN. Never re-add migrated files or aggregate casts.

## Verification

Run:

```text
npm run test -- tests/context-contracts.test.ts tests/buyer-profile.test.ts tests/buyer-profile-cache.test.ts tests/buyer-profile-store.test.ts tests/buyer-quick-view.test.ts tests/whatnot-ui-methods.test.ts tests/whatnot-review-decisions.test.ts tests/whatnot-review-dialog.test.ts tests/whatnot-csv.test.ts tests/game-spectator.test.ts tests/game-spectator-client.test.ts tests/game-window-facade.test.ts tests/game-stage-overlay-controller.test.ts tests/wheel-spectator-methods.test.ts tests/wheel-spectator.test.ts tests/wheel-game-boundary.test.ts
npm run typecheck
npm run typecheck:tests:web
npm run verify:all
git diff --check
```

All must pass. Self-review for runtime changes, provider leakage, scope/auth option changes, import cycles, casts, duplicated ownership, and missing aggregate members.

Commit only this domain with message `refactor(web): scope provider and game contexts`.

## Report

Write `.superpowers/sdd/task-5-report.md` with files changed, RED evidence, focused/full verification evidence, commit hash, and concerns. Return only status, commit hash, one-line test summary, and concerns.
