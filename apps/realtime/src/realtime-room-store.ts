import { WebSocket } from "ws";
import {
  type BroadcastPayload,
  type ClientState,
  sendJson
} from "./realtime-helpers.js";
import { buildWorkspacePresenceRealtimeRoom } from "./workspace-realtime-rooms.js";

export class RealtimeRoomStore {
  private readonly clients = new Map<string, ClientState>();
  private readonly roomMembers = new Map<string, Set<string>>();
  private nextClientId = 1;

  get clientCount(): number {
    return this.clients.size;
  }

  get roomCount(): number {
    return this.roomMembers.size;
  }

  addClient(socket: WebSocket): ClientState {
    const state: ClientState = {
      id: `c${this.nextClientId++}`,
      socket,
      rooms: new Set(),
      isAlive: true
    };

    this.clients.set(state.id, state);
    return state;
  }

  allClients(): IterableIterator<ClientState> {
    return this.clients.values();
  }

  hasClient(state: ClientState): boolean {
    return this.clients.has(state.id);
  }

  addClientToRoom(state: ClientState, room: string): void {
    state.rooms.add(room);

    let members = this.roomMembers.get(room);
    if (!members) {
      members = new Set<string>();
      this.roomMembers.set(room, members);
    }

    members.add(state.id);
  }

  removeClientFromRoom(state: ClientState, room: string): void {
    state.rooms.delete(room);
    const members = this.roomMembers.get(room);
    if (!members) return;

    members.delete(state.id);
    if (members.size === 0) this.roomMembers.delete(room);
  }

  disconnectClient(state: ClientState): boolean {
    if (!this.clients.has(state.id)) return false;
    this.clients.delete(state.id);

    for (const room of Array.from(state.rooms)) {
      this.removeClientFromRoom(state, room);
    }

    return true;
  }

  getRoomMemberCount(room: string): number {
    return this.roomMembers.get(room)?.size ?? 0;
  }

  hasActivePresenceSubscription(workspaceId: string, userId: string): boolean {
    const presenceRoom = buildWorkspacePresenceRealtimeRoom(workspaceId);
    for (const client of this.clients.values()) {
      if (client.userId === userId && client.rooms.has(presenceRoom) && client.socket.readyState === WebSocket.OPEN) {
        return true;
      }
    }
    return false;
  }

  broadcastToRoom(payload: BroadcastPayload): number {
    const members = this.roomMembers.get(payload.room);
    if (!members || members.size === 0) return 0;

    let delivered = 0;
    const outgoingPayload = {
      type: "event",
      room: payload.room,
      eventType: payload.eventType,
      data: payload.data
    };

    for (const clientId of members) {
      const state = this.clients.get(clientId);
      if (!state || state.socket.readyState !== WebSocket.OPEN) continue;
      sendJson(state.socket, outgoingPayload);
      delivered += 1;
    }

    return delivered;
  }
}
