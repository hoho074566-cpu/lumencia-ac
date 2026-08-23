# LUMENSIA — CURRENT INTEGRATED DEVELOPMENT HANDOVER

작성 기준: 2026-08-24  
대상 프로젝트: 긴빠이 프로젝트 / Lumensia Academy  
Repository: `hoho074566-cpu/lumencia-ac`

> 이 문서는 새 프로젝트 시작 문서가 아니다. 2026-08-19 HANDOVER 1 → 2026-08-22 HANDOVER 2 → 2026-08-23 HANDOVER 3 → V1.5.5 NPC Motivation / Relationship Reason → V1.5.6 NPC Goal V2 → Scene Momentum Recovery HF1까지의 누적 Source of Truth다.
>
> 과거 핸드오버의 설계 이유와 안전장치는 계속 유효하다. SHA / PR / checks처럼 변하는 값은 항상 GitHub live 상태가 우선한다. 이전 상세 snapshot은 Git history에 보존되어 있으며, 아래에는 다음 세션이 반드시 알아야 할 누적 원칙과 현재 구현 상태를 통합해 둔다.

---

# PROJECT STATUS

Lumensia Academy는 모바일/PWA 기반 장기 AI RPG다. 사용자는 PC의 행동과 대사를 직접 결정하고, AI는 GM + 세계 시뮬레이터 역할을 한다.

현재 큰 작업은 **V1.5.6 원작 비교 기반 Narrative Recovery / Scene Momentum HF1**이다.

목표는 답변을 단순히 길게 만드는 것이 아니다. 원작 Lumensia처럼:

`User Action → semantic intent → decision-free steps compression → world/NPC/event progression → real State Delta → consequence → narration → meaningful player decision → STOP`

구조를 복구하는 것이다.

원작 Lumensia 플레이 로그가 진행 속도와 문체의 gold standard다. 현재판의 report-style narration보다 scene-driven novel prose를 우선한다. 다만 문체 개선만으로 낮은 State Delta를 덮지 않는다.

PR #33은 HF1 구현 PR이며 **protected core/runtime 변경이므로 manual merge only**다.

---

# PREVIOUS HANDOVER — STILL-AUTHORITATIVE RATIONALE

## HANDOVER 1 — architecture / player sovereignty / living world

### Stable architecture
- frontend: `index.html -> app-runtime.js -> app.js`
- external API: `/api/chat-router`
- stable adapter: `api/chat-router.js`
- canonical core: `api/chat.js`
- health: `api/health.js`
- context router: `api/lib/context-router.js`
- stable filenames 유지. 버전이 붙은 duplicate runtime/API 파일 생성 금지.
- OpenAI Responses API structured output.
- normal GAME turn의 canonical model/core call은 **정확히 1회**.
- `store:false`, prompt cache + 24h retention 유지.

### Player sovereignty
Aaa는 NPC가 아니라 PC placeholder다.
GM은 PC의:
- 새 행동
- 새 대사
- 현재 감정/생각
- 수락/거절
- 새 목표/의도
을 임의로 확정하지 않는다.

의미적 action compression은 사용자가 이미 선언한 행동의 decision-free intermediate steps만 처리한다.

META는 GAME CLOCK FREEZE다. META 때문에 시간/장소/관계/기억/일정/이벤트/감정/훅을 진행시키지 않는다.

### Living world philosophy
- WORLD/SCHEDULE은 PC 없이도 진행 가능.
- NPC는 목표/일정/관계/기억에 따라 독립 행동.
- NPC가 먼저 접근/말하기/퇴장/다른 NPC와 상호작용 가능.
- 공개 사건 → 관찰/소문 → 다른 NPC 반응 → 후속 사건 가능.
- 일상은 압축하고 중요한 대화/전투은 숨을 준다.
- Event Director는 판을 깔되 PC의 선택은 대신하지 않는다.
- FACT / OBSERVER / BELIEF / RUMOR / PROMISE / DEFERRED_HOOK 구분을 유지한다.
- 관계 변화는 숫자만이 아니라 `CAUSE -> EXPRESSION -> FOLLOWUP`가 중요하다.

