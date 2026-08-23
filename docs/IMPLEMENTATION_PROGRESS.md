# Lumensia Implementation Progress

## Current Phase
Scene Momentum Recovery HF1 — all known implementation P0/P1 findings fixed through current code HEAD; final docs-updated exact-HEAD Safety/Vercel/Codex review + manual merge gate pending. **Do not merge yet.**

## Current GitHub State
- Repo: `hoho074566-cpu/lumencia-ac`
- Main: `f6122be5f65a7b0b79555b83c9660eb9ed84cb6c` (`chore: restore standard Lumensia safety workflow`)
- Working branch: `codex/scene-momentum-recovery-hf1`
- PR: #33 `Restore Scene Momentum and narrative compression in V1.5.6`
- Protected core/runtime PR: manual merge only.
- Router authority fix: `1e23cec5dc4b19ddce2a089f01b8a6e393b45f71`
- Initial time-floor fix: `b8c5a8bf3556566e85a532e4fe92c09f8423add8`
- Momentum correctness fix: `e5ac6c50bcfb7046b7754503df8c394817a4ab12`
- Full-authoritative-schedule + timed-predicate fix: `7e953b5c6158a7bb51e6c5d80b5da0bbdc024f8a`
- Latest code/test commit before this docs update: `f5a64452d1dcd671cafa30ab033bb05e13308e2b` (`fix: guard question-form compressed intents`)
- This docs update will create a newer docs-only exact HEAD; all final gates/reviews must bind to that resulting SHA.

