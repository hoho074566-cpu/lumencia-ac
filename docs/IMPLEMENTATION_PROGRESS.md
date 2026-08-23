# Lumensia Implementation Progress

## Current Phase
Scene Momentum Recovery HF1 — remote router P1 closure pending on PR #33. Handover created; **do not merge yet**.

## Current GitHub State
- Repo: `hoho074566-cpu/lumencia-ac`
- Main at handover snapshot: `f6122be5f65a7b0b79555b83c9660eb9ed84cb6c` (`chore: restore standard Lumensia safety workflow`)
- Working branch: `codex/scene-momentum-recovery-hf1`
- PR: #33 `Restore Scene Momentum and narrative compression in V1.5.6`
- Last remote implementation/test HEAD before handover docs: `df382f3b0ab91b97f8f88f2b50667aa4b5553892`
- Latest implementation/test commit: `test: lock Scene Momentum predicate and duration guards`
- Handover doc commit: `e65de62d813617a80bb774e9d6ccb73245a82f13` (docs only)
- This progress update creates another docs-only HEAD; next session must refetch exact live HEAD.
- At code/test HEAD `df382f3...`: compare vs current main was ahead 32 / behind 0; `base_commit.sha` and `merge_base_commit.sha` both equaled current main.
- Open PRs at snapshot: #33 only.

