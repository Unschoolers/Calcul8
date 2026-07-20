# Repo-Wide AppContext Migration Design

**Date:** 2026-07-20  
**Status:** Approved

## Summary

Calcul8 will complete the `AppContext` breakup across the frontend instead of leaving a partial migration. The work is one continuous refactoring campaign executed through domain-sized commits on `main`. Runtime behavior, storage semantics, API contracts, and the current Vue Options API composition remain unchanged.

Completion means no leaf module imports `AppContext` or uses `AppMethodImplementation`. `src/app-core/context-app.ts` may declare the aggregate and `src/app-core/context.ts` may re-export it; no other frontend file may reference it. Vue composition validates focused state and method contracts without granting the aggregate context to leaf implementations.

## Goals

- Make every leaf module declare only the state, computed values, methods, and Vue runtime capabilities it consumes.
- Keep authentication, entitlements, workspace, sync, commerce, buyer profiles, Whatnot, games, and runtime concerns in their owning contracts.
- Prevent new aggregate dependencies with repository-wide architecture tests.
- Preserve strict TypeScript completeness checks at the composition root.
- Finish the migration in one campaign while retaining small, independently verified commits.

## Non-Goals

- Replacing the Vue Options API with Pinia or a different state-management system.
- Changing application behavior, UI, persistence, API payloads, or synchronization policy.
- Reorganizing unrelated components or reducing line count through cosmetic rewrites.
- Creating anonymous `Pick<AppContext, ...>` aliases that merely rename the aggregate dependency.

## Selected Approach

Migrate by domain, in dependency order. Each domain receives named capability contracts and focused method implementation types. Cross-domain consumers depend on the smallest public capability contract exposed by the owning domain.

A file-by-file mechanical migration was rejected because it would create scattered anonymous types without clear ownership. Replacing the state-management architecture was rejected because it would mix behavioral change with a type-boundary refactor and substantially increase regression risk.

## Contract Architecture

Focused contracts live under `src/app-core/context`. Each domain may expose:

- computed state owned by the domain;
- method state owned by the domain;
- one or more focused contexts for coherent workflows;
- a focused computed or method implementation type;
- shared public capability subsets required by other domains.

Low-level contracts such as scoped authenticated API access remain neutral and must not depend on sales, workspace UI, or provider-specific capabilities.

Authentication covers identity and session state only. Entitlement and billing capabilities receive a separate contract. Workspace membership and selection remain distinct from deterministic cloud synchronization. Buyer profiles, Whatnot, and games receive their own feature contracts instead of being absorbed into commerce or runtime.

The root aggregate continues to prove that the assembled Vue application satisfies every focused state and method contract. It is not a contract that leaf modules may consume.

## Method Implementation Types

Replace `AppMethodImplementation` with focused implementation types. A method object must declare both the methods it implements and the context available through `this`. This keeps implementation completeness while preventing unrelated application capabilities from becoming visible.

Composition modules may combine focused method objects and validate the result against `AppMethodState`. They must not grant the aggregate `AppContext` to each leaf implementation.

## Domain Order

### 1. Shared Runtime, Identity, And Entitlements

- Finish neutral runtime and authenticated API capability contracts.
- Migrate session, account, sign-in, entitlement status, purchase verification, Stripe, and Play purchase modules.
- Separate profile/session capabilities from billing and Pro-access capabilities.

This domain establishes the authentication and notification dependencies needed by later API-facing domains.

### 2. Workspace And Sync

- Migrate workspace API, membership, invites, realtime, scope selection, and UI helpers.
- Migrate sync payload, apply, status, service, and entity polling modules.
- Keep scope resolution centralized and make personal/workspace requirements explicit.

This domain receives early priority because an overly broad context can hide cross-scope reads and writes.

### 3. Commerce, Configuration, Sales, And Portfolio

- Migrate lot configuration, pricing, storage, live pricing, sales persistence, sales freshness, charts, and sale methods.
- Reuse the existing commerce and portfolio contracts, splitting them further when a workflow has a smaller coherent capability set.
- Preserve local-first storage, authoritative entity behavior, optimistic concurrency, and chart scheduling.

### 4. Buyer Profiles, Whatnot, Games, And Spectator Workflows

- Migrate buyer-profile API and store methods.
- Migrate Whatnot HTTP, review, connection, and import methods.
- Migrate wheel/game spectator publishing and coordinator state.
- Keep provider-specific and game-specific capabilities out of shared runtime contracts.

### 5. Application Runtime Composition

- Migrate PWA, onboarding, common UI methods, watchers, and lifecycle hooks.
- Split watcher typing by owning concern instead of using one watch-wide aggregate context.
- Type lifecycle dependencies explicitly from focused public contracts.
- Remove obsolete aggregate computed and method implementation helpers.

## Data And Error Semantics

This is a type-boundary refactor. Existing runtime data flow and error handling remain authoritative. No catch behavior, fallback behavior, local storage key, scope selection, request option, or retry policy may change merely to satisfy a type.

If TypeScript exposes a genuine cross-domain dependency, the owning domain exports a narrow capability interface. Casts to `AppContext`, `unknown`, or `any` are not acceptable substitutes. Existing necessary boundary normalization and safe error handling remain intact.

## Architecture Enforcement

`tests/context-contracts.test.ts` will expand as each domain migrates. The final guard will scan the frontend TypeScript tree and fail when:

- a leaf module imports `AppContext`;
- a leaf method object uses `AppMethodImplementation`;
- a focused context imports a higher-level aggregate contract;
- generic API transport depends on a feature-specific cache or provider contract;
- an implementation bypasses focused contracts with an aggregate cast.

The final source scan permits `AppContext` only in `src/app-core/context-app.ts` and its `src/app-core/context.ts` barrel re-export. `AppMethodImplementation` and `AppComputedObject` have no remaining source references or declarations. This exact allow-list is named in the test and justified in the C4 component model.

## Commit And Verification Strategy

Each domain is one or more coherent commits. Before each commit:

- add or tighten the architecture test so the old dependency fails;
- run strict frontend and test TypeScript checks;
- run the smallest behavior suites covering the migrated domain;
- run `git diff --check`.

Run `npm run verify:all` after every completed domain and again after final cleanup. A domain is not complete while its leaf modules still import the aggregate context.

## Documentation

- Keep the C4 web component boundary aligned with the actual composition allow-list.
- Update `docs/refactorplan.md` during the campaign only when the remaining scope changes materially.
- Remove the feature-scoped context migration backlog item when the final architecture guard passes.

## Acceptance Criteria

- Only `src/app-core/context-app.ts` and `src/app-core/context.ts` reference `AppContext`.
- `AppMethodImplementation` and `AppComputedObject` have no remaining frontend source references.
- No focused contract depends on the aggregate context.
- Authentication and entitlements are separate domains.
- Workspace and sync contracts make scope-sensitive dependencies explicit.
- All existing runtime behavior tests remain green without weakening assertions.
- Strict application and test TypeScript checks pass.
- `npm run verify:all` and `git diff --check` pass.
- C4 and refactoring documentation describe the completed architecture rather than an active partial migration.
