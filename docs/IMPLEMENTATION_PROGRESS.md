# Lumensia Implementation Progress

## Current Phase
Scene Momentum Recovery HF1 — all known implementation/review findings closed; final exact-current-HEAD gate pending on PR #33.

## Current GitHub State
- Repo: `hoho074566-cpu/lumencia-ac`
- Main: `f6122be5f65a7b0b79555b83c9660eb9ed84cb6c` (`chore: restore standard Lumensia safety workflow`)
- Working branch: `codex/scene-momentum-recovery-hf1`
- PR: #33 `Restore Scene Momentum and narrative compression in V1.5.6`
- Last production-code HEAD before this progress update: `e64206d5c43de206e01f10cd4c527c3f39998c04`
- That code HEAD passed Safety Gate and Vercel.
- Authoritative current-main / merge-base comparison must be repeated after this progress-only commit and immediately before merge.

## Completed
- Read and preserved cumulative HANDOVER 1 / 2 / 3 decisions and the current Narrative recovery report.
- Preserved Auto-PR / Merge Readiness / Safety / Vercel / exact-current-HEAD Codex review infrastructure and stale-run/current-base safety rules.
- Preserved player agency, META freeze, one canonical model call, stable filenames, Event Director hard guards, NPC Goal V2, Relationship Reason V1, and existing normal functions.
- Added deterministic Scene Momentum helper `lib/scene-momentum.js`.
- Added semantic intent handling for exterior exit, travel, explore, observe, wait, downtime, generic actions, unresolved deliberation, and already-committed consequential actions.
- Added State Delta scoring and 3-turn Scene Momentum history/stall pressure.
- Wired Scene Momentum into `api/lib/context-router.js` and `api/chat-router.js`.
- Replaced old stable routed `위 행동까지만 처리` micro-step instruction with semantic-intent completion / decision-free intermediate-step compression.
- Added NPC/world AUTO-flow initiative without allowing PC choice automation.
- Added deterministic minimum time floors for compressed low-value intents.
- Added Scene Momentum route/pipeline/health/debug telemetry.
- Added duplicate AUTO/CONTINUE UI suppression in stable runtime.
- Added permanent acceptance A-F and production wiring tests.
- Earlier edge fixes completed: production wiring, magic-department classifier, event-progress null completion, English rest/wait substring false positives, Korean `에` travel particle, outdoor exit route fabrication, object-qualified observation, companion travel target extraction.
- Closed P1: committed `공격한다`/consequential actions no longer use zero-delta deliberation target; only unresolved deliberation keeps target 0.
- Closed P1: persisted canonical State Delta counts nonzero fatigue/gold, growth/skill/awakening, schedule/NPC schedule, world arcs/rumors/delayed consequences, relationship milestones, and real ordinary NPC-state mutation; no-op NPC/Goal metadata remains non-progress.
- Closed P1: negated downtime such as `휴식하지 않고 도서관에 간다` falls through to travel; uncommitted `좀 쉴까?` is decision-sensitive and does not trigger downtime/time floor.
- Closed runtime P2: `importance=critical` is no longer treated as player-decision STOP; only explicit choices suppress deterministic Scene Momentum time floors.
- Closed current-head P1: Context Router now reserves a bounded authoritative input tail for `GM EVENT DIRECTOR`, `EVENT DIRECTOR V2.1`, and `SCHEDULE ENGINE`; oversized optional context is clipped first, total profile input budget is preserved, and schedule payload is structurally compacted as valid JSON.
- Closed current-head P1: negated exterior movement (`밖으로 나가지 않는다`, `밖에 안 나간다`) no longer becomes `exit-exterior`; unresolved exterior deliberation (`밖으로 나갈까?`) is decision-sensitive.
- Closed current-head runtime P2: raw `event_progress:null` for a still-active scheduled/resumable occurrence is recognized as pause/archive and does not fake Event Progress; actual completion still counts.
- Closed current-head runtime P2: named unregistered minor-NPC dialogue (`speaker_key=null`, non-empty `speaker_name`) counts as NPC action, while narration does not.
- Added `scripts/tests/context-router-authority-tail.test.mjs` to prove a 9k routine input preserves all authoritative tail markers and schedule sentinel under 20k+ optional context pressure.
- Added `scripts/tests/scene-momentum-paused-event.test.mjs` for scheduled pause, resumable pause, true completion, and explicit completion.
- Extended Scene Momentum acceptance tests for exterior negation/deliberation and minor-NPC initiative.

