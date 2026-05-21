entryPoint = component "Runtime Entry Point" "Reads environment configuration and starts the realtime gateway process." "index.ts" {
    tags "Runtime Entry"
}

gateway = component "Gateway Runtime" "Owns the HTTP server, WebSocket server, upgrade checks, heartbeat loop, request routing, and graceful shutdown." "realtime-gateway.ts" {
    tags "Realtime Component", "Boundary"
}

auth = component "Auth Boundary" "Authorizes internal publisher HTTP requests and validates signed subscribe tokens." "realtime-auth.ts" {
    tags "Realtime Component", "Security Boundary"
}

payloadParser = component "Payload Parser" "Normalizes and validates WebSocket subscribe/unsubscribe messages, publish bodies, and room-count requests." "realtime-payloads.ts" {
    tags "Realtime Component", "Validation Boundary"
}

httpHelpers = component "HTTP And Socket Helpers" "Reads bounded JSON bodies, normalizes options, sanitizes rooms, and writes JSON responses/messages." "realtime-helpers.ts" {
    tags "Realtime Component", "Validation Boundary"
}

roomStore = component "Room Store" "Tracks connected clients, room membership, member counts, disconnects, and room broadcasts in process memory." "realtime-room-store.ts" {
    tags "Realtime Component", "In Memory State"
}

presenceStore = component "Presence Store" "Derives workspace online/offline member snapshots from room membership and emits presence events." "realtime-presence-store.ts" {
    tags "Realtime Component", "In Memory State"
}

roomNames = component "Room Naming" "Builds and parses workspace, wheel, and public-session room names." "workspace-realtime-rooms.ts" {
    tags "Realtime Component", "Shared Contract"
}

entryPoint -> gateway "Starts with allowed origins, publish key, token secret, and dev-auth flags." "Environment config"
calcul8.spectator -> gateway "Subscribes to public game-session rooms." "WebSocket"

gateway -> auth "Checks publish credentials and subscribe tokens." "HMAC / shared secret"
gateway -> payloadParser "Parses client messages and internal HTTP payloads." "JSON"
gateway -> httpHelpers "Reads bounded bodies and sends JSON responses/messages." "HTTP/WebSocket helpers"
gateway -> roomStore "Adds clients to rooms, removes clients, counts members, and broadcasts room events." "In-memory calls"
gateway -> presenceStore "Synchronizes presence when clients subscribe, pong, or disconnect." "In-memory calls"
gateway -> roomNames "Detects workspace presence rooms." "Room strings"

roomStore -> httpHelpers "Sends broadcast payloads to open sockets." "WebSocket JSON"
roomStore -> roomNames "Builds workspace presence room names for active-subscription checks." "Room strings"
presenceStore -> roomStore "Checks whether a user still has an active presence subscription." "In-memory calls"
presenceStore -> roomNames "Builds and parses workspace presence rooms." "Room strings"

gateway -> calcul8.web.realtimeClient "Delivers workspace events and presence snapshots to subscribed clients." "WebSocket"
gateway -> calcul8.spectator "Delivers public game-session events to subscribed spectators." "WebSocket"
