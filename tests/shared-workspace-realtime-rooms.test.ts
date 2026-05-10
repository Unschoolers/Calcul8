import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildGamePublicSessionRealtimeRoom,
  buildWheelPublicSessionRealtimeRoom
} from "../shared/workspace-realtime-rooms.mjs";

test("shared realtime room helpers expose a generic game public room while preserving wheel compatibility", () => {
  assert.equal(buildGamePublicSessionRealtimeRoom(" AbC123xY "), "wheel-public:abc123xy");
  assert.equal(buildWheelPublicSessionRealtimeRoom(" AbC123xY "), "wheel-public:abc123xy");
});
