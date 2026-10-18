import assert from "node:assert/strict";
import { test } from "vitest";
import { runGameSessionReset } from "../src/components/windows/game/services/gameSessionEngine.ts";

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

test("preview reset persists without publication", async () => {
  const calls: string[] = [];
  const next = await runGameSessionReset(
    { count: 2 },
    "preview",
    { reset: () => ({ count: 0 }), shouldPublish: (execution) => execution === "live" },
    {
      persist: async () => { calls.push("persist"); },
      publish: async () => { calls.push("publish"); }
    }
  );

  assert.deepEqual(next, { count: 0 });
  assert.deepEqual(calls, ["persist"]);
});
