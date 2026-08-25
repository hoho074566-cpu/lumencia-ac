# Lumensia Project Rules

These rules apply to the entire repository and must be followed whenever Codex modifies it.

## Current Versions

- Stable app: `1.5.4`
- External API adapter: `0.8.6`
- Canonical core server: `0.5.6`

## Stable Architecture

- Frontend load path: `index.html` -> `app-runtime.js` -> `app.js`
- Frontend API endpoint: `/api/chat-router`
- `api/chat-router.js` wraps `api/chat.js`.
- `api/lib/context-router.js` performs context routing.
- `api/health.js` reports the deployed architecture and versions.

## Critical Preservation Rules

- `app.js` is the proven canonical frontend core. Do not rewrite or replace it unless explicitly requested.
- `api/chat.js` is the proven canonical server core. Do not rewrite or replace it unless explicitly requested.
- `app-runtime.js`, `api/chat-router.js`, and `api/lib/context-router.js` are the current V1.5.4 stabilization layers.
- Preserve all existing CANON, memory, schedule, Event Director, NPC state, relationship, combat, meta freeze, and structured-output behavior unless the task explicitly changes it.
- Preserve one canonical OpenAI model call per normal turn unless explicitly requested otherwise.
- Preserve `store: false` and prompt-cache behavior.

## Stable Filename Policy

- Never create versioned runtime or API files such as `app-v155-loader.js`, `chat-v155.js`, `chat-v156.js`, or `context-router-v155.js`.
- Future releases must update the contents of the stable filenames instead.
- Do not reintroduce obsolete versioned files.

## Vercel Constraints

- This project uses the Vercel Hobby plan.
- Keep the number of files under `api/` that Vercel may interpret as Serverless Functions below the Hobby limit.
- If future modularization is required, prefer moving reusable internal modules outside `api/`.
- Do not add unnecessary API entrypoints.

## Context Router

- Preserve the current V1.5.4 HF1-derived budgets unless explicitly requested:
  - `continue`: 11k target / 14k soft maximum
  - `routine`: 17k / 20k
  - `scheduled`: 18k / 20k
  - `important`: 20k / 23k
  - `critical`: 24k / 30k
- Never expose L5 or secret canon broadly.
- Prefer relevant-context selection over sending the full CANON.

## Change Safety

- Before editing, inspect all affected imports and call sites.
- Make the smallest compatible change.
- Do not silently delete files.
- Do not change unrelated files.
- Run syntax and static checks appropriate to the changed files.
- Show `git diff --stat` and `git status` after changes.
- Commit changes to the Codex work branch.
- Never merge directly into `main`.
- Prefer one logically focused pull request per change.

## PR Self-Review

Before presenting an implementation as complete, Codex must:

- Inspect the final Git diff.
- Perform a second self-review focused on regressions and scope creep.
- Run `scripts/lumensia-pr-check.mjs` when it is available.

## Implementation Completion Protocol

Every implementation task must:

- Inspect the final diff against the best available base.
- Run `scripts/lumensia-pr-check.mjs`, syntax/static checks for changed files, and relevant repository-owned deterministic tests.
- Perform a SECOND self-review for regressions, scope creep, regex/classifier edge cases, architecture invariants, and stale or unrelated files. This review may be brief for LOW-risk work, but must be substantive for MEDIUM/HIGH-risk work.
- Fix blockers within the focused task and branch, then rerun tests and review. Codex-local implementation work allows at most two automatic fix/review iterations; if blockers remain, report `FAIL` and stop. The repository-owned trusted V1.2 Auto-PR controller is a separate automation path and may request at most five current-head P0/P1 remediation attempts before requiring a person.
- Treat hosted GitHub Safety Gate and Vercel results as authoritative for hosted PR/base integration. Local inability to resolve `remote/main` alone is not a blocker when those hosted checks are available and green.
- Report the highest applicable risk: LOW for docs or non-core presentation-only changes; MEDIUM for `api/chat.js`, context routing, prompts, Event Director, NPC behavior, combat, runtime synthesis, or ordinary persistence; HIGH for schema/save migration, auth/security, automatic-merge/workflow security, major API/core rewrites, large cross-cutting refactors, or save-corruption risk.
- Codex task environments must never merge directly into `main` and must never bypass hosted checks.
- Exception: the repository-owned trusted V1.2 Auto-PR controller may auto-merge only when every condition below is true:
  - the PR was created by Lumensia Auto-PR and contains the trusted Auto-PR marker;
  - the same-repository head branch is `codex/*` and is not opted out with `-no-pr`;
  - the exact current HEAD/base review cycle is authoritative and Codex P0/P1 is zero;
  - GitHub Safety Gate, Vercel, and every configured required check are passing;
  - GitHub reports the PR mergeable and current, with no conflict or behind/blocked state;
  - no protected path is changed;
  - the final decision is revalidated immediately before the merge mutation.
- Protected-path PRs must remain human-merge only. Protected paths include `api/**`, canonical runtime entry files, CANON/canonical files, save/schema/migration/persistence/auth/security files, dependency/deployment configuration, `AGENTS.md`, `.github/**`, and Lumensia automation/safety controller scripts.
- P2/P3 remain non-blocking. A failed authoritative check, a protected path, five exhausted P0/P1 fix attempts, a stalled fix request, missing merge capability, or a rejected merge must stop automation and require a person.

Always end the implementation report with:

```text
MERGE_GATE: PASS | FAIL
RISK: LOW | MEDIUM | HIGH
CHANGED_FILES:
TESTS:
ARCHITECTURE:
REGRESSION_REVIEW:
BLOCKERS:
CI_EXPECTATION:
MERGE_RECOMMENDATION:
REPOSITORY_INTEGRITY:
```

## Large Refactors

- Before a large refactor, produce an analysis and plan without modifying files.
- Preserve behavior before improving architecture.
- Do not combine a structural refactor with gameplay or AI behavior changes in the same pull request.
