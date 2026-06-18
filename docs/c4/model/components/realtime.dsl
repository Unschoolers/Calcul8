entryPoint = component "Runtime Entry Point" "Realtime process bootstrap." "index.ts" {
    tags "Runtime Entry"
    properties {
        "Owns" "Runtime bootstrap, environment loading, gateway startup, and process-level configuration handoff."
        "Must not own" "Room behavior, auth policy, payload parsing, or business event semantics."
        "Boundary data" "Allowed origins, publish key, token secret, port, dev-auth flags, and startup errors."
        "Failure recovery" "Fail startup loudly when required config is missing instead of running a partially open realtime gateway."
    }
}

gateway = component "Gateway Runtime" "HTTP and WebSocket gateway." "realtime-gateway.ts" {
    tags "Realtime Component", "Boundary"
    properties {
        "Owns" "HTTP/WebSocket server lifecycle, upgrade validation, heartbeat, routing, graceful shutdown, and gateway-level orchestration."
        "Must not own" "API persistence, frontend state recovery, room-name construction rules, or token-signing decisions."
        "Boundary data" "HTTP requests, WebSocket clients, publish requests, subscribe messages, heartbeat state, and shutdown signals."
        "Failure recovery" "Drop unauthorized/stale sockets, clean up disconnected clients, and keep publish failures isolated to realtime delivery."
    }
}

auth = component "Auth Boundary" "Publish and subscribe authorization." "realtime-auth.ts" {
    tags "Realtime Component", "Security Boundary"
    properties {
        "Owns" "Internal publish authentication, signed subscribe-token validation, origin-aware authorization checks, and token claim parsing."
        "Must not own" "Workspace membership persistence, API session cookies, payload shape normalization, or room broadcast behavior."
        "Boundary data" "Internal API keys, HMAC secrets, subscribe tokens, token claims, origins, and authorization failures."
        "Failure recovery" "Reject unsigned, expired, malformed, or mismatched subscribe/publish attempts without joining rooms."
    }
}

payloadParser = component "Payload Parser" "Realtime payload validation." "realtime-payloads.ts" {
    tags "Realtime Component", "Validation Boundary"
    properties {
        "Owns" "JSON payload validation for subscribe/unsubscribe, publish, and diagnostic room-count requests."
        "Must not own" "Socket writes, auth decisions, room membership mutation, or API data persistence."
        "Boundary data" "Inbound message bodies, event envelopes, room names, user ids, workspace ids, and parse errors."
        "Failure recovery" "Reject malformed payloads early and return bounded validation errors without mutating room state."
    }
}

httpHelpers = component "HTTP And Socket Helpers" "Bounded HTTP and socket helpers." "realtime-helpers.ts" {
    tags "Realtime Component", "Validation Boundary"
    properties {
        "Owns" "Bounded body reads, JSON response helpers, socket send helpers, option normalization, and basic room-string sanitation."
        "Must not own" "Authorization, publish routing, room store state, or business event interpretation."
        "Boundary data" "Raw request streams, JSON bodies, WebSocket send payloads, HTTP status codes, and sanitized strings."
        "Failure recovery" "Prevent oversized/malformed payloads from destabilizing the process and avoid writing to closed sockets."
    }
}

roomStore = component "Room Store" "Process-local room membership." "realtime-room-store.ts" {
    tags "Realtime Component", "In Memory State"
    properties {
        "Owns" "In-memory client registry, room membership, subscribe/unsubscribe bookkeeping, member counts, and broadcast fan-out."
        "Must not own" "Durable state, workspace authorization, presence semantics, or cross-replica synchronization."
        "Boundary data" "WebSocket client handles, room names, user ids, connection ids, broadcast payloads, and disconnect events."
        "Failure recovery" "Remove dead sockets promptly and keep broadcasts best-effort because process-local state is not horizontally safe."
    }
}

presenceStore = component "Presence Store" "Process-local workspace presence." "realtime-presence-store.ts" {
    tags "Realtime Component", "In Memory State"
    properties {
        "Owns" "Workspace presence snapshots, online/offline derivation, presence event emission, and cleanup after unsubscribe/disconnect."
        "Must not own" "Membership authority, durable audit history, API workspace state, or generic room broadcast mechanics."
        "Boundary data" "Workspace presence rooms, user ids, connection ids, online member snapshots, and presence events."
        "Failure recovery" "Recompute presence from active room subscriptions so stale disconnects do not leave users permanently online."
    }
}

roomNames = component "Room Naming" "Shared realtime room contracts." "workspace-realtime-rooms.ts" {
    tags "Realtime Component", "Shared Contract"
    properties {
        "Owns" "Canonical room-name construction and parsing for workspace lot rooms, presence rooms, wheel rooms, and public sessions."
        "Must not own" "Socket lifecycle, authorization, payload delivery, or business event payload content."
        "Boundary data" "Workspace ids, lot ids, wheel/session ids, room strings, and parsed room descriptors."
        "Failure recovery" "Keep invalid room names from crossing boundaries and preserve shared room contracts between web, API, and realtime."
    }
}

entryPoint -> gateway "Starts." "Config"
calcul8.spectator -> gateway "Subscribes to public game-session rooms." "WebSocket"

gateway -> auth "Authorizes." "HMAC"
gateway -> payloadParser "Parses." "JSON"
gateway -> httpHelpers "Responds." "Helpers"
gateway -> roomStore "Broadcasts." "Memory"
gateway -> presenceStore "Syncs presence." "Memory"
gateway -> roomNames "Classifies." "Rooms"

roomStore -> httpHelpers "Sends." "WebSocket"
roomStore -> roomNames "Builds." "Rooms"
presenceStore -> roomStore "Checks active." "Memory"
presenceStore -> roomNames "Builds." "Rooms"

gateway -> calcul8.web.realtimeClient "Delivers workspace events and presence snapshots to subscribed clients." "WebSocket"
gateway -> calcul8.spectator "Delivers public game-session events to subscribed spectators." "WebSocket"
