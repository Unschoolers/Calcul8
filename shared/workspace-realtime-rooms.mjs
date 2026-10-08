// Generated from shared/contracts/workspace-realtime-rooms.ts. Run npm run shared:generate.
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
    return `wheel-public:${String(publicSessionId !== null && publicSessionId !== void 0 ? publicSessionId : "").trim().toLowerCase()}`;
}
export function buildWheelPublicSessionRealtimeRoom(publicSessionId) {
    return buildGamePublicSessionRealtimeRoom(publicSessionId);
}
export function parseWorkspacePresenceRealtimeRoom(room) {
    const match = /^workspace:([^:]+):presence$/.exec(String(room !== null && room !== void 0 ? room : ""));
    return (match === null || match === void 0 ? void 0 : match[1]) ? match[1] : null;
}
