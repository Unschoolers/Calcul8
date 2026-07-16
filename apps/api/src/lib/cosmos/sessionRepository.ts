import type { ApiConfig, RefreshSessionDocument, SessionDocument } from "../../types";
import {
  getContainers,
  isConflictError,
  isNotFoundError,
  isPreconditionFailedError,
  withCosmosRetry
} from "./core";

interface TouchSessionInput {
  sessionId: string;
  lastSeenAt: string;
  idleExpiresAt: string;
}

interface RotateRefreshSessionInput {
  refreshSessionId: string;
  expectedTokenHash: string;
  tokenHash: string;
  sessionId: string;
  lastUsedAt: string;
}

export class RefreshSessionConflictError extends Error {
  constructor() {
    super("Refresh token was already rotated.");
    this.name = "RefreshSessionConflictError";
  }
}

function readCosmosEtag(document: unknown): string {
  if (!document || typeof document !== "object") return "";
  return String((document as { _etag?: unknown })._etag ?? "").trim();
}

function buildIfMatchOptions(etag: string) {
  return {
    accessCondition: {
      type: "IfMatch" as const,
      condition: etag
    }
  };
}

export async function createSession(
  config: ApiConfig,
  session: SessionDocument
): Promise<SessionDocument> {
  const { sessions } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    sessions.items.upsert<SessionDocument>(session)
  );

  if (!resource) {
    throw new Error("Failed to create session.");
  }

  return resource;
}

export async function getSession(
  config: ApiConfig,
  sessionId: string
): Promise<SessionDocument | null> {
  const { sessions } = getContainers(config);

  try {
    const { resource } = await withCosmosRetry(() =>
      sessions.item(sessionId, sessionId).read<SessionDocument>()
    );
    if (!resource || resource.docType !== "session") return null;
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function touchSession(
  config: ApiConfig,
  input: TouchSessionInput
): Promise<void> {
  const existing = await getSession(config, input.sessionId);
  if (!existing) return;

  const { sessions } = getContainers(config);
  const etag = readCosmosEtag(existing);
  if (!etag) return;
  const updatedDocument: SessionDocument = {
    ...existing,
    lastSeenAt: input.lastSeenAt,
    idleExpiresAt: input.idleExpiresAt
  };
  try {
    await withCosmosRetry(() =>
      sessions
        .item(updatedDocument.id, updatedDocument.id)
        .replace<SessionDocument>(updatedDocument, buildIfMatchOptions(etag))
    );
  } catch (error) {
    // Logout wins a race with passive activity updates. A touch must never
    // recreate a deleted or concurrently changed authentication session.
    if (isPreconditionFailedError(error) || isNotFoundError(error)) return;
    throw error;
  }
}

export async function deleteSession(
  config: ApiConfig,
  sessionId: string
): Promise<void> {
  const { sessions } = getContainers(config);
  try {
    await withCosmosRetry(() => sessions.item(sessionId, sessionId).delete());
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
}

export async function createRefreshSession(
  config: ApiConfig,
  refreshSession: RefreshSessionDocument
): Promise<RefreshSessionDocument> {
  const { sessions } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    sessions.items.create<RefreshSessionDocument>(refreshSession)
  );

  if (!resource) {
    throw new Error("Failed to create refresh session.");
  }

  return resource;
}

export async function getRefreshSession(
  config: ApiConfig,
  refreshSessionId: string
): Promise<RefreshSessionDocument | null> {
  const { sessions } = getContainers(config);

  try {
    const { resource } = await withCosmosRetry(() =>
      sessions.item(refreshSessionId, refreshSessionId).read<RefreshSessionDocument>()
    );
    if (!resource || resource.docType !== "refresh_session") return null;
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function rotateRefreshSession(
  config: ApiConfig,
  input: RotateRefreshSessionInput
): Promise<void> {
  const existing = await getRefreshSession(config, input.refreshSessionId);
  if (!existing) {
    throw new RefreshSessionConflictError();
  }
  const etag = readCosmosEtag(existing);
  if (!etag || existing.tokenHash !== input.expectedTokenHash) {
    throw new RefreshSessionConflictError();
  }

  const { sessions } = getContainers(config);
  const updatedDocument: RefreshSessionDocument = {
    ...existing,
    tokenHash: input.tokenHash,
    sessionId: input.sessionId,
    lastUsedAt: input.lastUsedAt,
    revokedAt: null
  };
  try {
    await withCosmosRetry(() =>
      sessions
        .item(updatedDocument.id, updatedDocument.id)
        .replace<RefreshSessionDocument>(updatedDocument, buildIfMatchOptions(etag))
    );
  } catch (error) {
    if (isPreconditionFailedError(error) || isConflictError(error)) {
      throw new RefreshSessionConflictError();
    }
    throw error;
  }
}

export async function revokeRefreshSessionForSession(
  config: ApiConfig,
  sessionId: string
): Promise<number> {
  const { sessions } = getContainers(config);
  const now = new Date().toISOString();
  const querySpec = {
    query: "SELECT * FROM c WHERE c.docType = @docType AND c.sessionId = @sessionId",
    parameters: [
      { name: "@docType", value: "refresh_session" },
      { name: "@sessionId", value: sessionId }
    ]
  };
  const iterator = sessions.items.query<RefreshSessionDocument>(querySpec);
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  const rows = resources ?? [];
  let revokedCount = 0;

  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    const revoked: RefreshSessionDocument = {
      ...row,
      sessionId: null,
      revokedAt: row.revokedAt || now
    };
    await withCosmosRetry(() =>
      sessions.items.upsert<RefreshSessionDocument>(revoked)
    );
    revokedCount += 1;
  }

  return revokedCount;
}

export async function revokeAllRefreshSessionsForUser(
  config: ApiConfig,
  userId: string
): Promise<number> {
  const { sessions } = getContainers(config);
  const now = new Date().toISOString();
  const querySpec = {
    query: "SELECT * FROM c WHERE c.docType = @docType AND c.userId = @userId",
    parameters: [
      { name: "@docType", value: "refresh_session" },
      { name: "@userId", value: userId }
    ]
  };
  const iterator = sessions.items.query<RefreshSessionDocument>(querySpec);
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  const rows = resources ?? [];
  let revokedCount = 0;

  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    const revoked: RefreshSessionDocument = {
      ...row,
      sessionId: null,
      revokedAt: row.revokedAt || now
    };
    await withCosmosRetry(() =>
      sessions.items.upsert<RefreshSessionDocument>(revoked)
    );
    revokedCount += 1;
  }

  return revokedCount;
}

export async function revokeAllSessionsForUser(
  config: ApiConfig,
  userId: string
): Promise<number> {
  const { sessions } = getContainers(config);
  const querySpec = {
    query: "SELECT c.id FROM c WHERE c.docType = @docType AND c.userId = @userId",
    parameters: [
      { name: "@docType", value: "session" },
      { name: "@userId", value: userId }
    ]
  };
  const iterator = sessions.items.query<{ id?: string }>(querySpec);
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  const rows = resources ?? [];
  let deletedCount = 0;

  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    try {
      await withCosmosRetry(() => sessions.item(id, id).delete());
      deletedCount += 1;
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  return deletedCount;
}
