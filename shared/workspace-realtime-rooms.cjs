function buildWorkspaceLotRealtimeRoom(workspaceId, lotId) {
  return `workspace:${workspaceId}:lot:${lotId}`;
}

function buildWorkspacePresenceRealtimeRoom(workspaceId) {
  return `workspace:${workspaceId}:presence`;
}

function buildWorkspaceWheelRealtimeRoom(workspaceId) {
  return `workspace:${workspaceId}:wheel`;
}

function buildWheelPublicSessionRealtimeRoom(publicSessionId) {
  return `wheel-public:${publicSessionId}`;
}

function parseWorkspacePresenceRealtimeRoom(room) {
  const match = /^workspace:([^:]+):presence$/.exec(String(room ?? ""));
  return match?.[1] ? match[1] : null;
}

module.exports = {
  buildWorkspaceLotRealtimeRoom,
  buildWorkspacePresenceRealtimeRoom,
  buildWorkspaceWheelRealtimeRoom,
  buildWheelPublicSessionRealtimeRoom,
  parseWorkspacePresenceRealtimeRoom
};
