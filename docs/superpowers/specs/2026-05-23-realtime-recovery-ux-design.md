# Realtime Recovery UX Design

## Summary

Calcul8 should make realtime delivery gaps visible, recoverable, and understandable for both workspace hosts and public spectators. Realtime remains a best-effort delivery optimization; the API and stored snapshots remain authoritative. When sockets reconnect, subscriptions change, snapshots look stale, or delivery is uncertain, the app refreshes authoritative state and tells the user what happened in plain language.

The first version covers both the host workspace experience and spectator pages. Host screens get stronger data-safety behavior because they can create or edit authoritative data. Spectator pages keep the last known game visible while reconnecting or catching up so public viewers do not see a blank or broken page during transient network issues.

## Goals

- Make realtime health visible without turning it into noisy infrastructure UI.
- Recover host workspace state from missed realtime events by refreshing authoritative data after reconnects and suspicious delivery gaps.
- Protect dirty local host edits from silent cloud overwrite during conflict recovery.
- Keep spectator pages visually stable while refreshing public snapshots in the background.
- Use shared recovery language and concepts for host and spectator surfaces.
- Keep the realtime gateway simple for v1 while adding basic safety around oversized WebSocket messages.
- Preserve bilingual English/French UI copy with correct French diacritics.

## Non-Goals For V1

- No durable server-side event log.
- No guaranteed exactly-once or ordered realtime delivery.
- No Redis, Azure SignalR, or shared backplane migration.
- No broad rewrite of sync snapshot persistence.
- No full conflict resolver for every entity type in the first slice.
- No blocking spectator modal for transient reconnects.
- No replacement of existing workspace presence; presence should be enriched only where recovery state makes it more honest.

## Selected Direction

Use a versioned recovery UX layer.

Realtime events still update the app immediately when they arrive. When the app reconnects or detects uncertainty, it asks the authoritative API for the current state and updates the UI after that refresh completes. The user sees a small confidence state such as live, reconnecting, catching up, recovered, stale, or disconnected.

This gives sellers and viewers the right mental model: realtime is fast, but recovery comes from the source of truth. It also matches the C4 decision that realtime gaps should cause stale UI at worst, not data loss.

## Recovery States

Host workspace realtime should keep the existing states and add richer recovery states:

- `idle`: realtime is not active for the current scope or view.
- `connecting`: opening a socket and requesting a subscription.
- `connected`: subscribed and receiving live workspace updates.
- `reconnecting`: socket dropped and a retry is scheduled or in progress.
- `catching_up`: connection is back and the app is refreshing authoritative state.
- `recovered`: catch-up completed and the app is current again.
- `stale`: the app kept usable local state, but recovery failed or needs user action.
- `disconnected`: the last realtime attempt failed and no retry is currently active.

Spectator pages should use the same user-facing vocabulary with spectator-specific state names:

- `live`: subscribed and watching the current public session.
- `connecting`: opening the public session socket.
- `reconnecting`: socket dropped and the page will retry.
- `catching_up`: refreshing the latest public snapshot.
- `recovered`: the latest snapshot was recovered after a gap.
- `stale`: the last known game remains visible, but it may be behind.
- `ended`: the public session ended and the socket is intentionally closed.

`recovered` is a short-lived display state. It should settle back to `connected` or `live` after 2500ms so the UI confirms recovery without staying visually busy.

## Host Workspace UX

The host app should surface realtime confidence in three layers:

1. Account/menu badge:
   - keep the existing small badge on the profile/avatar;
   - distinguish connected, connecting/reconnecting/catching-up, stale/disconnected, and recovered;
   - keep the icon compact because the app bar is dense.

2. Account menu health row:
   - replace the generic workspace realtime row with a clearer health summary;
   - show the current state title and practical subtitle;
   - include a manual refresh action when state is stale or disconnected.

3. Inline banner only when action is needed:
   - no banner for healthy connected state;
   - show a subtle warning when data may be stale;
   - show a stronger warning when cloud data changed while local edits are dirty;
   - keep the primary action explicit, such as `Refresh now` / `Actualiser maintenant` or `Review changes` / `Vérifier les changements`.

Host copy should speak about data confidence, not socket mechanics. Good examples:

