# LUMENSIA — CURRENT INTEGRATED DEVELOPMENT HANDOVER

작성 기준: 2026-08-24  
프로젝트: 긴빠이 프로젝트 / Lumensia Academy  
Repository: `hoho074566-cpu/lumencia-ac`

> 이 문서는 새 프로젝트 시작 문서가 아니다. HANDOVER 1(2026-08-19) → HANDOVER 2(2026-08-22) → HANDOVER 3(2026-08-23) → V1.5.5 NPC Motivation / Relationship Reason → V1.5.6 NPC Goal V2 → Scene Momentum Recovery HF1까지의 누적 Source of Truth다.
>
> 과거 핸드오버의 설계 이유와 안전장치는 계속 유효하다. SHA / PR / checks처럼 변하는 값은 항상 GitHub live 상태가 우선한다. 완료된 HF1 진단을 처음부터 재분석하지 말고 이 문서의 NEXT ACTION부터 이어간다.

---

# PROJECT / ARCHITECTURE INVARIANTS

Lumensia Academy는 모바일/PWA 기반 장기 AI RPG다. 사용자가 PC의 행동과 대사를 직접 결정하고, AI는 GM + 독립적으로 움직이는 세계 시뮬레이터 역할을 한다.

Stable architecture:
- `index.html -> app-runtime.js -> app.js`
- external endpoint `/api/chat-router`
- stable adapter `api/chat-router.js`
- canonical core `api/chat.js`
- `api/health.js`
- `api/lib/context-router.js`
- stable filenames 유지; versioned duplicate router/runtime 생성 금지.
- 정상 GAME turn은 **정확히 one canonical `coreHandler()` / model call**.
- `store:false`, prompt cache + 24h retention 유지.

`app.js`의 `APP_VERSION='1.4.8'`은 intentional stable base architecture다. runtime/health가 1.5.6이라고 해서 app.js를 임의로 올리지 않는다.

---

# PLAYER SOVEREIGNTY / WORLD SIMULATION

Aaa는 NPC가 아니라 PC placeholder다.

GM이 임의 확정하면 안 되는 것:
- PC의 새 행동
- 새 대사
- 감정/생각
- 수락/거절
- 목표/의도

Semantic compression은 사용자가 **이미 선언한 행동**의 decision-free intermediate steps만 처리한다.

META는 GAME CLOCK FREEZE다. META 질문 때문에 시간/장소/턴/관계/기억/일정/훅/감정/이벤트를 진행시키지 않는다.

CONTINUE는 same-moment hard freeze다. 직전 장면을 문학적으로 이어 쓰되 새 시간/위치/NPC 출입/관계/기억/성장/일정/이벤트 진행을 요구하지 않는다.

World simulation:
- 일정과 세계는 PC 없이도 진행 가능.
- NPC는 목표/일정/관계/기억을 가지고 독립 행동.
- NPC가 먼저 접근/말하기/이동/퇴장/NPC-NPC 상호작용 가능.
- 공개 사건 → 관찰/소문 → 다른 NPC 반응 → 후속 사건 가능.
- 관계 변화는 `CAUSE -> EXPRESSION -> FOLLOWUP`가 중요.
- FACT / OBSERVER / BELIEF / RUMOR / PROMISE / DEFERRED_HOOK 구분 유지.
- 일정 때문에 PC를 강제 순간이동하거나 선택을 대신하지 않는다.

Combat/growth:
- 시도 자동 성공 금지.
- 능력/준비/정보/경험/상성/거리/타이밍/지형/피로/부상/심리 종합.
- 성장/스킬 XP는 실제 훈련·실전·실패·교정에서 천천히.
- 즉흥 각성/스킬/혈통/유물 생성 금지.

---

# AUTOMATION / MERGE SAFETY — HANDOVER 2/3 RATIONALE

Context Router budgets 유지:
- continue 11K / 14K
- routine 17K / 20K
- scheduled 18K / 20K
- important 20K / 23K
- critical 24K / 30K

Review/automation race에서 확정된 원칙:
- PR-level generic reaction/timestamp만으로 current review 추론 금지.
- immutable exact HEAD + occurrence/generation별 review cycle 사용.
- 같은 SHA라도 `A cycle1 -> B -> A cycle2`는 다른 occurrence.
- ChatGPT GitHub connector / Codex Cloud push / GitHub Actions PAT는 다른 identity/transport다.

Auto-merge policy:
- LOW-RISK만 guarded auto-merge 가능.
- API/core/runtime/automation/security/persistence/CANON 등 protected/high-risk는 manual merge only.
- PR #33은 protected core/runtime 변경이므로 **manual merge only**.

