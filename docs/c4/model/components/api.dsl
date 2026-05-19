functionEntryPoints = component "Function Entry Points" "Azure Functions route bindings that expose the API surface and delegate request handling." "apps/api/src/functions" {
    tags "API Component", "Boundary"
}

httpBoundary = component "HTTP Boundary" "Applies CORS, JSON responses, guard handling, auth resolution, CSRF checks, and error mapping." "apps/api/src/lib/http.ts, apps/api/src/lib/auth" {
    tags "API Component", "Security Boundary", "Validation Boundary"
}

authSessions = component "Auth And Session Services" "Issues and revokes provider-neutral sessions, resolves users, and manages session cookies." "apps/api/src/features/auth, apps/api/src/lib/auth" {
    tags "API Component", "Security Boundary"
}

syncWorkspaceServices = component "Sync And Workspace Services" "Owns scoped sync snapshots, workspace memberships, join links, leave flows, and workspace access checks." "apps/api/src/features/sync, apps/api/src/features/workspaces" {
    tags "API Component"
}

salesGameServices = component "Sales And Game Services" "Owns sales/live-pricing APIs, public game sessions, and wheel fairness endpoints." "apps/api/src/features/sales, apps/api/src/features/game, apps/api/src/features/wheel" {
    tags "API Component"
}

billingEntitlementServices = component "Billing Entitlement Services" "Creates checkout sessions, verifies Play purchases, stores provider facts, and projects effective access." "apps/api/src/features/billing, apps/api/src/features/entitlements, apps/api/src/lib/entitlementFacts.ts" {
    tags "API Component", "Security Boundary"
}

whatnotImportServices = component "Whatnot Import Services" "Manages Whatnot OAuth connections, import batches, review decisions, token refresh, and sale mapping." "apps/api/src/features/whatnot, apps/api/src/lib/whatnot.ts" {
    tags "API Component", "Security Boundary"
}

cosmosRepositories = component "Cosmos Repositories" "Own ids, partition keys, retries, conflict translation, and persistence operations for API-owned documents." "apps/api/src/lib/cosmos" {
    tags "API Component", "Database Boundary"
}

providerClients = component "Provider Clients" "Wraps Google Identity, Google Play, Stripe, Whatnot, telemetry, and retryable network calls." "apps/api/src/lib" {
    tags "API Component", "External Client"
}

realtimePublisher = component "Realtime Publisher" "Publishes sync, sales, workspace, and public-session change events to the realtime gateway." "apps/api/src/lib/realtime.ts" {
    tags "API Component"
}

functionEntryPoints -> httpBoundary "Passes normalized HTTP requests to shared guards and auth handling." "In-process calls"
httpBoundary -> authSessions "Resolves session or bearer identity and applies unsafe-request checks." "In-process calls"
httpBoundary -> syncWorkspaceServices "Dispatches sync and workspace requests." "In-process calls"
httpBoundary -> salesGameServices "Dispatches sales, live pricing, game-session, and fairness requests." "In-process calls"
httpBoundary -> billingEntitlementServices "Dispatches billing checkout, entitlement, and purchase verification requests." "In-process calls"
httpBoundary -> whatnotImportServices "Dispatches Whatnot OAuth, import, review, and sync requests." "In-process calls"

authSessions -> providerClients "Verifies provider identity and emits auth telemetry." "HTTPS / telemetry"
authSessions -> cosmosRepositories "Reads, writes, and revokes session and profile documents." "Repository calls"
syncWorkspaceServices -> cosmosRepositories "Reads and writes scoped sync, workspace, membership, and join-link documents." "Repository calls"
salesGameServices -> cosmosRepositories "Reads and writes sales, live-pricing, fairness, and public-session documents." "Repository calls"
salesGameServices -> realtimePublisher "Publishes lot, sync, and public-session changes." "In-process calls"
billingEntitlementServices -> providerClients "Creates Stripe sessions, verifies Play purchases, and acknowledges purchases." "HTTPS"
billingEntitlementServices -> cosmosRepositories "Persists provider facts, token claims, purchase records, and projected entitlement summaries." "Repository calls"
whatnotImportServices -> providerClients "Exchanges OAuth codes, refreshes tokens, and imports orders." "OAuth/HTTPS"
whatnotImportServices -> cosmosRepositories "Persists connections, import batches, mappings, and sale-import records." "Repository calls"