### Growth / combat
- 시도 자동 성공 금지.
- 능력/준비/정보/경험/상성/거리/타이밍/지형/피로/부상/심리를 종합.
- 성장/스킬 XP는 실제 관련 경험에서 천천히.
- 즉흥 각성/스킬/혈통/유물 생성 금지.

## HANDOVER 2 — continuity / Context Router / automation races

이미 병합된 기반:
- PLAYER ACTION COMMIT
- CONTINUE reliability
- Scene Continuity
- monotonic Event Beat / CONTINUE

입학식 대표 발표 rollback/replay 버그를 계기로 확정된 원칙:
- `event_progress`
- `event_instance_id`
- completed beats monotonic
- 완료 beat 재활성화 금지
- CONTINUE는 완료 이후로만 전진

Context Router target/soft max는 유지한다:
- continue 11K / 14K
- routine 17K / 20K
- scheduled 18K / 20K
- important 20K / 23K
- critical 24K / 30K

Automation race에서 확정된 핵심:
- PR-level generic reaction/timestamp만으로 current review 추론 금지.
- exact immutable HEAD + occurrence/generation별 review cycle 사용.
- 같은 SHA도 `A cycle1 -> B -> A cycle2`면 다른 occurrence.
- ChatGPT GitHub connector / Codex Cloud push / GitHub Actions PAT은 서로 다른 identity/transport다.

## HANDOVER 3 — Auto-PR / Auto-Merge V1.2 safety

PR #22로 guarded LOW-RISK auto-merge가 실제 증명됐다.

현재 policy:
- repository-owned `codex/*`는 Auto-PR 대상 가능.
- LOW-RISK만 guarded auto-merge 가능.
- API/core/runtime/automation/auth/security/persistence/CANON 등의 protected/high-risk 변경은 manual merge only.
- P0/P1은 blocking; P2/P3은 기본 non-blocking.

Protected PR merge authority:
1. Safety PASS
2. Vercel PASS
3. exact-current-HEAD/current-base Codex P0/P1=0
4. no conflict
5. current main authoritative base
6. `merge_base_commit.sha == current main`
7. merge 직전 main/head 재검증

`pull.base.sha`만 current main으로 믿지 않는다.
Compare는 `main` vs **exact immutable PR HEAD SHA**로 하고:
- `base_commit.sha == current main`
- `merge_base_commit.sha == current main`
- behind=0
을 요구한다.

과거 sticky Merge Readiness가 direct current review threads와 충돌한 실제 사례가 있으므로 **sticky READY는 단독 merge authority가 아니다.**

---

# CURRENT MERGED GAME STATE

Main foundation:
- app runtime version 1.5.6
- API adapter main line 0.8.2 before HF1 branch adapter changes
- V1.5.5 NPC Motivation + Relationship Reason V1 — PR #30 MERGED
- V1.5.6 NPC Goal V2 — PR #31 MERGED
- characters-v2 32-character / 13 portrait state refresh — PR #32 MERGED

`app.js` base `APP_VERSION='1.4.8'` is intentional. `app-runtime.js`가 stable base를 patch한다. 단순 버전 숫자 불일치로 app.js를 올리지 않는다.

Asset current truth:
- 32 characters
- `default` + 12 expressions
- 448 V2 URL contract
- Anastasia default exists
- PNG legacy disabled
- unknown expression은 임의 URL을 합성하지 않는다.

---

# CURRENT PR #33 — SCENE MOMENTUM HF1

Working branch: `codex/scene-momentum-recovery-hf1`

Important implementation sequence:

### Base implementation/test HEAD before handover docs
`df382f3b0ab91b97f8f88f2b50667aa4b5553892`

### Router authority closure
`1e23cec5dc4b19ddce2a089f01b8a6e393b45f71`

