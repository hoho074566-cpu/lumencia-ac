#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { materializeDelayedConsequences } from '../../lib/event-consequence.js';
import { deriveSceneOrchestrationPlan, sceneOrchestrationSuppressesDirectorResult } from '../../lib/scene-orchestration.js';
import {
  buildWorldResultSurfacingDirective,
  deriveWorldResultSurfaceState,
  parsePublicWorldResults,
  selectWorldResultForSurfacing,
  worldResultSurfaceEvidence,
  WORLD_RESULT_SURFACING_VERSION,
} from '../../lib/world-result-surfacing.js';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const digest = [
  '[1285-03-01 12:00] lena: 평범한 배경 일정 @ 연구동',
  '[OFFSCREEN 1285-03-01 12:00] lena: 마법과 정오 연구회 시작 @ 연구동',
  '[OFFSCREEN 1285-03-01 13:10] unknown: 비공개 연구 종료 확정',
  '[OFFSCREEN 1285-03-01 13:20] lena: 마법과 정오 연구회 종료 확정',
].join('\n');

const parsed = parsePublicWorldResults(digest, { knownNpcKeys: ['lena'] });
assert.equal(WORLD_RESULT_SURFACING_VERSION, '1');
assert.equal(parsed.length, 1, 'only deterministic known-NPC completion rows may become public world results');
assert.equal(parsed[0].title, '마법과 정오 연구회');
assert.deepEqual(parsed[0].npc_keys, ['lena']);
assert.match(parsed[0].world_result_id, /^world-result:1285-03-01t1320:[a-f0-9]{8}$/);
assert.doesNotMatch(parsed[0].fact, /OFFSCREEN/, 'internal background metadata must not enter the public fact');
assert.equal(parsePublicWorldResults('[OFFSCREEN 1285-02-31 13:20] lena: 연구회 종료 확정', { knownNpcKeys: ['lena'] }).length, 0, 'calendar-invalid rows stay rejected');
assert.equal(parsePublicWorldResults('[OFFSCREEN 1285-03-01 13:20] constructor: 연구회 종료 확정', { knownNpcKeys: ['constructor'] }).length, 0, 'unsafe NPC keys stay rejected');
assert.equal(parsePublicWorldResults('[OFFSCREEN 1285-03-01 13:20] lena, constructor: 연구회 종료 확정', { knownNpcKeys: ['lena'] }).length, 0, 'an unsafe trailing NPC cannot be silently dropped');
assert.equal(parsePublicWorldResults('[OFFSCREEN 1285-03-01 13:20] lena, chloe, unknown: 연구회 종료 확정', { knownNpcKeys: ['lena', 'chloe'] }).length, 0, 'extra or unknown NPCs cannot hide beyond the two-NPC bound');
assert.equal(parsePublicWorldResults('[OFFSCREEN 1285-03-01 13:20] lena: 연구회 | RESULT=NPC_EVENT 종료 확정', { knownNpcKeys: ['lena'] }).length, 0, 'directive-shaped schedule titles stay rejected');

