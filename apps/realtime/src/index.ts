import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
    buildWorkspacePresenceRealtimeRoom,
    parseWorkspacePresenceRealtimeRoom
} from "../../../shared/workspace-realtime-rooms.cjs";
import { getAuthorizedSubscribePayload, isAuthorizedInternalPublisher } from "./realtime-auth.js";
import {
    type BroadcastPayload,
    type ClientMessage,
    type ClientState,
    type WorkspacePresenceMember,
    getQueryToken,
    isRecord,
    normalizeOptionalBoolean,
    normalizeOptionalString,
    normalizeRooms,
    parseAllowedOrigins,
    readJsonBody,
    sanitizeRooms,
    sendJson,
    writeJson
} from "./realtime-helpers.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const allowedOrigins = parseAllowedOrigins(process.env.REALTIME_ALLOWED_ORIGIN);
const internalApiKey = normalizeOptionalString(process.env.REALTIME_INTERNAL_API_KEY);
const tokenSecret = normalizeOptionalString(process.env.REALTIME_TOKEN_SECRET);
const allowUnauthenticatedSubscribe =
  normalizeOptionalBoolean(
    process.env.REALTIME_DEV_ALLOW_UNAUTH_SUBSCRIBE,
    process.env.NODE_ENV !== "production"
  );

const clients = new Map<string, ClientState>();
const roomMembers = new Map<string, Set<string>>();
const workspacePresence = new Map<string, Map<string, WorkspacePresenceMember>>();
let nextClientId = 1;

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      writeJson(response, 200, {
        ok: true,
        clients: clients.size,
        rooms: roomMembers.size
      });
      return;
    }

    if (request.method === "POST" && request.url === "/internal/publish") {
      if (!isAuthorizedInternalPublisher(request, internalApiKey)) {
        writeJson(response, 401, { error: "Unauthorized publish request." });
        return;
      }

      const body = await readJsonBody(request);
      const bodyRecord = isRecord(body) ? body : {};
      const rooms = normalizeRooms(body);
      const eventType = typeof bodyRecord.eventType === "string" ? bodyRecord.eventType.trim() : "";
      if (!eventType) {
        writeJson(response, 400, { error: "Field 'eventType' is required." });
        return;
      }

      let delivered = 0;
      for (const room of rooms) {
        delivered += broadcastToRoom({
          room,
          eventType,
          data: bodyRecord.data
        });
      }

      writeJson(response, 200, {
        ok: true,
        delivered,
        rooms
      });
      return;
    }

    writeJson(response, 404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    writeJson(response, 500, { error: message });
  }
});

const websocketServer = new WebSocketServer({
  noServer: true
});

server.on("upgrade", (request, socket, head) => {
  try {
    if (request.url !== "/socket") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    if (allowedOrigins.length > 0) {
      const requestOrigin = normalizeOptionalString(request.headers.origin);
      if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request);
    });
  } catch {
    socket.destroy();
  }
});

websocketServer.on("connection", (socket, request) => {
  const clientId = `c${nextClientId++}`;
  const state: ClientState = {
    id: clientId,
    socket,
    rooms: new Set(),
    isAlive: true
  };
  clients.set(clientId, state);

  const queryToken = getQueryToken(request);

  socket.on("pong", () => {
    state.isAlive = true;
    syncClientPresenceState(state);
  });

  socket.on("message", (raw) => {
    handleClientMessage(state, raw.toString("utf8"), queryToken);
  });

  socket.on("close", () => {
    disconnectClient(state);
  });

  socket.on("error", () => {
    disconnectClient(state);
  });

  sendJson(socket, {
    type: "connected",
    clientId
  });
});

const heartbeatIntervalId = setInterval(() => {
  for (const state of clients.values()) {
    if (!state.isAlive) {
      state.socket.terminate();
      disconnectClient(state);
      continue;
    }

    state.isAlive = false;
    state.socket.ping();
  }
}, 30000);

heartbeatIntervalId.unref();

server.listen(port, () => {
  console.log(`[realtime] listening on :${port}`);
});

