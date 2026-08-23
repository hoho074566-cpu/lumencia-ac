# Lumensia Implementation Progress

## Current Phase
Scene Momentum Recovery HF1 — the long-input Scene Momentum reservation P1 has been fixed in the current candidate worktree and permanent regressions plus the full local PR check pass. PR #33 remains **NOT merge-authorized** until the resulting exact commit receives hosted Safety PASS, Vercel PASS, and a fresh exact-current-HEAD/current-main Codex review with P0/P1=0.

## Current GitHub State at Handover
- Repo: `hoho074566-cpu/lumencia-ac`
- Main: `f6122be5f65a7b0b79555b83c9660eb9ed84cb6c` (`chore: restore standard Lumensia safety workflow`)
- Working branch: `codex/scene-momentum-recovery-hf1`
- PR: #33 `Restore Scene Momentum and narrative compression in V1.5.6`
- Live PR HEAD refetched before this fix: `0ddd3e300448ac2e241bd57f6371fde83dbf34c1`
- Historical reviewed PR HEAD: `8ca24ba0d4df31807bf89c1d066317b0329cf18e`
- Last published code/test HEAD before the current candidate: `f5a64452d1dcd671cafa30ab033bb05e13308e2b`
- Historical GitHub PR state at `8ca24ba...`: open, draft=false, `mergeable=true`
- Compare `main...8ca24ba...`: ahead 41 / behind 0
- Compare `base_commit.sha`: `f6122be5...` = current main
- Compare `merge_base_commit.sha`: `f6122be5...` = current main
- Hosted Safety on `8ca24ba...`: **Lumensia PR Safety Gate #261 PASS**
- Hosted Vercel on `8ca24ba...`: **PASS / Ready**
- Protected core/runtime PR: **manual merge only**.

## Completed Foundation
Already merged before PR #33:
- PLAYER ACTION COMMIT
- CONTINUE reliability + same-moment hard freeze
- Scene Continuity
- monotonic Event Beat / CONTINUE no replay
- Merge Readiness / Discord / exact-current-HEAD + current-base safety architecture
- guarded LOW-RISK Auto-PR/Auto-Merge smoke proof
- PR #30: V1.5.5 NPC Motivation + Relationship Reason V1
- PR #31: V1.5.6 NPC Goal V2
- PR #32: characters-v2 refresh

## Scene Momentum Recovery HF1 — Implemented
Core contract:

`User Action -> semantic intent -> compress decision-free steps -> world/NPC/event progression -> real State Delta -> consequence -> narration -> meaningful player decision -> STOP`

Implemented on PR #33:
- deterministic `lib/scene-momentum.js`, no extra model call;
- semantic action completion / trivial door-corridor-stair-path compression;
- State Delta scoring + three-turn stall/momentum history;
- Scene Change over repeated Scene Description;
- NPC initiative and goal-aware world action without stealing PC agency;
- Event Director momentum pressure with direct-focus/callback/cooldown/location/schedule/present-participant/NO_EVENT guards;
- AFTERMATH and active-combat fixed flow;
- meaningful STOP policy;
- paused event null vs true completion handling;
- named unregistered NPC dialogue counts as action; narration alone does not;
- exactly one canonical `coreHandler()` / model call invariant preserved.

## Important Fix Commits
### Router authority P1 closure — `1e23cec5dc4b19ddce2a089f01b8a6e393b45f71`
- schedule event `note` preserved;
- NPC schedule `activity` / `commitment` / `confidence` preserved through compaction;
- bounded minimum authoritative SAVE_STATE reserved under ~5000-char action pressure;
- routine input <=9000 while SAVE_STATE + GM Director + Event Director V2.1 + Schedule + final USER ACTION survive;
- AFTERMATH / active combat remain fixed flow before momentum random selection.
- Safety #255 PASS / Vercel PASS.

### Initial time-floor closure — `b8c5a8bf3556566e85a532e4fe92c09f8423add8`
- local forced time floor stops at routed schedule boundary;
- already-due schedule suppresses local floor;
- local floor capped at 1440 minutes;
- positive model-produced `advance_minutes` is never reduced;
- permanent `scene-momentum-time-floor.test.mjs`.
- Safety #256 PASS / Vercel PASS.

