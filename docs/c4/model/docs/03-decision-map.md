# Decision Map

The ADRs attached to the Calcul8 software system are split into two groups.

## Accepted Decisions

- Use Structurizr local for private architecture docs.
- Keep realtime single-replica until a shared backplane exists.
- Keep browser workflows local-first.
- Keep personal and workspace state explicitly scoped.
- Use session-first provider-neutral auth.
- Derive access from provider entitlement facts.

## Proposed Target Decisions

These decisions describe the direction needed to close active critical or high-risk refactor items:

- Use optimistic concurrency for cloud-authoritative writes.
- Treat Whatnot OAuth credentials as erasable personal secrets.
- Recover from realtime delivery gaps.
- Verify all shipping entry points before release.

Use `docs/refactorplan.md` as the implementation backlog. Use this decision map to explain why those changes exist architecturally.
