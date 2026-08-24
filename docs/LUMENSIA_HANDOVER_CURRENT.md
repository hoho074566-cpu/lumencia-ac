# LUMENSIA — CURRENT INTEGRATED DEVELOPMENT HANDOVER

작성 기준: 2026-08-24  
프로젝트: 긴빠이 프로젝트 / Lumensia Academy  
Repository: `hoho074566-cpu/lumencia-ac`

> 이 문서는 새 프로젝트 시작 문서가 아니다. HANDOVER 1(2026-08-19) → HANDOVER 2(2026-08-22) → HANDOVER 3(2026-08-23) → V1.5.5 NPC Motivation / Relationship Reason → V1.5.6 NPC Goal V2 → Scene Momentum Recovery HF1의 연속선이다.
>
> 완료된 HF1 진단을 처음부터 재분석하지 않는다. SHA / PR / checks처럼 변하는 값은 GitHub live 상태가 우선하며, 다음 세션은 이 문서의 **CURRENT BLOCKER / NEXT ACTION**부터 이어간다.

---

# 0. SESSION STOP CHECKPOINT — 가장 먼저 읽을 것

## Live state immediately before this handover update
- Branch: `codex/stronger-turn-hook-v1`
- Stronger Turn Hook V1 code checkpoint: `8fbab9a...`. No PR yet; the final docs checkpoint, clean-LF full check, exact-diff review, and publication remain.
- Base/current main: `4516cc162ef34426ef94d29cf5aa6489013927ec` (`Scene Exit Condition V1 (#39)`).
- PR #39: **merged** from exact reviewed head `ba64f9f779cda39f91ef41abfddf3c47f823606c`. Safety #307, Vercel, fresh exact-head Codex P0/P1=0, and affected Chrome Preview acceptance passed. Squash merge commit `4516cc1...` has the exact reviewed tree `dfce564cc6b457a5258d5165ea05ce496acf99c6`; production Vercel and `/api/health` are healthy.
- PR #38: **merged** as `227bcf23ace6ad7dca38b5d02d50a8652dd13a38`. Same-occurrence event purpose focus now refreshes only when the authoritative active/completed/omitted progress signature changes; unchanged progress retains the exact prior purpose object.
- PR #37: **merged** from exact head `acebe72f6297f44d5f08e820b8c6dc12a4fa00ae` after Safety #299, Vercel, AUTO/direct-question Preview acceptance, and one exact-head Codex P0/P1=0 result. Merge commit parents are prior main `1faadd105...` + reviewed head `acebe72...`, and its tree exactly equals the reviewed tree. Production `/api/health` is 200/configured on app `1.5.6`, adapter `0.8.3`.
- PR #36: **merged** after exact Preview acceptance; reviewed code HEAD `c7881f4c31758d0350833f31c37d116f3ff4c18d`, exact docs checkpoint/merge parent `c347744858300359ab8d6da204cb5d9277d366be`.
- PR #36 exact-head gates: Safety #290 PASS, Vercel Ready, fresh exact-head Codex P0/P1=0. Door/location and NPC-initiative reruns passed first, followed by the full isolated 12-case acceptance at 12/12 PASS.
- PR #36 merge commit parents are `6a717e5...` + `c347744...`; merge tree `fbe68c4a3b2207542bd0dd5a41cb8d75e0efa64b` exactly matches the reviewed checkpoint tree. Production `/api/health` is 200/configured on adapter `0.8.3` and app `1.5.6`.
- PR #35: **merged** at 2026-08-24 03:08:35 UTC using `expected_head_sha=acee0ef8bbff62ec9ee819c6715a0419d74e896e`.
- PR #35 final gates: Safety #286 PASS, Vercel Ready, fresh exact-head direct P0/P1=0, ahead 10 / behind 0, base commit and merge-base equal then-current main `88fa53036c58324ffd5012ab7b5ed0cd3099dd6d`.
- Merge commit parents and tree are exact: the merge tree equals reviewed head tree `6d7d44bf891187ad8b88a715544f23004267e005` with no unexpected files.
- Merged-main full `node scripts/lumensia-pr-check.mjs`: **PASS**; merge-commit production Vercel: **PASS**.
- PR #34: **merged** at 2026-08-24 01:47:23 UTC using `expected_head_sha=4479615f4904c74ee9e3dfd349b809136706808e`.
- PR #34 exact-head gates: Safety #274 PASS, Vercel PASS / Ready, fresh direct P0/P1=0, ahead 11 / behind 0, base commit and merge-base equal then-current main.
- Merge commit tree exactly equals the reviewed PR #34 head tree; no unexpected merge delta.
- PR #33: **merged** at 2026-08-23 23:07:00 UTC
- Reviewed/merged PR HEAD: `216bef1d51b72f2edb6da3f06c69e02aa45b5b10`
- Guarded merge used the same full `expected_head_sha`.
- Exact-head Safety: **#263 PASS**
- Exact-head Vercel: **PASS / Ready**
- Fresh exact-head Codex review: direct P0/P1 = 0.
- Merge commit tree exactly matches the reviewed PR HEAD.
- Post-merge main Vercel: **PASS**.
- Production `/api/health`: healthy; app `1.5.6`, canonical `/api/chat`, adapter `/api/chat-router`, `24h` prompt-cache retention.
- Full post-merge `node scripts/lumensia-pr-check.mjs`: **PASS**.

