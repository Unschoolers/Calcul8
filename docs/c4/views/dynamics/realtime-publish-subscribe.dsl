dynamic calcul8.realtime "RealtimePublishSubscribeFlow" {
    title "Realtime publish and subscribe flow"
    calcul8.web -> calcul8.realtime.gateway "Subscribes to a signed workspace room."
    calcul8.realtime.gateway -> calcul8.realtime.auth "Validates the subscribe token against requested rooms."
    calcul8.realtime.gateway -> calcul8.realtime.roomStore "Adds the socket to the requested room."
    calcul8.api -> calcul8.realtime.gateway "Publishes an event to the room."
    calcul8.realtime.gateway -> calcul8.realtime.auth "Authorizes the internal publisher request."
    calcul8.realtime.gateway -> calcul8.realtime.payloadParser "Validates publish room and event payload."
    calcul8.realtime.gateway -> calcul8.realtime.roomStore "Broadcasts the event to room members."
    calcul8.realtime.roomStore -> calcul8.realtime.httpHelpers "Serializes event payload to WebSocket clients."
    calcul8.realtime.gateway -> calcul8.web "Delivers the workspace event."
    autoLayout lr
}

