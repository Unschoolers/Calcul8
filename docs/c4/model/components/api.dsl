functionEntryPoints = component "Function Entry Points" "Azure Functions route bindings." "apps/api/src/functions" {
    tags "API Component", "Boundary"
    properties {
        "Owns" "Azure Functions route bindings, route-level method wiring, and delegation to feature handlers."
        "Must not own" "Business rules, repository behavior, provider-specific logic, or duplicated HTTP/auth guard code."
        "Boundary data" "HttpRequest, InvocationContext, route params, request bodies, headers, and handler responses."
        "Failure recovery" "Keep route failures observable through shared error handling and avoid partial ad hoc responses."
    }
}

httpBoundary = component "HTTP Boundary" "Shared HTTP and auth guard layer." "apps/api/src/lib/http.ts, apps/api/src/lib/auth" {
    tags "API Component", "Security Boundary", "Validation Boundary"
    properties {
        "Owns" "The executeHttpHandler lifecycle for config resolution, CORS and CSRF guards, shared distributed rate limiting, consistent error responses, and route failure logging."
        "Must not own" "Feature-specific persistence, provider token exchange, sync snapshot mutation, or billing entitlement decisions."
        "Boundary data" "Headers, proxy-appended client addresses, cookies, auth tokens, CSRF tokens, normalized user ids, rate-limit decisions, HTTP errors, and response envelopes."
        "Failure recovery" "Fail closed on auth/CSRF ambiguity, use a bounded local limiter if shared counters are unavailable, and return consistent 4xx/5xx JSON without leaking secrets."
    }
}

authSessions = component "Auth And Session Services" "Provider-neutral session services." "apps/api/src/features/auth, apps/api/src/lib/auth" {
    tags "API Component", "Security Boundary"
    properties {
        "Owns" "Provider-neutral sessions, session cookies, user resolution, profile linkage, logout, and account-session revocation."
        "Must not own" "Billing entitlement projection, workspace membership policy, feature data storage, or frontend cache behavior."
        "Boundary data" "Provider identity claims, session ids, cookie attributes, user profile ids, and revocation requests."
        "Failure recovery" "Invalidate unsafe sessions, reject ambiguous identities, and keep session failures separate from entitlement state."
    }
}

syncWorkspaceServices = component "Sync And Workspace Services" "Scoped sync and workspace services." "apps/api/src/features/sync, apps/api/src/features/workspaces" {
    tags "API Component"
    properties {
        "Owns" "Workspace-scoped sync push/pull handlers, membership checks, join links, leave/delete flows, and access-loss responses."
        "Must not own" "Frontend dirty-state decisions, browser storage migrations, realtime room membership, or billing access projection."
        "Boundary data" "Workspace ids, sync snapshots, client versions, membership roles/status, join tokens, and conflict responses."
        "Failure recovery" "Recheck membership, reject stale versions, keep creation non-active until owner membership exists, and expose bounded migration-admin audit/repair for older owner-membership orphans."
    }
}

salesGameServices = component "Sales And Game Services" "Sales, pricing, and game APIs." "apps/api/src/features/sales, apps/api/src/features/game, apps/api/src/features/wheel" {
    tags "API Component"
    properties {
        "Owns" "Sales CRUD, live pricing updates, public game sessions, wheel fairness verification, and game-session publish triggers."
        "Must not own" "Frontend rendering, local inventory calculations, WebSocket connection state, or provider billing/import credentials."
        "Boundary data" "Sale records, lot ids, optimistic versions, live pricing payloads, public session ids, fairness proofs, and publish events."
        "Failure recovery" "Use optimistic concurrency for cloud-authoritative records, revalidate workspace control access, and emit enough version data for clients to refresh after conflicts."
    }
}

billingEntitlementServices = component "Billing Entitlement Services" "Billing facts and access projection." "apps/api/src/features/billing, apps/api/src/features/entitlements, apps/api/src/lib/entitlementFacts.ts" {
    tags "API Component", "Security Boundary"
    properties {
        "Owns" "Stripe checkout sessions, Play purchase verification, provider fact ingestion, entitlement projection, and access summaries."
        "Must not own" "Profile identity, workspace membership, local UI gating state, or unrelated feature authorization policy."
        "Boundary data" "Provider customer ids, purchase tokens, subscription/payment facts, entitlement ids, projected access, and webhook events."
        "Failure recovery" "Write versioned provider facts with optimistic concurrency, project access idempotently, record webhook completion last, and avoid granting access from unverified client claims."
    }
}

