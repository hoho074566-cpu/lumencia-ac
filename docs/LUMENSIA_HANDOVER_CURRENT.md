# LUMENSIA — CURRENT INTEGRATED DEVELOPMENT HANDOVER

작성 기준: 2026-08-24 (new-chat handover snapshot)  
대상 프로젝트: 긴빠이 프로젝트 / Lumensia Academy  
Repository: `hoho074566-cpu/lumencia-ac`

> **이 문서는 새 프로젝트 시작 문서가 아니다.**
> 2026-08-19 HANDOVER 1 → 2026-08-22 HANDOVER 2 → 2026-08-23 HANDOVER 3 → V1.5.5 NPC Motivation / Relationship Reason → V1.5.6 NPC Goal V2 → 현재 Scene Momentum / Narrative Recovery HF1까지의 **누적 Source of Truth**다.
>
> 과거 핸드오버의 안전 원칙과 설계 이유는 폐기하지 않는다. 단, SHA/PR 상태/asset 현황처럼 변하는 값은 **현재 GitHub live 상태**가 우선한다.

---

# PROJECT STATUS

Lumensia Academy는 모바일/PWA 기반 장기 AI RPG다. 사용자가 PC의 행동과 대사를 직접 결정하고, AI는 GM + 세계 시뮬레이터 역할을 한다.

현재 큰 작업은 **V1.5.6 원작 비교 기반 Narrative Recovery**다. 목표는 단순히 답변 길이를 늘리는 것이 아니라, 원작 Lumensia처럼 사용자가 한 행동을 던졌을 때 그 행동의 결과와 세계 반응을 여러 단계 굴리고 **다음으로 플레이어 판단이 실제로 필요한 지점에서만 멈추는 구조**를 복구하는 것이다.

현재 구현 branch의 Scene Momentum HF1은 상당 부분 구현됐지만 **PR #33은 아직 merge 금지**다. 현재 remote code/test HEAD에는 Safety/Vercel PASS가 있으나, `api/lib/context-router.js`에 **현재 HEAD에도 유효한 P1 3건**이 남아 있다. Sticky `Lumensia Merge Readiness`가 현재 HEAD를 READY/P0-P1=0으로 표시한 기록이 있으나, 직접 review-thread 확인과 충돌한다. **Sticky READY만 믿고 merge하지 않는다.**

원작 Lumensia 플레이 로그가 이번 Narrative 작업의 **진행 속도와 문체 기준본(gold standard)** 이다.

---

# PREVIOUS HANDOVER IMPORTANT CONTEXT

## HANDOVER 1 — 2026-08-19: 프로젝트 기반 / 플레이 철학 / 모바일 운영

이 문서에서 확정된 핵심은 지금도 유효하다.

### Architecture
- 게임 repo: `hoho074566-cpu/lumencia-ac`
- 배포: Vercel project `lumencia-ac`
- stable frontend: `index.html -> app-runtime.js -> app.js`
- stable API:
  - `api/chat.js` = canonical core
  - `api/chat-router.js` = stable external adapter
  - `api/health.js`
  - `api/lib/context-router.js`
- **stable filename 유지**. 버전 붙은 duplicate runtime/API 파일 생성 금지.
- OpenAI Responses API structured output.
- Luna `gpt-5.6-luna`, Terra `gpt-5.6-terra`.
- 정상 GAME turn의 canonical model call은 **정확히 1회**.
- `store:false`, prompt cache / retention 24h 유지.

### Player sovereignty
Aaa는 NPC가 아니라 PC placeholder다.
GM은 PC의:
- 새 행동
- 새 대사
- 현재 감정/생각
- 수락/거절
- 목표/의도
을 임의로 확정하지 않는다.

META는 GAME CLOCK FREEZE다. META 질문 때문에 시간/장소/턴/관계/기억/일정/훅/감정/이벤트를 진행시키지 않는다.

### World simulation philosophy
목표는 “세계가 PC 입력을 기다리는 챗봇”이 아니라:
- WORLD/SCHEDULE은 PC 없이도 진행
- NPC는 목표/일정/관계/기억을 가지고 독립 행동
- Event Director는 판을 깔되 PC 선택은 대신하지 않음
- 결과는 FACT/RUMOR/BELIEF/관계/NPC 목표/후속 훅으로 전파
하는 RPG다.

원작에서 살릴 것:
- NPC가 먼저 접근/행동
- 공개 사건 → 소문 → 다른 NPC 반응 → 다음 사건
- 일상 압축
- 중요한 대화/전투은 숨을 줌
- FRICTION → PRESSURE → CHOICE WINDOW → PAYOFF OPPORTUNITY → WORLD REACTION

원작에서 제거할 것:
- PC 속마음/선택 자동 확정
- META를 인게임 침묵으로 오해
- NPC 편견을 객관 FACT로 승격
- 스탯/숙련 급등락
- 애매한 경계를 동의로 해석
- 같은 장면 반복
- NPC 전원이 PC 중심으로만 움직임

### Memory / schedule / relationship
- FACT / OBSERVER / BELIEF / RUMOR / PROMISE / DEFERRED_HOOK 등을 분리.
- 관계 변화는 수치만이 아니라 `CAUSE -> EXPRESSION -> FOLLOWUP`가 중요.
- 일정은 PC가 불참해도 발생하며, PC를 강제 순간이동시키지 않는다.
- NPC 위치/학과/학년/직책/일정의 연속성을 지킨다.

### Growth / combat
- 시도 자동 성공 금지.
- 능력/준비/정보/경험/상성/거리/타이밍/지형/피로/부상/심리를 종합.
- 성장/스킬 XP는 실제 관련 경험에서 천천히.
- 즉흥 각성/능력 생성 금지.

