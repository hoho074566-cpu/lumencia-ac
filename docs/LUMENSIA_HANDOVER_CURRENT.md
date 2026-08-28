# LUMENSIA — CURRENT INTEGRATED DEVELOPMENT HANDOVER

작성 기준: 2026-08-28
프로젝트: 긴빠이 프로젝트 / Lumensia Academy  
Repository: `hoho074566-cpu/lumencia-ac`

> 이 문서는 새 프로젝트 시작 문서가 아니다. HANDOVER 1(2026-08-19) → HANDOVER 2(2026-08-22) → HANDOVER 3(2026-08-23) → V1.5.5 NPC Motivation / Relationship Reason → V1.5.6 NPC Goal V2 → Scene Momentum Recovery HF1의 연속선이다.
>
> 완료된 HF1 진단을 처음부터 재분석하지 않는다. SHA / PR / checks처럼 변하는 값은 GitHub live 상태가 우선하며, 다음 세션은 이 문서의 **CURRENT BLOCKER / NEXT ACTION**부터 이어간다.

---

# PHASE 3 — AUTHORITATIVE CURRENT STATE

- Execution contract: `LUMENSIA_PHASE_3_ALL_IN_ONE_WORK_PACKAGE.txt`. Phase 3 started directly from verified remote main `6f1f45a644e2ece54a74577ce8a39afe4859e686`; Phase 2 remains COMPLETE and no deferred/frozen PR was used or modified.
- Queue: P3-PR01 **BLOCKED — CORE ACCEPTANCE FAIL / HUMAN EXACT PREVIEW RE-RUN REQUIRED**; P3-PR02 through P3-PR05 **TODO**. Overall `0 / 5 PR merged`. Do not start or stack P3-PR02.
- Active PR: [#88 P3-PR01 — Novel Director V2](https://github.com/hoho074566-cpu/lumencia-ac/pull/88), branch `codex/p3-pr01-novel-director-v2`, Event Actor / Micro-step Diet code checkpoint `6a21aeaf86f79477c268608a40da2b4a9f00dde0`, base main `6f1f45a644e2ece54a74577ce8a39afe4859e686`.
- Latest human exact-Preview acceptance remains **CORE ACCEPTANCE FAIL**. The previous version still literalized Director vocabulary into fiction, confused scene depth with schedule distance, used named NPCs as administrative functions, and returned disguised choices. Deterministic PASS is not qualitative acceptance.
- Production trace confirmed narrative micromanagement after the nominal Director contract: orchestration, Momentum, Purpose, Exit, Hook, novelty, character-behavior, active-thread, event/consequence, background/personal-story and action-tail prose directives repeatedly told the model how to execute a turn. The effective role was a Narrative Rule Executor rather than a serial-novel scene writer.
- Diet / Reset removes those writer-facing runtime directives while preserving their deterministic derivation, telemetry, persistence, post-processing, canonical data and safety gates. Due consequences, public world results and selected NPC goal initiative now reach the model only as compact read-only facts. No Phase 2 system was redesigned or reimplemented.
- The runtime contract is now one minimal writer contract plus hard authority. It asks for the next serialized-fantasy scene, natural completion of the current meaningful beat, routine compression, ordinary completion of an already-chosen action, immutable system facts, tell-after-show discipline and a Director→fiction firewall. Acceptance vocabulary such as Reaction Field, Subtext, Character Reveal, Conversation in Motion and Progressive Attrition remains in tests/human review rather than production prompt checklists.
- Hard+narrative contract footprint is `4,246 → 2,258 chars` (`-1,988 / -46.8%`; hard `1,416`, writer `842`). User action remains exact and final up to the supported 5,200-character route; no hard fact was removed to obtain the reduction.
- Context priority is reset around exact USER ACTION, canonical minimum, recent scene, at most three active NPC fact profiles, current-scene facts and bounded continuity. Static personality/voice continues through selected NPC CANON/SPEECH; dynamic goal, PC relationship, emotion, recent PC evidence and relevant directional NPC↔NPC relationship arrive as raw facts. Unrelated future schedule content is omitted unless directly requested or needed at a real time boundary.
- The next concrete root cause was a second writer authority below Novel Director: any compressed routine/travel intent could route the next PC-relevant `scheduleContext.upcoming` row even when the action's natural time window could not reach it. The same future occurrence could also recur through routed `scheduledEvents`, schedule-tail note/participants/status/importance, and selected NPC `npc_schedule` activity/commitment. This made the model treat a timetable as a pre-event scenario rail and invent filler such as training-ground/rule explanations before orientation.
- Scheduled Event Authority Diet keeps `scheduleContext` and deterministic time-floor authority intact but changes writer visibility. A future event is visible only when the USER ACTION explicitly identifies it or its timestamp lies inside the action's actual bounded time window. Its writer payload is only id/title/date/time/location and explicit mandatory metadata under `FUTURE CLOCK FACTS (SOFT CONTINUITY DATA)`; agenda/note, importance, status, participant list, NPC activity/commitment and the duplicate routed `scheduledEvents` block are absent. Already-started `due` events remain `IMMEDIATE EVENT FACTS (HARD DATA)` with current occurrence/participant facts, so real unavoidable events still intervene.
- Schedule-derived `schedule_boundary_minutes` is no longer emitted merely because an action is compressible; it appears only for a reachable boundary. An explicit wait for a named scheduled event still keeps the event time as a hard boundary. Distant soft schedules no longer accompany routine arrival, room organization or a different declared destination.
- Latest production trace found the remaining event rail below that schedule surface. `sceneRuntime.eventProgress.activeBeat` and the preceding unresolved menu reached the writer through authoritative minimum state, current-scene facts, routed detail state and Active Threads. One occurrence could appear four times, and a fresh exact USER ACTION could still be shadowed by the prior Turn Hook/Exit boundary. Separately, `filterTurnHookChoices()` treated any `event_progress` as sufficient reason to preserve every Suggested Action, so routine event subdivisions became a procedural menu.
- Event Actor / Micro-step Diet now gives the writer one compact continuity membership only: event occurrence ID, monotonic completed beats, pause state and an explicitly bound actor key when one exists. Model-authored `activeBeat`, due-event `note`, NPC schedule activity/commitment and duplicated scene/runtime copies remain internal. A fresh exact USER ACTION suppresses the preceding unresolved question/player boundary while AUTO/CONTINUE keep continuation context. `event_progress` alone no longer promotes procedural Suggested Actions; failure, direct NPC question, grounded real decision, travel alternative and combat boundaries remain intact.
- Actor audit found no canonical evaluator/host key on the current initial aptitude-evaluation event. Artemis is canonically a senior knight professor who often teaches at the training ground, but the event does not canonically assign her as its host; therefore no `evaluation => Artemis` special case was added. Existing `actor_key`/`npc_key`/`host_key`/`owner_key` authority is preserved through routing and every context-pressure tier, while participant order is never reinterpreted as host. A present Artemis still routes her canonical identity/voice/dynamic goal signal rather than a generic role label.
- Player sovereignty now protects only new PC intention, goal, dialogue, emotion and decision. Ordinary mechanics, required movement, immediate results and NPC/world reaction belonging to an already-chosen completed intent may be elaborated. No intent-completion engine or new state machine was added.
- Reference contamination audit remains PASS. Production contains no raw reference text/file marker, distinctive phrase, dorm→Sera/location→NPC mapping, test-to-production hook or NPC special case. The 80-seed dorm independence corpus still spans Lillia/Laris/Sera/Isabel/NO_EVENT, and unseen Mirabelle/herb-drying-room routing uses only current canonical relevance.
- Focused Diet/context/character/time suites plus the permanent Scheduled Event Authority and Event Actor / Micro-step corpora, 5,000/5,200-character USER ACTION, adaptive context pressure, authority tail, canonical progression, identity routing, one-call, `git diff --check`, and full `node scripts/lumensia-pr-check.mjs` pass. No engine, model call, schema, renderer, persistence root, time/progression engine, quota, score, Korean wording rule, actor-selection rule or reference special case was added.
- Exact code checkpoint `6a21aeaf...` is deployed at the PR branch Preview. Safety `33182587843` PASS and Vercel deployment `GUVMLZpLA5rbrxZqLMYCffkXMJeZ` PASS. The Preview was given to the user first; human must validate canonical actor, event fact/not script, already-chosen intent completion, real decision, routine admin, Named NPC character, Suggested Actions, schedule, canon and context safety. Human quality remains the top gate.
- Non-blocking P2/backlog remains unchanged. Scope expansion **NO**; deferred/frozen PR touched **NO**.
- Current blocker/NEXT ACTION: await the user's qualitative result on exact code checkpoint `6a21aeaf...`. Keep P3-PR01 blocked, Draft and unmerged until the user explicitly passes qualitative acceptance; P3-PR02 remains forbidden. Any remaining event-rail behavior must be tied to a new concrete production-path cause rather than more style rules.

---

# GLOBAL P0/P1 CONTINUOUS FIX & REVIEW RULE — 상시 적용

이 규칙은 Lumensia의 모든 구현·리뷰·수정 Phase에 계속 적용한다.

1. 현재 exact HEAD의 P0/P1이 하나라도 남으면 저장소가 허용한 자동 교정 범위 안에서 `원인 분석 → 최소 범위 수정 → focused test → full regression → commit/push → hosted gate → fresh exact-current-HEAD review`를 반복한다. 중간 보고, `MERGE_GATE: FAIL`, HEAD 변경, fresh review 필요, 예상보다 긴 작업만으로는 중단하지 않는다.
2. 사용자가 요청한 5-cycle 연속 진행 원칙은 repository-owned trusted Auto-PR controller에서만 적용한다. `AGENTS.md`가 정한 현재 권한이 우선하므로 일반 Codex-local 구현은 최대 2회, trusted controller는 최대 5회의 current-head remediation 뒤에도 P0/P1이 남으면 사람에게 인계한다. 한도 도달은 P0/P1이 해결됐다는 뜻이 아니며 gate는 계속 FAIL로 남긴다.
3. Current exact HEAD의 fresh Codex review P0=0/P1=0, Vercel PASS, 필요 deterministic/focused/full regression PASS가 확인돼야 stacked implementation-review cycle을 닫는다. Safety가 main-target-only라서 stacked PR에 존재하지 않으면 PASS로 합성하지 않으며, final main-target merge gate에서 Safety PASS를 별도로 요구한다. Prior-head review는 current HEAD 승인으로 재사용하지 않는다.
4. P2는 기본적으로 Phase blocker가 아니다. 단, 크래시·데이터/저장 손상·잘못된 world mutation·시간 역행/일정 무시·player sovereignty/canon 침해·관계/성장/스킬/보상의 잘못된 영구 반영·event progression corruption·주요 게임 진행 차단·보안/권한/merge safety·정상 주요 기능 regression은 현재 Phase에서 즉시 처리한다. 그 외 P2는 Known Issues/P0.5/backlog에 기록한다.
5. P3는 사소한 정리·문구·미세 UX·스타일·비핵심 edge case로 보고 현재 Phase에서 기본적으로 수정하지 않는다.
6. 같은 root cause의 유사 P0/P1이 3개 이상 파생하면 개별 wording/regex 예외를 계속 더하지 않고 authoritative single-source classification/state와 공유 canonical result를 우선한다. Canon, player agency, one canonical call, stable routing, safety architecture는 유지한다.
7. 작업 중단은 실제 write 권한 부재, 필수 외부 서비스 장애, 사용자만 할 수 있는 인증/권한, 중요한 플레이어/제품 선택, 도구/세션 한계, 또는 `AGENTS.md`의 자동 remediation 한도 도달처럼 저장소가 요구하는 사람 인계 조건에서만 허용한다.
8. Protected/core/runtime PR은 P0/P1 loop 종료 후에도 exact HEAD/current main, Safety, Vercel, fresh direct P0/P1=0, unresolved current threads, conflict, `main...exact HEAD`, base/merge-base/current-main 일치, behind 0을 재검증한 후 사람이 expected-head로만 병합한다. Sticky READY는 direct current-head P0/P1 보다 우선하지 않는다.
9. 큰 fix cycle마다 `docs/IMPLEMENTATION_PROGRESS.md`에 current HEAD, P0/P1, 수정, 테스트, fresh review, blocker, NEXT ACTION을 기록한다. P0/P1이 남으면 NEXT ACTION은 반드시 그 수정부터 시작한다.
10. Stacked PR에서 main-target-only Safety가 없는 것은 PASS로 합성하지 않는다. 이는 수정·리뷰·Preview 검증을 중단할 이유는 아니지만 final merge gate는 만족시키지 못한다.

---

# 0. NARRATIVE PHASE 1 FREEZE — AUTHORITATIVE CURRENT STATE

- Narrative Phase 1 is **FROZEN** on verified main `9f2274abeef7f34531c8d0240f66ed39293b9eef`. PR #67 NPC Significance Evaluator V1 was human-merged from exact head `3293e1c11569e5531518ae7e05918a54693c2bb9` and is present in that main merge.
- Completed and merged Phase 1 foundations are: Scene Momentum Recovery HF1; Scene Purpose, Explicit Scene Exit, Stronger Turn Hook, Multi-System Scene Orchestration, and Scene Novelty; Narrative Time/TPP, Active Threads, Event Consequence, Living World/Off-screen Progression, and World Result Surfacing/Event Director; NPC Motivation/Relationship Reason, NPC Goal V2/Goal Tick, NPC-to-NPC Relationship, Faction/Social Consequence, and NPC Significance Evaluator V1; Combat Growth V2, Skill Learning V1, and Awakening/Talent Evolution V1.
- PR #66 Setup -> Payoff Memory V1 remains open, unmerged, and **DEFERRED** at exact head `fbf2935c1229b8f16bed404b48c3cdf0abb95809`. Its distinct lifecycle blocker is that a validated resolved payoff receipt can be lost during later schedule reconciliation while payoff effects remain, leaving the callback stranded. Do not correct, commit to, merge, close, Preview-mutate, or reuse this branch.
- PR #68 Relationship Thresholds V1 remains open, unmerged, and **DEFERRED** at exact head `d58a31022ac7e5bc99c53fb1ee579405e78bd31f`. Current-turn threshold crossing is not reflected by pre-turn eligibility, and a rejected threshold claim's followup can remain in NPC plan/reason. Its correction budget is exhausted at 1/1. Do not correct, commit to, merge, close, Preview-mutate, or reuse this branch.
- PR #69 Knowledge Boundaries V1 remains open as draft, unmerged, and **DEFERRED** at exact head `99f7e4975a186e68cfa1340f06019c46d23501ae`. A narration-only NPC can lack `speaker_key` after normalization and fall out of current-scene membership, causing legitimate witnessed/told memory to be removed by the sanitizer. Its correction budget is exhausted at 1/1. Do not correct, commit to, merge, close, Preview-mutate, or reuse this branch.
- These deferred blockers are explicitly **not** Narrative Phase 1 FREEZE blockers. They are separate stabilization candidates for Phase 2/backlog, to be reassessed after Phase 2 using actual-play impact. Phase 1 adds no further Narrative Engine feature, correction, edge-case task, or scope expansion.
- Historical NEXT ACTION satisfied: Narrative Phase 2 and its separately authorized stabilization pass are complete. Keep Phase 1 deferred items untouched as backlog.

## PHASE 2 STABILIZATION PASS — AUTHORITATIVE CURRENT STATE

- PR #82 STAB-01 is **MERGED** from exact READY head `d589f7939a1296d966eeb46fc7c5174f8b9a00a2`. STAB-01 is not being reimplemented.
- PR #83 and PR #84 are **TERMINAL BLOCKED / FROZEN** at exact heads `f0bef9f59ef60274b170cc8bbae2a92c62bb60a7` and `e83f6ec6c625b0ed78a1776f4cd069aa48e9ac47`. Do not modify, merge, rebase, cherry-pick, reuse, or stack on either branch.
- PR #85 STAB-BASE is **MERGED**. Its merged exact head `4a7d492b2296b2ead96bdd26eadf151c7c015e7c` equals READY; merge commit/latest main are `c04ff7398ddd559ba12b409a22b9968725a8048c`, and reviewed/merged tree `662b9d62dc572886acb47ebfbe3860a89153bfc1` is identical.
- STAB-BASE post-merge verification PASS: canonical run identity capture, stale/old-run late-result rejection, run/Fate commit boundary and rollback journal, legacy migration write-before-delete, canonical Ending loader marker, focused/full regression, clean synchronized main, and repository integrity. Safety `33152325852` PASS; Vercel `6zr2ijVP3PEaxYHBftAJNQVrboQE` Ready; fresh review `5449854091` P0=0/P1=0; correction budget `0/1`.
- PR #86 **STAB-02R — Canonical Meta Progression / Inheritance / Next Life** is **MERGED** from exact READY head `2d66f2c14865928c1228e5bd87af58963dfd4db2`. Merge commit/latest main is `63c1af0fbf63fb7ec559db49095c24fd7c4eb912`; merged/reviewed tree `7881937d17c9301bd637ecbd5e9a7e17cdb6fd7c` matches. PR #83/#84 code and branches were never reused.
- Canonical historical Ending earned receipts and Inheritance spent receipts remain immutable accounting authority; current registries gate only new eligibility. Equality/subset/safe-superset imports preserve newer meta state, divergent or malformed state fails closed, and every valid state maintains `spent <= earned`.
- Same-device purchases use the named Web Lock and STAB-BASE Fate + Inheritance + run rollback journal. Old-run async results cannot enter Next Life. Origin locks fail loudly when incompatible; Realm/Circle cannot be bought and is recalculated after final inherited axes/talents.
- New Fate Affinity purchases use the existing public gameplay Director roster, excluding every hidden/rotation-locked/L5 key while preserving all historical receipts/accounting. Origin reroll receipt-limit P2 remains non-blocking backlog and unmodified.
- Hosted authority PASS: Safety `33158387423`; exact-head Vercel `5WPeU4soMhCHeMCr5QYBAn7UczM1`; production-main Vercel `496xBy5yC1FLkuVdtfW9p4bDvGU7`; fresh review `5450723024` P0=0/P1=0.
- Post-merge focused life-loop integration and full repository regression PASS on latest main. Character Creation → Fate Start → Origin → Background → NPC/World Reaction → Personal Story → World Consequence → Ending/Dead Ending → Fate Book → first-discovery reward/dedupe → Inheritance → Next Life is complete, with inherited state applied to the new run. Free/paste creation, Fail Forward, long USER ACTION, authority tail, context pressure, and player sovereignty remain PASS.
- Phase state: `PHASE_2_IMPLEMENTATION_PASS: COMPLETE`; `PHASE_2_STATUS: COMPLETE`. Add no new Phase 2 feature, correction, or discovery. Browser/Preview remains on the established bounded-unavailable fallback without retry.
- Historical Phase 2 NEXT ACTION is satisfied: Phase 3 began from verified main. Follow the authoritative P3-PR01 Exact Preview/human-merge blocker above; Phase 2 stays closed.

## PHASE 2 FINAL INTEGRATION CLOSURE — SUPERSEDED PRE-STABILIZATION SNAPSHOT

> This section preserves the PR #81 pre-merge stabilization decision. Current authority is the STAB-01 section above.

- `PHASE_2_IMPLEMENTATION_PASS`: **COMPLETE**. P2-PR01 through P2-PR09 are all terminal (`MERGED` or `DEFERRED`); no additional Phase 2 feature PR is started by this closure.
- `PHASE_2_STATUS`: **STABILIZATION REQUIRED / NOT YET PHASE 2 COMPLETE**. The Completion Rule requires Character Creation → Origin → Background → Personal Story → Ending → Inheritance → Next Life to exist on actual main. Current main has no merged Ending/Fate Book or Inheritance/Next Life runtime because PR #79 and PR #76 remain unmerged.
- Latest main: `2af377878fe26e36f4b582f92c64d870ff2dda76`, the human merge of PR #80 exact READY head `0a7683787d09dfc0473c31f9de635b8ea33ae332`. Merge parents are prior main `363d120ac5a52ffdc03797fc0baf3e317801e1c9` plus the exact READY head; merged/reviewed trees both equal `4d3e975c2e8f8ab40794b3be8cde207161cd245f`.
- Terminal PR table: P2-PR01 **MERGED** (#71); P2-PR02 **MERGED** (#73); P2-PR03 **MERGED** (#74); P2-PR04 **MERGED** (#75); P2-PR05 **DEFERRED** (#76); P2-PR06 **MERGED** (#77); P2-PR07 **DEFERRED** (#78); P2-PR08 **DEFERRED** (#79); P2-PR09 **MERGED** (#80). Count: `6 MERGED / 3 DEFERRED`.
- P2-PR09 post-merge verification PASS: PR #80 `merged=true`; exact merged head match; merge tree identity; current-main synchronization; focused Novel/UI, Fate/Origin/Background/Personal Story/NPC behavior, Living World/Event Consequence/World Result, Context Router/authority-tail, Scene Momentum/intent/Purpose/Exit/Turn Hook, CONTINUE/core suites; and full `scripts/lumensia-pr-check.mjs origin/main HEAD`.
- P2-PR09 retained its consolidated AI-first Novel Narrative Contract and presentation-only UI polish. Narrative/style footprint remains `5,321 → 5,230`; no new Narrative Engine, parser, save root, lifecycle, or model call. Safety #559 run `33133175892` PASS; reviewed-head Vercel `E4WvXf1aJSr7jydvEd3c7X9vKUEq` PASS; merged-main Vercel `GNnBZX1g8HGSSAbE9SMxijZLE3qF` PASS; final exact-head review `5047172362` P0=0/P1=0. Correction budget remains `0/1`.
- P2-PR09's five UI precision P2s remain non-blocking untouched backlog: hidden-route refresh on DEBUG re-enable, portrait refresh after the 80-record cap, participant-only title transitions, retained-title replay after truncated-history reload, and developer gating for separately enabled emotion diagnostics.
- Final integration regression PASS for the merged path: Character Creation/Fate Start → Origin → Background → NPC/World Reaction → Personal Story → existing Living World/Event Consequence/World Result. Long USER ACTION, explicit user restrictions, completed-intent continuation, routine compression, world-native continuation, scene-first prose guidance, important-scene density guidance, player sovereignty, one-call routing, authority-tail, and context-pressure invariants PASS.
- Final integration completeness FAIL only at the absent terminal-life stages: Ending/Dead Ending/Fate Book and Inheritance/Next Life are not present on main. This is not a newly introduced main regression or current save corruption; it is a required core-loop coverage gap before `PHASE 2 COMPLETE`.
- Deferred classification:
  - `MUST FIX`: P2-PR05 / PR #76 replacement-or-stabilization for a safe merged Inheritance + Next Life path; P2-PR08 / PR #79 replacement-or-stabilization for a safe merged Ending / Dead Ending / Fate Book path. Their existing deferred branches remain frozen and must not be corrected or reused by this closure.
  - `STABILIZE LATER`: Phase 1 PR #66/#68/#69 and P2-PR07 PR #78. Current main's existing setup/hooks, relationships, knowledge, Living World, Event Consequence, and World Result foundations pass; these deferred enhancements are real but do not block the already-merged portion of the loop.
  - `OBSOLETE / SUPERSEDED`: Narrative Flavor Baseline PR #72, superseded by P2-PR09's shorter consolidated contract that preserves authority-tail/context-pressure.
- Browser remains on the established bounded-unavailable fallback. No repeated recovery attempt or Preview mutation occurred.
- Repository integrity PASS: clean worktree before closure docs, main equals `origin/main`, behind 0, no conflict, exact merge parents/tree, full regression PASS, and merged-main Vercel PASS.
- **NEXT ACTION:** stop Phase 2 feature discovery. Do not return to any deferred branch automatically. A separate user-authorized stabilization decision is required for the two MUST FIX core-loop gaps (#76 Inheritance/Next Life and #79 Ending/Fate Book); until safe replacements are merged and the final loop is rerun, report Implementation Pass COMPLETE but Phase 2 COMPLETE blocked.

## PHASE 2 PROGRESS — SUPERSEDED P2-PR09 PRE-MERGE SNAPSHOT

> The section below preserves the PR #80 pre-merge checkpoint only. Its status and NEXT ACTION are superseded by the authoritative final integration closure above.

- Current main/base: `363d120ac5a52ffdc03797fc0baf3e317801e1c9` (human merge of PR #77 READY head `905e4a27eff56667dae14144fbcc3de27ea5e77b`); main tree `12ae972481250b3f5316704da4c9cb2201c2821e`.
- Active branch: `codex/p2-pr09-novel-experience-ui-polish`, created cleanly and directly from current main. It is not stacked on PR #76/#78/#79 and imports none of their unmerged implementations.
- Overall: `5 / 9 PR merged`; terminal before current work: `8 / 9 processed`; Phase 2 queue: `3 DEFERRED`; separate Narrative Flavor insertion: `1 DEFERRED`.
- P2-PR01 through P2-PR04 and P2-PR06 are **MERGED** at PR #71/#73/#74/#75/#77. P2-PR06's five precision P2 findings remain untouched non-blocking backlog.
- P2-PR05 Inheritance remains terminal **DEFERRED** at PR #76. Exact implementation/review head `cc51c1a2f9bee4cb77958f9e68cf056f7edffb39`; final docs checkpoint `f10897c5424263fdafc133bd27698cd5ff61b1d7`; correction `1/1`. No correction, merge, close, Preview mutation, branch reuse, or dependency inference.
- P2-PR07 Living World + Consequences remains terminal **DEFERRED** at PR #78. Exact implementation head `72f93c8ab0b9309f755729eecdcef862390684e3`; reviewed docs head `6251e1cc1218381097a33b0a71f668ee24ebfe81`; final docs checkpoint `12d14ae26781a3fae2f2cc3fe14f9da37daa2b52`; correction `1/1`. No correction, merge, close, Preview mutation, branch reuse, or stacking.
- P2-PR08 Ending / Dead Ending / Fate Book remains terminal **DEFERRED** at PR #79. Corrected implementation/review head `601dcd9c6e84a93c2ec8a82aeb0b35bf7f4f82c5`, reviewed tree `0030f4c30237bc118f2fdd6fca3e38e724ed060e`, final docs checkpoint `5f526b549696a3515c1db9d112f87348f98e4381`, correction `1/1`, fresh review P0=0/P1=1/P2=4. Do not reanalyze or correct its blocker; no merge, close, Preview mutation, branch reuse, or stacking.
- Narrative Flavor Baseline PR #72 remains draft/unmerged **DEFERRED** at exact head `8991f05a3d0faf65c7cb0aeb6046c23ec50c0a9d`; Phase 1 deferred PR #66/#68/#69 remain untouched at their frozen heads.
- P2-PR09 Novel Experience + UI Polish — **READY / HUMAN_MERGE_REQUIRED** at PR #80. Published implementation checkpoint `d8e4dcd9153e68bc4c99a2c7b22cc052a4d68cbb`, implementation tree `5eb83921efd13beaf7ac8da9d0a23da4ae743d46`, and reviewed code/docs head `e8fe0ca5ac13352245b77b1dac7b24408236a33c`. The production Router/style instructions were consolidated rather than appended: USER ACTION completion and restrictions are unified at the highest rule, duplicate authority rules were deleted, and a short canonical AI-first Novel Narrative Contract delegates scene prose, rhythm, sensory choice, subtext, density, causal continuation, and character-specific reaction to model semantic judgment.
- Production narrative/style footprint decreased from `5,321` to `5,230` characters. No prose scorer, wording regex policy, quota, narrative state machine, parser, lifecycle, save root, model call, generic NPC-thought engine, or deferred-PR correction was added.
- Presentation-only UI polish hides route/cost/cache/internal diagnostics when DEBUG is off, suppresses unnecessary repeated same-NPC/same-expression large portraits while retaining expression changes, stabilizes scene titles across routine micro-actions, labels Suggested Actions as optional/direct-input-compatible, and removes AUTO/CONTINUE prefixes from world-facing scene titles. The helper is ephemeral UI state and is included in the offline shell.
- P2-PR09 focused Novel/UI, Context Router, authority-tail, CONTINUE, core, Scene Momentum/Purpose/Exit/Hook, and NPC behavior suites PASS. Syntax/static checks, `git diff --check`, and full `scripts/lumensia-pr-check.mjs origin/main HEAD` PASS. Long USER ACTION preservation, user restriction priority, authority-tail, context pressure, and existing router/core invariants remain mandatory PASS.
- Browser/Preview remains on the already-established bounded-unavailable fallback; no repeated recovery attempt was made. Exact reviewed head Safety #558 run `33132619831` PASS, Vercel deployment `8TZdhNtkheBNeUZ1n41ycxptWc5E` Ready/PASS, and fresh review `5047127638` reports P0=0/P1=0/P2=3. Base and merge-base equal latest main, behind 0, ahead 2, mergeable/conflict-free, remote/local tree identity PASS, and repository clean.
- Three P2 UI precision observations remain non-blocking untouched backlog: preserve the latest hidden route badge for an immediate DEBUG re-enable, use a monotonic portrait refresh index beyond the 80-record cap, and recognize participant-only routine title transitions. They are not crashes, state corruption, player-authority regressions, or current correction triggers.
- ROOT_CAUSE_CLASS: **NONE**; CORRECTION_BUDGET: **0/1**; SCOPE_EXPANSION: **NO**; PHASE1_DEFERRED_TOUCHED: **NO**; PR08_DEFERRED_TOUCHED: **NO**.
- **NEXT ACTION:** publish this docs-only READY checkpoint and confirm its exact-head Safety, Vercel, and fresh P0/P1=0 review without changing the implementation tree. Then a human must merge PR #80 only if the head still matches the validated READY head. Protected `app.js`, `app-runtime.js`, and `api/**` changes prohibit Codex-local merge.

## PHASE 2 PROGRESS — SUPERSEDED PRE-PR07 SNAPSHOT

> The section below is historical and non-actionable. Its old branch/status/NEXT ACTION values are superseded by the authoritative P2-PR09 section above.

- Current main/base: `c1f7980fc3b2b15fac5311f6dcd78fdd4d1a9bea` (human merge of PR #75); reviewed final head `887595551facbcfe6a38a46fe77361627e1844b0` and merged main share tree `49deaa2909beb2cb1c8d584203e3786ab4395094`.
- Branch: `codex/p2-pr06-character-driven-npc-behavior` from current main. PR #76 is not a branch base or dependency.
- Overall: `4 / 9 PR merged`; Terminal: `5 / 9 processed`; separate bounded insertion: `1 DEFERRED`.
- P2-PR01 Fate Start Foundation — **MERGED** at PR #71 / main `f39fb9976ae7d98f1f66c0226285f041c12238bf`; focused/full/post-merge, hosted gates, fresh review, and user Preview acceptance PASS.
- Narrative Flavor Baseline — **DEFERRED** as draft PR #72 at exact head `8991f05a3d0faf65c7cb0aeb6046c23ec50c0a9d` (implementation head `341598a2f3c2f9054e4079c4ebfa528e752806d3`). Its focused A-D suite, syntax, and diff check PASS, but required `context-router-authority-tail.test.mjs` fails when an always-reserved policy removes the beginning of a 5,200-character USER ACTION at `.76` routine pressure. Root cause is **NEW_STRUCTURAL** context priority/budget ownership among the flavor policy, USER ACTION, and Director/Schedule; correction budget `1/1` is exhausted. Do not merge, correct, Preview-mutate, close, or use it as a base during this pass.
- P2-PR02 Origin / Starting Character — **MERGED** at PR #73. Exact reviewed head `a8364dbd57e556de94850e92d67af065777c9fd6`; merge commit/current main `650f35b1e790b87a31e265219df3a34c97b8ca28`; base main `f39fb9976ae7d98f1f66c0226285f041c12238bf`.
- P2-PR02 completed structured data-first procedural Origin, five-line Origin Story rendering, 1-3 stats/talents, ordinary appearance, Beginner/1 Circle realm, Origin+department skills, Origin-based admission, background flags, PC derivation, and v1/v2 save/load normalization. Five identical selections vary Origin, ability, skills, and admission route.
- P2-PR02 validation: focused generation/foundation/save/core/continue/NPC-goal runtime and full `scripts/lumensia-pr-check.mjs` PASS; Safety run `33085048914` PASS; Vercel deployment `CbgMotV4WC6nSQHZxn5bK2CtmrGG` Ready; fresh exact-head review P0=0/P1=0. Merged-main focused and full regression PASS; repository clean/synchronized. Browser Preview automation was unavailable due cloud tab-service timeout, not a code or merge blocker.
- P2-PR02 ROOT_CAUSE_CLASS: **NONE**; CORRECTION_BUDGET: **0/1**; SCOPE_EXPANSION: **NO**; PHASE1_DEFERRED_TOUCHED: **NO**.
- P2-PR03 Background Persistence + Character-Dependent Start — **MERGED** at PR #74. Base main `650f35b1e790b87a31e265219df3a34c97b8ca28`; reviewed implementation head `eba6117242cf693ee32736d8bdc61e657e0caf29`; final docs head `70b4b69510131709993e9fa4eab1920b296d587e`; merge commit/current main `e77e891f66ba8e2953c8ec0538fcdb0db56a50cd`; reviewed and merged tree `5f5ecd8bd81fce0c845b1171d7e7fa531f542821`.
- P2-PR03 completed persistent PUBLIC/LIMITED/PRIVATE/SECRET background facts under existing `creation.fateStart`, backward-compatible normalization for P2-PR02 saves, social-class/department starting routes, character-dependent first-impression/meaning guidance, and strength-aware evaluation without automatic NPC knowledge. It adds no rumor propagation, faction intelligence, global epistemic graph, relationship mutation, new save root, or PR #69 correction.
- P2-PR03 validation on `eba6117`: focused background/foundation/origin/context-router/authority-tail/continue/core tests, syntax/static checks, `git diff --check`, and full `scripts/lumensia-pr-check.mjs origin/main HEAD` PASS. Safety run `33091664978` (#538) PASS; Vercel deployment `38zaaaXoSPbnEFF5Wagkp9dwr5D9` Ready; fresh exact-head review `5441964057` reports P0=0/P1=0; merge-base equals current main, behind 0, conflict none, and repository clean.
- P2-PR03 first review P1 found stable runtime compaction omitted `creation`; **SAME_ROOT** correction `1/1` added it to base/stable compact payloads and executes the deployed compactor in regression. Two P2 findings remain `PHASE_2_BACKLOG_CANDIDATE`: evidence-gated natural-language disclosure of PRIVATE/SECRET facts requires separate disclosure semantics, and intake routes should later use a structured admission kind. SCOPE_EXPANSION: **NO**; PHASE1_DEFERRED_TOUCHED: **NO**.
- P2-PR03 post-merge verification: merge parents are expected base/final head, tree identity PASS, focused background test PASS, full `scripts/lumensia-pr-check.mjs` PASS, and repository was clean/synchronized before P2-PR04 branching. No P2-PR03 correction or additional Preview was performed.
- P2-PR04 Personal Story Hooks — **MERGED** at PR #75. Final reviewed head `887595551facbcfe6a38a46fe77361627e1844b0` merged as current main `c1f7980fc3b2b15fac5311f6dcd78fdd4d1a9bea`; reviewed and merged tree `49deaa2909beb2cb1c8d584203e3786ab4395094`. Focused/full regression, Safety #541, Vercel, fresh final-head P0=0/P1=0 review, post-merge identity, and repository cleanliness PASS. Bounded browser fallback remains non-blocking.
- P2-PR04 persists bounded dormant Personal Story candidates under existing `creation.fateStart`, preserves WORLD/NPC/PC Origin bridges, derives read-only Active Thread candidates, and delegates activation to the existing `hooks_add` lifecycle without a new save root/model call/parser/relationship mutation. ROOT_CAUSE_CLASS: **SAME_ROOT**; CORRECTION_BUDGET: **1/1**; SCOPE_EXPANSION: **NO**; PHASE1_DEFERRED_TOUCHED: **NO**.
- P2-PR05 Inheritance — terminal **DEFERRED** at PR #76. Exact implementation/review head `cc51c1a2f9bee4cb77958f9e68cf056f7edffb39`; final docs checkpoint `f10897c5424263fdafc133bd27698cd5ff61b1d7`; correction budget `1/1` exhausted. Fresh review `5046292132` reports P0=0/P1=2: stale/old-save import lacks authoritative cross-run Fate-ledger reconciliation, and occupation-only Origin locks lack region compatibility resolution/validation. ROOT_CAUSE_CLASS: **NEW_STRUCTURAL**.
- P2-PR05 Addendum J re-evaluation: all four continuation questions are **NO**. PR #76 is unmerged, so current main has neither its save-data risk nor regression; P2-PR06 can be implemented from main without Inheritance or Origin-lock contracts. Do not correct, merge, close, Preview-mutate, or reuse PR #76, and do not add a meta-ledger or generic constraint system in P2-PR05.
- P2-PR06 Character-driven NPC Behavior — **READY / HUMAN_MERGE_REQUIRED** at PR #77. Implementation head `12a3c14450ac02e4453a8b10e9137e9b1fb112a6` and reviewed docs head `e172d314de3b4c415f753573b6880fd2c5f567c3` on `codex/p2-pr06-character-driven-npc-behavior` are based directly on exact main `c1f7980fc3b2b15fac5311f6dcd78fdd4d1a9bea`. The bounded implementation routes existing NPC-owned PC memories, prior judgment, active goal, relationship, and internal emotion into one semantic character-behavior contract. The canonical model judges unusualness/danger/expectation/contradiction/goal/relationship meaning, revises judgment from independent repeated evidence, avoids repeated surprise/praise loops, and expresses internal emotion through behavior rather than copying it into dialogue.
- P2-PR06 persists an updated judgment only through existing `memories_add` BELIEF rows when it actually changes. It adds no save root, deterministic relationship threshold, generic social graph/emotion/relationship lifecycle engine, parser, model call, #76 dependency, or Phase 1 deferred correction. Focused P2-PR06 plus NPC significance/motivation/goal/relationship/orchestration/Context Router/authority-tail/CONTINUE/core regressions PASS; full `scripts/lumensia-pr-check.mjs c1f7980... HEAD`, syntax/static checks, and `git diff --check` PASS. ROOT_CAUSE_CLASS: **NONE**; CORRECTION_BUDGET: **0/1**; SCOPE_EXPANSION: **NO**; PHASE1_DEFERRED_TOUCHED: **NO**.
- P2-PR06 exact-head Safety #550 PASS, Vercel deployment `DewWfWAY7XMA71fqbgaUBAGjPsYz` Ready/PASS, and fresh review `5046433701` reports P0=0/P1=0. Five non-blocking P2s are recorded without correction: active-only goal context, latest applicable belief retention, short-name substring avoidance, emotion recency, and transient impression versus durable judgment. These remain precision backlog and are not merge blockers; correction stays `0/1`.
- P2-PR07 Living World — TODO.
- P2-PR08 Ending / Fate Book — TODO.
- P2-PR09 Novel / UI Polish — TODO.
- PHASE_2_BACKLOG_CANDIDATE: P2 `3872135947` — a custom department appended by free-mode paste can be copied into the Fate selector and then rejected by the fixed Fate allowlist. P2 `3872204510` — `/lib/fate-start.js` is omitted from the service-worker offline shell, so a fresh offline PWA launch can fail before the module is cached. PR #74 review P2: selectively routing a PRIVATE/SECRET fact after natural-language disclosure needs separate disclosure-evidence semantics; deriving intake lanes from a structured admission kind instead of social class needs a later Origin schema refinement. PR #75 review P2 `3875844073`: enforce one personal-hook materialization per turn while normalizing `hooks_add`; P2 `3875844079`: retain durable consumed-candidate state beyond the bounded 120-hook history. These remain non-blocking and do not expand current PRs.
- PHASE1_DEFERRED_TOUCHED: **NO**.
- NEXT ACTION: complete the final PR #77 docs-only closure-head Safety/Vercel/fresh review confirmation, then require human merge because protected `api/**` paths are included. PR #76 remains terminal DEFERRED and is not a dependency or branch base. Do not return to PR #72 or Phase 1 deferred PR #66/#68/#69, and do not retry the bounded-unavailable browser.

---

# 0. ACTIVE THREADS V1 POST-MERGE CLOSURE — AUTHORITATIVE

- PR #64 `Active Threads V1`은 reviewed exact head `4727a468f15c0f8e2990c4ae55cb688e12cc5ec6`에서 사람 병합됐다. 최신 `origin/main`은 merge commit `609c2bc0e4dd7931156687c32e59ed2ed2f28fa6`다.
- Merged main tree와 reviewed exact-head tree는 모두 `ce54953f9185642cd294a5bccfe401e002745a42`로 정확히 같다.
- Production Vercel은 main merge commit에서 PASS이고 `https://lumencia-ac.vercel.app/api/health`는 HTTP 200 / configured / adapter `0.8.7` / canonical `/api/chat` / stable `/api/chat-router` / `24h` cache / preserved HF1 budgets를 반환한다. 관측 app metadata `1.5.6`은 저장소의 stable app 계약 `1.5.4`를 바꾸지 않는다.
- Merged-main full `scripts/lumensia-pr-check.mjs`와 Active Threads focused lifecycle/routing/freeze corpus가 PASS한다. One canonical model call, `store:false`, prompt cache/retention, Context Router budgets, canon, player sovereignty, META/AUTO/CONTINUE freeze가 유지된다.
- Production 대표 runtime acceptance는 08:40 대강당 앞에서 입학식 진행을 시작해 09:00에 환영사와 안내를 완료했다. 이어 AUTO는 완료된 입학식을 재시작하지 않고 09:10의 다음 장면으로 진행했으며, 기사과/마법과/신학부 선택점에서 비활성화되어 control을 플레이어에게 반환했다.
- Active Threads V1은 기존 `activeEvents`, hooks, schedules, world arcs, Director callbacks, current/paused event progress, `completedEvents`에서 read-only derived view를 만들며 새 save root나 model call을 추가하지 않는다.
- PR #64 fresh exact-head review의 unresolved 항목은 모두 P2 backlog다. 숨김/중복/우선순위/슬롯 편중/반복 occurrence 관련 후속은 이번 post-merge closure에서 수정하지 않았고 새 correction을 시작하지 않는다.
- Active Threads V1은 완료된 Narrative Engine 기반 작업이다. 시간 엔진/TPP로 돌아가지 않는다. Longer roadmap에서 다음 미완료 항목은 **Setup -> Payoff Memory V1**이다.

---

# 0. TIME STACK POST-MERGE CLOSURE — AUTHORITATIVE PREDECESSOR

- PR #62 `Narrative Time + TPP stack integration`은 reviewed exact head `c58ce40bd970ab9032bfc2441310bd226eafa9c1`에서 병합됐다. 최신 `origin/main`은 merge commit `113cd14b3857f73eba1be3bdd24297ceeaa6681d`다.
- Merged main tree와 reviewed integration tree는 모두 `66bc75a0ef3bc222f0a2e2ac541988453bfa7a33`로 정확히 같다.
- Production Vercel은 main merge commit에서 PASS이고 `https://lumencia-ac.vercel.app/api/health`는 HTTP 200 / configured / observed deploy metadata app `1.5.6` / adapter `0.8.7` / canonical `/api/chat` / `24h` cache를 반환한다. 저장소 계약의 stable app은 계속 `1.5.4`이며, 이 관측 metadata는 canonical version authority가 아니므로 runtime/version 변경에 전파하지 않는다.
- Merged-main full repository regression과 core invariant corpus가 PASS한다. One canonical call, stable `/api/chat-router -> api/chat.js`, `store:false`, prompt cache/retention, Context Router budgets, canon, player sovereignty, META/AUTO/CONTINUE freeze가 유지된다.
- PR #54/#55/#56/#57/#58/#61은 PR #62를 통해 main에 통합되었고 별도 병합 대상이 아니다. GitHub에 integrated/superseded 기록을 남기고 모두 닫았다.
- PR #59 head `4325d604edff3b2a7bd2cab11bb40b95087b5819`와 PR #60 head `1a623867ec58fb1fd7dbba1a644efa889a24524f`는 closed-unmerged 상태다. 각각 safe tree 전용 29개/6개 커밋 중 merged main에 포함된 커밋은 0개다.
- 시간 시스템은 완료된 Narrative Engine 기반 작업으로 취급한다. 기존 P2/P3 backlog 때문에 새 TPP/Narrative Time correction이나 phase를 시작하지 않는다.
- Event Consequence V1의 bounded consequence queue/lifetime과 Active Threads V1이 완료됐다. 다음 미완료 Narrative Engine 항목은 **Setup -> Payoff Memory V1**이다.

---

# 0. HISTORICAL SESSION CHECKPOINT — NON-ACTIONABLE ARCHIVE

> 아래 시간-stack 개발 기록의 과거 P0/P1, blocker, MERGE_GATE, NEXT ACTION은 모두 위 post-merge closure로 superseded되었다. 이 절을 현재 작업 지시로 사용하거나 #54-#61 시간 작업을 재개하지 않는다.

## Live state immediately before this handover update
- Branch: `codex/time-plan-parser-phase3`, protected stacked PR #57, based on reviewed Phase 2 exact head `f0971430af351c4a007e18daa0bd18454e6aab4f`.
- Base/current main: `1018d8c27c451dc122982fb14bf7d3e3902c70ca` (PR #53 merge).
- PR #53 is **merged** from exact reviewed/accepted head `eae16c036c51767f2059b86cd5f0ef077764a3c8`. Merge and reviewed trees both equal `e2a4b99a89640a553dfbf0fa7f1748a201c039f3`.
- PR #53 post-merge verification passes: main Vercel is successful, production `/api/health` is 200/configured on app `1.5.6` / adapter `0.8.5`, and merged-main clean-LF full regression passes.
- Adaptive Time Scale V2 current runtime code checkpoint is `24407193b59d0f9e9cf2f9d8f1a4589b4b92c95c`, based directly on the verified PR #53 merge.
- The existing Scene Momentum classifier now supplies bounded profiles for dialogue `2–10`, meal `20–45`, training `30–120`, class `45–120`, sleep `240–480`, and distance-sensitive travel: within-building `2–8`, campus `5–20`, regional `15–60`, with the proven missing-location fallback `3–30`.
- Explicit activity durations remain exact unless an earlier required schedule interrupts them. Historical/future references such as `10분 전에` or `한 시간 후에` are not mistaken for activity duration, while a separate real duration in the same action remains usable.
- Direct questions/deliberation stay at the same moment. Required schedule and due consequence boundaries remain ahead of compression; important choices still stop. META/AUTO/CONTINUE remain outside the deterministic time floor.
- Adapter/health candidate is `0.8.7`; app remains `1.5.6`. Telemetry reports `adaptive_time_scale_v2` and the selected time profile without adding a save root.
- No new schema/migration, endpoint, serverless function, canonical `app.js`/`api/chat.js` edit, canon expansion, Context Router budget change, prompt-cache change, or second model call exists.
- Focused Scene Momentum/Exit/Purpose/Hook/Orchestration/Router/Event Director/NPC/growth suites pass. The full repository regression passes on exact runtime code checkpoint `24407193...`.
- Because `api/**` changes, the eventual Adaptive Time Scale V2 PR is protected-path and remains human-merge only.
- TPP Phase 3 is implemented on PR #57. It uses the structured ordered timeline for schedule/consequence/decision shortening, preserves only visibly completed prefix effects, removes unfinished suffix effects, and reconciles time/narration/choices. One canonical core/model call, stable routing, `store:false`, prompt cache/retention, Context Router budgets, canon, player sovereignty, and freeze behavior remain unchanged.
- Current Phase 3 code head `cf3cb1ae2d39cc9ffa8c18220d247e0e7cdcd5b6` passes the focused Phase 3/time-floor suites, syntax/static checks, `git diff --check`, and the full `node scripts/lumensia-pr-check.mjs f0971430... HEAD`. Vercel is Ready, GitHub reports the PR mergeable, and the stack remains exactly based and merge-based on reviewed Phase 2 `f0971430...`, behind 0. Fresh exact-head reviews report direct P0=0/P1=0. The only new current-head finding is a non-blocking P2 about schema-supported `world` ownership being fail-closed during shortened-turn projection; it is recorded for structural follow-up and is not converted into a Phase 3 P0/P1 blocker.
- Exact Preview Phase 3 acceptance passes on that code head without reading or bypassing Preview protection. `안내원과 10분 대화하고 8시간 잔다` advanced 08:40→09:00 at the required entrance schedule, retained the completed dialogue, left sleep/fatigue reward unapplied, and returned a real player-owned decision. CONTINUE and META kept 09:00, while AUTO stayed disabled at the decision. After resolving the disposable acceptance scenario, `이곳에서 25시간 기다리고 8시간 잔다` advanced exactly 1,440 minutes to the one-turn cap; AUTO then resumed exactly the remaining 540 minutes (one hour wait plus eight hours sleep) and stopped at the next player decision. No suffix reward was applied before its clause completed.
- Phase 4 started separately on `codex/time-plan-parser-phase4` from reviewed Phase 3 docs exact `3fde9714fa4835278b40d94b29c263394b001573`. The first legacy-cleanup code checkpoint is `53168db4009673ffe0d521e1e2acc551684eb9bd`: for an eligible multi-clause plan, missing/invalid `time_execution` can no longer use narration as authority that the terminal clause completed before a choice. A valid clause/effect receipt remains authoritative; single-clause and TPP-ineligible uncertain plans retain their existing fallback. This removes one authority path only and adds no parser coverage, regex, feature, or reconciliation policy. Focused Phase 3/time-floor tests and the full repository regression pass. The `owner_kind:world` P2 remains explicitly untouched.
- Phase 3 exact code head `866e486da4e6d91d68c8f221c28beed72532af73` passed the full repository regression, Vercel, exact Phase 2 base/merge-base `f0971430...`, behind 0, conflict-free mergeability, and the first Exact Preview boundary case: `1시간 훈련하고 8시간 잔다` stopped at the 09:00 required schedule after 20 minutes without applying unfinished training/sleep effects. A delayed fresh rebind review on that exact head superseded the earlier zero-finding review and found the two structural P1s recorded in the latest closure cycle below; `866e486...` is not merge-authoritative.
- Fresh direct review of exact head `4a57bb1...` found six P1 boundary-evidence cases. Code checkpoint `375b980d3edcbbbdd7a63f05a22f5fe7a36036ba` closes all six with a single ordered pre-choice evidence view, positive-range versus exact-zero discrimination, action-bound completion modifiers, actual-prompt selection, and additive-adverb actor filtering. Permanent focused regressions and full `scripts/lumensia-pr-check.mjs` pass. The new docs exact HEAD still requires Vercel and fresh direct review; any P0/P1 continues the correction loop immediately.
- Fresh review of docs exact head `57884cf...` found six further P1s. Code checkpoint `f58405a915c2645c95de665673454074eacaf3ce` now fail-closes repeated action kinds without disabling the boundary, distinguishes later-action context mentions from real transitions, binds choices to their actual prompt, preserves grounded terminal-maximum time, retains only evidence-attributed completed-prefix lifecycle effects, and preserves a verified short travel destination. All six have permanent regressions; focused/full local checks pass. Push the docs checkpoint and require another exact-head Vercel/direct review cycle.
- Fresh direct review `PRR_kwDOT8LCAs8AAAABK9bXDQ` of exact docs head `681f34268cfa396593421e78d4fdbcb816128f73` found three P1s: no-choice boundary evidence was not ordered before the boundary, aggregate fatigue/gold could be misassigned to a completed prefix, and a coincident schedule/consequence could override a real choice reconciliation. Code checkpoint `270eeef9ed0c249713490343674aec5e9b73b117` now clips schedule/consequence evidence before the visible boundary (or requires upper-bound completion when ordering is unavailable), fails closed for aggregate scalar ownership in shortened compounds, and gives the player choice visible priority while preserving authoritative started-schedule state. The exact choice prompt is retained instead of later rhetorical narration. Permanent focused regressions and the full repository check pass; publish the docs checkpoint and continue exact-head hosted/direct review.
- Exact head `83817d7c...` passed Vercel and exact-stack comparison, but fresh direct review `PRR_kwDOT8LCAs8AAAABK9ktdw` found three P1s: same-sentence prefix completion could be discarded with the boundary segment, a later choice evidence slice could outrank an earlier applied schedule/consequence, and conditional passive completion could be treated as occurred. Code checkpoint `9e94a840a1ca5bba73a870d3834f2fe20c9e04a8` now clips at the exact boundary character while retaining preceding text, uses the actually applied boundary's ordered evidence (and combines hidden-boundary upper-bound fail-closed with pre-choice evidence), and rejects conditional/future passive forms. Boundary connective completion is accepted only inside a verified clipped prefix. Permanent regressions and focused/full local checks pass; publish and continue fresh exact-head review.
- Exact head `d7b164ff...` passed Vercel and exact-stack checks. Fresh direct review `PRR_kwDOT8LCAs8AAAABK9uBkQ` found two P1s: actor particles followed by punctuation could hide an NPC subject, and a mixed prefix/suffix NPC state row was preserved wholesale. Code checkpoint `d902c813bd890e21733415ffabfba8dc0d11ce6a` recognizes punctuation after every supported subject particle and preserves completed-prefix NPC state one supported field at a time. Permanent actor and mixed-row regressions plus focused/full repository checks pass; publish and continue fresh exact-head review.
- Exact head `408fcc835abfead23c21a4794c130cc1ccf59a28` passed Vercel and retained exact reviewed Phase 2 base/merge-base `f0971430...`, behind 0, and mergeability. Fresh direct review `PRR_kwDOT8LCAs8AAAABK92g3w` found three P1s: lower-bound-only duration could receive an invented exact upper bound, a short visibly completed effect such as `검술책` could be lost, and suffix reconciliation could erase the lifecycle of a newly surfaced Director event whose choices were returned to the player.
- Code checkpoint `f539ba8a1ad50ce8f2baeb2e55328fe51ab5e232` closes the three causes without expanding wording-specific execution. Lower-bound-only duration remains explicitly unbounded and cannot authorize a structured exact timeline; completed-prefix effects accept an exact visible bounded string before the existing semantic fallback; and a nonterminal, newly introduced Director interruption retains only its exact event ID, progress, and Director metadata when its response choices own the applied boundary. Permanent regressions cover all three cases. Phase 1/2/3 focused tests, Scene Momentum time-floor, syntax/static checks, `git diff --check`, substantive second review, and full `node scripts/lumensia-pr-check.mjs` pass. Publish this docs checkpoint and continue exact-head hosted/direct review.
- Exact docs head `7244b99d368e9a1a7d00f6f4e115284f55cbd152` passed Vercel and exact-stack checks. Fresh direct review `PRR_kwDOT8LCAs8AAAABK9_l9A` found three P1s: Director lifecycle restoration was not yet proven to precede the retained prompt, a preserved `current_goal` could be detached from its Goal V2 replacement identity metadata, and rejecting an unbounded exact timeline also disabled safe choice-only suffix reconciliation.
- Code checkpoint `deff32924333869b77bdbd1a8fbfb055b1829055` binds each fix to ordered evidence. Director lifecycle survives only when its reason/note/beat is visible before the selected prompt; an NPC goal replacement is kept only as a cohesive, prefix-evidenced `current_goal + goal_replace + goal_reason` update (with an evidenced next action); and lower-bound-only compounds receive a separate non-authoritative structured decision plan whose open maximum stays `null`. It may strip unperformed suffix effects at a recognized choice while retaining the model's reported elapsed time, but it cannot arbitrate exact schedule/consequence timestamps. Permanent positive/negative regressions cover all three findings plus exact-zero versus positive upper-bound behavior. Focused suites, Goal V2, Director/Orchestration, syntax/static, `git diff --check`, substantive second review, and full repository regression pass. Publish and continue exact-current-HEAD hosted/direct review.
- Exact docs head `8471a6d5c701b0a1703e23483b3c89ca95c73c99` passed Vercel and exact-stack checks. Fresh direct review `PRR_kwDOT8LCAs8AAAABK-KsOQ` found six P1 variants from one remaining root cause: additive `도` completion ownership, exact-prefix underreported clocks, segment-wide unrelated negation, incidental token overlap for suffix array effects, duration-bound finite wait completion, and a prefix rest completion being mistaken for terminal sleep completion.
- Code checkpoint `31848c85f2ce7ac056ca09c128939916eb40aba9` unifies these through structured prefix evidence rather than independent wording patches. Completion ownership reuses the parser's exported additive-adverb classifier; ordered decision evidence may raise only an exact completed prefix to its proven time, while ranges/unbounded plans remain fail-closed; negation retracts completion only when the post-completion contrast governs the same action claim; object effects must not name an unfinished clause type and generic temporal tokens no longer prove attribution; finite wait evidence must fall inside the structured clause duration; and terminal completion is checked against the final clause action type (`sleep` versus prefix `rest`). Permanent regressions cover all six positives/negatives. Focused Phase 1/2/3, Scene Momentum, Goal V2, Event/Orchestration, HF1, syntax/static, `git diff --check`, substantive second review, and full repository regression pass. Publish and continue exact-current-HEAD hosted/direct review.
- PR #54 was opened from exact docs head `649dc8747b8463f039c6040e55d09b2a6ba525f2`; Safety #397 passed and Vercel was Ready. Exact Preview live play passed direct-question same-moment, dialogue `+3`, within-building `+7`, explicit wait `+10`, campus travel `+10`, meal `+35`, training `+60`, class `+60`, regional travel `+15`, historical-duration question freeze, and CONTINUE/META/AUTO freeze. It exposed two time-normalization failures: a narrated 11:05→12:00 required-schedule stop applied the full explicit three hours to the clock (`14:05`), and a plain `잠을 잔다` completed with choices after only `60` minutes instead of the `240–480` sleep range. A compound travel-and-sleep sentence also fell outside the sleep classifier.
- Correction checkpoint `fb239378d4d724b59bf4a4cadd8fb3b3b4f55c03` clamps completed compressed actions to their profile bounds, aligns visibly reached required schedule/consequence boundaries exactly, preserves a genuinely new Director interruption, strengthens the downtime hard-range instruction, and recognizes terminal sleep in a compound action while preserving question/negation guards.
- Prior-head Codex review also reported one P1 for natural object-duration-verb order. Code checkpoint `4a2533a7a08d7b3e7348e02ae21e7011d0f6a089` closes it narrowly: `점심을 한 시간 동안 먹는다` and `수업을 두 시간 동안 듣는다` now retain exact `60`/`120` minute profiles. Focused and full clean-LF regression pass. P2 dialogue/regional/building-anchor expansions remain non-blocking and are not mixed into this correction.
- Exact head `8f5051cda8dd428dc6d9cdedb137a9038bcc7c9b` passed Safety #399 and Vercel Ready. Affected-first Preview reruns passed: required schedule `11:25→12:00`, plain sleep `+360`, and compound travel-plus-sleep `+360`. The full matrix also passed direct question `0`, dialogue `+2`, campus `+10`, meal `+30`, training `+75`, class `+50`, regional `+15`, explicit wait `+30`, historical question `0`, CONTINUE `0`, META `0`, and an ordinary within-building move `+5`. AUTO remained outside the deterministic floor and independently advanced the world from `01:35→07:35`; no prior sleep profile was reapplied.
- Fresh review on `8f5051c...` reported four P1s: clock-minute text mistaken for duration, ranged activity crossing an intervening schedule, missing timed-activity consequence lookahead, and unreconciled future deltas when model time is shortened. The local focused correction masks clock components, caps any model range that actually crosses a PC-relevant schedule, routes compressed activity minimum lookahead, and fail-closes future event/schedule/NPC/memory deltas while preserving action-local location/resource/growth effects. Focused/affected suites, `git diff --check`, syntax checks, and the full `scripts/lumensia-pr-check.mjs` pass. A new exact-head hosted/review cycle and affected Preview rerun are pending; Codex must not merge this protected-path PR.
- Exact correction head `aa48223540c58904389a92bf3784240839149235` is current against main, mergeable, Safety #400 PASS, and Vercel Ready; its fresh Codex review is pending. The first affected Preview input exposed a distinct remaining clock-start P1: from `07:40`, `10시 30분에 기초 수업을 듣는다` narrated the 10:30 start while the unscheduled class maximum clamped the authoritative clock to `09:40`. The new local correction parses a future clock as a start offset, adds the activity duration after that offset, leaves past ambiguous clocks unrolled, and gives consequence/schedule routing the same total horizon. The exact reproduction now deterministically applies at least `215` minutes (`170` to start + `45` class minimum); focused/affected suites and full `scripts/lumensia-pr-check.mjs` pass. Commit/push, a new exact-head authority cycle, and the affected Preview rerun remain; Codex must not merge.
- Exact head `44ba95731b366e1f68b7dd970efdfcb4d669fc06` passed Safety #401, Vercel Ready, current-base mergeability, and the future-clock Preview rerun: `09:40 → 10시 30분 수업` completed at `12:00` (`+140`, inside the `95–170` total range). The next ranged-schedule rerun exposed a same-type boundary reconciliation failure: from `11:00`, training returned `advance_minutes=40` but visibly said the noon bell had rung and offered schedule-response choices, leaving the authoritative clock at `11:40`. Automatic correction stopped under the user's recurrence rule, then the user explicitly resumed a structural fix. The local correction now distinguishes a mere future mention from an exact structured occurrence or visibly occurred exact-time boundary; only the latter aligns to the authoritative schedule inside the activity maximum. It also strips boundary completion/removal at the start, closes omitted schedule/NPC-schedule fields when shortening time, and has permanent negatives for future/speculative bells, same-hour later times, and distant schedules. Focused/affected and full repository checks pass; commit/push and a new exact-head authority/Preview cycle remain.
- Adaptive Time Scale V2's current runtime code checkpoint is `24407193b59d0f9e9cf2f9d8f1a4589b4b92c95c`. It includes the final allowed independent fix: complete owner-identity matching keeps `npc:lena` off the PC schedule path while preserving `pc:cain`. Focused suites, full `scripts/lumensia-pr-check.mjs`, Safety run `32947576791`, Vercel, base/merge-base `1018d8c...`, behind 0, and conflict-free mergeability pass. Fresh exact-head review `5028340142` reports four remaining P1s, all from the wording-specific parser: past relative-date starts, day-relative date plus clock composition, committed `훈련하자`, and destination-aware travel timing for a compound prefix. Per the user transition rule, no more PR #54 regex patches are allowed. These four reproductions and all existing PR #54 regressions become the TPP corpus. Direct P1 is not zero, so PR #54 is not merge-ready and the required Preview merge gate is not rerun yet.
- Living World V1 advances Bounded Off-screen Progression from public schedule starts to an explicit-completion lifecycle. It never infers completion merely because time passed.
- Only `scheduled_events_complete` for an already-started public, non-PC schedule may close absent known NPC status and append a bounded `종료 확정` digest row. Generic event completion is not sufficient.
- Current-scene speakers, model-authored NPC updates, unknown NPCs, PC-relevant schedules, secret/restricted schedules, future schedules, completed/cancelled rows, and disabled background simulation remain protected.
- One turn remains bounded to two schedule transitions and two NPC updates. Completion is prioritized; start and completion phases have separate compact telemetry.
- No new save root, schema migration, endpoint, serverless function, canonical `app.js`/`api/chat.js` edit, canon access, or model call was added. Adapter candidate is `0.8.4`; app remains `1.5.6`.
- Focused Living World/Event Consequence/NPC Goal/Scene Momentum/Scene Orchestration suites and the authoritative clean-LF full repository check pass. A second regression/scope review found and closed the zero-minute explicit-completion boundary. Targeted Exact Preview acceptance also passes: the public non-PC magic orientation moved known absent Lena to `일정에 참여 중` with one start digest, ordinary time passage did not infer completion, and an explicit public completion moved her to `일정을 마침` with one completion ID and one `종료 확정` digest. The acceptance used the signed-in Preview without reading tokens, cookies, or local storage.
- Exact head `7b63bab...` passed Safety #379 and Vercel Ready. Chrome then reached its Exact Preview: deliberate physical training passed at `D 0→1`, and mere use stayed `1→1`, but failure plus a visible imperative correction stayed `1→1`. Telemetry proved one proposed stat row was rejected at evidence tier zero. Correction 1/5 `57085b0...` recognized the exact “지시를 적용한 마지막 반복” form. On intermediate exact head `3a48337...`, Repository checks and Vercel passed, but a fresh natural variant split the same evidence across “교관이 지적” and a later subjectless successful repetition; it again stayed `1→1` with `rejected_stat_count:1`. Correction 2/5 `451679f...` links only adjacent instructor technical guidance to a successful PC repetition, strips the leading `이번에는` discourse marker before ownership checks, expands bounded physical relevance, and adds explicit named-NPC non-transfer coverage. Focused and authoritative clean-LF full checks pass. Repeat Safety/Vercel/fresh review and Preview acceptance on the new exact head. Do not extract a protection token, bypass Preview protection, or repeat the same browser-setting work.
- Exact code/docs head `d980b33...` deployed successfully to Vercel. Its fresh Preview rerun used a new `이번에는` deliberate-training action and visibly produced instructor diagnosis followed by “마지막 반복에서는 지시한 각도와 순서를 적용해 발이 엉키지 않은 채 진입을 끝냈다”; nevertheless `신체` stayed `D [1/100]`. Exported telemetry again reported `evidence_tier:0` / `rejected_stat_count:1`, proving the same natural-language evidence-classification failure recurred with a different completion phrase. This is the user's automatic-stop condition 1 (repeated same-type P0/P1 recurrence). Do not add another success-synonym patch automatically; report and wait for explicit direction on a more structural bounded evidence rule.
- The user explicitly resumed after that stop. Correction 3/5 `717e85c...` removes success-word enumeration from the linked-correction path: bounded tier-1 evidence now requires a player-owned deliberate action, visible instructor technical guidance, an adjacent final repetition, visible application or technical adjustment, and identified cause. It strips only the final-attempt lead before existing third-party attribution checks. Permanent regressions use the exact failed live response and reject missing-guidance, named-NPC-at-start, and named-NPC-after-lead variants. Focused and authoritative clean-LF full checks pass; new exact-head hosted gates and Preview rerun are next.
- Exact head `c7b10ac...` passed Repository checks and Vercel deployment. Its fresh Preview produced a new player-owned deliberate correction scene, but split the structural evidence across adjacent narration rows: row 1 contained `마지막 반복에서는 ... 지시를 그대로 적용했다`, while row 2 contained `실패 원인은 ... 있었다`. `신체` stayed `D [1/100]`; telemetry again reported `evidence_tier:0` / `rejected_stat_count:1`. This is another same-type recurrence after correction 3/5, so automatic work is stopped again under condition 1. If explicitly resumed, the next bounded design is a maximum two-row correction bundle that joins final-application and immediately following cause evidence while running third-party attribution over the combined bundle.
- The user explicitly resumed correction 4/5. Code checkpoint `5235c6c...` joins only a final-application narration row and its immediately following cause narration row; instructor-guidance TTL, application/technical-adjustment evidence, and combined third-party attribution all remain mandatory. Intervening rows, named-NPC cause ownership (including a later PC mention), and all wider windows are rejected. Focused tests and the authoritative clean-LF full regression pass. The new exact-head hosted authority cycle and affected Exact Preview rerun are pending.
- Exact code/docs head `215e335...` passed the GitHub Safety Gate, Vercel Ready, Merge Readiness, and fresh Codex P0/P1=0; the review reported two non-blocking P2s. Its affected Exact Preview rerun produced final application, then a short instructor dialogue, then cause identification. `신체` remained `D [1/100]`, and exported telemetry reported `evidence_tier:0` / `rejected_stat_count:1`. This is the same split structural-evidence rejection after correction 4/5, so automatic correction is stopped under user condition 1. Do not consume correction 5/5 or widen across dialogue without new explicit direction.
- The user explicitly resumed correction 5/5. Code checkpoint `e21b207...` allows exactly one intervening instructor dialogue only when it directly addresses the player, while non-instructor, unaddressed instructor, two-dialogue, wider-gap, and NPC-performer variants remain rejected. Exact code/docs head `ebd844f...` passed the GitHub Safety Gate, Vercel Ready, Merge Readiness, authoritative clean-LF full regression, and fresh Codex review P0/P1=0.
- Exact Preview Combat Growth acceptance now passes. Earlier deliberate low-grade physical training produced bounded growth `D [0/100]→D [1/100]`; the correction-5 affected failure/guidance/application/cause turn produced `D [1/100]→D [2/100]` with telemetry `evidence_tier:1`, `rejected_stat_count:0`, and `rejected_skill_count:0`. Mere use, NPC-only observation, question-only explanation, and an ordinary non-training victory each stayed `D [2/100]`; CONTINUE, META, and AUTO also preserved exact `D [2/100]` growth state. The acceptance browser used the user's signed-in Exact Preview tab without reading protection tokens, cookies, or local storage.
- PR #47: **merged** from exact final head `866c991fb52a77079a191a5d7452e7fecf035ce9` as `54327ea2a5c559a18681f4a4bc8795cc9c1c57a8`. The merge and reviewed-head trees both equal `143b56d473825969763e9440aca0c4c3100ab3b5`; production `/api/health` is healthy on app `1.5.6` / adapter `0.8.3`.
- PR #46: **merged** from exact reviewed head `2843e5bc9ee8169acb7e82b5db9b392beea93539` as `6204843e1cf6f45a9386c13b942c100cd6c7377b`. Merge and reviewed-head trees both equal `4c045c27ccb30f6593370ae2b8e811bebcb39691`; production `/api/health` is healthy on app `1.5.6` / adapter `0.8.3` and advertises Faction Social Consequence V1.
- PR #45: **merged** from exact reviewed head `583b7622500b9916dd31697d0d6e845f81790ed6` as `71074ccc7a5fd00f193a6aec8b7a1ff82eae1aab`. Merge and reviewed-head trees both equal `690e6a88c015bd28e67bba0bf03bfdba6e73a6c8`; merged production `/api/health` is healthy on app `1.5.6` / adapter `0.8.3`.
- PR #44: **merged** from exact reviewed head `e5fae96ac271a617db42627a99d53a720299a213` as `fe6b4a5dcc0f0a96b71d8fcffcf8666caeefd82b`. Merge and reviewed-head trees both equal `f4aeadd44c116682d60385c265e3f35f3b48ea0e`; merged production `/api/health` is healthy on app `1.5.6` / adapter `0.8.3`.
- PR #43: **merged** from exact reviewed/accepted head `6b4f5990278ce8d3446c7b5be94a899a72d9fc80` as `fd2bcff13007fdf66c04477b9f69066f7c9b871e`. Its merge tree exactly equals reviewed head tree `5b6b56b272de438e3db6a53027ce13b75ff7cace`; merged-main Vercel, production `/api/health`, and the clean-LF full PR check pass.
- PR #42: **merged** from exact reviewed head `6c115e661ed7257b3787b74d5f142a1c0b39e38d`. Safety #32741095125, Vercel, exact-head Codex P0/P1=0, and targeted Exact Preview acceptance passed. Merge `8c5ca35...` and reviewed head share tree `22195b469f2ccb1b3afdc7c197f5259fb110d59a`.
- PR #41: **merged** from exact reviewed head `06617b3ffe11d83bc512d7e4f520c17946d7bdf0`. Safety/Vercel passed, fresh exact-head Codex P0/P1=0, and the targeted delayed-result player-choice/no-early-fire/due/no-repeat Preview lifecycle passed. Merge commit `da248a2...` has tree `2bac9dd94468d37ff0cb7787ad6c42cdba478b27`, exactly equal to the reviewed head tree.
- PR #40 is **merged** from reviewed exact head `85af592b8baae57958eb16d88da83f946d26a2e0`. Safety #313, Vercel, fresh exact-head Codex P0/P1=0, and affected Exact Preview acceptance passed. Squash merge `5f2073a...` exactly preserves reviewed tree `2354a0db58c6405beec40fcfaae885fd8850c0db`; production is healthy.
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

## Current active work — Time Plan Parser Phase 2
- PR #54 is open on `codex/adaptive-time-scale-v2`, based directly on verified PR #53 merge `1018d8c...`. Runtime code head `24407193b59d0f9e9cf2f9d8f1a4589b4b92c95c` passes full local regression, Safety run `32947576791`, Vercel, behind 0, and conflict-free mergeability, but fresh exact-head review `5028340142` has four direct parsing P1s.
- The change extends the proven deterministic Scene Momentum layer instead of adding another model pass or rewriting canonical cores.
- Action profiles cover dialogue, meal, training, class attendance, long sleep, and location-aware travel. Explicit durations, earlier required schedules, and due consequences remain authoritative boundaries.
- Important questions and player-owned decisions stay same-moment; META/AUTO/CONTINUE retain their existing freeze/no-floor behavior.
- Exact Preview acceptance covers the ordinary profile/freeze matrix, the corrected noon schedule interruption, future scheduled travel, explicit clock intervals, sleep, and the final `0분` event-progress freeze. The final turn held `16:00`, produced no growth, and explicitly left the existing orientation unfinished.
- Dedicated and affected tests plus the full repository regression pass after substantive second review. The closure preserves real Director interruption, direct-question/negation guards, selected consequence resolution and runtime participants, prevalidated bounded growth, authority-tail reservation, canonical one-turn maximum, stable routing budgets, and one canonical model call.
- PR #54 wording patching is frozen. The next implementation is a separate stacked TPP Phase 1 branch with structured clause output and shadow comparison; existing execution remains authoritative until later phases. Because direct P1 is nonzero and `api/**` is protected, PR #54 must not be merged.
- `codex/time-plan-parser-phase1` now contains the local Phase 1 implementation. `lib/time-plan-parser.js` creates ordered structured clauses with actor, action type, start/date/clock, duration/range, destination, deadline, sequence, commitment/completion, hypothetical, quoted, and third-party fields.
- The four transferred #54 P1 reproductions plus actor separation, quoted-action, and hypothetical-action guards are a data-driven permanent corpus. Existing Adaptive Time Scale and repository regressions remain unchanged and green.
- The parser is shadow-only. `applySceneMomentumTimeFloor`, schedule/consequence arbitration, world mutation, narration, and stop points do not consume it. Compact pipeline telemetry omits raw input/actor names; bounded input and a fail-safe keep parser diagnostics from blocking a turn.
- Phase 1 is committed at exact head `2ad5e28321b274c36a20a9ae52c1141d55d6d384` and published as protected stacked PR #55, base `codex/adaptive-time-scale-v2`. Vercel is Ready, GitHub reports the stack conflict-free/mergeable, and fresh exact-head review `5028544740` has direct P0/P1=0. Its fourteen P2 findings remain non-blocking Phase 2/3 corpus. The official Safety workflow runs only for PRs targeting `main`, so PR #55 cannot receive that hosted signal until the stack is rebased/retargeted after #54 resolution.
- Phase 2 code checkpoint `1ce3f140c1104a1c9fd2d5d393a4b93ea4937210` is published as protected stacked PR #56 on `codex/time-plan-parser-phase2`, based exactly on reviewed Phase 1 head `2ad5e283...`. It introduces a confidence-gated structured timing candidate beside the legacy classifier. Only three reviewed slices migrate: elapsed/future relative-date starts, committed terminal action type recovery, and one ordered regional-travel prefix. Explicit duration/range/deadline calculation, uncertain clocks, actor ambiguity, schedule/consequence arbitration, state mutation, narration, and boundary reconciliation still fall back to the proven path.
- Structured migration fails closed for diagnostics, unknown/third-party/quoted/hypothetical/negated clauses, partial clocks, ambiguous `밤`/`새벽` clocks, same-day clocks, and date tokens outside the terminal action clause. The parser now preserves sentence ownership, clock parse confidence, date-day offset, and predicate negation so unsafe partial interpretations cannot enter execution.
- TPP Phase 2 is stable at reviewed exact code/docs head `5980e39b38240a6b94266db6316a0dc2bed22e76` (code checkpoint `9b138b2b03898423f1b7de2e0880d6e1ad964c81`). Fresh exact-head Codex review reported no major issues/direct P0/P1=0; Vercel is successful; GitHub reports conflict-free mergeability; exact stack base and merge-base are reviewed Phase 1 head `2ad5e28321b274c36a20a9ae52c1141d55d6d384`; stack behind is 0 and ahead is 17. Focused suites, syntax/static checks, `git diff --check`, and full `scripts/lumensia-pr-check.mjs` pass. All seventeen P1s found across the Phase 2 review chain have permanent regressions. The malformed period-hour and old destination-substring P2s remain non-blocking backlog. Main remains `1018d8c...`; the official Safety workflow is main-target-only and therefore absent on this stacked PR. This progress-only checkpoint changes HEAD once more, so its Vercel/fresh exact-head confirmation is required before creating the separate Phase 3 branch. No API/core/model call, save/schema, route/budget, canon, cache, or persistence behavior changed.
- PR #57 exact docs head `b2c20736db6239d2f22431bc57603d1309fe6d60` passed Vercel and retained exact reviewed Phase 2 base/merge-base `f0971430...`, behind 0, and mergeability. Fresh direct review `PRR_kwDOT8LCAs8AAAABK-Yslg` found three P1s: the open lower-bound adverb `최소한`, factual pre-choice dialogue explicitly confirming PC prefix completion, and a CG belonging only to the discarded terminal scene.
- Phase 3 code checkpoint `639ac1d6af36afbdf21cdcba1f7720d614e2c559` closes the three findings. `최소한` cannot take exact timeline authority; factual dialogue is prefix evidence only when it opens with an explicit canonical-PC/second-person address, while another named NPC fails closed; deterministic shortened-scene replacement clears stale unattributed CG state. The exact positive/negative regressions, syntax/static, Phase 3, Scene Momentum, `git diff --check`, substantive second review, and full repository check pass. Publish the docs checkpoint and continue exact-current-HEAD Vercel/direct review without stopping on any new P0/P1.
- PR #57 exact docs head `1a87869ff4aef68e8dcbcbd3dbcd4ab0697cc5f9` passed Vercel and exact-stack checks. Fresh direct review `PRR_kwDOT8LCAs8AAAABK-jzyg` found two P1s: exact visible effect fields could run before unfinished-clause rejection, and an unsupported intervening `…한 뒤/후` action could be omitted from an otherwise exact plan. Code checkpoint `88628635960f81f95d211a8a1477b465a0163797` closes both with order-correct effect filtering and structural unparsed-connector fail-closed behavior. Permanent regressions and the full repository check pass. The review's Phase 3 health/telemetry authority-label P2 is observability-only backlog, not a gameplay/merge blocker under current policy.
- PR #57 exact docs head `87f8c54ec273e224cdca3669ae4808b7046089ad` passed Vercel and exact-stack checks. Fresh direct review `PRR_kwDOT8LCAs8AAAABK-rBfw` found three P1s: same-row pre-question evidence loss, post-cap decisions pulled backward into the turn, and cross-NPC schedule evidence reuse. Code checkpoint `4fcc518de8271bacdb4270ab17e2dfefa0f49482` closes them by splitting the selected question row, rejecting raw decisions beyond the turn cap in favor of resumable turn-limit state, and binding schedule evidence to the row NPC before time/location/activity matching. Exact permanent regressions and the full repository check pass.

## Completed active predecessor — Awakening / Talent Evolution V1
- Final reviewed head `1eb316b498d892c1d5fbb816a8a5464831d2f112` merged in PR #50 as `88ce7b4c17ceb6ab1234c5cedc8bc86c5c3e1dbe`; reviewed and merged trees are identical.
- The merged implementation reuses existing PC growth fields for evidence-gated Trait/Authority candidates, distinct milestone thresholds, anchored mythic +1 talent evolution, bounded audit history, META/AUTO/CONTINUE freeze, replay-idempotent runtime application, and PC-panel visibility.
- Correction 1/5 removed a dependency-free Safety-runner test import problem; correction 2/5 preserved directly invoked late Trait/Authority entries before the eight-entry routing bound. Final hosted gates, fresh review, readiness, production health, and merged-main full regression passed.

## Completed active predecessor — Multi-System Scene Orchestration V1
- Final reviewed head `ff500841487f804fab6031d8bad62c745119cbc2` merged in PR #49 as `93f5644314dada6c9de50f5038bf479f00b7da48`; reviewed and merged trees are identical.
- Scene Momentum, Purpose, Exit, Turn Hook, Event Consequence, Goal Tick, Off-screen Progression, Novelty, relationships, faction effects, and Skill Learning already worked independently. V1 adds the missing final contract that selects one primary turn driver and at most one physically/causally connected secondary response.
- Current player action/question is primary. Due consequences, active events, reachable schedules, present-NPC goals, Director events, momentum recovery, and continuity are ordered without allowing a third unrelated beat. Direct questions are `answer-only`; AUTO retains an unanswered player boundary; CONTINUE uses a frozen plan; META remains on its nonmutating full-canon path.
- Relationship, faction, skill-learning, off-screen, and novelty systems remain effect-only. They may record evidence-backed consequences but cannot independently initiate another narrative beat.
- The plan is reserved in routed context and its compact action frame is repeated after lower-priority Director/schedule detail. Maximum routine routing stays within the `.76` 6,840-character ceiling.
- Post-response state persists only bounded driver/observed/effect axes under `sceneRuntime.orchestration`. There is no new save root, migration, endpoint, canonical `api/chat.js`/`app.js` change, structured schema change, or second model call.
- Permanent coverage is `scripts/tests/scene-orchestration-v1.test.mjs` plus affected Router, authority-tail, Momentum, Purpose, Exit, Hook, Consequence, Goal, Novelty, Off-screen, relationship, faction, skill, and core-invariant suites. Correction `6d2d56a` explicitly carries `TRIGGER_MINUTES` and prevents an interrupting schedule/consequence boundary from waiting for full primary-action completion. Live correction `2592d8f` removes a suppressed Director candidate from lower-priority routed context and preserves the compact final authority tail. Second-review closure `7624989` admits only strictly future schedule interruptions, preserving the proven due/overdue committed-action freedom.
- The initial Exact Preview direct-question case passed. The active-event case failed because a suppressed Director candidate survived as lower-priority prompt material and was reinterpreted as an unrelated Mirabelle cameo; correction 1/5 closed it with a real Director-candidate regression and the full clean-LF check.
- Final exact-head hosted Safety/Vercel and fresh Codex review passed with current P0/P1=0; the protected-path PR was merged by the user.

## Completed active predecessor — Skill Learning V1
- PR #48 merged from exact reviewed head `a4772b8...` as `8329646...` with identical trees after all hosted gates, affected Preview cases, and correction cycles passed.
- Skill candidates now accumulate only from bounded player-owned, player-attributed learning evidence; reach 100 before a single neutral F-grade unlock; reject observation/refusal/NPC-only or legacy experience bypasses; and remain frozen in META/CONTINUE/AUTO as specified.

## Completed active predecessor — Faction / Social Consequence V1 P2 hardening
- Adds `state_delta.faction_reputation_changes` for six canon-backed public academy organizations: student council, Blue Knights, White Rose, and the knight/magic/theology departments.
- Reuses the flexible `sceneRuntime.faction_social` root. There is no new save root, migration, endpoint, model call, or canonical `app.js` change.
- Reputation clamps to ±100; one turn accepts at most 4 changes; each faction keeps at most 8 causal history rows. The hardening routes at most 3 relevant factions with 2 recent causes in detail and at most 2 factions with 1 cause in the mandatory minimum block.
- A change requires a public event, official record, registered NPC witness, or a sourced credible rumor. Unwitnessed private conduct, unregistered observers, mere co-presence, invented factions, and same-state no-ops are rejected.
- Group reputation never auto-mutates PC↔NPC or NPC↔NPC relationships. Delayed retaliation, invitation, summons, or administrative response continues through the existing bounded `delayed_consequences_add` lifecycle rather than a new queue.
- META and CONTINUE clear the new delta field. A real faction mutation counts once on Scene Momentum's existing social-relationship axis; no-op rows cannot fake momentum.
- Permanent coverage lives in `scripts/tests/faction-social-consequence-v1.test.mjs` and covers schema, evidence gates, opposite faction polarity, clamping/history/context bounds, invalid/no-op rejection, personal-relation isolation, runtime persistence wiring, freeze paths, health visibility, and the one-call invariant.
- Code checkpoint `193e12a` rejects invalid or unsupported saved history evidence instead of relabeling it as public evidence. Codex review on `48d0555...` reported P0/P1=0 and one P2 provenance gap: a registered receiver alone could authorize `credible_rumor` without an identifiable source.
- Review closure `2721ff2` adds a bounded nullable `source` field and requires both a registered receiving NPC and an explicit source/transmission path for `credible_rumor`; source-less saved history is dropped. Dedicated/affected suites and the authoritative clean-LF full PR check pass. The second closure review found no remaining blocker across evidence integrity, bounds, personal-relation isolation, META/CONTINUE freeze, context secrecy, persistence, one-call architecture, or scope.
- PR #46 is merged and its reviewed tree is running in production.
- PR #47 was merged from `codex/faction-social-hardening-v1`; initial code checkpoint `0cd75a7` closed PR #46's final-review P2 findings: dense routed-context pressure, stale/unregistered saved observers, and duplicated full-state pipeline/route telemetry.
- Direct USER ACTION faction mentions now outrank broad context-seed keywords, so an explicitly queried older faction survives the bounded minimum even when every saved faction key appears in routing keywords.
- Pipeline/route telemetry carries only version, bounded faction keys, and current-turn changed keys. The authoritative reputation values and causal history remain only in `runtime_state.scene_runtime.faction_social`.
- Exact-head review on `f2689c7` reported P0/P1=0 and two P2s within the hardening scope. Closure `865e47f` derives telemetry changes only from normalized previous-versus-accepted-final state and adds an explicit action > recent-turn text > broad-keyword relevance order for indirect faction follow-ups.
- Exact-head closure review on `e4d80e0` again reported P0/P1=0 and one P2: multiple retained recent turns shared one Boolean tier. Final allowed closure `049c383` preserves oldest-to-newest recent-turn order and gives newer mentions a higher bounded score below the direct-action tier.
- Dedicated and affected Context Router, authority-tail, Scene Momentum, and Event Consequence suites pass after both closures. The authoritative clean-LF full `scripts/lumensia-pr-check.mjs origin/main HEAD` passed on the final PR #47 head before its exact-tree merge.
- Exact Preview acceptance passes: one public forum produced student council `+2` and White Rose `-1` with separate evidence; an unwitnessed private action produced zero faction mutation; CONTINUE retained the exact prior bounded state with all delta arrays empty; META emitted zero faction mutation; an existing faction consequence did not fire after 5 minutes, surfaced/resolved at its 15-minute boundary, and did not repeat on the following turn.
- Closure Preview verification passes on the deployed `2721ff2` code: the app/API still return 200 under the stricter schema; the served faction module rejects a `credible_rumor` with registered Lucia but no source and accepts/persists the same row only when `source='엘리제→루시아 직접 전달'` is present.

## Completed active predecessor — NPC↔NPC Relationship V1
- PR #45 merged after exact-head hosted gates/review and Preview acceptance. It persists bounded directional affinity/trust/status plus causal history inside `npcInnerStates[source].npc_relationships[target]` without auto-mutating the reverse direction or PC relationships.
- Registered distinct endpoints and actual interaction/shared-event evidence remain required; mere co-presence, self-links, unregistered links, and no-ops are rejected. META/CONTINUE stay frozen and the one-call architecture is unchanged.

## Completed active predecessor — Deterministic Scene Novelty V1
- Uses the existing flexible `sceneRuntime` root and adds no save migration, new endpoint, rewrite pass, or model call.
- Stores only bounded user-visible evidence: at most 16 recent visible terms, 8 repeated terms, 6 change axes, a similarity score, and a repetition streak. Hidden canon and broader secret access remain out of scope.
- A repeat is counted only when at least three terms overlap by 65% or more and structural State Delta is zero. Real location/time/NPC/event/information/relationship/objective/resource/schedule/world changes reset pressure.
- The reserved prompt marks recent terms as a do-not-relist reference, never as a checklist to reproduce. It remains absent when no recent evidence exists.
- Explicit recap requests are exempt. Direct questions cannot be converted into world progression, while CONTINUE preserves the exact prior novelty checkpoint and its hard freeze.
- Active novelty no longer subtracts its directive length unconditionally from USER ACTION. Only real overall input pressure compacts the middle of a long action, while the beginning, committed ending, mandatory schedule payload, Purpose, Exit, Turn Hook, and minimum `.76` budget remain present.
- Permanent tests cover Korean lexical endings, overlap thresholds, structural reset, different material, recap/question/CONTINUE boundaries, malicious bounds, runtime persistence, one-call wiring, and active-novelty authority pressure.
- Code checkpoint `6eada32...` passes all dedicated/affected tests and the full authoritative clean-LF PR check.
- Review closure `3395454...` rejects recap false positives such as `다시 자리에서 일어나 경비에게 말을 건다`, `repeatedly`, and `Repeat the attack`, while still recognizing explicit Korean/English recap requests. It also removes unconditional directive-length action truncation and covers both moderate-action preservation and dense schedule/action authority pressure.

## Completed active predecessor — Bounded Off-screen Progression V1
- Uses the existing local `backgroundDigest`/runtime path; it adds no model call, endpoint, save root, or migration.
- When time really advances across a public schedule start that is not PC-relevant, at most two already-known absent NPCs may receive bounded `location`/`status` updates and a compact background record.
- Present NPCs, model-authored state updates, unseen NPCs, PC schedules, secret/private schedules, completed/cancelled occurrences, disabled background simulation, META, and CONTINUE remain frozen or excluded.
- Goal V2 progress, relationships, memories, faction state, event completion, secrets, and PC choices are out of scope and cannot be synthesized by this phase.
- A crossed start older than 60 minutes is historical digest evidence only; it cannot claim that the NPC is still at the event location.
- Permanent tests cover secrecy/knowledge/current-scene/model-update guards, all visible speakers beyond the participant cap, PC priority, explicit restricted visibility, invalid calendar dates, cross-midnight clocks, long skips/latest-start precedence, hard caps, digest bounds, frontend application, and the single-call architecture.
- Initial checkpoint `5431bbb...` passed full clean-LF checks and all three targeted Exact Preview cases: eligible other-department transition 1 update/1 digest, disabled background 0/0, and PC-schedule boundary with no off-screen mutation.
- Fresh review on `5431bbb...` reported P0/P1=0 and four P2 edge cases. Code checkpoint `21e0279...` closes them with calendar round-trip validation, explicit-public-only visibility/access, every-turn-speaker protection, and latest-start precedence. Focused tests, syntax checks, `git diff --check`, and the substantive second review pass locally.
- Final exact head `6b4f599...` passed Safety #329, Vercel Ready, fresh exact-head Codex P0/P1=0, all three affected Exact Preview cases, and the clean-LF full check before the user merged PR #43.

## Completed active predecessor — NPC Goal Tick V1
- Final reviewed head `6c115e661ed7257b3787b74d5f142a1c0b39e38d` merged as `8c5ca35a463356f375a4171148268a08abf0c83a`; initial code checkpoint `c9efe50bfc95d5093acbe36aef88f2cc98024a3f` carried the core candidate.
- A present NPC with an active high-drive goal (priority + urgency >= 8) may now act proactively after an ordinary generic/observe/explore/wait/downtime USER ACTION, without waiting for `stall_streak >= 2`.
- Existing HF3 stall recovery remains available for lower-drive present goals on passive wait/downtime turns.
- Goal Tick is limited to physically feasible current-scene targets: the PC, another present NPC, the current place, or a currently due matching event. Remote place/event goals do not authorize a local action.
- Direct NPC focus, awaiting-player choices, active event beats, fixed schedules, callbacks, AFTERMATH, combat, due consequences, AUTO, CONTINUE, and committed travel remain ahead of proactive Goal Tick.
- The selected directive requires the current USER ACTION to complete first, forbids deciding PC action/dialogue/emotion/important choice, and forbids goal progress from selection alone. Existing evidence-based Goal V2 fields remain the only progress authority.
- A bounded `sceneRuntime.goal_tick` checkpoint records the selected NPC/goal/turn, visible manifestation, and real Goal V2 evidence. Manifested goals use a 2-3 turn cadence; ignored instructions may retry on the following turn, and another eligible present NPC may act while the prior owner cools down.
- No off-screen simulation, new save root/migration, second model call, new API entrypoint, canonical `app.js`/`api/chat.js` rewrite, or broader L4/L5 access.
- Permanent regressions cover proactive/no-stall initiative, low-drive fallback, cooldown/retry/alternate owner, PC/NPC/place/event feasibility, travel/direct-focus/choice/event/schedule/AUTO/CONTINUE guards, minimum `.76` authority retention, runtime manifestation evidence, and one-call architecture.
- Focused suites and the full clean-LF `node scripts/lumensia-pr-check.mjs origin/main HEAD` pass at `c9efe50...`. The normal Windows CRLF checkout still produces only the known workflow-string false positives; the authoritative clean-LF worktree is fully green.

## Completed active predecessor — Event Consequence V1
- The existing model-side `delayed_consequences_add` concept was not connected to the actual stable save/app flow. V1 patches the routed structured schema, then materializes delayed results into the existing flexible `save.hooks` store; it does not create a new save root or migration.
- Each queued result has a deterministic ID/fingerprint, causal source, due clock, bounded lifetime, target bucket, and secret level. Active results live for 3 days, world results for 7 days after due; at most 3 are added per turn and 12 unresolved consequence hooks are retained.
- The router selects one due result only after player direct focus, important decision/committed action, callbacks, AFTERMATH, combat, and an earlier fixed schedule have been protected. An already-due result may surface under AUTO; META and CONTINUE remain frozen.
- Wait/downtime look ahead only inside their bounded compressed duration, allowing a consequence to interrupt at its due clock instead of forcing the whole otherwise-empty interval.
- Completion requires visible narrative/structured evidence. A result ignored by the model or accompanied only by a false `hooks_update` acknowledgement remains open; expiration is deterministic and duplicate updates are collapsed.
- Secret causes at level 3+ are masked in the due directive and all queued consequence hooks are omitted from generic routed hook detail before they are selected. This does not grant broader L4/L5 access.
- A realized consequence may add at most one genuinely new delayed consequence. Fingerprints block the same causal result from being rescheduled.
- Permanent tests cover materialization, dedupe, due lookahead, schedule priority, direct-question sovereignty, visible completion, false acknowledgement, expiry, secret masking, legacy structured-output preservation, dynamic runtime insertion, one-call architecture, and minimum adaptive input authority.
- No second model call, new API entrypoint, canonical `app.js`/`api/chat.js` rewrite, persistence migration, faction/reputation system, or off-screen expansion.
- Code commit `9bf5d24...` and published checkpoint `dbdc54b...` pass the full clean-LF repository check. A clean-LF Chrome smoke boots the assembled app as V1.5.6, loads `/lib/event-consequence.js` with HTTP 200, and has no console error. The ordinary Windows checkout's initial loader failure was only its known CRLF marker mismatch and disappears in the authoritative LF worktree.
- Second review found no P0/P1 blocker across schema compatibility, queue bounds, duplicate/expiry ordering, secret routing, schedule/player priority, META/CONTINUE freeze, or the one-call invariant.
- Exact Preview lifecycle acceptance passed on `dbdc54b...`: the risky sigil edit stopped before execution for an explicit three-way player choice; the chosen delayed malfunction did not fire during the immediate 08:50→08:52 move; a 40-minute wait surfaced the persistent result at 10:02 as a visible record signal plus caretaker reaction; the following departure turn did not repeat the result. The live run also preserved the fixed admission-ceremony flow before the due result.
- The first hosted review on `dbdc54b...` reported P0/P1=0 and six P2 hardening items. The focused closure enforces zero/one follow-up according to visible resolution, reserves hook capacity for queued results, keeps terminal fingerprints in duplicate detection, excludes unchosen choices from manifestation evidence, routes public named-NPC canon for due results, and prefers the current response occurrence as `source_event`. Permanent regressions cover each boundary.
- The first `165bb87...` closure Preview rerun exposed one real no-early-fire failure: a user-authored `15분 뒤` marker surfaced after 5 minutes because the model-provided queue delay was trusted without a direct-action floor. The final closure parses explicit numeric `분/시간/일 뒤·후` wording and clamps persisted delay to at least that duration; permanent tests cover minutes, hours, absent duration, and an under-reported model delay.

## Completed active predecessor — Stronger Turn Hook V1
- `sceneRuntime.turn_hook` is a bounded next-direction checkpoint: allowlisted kind/source/status, a 220-character single-line anchor, bounded turn, and only applicable speaker/event IDs.
- Fresh player choices become `player-choice/awaiting-player`; an unsatisfied Exit becomes an active continuation; direct NPC questions/requests remain player-owned; active events, new leads, and authoritative NPC/world mutations become active hooks. Plain location change or generic dialogue is only a soft next step.
- Current USER ACTION outranks an old hook. AUTO cannot resolve an awaiting-player hook. CONTINUE preserves the prior object unchanged and cannot add a new question, choice, or NPC action.
- The prompt asks for a concrete next direction after `EXIT_TARGET` without forcing every turn into a question or three choices. It explicitly rejects static re-description, known-information relisting, and fake questions as hooks.
- Initial exact Preview on `4a24a77...` compressed `밖으로 간다` through corridor/stairs to the true A-building exterior, but still returned three generic destination suggestions. Later affected reruns on `c18f9ab...` passed room-to-exterior compression, preserved Isabel/Lilia direct questions, kept AUTO and CONTINUE boundaries, removed generic travel choices, and answered a contemplated-action question without moving the PC.
- The fresh reviews correctly found that earlier filters could delete legitimate nonverbal choices and implicit destination forks. The local closure now rejects choices only when the complete set is demonstrably routine under the shared Scene Momentum intent classifier or a narrow routine-action fallback. Nonverbal manipulation choices survive without keyword membership; travel alternatives also survive when every semantic destination is grounded in the current scene, without requiring `선택/갈림길` vocabulary.
- Initial Codex review on `4a24a77...` added two P1s: an open Exit could hide an interrupting NPC question, and AUTO could replace a saved unanswered hook. The local closure checks direct NPC address first and retains the exact prior `awaiting-player` hook for AUTO until explicit player input.
- Earlier P2s are handled: declarative `알겠어.` / `그 부탁은 이미 처리했어.` no longer match direct requests, and the labeled Director/Schedule tail compacts dynamically. The new adaptive-pressure closure budgets the USER ACTION block as part of all fixed authority, preserving its beginning and committed ending while compacting only the middle when necessary; the minimum `.76` feedback scale with a 5,200-character action now stays within the actual 6,840-character routine input limit.
- The authoritative minimum save carries only kind/status/anchor. Permanent 5,000-character, dense 3,900-character, maximum 5,200-character, routine adaptive `.76`, and scheduled adaptive `.76` fixtures preserve Scene Momentum, Purpose, Exit, Turn Hook, the first mandatory schedule occurrence, and the committed action ending.
- PR #40 contained no long-lived `saveState.hooks` mutation, Event Consequence chaining, schema migration, extra model call, new endpoint, `app.js` rewrite, or canonical `api/chat.js` rewrite.
- Its focused/full regressions, exact-head gates/review, affected Preview acceptance, merge tree, production Vercel, and health smoke passed.

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

## 1. PROJECT / ARCHITECTURE INVARIANTS

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

## 2. PLAYER SOVEREIGNTY / WORLD SIMULATION

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

## 3. MERGE / AUTOMATION SAFETY — MUST NOT BE WEAKENED

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

## 4. CURRENT MERGED FOUNDATION

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

## 5. PR #33 — SCENE MOMENTUM RECOVERY HF1

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

## 6. IMPORTANT IMPLEMENTATION / FIX COMMITS

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

## 7. FINAL-REVIEW P1 — FIXED IN CURRENT CANDIDATE

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

## 8. REVIEW STATE AT HANDOVER

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

## 9. PERMANENT TEST COVERAGE

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

## 10. DO NOT BREAK

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

## 11. AFTER HF1 MERGE — NEXT NARRATIVE PHASE

HF1 merge is not Narrative completion. Do not restart HF1 diagnosis after it merges.

Immediately continue:
1. live-play acceptance with original problematic inputs/screenshots;
2. **Scene Purpose**;
3. explicit **Scene Exit Condition**;
4. stronger **Turn Hook**;
5. **Event Consequence** chaining / lifetime;
6. NPC Initiative / Goal Tick refinement;
7. bounded off-screen progression — completed in PR #43;
8. deterministic novelty/repetition suppression — completed in PR #44;
9. NPC↔NPC Relationship V1 — completed in PR #45;
10. Faction / Social Consequence V1 — merged in PR #46; P2 hardening merged in PR #47;
11. Skill Learning V1 — completed in PR #48;
12. Multi-System Scene Orchestration V1 — completed in PR #49.

Longer roadmap:
- Adaptive Time Scale V2 — active on `codex/adaptive-time-scale-v2`
- Time Plan Parser structured migration — next, stacked from the PR #54 checkpoint
- Consequence Queue / Lifetime
- Active Threads
- Reputation / faction-social propagation
- Setup -> Payoff memory — deferred in PR #66; do not resume from that branch
- NPC significance — active bounded V1 / relationship thresholds and knowledge boundaries remain later separate tasks
- NPC-vs-NPC conflict
- Fail Forward
- Off-screen World Progression expansion
- Multi-System Scene — completed V1 foundation
- Memory Hierarchy
- full report-style -> scene-driven novel prose recovery

Gameplay roadmap discussed:
- NPC↔NPC Relationship V1 — completed in PR #45
- Faction / Social Consequence V1 — merged in PR #46; P2 hardening merged in PR #47
- Skill Learning V1 — completed in PR #48
- Multi-System Scene Orchestration V1 — completed in PR #49
- Awakening / Talent Evolution V1 — completed in PR #50
- Combat Growth V2 — completed in PR #51
- Living World V1 / bounded off-screen lifecycle — completed in PR #52
- Event Director V3 / public world-result surfacing — completed in PR #53
- Adaptive Time Scale V2 — active on `codex/adaptive-time-scale-v2`
- Time Plan Parser Phase 1 — next structured Narrative Engine refactor

---

## PR #57 PHASE 3 — LATEST P0/P1 CLOSURE CYCLE

Fresh direct review `PRR_kwDOT8LCAs8AAAABK_AqZQ` on exact docs head `3626be33a22fa257004db9404b2abc457146f7ed` found P0=0 / P1=6:
- completion evidence before a same-sentence choice clause was discarded;
- string-array effects could bypass unfinished action-type rejection;
- an NPC schedule label mentioned only as a grammatical object could be treated as the schedule owner;
- a decision below a ranged prefix minimum could skip suffix cleanup;
- zero-overlap generic choices could bind to an earlier rhetorical question;
- generic NPC-keyed effects could be preserved for the wrong NPC.

Code checkpoint `ff4e930daec76c8e638f1e0c72f8178436f04eda` closes all six locally through shared decision-clause slicing, action-type-first effect filtering, grammatical NPC ownership evidence, fail-closed ranged-prefix completion, latest-question fallback, and NPC-keyed array attribution. Permanent regressions cover every reproduced case. `node --check`, both Phase 3 focused suites, `git diff --check`, and the full `node scripts/lumensia-pr-check.mjs` pass. The second regression/scope review found no architecture drift: one canonical call, stable routing, player sovereignty, freeze behavior, and the reviewed Phase 2 stack base remain unchanged.

That correction was published with docs as exact head `14cd7b0aeab8503210e87aa62f8f7e6e0e089882`. Vercel passed and the stacked comparison remained based on reviewed Phase 2 exact `f0971430af351c4a007e18daa0bd18454e6aab4f`, behind 0 and conflict-free. Fresh direct review `PRR_kwDOT8LCAs8AAAABK_I5BA` / `5032261892` found P0=0 / P1=8:
- NPC state fields could survive without structural NPC/effect ownership;
- a positively scored rhetorical question could displace the actual later choice;
- a same-sentence unpunctuated choice could discard completed prefix effects;
- scalar prefix effects such as fatigue/currency were not retained;
- an unfinished conditional suffix effect could survive beside a completed prefix;
- resumed nonterminal Director progress/metadata could be discarded;
- a zero-time positive-range prefix could be accepted as complete;
- nonreplacement Goal V2 progress could be discarded.

These findings share the Phase 3 root cause specified by the user: clause identity existed in the parser, but the returned runtime effects still had to be inferred from narration wording, sentence order, and NPC-name overlap. No additional wording-specific regex patch was added. Code checkpoint `334c659` changes Phase 3 structurally:
- every parsed/timeline clause carries stable `action_N` identity;
- the same canonical model response returns a required `time_execution` receipt containing completed/interrupted clause IDs, decision scene index, boundary event ID, and per-effect ownership;
- a standalone structural validator verifies contiguous completion, positive elapsed time, interruption range, final-scene decision ownership, and array/scalar effect index shape;
- deterministic projection retains only completed-clause or validated boundary-event effects and drops unmapped/interrupted effects fail-closed;
- a locally earlier schedule/consequence boundary cannot reuse a receipt from a longer model timeline;
- Director state is preserved only when both `event_progress` and `director` belong to the same `director:` boundary event;
- existing narration-based reconciliation remains only as the explicitly identified missing-contract fallback for later Phase 4 removal, not as the new authority.

Permanent regressions now cover all eight review cases plus missing interruption IDs, locally rebased boundaries, whole-array ownership claims, and out-of-range effect indexes. Focused Phase 3/time-floor/Goal V2 suites, syntax checks, `git diff --check`, and the full `node scripts/lumensia-pr-check.mjs` pass after a substantive second review. One canonical call, stable routing, `store:false`, prompt cache/retention, Context Router budgets, canon, player sovereignty, META/AUTO/CONTINUE freeze, and the reviewed Phase 2 stack base remain intact.

The health/telemetry authority-label P2 remains a non-gameplay backlog item and is not part of P0/P1 closure.

Fresh direct review `PRR_kwDOT8LCAs8AAAABK_TsLA` / `5032438828` on exact head `59fde00b738d8025c217814cff906e5382afe50a` found P0=0 / P1=4:
- boundary-event ownership was checked only against the model's own event ID, not a real runtime boundary;
- growth validators compacted arrays without remapping the raw effect-owner indexes;
- aggregate fatigue/currency scalars could not separate completed and interrupted clause contributions;
- a model choice at minute 1440 could outrank the canonical turn limit and lose resumable work.

Structural closure checkpoint `f3906b2` fixes all four without narration/regex inference:
- schedule/consequence/Director boundary IDs and times must match the authoritative runtime boundary before boundary-owned effects can survive;
- every growth/learning/awakening filtering pass replaces accepted rows and remaps ownership in the same operation;
- `scalar_contributions` records per-clause/per-event fatigue and currency amounts, validates their aggregate and canonical limits, and projects only completed/verified contributions;
- an incomplete long plan at minute 1440 requires `turn-limit`; model choices are deferred and the timed action remains resumable;
- the same structural path now covers single-action as well as compound-action interruptions, and every response with choices must identify the final scene row as the decision owner.

Second-review hardening `6f724e3` replaces the initial identity-key remap with an exact internal source-row marker carried through Combat Growth, Skill Learning, Awakening, and Talent validation. This prevents duplicate rows with the same skill/stat key from borrowing a rejected sibling's owner index. The marker is a Symbol, survives internal object transforms, and cannot appear in JSON output.

Permanent regressions reproduce the four review findings plus invented boundary IDs, invalid scalar aggregates/limits, filtered-row index compaction, and single-clause interruption. Focused Phase 3/time-floor/Combat Growth/Skill Learning/HF1 integration tests and the full `node scripts/lumensia-pr-check.mjs` pass. The second review found no new model call, routing, freeze, canon, or player-sovereignty drift.

Fresh direct review `PRR_kwDOT8LCAs8AAAABK_gmWA` / `5032650328` on exact head `66c4410c29e480567b3296ad4631413f0ee77bd4` found P0=0 / P1=2:
- a choice event could authenticate itself from the same returned `event_progress` instead of an external runtime source;
- validated turn-owned `event_progress` was recorded only as a field name and restored only by the Director-specialized path, detaching non-Director choices from their active event.

The correction keeps the boundary authority outside the returned claim. Choice events must match the saved/promoted event, pre-routed resumable IDs, an exactly reached schedule/consequence, or the Director occurrence selected before the response. Returned event IDs never populate their own allowlist. Structural projection now returns the validated turn-owned value and restores it after scene reconciliation for Director and non-Director events alike; Director metadata requires matching owned progress. Permanent regressions reject an invented `director:*` reward/progress claim and preserve a real active non-Director event. Focused Phase 3/time-floor/HF1 integration/event-progress suites and the full repository check pass.

Fresh direct review `PRR_kwDOT8LCAs8AAAABK_tAeg` / `5032853626` on exact head `8279588d848556bd7d8222d091b099abc27e7f3f` found P0=0 / P1=2:
- Event Consequence lifecycle moved/compacted `hooks_update` rows without remapping their receipt indexes;
- deterministic choice narration retained the decision speaker but cleared the matching persistent emotion update.

The correction reuses the non-serializing exact source-row marker for raw hook patches and performs owner remapping in the same lifecycle replacement. Only a selected consequence row deterministically rewritten from a raw row carries that source; runtime-created expiry rows do not inherit model ownership. Second self-review then made that denial explicit: a synthesized expiry row carries an internal `unowned` marker, so an identical model row cannot lend it ownership through identity fallback. Decision reconciliation preserves emotion rows only for NPC keys in the retained decision dialogue and continues to clear all post-boundary/unretained speakers. Permanent regressions cover both review findings and the identical-expiry ownership collision. Event Consequence, Phase 3/time-floor/HF1 focused suites and the full repository check pass.

Fresh direct review `PRR_kwDOT8LCAs8AAAABK_1DrA` / `5032985516` on exact head `74bb2592879cce62f2f709224c68e977350ae744` found P0=0 / P1=2:
- core sanitization could filter/compact a structured effect array before the adapter saw it, leaving the receipt index on the raw row and allowing a different compacted row to borrow that owner;
- when core scene capping removed the declared decision row, the invalid receipt path bound choices to the unrelated last surviving scene row instead of using the established prompt finder.

The correction tags every parsed model effect row with its non-serializing raw source index before core sanitization, then rebases or drops receipt owners immediately after the core returns. Ambiguous, removed, mixed untagged, and explicitly unowned rows fail closed. An invalid decision receipt no longer gains structured authority and falls back to the existing question/dialogue scorer; no narration regex was added. Permanent regressions cover filtered relationship-row compaction, parser-to-core marker transport, and capped decision-row fallback. Phase 3, time-floor, Goal V2, Event Consequence, Combat Growth, Skill Learning focused suites and the full repository check pass.

Delayed fresh rebind review `PRR_kwDOT8LCAs8AAAABLB-s9Q` on exact code head `866e486da4e6d91d68c8f221c28beed72532af73` then found P0=0 / P1=2:
- a normal choice could reuse a valid but unrelated saved event ID and authenticate unfinished boundary-owned effects;
- `boundary_kind:none` could claim a completed prefix plus interrupted suffix, allowing the profile floor to complete the unfinished action and retain its effects.

The local correction is structural. A saved event can authenticate a displayed choice only when the returned event ID matches it and the same receipt owns matching turn-level `event_progress`. A `none` boundary is valid only when all structured clauses are completed and no interrupted clause remains. No wording/regex or narration-authority patch was added. Permanent regressions cover unrelated saved-event reward rejection, incomplete-none rejection, and fully completed-none acceptance. Syntax/focused checks, `git diff --check`, and the full repository regression pass.

Fresh docs review on exact checkpoint `331886aafe57a5b20a53205b0f7fdd0cbee538dc` also found one merge-safety P1 and one related P2 in the first permanent-rule wording: it overrode the `AGENTS.md` remediation caps and required an impossible Safety PASS on a stacked PR. The rule at the top of this handover now preserves the user's continuous-work intent only within the repository-authorized path, keeps unresolved P0/P1 as FAIL after cap exhaustion, distinguishes stacked Vercel/review closure from the final main-target Safety gate, and never synthesizes a missing Safety PASS.

Fresh exact-head review `PRR_kwDOT8LCAs8AAAABLCJUng` / `5035414686` on `76d46f3b56ae0477f41431ec8e03399e2ad5d7f0` found P0=0 / P1=2:
- validator rejection alone did not stop the no-choice caller from raising an incomplete `none` receipt to the full compound floor;
- an unrelated saved event could still authenticate itself using only matching model-returned progress and owner claims.

The second repository-authorized correction is structural and fail-closed. An invalid no-choice `none` claim now remains at the returned minute, enters the shared shortening/reconciliation path, retains no unowned effects, and cannot skip consequence reopening/runtime safety. Choice-event authority no longer includes a saved/model-returned ID by itself; only a pre-response routed resume ID, exactly due schedule/consequence, or preselected Director occurrence can authenticate it. Positive runtime-authorized Director/non-Director cases remain covered, while matching returned claims without pre-response authority are rejected. No wording/regex was added.

That correction was committed and pushed as exact code head `cf3cb1ae2d39cc9ffa8c18220d247e0e7cdcd5b6`. Direct exact-head review comment `5431689868` found no major issue, and the repository readiness record marks current P0/P1 as zero. A later duplicate current-head review added only one P2: the schema accepts `owner_kind:world`, while shortened-turn projection currently drops it. Per repository policy this is non-blocking and remains explicit structural follow-up evidence rather than a new wording patch. Vercel deployment `EAKoj7VXuiUGJv4Z5x7GbycP4oFd` is Ready. GitHub reports `mergeable:true`; `base_commit` and `merge_base_commit` are both reviewed Phase 2 exact `f0971430af351c4a007e18daa0bd18454e6aab4f`, with behind 0.

The signed-in Exact Preview corpus is complete for Phase 3. The required-schedule compound case retained only the ten-minute dialogue prefix and stopped at 09:00 before the eight-hour sleep. Player-decision sovereignty, CONTINUE same-moment freeze, META freeze, and AUTO disablement at the decision all passed. The long compound case advanced exactly 1,440 minutes on its first turn, persisted the unfinished action, and AUTO resumed exactly the remaining 540 minutes before stopping at a new player decision. This validates both turn-limit precedence and resumability in the deployed runtime.

---

## PR #60 BOUNDED CLOSURE / SAFE NARRATIVE TIME POLICY FOLLOW-UP

- PR #60 final exact head `1a623867ec58fb1fd7dbba1a644efa889a24524f` passed local focused/full regression, Vercel, and representative Preview movement, but the final fresh review found direct P0=0/P1=2.
- P1 #1: `1시간 훈련하고 기숙사로 가서 게시판을 확인한다.` was reduced to the travel profile, so the preceding one-hour training and an intervening schedule boundary could be lost.
- P1 #2: `기숙사로 가고 싶어서 지도를 확인한다.` promoted a desire into committed travel and violated player sovereignty.
- Both findings are the same compound semantic-arbitration root cause. Per bounded closure, PR #60 was closed **without merge**. No classifier-priority, Korean wording, regex, or time-arithmetic correction was added.
- The closed head preserves its A-F regressions and Exact Preview evidence as a follow-up corpus. The successful Preview evidence (Great Hall 09:18 -> dormitory A lobby 09:30, room assignment/key, staff response, meaningful choice, no raw three-minute diagnostic) proves only the explored case; it does not authorize the unsafe compound classifier.
- Compound semantics is a separate future bounded task. It should use the existing canonical model response to return minimal `action_N` semantic ownership/commitment, while deterministic code validates IDs, ordering, allowlisted commitment values, hard boundaries, and state consistency. No second model call or wording-specific parser expansion is allowed; uncertain/invalid claims fail closed.

The safe Narrative Time Policy follow-up is `codex/narrative-time-policy-v1-safe`, created exactly from merge-authoritative safe stack base `9458633a9657c53c7e875a5cf26538d5f38a0cac`. Current code checkpoint `e956dfc93016dfcdd271712e280ae02ed85eec33` contains only:

- the compact Narrative Time Policy V1 rules inside the three existing time/compression/STOP GM lines, with their prior total 332-character budget preserved;
- `NARRATIVE_TIME_POLICY_VERSION=1.0` and a dedicated policy regression suite;
- natural deterministic boundary/reconciliation prose that keeps authoritative minutes internal instead of printing `N분 동안 행동을 진행한 뒤` or `N분 지점` in ordinary narration.

It contains no `compound-routine`, compound intent arbitration, new parser/regex semantics, TPP expansion, extra model call, schema/canon change, or `api/chat.js` change. Syntax/focused policy, time-floor, Context Router, authority-tail, core-invariant, `git diff --check`, and full `scripts/lumensia-pr-check.mjs 9458633... HEAD` all pass. Two substantive reviews found no compound classifier carryover, new model call, budget drift, hard-boundary weakening, player-sovereignty change, or unrelated scope.

Fresh direct review `5037414704` on initial PR #61 exact head `4dc7f4f3768b4635eb91bcbb07d8681d3b1ac3cd` found P0=0/P1=1: the parallel preserved raised-floor scene path still appended `${minutes}분` even though the main deterministic replacement path no longer did. Code checkpoint `e956dfc...` removes only that elapsed count from the retained-scene summary/append and adds a permanent negative assertion. Focused and full regression pass. One review P2 about zero-minute consequence wording is non-blocking presentation backlog and is intentionally not mixed into this closure correction.

---

# 12. NEXT ACTION — CURRENT START POINT

1. Keep `PHASE_2_IMPLEMENTATION_PASS: COMPLETE` and `PHASE_2_STATUS: COMPLETE`. Do not reopen Phase 1/2, the Origin reroll P2, or any frozen/deferred PR.
2. P3-PR01 is **BLOCKED — CORE ACCEPTANCE FAIL / HUMAN EXACT PREVIEW RE-RUN REQUIRED** at PR #88. Event Actor / Micro-step Diet code checkpoint is `6a21aeaf86f79477c268608a40da2b4a9f00dde0`.
3. Focused/full local gates, Safety `33182587843`, and Vercel `GUVMLZpLA5rbrxZqLMYCffkXMJeZ` pass. The exact deployment has been handed to the user; await its qualitative result without reusing any prior-head acceptance.
4. Local Browser recovery must not be retried. A human runs Named NPC, routine, already-chosen intent, quiet conversation, NPC-vs-NPC, combat, suspense, failure/aftermath, canonical progression and unseen generalization against PR #88's exact deployment. Deterministic checks do not satisfy this gate.
5. Any qualitative/canonical failure keeps P3-PR01 BLOCKED. Only if human acceptance and every exact-head gate pass may a human merge protected-path PR #88. Verify latest main before creating P3-PR02; never stack it on PR #88.

---

# NEW CHAT START INSTRUCTION

> Read only these two progress documents and verify GitHub live state. Phase 2 is COMPLETE and frozen/deferred PRs remain untouched. P3-PR01 is open at PR #88 from base main `6f1f45a644e2ece54a74577ce8a39afe4859e686`, Event Actor / Micro-step Diet code checkpoint `6a21aeaf86f79477c268608a40da2b4a9f00dde0`, status **BLOCKED — CORE ACCEPTANCE FAIL / HUMAN EXACT PREVIEW RE-RUN REQUIRED**. Event facts now reach the writer without model-authored active-beat choreography or stale player-boundary duplication; explicit canonical actors survive, but no host is inferred or hardcoded. Focused/full/Safety/Vercel pass, and exact hosted human acceptance is next. Do not retry local Browser recovery, merge, or start/stack P3-PR02 before human PASS and post-merge main verification.
