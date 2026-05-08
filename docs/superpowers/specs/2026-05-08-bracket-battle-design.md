# Bracket Battle Design

## Summary

Bracket Battle is the third game surface for Calcul8. It is a competitive luck game where buyers enter a 4- or 8-player bracket, each match has a pre-assigned prize, and every match winner receives that match prize before advancing. The MVP uses pure roll resolution only: each side rolls, the higher roll wins, and ties automatically reroll until one side wins.

The first version is host-local in the app. Public spectator, realtime broadcasting, and customer-facing proof pages are follow-up work after the host game loop is stable.

## Goals

- Add a competitive game that fits lot and singles-backed prize workflows.
- Keep bracket-specific behavior out of wheel and mystery-grid spin logic.
- Make every match award explicit, auditable, and recoverable from session state.
- Support 4- and 8-player brackets with deterministic match progression.
- Reuse existing lot/singles sale and inventory handling where practical.

## Non-Goals For MVP

- No card-reveal scoring.
- No manual winner override.
- No public spectator page.
- No workspace realtime broadcasting.
- No API-backed fairness proof endpoint.
- No tournament formats beyond single-elimination 4- and 8-player brackets.

## User Flow

1. Host opens Bracket Battle from the game area.
2. Host selects 4 or 8 spots.
3. Host enters buyers/participants.
4. Host pre-assigns one prize to every match.
5. Host starts the bracket, locking participants and match prizes.
6. The app randomizes bracket seeds.
7. Host resolves the active match by rolling for each side.
8. Higher roll wins the match prize and advances.
9. Ties trigger automatic tiebreaker rolls until one winner remains.
10. The champion is the winner of the final match; the champion also receives the final match prize.

## Prize Model

Each match owns exactly one prize before the bracket starts. A prize can be:

- a sealed/bulk lot prize, such as pack, box, or custom lot quantity;
- a singles-backed prize tied to a singles purchase entry;
- a manual fallback prize label with optional cost/value metadata.

When a match resolves, the prize becomes an award assigned to the winning participant. Award settlement should use the existing game sale/inventory support patterns where possible so lot and singles deductions stay consistent with current game behavior.

## Domain Model

The bracket domain should be separate from wheel/grid modules. Suggested types:

- `BracketGameConfig`: id, name, participant count, roll range, status, created/updated metadata.
- `BracketParticipant`: id, buyer name, seed, status.
- `BracketMatch`: id, round, position, participant ids, winner id, prize id, status.
- `BracketPrize`: id, match id, source type, label, lot/singles reference, cost/value metadata.
- `BracketRoll`: id, match id, participant id, roll value, roll number, tiebreaker index.
- `BracketAward`: id, match id, participant id, prize id, awardedAt, settlement status.

The bracket result should be derivable from participants, matches, prizes, and rolls. Stored denormalized fields are allowed only for UI convenience and must not be the source of truth for winners.

## Architecture

Add a bracket-specific domain area under the existing game module instead of extending wheel command files:

- `src/components/windows/game/bracket/`
- domain helpers for bracket creation, seeding, match progression, roll resolution, and award generation;
- UI components for setup, bracket board, active match, prize assignment, and award history;
- command methods that bridge the Vue shell to the bracket domain;
- focused tests under `tests/` for domain logic and UI method contracts.

The existing wheel/grid game shell can host the entry point, but bracket internals should remain separate. If shared game navigation needs a small adapter registry update, the adapter should select the bracket view explicitly instead of pretending the bracket is a tier-prize wheel variant.

## Roll Resolution

MVP roll rules:

- roll range is 1-100;
- each participant in the match gets one roll;
- higher roll wins;
- equal rolls create a tiebreaker roll pair;
- tiebreakers repeat until there is a winner;
- every roll is appended to match history.

Randomness should use the same fairness-oriented approach as current game work where feasible. A local deterministic helper is acceptable for MVP tests, but the runtime path should be isolated so a later server-backed proof can replace it without rewriting match progression.

## Persistence And Recovery

Bracket session state should be stored with scoped storage keys, matching the existing personal/workspace isolation rules. Reloading the app should restore:

- bracket config;
- participants and seeds;
- match prizes;
- completed rolls;
- awards;
- current active match.

Incomplete setup state can remain editable. Once the bracket starts, participants and prizes are locked to avoid changing the meaning of already-visible matches.

## Error Handling

- Starting is blocked until every participant slot and match prize is filled.
- Resolving is blocked if the bracket is not started, the match is complete, or either side is missing.
- Prize settlement failures should leave the award visible with a recoverable settlement status instead of silently dropping it.
- Storage failures should notify the host and keep in-memory state intact.
- Tiebreakers should be bounded defensively in code even though repeated ties are unlikely.

## Testing

Focused tests should cover:

- 4- and 8-player bracket generation;
- participant seeding with all participants represented exactly once;
- match prize pre-assignment requirements;
- roll resolution and automatic tiebreakers;
- winner advancement through rounds;
- award creation for every resolved match;
- reload/recovery from persisted session state;
- inventory/singles settlement calls at the boundary.

Before merge, frontend verification should include the focused bracket tests, existing game tests, `npm run typecheck`, and `npm run verify`.

## Follow-Up Work

- Public spectator view.
- Workspace realtime updates.
- Human-readable fairness proof page.
- Card/reveal-based scoring modes.
- Manual prize pick mode.
- Larger bracket sizes.
