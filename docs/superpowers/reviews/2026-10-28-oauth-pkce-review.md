# Independent senior review

Reviewed base `1144ede2f505763f96c750aebc092fac1b758d68` to head `81da9744c05f878aa2ace9bf710abea9ed264338`, the complete review diff, frozen capsule, implementation report, production script, supplemental tests and protected oracle. This is a read-only code review apart from this report. Full API, CI and security gates are coordinator-owned and are not asserted here.

## Verdicts

- **Spec: changes requested.** The callback contract forbids fragments, but a callback with an empty fragment reaches the token endpoint. The runner also ends the attempt on a malformed request that has the matching state and issuer but no usable authorization response.
- **Quality/security: changes requested for the callback boundaries below.** No critical finding. The design otherwise pins endpoints and client, keeps the verifier private, uses S256, validates state and issuer before exchange, consumes accepted callbacks synchronously, verifies signature and specified claims with `jose`, caps streamed bodies and request time, and emits fixed redacted output. The final cancellation change propagates abort into in-flight network operations and guards against late success; the production-runner tests exercise cancellation and mocked deadline. No live human login has been demonstrated.

## Findings

### Important — empty fragment passes validation and triggers token exchange

`apps/api/scripts/check-external-oauth-login.mjs:65` checks `callback.hash`, but WHATWG URL gives an empty string for both no fragment and a present empty `#`. A targeted local witness constructed a correct state/issuer/code callback, appended `#`, and called `finish` with a stub fetch. The stub was called once. The capsule requires no fragment and rejection of unsafe callback URLs before exchange. The existing fragment tests use only a nonempty fragment. Reject the fragment delimiter itself, including the empty form, and add a pre-network regression.

Impact is bounded: the matching state and issuer and eventual PKCE and signed-ID-token validation still apply; this is not evidence of an authentication bypass.

### Important — malformed matching query terminates the listener before valid completion

`apps/api/scripts/check-external-oauth-login.mjs:115-129` checks only state and issuer before setting `done`; a request with those values and no code/error, or duplicate code, passes the runner precheck. `finish` rejects it synchronously before setting its own `consumed` flag at lines 63–71, but the runner catches that rejection and calls `shutdown`, so a subsequent correct callback cannot complete. This conflicts with the capsule requirement that irrelevant requests not consume the attempt. Validate the complete callback envelope before reserving the runner's one valid attempt, while preserving synchronous reservation for valid code/denial and never reopening after exchange failure. Add a real-runner test that sends such a malformed request, then a valid signed callback, and checks that the latter succeeds with one exchange.

## Evidence and limits

- Protected oracle SHA-256 independently checked: `de552ddd7e40ea49d55dade0d51a9fc97f8dacb4c357f3b0175ec3f135e4fd87`.
- Ran only the targeted empty-fragment witness; it reported `networkCalls: 1`. No full gate or full supplemental suite was duplicated.
- The supplemental suite covers real in-process production listener success, cancellation during a stalled exchange, simulated deadline, CLI denial/SIGINT, replay/concurrent exchange, network timeout, oversized body and invalid signed tokens. It does not cover the two callback boundaries above. Its real-provider human login is explicitly unverified; signed test keys and a stub provider are appropriate for deterministic tests but are not evidence of live issuer success.
- No API routes, grants, cookie/session integration, refresh support, new runtime dependency, service, or persistent token storage appeared in the reviewed diff.

## Scoped re-review — head `828567fb483310537ca374c37ed7f2cd0f6ba617`

**Both findings are resolved; no Critical or Important findings remain in this scoped re-review.** The previous changes-requested verdict is superseded for these findings. This is not a new review of unrelated code and does not assert the coordinator's broader gates or a live login.

- The shared parser at `apps/api/scripts/check-external-oauth-login.mjs:51-60` rejects any literal fragment delimiter before parsing or network access. I independently ran a direct witness of the original empty-fragment case; it rejected with zero fetch calls.
- The listener at `apps/api/scripts/check-external-oauth-login.mjs:119-125` runs the same complete parser before setting `done`, so absent or duplicate code fails without shutting down the listener. The new real-runner regression at `apps/api/test/oauth-login.test.mjs:267` sends both malformed matching requests, asserts no provider calls, then completes a signed valid callback and checks closure. I inspected this regression; I did not rerun it while the coordinator's gates could occupy the fixed port.
- Single-use and cancellation remain intact: listener `done` and attempt `consumed` are each set synchronously before the first await; `shutdown` aborts the lifetime and the success handler checks `stopped`. My direct witness sent an empty fragment, started one stalled exchange, attempted concurrent completion, aborted, and attempted completion again: zero calls for the fragment and exactly one call overall, with all invalid, concurrent, aborted and repeated completions rejected.
- The protected oracle SHA-256 remains `de552ddd7e40ea49d55dade0d51a9fc97f8dacb4c357f3b0175ec3f135e4fd87`. No full gates were run in this scoped re-review.
