export function buildWorkspaceLotRealtimeRoom(workspaceId: string, lotId: string | number): string {
  return `workspace:${workspaceId}:lot:${lotId}`;
}

export function buildWorkspacePresenceRealtimeRoom(workspaceId: string): string {
  return `workspace:${workspaceId}:presence`;
}

export function buildWorkspaceWheelRealtimeRoom(workspaceId: string): string {
  return `workspace:${workspaceId}:wheel`;
}

export function buildWheelPublicSessionRealtimeRoom(publicSessionId: string): string {
  return `wheel-public:${publicSessionId}`;
}

export function parseWorkspacePresenceRealtimeRoom(room: string): string | null {
  const match = /^workspace:([^:]+):presence$/.exec(String(room ?? ""));
  return match?.[1] ? match[1] : null;
}