## Current active work — Stronger Turn Hook V1
- `sceneRuntime.turn_hook` is a bounded next-direction checkpoint: allowlisted kind/source/status, a 220-character single-line anchor, bounded turn, and only applicable speaker/event IDs.
- Fresh player choices become `player-choice/awaiting-player`; an unsatisfied Exit becomes an active continuation; direct NPC questions/requests remain player-owned; active events, new leads, and authoritative NPC/world mutations become active hooks. Plain location change or generic dialogue is only a soft next step.
- Current USER ACTION outranks an old hook. AUTO cannot resolve an awaiting-player hook. CONTINUE preserves the prior object unchanged and cannot add a new question, choice, or NPC action.
- The prompt asks for a concrete next direction after `EXIT_TARGET` without forcing every turn into a question or three choices. It explicitly rejects static re-description, known-information relisting, and fake questions as hooks.
- The authoritative minimum save carries only kind/status/anchor, keeping 5,000-character ROUTINE actions within the existing 9k budget while preserving the other reserved authorities.
- No long-lived `saveState.hooks` mutation, Event Consequence chaining, schema migration, extra model call, new endpoint, `app.js` rewrite, or canonical `api/chat.js` rewrite.
- Focused and adjacent deterministic suites pass. The ordinary Windows full check hits only the known CRLF workflow-string false negative after all changed-area tests pass; the clean-LF full run remains before publication.

## Completed active predecessor — Explicit Scene Exit Condition V1
- `sceneRuntime.exit_condition` is a bounded allowlisted runtime checkpoint containing condition kind, target, source, status, establishment turn, linked purpose turn, and optional event occurrence ID.
- Current real user input always outranks a saved exit condition. Travel/exterior movement, exploration, observation, downtime, wait, committed action, and direct questions each receive an explicit deterministic stop boundary.
- A trivial corridor step does not satisfy an exterior destination. A destination/location change, meaningful discovery, new information, elapsed downtime, event-step progress, interaction response, or actual state change satisfies the corresponding boundary.
- Exact-head review on `1bc0e96...` found one P1: any intermediate `new_location` could satisfy a semantic destination. Candidate `be88e14...` stores a bounded machine-readable destination and requires an exterior marker or normalized named-destination match; permanent regressions use `A동 복도` with a real location change and keep the boundary open.
- If the model stops prematurely, an open condition remains linked to the same Scene Purpose checkpoint so AUTO can continue it. A new user action replaces it immediately.
- Important choices persist as `awaiting-player` and cannot be auto-resolved. Direct questions end after a direct answer without executing the contemplated action. CONTINUE preserves the condition unchanged; META remains untouched.
- Context routing reserves the exit directive under 9k pressure and exposes the compact condition in authoritative minimum state. Pipeline/route telemetry reports the condition for Preview evidence.
- No `app.js` or canonical `api/chat.js` rewrite, schema migration, extra API entrypoint, or extra model call. Focused Scene Exit/Purpose/Momentum/CONTINUE/Event/router suites and the full clean-LF PR check pass.
- Turn Hook was kept out of PR #39 and now lives on its own branch. Event Consequence remains a later separate phase.

### Historical PR #36 diagnosis and closure
- The PR #35 post-merge production 12-case run is **10 PASS / 2 FAIL**. Schedule boundary, question sovereignty, CONTINUE hard freeze, and completed-event forward progression all pass.
- `door-location-transition` is a harness false negative: the turn reached canon's `시작의 광장` and skipped every door/corridor microstep, while the evaluator accepted only the fixture alias `중앙광장`. The evaluator now accepts the canon destination.
- `npc-initiative` exposed a real orchestration issue: Isabel was already present with a PC-targeted active goal and stall pressure, but a new Chloe Director cameo displaced her initiative.
- The local fixed-flow closure emits `PRESENT_NPC_GOAL_PRIORITY` when a present NPC has an already-feasible PC/present-NPC goal under momentum pressure. It forbids a new random cameo, lets that NPC act first when physically/canonically possible, and still forbids deciding the PC's action, speech, emotion, or important choice.
- PR #36 initial exact HEAD `6ee2fb74d207ee20e9880fbdcd0c7fc3af87f981` passed Safety #287 and Vercel Ready. Fresh review found one P1: `decision-sensitive` questions under stall pressure could still be displaced by unrelated present-NPC initiative. Its separate P2 is policy-nonblocking and remains out of scope.
- Published exact HEAD `8e83c4a298d92d9846aceda4132e21d5d6d01896` shares Scene Momentum's authoritative `classifySceneIntent` result and suppresses present-goal initiative for `decision-sensitive` input. Safety #288 and Vercel Ready passed.
- Fresh exact-head review `5004348673` found one follow-up P1: committed travel, observation, and consequential actions still qualified for present-NPC stall recovery and could be preempted by an unrelated NPC action.
- Published code head `c7881f4c31758d0350833f31c37d116f3ff4c18d` limits `PRESENT_NPC_GOAL_PRIORITY` to passive `wait` / `downtime` intents. Waiting still triggers NPC initiative, while permanent question/travel/observe/contract-signing regressions preserve the player's committed action. Safety #289, Vercel Ready, fresh direct P0/P1=0, nine focused suites, and the full PR check pass.
- Exact Preview for this head is `https://lumencia-ac-git-codex-live-acceptance-npc-initia-c273ba-ah-203c.vercel.app`.
- A later fresh Chrome connection succeeded. The signed-in Exact Preview tab was used directly; no token extraction or protection bypass occurred. The two priority cases and all 12 cases passed before PR #36 was merged.

