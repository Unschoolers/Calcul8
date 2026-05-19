dynamic calcul8 "PublicGameSessionFlow" {
    title "Public game session publish and spectator update"
    seller -> calcul8.web "Publishes or updates the live game session."
    calcul8.web -> calcul8.api "Sends public-session snapshot."
    calcul8.api -> calcul8.cosmos "Stores public-session state and version metadata."
    calcul8.api -> calcul8.realtime "Publishes public-session refresh event."
    buyer -> calcul8.spectator "Opens the public session URL."
    calcul8.spectator -> calcul8.api "Loads the latest public snapshot."
    calcul8.spectator -> calcul8.realtime "Subscribes for session updates."
    calcul8.realtime -> calcul8.spectator "Streams updated game state."
    autoLayout lr
}

