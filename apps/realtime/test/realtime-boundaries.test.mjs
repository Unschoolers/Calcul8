import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { parseClientMessage, parsePublishRequestBody, parseRoomCountRequestBody } = require("../dist/realtime-payloads.js");
const { WorkspacePresenceStore } = require("../dist/realtime-presence-store.js");
const { RealtimeRoomStore } = require("../dist/realtime-room-store.js");
const { sendJson } = require("../dist/realtime-helpers.js");

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
    bufferedAmount: 0,
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

test("does not broadcast private data after authorization expiry even before timer cleanup", () => {
  const store = new RealtimeRoomStore();
  const socket = createSocket();
  const client = store.addClient(socket);
  store.addClientToRoom(client, "workspace:private:lot:1");
  client.authorizationExpiresAt = Date.now() - 1;
  assert.equal(store.broadcastToRoom({ room: "workspace:private:lot:1", eventType: "sale.upserted" }), 0);
  assert.deepEqual(socket.sentMessages, []);
});

test("authorization is checked again if it expires during a room broadcast", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const rooms = new RealtimeRoomStore();
  const first = createSocket();
  const expiredDuringBroadcast = createSocket();
  const send = first.send.bind(first);
  first.send = raw => {
    send(raw);
    context.mock.timers.tick(2);
  };
  for (const socket of [first, expiredDuringBroadcast]) {
    const client = rooms.addClient(socket);
    client.authorizationExpiresAt = 1001;
    rooms.addClientToRoom(client, "workspace:w1:lot:1");
  }
  assert.equal(rooms.broadcastToRoom({ room: "workspace:w1:lot:1", eventType: "sale.updated" }), 1);
  assert.deepEqual(expiredDuringBroadcast.sentMessages, []);
});

test("presence keeps the latest heartbeat without broadcasting unchanged online status", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-20T10:00:00Z") });
  const rooms = new RealtimeRoomStore();
  const presence = new WorkspacePresenceStore();
  const client = rooms.addClient(createSocket());
  client.userId = "alice";
  rooms.addClientToRoom(client, "workspace:w1:presence");
  assert.deepEqual(presence.syncClientPresenceState(client, rooms), ["w1"]);
  assert.deepEqual(presence.syncClientPresenceState(client, rooms), []);

  context.mock.timers.tick(30000);
  presence.refreshClientLastSeen(client);
  assert.deepEqual(presence.getWorkspacePresenceSnapshot("w1"), [{
    userId: "alice", isOnline: true, lastSeenAt: "2026-10-20T10:00:30.000Z"
  }]);
  context.mock.timers.tick(1000);
  rooms.disconnectClient(client);
  assert.deepEqual(presence.syncClientPresenceState(client, rooms), ["w1"]);
  assert.deepEqual(presence.getWorkspacePresenceSnapshot("w1"), [{
    userId: "alice", isOnline: false, lastSeenAt: "2026-10-20T10:00:31.000Z"
  }]);
  assert.deepEqual(presence.syncClientPresenceState(client, rooms), []);
});

test("closing one tab preserves online presence until the last tab leaves", () => {
  const rooms = new RealtimeRoomStore();
  const presence = new WorkspacePresenceStore();
  const tabs = [rooms.addClient(createSocket()), rooms.addClient(createSocket())];
  for (const tab of tabs) {
    tab.userId = "alice";
    rooms.addClientToRoom(tab, "workspace:w1:presence");
    presence.syncClientPresenceState(tab, rooms);
  }
  rooms.disconnectClient(tabs[0]);
  assert.deepEqual(presence.syncClientPresenceState(tabs[0], rooms), []);
  assert.equal(presence.getWorkspacePresenceSnapshot("w1")[0].isOnline, true);
  rooms.disconnectClient(tabs[1]);
  assert.deepEqual(presence.syncClientPresenceState(tabs[1], rooms), ["w1"]);
  assert.equal(presence.getWorkspacePresenceSnapshot("w1")[0].isOnline, false);
});

test("unsubscribing one workspace updates its presence while keeping another workspace online", () => {
  const rooms = new RealtimeRoomStore();
  const presence = new WorkspacePresenceStore();
  const client = rooms.addClient(createSocket());
  client.userId = "alice";
  rooms.addClientToRoom(client, "workspace:w1:presence");
  rooms.addClientToRoom(client, "workspace:w2:presence");
  presence.syncClientPresenceState(client, rooms);
  rooms.removeClientFromRoom(client, "workspace:w1:presence");
  assert.deepEqual(presence.syncClientPresenceState(client, rooms), ["w1"]);
  assert.equal(presence.getWorkspacePresenceSnapshot("w1")[0].isOnline, false);
  assert.equal(presence.getWorkspacePresenceSnapshot("w2")[0].isOnline, true);
});

test("expired subscriptions cannot keep a user's presence online while cleanup is delayed", () => {
  const rooms = new RealtimeRoomStore();
  const presence = new WorkspacePresenceStore();
  const client = rooms.addClient(createSocket());
  client.userId = "alice";
  rooms.addClientToRoom(client, "workspace:w1:presence");
  presence.syncClientPresenceState(client, rooms);
  client.authorizationExpiresAt = Date.now() - 1;
  assert.equal(rooms.hasActivePresenceSubscription("w1", "alice"), false);
  assert.deepEqual(presence.syncClientPresenceState(client, rooms), ["w1"]);
  assert.equal(presence.getWorkspacePresenceSnapshot("w1")[0].isOnline, false);
});

test("a slow room member is disconnected without blocking delivery to healthy members", () => {
  const rooms = new RealtimeRoomStore({ maxBufferedBytes: 256 });
  const slow = createSocket();
  const healthy = createSocket();
  slow.bufferedAmount = 256;
  for (const socket of [slow, healthy]) {
    rooms.addClientToRoom(rooms.addClient(socket), "workspace:w1:lot:1");
  }
  const payload = { room: "workspace:w1:lot:1", eventType: "sale.updated", data: { id: "sale-1" } };
  assert.equal(rooms.broadcastToRoom(payload), 1);
  assert.equal(slow.readyState, WebSocket.CLOSED);
  assert.deepEqual(slow.sentMessages, []);
  assert.deepEqual(healthy.sentMessages, [{ type: "event", ...payload }]);
  assert.equal(rooms.broadcastToRoom(payload), 1);
});

test("outbound limits count UTF-8 bytes and accept a message exactly at the limit", () => {
  const socket = createSocket();
  sendJson(socket, "é", 4); // JSON quotes plus a two-byte character.
  assert.deepEqual(socket.sentMessages, ["é"]);
  socket.bufferedAmount = 1;
  sendJson(socket, "é", 4);
  assert.equal(socket.readyState, WebSocket.CLOSED);
  assert.deepEqual(socket.sentMessages, ["é"]);
});

test("a room event is encoded once and delivered identically to all recipients", (context) => {
  const rooms = new RealtimeRoomStore();
  const sockets = Array.from({ length: 20 }, () => createSocket());
  for (const socket of sockets) rooms.addClientToRoom(rooms.addClient(socket), "workspace:w1:lot:1");
  const stringify = context.mock.method(JSON, "stringify");
  const delivered = rooms.broadcastToRoom({
    room: "workspace:w1:lot:1", eventType: "sale.updated", data: { id: "sale-1", price: 42 }
  });
  assert.equal(stringify.mock.callCount(), 1);
  assert.equal(delivered, 20);
  for (const socket of sockets) assert.deepEqual(socket.sentMessages, [{
    type: "event", room: "workspace:w1:lot:1", eventType: "sale.updated", data: { id: "sale-1", price: 42 }
  }]);
});
