import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocket } from "ws";

export type BroadcastPayload = {
  room: string;
  eventType: string;
  data?: unknown;
};

export type SignedSubscribeTokenPayload = {
  rooms: string[];
  userId?: string;
  exp?: number;
};

export type ClientMessage =
  | { type: "subscribe"; rooms: string[]; token?: string }
  | { type: "unsubscribe"; rooms?: string[] }
  | { type: "ping" };

export type ClientState = {
  id: string;
  socket: WebSocket;
  rooms: Set<string>;
  isAlive: boolean;
  userId?: string;
};

export type WorkspacePresenceMember = {
  userId: string;
  isOnline: boolean;
  lastSeenAt?: string;
};

export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeOptionalBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeRooms(rooms: string[]): string[] {
  return Array.from(
    new Set(
      rooms
        .filter((room): room is string => typeof room === "string")
        .map((room) => room.trim())
        .filter((room) => room.length > 0 && room.length <= 200)
    )
  );
}

export function normalizeRooms(body: unknown): string[] {
  if (isRecord(body)) {
    const room = typeof body.room === "string" ? body.room : null;
    const rooms = Array.isArray(body.rooms) ? body.rooms : null;
    if (room) return sanitizeRooms([room]);
    if (rooms) return sanitizeRooms(rooms);
  }

  throw new Error("Field 'room' or 'rooms' is required.");
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

export function getQueryToken(request: IncomingMessage): string | undefined {
  const baseUrl = `http://${request.headers.host ?? "localhost"}`;
  const url = new URL(request.url ?? "/", baseUrl);
  return normalizeOptionalString(url.searchParams.get("token"));
}

export function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export function sendJson(socket: WebSocket, body: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(body));
}