- English: `Live updates connected`, `Catching up with cloud data`, `Recovered latest workspace data`, `Data may be out of date`.
- French: `Mises à jour en direct connectées`, `Rattrapage des données cloud`, `Données de l'espace récupérées`, `Les données peuvent être en retard`.

## Host Recovery Behavior

On workspace socket reconnect or successful resubscribe:

1. Mark realtime as `catching_up`.
2. Refresh authoritative state for the active workspace context:
   - current lot sales and live pricing when a lot is selected;
   - workspace wheel/game session state when the game/wheel room is subscribed;
   - cloud sync snapshot for lot config updates or unknown workspace changes.
3. If refresh succeeds and does not hit dirty local changes, apply it and mark `recovered`.
4. If refresh fails, keep local state visible and mark `stale`.
5. If refresh would overwrite dirty local changes, keep local changes, mark `stale`, and surface a review action instead of applying cloud state silently.

The recovery path should avoid duplicate refresh storms. A single in-flight catch-up should satisfy repeated reconnect, subscribed, and version-mismatch triggers for the same workspace context.

## Dirty Local State Policy

Dirty local state must not be overwritten by automatic recovery.

The first version should use the existing sync payload signature as a conservative guard:

- If the current workspace payload signature still matches `lastSyncedPayloadHash`, automatic cloud refresh may apply.
- If the signature differs, recovery can still refresh entity-specific data that is known to be safe, such as authoritative sales for the active lot, but it must not apply a broad cloud sync snapshot over local changes.
- When broad sync recovery is blocked by dirty local state, the host sees a clear stale state and a review action.

This is intentionally conservative. It protects users first, then leaves finer-grained conflict resolution for a future sync-specific project.

## Spectator UX

The spectator page should never drop from a visible game into a full loading or error state because the socket blinked.

Add a compact live confidence pill near the language toggle or inside the page hero:

- `Live` / `En direct`
- `Reconnecting...` / `Reconnexion...`
- `Catching up...` / `Rattrapage...`
- `Recovered` / `Récupéré`
- `Behind` / `En retard`
- `Ended` / `Terminé`

Spectator pages should keep the last known snapshot visible during reconnect and catch-up. If refresh succeeds, apply the newer snapshot and briefly show `Recovered`. If refresh fails, keep the existing snapshot and show `Behind` with a short subtitle that the page is retrying.

Only initial load failures should use the existing full empty/error states. Once a valid snapshot has been shown, recovery failures become an overlay/status concern rather than a page replacement.

## Spectator Recovery Behavior

On public session realtime events:

- Apply valid newer snapshots immediately.
- Ignore older snapshots by `updatedAt`.
- Refresh the public snapshot on `subscribed`, malformed snapshot payload, reconnect, or socket error recovery.
- Preserve the current view while the refresh is running.
- Close the socket intentionally when the session status is `ended`.

When the refresh returns `not_found`, the page should switch to the existing not-found state because the public session is no longer readable. Other refresh failures should keep the last known snapshot visible and mark it stale.

## Realtime Gateway Safety

The gateway should add a WebSocket frame size limit matching the existing HTTP JSON body safety intent.

Rules:

- Configure `WebSocketServer` with a `maxPayload` option.
- Add a `maxWebSocketPayloadBytes` gateway option with a 64 KiB default, separate from the HTTP publish body limit.
- Close oversized WebSocket messages with code `1009`.
- Keep malformed JSON handling as a normal client error response for messages within the size limit.

The gateway should not store events or replay history in v1.

## Version And Metadata Rules

V1 should use metadata already available in each domain before adding new broad contracts:

- Sales and live pricing should prefer existing entity versions when present.
- Wheel/game session recovery should use `wheelSessionUpdatedAt` and public snapshot `updatedAt`.
- Public spectator snapshots should continue using `updatedAt` to reject older data.
- Unknown or unverifiable event payloads should trigger authoritative refresh rather than being guessed into local state.

Future work can add explicit event sequence numbers per room if real usage shows that timestamp/version metadata is not enough.

## Component And File Boundaries

Expected implementation areas:

- `src/app-core/methods/ui/workspace/workspace-realtime-state.ts`
  - host realtime state shape, display state helpers, reconnect/catch-up bookkeeping.

- `src/app-core/methods/ui/workspace/workspace-realtime-socket.ts`
  - socket lifecycle, resubscribe behavior, catch-up trigger points.

