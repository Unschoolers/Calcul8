import assert from "node:assert/strict";
import { test } from "vitest";
import {
  clearScopedSalesStorage,
  clearScopedSyncDataStorage,
  getSalesCacheStatusKey,
  getSalesSyncMetaKey,
  getSalesStorageKey,
  getScopedActiveWheelConfigStorageKey,
  getScopedBracketBattleSessionStorageKey,
  getScopedLastLotStorageKey,
  getScopedLastSyncedPayloadHashKey,
  getScopedPresetsStorageKey,
  getScopedSyncClientVersionKey,
  getScopedSystemPricingDefaultsStorageKey,
  getScopedWheelConfigsStorageKey,
  readStorage,
  removeStorage
} from "../src/app-core/storageKeys.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  length: number;
};

function withMockedLocalStorage(run: (storage: MockStorage, data: Map<string, string>) => void): void {
  const original = (globalThis as { localStorage?: MockStorage }).localStorage;
  const data = new Map<string, string>();

  const storage: MockStorage = {
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, String(value));
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    clear(): void {
      data.clear();
    },
    key(index: number): string | null {
      const keys = [...data.keys()];
      return keys[index] ?? null;
    },
    get length(): number {
      return data.size;
    }
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
  });

  try {
    run(storage, data);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original
    });
  }
}

test("readStorage reads only the requested current key", () => {
  withMockedLocalStorage((_, data) => {
    const canonicalKey = getSalesStorageKey(10);
    const currentSales = JSON.stringify([{ id: 1, price: 7 }]);

    data.set(canonicalKey, currentSales);
    data.set("old_sales_10", JSON.stringify([{ id: 2, price: 9 }]));

    assert.equal(readStorage(canonicalKey), currentSales);
    assert.equal(data.get("old_sales_10"), JSON.stringify([{ id: 2, price: 9 }]));
  });
});

test("getScopedBracketBattleSessionStorageKey is scoped like other game session keys", () => {
  assert.equal(
    getScopedBracketBattleSessionStorageKey({ scopeType: "personal", workspaceId: null }),
    "whatfees_bracket_battle_session"
  );
  assert.equal(
    getScopedBracketBattleSessionStorageKey({ scopeType: "workspace", workspaceId: "team 42" }),
    "whatfees_bracket_battle_session__ws__team%2042"
  );
});

test("readStorage does not promote old keys when the current key is empty", () => {
  withMockedLocalStorage((_, data) => {
    const canonicalKey = getSalesStorageKey(11);
    const oldKey = "old_sales_11";

    data.set(oldKey, JSON.stringify([{ id: 2, price: 9 }]));

    assert.equal(readStorage(canonicalKey), null);
    assert.equal(data.has(oldKey), true);
  });
});

test("removeStorage deletes only the requested current key", () => {
  withMockedLocalStorage((_, data) => {
    const newKey = getSalesStorageKey(12);
    const oldKey = "old_sales_12";

    data.set(newKey, "[]");
    data.set(oldKey, JSON.stringify([{ id: 3, price: 12 }]));

    removeStorage(newKey);

    assert.equal(data.has(newKey), false);
    assert.equal(data.has(oldKey), true);
  });
});

test("clearScopedSalesStorage removes only personal sales cache keys in personal scope", () => {
  withMockedLocalStorage((_, data) => {
    data.set(getSalesStorageKey(1), JSON.stringify([{ id: 1 }]));
    data.set(getSalesStorageKey(2), JSON.stringify([{ id: 2 }]));
    data.set(getSalesCacheStatusKey(1), "loaded");
    data.set(getSalesSyncMetaKey(1), JSON.stringify({ activeCount: 1, latestUpdatedAt: "2026-03-18T00:00:00.000Z" }));
    data.set(getSalesStorageKey(7, { scopeType: "workspace", workspaceId: "team-42" }), JSON.stringify([{ id: 7 }]));
    data.set(getSalesCacheStatusKey(7, { scopeType: "workspace", workspaceId: "team-42" }), "loaded");
    data.set(
      getSalesSyncMetaKey(7, { scopeType: "workspace", workspaceId: "team-42" }),
      JSON.stringify({ activeCount: 1, latestUpdatedAt: "2026-03-18T00:00:00.000Z" })
    );

    clearScopedSalesStorage({ scopeType: "personal" });

    assert.equal(data.has(getSalesStorageKey(1)), false);
    assert.equal(data.has(getSalesStorageKey(2)), false);
    assert.equal(data.has(getSalesCacheStatusKey(1)), false);
    assert.equal(data.has(getSalesSyncMetaKey(1)), false);
    assert.equal(data.has(getSalesStorageKey(7, { scopeType: "workspace", workspaceId: "team-42" })), true);
    assert.equal(data.has(getSalesCacheStatusKey(7, { scopeType: "workspace", workspaceId: "team-42" })), true);
    assert.equal(data.has(getSalesSyncMetaKey(7, { scopeType: "workspace", workspaceId: "team-42" })), true);
  });
});

