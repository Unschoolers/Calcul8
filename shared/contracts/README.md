# Shared runtime contracts

The six TypeScript modules here own the runtime implementations and public types.
Keep normalization changes in these sources, then run `npm run shared:generate`
and commit the generated artifacts. Do not hand-edit the `.mjs`, `.cjs` or
`.d.*` compatibility entry points in `shared/` or `apps/api/src/shared/`.

`scripts/generate-shared-contracts.mjs` strictly checks these sources and uses
TypeScript to emit ESM, CommonJS and declarations with deterministic line endings.
`npm run shared:check` compares all outputs without writing files and fails on
missing or stale artifacts. Web verification/builds, API builds and full-checkout
realtime builds run this check. The script supports API-only and realtime-only
dependency installations used by deployment CI.

Root declaration aliases retain the existing extensionless, ESM and CommonJS
imports, including strict NodeNext consumers. The API has generated local
CommonJS implementations and declarations so its compiled deployment needs no
runtime files from the root frontend tree. The API scope adapter preserves its
unknown-input conversion before delegating key construction. Realtime room imports
also delegate to generated local CommonJS artifacts. Its isolated Docker context
uses `build:runtime` to compile the checked-in files after full-checkout deployment
CI verifies freshness; generation and normal builds never silently skip checks.
Root `.ts` Shopify modules already
forward to typed API owners and remain unchanged.
