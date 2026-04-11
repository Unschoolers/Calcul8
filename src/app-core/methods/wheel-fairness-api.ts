import { fetchWithRetry, resolveApiBaseUrl } from "./ui/shared.ts";
import { getApiErrorMessage } from "../shared/api-error-message.ts";

export class WheelFairnessApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "WheelFairnessApiError";
    this.status = status;
  }
}

export type WheelFairnessCommit = {
  commitToken: string;
  serverSeedHash: string;
  slotCount: number;
  algorithm: string;
  committedAt: number;
  expiresAt: number | null;
};

export type WheelFairnessReveal = {
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  resultIndex: number;
  slotCount: number;
  algorithm: string;
  committedAt: number;
  revealedAt: number;
  verificationUrl: string;
};

function canUseWheelFairnessApi(): boolean {
  try {
    return Boolean(resolveApiBaseUrl());
  } catch {
    return false;
  }
}

async function parseJsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestPublicJson(
  path: string,
  init: RequestInit,
  fallbackMessage: string
): Promise<unknown> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    throw new WheelFairnessApiError(0, "API base URL is not configured.");
  }

  const response = await fetchWithRetry(`${baseUrl}${path}`, {
    ...init,
    credentials: init.credentials ?? "include"
  });
  const body = await parseJsonOrNull(response);

  if (!response.ok) {
    throw new WheelFairnessApiError(response.status, getApiErrorMessage(body, fallbackMessage));
  }

  return body;
}

function normalizeCommit(value: unknown): WheelFairnessCommit {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WheelFairnessApiError(500, "Wheel fairness commit response was invalid.");
  }

  const body = value as Record<string, unknown>;
  const commitToken = String(body.commitToken ?? "").trim();
  const serverSeedHash = String(body.serverSeedHash ?? "").trim();
  const algorithm = String(body.algorithm ?? "").trim();
  const slotCount = Math.floor(Number(body.slotCount) || 0);
  const committedAt = Math.floor(Number(body.committedAt) || 0);
  const expiresAt = Number(body.expiresAt);

  if (!commitToken || !serverSeedHash || !algorithm || slotCount <= 0 || committedAt <= 0) {
    throw new WheelFairnessApiError(500, "Wheel fairness commit response was invalid.");
  }

  return {
    commitToken,
    serverSeedHash,
    slotCount,
    algorithm,
    committedAt,
    expiresAt: Number.isFinite(expiresAt) ? Math.floor(expiresAt) : null
  };
}

function normalizeReveal(value: unknown): WheelFairnessReveal {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WheelFairnessApiError(500, "Wheel fairness reveal response was invalid.");
  }

  const body = value as Record<string, unknown>;
  const serverSeedHash = String(body.serverSeedHash ?? "").trim();
  const serverSeed = String(body.serverSeed ?? "").trim();
  const clientSeed = String(body.clientSeed ?? "").trim();
  const verificationUrl = String(body.verificationUrl ?? "").trim();
  const algorithm = String(body.algorithm ?? "").trim();
  const slotCount = Math.floor(Number(body.slotCount) || 0);
  const resultIndex = Math.floor(Number(body.resultIndex));
  const committedAt = Math.floor(Number(body.committedAt) || 0);
  const revealedAt = Math.floor(Number(body.revealedAt) || 0);

  if (
    !serverSeedHash
    || !serverSeed
    || !clientSeed
    || !verificationUrl
    || !algorithm
    || slotCount <= 0
    || !Number.isFinite(resultIndex)
    || resultIndex < 0
    || resultIndex >= slotCount
    || committedAt <= 0
    || revealedAt <= 0
  ) {
    throw new WheelFairnessApiError(500, "Wheel fairness reveal response was invalid.");
  }

  return {
    serverSeedHash,
    serverSeed,
    clientSeed,
    resultIndex,
    slotCount,
    algorithm,
    committedAt,
    revealedAt,
    verificationUrl
  };
}

export async function createWheelFairnessCommit(slotCount: number): Promise<WheelFairnessCommit | null> {
  if (!canUseWheelFairnessApi()) return null;

  const body = await requestPublicJson(
    "/wheel/fairness/commit",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        slotCount
      })
    },
    "Failed to create wheel fairness commit."
  );

  return normalizeCommit(body);
}

export async function revealWheelFairnessResult(
  commitToken: string,
  clientSeed: string
): Promise<WheelFairnessReveal> {
  const body = await requestPublicJson(
    "/wheel/fairness/reveal",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        commitToken,
        clientSeed
      })
    },
    "Failed to reveal wheel fairness result."
  );

  return normalizeReveal(body);
}
