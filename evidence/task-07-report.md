# Task 7: Durable wheel chase settlement

## Behavior

Live chase spins now write a durable obligation and stable sale draft before animation begins. The saved record captures the spin/tier/config, original prize, the immutable singles-entry snapshot and its identity fingerprint. Reload restores the same obligation and reopens the decision dialogue before another spin can proceed. Keep/replace retries use the original sale ID, including after a lost response, and the obligation clears only after confirmed settlement or an explicit noninventory choice.

The source guard compares the active wheel config and the captured singles-entry identity (item, card number, SKU, image, condition, and language). It leaves the obligation visible when the source is missing or repurposed. Cost, market value, and quantity remain mutable so legitimate pricing and stock updates do not invalidate the source identity. Reset, switching wheels, and deleting the bound config cannot erase an unresolved obligation. Preview spins remain isolated. Older sessions without chase fields decode with an empty default; incomplete chase records remain visibly unresolved.

The pending obligation is represented in the canonical shared session DTO, generated CommonJS/ESM/declaration artifacts, app codecs, workspace realtime events, and API broadcast normalizer.

## Verification

- Web focused suite: 7 files, 156 tests passed (single worker, `TZ=UTC`).
- API broadcast and sync contract suite: 2 files, 4 tests passed.
- `npm run typecheck` passed.
- `npm run typecheck:tests:web` passed.
- `npm --prefix apps/api run typecheck` passed.
- `npm --prefix apps/api run typecheck:tests` passed.
- `npm run shared:check` checked all 48 generated contract artifacts.
- `git diff --check` passed.

## Follow-up review fixes

Applying a wheel configuration while a chase is unresolved now leaves the saved config untouched, surfaces the chase decision, and restores its tier selection. Ordinary batch sale actions identify the chase by its stable draft ID: direct batch record and dismiss are blocked, and Record All settles ordinary issues while leaving the chase pending and reopening Keep/Replace. The config apply and batch record regressions pass for unchanged and repurposed source cases.

Follow-up verification: `TZ=UTC npm test -- --run --maxWorkers=1 --minWorkers=1 tests/wheel-chase-durability.test.ts tests/wheel-config-session.test.ts` passed (2 files, 86 tests); `npm run typecheck`, `npm run typecheck:tests:web`, and `git diff --check` passed.

Additional review fixes: applying an incoming realtime session now reopens the durable chase decision and restores its tier, with a warning when the captured prize source is unavailable or changed. An authoritative settlement closes the live decision while leaving preview state alone. Source validation requires a bound lot to exist and retain its captured type, while unbound noninventory prizes remain valid. Wheel config source comparison uses canonical key ordering so equivalent JSON objects survive reorder-only changes. The captured lot type now round-trips through shared sync DTOs and generated API artifacts.

Additional verification: focused durability/config/realtime suites passed (3 files, 102 tests); GameWindow realtime scenario passed (2 tests); `npm run typecheck`, `npm run typecheck:tests:web`, `npm run shared:check` (48 artifacts), and `git diff --check` passed.
