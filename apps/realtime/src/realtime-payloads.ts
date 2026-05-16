import {
  type ClientMessage,
  isRecord,
  normalizeOptionalString,
  normalizeRooms,
  sanitizeRooms
} from "./realtime-helpers.js";

export type ParsedClientMessage =
  | { type: "error"; message: string }
  | { type: "ping" }
  | { type: "unsubscribe"; rooms?: string[] }
  | { type: "subscribe"; rooms: string[]; token?: string };

export type PublishRequestPayload = {
  rooms: string[];
  eventType: string;
  data?: unknown;
};

export class PayloadValidationError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PayloadValidationError";
    this.statusCode = statusCode;
  }
}

export function parseClientMessage(rawMessage: string): ParsedClientMessage {
  let message: ClientMessage;

  try {
    message = JSON.parse(rawMessage) as ClientMessage;
  } catch {
    return { type: "error", message: "Invalid JSON message." };
  }

  if (message.type === "ping") {
    return { type: "ping" };
  }

  if (message.type === "unsubscribe") {
    return {
      type: "unsubscribe",
      rooms: Array.isArray(message.rooms) ? sanitizeRooms(message.rooms) : undefined
    };
  }

  if (message.type !== "subscribe") {
    return { type: "error", message: "Unsupported message type." };
  }

  const requestedRooms = Array.isArray(message.rooms) ? sanitizeRooms(message.rooms) : [];
  if (requestedRooms.length === 0) {
    return { type: "error", message: "No valid rooms supplied." };
  }

  const token = normalizeOptionalString(message.token);
  return {
    type: "subscribe",
    rooms: requestedRooms,
    ...(token ? { token } : {})
  };
}

export function parsePublishRequestBody(body: unknown): PublishRequestPayload {
  const bodyRecord = isRecord(body) ? body : {};
  const rooms = normalizeRoomsOrThrow(body);
  const eventType = typeof bodyRecord.eventType === "string" ? bodyRecord.eventType.trim() : "";

  if (!eventType) {
    throw new PayloadValidationError(400, "Field 'eventType' is required.");
  }

  return {
    rooms,
    eventType,
    data: bodyRecord.data
  };
}

export function parseRoomCountRequestBody(body: unknown): { room: string } {
  const bodyRecord = isRecord(body) ? body : {};
  const room = normalizeOptionalString(bodyRecord.room);

  if (!room) {
    throw new PayloadValidationError(400, "Field 'room' is required.");
  }

  return { room };
}

function normalizeRoomsOrThrow(body: unknown): string[] {
  try {
    return normalizeRooms(body);
  } catch {
    throw new PayloadValidationError(400, "Field 'room' or 'rooms' is required.");
  }
}