### Historical HF2 diagnosis and closure
- The merged-main production 12-case rerun produced 11 PASS / 1 FAIL.
- `두 시간 쉰다.` at 11:50 advanced 120 minutes and auto-completed the mandatory 12:00 orientation, deciding PC nonattendance despite the schedule payload being present.
- Root cause: `EXPLICIT_DURATION=120min` had no exact earlier schedule hard-stop priority in the reserved Scene Momentum directive. The local adapter only raises a missing time floor and intentionally does not shrink positive model output, so it could not repair this without prose/state divergence.
- Current HF2 fix shares the authoritative boundary calculator with the prompt path and emits `SCHEDULE_BOUNDARY=10min`: stop at the event start, leave the remaining rest unexecuted, and do not auto-decide absence/completion.
- Initial exact Preview `a7a1a5fba44ed29872cde0dd655e129b81262685` passed Safety #277 and Vercel. Live play blocked the 120-minute skip and preserved attendance choice, but exposed a second inconsistency: the prose/event reached noon while the runtime clock stayed at 11:50 because any model choices suppressed the local floor.
- Initial review `PRR_kwDOT8LCAs8AAAABKkOr9A` found two direct P1s: reachable boundaries beyond the minimum or equal to an explicit duration were omitted, while due/overdue rows created a contradictory 0-minute hard stop that froze new committed actions. One separate P2 remains non-blocking.
- The current local closure selects only strictly future boundaries for model hard stops, uses the full permitted action range including equality, and aligns the runtime clock only when structured event progress matches an occurrence scheduled at that exact future minute. Due/overdue and unrelated early interruptions remain unforced.
- Exact Preview `d898734cc190c2115078d8191f273215f99ced46` confirmed the schedule fix end-to-end: 11:50 -> 12:00, unchanged room, active/non-completed orientation, attendance choice preserved. All other GAME acceptance classes passed in isolated UI saves.
- Its CONTINUE case exposed a separate narrative hard-freeze P1: the raw pending-beat text caused a new NPC action and replayed dialogue despite zero State Delta. The local closure hides `remaining_beats` from the routed model view, keeps the original queue in post-response runtime state, and explicitly forbids prior-dialogue replay.
- Final runtime exact HEAD `636458e2aef899022d320324aa14b0f654e72ea5` passed the affected Preview reruns: CONTINUE stayed at 09:15/library entrance with static prose only and no new NPC dialogue/action, while the schedule case again reached exactly 12:00 in the room with an active/incomplete orientation and preserved player choice.
- Direct review thread `PRRT_kwDOT8LCAs6bj9L0` then identified one remaining P1: `event_progress` is optional, so a response that clearly presents the exact schedule only in prose could still leave the clock at 11:50. The local closure aligns on either the exact occurrence ID or a bounded authoritative event-title match at that exact minute, without forcing unrelated interruptions.
- Focused CONTINUE/Event/router/time-floor tests, full `node scripts/lumensia-pr-check.mjs`, and `git diff --check`: **PASS**.
- Exact code HEAD `e4de523b37f3508d4fc6534ff4aa49df3fd74b05` passed Safety #282, Vercel, and the schedule Preview rerun: exact 12:00, unchanged room, active/incomplete `knight_orientation`, player choices preserved.
- Fresh review `PRR_kwDOT8LCAs8AAAABKkUk7Q` on `d1ada8288c62bf55a6c41e09485959b568a3a5c8` found three current P1s: unrelated NPC/world schedules can become PC hard stops; a CONTINUE beat hidden from the model is still consumed; and short travel/exit/explore/observe can be stretched to a later schedule boundary instead of only being capped.
- The repository's two Codex-local automatic fix/review iterations are exhausted. No third automatic fix was attempted; PR #35 is not merge-ready.
- The user subsequently authorized a new remediation cycle and instructed Codex to automate all safe work through guarded exact-head merge and post-merge continuation.
- The local remediation jointly closes the three findings: schedule boundaries are filtered to PC-owned/general-academic/own-department relevance; later boundaries for short actions are `SCHEDULE_CAP` rather than mandatory targets; and frozen CONTINUE preserves every model-hidden pending beat.
- Focused Scene Momentum, schedule-floor, Context Router, Event Progress, CONTINUE, core-invariant tests and the full `node scripts/lumensia-pr-check.mjs` pass.
- Published exact HEAD `fc94fa55af1adfbcd921c2b919236d017c5503e3` passed Safety Gate #285 and Vercel Ready. Fresh direct review produced no P0, two nonblocking P2s, and one P1: the UI promised that the deliberately hidden legacy beat queue would be generated by CONTINUE even though the hard-freeze path cannot consume it safely.
- The current closure stops advertising hidden beats as executable: CONTINUE has no queue count or next-beat promise and truthfully describes static same-moment elaboration, while the unseen queue remains preserved rather than silently consumed. A permanent runtime regression covers this contract.

