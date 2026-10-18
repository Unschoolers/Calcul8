# Task 13: coherent sync snapshots and superseded-generation retention

`loadCoherentSyncSnapshotInputs(container, userId)` now reads metadata, queries only the pointed preset generation (or legacy rows whose `presetSetId` is absent, null, or empty), then rereads metadata. It accepts two null metadata reads or matching valid version/generation values with the same nonempty ETag. Three unstable attempts return `SyncSnapshotConflictError`. Snapshot reads and incremental push diffs share this loader, and the repository entrypoint re-exports it for other consumers.

Incremental publication now fails closed when existing metadata has no ETag. Every resolved Cosmos transactional-batch response passes the shared `assertSuccessfulCosmosBatch` check before the write is reported as successful. Large writes continue staging unique preset generations before the final metadata CAS; a failed stage or final 412 leaves the previous generation readable and skips retirement cleanup.

After a confirmed generation swap, the repository writes a server-clock `supersededAt` marker to the prior versioned generation. Retention scans all preset documents so active expired markers, fresh markers, unmarked generations, and legacy rows remain visible to the cleanup decision. It protects the active generation, selects only markers at least 24 hours old, queries each exact generation, and verifies the metadata pointer is unchanged before deletion. Cleanup is awaited and best effort; marker or deletion failures are logged without changing the already committed write result.

Focused regressions cover legacy filtering, changed and missing ETags, three-attempt churn, missing-ETag publication rejection, resolved partial-batch failure, discovered active/fresh/unmarked/legacy retention cases, server-clock supersession time, awaited cleanup and logged cleanup rejection, plus partial large staging and final metadata 412 with prior-generation readability.

Validation (UTC): `npm --prefix apps/api test -- --pool=threads --maxWorkers=1 --minWorkers=1` passed 102 files / 700 tests; `npm --prefix apps/api run build` passed; `npm --prefix apps/api run typecheck:tests` passed; `git diff --check` passed.
