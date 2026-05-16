import assert from "node:assert/strict";
import { test } from "vitest";
import {
  readGameSpectatorSessionStorageState,
  writeGameSpectatorSessionStorageState
} from "../src/components/windows/game/services/gameSpectatorSessionStorage.ts";

test("game spectator session storage reads legacy wheel fields and writes compatible snapshots", () => {
  assert.deepEqual(
    readGameSpectatorSessionStorageState({
      wheelSpectatorSessionId: "old123",
      wheelSpectatorSessionStatus: "live",
      wheelSpectatorSessionUrl: "https://example.test/old",
      wheelSpectatorSessionQrUrl: "qr:old"
    }),
    {
      publicSessionId: "old123",
      status: "live",
      url: "https://example.test/old",
      qrUrl: "qr:old"
    }
  );

  const snapshot: Record<string, unknown> = {};
  writeGameSpectatorSessionStorageState(snapshot, {
    gameSpectatorSessionId: "new123",
    gameSpectatorSessionStatus: "ended",
    gameSpectatorSessionUrl: "https://example.test/new",
    gameSpectatorSessionQrUrl: "qr:new"
  });

  assert.equal(snapshot.gameSpectatorSessionId, "new123");
  assert.equal(snapshot.gameSpectatorSessionStatus, "ended");
  assert.equal(snapshot.wheelSpectatorSessionId, "new123");
  assert.equal(snapshot.wheelSpectatorSessionStatus, "ended");
});