## Critical review finding and merged closure
Final Codex review **did complete** on exact HEAD `8ca24ba...` at 2026-08-23 21:47:49 UTC and found a **new current P1**.

- Thread: `PRRT_kwDOT8LCAs6biXWm`
- Review comment: `PRRC_kwDOT8LCAs7k3PCq`
- Path: `api/lib/context-router.js`, around current line 422
- Finding: **Reserve the Scene Momentum directive under input pressure**

Merged closure:
- the P1 is fixed by reserving `SCENE MOMENTUM HF1` separately from prefix-clipped optional context;
- an exactly-5000-character ROUTINE action ending in `도서관에 간다.` keeps minimum SAVE_STATE, Momentum + `INTENT=travel`, Directors, Schedule, and the final committed predicate within the 9000-character budget;
- CONTINUE keeps `INTENT=continue-freeze`; AUTO keeps normal world-flow routing;
- focused tests and full local `node scripts/lumensia-pr-check.mjs` pass.

This means:
- the input-pressure P1 is closed on main;
- completed HF1 diagnosis must not be restarted;
- the active phase is Live-play acceptance, then Scene Purpose / Scene Exit / Turn Hook / Event Consequence.

---

# 1. PROJECT / ARCHITECTURE INVARIANTS

Lumensia Academy is a mobile/PWA long-running AI RPG. The player owns PC decisions; the model is GM + independent world simulator.

Stable architecture:
- `index.html -> app-runtime.js -> app.js`
- external endpoint `/api/chat-router`
- stable adapter `api/chat-router.js`
- canonical core `api/chat.js`
- `api/health.js`
- `api/lib/context-router.js`
- stable filenames only; no versioned duplicate router/runtime.
- normal GAME turn = **exactly one canonical `coreHandler()` / model call**.
- `store:false`, prompt cache + 24h retention remain.

`app.js` has intentional stable base `APP_VERSION='1.4.8'`. Do not bump it just because runtime/health are 1.5.6.

Context Router target / soft budgets:
- continue 11K / 14K
- routine 17K / 20K
- scheduled 18K / 20K
- important 20K / 23K
- critical 24K / 30K

---

# 2. PLAYER SOVEREIGNTY / WORLD SIMULATION

Aaa is PC placeholder, not NPC.

Never invent the PC's:
- new action
- new dialogue
- emotion/thought
- accept/reject
- goal/intention

Semantic compression is allowed only for decision-free intermediate steps of an action the user already committed.

META = game-clock freeze. Do not advance time/location/turn/relationship/memory/schedule/hook/emotion/event because of META.

CONTINUE = same-moment hard freeze. It may extend prose from the same moment, but must not require or imply new time/location/NPC entry/relationship/memory/growth/schedule/event progression.

World/NPC rules:
- schedule and world can advance without PC attention;
- NPCs have goals/schedules/relationships/memory;
- NPCs may approach/speak/move/leave/interact with other NPCs first;
- public event -> observation/rumor -> other-NPC reaction -> later consequence is allowed;
- relationship changes should preserve `CAUSE -> EXPRESSION -> FOLLOWUP`;
- FACT / OBSERVER / BELIEF / RUMOR / PROMISE / DEFERRED_HOOK distinctions remain;
- schedule never licenses forced PC teleport or stolen choice.

Combat/growth:
- no automatic success;
- weigh capability, preparation, information, experience, matchup, distance, timing, terrain, fatigue, injury, psychology;
- XP/growth only from actual training, real combat, failure/correction/insight;
- no spontaneous awakening/skill/bloodline/artifact invention.

---

# 3. MERGE / AUTOMATION SAFETY — MUST NOT BE WEAKENED

Review-race lessons from prior handovers:
- generic PR reaction/timestamp is not current-review authority;
- use immutable exact HEAD + occurrence/generation review cycle;
- same SHA after A -> B -> A is a new occurrence;
- ChatGPT GitHub connector / Codex Cloud push / GitHub Actions PAT are distinct identities/transports.

Auto-merge:
- only LOW-RISK guarded changes may auto-merge;
- API/core/runtime/automation/security/persistence/CANON = protected/high-risk -> manual merge only;
- PR #33 = manual merge only.

Protected merge authority requires all of:
1. Safety PASS
2. Vercel PASS
3. exact-current-HEAD/current-base Codex P0/P1=0
4. no conflict / mergeable
5. authoritative current main
6. `base_commit.sha == current main`
7. `merge_base_commit.sha == current main`
8. behind=0
9. immediate pre-merge refetch of main + exact head
10. manual merge guarded by `expected_head_sha`

Past sticky `Lumensia Merge Readiness` states have contradicted direct live review threads. **Sticky READY is supplementary only. Direct current thread evidence wins.**

---

# 4. CURRENT MERGED FOUNDATION

Already in main before PR #33:
- PLAYER ACTION COMMIT
- CONTINUE reliability
- Scene Continuity
- monotonic Event Beat / CONTINUE no replay
- Merge Readiness / Discord / exact-head current-base safety
- guarded LOW-RISK Auto-PR/Auto-Merge smoke proof
- PR #30: V1.5.5 NPC Motivation + Relationship Reason V1
- PR #31: V1.5.6 NPC Goal V2
- PR #32: characters-v2 refresh

