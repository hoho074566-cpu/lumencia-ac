# Lumensia Implementation Progress

## Current Phase
Scene Momentum Recovery HF1 — current-head review blocker closure on PR #33.

## Current GitHub State
- Repo: `hoho074566-cpu/lumencia-ac`
- Main: `f6122be5f65a7b0b79555b83c9660eb9ed84cb6c` (`chore: restore standard Lumensia safety workflow`)
- Working branch: `codex/scene-momentum-recovery-hf1`
- PR: #33 `Restore Scene Momentum and narrative compression in V1.5.6`
- Current PR HEAD at checkpoint start: `247aa37a07f2b2cbbd0511735e34a652bc2d5ae9`
- Compare status: ahead of current main, behind 0; merge-base == current main.

## Completed
- Read and preserved cumulative HANDOVER 1 / 2 / 3 decisions.
- Preserved Auto-PR / Merge Readiness / Safety / Vercel / exact-current-HEAD Codex review infrastructure and stale-run/current-base safety rules.
- Preserved player agency, META freeze, one canonical model call, stable filenames, Event Director hard guards, NPC Goal V2, Relationship Reason V1, and existing normal features.
- Added deterministic Scene Momentum helper `lib/scene-momentum.js`.
- Added semantic intent handling for exterior exit, travel, explore, observe, wait, downtime, generic actions, and decision-sensitive actions.
- Added State Delta scoring and 3-turn Scene Momentum history/stall pressure.
- Wired Scene Momentum into `api/lib/context-router.js` and `api/chat-router.js`.
- Replaced old stable routed `위 행동까지만 처리` micro-step instruction with semantic-intent completion / decision-free intermediate-step compression.
- Added NPC/world AUTO-flow initiative without allowing PC choice automation.
- Added deterministic minimum time floors for compressed low-value intents.
- Added Scene Momentum route/pipeline/health/debug telemetry.
- Added duplicate AUTO/CONTINUE UI suppression in stable runtime.
- Added permanent acceptance A-F and production wiring tests.
- Earlier current-head edge fixes completed/resolved: production wiring P1, magic-department classifier, event-progress null completion, English rest/wait substring false positives, Korean `에` travel particle, outdoor exit route fabrication, object-qualified observation, companion travel target extraction.

## In Progress
Current-head Codex review blocker closure for HEAD `247aa37...`.

## Remaining
### Current blocking findings
1. **P1 — committed consequential/combat actions**: `공격한다` and similar committed actions are currently classified as `decision-sensitive` with `deltaTarget=0`, allowing a stalled committed action to reset stall accounting. Only unresolved deliberation should use zero target.
2. **P1 — canonical State Delta coverage**: real persisted changes such as nonzero `fatigue_delta`, nonzero `gold_delta`, `stat_progress`, `skill_experience`, `skill_learning`, `awakening_progress`, schedule/world-arc/rumor/delayed-consequence changes, and ordinary non-goal `npc_state_updates` are not all counted as progress. No-op metadata must still remain non-progress.
3. **P1 — negated downtime**: phrases such as `휴식하지 않고 도서관에 간다` must not classify as downtime or force a 30-minute floor. Negated/hypothetical matches must be excluded before downtime classification.
4. **P2 runtime correctness — time-floor STOP evidence**: `importance=critical` is severity, not proof that player input is required. Time-floor suppression must use explicit decision/choice/stop evidence only.

### Larger Narrative work after HF1 blocker closure
- Validate State Delta per Turn / Scene Exit / Narrative Compression in live play.
- Expand Scene Purpose / Turn Hook / Event Consequence chaining.
- Strengthen NPC Initiative / NPC Goal Tick / off-screen progression.
- Add repeated-information / Scene Memory novelty suppression beyond prompt-only guidance if live tests show need.
- Adaptive Time Scale / Consequence Queue / Active Threads / Setup→Payoff / reputation propagation / NPC significance / knowledge boundary / NPC-vs-NPC conflict / Fail Forward / Multi-System Scene / Memory Hierarchy.
- Continue Report-style → Scene-driven novel prose recovery after engine momentum is stable.

## Blocked
- PR #33 must not merge while current-head P1 findings exist.
- Protected core/runtime change requires Safety PASS + Vercel PASS + exact-current-HEAD Codex P0/P1=0 + no conflict + current-main/merge-base revalidation immediately before manual merge.

## Files Changed on PR #33 at checkpoint start
- `api/chat-router.js`
- `api/health.js`
- `api/lib/context-router.js`
- `app-runtime.js`
- `lib/scene-momentum.js`
- `scripts/tests/npc-motivation-v155.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1.test.mjs`
- `docs/IMPLEMENTATION_PROGRESS.md` (this checkpoint file)

## Tests Passed
- Current HEAD Safety Gate: PASS.
- Current HEAD Vercel: PASS.
- Permanent Scene Momentum acceptance A-F: present and passing under Safety.
- Production wiring test: present and passing under Safety.
- Existing deterministic suite: passed under current Safety Gate before the latest review findings.

## Tests Failed
- None in Safety/Vercel at checkpoint start.
- Current blockers are Codex semantic/runtime review findings, not CI failures.

## Known Issues
- Current-head Codex has 3 unresolved P1 findings and 1 unresolved runtime P2 listed above.
- Do not weaken tests or mark review threads resolved without code + regression coverage.
- Do not modify existing GitHub automation unless a new infrastructure regression is directly proven.
- Do not merge protected changes automatically.

## Last Commit
`247aa37a07f2b2cbbd0511735e34a652bc2d5ae9` — `test: cover Scene Momentum intent and delta edge cases`

## NEXT ACTION
Patch `lib/scene-momentum.js` and `api/chat-router.js` narrowly to close the 3 current P1 findings plus the direct runtime P2, add regression cases to `scripts/tests/scene-momentum-v156-hf1.test.mjs` / integration test, run Safety + Vercel, then request a fresh exact-current-HEAD Codex cycle. Do not merge until P0/P1=0 and final current-main/merge-base revalidation passes.
