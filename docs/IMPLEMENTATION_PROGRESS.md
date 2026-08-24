# Lumensia Implementation Progress

## Current Phase
Post-merge Narrative Engine continuation — Scene Momentum Recovery HF1 is merged and verified. The active work is **Live-play acceptance** against the original slow/looping input classes, followed by Scene Purpose, Explicit Scene Exit Condition, Stronger Turn Hook, and Event Consequence chaining.

## Current GitHub State
- Repo: `hoho074566-cpu/lumencia-ac`
- Main: `8d378b532910dfecaf5226118bffabdddbe74289` (`Merge pull request #33`)
- Working branch: `codex/narrative-live-play-acceptance`
- PR #34: **open / non-draft**, protected-core manual merge only
- PR #33: **merged** at 2026-08-23 23:07:00 UTC
- Reviewed/merged PR HEAD: `216bef1d51b72f2edb6da3f06c69e02aa45b5b10`
- Exact-head Safety: **Lumensia PR Safety Gate #263 PASS**
- Exact-head Vercel: **PASS / Ready**
- Fresh exact-head Codex review: P0/P1 = 0; five P2 threads were non-blocking by repository policy.
- Merge commit tree is identical to reviewed PR HEAD; no unexpected merge change.
- Post-merge Vercel on main: **PASS**.
- Production `/api/health`: `ok=true`, API configured, app `1.5.6`, adapter `/api/chat-router`, canonical core `/api/chat`, prompt cache retention `24h`.
- Post-merge full `node scripts/lumensia-pr-check.mjs`: **PASS**.

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

## P1 FIX IMPLEMENTED AND MERGED
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

## PR #33 Final Review / Merge Record
- Exact reviewed HEAD: `216bef1d51b72f2edb6da3f06c69e02aa45b5b10`.
- Safety #263 PASS, Vercel PASS, fresh exact-head direct P0/P1=0.
- Final compare before merge: ahead 43 / behind 0; base commit and merge-base both `f6122be5f65a7b0b79555b83c9660eb9ed84cb6c`.
- Merge used `expected_head_sha=216bef1d51b72f2edb6da3f06c69e02aa45b5b10` and succeeded as merge commit `8d378b532910dfecaf5226118bffabdddbe74289`.
- The five non-outdated unresolved findings were P2 only and remain follow-up evidence, not retroactive HF1 merge blockers.

## Live-play Acceptance Round 1
Production baseline: main `8d378b532910dfecaf5226118bffabdddbe74289` via `scripts/qa/live-play-acceptance.mjs`.

- 12 real `/api/chat-router` calls, cloned/stateless fixtures, Luna low reasoning, short prose.
- Baseline result: 7 PASS / 5 flagged.
- Confirmed PASS: short travel, exactly-5000-character action ending in travel, explicit wait, NPC approach/question, door-to-destination compression, CONTINUE hard freeze, NPC-first initiative.
- Confirmed event behavior: completed entrance ceremony did not replay; a new meaningful interruption correctly stopped travel before the destination. The original destination-only assertion was too strict and was corrected.
- Confirmed schedule behavior: a two-hour rest ten minutes before a mandatory orientation advanced only ten minutes and surfaced the scheduled event instead of skipping it.
- Reproduced classifier gaps:
  - `한 시간 쉰다.` / `두 시간 쉰다.` were narrated correctly but recorded as `generic`, not `downtime`;
  - `게시판을 다시 확인한다.` was `generic`, not `observe`;
  - `도서관에 갈까?` did not execute travel, but was `generic`, not `decision-sensitive`.
- Local closure:
  - bounded native-Korean duration numbers now parse for hours/minutes and compound forms;
  - bounded repeat-observation adverbs remain observe intent;
  - Korean travel deliberation/question forms become decision-sensitive without a movement floor;
  - schedule-boundary regression now includes `두 시간 쉰다.`;
  - explicit live harness is outside automatic CI, so it never spends API credits implicitly.
- Focused intent/correctness/time-floor/HF1 tests: PASS.
- Full `node scripts/lumensia-pr-check.mjs`: PASS.

