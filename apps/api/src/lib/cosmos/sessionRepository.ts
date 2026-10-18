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

interface DeleteSessionIfUnchangedInput {
  sessionId: string;
  etag: string;
}

interface RotateRefreshSessionInput {
  refreshSessionId: string;
  expectedTokenHash: string;
  tokenHash: string;
  sessionId: string;
  lastUsedAt: string;
}

interface LinkSessionToRefreshFamilyInput {
  sessionId: string;
  refreshFamilyId: string;
  userId: string;
}

interface RevokeRefreshSessionFamilyInput {
  refreshSessionId: string;
  expectedTokenHashes?: string[];
  userId?: string;
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

/** Deletes only the exact access-session version observed by the caller. */
export async function deleteSessionIfUnchanged(
  config: ApiConfig,
  input: DeleteSessionIfUnchangedInput
): Promise<"deleted" | "changed" | "missing"> {
  const etag = String(input.etag || "").trim();
  if (!etag) throw new Error("Access session is missing an ETag.");
  const { sessions } = getContainers(config);
  try {
    await withCosmosRetry(() => sessions.item(input.sessionId, input.sessionId).delete(buildIfMatchOptions(etag)));
    return "deleted";
  } catch (error) {
    if (isPreconditionFailedError(error) || isConflictError(error)) return "changed";
    if (isNotFoundError(error)) return "missing";
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
  if (
    !etag ||
    existing.docType !== "refresh_session" ||
    String(existing.revokedAt || "").trim() ||
    !Number.isFinite(Date.parse(existing.expiresAt)) ||
    Date.now() >= Date.parse(existing.expiresAt) ||
    existing.tokenHash !== input.expectedTokenHash
  ) {
    throw new RefreshSessionConflictError();
  }

  const { sessions } = getContainers(config);
  const updatedDocument: RefreshSessionDocument = {
    ...existing,
    previousTokenHash: existing.tokenHash,
    previousSessionId: existing.sessionId,
    tokenHash: input.tokenHash,
    sessionId: input.sessionId,
    lastUsedAt: input.lastUsedAt,
    revokedAt: existing.revokedAt ?? null
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

/** Backfills legacy access rows before a refresh-family rotation can change its association. */
export async function linkSessionToRefreshFamily(
  config: ApiConfig,
  input: LinkSessionToRefreshFamilyInput
): Promise<void> {
  const { sessions } = getContainers(config);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await getSession(config, input.sessionId);
    if (!existing || existing.userId !== input.userId) {
      throw new Error("Refresh family access session is missing or owned by another user.");
    }
    if (existing.refreshFamilyId) {
      if (existing.refreshFamilyId !== input.refreshFamilyId) {
        throw new Error("Access session is linked to a different refresh family.");
      }
      return;
    }
    const etag = readCosmosEtag(existing);
    if (!etag) throw new Error("Access session is missing an ETag.");
    try {
      await withCosmosRetry(() => sessions.item(existing.id, existing.id).replace<SessionDocument>({
        ...existing,
        refreshFamilyId: input.refreshFamilyId
      }, buildIfMatchOptions(etag)));
      return;
    } catch (error) {
      if (isPreconditionFailedError(error) || isConflictError(error)) continue;
      throw error;
    }
  }
  throw new Error("Failed to link access session to refresh family after concurrent updates.");
}

/** Conditionally revokes a fresh family row; retries races without ever upserting it. */
export async function revokeRefreshSessionFamily(
  config: ApiConfig,
  input: RevokeRefreshSessionFamilyInput
): Promise<RefreshSessionDocument | null> {
  const { sessions } = getContainers(config);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await getRefreshSession(config, input.refreshSessionId);
    if (!existing) return null;
    if (input.userId && existing.userId !== input.userId) return null;
    if (input.expectedTokenHashes?.length && !input.expectedTokenHashes.includes(existing.tokenHash) &&
      !input.expectedTokenHashes.includes(String(existing.previousTokenHash || ""))) return null;
    const etag = readCosmosEtag(existing);
    if (!etag) throw new Error("Refresh session is missing an ETag.");
    if (existing.revokedAt) return existing;
    const updated: RefreshSessionDocument = {
      ...existing,
      revokedAt: new Date().toISOString()
    };
    try {
      const { resource } = await withCosmosRetry(() =>
        sessions.item(existing.id, existing.id).replace<RefreshSessionDocument>(updated, buildIfMatchOptions(etag))
      );
      return resource ?? updated;
    } catch (error) {
      if (isPreconditionFailedError(error) || isConflictError(error)) continue;
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }
  throw new Error("Failed to conditionally revoke refresh session after concurrent updates.");
}

export async function clearRefreshSessionAssociations(
  config: ApiConfig,
  refreshSessionId: string
): Promise<void> {
  const { sessions } = getContainers(config);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await getRefreshSession(config, refreshSessionId);
    if (!existing) throw new Error("Refresh session disappeared before association cleanup.");
    if (!existing.revokedAt) throw new Error("Cannot clear active refresh session associations.");
    if (existing.sessionId === null && existing.previousSessionId == null) return;
    const etag = readCosmosEtag(existing);
    if (!etag) throw new Error("Refresh session is missing an ETag.");
    const updated: RefreshSessionDocument = { ...existing, sessionId: null, previousSessionId: null };
    try {
      await withCosmosRetry(() =>
        sessions.item(existing.id, existing.id).replace<RefreshSessionDocument>(updated, buildIfMatchOptions(etag))
      );
      return;
    } catch (error) {
      if (isPreconditionFailedError(error) || isConflictError(error)) continue;
      if (isNotFoundError(error)) throw new Error("Refresh session disappeared before association cleanup.");
      throw error;
    }
  }
  throw new Error("Failed to clear refresh session associations after concurrent updates.");
}

export async function findRefreshSessionForSession(
  config: ApiConfig,
  sessionId: string
): Promise<RefreshSessionDocument | null> {
  const { sessions } = getContainers(config);
  const iterator = sessions.items.query<RefreshSessionDocument>({
    query: "SELECT * FROM c WHERE c.docType = @docType AND (c.sessionId = @sessionId OR c.previousSessionId = @sessionId)",
    parameters: [
      { name: "@docType", value: "refresh_session" },
      { name: "@sessionId", value: sessionId }
    ]
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources ?? []).find((row) => row.docType === "refresh_session") ?? null;
}

export async function listSessionsForRefreshFamily(
  config: ApiConfig,
  refreshFamilyId: string,
  userId: string
): Promise<SessionDocument[]> {
  const { sessions } = getContainers(config);
  const iterator = sessions.items.query<SessionDocument>({
    query: "SELECT * FROM c WHERE c.docType = @docType AND c.refreshFamilyId = @refreshFamilyId AND c.userId = @userId",
    parameters: [
      { name: "@docType", value: "session" },
      { name: "@refreshFamilyId", value: refreshFamilyId },
      { name: "@userId", value: userId }
    ]
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources ?? []).filter((row) => row.docType === "session" && row.refreshFamilyId === refreshFamilyId && row.userId === userId);
}

export async function revokeAllRefreshSessionsForUser(
  config: ApiConfig,
  userId: string
): Promise<number> {
  const { sessions } = getContainers(config);
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
    const revoked = await revokeRefreshSessionFamily(config, { refreshSessionId: id, userId });
    if (revoked) revokedCount += 1;
  }
  return revokedCount;
}

export async function clearRefreshSessionAssociationsForUser(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { sessions } = getContainers(config);
  const iterator = sessions.items.query<RefreshSessionDocument>({
    query: "SELECT * FROM c WHERE c.docType = @docType AND c.userId = @userId",
    parameters: [
      { name: "@docType", value: "refresh_session" },
      { name: "@userId", value: userId }
    ]
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  for (const row of resources ?? []) {
    if (row.revokedAt && (row.sessionId !== null || row.previousSessionId != null)) {
      await clearRefreshSessionAssociations(config, row.id);
    }
  }
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
