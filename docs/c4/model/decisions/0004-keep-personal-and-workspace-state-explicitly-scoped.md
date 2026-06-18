# 4. Explicit scopes

Date: 2026-05-19

## Status

Accepted

## Context

Calcul8 supports personal mode and shared workspace mode. Both modes can contain lots, sales, game state, sync metadata, and realtime subscriptions.

The highest-risk failure class is data bleeding across scopes: a personal sale entering a workspace snapshot, a workspace conflict overwriting personal data, or realtime events from one workspace being applied to another.

## Decision

All local storage keys, cloud sync scopes, workspace API calls, realtime room names, and public-session ownership decisions must carry an explicit personal or workspace scope.

Personal mode remains the safe fallback when workspace access is lost.

## Consequences

Cross-cutting identifiers must stay centralized and typed.

Workspace access loss must be handled as a state transition, not as a generic sync failure.

Tests for shared behavior should prove personal and workspace data cannot bleed into each other.
