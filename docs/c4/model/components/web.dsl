appShell = component "App Shell" "Main Vue/Vuetify application frame." "src/App.vue, src/App.html, src/app-shell" {
    tags "Web Component", "Boundary"
    properties {
        "Owns" "Top-level app composition, navigation chrome, active window hosting, global dialogs, and shared shell zones."
        "Must not own" "Lot math, sync conflict policy, provider API details, or screen-specific business rules."
        "Boundary data" "Active tab/window ids, authenticated profile display state, workspace selection, theme/layout state, and dialog commands."
        "Context composition" "Only src/app-core/context-app.ts declares AppContext and src/app-core/context.ts re-exports it. The root validates complete method and computed assembly; every leaf module consumes a focused auth, entitlement, buyer, commerce, portfolio, sync, workspace, Whatnot, game, shell, watcher, lifecycle, PWA, or runtime capability contract."
        "Failure recovery" "Keep the app navigable when auth, workspace, or child-window loading fails; route users to the owning workflow surface."
    }
}

authClient = component "Auth Client" "Browser session and entitlement state." "src/app-core/auth, src/app-core/methods/ui/auth, src/app-core/methods/ui/entitlements" {
    tags "Web Component", "Security Boundary"
    properties {
        "Owns" "Browser-side session state, sign-in/out commands, profile refresh, entitlement refresh, and account-deletion initiation."
        "Must not own" "Provider credential verification, billing fact projection, workspace authorization, or local lot/sale persistence."
        "Boundary data" "Session status, profile display fields, entitlement summary, CSRF/session cookies, and account lifecycle commands."
        "Failure recovery" "Recover from expired sessions by clearing unsafe auth state, refreshing when possible, and forcing explicit sign-in when not."
    }
}

workspaceState = component "Workspace State" "Personal and workspace scope state." "src/app-core/workspace-scope.ts, src/app-core/methods/ui/workspace" {
    tags "Web Component", "Shared Contract"
    properties {
        "Owns" "Current personal/workspace scope, active workspace metadata, membership lists, join/leave actions, and scope transitions."
        "Must not own" "Cloud snapshot storage, sync payload mutation, realtime transport internals, or API membership persistence."
        "Boundary data" "Workspace ids, membership roles/status, active scope keys, join-link input, and personal fallback commands."
        "Failure recovery" "Fall back to personal mode when workspace access is lost and trigger scoped local-state recovery without mixing data."
    }
}

localStateStore = component "Local State Store" "Scoped local-first browser state." "src/app-core/state.ts, src/app-core/storageKeys.ts, src/app-core/methods/config-storage.ts" {
    tags "Web Component", "Local State"
    properties {
        "Owns" "Scoped browser storage keys, local lot/sale/game snapshots, sync metadata, migration reads, and local reset recovery."
        "Must not own" "Remote authorization, cloud conflict decisions, realtime delivery, or API document schemas beyond shared contracts."
        "Boundary data" "Serialized lots, sales, wheel configs, active ids, client versions, payload hashes, and storage-scope identifiers."
        "Failure recovery" "Protect against missing/corrupt local storage by validating snapshots, preserving recoverable data, and avoiding cross-scope bleed."
    }
}

syncCoordinator = component "Sync Coordinator" "Scoped snapshot sync orchestration." "src/app-core/methods/ui/sync" {
    tags "Web Component", "Validation Boundary"
    properties {
        "Owns" "Queued pull/push orchestration, local dirty-state decisions, stale-version handling, snapshot apply, and sync status display."
        "Must not own" "API membership checks, Cosmos conflict translation, component rendering, or provider auth verification."
        "Boundary data" "Sync payloads, client versions, payload signatures, scope keys, push/pull responses, and conflict notifications."
        "Failure recovery" "Isolate failed queued operations, apply pulled snapshots with rollback-safe grouped storage writes before committing live state, auto-pull clean stale conflicts, preserve dirty local edits, and surface explicit recovery when needed."
    }
}

salesWorkflows = component "Sales And Lot Workflows" "Selling and inventory workflows." "src/components/windows/config, src/components/windows/sales, src/components/windows/live, src/components/windows/singles, src/components/windows/portfolio" {
    tags "Web Component"
    properties {
        "Owns" "Lot setup, cost basis, sales entry/editing, live pricing inputs, portfolio summaries, forecasts, charts, and sales history UI."
        "Must not own" "Shared shell layout, reusable UI primitive definitions, cloud sync authorization, or provider import token handling."
        "Boundary data" "Lots, sales, live prices, inventory counts, forecast scenarios, cost/profit calculations, and display-ready KPI values."
        "Failure recovery" "Keep local-first selling workflows usable when sync or realtime is unavailable, and avoid presenting forecasts as recorded facts."
    }
}

buyerProfileStore = component "Buyer Profile Store" "Scoped local-first buyer identity state." "src/app-core/methods/ui/buyers, src/app-core/buyer-profile.ts, src/components/customers" {
    tags "Web Component", "Local State", "Shared Contract"
    properties {
        "Owns" "Profile normalization, scope-specific cache/outbox state, optimistic writes, conflict recovery, identity composition, and reusable buyer UI."
        "Must not own" "Sales-derived financial metrics, server authorization, Cosmos document behavior, or screen-specific customer analytics."
        "Boundary data" "Username, preferred name, tags, versions, pending mutations, save states, and display-safe identities."
        "Failure recovery" "Ignore stale-scope responses, retain offline/auth-expired drafts, rebase explicit retries, and clear in-memory identity data at sign-out."
    }
}

