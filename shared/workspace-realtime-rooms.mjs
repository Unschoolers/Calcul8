export function buildWorkspaceLotRealtimeRoom(workspaceId, lotId) {
  return `workspace:${workspaceId}:lot:${lotId}`;
}

export function buildWorkspacePresenceRealtimeRoom(workspaceId) {
  return `workspace:${workspaceId}:presence`;
}

export function buildWorkspaceWheelRealtimeRoom(workspaceId) {
  return `workspace:${workspaceId}:wheel`;
}

export function parseWorkspacePresenceRealtimeRoom(room) {
  const match = /^workspace:([^:]+):presence$/.exec(String(room ?? ""));
  return match?.[1] ? match[1] : null;
}