#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveGoalTickState, goalTickCooldownTurns, isGoalTickCoolingDown } from '../../lib/npc-goal-tick.js';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
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
- 성격: 신중한 평가자.
- 목표: 학생의 실력을 공정하게 확인.
===== NPC SPEECH =====
${divider}
One
${divider}
- 짧고 정확하게 말한다.
===== PC SYSTEM =====
${divider}
PC ACTION RULES
${divider}
Resolve declared actions.`;
const input='===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}\n===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====\nNEXT_ACTION=DROP';
const goal={id:'goal:p1:test',desire:'PC의 실기 평가 결과를 직접 확인한다.',priority:5,urgency:4,progress:30,state:'active',target_type:'pc',target_key:'pc',next_actions:['평가 결과를 먼저 묻는다.']};
const saveState={id:'goal-tick-v1',turnNumber:8,world:{date:'1285-03-01',time:'10:00',location:'academy'},pc:{name:'Tester'},sceneRuntime:{participants:['p1']},npcInnerStates:{p1:{active_goal:goal}}};
const routed=routeOpenAIParams({instructions,input},{incoming:{action:'주변을 살펴본다.',saveState,recentTurns:[]},mode:'game'});

assert.equal(routed.telemetry.event_director_v2,null,'deterministic Goal Tick must not control Writer prose');
assert.match(routed.params.input,/"current_goal":"PC의 실기 평가 결과를 직접 확인한다\."/,'the present Named NPC keeps a factual current goal');
assert.doesNotMatch(routed.params.input,/NEXT_ACTION|평가 결과를 먼저 묻는다|MODE=goal-tick|ORDER=USER_ACTION_FIRST/,'goal action recipes must remain internal');

assert.equal(goalTickCooldownTurns(goal),2);
const telemetry={result:'PRESENT_NPC_GOAL_TICK',selected_key:'p1',selected_name:'One',selected_goal:goal};
const tickState=deriveGoalTickState({previousRuntime:{},directorTelemetry:telemetry,turn:{scene:[{kind:'dialogue',speaker_key:'p1',text:'평가 결과를 보여 줘.'}],state_delta:{}},turnNumber:9});
assert.equal(tickState.npc_key,'p1');
assert.equal(tickState.manifested,true);
assert.equal(tickState.progress_evidence,false,'visible initiative without a hard receipt must not claim progress');
assert.equal(isGoalTickCoolingDown({saveState:{sceneRuntime:{goal_tick:tickState}},key:'p1',goal,turnNumber:10}),true);
const preserved=deriveGoalTickState({previousRuntime:{goal_tick:tickState},directorTelemetry:{result:'NO_RANDOM_EVENT_DUE'},turn:{},turnNumber:10});
assert.deepEqual(preserved,tickState,'internal historical checkpoints remain stable');

const adapter=readFileSync('api/chat-router.js','utf8');
assert.equal((adapter.match(/coreHandler\(/g)||[]).length,1);
assert.match(adapter,/single-writer-p3-pr01r2/);

console.log('PASS NPC goal state remains factual while Goal Tick prose authority is removed');
