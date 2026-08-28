#!/usr/bin/env node

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeOpenAIParams} from '../../api/lib/context-router.js';
import {generateFateStartingCharacter} from '../../lib/fate-start.js';

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
elena=엘레나, lena=레나
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Academy entrance facts.
===== NPC CANON =====
${divider}
ELENA 엘레나
${divider}
Elena is a named academy professor.
${divider}
LENA 레나
${divider}
Lena is a named student.
===== NPC SPEECH =====
${divider}
ELENA SPEECH 엘레나
${divider}
Elena speaks with precise restraint.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve the exact declared action without inventing a new voluntary intention.`;

const generated=generateFateStartingCharacter({gender:'male',socialClass:'fallen_noble',department:'마법과 1학년',seed:'trace-45'});
assert.equal(generated.pc.name,'니콜 하르트','fixture must reproduce the canonical PC identity visible in the failed Preview');

const entrance={
  id:'entrance-ceremony',title:'신입생 입학식',date:'1285-03-01',time:'09:00',location:'대강당',kind:'academic',importance:5,
  participants:['elena','lena'],note:'PROCEDURE_SENTINEL: 표지판 뒤 동쪽 복도 적성검사 줄과 수정구 측정을 순서대로 진행한다.',
};

function route(action,patch={}){
  const save={
    turnNumber:0,
    world:{date:'1285-03-01',time:'08:40',location:'대강당 앞'},
    creation:generated.creation,
    pc:generated.pc,
    activeEvents:['입학식 준비'],
    npcStates:{elena:{location:'교수 대기실',status:'입학식 준비'},lena:{location:'대강당',status:'착석'}},
    sceneRuntime:{scene_key:'입학식 도착',participants:[],eventProgress:{eventInstanceId:'entrance-ceremony',activeBeat:'department-sign-check',completedBeats:[]}},
    scheduledEvents:[entrance],
    scheduleContext:{due:[entrance],upcoming:[]},
    ...patch,
  };
  return routeOpenAIParams(
    {instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},
    {incoming:{
      action,saveState:save,recentTurns:[],
      rollingSummary:'입학식 당일. 첫 확인 지점은 마법과 마력 적성 확인이다. 적성검사 절차를 진행한다.',
    },mode:'game'},
  );
}

const signAction='마법과 오리엔테이션 표지판을 먼저 확인한다.';
const sign=route(signAction);
assert.ok(sign.params.input.endsWith(`===== USER ACTION (EXACT) =====\n${signAction}`),'sign-check intent must remain the final exact Writer authority');
assert.match(sign.params.input,/"name":"니콜 하르트"/,'canonical PC identity must reach the Writer input unchanged');
assert.deepEqual(sign.telemetry.selected_npcs,[],'an attendee list must not invent a relevant named or generic procedural actor');
assert.match(sign.params.input,/"id":"entrance-ceremony"/,'the event may remain a compact current fact');
assert.doesNotMatch(sign.params.input,/PROCEDURE_SENTINEL|department-sign-check|마력 적성 확인|적성검사 절차|수정구|"participants":\["elena","lena"\]|"limited_records"|academy_intake|department_evaluator/,'event attendee order and character-start procedure metadata must not become Writer continuation authority');
assert.doesNotMatch(sign.params.input,/"starting_route"|"checkpoint"|"expectation"|"eventMeaning"|"evaluation_mode"|"evaluationMode"|"knownBasis"/,'derived character-start planning fields must remain internal');
assert.doesNotMatch(sign.params.input,/"unresolved_question"|"next_actions"/,'no stale or derived choice-return field may close a fresh sign-check action');

const broadAction='적성검사를 받고 오리엔테이션으로 간다.';
const broad=route(broadAction,{
  sceneRuntime:{scene_key:'입학식 도착',participants:[],eventProgress:{eventInstanceId:'entrance-ceremony',activeBeat:'department-sign-check',completedBeats:[]}},
  scheduleContext:{due:[entrance],upcoming:[{id:'magic-orientation',title:'마법과 오리엔테이션',date:'1285-03-01',time:'09:20',location:'마법과 강의실',kind:'academic',pc_required:true}]},
});
assert.ok(broad.params.input.endsWith(`===== USER ACTION (EXACT) =====\n${broadAction}`),'already-chosen broad execution intent must remain exact and final');
assert.match(broad.params.input,/magic-orientation/,'a directly requested next event remains available as a factual boundary');
assert.doesNotMatch(broad.params.input,/PROCEDURE_SENTINEL|department-sign-check|"participants":\["elena","lena"\]/,'broad intent may complete naturally without receiving a queue traversal recipe');

const namedEvent={...entrance,actor_key:'elena'};
const named=route(signAction,{
  npcStates:{elena:{location:'대강당 앞',status:'입학식 표지 확인 중'},lena:{location:'대강당',status:'착석'}},
  sceneRuntime:{scene_key:'입학식 도착',participants:['elena'],eventProgress:{eventInstanceId:'entrance-ceremony',activeBeat:'department-sign-check',completedBeats:[]}},
  scheduledEvents:[namedEvent],scheduleContext:{due:[namedEvent],upcoming:[]},
});
assert.deepEqual(named.telemetry.selected_npcs,['elena'],'an explicitly bound causally current Named NPC must survive event routing');
assert.match(named.params.instructions,/Elena is a named academy professor/,'the current Named NPC keeps canonical character context');
assert.match(named.params.input,/"canonical_actor_keys":\["elena"\]/,'the event actor is represented by canonical identity, not a generic role label');
assert.doesNotMatch(named.params.input,/PROCEDURE_SENTINEL|academy_intake|department_evaluator|"limited_records"/,'a Named NPC must not be flattened into a generic evaluation audience or procedure');

const app=readFileSync('app.js','utf8');
assert.match(app,/actionInput\.placeholder = `\$\{save\.pc\.name \|\| 'PC'\}/,'input placeholder identity must derive from the canonical save PC name');

console.log('writer-intent-authority: PASS');