Asset truth:
- 32 characters
- default + 12 expressions
- 448 V2 URL contract
- Anastasia default exists
- PNG legacy disabled
- unknown expression must not fabricate arbitrary URL

---

# 5. PR #33 — SCENE MOMENTUM RECOVERY HF1

Goal:

`User Action -> semantic intent -> compress trivial intermediate steps -> world/NPC/event progression -> real State Delta -> consequence -> narration -> meaningful player decision -> STOP`

Original Lumensia logs are the pace/prose standard. Prefer scene-driven novel prose over report-style narration, but never hide low State Delta behind prettier prose.

## Implemented behavior
### State Delta per Turn
Tracks meaningful progress in:
- location / time
- NPC entry / exit / dialogue / state
- new information / memories / hooks
- event progress
- relationships
- goals/objectives
- resources/growth
- schedule changes
- world threads/rumors/consequences
- danger/environment

`scene_title` or wording-only rewrite is not progress.

### Narrative Compression
Compress low-decision-value:
- ordinary movement
- doors/corridors/stairs
- waiting
- routine rest
- unchanged repeated observation

Do not compress through danger or meaningful player judgment.

### Intent / agency guards already implemented
- `마법과 건물로 간다` != magic-use decision
- Korean travel particle `에`
- object-qualified observation
- companion travel target extraction
- outdoor exit does not invent indoor route
- negated exterior/explore/consequential actions do not execute
- `휴식하지 않고 도서관에 간다` does not rest
- `좀 쉴까?` / `밖으로 나갈까?` are deliberation
- `잠든 이사벨을 깨운다` / `기다린 학생에게 말을 건다` / `탐색대에게 상황을 묻는다` respect actual PC predicate
- explicit 5-minute rest/wait beats generic floor
- compound hour+minute duration works
- historical time phrases do not become action duration
- question-form compressed-looking inputs do not execute

### Event / schedule
- paused event null != completion
- real completion counts
- completed beats monotonic
- CONTINUE no replay
- local post-response floor cannot cross full authoritative scheduled event boundary
- local forced floor <=1440 minutes
- positive model-produced advance is never reduced

### NPC Initiative / Event Director
NPC/world may act first when canon/location/schedule/knowledge/relationship permit.
Goals only weight already-eligible candidates.
Always preserve:
- direct user focus
- callback/payoff priority
- surprise cooldown
- physical/schedule eligibility
- present-participant exclusion
- NO_EVENT
- AFTERMATH fixed flow
- active-combat fixed flow

---

# 6. IMPORTANT IMPLEMENTATION / FIX COMMITS

### Base integration/test point
`df382f3b0ab91b97f8f88f2b50667aa4b5553892`

### Router authority P1 closure
`1e23cec5dc4b19ddce2a089f01b8a6e393b45f71`

Fixed:
- schedule event `note` retention;
- NPC schedule `activity` / `commitment` / `confidence` through compaction;
- bounded minimum authoritative SAVE_STATE under ~5000-char action pressure;
- routine input <=9000 while SAVE_STATE + GM Director + Event Director V2.1 + Schedule + final USER ACTION survive;
- AFTERMATH / active combat remain fixed before momentum random selection.

Hosted: Safety #255 PASS / Vercel PASS.

### Initial deterministic time-floor closure
`b8c5a8bf3556566e85a532e4fe92c09f8423add8`

Fixed routed boundary cap, already-due suppression, 1440 max, positive model advance preservation.
Hosted: Safety #256 PASS / Vercel PASS.

### Momentum-accounting correctness closure
`e5ac6c50bcfb7046b7754503df8c394817a4ab12`

Fixed compound duration, no-op numeric growth, NPC double-count, meaningful-choice STOP, identical `pc_status`, CONTINUE `CONTINUE HARD FREEZE`.

### Full-authoritative-schedule + timed-predicate closure
`7e953b5c6158a7bb51e6c5d80b5da0bbdc024f8a`

Fixed:
- full `saveState.scheduledEvents` boundary, not just 4-hour `scheduleContext.upcoming`;
- completed/cancelled schedule ignored;
- overdue unfinished schedule = boundary 0;
- later same-day and next-day boundary;
- historical `10분 전에 ...` no longer treated as action duration;
- duration parsing limited to wait/rest/timed deliberation.

Hosted: Safety #259 PASS / Vercel PASS.

### Question-form compressed-action P1 closure
`f5a64452d1dcd671cafa30ab033bb05e13308e2b`

Question-form travel/observe/explore/wait/rest/exterior-like input -> `decision-sensitive`, `compression=false`, `minAdvanceMinutes=0`.
Permanent regression examples:
- `도서관에 간다?`
- `주변을 살핀다?`
- `주변을 돌아다닌다?`
- `10분 기다린다?`
- `쉰다?`

Hosted: Safety #260 PASS / Vercel PASS.

### Final docs head before this stop handover
`8ca24ba0d4df31807bf89c1d066317b0329cf18e`

