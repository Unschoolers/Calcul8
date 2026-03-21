import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  normalizeOptionalString,
  sanitizeRooms,
  type SignedSubscribeTokenPayload
} from "./realtime-helpers.js";

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

export function getAuthorizedSubscribePayload(args: {
  requestedRooms: string[];
  token: string | undefined;
  tokenSecret: string | undefined;
  allowUnauthenticatedSubscribe: boolean;
}): SignedSubscribeTokenPayload | null {
  const { requestedRooms, token, tokenSecret, allowUnauthenticatedSubscribe } = args;
  if (!tokenSecret) {
    return allowUnauthenticatedSubscribe ? { rooms: requestedRooms } : null;
  }
  if (!token) return null;

  const payload = verifySignedToken(token, tokenSecret);
  if (!payload) return null;
  if (payload.exp && Date.now() >= payload.exp * 1000) return null;

  const allowedRooms = new Set(sanitizeRooms(payload.rooms));
  return requestedRooms.every((room) => allowedRooms.has(room))
    ? payload
    : null;
}

export function isAuthorizedInternalPublisher(
  request: IncomingMessage,
  internalApiKey: string | undefined
): boolean {
  if (!internalApiKey) return process.env.NODE_ENV !== "production";

  const authHeader = normalizeOptionalString(request.headers.authorization);
  const explicitHeader = normalizeOptionalString(request.headers["x-realtime-key"]);

  if (explicitHeader && safeEqual(explicitHeader, internalApiKey)) return true;
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice("Bearer ".length).trim();
  return safeEqual(token, internalApiKey);
}