whatnotImportServices = component "Whatnot Import Services" "Whatnot OAuth and import services." "apps/api/src/features/whatnot, apps/api/src/lib/whatnot.ts" {
    tags "API Component", "Security Boundary"
    properties {
        "Owns" "Whatnot OAuth connection lifecycle, token refresh, order import, import batches, mapping persistence, and sale-import metadata."
        "Must not own" "Frontend review layout, seller-authored local notes, billing access projection, or workspace ownership inference for credentials."
        "Boundary data" "OAuth codes/tokens, imported orders, normalized rows, review decisions, external ids, sale mappings, and import audit records."
        "Failure recovery" "Freeze reviewed decisions and planned sale identities, lease each attempt, checkpoint logical sale operations, recover sales by mutation or provider identity, reject stale workspace callbacks, prevent token refresh from recreating disconnected credentials, and expose partial failures for deterministic user-triggered retry."
    }
}

cosmosRepositories = component "Cosmos Repositories" "Cosmos persistence boundary." "apps/api/src/lib/cosmos" {
    tags "API Component", "Database Boundary"
    properties {
        "Owns" "Cosmos ids, partition keys, retries, ETag/precondition handling, conflict translation, shared rate-limit counters, and document shape persistence."
        "Must not own" "HTTP response formatting, feature-level authorization choices, frontend scope fallback, or provider API calls."
        "Boundary data" "Cosmos documents, partition keys, ETags, versions, conflict/not-found errors, and repository DTOs."
        "Failure recovery" "Translate Cosmos races into explicit conflicts and avoid silent destructive overwrites across partitions."
    }
}

providerClients = component "Provider Clients" "External provider client boundary." "apps/api/src/lib" {
    tags "API Component", "External Client"
    properties {
        "Owns" "Outbound provider calls, request signing/authorization, provider response parsing, retryable network behavior, and telemetry adapters."
        "Must not own" "Domain persistence, entitlement policy, import review decisions, or route-level HTTP guard behavior."
        "Boundary data" "Provider credentials, OAuth tokens, checkout/session payloads, purchase verification responses, orders, and telemetry events."
        "Failure recovery" "Fail closed on provider ambiguity, normalize transient failures, and prevent secrets from reaching logs or client responses."
    }
}

realtimePublisher = component "Realtime Publisher" "Best-effort realtime publisher." "apps/api/src/lib/realtime.ts" {
    tags "API Component"
    properties {
        "Owns" "Best-effort publish calls from API writes to the realtime gateway and shared publish payload conventions."
        "Must not own" "Authoritative persistence, WebSocket subscriptions, room membership, or client recovery decisions."
        "Boundary data" "Workspace ids, lot ids, public session ids, event types, version metadata, and internal publish credentials."
        "Failure recovery" "Keep API writes authoritative when publish fails and include version metadata so clients can refresh after delivery gaps."
    }
}

functionEntryPoints -> httpBoundary "Delegates." "Calls"
httpBoundary -> authSessions "Authenticates." "Calls"
httpBoundary -> syncWorkspaceServices "Dispatches." "Calls"
httpBoundary -> salesGameServices "Dispatches." "Calls"
httpBoundary -> billingEntitlementServices "Dispatches." "Calls"
httpBoundary -> whatnotImportServices "Dispatches." "Calls"

authSessions -> providerClients "Verifies." "HTTPS"
authSessions -> cosmosRepositories "Persists." "Repository"
syncWorkspaceServices -> cosmosRepositories "Persists." "Repository"
salesGameServices -> cosmosRepositories "Persists." "Repository"
salesGameServices -> realtimePublisher "Publishes." "Calls"
billingEntitlementServices -> providerClients "Verifies." "HTTPS"
billingEntitlementServices -> cosmosRepositories "Persists." "Repository"
whatnotImportServices -> providerClients "Imports." "HTTPS"
whatnotImportServices -> cosmosRepositories "Persists." "Repository"
