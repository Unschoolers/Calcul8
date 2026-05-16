import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { once } from "node:events";
import { test } from "node:test";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createRealtimeGateway } = require("../dist/realtime-gateway.js");

const TEST_TIMEOUT_MS = 1500;

test("requires signed subscribe tokens and internal publish authorization", async () => {
  const room = "workspace:w1:lot:7";
  const tokenSecret = "test-token-secret";
  const internalApiKey = "test-internal-key";
  const context = await startGateway({
    internalApiKey,
    tokenSecret,
    allowUnauthenticatedSubscribe: false
  });

  try {
    const socket = await openSocket(context.socketUrl);

    const unauthorizedSubscribe = waitForMessage(socket, (message) => message.type === "error");
    socket.send(JSON.stringify({ type: "subscribe", rooms: [room] }));
    assert.deepEqual(await unauthorizedSubscribe, {
      type: "error",
      message: "Subscribe request is not authorized."
    });

    const subscribed = waitForMessage(socket, (message) => message.type === "subscribed");
    socket.send(JSON.stringify({
      type: "subscribe",
      rooms: [room],
      token: signSubscribeToken({
        rooms: [room],
        userId: "user-1",
        exp: Math.floor(Date.now() / 1000) + 60
      }, tokenSecret)
    }));
    assert.deepEqual(await subscribed, {
      type: "subscribed",
      rooms: [room]
    });

    const unauthorizedCount = await postJson(context.baseUrl, "/internal/room-count", { room });
    assert.equal(unauthorizedCount.status, 401);

    const countResponse = await postJson(
      context.baseUrl,
      "/internal/room-count",
      { room },
      { authorization: `Bearer ${internalApiKey}` }
    );
    assert.equal(countResponse.status, 200);
    assert.equal((await countResponse.json()).count, 1);

    const publishedEvent = waitForMessage(socket, (message) => message.type === "event");
    const publishResponse = await postJson(
      context.baseUrl,
      "/internal/publish",
      { room, eventType: "sale.updated", data: { id: "sale-1" } },
      { "x-realtime-key": internalApiKey }
    );
    assert.equal(publishResponse.status, 200);
    assert.equal((await publishResponse.json()).delivered, 1);

    assert.deepEqual(await publishedEvent, {
      type: "event",
      room,
      eventType: "sale.updated",
      data: { id: "sale-1" }
    });

    socket.close();
  } finally {
    await context.close();
  }
});

test("allows unauthenticated subscribes only when development mode permits it", async () => {
  const context = await startGateway({
    allowUnauthenticatedSubscribe: true
  });

  try {
    const socket = await openSocket(context.socketUrl);

    const subscribed = waitForMessage(socket, (message) => message.type === "subscribed");
    socket.send(JSON.stringify({ type: "subscribe", rooms: ["workspace:w2:lot:4"] }));
    assert.deepEqual(await subscribed, {
      type: "subscribed",
      rooms: ["workspace:w2:lot:4"]
    });

    socket.close();
  } finally {
    await context.close();
  }
});

test("rejects websocket origins outside the configured allow-list", async () => {
  const context = await startGateway({
    allowedOrigins: ["https://app.whatfees.ca"],
    allowUnauthenticatedSubscribe: true
  });

  try {
    await assert.rejects(
      () => openSocket(context.socketUrl, { headers: { Origin: "https://evil.example" } }),
      /Unexpected server response: 403/
    );

    const socket = await openSocket(context.socketUrl, {
      headers: { Origin: "https://app.whatfees.ca" }
    });
    socket.close();
  } finally {
    await context.close();
  }
});

test("reports malformed websocket and HTTP bodies without leaking server errors", async () => {
  const context = await startGateway({
    internalApiKey: "body-key",
    allowUnauthenticatedSubscribe: true,
    maxJsonBodyBytes: 16
  });

  try {
    const socket = await openSocket(context.socketUrl);

    const invalidMessage = waitForMessage(socket, (message) => message.type === "error");
    socket.send("{");
    assert.deepEqual(await invalidMessage, {
      type: "error",
      message: "Invalid JSON message."
    });

    const malformedResponse = await fetch(`${context.baseUrl}/internal/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-realtime-key": "body-key"
      },
      body: "{"
    });
    assert.equal(malformedResponse.status, 400);
    assert.deepEqual(await malformedResponse.json(), { error: "Invalid JSON body." });

    const oversizedResponse = await fetch(`${context.baseUrl}/internal/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-realtime-key": "body-key"
      },
      body: JSON.stringify({ room: "workspace:w3:lot:1", eventType: "x".repeat(32) })
    });
    assert.equal(oversizedResponse.status, 413);
    assert.deepEqual(await oversizedResponse.json(), { error: "JSON body is too large." });

    socket.close();
  } finally {
    await context.close();
  }
});

