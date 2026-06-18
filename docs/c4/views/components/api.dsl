component calcul8.api "ApiComponents" {
    title "API Functions components"
    include calcul8.api.functionEntryPoints
    include calcul8.api.httpBoundary
    include calcul8.api.authSessions
    include calcul8.api.syncWorkspaceServices
    include calcul8.api.salesGameServices
    include calcul8.api.billingEntitlementServices
    include calcul8.api.whatnotImportServices
    include calcul8.api.cosmosRepositories
    include calcul8.api.providerClients
    include calcul8.api.realtimePublisher
    autoLayout lr
}
