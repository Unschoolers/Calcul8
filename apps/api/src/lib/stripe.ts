import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchWithRetry } from "./retry";

const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
const STRIPE_WEBHOOK_DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export type StripeCheckoutUiMode = "hosted" | "embedded";

export interface CreateStripeCheckoutSessionInput {
  secretKey: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId: string;
  uiMode?: StripeCheckoutUiMode;
  metadata?: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  client_secret?: string;
  mode?: string;
  payment_status?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
}

export interface StripeWebhookEvent<TObject = Record<string, unknown>> {
  id: string;
  type: string;
  data: {
    object: TObject;
  };
}

function normalizeConfigValue(value: string): string {
  return String(value || "").trim();
}

function appendMetadata(
  params: URLSearchParams,
  metadata: Record<string, string> | undefined
): void {
  if (!metadata) return;
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    params.append(`metadata[${normalizedKey}]`, normalizedValue);
  }
}

export async function createStripeCheckoutSession(
  input: CreateStripeCheckoutSessionInput
): Promise<StripeCheckoutSession> {
  const secretKey = normalizeConfigValue(input.secretKey);
  const priceId = normalizeConfigValue(input.priceId);
  const successUrl = normalizeConfigValue(input.successUrl);
  const cancelUrl = normalizeConfigValue(input.cancelUrl);
  const clientReferenceId = normalizeConfigValue(input.clientReferenceId);
  const uiMode: StripeCheckoutUiMode = input.uiMode === "embedded" ? "embedded" : "hosted";

  if (!secretKey) {
    throw new Error("Missing Stripe secret key.");
  }
  if (!priceId) {
    throw new Error("Missing Stripe one-time price id.");
  }
  if (!successUrl || (uiMode === "hosted" && !cancelUrl)) {
    throw new Error("Missing Stripe checkout redirect URLs.");
  }
  if (!clientReferenceId) {
    throw new Error("Missing Stripe client reference id.");
  }

  const params = new URLSearchParams();
  params.append("mode", "payment");
  if (uiMode === "embedded") {
    params.append("ui_mode", "embedded");
    params.append("return_url", successUrl);
  } else {
    params.append("success_url", successUrl);
    params.append("cancel_url", cancelUrl);
  }
  params.append("line_items[0][price]", priceId);
  params.append("line_items[0][quantity]", "1");
  params.append("client_reference_id", clientReferenceId);
  appendMetadata(params, input.metadata);

  const response = await fetchWithRetry(
    `${STRIPE_API_BASE_URL}/checkout/sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    },
    {
      maxAttempts: 3,
      timeoutMs: 10_000
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stripe checkout session creation failed (${response.status}): ${errorText || "unknown error"}`);
  }

  const payload = (await response.json()) as Partial<StripeCheckoutSession>;
  const id = String(payload.id || "").trim();
  const url = String(payload.url || "").trim();
  const clientSecret = String(payload.client_secret || "").trim();

  if (!id) {
    throw new Error("Stripe checkout session response was missing required fields.");
  }

  if (uiMode === "embedded" && !clientSecret) {
    throw new Error("Stripe embedded checkout session did not return client_secret.");
  }

  if (uiMode === "hosted" && !url) {
    throw new Error("Stripe hosted checkout session did not return url.");
  }

  return {
    id,
    url,
    client_secret: clientSecret || undefined,
    mode: typeof payload.mode === "string" ? payload.mode : undefined,
    payment_status: typeof payload.payment_status === "string" ? payload.payment_status : undefined,
    client_reference_id: typeof payload.client_reference_id === "string"
      ? payload.client_reference_id
      : undefined,
    metadata: payload.metadata && typeof payload.metadata === "object"
      ? payload.metadata as Record<string, string>
      : undefined
  };
}

function parseStripeSignatureHeader(header: string): {
  timestamp: number;
  signatures: string[];
} {
  const pairs = header.split(",").map((segment) => segment.trim()).filter(Boolean);
  let timestamp = Number.NaN;
  const signatures: string[] = [];

  for (const pair of pairs) {
    const [rawKey, rawValue] = pair.split("=", 2);
    const key = String(rawKey || "").trim();
    const value = String(rawValue || "").trim();
    if (!key || !value) continue;

    if (key === "t") {
      timestamp = Number(value);
      continue;
    }
    if (key === "v1") {
      signatures.push(value);
    }
  }

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new Error("Invalid Stripe signature header format.");
  }

  return {
    timestamp: Math.floor(timestamp),
    signatures
  };
}

function matchesKnownSignature(expectedHex: string, candidateHex: string): boolean {
  if (!expectedHex || !candidateHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const candidate = Buffer.from(candidateHex, "hex");
  if (expected.length === 0 || candidate.length === 0) return false;
  if (expected.length !== candidate.length) return false;

  return timingSafeEqual(expected, candidate);
}

export function verifyStripeWebhookEvent(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  nowMs = Date.now(),
  toleranceSeconds = STRIPE_WEBHOOK_DEFAULT_TOLERANCE_SECONDS
): StripeWebhookEvent {
  const normalizedSecret = normalizeConfigValue(webhookSecret);
  if (!normalizedSecret) {
    throw new Error("Missing Stripe webhook secret.");
  }

  const signature = parseStripeSignatureHeader(signatureHeader);
  const timestampMs = signature.timestamp * 1000;
  const ageMs = Math.abs(nowMs - timestampMs);
  if (ageMs > Math.max(0, toleranceSeconds) * 1000) {
    throw new Error("Stripe signature timestamp is outside accepted tolerance.");
  }

  const signedPayload = `${signature.timestamp}.${rawBody}`;
  const expected = createHmac("sha256", normalizedSecret)
    .update(signedPayload)
    .digest("hex");
  const valid = signature.signatures.some((candidate) => matchesKnownSignature(expected, candidate));
  if (!valid) {
    throw new Error("Stripe webhook signature verification failed.");
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error("Stripe webhook body is not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Stripe webhook payload must be an object.");
  }

  const event = parsed as Partial<StripeWebhookEvent>;
  const id = String(event.id || "").trim();
  const type = String(event.type || "").trim();
  const hasObject = typeof event.data === "object"
    && event.data !== null
    && typeof (event.data as { object?: unknown }).object === "object"
    && (event.data as { object?: unknown }).object !== null;

  if (!id || !type || !hasObject) {
    throw new Error("Stripe webhook payload is missing required event fields.");
  }

  return {
    id,
    type,
    data: {
      object: (event.data as { object: Record<string, unknown> }).object
    }
  };
}