## Completed
### Merged foundation
- PLAYER ACTION COMMIT.
- CONTINUE reliability / monotonic Event Beat progression.
- Scene Continuity.
- Merge Readiness / Discord + exact-current-HEAD/current-base safety architecture.
- Guarded low-risk Auto-PR/Auto-Merge V1.2 smoke proof; protected core remains manual merge only.
- V1.5.5 NPC Motivation + Relationship Reason V1 (PR #30 merged).
- V1.5.6 NPC Goal V2 (PR #31 merged).
- characters-v2 32-character / 13-state refresh (PR #32 merged).

### Scene Momentum Recovery HF1 implemented on PR #33
- Deterministic `lib/scene-momentum.js`; no additional model calls.
- Semantic intent completion and decision-free intermediate-step compression.
- State Delta scoring + 3-turn stall/momentum history.
- Scene Change > repeated Scene Description guidance.
- NPC initiative / goal-aware world action without stealing PC agency.
- Event Director momentum pressure while preserving direct-focus/callback/cooldown/location/schedule/present-participant/NO_EVENT guards.
- Explicit meaningful STOP policy; trivial doors/corridors/stairs/path traversal do not require repeated prompts.
- Pause/archive event null vs actual completion semantics.
- Named unregistered minor-NPC dialogue counts as NPC action; narration does not.
- Exactly one canonical `coreHandler()` call invariant retained.

### Router authority P1 closure — `1e23cec5...`
Applied the already-tested patch preserved in PR #33 comment `#5386396220`:
- preserve schedule event `note`;
- preserve NPC schedule `activity` / `commitment` / `confidence` through all compaction tiers;
- reserve bounded minimum authoritative SAVE_STATE under ~5000-char USER ACTION pressure;
- routine input stays <=9000 while SAVE_STATE + GM Director + Event Director V2.1 + Schedule + final USER ACTION survive;
- `AFTERMATH_FIXED_FLOW` and `ACTIVE_COMBAT_FIXED_FLOW` precede momentum random-event selection.

Hosted:
- Safety #255 PASS.
- Vercel PASS.

### Deterministic local time-floor closure — `b8c5a8bf...`
- forced floor stops at the nearest `scheduleContext.upcoming` boundary;
- already-due schedule suppresses forced floor;
- forced floor capped at canonical one-turn maximum 1440 minutes;
- positive model-produced `advance_minutes` is never reduced;
- permanent `scripts/tests/scene-momentum-time-floor.test.mjs`.

Hosted:
- Safety #256 PASS.
- Vercel PASS.

### Momentum correctness closure — `e5ac6c50...`
- compound `1시간 30분 쉰다/기다린다` supported as 90 minutes;
- growth rows with numeric delta `0` do not fake progress;
- one `npc_state_updates` mutation counts once and does not also fabricate `npcAction`;
- fresh meaningful choices satisfy STOP policy and do not build false Scene Stall pressure;
- identical echoed `pc_status` is not progress; real change remains progress;
- CONTINUE receives explicit `CONTINUE HARD FREEZE` Scene Momentum replacement with no state-change/stall pressure;
- permanent `scripts/tests/scene-momentum-correctness.test.mjs`.

### Fresh direct-review P1/P2 closure — `7e953b5c...`
Fresh exact-head review discovered two additional correctness issues after the earlier docs snapshot:
1. **P1 full schedule boundary:** `scheduleContext.upcoming` only contains same-day events within ~4 hours, so a long rest could cross a later authoritative `scheduledEvents` entry.
2. **P2 historical duration:** `10분 전에 본 게시판을 확인한다` could incorrectly parse `10분` as the committed action duration.

Fixed:
- `api/chat-router.js::nextScheduleBoundaryMinutes()` now examines authoritative `saveState.scheduledEvents` plus routed `scheduleContext.upcoming` using absolute date/time minutes;
- completed/cancelled schedule rows are ignored;
- overdue unfinished authoritative schedule yields boundary 0;
- later same-day and next-day schedule boundaries cap locally forced elapsed time;
- positive model-produced advance is still never reduced;
- explicit duration parsing is now restricted to actual committed wait/rest predicates or their timed deliberation forms;
- `10분 전에 본 게시판을 확인한다` remains `observe` with `explicitDurationMinutes:null`;
- permanent tests expanded for full schedule, next-day schedule, terminal schedule rows, overdue schedule and historical-duration observation.

Hosted on `7e953b5c...`:
- Safety #259 PASS.
- Vercel PASS.

### Fresh question-form compressed-action P1 closure — `f5a64452...`
Direct current review also surfaced that question-form compressed inputs such as `도서관에 간다?` could still match travel/observe/explore/wait/downtime regexes and execute.

Fixed:
- question-form inputs that otherwise match compressed exterior/travel/observe/explore/wait/downtime intents are classified `decision-sensitive`;
- compression=false;
- minAdvanceMinutes=0;
- permanent regression coverage includes:
  - `도서관에 간다?`
  - `주변을 살핀다?`
  - `주변을 돌아다닌다?`
  - `10분 기다린다?`
  - `쉰다?`

Current hosted Safety/Vercel for `f5a64452...` must be confirmed before final docs-head review. This file must not assume a PASS until the live run says so.

## In Progress
Final exact-head closure:
1. verify Safety + Vercel on current code HEAD `f5a64452...`;
2. commit this docs/handover refresh;
3. verify Safety + Vercel again on the resulting docs-updated exact HEAD;
4. request fresh exact-current-HEAD/current-main Codex review;
5. directly inspect non-outdated unresolved review threads.

Sticky `Lumensia Merge Readiness` is supplementary only. If it disagrees with direct current review threads, direct evidence wins.

## Remaining
### P0 — before PR #33 merge
1. Confirm `f5a64452...` hosted Safety/Vercel.
2. Commit docs refresh and capture the resulting exact HEAD.
3. Hosted Safety PASS + Vercel PASS on that exact docs HEAD.
4. Fresh Codex review bound to exact docs HEAD + actual current main.
5. Direct current P0/P1 must be 0. Do not reuse prior-head approval.
6. Refetch PR exact HEAD and current `main` immediately before merge.
7. Compare `main...exact HEAD` and require:
   - `base_commit.sha == current main`;
   - `merge_base_commit.sha == current main`;
   - behind=0;
   - no conflict / mergeable;
   - Safety PASS;
   - Vercel PASS;
   - exact-current-HEAD Codex P0/P1=0.
8. Manual merge with `expected_head_sha` only.
9. Verify merged main, Vercel production and `/api/health` markers.

### P1 — immediately after HF1 merge
Do not restart the completed HF1 diagnosis. Continue with:
- live-play acceptance for original problematic inputs (`본다 / 돌아다닌다 / 밖으로 간다 / 쉰다`);
- Scene Purpose + explicit Scene Exit Condition;
- stronger Turn Hook;
- Event Consequence chaining / consequence lifetime;
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

Future gameplay roadmap discussed but not DONE:
- NPC↔NPC Relationship V1
- Faction / Social Consequence V1
- Skill Learning V1
- Awakening / Talent Evolution V1
- Combat Growth V2
- Living World / Event Director V3 / Long-term Consequence

## Known Review / Infrastructure Warning
- Earlier sticky Merge Readiness states sometimes reported READY/P0-P1=0 while direct current review threads still had live P1 findings.
- Direct current review evidence outranks sticky status.
- Do not weaken exact-head/current-base or review-cycle safeguards to obtain green status.
- Codex Cloud push frequently fails with `CONNECT tunnel failed, response 403`; ChatGPT GitHub writer can apply tested diffs directly when needed.

## Permanent Test Evidence
HF1 permanent suites now include:
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/context-router.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
- `scripts/tests/scene-momentum-intent-guards.test.mjs`
- `scripts/tests/scene-momentum-paused-event.test.mjs`
- `scripts/tests/scene-momentum-time-floor.test.mjs`
- `scripts/tests/scene-momentum-correctness.test.mjs`
- plus existing continuation/event/Goal V2/core/debug/assets/migration/automation/readiness suites.

## DO NOT BREAK
- exactly one canonical model/core call per normal turn;
- stable `/api/chat-router` → `api/chat.js` architecture;
- stable filenames; no versioned duplicate router/runtime;
- `store:false`, prompt cache, 24h retention;
- player sovereignty + META freeze;
- CONTINUE same-moment hard freeze;
- completed Event Beats monotonic / CONTINUE no replay;
- schedule/location/knowledge/cooldown/callback/NO_EVENT Director guards;
- AFTERMATH / active-combat fixed flow;
- canon, NPC personality, established relationships;
- `app.js` base `APP_VERSION='1.4.8'` intentional;
- characters-v2 current 32-character / 13-state contract;
- protected core/runtime PR manual merge safety.

## NEXT ACTION
1. Refetch PR #33 exact HEAD and current main.
2. Confirm Safety + Vercel on `f5a64452...`.
3. Commit this docs update, then use its resulting exact HEAD as the only final review target.
4. Verify hosted Safety + Vercel on that exact HEAD.
5. Request fresh exact-current-HEAD/current-main Codex review.
6. Directly inspect unresolved non-outdated P0/P1 threads; sticky READY alone is insufficient.
7. If true current P0/P1=0, perform final current-main/merge-base/behind/conflict revalidation and manual `expected_head_sha` merge.
8. Verify production/main/health.
9. Continue directly into **Scene Purpose / Turn Hook / Event Consequence**.
