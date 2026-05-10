export function buildWorkspaceLotRealtimeRoom(workspaceId, lotId) {
  return `workspace:${workspaceId}:lot:${lotId}`;
}

export function buildWorkspacePresenceRealtimeRoom(workspaceId) {
  return `workspace:${workspaceId}:presence`;
}

export function buildWorkspaceWheelRealtimeRoom(workspaceId) {
  return `workspace:${workspaceId}:wheel`;
}

export function buildGamePublicSessionRealtimeRoom(publicSessionId) {
  return `wheel-public:${String(publicSessionId ?? "").trim().toLowerCase()}`;
}

export function buildWheelPublicSessionRealtimeRoom(publicSessionId) {
  return buildGamePublicSessionRealtimeRoom(publicSessionId);
}

export function parseWorkspacePresenceRealtimeRoom(room) {
  const match = /^workspace:([^:]+):presence$/.exec(String(room ?? ""));
  return match?.[1] ? match[1] : null;
}
