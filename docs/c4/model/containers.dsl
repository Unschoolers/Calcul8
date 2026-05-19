calcul8 = softwareSystem "Calcul8" "Local-first PWA for live selling, profitability tracking, workspace sync, and public game sessions." {
    !docs docs
    !adrs decisions adrtools

    web = container "Web PWA" "Vue/Vuetify app for authenticated sellers, local-first workflows, sales, lots, games, Whatnot import, and workspace sync." "Vue, TypeScript, Vite" {
        tags "Web App"
    }

    spectator = container "Spectator Page" "Public read-only browser entry for game sessions and live audience displays." "TypeScript, Vite" {
        tags "Web App", "Public Surface"
    }

    api = container "API Functions" "HTTP API for auth-bound sync, sales, workspace, billing, Whatnot, and public game-session operations." "Azure Functions, TypeScript" {
        tags "API"
    }

    realtime = container "Realtime Gateway" "WebSocket and HTTP publish gateway for workspace lot rooms, presence, and public game-session updates." "Node.js, ws, TypeScript" {
        tags "Realtime"

        !include components/realtime.dsl
    }

    cosmos = container "Cosmos DB" "Cloud-authoritative storage for profiles, workspaces, sync snapshots, sales, billing facts, Whatnot connections, and public game sessions." "Azure Cosmos DB" {
        tags "Database"
    }

    browserStorage = container "Browser Local Storage" "Local-first storage for lots, sales, game configuration, sync metadata, and cached session state." "Indexed browser storage" {
        tags "Local Storage"
    }
}

seller -> calcul8.web "Uses for lot setup, sales, live pricing, sync, imports, and games." "HTTPS"
buyer -> calcul8.spectator "Views public game-session state." "HTTPS"
admin -> calcul8.web "Uses admin-facing diagnostics and import tooling." "HTTPS"

calcul8.web -> googleIdentity "Signs users in and receives session identity." "OAuth/OIDC"
calcul8.web -> calcul8.api "Calls authenticated API endpoints." "HTTPS JSON"
calcul8.web -> calcul8.realtime "Subscribes to workspace rooms and presence." "WebSocket"
calcul8.web -> calcul8.browserStorage "Reads and writes local-first state." "Browser APIs"
calcul8.realtime -> calcul8.web "Notifies subscribed workspace clients about presence, sync, and lot events." "WebSocket"

calcul8.spectator -> calcul8.api "Loads public session snapshots and spectator counts." "HTTPS JSON"
calcul8.spectator -> calcul8.realtime "Subscribes to public game-session updates." "WebSocket"
calcul8.realtime -> calcul8.spectator "Streams public game-session updates to subscribed spectators." "WebSocket"

calcul8.api -> calcul8.cosmos "Reads and writes authoritative cloud state." "Cosmos SDK"
calcul8.api -> calcul8.web "Returns API responses, mapped import rows, entitlement state, and sync results." "HTTPS JSON"
calcul8.api -> calcul8.realtime "Publishes workspace and public-session change events." "HTTPS JSON"
calcul8.api -> googleIdentity "Verifies identity claims when needed." "HTTPS"
calcul8.api -> googlePlay "Verifies purchase tokens and entitlement facts." "HTTPS"
calcul8.api -> stripe "Creates checkout sessions and processes webhooks." "HTTPS"
calcul8.api -> whatnot "Connects OAuth accounts and imports sales data." "OAuth/HTTPS"
calcul8.api -> azureHosting "Runs inside managed hosting and deployment infrastructure." "Azure Functions"
calcul8.realtime -> azureHosting "Runs as the deployed realtime process." "Container/App Service"
