import { createHash } from "node:crypto";

const WORKSPACE_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeWorkspaceName(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, " ");
}

export function normalizeWorkspaceIdempotencyKey(value: unknown): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error("Workspace idempotency key is required.");
  }
  if (normalized.length > 128) {
    throw new Error("Workspace idempotency key must be at most 128 characters.");
  }
  if (!WORKSPACE_IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw new Error("Workspace idempotency key is invalid.");
  }
  return normalized;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function deriveWorkspaceCreationId(ownerUserId: string, idempotencyKey: string): string {
  return `ws_${digest(`${normalizeText(ownerUserId)}:${normalizeWorkspaceIdempotencyKey(idempotencyKey)}`).slice(0, 16)}`;
}

export function buildWorkspaceCreationKeyHash(idempotencyKey: string): string {
  return digest(normalizeWorkspaceIdempotencyKey(idempotencyKey));
}

export function buildWorkspaceCreationFingerprint(ownerUserId: string, workspaceName: string): string {
  return digest(JSON.stringify({
    ownerUserId: normalizeText(ownerUserId),
    name: normalizeWorkspaceName(workspaceName)
  }));
}
