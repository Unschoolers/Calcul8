import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import {
  createApiConfig,
  createHttpRequest,
  createInvocationContext
} from "../../test-support/function-test-helpers";

const {
  deleteBuyerProfileForActorMock,
  getConfigMock,
  listBuyerProfilesForActorMock,
  publishWorkspacePresenceRealtimeEventBestEffortMock,
  resolveUserIdMock,
  saveBuyerProfileForActorMock
} = vi.hoisted(() => ({
  deleteBuyerProfileForActorMock: vi.fn(),
  getConfigMock: vi.fn(),
  listBuyerProfilesForActorMock: vi.fn(),
  publishWorkspacePresenceRealtimeEventBestEffortMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  saveBuyerProfileForActorMock: vi.fn()
}));

vi.mock("../../lib/config", () => ({ getConfig: getConfigMock }));
vi.mock("../../lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/auth")>()),
  resolveUserId: resolveUserIdMock
}));
vi.mock("../../lib/realtime", () => ({
  publishWorkspacePresenceRealtimeEventBestEffort: publishWorkspacePresenceRealtimeEventBestEffortMock
}));
vi.mock("./services", () => ({
  deleteBuyerProfileForActor: deleteBuyerProfileForActorMock,
  listBuyerProfilesForActor: listBuyerProfilesForActorMock,
  saveBuyerProfileForActor: saveBuyerProfileForActorMock
}));

import { BuyerProfileVersionConflictError } from "../../lib/cosmos/buyerProfileRepository";
import { buyerProfilesRoute } from "./handlers";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  resolveUserIdMock.mockResolvedValue("actor-1");
  listBuyerProfilesForActorMock.mockResolvedValue([]);
});

test("lists profiles for the requested workspace scope", async () => {
  listBuyerProfilesForActorMock.mockResolvedValue([{ username: "alice", tags: [], version: 1 }]);

  const response = await buyerProfilesRoute(
    createHttpRequest({ method: "GET", query: "workspaceId=team-42" }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    profiles: [{ username: "alice", tags: [], version: 1 }]
  });
  assert.deepEqual(listBuyerProfilesForActorMock.mock.calls[0]?.slice(1), ["actor-1", "team-42"]);
});

test("saves a profile and publishes a non-PII workspace invalidation", async () => {
  const context = createInvocationContext();
  saveBuyerProfileForActorMock.mockResolvedValue({
    profileId: "buyer_profile:abc",
    profile: {
      username: "cardking27",
      preferredName: "Marc",
      tags: ["VIP"],
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-20T11:00:00.000Z",
      version: 2
    }
  });

  const response = await buyerProfilesRoute(
    createHttpRequest({
      method: "PUT",
      body: {
        workspaceId: "team-42",
        username: "cardking27",
        preferredName: "Marc",
        tags: ["VIP"],
        baseVersion: 1,
        mutationId: "buyer:m2"
      }
    }) as never,
    context as never
  );

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { profile: { preferredName?: string } }).profile.preferredName, "Marc");
  assert.deepEqual(publishWorkspacePresenceRealtimeEventBestEffortMock.mock.calls[0]?.[1], {
    workspaceId: "team-42",
    eventType: "buyer.profile.changed",
    data: {
      profileId: "buyer_profile:abc",
      version: 2,
      deleted: false
    },
    logger: context
  });
});

test("deletes empty metadata and publishes a deletion invalidation", async () => {
  deleteBuyerProfileForActorMock.mockResolvedValue({
    profileId: "buyer_profile:abc",
    version: 3
  });

  const response = await buyerProfilesRoute(
    createHttpRequest({
      method: "DELETE",
      body: {
        workspaceId: "team-42",
        username: "cardking27",
        baseVersion: 2,
        mutationId: "buyer:m3"
      }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, { ok: true, version: 3 });
  assert.deepEqual(publishWorkspacePresenceRealtimeEventBestEffortMock.mock.calls[0]?.[1].data, {
    profileId: "buyer_profile:abc",
    version: 3,
    deleted: true
  });
});

test("rejects unknown and invalid buyer profile fields at the route boundary", async () => {
  const unknownFieldResponse = await buyerProfilesRoute(
    createHttpRequest({
      method: "PUT",
      body: {
        username: "cardking27",
        preferredName: "Marc",
        tags: [],
        baseVersion: 0,
        mutationId: "buyer:m1",
        notes: "must not be accepted"
      }
    }) as never,
    createInvocationContext() as never
  );
  const tooManyTagsResponse = await buyerProfilesRoute(
    createHttpRequest({
      method: "PUT",
      body: {
        username: "cardking27",
        tags: Array.from({ length: 11 }, (_, index) => `tag-${index}`),
        baseVersion: 0,
        mutationId: "buyer:m1"
      }
    }) as never,
    createInvocationContext() as never
  );

  assert.equal(unknownFieldResponse.status, 400);
  assert.match(String((unknownFieldResponse.jsonBody as { error?: string }).error), /unknown field 'notes'/i);
  assert.equal(tooManyTagsResponse.status, 400);
  assert.match(String((tooManyTagsResponse.jsonBody as { error?: string }).error), /more than 10 tags/i);
  assert.equal(saveBuyerProfileForActorMock.mock.calls.length, 0);
});

test("returns a stable conflict response without logging an expected race", async () => {
  const context = createInvocationContext();
  saveBuyerProfileForActorMock.mockRejectedValue(new BuyerProfileVersionConflictError());

  const response = await buyerProfilesRoute(
    createHttpRequest({
      method: "PUT",
      body: {
        username: "cardking27",
        tags: [],
        baseVersion: 1,
        mutationId: "buyer:m2"
      }
    }) as never,
    context as never
  );

  assert.equal(response.status, 409);
  assert.equal((response.jsonBody as { code?: string }).code, "BUYER_PROFILE_CONFLICT");
  assert.equal(context.error.mock.calls.length, 0);
});