function handleClientMessage(state: ClientState, rawMessage: string, queryToken: string | undefined): void {
  let message: ClientMessage;

  try {
    message = JSON.parse(rawMessage) as ClientMessage;
  } catch {
    sendJson(state.socket, { type: "error", message: "Invalid JSON message." });
    return;
  }

  if (message.type === "ping") {
    sendJson(state.socket, { type: "pong" });
    return;
  }

  if (message.type === "unsubscribe") {
    const rooms = Array.isArray(message.rooms) ? sanitizeRooms(message.rooms) : Array.from(state.rooms);
    for (const room of rooms) removeClientFromRoom(state, room);
    sendJson(state.socket, { type: "unsubscribed", rooms });
    syncClientPresenceState(state);
    return;
  }

  if (message.type !== "subscribe") {
    sendJson(state.socket, { type: "error", message: "Unsupported message type." });
    return;
  }

  const requestedRooms = sanitizeRooms(message.rooms);
  if (requestedRooms.length === 0) {
    sendJson(state.socket, { type: "error", message: "No valid rooms supplied." });
    return;
  }

  const token = normalizeOptionalString(message.token) ?? queryToken;
  const authorizedPayload = getAuthorizedSubscribePayload({
    requestedRooms,
    token,
    tokenSecret,
    allowUnauthenticatedSubscribe
  });
  if (!authorizedPayload) {
    sendJson(state.socket, { type: "error", message: "Subscribe request is not authorized." });
    return;
  }

  if (authorizedPayload.userId) {
    state.userId = authorizedPayload.userId;
  }

  for (const room of requestedRooms) addClientToRoom(state, room);
  sendJson(state.socket, { type: "subscribed", rooms: requestedRooms });
  syncClientPresenceState(state);
  for (const room of requestedRooms) {
    const workspaceId = parseWorkspacePresenceRealtimeRoom(room);
    if (workspaceId) {
      sendWorkspacePresenceSnapshot(state.socket, workspaceId);
    }
  }
}

function broadcastToRoom(payload: BroadcastPayload): number {
  const members = roomMembers.get(payload.room);
  if (!members || members.size === 0) return 0;

  let delivered = 0;
  const outgoingPayload = {
    type: "event",
    room: payload.room,
    eventType: payload.eventType,
    data: payload.data
  };

  for (const clientId of members) {
    const state = clients.get(clientId);
    if (!state || state.socket.readyState !== WebSocket.OPEN) continue;
    sendJson(state.socket, outgoingPayload);
    delivered += 1;
  }

  return delivered;
}

function addClientToRoom(state: ClientState, room: string): void {
  state.rooms.add(room);

  let members = roomMembers.get(room);
  if (!members) {
    members = new Set<string>();
    roomMembers.set(room, members);
  }

  members.add(state.id);
}

function removeClientFromRoom(state: ClientState, room: string): void {
  state.rooms.delete(room);
  const members = roomMembers.get(room);
  if (!members) return;

  members.delete(state.id);
  if (members.size === 0) roomMembers.delete(room);
}

function disconnectClient(state: ClientState): void {
  if (!clients.has(state.id)) return;
  clients.delete(state.id);

  for (const room of Array.from(state.rooms)) removeClientFromRoom(state, room);
  syncClientPresenceState(state);
}


function getWorkspacePresenceMembers(workspaceId: string): Map<string, WorkspacePresenceMember> {
  let members = workspacePresence.get(workspaceId);
  if (!members) {
    members = new Map<string, WorkspacePresenceMember>();
    workspacePresence.set(workspaceId, members);
  }
  return members;
}

function hasActivePresenceSubscription(workspaceId: string, userId: string): boolean {
  const presenceRoom = buildWorkspacePresenceRealtimeRoom(workspaceId);
  for (const client of clients.values()) {
    if (client.userId === userId && client.rooms.has(presenceRoom) && client.socket.readyState === WebSocket.OPEN) {
      return true;
    }
  }
  return false;
}

function syncClientPresenceState(state: ClientState): void {
  const userId = normalizeOptionalString(state.userId);
  if (!userId) return;

  const workspaceIds = new Set<string>();
  for (const room of state.rooms) {
    const workspaceId = parseWorkspacePresenceRealtimeRoom(room);
    if (workspaceId) {
      workspaceIds.add(workspaceId);
    }
  }

  if (workspaceIds.size === 0) {
    for (const [workspaceId, members] of workspacePresence.entries()) {
      if (members.has(userId)) {
        workspaceIds.add(workspaceId);
      }
    }
  }

  const lastSeenAt = new Date().toISOString();
  for (const workspaceId of workspaceIds) {
    const members = getWorkspacePresenceMembers(workspaceId);
    members.set(userId, {
      userId,
      isOnline: hasActivePresenceSubscription(workspaceId, userId),
      lastSeenAt
    });
    broadcastWorkspacePresenceSnapshot(workspaceId);
  }
}

function getWorkspacePresenceSnapshot(workspaceId: string): WorkspacePresenceMember[] {
  return Array.from(getWorkspacePresenceMembers(workspaceId).values());
}

function broadcastWorkspacePresenceSnapshot(workspaceId: string): void {
  broadcastToRoom({
    room: buildWorkspacePresenceRealtimeRoom(workspaceId),
    eventType: "workspace.presence",
    data: {
      workspaceId,
      members: getWorkspacePresenceSnapshot(workspaceId)
    }
  });
}

function sendWorkspacePresenceSnapshot(socket: WebSocket, workspaceId: string): void {
  sendJson(socket, {
    type: "event",
    room: buildWorkspacePresenceRealtimeRoom(workspaceId),
    eventType: "workspace.presence",
    data: {
      workspaceId,
      members: getWorkspacePresenceSnapshot(workspaceId)
    }
  });
}