uiContracts = component "Shared UI Contracts" "Reusable mobile-first UI contracts." "src/styles, src/components/shared, src/app-core/ui" {
    tags "Web Component", "Shared Contract"
    properties {
        "Owns" "Reusable layout primitives, tokens, responsive breakpoints, KPI/card/table/dialog/chart contracts, and utility-library wrappers."
        "Must not own" "Feature-specific business decisions, API calls, stored data, or screen-only copy beyond shared component labels."
        "Boundary data" "Presentation props, slots, visual states, sort/filter commands, density choices, and theme-aware CSS variables."
        "Failure recovery" "Prevent layout forks by keeping mobile/tablet together, preserve readable light/dark contrast, and avoid component-specific breakpoint drift."
    }
}

gameWorkflows = component "Game Workflows" "Wheel, grid, and public game workflows." "src/components/windows/game, src/components/windows/wheel" {
    tags "Web Component"
    properties {
        "Owns" "One canonical root-owned game session, scoped persistence, typed preview/live lifecycle transitions, deterministic outcome settlement, wheel/grid configuration, Bracket lifecycle, fairness proof links, and spectator publishing effects."
        "Must not own" "Realtime socket infrastructure, API token validation, shared room naming contracts, or unrelated sales import behavior."
        "Boundary data" "Narrow game capability ports, canonical session snapshots, configs, spin outcomes, pending inventory issues, public session ids, fairness tokens, and staged display state."
        "Failure recovery" "Preserve authoritative realtime session topology, restore scoped and personal legacy selections safely, contain corrupt storage, block unsafe actions until lot selections resolve, and recover public-session display after realtime gaps."
    }
}

whatnotWorkflows = component "Whatnot Workflows" "Whatnot import and review workflows." "src/components/windows/whatnot, src/app-core/methods/ui/whatnot" {
    tags "Web Component"
    properties {
        "Owns" "Whatnot connection status UI, CSV upload/review, import mapping screens, review decisions, and seller-facing import metadata display."
        "Must not own" "OAuth secret storage, token refresh, provider API calls, backend import persistence, or sale repository writes."
        "Boundary data" "CSV rows, mapped sale candidates, review decisions, import batch ids, external order ids, and existing-sale match hints."
        "Failure recovery" "Preserve seller-authored notes, keep external identifiers separate from notes, and make skipped/updated rows auditable."
    }
}

apiClient = component "API Client Methods" "Browser HTTP client boundary." "src/app-core/methods" {
    tags "Web Component", "External Client"
    properties {
        "Owns" "Browser fetch wrappers, request payload shaping, response parsing, CSRF inclusion, and API error normalization for UI workflows."
        "Must not own" "Server-side authorization, provider secrets, Cosmos conflict logic, or direct local-state mutation beyond caller contracts."
        "Boundary data" "HTTP JSON payloads, auth headers/cookies, CSRF tokens, response DTOs, and normalized API errors."
        "Failure recovery" "Return typed failures that let workflows distinguish auth loss, access loss, conflicts, validation errors, and offline/network failures."
    }
}

realtimeClient = component "Realtime Client" "Browser WebSocket client boundary." "src/app-core/methods/workspace-realtime-api.ts, src/app-core/methods/ui/workspace/workspace-realtime.ts" {
    tags "Web Component", "Shared Contract"
    properties {
        "Owns" "WebSocket lifecycle, subscribe/unsubscribe commands, reconnect status, workspace presence updates, and public-session event application."
        "Must not own" "Authoritative data writes, room authorization, server heartbeat policy, or local sync conflict decisions."
        "Boundary data" "Signed subscribe tokens, room names, realtime events, presence snapshots, reconnect reasons, and delivery-gap signals."
        "Failure recovery" "Refresh authoritative state after reconnects, stale versions, publish uncertainty, or missed realtime delivery."
    }
}

i18nDisplay = component "I18n And Display Helpers" "Bilingual display helpers." "src/app-core/i18n, src/app-core/computed" {
    tags "Web Component"
    properties {
        "Owns" "Bilingual UI strings, locale-aware labels, compact display derivations, and reusable presentation helpers."
        "Must not own" "Business persistence, API authorization, provider integration, or feature workflow control flow."
        "Boundary data" "Translation keys, formatted numbers/dates/currency, status labels, and display-only derived state."
        "Failure recovery" "Keep fallback copy readable, preserve French diacritics, and avoid leaking internal error text into user-facing UI."
    }
}

appShell -> authClient "Loads session." "Calls"
appShell -> workspaceState "Reads scope." "Calls"
appShell -> salesWorkflows "Hosts." "Vue"
appShell -> buyerProfileStore "Hosts shared buyer identity UI." "Vue"
appShell -> gameWorkflows "Hosts." "Vue"
appShell -> whatnotWorkflows "Hosts." "Vue"
appShell -> uiContracts "Composes." "Vue"
appShell -> i18nDisplay "Renders labels." "Calls"

workspaceState -> localStateStore "Scopes." "Keys"
syncCoordinator -> localStateStore "Applies sync." "Cache"
salesWorkflows -> localStateStore "Reads/writes." "Cache"
salesWorkflows -> uiContracts "Composes." "Vue"
salesWorkflows -> buyerProfileStore "Composes buyer metadata with derived sales analytics." "Vue"
buyerProfileStore -> localStateStore "Caches scoped profiles and outbox." "Cache"
buyerProfileStore -> apiClient "Lists and mutates profiles." "HTTPS JSON"
realtimeClient -> buyerProfileStore "Invalidates changed workspace profiles." "Calls"
gameWorkflows -> localStateStore "Reads/writes." "Cache"
whatnotWorkflows -> localStateStore "Maps imports." "Cache"
