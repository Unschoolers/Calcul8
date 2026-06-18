# Decision Map

The ADRs attached to the Calcul8 software system are split into two groups.

## Accepted Decisions

- Use Structurizr local for private architecture docs.
- Keep realtime single-replica until a shared backplane exists.
- Keep browser workflows local-first.
- Keep personal and workspace state explicitly scoped.
- Use session-first provider-neutral auth.
- Derive access from provider entitlement facts.
- Recover from realtime delivery gaps.
- Verify all shipping entry points before release.
- Require bilingual user-facing UI.
- Keep one mobile-first app shell and responsive UI contract.
- Keep forecasts separate from recorded sales facts.
- Adopt frontend utility libraries through shared wrappers.

## Proposed Target Decisions

These decisions describe the direction needed to close active critical or high-risk refactor items:

- Finish removing bearer-token fallback from authenticated API flows.
- Make cross-document writes recoverable and idempotent.
- Use optimistic concurrency for cloud-authoritative writes.
- Treat Whatnot OAuth credentials as erasable personal secrets.
- Standardize raw test fixtures behind shared builders.

Use `docs/refactorplan.md` as the implementation backlog. Use this decision map to explain why those changes exist architecturally.