Protected merge authority:
1. Safety PASS
2. Vercel PASS
3. exact-current-HEAD/current-base Codex P0/P1=0
4. no conflict
5. authoritative current main
6. `merge_base_commit.sha == current main`
7. merge 직전 main/head 재검증

`pull.base.sha`만 current main으로 믿지 않는다. Compare `main...exact immutable HEAD`에서:
- `base_commit.sha == current main`
- `merge_base_commit.sha == current main`
- behind=0
을 요구한다.

과거 sticky `Lumensia Merge Readiness`가 direct current unresolved P1과 충돌한 실제 사례가 있었다. **Sticky READY는 단독 merge authority가 아니다. Direct current review evidence가 우선한다.**

---

# CURRENT MERGED FOUNDATION

Main에 이미 병합된 것:
- PLAYER ACTION COMMIT
- CONTINUE reliability
- Scene Continuity
- monotonic Event Beat / CONTINUE
- Merge Readiness / Discord / exact-head current-base safety
- guarded LOW-RISK Auto-PR/Auto-Merge V1.2 smoke proof
- PR #30: V1.5.5 NPC Motivation + Relationship Reason V1
- PR #31: V1.5.6 NPC Goal V2
- PR #32: characters-v2 refresh

Current asset truth:
- 32 characters
- default + 12 expressions
- 448 V2 URL contract
- Anastasia default exists
- PNG legacy disabled
- unknown expression은 임의 URL 합성 금지

---

# CURRENT WORK — PR #33 SCENE MOMENTUM RECOVERY HF1

Branch: `codex/scene-momentum-recovery-hf1`

Scene Momentum goal:

`User Action -> semantic intent -> compress trivial intermediate steps -> world/NPC/event progression -> real State Delta -> consequence -> narration -> meaningful player decision -> STOP`

원작 Lumensia 로그가 pace + prose gold standard다. Report-style narration보다 scene-driven novel prose를 우선하되, prose로 낮은 State Delta를 숨기지 않는다.

## Important implementation/fix commits

### Base implementation/test HEAD before integrated handover
`df382f3b0ab91b97f8f88f2b50667aa4b5553892`

### Router authority P1 closure
`1e23cec5dc4b19ddce2a089f01b8a6e393b45f71`

Applied exact tested diff preserved in PR #33 comment `#5386396220`:
- schedule event `note` retained;
- NPC schedule `activity` / `commitment` / `confidence` retained through all compaction tiers;
- minimum authoritative SAVE_STATE reserved under ~5000-char action pressure;
- routine input <=9000 while SAVE_STATE + GM Director + Event Director V2.1 + Schedule + final USER ACTION survive;
- `AFTERMATH_FIXED_FLOW` and `ACTIVE_COMBAT_FIXED_FLOW` before momentum random selection.

Hosted: Safety #255 PASS / Vercel PASS.

### Initial deterministic time-floor closure
`b8c5a8bf3556566e85a532e4fe92c09f8423add8`

- forced Scene Momentum floor stops at nearest routed schedule boundary;
- already-due schedule suppresses local floor;
- local floor capped at canonical 1440 minutes;
- positive model-produced `advance_minutes` is never reduced;
- permanent `scene-momentum-time-floor.test.mjs`.

Hosted: Safety #256 PASS / Vercel PASS.

### Momentum-accounting correctness closure
`e5ac6c50bcfb7046b7754503df8c394817a4ab12`

- compound `1시간 30분 쉰다/기다린다` support;
- numeric delta 0 growth rows do not fake progress;
- NPC state mutation does not double-count as `npcAction`;
- fresh meaningful `choices` satisfy STOP and do not build false stall;
- identical echoed `pc_status` is not progress;
- CONTINUE gets `CONTINUE HARD FREEZE` momentum replacement;
- permanent `scene-momentum-correctness.test.mjs`.

### Fresh full-schedule + historical-duration P1/P2 closure
`7e953b5c6158a7bb51e6c5d80b5da0bbdc024f8a`

Fresh direct review found:
- **P1:** `scheduleContext.upcoming` only covers about four hours, so a long rest could cross a later authoritative `scheduledEvents` entry.
- **P2:** `10분 전에 본 게시판을 확인한다` could incorrectly treat the historical `10분` as action duration.

