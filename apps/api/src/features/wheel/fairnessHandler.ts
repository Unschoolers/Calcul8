import { type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { HttpError } from "../../lib/auth";
import { getConfig } from "../../lib/config";
import {
  createWheelFairnessProof,
  getWheelFairnessProof
} from "../../lib/cosmos/wheelFairnessProofRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../../lib/http";
import type { ApiConfig, WheelFairnessProofLayoutSlot } from "../../types";

const WHEEL_FAIRNESS_ALGORITHM = "whatfees-wheel-v1";
const WHEEL_FAIRNESS_MAX_SLOT_COUNT = 512;
const WHEEL_FAIRNESS_COMMIT_TTL_MS = 15 * 60 * 1000;

type WheelCommitTokenPayload = {
  version: "v1";
  algorithm: typeof WHEEL_FAIRNESS_ALGORITHM;
  serverSeed: string;
  serverSeedHash: string;
  layoutHash: string;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlResponse(status: number, html: string): HttpResponseInit {
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    },
    body: html
  };
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

function parseLayoutHash(rawValue: unknown): string {
  const layoutHash = String(rawValue ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(layoutHash)) {
    throw new HttpError(400, "Field 'layoutHash' must be a 64 character SHA-256 hex string.");
  }
  return layoutHash;
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

function parseOptionalDisplayValue(rawValue: unknown, fieldName: string, maxLength: number): string | null {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  if (value.length > maxLength) {
    throw new HttpError(400, `Field '${fieldName}' must be ${maxLength} characters or fewer.`);
  }
  return value;
}

function parseOptionalPositiveInteger(rawValue: unknown, fieldName: string): number | null {
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

function serializeProofLayout(slots: WheelFairnessProofLayoutSlot[]): string {
  return JSON.stringify(slots.map((slot) => ([
    slot.name,
    slot.color,
    slot.tier,
    slot.isChase ? 1 : 0
  ])));
}

function parseLayoutPayload(rawValue: unknown, slotCount: number, layoutHash: string | null): WheelFairnessProofLayoutSlot[] | null {
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

function tryParseLayoutPayload(rawValue: unknown, slotCount: number, layoutHash: string | null): {
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

async function resolveVerificationProofRequest(
  request: HttpRequest,
  config: ApiConfig
): Promise<{
  serverSeed: string;
  clientSeed: string;
  slotCount: number;
  layoutHash: string | null;
  layoutSlots: WheelFairnessProofLayoutSlot[] | null;
  layoutError: string | null;
  slotLabel: string | null;
  wheelName: string | null;
  spinNumber: number | null;
}> {
  const proofId = String(getQueryParam(request, "proofId") ?? "").trim();
  if (proofId) {
    return await getStoredProofRequest(config, proofId);
  }

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

async function getStoredProofRequest(
  config: ApiConfig,
  proofId: string
): Promise<{
  serverSeed: string;
  clientSeed: string;
  slotCount: number;
  layoutHash: string | null;
  layoutSlots: WheelFairnessProofLayoutSlot[] | null;
  layoutError: string | null;
  slotLabel: string | null;
  wheelName: string | null;
  spinNumber: number | null;
}> {
  const proof = await getWheelFairnessProof(config, proofId);
  if (!proof) {
    throw new HttpError(404, "Wheel fairness proof not found.");
  }

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

function parseProofCreationRequest(body: Record<string, unknown>): {
  serverSeed: string;
  clientSeed: string;
  slotCount: number;
  layoutHash: string | null;
  layoutSlots: WheelFairnessProofLayoutSlot[] | null;
  slotLabel: string | null;
  wheelName: string | null;
  spinNumber: number | null;
} {
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
      || typeof payload.layoutHash !== "string"
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
      layoutHash: payload.layoutHash,
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

function buildVerificationUrl(
  request: HttpRequest,
  serverSeed: string,
  clientSeed: string,
  slotCount: number,
  layoutHash: string | null
): string {
  const fallbackUrl = "https://api.example/wheel/fairness/reveal";
  const url = new URL(request.url || fallbackUrl);
  const pathMatch = /^(.*)\/wheel\/fairness\/reveal$/i.exec(url.pathname);
  let routePrefix = pathMatch?.[1] ?? "";
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!routePrefix && isLocalhost) {
    routePrefix = "/api";
  }
  url.pathname = `${routePrefix}/wheel/fairness/verify`.replace(/\/+/g, "/");
  url.search = "";
  url.searchParams.set("serverSeed", serverSeed);
  url.searchParams.set("clientSeed", clientSeed);
  url.searchParams.set("slotCount", String(slotCount));
  if (layoutHash) {
    url.searchParams.set("layoutHash", layoutHash);
  }
  return url.toString();
}

function buildVerificationJsonUrl(
  request: HttpRequest,
  serverSeed: string,
  clientSeed: string,
  slotCount: number,
  layoutHash: string | null
): string {
  const url = new URL(buildVerificationUrl(request, serverSeed, clientSeed, slotCount, layoutHash));
  url.searchParams.set("format", "json");
  return url.toString();
}

function buildStoredProofVerificationUrl(
  request: HttpRequest,
  proofId: string,
  format: "html" | "json"
): string {
  const fallbackUrl = "https://api.example/wheel/fairness/proof";
  const url = new URL(request.url || fallbackUrl);
  const pathMatch = /^(.*)\/wheel\/fairness\/(?:proof|verify)$/i.exec(url.pathname);
  let routePrefix = pathMatch?.[1] ?? "";
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!routePrefix && isLocalhost) {
    routePrefix = "/api";
  }
  url.pathname = `${routePrefix}/wheel/fairness/verify`.replace(/\/+/g, "/");
  url.search = "";
  url.searchParams.set("proofId", proofId);
  url.searchParams.set("format", format);
  return url.toString();
}

function truncateProofValue(value: string, leading = 14, trailing = 10): string {
  if (value.length <= leading + trailing + 3) return value;
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}

function buildWheelFairnessHtmlPage(params: {
  summaryTitle: string;
  summary: string;
  wheelName: string | null;
  slotLabel: string | null;
  spinNumber: number | null;
  resultSlotNumber: number;
  slotCount: number;
  serverSeedHash: string;
  layoutHash: string | null;
  layoutSlots: WheelFairnessProofLayoutSlot[] | null;
  layoutError: string | null;
  clientSeed: string;
  serverSeed: string;
  proofHash: string;
  algorithm: string;
  jsonUrl: string;
}): string {
  const title = escapeHtml(params.summaryTitle);
  const summary = escapeHtml(params.summary);
  const wheelName = params.wheelName ? escapeHtml(params.wheelName) : "Unknown wheel";
  const slotLabel = params.slotLabel ? escapeHtml(params.slotLabel) : `Slot ${params.resultSlotNumber}`;
  const spinLabel = params.spinNumber != null ? `Spin #${params.spinNumber}` : "Verified spin";
  const resultText = `${slotLabel} • Slot ${params.resultSlotNumber} of ${params.slotCount}`;
  const jsonUrl = escapeHtml(params.jsonUrl);
  const serverSeedHash = escapeHtml(params.serverSeedHash);
  const layoutHash = params.layoutHash ? escapeHtml(params.layoutHash) : "";
  const clientSeed = escapeHtml(params.clientSeed);
  const serverSeed = escapeHtml(params.serverSeed);
  const proofHash = escapeHtml(params.proofHash);
  const algorithm = escapeHtml(params.algorithm);
  const serverSeedHashPreview = escapeHtml(truncateProofValue(params.serverSeedHash));
  const layoutHashPreview = params.layoutHash ? escapeHtml(truncateProofValue(params.layoutHash)) : "";
  const clientSeedPreview = escapeHtml(truncateProofValue(params.clientSeed));
  const serverSeedPreview = escapeHtml(truncateProofValue(params.serverSeed));
  const layoutError = params.layoutError ? escapeHtml(params.layoutError) : "";
  const layoutMarkup = (params.layoutSlots || []).map((slot, index) => {
    const badge = slot.isChase ? '<span class="layout-slot__badge">Chase</span>' : "";
    return `<li class="layout-slot">
      <span class="layout-slot__index">${index + 1}</span>
      <span class="layout-slot__swatch" style="background:${escapeHtml(slot.color)}"></span>
      <div class="layout-slot__content">
        <div class="layout-slot__name">${escapeHtml(slot.name)} ${badge}</div>
        <div class="layout-slot__meta">Tier: ${escapeHtml(slot.tier)} • ${escapeHtml(slot.color)}</div>
      </div>
    </li>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #171510;
        --panel: rgba(30, 27, 23, 0.92);
        --panel-2: rgba(39, 35, 30, 0.96);
        --panel-3: rgba(23, 27, 22, 0.88);
        --text: #f8f5ee;
        --muted: #c4bdae;
        --accent: #f5c84c;
        --good: #59d48a;
        --good-soft: rgba(89, 212, 138, 0.14);
        --border: rgba(255,255,255,0.08);
        --border-strong: rgba(255,255,255,0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, rgba(245,200,76,0.12), transparent 34%),
          linear-gradient(180deg, #1d1a14 0%, #14120f 100%);
        color: var(--text);
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 28px 20px 56px;
      }
      .hero, .card {
        background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: 0 24px 54px rgba(0,0,0,0.24);
      }
      .hero { padding: 28px; margin-bottom: 20px; }
      .eyebrow {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        color: var(--good);
        font-size: 0.84rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      h1 {
        margin: 14px 0 12px;
        font-size: clamp(2rem, 5vw, 3rem);
        line-height: 1.04;
        letter-spacing: -0.03em;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .hero__lede {
        max-width: 44rem;
        font-size: 1.04rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin: 20px 0 0;
      }
      .metric {
        padding: 16px;
        border-radius: 18px;
        background: var(--panel);
        border: 1px solid var(--border);
      }
      .metric__label {
        color: var(--muted);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .metric__value {
        margin-top: 8px;
        font-size: 1.18rem;
        font-weight: 800;
      }
      .card {
        padding: 22px;
        margin-top: 18px;
      }
      .card h2 {
        margin: 0 0 12px;
        font-size: 1.25rem;
        letter-spacing: -0.02em;
      }
      .card h3 {
        margin: 0;
        font-size: 1rem;
        letter-spacing: -0.01em;
      }
      .trust-note {
        margin-top: -2px;
        max-width: 44rem;
      }
      .verify-panel {
        display: grid;
        gap: 16px;
        margin-top: 16px;
      }
      .verify-notes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
      }
      .verify-note {
        padding: 16px 18px;
        border-radius: 18px;
        background: var(--panel);
        border: 1px solid var(--border);
      }
      .verify-note--good {
        border-color: rgba(89, 212, 138, 0.18);
        background: linear-gradient(180deg, rgba(89, 212, 138, 0.07), rgba(255,255,255,0.01));
      }
      .verify-note--honest {
        border-color: rgba(245, 200, 76, 0.16);
      }
      .verify-note__label {
        color: var(--muted);
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 800;
      }
      .verify-note__body {
        margin-top: 8px;
        color: var(--text);
        font-size: 0.96rem;
        line-height: 1.45;
      }
      .verify-summary {
        padding: 16px 18px;
        border-radius: 18px;
        background: var(--panel);
        border: 1px solid var(--border);
      }
      .verify-summary--warning {
        border-color: rgba(245, 200, 76, 0.25);
        background: linear-gradient(180deg, rgba(245, 200, 76, 0.08), rgba(255,255,255,0.01));
      }
      .verify-summary p {
        margin-top: 8px;
      }
      .steps {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .step {
        padding: 16px 18px;
        border-radius: 18px;
        background: var(--panel);
        border: 1px solid var(--border);
        display: grid;
        gap: 10px;
      }
      .step__top {
        display: grid;
        gap: 6px;
      }
      .step__kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--good);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 800;
      }
      .step__title {
        font-size: 1rem;
        font-weight: 800;
        line-height: 1.25;
      }
      .step__body {
        color: var(--muted);
        font-size: 0.94rem;
        max-width: 58ch;
      }
      .step__proof {
        padding: 10px 12px;
        border-radius: 14px;
        background: var(--panel-3);
        border: 1px solid rgba(89, 212, 138, 0.12);
        max-width: 100%;
      }
      .step__proof-label {
        color: rgba(255,255,255,0.64);
        font-size: 0.74rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 6px;
      }
      .step__proof-value {
        font-size: 0.88rem;
        font-weight: 700;
        color: #f4efe4;
        word-break: break-word;
      }
      details {
        margin-top: 18px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: var(--panel);
        overflow: hidden;
      }
      summary {
        cursor: pointer;
        list-style: none;
        padding: 16px 18px;
        font-weight: 800;
      }
      summary::-webkit-details-marker { display: none; }
      .details-body {
        border-top: 1px solid var(--border);
        padding: 18px;
      }
      .proof-list {
        display: grid;
        gap: 12px;
      }
      .proof-item {
        padding: 14px;
        border-radius: 14px;
        background: var(--panel-2);
        border: 1px solid var(--border);
      }
      .proof-item__label {
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 8px;
      }
      code {
        display: block;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 0.92rem;
      }
      .footer-link {
        display: inline-flex;
        margin-top: 16px;
        color: var(--accent);
        text-decoration: none;
        font-weight: 700;
      }
      .helper {
        margin-top: 12px;
        font-size: 0.92rem;
      }
      .layout-list {
        list-style: none;
        margin: 14px 0 0;
        padding: 0;
        display: grid;
        gap: 10px;
      }
      .layout-slot {
        display: grid;
        grid-template-columns: auto auto 1fr;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        background: var(--panel-2);
        border: 1px solid var(--border);
      }
      .layout-slot__index {
        width: 2rem;
        height: 2rem;
        display: inline-grid;
        place-items: center;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        font-weight: 800;
      }
      .layout-slot__swatch {
        width: 14px;
        height: 40px;
        border-radius: 999px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2);
      }
      .layout-slot__content {
        min-width: 0;
      }
      .layout-slot__name {
        font-weight: 800;
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      .layout-slot__meta {
        margin-top: 4px;
        color: var(--muted);
        font-size: 0.88rem;
        word-break: break-word;
      }
      .layout-slot__badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(245, 200, 76, 0.14);
        color: var(--accent);
        font-size: 0.76rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      @media (max-width: 640px) {
        main {
          padding: 18px 14px 40px;
        }
        .hero,
        .card {
          border-radius: 20px;
        }
        .hero,
        .card,
        .details-body {
          padding-left: 16px;
          padding-right: 16px;
        }
        .layout-slot {
          grid-template-columns: auto 1fr;
        }
        .layout-slot__swatch {
          grid-row: span 2;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="eyebrow">Verified fair result</div>
        <h1>${title}</h1>
        <p class="hero__lede">${summary} This page proves the result was committed before it landed and can be reproduced from the revealed values. It also explains why the outcome came from secure random inputs, not a manual swap after the fact.</p>
        <div class="grid">
          <div class="metric">
            <div class="metric__label">Wheel</div>
            <div class="metric__value">${wheelName}</div>
          </div>
          <div class="metric">
            <div class="metric__label">Spin</div>
            <div class="metric__value">${escapeHtml(spinLabel)}</div>
          </div>
          <div class="metric">
            <div class="metric__label">Result</div>
            <div class="metric__value">${escapeHtml(resultText)}</div>
          </div>
          <div class="metric">
            <div class="metric__label">Randomness source</div>
            <div class="metric__value">Secure server seed + secure client seed.</div>
          </div>
        </div>
      </section>
      <section class="card">
        <h2>Why this page</h2>
        <p class="trust-note">This proof is strongest at answering two questions: was the result locked before the wheel landed, and did the revealed inputs really produce this slot?</p>

        <div class="verify-panel">
          <div class="verify-notes">
            <section class="verify-note verify-note--good">
              <div class="verify-note__label">What this does prove</div>
              <div class="verify-note__body">The operator could not change the result after committing to the hidden server seed, and anyone can reproduce the same winning slot from the revealed values and the exact ordered wheel layout used for this spin.</div>
            </section>

          <section class="verify-summary">
            <h3>Why the randomness claim is reasonable</h3>
            <p>The server seed is generated on the server with a cryptographically secure random generator. The client seed is generated independently in the viewer's browser environment with a secure random generator. The final slot is derived from both seeds together, then reproduced below.</p>
          </section>
          ${params.layoutError ? `<section class="verify-summary verify-summary--warning">
            <h3>Exact wheel order could not be shown</h3>
            <p>${layoutError} The base fairness proof still verifies the committed server seed, client seed, result slot, and layout hash.</p>
          </section>` : ""}
          </div>



          <div class="steps">
          <article class="step">
            <div class="step__top">
              <div class="step__kicker">Step 1</div>
              <div class="step__title">Check that the hidden result was locked in first</div>
              <div class="step__body">Hash the revealed server seed with SHA-256. If it matches the committed hash below, the hidden value was already locked in before the wheel landed.</div>
            </div>
            <div class="step__proof">
              <div class="step__proof-label">Committed hash</div>
              <div class="step__proof-value">${serverSeedHashPreview}</div>
            </div>
          </article>

          <article class="step">
            <div class="step__top">
              <div class="step__kicker">Step 2</div>
              <div class="step__title">Confirm the exact wheel layout that was locked for this spin</div>
              <div class="step__body">This proof also includes a SHA-256 hash of the exact ordered wheel layout. That binds the result to the wheel arrangement used for this spin, not just to the slot count.</div>
            </div>
            <div class="step__proof">
              <div class="step__proof-label">Ordered layout hash</div>
              <div class="step__proof-value">${layoutHashPreview || "Not provided"}</div>
            </div>
          </article>

          <article class="step">
            <div class="step__top">
              <div class="step__kicker">Step 3</div>
              <div class="step__title">Reproduce the winning slot</div>
              <div class="step__body">Using the revealed server seed, the client seed, and the bound wheel layout, the calculation should reproduce the same result: ${escapeHtml(resultText)}.</div>
            </div>
            <div class="step__proof">
              <div class="step__proof-label">Client seed used</div>
              <div class="step__proof-value">${clientSeedPreview}</div>
            </div>
          </article>

          <article class="step">
            <div class="step__top">
              <div class="step__kicker">Step 4</div>
              <div class="step__title">Check the revealed server seed</div>
              <div class="step__body">The revealed server seed below is the hidden value that was committed before the spin landed.</div>
            </div>
            <div class="step__proof">
              <div class="step__proof-label">Server seed revealed</div>
              <div class="step__proof-value">${serverSeedPreview}</div>
            </div>
          </article>
          </div>
        </div>

        <p class="helper">For advanced verification, the full technical proof is below.</p>

        ${params.layoutSlots && params.layoutSlots.length > 0 ? `<section class="card">
        <h2>Exact wheel order used for this spin</h2>
        <p class="trust-note">This is the full ordered slot list that was hashed into the proof for this spin. If someone changes the order, labels, colors, or chase markers, the layout hash will no longer match.</p>
        <ol class="layout-list">${layoutMarkup}</ol>
      </section>` : ""}

        <details>
          <summary>Advanced proof details</summary>
          <div class="details-body">
            <div class="proof-list">
              <div class="proof-item">
                <div class="proof-item__label">Committed server hash</div>
                <code>${serverSeedHash}</code>
              </div>
              <div class="proof-item">
                <div class="proof-item__label">Ordered wheel layout hash</div>
                <code>${layoutHash || "Not provided"}</code>
              </div>
              <div class="proof-item">
                <div class="proof-item__label">Client seed</div>
                <code>${clientSeed}</code>
              </div>
              <div class="proof-item">
                <div class="proof-item__label">Server seed</div>
                <code>${serverSeed}</code>
              </div>
              <div class="proof-item">
                <div class="proof-item__label">Derived proof hash</div>
                <code>${proofHash}</code>
              </div>
              <div class="proof-item">
                <div class="proof-item__label">Algorithm</div>
                <code>${algorithm}</code>
              </div>
            </div>
            <a class="footer-link" href="${jsonUrl}" rel="noopener noreferrer">View raw JSON proof</a>
          </div>
        </details>
      </section>
    </main>
  </body>
</html>`;
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
    const layoutHash = parseLayoutHash(body.layoutHash);
    const committedAt = Date.now();
    const payload: WheelCommitTokenPayload = {
      version: "v1",
      algorithm: WHEEL_FAIRNESS_ALGORITHM,
      serverSeed: generateServerSeed(),
      serverSeedHash: "",
      layoutHash,
      slotCount,
      committedAt,
      expiresAt: committedAt + WHEEL_FAIRNESS_COMMIT_TTL_MS
    };
    payload.serverSeedHash = hashSeed(payload.serverSeed);

    return jsonResponse(request, config, 200, {
      commitToken: encryptCommitToken(config, payload),
      serverSeedHash: payload.serverSeedHash,
      layoutHash: payload.layoutHash,
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
      layoutHash: payload.layoutHash,
      resultIndex,
      slotCount: payload.slotCount,
      algorithm: payload.algorithm,
      committedAt: payload.committedAt,
      revealedAt: Date.now(),
      verificationUrl: buildVerificationUrl(request, payload.serverSeed, clientSeed, payload.slotCount, payload.layoutHash)
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
    const {
      serverSeed,
      clientSeed,
      slotCount,
      layoutHash,
      layoutSlots,
      layoutError,
      slotLabel,
      wheelName,
      spinNumber
    } = await resolveVerificationProofRequest(request, config);
    const { resultIndex, proofHash } = deriveFairResult(serverSeed, clientSeed, slotCount);
    const resultSlotNumber = resultIndex + 1;

    const resultText = slotLabel
      ? `${slotLabel} (slot ${resultSlotNumber} of ${slotCount})`
      : `slot ${resultSlotNumber} of ${slotCount}`;
    const summaryTitle = wheelName
      ? `Wheel fairness verified for ${wheelName}`
      : "Wheel fairness verified";
    const summary = spinNumber != null
      ? `Spin #${spinNumber} verified fairly: ${resultText}.`
      : `Verified fair result: ${resultText}.`;

    const format = String(getQueryParam(request, "format") ?? "").trim().toLowerCase();
    if (format === "html") {
      return htmlResponse(200, buildWheelFairnessHtmlPage({
        summaryTitle,
        summary,
        wheelName,
        slotLabel,
        spinNumber,
        resultSlotNumber,
        slotCount,
        serverSeedHash: hashSeed(serverSeed),
        layoutHash,
        layoutSlots,
        layoutError,
        clientSeed,
        serverSeed,
        proofHash,
        algorithm: WHEEL_FAIRNESS_ALGORITHM,
        jsonUrl: buildVerificationJsonUrl(request, serverSeed, clientSeed, slotCount, layoutHash)
      }));
    }

    return jsonResponse(request, config, 200, {
      serverSeedHash: hashSeed(serverSeed),
      layoutHash,
      layoutSlots,
      layoutError,
      clientSeed,
      slotCount,
      algorithm: WHEEL_FAIRNESS_ALGORITHM,
      resultIndex,
      resultSlotNumber,
      slotLabel,
      wheelName,
      spinNumber,
      summaryTitle,
      summary,
      proofHash
    });
  } catch (error) {
    return errorResponse(request, config, error, "Failed to verify wheel fairness proof.");
  }
}

export async function wheelFairnessProof(
  request: HttpRequest
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const body = requireBodyRecord(await readRequestJsonOrThrow(request));
    const proofRequest = parseProofCreationRequest(body);
    const proofDocument = await createWheelFairnessProof(config, proofRequest);

    return jsonResponse(request, config, 200, {
      verificationUrl: buildStoredProofVerificationUrl(request, proofDocument.proofId, "html"),
      jsonUrl: buildStoredProofVerificationUrl(request, proofDocument.proofId, "json")
    });
  } catch (error) {
    return errorResponse(request, config, error, "Failed to create wheel fairness proof link.");
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