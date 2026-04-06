import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ApiConfig } from "../types";
import { HttpError } from "../lib/auth";
import { getConfig } from "../lib/config";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";

const WHEEL_FAIRNESS_ALGORITHM = "whatfees-wheel-v1";
const WHEEL_FAIRNESS_MAX_SLOT_COUNT = 512;
const WHEEL_FAIRNESS_COMMIT_TTL_MS = 15 * 60 * 1000;

type WheelCommitTokenPayload = {
  version: "v1";
  algorithm: typeof WHEEL_FAIRNESS_ALGORITHM;
  serverSeed: string;
  serverSeedHash: string;
  slotCount: number;
  committedAt: number;
  expiresAt: number;
};

function getQueryParam(request: HttpRequest, key: string): string | null {
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

function requireBodyRecord(rawBody: unknown): Record<string, unknown> {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return rawBody as Record<string, unknown>;
}

function parseSlotCount(rawValue: unknown): number {
  const slotCount = Math.floor(Number(rawValue) || 0);
  if (slotCount < 1 || slotCount > WHEEL_FAIRNESS_MAX_SLOT_COUNT) {
    throw new HttpError(400, `Field 'slotCount' must be between 1 and ${WHEEL_FAIRNESS_MAX_SLOT_COUNT}.`);
  }
  return slotCount;
}

function parseClientSeed(rawValue: unknown): string {
  const clientSeed = String(rawValue ?? "").trim();
  if (!clientSeed) {
    throw new HttpError(400, "Field 'clientSeed' is required.");
  }
  if (clientSeed.length > 256) {
    throw new HttpError(400, "Field 'clientSeed' must be 256 characters or fewer.");
  }
  return clientSeed;
}

function parseSeed(rawValue: unknown, fieldName: string): string {
  const seed = String(rawValue ?? "").trim();
  if (!seed) {
    throw new HttpError(400, `Field '${fieldName}' is required.`);
  }
  if (seed.length > 256) {
    throw new HttpError(400, `Field '${fieldName}' must be 256 characters or fewer.`);
  }
  return seed;
}

function hashSeed(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

function getWheelFairnessEncryptionKey(config: ApiConfig): Buffer {
  return createHash("sha256")
    .update(String(config.cosmosKey || "whatfees-wheel-fairness-secret"), "utf8")
    .digest();
}

function encryptCommitToken(config: ApiConfig, payload: WheelCommitTokenPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getWheelFairnessEncryptionKey(config), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${authTag.toString("base64url")}`;
}

function decryptCommitToken(config: ApiConfig, token: string): WheelCommitTokenPayload {
  const [version, ivRaw, ciphertextRaw, authTagRaw] = String(token ?? "").trim().split(".");
  if (version !== "v1" || !ivRaw || !ciphertextRaw || !authTagRaw) {
    throw new HttpError(400, "Field 'commitToken' is invalid.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getWheelFairnessEncryptionKey(config),
      Buffer.from(ivRaw, "base64url")
    );
    decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, "base64url")),
      decipher.final()
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as Partial<WheelCommitTokenPayload>;
    if (
      payload.version !== "v1"
      || payload.algorithm !== WHEEL_FAIRNESS_ALGORITHM
      || typeof payload.serverSeed !== "string"
      || typeof payload.serverSeedHash !== "string"
      || !Number.isFinite(Number(payload.slotCount))
      || !Number.isFinite(Number(payload.committedAt))
      || !Number.isFinite(Number(payload.expiresAt))
    ) {
      throw new Error("invalid payload");
    }

    return {
      version: "v1",
      algorithm: WHEEL_FAIRNESS_ALGORITHM,
      serverSeed: payload.serverSeed,
      serverSeedHash: payload.serverSeedHash,
      slotCount: Math.floor(Number(payload.slotCount)),
      committedAt: Math.floor(Number(payload.committedAt)),
      expiresAt: Math.floor(Number(payload.expiresAt))
    };
  } catch {
    throw new HttpError(400, "Field 'commitToken' is invalid.");
  }
}

function deriveFairResult(serverSeed: string, clientSeed: string, slotCount: number): { resultIndex: number; proofHash: string } {
  if (slotCount < 1) {
    throw new HttpError(400, "Field 'slotCount' must be at least 1.");
  }

  const limit = Math.floor(0x1_0000_0000 / slotCount) * slotCount;

  for (let counter = 0; counter < 128; counter += 1) {
    const proofHash = createHash("sha256")
      .update(`${WHEEL_FAIRNESS_ALGORITHM}:${serverSeed}:${clientSeed}:${counter}`, "utf8")
      .digest("hex");
    const value = parseInt(proofHash.slice(0, 8), 16);
    if (value < limit) {
      return {
        resultIndex: value % slotCount,
        proofHash
      };
    }
  }

  throw new HttpError(500, "Failed to derive a wheel fairness result.");
}

function buildVerificationUrl(request: HttpRequest, serverSeed: string, clientSeed: string, slotCount: number): string {
  const fallbackUrl = "https://api.example/wheel/fairness/reveal";
  const url = new URL(request.url || fallbackUrl);
  if (/\/wheel\/fairness\/reveal$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/wheel\/fairness\/reveal$/i, "/wheel/fairness/verify");
  } else {
    url.pathname = "/wheel/fairness/verify";
  }
  url.search = "";
  url.searchParams.set("serverSeed", serverSeed);
  url.searchParams.set("clientSeed", clientSeed);
  url.searchParams.set("slotCount", String(slotCount));
  return url.toString();
}

async function readRequestJsonOrThrow(request: HttpRequest): Promise<unknown> {
  if (typeof request.json !== "function") {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export async function wheelFairnessCommit(
  request: HttpRequest
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const body = requireBodyRecord(await readRequestJsonOrThrow(request));
    const slotCount = parseSlotCount(body.slotCount);
    const committedAt = Date.now();
    const payload: WheelCommitTokenPayload = {
      version: "v1",
      algorithm: WHEEL_FAIRNESS_ALGORITHM,
      serverSeed: generateServerSeed(),
      serverSeedHash: "",
      slotCount,
      committedAt,
      expiresAt: committedAt + WHEEL_FAIRNESS_COMMIT_TTL_MS
    };
    payload.serverSeedHash = hashSeed(payload.serverSeed);

    return jsonResponse(request, config, 200, {
      commitToken: encryptCommitToken(config, payload),
      serverSeedHash: payload.serverSeedHash,
      slotCount: payload.slotCount,
      algorithm: payload.algorithm,
      committedAt: payload.committedAt,
      expiresAt: payload.expiresAt
    });
  } catch (error) {
    return errorResponse(request, config, error, "Failed to create wheel fairness commit.");
  }
}

export async function wheelFairnessReveal(
  request: HttpRequest
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const body = requireBodyRecord(await readRequestJsonOrThrow(request));
    const commitToken = String(body.commitToken ?? "").trim();
    if (!commitToken) {
      throw new HttpError(400, "Field 'commitToken' is required.");
    }
    const clientSeed = parseClientSeed(body.clientSeed);
    const payload = decryptCommitToken(config, commitToken);
    if (Date.now() > payload.expiresAt) {
      throw new HttpError(410, "Wheel fairness commit expired. Create a new spin.");
    }

    const { resultIndex } = deriveFairResult(payload.serverSeed, clientSeed, payload.slotCount);

    return jsonResponse(request, config, 200, {
      serverSeedHash: payload.serverSeedHash,
      serverSeed: payload.serverSeed,
      clientSeed,
      resultIndex,
      slotCount: payload.slotCount,
      algorithm: payload.algorithm,
      committedAt: payload.committedAt,
      revealedAt: Date.now(),
      verificationUrl: buildVerificationUrl(request, payload.serverSeed, clientSeed, payload.slotCount)
    });
  } catch (error) {
    return errorResponse(request, config, error, "Failed to reveal wheel fairness result.");
  }
}

export async function wheelFairnessVerify(
  request: HttpRequest
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const serverSeed = parseSeed(getQueryParam(request, "serverSeed"), "serverSeed");
    const clientSeed = parseClientSeed(getQueryParam(request, "clientSeed"));
    const slotCount = parseSlotCount(getQueryParam(request, "slotCount"));
    const { resultIndex, proofHash } = deriveFairResult(serverSeed, clientSeed, slotCount);

    return jsonResponse(request, config, 200, {
      serverSeedHash: hashSeed(serverSeed),
      clientSeed,
      slotCount,
      algorithm: WHEEL_FAIRNESS_ALGORITHM,
      resultIndex,
      proofHash
    });
  } catch (error) {
    return errorResponse(request, config, error, "Failed to verify wheel fairness proof.");
  }
}

export async function wheelFairnessHash(
  request: HttpRequest
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const seed = parseSeed(getQueryParam(request, "seed"), "seed");
    return jsonResponse(request, config, 200, {
      hash: hashSeed(seed),
      algorithm: "sha256"
    });
  } catch (error) {
    return errorResponse(request, config, error, "Failed to hash wheel fairness seed.");
  }
}

app.http("wheelFairnessCommit", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/fairness/commit",
  handler: wheelFairnessCommit
});

app.http("wheelFairnessReveal", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/fairness/reveal",
  handler: wheelFairnessReveal
});

app.http("wheelFairnessVerify", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/fairness/verify",
  handler: wheelFairnessVerify
});

app.http("wheelFairnessHash", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "wheel/fairness/hash",
  handler: wheelFairnessHash
});
