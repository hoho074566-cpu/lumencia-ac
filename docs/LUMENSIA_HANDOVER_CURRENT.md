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
- Branch: `codex/scene-momentum-recovery-hf1`
- PR: #33 `Restore Scene Momentum and narrative compression in V1.5.6`
- Current main: `f6122be5f65a7b0b79555b83c9660eb9ed84cb6c`
- Exact PR HEAD before this docs-only handover commit: `8ca24ba0d4df31807bf89c1d066317b0329cf18e`
- Latest code/test commit: `f5a64452d1dcd671cafa30ab033bb05e13308e2b`
- PR state at `8ca24ba...`: open / not draft / `mergeable=true`
- Compare `main...8ca24ba...`: ahead 41 / behind 0
- `base_commit.sha == current main`
- `merge_base_commit.sha == current main`
- Hosted Safety: **#261 PASS**
- Hosted Vercel: **PASS / Ready**
- PR #33 is protected core/runtime work: **manual merge only**.

## Critical new fact from the FINAL exact-head Codex review
Final Codex review **did complete** on exact HEAD `8ca24ba...` at 2026-08-23 21:47:49 UTC and found a **new current P1**.

- Thread: `PRRT_kwDOT8LCAs6biXWm`
- Review comment: `PRRC_kwDOT8LCAs7k3PCq`
- Path: `api/lib/context-router.js`, around current line 422
- Finding: **Reserve the Scene Momentum directive under input pressure**

This means:
- **DO NOT MERGE PR #33 YET.**
- Safety/Vercel/clean compare/mergeable status from `8ca24ba...` are real but insufficient because a current P1 exists.
- The next chat must fix this P1 first, add a permanent regression, rerun all gates, and request another exact-head Codex review.

This handover update itself will create a newer docs-only HEAD. Therefore the next chat must refetch the live PR HEAD and must not assume `8ca24ba...` is still exact current HEAD.

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

# 7. CURRENT BLOCKER — NEW FINAL-REVIEW P1

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

### Required fix
Move `SCENE MOMENTUM HF1` into reserved routed content or give it its own explicit reservation.

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

### Required permanent regression
Extend router authority tests with a supported ~5000-char ROUTINE action ending in `도서관에 간다.` or equivalent compressed intent.

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

---

# 8. REVIEW STATE AT HANDOVER

The final exact-head Codex review for `8ca24ba...` is **complete**, not merely pending.

Review submission:
- Codex review author: `chatgpt-codex-connector`
- reviewed commit: `8ca24ba0d4...`
- submitted: 2026-08-23 21:47:49 UTC
- result: current P1 described above.

Therefore:
- **DO NOT MERGE.**
- previous clean compare/green gates do not override this P1.
- after fixing it, the new code HEAD needs Safety/Vercel + a fresh exact-head Codex review again.
- prior-head review cannot authorize the fix commit.

Some older P2 threads can remain unresolved/non-outdated even though code/tests already cover the cited behavior (for example no-op growth scoring and historical-duration parsing). They are non-blocking by policy but should be rechecked after the P1 fix. Do not silently ignore a newly escalated correctness problem.

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

# 12. NEXT ACTION — NEW CHAT STARTS HERE

1. Read this file and `docs/IMPLEMENTATION_PROGRESS.md` first.
2. Refetch live branch/PR #33 exact HEAD and current main. This docs commit changed HEAD after `8ca24ba...`.
3. Do **not** redo completed HF1 analysis.
4. Open current P1 `PRRT_kwDOT8LCAs6biXWm` and inspect current `api/lib/context-router.js` / authority-tail tests.
5. Fix Scene Momentum directive reservation under ~5000-char routine input pressure.
6. Add permanent regression proving `SCENE MOMENTUM HF1` + `INTENT=travel` survive together with minimum SAVE_STATE + Director/V2/Schedule + final action within budget.
7. Run focused tests + full `node scripts/lumensia-pr-check.mjs`.
8. Commit the code/test fix.
9. Hosted Safety PASS + Vercel PASS on the new exact code HEAD.
10. Request fresh exact-current-HEAD/current-main Codex review.
11. Directly inspect unresolved non-outdated P0/P1; sticky READY alone is insufficient.
12. If and only if true current P0/P1=0: final main/head compare, base_commit==main, merge_base==main, behind=0, mergeable/no conflict, then manual `expected_head_sha` merge.
13. Verify merged main, production Vercel and `/api/health`.
14. Continue into **Scene Purpose -> Scene Exit Condition -> Turn Hook -> Event Consequence**.

---

# NEW CHAT START INSTRUCTION

> `docs/LUMENSIA_HANDOVER_CURRENT.md`와 `docs/IMPLEMENTATION_PROGRESS.md`를 먼저 읽고 긴빠이/Lumensia 프로젝트를 그대로 이어가라. 새 프로젝트가 아니다. 완료된 HF1 진단을 다시 분석하지 말고 GitHub live main / PR #33 exact HEAD부터 확인한다. 직전 exact head `8ca24ba...`는 Safety #261 PASS, Vercel PASS, compare ahead 41/behind 0, base+merge-base=current main, mergeable=true였지만 FINAL Codex exact-head review가 current P1 `PRRT_kwDOT8LCAs6biXWm`을 발견했다. 문제는 긴 (~5000자) ROUTINE USER ACTION에서 `SCENE MOMENTUM HF1`이 optionalContext prefix clipping으로 빠질 수 있어 model narration과 post-response deterministic state/time-floor가 어긋날 수 있다는 것이다. `api/lib/context-router.js`에서 Scene Momentum directive를 reserved content/own reserved budget으로 옮기고, minimum SAVE_STATE + GM Director + Event Director V2.1 + Schedule + final USER ACTION + Scene Momentum/INTENT=travel가 모두 budget 안에서 살아남는 permanent regression을 추가한다. full `node scripts/lumensia-pr-check.mjs` PASS 후 commit -> hosted Safety/Vercel -> fresh exact-head Codex review -> direct P0/P1=0 -> final main/merge-base/behind/conflict 검증 -> protected PR #33 expected_head_sha manual merge 순서다. Sticky READY가 direct current threads와 충돌하면 sticky를 신뢰하지 않는다. HF1 merge 뒤에는 Scene Purpose / Scene Exit Condition / Turn Hook / Event Consequence로 바로 계속한다.`