## HANDOVER 2 — 2026-08-22: 안정화 / Merge Readiness / Auto-PR V1.1 / race 분석

### 당시 이미 완료된 gameplay 기반
- PLAYER ACTION COMMIT 완료/병합.
- CONTINUE reliability 완료/병합.
- Scene Continuity PR #11 완료/병합.
- Event Beat / monotonic CONTINUE PR #13 완료/병합.

입학식 대표 발표가 CONTINUE 후 rollback되어 두 번 실행되던 실제 버그를 계기로:
- `event_progress`
- `event_instance_id`
- completed beats monotonic
- 완료 beat 재활성화 금지
- CONTINUE는 완료 이후로만 전진
원칙이 확정됐다.

### Context Router budgets
아래 목표/soft-max를 함부로 바꾸지 않는다.
- continue 11K / 14K
- routine 17K / 20K
- scheduled 18K / 20K
- important 20K / 23K
- critical 24K / 30K

### Merge Readiness + Discord
PR #14로 기반 구축.
판정 요소:
- Safety Gate
- Vercel
- Codex current-head review
- P0/P1
- conflict/mergeability

Discord webhook 실동작 확인 이력이 있다.
최종 UX 목표는 중간 알림 폭탄이 아니라:
- ✅ 병합 가능
- 🚨 사람 확인 필요
정도로 줄이는 것이다.

### Auto-PR V1.1
PR #15로 `codex/* -> trusted default-branch scanner -> PR` 기반 구축.
중요 보안 원칙:
- PAT/secret을 candidate branch code에 노출하지 않는다.
- privileged workflow는 trusted default-branch 코드만 실행한다.
- candidate branch는 REST metadata로만 검사.

### 이 시기에 발견된 race/security 문제
반드시 기억해야 한다.
- diverged branch eligibility
- branch-selectable `workflow_dispatch` + secret 위험
- candidate branch 코드가 privileged workflow에 영향
- opened vs check_run ordering
- synchronize/HEAD transition race
- same-second timestamps
- reaction removal
- A -> B -> A HEAD 재등장
- 같은 SHA의 과거 review 재사용
- stale workflow가 최신 상태를 overwrite

핵심 설계 결론:
**PR-level generic reaction/timestamp로 current review를 추론하면 안 된다.**
HEAD OCCURRENCE별 review cycle을 사용한다.

Cycle identity에는 최소:
- PR number
- exact immutable HEAD SHA
- generationKey
- review request comment ID / hidden marker
- baseline review IDs
- baseline review-comment IDs
가 필요하다.

같은 SHA라도 `A cycle1 -> B -> A cycle2`는 다른 occurrence다.

### Tool identity 분리
아래 세 가지는 별개다.
1. ChatGPT GitHub connector
2. Codex Cloud git push
3. GitHub Actions PAT / GITHUB_TOKEN

Codex Cloud에서 `CONNECT tunnel failed / response 403`가 반복될 수 있다. 이 경우 Codex local commit이 remote에 없을 수 있다.

## HANDOVER 3 — 2026-08-23: Auto-PR / Auto-Merge V1.2 완성 및 merge safety

### Auto-merge proof
PR #22 low-risk smoke가 `github-actions[bot]`으로 실제 auto-merge되며 V1.2 smoke PASS가 증명됐다.

### Current automation policy
- Auto-PR scope: repository-owned `codex/*`
- LOW-RISK만 guarded auto-merge 가능.
- HIGH-RISK/protected paths는 **manual merge only**.
- P0/P1은 최대 5회 focused auto-fix 대상.
- P2/P3은 기본 non-blocking, 자동수정 금지.

Protected/high-risk에는 최소:
- `.github/workflows/**`
- automation controller/scripts
- API/core/runtime
- auth/secret/security
- persistence/CANON 정책
등이 포함된다.

### 안전장치가 생긴 이유
과거 stale PR/old smoke가 나중 controller에 의해 merge되는 문제와 여러 HEAD race가 실제 발생했다.
그래서 현재 merge authority는 반드시:
1. Safety PASS
2. Vercel PASS
3. exact-current-HEAD/current-base Codex P0/P1=0
4. no conflict
5. current main authoritative base
6. `merge_base_commit.sha == current main`
7. merge 직전 main/head 재검증
이어야 한다.

**`pull.base.sha`만 current main으로 믿지 않는다.**
GitHub Compare를 `main` vs **exact immutable PR HEAD SHA**로 수행한다.
- `base_commit.sha == current main`
- `merge_base_commit.sha == current main`
을 요구한다.
HEAD/base drift가 있으면 abort한다.

### Important automation evolution
Live GitHub 기록 기준으로 확실히 확인되는 주요 PR:
- #21: trusted V1.2 auto-fix + conditional low-risk auto-merge.
- #22: 실제 auto-merge smoke proof.
- #23: authoritative checks가 PASS인 `mergeable_state: unstable`의 좁은 허용 규칙.
- #24: Merge Readiness 뒤 maintenance wake.
- #25: trusted review comment wake / actor-marker gate.
- #26: Readiness workflow 내부 dedicated maintenance; evaluator read-only, maintenance만 write; candidate code checkout 금지.
- #27: PAT preflight, retry/revalidate, shared concurrency, sticky maintenance status.
- #28: scan readiness 후 maintenance 실행으로 READY→merge gap 보완.
- #29: `main` vs exact PR HEAD Compare API shape 수정, `base_commit` current-main authority, `merge_base_commit` stale-base protection.

과거 HANDOVER 3의 일부 PR 번호 설명은 live GitHub title과 불일치한 부분이 있으므로 **번호보다 안전 설계 이유를 Source of Truth로 보존**한다. 특히 exact-head/current-base 원칙은 현재도 절대 유지한다.

---

# CURRENT REPOSITORY / BRANCH / COMMIT

