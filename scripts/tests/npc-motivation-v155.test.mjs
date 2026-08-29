#!/usr/bin/env node

import assert from 'node:assert/strict';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
p1=One, p2=Two
===== WORLD CANON =====
${divider}
PUBLIC ACADEMY
${divider}
Public facts.
===== NPC CANON =====
${divider}
One
${divider}
- 성격: 엄격하지만 공정한 교관.
- 목표: 신입생의 기본기를 확인.
${divider}
Two
${divider}
- 성격: 조용하고 호기심이 많다.
- 목표: 금서고 열람 자격을 얻기.
===== NPC SPEECH =====
${divider}
One
${divider}
- 간결하고 단호하게 말한다.
${divider}
Two
${divider}
- 느리고 생각하며 말한다.
===== PC SYSTEM =====
${divider}
PC
${divider}
Resolve declared actions.`;
const input='===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}\n===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====\nSELECTED=p2\nNEXT_ACTION=DROP';
function route(action,savePatch={}){
  return routeOpenAIParams({instructions,input},{incoming:{action,saveState:{turnNumber:8,world:{date:'1285-03-01',time:'10:00',location:'academy'},pc:{name:'Tester'},sceneRuntime:{participants:['p1']},...savePatch},recentTurns:[]},mode:'game'});
}

const active=route('주변을 살펴본다.',{npcInnerStates:{p1:{active_goal:{id:'inspect',desire:'PC의 기본기를 공정하게 확인한다.',state:'active',next_actions:['다음 시험을 지시한다.']}}}});
assert.deepEqual(active.telemetry.selected_npcs,['p1']);
assert.match(active.params.input,/"current_goal":"PC의 기본기를 공정하게 확인한다\."/);
assert.match(active.params.input,/"core_personality_value":"- 성격: 엄격하지만 공정한 교관\."/);
assert.doesNotMatch(active.params.input,/다음 시험을 지시|NEXT_ACTION|SELECTED=p2|EVENT DIRECTOR/);
assert.equal(active.telemetry.event_director_v2,null);

const completed=route('주변을 살펴본다.',{npcStates:{p1:{current_goal:'이미 끝난 목표'}},npcInnerStates:{p1:{active_goal:{desire:'이미 끝난 목표',state:'completed'}}}});
assert.doesNotMatch(completed.params.input,/이미 끝난 목표/,'terminal runtime goals must not re-enter the character signal');
assert.match(completed.params.input,/"current_goal":"신입생의 기본기를 확인\."/,'the canonical profile goal remains available');

const direct=route('Two에게 직접 묻는다.',{sceneRuntime:{participants:['p1']},npcInnerStates:{p1:{active_goal:{desire:'PC에게 먼저 말을 건다.',state:'active'}}}});
assert.equal(direct.telemetry.selected_npcs[0],'p2','explicit player focus outranks another present NPC');

console.log('PASS Named NPC motivation is a factual character signal, not Director action authority');
