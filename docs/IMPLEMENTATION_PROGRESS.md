# Lumensia Implementation Progress

## Current Phase
Scene Momentum Recovery HF1 — P0/P0.5 code closure implemented on PR #33; final hosted validation + exact-current-HEAD review pending. **Do not merge yet.**

## Current GitHub State
- Repo: `hoho074566-cpu/lumencia-ac`
- Main at this update: `f6122be5f65a7b0b79555b83c9660eb9ed84cb6c` (`chore: restore standard Lumensia safety workflow`)
- Working branch: `codex/scene-momentum-recovery-hf1`
- PR: #33 `Restore Scene Momentum and narrative compression in V1.5.6`
- Router authority patch commit: `1e23cec5dc4b19ddce2a089f01b8a6e393b45f71`
- Time-floor bounds commit: `b8c5a8bf3556566e85a532e4fe92c09f8423add8`
- Latest code/test commit before this docs update: `e5ac6c50bcfb7046b7754503df8c394817a4ab12`
- PR #33 is protected core/runtime work: manual merge only.

## Completed
### Merged foundation
- PLAYER ACTION COMMIT / CONTINUE reliability / Scene Continuity / monotonic Event Beat progression.
- Merge Readiness + Discord + exact-current-HEAD/current-base safety architecture.
- Guarded low-risk Auto-PR/Auto-Merge V1.2 smoke proof; protected core remains manual merge only.
- V1.5.5 NPC Motivation + Relationship Reason V1 (PR #30 merged).
- V1.5.6 NPC Goal V2 (PR #31 merged).
- characters-v2 32-character / 13-state refresh (PR #32 merged).

### Scene Momentum HF1 implemented on PR #33
- Deterministic `lib/scene-momentum.js`, no additional model calls.
- Semantic intent completion for ordinary movement, travel, exploration, observation, wait/rest and committed consequences.
- Trivial door/corridor/stair/path compression while preserving meaningful player choices.
- State Delta scoring, three-turn stall history, momentum pressure and telemetry.
- NPC initiative / schedule-and-goal-aware world movement guidance.
- Event Director momentum signal with direct-focus/callback/cooldown/location/schedule/NO_EVENT guards preserved.
- Paused event null vs true completion semantics.
- Named unregistered NPC dialogue counts as action; narration does not.
- Persisted delta families contribute to real progress.
- Negated/hypothetical/predicate-anchored intent guards and explicit duration handling.
- Exactly one canonical `coreHandler()` call remains.

### Router P1 closure — `1e23cec5...`
Applied the already-tested patch preserved in PR #33 comment `#5386396220`:
- schedule event `note` retained through schedule compaction;
- NPC schedule `activity` / `commitment` / `confidence` retained through every compaction tier;
- minimum authoritative SAVE_STATE reserved under long (~5000-char) USER ACTION pressure;
- routine routed input remains <=9000 while SAVE_STATE + GM Director + Event Director V2.1 + Schedule + final USER ACTION survive;
- `AFTERMATH_FIXED_FLOW` and `ACTIVE_COMBAT_FIXED_FLOW` precede momentum random-event eligibility.

Hosted validation on `1e23cec5...`:
- Lumensia PR Safety Gate #255: PASS.
- Vercel: PASS.

### Time-floor P1 closure — `b8c5a8bf...`
- Locally forced Scene Momentum elapsed time stops at the next same-day authoritative schedule boundary.
- If a schedule item is already due, no additional local time floor is forced.
- Locally forced floor is capped at canonical one-turn maximum 1440 minutes.
- Positive model-produced `advance_minutes` is never reduced by the post-processor.
- Added permanent `scripts/tests/scene-momentum-time-floor.test.mjs`.

Hosted validation on `b8c5a8bf...`:
- Lumensia PR Safety Gate #256: PASS.
- Vercel: PASS.

### P0.5 correctness closure — `e5ac6c50...`
Implemented narrow fixes for all directly known momentum-accounting correctness findings:
- compound durations such as `1시간 30분 쉰다/기다린다` remain downtime/wait and parse to 90 minutes;
- growth rows with numeric delta `0` do not fake progress;
- one `npc_state_updates` mutation counts once and no longer also fabricates `npcAction`;
- fresh meaningful `choices` satisfy the STOP policy and do not build Scene Stall pressure;
- an echoed identical `pc_status` does not count as danger/state progress; real status changes still do;
- CONTINUE receives a freeze-safe Scene Momentum replacement (`CONTINUE HARD FREEZE`) instead of change/stall pressure, so same-moment CONTINUE cannot be told to create world state changes.
- Added permanent `scripts/tests/scene-momentum-correctness.test.mjs`.

## In Progress
Final validation cycle for the docs-updated exact HEAD:
1. hosted Safety Gate;
2. Vercel preview;
3. fresh exact-current-HEAD/current-base Codex review;
4. direct inspection of current, non-outdated review threads.

Do **not** use a stale sticky `Lumensia Merge Readiness` result as authority if it conflicts with direct current review threads.

## Remaining
### P0 — before PR #33 merge
1. Commit this progress/handover refresh with the completed code.
2. Verify hosted Safety + Vercel on the resulting exact HEAD.
3. Request a fresh Codex review bound to the resulting exact HEAD and actual current main.
4. Require direct current P0/P1 = 0. P2/P3 remain non-blocking by policy, but any newly discovered correctness regression should be considered deliberately rather than ignored blindly.
5. Immediately before merge refetch:
   - PR exact HEAD;
   - current `main`;
   - compare `main...exact HEAD`.
6. Require:
   - `base_commit.sha == current main`;
   - `merge_base_commit.sha == current main`;
   - behind = 0;
   - mergeable / no conflict;
   - Safety PASS;
   - Vercel PASS;
   - exact-current-HEAD Codex P0/P1=0.
7. Manual merge only, guarded by `expected_head_sha`.
8. Verify merged main, Vercel production and `/api/health` markers.

### P1 — immediately after HF1 merge
Do not restart HF1 diagnosis. Continue with:
- live-play acceptance for original problematic inputs (`본다 / 돌아다닌다 / 밖으로 간다 / 쉰다`);
- Scene Purpose + explicit Scene Exit Condition;
- stronger Turn Hook;
- Event Consequence chaining across turns;
- NPC Initiative / Goal Tick refinement;
- bounded off-screen progression;
- deterministic novelty/repeated-information suppression if live play still loops.

### P2 — longer Narrative roadmap
- Adaptive Time Scale V2
- Consequence Queue / Lifetime
- Active Threads
- Reputation / faction-social propagation
- Setup → Payoff memory
- NPC significance / relationship thresholds / knowledge boundaries
- NPC-vs-NPC conflict
- Fail Forward
- Off-screen World Progression expansion
- Multi-System Scene orchestration
- Memory Hierarchy
- novelty/repetition scoring
- Report-style narration → scene-driven novel prose recovery

Future gameplay roadmap already discussed but not DONE:
- NPC↔NPC Relationship V1
- Faction / Social Consequence V1
- Skill Learning V1
- Awakening / Talent Evolution V1
- Combat Growth V2
- Living World / Event Director V3 / Long-term Consequence

## Blocked
No known code-implementation blocker is currently known after `e5ac6c50...`.

Merge remains intentionally blocked until the final exact-HEAD hosted gates and direct review are clean.

Known infrastructure warning:
- Earlier sticky Merge Readiness state incorrectly disagreed with direct unresolved review threads on previous HEADs.
- Therefore direct current review evidence outranks sticky READY.
- Do not weaken review-cycle/current-base safeguards to obtain green status.

## Tests / Evidence
- `1e23cec5...`: Safety #255 PASS, Vercel PASS.
- `b8c5a8bf...`: Safety #256 PASS, Vercel PASS.
- `scripts/tests/context-router-authority-tail.test.mjs` permanently covers 9k authority retention and fixed-flow ordering.
- `scripts/tests/context-router.test.mjs` permanently covers router behavior including bounded long actions.
- `scripts/tests/scene-momentum-time-floor.test.mjs` permanently covers schedule-boundary/1440/model-positive/due-event time floor behavior.
- `scripts/tests/scene-momentum-correctness.test.mjs` permanently covers compound duration, no-op growth, NPC dedupe, meaningful-choice STOP, PC status comparison and CONTINUE freeze.
- Existing A–F acceptance, intent guards, paused-event, integration, Goal V2, event progression, continuation, core invariant, asset/debug, migration and automation tests remain in the deterministic Safety suite.

## DO NOT BREAK
- one canonical model call per normal turn;
- stable `/api/chat-router` → `api/chat.js` architecture;
- `store:false`, prompt-cache/24h retention;
- player sovereignty and META freeze;
- completed Event Beats monotonic / CONTINUE no replay;
- schedule/location/knowledge/cooldown/callback/NO_EVENT Director guards;
- AFTERMATH / active combat fixed-flow;
- canon, NPC personality and established relationships;
- `app.js` base `APP_VERSION='1.4.8'` intentional;
- characters-v2 current 32-character / 13-state contract;
- protected core/runtime PR manual merge safety.

## NEXT ACTION
1. Read `docs/LUMENSIA_HANDOVER_CURRENT.md` and this file; do not re-run completed HF1 diagnosis.
2. Refetch current PR #33 exact HEAD and current main.
3. Verify Safety Gate + Vercel on the docs-updated exact HEAD.
4. Request fresh exact-current-HEAD/current-base Codex review.
5. Directly inspect unresolved non-outdated review threads. Sticky READY alone is insufficient.
6. If true current P0/P1=0, perform final current-main/merge-base/behind/conflict revalidation and manual `expected_head_sha` merge.
7. Verify production/main/health.
8. Continue directly into **Scene Purpose / Turn Hook / Event Consequence**.