## Live snapshot immediately before writing this handover
- Repository: `hoho074566-cpu/lumencia-ac`
- Current main: `f6122be5f65a7b0b79555b83c9660eb9ed84cb6c`
- Main commit message: `chore: restore standard Lumensia safety workflow`
- Working branch: `codex/scene-momentum-recovery-hf1`
- PR: #33 `Restore Scene Momentum and narrative compression in V1.5.6`
- PR state: OPEN
- merged: false
- mergeable: true
- draft: false
- Code/test HEAD before docs-only handover commit: `df382f3b0ab91b97f8f88f2b50667aa4b5553892`
- HEAD commit message: `test: lock Scene Momentum predicate and duration guards`
- Compare `main...df382f3`: ahead 32, behind 0; base_commit and merge_base both equal current main `f6122be5...`.
- Open PRs at snapshot: **#33 only**.

### Hosted checks on code/test HEAD `df382f3...`
- Lumensia PR Safety Gate run #248: PASS.
- Vercel: PASS.
- Exact-head Codex review exists for `df382f3b0a`.

**BUT:** current review-thread inspection still shows unresolved, non-outdated P1 items in `api/lib/context-router.js`. Therefore PR #33 is **NOT MERGE READY** even if the sticky Readiness comment says READY.

### Important docs-only SHA note
Saving this handover/progress file will move the branch HEAD with docs-only commits. The last implementation/test HEAD before handover is `df382f3...`. Next chat must refetch the live branch HEAD and must not infer that a later docs-only SHA represents new gameplay fixes.

---

# CURRENT MERGED GAME STATE

Live main `api/health.js` confirms:
- API version `0.8.2`
- appVersion `1.5.6`
- adapter `/api/chat-router`
- canonicalCore `/api/chat`
- NPC Motivation: V2 evidence-gated active_goal lifecycle
- Relationship Reason: V1 cause/expression/followup persistence
- Event Director V2.1 goal weighting
- HF1 routine target 17k / soft max 20k

## Confirmed merged PRs after automation handover

### PR #30 — V1.5.5 NPC Motivation + Relationship Reason V1 — MERGED
Implemented:
- persistent structured `active_goal`
- goal-aware Event Director weight only for already-eligible candidates
- relationship reason snapshots with cause/expression/followup/turn/source
- DEBUG goal/reason telemetry
- one canonical model call preserved

Hard guards preserved:
- direct user focus
- schedule/presence
- cooldown
- callbacks
- no-event outcome

### PR #31 — V1.5.6 NPC Goal V2 — MERGED
Implemented:
- `goal_progress_delta`
- `goal_state`
- `goal_reason`
- `goal_next_action`
- `goal_replace`
- lifecycle `active / blocked / completed / abandoned`
- progress 0..100
- reason-gated transitions
- bounded goal history max 6
- replacement/reset rules
- completed reopen and abandoned freeze/reopen rules
- Goal V2 structured schema preservation without second model call
- blocked/completed/abandoned goals do not Director-weight
- app 1.5.6 / adapter 0.8.2

### PR #32 — characters-v2 refresh — MERGED
Current asset state supersedes older handover notes:
- 32 characters
- 13 portrait states per character (`default` + 12 expressions)
- 448 V2 URLs contract
- Anastasia now has a real `portrait/default.webp`; the old “Anastasia default missing is intentional” exception is **obsolete**.
- unknown expressions must still not synthesize arbitrary paths.
- PNG legacy remains disabled.

### `app.js` version note
`app.js` live main still has `APP_VERSION = '1.4.8'`. This is **intentional base-app architecture**, not automatically a version mismatch bug: `app-runtime.js` patches the stable base at boot. Do not “fix” app.js to 1.5.6 merely because health/app runtime is 1.5.6.

---

# COMPLETED WORK

This section distinguishes **merged DONE** from **implemented on PR #33 but not merged**.

## A. DONE + MERGED
- Auto-PR / guarded Auto-Merge V1.2 low-risk smoke proof.
- Merge Readiness / Discord base.
- exact-head/current-base safety architecture.
- PLAYER ACTION COMMIT.
- CONTINUE reliability.
- Scene Continuity.
- monotonic Event Beat/CONTINUE.
- Character Images V2 current 32-character manifest.
- V1.5.5 NPC Motivation + Relationship Reason V1.
- V1.5.6 NPC Goal V2.

## B. IMPLEMENTED AND TESTED ON PR #33, **NOT MERGED**

### `lib/scene-momentum.js`
Deterministic helper, no model calls.
Implemented concepts:
- semantic intent classification
- State Delta scoring
- 3-turn momentum history
- stall streak / pressure
- semantic action completion directives

Intent categories include:
- `exit-exterior`
- `travel`
- `explore`
- `observe`
- `wait`
- `downtime`
- `decision-sensitive`
- `committed-consequence`
- `generic`

### `api/lib/context-router.js`
Implemented:
- Scene Momentum directive injection.
- old stable micro-step `위 행동까지만 처리` behavior replaced with semantic action completion.
- Scene Change > Scene Description.
- trivial door/corridor/stair/path compression.
- NPC may speak/move/leave/interact first when physically/schedule/knowledge consistent.
- STOP only at meaningful player decisions.
- Event Director V2.1 receives momentum stall signal.
- authority-tail reservation for GM Director / Event Director V2.1 / Schedule in ordinary oversized optional context.

**Still has unresolved P1s; see KNOWN ISSUES.**

### `api/chat-router.js`
Implemented:
- adapter 0.8.3 / app 1.5.6 on branch.
- exactly one canonical `coreHandler()` call site retained.
- deterministic min-time floors for compressed low-value intents.
- `importance=critical` no longer used as fake STOP; explicit choices are stop evidence.
- local runtime persistence of `momentum` / `scene_delta`.
- event-pause-aware momentum semantics.