Implemented:
- schedule event `note` preserved through compaction;
- NPC schedule `activity` / `commitment` / `confidence` preserved through every compaction tier;
- bounded minimum AUTHORITATIVE SAVE_STATE under long USER ACTION pressure;
- routine routed input <=9000 while SAVE_STATE + GM Director + Event Director V2.1 + Schedule + final USER ACTION survive;
- `AFTERMATH_FIXED_FLOW`;
- `ACTIVE_COMBAT_FIXED_FLOW` before momentum random selection.

Hosted:
- Safety #255 PASS
- Vercel PASS

### Time-floor P1 closure
`b8c5a8bf3556566e85a532e4fe92c09f8423add8`

Implemented:
- locally forced rest/wait/movement time floor stops at next same-day authoritative schedule boundary;
- already-due event => no additional local floor;
- locally forced floor capped at canonical one-turn max 1440 minutes;
- positive model-produced `advance_minutes` is never reduced;
- permanent `scene-momentum-time-floor.test.mjs`.

Hosted:
- Safety #256 PASS
- Vercel PASS

### Latest code/test HEAD before this handover refresh
`e5ac6c50bcfb7046b7754503df8c394817a4ab12`

Implemented P0.5 correctness fixes:
- `1시간 30분 쉰다/기다린다` → 90-minute downtime/wait intent;
- numeric delta 0 growth rows do not fake progress;
- one NPC state mutation counts once, not as both `npcStateChanged` and `npcAction`;
- fresh meaningful `choices` satisfy Scene Momentum STOP and do not build false stall pressure;
- identical echoed `pc_status` is not progress; real status change remains progress;
- CONTINUE Scene Momentum is replaced with explicit `CONTINUE HARD FREEZE`, so Scene Stall/world-change/NPC-initiative pressure is not applied during same-moment continuation;
- permanent `scene-momentum-correctness.test.mjs`.

This docs update will move HEAD again. The next session must refetch the live PR head rather than assuming `e5ac6c50...` is final.

---

# HF1 BEHAVIOR NOW IMPLEMENTED

## State Delta per Turn
Real progression recognizes relevant changes in:
- location / elapsed time
- NPC entrance / exit / dialogue / state
- new information / memory / hooks
- event beat/progress
- relationships
- goals/objectives
- resource/growth
- schedule
- world threads/rumors/consequences
- danger/environment

`scene_title` or prose-only rephrasing is not progress.

## Narrative Compression
Decision-low-value actions are compressed:
- ordinary movement
- doors/corridors/stairs
- waiting
- routine rest
- repeated observation of unchanged information

Do not compress through actual danger or meaningful choice.

## Semantic intent / player predicate safety
Handled regressions include:
- `마법과 건물로 간다` not mistaken for magic-use decision;
- Korean travel particle `에`;
- object-qualified observation;
- companion travel destination extraction;
- outdoor exit does not fabricate indoor route;
- `휴식하지 않고 도서관에 간다` does not rest;
- `좀 쉴까?` and `밖으로 나갈까?` are deliberation, not execution;
- negated exterior/explore/consequential actions do not execute;
- `잠든 이사벨을 깨운다`, `기다린 학생에게 말을 건다`, `탐색대에게 상황을 묻는다` are interpreted by the actual PC predicate;
- explicit `5분` duration overrides generic floor;
- compound hour+minute duration supported.

## Event semantics
- active event → raw null can be pause/archive, not fake completion;
- actual completion still counts;
- completed beats remain monotonic;
- CONTINUE does not replay state delta;
- due schedule boundary is not silently crossed by a locally fabricated time floor.

## NPC Initiative / Director
NPC/world may initiate when canon/location/schedule/knowledge/relationship permit.
Goals weight only already-eligible Director candidates.
Must preserve:
- direct user focus
- callback/payoff priority
- surprise cooldown
- physical/schedule eligibility
- present-participant exclusion
- NO_EVENT
- AFTERMATH fixed flow
- active combat fixed flow