Hosted:
- Safety #261 PASS
- Vercel PASS
- compare ahead 41 / behind 0
- base_commit == current main
- merge_base == current main
- PR mergeable=true

BUT this exact head's final Codex review found the new P1 below, so it is not merge-authorized.

---

# 7. FINAL-REVIEW P1 — FIXED IN CURRENT CANDIDATE

## P1: Reserve Scene Momentum directive under input pressure
Thread: `PRRT_kwDOT8LCAs6biXWm`  
Comment: `PRRC_kwDOT8LCAs7k3PCq`  
File: `api/lib/context-router.js` around current line 422

### What is wrong
Current routing protects:
- minimum authoritative SAVE_STATE
- GM/Event Director/Schedule authority tail
- final USER ACTION

But `===== SCENE MOMENTUM HF1 =====` still lives in `optionalContext`.

`composeRoutedInput()` prefix-clips `optionalContext` under budget pressure. With a supported ~5000-character routine action, optional context can be exhausted before the trailing Scene Momentum block.

Example consequence:
- long user action ends in `도서관에 간다.`;
- server-side classifier still knows it is travel;
- model may not receive `INTENT=travel`, compression rule, or stall pressure because the Scene Momentum directive was clipped;
- post-response adapter can still apply deterministic time floor/state logic;
- prose and persisted/runtime state may diverge;
- momentum recovery is disabled under exactly the input-pressure case that needs deterministic routing.

### Implemented fix
`SCENE MOMENTUM HF1` now has its own `reservedContext` and is composed after clipped optional context but before the existing Director/Schedule authority tail and final USER ACTION.

Must preserve all existing reserved contracts:
- minimum SAVE_STATE
- GM Event Director
- Event Director V2.1
- Schedule Engine
- final USER ACTION
- input budget
- one canonical model call
- CONTINUE hard freeze
- GAME/AUTO existing behavior

### Permanent regression
Router authority tests now use an exactly-5000-character ROUTINE action ending in `도서관에 간다.`.

Assert:
- routine routed input stays within expected 9000-char budget;
- minimum authoritative SAVE_STATE survives;
- GM Director survives;
- Event Director V2.1 survives;
- Schedule survives;
- final USER ACTION survives in bounded form;
- `===== SCENE MOMENTUM HF1 =====` survives;
- `INTENT=travel` survives;
- no extra core/model call;
- full `node scripts/lumensia-pr-check.mjs` PASS.

Additional mode regressions prove CONTINUE retains `INTENT=continue-freeze` and AUTO retains normal `INTENT=generic` routing under optional-context pressure.

---

# 8. REVIEW STATE AT HANDOVER

PR #33 final authority and merge:
- exact reviewed HEAD `216bef1d51b72f2edb6da3f06c69e02aa45b5b10`;
- fresh review `5003519118`, direct P0/P1=0;
- Safety #263 PASS and Vercel PASS;
- ahead 43 / behind 0, base commit and merge-base equal then-current main `f6122be5...`;
- expected-head guarded merge succeeded as `8d378b532910dfecaf5226118bffabdddbe74289`;
- PR is merged/closed and main contains no unexpected merge delta.

Five unresolved non-outdated P2 threads remain useful acceptance evidence. They were non-blocking under repository policy and must not be silently promoted or fixed speculatively; address them only when live-play acceptance demonstrates the behavior.

## Live-play acceptance Round 1

The explicit QA harness is `scripts/qa/live-play-acceptance.mjs`. It calls a selected deployment only when run manually and uses cloned/stateless fixtures, so it neither mutates a user save nor spends API credits during normal CI.

Baseline production run on main `8d378b532910dfecaf5226118bffabdddbe74289`:
- 12 cases total: 7 PASS / 5 initially flagged;
- PASS included short travel, exactly-5000-character travel, wait, direct NPC question, door/location compression, CONTINUE freeze, and NPC initiative;
- mandatory orientation was not skipped by a two-hour rest started ten minutes before it;
- completed entrance ceremony did not replay;
- a fresh meaningful interruption during later travel was a valid STOP, so destination-only acceptance was corrected.

Demonstrated defects fixed in the current branch:
- native-Korean duration phrases `한 시간`, `두 시간`, and compound forms now route as explicit downtime;
- `게시판을 다시 확인한다.` remains observe intent;
- `도서관에 갈까?` and `도서관에 갈지 고민한다.` are decision-sensitive, receive no travel floor, and do not execute movement.

Focused regressions and the full local PR check pass. The next authority step is hosted deployment of the exact candidate, then the same 12-case live rerun against that deployment.

PR #34 candidate authority:
- hosted head `cd5b711f47be99fbe321fb2eddc6c5d8d3eff568` passed Safety #265 and Vercel Ready;
- compare is ahead 2 / behind 0, and base commit + merge-base are current main `8d378b532910dfecaf5226118bffabdddbe74289`;
- fresh exact-head Codex review `PRR_kwDOT8LCAs8AAAABKj3Erw` found direct P0/P1=0 and P2 suggestions only;
- the follow-up makes explicit durations exact, rejects pre-schedule no-op, verifies full CONTINUE state freeze and completed-event arrays, scans all player-visible fields, detects paraphrased known-fact relists without a hook, and covers `갈까 말까` / `가야 할까` / `갈까요`.

