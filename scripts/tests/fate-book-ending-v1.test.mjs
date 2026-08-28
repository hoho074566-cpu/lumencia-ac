#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  ENDING_REGISTRY,
  FATE_BOOK_VERSION,
  beginFateBookRun,
  buildFateBookDirective,
  createFateBookState,
  deriveEndingCandidates,
  isIrrecoverableStatus,
  mergeFateBookStates,
  normalizeFateBookState,
  recordEndingDiscoveries,
  renderFateBookSummary,
  sanitizeEndingDiscoveries,
} from '../../lib/fate-book.js';

for (const ending of ENDING_REGISTRY) {
  for (const field of ['endingId', 'category', 'conditions', 'characters', 'worldState', 'reward', 'discovered']) {
    assert.ok(Object.hasOwn(ending, field), `${ending.endingId} is missing registry field ${field}`);
  }
}
assert.ok(ENDING_REGISTRY.some((row) => row.endingId === 'graduation.standard'));
assert.ok(ENDING_REGISTRY.some((row) => row.endingId === 'graduation.honors'));
assert.ok(ENDING_REGISTRY.some((row) => row.category === 'dead'));
assert.ok(ENDING_REGISTRY.filter((row) => row.endingId.startsWith('world.god_')).length >= 3, 'God branch must not collapse into one ending');
assert.doesNotMatch(JSON.stringify(ENDING_REGISTRY), /godslayer|신살/i, 'God branch must not become a single godslayer ending');

const save = (patch = {}) => ({
  id: 'run:fate-book-v1',
  version: 6,
  turnNumber: 88,
  world: { date: '1287-02-28', time: '18:30', location: '졸업식장' },
  pc: { name: '카인', status: '정상', department: '기사과 3학년' },
  relationships: { artemis: { affinity: 30, trust: 40 } },
  npcStates: { artemis: { location: '졸업식장', status: '참석' } },
  memories: { global: [], npc: { artemis: [] } },
  completedEvents: [],
  activeEvents: [],
  hooks: [],
  fateBook: createFateBookState('run:fate-book-v1'),
  sceneRuntime: { participants: ['artemis'] },
  ...patch,
});

assert.deepEqual(deriveEndingCandidates(save({ pc: { name: '카인', status: '시험 실패' } })), [], 'ordinary failure must remain Fail Forward');
assert.equal(deriveEndingCandidates(save({ completedEvents: ['일반 졸업'] }))[0]?.endingId, 'graduation.standard');
assert.equal(deriveEndingCandidates(save({ pc: { name: '카인', status: '회복 불가능' } }))[0]?.endingId, 'dead.irrecoverable');
for (const status of ['치명상으로 사망', '사망(소생 불가)', '회복 불가능한 상태', 'dead after the collapse']) {
  assert.equal(isIrrecoverableStatus(status), true, `descriptive terminal status must be recognized: ${status}`);
}
for (const status of ['사망 위험', '사망 가능', '사망하지 않았음', '소생 가능', 'not dead']) {
  assert.equal(isIrrecoverableStatus(status), false, `recoverable/non-terminal status must not become a Dead Ending: ${status}`);
}
assert.equal(deriveEndingCandidates(save({ completedEvents: ['ending:world:academy'] }))[0]?.endingId, 'world.academy');
assert.equal(deriveEndingCandidates(save({ completedEvents: ['ending:character:rival_respect:artemis'] }))[0]?.endingId, 'character.rival_respect:artemis');
assert.deepEqual(deriveEndingCandidates(save({ completedEvents: ['ending:character:companion:unknown'] })), [], 'unknown NPC keys must not authorize a Character Ending');