### `app-runtime.js`
Implemented:
- Scene Momentum DEBUG/telemetry.
- duplicate AUTO/CONTINUE flow-control suppression.
- `MOM` indicators / recent state delta info.

### `api/health.js`
Branch health exposes Scene Momentum Recovery HF1 markers.

### Fixed Scene Momentum edge cases already on remote branch
- `마법과 건물로 간다` does not become magic-ability decision.
- active event → `event_progress:null` real completion counts as progress.
- `restaurant` / `waitress` English substring false positives fixed.
- Korean travel particle `에` supported.
- outdoor `밖으로 간다` does not fabricate indoor room/corridor route.
- object-qualified observation (`게시판을 확인한다`, `주변을 자세히 살펴본다`).
- companion travel extracts actual destination (`미라벨과 함께 중앙광장으로 간다` -> 중앙광장).
- committed `공격한다` keeps positive State Delta target instead of being treated as unresolved deliberation.
- real persisted fatigue/gold/growth/skill/awakening/schedule/world-thread/relationship/NPC-state changes count toward progress.
- repeated/no-op Goal lifecycle metadata does not fake goal progress.
- `휴식하지 않고 도서관에 간다` does not force downtime; falls through to travel.
- `좀 쉴까?` is decision-sensitive and does not trigger rest time floor.
- `importance=critical` does not suppress elapsed time without a real choice STOP.
- negated exterior movement (`밖으로 나가지 않는다`, `밖에 안 나간다`) does not auto-exit.
- `밖으로 나갈까?` is decision-sensitive.
- still-active event raw null used as pause/archive does not fake Event Progress; real completion still does.
- unregistered minor NPC dialogue with `speaker_name` and null `speaker_key` counts as NPC action; narration does not.
- current remote helper also includes negated explore/consequential guards, player-predicate anchoring, and explicit duration handling for `5분만 기다린다` / `5분만 쉰다`.

---

# CURRENT NARRATIVE PROBLEM

## Why V1.5.6 felt much slower than original Lumensia

The problem was not primarily word count. It was **low world-state mutation per user turn**.

Bad loop observed in current version:

`User Action -> one physical micro-step -> same location/background/list re-described -> STOP`

Target original-style loop:

`User Action`
`-> Intent`
`-> Action Resolution`
`-> World State Mutation`
`-> NPC Action`
`-> Event Progress`
`-> Consequence`
`-> Narrative`
`-> Important Player Choice`
`-> STOP`

The AI should not stop merely because one sentence/action beat has been rendered. It should stop when the next missing piece is **meaningful player judgment**.

## Scene Stall examples that drove HF1

### `본다`
Observed problem:
- same board/window/counter/corridor/background repeatedly enumerated.
- scene title/prose changed but world state did not.
- already-known information repeated.

Desired:
- show new or changed relevant detail first.
- if nothing new exists, do not relist; lightly advance world/time or surface meaningful change.

### `돌아다닌다`
Observed problem:
- only a few steps/same corridor processed.
- user had to repeatedly type another movement command.
- little novelty, NPC initiative, or event progress.

Desired:
- compress several low-value nearby points.
- reach at least one meaningful discovery/change/encounter/info point if naturally available.
- do not force a large event every time.

### `밖으로 간다`
Observed problem:
- room → corridor only, then STOP.
- trivial doors/stairs/entrance became player turns.

Desired:
- if no real obstacle/decision: compress room → corridor → stair/entrance → exterior in one semantic action.
- if already outside, do not invent an indoor route.
- negated or deliberative forms must not execute.

### `쉰다`
Observed problem:
- sit → close eyes → sleep could become multiple turns.
- meaningful elapsed time/world changes were not applied consistently.

Desired:
- compress low-value rest.
- advance an appropriate amount of time.
- resume at a changed world/scene state.
- if the user states `5분만 쉰다`, respect 5 minutes rather than generic 30-minute floor.

## Current core Narrative objectives

### 1. State Delta per Turn
Every normal turn should create real change where the declared action/world response warrants it:
- location
- time
- NPC entrance/exit/action/state
- new information
- event beat
- relationship
- goal
- resource/growth
- schedule
- world thread/rumor
- danger/environment

Changing only `scene_title` or rephrasing the same background is not progress.

### 2. Narrative Compression
Compress actions with low decision value:
- ordinary movement
- door/corridor/stair traversal
- waiting
- routine rest
- repeated observation of unchanged information

Do **not** compress through meaningful danger/choice.

### 3. NPC Initiative
NPCs/world cannot remain frozen until PC explicitly addresses them.
NPCs can:
- approach
- speak first
- leave
- move according to schedule
- interact with another NPC
- pursue goals
- react to consequences
when canon/location/schedule/knowledge/relationship permit.

### 4. Scene Exit Condition
Every scene needs a purpose and exit condition. Do not remain in the same “administrative” room/counter/board loop after its function is complete.

### 5. Turn Hook
A response should usually finish with either:
- a real change that naturally invites next action, or
- an important choice/question/pressure point.
Not with arbitrary micro-step STOP.

### 6. Action Meaning / Interpretation
Interpret what the player **committed to do**, not every keyword contained in the sentence.
Examples:
- `잠든 이사벨을 깨운다` is not PC downtime.
- `기다린 학생에게 말을 건다` is not PC waiting.
- `탐색대에게 상황을 묻는다` is not PC exploration.
- `싸우지 않는다` is not a committed fight.

### 7. Adaptive Time Scale
Time granularity should match narrative value:
- important combat/dialogue: seconds/minutes across multiple turns possible.
- low-value movement/rest/wait: minutes/hours can compress.
- explicit user duration overrides generic floor.

