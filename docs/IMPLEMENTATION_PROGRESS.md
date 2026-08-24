# Lumensia Implementation Progress

## Current Phase
Narrative Engine continuation — live acceptance, Scene Purpose, Scene Exit, Stronger Turn Hook, and Event Consequence V1 are merged. NPC Initiative / Goal Tick V1 is the active separate phase.

## Current GitHub State
- Repo: `hoho074566-cpu/lumencia-ac`
- Main: `da248a2df0985d9196232149893a0b196020c0f9` (`Event Consequence V1`, PR #41 merge)
- Working branch: `codex/npc-goal-tick-v1`
- NPC Goal Tick V1 PR: pending branch publication. Code checkpoint `c9efe50bfc95d5093acbe36aef88f2cc98024a3f` is ahead 1 / behind 0 from current main and passes the full clean-LF repository check.
- PR #41: **merged** from exact reviewed head `06617b3ffe11d83bc512d7e4f520c17946d7bdf0`; Safety/Vercel/fresh P0/P1=0 and targeted Preview lifecycle acceptance passed. Merge `da248a2...` and reviewed head share tree `2bac9dd94468d37ff0cb7787ad6c42cdba478b27`.
- PR #40: **merged** as squash commit `5f2073a2874a9b8ee45a6aa34d6e4508997c3cb3` from reviewed exact head `85af592b8baae57958eb16d88da83f946d26a2e0`. Safety #313, Vercel, fresh exact-head Codex P0/P1=0, and affected Exact Preview acceptance passed; reviewed and merged trees both equal `2354a0db58c6405beec40fcfaae885fd8850c0db`.
- PR #39: **merged** as squash commit `4516cc162ef34426ef94d29cf5aa6489013927ec` from reviewed exact head `ba64f9f779cda39f91ef41abfddf3c47f823606c`. Safety #307, Vercel, fresh exact-head Codex P0/P1=0, and affected Chrome Preview acceptance passed. Merge and reviewed-head trees both equal `dfce564cc6b457a5258d5165ea05ce496acf99c6`; production Vercel and `/api/health` are healthy.
- PR #38: **merged** as `227bcf23ace6ad7dca38b5d02d50a8652dd13a38`; same-occurrence event focus refreshes on authoritative beat/completion progress and remains stable when progress is unchanged.
- PR #37: **merged** from exact head `acebe72f6297f44d5f08e820b8c6dc12a4fa00ae` as merge commit `cf05c43604e3ff9c7af03dc4cd09111cae27d729`. The merge tree exactly equals the reviewed head tree; production `/api/health` is 200/configured on app `1.5.6`, adapter `0.8.3`.
- PR #36: **merged** from exact docs checkpoint HEAD `c347744858300359ab8d6da204cb5d9277d366be`; reviewed code HEAD `c7881f4c31758d0350833f31c37d116f3ff4c18d`.
- PR #36 final checkpoint Safety Gate #290: **PASS**; Vercel: **PASS / Ready**.
- Fresh reviewed-code Codex result on `c7881f4...`: direct P0/P1 = 0 (`Didn't find any major issues`). The docs-only checkpoint did not change that code tree. The previously reported committed-action priority P1 is closed by limiting present-NPC stall recovery to passive `wait` / `downtime` intents.
- Exact Preview rerun: door/location-transition PASS, NPC initiative PASS, then full isolated `scripts/qa/live-play-acceptance.mjs` 12-case set **12/12 PASS** through the signed-in Chrome tab. No deployment token was extracted and no protection was bypassed.
- PR #36 merge commit `1faadd105cf7b7780544abb5ca5276af04198796` has parents `6a717e5fb612a75d70334eb5b40a461ead36587d` and `c347744858300359ab8d6da204cb5d9277d366be`; its tree exactly equals the reviewed checkpoint tree `fbe68c4a3b2207542bd0dd5a41cb8d75e0efa64b`.
- Post-merge production `/api/health`: 200, configured, app `1.5.6`, adapter `0.8.3`; merge-commit status checks passed.
- PR #35: **merged** at 2026-08-24 03:08:35 UTC using exact expected head `acee0ef8bbff62ec9ee819c6715a0419d74e896e`; merge commit `6a717e5fb612a75d70334eb5b40a461ead36587d` exactly preserved the reviewed tree.
- PR #35 post-merge full regression and production Vercel: **PASS**; production 12-case acceptance: **10 PASS / 2 FAIL**, producing the PR #36 work below.
- PR #34: **merged** at 2026-08-24 01:47:23 UTC using exact expected head `4479615f4904c74ee9e3dfd349b809136706808e`
- PR #34 exact-head authority: Safety Gate #274 PASS, Vercel PASS / Ready, fresh Codex review `PRR_kwDOT8LCAs8AAAABKkLd6w` with direct P0/P1 = 0; its two new comments were P2 only.
- PR #34 merge commit tree is identical to the reviewed PR HEAD; no unexpected merge delta.
- PR #33: **merged** at 2026-08-23 23:07:00 UTC
- Reviewed/merged PR HEAD: `216bef1d51b72f2edb6da3f06c69e02aa45b5b10`
- Exact-head Safety: **Lumensia PR Safety Gate #263 PASS**
- Exact-head Vercel: **PASS / Ready**
- Fresh exact-head Codex review: P0/P1 = 0; five P2 threads were non-blocking by repository policy.
- Merge commit tree is identical to reviewed PR HEAD; no unexpected merge change.
- Post-merge Vercel on main: **PASS**.
- Production `/api/health`: `ok=true`, API configured, app `1.5.6`, adapter `/api/chat-router`, canonical core `/api/chat`, prompt cache retention `24h`.
- Post-merge full `node scripts/lumensia-pr-check.mjs`: **PASS**.

## NPC Goal Tick V1 — Current Candidate
- High-drive active goals on currently present NPCs may produce `PRESENT_NPC_GOAL_TICK` on generic/observe/explore/wait/downtime turns without requiring a prior two-turn stall.
- The model must finish the declared USER ACTION first, then may add one physically feasible present-NPC goal action as the same turn's world response.
- Valid local targets are the PC, another present NPC, the current place, or a currently due matching event. Remote targets and terminal/blocked goals do not qualify.
- Direct focus, player-owned choices, active event beats, fixed schedules, callbacks, consequences, AFTERMATH/combat, committed travel, AUTO, and CONTINUE keep priority.
- Goal selection never advances progress by itself. Existing Goal V2 reasoned evidence remains required for every progress/lifecycle mutation.
- `sceneRuntime.goal_tick` stores one bounded last-tick checkpoint. Visible ticks use a 2-3 turn cadence; ignored ticks may retry next turn, and cooling one owner does not freeze another eligible NPC.
- No off-screen simulation, schema/save migration, additional model call, new endpoint, canonical core rewrite, or broader secret access.
- New permanent suite: `scripts/tests/npc-goal-tick-v1.test.mjs`; affected Goal V2/HF3/Context/Scene/Event/Turn Hook suites and full clean-LF PR check pass at `c9efe50...`.

## Event Consequence V1 — Completed
- The previously unused `delayed_consequences_add` output is added to the routed structured schema without changing the canonical `api/chat.js` file or save schema.
- The stable runtime materializes delayed results into the existing `save.hooks` store with a deterministic ID, due clock, bounded 3-day active / 7-day world lifetime, causal source, secret level, and duplicate fingerprint. At most 3 are created in one turn and at most 12 unresolved consequence hooks are retained.
- Context routing selects at most one due result. Direct player/NPC focus, decision-sensitive or committed high-stakes actions, active callback/aftermath/combat flow, and an earlier fixed schedule keep priority. AUTO may surface an already-due result; META and CONTINUE remain frozen.
- Explicit wait/downtime may stop at a consequence due inside the requested interval. The due directive is reserved under the minimum `.76` routine budget and keeps the final committed user-action predicate.
- A consequence resolves only when its event is visibly present in narration/structured state. An ignored or falsely acknowledged result stays `open`; expired items close deterministically. Secret causes at level 3+ are not copied into the due directive or normal routed hook detail.
- A manifested result may schedule at most one genuinely new causal follow-up; server-side fingerprinting rejects duplicate chains.
- No new persistence root, save migration, second model call, new API entrypoint, `app.js` rewrite, canonical `api/chat.js` rewrite, faction/reputation propagation, or off-screen simulation expansion.
- Focused Event Consequence/schema/runtime/authority tests and all affected Scene Momentum/Purpose/Exit/Turn Hook regressions pass. Commit `9bf5d24...` and published checkpoint `dbdc54b...` also pass the full clean-LF `scripts/lumensia-pr-check.mjs` and a clean-LF Chrome boot smoke: the patched app reaches V1.5.6, loads `/lib/event-consequence.js` with HTTP 200, and reports no browser console error.
- Second review found no blocker in schema compatibility, secret routing, lifecycle duplication, time/schedule priority, CONTINUE/META freeze, one-call architecture, or scope.
- Exact Preview lifecycle acceptance passed on `dbdc54b...`: an unsafe sigil edit stopped at a real three-way player decision; after the player committed, the delayed malfunction stayed latent through the immediate 08:50→08:52 move; a later 40-minute wait surfaced it at 10:02 as a visible record signal and caretaker reaction; the next departure turn did not repeat it. The scheduled admission ceremony retained priority before the due result.
- The first hosted review on `dbdc54b...` had P0/P1=0 and six P2 hardening findings. The focused closure enforces zero/one follow-up according to visible resolution, reserves canonical hook capacity for materialized rows, retains terminal fingerprints for one-shot dedupe, excludes unchosen choices from realization evidence, routes public named-NPC canon for due consequences, and prefers current-turn `event_progress` as the causal source. Each path has a permanent regression.
- The first closure Preview rerun on `165bb87...` found an explicit-timing failure: the user requested a `15분 뒤` marker, but the model supplied a shorter queue delay and it surfaced after 5 minutes. The final closure treats explicit numeric `분/시간/일 뒤·후` text as a hard persisted delay floor, with minute/hour/no-duration/under-report regressions.

## Stronger Turn Hook V1 — Completed
- New bounded `sceneRuntime.turn_hook` records allowlisted kind/source/status, a single-line 220-character anchor, bounded establishment turn, and only applicable speaker/event IDs.
- Strong hooks require concrete evidence: fresh choices, an open Exit boundary, a direct NPC question/request, active event pressure, authoritative new information/objective/world-thread change, or nonverbal NPC/world state mutation. A mere location change or generic dialogue is only a soft next step.
- The reserved Context Router rule makes current USER ACTION outrank an old hook, preserves player-owned `awaiting-player` boundaries under AUTO, forbids fake questions/repeated information, and asks for exactly three choices only at a real important decision.
- Initial exact Preview on `4a24a77...` passed room -> exterior compression but exposed generic destination suggestions being rendered as a three-choice decision. Exact Preview on `c18f9ab...` then passed room-to-exterior compression, Isabel/Lilia direct questions, AUTO/CONTINUE preservation, generic travel-choice removal, and contemplated-action question sovereignty.
- Fresh reviews found that earlier filters could delete valid nonverbal choices and implicit destination forks. The local closure removes only complete sets that the shared Scene Momentum classifier or a narrow fallback proves routine. Red/blue bottle manipulation survives without keyword membership; destination alternatives survive when all semantic targets are grounded in the scene, without relying on decision vocabulary; routine travel/preparation/rest sets remain suppressed.
- Codex review on initial head `4a24a77...` found two P1s: an open Exit could outrank a direct NPC question, and AUTO could overwrite a saved `awaiting-player` hook. The local closure prioritizes direct NPC addresses before continuation and passes prior runtime/mode so AUTO retains the exact unanswered hook until real player input.
- Earlier fixed-budget findings are closed by a dynamically compacted labeled Director/Schedule tail and fixed-section budgeting. A `.76` routine profile with a 5,200-character action stays within 6,840 characters, while the scheduled `.76` profile reserves enough authority for the first mandatory occurrence within 7,220 characters; both retain the action beginning and committed ending.
- CONTINUE clones the prior hook unchanged and receives a hook-specific hard freeze. META remains untouched.
- The authoritative 9k minimum state keeps only hook kind/status/anchor. Both a 5,000-character action and a dense 3,800-character action with maximum routine Schedule/Director authority preserve Scene Momentum, Purpose, Exit, Turn Hook, and the final committed predicate within budget.
- PR #40 deliberately contained no long-lived story-hook mutation, Event Consequence chaining, schema migration, second model call, new API entrypoint, `app.js` rewrite, or canonical `api/chat.js` rewrite.
- Focused/full checks, exact-head Safety/Vercel/Codex authority, affected Preview acceptance, guarded merge, tree verification, and production health all passed.

## Explicit Scene Exit Condition V1 — Completed
- New bounded `sceneRuntime.exit_condition` records an allowlisted condition kind/source/status, 180-character single-line target, bounded establishment and purpose turns, and optional event occurrence ID.
- Current user input outranks saved boundaries. Exterior/travel, explore, observe, downtime, wait, committed action, and direct-question intents each receive a deterministic stop target.
- Post-response evaluation distinguishes `open`, `reached`, and `awaiting-player`. Prematurely open boundaries survive AUTO only for the same purpose checkpoint; a new user action replaces them.
- Initial exact-head review `5007442930` found one P1: `locationChanged` alone let a corridor close an exterior boundary. The remediation stores a bounded `destination`, recognizes actual exterior locations, matches named travel targets, and permanently tests that `A동 복도` remains open even with a real location change.
- Important decisions remain player-owned, direct questions do not execute contemplated actions, and CONTINUE preserves the prior condition without progression.
- The Context Router reserves both the directive and compact authoritative condition under long-action pressure. Route/pipeline telemetry exposes the evaluated condition.
- No schema migration, second model call, new API entrypoint, `app.js` rewrite, or canonical `api/chat.js` rewrite.
- Focused Scene Exit/Purpose/Momentum/CONTINUE/Event/router tests and the full clean-LF `scripts/lumensia-pr-check.mjs`: PASS. Exact Preview confirmed room -> corridor/stairs -> actual exterior in one turn, direct-question non-execution, CONTINUE freeze, and AUTO/NPC initiative before guarded merge.

## Scene Purpose V1 — Completed
- New bounded `sceneRuntime.purpose` keeps only canonical version, allowlisted kind/source, a 180-character single-line focus, bounded establishment turn, and an optional 100-character event occurrence ID.
- Purpose persists across same-scene descriptive churn, switches on authoritative event/decision/scene transitions, and never stores a selected player action.
- Reserved Context Router guidance treats the focus as data, advances it only through NPC/world/event response, and explicitly forbids automatic PC action, dialogue, emotion, thought, acceptance, rejection, or choice.
- CONTINUE preserves the purpose object and receives a purpose-specific hard freeze; META remains unchanged.
- No schema migration, extra model call, new API entrypoint, `app.js` rewrite, or `api/chat.js` rewrite.
- Focused syntax, purpose, context authority-tail, CONTINUE, event, continuity, and Scene Momentum suites: PASS.
- Full `scripts/lumensia-pr-check.mjs`: PASS in a clean LF checkout. The normal Windows working tree still exposes the known CRLF-only false negative in five pre-existing workflow string assertions; canonical Git blobs and hosted Linux checks use LF.
- The merged feature distinguishes descriptive churn and both AUTO forms from real player input, gives actions and direct questions current-action priority, and separately preserves player sovereignty. PR #38 adds no save field: it compares previous/current same-occurrence event progress and refreshes purpose focus only on active-beat or completion progress. Unchanged event progress retains the exact prior object. Active-event occurrence authority, decisions, NPC interaction precedence, AUTO continuity, and CONTINUE freeze remain unchanged. This candidate is not merge-authoritative until the final docs checkpoint is pushed and freshly reviewed.

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
- Published exact head `9972c26a4db39b29fd92bd77824e71a2e802126d`: Safety Gate #268 **PASS**, Vercel **PASS**. Exact Preview rerun preserved 12:40 and the designated classroom, answered only the feasibility question, and did not execute either contemplated trip.
- CONTINUE follow-up exposed a separate UI P1 after reload: two `#flowControlsStable` wrappers survived and the old duplicate suppressor marked both CONTINUE buttons hidden. The local fix collapses duplicate wrappers, never suppresses buttons inside a stable wrapper, and explicitly clears stale `hidden` / `aria-hidden` state. Focused CONTINUE/runtime/core tests: **PASS**.
- Published UI head `c90616815c9d058c0c185a87402460803df5b0d8`: Safety #269 **PASS**, Vercel **PASS**; reload showed exactly one visible/enabled CONTINUE button. Live CONTINUE preserved 12:40/location and used CONTINUE routing, but added a new Artemis line plus NPC actions. That violates the narrative side of hard freeze despite a zero state delta.
- The local follow-up explicitly forbids new NPC speech/gesture/movement/decisions/arrival/departure during CONTINUE and permits only expression-level expansion of an already-started beat or static sensory prose. Permanent correctness assertions cover this rule.
- Published narrative-freeze head `96230915c651b7c2d1d436f46f04442813014e6e`: Safety #270 **PASS**, Vercel **PASS**. Exact Preview CONTINUE kept 12:40 and the designated classroom, added only static room/light detail, and introduced no new speech/action.
- Completed-event forward then moved 12:40 -> 12:48 and the classroom -> 기사과 대장간 without replaying the orientation. Isabel and the smith initiated naturally, and the turn ended on a meaningful response hook without choosing for the player.
- Candidate live acceptance is sufficient across all 12 requested behavior classes: short travel, long-action travel, wait, rest, repeated observation, NPC approach/question, door/location transition, pre-schedule rest, question form, CONTINUE, completed-event forward, and NPC initiative.
- Final direct-thread audit found one still-applicable P1: the manual CLI harness omitted the deployment access header, so a protected Preview returned `401 BAD_ACCESS_TOKEN`. The harness now reads only `LUMENSIA_LIVE_ACCESS_TOKEN`, conditionally forwards it as `x-lumensia-token`, never prints it, and has a permanent static regression. Browser acceptance never exposed or reused the token value.
- Fresh exact-head review `PRR_kwDOT8LCAs8AAAABKkJDNQ` on `b30ad59aba9c242bb4beb549a4f444abd645603e` found one new direct P1: a question with `stall_streak >= 2` received both sovereignty freeze and `SCENE_STALL=true`. The fix suppresses stall-recovery pressure for `decision-sensitive` turns, with a permanent regression proving no world mutation is requested.
- Two fresh P2s directly matched failures already reproduced during this acceptance phase, so the required P1 head change also hardens the harness: the question fixture now seeds an active orientation and checks non-completion/identity, while CONTINUE rejects new NPC dialogue/action in addition to zero state delta. Other non-reproduced P2s remain non-blocking and unchanged.
- Fresh exact-head review `PRR_kwDOT8LCAs8AAAABKkKXOQ` on `acab3594c784fdd3b93a32f1163320e5b4fcdbdd` found one follow-up P1: Korean question-only endings such as `있을까.` / `있을까요.` without `?` still routed as generic. The bounded classifier now recognizes terminal `까/까요` with optional sentence punctuation and applies the same decision-sensitive stall freeze. Its related P2 also closed a demonstrated acceptance gap by requiring the active event progress object itself to remain identical instead of accepting `null` pause.
- Final exact head `4479615f4904c74ee9e3dfd349b809136706808e` passed Safety #274, Vercel Ready, and a fresh direct P0/P1=0 review. The two fresh P2 findings remained non-blocking. Final compare was ahead 11 / behind 0 with base commit and merge-base at `8d378b532910dfecaf5226118bffabdddbe74289`.
- Guarded merge with that full `expected_head_sha` succeeded as `88fa53036c58324ffd5012ab7b5ed0cd3099dd6d`. The merge tree exactly equals the reviewed head tree.

## Post-merge Production Acceptance / Schedule Boundary HF2
- Merged-main `node scripts/lumensia-pr-check.mjs`: **PASS**.
- Production Vercel status on merge commit: **PASS**.
- Production `/api/health`: `ok=true`, API configured, app `1.5.6`, adapter `/api/chat-router`, canonical core `/api/chat`, prompt-cache retention `24h`.
- Full production live rerun: **11 PASS / 1 FAIL**. All classes except pre-schedule long rest remained green.
- Deterministic reproduction at 11:50 showed `두 시간 쉰다.` advancing 120 minutes, auto-completing the mandatory 12:00 orientation, and deciding PC nonattendance. The schedule payload was present; the model lacked an exact hard-stop priority over `EXPLICIT_DURATION=120min`.
- Focused branch fix moves the already-proven schedule-boundary calculation into shared Scene Momentum code and reserves `SCHEDULE_BOUNDARY=10min` plus an explicit rule: stop at the schedule start, do not execute the remaining downtime, and do not auto-decide absence/completion.
- Existing positive model-produced time is still not silently reduced post-response, avoiding prose/state divergence. The fix changes model authority before the single canonical call and adds no call.
- Permanent tests prove the exact boundary directive, its priority over explicit duration, authoritative schedule-tail retention, full-schedule/next-day/overdue behavior, and all existing time-floor invariants.
- Initial exact Preview head `a7a1a5fba44ed29872cde0dd655e129b81262685`: Safety #277 PASS and Vercel Ready.
- Its live 11:50 case correctly stopped before executing 120 minutes or deciding nonattendance, surfaced the orientation, and offered attend/stay/other choices. However, the header/runtime clock remained 11:50 while prose said noon: a structured boundary choice caused the existing meaningful-choice guard to skip the local 10-minute floor.
- Initial review `PRR_kwDOT8LCAs8AAAABKkOr9A` on `a7a1a5f...` found two P1s: a future boundary within an implicit action's allowed range (or exactly equal to an explicit duration) did not emit the hard stop, and already-due/overdue events produced a contradictory 0-minute hard stop that froze newly committed actions. Its remaining finding was P2.
- Local review/live closure treats due/overdue rows as current context while selecting only the nearest strictly future hard stop; a boundary is emitted whenever it is reachable within the action's full allowed time range, including equality.
- The runtime aligns the clock only when `event_progress.event_instance_id` exactly matches an authoritative occurrence scheduled at that future minute. Due/overdue IDs and unrelated NPC/Director interruptions are subtracted from that exact-boundary set and remain unforced.
- Permanent cases cover the production-like overdue-row + 10-minute future orientation, implicit 30–240-minute rest with a 35-minute event, explicit-duration equality, due/overdue committed-action freedom, and unrelated early choices.
- Focused tests, full `node scripts/lumensia-pr-check.mjs`, and `git diff --check`: **PASS**.
- Exact Preview `d898734cc190c2115078d8191f273215f99ced46` passed the corrected 11:50 case with a coherent 12:00 world clock, unchanged room location, active/non-completed `knight_orientation`, and preserved attend/stay/other choice. The other ten GAME acceptance classes also passed in isolated UI saves.
- The same full live cycle exposed one separate CONTINUE P1: a raw `remaining_beats` sentence instructed a new book-closing action and the model replayed the preceding NPC question even though State Delta stayed frozen.
- Local closure removes unstarted pending beats from both the synthetic CONTINUE action and routed SAVE_STATE while retaining the original queue in post-response runtime state. It also explicitly forbids replaying prior NPC dialogue. CONTINUE/Event/Context/Schedule focused tests and the full PR check pass.
- Final runtime exact HEAD `636458e2aef899022d320324aa14b0f654e72ea5` passed both affected Preview reruns. CONTINUE kept 09:15/the library entrance and added only static light/shelf detail with no new dialogue/action; the schedule case again reached exactly 12:00 in the room with the orientation active, incomplete, and player choice preserved.
- Direct review thread `PRRT_kwDOT8LCAs6bj9L0` found one remaining P1: a valid boundary response may omit optional `event_progress` while still identifying the schedule in prose, which would leave the clock unaligned. The local closure accepts either the exact structured occurrence ID or a bounded two-token match to an authoritative event scheduled at that exact minute; unrelated Director/choice interruptions still do not advance.
- Exact code HEAD `e4de523b37f3508d4fc6534ff4aa49df3fd74b05`: Safety #282 PASS, Vercel Ready, and the Preview schedule rerun PASS. World time reached exactly 12:00, location remained the room, `knight_orientation` stayed active/incomplete at `arrival_decision`, and player choices remained open.
- Fresh review `PRR_kwDOT8LCAs8AAAABKkUk7Q` on `d1ada8288c62bf55a6c41e09485959b568a3a5c8` produced three still-applicable P1 blockers: hard stops currently include unrelated NPC/world schedules; hidden CONTINUE beats are still consumed and lost; and non-downtime action estimates can be stretched to a later boundary instead of merely capped.
- Repository policy allows at most two Codex-local automatic fix/review iterations. That limit is exhausted, so these P1s were not automatically patched. PR #35 must not merge.
- The user explicitly authorized a new remediation cycle and instructed Codex to perform every safely automatable step, including an exact-head guarded merge only after every gate is re-fetched and PASS.
- Local remediation now filters hard stops to PC-owned/personal/promise schedules, general academic schedules, and the PC's own named department. NPC-only legacy rows, world-only rows, and other-department academic rows progress independently.
- Short travel/exit/explore/observe actions use their minimum completion estimate for mandatory schedule targeting. A later boundary inside the wider guide is emitted only as `SCHEDULE_CAP`, which forbids stretching the action to that time.
- Frozen CONTINUE still hides `remaining_beats` from model context, but now preserves the original unseen queue in runtime state instead of consuming its head.
- Permanent regressions reproduce all three prior failures. Focused Scene Momentum/router/Event tests and the full `node scripts/lumensia-pr-check.mjs` pass locally.
- Published exact HEAD `fc94fa55af1adfbcd921c2b919236d017c5503e3` passed Safety Gate #285 and Vercel Ready. Its fresh direct review found no P0, two policy-nonblocking P2s, and one P1: the UI advertised the intentionally model-hidden legacy queue as executable `이어서 생성 · N` content even though frozen CONTINUE cannot safely drain it.
- The P1 closure keeps the hidden queue non-consuming, removes the false queue count/execution promise, and labels CONTINUE only as static same-moment elaboration. A permanent runtime regression proves that flow controls cannot mention `remaining_beats`, an executable beat count, or a next-beat promise.
- Final exact HEAD `acee0ef8bbff62ec9ee819c6715a0419d74e896e` passed Safety #286, Vercel Ready, and fresh exact-head direct P0/P1=0. Final compare was ahead 10 / behind 0 with base commit and merge-base at `88fa53036c58324ffd5012ab7b5ed0cd3099dd6d`.
- Guarded merge with the unchanged full `expected_head_sha` succeeded as merge commit `6a717e5fb612a75d70334eb5b40a461ead36587d`. Its parents are the fetched main and exact reviewed head; the merge tree exactly equals the reviewed head tree.
- Merged-main full PR check and production Vercel passed. The next production 12-case run produced 10 PASS / 2 FAIL while schedule boundary, question sovereignty, CONTINUE freeze, and completed-event progression stayed green.
- Door/location was a harness false negative: the model compressed directly to canon's `시작의 광장`, while the evaluator required the noncanon fixture alias `중앙광장`. The evaluator now accepts both without weakening the no-door/corridor-stop assertion.
- NPC initiative was a real orchestration failure: a new Chloe Director cameo displaced present Isabel even though she had a PC-targeted active goal and the scene had stall pressure.
- The local HF3 closure reserves `PRESENT_NPC_GOAL_PRIORITY` fixed flow for a present NPC's feasible PC/present-NPC goal under momentum pressure, suppressing a competing random cameo without creating a new occurrence or deciding any PC choice. Permanent Goal/Director tests reproduce and close the failure.
- PR #36 initial exact HEAD `6ee2fb74d207ee20e9880fbdcd0c7fc3af87f981` passed Safety #287 and Vercel Ready. Its fresh direct review found one P1: a stalled `decision-sensitive` question could still receive unrelated present-NPC goal initiative ahead of the requested answer. One separate P2 remains non-blocking and is not in this fix scope.
- Published exact HEAD `8e83c4a298d92d9846aceda4132e21d5d6d01896` imports the same authoritative `classifySceneIntent` result used by Scene Momentum and disables `PRESENT_NPC_GOAL_PRIORITY` for `decision-sensitive` input. Safety #288 and Vercel Ready passed.
- Fresh exact-head review `5004348673` found a follow-up P1: every non-question intent still qualified, allowing a previous stall to make unrelated NPC initiative preempt committed travel, observation, or consequential action.
- The current local closure restricts present-goal stall recovery to authoritative passive `wait` / `downtime` intents. Permanent tests prove ordinary waiting keeps NPC-first fixed flow while question, travel, observation, and contract-signing inputs cannot be displaced. Focused Scene Momentum/Context Router/Goal suites and full `node scripts/lumensia-pr-check.mjs` are **PASS**.
- Exact Preview URL for this code head is `https://lumencia-ac-git-codex-live-acceptance-npc-initia-c273ba-ah-203c.vercel.app`.
- Cloud Browser was rechecked in a fresh session: Chrome/CDP selection succeeds, but both tab discovery and new-tab creation time out even after the documented recovery retry. The dedicated `LUMENSIA_LIVE_ACCESS_TOKEN` is not injected, so the protected Preview cannot be substituted with the CLI harness. No token extraction, protection bypass, or merge was attempted.
- The full local `node scripts/lumensia-pr-check.mjs`, syntax checks for every changed JS/MJS file, and `git diff --check origin/main...HEAD` were rerun at `c7881f4...` and **PASS**.

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
- protected core/runtime PRs remain exact-head reviewed and human-merge only unless the user explicitly authorizes that exact merge.

## NEXT ACTION
1. Push `codex/npc-goal-tick-v1` and open its focused PR from local code checkpoint `c9efe50...` plus this documentation checkpoint.
2. Require exact-current-HEAD Safety/Vercel and a fresh P0/P1=0 Codex review; revalidate base/main and merge-base.
3. Run exact Preview acceptance for proactive observe/explore/wait initiative, manifestation/cooldown/no-repeat, and protected question/travel/schedule boundaries.
4. Do not merge from a Codex task. Protected runtime/API paths make this PR human-only.
5. Start bounded off-screen progression only after Goal Tick V1 closes.

## Stop Record
- Completed: PR #33 guarded merge; latest-main fetch; exact merge-tree verification; full post-merge regression; main Vercel success; production `/api/health` smoke.
- Completed after merge: first 12-case production Live-play run, four demonstrated classifier fixes, permanent regressions, full local PR check.
- Completed on PR #34 candidate `cd5b711`: hosted Safety #265 PASS, Vercel Ready, fresh exact-head direct P0/P1=0; branch is clean/synchronized and base/merge-base remain current main.
- Completed environment recovery: user-authorized Preview scope was added without exposing the key; exact-head redeploy `F4Zua1Ud7EQDazJcvwSB2ZjgryeG` is Ready and authenticated health is configured.
- Completed in exact Preview sequential live play: all 12 requested behavior classes, including question sovereignty, reload-safe CONTINUE UI, narrative hard freeze, completed-event no-replay, and NPC-first follow-up.
- Completed: PR #34 exact-head gates and expected-head merge; merge-tree verification; merged-main full regression; production Vercel and `/api/health` smoke.
- Completed post-merge evidence: 11/12 production live cases green and the remaining schedule-boundary sovereignty failure reproduced exactly.
- Completed on initial HF2 exact Preview: Safety #277/Vercel PASS; 120-minute skip/nonattendance choice fixed, but live evidence exposed a 0-minute clock/prose mismatch at the schedule boundary.
- Completed local fix iteration: future-only reachable boundary directive; exact occurrence/clock alignment; due/overdue and unrelated choices remain executable; focused tests PASS.
- Completed exact Preview acceptance on `d898734...`: all 11 GAME cases passed, including the corrected 12:00 schedule boundary; CONTINUE reproduced a narrative hard-freeze P1 despite zero state delta.
- Completed local CONTINUE closure: pending-beat prompt removal, prior-dialogue replay prohibition, original queue consumption preserved; focused/full tests PASS.
- Completed on final runtime head `636458e...`: Vercel Ready; exact Preview CONTINUE and schedule reruns PASS.
- Completed local direct-review closure: schedule-title evidence can align the exact boundary without optional `event_progress`; unrelated choices remain unforced; focused/full tests PASS.
- Completed on exact code head `e4de523...`: Safety #282/Vercel PASS and final schedule Preview rerun PASS.
- Completed direct audit: fresh review `PRR_kwDOT8LCAs8AAAABKkUk7Q` identified three current P1s after the second automatic remediation round.
- Completed human authorization and local remediation: PC-relevant schedule filtering, short-action cap-vs-target semantics, and frozen CONTINUE queue preservation all have permanent regressions.
- Tests at this checkpoint: focused regressions and full `node scripts/lumensia-pr-check.mjs` PASS; the diff is limited to the shared momentum helper, stable adapter, tests, and these progress documents.
- Completed on PR #36 code head `c7881f4...`: passive-only initiative closure published; Safety #289/Vercel Ready; fresh direct P0/P1=0; ahead 3 / behind 0; current-base and merge-base match main.
- Completed locally this session: branch/head verification, Cloud Browser recovery retries, protected-Preview URL confirmation, dedicated live-token availability check, syntax/static checks, `git diff --check`, and full PR check PASS.
- Completed: Exact Preview door/location and NPC-initiative reruns plus the full 12-case acceptance, PR #36 authorized merge, exact merge-tree verification, and production health smoke.
- Completed on PR #37 exact head `906bd3d`: AUTO sentinel closure, hosted Safety/Vercel, and focused signed-in AUTO Preview acceptance; AUTO produced `decision/player-decision`, not `player-action`.
- Fresh exact-head review found one remaining pre-response priority path. Code candidate `c7e0a8b...` makes the current committed action outrank saved focus and adds direct plus reserved-authority-tail regressions. The stale handover finding is closed by this docs checkpoint.
- Unfinished: final clean-LF check/review, docs checkpoint commit/push, fresh exact-head gates/review, affected current-action Preview rerun, guarded merge, merge-tree verification, and production health; all later narrative phases remain separate.
- Blocker: none locally.
- Completed: PR #39 exact-head Safety/Vercel/Codex/Preview gates, expected-head squash merge, exact tree verification, production Vercel, and health smoke.
- Initial published candidate: `4a24a77...`; Vercel PASS, Safety #308 initially in progress. Its first live travel rerun found the generic-choice issue above, so it is not merge-authoritative.
- Completed: PR #40 exact-head Safety/Vercel/Codex/Preview gates, squash merge `5f2073a...`, exact tree verification, production Vercel, and health smoke.
- Acceptance checkpoint `dbdc54b...`: bounded delayed-result materialization into existing hooks, due selection, schedule/player sovereignty guards, visible-result completion, open retry, expiry, duplicate rejection, secret-cause masking, and adaptive authority preservation passed full clean-LF check, Safety #316, Vercel Ready, clean-LF Chrome boot, and Exact Preview lifecycle acceptance. Its hosted review had P0/P1=0; the current closure addresses all six P2 hardening comments.
- Completed: PR #41 exact reviewed head `06617b3...` merged as `da248a2...`; merge and reviewed trees are identical.
- Completed locally on NPC Goal Tick V1 code `c9efe50...`: guarded proactive present-NPC tick, bounded cooldown checkpoint, feasibility filters, player/event/schedule/freeze guards, permanent regressions, substantive second review, and full clean-LF PR check PASS.
- NEXT ACTION: publish/open the Goal Tick PR, require exact-head hosted authority, then run targeted Exact Preview acceptance and leave the protected-path PR for human merge.
