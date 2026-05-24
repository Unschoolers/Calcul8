# Realtime Recovery UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build visible, safe realtime recovery for workspace hosts and public spectators, with authoritative refresh on delivery gaps and no silent overwrite of dirty local host data.

**Architecture:** Keep realtime as best-effort delivery. Add a small recovery state layer around the existing workspace socket and spectator socket, refresh authoritative API state when delivery is uncertain, and expose plain-language health states in the host account menu and spectator page. Keep server changes limited to WebSocket payload safety.

**Tech Stack:** Vue 3, Vuetify, TypeScript, Vitest, Node `node:test`, `ws`, existing Calcul8 app-core helpers, existing API realtime token/publish routes.

---

## Progress Tracking

**Current Progress:** 0%

Update this line after each completed task:

- Task 1 complete: 10%
- Task 2 complete: 24%
- Task 3 complete: 44%
- Task 4 complete: 64%
- Task 5 complete: 82%
- Task 6 complete: 94%
- Task 7 complete: 100%

## File Structure

- Modify: `apps/realtime/src/realtime-gateway.ts`
  - Adds the WebSocket payload size option and passes it to `WebSocketServer`.

- Modify: `apps/realtime/test/realtime-gateway.test.mjs`
  - Covers oversized WebSocket close behavior.

- Modify: `src/types/app.ts`
  - Expands `WorkspaceRealtimeStatus`.

- Modify: `src/app-core/state.ts`
  - Keeps default workspace realtime state as `idle`.

- Modify: `src/app-core/methods/ui/workspace/workspace-realtime-state.ts`
  - Extends socket bookkeeping with catch-up and recovered timers.

- Create: `src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts`
  - Owns host catch-up, dirty-state guard, and recovered/stale transitions.

- Modify: `src/app-core/methods/ui/workspace/workspace-realtime-socket.ts`
  - Triggers catch-up after subscribe/reconnect and exposes manual recovery.

- Modify: `src/app-core/methods/ui/workspace/workspace-realtime-events.ts`
  - Uses shared dirty-state helper and triggers refresh on unverifiable workspace events.

- Create: `src/app-core/methods/ui/workspace/workspace-realtime-methods.ts`
  - Adds UI method for manual realtime recovery.

- Modify: `src/app-core/methods/ui/workspace/workspaces.ts`, `src/app-core/methods/ui.ts`, `src/app-core/context-app.ts`, `src/app-core/context-contracts.ts`
  - Wires manual recovery into app methods/computed contracts.

- Modify: `src/app-core/computed.ts`
  - Maps richer host realtime states to labels, icons, badge classes, and manual action visibility.

- Modify: `src/app-core/i18n/locales/en/shell.json`, `src/app-core/i18n/locales/fr/shell.json`
  - Adds host recovery copy.

- Modify: `src/components/shell/AppShellTopBar.html`, `src/components/shell/AppShellTopBar.css`
  - Adds host health row action and richer badge styling.

- Modify: `src/spectator/spectatorTypes.ts`
  - Adds spectator realtime status fields.

- Modify: `src/spectator-main.ts`
  - Tracks spectator socket recovery, preserves last snapshot, and marks stale/recovered.

- Modify: `src/spectator/SpectatorApp.vue`, `src/styles/spectator.css`
  - Renders spectator confidence pill.

- Modify: `src/app-core/i18n/locales/en/spectator.json`, `src/app-core/i18n/locales/fr/spectator.json`
  - Adds spectator recovery copy.

- Modify tests:
  - `tests/workspace-realtime.test.ts`
  - `tests/computed.test.ts`
  - `tests/spectator-main.test.ts`
  - `tests/spectator-render.test.ts`
  - `tests/i18n.test.ts` if catalog completeness requires an explicit fixture update.

- Modify after implementation evidence:
  - `docs/c4/model/decisions/0009-recover-from-realtime-delivery-gaps.md`
  - `docs/refactorplan.md`

---

### Task 1: Realtime Gateway Payload Guard

**Progress After Task:** 10%

**Files:**
- Modify: `apps/realtime/src/realtime-gateway.ts`
- Modify: `apps/realtime/test/realtime-gateway.test.mjs`

- [ ] **Step 1: Write the failing oversized WebSocket test**

Add this test near the malformed body coverage in `apps/realtime/test/realtime-gateway.test.mjs`:

```js
test("closes oversized websocket messages with policy code 1009", async () => {
  const context = await startGateway({
    allowUnauthenticatedSubscribe: true,
    maxWebSocketPayloadBytes: 16
  });

  try {
    const socket = await openSocket(context.socketUrl);
    const closeEvent = once(socket, "close");

    socket.send(JSON.stringify({
      type: "subscribe",
      rooms: ["workspace:oversized:lot:1"]
    }));

    const [code] = await Promise.race([
      closeEvent,
      timeout("oversized websocket close")
    ]);
    assert.equal(code, 1009);
  } finally {
    await context.close();
  }
});
```

- [ ] **Step 2: Run the realtime test and confirm it fails**

Run:

```powershell
npm --prefix apps/realtime run build
npm --prefix apps/realtime run test -- --test-name-pattern "closes oversized websocket messages"
```

Expected before implementation: the test fails because the gateway does not configure `maxPayload`.

- [ ] **Step 3: Add the gateway option and default**

In `apps/realtime/src/realtime-gateway.ts`, extend `RealtimeGatewayOptions`:

