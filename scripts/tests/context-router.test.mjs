#!/usr/bin/env node

import assert from 'node:assert/strict';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
guide=Guide, p1=One, p2=Two, p3=Three, p4=Four, p5=Five, elena=Elena, lena=Lena
===== WORLD CANON =====
${divider}
PUBLIC ACADEMY
${divider}
Public location facts.
${divider}
L5 SECRET ARCHIVE
${divider}
PRIVATE_TEST_MARKER
===== NPC CANON =====
${divider}
Guide
${divider}
- Canonical person.
===== NPC SPEECH =====
${divider}
Guide
${divider}
- Brief speech.
===== PC SYSTEM =====
${divider}
PC ACTION RULES
${divider}
Resolve declared actions.`;
const coreInput='===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}';
function route(action,extra={},mode='game'){
  const saveState={turnNumber:3,world:{date:'1285-03-01',time:'09:00',location:'academy'},pc:{name:'Nicole'},sceneRuntime:{participants:[]},scheduleContext:{due:[],upcoming:[]},...extra.saveState};
  return routeOpenAIParams({instructions,input:coreInput},{incoming:{action,saveState,recentTurns:[],...extra},mode});
}

for(const [name,action,profile] of [
  ['committed movement','나는 도서관으로 이동한다.','routine-17k-v154'],
  ['committed important movement','나는 적을 추적해서 기숙사로 이동한다.','important-20k-v154'],
  ['hypothetical','만약 적을 공격한다면 어떻게 될까?','routine-17k-v154'],
  ['negation','적을 공격하지 않고 기다린다.','routine-17k-v154'],
]){
  const result=route(action);
  assert.equal(result.telemetry.enabled,true,`${name}: router disabled`);
  assert.equal(result.telemetry.profile,profile,`${name}: classification changed`);
  assert.match(result.params.input,/===== USER ACTION — EXACT ORIGINAL TEXT =====/);
  assert.ok(result.params.input.endsWith(action),`${name}: exact action was not the final authority`);
}

const sign=route('마법과 오리엔테이션 표지판을 먼저 확인한다.',{saveState:{scheduleContext:{due:[],upcoming:[{id:'orientation',title:'마법과 오리엔테이션',date:'1285-03-01',time:'12:00',location:'마법과',participants:['guide'],note:'적성검사→대기열→담당자'}]}}});
assert.deepEqual(sign.telemetry.selected_npcs,[]);
assert.doesNotMatch(sign.params.input,/적성검사|대기열|담당자/);

const continued=route('[LUMENSIA V1.5.6 CONTINUE]\n직전 장면의 같은 순간을 이어 쓴다.',{},'continue');
assert.equal(continued.telemetry.profile,'continue-11k-v154');
assert.ok(continued.params.input.endsWith('[LUMENSIA V1.5.6 CONTINUE]\n직전 장면의 같은 순간을 이어 쓴다.'));
assert.doesNotMatch(continued.params.input,/SCENE MOMENTUM|EVENT DIRECTOR|TURN HOOK/);

const secretQuestion=route('L5 비밀 기록은 무엇인가요?');
assert.equal(secretQuestion.telemetry.secret_allowed,false);
assert.equal(secretQuestion.params.instructions.includes('PRIVATE_TEST_MARKER'),false);

const crowded=route('기다린다.',{saveState:{sceneRuntime:{participants:['p1','p2','p3','p4','p5']}}});
assert.equal(crowded.telemetry.selected_npcs.length,3,'R2 character packet cap must remain 3');
const addressed=route('p5에게 직접 질문한다.',{saveState:{sceneRuntime:{participants:['p1','p2','p3','p4']}}});
assert.equal(addressed.telemetry.selected_npcs[0],'p5','explicit Named NPC focus must be first');
assert.equal(addressed.telemetry.selected_npcs.length,3);

const exact=route('Elena에게 질문한다.');
assert.equal(exact.telemetry.selected_npcs.includes('elena'),true);
assert.equal(exact.telemetry.selected_npcs.includes('lena'),false);

console.log('PASS context router R2 thin-packet regressions');
