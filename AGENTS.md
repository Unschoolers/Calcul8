# Coding agent instructions

## Task checklist

For each coding, review, or release task, create a fresh checklist before implementation from every explicit user requirement and the applicable repository guidance. Keep it concise by grouping related obligations without dropping requirements. Track it in the task plan and carry it forward when resuming; do not reset unfinished work when the user asks for status or adds a correction.

Use `[ ]` for pending work and `[x]` only after verification, with concise evidence such as the changed file, review finding, command/result, or commit/PR link. Mark blocked work `[ ] Blocked: <reason and next step>`. An inapplicable item remains `[ ] N/A: <reason>`; N/A cannot waive an applicable obligation. Never treat a prior claim or a subagent's summary alone as proof.

Create a task-specific copy of the applicable items below; never check off this reusable template:

- [ ] Capture every requested outcome, constraint, and increment; reconcile each with the final result.
- [ ] Read and apply the relevant repository guidance and inspect the existing implementation before changing it.
- [ ] Use economical Luna agents for suitable bounded research or simple implementation when delegation is authorized; a senior agent must validate their work. Record the actual delegation and validation. If a requested model is unavailable, report it rather than silently substituting. If no suitable delegated work exists, explain N/A.
- [ ] Identify the root cause and keep changes scoped; do not hide errors, weaken checks, or silently change established behavior.
- [ ] For behavior bugs, observe a meaningful regression test fail before the fix and pass afterward. Prefer unit/component tests; use browser geometry checks when rendering cannot be verified in JSDOM. Documentation-only work can mark this N/A with its reason; a blocked required test stays blocked.
- [ ] Run targeted checks while iterating, then the verification commands required for the changed areas. Record exact commands, results, and any failures or unverified areas.
- [ ] Review the final diff, validate delegated work, and verify every applicable requirement before claiming completion.
- [ ] Commit and open/update a PR per requested increment when those actions are requested; record the actual commit and PR evidence.

Keep unmet obligations open and report the task as incomplete or partial until they are resolved. Any conflict or unavailable verification must be explicit. Show a short completion checklist with evidence; do not claim all requirements passed because a subset of tests passed. These instructions provide a reviewable workflow, not an automated enforcement gate.

## Repository guidance

- Apply [coding standards](docs/codingstandard.md) to code changes. Prefer maintainable root-cause fixes, reuse existing components/helpers/types, keep strict TypeScript compatibility, validate external boundaries, and preserve scope isolation and safe sync/recovery.
- Consult [repository organization](docs/repo-organization.md) when adding or moving code. Organize by responsibility and keep unrelated moves out of behavior fixes.
- For UI work, apply [visual QA guidance](docs/ui-visual-qa.md), preserve mobile/PWA patterns, use theme-aware styling, and verify the relevant mobile/desktop and light/dark states.
- Before merging, follow the coding standard's verification mapping: web changes require `npm run verify`; API changes require `npm run verify:api`; realtime changes require `npm run verify:realtime`; shared tooling/workflow changes require `npm run verify:all`.
- Documentation-only changes require checking the final diff and referenced paths; application tests are not required unless executable behavior also changes.

Current explicit user instructions control task scope and requested deliverables. Preserve their distinction between a preference and a mandatory requirement; never silently downgrade a mandatory requirement.