```ts
export type RealtimeGatewayOptions = {
  allowedOrigins?: string[];
  internalApiKey?: string;
  tokenSecret?: string;
  allowUnauthenticatedSubscribe?: boolean;
  heartbeatMs?: number;
  maxJsonBodyBytes?: number;
  maxWebSocketPayloadBytes?: number;
};
```

Then define the default inside `createRealtimeGateway`:

```ts
const maxWebSocketPayloadBytes = options.maxWebSocketPayloadBytes ?? 64 * 1024;
```

And pass it to the `WebSocketServer`:

```ts
const websocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: maxWebSocketPayloadBytes
});
```

- [ ] **Step 4: Run the targeted realtime test**

Run:

```powershell
npm --prefix apps/realtime run build
npm --prefix apps/realtime run test -- --test-name-pattern "closes oversized websocket messages"
```

Expected: PASS.

- [ ] **Step 5: Run realtime verification**

Run:

```powershell
npm --prefix apps/realtime run verify
```

Expected: PASS.

- [ ] **Step 6: Update progress**

Edit this plan's `Current Progress` line to:

```md
**Current Progress:** 10%
```

---

### Task 2: Host Realtime State Contract And Display Copy

**Progress After Task:** 24%

**Files:**
- Modify: `src/types/app.ts`
- Modify: `src/app-core/computed.ts`
- Modify: `src/app-core/context-contracts.ts`
- Modify: `src/app-core/context-app.ts`
- Modify: `src/app-core/i18n/locales/en/shell.json`
- Modify: `src/app-core/i18n/locales/fr/shell.json`
- Modify: `tests/computed.test.ts`

- [ ] **Step 1: Write display mapping tests**

Add a focused test in `tests/computed.test.ts` near existing account/sync computed coverage:

```ts
test("workspace realtime display maps recovery states in English and French", () => {
  const catchingUp = appComputed.workspaceRealtimeTitle.call({
    workspaceRealtimeStatus: "catching_up",
    preferredLanguage: "en"
  } as never);
  assert.equal(catchingUp, "Catching up with cloud data");

  const recovered = appComputed.workspaceRealtimeTitle.call({
    workspaceRealtimeStatus: "recovered",
    preferredLanguage: "en"
  } as never);
  assert.equal(recovered, "Workspace data recovered");

  const stale = appComputed.workspaceRealtimeSubtitle.call({
    workspaceRealtimeStatus: "stale",
    preferredLanguage: "fr-CA"
  } as never);
  assert.equal(stale, "Actualisez pour récupérer les dernières données.");

  const actionVisible = appComputed.workspaceRealtimeManualRefreshVisible.call({
    isWorkspaceScopeActive: true,
    workspaceRealtimeStatus: "stale"
  } as never);
  assert.equal(actionVisible, true);
});
```

- [ ] **Step 2: Run the targeted computed test and confirm it fails**

Run:

```powershell
npm run test -- tests/computed.test.ts --runInBand
```

Expected before implementation: FAIL because `catching_up`, `recovered`, `stale`, and `workspaceRealtimeManualRefreshVisible` are not defined yet.

- [ ] **Step 3: Extend the realtime status type**

In `src/types/app.ts`, replace the existing union with:

```ts
export type WorkspaceRealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "catching_up"
  | "recovered"
  | "stale"
  | "disconnected";
```

- [ ] **Step 4: Add computed contract entries**

In `src/app-core/context-contracts.ts`, add:

```ts
  workspaceRealtimeManualRefreshVisible(this: AppContext): boolean;
  workspaceRealtimeManualRefreshLabel(this: AppContext): string;
```

In `src/app-core/context-app.ts`, add the same computed fields to the app context interface:

```ts
  workspaceRealtimeManualRefreshVisible: boolean;
  workspaceRealtimeManualRefreshLabel: string;
```

- [ ] **Step 5: Add English shell messages**

In `src/app-core/i18n/locales/en/shell.json`, add these keys near the existing `workspaceRealtime*` keys:

```json
"workspaceRealtimeCatchingUpTitle": "Catching up with cloud data",
"workspaceRealtimeCatchingUpSubtitle": "Refreshing the latest workspace state before applying live updates.",
"workspaceRealtimeRecoveredTitle": "Workspace data recovered",
"workspaceRealtimeRecoveredSubtitle": "Latest workspace data is current again.",
"workspaceRealtimeStaleTitle": "Workspace data may be out of date",
"workspaceRealtimeStaleSubtitle": "Refresh to recover the latest data.",
"workspaceRealtimeRefreshAction": "Refresh now"
```

- [ ] **Step 6: Add French shell messages**

In `src/app-core/i18n/locales/fr/shell.json`, add:

```json
"workspaceRealtimeCatchingUpTitle": "Rattrapage des données cloud",
"workspaceRealtimeCatchingUpSubtitle": "Récupération du dernier état de l'espace avant d'appliquer le direct.",
"workspaceRealtimeRecoveredTitle": "Données de l'espace récupérées",
"workspaceRealtimeRecoveredSubtitle": "Les dernières données de l'espace sont à jour.",
"workspaceRealtimeStaleTitle": "Les données de l'espace peuvent être en retard",
"workspaceRealtimeStaleSubtitle": "Actualisez pour récupérer les dernières données.",
"workspaceRealtimeRefreshAction": "Actualiser maintenant"
```

