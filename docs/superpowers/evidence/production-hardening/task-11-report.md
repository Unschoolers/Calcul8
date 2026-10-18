# Task 11: CSV merge quantities

CSV merge now adds each parsed incoming row's quantity to its matched row, both for an exact item/card/condition/language match and for a unique item/card fallback when condition and language are blank. Duplicate incoming rows therefore sum their imported quantities in merge and sync modes. Append still creates separate rows, and ambiguous fallback matches still remain separate.

The regression tests were run before the implementation and failed on the expected quantity assertions: exact-key duplicate merge returned 4 instead of 8, exact-key existing 2 plus incoming 10 returned 3 instead of 12, sync duplicate merge returned 6 instead of 7, and unique-base fallback returned 3 instead of 12. After the change, `TZ=UTC VITEST_MAX_WORKERS=1 npm test -- tests/config-lots-import.test.ts` passed (21 tests), `npm run typecheck` passed, and `git diff --check` passed.

No CSV quantity parsing or normalization behavior was changed; incoming values continue to use the existing positive-integer parser convention.