### Candidate hosted/review evidence
- Published follow-up candidate `cd5b711f47be99fbe321fb2eddc6c5d8d3eff568` on PR #34.
- Safety Gate #265: **PASS**; Vercel: **PASS / Ready**; compare: ahead 2 / behind 0 with base commit and merge-base at current main `8d378b532910dfecaf5226118bffabdddbe74289`.
- Fresh exact-head Codex review `PRR_kwDOT8LCAs8AAAABKj3Erw`: direct P0/P1 = 0. New suggestions are P2 only and remain non-blocking without a live reproduction.
- Follow-up closes those P2s because acceptance accuracy is the purpose of this phase: explicit wait/rest durations are exact, pre-schedule no-op is rejected, CONTINUE checks scalar and array deltas, completed-event reactivation checks event arrays, all visible fields are scanned for internal names, repeated-known-fact paraphrases require a hook, and `갈까 말까` / `가야 할까` / `갈까요` remain decision-sensitive.
- The user completed Vercel SSO in Cloud Browser and explicitly authorized adding Preview scope to the existing `OPENAI_API_KEY`.
- The key value was not viewed, copied, replaced, or exposed. Production remained selected and Preview was added; Vercel confirmed the environment-variable update.
- Exact head `58f00adf3fccc071afe59bd4134471874fe14b39` was redeployed as Preview deployment `F4Zua1Ud7EQDazJcvwSB2ZjgryeG`, which reached Ready. The authenticated branch alias then reported `API 0.8.3 연결 준비됨 · gpt-5.6-luna / gpt-5.6-terra · Q3 · CR · MOT2 · MOM`.
- The runtime-configuration blocker is resolved. The native file chooser could not be driven reliably, so candidate evidence continued through the same exact Preview UI with a naturally constructed sequential state instead of substituting production.
- Exact Preview live results before the next patch: short travel, long-action travel, explicit wait, explicit rest, repeated observation, NPC approach/question, door/location transition, pre-schedule rest, and NPC-first initiative behaved correctly. Movement compressed to the destination, wait/rest hit their requested boundary, repeated observation produced a new clue and NPC action, and no player action was invented.
- A new live P1 was reproduced: `지금 오리엔테이션이 끝난 뒤 대장간에 들를 시간이 있을까?` was classified `generic`, advanced 12:00 -> 12:40, and completed the active orientation even though the player only asked a feasibility question.
- Root cause: the question guard recognized direct travel deliberations such as `도서관에 갈까?`, but not indirect terminal questions without a travel predicate. The local fix classifies terminal question forms as `decision-sensitive` and adds an explicit same-moment/no-location/no-event-completion sovereignty directive. The live harness now requires `advance_minutes === 0` for this case.
- Focused intent/correctness/HF1 integration tests and full `node scripts/lumensia-pr-check.mjs`: **PASS** after the question-sovereignty fix.

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
1. Publish the question-sovereignty patch and this checkpoint to PR #34, then wait for exact-head Safety + Vercel.
2. On that exact Preview, rerun the indirect question and require the same 12:00 moment/location with no active-event completion; then verify CONTINUE hard freeze and completed-event forward progression in the same live session.
3. Resolve only reproduced P0/P1 blockers. P2/P3 remain non-blocking without live reproduction.
4. Record final acceptance, repeat full tests, publish docs, and obtain a fresh exact-current-HEAD/current-main Codex review; then stop at the protected-core manual merge gate and never auto-merge.
5. After the acceptance fix is human-merged, rerun all 12 cases on production and smoke `/api/health`, then implement **Scene Purpose** with bounded purpose state and no automatic player choice.
6. Continue through Explicit Scene Exit Condition -> Stronger Turn Hook -> Event Consequence chaining/lifetime -> NPC Initiative/Goal Tick refinement.

## Stop Record
- Completed: PR #33 guarded merge; latest-main fetch; exact merge-tree verification; full post-merge regression; main Vercel success; production `/api/health` smoke.
- Completed after merge: first 12-case production Live-play run, four demonstrated classifier fixes, permanent regressions, full local PR check.
- Completed on PR #34 candidate `cd5b711`: hosted Safety #265 PASS, Vercel Ready, fresh exact-head direct P0/P1=0; branch is clean/synchronized and base/merge-base remain current main.
- Completed environment recovery: user-authorized Preview scope was added without exposing the key; exact-head redeploy `F4Zua1Ud7EQDazJcvwSB2ZjgryeG` is Ready and authenticated health is configured.
- Completed in exact Preview sequential live play: nine behavior classes through the question-form case; eight passed and the indirect question reproduced a real sovereignty failure.
- Unfinished: publish/redeploy the question fix, rerun that live case plus CONTINUE/completed-event forward, renew exact-head gates, protected manual merge, production acceptance, Scene Purpose and later phases.
- Blocker: current hosted head still lacks the local indirect-question sovereignty fix. The native chooser is no longer a user-action blocker.
- NEXT ACTION: publish the tested patch, wait for exact Preview readiness, and rerun the failed question at the same active-event boundary.