- [ ] **Step 7: Update display helpers**

In `src/app-core/computed.ts`, update `getWorkspaceRealtimeDisplay` with the new states:

```ts
if (status === "catching_up") {
  return {
    title: translateAppMessage(preferredLanguage, "workspaceRealtimeCatchingUpTitle"),
    subtitle: translateAppMessage(preferredLanguage, "workspaceRealtimeCatchingUpSubtitle"),
    icon: "mdi-cloud-sync-outline"
  };
}
if (status === "recovered") {
  return {
    title: translateAppMessage(preferredLanguage, "workspaceRealtimeRecoveredTitle"),
    subtitle: translateAppMessage(preferredLanguage, "workspaceRealtimeRecoveredSubtitle"),
    icon: "mdi-cloud-check-outline"
  };
}
if (status === "stale") {
  return {
    title: translateAppMessage(preferredLanguage, "workspaceRealtimeStaleTitle"),
    subtitle: translateAppMessage(preferredLanguage, "workspaceRealtimeStaleSubtitle"),
    icon: "mdi-cloud-alert-outline"
  };
}
```

Update `accountSyncBadgeClass`, `accountSyncIcon`, `accountSyncIconSize`, and `accountSyncIconClass` so:

```ts
const workspaceStatus = this.workspaceRealtimeStatus;
const isBusy = workspaceStatus === "connecting"
  || workspaceStatus === "reconnecting"
  || workspaceStatus === "catching_up";
const isProblem = workspaceStatus === "stale" || workspaceStatus === "disconnected";
```

Add computed properties:

```ts
workspaceRealtimeManualRefreshVisible() {
  return this.isWorkspaceScopeActive
    && (this.workspaceRealtimeStatus === "stale" || this.workspaceRealtimeStatus === "disconnected");
},
workspaceRealtimeManualRefreshLabel() {
  return translateAppMessage(this.preferredLanguage, "workspaceRealtimeRefreshAction");
},
```

- [ ] **Step 8: Run computed and i18n tests**

Run:

```powershell
npm run test -- tests/computed.test.ts tests/i18n.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Update progress**

Edit this plan's `Current Progress` line to:

```md
**Current Progress:** 24%
```

---

### Task 3: Host Catch-Up Helper With Dirty-State Guard

**Progress After Task:** 44%

**Files:**
- Create: `src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts`
- Modify: `src/app-core/methods/ui/workspace/workspace-realtime-state.ts`
- Modify: `tests/workspace-realtime.test.ts`

- [ ] **Step 1: Add failing host recovery tests**

In `tests/workspace-realtime.test.ts`, extend the hoisted mocks:

```ts
fetchAuthoritativeSalesMock: vi.fn(),
fetchAuthoritativeLivePricingMock: vi.fn()
```

Add mocks:

```ts
vi.mock("../src/app-core/methods/lot-sales-api.ts", () => ({
  cacheAuthoritativeSales: cacheAuthoritativeSalesMock,
  fetchAuthoritativeSales: fetchAuthoritativeSalesMock,
  normalizeSale: normalizeSaleMock
}));

vi.mock("../src/app-core/methods/lot-live-pricing-api.ts", () => ({
  fetchAuthoritativeLivePricing: fetchAuthoritativeLivePricingMock,
  normalizeLivePricing: normalizeLivePricingMock
}));
```

Add tests:

```ts
test("workspace realtime catch-up refreshes authoritative lot state and marks recovered", async () => {
  const app = createApp({
    lastSyncedPayloadHash: getSyncPayloadSignature(createSyncPayload({
      lots: [{ id: 1773766061603, name: "Lot A" }],
      currentLotId: 1773766061603,
      sales: [],
      loadSalesForLotId: vi.fn(() => []),
      wheelConfigs: [],
      activeWheelConfigId: null,
      workspaceId: "ws_dcb4d6f021637411"
    }))
  });
  fetchAuthoritativeSalesMock.mockResolvedValueOnce([{ id: 9, type: "pack", quantity: 1, packsCount: 1, price: 15, buyerShipping: 0, date: "2026-05-23" }]);
  fetchAuthoritativeLivePricingMock.mockResolvedValueOnce({
    livePackPrice: 11,
    liveBoxPriceSell: 22,
    liveSpotPrice: 33,
    version: 4
  });

  const { runWorkspaceRealtimeCatchUp } = await import("../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts");
  await runWorkspaceRealtimeCatchUp(app as never, { reason: "manual" });

  assert.equal(app.workspaceRealtimeStatus, "recovered");
  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 1);
  assert.equal(fetchAuthoritativeLivePricingMock.mock.calls.length, 1);
  assert.equal(reconcileIncomingLivePricingSnapshotMock.mock.calls.length, 1);
  assert.equal(app.pullCloudSync.mock.calls.length, 1);
});

