# Shared Whatnot import contracts

## Intent

Make CSV and OAuth imports converge on one normalized candidate and one review-decision vocabulary across web and API. This prepares payout reconciliation and future import changes without changing the seller's current import flow, storage documents, or existing sales.

## Boundary

Use the repository's existing `shared/` module convention to expose small pure runtime validators/normalizers and TypeScript declarations to both builds. A candidate contains the provider transaction identity, title, buyer, quantities, money, date/status, and optional listing metadata already represented by `WhatnotNormalizedImportRowInput`. The shared decision model contains the action, target kind, lot/sale target, sale type, packs count, and skip flag. Keep CSV column/date parsing and aliases in the browser; keep OAuth HTTP, credentials, leases, Cosmos writes, and confirmation recovery in the API. The API remains authoritative for authorization, duplicate matching, and persistence.

CSV and OAuth adapters may parse different source formats, but each must pass through the same validated candidate boundary before building a batch row. Existing preview/review response fields and legacy inputs remain compatible. Move duplicated unions and pure decision normalization to shared code; use imports or aliases from the web/API types. Preserve the current intentional difference between the broad persisted `WhatnotMappedSaleType` union (including `wheel`) and confirmation's accepted `pack | box | rtyh` values.

## Failure behavior

Reject malformed incoming candidates at the API boundary with an actionable 400 response; retain the existing import defaults for omitted optional values. Do not silently reinterpret an invalid explicit decision into a different seller action. Preserve stable external transaction keys and confirmation fingerprints for valid existing requests, so retried batches remain idempotent. No database migration or change to seller-authored sale memo content.

## Verification

Cross-source contract tests cover identical normalized candidate shape for equivalent CSV/OAuth data, required identity, optional fields, money/quantity/date defaults, and invalid values. Confirmation tests pin valid fingerprint and decision behavior, especially `split_group`, `skip`, manual candidate, and stale retries. Run web and API typechecks, focused tests, and `npm run verify:all`. Review the diff for accidental changes to batch document shape and external references.