### 8. Consequence Queue / Lifetime
Events should generate consequences that can persist and resolve later, instead of every effect being consumed in the same turn.

### 9. Active Threads
Keep a bounded set of active narrative threads so scenes can exit and later return to meaningful unresolved business.

### 10. Reputation Propagation
Public actions can propagate through observer/rumor/faction/social channels instead of only modifying direct PC↔NPC numbers.

### 11. Setup → Payoff
Earlier setup should return as later opportunity/obstacle/reaction. Do not require every payoff immediately.

### 12. Fail Forward
Failure should alter state and open a new problem/route rather than simply produce “nothing happens, try again”.

### 13. Off-screen World Progression
World/NPC goals should progress when justified while off-screen, but not via arbitrary hidden large changes or extra model spam.

### 14. Report-style Narration → Scene-driven Novel Prose
Current problem: “game report” feeling.
Target original-like prose:
- Action → Reaction → Meaning
- Show → Interpret
- NPC-specific worldview and motives
- spoken line vs real emotion can differ
- sentence rhythm varies
- zoom in important moments
- zoom out trivial movement
- selective sensory details
- causal paragraph flow
- response opening shows what changed
- suppress repeated info

Again: **original Lumensia logs are the reference for both pace and prose.**

---

# CONFIRMED DESIGN DECISIONS

These are decisions, not proposals.

1. Narrative recovery is incremental on existing architecture; do not replace the whole Narrative/Director/runtime system.
2. One canonical model call per turn remains mandatory. Deterministic local post-processing is preferred to extra model calls.
3. Semantic action completion is the core movement rule: finish trivial intermediate steps of the action the user already declared.
4. Player agency remains the hard boundary. New independent PC decisions/dialogue/emotions cannot be invented.
5. State Delta must measure actual world change; scene-title/prose-only change is not enough.
6. NPC goal signals can influence eligible behavior, but cannot bypass physical location, schedule, knowledge, relationship, cooldown, direct user focus, callback priority, present-participant exclusion, or NO_EVENT.
7. `AFTERMATH` and active combat are supposed to remain fixed-flow/breathing-room zones; momentum pressure must not inject random cameo events there. This is a current P1 not yet on remote; exact patch exists in PR comment #5386396220.
8. Explicit time (`5분만...`) overrides generic wait/rest minimum.
9. Negated/hypothetical/unresolved actions must not be executed.
10. Canon, character personality, relationships, normal working features are preserved unless an explicit later decision changes them.
11. Fast pacing does not mean random intrusion, a major event every turn, or automatic relationship inflation.
12. Scene-driven novel prose is a separate restoration target after engine momentum becomes stable; prose alone cannot compensate for low State Delta.

---

# FILES CHANGED — CURRENT PR #33 REMOTE DIFF

Current remote PR has 12 files changed:

1. `api/chat-router.js`
   - Scene Momentum runtime synthesis.
   - deterministic time floor.
   - explicit-choice STOP evidence.
   - adapter 0.8.3 branch markers.
   - one canonical `coreHandler()` call preserved.

2. `api/health.js`
   - branch health/Scene Momentum markers.

3. `api/lib/context-router.js`
   - Scene Momentum directives.
   - Scene Change/compression/NPC Initiative/STOP rules.
   - momentum-aware Event Director V2.1.
   - current authority-tail reservation.
   - **CURRENT P1 BLOCKERS remain here.**

4. `app-runtime.js`
   - Scene Momentum DEBUG/telemetry.
   - duplicate AUTO/CONTINUE control suppression.

5. `docs/IMPLEMENTATION_PROGRESS.md`
   - progress tracking; this handover updates it because prior content became stale.

6. `lib/scene-momentum.js`
   - deterministic intent classifier.
   - State Delta/stall tracking.
   - pause-aware event semantics.
   - negation/predicate/duration guards.

7. `scripts/tests/context-router-authority-tail.test.mjs`
   - current 9k authority-tail preservation regression.
   - will need router P1 patch extension for 5k action/min-save-state/fixed-flow guards.

8. `scripts/tests/npc-motivation-v155.test.mjs`
   - branch compatibility marker updates.

9. `scripts/tests/scene-momentum-intent-guards.test.mjs`
   - negated actions.
   - predicate anchoring.
   - explicit 5-minute wait/rest.

10. `scripts/tests/scene-momentum-paused-event.test.mjs`
   - scheduled pause != completion.
   - resumable pause != completion.
   - actual completion counts.

11. `scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
   - production wiring.
   - one core call.
   - explicit STOP evidence.
   - stable health/runtime markers.

12. `scripts/tests/scene-momentum-v156-hf1.test.mjs`
   - acceptance A-F + edge regressions.

### Local-only router patch files not yet on remote
Codex recreated a tested router patch as local commit:
`17e26efa471b20626884bda73b3ba1dcbbeb3b7c`

It modifies only:
- `api/lib/context-router.js`
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/context-router.test.mjs`

Push failed with `CONNECT tunnel failed, response 403`.
The **complete unified diff is preserved in PR #33 conversation comment `#5386396220`**. Do not ask Codex to rediscover/rewrite this patch unless that comment becomes unavailable. Apply the preserved diff through the ChatGPT GitHub writer on the next session.

---

# TESTS PASSED

## Hosted on current remote code/test HEAD `df382f3...`
- Lumensia PR Safety Gate #248: PASS.
- Vercel: PASS.

