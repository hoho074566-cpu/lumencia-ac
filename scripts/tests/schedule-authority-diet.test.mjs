#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스, guide=안내인
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Academy facts.
===== NPC CANON =====
${divider}
ARTEMIS 아르테미스
${divider}
Artemis is a knight instructor.
===== NPC SPEECH =====
${divider}
ARTEMIS SPEECH 아르테미스
${divider}
Artemis speaks tersely.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve declared actions.`;

const directorInput = `===== TURN OPTIONS =====
normal
===== AUTHORITATIVE SAVE_STATE =====
{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
INTERVENTION: light
ROUTINE_STREAK=0 / EVENT_GAP=0 / CHOICE_GAP=0 / CROSS_DEPT_GAP=0
===== SCHEDULE ENGINE (AUTHORITATIVE) =====
{}`;

const orientation = {
  id: 'knight_orientation',
  title: '기사과 1학년 오리엔테이션',
  note: 'PRE_EVENT_FILLER_SENTINEL: 시작 전 훈련장 구조와 대련 규칙을 설명한다.',
  date: '1285-03-01',
  time: '12:00',
  location: '기사과 제1연병장',
  kind: 'academic',
  importance: 4,
  status: 'scheduled',
  participants: ['artemis'],
  pc_required: true,
};

function route(action, savePatch = {}) {
  return routeOpenAIParams(
    { instructions, input: directorInput },
    { incoming: {
      action,
      saveState: {
        turnNumber: 4,
        world: { date: '1285-03-01', time: '09:30', location: '1학년 A동 기숙사' },
        pc: { name: '테오 에버른', department: '기사과 1학년', status: '입학식 직후' },
        npcStates: { artemis: { location: '기사과 교관실', status: '업무 중' } },
        sceneRuntime: { participants: [] },
        scheduledEvents: [orientation],
        scheduleContext: {
          due: [],
          upcoming: [orientation],
          npc_schedule: { artemis: { location: '기사과 제1연병장', activity: '오리엔테이션 규칙 설명', commitment: '정오 오리엔테이션', confidence: 'fixed', time: '12:00' } },
        },
        ...savePatch,
      },
      recentTurns: [],
    }, mode: 'game' },
  );
}

const routineArrival = route('기사과 구역으로 간다.');
assert.doesNotMatch(routineArrival.params.input, /knight_orientation|기사과 1학년 오리엔테이션|PRE_EVENT_FILLER_SENTINEL|정오 오리엔테이션|오리엔테이션 규칙 설명/);
assert.doesNotMatch(routineArrival.params.input, /FUTURE CLOCK FACTS|schedule_boundary_minutes/, 'a distant future schedule must not become routine-arrival prose authority');

const routineRoom = route('방에서 짐을 정리한다.');
assert.doesNotMatch(routineRoom.params.input, /knight_orientation|PRE_EVENT_FILLER_SENTINEL|FUTURE CLOCK FACTS|schedule_boundary_minutes/, 'a routine action must not receive pre-event filler context');

const softOverride = route('길드 접수실로 간다.');
assert.doesNotMatch(softOverride.params.input, /knight_orientation|PRE_EVENT_FILLER_SENTINEL|FUTURE CLOCK FACTS|schedule_boundary_minutes/, 'a clear destination must outrank a distant soft academic schedule');

const broadIntent = route('주변을 둘러보다 정오에 기사과 오리엔테이션에 참석한다.');
assert.match(broadIntent.params.input, /===== FUTURE CLOCK FACTS \(SOFT CONTINUITY DATA\) =====/);
assert.match(broadIntent.params.input, /"id":"knight_orientation"/);
assert.match(broadIntent.params.input, /"time":"12:00"/);
assert.match(broadIntent.params.input, /"location":"기사과 제1연병장"/);
assert.match(broadIntent.params.input, /"mandatory":true/);
assert.doesNotMatch(broadIntent.params.input, /PRE_EVENT_FILLER_SENTINEL|"importance":4|"status":"scheduled"|"participants":\["artemis"\]|"scheduledEvents"/, 'a requested future event must be a minimal clock fact, not a scripted agenda or duplicated save block');
assert.ok(broadIntent.params.input.endsWith('===== USER ACTION (EXACT) =====\n주변을 둘러보다 정오에 기사과 오리엔테이션에 참석한다.'), 'USER ACTION remains exact and final');

const nearBoundary = route('기사과 구역으로 간다.', {
  world: { date: '1285-03-01', time: '11:55', location: '1학년 A동 기숙사' },
});
assert.match(nearBoundary.params.input, /===== FUTURE CLOCK FACTS \(SOFT CONTINUITY DATA\) =====/);
assert.match(nearBoundary.params.input, /"schedule_boundary_minutes":5/, 'a future event inside the actual travel window remains a canonical time constraint');
assert.doesNotMatch(nearBoundary.params.input, /PRE_EVENT_FILLER_SENTINEL|오리엔테이션 규칙 설명|정오 오리엔테이션/, 'even a reachable boundary must not carry a pre-event script or NPC commitment');

const dueEvent = { ...orientation, time: '09:30', note: '현재 시작 종이 울렸고 참가자 입장이 진행 중이다.' };
const hardEvent = route('주변을 살핀다.', {
  scheduledEvents: [dueEvent],
  scheduleContext: {
    due: [dueEvent],
    upcoming: [],
    npc_schedule: { artemis: { location: '기사과 제1연병장', activity: '현재 입장 통제', commitment: '현재 오리엔테이션', confidence: 'fixed', time: '09:30' } },
  },
});
assert.match(hardEvent.params.input, /===== IMMEDIATE EVENT FACTS \(HARD DATA\) =====/);
assert.match(hardEvent.params.input, /현재 시작 종이 울렸고 참가자 입장이 진행 중이다/);
assert.match(hardEvent.params.input, /현재 오리엔테이션/);
assert.match(hardEvent.params.input, /"participants":\["artemis"\]/, 'an immediate unavoidable event retains current participants and occurrence facts');

assert.match(routineArrival.params.input, /"name":"테오 에버른"/);
assert.doesNotMatch(routineArrival.params.input, /"name":"Aaa"/, 'routed save identity must not be replaced by a placeholder PC');
const appSource = readFileSync('app.js', 'utf8');
assert.match(appSource, /actionInput\.placeholder = `\$\{save\.pc\.name \|\| 'PC'\}의 행동이나 대사를 직접 입력…`;/, 'the input placeholder must derive from the same canonical save identity sent to the model');

console.log('PASS Scheduled Event Authority Diet (soft future clock facts, hard immediate events, player intent, identity)');
