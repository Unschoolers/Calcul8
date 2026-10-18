# Task 6: refresh-family revocation and logout races

Implemented refresh-family-safe rotation and logout in the API. Access session rows now carry an optional server-only `refreshFamilyId`; first issuance and refreshed issuance populate it, and refresh rotation conditionally backfills a legacy prior access row before the family CAS. Family revocation reads a fresh refresh row, checks the presented current/immediate-previous secret hash and verified owner when supplied, retries ETag conflicts, and never upserts. It revokes before deleting all family-linked sessions plus both retained association slots, and clears the family associations only after deletion succeeds. Logout-all revokes all of a user's refresh families before enumerating/deleting access sessions and then clears associations.

The integration suite uses the real auth code and session repository against a stateful in-memory Cosmos ETag transport, plus actual logout/logout-all handlers. It covers legacy access-only logout before and after rotation, query-miss reread, multiple rotations, refresh-cookie-only logout with current/previous secrets, expired/deleted old access rows, foreign-owner/invalid-secret rejection, corrupt foreign session associations, failed-delete retry, exhausted ETag retry failure, and logout-all ordering. A separate regression confirms valid-session CSRF rejection remains enforced.

The follow-up closes the query-miss interleaving where rotation could backfill and advance the family after logout's reread but before deletion. The fallback now deletes only the ETag version it observed; a concurrent backfill forces a bounded query/reread retry, which discovers and revokes the family. Logout cookies are cleared only after successful cleanup so a 500 after family revocation can be retried. Bearer bootstrap now creates a fresh access session and refresh family for each device/request. A valid existing session cookie still authenticates before bearer fallback and reuses its current session; simultaneous bearer bootstraps cannot upsert one shared row and strand either family's logout path.

The concurrent bootstrap regression runs actual bearer resolution, refresh issuance, and family logout against the stateful Cosmos ETag transport. It verifies that two same-token initial requests receive separate linked access/family pairs, that refreshing and logging out one removes its old and successor access sessions, and that the other family and access session still authenticate.

## Verification

- Red-first: the new rotation regression failed before implementation because a revoked family was accepted and rewritten.
- Red-first follow-up: the actual handler/stateful-transport race regression failed before the follow-up because the successor session survived an interleaved backfill and rotation.
- Red-first bootstrap follow-up: the stateful regression failed before the fix because the second concurrent same-token request reused the deterministic access id and did not receive an independent refresh family.
- `TZ=UTC npx vitest run --config vitest.config.mjs src/functions/auth.test.ts src/lib/cosmos/sessionRepository.test.ts src/lib/auth.test.ts src/lib/auth/sessionLogout.integration.test.ts --maxWorkers=1 --minWorkers=1` — 4 files, 46 tests passed after the follow-up.
- `npm run verify` after the bootstrap follow-up — API build passed; 101 test files and 709 tests passed.
- `npm run typecheck` — passed after the bootstrap follow-up.
- `npm run typecheck:tests` — passed after the bootstrap follow-up.
- `git diff --check` — passed.
