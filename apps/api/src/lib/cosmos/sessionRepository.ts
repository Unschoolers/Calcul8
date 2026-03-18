import type { ApiConfig, SessionDocument } from "../../types";
import { getContainers, isNotFoundError, withCosmosRetry } from "./core";

interface TouchSessionInput {
  sessionId: string;
  lastSeenAt: string;
  idleExpiresAt: string;
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
  const updatedDocument: SessionDocument = {
    ...existing,
    lastSeenAt: input.lastSeenAt,
    idleExpiresAt: input.idleExpiresAt
  };
  await withCosmosRetry(() =>
    sessions.items.upsert<SessionDocument>(updatedDocument)
  );
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
