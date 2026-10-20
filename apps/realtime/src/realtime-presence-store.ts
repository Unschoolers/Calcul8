import { WebSocket } from "ws";
import {
  type ClientState,
  type WorkspacePresenceMember,
  normalizeOptionalString,
  sendJson
} from "./realtime-helpers.js";
import type { RealtimeRoomStore } from "./realtime-room-store.js";
import {
  buildWorkspacePresenceRealtimeRoom,
  parseWorkspacePresenceRealtimeRoom
} from "./workspace-realtime-rooms.js";

export type WorkspacePresenceEvent = {
  type: "event";
  room: string;
  eventType: "workspace.presence";
  data: {
    workspaceId: string;
    members: WorkspacePresenceMember[];
  };
};

export class WorkspacePresenceStore {
  private readonly workspacePresence = new Map<string, Map<string, WorkspacePresenceMember>>();
  private readonly clientWorkspaces = new Map<string, Set<string>>();

  refreshClientLastSeen(state: ClientState): void {
    if (!state.userId || (state.authorizationExpiresAt != null && Date.now() >= state.authorizationExpiresAt)) return;
    const workspaceIds = this.clientWorkspaces.get(state.id);
    if (!workspaceIds) return;
    const lastSeenAt = new Date().toISOString();
    for (const workspaceId of workspaceIds) {
      const member = this.workspacePresence.get(workspaceId)?.get(state.userId);
      if (member?.isOnline) member.lastSeenAt = lastSeenAt;
    }
  }

  syncClientPresenceState(state: ClientState, roomStore: RealtimeRoomStore): string[] {
    const userId = normalizeOptionalString(state.userId);
    if (!userId) return [];

    const currentWorkspaceIds = new Set<string>();
    for (const room of state.rooms) {
      const workspaceId = parseWorkspacePresenceRealtimeRoom(room);
      if (workspaceId) {
        currentWorkspaceIds.add(workspaceId);
      }
    }

    // Remember this client's previous rooms so partial unsubscribe and close
    // update exactly the affected workspaces without scanning presence history.
    const workspaceIds = new Set([
      ...currentWorkspaceIds,
      ...(this.clientWorkspaces.get(state.id) ?? [])
    ]);
    if (roomStore.hasClient(state) && currentWorkspaceIds.size > 0) {
      this.clientWorkspaces.set(state.id, currentWorkspaceIds);
    } else {
      this.clientWorkspaces.delete(state.id);
    }

    const lastSeenAt = new Date().toISOString();
    const changedWorkspaceIds: string[] = [];
    for (const workspaceId of workspaceIds) {
      const members = this.getWorkspacePresenceMembers(workspaceId);
      const previous = members.get(userId);
      const isOnline = roomStore.hasActivePresenceSubscription(workspaceId, userId);
      if (!previous || previous.isOnline !== isOnline) changedWorkspaceIds.push(workspaceId);
      if (!previous || previous.isOnline || isOnline) {
        members.set(userId, { userId, isOnline, lastSeenAt });
      }
    }

    return changedWorkspaceIds;
  }

  getWorkspacePresenceSnapshot(workspaceId: string): WorkspacePresenceMember[] {
    return Array.from(this.getWorkspacePresenceMembers(workspaceId).values());
  }

  buildWorkspacePresenceEvent(workspaceId: string): WorkspacePresenceEvent {
    return {
      type: "event",
      room: buildWorkspacePresenceRealtimeRoom(workspaceId),
      eventType: "workspace.presence",
      data: {
        workspaceId,
        members: this.getWorkspacePresenceSnapshot(workspaceId)
      }
    };
  }

  sendWorkspacePresenceSnapshot(socket: WebSocket, workspaceId: string, maxBufferedBytes?: number): void {
    sendJson(socket, this.buildWorkspacePresenceEvent(workspaceId), maxBufferedBytes);
  }

  private getWorkspacePresenceMembers(workspaceId: string): Map<string, WorkspacePresenceMember> {
    let members = this.workspacePresence.get(workspaceId);
    if (!members) {
      members = new Map<string, WorkspacePresenceMember>();
      this.workspacePresence.set(workspaceId, members);
    }
    return members;
  }
}
