import { getStoredSessionUserId } from "../../../auth/index.ts";
import { getScopedUnacknowledgedSyncPushKey } from "../../../storageKeys.ts";
import type { PersistenceOutcome } from "../../../shared/persistence-outcomes.ts";
import type { SyncSession } from "./sync-session.ts";

export type UnacknowledgedSyncPush = {
  clientVersion: number;
  signature: string;
  userId: string;
  baseUrl: string;
};

// A newer auth epoch must not try to recover an older request that is still running in this app.
const activePushes = new Map<string, number>();

export function rememberSyncPush(session: SyncSession, clientVersion: number, signature: string): () => void {
  const pending = { clientVersion, signature, userId: getStoredSessionUserId(), baseUrl: session.baseUrl };
  session.state.unacknowledgedPush = pending;
  const serialized = JSON.stringify(pending);
  activePushes.set(serialized, (activePushes.get(serialized) ?? 0) + 1);
  try {
    localStorage.setItem(getScopedUnacknowledgedSyncPushKey(session.scope), serialized);
  } catch {
    console.warn("[whatfees] Could not persist the pending sync acknowledgement; recovery is limited to this session.");
  }
  return () => {
    const remaining = (activePushes.get(serialized) ?? 1) - 1;
    if (remaining > 0) activePushes.set(serialized, remaining);
    else activePushes.delete(serialized);
  };
}

export function forgetSyncPush(session: SyncSession): void {
  const pending = session.state.unacknowledgedPush;
  session.state.unacknowledgedPush = null;
  try {
    const key = getScopedUnacknowledgedSyncPushKey(session.scope);
    // A different tab may have recorded its own write in the meantime.
    if (localStorage.getItem(key) === JSON.stringify(pending)) localStorage.removeItem(key);
  } catch {
    // A confirmed newer client version also makes an old pending record obsolete.
  }
}

function readPendingPush(session: SyncSession): UnacknowledgedSyncPush | null {
  if (session.state.unacknowledgedPush) return session.state.unacknowledgedPush;
  try {
    const stored = localStorage.getItem(getScopedUnacknowledgedSyncPushKey(session.scope));
    if (stored && activePushes.has(stored)) return null;
    const value: unknown = JSON.parse(stored ?? "null");
    if (!value || typeof value !== "object") return null;
    const pending = value as Partial<UnacknowledgedSyncPush>;
    if (!Number.isSafeInteger(pending.clientVersion) || Number(pending.clientVersion) < 0
        || typeof pending.signature !== "string" || !pending.signature
        || typeof pending.userId !== "string" || typeof pending.baseUrl !== "string") return null;
    session.state.unacknowledgedPush = pending as UnacknowledgedSyncPush;
    return session.state.unacknowledgedPush;
  } catch {
    return null;
  }
}

/** Resolve an uncertain write by reading it back, without applying cloud data over local edits. */
export function recoverSyncPushAcknowledgement(session: SyncSession): Promise<PersistenceOutcome | null> | null {
  const pending = readPendingPush(session);
  if (!pending) return null;
  if (pending.userId !== getStoredSessionUserId() || pending.baseUrl !== session.baseUrl
      || session.getStoredClientVersion() > pending.clientVersion) {
    forgetSyncPush(session);
    return null;
  }

  return verifyPendingPush(session, pending);
}

async function verifyPendingPush(session: SyncSession, pending: UnacknowledgedSyncPush): Promise<PersistenceOutcome | null> {
  const { app, deps, scope } = session;
  let cloudWriteConfirmed = false;
  deps.startSyncStatus(app);
  try {
    const response = await session.requestPull();
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
    if (response.status === 401) {
      deps.handleExpiredAuth(app);
      app.stopCloudSyncScheduler();
      deps.setSyncStatusError(app);
      return { kind: "skipped", reason: "auth" };
    }
    if (response.status === 403 && scope.scopeType === "workspace") {
      deps.setSyncStatusError(app);
      await session.handleWorkspaceAccessLost();
      return { kind: "failure", error: new Error("Workspace access was lost."), stage: "sync", status: 403 };
    }
    if (!response.ok) throw new Error(`Sync acknowledgement lookup failed: ${response.status}`);
    const body = await response.json() as { snapshot?: unknown };
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
    if (!body.snapshot) throw new Error("Sync acknowledgement lookup returned no snapshot.");
    const snapshot = deps.parseCloudSnapshot(body.snapshot);
    if (!Number.isSafeInteger(snapshot.version) || snapshot.version < pending.clientVersion) {
      throw new Error("Sync acknowledgement lookup returned an invalid or older version.");
    }
    if (snapshot.version === pending.clientVersion) {
      // The previous request did not advance the snapshot. The next write still uses its version guard.
      forgetSyncPush(session);
      return null;
    }
    const cloudSignature = session.getPayloadSignature({
      lots: snapshot.lots,
      // Sales use their own mutation protocol and are absent from configuration pushes.
      salesByLot: {},
      wheelConfigs: snapshot.wheelConfigs,
      activeWheelConfigId: snapshot.activeWheelConfigId,
      ...(snapshot.systemPricingDefaults ? { systemPricingDefaults: snapshot.systemPricingDefaults } : {}),
      ...(scope.scopeType === "workspace" ? { workspaceId: scope.workspaceId ?? undefined } : {})
    });
    if (comparableSignature(cloudSignature) !== comparableSignature(pending.signature)) {
      deps.setSyncStatusError(app);
      app.notify("Cloud data changed. Your local changes were kept. Pull latest data before retrying.", "warning");
      return { kind: "conflict", latestState: "unavailable" };
    }
    cloudWriteConfirmed = true;
    session.setStoredClientVersion(snapshot.version);
    session.setLastSyncedPayloadHash(pending.signature);
    forgetSyncPush(session);
    deps.setSyncStatusSuccess(app);
    console.info("[whatfees] Recovered cloud sync acknowledgement", { version: snapshot.version });
    return null;
  } catch (error) {
    if (!session.isCurrentScope()) return { kind: "skipped", reason: "stale-scope" };
    deps.setSyncStatusError(app);
    if (!deps.isOnline()) {
      session.markOffline();
      return { kind: "skipped", reason: "offline" };
    }
    return {
      kind: "failure", error, stage: cloudWriteConfirmed ? "cache" : "sync",
      ...(cloudWriteConfirmed ? { cloudConfirmed: true as const } : {})
    };
  }
}

function comparableSignature(signature: string): string {
  try {
    const payload: unknown = JSON.parse(signature);
    if (!payload || typeof payload !== "object" || !("lots" in payload) || !Array.isArray(payload.lots)) return signature;
    // Cosmos queries can return the same lot documents in a different order.
    // Keep every field and nested array intact; only the top-level lot order is irrelevant.
    return JSON.stringify({ ...payload, lots: payload.lots.map((lot: unknown) => JSON.stringify(lot)).sort() });
  } catch {
    return signature;
  }
}