### Momentum correctness — `e5ac6c50bcfb7046b7754503df8c394817a4ab12`
- compound `1시간 30분` rest/wait = 90 minutes;
- numeric zero growth rows do not fake progress;
- one NPC state mutation does not double-count as NPC action;
- fresh meaningful choices satisfy STOP and do not build false stall;
- identical echoed `pc_status` is not progress;
- CONTINUE receives `CONTINUE HARD FREEZE` instead of Scene Stall/world-change pressure;
- permanent `scene-momentum-correctness.test.mjs`.

### Full authoritative schedule + timed-predicate fix — `7e953b5c6158a7bb51e6c5d80b5da0bbdc024f8a`
- `nextScheduleBoundaryMinutes()` checks full authoritative `saveState.scheduledEvents` plus routed upcoming schedule;
- completed/cancelled schedule rows ignored;
- overdue unfinished schedule = boundary 0;
- later same-day and next-day schedule boundary caps local forced time;
- historical phrase `10분 전에 본 게시판을 확인한다` no longer becomes an explicit action duration;
- explicit duration parsing restricted to actual wait/rest or timed deliberation;
- Safety #259 PASS / Vercel PASS.

### Question-form compressed-action guard — `f5a64452d1dcd671cafa30ab033bb05e13308e2b`
Question-form inputs that look like travel/observe/explore/wait/rest/exterior actions are `decision-sensitive`, `compression=false`, `minAdvanceMinutes=0`.
Permanent cases include:
- `도서관에 간다?`
- `주변을 살핀다?`
- `주변을 돌아다닌다?`
- `10분 기다린다?`
- `쉰다?`

Safety #260 PASS / Vercel PASS.

## Final Docs Head Validation — `8ca24ba0d4df31807bf89c1d066317b0329cf18e`
Before the latest Codex finding:
- Safety #261: PASS
- Vercel: PASS
- compare: ahead 41 / behind 0
- base_commit == current main
- merge_base == current main
- PR mergeable=true

A fresh exact-head Codex review was submitted on `8ca24ba...` at 2026-08-23 21:47:49 UTC.

## P1 FIX IMPLEMENTED — HOSTED VALIDATION PENDING
**Thread:** `PRRT_kwDOT8LCAs6biXWm`  
**Comment:** `PRRC_kwDOT8LCAs7k3PCq`  
**Path:** `api/lib/context-router.js`, around current line 422  
**Title:** `Reserve the Scene Momentum directive under input pressure`

Original problem:
- `SCENE MOMENTUM HF1` is still inside `optionalContext`.
- `composeRoutedInput()` correctly reserves minimum SAVE_STATE + authority tail + action, but prefix-clips `optionalContext` when routine input pressure is high.
- A supported ~5000-character routine USER ACTION can therefore keep the final action and authority sections while silently dropping the Scene Momentum directive.
- Example: a long action ending in `도서관에 간다.` can still be classified as travel by server-side post-processing, but the model may receive neither `INTENT=travel` nor stall/compression instructions.
- The adapter can then apply deterministic State Delta/time-floor behavior to prose generated without the corresponding semantic-compression rules -> narrative/state mismatch.
- Momentum recovery is also disabled exactly under long-action pressure.

Implemented closure:
- `composeRoutedInput()` now accepts a dedicated `reservedContext` between clipped optional context and the existing Director/Schedule authority tail.
- `===== SCENE MOMENTUM HF1 =====` is no longer inside prefix-clipped `optionalContext`.
- A permanent exactly-5000-character ROUTINE action ending in `도서관에 간다.` proves the 9000-character budget retains minimum SAVE_STATE, Scene Momentum + `INTENT=travel`, GM Director, Event Director V2.1, Schedule payload, and the committed final action predicate.
- Routed CONTINUE pressure now explicitly proves `INTENT=continue-freeze`; routed AUTO pressure proves normal `INTENT=generic` world flow.
- Exactly one canonical core/model call remains covered by `core-invariants.test.mjs` and the full suite.

