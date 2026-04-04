import assert from "node:assert/strict";
import { test } from "vitest";
import {
  clearScopedSalesStorage,
  getSalesCacheStatusKey,
  getLegacySalesStorageKey,
  getSalesStorageKey,
  migrateLegacySalesKey,
  readStorageWithLegacy
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

test("migrateLegacySalesKey promotes legacy value when canonical is empty", () => {
  withMockedLocalStorage((_, data) => {
    const canonicalKey = getSalesStorageKey(10);
    const legacyKey = getLegacySalesStorageKey(10);
    const legacySales = JSON.stringify([{ id: 1, price: 7 }]);

    data.set(canonicalKey, "[]");
    data.set(legacyKey, legacySales);

    migrateLegacySalesKey(10);

    assert.equal(data.get(canonicalKey), legacySales);
    assert.equal(data.has(legacyKey), false);
  });
});

test("migrateLegacySalesKey keeps both keys when canonical and legacy differ with non-empty data", () => {
  withMockedLocalStorage((_, data) => {
    const canonicalKey = getSalesStorageKey(11);
    const legacyKey = getLegacySalesStorageKey(11);
    const canonicalSales = JSON.stringify([{ id: 1, price: 7 }]);
    const legacySales = JSON.stringify([{ id: 2, price: 9 }]);

    data.set(canonicalKey, canonicalSales);
    data.set(legacyKey, legacySales);

    migrateLegacySalesKey(11);

    assert.equal(data.get(canonicalKey), canonicalSales);
    assert.equal(data.get(legacyKey), legacySales);
  });
});

test("readStorageWithLegacy promotes richer legacy payload over empty canonical payload", () => {
  withMockedLocalStorage((_, data) => {
    const newKey = getSalesStorageKey(12);
    const legacyKey = getLegacySalesStorageKey(12);
    const legacySales = JSON.stringify([{ id: 3, price: 12 }]);

    data.set(newKey, "[]");
    data.set(legacyKey, legacySales);

    const result = readStorageWithLegacy(newKey, legacyKey);

    assert.equal(result, legacySales);
    assert.equal(data.get(newKey), legacySales);
  });
});

test("clearScopedSalesStorage removes only personal sales cache keys in personal scope", () => {
  withMockedLocalStorage((_, data) => {
    data.set(getSalesStorageKey(1), JSON.stringify([{ id: 1 }]));
    data.set(getSalesStorageKey(2), JSON.stringify([{ id: 2 }]));
    data.set(getSalesCacheStatusKey(1), "loaded");
    data.set(getSalesStorageKey(7, { scopeType: "workspace", workspaceId: "team-42" }), JSON.stringify([{ id: 7 }]));
    data.set(getSalesCacheStatusKey(7, { scopeType: "workspace", workspaceId: "team-42" }), "loaded");

    clearScopedSalesStorage({ scopeType: "personal" });

    assert.equal(data.has(getSalesStorageKey(1)), false);
    assert.equal(data.has(getSalesStorageKey(2)), false);
    assert.equal(data.has(getSalesCacheStatusKey(1)), false);
    assert.equal(data.has(getSalesStorageKey(7, { scopeType: "workspace", workspaceId: "team-42" })), true);
    assert.equal(data.has(getSalesCacheStatusKey(7, { scopeType: "workspace", workspaceId: "team-42" })), true);
  });
});

test("clearScopedSalesStorage removes only matching workspace sales cache keys in workspace scope", () => {
  withMockedLocalStorage((_, data) => {
    data.set(getSalesStorageKey(1), JSON.stringify([{ id: 1 }]));
    data.set(getSalesStorageKey(7, { scopeType: "workspace", workspaceId: "team-42" }), JSON.stringify([{ id: 7 }]));
    data.set(getSalesCacheStatusKey(7, { scopeType: "workspace", workspaceId: "team-42" }), "loaded");
    data.set(getSalesStorageKey(8, { scopeType: "workspace", workspaceId: "team-99" }), JSON.stringify([{ id: 8 }]));
    data.set(getSalesCacheStatusKey(8, { scopeType: "workspace", workspaceId: "team-99" }), "loaded");

    clearScopedSalesStorage({ scopeType: "workspace", workspaceId: "team-42" });

    assert.equal(data.has(getSalesStorageKey(1)), true);
    assert.equal(data.has(getSalesStorageKey(7, { scopeType: "workspace", workspaceId: "team-42" })), false);
    assert.equal(data.has(getSalesCacheStatusKey(7, { scopeType: "workspace", workspaceId: "team-42" })), false);
    assert.equal(data.has(getSalesStorageKey(8, { scopeType: "workspace", workspaceId: "team-99" })), true);
    assert.equal(data.has(getSalesCacheStatusKey(8, { scopeType: "workspace", workspaceId: "team-99" })), true);
  });
});

