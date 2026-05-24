import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { getAuthorizedSubscribePayload, isAuthorizedInternalPublisher } from "./realtime-auth.js";
import {
  type ClientState,
  JsonBodyError,
  getQueryToken,
  normalizeOptionalString,
  readJsonBody,
  sendJson,
  writeJson
} from "./realtime-helpers.js";
import {
  PayloadValidationError,
  parseClientMessage,
  parsePublishRequestBody,
  parseRoomCountRequestBody
} from "./realtime-payloads.js";
import { WorkspacePresenceStore } from "./realtime-presence-store.js";
import { RealtimeRoomStore } from "./realtime-room-store.js";
import {
  parseWorkspacePresenceRealtimeRoom
} from "./workspace-realtime-rooms.js";

export type RealtimeGatewayOptions = {
  allowedOrigins?: string[];
  internalApiKey?: string;
  tokenSecret?: string;
  allowUnauthenticatedSubscribe?: boolean;
  heartbeatMs?: number;
  maxJsonBodyBytes?: number;
  maxWebSocketPayloadBytes?: number;
};

export type RealtimeGateway = {
  server: Server;
  websocketServer: WebSocketServer;
  close: () => Promise<void>;
};

export function createRealtimeGateway(options: RealtimeGatewayOptions = {}): RealtimeGateway {
  const allowedOrigins = options.allowedOrigins ?? [];
  const internalApiKey = normalizeOptionalString(options.internalApiKey);
  const tokenSecret = normalizeOptionalString(options.tokenSecret);
  const allowUnauthenticatedSubscribe = options.allowUnauthenticatedSubscribe ?? false;
  const heartbeatMs = options.heartbeatMs ?? 30000;
  const maxJsonBodyBytes = options.maxJsonBodyBytes ?? 1024 * 1024;
  const maxWebSocketPayloadBytes = options.maxWebSocketPayloadBytes ?? 64 * 1024;

  const roomStore = new RealtimeRoomStore();
  const presenceStore = new WorkspacePresenceStore();

  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/healthz") {
        writeJson(response, 200, {
          ok: true,
          clients: roomStore.clientCount,
          rooms: roomStore.roomCount
        });
        return;
      }

      if (request.method === "POST" && request.url === "/internal/publish") {
        if (!isAuthorizedInternalPublisher(request, internalApiKey)) {
          writeJson(response, 401, { error: "Unauthorized publish request." });
          return;
        }

        const body = await readJsonBody(request, { maxBytes: maxJsonBodyBytes });
        const publishPayload = parsePublishRequestBody(body);

        let delivered = 0;
        for (const room of publishPayload.rooms) {
          delivered += roomStore.broadcastToRoom({
            room,
            eventType: publishPayload.eventType,
            data: publishPayload.data
          });
        }

        writeJson(response, 200, {
          ok: true,
          delivered,
          rooms: publishPayload.rooms
        });
        return;
      }

      if (request.method === "POST" && request.url === "/internal/room-count") {
        if (!isAuthorizedInternalPublisher(request, internalApiKey)) {
          writeJson(response, 401, { error: "Unauthorized room count request." });
          return;
        }

        const body = await readJsonBody(request, { maxBytes: maxJsonBodyBytes });
        const { room } = parseRoomCountRequestBody(body);

        writeJson(response, 200, {
          ok: true,
          room,
          count: roomStore.getRoomMemberCount(room)
        });
        return;
      }

      writeJson(response, 404, { error: "Not found." });
    } catch (error) {
      if (error instanceof JsonBodyError) {
        writeJson(response, error.statusCode, { error: error.message });
        return;
      }

      if (error instanceof PayloadValidationError) {
        writeJson(response, error.statusCode, { error: error.message });
        return;
      }

      const message = error instanceof Error ? error.message : "Unexpected error.";
      writeJson(response, 500, { error: message });
    }
  });

  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: maxWebSocketPayloadBytes
  });

  server.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (url.pathname !== "/socket") {
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
    const state = roomStore.addClient(socket);
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
      clientId: state.id
    });
  });

  const heartbeatIntervalId = setInterval(() => {
    for (const state of roomStore.allClients()) {
      if (!state.isAlive) {
        state.socket.terminate();
        disconnectClient(state);
        continue;
      }

      state.isAlive = false;
      state.socket.ping();
    }
  }, heartbeatMs);

  heartbeatIntervalId.unref();

  async function close(): Promise<void> {
    clearInterval(heartbeatIntervalId);
    for (const state of Array.from(roomStore.allClients())) {
      state.socket.terminate();
      disconnectClient(state);
    }

    await new Promise<void>((resolve) => {
      websocketServer.close(() => resolve());
    });

    if (!server.listening) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  function handleClientMessage(state: ClientState, rawMessage: string, queryToken: string | undefined): void {
    const message = parseClientMessage(rawMessage);

    if (message.type === "ping") {
      sendJson(state.socket, { type: "pong" });
      return;
    }

    if (message.type === "unsubscribe") {
      const rooms = message.rooms ?? Array.from(state.rooms);
      for (const room of rooms) roomStore.removeClientFromRoom(state, room);
      sendJson(state.socket, { type: "unsubscribed", rooms });
      syncClientPresenceState(state);
      return;
    }

    if (message.type === "error") {
      sendJson(state.socket, { type: "error", message: message.message });
      return;
    }

    const token = message.token ?? queryToken;
    const authorizedPayload = getAuthorizedSubscribePayload({
      requestedRooms: message.rooms,
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

    for (const room of message.rooms) roomStore.addClientToRoom(state, room);
    sendJson(state.socket, { type: "subscribed", rooms: message.rooms });
    syncClientPresenceState(state);
    for (const room of message.rooms) {
      const workspaceId = parseWorkspacePresenceRealtimeRoom(room);
      if (workspaceId) {
        presenceStore.sendWorkspacePresenceSnapshot(state.socket, workspaceId);
      }
    }
  }

  function disconnectClient(state: ClientState): void {
    if (roomStore.disconnectClient(state)) {
      syncClientPresenceState(state);
    }
  }

  function syncClientPresenceState(state: ClientState): void {
    for (const workspaceId of presenceStore.syncClientPresenceState(state, roomStore)) {
      roomStore.broadcastToRoom(presenceStore.buildWorkspacePresenceEvent(workspaceId));
    }
  }

  return {
    server,
    websocketServer,
    close
  };
}