test("publishes presence snapshots and marks disconnected members offline", async () => {
  const presenceRoom = "workspace:presence-test:presence";
  const tokenSecret = "presence-secret";
  const context = await startGateway({
    tokenSecret,
    allowUnauthenticatedSubscribe: false
  });

  try {
    const alice = await openSocket(context.socketUrl);
    const aliceSubscribed = waitForMessage(alice, (message) => message.type === "subscribed");
    const aliceOnline = waitForPresence(alice, "alice", true);
    subscribe(alice, presenceRoom, tokenSecret, "alice");
    await aliceSubscribed;
    await aliceOnline;

    const bob = await openSocket(context.socketUrl);
    const bobSubscribed = waitForMessage(bob, (message) => message.type === "subscribed");
    const bobOnline = waitForPresence(bob, "bob", true);
    subscribe(bob, presenceRoom, tokenSecret, "bob");
    await bobSubscribed;
    await bobOnline;

    const aliceOffline = waitForPresence(bob, "alice", false);
    alice.close();
    await once(alice, "close");

    const offlineAlice = await aliceOffline;
    assert.equal(offlineAlice.data.workspaceId, "presence-test");

    bob.close();
  } finally {
    await context.close();
  }
});

test("terminates stale websocket clients during heartbeat cleanup", async () => {
  const context = await startGateway({
    heartbeatMs: 20,
    allowUnauthenticatedSubscribe: true
  });

  try {
    const socket = await openSocket(context.socketUrl, { autoPong: false });
    await once(socket, "close");

    const healthResponse = await fetch(`${context.baseUrl}/healthz`);
    assert.equal(healthResponse.status, 200);
    assert.equal((await healthResponse.json()).clients, 0);
  } finally {
    await context.close();
  }
});

function signSubscribeToken(payload, secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

async function startGateway(options) {
  const gateway = createRealtimeGateway(options);

  await new Promise((resolve, reject) => {
    gateway.server.once("error", reject);
    gateway.server.listen(0, "127.0.0.1", () => {
      gateway.server.off("error", reject);
      resolve();
    });
  });

  const address = gateway.server.address();
  assert(address && typeof address === "object");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    socketUrl: `ws://127.0.0.1:${address.port}/socket`,
    close: () => gateway.close()
  };
}

async function openSocket(url, options = {}) {
  const socket = new WebSocket(url, options);
  await Promise.race([
    once(socket, "open"),
    once(socket, "error").then(([error]) => {
      throw error;
    }),
    timeout("websocket open")
  ]);
  return socket;
}

function waitForMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for websocket message."));
    }, TEST_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
      socket.off("close", onClose);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onClose() {
      cleanup();
      reject(new Error("Websocket closed before expected message."));
    }

    function onMessage(raw) {
      const message = JSON.parse(raw.toString("utf8"));
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    }

    socket.on("message", onMessage);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function postJson(baseUrl, path, body, headers = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

function subscribe(socket, room, tokenSecret, userId) {
  socket.send(JSON.stringify({
    type: "subscribe",
    rooms: [room],
    token: signSubscribeToken({
      rooms: [room],
      userId,
      exp: Math.floor(Date.now() / 1000) + 60
    }, tokenSecret)
  }));
}

async function waitForPresence(socket, userId, isOnline) {
  return waitForMessage(socket, (message) => {
    if (message.type !== "event" || message.eventType !== "workspace.presence") return false;
    const members = Array.isArray(message.data?.members) ? message.data.members : [];
    return members.some((member) => member.userId === userId && member.isOnline === isOnline);
  });
}

function timeout(label) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), TEST_TIMEOUT_MS);
  });
}
