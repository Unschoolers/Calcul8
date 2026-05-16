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

  syncClientPresenceState(state: ClientState, roomStore: RealtimeRoomStore): string[] {
    const userId = normalizeOptionalString(state.userId);
    if (!userId) return [];

    const workspaceIds = new Set<string>();
    for (const room of state.rooms) {
      const workspaceId = parseWorkspacePresenceRealtimeRoom(room);
      if (workspaceId) {
        workspaceIds.add(workspaceId);
      }
    }

    if (workspaceIds.size === 0) {
      for (const [workspaceId, members] of this.workspacePresence.entries()) {
        if (members.has(userId)) {
          workspaceIds.add(workspaceId);
        }
      }
    }

    const lastSeenAt = new Date().toISOString();
    for (const workspaceId of workspaceIds) {
      const members = this.getWorkspacePresenceMembers(workspaceId);
      members.set(userId, {
        userId,
        isOnline: roomStore.hasActivePresenceSubscription(workspaceId, userId),
        lastSeenAt
      });
    }

    return Array.from(workspaceIds);
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

  sendWorkspacePresenceSnapshot(socket: WebSocket, workspaceId: string): void {
    sendJson(socket, this.buildWorkspacePresenceEvent(workspaceId));
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