Safety has exercised the existing deterministic suites, including:
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/context-router.test.mjs`
- `scripts/tests/continue-runtime.test.mjs`
- `scripts/tests/core-invariants.test.mjs`
- `scripts/tests/debug-regression.test.mjs`
- `scripts/tests/event-progress.test.mjs`
- automation/readiness/exact-head tests
- Goal V2 tests
- `scripts/tests/npc-motivation-v155.test.mjs`
- save-key migration
- scene continuity
- `scripts/tests/scene-momentum-paused-event.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1.test.mjs`
- `scripts/tests/scene-momentum-intent-guards.test.mjs`

### Important proven invariant
`scene-momentum-v156-hf1-integration.test.mjs` asserts exactly one canonical `coreHandler()` call site remains in stable adapter code.

## Local-only Codex router patch `17e26efa...`
Codex reported PASS for:
- `node --check api/lib/context-router.js`
- focused authority-tail/router regressions
- full deterministic Lumensia PR suite
- diff validation
- canonical-core integrity
- one-call verification

But this patch is **not on remote**, so those results are not hosted acceptance for the PR yet.

---

# TESTS FAILED

Historical intermediate failures are useful regression history and must not be forgotten.

1. Intermediate HEAD `c037531...`
   - new tests exposed `importance=critical` being used as fake STOP evidence.
   - new tests exposed `좀 쉴까?` not entering the deliberation guard.
   - both later fixed.

2. Intermediate HEAD `a3de01c...`
   - `밖으로 나갈까?` remained `generic` rather than decision-sensitive due Korean conjugation (`나-갈까` vs literal `나가`).
   - later fixed.

3. Current remote HEAD `df382f3...`
   - no hosted Safety test failure.
   - **code review still has unresolved P1s; PASS CI != merge-ready.**

---

# KNOWN ISSUES

## BLOCKING — current non-outdated P1 review findings

### P1-A — `compactScheduleAuthority()` drops behavioral authority
File: `api/lib/context-router.js` around current review line ~363.

Problem:
- NPC schedule `confidence` is dropped.
- event schedule `note` is dropped.
- model can no longer distinguish fixed commitment vs expected movement or timed-beat details.

Required fix:
Preserve event `note` and NPC `activity` / `commitment` / `confidence` through **every compaction tier**, while keeping bounded valid JSON.

Exact already-tested local patch exists in PR comment #5386396220.

### P1-B — long supported USER ACTION can evict authoritative SAVE_STATE
File: `api/lib/context-router.js` around ~411.

Problem:
Current `composeRoutedInput()` clips optional context only. With ~5000-char supported USER ACTION + protected Director/V2/Schedule tail, the configured routine input budget can be consumed such that the entire authoritative SAVE_STATE head disappears or total can exceed intended budget.

Required fix:
- reserve a bounded **minimum authoritative SAVE_STATE** containing essential world/PC/selected NPC/scene runtime/event/momentum state.
- independently bound action and authority sections.
- total routine input <=9000 chars.
- preserve Director, V2, Schedule and final USER ACTION marker.

Exact local patch/test exists in #5386396220.

### P1-C — momentum can violate AFTERMATH / active-combat fixed flow
File: `api/lib/context-router.js` around ~281.

Problem:
`stall_streak >= 2` can trigger weighted `momentum-recovery` random NPC event while canonical Director is in `intervention=aftermath` or active combat. This undermines the deliberate breathing-room/consequence window and can create random cameo intrusion.

Required fix:
Add fixed-flow guards such as:
- `AFTERMATH_FIXED_FLOW`
- `ACTIVE_COMBAT_FIXED_FLOW`
before momentum random-event eligibility.

Exact local patch/test exists in #5386396220.

## Current P2 review findings on exact HEAD `df382f3...`
By policy these are normally non-blocking, but they affect Scene Momentum correctness and need deliberate review after P1 closure.

1. Compound duration:
   - `1시간 30분 쉰다`
   - `1시간 30분 기다린다`
   Parser can compute 90, but anchored intent regex currently accepts only one unit, so intent can fall to generic.

2. No-op delta rows can fake progress:
   - `stat_progress [{amount:0}]`
   - `skill_experience [{amount:0}]`
   Array presence can set growthChanged despite no actual persisted change.

3. NPC state mutation double-count:
   A single `npc_state_updates` mutation can set both `npcStateChanged` and `npcAction`, counting one logical mutation twice toward target.

4. Meaningful choice stop can count as stall miss:
   If a turn legitimately reaches an unforeseen player choice with no persisted state delta, current target accounting may increase stall despite a correct player-agency STOP.

Do not automatically mark these DONE. Decide narrowly after router P1 patch and exact-head re-review.

## Merge Readiness inconsistency — SAFETY WARNING
At the snapshot, sticky `Lumensia Merge Readiness` reported:
- Safety PASS
- Vercel PASS
- Codex COMPLETE
- Current P0/P1 = 0
- READY TO MERGE
for `df382f3`.

Direct review-thread inspection on the same PR/HEAD shows three **unresolved non-outdated P1s** in `api/lib/context-router.js`.

Therefore:
- **DO NOT trust current sticky READY as merge authority.**
- Do not merge PR #33 until those P1s are actually patched and a fresh exact-head cycle is clean.
- This may indicate a review-cycle/baseline filtering defect: after a HEAD change in unrelated files, previously current P1s on unchanged lines may be treated as baseline/ignored. This cause is an inference, not yet proven.
- Do not redesign automation inside the Narrative PR merely because of this. First close P1s; if the mismatch reproduces on a later current HEAD, open a separate protected automation fix and preserve all existing safety barriers.

## Codex push limitation
Repeated:
`CONNECT tunnel failed, response 403`.

Latest local router patch commit:
`17e26efa471b20626884bda73b3ba1dcbbeb3b7c`

`make_pr` fallback also failed because the Codex environment lacked required Python MCP module.
This is why the tested router patch remains in PR comment only.

---

# DO NOT BREAK / INVARIANTS

This section is merge/review critical.

## Runtime / API
1. Exactly **one canonical model/core call per normal turn**.
2. External stable endpoint remains `/api/chat-router`.
3. `api/chat-router.js` wraps canonical `api/chat.js`.
4. Stable `api/lib/context-router.js`; no versioned duplicate routers.
5. `store:false` preserved.
6. prompt cache and 24h retention preserved.
7. HF1 target/soft-max budgets preserved unless a separately approved change explicitly changes them.
8. Vercel Hobby/function constraints remain respected.

## Player agency
9. Never invent independent PC action/dialogue/emotion/thought/accept/reject.
10. Semantic compression may execute only decision-free intermediate steps of an **already declared** action.
11. Negated/hypothetical/question actions must not execute.
12. STOP at actual content-bearing player decisions, not trivial doors/corridors/steps.
13. META hard-freeze remains absolute.

## Event / continuity
14. completed Event Beats remain monotonic; never replay completed beats.
15. CONTINUE does not reapply previous state_delta.
16. Paused event null != completion; true completion still counts.
17. PC nonattendance does not cancel world schedules.

## Event Director / NPC autonomy
18. Direct user focus beats random Director rotation.
19. callback/payoff priority preserved.
20. schedule/location/knowledge/relationship constraints preserved.
21. surprise cooldown preserved.
22. present-participant exclusion preserved.
23. `NO_EVENT` outcome preserved.
24. NPC goals weight only already-eligible candidates.
25. blocked/completed/abandoned goals do not act as active Director motivation.
26. AFTERMATH/active combat must remain fixed-flow after current P1 patch.
27. No random special/high-secret NPC merely because they have not appeared recently.

## Save / canon / assets
28. `app.js` base version 1.4.8 is intentional; do not casually bump it.
29. New PC default skills/inventory stay neutral; never reintroduce old preset skill pollution.
30. Canon/NPC personality/relationships cannot be rewritten to make Narrative easier.
31. Canonical NPC key migrations remain conservative.
32. Current characters-v2 is 32-character / 13-state V2. Anastasia default now exists; older exception is obsolete.
33. Unknown expression must not synthesize arbitrary asset URLs.

## GitHub / merge security
34. LOW-RISK guarded automation may auto-merge; protected core/runtime/automation changes do not.
35. PR #33 is protected core/runtime and must be manually merged.
36. current HEAD occurrence only; prior-head review cannot authorize current head.
37. same SHA appearing again after A→B→A is a new occurrence.
38. generic +1 reaction is not merge authority.
39. privileged workflow executes only trusted default-branch code; candidate PR code must not access secrets.
40. Do not trust mutable branch ref when immutable exact HEAD is available.
41. immediately before merge:
    - refetch PR exact HEAD
    - refetch current main
    - Compare `main...exact HEAD`
    - require `base_commit.sha == current main`
    - require `merge_base_commit.sha == current main`
    - require behind=0
    - require no conflict
42. If main/head drifts, abort and rerun gates.
43. A stale/incorrect sticky READY must never override direct evidence of unresolved current P0/P1.

---

# REMAINING WORK (P0 / P0.5 / P1 / P2)

## P0 — must complete before PR #33 merge

### P0-1 Apply preserved router P1 patch to remote
Use PR #33 comment `#5386396220`, which contains the complete unified diff from local commit:
`17e26efa471b20626884bda73b3ba1dcbbeb3b7c`.