test("clearScopedSalesStorage removes only matching workspace sales cache keys in workspace scope", () => {
  withMockedLocalStorage((_, data) => {
    data.set(getSalesStorageKey(1), JSON.stringify([{ id: 1 }]));
    data.set(getSalesStorageKey(7, { scopeType: "workspace", workspaceId: "team-42" }), JSON.stringify([{ id: 7 }]));
    data.set(getSalesCacheStatusKey(7, { scopeType: "workspace", workspaceId: "team-42" }), "loaded");
    data.set(
      getSalesSyncMetaKey(7, { scopeType: "workspace", workspaceId: "team-42" }),
      JSON.stringify({ activeCount: 1, latestUpdatedAt: "2026-03-18T00:00:00.000Z" })
    );
    data.set(getSalesStorageKey(8, { scopeType: "workspace", workspaceId: "team-99" }), JSON.stringify([{ id: 8 }]));
    data.set(getSalesCacheStatusKey(8, { scopeType: "workspace", workspaceId: "team-99" }), "loaded");
    data.set(
      getSalesSyncMetaKey(8, { scopeType: "workspace", workspaceId: "team-99" }),
      JSON.stringify({ activeCount: 1, latestUpdatedAt: "2026-03-18T00:00:00.000Z" })
    );

    clearScopedSalesStorage({ scopeType: "workspace", workspaceId: "team-42" });

    assert.equal(data.has(getSalesStorageKey(1)), true);
    assert.equal(data.has(getSalesStorageKey(7, { scopeType: "workspace", workspaceId: "team-42" })), false);
    assert.equal(data.has(getSalesCacheStatusKey(7, { scopeType: "workspace", workspaceId: "team-42" })), false);
    assert.equal(data.has(getSalesSyncMetaKey(7, { scopeType: "workspace", workspaceId: "team-42" })), false);
    assert.equal(data.has(getSalesStorageKey(8, { scopeType: "workspace", workspaceId: "team-99" })), true);
    assert.equal(data.has(getSalesCacheStatusKey(8, { scopeType: "workspace", workspaceId: "team-99" })), true);
    assert.equal(data.has(getSalesSyncMetaKey(8, { scopeType: "workspace", workspaceId: "team-99" })), true);
  });
});

