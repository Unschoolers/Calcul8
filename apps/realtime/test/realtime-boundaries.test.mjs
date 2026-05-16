import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { parseClientMessage, parsePublishRequestBody, parseRoomCountRequestBody } = require("../dist/realtime-payloads.js");
const { WorkspacePresenceStore } = require("../dist/realtime-presence-store.js");
const { RealtimeRoomStore } = require("../dist/realtime-room-store.js");

test("room store owns client registration, room membership, and event delivery", () => {
  const roomStore = new RealtimeRoomStore();
  const socket = createSocket();
  const client = roomStore.addClient(socket);

  assert.equal(client.id, "c1");
  assert.equal(roomStore.clientCount, 1);

  roomStore.addClientToRoom(client, "workspace:w1:lot:1");
  assert.equal(roomStore.getRoomMemberCount("workspace:w1:lot:1"), 1);

  const delivered = roomStore.broadcastToRoom({
    room: "workspace:w1:lot:1",
    eventType: "sale.updated",
    data: { id: "sale-1" }
  });

  assert.equal(delivered, 1);
  assert.deepEqual(socket.sentMessages, [{
    type: "event",
    room: "workspace:w1:lot:1",
    eventType: "sale.updated",
    data: { id: "sale-1" }
  }]);

  roomStore.disconnectClient(client);
  assert.equal(roomStore.clientCount, 0);
  assert.equal(roomStore.getRoomMemberCount("workspace:w1:lot:1"), 0);
});

test("presence store derives online and offline workspace snapshots from room membership", () => {
  const roomStore = new RealtimeRoomStore();
  const presenceStore = new WorkspacePresenceStore();
  const client = roomStore.addClient(createSocket());

  client.userId = "user-1";
  roomStore.addClientToRoom(client, "workspace:w1:presence");

  assert.deepEqual(presenceStore.syncClientPresenceState(client, roomStore), ["w1"]);
  assert.equal(presenceStore.getWorkspacePresenceSnapshot("w1")[0].isOnline, true);

  roomStore.disconnectClient(client);
  assert.deepEqual(presenceStore.syncClientPresenceState(client, roomStore), ["w1"]);

  assert.deepEqual(
    presenceStore.buildWorkspacePresenceEvent("w1"),
    {
      type: "event",
      room: "workspace:w1:presence",
      eventType: "workspace.presence",
      data: {
        workspaceId: "w1",
        members: [{
          userId: "user-1",
          isOnline: false,
          lastSeenAt: presenceStore.getWorkspacePresenceSnapshot("w1")[0].lastSeenAt
        }]
      }
    }
  );
});

test("payload helpers centralize websocket and HTTP validation", () => {
  assert.deepEqual(
    parseClientMessage(JSON.stringify({
      type: "subscribe",
      rooms: [" workspace:w1:lot:1 ", "", "workspace:w1:lot:1"],
      token: " t "
    })),
    {
      type: "subscribe",
      rooms: ["workspace:w1:lot:1"],
      token: "t"
    }
  );

  assert.deepEqual(parseClientMessage("{"), {
    type: "error",
    message: "Invalid JSON message."
  });

  assert.deepEqual(parsePublishRequestBody({
    rooms: ["workspace:w1:lot:1", "workspace:w1:lot:1"],
    eventType: "sale.updated",
    data: { id: "sale-1" }
  }), {
    rooms: ["workspace:w1:lot:1"],
    eventType: "sale.updated",
    data: { id: "sale-1" }
  });

  assert.deepEqual(parseRoomCountRequestBody({ room: " workspace:w1:presence " }), {
    room: "workspace:w1:presence"
  });

  assert.throws(
    () => parsePublishRequestBody({ room: "workspace:w1:lot:1" }),
    { statusCode: 400, message: "Field 'eventType' is required." }
  );
});

function createSocket() {
  return {
    readyState: WebSocket.OPEN,
    sentMessages: [],
    send(raw) {
      this.sentMessages.push(JSON.parse(raw));
    },
    ping() {},
    terminate() {
      this.readyState = WebSocket.CLOSED;
    }
  };
}
