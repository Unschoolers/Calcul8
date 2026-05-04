import type { HttpRequest } from "@azure/functions";
import { HttpError } from "../../lib/auth";
import type { WheelFairnessProofDocument, WheelFairnessProofLayoutSlot } from "../../types";
import {
  WHEEL_FAIRNESS_MAX_SLOT_COUNT,
  hashSeed,
  serializeProofLayout
} from "./fairnessVerifier";

export type WheelFairnessProofRequest = {
  serverSeed: string;
  clientSeed: string;
  slotCount: number;
  layoutHash: string | null;
  layoutSlots: WheelFairnessProofLayoutSlot[] | null;
  layoutError: string | null;
  slotLabel: string | null;
  wheelName: string | null;
  spinNumber: number | null;
};

export function getQueryParam(request: HttpRequest, key: string): string | null {
  if (request.query && typeof request.query.get === "function") {
    return request.query.get(key);
  }

  if (!request.url) return null;
  try {
    return new URL(request.url).searchParams.get(key);
  } catch {
    return null;
  }
}

export function requireBodyRecord(rawBody: unknown): Record<string, unknown> {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return rawBody as Record<string, unknown>;
}

export function parseSlotCount(rawValue: unknown): number {
  const slotCount = Math.floor(Number(rawValue) || 0);
  if (slotCount < 1 || slotCount > WHEEL_FAIRNESS_MAX_SLOT_COUNT) {
    throw new HttpError(400, `Field 'slotCount' must be between 1 and ${WHEEL_FAIRNESS_MAX_SLOT_COUNT}.`);
  }
  return slotCount;
}

export function parseClientSeed(rawValue: unknown): string {
  const clientSeed = String(rawValue ?? "").trim();
  if (!clientSeed) {
    throw new HttpError(400, "Field 'clientSeed' is required.");
  }
  if (clientSeed.length > 256) {
    throw new HttpError(400, "Field 'clientSeed' must be 256 characters or fewer.");
  }
  return clientSeed;
}

export function parseLayoutHash(rawValue: unknown): string {
  const layoutHash = String(rawValue ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(layoutHash)) {
    throw new HttpError(400, "Field 'layoutHash' must be a 64 character SHA-256 hex string.");
  }
  return layoutHash;
}

export function parseSeed(rawValue: unknown, fieldName: string): string {
  const seed = String(rawValue ?? "").trim();
  if (!seed) {
    throw new HttpError(400, `Field '${fieldName}' is required.`);
  }
  if (seed.length > 256) {
    throw new HttpError(400, `Field '${fieldName}' must be 256 characters or fewer.`);
  }
  return seed;
}

export function parseOptionalDisplayValue(rawValue: unknown, fieldName: string, maxLength: number): string | null {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  if (value.length > maxLength) {
    throw new HttpError(400, `Field '${fieldName}' must be ${maxLength} characters or fewer.`);
  }
  return value;
}

export function parseOptionalPositiveInteger(rawValue: unknown, fieldName: string): number | null {
  if (rawValue == null || rawValue === "") return null;
  const value = Math.floor(Number(rawValue));
  if (!Number.isFinite(value) || value < 1) {
    throw new HttpError(400, `Field '${fieldName}' must be a positive integer.`);
  }
  return value;
}

function normalizeProofLayoutSlot(rawValue: unknown): WheelFairnessProofLayoutSlot {
  if (!Array.isArray(rawValue) || rawValue.length < 4) {
    throw new HttpError(400, "Field 'layout' must contain valid wheel slots.");
  }
  const [nameRaw, colorRaw, tierRaw, isChaseRaw] = rawValue;
  const name = String(nameRaw ?? "").trim();
  const color = String(colorRaw ?? "").trim().toLowerCase();
  const tier = String(tierRaw ?? "").trim();
  if (!name || !color || !tier) {
    throw new HttpError(400, "Field 'layout' must contain valid wheel slots.");
  }
  return {
    name,
    color,
    tier,
    isChase: isChaseRaw === true || isChaseRaw === 1 || isChaseRaw === "1"
  };
}

