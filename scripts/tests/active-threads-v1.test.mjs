import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildActiveThreadsDirective, deriveActiveThreads } from '../../lib/active-threads.js';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const baseSave = {
  turnNumber: 12,
  world: { date: '1285-03-01', time: '10:00', location: '중앙광장' },
  pc: { name: '아리아', department: '기사과' },
  sceneRuntime: {},
  activeEvents: [], worldArcs: [], hooks: [], scheduledEvents: [],
  scheduleContext: { due: [], upcoming: [] },
  director: { callbacks: [] },
};

const save = (patch = {}) => ({
  ...baseSave, ...patch,
  world: { ...baseSave.world, ...(patch.world || {}) },
  sceneRuntime: { ...baseSave.sceneRuntime, ...(patch.sceneRuntime || {}) },
  scheduleContext: { ...baseSave.scheduleContext, ...(patch.scheduleContext || {}) },
  director: { ...baseSave.director, ...(patch.director || {}) },
});

{
  const before = save({
    sceneRuntime: {
      turn_hook: { kind: 'player-choice', anchor: '왼쪽 봉인 / 오른쪽 봉인', source: 'choices', status: 'awaiting-player', established_turn: 12 },
      eventProgress: { eventInstanceId: 'sealed_archive#12', activeBeat: 'choose_seal', paused: false },
    },
    activeEvents: ['봉인 기록 조사'],
    scheduleContext: { due: [{ id: 'class:10', title: '기사과 필수 수업', date: '1285-03-01', time: '10:00' }], upcoming: [] },
  });
  const snapshot = JSON.stringify(before);
  const threads = deriveActiveThreads({ saveState: before });
  assert.equal(threads[0].player_owned, true, 'an awaiting-player boundary must remain the top active thread');
  assert.equal(threads[1].id, 'event:sealed_archive#12', 'the current event must remain ahead of schedules and background work');
  assert.equal(threads[2].id, 'schedule:class:10', 'a due schedule must be retained as a hard boundary');
  assert.equal(JSON.stringify(before), snapshot, 'deriving active threads must never mutate authoritative save state');
  const auto = buildActiveThreadsDirective({ action: '[AUTO FLOW: PC 새 행동 없음]', saveState: before, mode: 'auto' });
  assert.equal(auto.mode, 'await-player', 'AUTO must fail closed at a player-owned active thread');
  assert.match(auto.directive, /플레이어가 직접 답하기 전 AUTO/, 'the directive must preserve player sovereignty');
}

{
  const consequence = {
    id: 'consequence:hidden', title: '금지된 연구의 추적자', status: 'deferred', importance: 4,
    event_consequence: { version: '1.0', event_name: '금지된 연구의 추적자', reason: '비밀 교단이 PC를 특정했다', secret_level: 5, due_at: '1285-03-01T09:50', expires_at: '1285-03-02T09:50' },
  };
  const threads = deriveActiveThreads({ saveState: save({ hooks: [consequence] }) });
  const due = threads.find((thread) => thread.source === 'event-consequence');
  assert.ok(due, 'a due consequence must appear in the continuity view');
  assert.equal(due.title, '관찰 가능한 후속 결과가 도착할 시점', 'secret consequence names and reasons must not leak');
  assert.doesNotMatch(JSON.stringify(threads), /비밀 교단|금지된 연구/, 'the derived view must not expose secret consequence content');
}

{
  const threads = deriveActiveThreads({ saveState: save({
    hooks: [
      { id: 'resolved', title: '끝난 약속', status: 'resolved' },
      { id: 'open', title: '돌려줘야 할 편지', status: 'open', createdTurn: 8 },
    ],
    director: { callbacks: [{ key: 'rivalry', note: '라이벌의 다음 반응', status: 'opportunity', createdTurn: 9 }] },
    worldArcs: ['북부 국경의 긴장'],
    scheduleContext: { due: [], upcoming: [{ id: 'meal', title: '저녁 약속', date: '1285-03-01', time: '18:00' }] },
  }) });
  assert.ok(threads.some((thread) => thread.id === 'hook:open'), 'an unresolved hook must remain visible');
  assert.ok(threads.some((thread) => thread.id === 'callback:rivalry'), 'an unresolved Director callback must remain visible');
  assert.ok(threads.some((thread) => thread.source === 'world-arcs' && thread.background), 'a world arc must remain explicitly background-only');
  assert.doesNotMatch(JSON.stringify(threads), /북부 국경/, 'background world-arc names must not bypass canon relevance and secret routing');
  assert.ok(!threads.some((thread) => thread.id === 'hook:resolved'), 'resolved hooks must be excluded');
  assert.ok(threads.length <= 6, 'the continuity view must stay bounded');
}

{
  const continued = buildActiveThreadsDirective({ action: '[LUMENSIA V1.5.6 CONTINUE]\n같은 순간을 보강한다.', saveState: save(), mode: 'continue' });
  assert.equal(continued.mode, 'freeze', 'CONTINUE must freeze active-thread progression');
  assert.match(continued.directive, /진전·해결·교체하지 않고/, 'CONTINUE guidance must be preserve-only');
}

const instructions = `
===== CHARACTER REGISTRY =====
guide=가이드
===== WORLD CANON =====
[MODULE: ACADEMY_CORE] academy
===== NPC CANON =====
[NPC: guide] guide
===== NPC SPEECH =====
[NPC: guide] calm
===== PC SYSTEM =====
[MODULE: PC] pc
`;
const input = '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}';
const routed = routeOpenAIParams({ instructions, input }, { incoming: { action: '주변을 살펴본다.', saveState: save({ activeEvents: ['입학식 준비'] }), recentTurns: [] }, mode: 'game' });
assert.match(routed.params.input, /===== ACTIVE THREADS V1 =====/, 'the derived view must reach the existing canonical model context');
assert.equal(routed.telemetry.active_threads_v1?.version, '1.0', 'router telemetry must expose the active-thread version');
assert.equal(routed.telemetry.active_threads_v1?.count, 1, 'router telemetry must report the bounded thread count');

const routerSource = readFileSync(new URL('../../api/lib/context-router.js', import.meta.url), 'utf8');
const coreSource = readFileSync(new URL('../../api/chat-router.js', import.meta.url), 'utf8');
assert.doesNotMatch(routerSource, /responses\.create|chat\.completions|new OpenAI/, 'Active Threads integration must not add a model call');
assert.equal((coreSource.match(/=>coreHandler\(/g) || []).length, 1, 'the adapter must keep one canonical core call');
assert.doesNotMatch(routerSource, /saveState\.activeThreads\s*=|active_threads_add|active_threads_remove/, 'Active Threads V1 must not create a parallel save authority');

console.log('active-threads-v1.test: PASS');
