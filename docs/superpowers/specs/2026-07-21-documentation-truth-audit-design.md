# Documentation Truth Audit Design

**Date:** 2026-07-21  
**Status:** Approved

## Goal

Make repository documentation accurately describe the current Calcul8 product, architecture, development workflows, deployment boundaries, and remaining work without erasing historical design context.

## Documentation Roles

Documentation is authoritative only within its assigned role:

- `README.md`, package READMEs, `SECURITY.md`, and operational guides describe current setup, commands, runtime behavior, deployment, and security practices.
- `docs/product-roadmap.md` and `docs/product/features/*.md` describe product status and future product work. They distinguish shipped, partially shipped, and planned capabilities.
- `docs/refactorplan.md` contains only active technical, reliability, security, and test-maintenance debt. Completed or code-invalidated findings are removed.
- `docs/c4` describes the current architecture and accepted architecture decisions. It does not contain speculative product-roadmap content.
- `docs/superpowers/specs` and `docs/superpowers/plans` preserve historical intent and implementation instructions. Completed artifacts receive lifecycle metadata, but their original bodies are not rewritten as current documentation.

## Audit Method

Every material current-state claim must be checked against at least one live repository source:

- package scripts and dependency manifests for commands and tool versions;
- registered frontend, API, and realtime routes for endpoint documentation;
- config helpers and example environment files for environment variables;
- production source plus focused tests for shipped behavior;
- workflows and release scripts for CI/CD and release instructions;
- C4 DSL and accepted decision records for architecture claims.

Documentation is corrected when code disproves it. Missing implementation is recorded as planned work rather than described as shipped. Historical plans do not override current code or current-facing documentation.

## Current-Facing Cleanup

The audit covers:

- root, API, realtime, and CardSync READMEs;
- `SECURITY.md`;
- coding, Google Play release, visual QA, and repository-organization guides;
- the technical refactor backlog;
- the product roadmap and feature detail files;
- C4 overview, conventions, model documentation, decision map, technical-debt model, and component/container descriptions.

The cleanup should consolidate duplicated explanations through links where practical, but it must not introduce a large documentation-site reorganization. Existing stable paths remain valid.

## Historical Artifact Policy

Completed specs and implementation plans remain intact. Add a compact banner near the title containing:

- lifecycle state: `Historical — implemented`, `Historical — superseded`, or `Active`;
- completion date when known;
- implementation commit or replacement document when reliably discoverable;
- a statement that current behavior is documented by the current-facing docs and code.

Do not mark an artifact implemented merely because its date is old. Verify its acceptance criteria against code/tests or commits first. If status cannot be proven, label it `Historical — status not fully verified`.

## Known Corrections

- The AppContext migration is complete and must not remain active debt.
- Normal `session-preferred` frontend API calls already omit bearer headers, unsafe cookie-authenticated requests receive CSRF headers, and legacy persisted auth keys are removed during hydration. The corresponding refactor-plan item is stale and should be removed; explicit sign-in bootstrap and provider purchase verification remain intentional bearer-required boundaries.
- Shared test-fixture and UI harness standardization remains active test-maintenance work.
- Cross-document Whatnot confirmation and workspace owner-membership recovery are implemented and should be described as current reliability architecture, not planned work.
- Buyer identity CRM is shipped; roadmap and historical artifacts must not describe it as merely proposed.
- The feature-scoped frontend context architecture is current and should be reflected consistently in C4 and engineering guidance.

## Verification

Before completion:

- validate every changed command against `package.json` or the owning package manifest;
- validate referenced repository paths and internal Markdown links;
- compare documented API/realtime routes and config keys with current registrations/helpers;
- scan current-facing docs for stale planning language and historical docs for missing lifecycle banners;
- run `git diff --check`;
- run `npm run docs:c4:validate` when Docker is available, reporting Docker unavailability as an environment limitation;
- run focused tests only if documentation changes reveal and require a code correction. This task is documentation-only unless the audit finds a small, directly related correctness defect.

## Completion Criteria

- A new contributor can find the correct setup, verification, architecture, security, and release guidance without following obsolete commands.
- Product documentation clearly separates shipped, partial, and planned capabilities.
- The refactor plan contains no completed or code-invalidated work.
- C4 descriptions match the implemented system boundaries.
- Historical specs and plans retain their content and have truthful lifecycle metadata.
- All internal links and referenced files resolve, and documentation validation is clean apart from explicitly reported environment constraints.
