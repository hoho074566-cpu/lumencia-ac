#!/usr/bin/env node

import assert from 'node:assert/strict';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스, lillia=릴리아, sera=세라
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Academy facts.
===== NPC CANON =====
${divider}
ARTEMIS 아르테미스
${divider}
Artemis is the knight department's senior professor and a terse practical evaluator.
${divider}
LILLIA 릴리아
${divider}
Lillia is a first-year student.
===== NPC SPEECH =====
${divider}
ARTEMIS SPEECH 아르테미스
${divider}
Artemis speaks tersely and without procedural filler.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve the declared action without inventing another intention.`;

const action = '무기술 평가를 받는다. 목검과 방패를 선택한다.';
const eventProgress = {
  eventInstanceId: 'freshman-aptitude-evaluation',
  activeBeat: 'choose-weapon-and-take-basic-stance',
  completedBeats: ['choose-group'],
  paused: false,
};

function route(savePatch = {}, routedAction = action) {
  return routeOpenAIParams(
    { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
    { incoming: {
      action: routedAction,
      saveState: {
        turnNumber: 17,
        world: { date: '1285-03-08', time: '10:05', location: '기사과 제1연병장' },
        pc: { name: '테오 에버른', department: '기사과 1학년', status: '초기 기량평가 진행 중' },
        activeEvents: ['신입생 기량평가'],
        npcStates: { artemis: { location: '기사과 제1연병장', status: '초기 평가 감독 중' } },
        npcInnerStates: { artemis: {
          active_goal: { desire: '신입생의 실제 기초를 확인한다.', state: 'active', progress: 20, next_actions: ['과장 없이 기본기를 관찰한다.'] },
          social_stance: '직함보다 실제 동작을 본다.',
        } },
        sceneRuntime: {
          scene_key: '초기 기량평가', participants: ['artemis'],
          ongoing_topic: '무기술 조 분류 뒤 목검과 방패 선택',
          unresolved_question: '목검과 방패 / 창 / 기초 체력',
          eventProgress,
          turn_hook: { kind: 'player-choice', anchor: '목검과 방패 / 창 / 기초 체력', source: 'choices', status: 'awaiting-player', established_turn: 17 },
          exit_condition: { kind: 'player-choice', target: '평가 조를 선택한다', source: 'scene-purpose', status: 'awaiting-player', established_turn: 17 },
        },
        scheduledEvents: [{ id: 'freshman-aptitude-evaluation', title: '신입생 기량평가', date: '1285-03-08', time: '10:00', location: '기사과 제1연병장', kind: 'academic', actor_key: 'artemis', participants: [] }],
        scheduleContext: { due: [], upcoming: [] },
        ...savePatch,
      },
      recentTurns: [{
        action: '무기술 조로 간다.', summary: '교관이 조를 나누고 선택을 기다렸다.',
        scene: [{ kind: 'dialogue', speaker_key: null, text: '어느 조로 갈지 정해라.' }],
      }],
    }, mode: 'game' },
  );
}

const resumed = route();
const input = resumed.params.input;
assert.deepEqual(resumed.telemetry.selected_npcs, ['artemis'], 'a canonical current participant retains named NPC canon and character signal');
assert.match(resumed.params.instructions, /Artemis is the knight department/);
assert.match(input, /신입생의 실제 기초를 확인한다/);
assert.equal(input.split('freshman-aptitude-evaluation').length - 1, 1, 'the current event occurrence is routed once as continuity membership');
assert.doesNotMatch(input, /choose-group|choose-weapon-and-take-basic-stance/, 'semantic checkpoint names must stay in the internal ledger instead of outlining prose');
assert.doesNotMatch(input, /무기술 조 분류 뒤 목검과 방패 선택/, 'model-authored event topic must not become a second procedural outline');
assert.doesNotMatch(input, /player_boundary|player-boundary:turn-hook|"unresolved_question"/, 'a fresh exact USER ACTION supersedes the previous player menu in writer context');
assert.doesNotMatch(input, /"source":"scene-runtime"/, 'the current event ledger must not return as a second narrative thread');
assert.ok(input.endsWith(`===== USER ACTION (EXACT) =====\n${action}`), 'the already-chosen intent remains exact and final');

const boundEvent = {
  id: 'bound-assessment', title: '기사과 개별 평가', date: '1285-03-08', time: '10:00',
  location: '제1연병장', kind: 'academic', actor_key: 'artemis', participants: ['lillia'], status: 'completed',
  note: 'SCRIPT_SENTINEL: 조 선택 뒤 자세, 손목, 발 위치를 한 단계씩 지시한다.',
};
const bound = route({
  sceneRuntime: { scene_key: '기사과 개별 평가', participants: [], eventProgress: { eventInstanceId: 'bound-assessment#1285-03-08', activeBeat: 'wrist-check', completedBeats: ['group-choice'] } },
  scheduledEvents: [boundEvent],
});
assert.deepEqual(bound.telemetry.selected_npcs, ['artemis'], 'an explicit canonical actor key outranks generic-role fallback even after the schedule row leaves due state');
assert.match(bound.params.input, /"canonical_actor_keys":\["artemis"\]/, 'explicit actor binding survives in the compact continuity ledger');
assert.doesNotMatch(bound.params.input, /SCRIPT_SENTINEL|wrist-check/, 'actor membership survives without carrying event choreography');

const unboundEvent = { ...boundEvent, id: 'unbound-assessment', actor_key: undefined, participants: ['artemis'] };
const unbound = route({
  sceneRuntime: { scene_key: '기사과 개별 평가', participants: [], eventProgress: { eventInstanceId: 'unbound-assessment', activeBeat: 'stance-check', completedBeats: [] } },
  scheduledEvents: [unboundEvent],
  npcStates: {}, npcInnerStates: {},
});
assert.deepEqual(unbound.telemetry.selected_npcs, [], 'participant order is not silently reinterpreted as a canonical host');
assert.doesNotMatch(unbound.params.input, /canonical_actor_keys|stance-check/, 'an unbound event remains AI-selectable without an invented actor special case');

const queued = route({
  sceneRuntime: { scene_key: '기사과 전체 평가', participants: ['artemis'], eventProgress },
  scheduleContext: { due: [{ id: 'freshman-aptitude-evaluation', title: '신입생 기량평가', date: '1285-03-08', time: '10:00', location: '제1연병장', kind: 'academic', actor_key: 'artemis', participants: ['lillia','sera'] }], upcoming: [] },
}, '평가를 적당히 하고 내 차례를 끝낸다.');
assert.deepEqual(queued.telemetry.selected_npcs, ['artemis'], 'event attendee order does not promote each queued student into active character authority');
assert.doesNotMatch(queued.params.input, /"participants":\["lillia","sera"\]/, 'event attendee lists stay out of Writer event facts');
assert.doesNotMatch(queued.params.input, /choose-group|choose-weapon-and-take-basic-stance/, 'broad completion intent receives event membership without checkpoint choreography');
assert.ok(queued.params.input.endsWith('===== USER ACTION (EXACT) =====\n평가를 적당히 하고 내 차례를 끝낸다.'), 'broad completion intent remains exact and final');

console.log('PASS Event Checkpoint/Writer Decoupling (opaque ledger, queue privacy, fresh intent, explicit actor preservation)');
