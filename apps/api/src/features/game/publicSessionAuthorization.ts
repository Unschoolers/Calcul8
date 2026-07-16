import { HttpError } from "../../lib/auth";
import { hasWorkspaceMembership } from "../../lib/cosmos/workspaceRepository";
import type { ApiConfig, GamePublicSessionDocument } from "../../types";

/**
 * Revalidates control access against the session's durable scope. Ownership of
 * the document is necessary, but workspace membership can be revoked later.
 */
export async function assertGamePublicSessionControlAccess(
  config: ApiConfig,
  actorUserId: string,
  document: GamePublicSessionDocument
): Promise<void> {
  if (document.ownerUserId !== actorUserId) {
    throw new HttpError(404, "Public game session was not found.");
  }

  if (document.scopeType !== "workspace") return;
  const workspaceId = String(document.workspaceId ?? document.scopeId ?? "").trim();
  const hasAccess = workspaceId
    ? await hasWorkspaceMembership(config, actorUserId, workspaceId)
    : false;
  if (!hasAccess) {
    // Avoid disclosing a workspace session after access has been revoked.
    throw new HttpError(404, "Public game session was not found.");
  }
}
