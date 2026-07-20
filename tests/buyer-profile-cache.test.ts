import { beforeEach, describe, expect, test, vi } from "vitest";
import type { BuyerProfile, BuyerProfilePendingMutation } from "../src/types/app.ts";
import {
  getBuyerProfileOutboxStorageKey,
  getBuyerProfilesCacheStorageKey,
  readCachedBuyerProfiles,
  readBuyerProfileOutbox,
  writeCachedBuyerProfiles,
  writeBuyerProfileOutbox
} from "../src/app-core/methods/ui/buyers/buyer-profile-cache.ts";

const personal = { scopeType: "personal" as const };
const workspace = { scopeType: "workspace" as const, workspaceId: "team-42" };

const profile: BuyerProfile = {
  username: "cardking27",
  preferredName: "Marc",
  tags: ["VIP"],
  createdAt: "2026-07-20T10:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
  version: 1
};

const mutation: BuyerProfilePendingMutation = {
  mutationId: "buyer:m1",
  operation: "upsert",
  username: "cardking27",
  preferredName: "Marc",
  tags: ["VIP"],
  baseVersion: 1,
  queuedAt: "2026-07-20T11:00:00.000Z"
};

describe("buyer profile cache", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      }
    });
  });

  test("uses different keys for personal and workspace profiles", () => {
    expect(getBuyerProfilesCacheStorageKey(personal)).toBe("whatfees_buyer_profiles_v1");
    expect(getBuyerProfilesCacheStorageKey(workspace)).toBe("whatfees_buyer_profiles_v1__ws__team-42");
    expect(getBuyerProfileOutboxStorageKey(workspace)).toBe("whatfees_buyer_profile_outbox_v1__ws__team-42");
  });

  test("round-trips normalized profiles and pending mutations per scope", () => {
    writeCachedBuyerProfiles(workspace, [profile]);
    writeBuyerProfileOutbox(workspace, [mutation]);

    expect(readCachedBuyerProfiles(workspace)).toEqual([profile]);
    expect(readBuyerProfileOutbox(workspace)).toEqual([mutation]);
    expect(readCachedBuyerProfiles(personal)).toEqual([]);
    expect(readBuyerProfileOutbox(personal)).toEqual([]);
  });

  test("recovers safely from damaged cache data", () => {
    localStorage.setItem(getBuyerProfilesCacheStorageKey(personal), "not-json");
    localStorage.setItem(getBuyerProfileOutboxStorageKey(personal), JSON.stringify([{ mutationId: "" }]));

    expect(readCachedBuyerProfiles(personal)).toEqual([]);
    expect(readBuyerProfileOutbox(personal)).toEqual([]);
  });
});
