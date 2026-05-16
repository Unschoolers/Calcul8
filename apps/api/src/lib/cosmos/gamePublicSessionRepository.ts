import { randomBytes } from "node:crypto";
import type {
  ApiConfig,
  GamePublicSessionDocument,
  GamePublicSessionSnapshot,
  GamePublicSessionStatus
} from "../../types";
import { gamePublicSessionDocumentId } from "./ids";
import { getContainers, isNotFoundError, withCosmosRetry } from "./core";

function buildPublicSessionId(): string {
  return randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase();
}

function normalizePublicSessionId(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export async function createGamePublicSession(
  config: ApiConfig,
  input: {
    ownerUserId: string;
    scopeType: "user" | "workspace";
    scopeId: string;
    workspaceId?: string | null;
    snapshot: GamePublicSessionSnapshot;
  }
): Promise<GamePublicSessionDocument> {
  const { sessions } = getContainers(config);
  const nowIso = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicSessionId = buildPublicSessionId();
    const document: GamePublicSessionDocument = {
      id: gamePublicSessionDocumentId(publicSessionId),
      docType: "wheel_public_session",
      publicSessionId,
      ownerUserId: input.ownerUserId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      workspaceId: input.workspaceId ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
      endedAt: input.snapshot.sessionStatus === "ended" ? nowIso : null,
      snapshot: input.snapshot
    };

    try {
      const { resource } = await withCosmosRetry(() =>
        sessions.items.create<GamePublicSessionDocument>(document)
      );
      if (!resource) {
        throw new Error("Failed to create game public session.");
      }
      return resource;
    } catch (error) {
      if (isConflictError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to allocate a public game session id.");
}

function isConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return code === 409 || statusCode === 409 || code === "Conflict" || code === "conflict";
}

export async function getGamePublicSession(
  config: ApiConfig,
  publicSessionId: string
): Promise<GamePublicSessionDocument | null> {
  const normalizedPublicSessionId = normalizePublicSessionId(publicSessionId);
  if (!normalizedPublicSessionId) return null;
  const { sessions } = getContainers(config);
  const documentId = gamePublicSessionDocumentId(normalizedPublicSessionId);

  try {
    const { resource } = await withCosmosRetry(() =>
      sessions.item(documentId, documentId).read<GamePublicSessionDocument>()
    );
    if (!resource || resource.docType !== "wheel_public_session") return null;
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function updateGamePublicSession(
  config: ApiConfig,
  input: {
    publicSessionId: string;
    ownerUserId: string;
    snapshot: GamePublicSessionSnapshot;
  }
): Promise<GamePublicSessionDocument | null> {
  const existing = await getGamePublicSession(config, input.publicSessionId);
  if (!existing || existing.ownerUserId !== input.ownerUserId) {
    return null;
  }

  const { sessions } = getContainers(config);
  const nowIso = new Date().toISOString();
  const updatedDocument: GamePublicSessionDocument = {
    ...existing,
    updatedAt: nowIso,
    endedAt: input.snapshot.sessionStatus === "ended"
      ? (existing.endedAt ?? nowIso)
      : null,
    snapshot: input.snapshot
  };

  const { resource } = await withCosmosRetry(() =>
    sessions.items.upsert<GamePublicSessionDocument>(updatedDocument)
  );
  if (!resource) {
    throw new Error("Failed to update game public session.");
  }
  return resource;
}

export async function endGamePublicSession(
  config: ApiConfig,
  input: {
    publicSessionId: string;
    ownerUserId: string;
    snapshot: GamePublicSessionSnapshot;
  }
): Promise<GamePublicSessionDocument | null> {
  const endedSnapshot: GamePublicSessionSnapshot = {
    ...input.snapshot,
    sessionStatus: "ended" as GamePublicSessionStatus
  };
  return updateGamePublicSession(config, {
    ...input,
    snapshot: endedSnapshot
  });
}
