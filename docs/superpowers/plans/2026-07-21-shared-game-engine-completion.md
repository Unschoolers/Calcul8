# Shared Game Engine Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the existing shared game-engine architecture by replacing duplicated Wheel/Grid/Bracket infrastructure with typed session storage, lifecycle, settlement, and adapter boundaries while producing a meaningful net reduction in production TypeScript.

**Architecture:** Extend the existing game aggregate and adapter seams instead of adding a parallel framework. Keep game rules and rendering domain-specific; move repeated persistence, reset/end orchestration, sale settlement, publication effects, and compatibility behavior behind pure functions and injected ports.

**Tech Stack:** Vue 3, strict TypeScript, Vitest, local-first browser storage, Azure Functions spectator/fairness APIs

## Global Constraints

- Preserve Wheel, Mystery Grid, Bracket, spectator, fairness, inventory, sale, preview/live, offline, and recovery behavior.
- Keep canvas rendering, grid layout, dice animation, bracket resolution, and other genuinely game-specific algorithms outside the generic engine.
- Browser, network, storage, time, and id generation cross typed injected ports.
- Settlement retries must not duplicate sales or inventory deductions.
- Personal and workspace storage keys remain scope-aware; personal legacy restoration remains supported.
- Avoid new `Record<string, unknown>` component context bridges.
- Measure net production TypeScript after every task; moving lines does not count as deletion.

---

### Task 1: Shared Scoped Game Session Store

**Files:**
- Create: `src/components/windows/game/services/gameSessionStore.ts`
- Create: `tests/game-session-store.test.ts`
- Modify: `src/components/windows/game/bracket/bracketBattleHostFlow.ts`
- Modify: `src/components/windows/game/commands/wheelSessionMethods.ts`

**Interfaces:**
- Produces `GameSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">`
- Produces `GameSessionCodec<T> = { decode(value: unknown): T | null; encode(value: T): unknown }`
- Produces `readGameSession`, `writeGameSession`, and `removeGameSession`

- [ ] **Step 1: Write failing storage tests**

~~~ts
function createStorage(seed: Record<string, string> = {}): GameSessionStorage {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }
  };
}

test("reads validated sessions and contains corrupt storage", () => {
  const storage = createStorage({ good: JSON.stringify({ id: "session-1" }), bad: "{" });
  const codec = {
    decode: (value: unknown) => value && typeof value === "object" && "id" in value
      ? value as { id: string }
      : null,
    encode: (value: { id: string }) => value
  };
  assert.deepEqual(readGameSession(storage, "good", codec), { id: "session-1" });
  assert.equal(readGameSession(storage, "bad", codec), null);
});
~~~

- [ ] **Step 2: Run RED**

Run: `npm run test -- tests/game-session-store.test.ts`

Expected: FAIL because the session-store module does not exist.

- [ ] **Step 3: Implement the typed store**

~~~ts
export function readGameSession<T>(
  storage: Pick<GameSessionStorage, "getItem">,
  key: string,
  codec: GameSessionCodec<T>
): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? codec.decode(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}
~~~

Implement matching safe write/remove functions. Migrate Bracket and tier-prize reads/writes while preserving scoped keys and the existing root-session fallback.

- [ ] **Step 4: Run GREEN**

Run: `npm run test -- tests/game-session-store.test.ts tests/bracket-battle-host-flow.test.ts tests/wheel-config-session.test.ts`

Expected: PASS.

### Task 2: Typed Game Outcome Settlement

**Files:**
- Create: `src/components/windows/game/services/gameOutcomeSettlement.ts`
- Create: `tests/game-outcome-settlement.test.ts`
- Modify: `src/components/windows/game/commands/wheelSpinMethods.ts`
- Modify: `src/components/windows/game/commands/wheelSessionMethods.ts`
- Delete when unused: `src/components/windows/game/services/wheelSales.ts`

**Interfaces:**
- Produces `GameOutcomeSettlementPorts = { recordSale(lotId, sale): void; now(): Date; nextId(spinNumber?): number }`
- Produces `settleGameOutcomeSale(input, ports): Sale | null`

- [ ] **Step 1: Write failing deterministic settlement tests**

