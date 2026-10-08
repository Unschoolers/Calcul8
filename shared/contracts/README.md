# Shared runtime contracts

The six TypeScript modules here own the runtime implementations and public types.
Keep normalization changes in these sources, then run `npm run shared:generate`
and commit the generated artifacts. Do not hand-edit the `.mjs`, `.cjs` or
`.d.*` compatibility entry points in `shared/` or `apps/api/src/shared/`.

`scripts/generate-shared-contracts.mjs` strictly checks these sources and uses
TypeScript to emit ESM, CommonJS and declarations with deterministic line endings.
`npm run shared:check` compares all outputs without writing files and fails on
missing or stale artifacts. Web verification/builds and API builds run this check.
The script supports API-only dependency installations used by deployment CI.

Root declaration aliases retain the existing extensionless, ESM and CommonJS
imports, including strict NodeNext consumers. The API has generated local
CommonJS implementations and declarations so its compiled deployment needs no
runtime files from the root frontend tree. Root `.ts` Shopify modules already
forward to typed API owners and remain unchanged.
