# Commercial runtime validation

Use this runbook to close the production-hardening evidence gaps with an isolated local API host and an explicitly nonproduction Cosmos database. The probe sends authenticated requests to the existing `POST/GET/DELETE /api/lots/{lotId}/sales` handlers. It runs against the local Azure Functions host, so the actual sales handlers and Cosmos repositories execute; it does not address a production URL.

## Local prerequisites

- Node.js 20 or newer, project dependencies, and Azure Functions Core Tools.
- An isolated nonproduction Cosmos account/database configured in `apps/api/local.settings.json` for the local Functions host. Do not use production settings. Start the host from `apps/api` with `npm run start:build`.
- A dedicated nonproduction user with a valid, already existing lot in that database, plus a live session cookie and its matching CSRF token. Use a test-only lot with no active sales and enough headroom for the requested operation count. The probe writes zero-quantity `wheel` sales, so these rows add no box or pack consumption.
- Keep the test session cookie, CSRF token, and any multi-user fixture file local and out of source control. The probe never prints credentials or response bodies.

In another terminal at the repository root, configure the local target and run the default 20-request same-scope contention probe:

```bash
export RUNTIME_VALIDATION_TARGET=nonproduction
export RUNTIME_VALIDATION_API_BASE=http://127.0.0.1:7071
export RUNTIME_VALIDATION_SESSION_COOKIE='whatfees_session=<test-session-value>'
export RUNTIME_VALIDATION_CSRF_TOKEN='<matching-test-csrf-token>'
export RUNTIME_VALIDATION_LOT_ID='<dedicated-test-lot-id>'
node scripts/validate-sales-runtime.mjs
```

The API base must be loopback. The target acknowledgement is required, the script rejects non-loopback URLs, and redirect responses fail closed. Set `RUNTIME_VALIDATION_COUNT` to an integer from 1 through 100 to change the request count; the default is 20. Each request creates a unique sale and mutation ID concurrently. The probe lists the sales to verify each create, then reads them again and calls the existing delete handler for only the generated IDs. Delete follows application semantics and leaves tombstone, mutation identity, and inventory guard records in Cosmos; use a dedicated test scope/database because those protocol records are retained.

A successful run exits 0 and reports `requested`, `created`, `verified`, and `cleaned` equal to the configured count, with `failed` and `cleanupFailed` both zero. It also reports elapsed time and POST request latency percentiles. Any non-200/invalid response, missing listed row, or cleanup failure exits nonzero. A failure report contains counts only. If cleanup fails, inspect the dedicated nonproduction fixture through supported application operations before manually removing anything; never bulk-delete data for cleanup.

## 100-user local API load

For one request per actual test user, prepare a local-only JSON file with one existing nonproduction user session and dedicated lot per row:

```json
[
  { "cookie": "whatfees_session=<user-a-test-session>", "csrfToken": "<user-a-csrf>", "lotId": "<user-a-dedicated-lot>" },
  { "cookie": "whatfees_session=<user-b-test-session>", "csrfToken": "<user-b-csrf>", "lotId": "<user-b-dedicated-lot>" }
]
```

Use 100 rows for a 100-user run, each with its own test account and fixture lot. Keep this file outside the repository and restrict local file access because it contains session credentials. Then run:

```bash
export RUNTIME_VALIDATION_TARGET=nonproduction
export RUNTIME_VALIDATION_API_BASE=http://127.0.0.1:7071
export RUNTIME_VALIDATION_FIXTURES_FILE=/absolute/path/to/nonproduction-users.json
node scripts/validate-sales-runtime.mjs
```

With a fixture file, the tool sends exactly one concurrent create per row and requires any explicit `RUNTIME_VALIDATION_COUNT` to equal the row count. The same listing and generated-row tombstone cleanup applies. This measures authenticated API/Cosmos behavior for the supplied test identities; it does not model browser traffic, user think time, production-scale network latency, or a production load profile. Record the fixture count and host/Cosmos sizing in the test results.

## Supported local evidence and remaining gates

The repository test suite can exercise handlers and repositories through test doubles and stateful in-memory Cosmos-shaped transports; those tests validate application protocol paths, not Cosmos transaction atomicity or the partition/ETag guarantees of a live account. The Node test for the probe uses a loopback HTTP fixture and verifies the request, safeguards, multi-user fixture mapping, and cleanup protocol. It does not prove Cosmos behavior.

The real Cosmos concurrency/load check remains blocked until the prerequisites above are available and the command runs successfully against an explicitly isolated nonproduction database. A 100-user run additionally needs 100 isolated test accounts, session/CSRF pairs, and dedicated seeded lots. Production credentials, production endpoints, and cloud writes are not prerequisites and must not be used.

The Android device smoke remains blocked until a built Capacitor artifact is installed on a supported physical Android device through Play Internal testing (or the accepted internal delivery path), with Google sign-in and test billing configured. The device must run the acceptance cases in [the Android checklist](capacitor-android-internal-test.md); record the artifact version, Play version code, source revision, tester, date, and observed results there. Emulator availability alone does not pass the device/Play acceptance rows, and automated tests do not change their status.