## In Progress
Final progress-file HEAD validation and exact-current-HEAD Codex review cycle for PR #33.

## Remaining
### HF1 merge gate
1. Verify Safety Gate and Vercel on the progress-file HEAD.
2. Create a fresh exact-current-HEAD Codex review request against the actual current main SHA.
3. Fix any new current-head P0/P1 findings; do not reuse prior-head review results.
4. Require Merge Readiness READY, no conflicts, Safety PASS, Vercel PASS, current P0/P1=0.
5. Immediately before merge, refetch PR HEAD and current main, compare main...HEAD, require `base_commit.sha == current main`, `merge_base_commit.sha == current main`, and behind=0.
6. Manual merge with `expected_head_sha`; never auto-merge this protected core/runtime PR.
7. Verify merged main Vercel and update this progress file on main.

### Larger Narrative work after HF1 merge
- Live-play validation of State Delta per Turn / Scene Exit / Narrative Compression using the original screenshots/acceptance scenarios.
- Next implementation phase: Scene Purpose / Turn Hook / Event Consequence chaining.
- Strengthen NPC Initiative / NPC Goal Tick / off-screen progression.
- Add repeated-information / Scene Memory novelty suppression beyond prompt-only guidance if live tests show need.
- Adaptive Time Scale / Consequence Queue / Active Threads / Setup→Payoff / reputation propagation / NPC significance / knowledge boundary / NPC-vs-NPC conflict / Fail Forward / Multi-System Scene / Memory Hierarchy.
- Continue Report-style → Scene-driven novel prose recovery after engine momentum is stable.

## Blocked
- No known implementation blocker remains on code HEAD `e64206d...`.
- Merge remains intentionally blocked until the protected-path gate completes on the exact progress-file HEAD.

## Files Changed on PR #33
- `api/chat-router.js`
- `api/health.js`
- `api/lib/context-router.js`
- `app-runtime.js`
- `lib/scene-momentum.js`
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/npc-motivation-v155.test.mjs`
- `scripts/tests/scene-momentum-paused-event.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1.test.mjs`
- `docs/IMPLEMENTATION_PROGRESS.md`

## Tests Passed
- Code HEAD `e64206d5c43de206e01f10cd4c527c3f39998c04`: Safety Gate PASS.
- Code HEAD `e64206d5c43de206e01f10cd4c527c3f39998c04`: Vercel PASS.
- Context Router authority-tail reservation test PASS.
- Context Router existing regression suite PASS.
- Scene Momentum paused-event semantics test PASS.
- Scene Momentum production wiring / one-core-call / explicit-stop-evidence test PASS.
- Scene Momentum acceptance A-F + committed-action/negation/full-delta/minor-NPC edge cases PASS.
- Existing event, Goal V2, continuation, asset, debug, automation, readiness, migration, and core invariant deterministic suites PASS under Safety.

## Tests Failed
- Intermediate HEAD `c037531...` intentionally exposed unfixed `critical` STOP evidence and `쉴까?` deliberation; both fixed.
- Intermediate HEAD `a3de01c...` had one failure: `밖으로 나갈까?` was safe but classified generic instead of decision-sensitive. Root cause was Korean conjugation (`나-갈까`, not literal `나가`); classifier was fixed and code HEAD `e64206d...` passed Safety.
- No known test failure remains on code HEAD `e64206d...`.

## Known Issues
- Current Narrative program is not finished after HF1; the larger remaining list above is still active.
- Do not modify existing GitHub automation unless a new infrastructure regression is directly proven.
- Do not merge protected changes automatically.
- Do not resolve future current-head review findings by weakening State Delta, authority-tail, event pause, or player-agency tests.

## Last Commit
`e64206d5c43de206e01f10cd4c527c3f39998c04` — `fix: classify exterior deliberation before compression`

## NEXT ACTION
After this progress-only commit changes the branch HEAD, verify Safety Gate PASS and Vercel PASS on that exact HEAD. Fetch the actual current main SHA, then request a fresh exact-current-HEAD Codex review bound to that head/base occurrence. If current P0/P1=0 and Merge Readiness is READY, immediately revalidate PR HEAD/main/merge-base/behind status and manually merge PR #33 using `expected_head_sha`. Verify main Vercel, update this file on main, then continue to the next unfinished Narrative phase: Scene Purpose / Turn Hook / Event Consequence.
