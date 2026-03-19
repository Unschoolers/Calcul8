import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

type BroadcastPayload = {
  room: string;
  eventType: string;
  data?: unknown;
};

type SignedSubscribeTokenPayload = {
  rooms: string[];
  exp?: number;
};

type ClientMessage =
  | { type: "subscribe"; rooms: string[]; token?: string }
  | { type: "unsubscribe"; rooms?: string[] }
  | { type: "ping" };

type ClientState = {
  id: string;
  socket: WebSocket;
  rooms: Set<string>;
  isAlive: boolean;
};

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const allowedOrigin = normalizeOptionalString(process.env.REALTIME_ALLOWED_ORIGIN);
const internalApiKey = normalizeOptionalString(process.env.REALTIME_INTERNAL_API_KEY);
const tokenSecret = normalizeOptionalString(process.env.REALTIME_TOKEN_SECRET);
const allowUnauthenticatedSubscribe =
  normalizeOptionalBoolean(
    process.env.REALTIME_DEV_ALLOW_UNAUTH_SUBSCRIBE,
    process.env.NODE_ENV !== "production"
  );

const clients = new Map<string, ClientState>();
const roomMembers = new Map<string, Set<string>>();
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
      if (!isAuthorizedInternalPublisher(request)) {
        writeJson(response, 401, { error: "Unauthorized publish request." });
        return;
      }

      const body = await readJsonBody(request);
      const rooms = normalizeRooms(body);
      const eventType = typeof body?.eventType === "string" ? body.eventType.trim() : "";
      if (!eventType) {
        writeJson(response, 400, { error: "Field 'eventType' is required." });
        return;
      }

      let delivered = 0;
      for (const room of rooms) {
        delivered += broadcastToRoom({
          room,
          eventType,
          data: body?.data
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

    if (allowedOrigin) {
      const requestOrigin = normalizeOptionalString(request.headers.origin);
      if (requestOrigin !== allowedOrigin) {
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
  if (!isSubscribeAuthorized(requestedRooms, token)) {
    sendJson(state.socket, { type: "error", message: "Subscribe request is not authorized." });
    return;
  }

  for (const room of requestedRooms) addClientToRoom(state, room);
  sendJson(state.socket, { type: "subscribed", rooms: requestedRooms });
}

function isSubscribeAuthorized(requestedRooms: string[], token: string | undefined): boolean {
  if (!tokenSecret) return allowUnauthenticatedSubscribe;
  if (!token) return false;

  const payload = verifySignedToken(token, tokenSecret);
  if (!payload) return false;
  if (payload.exp && Date.now() >= payload.exp * 1000) return false;

  const allowedRooms = new Set(sanitizeRooms(payload.rooms));
  return requestedRooms.every((room) => allowedRooms.has(room));
}

function verifySignedToken(token: string, secret: string): SignedSubscribeTokenPayload | null {
  const firstDot = token.indexOf(".");
  if (firstDot <= 0 || firstDot === token.length - 1) return null;

  const encodedPayload = token.slice(0, firstDot);
  const signature = token.slice(firstDot + 1);
  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const json = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as SignedSubscribeTokenPayload;
    if (!Array.isArray(parsed.rooms)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorizedInternalPublisher(request: IncomingMessage): boolean {
  if (!internalApiKey) return process.env.NODE_ENV !== "production";

  const authHeader = normalizeOptionalString(request.headers.authorization);
  const explicitHeader = normalizeOptionalString(request.headers["x-realtime-key"]);

  if (explicitHeader && safeEqual(explicitHeader, internalApiKey)) return true;
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice("Bearer ".length).trim();
  return safeEqual(token, internalApiKey);
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
}

function sanitizeRooms(rooms: string[]): string[] {
  return Array.from(
    new Set(
      rooms
        .filter((room): room is string => typeof room === "string")
        .map((room) => room.trim())
        .filter((room) => room.length > 0 && room.length <= 200)
    )
  );
}

function normalizeRooms(body: unknown): string[] {
  if (body && typeof body === "object" && body !== null) {
    const room = "room" in body && typeof body.room === "string" ? body.room : null;
    const rooms = "rooms" in body && Array.isArray(body.rooms) ? body.rooms : null;
    if (room) return sanitizeRooms([room]);
    if (rooms) return sanitizeRooms(rooms);
  }

  throw new Error("Field 'room' or 'rooms' is required.");
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function getQueryToken(request: IncomingMessage): string | undefined {
  const baseUrl = `http://${request.headers.host ?? "localhost"}`;
  const url = new URL(request.url ?? "/", baseUrl);
  return normalizeOptionalString(url.searchParams.get("token"));
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function sendJson(socket: WebSocket, body: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(body));
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}
