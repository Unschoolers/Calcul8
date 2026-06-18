component calcul8.realtime "RealtimeComponents" {
    title "Realtime gateway components"
    include calcul8.realtime.entryPoint
    include calcul8.realtime.gateway
    include calcul8.realtime.auth
    include calcul8.realtime.payloadParser
    include calcul8.realtime.httpHelpers
    include calcul8.realtime.roomStore
    include calcul8.realtime.presenceStore
    include calcul8.realtime.roomNames
    autoLayout lr
}