- `src/app-core/methods/ui/workspace/workspace-realtime-events.ts`
  - version-aware event application and refresh-on-uncertainty hooks.

- `src/app-core/methods/ui/sync/sync-conflict-policy.ts`
  - dirty local state guard for broad sync recovery.

- `src/app-core/computed.ts`
  - host display copy mapping for richer realtime states.

- `src/components/shell/AppShellTopBar.html`
  - health row and optional manual refresh action in the account menu.

- `src/components/shell/AppShellTopBar.css`
  - compact health visual states using theme-aware tokens.

- `src/spectator/spectatorTypes.ts`
  - spectator recovery state fields.

- `src/spectator-main.ts`
  - public socket lifecycle, background refresh, stale/recovered state transitions.

- `src/spectator/SpectatorApp.vue`
  - spectator live confidence pill.

- `src/styles/spectator.css`
  - spectator confidence pill styling using spectator-local tokens.

- `apps/realtime/src/realtime-gateway.ts`
  - WebSocket `maxPayload` configuration and close behavior.

The implementation should avoid putting all recovery behavior in a Vue component. Socket state and recovery decisions belong in app-core helpers where tests can exercise them without rendering.

## Error Handling

- Token fetch `403` in host workspace mode still calls `handleWorkspaceAccessLost`.
- Token fetch `404` in spectator mode switches to not-found because the public session no longer exists.
- Network errors during host catch-up mark data stale and keep local state visible.
- Network errors during spectator refresh keep the last snapshot visible and mark it behind.
- Repeated reconnect failures should keep exponential backoff and not spam notifications.
- Manual refresh actions should reuse the same recovery path as automatic catch-up.

## Accessibility And Motion

- Recovery status text must be available as visible text in the account menu and spectator pill.
- The app bar badge can remain icon-only because the account menu exposes text.
- Spectator status changes should not steal focus.
- No flashing or constant animation for reconnect states; use existing spinner behavior only for compact icons.
- Copy must fit in French on mobile.

## Testing

Host-focused tests should cover:

- reconnect or resubscribe transitions through `catching_up` and then `recovered`;
- failed catch-up leaves state as `stale` without clearing local data;
- dirty local sync state blocks broad cloud snapshot application;
- manual refresh action triggers the same recovery path;
- display mapping for all host realtime states in English and French;
- existing sale, live pricing, wheel, and presence events still apply when healthy.

Spectator-focused tests should cover:

- reconnect keeps the last ready snapshot visible;
- `subscribed` triggers background refresh without full-page loading;
- successful refresh briefly marks recovered;
- failed refresh marks stale while preserving the prior snapshot;
- `not_found` refresh switches to the not-found state;
- ended sessions close the socket intentionally.

Realtime gateway tests should cover:

- oversized WebSocket messages close with `1009`;
- normal malformed JSON messages still return the existing error envelope;
- existing publish, subscribe, origin, auth, presence, and heartbeat tests continue to pass.

Verification after implementation should include targeted realtime/spectator tests, `npm --prefix apps/realtime run test`, `npm run typecheck`, and `npm run verify` before merging.

## Rollout Plan

Phase 1 should build the visible recovery layer and transport guard:

- host richer states and display copy;
- host reconnect catch-up with dirty-state guard;
- spectator confidence state and background refresh;
- realtime WebSocket payload limit;
- focused tests.

Phase 2 should harden version mismatch detection:

- explicit refresh-on-unknown-event hooks;
- stronger entity version checks where APIs already expose versions;
- C4 decision status update from proposed to accepted after implementation evidence exists.

Phase 3 should evaluate durable replay only if production behavior proves that refresh-on-reconnect is not enough:

- room-level event sequence numbers;
- API outbox or shared event log;
- backplane-compatible delivery if realtime scales beyond one replica.

## Acceptance

- A host can lose and regain realtime during a workspace session without silently overwriting local dirty changes.
- A host can tell whether the app is live, catching up, recovered, stale, or disconnected.
- A spectator sees the last known game while the page reconnects or catches up.
- A spectator page recovers from missed public-session events by refreshing the authoritative snapshot.
- Oversized WebSocket client messages are rejected without stressing gateway memory.
- English and French recovery copy is complete and tested.