## One-call invariant
Exactly one canonical `coreHandler()` / model call per turn remains mandatory and is covered by permanent integration tests.

---

# NARRATIVE QUALITY TARGET

Original bad loop:
`User Action -> one physical micro-step -> same background re-described -> STOP`

Target:
`Action -> Resolution -> World State Mutation -> NPC Action -> Event/Consequence -> Scene prose -> meaningful player judgment -> STOP`

Scene prose target:
- Action → Reaction → Meaning
- Show → Interpret
- NPC-specific worldview/motives
- spoken line and real emotion may differ
- varied sentence rhythm
- zoom in important moments / zoom out trivial movement
- selective sensory detail
- causal paragraphs
- response opening shows what changed
- repeated information suppressed

Fast pacing does **not** mean random intrusion, a major event every turn, or automatic relationship inflation.

---

# DO NOT BREAK

## Runtime / API
1. Exactly one canonical model/core call per normal turn.
2. `/api/chat-router` remains stable external endpoint.
3. `api/chat-router.js` wraps `api/chat.js`.
4. stable `api/lib/context-router.js`; no versioned duplicates.
5. `store:false`.
6. prompt cache + 24h retention.
7. HF1 context budgets unless separately approved.

## Player agency
8. Never invent independent PC action/dialogue/emotion/thought/accept/reject.
9. Compression only for decision-free steps of an already declared action.
10. Negated/hypothetical/question actions do not execute.
11. STOP at actual content-bearing decisions, not trivial movement.
12. META hard freeze.
13. CONTINUE same-moment hard freeze; no new world-state pressure.

## Event / continuity
14. completed Event Beats monotonic.
15. CONTINUE does not reapply previous state_delta.
16. paused event null != completion.
17. PC nonattendance does not cancel world schedules.

## NPC / Director
18. direct user focus beats random rotation.
19. callback/payoff priority.
20. location/schedule/knowledge/relationship constraints.
21. cooldown.
22. present-participant exclusion.
23. NO_EVENT.
24. goals weight only already eligible candidates.
25. blocked/completed/abandoned goal is not active motivation.
26. AFTERMATH / active combat fixed flow.

## Save / canon / assets
27. `app.js` 1.4.8 base is intentional.
28. new PC default skills/inventory remain neutral.
29. canon/NPC personality/relationships are not rewritten for convenience.
30. canonical NPC key migration remains conservative.
31. characters-v2 current 32 / 13-state contract.

## GitHub / merge safety
32. PR #33 is manual merge only.
33. prior-head review never authorizes current head.
34. same SHA after A→B→A is a new occurrence.
35. generic reaction is not merge authority.
36. candidate PR code never gets privileged secret execution.
37. immutable exact HEAD preferred to mutable branch ref.
38. final merge requires current main + exact HEAD compare and merge-base validation.
39. stale/incorrect sticky READY never overrides direct current P0/P1 evidence.

---

# TESTS / CURRENT EVIDENCE

Permanent suites now include:
- `context-router-authority-tail.test.mjs`
- `context-router.test.mjs`
- `scene-momentum-v156-hf1.test.mjs`
- `scene-momentum-v156-hf1-integration.test.mjs`
- `scene-momentum-intent-guards.test.mjs`
- `scene-momentum-paused-event.test.mjs`
- `scene-momentum-time-floor.test.mjs`
- `scene-momentum-correctness.test.mjs`
- plus existing continuation/event/Goal V2/core/debug/assets/migration/automation/readiness tests.

Known hosted results before latest correctness/docs commits:
- `1e23cec5...`: Safety #255 PASS, Vercel PASS.
- `b8c5a8bf...`: Safety #256 PASS, Vercel PASS.

The docs-updated final HEAD needs a new hosted cycle.

---

# CURRENT MERGE BLOCKER

No known implementation blocker remains after the latest correctness patch, but **PR #33 remains blocked by process** until the exact docs-updated HEAD passes:
- Safety
- Vercel
- fresh exact-current-HEAD/current-base Codex review
- direct current non-outdated P0/P1=0
- no conflict/current-main compare protection.