test("workspace realtime catch-up blocks broad cloud pull when local state is dirty", async () => {
  const app = createApp({
    lastSyncedPayloadHash: "old-signature",
    sales: [{ id: 5, type: "pack", quantity: 1, packsCount: 1, price: 20, buyerShipping: 0, date: "2026-05-23" }]
  });
  fetchAuthoritativeSalesMock.mockResolvedValueOnce(app.sales);
  fetchAuthoritativeLivePricingMock.mockResolvedValueOnce(null);

  const { runWorkspaceRealtimeCatchUp } = await import("../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts");
  await runWorkspaceRealtimeCatchUp(app as never, { reason: "manual" });

  assert.equal(app.workspaceRealtimeStatus, "stale");
  assert.equal(app.pullCloudSync.mock.calls.length, 0);
});
```

- [ ] **Step 2: Run the failing host recovery tests**

Run:

```powershell
npm run test -- tests/workspace-realtime.test.ts --runInBand
```

Expected before implementation: FAIL because `workspace-realtime-recovery.ts` does not exist.

- [ ] **Step 3: Extend socket state bookkeeping**

In `src/app-core/methods/ui/workspace/workspace-realtime-state.ts`, extend `RealtimeSocketState`:

```ts
  catchUpPromise: Promise<void> | null;
  recoveredTimeoutId: number | null;
```

Initialize these fields in `getRealtimeSocketState`:

```ts
catchUpPromise: null,
recoveredTimeoutId: null
```

Add a helper:

```ts
export function clearRealtimeRecoveredTimeout(state: RealtimeSocketState): void {
  if (state.recoveredTimeoutId != null) {
    globalThis.clearTimeout(state.recoveredTimeoutId);
    state.recoveredTimeoutId = null;
  }
}
```

- [ ] **Step 4: Create the recovery helper**

Create `src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts`:

```ts
import { fetchAuthoritativeLivePricing } from "../../lot-live-pricing-api.ts";
import { fetchAuthoritativeSales } from "../../lot-sales-api.ts";
import { reconcileIncomingLivePricingSnapshot } from "../sync/lot-entity-polling.ts";
import { createSyncPayload, getSyncPayloadSignature } from "../sync/sync-payload.ts";
import {
  clearRealtimeRecoveredTimeout,
  getRealtimeSocketState,
  setWorkspaceRealtimeStatus,
  type RealtimeApp
} from "./workspace-realtime-state.ts";

export type WorkspaceRealtimeCatchUpReason =
  | "manual"
  | "subscribed"
  | "reconnected"
  | "uncertain-event";

const RECOVERED_STATUS_MS = 2500;

export function isWorkspaceRealtimeSyncClean(app: RealtimeApp): boolean {
  const expectedSignature = String(app.lastSyncedPayloadHash ?? "").trim();
  if (!expectedSignature) return false;

  const currentSignature = getSyncPayloadSignature(createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    sales: app.sales,
    loadSalesForLotId: app.loadSalesForLotId,
    wheelConfigs: app.wheelConfigs,
    activeWheelConfigId: app.activeWheelConfigId,
    workspaceId: app.activeWorkspaceId
  }));

  return currentSignature === expectedSignature;
}

function markRecoveredThenConnected(app: RealtimeApp): void {
  const state = getRealtimeSocketState(app as object);
  clearRealtimeRecoveredTimeout(state);
  setWorkspaceRealtimeStatus(app, "recovered");
  state.recoveredTimeoutId = Number(globalThis.setTimeout(() => {
    if (app.workspaceRealtimeStatus === "recovered") {
      setWorkspaceRealtimeStatus(app, "connected");
    }
    state.recoveredTimeoutId = null;
  }, RECOVERED_STATUS_MS));
}

async function performWorkspaceRealtimeCatchUp(app: RealtimeApp): Promise<void> {
  const lotId = Number(app.currentLotId);
  let broadSyncAllowed = isWorkspaceRealtimeSyncClean(app);

  try {
    if (Number.isFinite(lotId) && lotId > 0) {
      const [sales, livePricing] = await Promise.all([
        fetchAuthoritativeSales(app as never, Math.floor(lotId)),
        fetchAuthoritativeLivePricing(app as never, Math.floor(lotId))
      ]);

      if (Array.isArray(sales) && app.currentLotId === Math.floor(lotId)) {
        app.sales = sales;
      }
      if (livePricing && app.currentLotId === Math.floor(lotId)) {
        reconcileIncomingLivePricingSnapshot(app, livePricing);
      }
    }

    if (broadSyncAllowed) {
      await app.pullCloudSync();
      markRecoveredThenConnected(app);
      return;
    }

    setWorkspaceRealtimeStatus(app, "stale");
  } catch {
    setWorkspaceRealtimeStatus(app, "stale");
  }
}