Fixed:
- `nextScheduleBoundaryMinutes()` now checks authoritative `saveState.scheduledEvents` plus routed upcoming schedule using absolute date/time minutes;
- completed/cancelled schedule rows ignored;
- overdue unfinished schedule = boundary 0;
- later same-day and next-day schedule boundary caps local forced time;
- positive model-produced advance remains untouched;
- explicit duration parsing only runs for actual wait/rest predicates or timed deliberation;
- `10분 전에 본 게시판을 확인한다` => observe, `explicitDurationMinutes:null`;
- tests expanded for full schedule, next-day schedule, terminal rows, overdue schedule, model-positive preservation, historical observation.

Hosted: Safety #259 PASS / Vercel PASS.

### Fresh question-form compressed-action P1 closure
`f5a64452d1dcd671cafa30ab033bb05e13308e2b`

Direct review found that question-form actions such as `도서관에 간다?` could still match compressed intent regexes and execute.

Fixed:
- question-form exterior/travel/observe/explore/wait/downtime-like inputs are `decision-sensitive`;
- `compression=false`;
- `minAdvanceMinutes=0`;
- permanent regression cases:
  - `도서관에 간다?`
  - `주변을 살핀다?`
  - `주변을 돌아다닌다?`
  - `10분 기다린다?`
  - `쉰다?`

Hosted: **Safety #260 PASS / Vercel PASS.**

This handover/progress update will move the branch HEAD with docs-only changes. **Next session must refetch the live PR HEAD; never assume `f5a64452...` remains final.**

---

# HF1 BEHAVIOR NOW IMPLEMENTED

## State Delta per Turn
Real progress tracks relevant changes in:
- location / time
- NPC entrance / exit / dialogue / state
- new information / memory / hooks
- event progression
- relationships
- goals/objectives
- resources/growth
- schedules
- world threads/rumors/consequences
- danger/environment

`scene_title`/prose-only rewrite is not progress.

## Narrative Compression
Compress low decision-value:
- ordinary movement
- doors/corridors/stairs
- waiting
- routine rest
- repeated unchanged observation

Do not compress through meaningful danger or player choice.

## Intent / agency guards
Handled examples:
- `마법과 건물로 간다` ≠ magic-use decision
- Korean travel particle `에`
- object-qualified observation
- companion travel destination extraction
- already-outdoor exit does not fabricate indoor route
- negated exterior/explore/consequential actions do not execute
- `휴식하지 않고 도서관에 간다` does not rest
- `좀 쉴까?` / `밖으로 나갈까?` are deliberation
- `잠든 이사벨을 깨운다` / `기다린 학생에게 말을 건다` / `탐색대에게 상황을 묻는다` respect actual PC predicate
- explicit 5-minute rest/wait overrides generic floor
- compound hour+minute duration supported
- historical time phrases do not become action duration
- question-form compressed inputs do not execute

## Event / schedule semantics
- paused event null != completion
- real completion still counts
- completed beats monotonic
- CONTINUE no replay
- local post-response floor cannot silently cross full authoritative schedule boundary
- local forced floor never exceeds 1440 minutes

## NPC Initiative / Director
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
- active combat fixed flow

---

# PERMANENT TEST COVERAGE

HF1-specific permanent suites:
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/context-router.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
- `scripts/tests/scene-momentum-intent-guards.test.mjs`
- `scripts/tests/scene-momentum-paused-event.test.mjs`
- `scripts/tests/scene-momentum-time-floor.test.mjs`
- `scripts/tests/scene-momentum-correctness.test.mjs`

Plus existing continuation/event/Goal V2/core/debug/assets/migration/automation/readiness suites through `scripts/lumensia-pr-check.mjs` / hosted Safety Gate.

Known hosted code-head evidence:
- `1e23cec5...`: Safety #255 PASS / Vercel PASS
- `b8c5a8bf...`: Safety #256 PASS / Vercel PASS
- `7e953b5c...`: Safety #259 PASS / Vercel PASS
- `f5a64452...`: Safety #260 PASS / Vercel PASS

The docs-updated exact HEAD still needs its own final hosted cycle.

---

# DO NOT BREAK

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
11. meaningful player judgment is the STOP boundary;
12. META hard freeze;
13. CONTINUE same-moment hard freeze.

Event/continuity:
14. completed Event Beats monotonic;
15. CONTINUE no prior state-delta replay;
16. paused null != completion;
17. PC nonattendance does not cancel schedules.

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
29. no canon/personality/relationship rewrites for convenience;
30. conservative canonical NPC key migrations;
31. characters-v2 current 32 / 13-state contract.