Apply only:
- `api/lib/context-router.js`
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/context-router.test.mjs`

Do not overwrite newer `lib/scene-momentum.js` / `scene-momentum-intent-guards.test.mjs`.

Patch must close:
- schedule note/confidence authority
- min SAVE_STATE under long actions
- AFTERMATH/active-combat fixed flow

### P0-2 Hosted validation on new exact HEAD
Run/verify:
- Safety Gate PASS
- Vercel PASS
- fresh exact-current-HEAD Codex cycle
- current P0/P1=0 by **direct thread inspection**, not sticky alone
- no conflict

### P0-3 Final merge revalidation
Immediately before manual merge:
- refetch PR HEAD
- refetch main
- compare main vs exact HEAD
- base_commit == current main
- merge_base == current main
- behind=0
- expected_head_sha guarded manual merge

### P0-4 Verify post-merge main
- main SHA
- Vercel production success
- `/api/health` appVersion/API markers
- update `docs/IMPLEMENTATION_PROGRESS.md` on main

## P0.5 — release correctness review before/around HF1 merge
These are current P2s, not silently promoted to DONE. Review whether narrow fixes are worth including before merge because they directly affect momentum accounting:
- compound hour+minute duration intent
- no-op growth delta rows
- NPC state double-count
- meaningful choice STOP satisfying progress/stall policy

If fixing, keep changes narrow and create a new exact-head review cycle.

Also re-check the Merge Readiness inconsistency. If the sticky still reports READY while current non-outdated P1s exist after a new occurrence, treat as separate protected automation defect. Do not weaken baseline/current-head safety to “make green”.

## P1 — next Narrative phase after HF1 is merged
1. Live-play acceptance with original problematic inputs.
2. **Scene Purpose** and explicit **Scene Exit Condition**.
3. stronger **Turn Hook** generation.
4. **Event Consequence chaining** across turns.
5. NPC Initiative / Goal Tick refinement.
6. off-screen NPC/world progression with bounded deterministic rules.
7. novelty/repeated-information suppression beyond prompt-only rule if live play still loops.
8. multi-system scenes where relationships/goals/schedule/event consequences interact naturally.

## P2 — longer Narrative roadmap
- Adaptive Time Scale V2
- Consequence Queue + Consequence Lifetime
- Active Threads manager
- Reputation Propagation / faction-social consequence
- Setup → Payoff memory
- NPC significance evaluation
- relationship threshold behavior
- NPC knowledge boundary enforcement refinement
- NPC-vs-NPC conflict
- Fail Forward system
- Off-screen World Progression expansion
- Multi-System Scene orchestration
- Memory Hierarchy
- novelty/repetition suppression scoring
- full Report-style Narration → Scene-driven Novel Prose recovery

Future gameplay roadmap already discussed but not DONE:
- NPC↔NPC Relationship V1
- Faction / Social Consequence V1
- Skill Learning V1
- Awakening / Talent Evolution V1
- Combat Growth V2
- Living World
- Event Director V3
- Long-term Consequence

Do not skip Narrative remaining work merely because HF1 merges.

---

# NEXT ACTION

The next chat should start here, not from initial Narrative diagnosis.

## Step 1 — restore exact live state
Read:
- `docs/LUMENSIA_HANDOVER_CURRENT.md`
- `docs/IMPLEMENTATION_PROGRESS.md`

Then query GitHub live:
- current `main`
- PR #33 current exact HEAD
- changed files
- current review threads
- Safety/Vercel

Do not assume the docs-only handover commit is still the HEAD if anything changed after this session.

## Step 2 — recover the already-tested router patch
In PR #33 conversation find comment:
- `#5386396220`
- text includes `Complete unified diff from local commit 17e26efa471b20626884bda73b3ba1dcbbeb3b7c`