~~~ts
const input: GameOutcomeSaleInput = {
  config: { id: 5, spinPrice: 12 } as WheelConfig,
  tierId: "tier-1",
  cost: 3,
  packsCount: 1,
  deductionType: "packs",
  label: "Prize",
  lotId: 7,
  lots: [{ id: 7, sellingShippingPerOrder: 2 } as Lot]
};

test("records one deterministic game outcome sale", () => {
  const recorded: Sale[] = [];
  const sale = settleGameOutcomeSale(input, {
    now: () => new Date(2026, 6, 21),
    nextId: () => 42,
    recordSale: (_lotId, value) => recorded.push(value)
  });
  assert.equal(sale?.id, 42);
  assert.equal(sale?.date, "2026-07-21");
  assert.deepEqual(recorded, [sale]);
});
~~~

Also assert that `deductionType: "none"` records nothing.

- [ ] **Step 2: Run RED**

Run: `npm run test -- tests/game-outcome-settlement.test.ts`

Expected: FAIL because the settlement service does not exist.

- [ ] **Step 3: Implement and migrate**

Preserve exact Sale fields, fee calculation, shipping, memo text, singles quantity, linkage, and net revenue. Replace immediate spin, chase, and pending-batch sale construction with the service. Keep availability and pending-selection decisions outside it.

- [ ] **Step 4: Run GREEN**

Run: `npm run test -- tests/game-outcome-settlement.test.ts tests/wheel-spin-methods.test.ts tests/wheel-spin.test.ts tests/wheel-config-session.test.ts tests/sales-wheel-storage.test.ts`

Expected: PASS.

### Task 3: Adapter-Driven Session Lifecycle

**Files:**
- Create: `src/components/windows/game/services/gameSessionEngine.ts`
- Create: `tests/game-session-engine.test.ts`
- Modify: `src/components/windows/game/services/gameAdapters.ts`
- Modify: `src/app-core/shared/game-session-aggregate.ts`
- Modify: `src/components/windows/game/services/gameSessionAggregateAdapter.ts`
- Modify: `src/components/windows/game/services/gameSessionReset.ts`
- Modify: `src/components/windows/game/services/wheelSessionState.ts`
- Modify: `src/components/windows/game/commands/wheelSessionMethods.ts`
- Modify: `src/components/windows/game/bracket/bracketBattleHostFlow.ts`
- Modify: `src/components/windows/game/bracket/BracketBattlePanel.ts`

**Interfaces:**
- Produces `GameSessionEngineAdapter<TState> = { reset(state, execution): TState; shouldPublish(execution): boolean }`
- Produces `GameSessionEnginePorts<TState> = { persist(state): void | Promise<void>; publish(state): void | Promise<void> }`
- Produces `runGameSessionReset(state, execution, adapter, ports): Promise<TState>`

- [ ] **Step 1: Write failing lifecycle tests**

~~~ts
test("resets once and executes each allowed effect once", async () => {
  const calls: string[] = [];
  const next = await runGameSessionReset(
    { count: 4 },
    "live",
    { reset: () => ({ count: 0 }), shouldPublish: () => true },
    {
      persist: () => { calls.push("persist"); },
      publish: () => { calls.push("publish"); }
    }
  );
  assert.deepEqual(next, { count: 0 });
  assert.deepEqual(calls, ["persist", "publish"]);
});
~~~

Also prove preview reset persists without publication.

- [ ] **Step 2: Run RED**

Run: `npm run test -- tests/game-session-engine.test.ts`

Expected: FAIL because the lifecycle engine is missing.

- [ ] **Step 3: Implement and migrate**

Use adapter-owned state transformations for preview reset, live reset, loaded-state reset, and Bracket host reset/end behavior. Preserve grid reseeding, fairness and chase cleanup, pending inventory review, Bracket dice cleanup, and spectator status. Move effect fan-out out of command objects and delete obsolete effect execution/projection helpers.

- [ ] **Step 4: Run GREEN**

Run: `npm run test -- tests/game-session-engine.test.ts tests/game-session-aggregate.test.ts tests/game-session-reset.test.ts tests/bracket-battle-host-flow.test.ts tests/bracket-battle-panel.test.ts tests/mystery-grid.test.ts tests/wheel-config-session.test.ts tests/wheel-spin-methods.test.ts tests/wheel-spectator-methods.test.ts`