Merge safety:
32. PR #33 manual merge only;
33. prior-head review cannot authorize current head;
34. A→B→A same SHA = new occurrence;
35. generic reaction is not merge authority;
36. candidate code must never access privileged secrets;
37. immutable exact HEAD over mutable branch ref;
38. final current-main + merge-base + behind validation;
39. sticky READY cannot override direct current P0/P1 evidence.

---

# FINAL REMAINING WORK BEFORE HF1 MERGE

1. Commit this handover + `docs/IMPLEMENTATION_PROGRESS.md` refresh.
2. Refetch the resulting exact PR HEAD.
3. Verify Safety PASS + Vercel PASS on that exact docs HEAD.
4. Request a **fresh exact-current-HEAD/current-main Codex review** after the docs commit.
5. Directly inspect current non-outdated unresolved threads.
6. Require true current P0/P1=0. P2/P3 are normally non-blocking, but do not ignore a fresh correctness regression blindly.
7. Immediately before merge:
   - refetch exact PR HEAD;
   - refetch current main;
   - Compare `main...exact HEAD`;
   - require `base_commit == current main`;
   - require `merge_base == current main`;
   - require behind=0;
   - require mergeable/no conflict;
   - Safety PASS;
   - Vercel PASS;
   - exact-current-HEAD Codex P0/P1=0.
8. Manual merge with `expected_head_sha`.
9. Verify merged main, production Vercel and `/api/health`.

---

# AFTER HF1 MERGE — NEXT NARRATIVE PHASE

HF1 merge is not Narrative completion. Do not restart HF1 diagnosis.

Immediately continue:
1. live-play acceptance using original problematic inputs/screenshots;
2. **Scene Purpose**;
3. explicit **Scene Exit Condition**;
4. stronger **Turn Hook**;
5. **Event Consequence** chaining / lifetime;
6. NPC Initiative / Goal Tick refinement;
7. bounded off-screen world progression;
8. deterministic novelty/repetition suppression if live loops remain;
9. multi-system scenes combining schedule/goals/relationships/event consequence.

Longer roadmap:
- Adaptive Time Scale V2
- Consequence Queue / Lifetime
- Active Threads
- Reputation / faction-social propagation
- Setup → Payoff memory
- NPC significance / relationship thresholds / knowledge boundaries
- NPC-vs-NPC conflict
- Fail Forward
- Multi-System Scene
- Memory Hierarchy
- full report-style → scene-driven novel prose recovery

Gameplay roadmap discussed but not DONE:
- NPC↔NPC Relationship V1
- Faction / Social Consequence V1
- Skill Learning V1
- Awakening / Talent Evolution V1
- Combat Growth V2
- Living World / Event Director V3 / Long-term Consequence

---

# NEXT ACTION

The next work session starts here:

1. Read this file and `docs/IMPLEMENTATION_PROGRESS.md`.
2. Refetch GitHub live current main / PR #33 exact HEAD / review threads / Safety / Vercel.
3. Do not redo completed HF1 diagnosis.
4. Verify final docs HEAD hosted Safety + Vercel.
5. Request fresh exact-current-HEAD/current-main Codex review.
6. Directly inspect unresolved non-outdated P0/P1 threads; sticky READY alone is insufficient.
7. If true current P0/P1=0, do final compare/current-main/merge-base/behind/conflict revalidation and manual `expected_head_sha` merge.
8. Verify production/main/health.
9. Continue directly into **Scene Purpose / Turn Hook / Event Consequence**.

---

# NEW CHAT START INSTRUCTION

> `docs/LUMENSIA_HANDOVER_CURRENT.md`와 `docs/IMPLEMENTATION_PROGRESS.md`를 먼저 읽고 긴빠이/Lumensia 프로젝트를 그대로 이어가라. 이건 새 프로젝트가 아니다. 완료된 HF1 진단은 재분석하지 말고 GitHub live main / PR #33 exact HEAD / current review threads / Safety / Vercel부터 확인한다. Router authority, full authoritative schedule time-floor, 1440 cap, timed-predicate duration parsing, no-op delta/NPC double-count/choice-stop/pc-status correctness, CONTINUE hard freeze, question-form compressed-action guards까지 구현되어 있다. 다음 작업은 docs-updated exact HEAD의 hosted gates + fresh exact-current-HEAD Codex P0/P1=0을 직접 확인하고 final current-main/merge-base/behind/no-conflict 재검증 뒤 protected PR #33을 expected_head_sha로 수동 병합하는 것이다. Sticky READY가 direct current threads와 충돌하면 sticky를 신뢰하지 않는다. HF1 병합 뒤에는 Scene Purpose / Turn Hook / Event Consequence로 바로 계속 진행한다.`
