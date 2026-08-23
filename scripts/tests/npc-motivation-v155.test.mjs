#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
p1=One, p2=Two
===== WORLD CANON =====
${divider}
PUBLIC ACADEMY
${divider}
Public academy facts.
===== NPC CANON =====
${divider}
One
${divider}
NPC One.
${divider}
Two
${divider}
NPC Two.
===== NPC SPEECH =====
${divider}
One
${divider}
Short speech.
${divider}
Two
${divider}
Short speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC ACTION RULES
${divider}
Resolve declared actions.`;

const directorInput = `===== TURN OPTIONS =====
normal
===== AUTHORITATIVE SAVE_STATE =====
{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
INTERVENTION: medium
ROUTINE_STREAK=3 / EVENT_GAP=4 / CHOICE_GAP=1 / CROSS_DEPT_GAP=0
- p1(One) score=50: baseline
- p2(Two) score=50: baseline
===== SCHEDULE ENGINE (AUTHORITATIVE) =====
none`;

function route(action='기다린다.', savePatch={}) {
  return routeOpenAIParams(
    { instructions, input: directorInput },
    {
      incoming: {
        action,
        saveState: {
          id: 'motivation-v155-fixture',
          turnNumber: 8,
          world: { date:'1285-03-01', time:'10:00', location:'academy' },
          pc: { name:'Tester', department:'기사과' },
          sceneRuntime: { participants:[] },
          ...savePatch,
        },
        recentTurns: [],
      },
      mode:'game',
    },
  );
}

const legacyGoal = route('기다린다.', {
  npcStates: {
    p2: { current_goal:'도서관 연구 자료를 회수한다.' },
  },
});
const legacyDirector = legacyGoal.telemetry.event_director_v2;
assert.equal(legacyGoal.telemetry.routerVersion, '1.5.5', 'HF1 context router version remains V1.5.5 under the V1.5.6 adapter');
assert.equal(legacyDirector?.version, '2.1', 'Event Director must report V2.1');
assert.ok(legacyDirector?.goal_signals?.p2, 'legacy npcStates.current_goal must feed goal weighting');
assert.equal(legacyDirector.goal_signals.p2.source, 'npc-state-current_goal', 'legacy current_goal source must be visible');
assert.ok(legacyDirector.goal_signals.p2.multiplier > 1, 'active goal should positively weight an otherwise eligible candidate');
assert.ok(legacyDirector.weights.p2 > legacyDirector.weights.p1, 'equal baseline candidates should diverge when p2 has a goal');
assert.match(legacyGoal.params.instructions, /npc_state_updates\.current_goal/, 'routed contract must define meaningful current_goal updates');
assert.match(legacyGoal.params.instructions, /목표가 행동·거절·접근·회피·우선순위/, 'goal-to-behavior rule is missing');

const structuredGoalState = {
  npcInnerStates: {
    p2: {
      active_goal: {
        id:'goal:p2:test',
        target_type:'event',
        target_key:'archive-research',
        desire:'금서고 접근 단서를 확보한다.',
        priority:5,
        urgency:5,
        progress:30,
        state:'active',
        reasons:['연구 일정이 밀려 있다.'],
        next_actions:['관련 기록을 확인한다.'],
      },
    },
  },
};
const structuredGoal = route('기다린다.', structuredGoalState);
assert.equal(structuredGoal.telemetry.event_director_v2.goal_signals.p2.source, 'runtime-active-goal', 'structured runtime goal must be authoritative');
assert.equal(structuredGoal.telemetry.event_director_v2.goal_signals.p2.progress, 30, 'goal progress must survive Director routing');
const structuredGoalContext = route('p2에게 직접 질문한다.', structuredGoalState);
assert.ok(structuredGoalContext.params.input.includes('금서고 접근 단서를 확보한다.'), 'active goal must reach model context whenever that NPC is routed into the turn');

const terminalGoal = route('기다린다.', {
  npcStates: { p2:{ current_goal:'이미 끝난 자료 회수.' } },
  npcInnerStates: {
    p2: { active_goal:{ desire:'이미 끝난 자료 회수.', priority:5, urgency:5, progress:100, state:'completed', target_type:'event', target_key:'archive' } },
  },
});
assert.equal(Boolean(terminalGoal.telemetry.event_director_v2.goal_signals.p2), false, 'completed goal must not re-enter Director weighting through stale current_goal fallback');

const blockedGoal = route('기다린다.', {
  npcInnerStates: {
    p2: { active_goal:{ desire:'막힌 목표.', priority:5, urgency:5, progress:40, state:'blocked', target_type:'pc', target_key:'pc' } },
  },
});
assert.equal(Boolean(blockedGoal.telemetry.event_director_v2.goal_signals.p2), false, 'blocked goal must not weight Director');

const directFocus = route('p1에게 직접 질문한다.', {
  npcInnerStates: {
    p2: { active_goal:{ desire:'무조건 PC 앞에 나타난다.', priority:5, urgency:5, progress:0, state:'active', target_type:'pc', target_key:'pc' } },
  },
});
assert.equal(directFocus.telemetry.event_director_v2.result, 'DIRECT_USER_FOCUS', 'direct player focus must beat NPC motivation RNG');
assert.equal(directFocus.telemetry.event_director_v2.selected_key, null, 'goal weighting must not override direct player focus');

const cooldown = route('기다린다.', {
  director: { npcExposure:{ p2:{ lastSeenTurn:8 } } },
  npcInnerStates: {
    p2: { active_goal:{ desire:'PC에게 급히 접근한다.', priority:5, urgency:5, progress:0, state:'active', target_type:'pc', target_key:'pc' } },
  },
});
assert.equal(cooldown.telemetry.event_director_v2.eligible_keys.includes('p2'), false, 'goal must not bypass surprise cooldown');
assert.equal(Object.hasOwn(cooldown.telemetry.event_director_v2.weights||{}, 'p2'), false, 'ineligible goal candidate must receive no weight');

const chatRouter = readFileSync('api/chat-router.js','utf8');
const runtime = readFileSync('app-runtime.js','utf8');
const health = readFileSync('api/health.js','utf8');
assert.match(chatRouter, /active_goal/, 'chat router must persist structured active_goal');
assert.match(chatRouter, /relationship_reason/, 'chat router must persist structured relationship_reason');
assert.match(chatRouter, /relationship_history/, 'chat router must retain recent relationship reason history');
assert.match(chatRouter, /const GOAL_STATES = new Set\(\['active','blocked','completed','abandoned'\]\)/, 'Goal V2 lifecycle states are missing');
assert.match(chatRouter, /requestedReplace=npc\.goal_replace===true/, 'Goal V2 must require an explicit replacement signal');
assert.match(chatRouter, /previousState==='completed'[\s\S]*?requestedState==='active'[\s\S]*?requestedDelta<0/, 'completed goals must require an explicit negative-delta reopen');
assert.match(chatRouter, /previousState==='abandoned'[\s\S]*?requestedState==='active'/, 'abandoned goals must remain frozen without explicit reopen');
assert.match(chatRouter, /priority=bounded\(isNew\?null:previous\.priority/, 'a replacement goal must not inherit the previous priority');
assert.match(chatRouter, /urgency=due\?5:activeHook\?Math\.max\(4,bounded\(isNew\?null:previous\.urgency/, 'a replacement goal must not inherit the previous urgency');
assert.match(chatRouter, /goalPlan=activeGoal\?\.state==='active'/, 'terminal goals must not remain as active short-term plans');
assert.equal((chatRouter.match(/coreHandler\(/g)||[]).length, 1, 'V1.5.6 must keep exactly one canonical core call site');
assert.match(runtime, /\[NPC GOAL V2\]/, 'DEBUG must expose NPC Goal V2');
assert.match(runtime, /\[RECENT RELATIONSHIP REASONS\]/, 'DEBUG must expose persistent relationship reasons');
assert.match(runtime, /const PATCH_VERSION = '1\.5\.6'/, 'runtime version must be V1.5.6');
assert.match(health, /version: '0\.8\.2'/, 'health API version must be 0.8.2');
assert.match(health, /appVersion: '1\.5\.6'/, 'health appVersion must be 1.5.6');

console.log('PASS NPC Motivation + Relationship Reason V1 / Goal V2 regressions');
