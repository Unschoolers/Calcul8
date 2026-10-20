import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { WebSocket } from "ws";

// Isolates application CPU work; no network, TLS, kernel buffers or client parsing.
// Build first. Optionally pass a different dist directory to compare revisions.
const require = createRequire(import.meta.url);
const dist = process.argv[2] ?? "../dist";
const { RealtimeRoomStore } = require(`${dist}/realtime-room-store.js`);
const { WorkspacePresenceStore } = require(`${dist}/realtime-presence-store.js`);
const clients = 100;
const broadcasts = 200;
const rounds = 7;

function scenario(kind) {
  const rooms = new RealtimeRoomStore();
  const presence = new WorkspacePresenceStore();
  const counters = { sends: 0, wireBytes: 0 };
  const room = kind === "presence" ? "workspace:bench:presence" : "workspace:bench:lot:1";
  for (let index = 0; index < clients; index++) {
    const socket = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send(raw) {
        counters.sends++;
        // All fixtures are ASCII, so string length equals UTF-8 wire bytes.
        counters.wireBytes += raw.length;
      },
      terminate() { throw new Error("Unexpected slow consumer in CPU benchmark."); }
    };
    const client = rooms.addClient(socket);
    client.userId = `user-${index}`;
    rooms.addClientToRoom(client, room);
    if (kind === "presence") presence.syncClientPresenceState(client, rooms);
  }

  const payload = { room, eventType: "sale.updated", data: { text: "x".repeat(16 * 1024) } };
  const started = performance.now();
  if (kind === "presence") {
    // A heartbeat cycle: one pong per connected client. The optimized gateway
    // records liveness directly; older revisions reconcile and broadcast it.
    for (const client of rooms.allClients()) {
      if (typeof presence.refreshClientLastSeen === "function") {
        presence.refreshClientLastSeen(client);
      } else {
        for (const workspaceId of presence.syncClientPresenceState(client, rooms)) {
          rooms.broadcastToRoom(presence.buildWorkspacePresenceEvent(workspaceId));
        }
      }
    }
  } else {
    for (let index = 0; index < broadcasts; index++) {
      assert.equal(rooms.broadcastToRoom(payload), clients);
    }
  }
  return { elapsedMs: performance.now() - started, ...counters };
}

const results = {};
for (const kind of ["broadcast", "presence"]) {
  scenario(kind); // Warm up outside the reported samples.
  const samples = Array.from({ length: rounds }, () => scenario(kind));
  const elapsed = samples.map(sample => sample.elapsedMs).sort((a, b) => a - b);
  results[kind] = {
    medianMs: Number(elapsed[Math.floor(rounds / 2)].toFixed(3)),
    minMs: Number(elapsed[0].toFixed(3)),
    maxMs: Number(elapsed.at(-1).toFixed(3)),
    sends: samples[0].sends,
    wireBytes: samples[0].wireBytes
  };
}
console.log(JSON.stringify({ node: process.version, clients, broadcasts, payloadBytes: 16 * 1024, rounds, results }, null, 2));
