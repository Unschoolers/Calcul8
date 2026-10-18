# Production hardening — final review

All fourteen scoped fixes are implemented and independently reviewed by Sol. Luna workers implemented the isolated tasks. The combined code and tests at `fb7267f` passed the final verification gate.

| Task | Result |
| --- | --- |
| 1 | Mystery Grid resets preserve pending settlements and lot selection. |
| 2 | Spins acquire ownership before awaiting and reject obsolete callbacks. |
| 3 | Pricing queues and authentication effects belong to the captured scope and visit. |
| 4 | Ignored pulls preserve the unsent local dirty baseline. |
| 5 | Inventory validation and sale writes share an atomic guard and metadata CAS. |
| 6 | Family revocation wins refresh/logout races, including access-only and concurrent bootstrap flows. |
| 7 | Chase decisions and stable sale drafts survive reload, config changes and realtime delivery. |
| 8 | Clean 409 recovery avoids queue deadlocks and preserves concurrent metadata and sales edits. |
| 9 | Atomic immutable mutation identities prevent duplicate sales, changed replays and historical rollback. |
| 10 | Whatnot CSV reviews over 250 rows fail before side effects. |
| 11 | CSV merges add each row's quantity. |
| 12 | Native fee/profit calculations precede final CAD portfolio conversion and labeling. |
| 13 | Readers use a coherent active preset generation; superseded generations retain at least 24 hours. |
| 14 | Realtime catch-up and child hydration requests cannot overwrite newer owned state or dirty prices. |

## Validation

`TZ=UTC VITEST_MAX_WORKERS=2 npm run verify:all` exited **0** on the combined branch:

- Web: **1,760 tests**, 196 files.
- Vue: **215 tests**, 28 files.
- API: **743 tests**, 104 files.
- Production and test typechecks, shared contracts, security scan, realtime verification and web/API builds passed.

Android configuration compliance passed with `--skip-dependency-insight`: target SDK 36 and Billing 8.3.0. `git diff --check` passed. Sol also checked the integrated game-session and realtime overlap (157 standard tests and 2 Vue scenarios).

The final gate initially exposed an outdated template assertion for the batch-sale button. Its expectation was updated to reflect the reviewed chase-safe behavior; the targeted 33 tests and then the complete gate passed.

## Review and rollout details

Sale mutations now add an immutable identity record in the same Cosmos transaction. An omitted base version means version zero; current web and trusted import writers supply explicit versions. Existing legacy access sessions gain family links conditionally; new bearer bootstraps have separate access sessions and refresh families. New chase fields remain optional in shared codecs.

Validation used automated tests and stateful repository/handler transport simulations. Live Cosmos concurrency, a 100-user load test and an Android device smoke test were outside these checks. No production data or deployment was changed.

All work is committed locally on `fix/production-hardening-20261017`. Remote publication and PR creation remain pending explicit authorization for `Unschoolers/Calcul8`, following the automatic approval rejection. Main remains at `ef1da9afc0a036f637ba6816e8e5788640e6e6a9`.