Use that exact diff as the starting point.

Apply to **current** `codex/scene-momentum-recovery-hf1` only:
- `api/lib/context-router.js`
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/context-router.test.mjs`

Before applying, check that the expected current file blocks still match. If they drifted, port the same semantics carefully; do not reset newer helper work.

## Step 3 — tests after router patch
At minimum:
- `node --check api/lib/context-router.js`
- `node scripts/tests/context-router-authority-tail.test.mjs`
- `node scripts/tests/context-router.test.mjs`
- `node scripts/tests/scene-momentum-intent-guards.test.mjs`
- `node scripts/tests/scene-momentum-paused-event.test.mjs`
- `node scripts/tests/scene-momentum-v156-hf1.test.mjs`
- `node scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
- `node scripts/lumensia-pr-check.mjs`
- hosted Safety Gate
- Vercel

Explicit assertions needed from router patch:
- ~5000-char action + oversized optional context still <= 9000 routine chars.
- minimum authoritative save marker exists.
- world/PC/selected NPC/scene runtime/event/momentum essentials retained.
- GM Director marker retained.
- Event Director V2.1 marker retained.
- Schedule marker and schedule sentinel retained.
- event `note` retained.
- NPC `confidence`/commitment retained.
- USER ACTION remains final.
- AFTERMATH_FIXED_FLOW before momentum random selection.
- ACTIVE_COMBAT_FIXED_FLOW before momentum random selection.
- one canonical core call remains.

## Step 4 — exact-head review cycle
Request a fresh Codex review bound to:
- new exact HEAD SHA
- actual current main SHA
- new generation/occurrence

Ignore prior-head approval.
Directly inspect non-outdated unresolved review threads.

## Step 5 — merge only after true clean state
Do not accept sticky READY if it contradicts current threads.
After true P0/P1=0 + Safety/Vercel PASS + no conflict:
- final compare/revalidate current main + exact HEAD
- manual merge with `expected_head_sha`

## Step 6 — after HF1 merge
Update progress on main and begin **Scene Purpose / Turn Hook / Event Consequence** phase.
Do not restart the completed HF1 analysis from scratch.

---

# NEW CHAT START INSTRUCTION

Paste or follow this instruction in the next chat:

> `docs/LUMENSIA_HANDOVER_CURRENT.md`와 `docs/IMPLEMENTATION_PROGRESS.md`를 먼저 읽고 긴빠이/Lumensia 프로젝트를 그대로 이어가라. 이건 새 프로젝트가 아니다. 기존 HANDOVER 1/2/3의 설계 이유와 안전장치는 누적 Source of Truth다. 먼저 GitHub live main / PR #33 exact HEAD / current review threads를 확인하고 완료된 HF1을 처음부터 재분석하지 마라. 다음 작업은 PR #33 comment #5386396220에 보존된 local commit `17e26efa471b20626884bda73b3ba1dcbbeb3b7c`의 router P1 patch를 current branch에 적용하는 것이다. 대상은 `api/lib/context-router.js`, `scripts/tests/context-router-authority-tail.test.mjs`, `scripts/tests/context-router.test.mjs`이며 newer `lib/scene-momentum.js` 작업을 덮어쓰지 마라. Safety/Vercel/fresh exact-current-HEAD Codex P0/P1=0을 직접 확인하고, sticky READY가 current unresolved P1과 충돌하면 READY를 신뢰하지 마라. protected PR이므로 final current-main/merge-base/head 재검증 후 `expected_head_sha`로 수동 merge한다. HF1 merge 뒤에는 Scene Purpose / Turn Hook / Event Consequence로 계속 진행한다.`

---

# FINAL HANDOVER CHECK

- Previous HANDOVER 1 content/rationale preserved: YES.
- Previous HANDOVER 2 automation/race/security rationale preserved: YES.
- Previous HANDOVER 3 V1.2/current-base/manual-protected-merge rationale preserved: YES.
- Current GitHub live main/branch/PR/code HEAD recorded: YES.
- Merged V1.5.5 / V1.5.6 status verified from live GitHub: YES.
- Current Narrative problem and original-log standard recorded: YES.
- DONE vs PR-only vs local-only vs proposed work separated: YES.
- Files/tests/intermediate failures/current P1/P2 recorded: YES.
- DO NOT BREAK invariants recorded: YES.
- P0/P0.5/P1/P2 remaining work recorded: YES.
- Concrete NEXT ACTION recorded: YES.

**Do not start new feature work from this document-writing session.**
