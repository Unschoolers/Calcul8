function buildWorkspaceLotRealtimeRoom(workspaceId, lotId) {
  return `workspace:${workspaceId}:lot:${lotId}`;
}

function buildWorkspacePresenceRealtimeRoom(workspaceId) {
  return `workspace:${workspaceId}:presence`;
}

function buildWorkspaceWheelRealtimeRoom(workspaceId) {
  return `workspace:${workspaceId}:wheel`;
}

function buildGamePublicSessionRealtimeRoom(publicSessionId) {
  return `wheel-public:${String(publicSessionId ?? "").trim().toLowerCase()}`;
}

function buildWheelPublicSessionRealtimeRoom(publicSessionId) {
  return buildGamePublicSessionRealtimeRoom(publicSessionId);
}

function parseWorkspacePresenceRealtimeRoom(room) {
  const match = /^workspace:([^:]+):presence$/.exec(String(room ?? ""));
  return match?.[1] ? match[1] : null;
}

module.exports = {
  buildWorkspaceLotRealtimeRoom,
  buildWorkspacePresenceRealtimeRoom,
  buildWorkspaceWheelRealtimeRoom,
  buildGamePublicSessionRealtimeRoom,
  buildWheelPublicSessionRealtimeRoom,
  parseWorkspacePresenceRealtimeRoom
};