export async function runWorkspaceRealtimeCatchUp(
  app: RealtimeApp,
  _options: { reason: WorkspaceRealtimeCatchUpReason }
): Promise<void> {
  const state = getRealtimeSocketState(app as object);
  if (state.catchUpPromise) return state.catchUpPromise;

  clearRealtimeRecoveredTimeout(state);
  setWorkspaceRealtimeStatus(app, "catching_up");
  state.catchUpPromise = performWorkspaceRealtimeCatchUp(app)
    .finally(() => {
      state.catchUpPromise = null;
    });
  return state.catchUpPromise;
}
```

- [ ] **Step 5: Run host recovery tests**

Run:

```powershell
npm run test -- tests/workspace-realtime.test.ts --runInBand
```

Expected: PASS for the helper tests and no regressions in existing workspace realtime tests.

- [ ] **Step 6: Update progress**

Edit this plan's `Current Progress` line to:

```md
**Current Progress:** 44%
```

---

### Task 4: Host Socket Integration And Manual Recovery Action

**Progress After Task:** 64%

**Files:**
- Modify: `src/app-core/methods/ui/workspace/workspace-realtime-socket.ts`
- Modify: `src/app-core/methods/ui/workspace/workspace-realtime-events.ts`
- Create: `src/app-core/methods/ui/workspace/workspace-realtime-methods.ts`
- Modify: `src/app-core/methods/ui/workspace/workspaces.ts`
- Modify: `src/app-core/methods/ui.ts`
- Modify: `src/app-core/context-app.ts`
- Modify: `src/components/shell/AppShellTopBar.html`
- Modify: `src/components/shell/AppShellTopBar.css`
- Modify: `tests/workspace-realtime.test.ts`

- [ ] **Step 1: Add socket integration tests**

In `tests/workspace-realtime.test.ts`, add:

```ts
test("workspace realtime runs catch-up after subscription succeeds", async () => {
  const app = createApp({
    lastSyncedPayloadHash: getSyncPayloadSignature(createSyncPayload({
      lots: [{ id: 1773766061603, name: "Lot A" }],
      currentLotId: 1773766061603,
      sales: [],
      loadSalesForLotId: vi.fn(() => []),
      wheelConfigs: [],
      activeWheelConfigId: null,
      workspaceId: "ws_dcb4d6f021637411"
    }))
  });
  fetchAuthoritativeSalesMock.mockResolvedValueOnce([]);
  fetchAuthoritativeLivePricingMock.mockResolvedValueOnce(null);

  refreshWorkspaceRealtime(app as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.triggerOpen();
  await flushMicrotasks();

  socket.triggerMessage({
    type: "subscribed",
    rooms: [
      "workspace:ws_dcb4d6f021637411:lot:1773766061603",
      "workspace:ws_dcb4d6f021637411:presence",
      "workspace:ws_dcb4d6f021637411:wheel"
    ]
  });
  await flushMicrotasks();

  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 1);
  assert.equal(app.workspaceRealtimeStatus, "recovered");
});
```

- [ ] **Step 2: Run the integration test and confirm it fails**

Run:

```powershell
npm run test -- tests/workspace-realtime.test.ts --runInBand
```

Expected before implementation: FAIL because `subscribed` only marks `connected`.

- [ ] **Step 3: Trigger catch-up after subscribe**

In `src/app-core/methods/ui/workspace/workspace-realtime-socket.ts`, import:

```ts
import { runWorkspaceRealtimeCatchUp } from "./workspace-realtime-recovery.ts";
```

Replace the `payload.type === "subscribed"` branch with:

```ts
if (payload.type === "subscribed") {
  resetRealtimeReconnectAttempts(state);
  void runWorkspaceRealtimeCatchUp(app, { reason: "subscribed" });
  return;
}
```

- [ ] **Step 4: Trigger recovery from uncertain events**

In `src/app-core/methods/ui/workspace/workspace-realtime-events.ts`, remove the local `isWorkspaceSnapshotSyncClean` helper after moving that logic to `workspace-realtime-recovery.ts`.

Import:

```ts
import {
  isWorkspaceRealtimeSyncClean,
  runWorkspaceRealtimeCatchUp
} from "./workspace-realtime-recovery.ts";
```

In `handleLotConfigUpdatedEvent`, use:

```ts
function handleLotConfigUpdatedEvent(app: RealtimeApp, payload: RealtimeEventPayload): void {
  if (app.currentLotId !== payload.lotId) return;
  if (!isWorkspaceRealtimeSyncClean(app)) {
    void runWorkspaceRealtimeCatchUp(app, { reason: "uncertain-event" });
    return;
  }
  void runWorkspaceRealtimeCatchUp(app, { reason: "uncertain-event" });
}
```

- [ ] **Step 5: Add manual recovery method**

Create `src/app-core/methods/ui/workspace/workspace-realtime-methods.ts`:

```ts
import type { AppContext, AppMethodState } from "../../../context-app.ts";
import { runWorkspaceRealtimeCatchUp } from "./workspace-realtime-recovery.ts";

export const uiWorkspaceRealtimeMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  "recoverWorkspaceRealtimeNow"
> = {
  async recoverWorkspaceRealtimeNow(): Promise<void> {
    await runWorkspaceRealtimeCatchUp(this, { reason: "manual" });
  }
};
```

Wire it into `src/app-core/methods/ui/workspace/workspaces.ts`:

```ts
import { uiWorkspaceRealtimeMethods } from "./workspace-realtime-methods.ts";
```

Add `"recoverWorkspaceRealtimeNow"` to the `Pick` union and spread:

```ts
  ...uiWorkspaceRealtimeMethods
```

Add the method to `src/app-core/context-app.ts`:

```ts
  recoverWorkspaceRealtimeNow(): Promise<void>;
```

Add it to `src/app-core/methods/ui.ts` in the exported `Pick` union:

```ts
  | "recoverWorkspaceRealtimeNow"
```

- [ ] **Step 6: Add account menu action**

In `src/components/shell/AppShellTopBar.html`, replace the workspace realtime row with:

```vue
        <v-list-item
          v-if="isWorkspaceScopeActive"
          :title="workspaceRealtimeTitle"
          :subtitle="workspaceRealtimeSubtitle"
          :prepend-icon="workspaceRealtimeIcon"
        >
          <template #append>
            <v-btn
              v-if="workspaceRealtimeManualRefreshVisible"
              size="small"
              variant="tonal"
              color="primary"
              class="account-menu-realtime-refresh"
              @click.stop="recoverWorkspaceRealtimeNow"
            >
              {{ workspaceRealtimeManualRefreshLabel }}
            </v-btn>
          </template>
        </v-list-item>
