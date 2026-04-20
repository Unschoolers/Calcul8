import assert from "node:assert/strict";
import { test } from "vitest";
import { shouldApplySpectatorReadyState } from "../src/app-core/methods/ui/wheel-spectator-client-state.ts";

test("shouldApplySpectatorReadyState rejects stale ready snapshots", () => {
  const currentState = {
    status: "ready" as const,
    publicSessionId: "abc123",
    snapshot: {
      updatedAt: 200,
      wheelName: "Live Wheel"
    }
  };
  const olderState = {
    status: "ready" as const,
    publicSessionId: "abc123",
    snapshot: {
      updatedAt: 150,
      wheelName: "Live Wheel"
    }
  };
  const newerState = {
    status: "ready" as const,
    publicSessionId: "abc123",
    snapshot: {
      updatedAt: 250,
      wheelName: "Live Wheel"
    }
  };

  assert.equal(shouldApplySpectatorReadyState(currentState as never, olderState as never), false);
  assert.equal(shouldApplySpectatorReadyState(currentState as never, newerState as never), true);
});