Vercel runtime recovery is complete. The user explicitly authorized Preview scope for the existing `OPENAI_API_KEY`; the value was not viewed, copied, replaced, or exposed. Production scope remained selected. Exact head `58f00adf3fccc071afe59bd4134471874fe14b39` was redeployed as Preview deployment `F4Zua1Ud7EQDazJcvwSB2ZjgryeG` and reached Ready. The authenticated branch alias now reports API 0.8.3 configured with Luna/Terra, Q3, Context Router, Motivation V2, and Scene Momentum.

The native chooser was dismissed, but its event could not be driven reliably. Candidate validation therefore continued through the same exact Preview UI with a naturally constructed sequential game state. Short/long travel, wait, rest, repeated observation, NPC question/initiative, door transition, and schedule-boundary rest passed visibly.

A new live P1 was reproduced: the indirect question `지금 오리엔테이션이 끝난 뒤 대장간에 들를 시간이 있을까?` advanced 12:00 -> 12:40 and completed the active orientation. Root cause was a narrow question classifier that only guarded direct travel predicates. The fix classifies terminal question forms as `decision-sensitive`, injects an explicit same-moment/no-location/no-event-completion sovereignty rule, strengthens the live assertion to zero minutes, and passes focused plus full PR checks. The user does not need to operate a file chooser.

That patch was published as `9972c26a4db39b29fd92bd77824e71a2e802126d`; Safety #268 and Vercel passed, and the exact Preview kept 12:40/location unchanged while answering the indirect question. The next CONTINUE check exposed a reload-only UI P1: duplicate stable flow wrappers caused both CONTINUE buttons to be hidden. The current local fix collapses duplicate wrappers and restores stable button visibility; focused CONTINUE/integration/core tests pass. Publish/redeploy this UI fix next, then run live CONTINUE and completed-event forward.

The UI fix was published as `c90616815c9d058c0c185a87402460803df5b0d8`; Safety #269 and Vercel passed, and reload produced exactly one visible/enabled CONTINUE control. The live CONTINUE kept 12:40/location and the correct route but invented a new Artemis quote and NPC actions. The current local follow-up strengthens the narrative freeze to prohibit new NPC speech/actions and allow only an already-started beat's expression or static sensory detail. Publish and rerun CONTINUE next.

The narrative freeze was published as `96230915c651b7c2d1d436f46f04442813014e6e`; Safety #270 and Vercel passed. Exact Preview CONTINUE kept 12:40/location and produced static sensory prose only. The next committed travel reached 기사과 대장간 at 12:48 without replaying the completed orientation, while Isabel/the smith initiated and left a player response hook. All 12 requested live behavior classes now have sufficient candidate evidence. No code/live blocker remains; only the final docs head gates, fresh exact-head review, and protected manual merge checkpoint remain.

The final direct-thread audit found one applicable P1 before requesting review: the CLI harness did not forward the protected deployment token and could receive `401 BAD_ACCESS_TOKEN`. The current local fix accepts a dedicated `LUMENSIA_LIVE_ACCESS_TOKEN`, conditionally sends `x-lumensia-token`, never logs it, and adds a permanent regression. No token value was read or exposed.

Fresh review `PRR_kwDOT8LCAs8AAAABKkJDNQ` on exact head `b30ad59aba9c242bb4beb549a4f444abd645603e` found one new direct P1: high stall pressure contradicted the question sovereignty freeze. The current local fix omits `SCENE_STALL=true` for `decision-sensitive` turns and adds a regression at stall streak 3. Because the same review's P2 evidence directly matched live failures already reproduced here, the harness also seeds/preserves the active orientation in the question case and rejects new NPC dialogue/action in CONTINUE. Non-reproduced P2s remain non-blocking.

Fresh review `PRR_kwDOT8LCAs8AAAABKkKXOQ` on exact head `acab3594c784fdd3b93a32f1163320e5b4fcdbdd` found one follow-up P1: `있을까.` / `있을까요.` without a question mark still became generic. The current local fix recognizes bounded terminal `까/까요` forms with optional punctuation and keeps them decision-sensitive even at stall streak 3. The related active-event acceptance assertion now rejects `event_progress:null` and requires the same occurrence/beat/completed beats.

---

# 9. PERMANENT TEST COVERAGE

HF1-specific permanent suites:
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/context-router.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
- `scripts/tests/scene-momentum-intent-guards.test.mjs`
- `scripts/tests/scene-momentum-paused-event.test.mjs`
- `scripts/tests/scene-momentum-time-floor.test.mjs`
- `scripts/tests/scene-momentum-correctness.test.mjs`

Plus existing continuation/event/Goal V2/core/debug/assets/migration/automation/readiness tests via `scripts/lumensia-pr-check.mjs` and hosted Safety Gate.

Last green hosted evidence before this docs-only handover update:
- `1e23cec5...`: Safety #255 / Vercel PASS
- `b8c5a8bf...`: Safety #256 / Vercel PASS
- `7e953b5c...`: Safety #259 / Vercel PASS
- `f5a64452...`: Safety #260 / Vercel PASS
- `8ca24ba...`: Safety #261 / Vercel PASS

---

# 10. DO NOT BREAK