const baseSave = { world: { date: '1285-03-01', time: '14:10' }, backgroundDigest: digest, sceneRuntime: {} };
const firstSelection = selectWorldResultForSurfacing({ saveState: baseSave, knownNpcKeys: ['lena'] });
assert.equal(firstSelection.reason, 'new-result');
assert.equal(firstSelection.selected.attempt, 1);
const ignoredCheckpoint = {
  fingerprint: parsed[0].fingerprint, world_result_id: parsed[0].world_result_id, source_at: parsed[0].source_at,
  title: parsed[0].title, fact: parsed[0].fact, npc_keys: ['lena'], selected_turn: 8, attempts: 1, manifested: false,
};
const retry = selectWorldResultForSurfacing({ saveState: { ...baseSave, sceneRuntime: { world_result_surface: ignoredCheckpoint } }, knownNpcKeys: ['lena'] });
assert.equal(retry.reason, 'retry');
assert.equal(retry.selected.attempt, 2, 'an ignored result receives exactly one bounded retry');
const exhausted = selectWorldResultForSurfacing({ saveState: { ...baseSave, sceneRuntime: { world_result_surface: { ...ignoredCheckpoint, attempts: 2 } } }, knownNpcKeys: ['lena'] });
assert.equal(exhausted.reason, 'retry-exhausted');
assert.equal(exhausted.selected, null);
const surfaced = selectWorldResultForSurfacing({ saveState: { ...baseSave, sceneRuntime: { world_result_surface: { ...ignoredCheckpoint, manifested: true } } }, knownNpcKeys: ['lena'] });
assert.equal(surfaced.reason, 'already-surfaced');
assert.equal(selectWorldResultForSurfacing({ saveState: baseSave, knownNpcKeys: ['lena'], enabled: false }).reason, 'disabled');
assert.equal(selectWorldResultForSurfacing({ saveState: { ...baseSave, world: { date: '1285-03-01', time: '13:00' } }, knownNpcKeys: ['lena'] }).reason, 'future-result', 'a future-dated digest row cannot grant premature knowledge');
assert.equal(selectWorldResultForSurfacing({ saveState: { ...baseSave, world: {} }, knownNpcKeys: ['lena'] }).reason, 'invalid-clock');

const twoResultsDigest = `${digest}\n[OFFSCREEN 1285-03-01 14:00] lena: 마법과 공개 실습 종료 확정`;
const latest = parsePublicWorldResults(twoResultsDigest, { knownNpcKeys: ['lena'] }).at(-1);
const noStaleBacklog = selectWorldResultForSurfacing({
  saveState: { world: { date: '1285-03-01', time: '14:10' }, backgroundDigest: twoResultsDigest, sceneRuntime: { world_result_surface: { ...ignoredCheckpoint, fingerprint: latest.fingerprint, title: latest.title, fact: latest.fact, manifested: true } } },
  knownNpcKeys: ['lena'],
});
assert.equal(noStaleBacklog.reason, 'already-surfaced', 'after the latest result is handled, older digest rows must not become a stale replay queue');