```

In `src/components/shell/AppShellTopBar.css`, add:

```css
.account-menu-realtime-refresh {
  min-width: 0;
  white-space: nowrap;
}
```

- [ ] **Step 7: Run targeted host tests**

Run:

```powershell
npm run test -- tests/workspace-realtime.test.ts tests/computed.test.ts --runInBand
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Update progress**

Edit this plan's `Current Progress` line to:

```md
**Current Progress:** 64%
```

---

### Task 5: Spectator Recovery State And Confidence Pill

**Progress After Task:** 82%

**Files:**
- Modify: `src/spectator/spectatorTypes.ts`
- Modify: `src/spectator/SpectatorApp.vue`
- Modify: `src/styles/spectator.css`
- Modify: `src/app-core/i18n/locales/en/spectator.json`
- Modify: `src/app-core/i18n/locales/fr/spectator.json`
- Modify: `tests/spectator-render.test.ts`

- [ ] **Step 1: Add failing spectator render coverage**

In `tests/spectator-render.test.ts`, add a render assertion for a ready state with stale recovery:

```ts
test("SpectatorApp renders realtime confidence for stale ready sessions", async () => {
  const html = await renderSpectatorAppHtml({
    status: "ready",
    publicSessionId: "abc123",
    realtimeStatus: "stale",
    snapshot: makeSnapshot({
      gameType: "wheel",
      sessionStatus: "live",
      outcomeSlots: [
        { name: "Prize", color: "#f00", tier: "tier-1", isChase: false }
      ]
    })
  }, "fr-CA");

  assert.match(htmlText(html), /En retard/);
  assert.match(htmlText(html), /La page garde le dernier état connu/);
});
```

- [ ] **Step 2: Run spectator render test and confirm it fails**

Run:

```powershell
npm run test -- tests/spectator-render.test.ts --runInBand
```

Expected before implementation: FAIL because `realtimeStatus` and the confidence pill do not render.

- [ ] **Step 3: Add spectator realtime types**

In `src/spectator/spectatorTypes.ts`, add:

```ts
export type SpectatorRealtimeStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "catching_up"
  | "recovered"
  | "stale"
  | "ended";
```

Update ready state:

```ts
| {
    status: "ready";
    publicSessionId: string;
    snapshot: GameSpectatorSnapshot;
    realtimeStatus?: SpectatorRealtimeStatus;
  }
```

- [ ] **Step 4: Add spectator i18n keys**

In `src/app-core/i18n/locales/en/spectator.json`, add:

```json
"spectatorRealtimeConnecting": "Connecting",
"spectatorRealtimeLive": "Live",
"spectatorRealtimeReconnecting": "Reconnecting...",
"spectatorRealtimeCatchingUp": "Catching up...",
"spectatorRealtimeRecovered": "Recovered",
"spectatorRealtimeStale": "Behind",
"spectatorRealtimeEnded": "Ended",
"spectatorRealtimeStaleBody": "Keeping the last known game state while the page retries."
```

In `src/app-core/i18n/locales/fr/spectator.json`, add:

```json
"spectatorRealtimeConnecting": "Connexion",
"spectatorRealtimeLive": "En direct",
"spectatorRealtimeReconnecting": "Reconnexion...",
"spectatorRealtimeCatchingUp": "Rattrapage...",
"spectatorRealtimeRecovered": "Récupéré",
"spectatorRealtimeStale": "En retard",
"spectatorRealtimeEnded": "Terminé",
"spectatorRealtimeStaleBody": "La page garde le dernier état connu pendant la nouvelle tentative."
```

- [ ] **Step 5: Render the confidence pill**

In `src/spectator/SpectatorApp.vue`, add a computed status map:

```ts
const realtimeStatusCopy = computed(() => {
  const status = readyState.value?.realtimeStatus
    ?? (readyState.value?.snapshot.sessionStatus === "ended" ? "ended" : "live");
  const keyByStatus = {
    connecting: "spectatorRealtimeConnecting",
    live: "spectatorRealtimeLive",
    reconnecting: "spectatorRealtimeReconnecting",
    catching_up: "spectatorRealtimeCatchingUp",
    recovered: "spectatorRealtimeRecovered",
    stale: "spectatorRealtimeStale",
    ended: "spectatorRealtimeEnded"
  } as const;
  return {
    status,
    label: t(keyByStatus[status]),
    body: status === "stale" ? t("spectatorRealtimeStaleBody") : ""
  };
});
```

Add markup below the language toggle:

```vue
    <div
      v-if="readyState"
      class="spectator-realtime-pill"
      :class="`spectator-realtime-pill--${realtimeStatusCopy.status}`"
    >
      <span class="spectator-realtime-pill__dot" aria-hidden="true"></span>
      <span class="spectator-realtime-pill__label">{{ realtimeStatusCopy.label }}</span>
      <span v-if="realtimeStatusCopy.body" class="spectator-realtime-pill__body">
        {{ realtimeStatusCopy.body }}
      </span>
    </div>
```

- [ ] **Step 6: Style the pill**

In `src/styles/spectator.css`, add:

