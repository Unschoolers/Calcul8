import assert from "node:assert/strict";
import { test } from "vitest";
import { createShellActionPresence } from "../src/components/shell/shellActionPresence.ts";

test("shell action presence tracks only currently rendered contextual docks", () => {
  const visibleShellContextActionIds: string[] = [];
  const presence = createShellActionPresence({ visibleShellContextActionIds });

  const firstId = presence.createActionId();
  const secondId = presence.createActionId();
  assert.notEqual(firstId, secondId);

  presence.setVisible(firstId, true);
  presence.setVisible(firstId, true);
  presence.setVisible(secondId, true);
  assert.deepEqual(visibleShellContextActionIds, [firstId, secondId]);

  presence.setVisible(firstId, false);
  assert.deepEqual(visibleShellContextActionIds, [secondId]);

  presence.setVisible(secondId, false);
  assert.deepEqual(visibleShellContextActionIds, []);
});
