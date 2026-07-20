import { describe, expect, test, vi } from "vitest";
import type { BuyerProfile, BuyerProfilePendingMutation } from "../src/types/app.ts";
import {
  hydrateBuyerProfilesForActiveScope,
  resolveBuyerProfileConflictForApp,
  saveBuyerProfileForApp,
  type BuyerProfileStoreApp,
  type BuyerProfileStoreDependencies
} from "../src/app-core/methods/ui/buyers/buyer-profile-store.ts";
import { SalesLiveApiError } from "../src/app-core/methods/entity-api-shared.ts";

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    username: "cardking27",
    preferredName: "Marc",
    tags: ["VIP"],
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    version: 1,
    ...overrides
  };
}

function createApp(overrides: Partial<BuyerProfileStoreApp> = {}): BuyerProfileStoreApp {
  return {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    buyerProfilesByKey: {},
    buyerProfilesScopeKey: "",
    buyerProfilesLoadStatus: "idle",
    buyerProfileSaveStates: {},
    buyerProfilePendingMutations: [],
    isOffline: false,
    googleAuthEpoch: 0,
    hasProAccess: true,
    notify: vi.fn(),
    ...overrides
  };
}

function createDependencies(overrides: Partial<BuyerProfileStoreDependencies> = {}): BuyerProfileStoreDependencies {
  return {
    readCache: vi.fn(() => []),
    writeCache: vi.fn(),
    readOutbox: vi.fn(() => []),
    writeOutbox: vi.fn(),
    canUseApi: vi.fn(() => true),
    fetchProfiles: vi.fn(async () => []),
    upsertProfile: vi.fn(async (_app, draft) => profile({
      username: draft.username,
      preferredName: draft.preferredName,
      tags: draft.tags,
      version: draft.baseVersion + 1
    })),
    deleteProfile: vi.fn(async (_app, input) => ({ version: input.baseVersion + 1 })),
    createMutationId: vi.fn(() => "buyer:m1"),
    now: vi.fn(() => "2026-07-20T11:00:00.000Z"),
    ...overrides
  };
}

