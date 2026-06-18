# 6. Provider-derived access

Date: 2026-05-19

## Status

Accepted

## Context

Calcul8 has multiple entitlement sources, including Google Play purchases and Stripe checkout or subscription events.

The current refactor plan identifies race and ordering risks when provider events overwrite a single access flag or when purchase-token uniqueness is checked with read-before-write behavior.

## Decision

Persist provider-specific entitlement facts and derive the user's effective access from those facts while keeping the legacy entitlement summary as a compatibility projection.

Google Play token claims should use create-only or otherwise atomic ownership records. Stripe webhook processing should record processed event ids and handle duplicate or out-of-order events idempotently.

## Consequences

One provider cannot accidentally revoke access granted by another active provider.

Billing support and audits can explain why a user has access.

The API needs continued coverage as new provider event types are added, but the core duplicate Play token claim, duplicate Stripe event, out-of-order subscription change, and provider-overlap cases are covered.