```css
.spectator-realtime-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(100%, 620px);
  margin: 8px auto 0;
  padding: 0 16px;
  box-sizing: border-box;
  color: var(--spectator-text-muted);
  font-size: 0.82rem;
}

.spectator-realtime-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--app-radius-pill);
  background: var(--spectator-neutral);
  box-shadow: 0 0 0 3px rgba(248, 250, 252, 0.08);
}

.spectator-realtime-pill--live .spectator-realtime-pill__dot,
.spectator-realtime-pill--recovered .spectator-realtime-pill__dot {
  background: var(--spectator-success);
}

.spectator-realtime-pill--connecting .spectator-realtime-pill__dot,
.spectator-realtime-pill--reconnecting .spectator-realtime-pill__dot,
.spectator-realtime-pill--catching_up .spectator-realtime-pill__dot {
  background: var(--spectator-accent);
}

.spectator-realtime-pill--stale .spectator-realtime-pill__dot {
  background: var(--spectator-error);
}

.spectator-realtime-pill__label {
  font-weight: var(--app-font-weight-emphasis);
  color: var(--spectator-text-high);
}

.spectator-realtime-pill__body {
  color: var(--spectator-text-subtle);
}
```

- [ ] **Step 7: Run spectator render and i18n tests**

Run:

```powershell
npm run test -- tests/spectator-render.test.ts tests/i18n.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Update progress**

Edit this plan's `Current Progress` line to:

```md
**Current Progress:** 82%
```

---

### Task 6: Spectator Background Recovery Behavior

**Progress After Task:** 94%

**Files:**
- Modify: `src/spectator-main.ts`
- Modify: `tests/spectator-main.test.ts`

- [ ] **Step 1: Add failing spectator recovery tests**

In `tests/spectator-main.test.ts`, add:

```ts
test("spectator-main keeps last snapshot visible when background refresh fails", async () => {
  stubBrowser("?session=abc123");

  await importSpectatorMain();
  await flushMicrotasks();

  const socket = FakeWebSocket.instances[0]!;
  resolveSpectatorRealtimeMessageMock.mockReturnValueOnce({ action: "refresh" });
  fetchGameSpectatorSnapshotMock.mockRejectedValueOnce(new Error("fetch_failed"));

  socket.emit("message", {
    data: JSON.stringify({ type: "subscribed" })
  });
  await flushMicrotasks();

  const latestState = spectatorAppSetStateMock.mock.calls.at(-1)?.[0];
  assert.equal(latestState.status, "ready");
  assert.equal(latestState.snapshot.gameName, "Spectator Night");
  assert.equal(latestState.realtimeStatus, "stale");
});

test("spectator-main marks recovered after successful background refresh", async () => {
  stubBrowser("?session=abc123");

  await importSpectatorMain();
  await flushMicrotasks();

  const socket = FakeWebSocket.instances[0]!;
  resolveSpectatorRealtimeMessageMock.mockReturnValueOnce({ action: "refresh" });
  fetchGameSpectatorSnapshotMock.mockResolvedValueOnce({
    publicSessionId: "abc123",
    snapshot: makeSnapshot({ gameName: "Recovered Game", updatedAt: 400 })
  });

  socket.emit("message", {
    data: JSON.stringify({ type: "subscribed" })
  });
  await flushMicrotasks();

  const latestState = spectatorAppSetStateMock.mock.calls.at(-1)?.[0];
  assert.equal(latestState.status, "ready");
  assert.equal(latestState.snapshot.gameName, "Recovered Game");
  assert.equal(latestState.realtimeStatus, "recovered");
});
```

- [ ] **Step 2: Run spectator-main test and confirm it fails**

Run:

```powershell
npm run test -- tests/spectator-main.test.ts --runInBand
```

Expected before implementation: FAIL because background refresh failures currently become full error/not-found states or do not mark `realtimeStatus`.

- [ ] **Step 3: Add helper to update ready realtime status**

In `src/spectator-main.ts`, add:

```ts
function updateReadyRealtimeStatus(realtimeStatus: Extract<SpectatorPageState, { status: "ready" }>["realtimeStatus"]): void {
  if (!lastReadyState) return;
  setState({
    ...lastReadyState,
    realtimeStatus
  });
}
```

- [ ] **Step 4: Split initial load from background snapshot fetch**

In `src/spectator-main.ts`, add a raw ready-state loader above `loadState`:

```ts
async function loadReadyState(): Promise<Extract<SpectatorPageState, { status: "ready" }>> {
  const publicSessionId = getPublicSessionId();
  const baseUrl = resolveApiBaseUrl();
  if (!publicSessionId || !baseUrl) {
    throw new Error("not_found");
  }

  const result = await fetchGameSpectatorSnapshot(baseUrl, publicSessionId);
  const canonicalPublicSessionId = normalizeGamePublicSessionId(result.publicSessionId || publicSessionId);
  return {
    status: "ready",
    publicSessionId: canonicalPublicSessionId,
    snapshot: result.snapshot,
    realtimeStatus: result.snapshot.sessionStatus === "ended" ? "ended" : "connecting"
  };
}
```

Replace `loadState` with:

```ts
async function loadState(): Promise<SpectatorPageState> {
  try {
    return await loadReadyState();
  } catch (error) {
    return error instanceof Error && error.message === "not_found"
      ? { status: "not_found" }
      : { status: "error" };
  }
}
```

- [ ] **Step 5: Preserve current view during background refresh**

Replace `refreshSnapshot` with:

```ts
async function refreshSnapshot(options: { preserveCurrentView?: boolean; recoveryStatus?: "catching_up" | "recovered" } = {}): Promise<SpectatorPageState> {
  if (options.preserveCurrentView) {
    updateReadyRealtimeStatus(options.recoveryStatus ?? "catching_up");
  } else {
    setState({ status: "loading" });
  }

  try {
    const readyState = await loadReadyState();
    const nextState = {
      ...readyState,
      realtimeStatus: options.preserveCurrentView
        ? (options.recoveryStatus === "recovered" ? "recovered" : "live")
        : readyState.realtimeStatus
    } satisfies SpectatorPageState;
    setState(nextState);
    return nextState;
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") {
      const notFoundState = { status: "not_found" } satisfies SpectatorPageState;
      setState(notFoundState);
      return notFoundState;
    }
    if (options.preserveCurrentView && lastReadyState) {
      const staleState = {
        ...lastReadyState,
        realtimeStatus: "stale"
      } satisfies SpectatorPageState;
      setState(staleState);
      return staleState;
    }
    const errorState = { status: "error" } satisfies SpectatorPageState;
    setState(errorState);
    return errorState;
  }
}
```

- [ ] **Step 6: Mark socket lifecycle states**

In `connectRealtime`, set states:

```ts
updateReadyRealtimeStatus(reconnectAttempt > 0 ? "reconnecting" : "connecting");
```

On `subscribed` or realtime message action `refresh`, call:

```ts
void refreshSnapshot({
  preserveCurrentView: true,
  recoveryStatus: "recovered"
});
```

On socket `close`/`error`, before scheduling:

```ts
updateReadyRealtimeStatus("reconnecting");
```

In `applyRealtimeSnapshot`, include:

```ts
realtimeStatus: snapshot.sessionStatus === "ended" ? "ended" : "live"
```

- [ ] **Step 7: Run spectator tests**

Run:

```powershell
npm run test -- tests/spectator-main.test.ts tests/spectator-realtime-client.test.ts tests/spectator-render.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Update progress**

