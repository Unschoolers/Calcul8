dynamic calcul8 "WorkspaceSyncFlow" {
    title "Workspace sync push and recovery"
    seller -> calcul8.web "Changes lots, sales, or game state locally."
    calcul8.web -> calcul8.browserStorage "Persists the local draft and sync metadata."
    calcul8.web -> calcul8.api "Pushes scoped workspace snapshot with client version."
    calcul8.api -> calcul8.cosmos "Compares and writes authoritative snapshot state."
    calcul8.api -> calcul8.realtime "Publishes workspace update event after accepted write."
    calcul8.realtime -> calcul8.web "Notifies subscribed workspace clients."
    autoLayout lr
}

