appShell = component "App Shell" "Owns the main Vue/Vuetify app frame, account menu, workspace controls, window registry, dialogs, and theme-aware layout." "src/App.vue, src/app-shell" {
    tags "Web Component", "Boundary"
}

authClient = component "Auth Client" "Tracks signed-in state, Google sign-in, session refresh, logout, account deletion, and entitlement cache updates." "src/app-core/auth, src/app-core/methods/ui/auth, src/app-core/methods/ui/entitlements" {
    tags "Web Component", "Security Boundary"
}

workspaceState = component "Workspace State" "Resolves personal versus workspace scope, active workspace id, membership state, and workspace UI actions." "src/app-core/workspace-scope.ts, src/app-core/methods/ui/workspace" {
    tags "Web Component", "Shared Contract"
}

localStateStore = component "Local State Store" "Centralizes local-first state, scope-aware storage keys, local cache reads/writes, and browser storage recovery." "src/app-core/state.ts, src/app-core/storageKeys.ts, src/app-core/methods/config-storage.ts" {
    tags "Web Component", "Local State"
}

syncCoordinator = component "Sync Coordinator" "Pushes and pulls scoped snapshots, handles conflict policy, stale-version recovery, auth expiry, and local reset recovery." "src/app-core/methods/ui/sync" {
    tags "Web Component", "Validation Boundary"
}

salesWorkflows = component "Sales And Lot Workflows" "Owns lot setup, sales entry, live pricing, singles workflows, forecasting, portfolio, and sales charts." "src/components/windows/config, src/components/windows/sales, src/components/windows/live, src/components/windows/singles, src/components/windows/portfolio" {
    tags "Web Component"
}

gameWorkflows = component "Game Workflows" "Owns wheel and grid game configuration, live stage rendering, fairness links, public session publishing, and spectator mode controls." "src/components/windows/game, src/components/windows/wheel" {
    tags "Web Component"
}

whatnotWorkflows = component "Whatnot Workflows" "Owns Whatnot connection status, CSV import, OAuth sync, import review, and mapping review screens." "src/components/windows/whatnot, src/app-core/methods/ui/whatnot" {
    tags "Web Component"
}

apiClient = component "API Client Methods" "Wraps browser fetch calls for sync, sales, workspaces, billing, entitlements, Whatnot, public sessions, and fairness APIs." "src/app-core/methods" {
    tags "Web Component", "External Client"
}

realtimeClient = component "Realtime Client" "Manages workspace and public-session WebSocket subscriptions, room naming, reconnect state, and presence updates." "src/app-core/methods/workspace-realtime-api.ts, src/app-core/methods/ui/workspace/workspace-realtime.ts" {
    tags "Web Component", "Shared Contract"
}

i18nDisplay = component "I18n And Display Helpers" "Translates user-facing text and derives compact display state for sync, realtime, Whatnot, sales, and portfolio views." "src/app-core/i18n, src/app-core/computed" {
    tags "Web Component"
}

appShell -> authClient "Loads session, profile, entitlement, and account actions." "In-process calls"
appShell -> workspaceState "Reads active scope and workspace controls." "In-process calls"
appShell -> salesWorkflows "Hosts lot, sales, live, singles, and portfolio windows." "Vue component composition"
appShell -> gameWorkflows "Hosts game and wheel windows." "Vue component composition"
appShell -> whatnotWorkflows "Hosts Whatnot connection, import, and review flows." "Vue component composition"
appShell -> i18nDisplay "Renders translated labels and derived status display." "In-process calls"

workspaceState -> localStateStore "Separates personal and workspace storage scopes." "Scope keys"
syncCoordinator -> localStateStore "Reads local snapshot state and applies safe sync results." "Local cache"
salesWorkflows -> localStateStore "Reads and writes lots, sales, prices, and local workflow state." "Local cache"
gameWorkflows -> localStateStore "Reads and writes game configuration, sessions, and local stage state." "Local cache"
whatnotWorkflows -> localStateStore "Maps imported sales into local lots and sales state." "Local cache"
