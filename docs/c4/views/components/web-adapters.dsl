component calcul8.web "WebPwaBoundaryAdapters" {
    title "Web PWA boundary adapters"
    include calcul8.web.authClient
    include calcul8.web.workspaceState
    include calcul8.web.syncCoordinator
    include calcul8.web.salesWorkflows
    include calcul8.web.gameWorkflows
    include calcul8.web.whatnotWorkflows
    include calcul8.web.localStateStore
    include calcul8.web.apiClient
    include calcul8.web.realtimeClient
    autoLayout lr
}