Edit this plan's `Current Progress` line to:

```md
**Current Progress:** 94%
```

---

### Task 7: Documentation, Plan Progress, And Full Verification

**Progress After Task:** 100%

**Files:**
- Modify: `docs/c4/model/decisions/0009-recover-from-realtime-delivery-gaps.md`
- Modify: `docs/refactorplan.md`
- Modify: `docs/superpowers/plans/2026-05-23-realtime-recovery-ux.md`

- [ ] **Step 1: Run focused verification**

Run:

```powershell
npm --prefix apps/realtime run verify
npm run test -- tests/workspace-realtime.test.ts tests/computed.test.ts tests/spectator-main.test.ts tests/spectator-realtime-client.test.ts tests/spectator-render.test.ts tests/i18n.test.ts --runInBand
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run web verification**

Run:

```powershell
npm run verify
```

Expected: PASS.

- [ ] **Step 3: Update C4 ADR after implementation evidence**

In `docs/c4/model/decisions/0009-recover-from-realtime-delivery-gaps.md`, change:

```md
## Status

Proposed
```

to:

```md
## Status

Accepted
```

Add an implementation note after the Decision section:

```md
## Implementation Notes

The host app now marks realtime recovery as catching up, recovered, stale, or disconnected and refreshes authoritative workspace state after reconnects or uncertain delivery. Public spectator pages keep the last known snapshot visible while reconnecting and refresh the authoritative public session snapshot in the background. The realtime gateway rejects oversized WebSocket messages with close code `1009`.
```

- [ ] **Step 4: Update refactor plan high item 8**

In `docs/refactorplan.md`, under `### 8. Realtime Delivery Needs Recovery, Payload Limits, And Deployment Smoke Tests`, update the finding to preserve remaining work while recording completed progress:

```md
- Progress: client recovery UX and WebSocket payload limits are implemented for workspace hosts and public spectators. Remaining work is deployment smoke coverage for token minting plus publish/subscribe, and any future durable outbox/backplane work if production usage proves refresh-on-reconnect is not enough.
```

Keep any remaining risk wording about deployment smoke tests if those tests are not implemented in this slice.

- [ ] **Step 5: Update this implementation plan to 100%**

Edit this plan's `Current Progress` line to:

```md
**Current Progress:** 100%
```

- [ ] **Step 6: Run final diff checks**

Run:

```powershell
git diff --check
git status --short
```

Expected:

- `git diff --check` prints no output.
- `git status --short` shows only intended files plus any pre-existing unrelated files, such as the bracket battle CSS work that was already dirty before this plan.

---

## Execution Order

Implement in the order above. Do not start spectator changes before host state contract changes are passing, because the shared recovery vocabulary and test language should be stable first.

After each task:

1. Run the task's targeted tests.
2. Update `Current Progress`.
3. Review `git diff --check`.
4. Do not stage or commit unrelated dirty files.

## Final Verification

Before claiming completion:

```powershell
npm --prefix apps/realtime run verify
npm run test -- tests/workspace-realtime.test.ts tests/computed.test.ts tests/spectator-main.test.ts tests/spectator-realtime-client.test.ts tests/spectator-render.test.ts tests/i18n.test.ts --runInBand
npm run typecheck
npm run verify
git diff --check
```

Expected: all commands pass.