const directive = buildWorldResultSurfacingDirective(firstSelection.selected, { lena: '레나' });
assert.match(directive, /EVENT DIRECTOR V3/);
assert.match(directive, /RESULT=WORLD_RESULT_SURFACE/);
assert.match(directive, /ORDER=USER_ACTION_FIRST/);
assert.match(directive, /GUARDS=ONE_TRACE\|NO_OUTCOME_INVENTION\|NO_META_LOG\|NO_TELEPORT\|NO_PC_KNOWLEDGE\|NO_PC_CONTROL/);
assert.match(directive, /정확히 한 번/);
assert.match(directive, /성공\/실패의 세부 결과, 보상, 부상, 비밀 원인, 관계 변화, PC의 사전 지식을 발명하지 마라/);
assert.match(directive, /위치·일정상 자연스럽지 않으면 NPC를 순간이동시키거나 억지 소문을 만들지 말고/);
assert.doesNotMatch(directive, /\[OFFSCREEN /, 'the routed Director directive must never expose the internal digest row');

const resultFixture = { title: parsed[0].title, npc_keys: ['lena'], npc_names: ['레나'] };
assert.deepEqual(
  worldResultSurfaceEvidence({ scene: [{ kind: 'narration', text: '게시판에 마법과 정오 연구회가 종료됐다는 공지가 새로 붙었다.' }], state_delta: {} }, resultFixture),
  { manifested: true, channel: 'public-trace' },
);
assert.equal(worldResultSurfaceEvidence({ scene: [{ kind: 'dialogue', speaker_key: 'lena', text: '안녕.' }], state_delta: {} }, resultFixture).manifested, false, 'the selected NPC merely appearing is not result evidence');
assert.equal(worldResultSurfaceEvidence({ scene: [{ kind: 'narration', text: '아르테미스가 마법과 정오 연구회에서 돌아왔다.' }], state_delta: {} }, resultFixture).manifested, false, 'an unrelated NPC return must not satisfy the selected NPC result');
assert.equal(worldResultSurfaceEvidence({ scene: [{ kind: 'narration', text: '마법과 정오 연구회는 내일 시작될 예정이다.' }], state_delta: {} }, resultFixture).manifested, false, 'a title mention without completion is not result evidence');
assert.equal(worldResultSurfaceEvidence({ scene: [{ kind: 'narration', text: '마법과 정오 연구회는 아직 종료되지 않았다.' }], state_delta: {} }, resultFixture).manifested, false, 'negated completion is not manifestation evidence');
assert.equal(worldResultSurfaceEvidence({ scene_summary: '마법과 정오 연구회가 종료됐다는 내부 요약', scene: [], state_delta: {} }, resultFixture).manifested, false, 'a non-visible internal summary cannot close the visible-delivery checkpoint');
assert.equal(worldResultSurfaceEvidence({ choices: ['마법과 정오 연구회 결과를 확인한다.'], state_delta: {} }, resultFixture).manifested, false, 'a future choice is not visible manifestation');
assert.deepEqual(
  worldResultSurfaceEvidence({ scene: [], state_delta: { pc_knowledge_add: ['공개 공지를 통해 마법과 정오 연구회가 종료됐음을 확인했다.'] } }, resultFixture),
  { manifested: true, channel: 'public-trace' },
  'matched visible knowledge may count, but unrelated hidden state may not',
);

const telemetry = {
  result: 'WORLD_RESULT_SURFACE', world_result_fingerprint: parsed[0].fingerprint, world_result_id: parsed[0].world_result_id,
  world_result_source_at: parsed[0].source_at, world_result_title: parsed[0].title, world_result_fact: parsed[0].fact,
  world_result_npc_keys: ['lena'], world_result_npc_names: ['레나'],
};
const manifestedState = deriveWorldResultSurfaceState({
  previousRuntime: {}, directorTelemetry: telemetry, turn: { scene: [{ kind: 'dialogue', speaker_key: 'lena', text: '마법과 정오 연구회를 마치고 돌아왔어.' }], state_delta: {} }, turnNumber: 9,
});
assert.equal(manifestedState.manifested, true);
assert.equal(manifestedState.attempts, 1);
assert.equal(manifestedState.channel, 'npc-report');
const ignoredState = deriveWorldResultSurfaceState({ previousRuntime: {}, directorTelemetry: telemetry, turn: { scene: [], state_delta: {} }, turnNumber: 9 });
assert.equal(ignoredState.manifested, false);
const retriedState = deriveWorldResultSurfaceState({ previousRuntime: { world_result_surface: ignoredState }, directorTelemetry: telemetry, turn: { scene: [], state_delta: {} }, turnNumber: 10 });
assert.equal(retriedState.attempts, 2);
assert.deepEqual(deriveWorldResultSurfaceState({ previousRuntime: { world_result_surface: manifestedState }, directorTelemetry: { result: 'NO_EVENT' }, turn: {}, turnNumber: 10 }), manifestedState, 'unrelated turns preserve the bounded checkpoint exactly');

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
lena=레나, artemis=아르테미스
===== WORLD CANON =====
${divider}
PUBLIC ACADEMY
${divider}
Public facts.
===== NPC CANON =====
${divider}
레나
${divider}
Lena canon.
${divider}
아르테미스
${divider}
Artemis canon.
===== NPC SPEECH =====
${divider}
레나
${divider}
Lena speech.
${divider}
아르테미스
${divider}
Artemis speech.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve declared actions.`;
const input = `===== TURN OPTIONS =====
normal
===== AUTHORITATIVE SAVE_STATE =====
{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
INTERVENTION: light
ROUTINE_STREAK=0 / EVENT_GAP=0 / CHOICE_GAP=0 / CROSS_DEPT_GAP=0
===== SCHEDULE ENGINE (AUTHORITATIVE) =====
none`;
function save(patch = {}) {
  return {
    id: 'world-result-v1', turnNumber: 8,
    world: { date: '1285-03-01', time: '14:10', location: '중앙광장' },
    pc: { name: '아리아', department: '기사과', skills: {}, skillCandidates: {} },
    backgroundDigest: digest,
    npcStates: { lena: { location: '마법과 연구동', status: '일정을 마침' } },
    sceneRuntime: { participants: [], momentum: {} },
    scheduleContext: { due: [], upcoming: [] }, scheduledEvents: [],
    director: { rngSeed: 'world-result-v1', npcExposure: {}, recentBeats: [], callbacks: [] },
    ...patch,
  };
}
function route(action = '주변의 변화를 살펴본다.', savePatch = {}, mode = 'game', originalInput = input, incomingPatch = {}) {
  return routeOpenAIParams({ instructions, input: originalInput }, { incoming: { action, saveState: save(savePatch), recentTurns: [], ...incomingPatch }, mode });
}

const routed = route();
assert.equal(routed.telemetry.event_director_v2.result, 'WORLD_RESULT_SURFACE');
assert.equal(routed.telemetry.event_director_v3.result, 'WORLD_RESULT_SURFACE');
assert.equal(routed.telemetry.event_director_v3.version, '3.0');
assert.equal(routed.telemetry.event_director_v3.weighted_core_version, '2.1');
assert.equal(routed.telemetry.event_director_v2.occurrence_id, undefined, 'a surfaced fact must not start a new event occurrence');
assert.ok(!routed.telemetry.selected_npcs.includes('lena'), 'a public result must not assign its possible carrier as the Writer actor');
assert.match(routed.params.input, /"kind":"public-world-result"/);
assert.match(routed.params.input, /"fact":"마법과 정오 연구회 일정 종료가 공개적으로 확인됨"/);
assert.doesNotMatch(routed.params.input, /EVENT DIRECTOR V3|GUARDS=|PUBLIC_FACT=|TURN_PLAN=/,'only the confirmed fact may reach the Writer');
assert.equal(routed.telemetry.scene_orchestration.secondary, 'director-event');
const pressureRouted = route(`주변의 변화를 자세히 살펴본다. ${'긴 맥락을 확인한다. '.repeat(300)}`, {
  routerFeedback: { routerVersion: 'p3-pr01r-thin-scene-packet-v1', profile: 'routine-17k-v154', lastInputTokens: 99999 },
});
assert.equal(pressureRouted.telemetry.adaptive_scale, .76);
assert.ok(pressureRouted.params.input.length <= 6840, `result surfacing exceeded the minimum routine budget: ${pressureRouted.params.input.length}`);
assert.doesNotMatch(pressureRouted.params.input, /GUARDS=|PUBLIC_FACT=|EVENT DIRECTOR/,'result choreography must stay internal under pressure');
assert.match(pressureRouted.params.input, /마법과 정오 연구회 일정 종료가 공개적으로 확인됨/, 'the exact confirmed fact must survive minimum routing pressure');

assert.notEqual(route('그 제안을 받아들이면 어떻게 될까?').telemetry.event_director_v2?.result, 'WORLD_RESULT_SURFACE', 'direct questions keep answer-only sovereignty');
assert.notEqual(route('상대를 공격한다.').telemetry.event_director_v2?.result, 'WORLD_RESULT_SURFACE', 'combat fixed flow stays ahead of result surfacing');
assert.notEqual(route('주변의 변화를 살펴본다.', { sceneRuntime: { participants: [], eventProgress: { eventInstanceId: 'active:test', activeBeat: null, paused: false } } }).telemetry.event_director_v2?.result, 'WORLD_RESULT_SURFACE', 'an active event stays ahead even between explicit beats');
const scheduledInput = input.replace('INTERVENTION: light', 'INTERVENTION: scheduled');
assert.notEqual(route('주변의 변화를 살펴본다.', {}, 'game', scheduledInput).telemetry.event_director_v2?.result, 'WORLD_RESULT_SURFACE', 'scheduled fixed flow stays ahead');
const upcoming = { id: 'class', title: '기사과 수업', kind: 'academic', date: '1285-03-01', time: '14:11', status: 'scheduled' };
assert.notEqual(route('주변의 변화를 살펴본다.', { scheduledEvents: [upcoming], scheduleContext: { due: [], upcoming: [upcoming] } }).telemetry.event_director_v2?.result, 'WORLD_RESULT_SURFACE', 'a reachable fixed schedule boundary stays ahead');
const overdue = { id: 'overdue-class', title: '이미 시작한 기사과 수업', kind: 'academic', date: '1285-03-01', time: '14:00', status: 'scheduled' };
assert.notEqual(route('주변의 변화를 살펴본다.', { scheduledEvents: [overdue], scheduleContext: { due: [overdue], upcoming: [] } }).telemetry.event_director_v2?.result, 'WORLD_RESULT_SURFACE', 'an overdue unfinished schedule must block unrelated world-result surfacing');
assert.notEqual(route('주변의 변화를 살펴본다.', {}, 'game', input, { backgroundSim: false }).telemetry.event_director_v2?.result, 'WORLD_RESULT_SURFACE', 'disabled background simulation disables result surfacing');

const activeGoal = { id: 'discipline', desire: 'PC의 훈련 태도를 직접 확인한다.', priority: 5, urgency: 4, progress: 10, state: 'active', target_type: 'pc', target_key: 'pc', next_actions: ['PC에게 먼저 말을 건다.'] };
const goalPriority = route('주변의 변화를 살펴본다.', {
  sceneRuntime: { participants: ['artemis'], momentum: {} },
  npcInnerStates: { artemis: { active_goal: activeGoal } },
});
assert.equal(goalPriority.telemetry.event_director_v2.result, 'PRESENT_NPC_GOAL_TICK', 'an eligible present-NPC goal remains ahead of a background result');

const [dueHook] = materializeDelayedConsequences({
  rows: [{ event_name: '교수 호출', target_bucket: 'active', delay_minutes: 10, reason: '공개 평가의 후속 확인', secret_level: 0 }],
  world: { date: '1285-03-01', time: '14:00' }, turnNumber: 8,
});
assert.equal(route('주변의 변화를 살펴본다.', { hooks: [dueHook] }).telemetry.event_director_v2.result, 'EVENT_CONSEQUENCE_DUE', 'a due causal consequence remains ahead of result surfacing');
assert.notEqual(route('', {}, 'auto').telemetry.event_director_v2?.result, 'WORLD_RESULT_SURFACE', 'AUTO keeps its existing fixed-flow guard');
assert.notEqual(route('[LUMENSIA V1.5.6 CONTINUE]', {}, 'continue').telemetry.event_director_v2?.result, 'WORLD_RESULT_SURFACE', 'CONTINUE stays frozen');
assert.notEqual(route('설정 질문', {}, 'meta').telemetry.event_director_v2?.result, 'WORLD_RESULT_SURFACE', 'META stays outside world mutation');

const orchestration = deriveSceneOrchestrationPlan({ action: '주변을 살펴본다.', saveState: save(), mode: 'game', directorTelemetry: telemetry });
assert.equal(orchestration.secondary, 'director-event', 'the surfaced result consumes the one Director beat instead of becoming an effect-only extra');
const competingActive = deriveSceneOrchestrationPlan({
  action: '주변을 살펴본다.', mode: 'game',
  saveState: save({ sceneRuntime: { eventProgress: { eventInstanceId: 'active:test', activeBeat: null, paused: false } } }),
  directorTelemetry: telemetry,
});
assert.ok(competingActive.suppressed.includes('director-event'));
assert.equal(sceneOrchestrationSuppressesDirectorResult(competingActive, telemetry), true);

const adapter = readFileSync('api/chat-router.js', 'utf8');
const health = readFileSync('api/health.js', 'utf8');
assert.equal((adapter.match(/coreHandler\(/g) || []).length, 1, 'Event Director V3 must preserve one canonical core call');
assert.match(adapter, /world_result_surface:worldResultSurface/, 'the checkpoint must stay under the existing sceneRuntime root');
assert.match(adapter, /event_director_v3_enabled:true/);
assert.match(health, /version: '0\.8\.7'/);
assert.match(health, /eventDirector: 'V3 public world-result surfacing/);

console.log('PASS Event Director V3 bounded public world-result surfacing, priority, retry, evidence, freeze, and one-call regressions');