const graduationSave = save({ completedEvents: ['ending:graduation:standard'] });
const proposed = [{ ending_id: 'graduation.standard', characters: ['invented'], reason: '졸업식에서 3년 과정을 마쳤다.' }];
assert.deepEqual(sanitizeEndingDiscoveries({ saveState: graduationSave, discoveries: proposed, mode: 'game' }), [{
  ending_id: 'graduation.standard', category: 'general', characters: [], reason: '졸업식에서 3년 과정을 마쳤다.',
}]);
assert.deepEqual(sanitizeEndingDiscoveries({ saveState: graduationSave, discoveries: [{ ...proposed[0], ending_id: 'world.secret' }], mode: 'game' }), [], 'invented or ineligible Ending IDs must be rejected');
for (const mode of ['meta', 'auto', 'continue']) {
  assert.deepEqual(sanitizeEndingDiscoveries({ saveState: graduationSave, discoveries: proposed, mode }), [], `${mode} must freeze Ending discovery`);
}
assert.equal(sanitizeEndingDiscoveries({ saveState: save(), discoveries: [], mode: 'game', turnDelta: { completed_events_add: ['일반 졸업'] }, synthesizeCurrentTurn: true })[0]?.ending_id, 'graduation.standard', 'a trusted current-turn graduation delta must create its Ending receipt without an artificial extra turn');
assert.equal(sanitizeEndingDiscoveries({ saveState: save(), discoveries: [], mode: 'game', turnDelta: { pc_status: '치명상으로 사망' }, synthesizeCurrentTurn: true })[0]?.ending_id, 'dead.irrecoverable', 'a trusted current-turn terminal status must create its Dead Ending receipt');
assert.deepEqual(sanitizeEndingDiscoveries({ saveState: save(), discoveries: [], mode: 'auto', turnDelta: { pc_status: '사망' }, synthesizeCurrentTurn: true }), [], 'AUTO must remain frozen even for a terminal-looking delta');

const first = recordEndingDiscoveries(graduationSave.fateBook, proposed, {
  runId: graduationSave.id,
  turnNumber: 89,
  discoveredAt: '2026-08-28T00:00:00.000Z',
  worldState: { ...graduationSave.world, status: graduationSave.pc.status, completedEvents: graduationSave.completedEvents },
});
assert.equal(first.newRecords.length, 1);
assert.equal(first.rewardsGranted.length, 1);
assert.equal(first.state.rewardTotal, 1);
assert.equal(first.state.currentRun.status, 'ended');
for (const field of ['endingId', 'category', 'conditions', 'characters', 'worldState', 'reward', 'discovered']) {
  assert.ok(Object.hasOwn(first.newRecords[0], field), `stored Ending record is missing ${field}`);
}
const repeated = recordEndingDiscoveries(first.state, proposed, { runId: graduationSave.id, turnNumber: 90 });
assert.equal(repeated.newRecords.length, 0, 'repeated Ending must not create a second record');
assert.equal(repeated.rewardsGranted.length, 0, 'repeated Ending must not grant a second reward');
assert.equal(repeated.state.rewardTotal, 1);

const other = recordEndingDiscoveries(createFateBookState('run:other'), [{ ending_id: 'world.academy', characters: [], reason: '아카데미 결말' }], { runId: 'run:other', turnNumber: 20 });
const staleImport = mergeFateBookStates(first.state, [other.state], { runId: graduationSave.id });
assert.deepEqual(staleImport.records.map((row) => row.endingId).sort(), ['graduation.standard', 'world.academy']);
assert.equal(staleImport.rewardTotal, 4, 'a stale imported run must retain later first-discovery receipts and rewards from the live Fate Book');
const manyRecords = Array.from({ length: 140 }, (_, index) => ({ endingId: `character.companion:npc_${index}`, characters: [`npc_${index}`], reason: `record ${index}`, reward: { kind: 'fate_mark', amount: 2 }, discovered: true }));
assert.equal(normalizeFateBookState({ records: manyRecords }).records.length, 140, 'normalization must not discard attainable Character Ending receipts at the former 120-row boundary');

const nextRun = beginFateBookRun(first.state, { runId: 'run:next' });
assert.equal(nextRun.records.length, 1, 'Fate Book records must persist across a new run');
assert.equal(nextRun.rewardTotal, 1, 'first-discovery rewards must persist across a new run');
assert.deepEqual(nextRun.currentRun, { runId: 'run:next', status: 'active', endingIds: [], endedTurn: null });
assert.deepEqual(normalizeFateBookState(JSON.parse(JSON.stringify(nextRun))), nextRun, 'Fate Book must survive save/load normalization');

