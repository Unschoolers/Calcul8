import assert from "node:assert/strict";
import { test, vi } from "vitest";
import {
  readGameSession,
  removeGameSession,
  writeGameSession,
  type GameSessionCodec,
  type GameSessionStorage
} from "../src/components/windows/game/services/gameSessionStore.ts";

function createStorage(seed: Record<string, string> = {}): GameSessionStorage {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }
  };
}

const sessionCodec: GameSessionCodec<{ id: string }> = {
  decode: (value: unknown) => value && typeof value === "object" && "id" in value
    ? value as { id: string }
    : null,
  encode: (value) => value
};

test("reads validated sessions and contains corrupt storage", () => {
  const storage = createStorage({
    good: JSON.stringify({ id: "session-1" }),
    invalid: JSON.stringify({ name: "not-a-session" }),
    bad: "{"
  });

  assert.deepEqual(readGameSession(storage, "good", sessionCodec), { id: "session-1" });
  assert.equal(readGameSession(storage, "invalid", sessionCodec), null);
  assert.equal(readGameSession(storage, "bad", sessionCodec), null);
});

test("writes encoded sessions and contains storage failures", () => {
  const setItem = vi.fn<(key: string, value: string) => void>();
  const storage = {
    setItem
  };

  writeGameSession(storage, "session", { id: "session-1" }, sessionCodec);

  assert.deepEqual(setItem.mock.calls, [["session", JSON.stringify({ id: "session-1" })]]);
  assert.doesNotThrow(() => writeGameSession({
    setItem: () => { throw new Error("full"); }
  }, "session", { id: "session-1" }, sessionCodec));
});

test("removes sessions and contains storage failures", () => {
  const storage = createStorage({ session: JSON.stringify({ id: "session-1" }) });

  removeGameSession(storage, "session");

  assert.equal(storage.getItem("session"), null);
  assert.doesNotThrow(() => removeGameSession({
    removeItem: () => { throw new Error("locked"); }
  }, "session"));
});
