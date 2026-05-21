calcul8 = softwareSystem "Calcul8" "Local-first PWA for live selling, profitability tracking, workspace sync, and public game sessions." {
    !docs docs
    !adrs decisions adrtools
    properties {
        "Open C2 container view" "{workspace}/diagrams#ContainerView"
    }

    web = container "Web PWA" "Vue/Vuetify app for authenticated sellers, local-first workflows, sales, lots, games, Whatnot import, and workspace sync." "Vue, TypeScript, Vite" {
        tags "Web App", "Microsoft Azure - Static Apps"
        properties {
            "Open C3 Web PWA components" "{workspace}/diagrams#WebPwaComponents"
        }

        !include components/web.dsl
    }

    spectator = container "Spectator Page" "Public read-only browser entry for game sessions and live audience displays." "TypeScript, Vite" {
        tags "Web App", "Public Surface", "Microsoft Azure - Static Apps"
    }

    api = container "API Functions" "HTTP API for auth-bound sync, sales, workspace, billing, Whatnot, and public game-session operations." "Azure Functions, TypeScript" {
        tags "API", "Microsoft Azure - Function Apps"
        properties {
            "Open C3 API components" "{workspace}/diagrams#ApiComponents"
        }

        !include components/api.dsl
    }

    realtime = container "Realtime Gateway" "WebSocket and HTTP publish gateway for workspace lot rooms, presence, and public game-session updates." "Node.js, ws, TypeScript" {
        tags "Realtime", "Microsoft Azure - App Services"
        properties {
            "Open C3 realtime components" "{workspace}/diagrams#RealtimeComponents"
        }

        !include components/realtime.dsl
    }

    cosmos = container "Cosmos DB" "Cloud-authoritative storage for profiles, workspaces, sync snapshots, sales, billing facts, Whatnot connections, and public game sessions." "Azure Cosmos DB" {
        tags "Database", "Microsoft Azure - Azure Cosmos DB"
    }

    browserStorage = container "Browser Local Storage" "Local-first storage for lots, sales, game configuration, sync metadata, and cached session state." "Indexed browser storage" {
        tags "Local Storage"
    }
}

buyer -> calcul8.spectator "Views public game-session state." "HTTPS"

calcul8.api -> azureHosting "Runs inside managed hosting and deployment infrastructure." "Azure Functions"
calcul8.realtime -> azureHosting "Runs as the deployed realtime process." "Container/App Service"

!include components/web-relationships.dsl
!include components/api-relationships.dsl
