import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as browser from "../../../shared/workspace-realtime-rooms.mjs";

const service = createRequire(import.meta.url)("../dist/workspace-realtime-rooms.js");

test("compiled realtime service room entrypoint agrees with browser room identities", () => {
  const cases = [
    ["buildWorkspaceLotRealtimeRoom", ["team-42", 7], "workspace:team-42:lot:7"],
    ["buildWorkspacePresenceRealtimeRoom", ["team-42"], "workspace:team-42:presence"],
    ["buildWorkspaceWheelRealtimeRoom", ["team-42"], "workspace:team-42:wheel"],
    ["buildGamePublicSessionRealtimeRoom", [" ABC123 "], "wheel-public:abc123"],
    ["buildWheelPublicSessionRealtimeRoom", [" ABC123 "], "wheel-public:abc123"],
    ["parseWorkspacePresenceRealtimeRoom", ["workspace:team-42:presence"], "team-42"],
    ["parseWorkspacePresenceRealtimeRoom", ["workspace:team-42:lot:7"], null],
    ["parseWorkspacePresenceRealtimeRoom", ["workspace::presence"], null]
  ];
  for (const [method, args, expected] of cases) {
    assert.equal(service[method](...args), expected);
    assert.equal(browser[method](...args), expected);
  }
});