test("clearScopedSyncDataStorage removes only personal authoritative sync caches", () => {
  withMockedLocalStorage((_, data) => {
    const workspaceScope = { scopeType: "workspace" as const, workspaceId: "team-42" };
    data.set(getScopedPresetsStorageKey({ scopeType: "personal" }), "[{\"id\":1}]");
    data.set(getScopedSystemPricingDefaultsStorageKey({ scopeType: "personal" }), "{}");
    data.set(getScopedWheelConfigsStorageKey({ scopeType: "personal" }), "[]");
    data.set(getScopedActiveWheelConfigStorageKey({ scopeType: "personal" }), "91");
    data.set(getScopedLastLotStorageKey({ scopeType: "personal" }), "1");
    data.set(getScopedSyncClientVersionKey({ scopeType: "personal" }), "1001");
    data.set(getScopedLastSyncedPayloadHashKey({ scopeType: "personal" }), "personal-hash");
    data.set(getSalesStorageKey(1), JSON.stringify([{ id: 1 }]));
    data.set(getSalesCacheStatusKey(1), "loaded");
    data.set(getSalesSyncMetaKey(1), JSON.stringify({ activeCount: 1 }));
    data.set(getScopedPresetsStorageKey(workspaceScope), "[{\"id\":7}]");
    data.set(getScopedSyncClientVersionKey(workspaceScope), "77");
    data.set(getSalesStorageKey(7, workspaceScope), JSON.stringify([{ id: 7 }]));

    clearScopedSyncDataStorage({ scopeType: "personal" });

    assert.equal(data.has(getScopedPresetsStorageKey({ scopeType: "personal" })), false);
    assert.equal(data.has(getScopedSystemPricingDefaultsStorageKey({ scopeType: "personal" })), false);
    assert.equal(data.has(getScopedWheelConfigsStorageKey({ scopeType: "personal" })), false);
    assert.equal(data.has(getScopedActiveWheelConfigStorageKey({ scopeType: "personal" })), false);
    assert.equal(data.has(getScopedLastLotStorageKey({ scopeType: "personal" })), false);
    assert.equal(data.has(getScopedSyncClientVersionKey({ scopeType: "personal" })), false);
    assert.equal(data.has(getScopedLastSyncedPayloadHashKey({ scopeType: "personal" })), false);
    assert.equal(data.has(getSalesStorageKey(1)), false);
    assert.equal(data.has(getSalesCacheStatusKey(1)), false);
    assert.equal(data.has(getSalesSyncMetaKey(1)), false);
    assert.equal(data.has(getScopedPresetsStorageKey(workspaceScope)), true);
    assert.equal(data.has(getScopedSyncClientVersionKey(workspaceScope)), true);
    assert.equal(data.has(getSalesStorageKey(7, workspaceScope)), true);
  });
});

test("clearScopedSyncDataStorage removes only matching workspace authoritative sync caches", () => {
  withMockedLocalStorage((_, data) => {
    const team42 = { scopeType: "workspace" as const, workspaceId: "team-42" };
    const team99 = { scopeType: "workspace" as const, workspaceId: "team-99" };
    data.set(getScopedPresetsStorageKey({ scopeType: "personal" }), "[{\"id\":1}]");
    data.set(getSalesStorageKey(1), JSON.stringify([{ id: 1 }]));
    data.set(getScopedPresetsStorageKey(team42), "[{\"id\":7}]");
    data.set(getScopedSystemPricingDefaultsStorageKey(team42), "{}");
    data.set(getScopedWheelConfigsStorageKey(team42), "[]");
    data.set(getScopedActiveWheelConfigStorageKey(team42), "91");
    data.set(getScopedLastLotStorageKey(team42), "7");
    data.set(getScopedSyncClientVersionKey(team42), "1001");
    data.set(getScopedLastSyncedPayloadHashKey(team42), "team-42-hash");
    data.set(getSalesStorageKey(7, team42), JSON.stringify([{ id: 7 }]));
    data.set(getSalesCacheStatusKey(7, team42), "loaded");
    data.set(getSalesSyncMetaKey(7, team42), JSON.stringify({ activeCount: 1 }));
    data.set(getScopedPresetsStorageKey(team99), "[{\"id\":8}]");
    data.set(getScopedSyncClientVersionKey(team99), "77");
    data.set(getSalesStorageKey(8, team99), JSON.stringify([{ id: 8 }]));

    clearScopedSyncDataStorage(team42);

    assert.equal(data.has(getScopedPresetsStorageKey({ scopeType: "personal" })), true);
    assert.equal(data.has(getSalesStorageKey(1)), true);
    assert.equal(data.has(getScopedPresetsStorageKey(team42)), false);
    assert.equal(data.has(getScopedSystemPricingDefaultsStorageKey(team42)), false);
    assert.equal(data.has(getScopedWheelConfigsStorageKey(team42)), false);
    assert.equal(data.has(getScopedActiveWheelConfigStorageKey(team42)), false);
    assert.equal(data.has(getScopedLastLotStorageKey(team42)), false);
    assert.equal(data.has(getScopedSyncClientVersionKey(team42)), false);
    assert.equal(data.has(getScopedLastSyncedPayloadHashKey(team42)), false);
    assert.equal(data.has(getSalesStorageKey(7, team42)), false);
    assert.equal(data.has(getSalesCacheStatusKey(7, team42)), false);
    assert.equal(data.has(getSalesSyncMetaKey(7, team42)), false);
    assert.equal(data.has(getScopedPresetsStorageKey(team99)), true);
    assert.equal(data.has(getScopedSyncClientVersionKey(team99)), true);
    assert.equal(data.has(getSalesStorageKey(8, team99)), true);
  });
});