Expected: PASS.

### Task 4: Remove Compatibility State And Generic Wheel Naming

**Files:**
- Modify: `src/components/windows/game/coordinator/gameControllerState.ts`
- Delete: `src/components/windows/game/coordinator/gameControllerLegacyAliases.ts`
- Modify or delete: `src/app-core/shared/wheel-session-compat.ts`
- Modify: `src/app-core/shared/wheel-root-session-state.ts`
- Modify: game command/computed/service callers found by `rg`
- Modify: `tests/game-window-facade.test.ts`
- Modify: `tests/context-contracts.test.ts`

**Interfaces:**
- Consumes Tasks 1-3.
- Produces one typed owner for session state without reflective legacy alias attachment.

- [ ] **Step 1: Add failing architecture assertions**

~~~ts
test("game state has no legacy alias module or duplicate pending issue name", () => {
  assert.equal(existsSync("src/components/windows/game/coordinator/gameControllerLegacyAliases.ts"), false);
  const controller = readFileSync("src/components/windows/game/coordinator/gameControllerState.ts", "utf8");
  const commands = [
    "src/components/windows/game/commands/wheelSessionMethods.ts",
    "src/components/windows/game/commands/wheelSpinMethods.ts"
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(controller, /GAME_CONTROLLER_LEGACY_ALIAS_MAP/);
  assert.doesNotMatch(commands, /wheelSkippedDeductions/);
});
~~~

- [ ] **Step 2: Run RED**

Run: `npm run test -- tests/game-window-facade.test.ts tests/context-contracts.test.ts`

Expected: FAIL while the compatibility layer exists.

- [ ] **Step 3: Migrate and delete**

Use direct typed controller/aggregate access. Keep `wheelSkippedDeductions` only as a string-keyed legacy storage input inside the Task 1 decoder. Remove reflective alias attachment, wrapper exports, duplicate root state, and unused wheel-named generic modules only after `rg` proves zero callers.

- [ ] **Step 4: Run GREEN**

Run: `npm run test -- tests/game-window-facade.test.ts tests/context-contracts.test.ts tests/wheel-game-boundary.test.ts tests/game-adapters.test.ts tests/game-session-aggregate.test.ts tests/game-session-reset.test.ts`

Run: `npm run typecheck`

Run: `npm run typecheck:tests:web`

Expected: PASS.

### Task 5: Measure, Verify, And Update Architecture Truth

**Files:**
- Modify: `docs/refactorplan.md`
- Modify when ownership changed: `docs/c4/model/components/web.dsl`
- Modify when debt ratings changed: `docs/c4/model/technical-debt.dsl`

- [ ] **Step 1: Measure production TypeScript before and after**

Measure `src/components/windows/game`, game/wheel shared modules, and API game/wheel features, excluding tests/specs. Count all new shared engine files.

- [ ] **Step 2: Update the backlog accurately**

Remove the completed priority only if lifecycle, storage, settlement, adapters, compatibility cleanup, strict types, and verification are complete. If reduction is below 1,200 lines, retain only concrete remaining duplication with current evidence.

- [ ] **Step 3: Run final verification**

Run:

~~~powershell
npm run test -- tests/game-adapters.test.ts tests/game-domain.test.ts tests/game-session-aggregate.test.ts tests/game-session-engine.test.ts tests/game-session-reset.test.ts tests/game-session-store.test.ts tests/game-outcome-settlement.test.ts tests/game-spectator.test.ts tests/game-window-facade.test.ts tests/mystery-grid.test.ts tests/wheel-config-session.test.ts tests/wheel-game-boundary.test.ts tests/wheel-spectator-methods.test.ts tests/wheel-spin-methods.test.ts tests/wheel-spin.test.ts tests/wheel-window.test.ts tests/bracket-battle-domain.test.ts tests/bracket-battle-host-flow.test.ts tests/bracket-battle-panel.test.ts
npm run typecheck
npm run typecheck:tests:web
npm run verify:all
git diff --check
~~~

Expected: every command exits with status 0.