Runtime/API:
1. exactly one canonical core/model call per normal turn;
2. stable `/api/chat-router`;
3. adapter wraps canonical `api/chat.js`;
4. stable `api/lib/context-router.js`;
5. `store:false`;
6. prompt cache + 24h retention;
7. established Context Router budgets.

Player agency:
8. never invent independent PC action/dialogue/emotion/thought/accept/reject;
9. semantic compression only for decision-free steps of already-declared action;
10. negated/hypothetical/question actions do not execute;
11. meaningful player judgment is STOP boundary;
12. META hard freeze;
13. CONTINUE same-moment hard freeze.

Event/continuity:
14. completed Event Beats monotonic;
15. CONTINUE no prior state-delta replay;
16. paused null != completion;
17. PC nonattendance does not cancel schedule.

Director/NPC:
18. direct focus wins;
19. callback/payoff wins;
20. location/schedule/knowledge/relationship guards;
21. cooldown;
22. present-participant exclusion;
23. NO_EVENT;
24. goals only weight eligible candidates;
25. blocked/completed/abandoned goals not active motivation;
26. AFTERMATH / active combat fixed flow.

Save/canon/assets:
27. `app.js` 1.4.8 base intentional;
28. neutral new-PC default skills/inventory;
29. no canon/personality/relationship rewrite for convenience;
30. conservative canonical NPC key migrations;
31. characters-v2 current 32-character / 13-state contract.

Merge safety:
32. PR #33 manual merge only;
33. prior-head review cannot authorize current head;
34. A->B->A same SHA is new occurrence;
35. generic reaction is not merge authority;
36. candidate code never accesses privileged secrets;
37. immutable exact HEAD over mutable branch ref;
38. final current-main + merge-base + behind validation;
39. sticky READY cannot override direct current P0/P1 evidence.

---

# 11. AFTER HF1 MERGE — NEXT NARRATIVE PHASE

HF1 merge is not Narrative completion. Do not restart HF1 diagnosis after it merges.

Immediately continue:
1. live-play acceptance with original problematic inputs/screenshots;
2. **Scene Purpose**;
3. explicit **Scene Exit Condition**;
4. stronger **Turn Hook**;
5. **Event Consequence** chaining / lifetime;
6. NPC Initiative / Goal Tick refinement;
7. bounded off-screen progression;
8. deterministic novelty/repetition suppression if live loops remain;
9. multi-system scene orchestration.

Longer roadmap:
- Adaptive Time Scale V2
- Consequence Queue / Lifetime
- Active Threads
- Reputation / faction-social propagation
- Setup -> Payoff memory
- NPC significance / relationship thresholds / knowledge boundaries
- NPC-vs-NPC conflict
- Fail Forward
- Off-screen World Progression expansion
- Multi-System Scene
- Memory Hierarchy
- full report-style -> scene-driven novel prose recovery

Gameplay roadmap discussed but not DONE:
- NPC↔NPC Relationship V1
- Faction / Social Consequence V1
- Skill Learning V1
- Awakening / Talent Evolution V1
- Combat Growth V2
- Living World / Event Director V3 / Long-term Consequence

---

# 12. NEXT ACTION — CURRENT START POINT

1. Read this file and `docs/IMPLEMENTATION_PROGRESS.md` first.
2. Confirm main contains PR #39 squash merge `4516cc162ef34426ef94d29cf5aa6489013927ec`; do **not** redo completed HF1/HF2/HF3, 12-case acceptance, Scene Purpose, or Scene Exit diagnosis.
3. Continue only Stronger Turn Hook V1 on `codex/stronger-turn-hook-v1`. Commit this docs checkpoint, rerun the clean-LF full check, and perform a second exact-diff regression/scope review. Keep Event Consequence out.
4. Push/open the focused PR and require hosted Safety/Vercel plus fresh exact-current-HEAD P0/P1 authority. Exact Preview must cover compressed travel with a concrete next direction, quiet-scene no-fake-choice behavior, NPC direct-response sovereignty, AUTO awaiting-player preservation, and CONTINUE freeze.
5. If every exact-current-head gate is green and no special blocker appears, use the user's explicit merge authorization. Revalidate head/base/mergeability immediately before merge, then verify the merge tree and production health.

---

# NEW CHAT START INSTRUCTION

> `docs/LUMENSIA_HANDOVER_CURRENT.md`와 `docs/IMPLEMENTATION_PROGRESS.md`를 먼저 읽고 Lumensia 프로젝트를 그대로 이어가라. 새 프로젝트가 아니다. PR #39는 exact reviewed head `ba64f9f...`에서 main `4516cc1...`로 병합됐고 production Vercel/health까지 통과했다. HF1/HF2/HF3, 12-case acceptance, Scene Purpose, Scene Exit 진단을 다시 하지 않는다. 현재 branch `codex/stronger-turn-hook-v1`, code checkpoint `8fbab9a...`; bounded `sceneRuntime.turn_hook`, current-action priority, AUTO player boundary, CONTINUE freeze, 9k authority reservation과 focused/adjacent tests가 구현됐다. docs checkpoint를 커밋하고 clean-LF full check/second exact review 후 push/PR/hosted gates/Exact Preview를 진행한다. Event Consequence는 이 PR에 섞지 않는다.`
