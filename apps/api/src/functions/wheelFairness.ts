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

function buildVerificationJsonUrl(
  request: HttpRequest,
  serverSeed: string,
  clientSeed: string,
  slotCount: number
): string {
  const url = new URL(buildVerificationUrl(request, serverSeed, clientSeed, slotCount));
  url.searchParams.set("format", "json");
  return url.toString();
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

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #121212;
        --panel: #1f1f1f;
        --panel-2: #262626;
        --text: #f4f4f4;
        --muted: #b0b0b0;
        --accent: #f5c84c;
        --good: #46d17d;
        --border: rgba(255,255,255,0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, system-ui, sans-serif;
        background: radial-gradient(circle at top, rgba(245,200,76,0.10), transparent 40%), var(--bg);
        color: var(--text);
      }
      main {
        max-width: 900px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }
      .hero, .card {
        background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
        border: 1px solid var(--border);
        border-radius: 20px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.22);
      }
      .hero { padding: 24px; margin-bottom: 20px; }
      .eyebrow {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        color: var(--good);
        font-size: 0.9rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      h1 {
        margin: 14px 0 10px;
        font-size: clamp(1.8rem, 5vw, 2.6rem);
        line-height: 1.1;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin: 20px 0 0;
      }
      .metric {
        padding: 16px;
        border-radius: 16px;
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
        font-size: 1.15rem;
        font-weight: 700;
      }
      .card {
        padding: 20px;
        margin-top: 18px;
      }
      .card h2 {
        margin: 0 0 12px;
        font-size: 1.1rem;
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
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="eyebrow">Verified fair result</div>
        <h1>${title}</h1>
        <p>${summary}</p>
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
            <div class="metric__label">Algorithm</div>
            <div class="metric__value">${escapeHtml(params.algorithm)}</div>
          </div>
        </div>
      </section>
      <section class="card">
        <h2>Proof details</h2>
        <div class="proof-list">
          <div class="proof-item">
            <div class="proof-item__label">Committed server hash</div>
            <code>${escapeHtml(params.serverSeedHash)}</code>
          </div>
          <div class="proof-item">
            <div class="proof-item__label">Client seed</div>
            <code>${escapeHtml(params.clientSeed)}</code>
          </div>
          <div class="proof-item">
            <div class="proof-item__label">Server seed</div>
            <code>${escapeHtml(params.serverSeed)}</code>
          </div>
          <div class="proof-item">
            <div class="proof-item__label">Derived proof hash</div>
            <code>${escapeHtml(params.proofHash)}</code>
          </div>
        </div>
        <a class="footer-link" href="${jsonUrl}" rel="noopener noreferrer">View raw JSON proof</a>
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
    const slotLabel = parseOptionalDisplayValue(getQueryParam(request, "slotLabel"), "slotLabel", 120);
    const wheelName = parseOptionalDisplayValue(getQueryParam(request, "wheelName"), "wheelName", 120);
    const spinNumber = parseOptionalPositiveInteger(getQueryParam(request, "spinNumber"), "spinNumber");
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
        clientSeed,
        serverSeed,
        proofHash,
        algorithm: WHEEL_FAIRNESS_ALGORITHM,
        jsonUrl: buildVerificationJsonUrl(request, serverSeed, clientSeed, slotCount)
      }));
    }

    return jsonResponse(request, config, 200, {
      serverSeedHash: hashSeed(serverSeed),
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