Local validation:
- focused router / Scene Momentum / core invariant tests: PASS;
- `node --check api/lib/context-router.js`: PASS;
- `git diff --check`: PASS;
- full `node scripts/lumensia-pr-check.mjs`: PASS (`All blocking Lumensia PR checks passed.`).

## Review State at Handover
- Final exact-head Codex review **did complete** on `8ca24ba...`.
- It introduced the original P1 above; the current candidate fixes it but has not yet received replacement exact-head review authority.
- Therefore prior `Safety PASS + Vercel PASS + compare clean + mergeable=true` are **not sufficient for merge**.
- Direct current P1 evidence outranks sticky Merge Readiness.
- Sticky Merge Readiness was still stale/pending on an older head during this session; never use it alone.
- Some older unresolved non-outdated P2 threads may remain visible even where code/tests already address the behavior (notably no-op delta scoring / historical-duration parsing). Re-evaluate them after the P1 fix, but project policy keeps P2/P3 non-blocking unless a fresh correctness issue materially escalates.

## Permanent HF1 Test Suites
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/context-router.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
- `scripts/tests/scene-momentum-intent-guards.test.mjs`
- `scripts/tests/scene-momentum-paused-event.test.mjs`
- `scripts/tests/scene-momentum-time-floor.test.mjs`
- `scripts/tests/scene-momentum-correctness.test.mjs`
- plus existing continuation/event/Goal V2/core/debug/assets/migration/automation/readiness suites through `scripts/lumensia-pr-check.mjs` / hosted Safety Gate.

## DO NOT BREAK
- exactly one canonical model/core call per normal turn;
- stable `/api/chat-router` -> `api/chat.js` architecture;
- stable filenames; no versioned duplicate router/runtime;
- `store:false`, prompt cache, 24h retention;
- Context Router profile budgets;
- player sovereignty + META freeze;
- CONTINUE same-moment hard freeze;
- completed Event Beats monotonic / CONTINUE no replay;
- paused null != completion;
- schedule/location/knowledge/cooldown/callback/NO_EVENT Director guards;
- AFTERMATH / active-combat fixed flow;
- canon, NPC personality, established relationships;
- `app.js` base `APP_VERSION='1.4.8'` is intentional;
- characters-v2 32-character / 13-state contract;
- protected core/runtime PR #33 manual merge safety.

## NEXT ACTION
**Do not merge PR #33.** The next chat starts here:

1. Commit and publish the focused router/test/docs candidate.
2. Require hosted Safety PASS + Vercel PASS on that exact current HEAD.
3. Request a fresh exact-current-HEAD/current-main Codex review; prior `8ca24ba...` review cannot authorize the new head.
4. Directly inspect unresolved non-outdated P0/P1 threads. Sticky READY alone is insufficient. Re-evaluate the current inventory-scoring P2, but it remains non-blocking unless fresh evidence escalates it.
5. Only if true current P0/P1=0: refetch current main + exact HEAD, compare, require base_commit==main, merge_base==main, behind=0, mergeable/no conflict.
6. Stop at manual-merge readiness. **Do not merge PR #33 in this task.**
7. After a later human merge, verify merged main / production Vercel / `/api/health`, then continue into **Scene Purpose -> Scene Exit Condition -> Turn Hook -> Event Consequence -> NPC Initiative/Goal Tick refinement**.

## Stop Record
- Completed this session: long-input Scene Momentum reservation P1 code fix, exactly-5000-character pressure regression, CONTINUE/AUTO reservation regressions, focused tests, full local PR check, and progress/handover refresh.
- Unfinished: publish the new commit, hosted Safety/Vercel, fresh exact-head/current-main Codex review, and final manual-merge readiness checks.
- Prior hosted evidence at reviewed head `8ca24ba...`: Safety #261 PASS, Vercel PASS; it does not authorize the new candidate.
- Blocker: hosted exact-head validation and a fresh authoritative P0/P1=0 review are still required.
- Merge: NOT PERFORMED.
