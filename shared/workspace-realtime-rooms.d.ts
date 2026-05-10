export function buildWorkspaceLotRealtimeRoom(workspaceId: string, lotId: string | number): string;
export function buildWorkspacePresenceRealtimeRoom(workspaceId: string): string;
export function buildWorkspaceWheelRealtimeRoom(workspaceId: string): string;
export function buildGamePublicSessionRealtimeRoom(publicSessionId: string): string;
export function buildWheelPublicSessionRealtimeRoom(publicSessionId: string): string;
export function parseWorkspacePresenceRealtimeRoom(room: string): string | null;