const dead = recordEndingDiscoveries(createFateBookState('run:dead'), [{ ending_id: 'dead.irrecoverable', characters: [], reason: '회복 불가능한 죽음' }], { runId: 'run:dead', turnNumber: 13 });
const interventionSave = save({ fateBook: dead.state });
assert.equal(buildFateBookDirective({ saveState: interventionSave, action: '과거의 비극에 운명 개입을 시도한다.', mode: 'game' }).includes('PAST_TRAGEDIES=dead.irrecoverable'), true);
assert.match(buildFateBookDirective({ saveState: interventionSave, action: '과거의 비극에 운명 개입을 시도한다.', mode: 'game' }), /새 기회의 근거일 뿐 결과 구매\/자동 성공이 아니며 현재 회차 능력·관계·정보·선택·아이템/);
assert.equal(buildFateBookDirective({ saveState: save({ id: 'run:dead', fateBook: dead.state }), action: '이 비극에 운명 개입을 시도한다.', mode: 'game' }), '', 'Fate Intervention must use a tragedy from a prior run, not the current run');
assert.equal(buildFateBookDirective({ saveState: interventionSave, action: '식당으로 간다.', mode: 'game' }), '', 'past tragedy must not consume routine context without an intervention action');
assert.doesNotMatch(renderFateBookSummary(createFateBookState()), /신과 맺은 계약|질서의 수호자|신의 뜻을 거부한 세계|초월의 문 너머/, 'undiscovered secret/world Ending titles must remain hidden in UI');

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Academy graduation is public.
===== NPC CANON =====
${divider}
Artemis
${divider}
Strict evaluator.
===== NPC SPEECH =====
${divider}
Artemis
${divider}
Brief speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC
${divider}
Resolve declared actions.`;
const route = (saveState, action = '졸업식의 마지막 절차를 마친다.') => routeOpenAIParams(
  { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming: { action, saveState, recentTurns: [] }, mode: 'game' },
);
const routed = route(graduationSave);
assert.equal(routed.telemetry.fate_book_v1.version, FATE_BOOK_VERSION);
assert.equal(routed.telemetry.fate_book_v1.eligible_count, 1);
assert.match(routed.params.input, /===== ENDING \/ DEAD ENDING \/ FATE BOOK V1 =====/);
assert.match(routed.params.input, /ELIGIBLE=graduation\.standard/);
assert.match(routed.params.instructions, /ending_discoveries는 AUTHORITATIVE SAVE_STATE의 ELIGIBLE Ending/);
assert.ok(routed.params.input.length <= 9000, `Fate Book routing exceeded the routine budget: ${routed.params.input.length}`);
const ordinary = route(save(), '졸업시험에 실패했지만 보충 수업 계획을 세운다.');
assert.equal(ordinary.telemetry.fate_book_v1, undefined);
assert.doesNotMatch(ordinary.params.input, /ENDING \/ DEAD ENDING \/ FATE BOOK V1/, 'ordinary failure must not open an Ending directive');

const app = readFileSync('app.js', 'utf8');
const runtime = readFileSync('app-runtime.js', 'utf8');
const adapter = readFileSync('api/chat-router.js', 'utf8');
const core = readFileSync('api/chat.js', 'utf8');
const router = readFileSync('api/lib/context-router.js', 'utf8');
const health = readFileSync('api/health.js', 'utf8');
const serviceWorker = readFileSync('sw.js', 'utf8');
assert.match(app, /fateBook:\s*createFateBookState/);
assert.match(app, /next\.fateBook\s*=\s*normalizeFateBookState/);
assert.match(app, /base\.fateBook=beginFateBookRun/);
assert.match(app, /mergeFateBookStates\(parsed\.fateBook,\[save\?\.fateBook\]/);
assert.match(app, /recordEndingDiscoveries\(save\.fateBook/);
assert.match(app, /renderFateBookSummary\(save\.fateBook\)/);
assert.match(runtime, /fateBook:\s*save\.fateBook/);
assert.match(runtime, /fate-book\.js\?v=156/);
assert.match(adapter, /sanitizeEndingDiscoveries/);
assert.match(adapter, /mode==='meta'[\s\S]*ending_discoveries=\[\]/);
assert.match(core, /ending_discoveries:\s*z\.array\(EndingDiscovery\)/);
assert.match(router, /buildFateBookDirective/);
assert.match(health, /fateBookEnding:/);
assert.match(serviceWorker, /\/lib\/fate-book\.js/);
assert.equal((adapter.match(/coreHandler\(/g) || []).length, 1, 'P2-PR08 must preserve one canonical core call');
assert.doesNotMatch(`${readFileSync('lib/fate-book.js', 'utf8')}\n${router}`, /fateProgression|fate-inheritance|originLocks|meta-ledger/i, 'P2-PR08 must not depend on deferred PR #76 or add a generic meta-ledger');

console.log('PASS P2-PR08 Ending Registry, Dead Ending, Character/World records, first-discovery reward, Fate Book persistence, and bounded Fate Intervention');
