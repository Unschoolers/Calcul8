// Generated from shared/contracts/workspace-realtime-rooms.ts. Run npm run shared:generate.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWorkspaceLotRealtimeRoom = buildWorkspaceLotRealtimeRoom;
exports.buildWorkspacePresenceRealtimeRoom = buildWorkspacePresenceRealtimeRoom;
exports.buildWorkspaceWheelRealtimeRoom = buildWorkspaceWheelRealtimeRoom;
exports.buildGamePublicSessionRealtimeRoom = buildGamePublicSessionRealtimeRoom;
exports.buildWheelPublicSessionRealtimeRoom = buildWheelPublicSessionRealtimeRoom;
exports.parseWorkspacePresenceRealtimeRoom = parseWorkspacePresenceRealtimeRoom;
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
    return `wheel-public:${String(publicSessionId !== null && publicSessionId !== void 0 ? publicSessionId : "").trim().toLowerCase()}`;
}
function buildWheelPublicSessionRealtimeRoom(publicSessionId) {
    return buildGamePublicSessionRealtimeRoom(publicSessionId);
}
function parseWorkspacePresenceRealtimeRoom(room) {
    const match = /^workspace:([^:]+):presence$/.exec(String(room !== null && room !== void 0 ? room : ""));
    return (match === null || match === void 0 ? void 0 : match[1]) ? match[1] : null;
}