export function parseLayoutPayload(
  rawValue: unknown,
  slotCount: number,
  layoutHash: string | null
): WheelFairnessProofLayoutSlot[] | null {
  const encoded = String(rawValue ?? "").trim();
  if (!encoded) return null;

  try {
    const json = encoded.startsWith("[")
      ? encoded
      : (() => {
          const normalized = encoded.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
          const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
          return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
        })();
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      throw new Error("invalid layout");
    }
    const slots = parsed.map((entry) => normalizeProofLayoutSlot(entry));
    if (slots.length !== slotCount) {
      throw new HttpError(400, "Field 'layout' must contain exactly 'slotCount' slots.");
    }
    if (layoutHash && hashSeed(serializeProofLayout(slots)) !== layoutHash) {
      throw new HttpError(400, "Field 'layout' does not match 'layoutHash'.");
    }
    return slots;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, "Field 'layout' is invalid.");
  }
}

export function tryParseLayoutPayload(rawValue: unknown, slotCount: number, layoutHash: string | null): {
  layoutSlots: WheelFairnessProofLayoutSlot[] | null;
  layoutError: string | null;
} {
  try {
    return {
      layoutSlots: parseLayoutPayload(rawValue, slotCount, layoutHash),
      layoutError: null
    };
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        layoutSlots: null,
        layoutError: error.message
      };
    }
    return {
      layoutSlots: null,
      layoutError: "Field 'layout' is invalid."
    };
  }
}

export function parseVerificationProofQueryRequest(request: HttpRequest): WheelFairnessProofRequest {
  const serverSeed = parseSeed(getQueryParam(request, "serverSeed"), "serverSeed");
  const clientSeed = parseClientSeed(getQueryParam(request, "clientSeed"));
  const slotCount = parseSlotCount(getQueryParam(request, "slotCount"));
  const rawLayoutHash = getQueryParam(request, "layoutHash");
  const layoutHash = rawLayoutHash ? parseLayoutHash(rawLayoutHash) : null;
  const { layoutSlots, layoutError } = tryParseLayoutPayload(getQueryParam(request, "layout"), slotCount, layoutHash);
  const slotLabel = parseOptionalDisplayValue(getQueryParam(request, "slotLabel"), "slotLabel", 120);
  const wheelName = parseOptionalDisplayValue(getQueryParam(request, "wheelName"), "wheelName", 120);
  const spinNumber = parseOptionalPositiveInteger(getQueryParam(request, "spinNumber"), "spinNumber");
  return {
    serverSeed,
    clientSeed,
    slotCount,
    layoutHash,
    layoutSlots,
    layoutError,
    slotLabel,
    wheelName,
    spinNumber
  };
}

export function parseStoredProofRequest(proof: WheelFairnessProofDocument): WheelFairnessProofRequest {
  return {
    serverSeed: parseSeed(proof.serverSeed, "serverSeed"),
    clientSeed: parseClientSeed(proof.clientSeed),
    slotCount: parseSlotCount(proof.slotCount),
    layoutHash: proof.layoutHash ? parseLayoutHash(proof.layoutHash) : null,
    layoutSlots: proof.layoutSlots,
    layoutError: null,
    slotLabel: proof.slotLabel ? parseOptionalDisplayValue(proof.slotLabel, "slotLabel", 120) : null,
    wheelName: proof.wheelName ? parseOptionalDisplayValue(proof.wheelName, "wheelName", 120) : null,
    spinNumber: proof.spinNumber != null ? parseOptionalPositiveInteger(proof.spinNumber, "spinNumber") : null
  };
}

export function parseProofCreationRequest(body: Record<string, unknown>): Omit<WheelFairnessProofRequest, "layoutError"> {
  const serverSeed = parseSeed(body.serverSeed, "serverSeed");
  const clientSeed = parseClientSeed(body.clientSeed);
  const slotCount = parseSlotCount(body.slotCount);
  const layoutHash = body.layoutHash == null || body.layoutHash === "" ? null : parseLayoutHash(body.layoutHash);
  const layoutSlots = body.layout == null ? null : parseLayoutPayload(body.layout, slotCount, layoutHash);
  const slotLabel = parseOptionalDisplayValue(body.slotLabel, "slotLabel", 120);
  const wheelName = parseOptionalDisplayValue(body.wheelName, "wheelName", 120);
  const spinNumber = parseOptionalPositiveInteger(body.spinNumber, "spinNumber");
  return {
    serverSeed,
    clientSeed,
    slotCount,
    layoutHash,
    layoutSlots,
    slotLabel,
    wheelName,
    spinNumber
  };
}