## Completed
### Merged foundation
- Auto-PR / guarded low-risk Auto-Merge V1.2 smoke proven by real `github-actions[bot]` merge.
- Merge Readiness / Discord infrastructure.
- exact-current-HEAD/current-base safety architecture and Compare API protection.
- PLAYER ACTION COMMIT.
- CONTINUE reliability / monotonic Event Beat progression.
- Scene Continuity.
- V1.5.5 NPC Motivation + Relationship Reason V1 (PR #30 merged).
- V1.5.6 NPC Goal V2 (PR #31 merged).
- characters-v2 32-character / 13-state refresh (PR #32 merged).

### Implemented on PR #33 remote branch — NOT MERGED
- Deterministic `lib/scene-momentum.js` with no model calls.
- Semantic intent handling: exit/travel/explore/observe/wait/downtime/decision-sensitive/committed-consequence/generic.
- State Delta scoring + 3-turn momentum history/stall pressure.
- Scene Momentum directive wired into `api/lib/context-router.js`.
- Old stable micro-step `위 행동까지만 처리` behavior replaced with semantic action completion / decision-free intermediate-step compression.
- Scene Change > repeated Scene Description guidance.
- NPC Initiative guidance without PC-choice automation.
- deterministic time floors in `api/chat-router.js`.
- explicit `choices` used as STOP evidence; `importance=critical` is not STOP evidence.
- Scene Momentum persisted in local scene runtime / pipeline telemetry.
- Scene Momentum health/debug/UI markers.
- duplicate AUTO/CONTINUE flow-control suppression.
- one canonical `coreHandler()` call invariant retained.
- Event progress null completion vs pause/archive semantics fixed.
- registered/unregistered minor NPC dialogue progress handling.
- committed combat remains in positive State Delta accounting.
- canonical persisted delta families added to progress accounting.
- no-op Goal lifecycle metadata does not fake goal progress.
- negated rest/exterior actions and unresolved rest/exterior deliberation guards.
- object-qualified observation, Korean `에` travel, companion-target extraction, outdoor exit route, English rest/wait substring regressions fixed.
- negated explore/consequential guard, player-predicate anchoring, explicit `5분만 기다린다/쉰다` handling on remote helper.
- authority-tail reservation test for GM Director / V2 / Schedule under ordinary oversized optional context.

### Handover completion
- Re-read cumulative HANDOVER 1 / 2 / 3.
- Re-checked live main/PR #33/Safety/Vercel/reviews/open PRs.
- Created `docs/LUMENSIA_HANDOVER_CURRENT.md` as the new integrated development handover.

## In Progress
No new feature work is being started in this session.

The next implementation action is to apply the already-tested **router-only P1 patch** preserved in PR #33 comment `#5386396220` (local Codex commit `17e26efa471b20626884bda73b3ba1dcbbeb3b7c`) to the current remote branch.

Allowed patch files:
- `api/lib/context-router.js`
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/context-router.test.mjs`

Do not overwrite newer `lib/scene-momentum.js` or `scripts/tests/scene-momentum-intent-guards.test.mjs`.

## Remaining
### P0 — current merge blockers
1. **Schedule authority P1** — `compactScheduleAuthority()` must preserve event `note` and NPC schedule `activity` / `commitment` / `confidence` in every compaction tier.
2. **Long-action authoritative-state P1** — a supported ~5000-char USER ACTION must not evict all authoritative SAVE_STATE; reserve bounded minimum state while keeping total routine input <=9000 and retaining Director/V2/Schedule/action sections.
3. **Fixed-flow P1** — `AFTERMATH` and active combat must remain fixed-flow even when `stall_streak >= 2`; momentum pressure must not inject random cameo/encounter there.
4. Push/apply the preserved router patch to remote and run hosted gates on the new exact HEAD.
5. Fresh exact-current-HEAD/current-base Codex review; direct current non-outdated P0/P1 must be 0.
6. Final current-main / exact-head / merge-base / behind revalidation and manual `expected_head_sha` merge only.

### P0.5 — current exact-head P2 correctness review
These are not DONE and are not silently promoted to blocking policy, but directly affect momentum correctness:
- compound duration `1시간 30분 쉰다/기다린다` intent classification;
- no-op delta rows (`amount:0`) faking progress;
- lone `npc_state_updates` mutation double-counting as `npcStateChanged` + `npcAction`;
- legitimate fresh player-choice STOP counting as a stall miss.

### P1 — after HF1 merge
- live-play acceptance for `본다 / 돌아다닌다 / 밖으로 간다 / 쉰다` and original screenshot scenarios;
- Scene Purpose + explicit Scene Exit Condition;
- Turn Hook;
- Event Consequence chaining;
- stronger NPC Initiative / Goal Tick;
- bounded off-screen progression;
- repeated-information / Scene Memory novelty suppression if live loops remain.

### P2 — longer Narrative roadmap
- Adaptive Time Scale V2
- Consequence Queue / Lifetime
- Active Threads
- Reputation Propagation
- Setup → Payoff memory
- NPC significance / relationship thresholds / knowledge boundary
- NPC-vs-NPC conflict
- Fail Forward
- Off-screen World Progression expansion
- Multi-System Scene
- Memory Hierarchy
- Novelty/repetition scoring
- Report-style Narration → Scene-driven Novel Prose

## Blocked
### PR #33 merge is blocked
At code/test HEAD `df382f3...`:
- Safety Gate #248: PASS.
- Vercel: PASS.
- exact-head Codex review exists.

However direct thread inspection shows **three unresolved non-outdated P1s** in `api/lib/context-router.js`.

A sticky `Lumensia Merge Readiness` comment reported READY / current P0-P1=0 for the same code/test HEAD. This conflicts with direct thread evidence.

Therefore:
- **Do not merge based on sticky READY.**
- Treat direct unresolved current P1s as authoritative blockers.
- Possible cause is review-cycle baseline filtering across HEAD changes, but this is not yet proven.
- Do not redesign automation inside this Narrative PR. After P1 closure, if the mismatch reproduces on a new clean occurrence, handle it as a separate protected automation defect without weakening exact-head/current-base safeguards.

### Codex push blocker
Codex local git push repeatedly fails with:
`CONNECT tunnel failed, response 403`.

Latest recreated tested router patch:
- local commit `17e26efa471b20626884bda73b3ba1dcbbeb3b7c`
- push failed 403
- complete unified diff is preserved in PR #33 comment `#5386396220`
- `make_pr` fallback in Codex also failed because the environment lacked the required Python MCP module.

This is not a blocker for the next ChatGPT session because the connected GitHub writer can apply the preserved diff directly.

## Files Changed on Current Remote PR #33
- `api/chat-router.js`
- `api/health.js`
- `api/lib/context-router.js`
- `app-runtime.js`
- `docs/IMPLEMENTATION_PROGRESS.md`
- `docs/LUMENSIA_HANDOVER_CURRENT.md` (added during this handover session; docs-only)
- `lib/scene-momentum.js`
- `scripts/tests/context-router-authority-tail.test.mjs`
- `scripts/tests/npc-motivation-v155.test.mjs`
- `scripts/tests/scene-momentum-intent-guards.test.mjs`
- `scripts/tests/scene-momentum-paused-event.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
- `scripts/tests/scene-momentum-v156-hf1.test.mjs`

Local-only tested patch would additionally modify remote-existing `scripts/tests/context-router.test.mjs`, but that change is not yet pushed.

## Tests Passed
### Hosted remote code/test HEAD `df382f3...`
- Safety Gate #248: PASS.
- Vercel: PASS.
- `scripts/tests/context-router-authority-tail.test.mjs`: PASS in Safety.
- `scripts/tests/context-router.test.mjs`: PASS in Safety before local-only router extension.
- `scripts/tests/continue-runtime.test.mjs`: PASS.
- `scripts/tests/core-invariants.test.mjs`: PASS.
- `scripts/tests/debug-regression.test.mjs`: PASS.
- `scripts/tests/event-progress.test.mjs`: PASS.
- automation/readiness/exact-head deterministic suites: PASS.
- Goal V2 suites: PASS.
- `scripts/tests/npc-motivation-v155.test.mjs`: PASS.
- save-key migration: PASS.
- scene continuity: PASS.
- `scripts/tests/scene-momentum-paused-event.test.mjs`: PASS.
- `scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`: PASS.
- `scripts/tests/scene-momentum-v156-hf1.test.mjs`: PASS.
- `scripts/tests/scene-momentum-intent-guards.test.mjs`: PASS.

### Local-only Codex router patch `17e26efa...`
Codex reported PASS for syntax, focused authority-tail/router regressions, full deterministic Lumensia PR suite, diff validation, canonical-core integrity, and one-call verification. These are local results only until the patch is applied remotely and hosted gates rerun.

## Tests Failed
Historical intermediate failures, all subsequently fixed:
- `c037531...`: `importance=critical` fake STOP + `좀 쉴까?` deliberation regression.
- `a3de01c...`: `밖으로 나갈까?` safe but misclassified generic due Korean conjugation.

Current remote code/test HEAD has no hosted Safety test failure, but current P1 code-review blockers remain.

## Known Issues
- `docs/LUMENSIA_HANDOVER_CURRENT.md` is the integrated session handover and should be read before this file in a new chat.
- Narrative recovery is not complete when HF1 merges; remaining P1/P2 roadmap must continue.
- Do not weaken State Delta, authority-tail, event-pause, player-agency, or merge-safety tests to obtain green status.
- Do not modify GitHub automation during Narrative work unless a concrete infrastructure regression requires a separate protected fix.
- `app.js` base `APP_VERSION='1.4.8'` is intentional; runtime/health app version is 1.5.6.
- Current characters-v2 state is 32 characters / 13 portrait states; Anastasia default now exists, superseding older handover exceptions.

## Last Implementation/Test Commit
`df382f3b0ab91b97f8f88f2b50667aa4b5553892` — `test: lock Scene Momentum predicate and duration guards`

## NEXT ACTION
1. Read `docs/LUMENSIA_HANDOVER_CURRENT.md` and this file.
2. Refetch live current main, PR #33 exact HEAD, current review threads, Safety/Vercel. Do not assume docs-only SHA is still latest.
3. In PR #33 conversation, retrieve comment `#5386396220` containing the complete unified diff from local commit `17e26efa471b20626884bda73b3ba1dcbbeb3b7c`.
4. Apply only the router patch to the **current** branch:
   - `api/lib/context-router.js`
   - `scripts/tests/context-router-authority-tail.test.mjs`
   - `scripts/tests/context-router.test.mjs`
   Preserve newer helper/test work.
5. Run at minimum:
   - `node --check api/lib/context-router.js`
   - `node scripts/tests/context-router-authority-tail.test.mjs`
   - `node scripts/tests/context-router.test.mjs`
   - `node scripts/tests/scene-momentum-intent-guards.test.mjs`
   - `node scripts/tests/scene-momentum-paused-event.test.mjs`
   - `node scripts/tests/scene-momentum-v156-hf1.test.mjs`
   - `node scripts/tests/scene-momentum-v156-hf1-integration.test.mjs`
   - `node scripts/lumensia-pr-check.mjs`
   - hosted Safety Gate / Vercel.
6. Request fresh exact-current-HEAD/current-base Codex review. Directly inspect current non-outdated threads; do not rely solely on sticky Readiness.
7. If true current P0/P1=0, refetch HEAD/main and Compare `main...exact HEAD`; require base_commit==main, merge_base==main, behind=0, no conflict. Then manually merge with `expected_head_sha`.
8. Verify merged main/Vercel/health and update progress on main.
9. Continue next unfinished Narrative phase: **Scene Purpose / Turn Hook / Event Consequence**. Do not restart HF1 analysis from scratch.