A previous Merge Readiness cycle incorrectly said READY while direct P1 threads still existed. Therefore:
- inspect threads directly;
- sticky status is supplementary only;
- do not redesign/weaken automation merely to make the indicator green.

---

# AFTER HF1 MERGE — NEXT NARRATIVE PHASE

HF1 merge is not Narrative completion.

Immediately continue with:
1. live-play acceptance using original problematic actions/screenshots;
2. **Scene Purpose**;
3. explicit **Scene Exit Condition**;
4. stronger **Turn Hook**;
5. **Event Consequence** chaining / consequence lifetime;
6. NPC Initiative / Goal Tick refinement;
7. bounded off-screen world progression;
8. deterministic novelty/repetition suppression if loops remain;
9. multi-system scenes where schedule/goals/relationships/event consequences interact.

Longer roadmap:
- Adaptive Time Scale V2
- Consequence Queue / Lifetime
- Active Threads
- Reputation / faction-social propagation
- Setup → Payoff memory
- NPC significance
- relationship threshold behavior
- NPC knowledge boundaries
- NPC-vs-NPC conflict
- Fail Forward
- Multi-System Scene
- Memory Hierarchy
- full scene-driven novel prose recovery

Gameplay roadmap discussed but not DONE:
- NPC↔NPC Relationship V1
- Faction / Social Consequence V1
- Skill Learning V1
- Awakening / Talent Evolution V1
- Combat Growth V2
- Living World / Event Director V3 / Long-term Consequence

---

# NEXT ACTION

The next work session starts **here**; do not restart initial HF1 diagnosis.

1. Read this file and `docs/IMPLEMENTATION_PROGRESS.md`.
2. Refetch GitHub live:
   - current `main`;
   - PR #33 exact HEAD;
   - current changed files;
   - current review threads;
   - Safety/Vercel.
3. Verify hosted Safety + Vercel on the docs-updated exact HEAD.
4. Request fresh Codex review bound to:
   - exact current HEAD;
   - actual current main;
   - new occurrence/generation.
5. Directly inspect current non-outdated review threads. Do not trust sticky READY alone.
6. If true current P0/P1=0:
   - refetch exact HEAD and main;
   - Compare `main...exact HEAD`;
   - require `base_commit == current main`;
   - require `merge_base == current main`;
   - require behind=0;
   - require no conflict;
   - manual merge with `expected_head_sha`.
7. Verify merged main, Vercel production and `/api/health`.
8. Update progress on main if the merge commit changes the recorded SHA.
9. Continue directly into **Scene Purpose / Turn Hook / Event Consequence**.

---

# NEW CHAT START INSTRUCTION

> `docs/LUMENSIA_HANDOVER_CURRENT.md`와 `docs/IMPLEMENTATION_PROGRESS.md`를 먼저 읽고 긴빠이/Lumensia 프로젝트를 그대로 이어가라. 이건 새 프로젝트가 아니다. 완료된 HF1 진단을 재분석하지 말고 GitHub live main / PR #33 exact HEAD / current review threads / Safety / Vercel부터 확인한다. 현재 코드에는 router authority P1, schedule-bound/1440 time-floor P1, compound-duration/no-op-delta/NPC-double-count/meaningful-choice/pc-status correctness, CONTINUE hard-freeze momentum replacement까지 구현되어 있다. 다음 작업은 exact docs-updated HEAD의 hosted gates + fresh current-head Codex P0/P1=0을 직접 확인하고 final current-main/merge-base/behind/no-conflict 재검증 뒤 protected PR #33을 expected_head_sha로 수동 병합하는 것이다. Sticky READY가 direct current threads와 충돌하면 sticky를 신뢰하지 않는다. HF1 병합 뒤에는 Scene Purpose / Turn Hook / Event Consequence로 바로 계속 진행한다.`
