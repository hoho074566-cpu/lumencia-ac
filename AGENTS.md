# Lumensia Project Rules

These rules apply to the entire repository and must be followed whenever Codex modifies it.

## Current Versions

- Stable app: `1.5.4`
- External API adapter: `0.8.0`
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

## Large Refactors

- Before a large refactor, produce an analysis and plan without modifying files.
- Preserve behavior before improving architecture.
- Do not combine a structural refactor with gameplay or AI behavior changes in the same pull request.
