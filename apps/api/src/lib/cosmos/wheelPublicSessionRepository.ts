import { randomBytes } from "node:crypto";
import type {
  ApiConfig,
  WheelPublicSessionDocument,
  WheelPublicSessionSnapshot,
  WheelPublicSessionStatus
} from "../../types";
import { wheelPublicSessionDocumentId } from "./ids";
import { getContainers, isNotFoundError, withCosmosRetry } from "./core";

function buildPublicSessionId(): string {
  return randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase();
}

function normalizePublicSessionId(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export async function createWheelPublicSession(
  config: ApiConfig,
  input: {
    ownerUserId: string;
    scopeType: "user" | "workspace";
    scopeId: string;
    workspaceId?: string | null;
    snapshot: WheelPublicSessionSnapshot;
  }
): Promise<WheelPublicSessionDocument> {
  const { sessions } = getContainers(config);
  const nowIso = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicSessionId = buildPublicSessionId();
    const document: WheelPublicSessionDocument = {
      id: wheelPublicSessionDocumentId(publicSessionId),
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
        sessions.items.create<WheelPublicSessionDocument>(document)
      );
      if (!resource) {
        throw new Error("Failed to create wheel public session.");
      }
      return resource;
    } catch (error) {
      if (isConflictError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to allocate a public wheel session id.");
}

function isConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return code === 409 || statusCode === 409 || code === "Conflict" || code === "conflict";
}

export async function getWheelPublicSession(
  config: ApiConfig,
  publicSessionId: string
): Promise<WheelPublicSessionDocument | null> {
  const normalizedPublicSessionId = normalizePublicSessionId(publicSessionId);
  if (!normalizedPublicSessionId) return null;
  const { sessions } = getContainers(config);
  const documentId = wheelPublicSessionDocumentId(normalizedPublicSessionId);

  try {
    const { resource } = await withCosmosRetry(() =>
      sessions.item(documentId, documentId).read<WheelPublicSessionDocument>()
    );
    if (!resource || resource.docType !== "wheel_public_session") return null;
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function updateWheelPublicSession(
  config: ApiConfig,
  input: {
    publicSessionId: string;
    ownerUserId: string;
    snapshot: WheelPublicSessionSnapshot;
  }
): Promise<WheelPublicSessionDocument | null> {
  const existing = await getWheelPublicSession(config, input.publicSessionId);
  if (!existing || existing.ownerUserId !== input.ownerUserId) {
    return null;
  }

  const { sessions } = getContainers(config);
  const nowIso = new Date().toISOString();
  const updatedDocument: WheelPublicSessionDocument = {
    ...existing,
    updatedAt: nowIso,
    endedAt: input.snapshot.sessionStatus === "ended"
      ? (existing.endedAt ?? nowIso)
      : null,
    snapshot: input.snapshot
  };

  const { resource } = await withCosmosRetry(() =>
    sessions.items.upsert<WheelPublicSessionDocument>(updatedDocument)
  );
  if (!resource) {
    throw new Error("Failed to update wheel public session.");
  }
  return resource;
}

export async function endWheelPublicSession(
  config: ApiConfig,
  input: {
    publicSessionId: string;
    ownerUserId: string;
    snapshot: WheelPublicSessionSnapshot;
  }
): Promise<WheelPublicSessionDocument | null> {
  const endedSnapshot: WheelPublicSessionSnapshot = {
    ...input.snapshot,
    sessionStatus: "ended" as WheelPublicSessionStatus
  };
  return updateWheelPublicSession(config, {
    ...input,
    snapshot: endedSnapshot
  });
}