describe("buyer profile store", () => {
  test("hydrates the scoped cache immediately and replaces it with authoritative profiles", async () => {
    const cached = profile({ preferredName: "Cached" });
    const remote = profile({ preferredName: "Remote", version: 2 });
    const app = createApp();
    const deps = createDependencies({
      readCache: vi.fn(() => [cached]),
      fetchProfiles: vi.fn(async () => [remote])
    });

    await hydrateBuyerProfilesForActiveScope(app, deps);

    expect(app.buyerProfilesScopeKey).toBe("personal");
    expect(app.buyerProfilesByKey.cardking27?.preferredName).toBe("Remote");
    expect(app.buyerProfilesLoadStatus).toBe("loaded");
    expect(deps.writeCache).toHaveBeenCalledWith({ scopeType: "personal" }, [remote]);
  });

  test("ignores a late response after the active workspace changes", async () => {
    let resolveFetch: (profiles: BuyerProfile[]) => void = () => undefined;
    const app = createApp({ activeScopeType: "workspace", activeWorkspaceId: "one" });
    const deps = createDependencies({
      fetchProfiles: vi.fn(() => new Promise<BuyerProfile[]>((resolve) => {
        resolveFetch = resolve;
      }))
    });

    const pending = hydrateBuyerProfilesForActiveScope(app, deps);
    app.activeWorkspaceId = "two";
    resolveFetch([profile({ preferredName: "Wrong workspace" })]);
    await pending;

    expect(app.buyerProfilesByKey.cardking27).toBeUndefined();
    expect(app.buyerProfilesScopeKey).toBe("workspace:one");
  });

  test("queues an offline edit and applies it optimistically", async () => {
    const app = createApp({
      isOffline: true,
      buyerProfilesScopeKey: "personal",
      buyerProfilesByKey: { cardking27: profile() }
    });
    const deps = createDependencies();

    const result = await saveBuyerProfileForApp(app, {
      username: "cardking27",
      preferredName: "Marco",
      tags: ["VIP", "Pokémon"]
    }, deps);

    expect(result).toBe("pending");
    expect(app.buyerProfilesByKey.cardking27?.preferredName).toBe("Marco");
    expect(app.buyerProfileSaveStates.cardking27).toBe("pending");
    expect(app.buyerProfilePendingMutations).toEqual([expect.objectContaining({
      mutationId: "buyer:m1",
      operation: "upsert",
      baseVersion: 1
    })]);
    expect(deps.upsertProfile).not.toHaveBeenCalled();
    expect(deps.writeOutbox).toHaveBeenCalled();
  });

  test("persists an online edit and removes its outbox entry", async () => {
    const app = createApp({
      buyerProfilesScopeKey: "personal",
      buyerProfilesByKey: { cardking27: profile() }
    });
    const deps = createDependencies();

    const result = await saveBuyerProfileForApp(app, {
      username: "cardking27",
      preferredName: "Marco",
      tags: ["VIP"]
    }, deps);

    expect(result).toBe("saved");
    expect(app.buyerProfilesByKey.cardking27?.version).toBe(2);
    expect(app.buyerProfileSaveStates.cardking27).toBe("idle");
    expect(app.buyerProfilePendingMutations).toEqual([]);
    expect(deps.upsertProfile).toHaveBeenCalledWith(app, expect.objectContaining({
      username: "cardking27",
      mutationId: "buyer:m1",
      baseVersion: 1
    }));
  });

  test("turns empty metadata into an optimistic profile deletion", async () => {
    const app = createApp({
      isOffline: true,
      buyerProfilesScopeKey: "personal",
      buyerProfilesByKey: { cardking27: profile() }
    });
    const deps = createDependencies();

    const result = await saveBuyerProfileForApp(app, {
      username: "cardking27",
      preferredName: "",
      tags: []
    }, deps);

    expect(result).toBe("pending");
    expect(app.buyerProfilesByKey.cardking27).toBeUndefined();
    expect(app.buyerProfilePendingMutations[0]?.operation).toBe("delete");
  });

  test("keeps the optimistic draft queued when authentication expires", async () => {
    const app = createApp({
      buyerProfilesScopeKey: "personal",
      buyerProfilesByKey: { cardking27: profile() }
    });
    const deps = createDependencies({
      upsertProfile: vi.fn(async () => {
        throw new SalesLiveApiError(401, "expired");
      })
    });

    const result = await saveBuyerProfileForApp(app, {
      username: "cardking27",
      preferredName: "Marco",
      tags: ["VIP"]
    }, deps);

    expect(result).toBe("pending");
    expect(app.buyerProfilesByKey.cardking27?.preferredName).toBe("Marco");
    expect(app.buyerProfilePendingMutations).toHaveLength(1);
  });

  test("preserves the queued draft when a teammate update conflicts", async () => {
    const app = createApp({
      buyerProfilesScopeKey: "personal",
      buyerProfilesByKey: { cardking27: profile() }
    });
    const deps = createDependencies({
      upsertProfile: vi.fn(async () => {
        throw new SalesLiveApiError(409, "changed");
      })
    });

    const result = await saveBuyerProfileForApp(app, {
      username: "cardking27",
      preferredName: "Marco",
      tags: ["VIP"]
    }, deps);

    expect(result).toBe("conflict");
    expect(app.buyerProfileSaveStates.cardking27).toBe("conflict");
    expect((app.buyerProfilePendingMutations[0] as BuyerProfilePendingMutation).preferredName).toBe("Marco");
  });

  test("rebases a preserved conflict draft onto the latest server version before retrying", async () => {
    const mutation: BuyerProfilePendingMutation = {
      mutationId: "buyer:m1",
      operation: "upsert",
      username: "cardking27",
      preferredName: "Marco",
      tags: ["VIP"],
      baseVersion: 1,
      queuedAt: "2026-07-20T11:00:00.000Z"
    };
    const app = createApp({
      buyerProfilesScopeKey: "personal",
      buyerProfilesByKey: { cardking27: profile() },
      buyerProfileSaveStates: { cardking27: "conflict" },
      buyerProfilePendingMutations: [mutation]
    });
    const deps = createDependencies({ fetchProfiles: vi.fn(async () => [profile({ version: 2 })]) });

    await resolveBuyerProfileConflictForApp(app, "cardking27", "retry", deps);

    expect(deps.upsertProfile).toHaveBeenCalledWith(app, expect.objectContaining({
      preferredName: "Marco",
      baseVersion: 2
    }));
    expect(app.buyerProfilesByKey.cardking27?.version).toBe(3);
    expect(app.buyerProfilePendingMutations).toEqual([]);
  });

  test("reloads the authoritative profile and discards a conflicting local draft", async () => {
    const mutation: BuyerProfilePendingMutation = {
      mutationId: "buyer:m1",
      operation: "upsert",
      username: "cardking27",
      preferredName: "Marco",
      tags: ["VIP"],
      baseVersion: 1,
      queuedAt: "2026-07-20T11:00:00.000Z"
    };
    const remote = profile({ preferredName: "Marc remote", version: 2 });
    const app = createApp({
      buyerProfilesScopeKey: "personal",
      buyerProfilesByKey: { cardking27: profile() },
      buyerProfileSaveStates: { cardking27: "conflict" },
      buyerProfilePendingMutations: [mutation]
    });
    const deps = createDependencies({ fetchProfiles: vi.fn(async () => [remote]) });

    await resolveBuyerProfileConflictForApp(app, "cardking27", "reload", deps);

    expect(app.buyerProfilesByKey.cardking27).toEqual(remote);
    expect(app.buyerProfileSaveStates.cardking27).toBe("idle");
    expect(app.buyerProfilePendingMutations).toEqual([]);
    expect(deps.upsertProfile).not.toHaveBeenCalled();
  });
});
