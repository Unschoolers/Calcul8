import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { createApiConfig } from "../../test-support/function-test-helpers";
import type { BuyerProfileDocument } from "../../types";

const {
  deleteBuyerProfileMock,
  hasWorkspaceMembershipMock,
  listBuyerProfilesMock,
  upsertBuyerProfileMock
} = vi.hoisted(() => ({
  deleteBuyerProfileMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn(),
  listBuyerProfilesMock: vi.fn(),
  upsertBuyerProfileMock: vi.fn()
}));

vi.mock("../../lib/cosmos/buyerProfileRepository", () => ({
  deleteBuyerProfile: deleteBuyerProfileMock,
  listBuyerProfiles: listBuyerProfilesMock,
  upsertBuyerProfile: upsertBuyerProfileMock
}));

vi.mock("../../lib/cosmos/workspaceRepository", () => ({
  hasWorkspaceMembership: hasWorkspaceMembershipMock
}));

import {
  deleteBuyerProfileForActor,
  listBuyerProfilesForActor,
  saveBuyerProfileForActor
} from "./services";

function createDocument(overrides: Partial<BuyerProfileDocument> = {}): BuyerProfileDocument {
  return {
    id: "buyer_profile:abc",
    docType: "buyer_profile",
    userId: "ws:team-42",
    username: "cardking27",
    normalizedUsername: "cardking27",
    preferredName: "Marc",
    tags: ["VIP"],
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T11:00:00.000Z",
    updatedBy: "actor-1",
    mutationId: "buyer:m1",
    version: 2,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasWorkspaceMembershipMock.mockResolvedValue(true);
});

test("lists public buyer profile fields for an authorized workspace member", async () => {
  listBuyerProfilesMock.mockResolvedValue([createDocument()]);

  const profiles = await listBuyerProfilesForActor(createApiConfig(), "actor-1", "team-42");

  assert.deepEqual(profiles, [{
    username: "cardking27",
    preferredName: "Marc",
    tags: ["VIP"],
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T11:00:00.000Z",
    version: 2
  }]);
  assert.deepEqual(hasWorkspaceMembershipMock.mock.calls[0], [createApiConfig(), "actor-1", "team-42"]);
  assert.deepEqual(listBuyerProfilesMock.mock.calls[0]?.slice(1), ["ws:team-42"]);
});

test("uses the actor personal partition without a workspace membership lookup", async () => {
  listBuyerProfilesMock.mockResolvedValue([]);

  await listBuyerProfilesForActor(createApiConfig(), "actor-1");

  assert.equal(hasWorkspaceMembershipMock.mock.calls.length, 0);
  assert.deepEqual(listBuyerProfilesMock.mock.calls[0]?.slice(1), ["actor-1"]);
});

test("passes the resolved workspace scope and actor to profile mutations", async () => {
  upsertBuyerProfileMock.mockResolvedValue(createDocument({ version: 3 }));
  deleteBuyerProfileMock.mockResolvedValue(createDocument({
    preferredName: undefined,
    tags: [],
    version: 4,
    deletedAt: "2026-07-20T12:00:00.000Z"
  }));

  const saved = await saveBuyerProfileForActor(createApiConfig(), "actor-1", {
    workspaceId: "team-42",
    username: "cardking27",
    preferredName: "Marc",
    tags: ["VIP"],
    baseVersion: 2,
    mutationId: "buyer:m2"
  });
  const deleted = await deleteBuyerProfileForActor(createApiConfig(), "actor-1", {
    workspaceId: "team-42",
    username: "cardking27",
    baseVersion: 3,
    mutationId: "buyer:m3"
  });

  assert.equal(saved.profile.version, 3);
  assert.equal(saved.profileId, "buyer_profile:abc");
  assert.equal(deleted.version, 4);
  assert.deepEqual(upsertBuyerProfileMock.mock.calls[0]?.[1], {
    scopeKey: "ws:team-42",
    username: "cardking27",
    preferredName: "Marc",
    tags: ["VIP"],
    updatedBy: "actor-1",
    baseVersion: 2,
    mutationId: "buyer:m2"
  });
});

test("rejects a workspace profile request when membership is missing", async () => {
  hasWorkspaceMembershipMock.mockResolvedValue(false);

  await assert.rejects(
    () => listBuyerProfilesForActor(createApiConfig(), "actor-1", "team-42"),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 403);
      return true;
    }
  );
  assert.equal(listBuyerProfilesMock.mock.calls.length, 0);
});
