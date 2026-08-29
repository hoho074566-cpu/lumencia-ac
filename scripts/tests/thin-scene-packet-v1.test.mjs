#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
guide=안내자, lena=레나, elena=엘레나
===== WORLD CANON =====
${divider}
ACADEMY PUBLIC
${divider}
대강당과 동쪽 실습실은 서로 다른 장소다.
===== NPC CANON =====
${divider}
레나
${divider}
레나는 말보다 관찰을 앞세우며 현재 목표를 자기 방식으로 좇는다.

${divider}
안내자
${divider}
안내자는 행정 절차를 진행한다.
===== NPC SPEECH =====
${divider}
레나
${divider}
레나는 짧고 정확하게 말한다.

${divider}
안내자
${divider}
안내자는 안내문처럼 말한다.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
STATIC EXAMPLE PC
${divider}
이름: 카일 (임시)
Aaa의 행동을 대신 정하지 않는다.`;

const baseSave={
  version:3,
  turnNumber:7,
  world:{date:'1285-03-01',weekday:'월',time:'09:00',location:'대강당'},
  pc:{name:'니콜 하르트',age:18,gender:'남성',department:'마법과 1학년',status:'안정',stats:{마나:'B'},skills:{마나감지:{grade:'B'}},inventory:['학생증']},
  sceneRuntime:{participants:[]},
  npcStates:{lena:{location:'대강당',status:'표지판 가까이에 서 있음',current_goal:'사라진 기록을 찾는다.'},guide:{location:'동쪽 실습실',status:'검사 진행 중'}},
  relationships:{lena:{affinity:1,trust:0}},
  memories:{global:[],npc:{}},
  pcKnowledge:[],
  hooks:[],
  activeEvents:[],
};

const originalInput=`===== TURN OPTIONS =====
normal
===== AUTHORITATIVE SAVE_STATE =====
{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
INTERVENTION: medium
ROUTINE_STREAK=4 / EVENT_GAP=4 / CHOICE_GAP=4 / CROSS_DEPT_GAP=4
- guide(안내자) score=100: NEXT_ACTOR_SENTINEL
===== SCHEDULE ENGINE (AUTHORITATIVE) =====
NEXT_PROCEDURE_SENTINEL`;

function route(action,savePatch={}){
  const saveState={...baseSave,...savePatch,world:{...baseSave.world,...savePatch.world},pc:{...baseSave.pc,...savePatch.pc},sceneRuntime:{...baseSave.sceneRuntime,...savePatch.sceneRuntime},scheduleContext:savePatch.scheduleContext||baseSave.scheduleContext};
  return routeOpenAIParams({instructions,input:originalInput},{mode:'game',incoming:{action,saveState,recentTurns:[],proseLength:'medium'}});
}

const signAction='마법과 오리엔테이션 표지판을 먼저 확인한다.';
const sign=route(signAction,{
  scheduleContext:{due:[],upcoming:[{id:'magic-aptitude',title:'마법과 적성 검사',date:'1285-03-01',time:'09:20',location:'동쪽 실습실',pc_required:true,participants:['guide'],note:'NEXT_STEP_USE_CRYSTAL'}]},
});
assert.equal(sign.telemetry.enabled,true);
assert.ok(sign.params.input.endsWith(signAction),'exact USER ACTION must be the final authority text');
assert.match(sign.params.input,/===== USER ACTION — EXACT PLAYER TEXT =====/);
assert.match(sign.params.input,/"canonical_name":"니콜 하르트"/);
assert.match(sign.params.input,/"title":"마법과 적성 검사"/,'future schedule may remain a factual clock constraint');
for(const forbidden of [
  'NEXT_PROCEDURE_SENTINEL','NEXT_STEP_USE_CRYSTAL','NEXT_ACTOR_SENTINEL',
  'GM EVENT DIRECTOR','SCHEDULE ENGINE','MULTI-SYSTEM SCENE ORCHESTRATION','SCENE MOMENTUM',
  'DETERMINISTIC SCENE NOVELTY','SCENE PURPOSE','EXPLICIT SCENE EXIT','STRONGER TURN HOOK',
  'eventProgress','completedBeats','participant_queue','completion_recipe','recommended_next_action',
])assert.equal(sign.params.input.includes(forbidden),false,`${forbidden} leaked into the Writer packet`);
assert.equal(sign.params.input.includes('"participants":["guide"]'),false,'schedule participant queue leaked into the Writer packet');
assert.equal(sign.telemetry.selected_npcs.includes('guide'),false,'a remote procedural role must not become a scene actor');

const broadAction='적성검사를 받고 오리엔테이션으로 간다.';
const broad=route(broadAction);
assert.ok(broad.params.input.endsWith(broadAction),'broad chosen intent must remain complete and exact');

const empty=route('주변의 빛과 소리를 살핀다.');
assert.deepEqual(empty.telemetry.selected_npcs,[],'no causally relevant named character is a valid scene packet');
assert.match(empty.params.instructions,/CAUSALLY RELEVANT CHARACTER REGISTRY =====\n없음/);
assert.doesNotMatch(empty.params.instructions,/NAMED CHARACTER CANON|NAMED CHARACTER VOICE/);

const named=route('레나에게 표지판에서 무엇을 봤는지 묻는다.',{sceneRuntime:{participants:['lena']}});
assert.deepEqual(named.telemetry.selected_npcs,['lena']);
assert.match(named.params.instructions,/lena=레나/);
assert.match(named.params.instructions,/레나는 말보다 관찰을 앞세우며/);
assert.match(named.params.input,/"relevance":"user-addressed"/);
assert.match(named.params.input,/"goal":"사라진 기록을 찾는다\."/);

let directorPickedGuide=null;
for(let seed=0;seed<120&&!directorPickedGuide;seed+=1){
  const result=routeOpenAIParams({instructions,input:originalInput},{mode:'game',incoming:{action:'표지판을 읽는다.',saveState:{...baseSave,id:`seed-${seed}`},recentTurns:[]}});
  if(result.telemetry.event_director_v2?.selected_key==='guide')directorPickedGuide=result;
}
assert.ok(directorPickedGuide,'fixture must prove the internal Director can still select a candidate');
assert.equal(directorPickedGuide.telemetry.selected_npcs.includes('guide'),false,'internal Director selection must not assign the Writer an actor');
assert.equal(directorPickedGuide.params.instructions.includes('안내자는 행정 절차를 진행한다.'),false,'Director-selected generic role canon leaked to Writer');

assert.equal(sign.params.instructions.includes('카일'),false,'static example PC identity contaminated Writer instructions');
assert.equal(sign.params.instructions.includes('Aaa'),false,'static PC placeholder contaminated Writer instructions');
assert.equal(sign.params.instructions.includes('PC HARD SYSTEM'),false,'legacy static PC system must not be routed');

const authoritySuffix=' authority-tail';
const longAction=`${'가'.repeat(5000-authoritySuffix.length)}${authoritySuffix}`;
assert.equal(longAction.length,5000);
const pressured=route(longAction,{routerFeedback:{routerVersion:'p3-pr01r-thin-scene-packet-v1',profile:'routine-17k-v154',lastInputTokens:30000}});
assert.ok(pressured.params.input.endsWith(longAction),'5,000-character USER ACTION must survive context pressure without middle clipping');
assert.ok(pressured.params.input.indexOf('THIN SCENE PACKET')<pressured.params.input.indexOf('USER ACTION — EXACT PLAYER TEXT'),'hard facts must precede the exact action authority tail');
assert.equal(pressured.params.input.includes('카일'),false);

const chatSource=fs.readFileSync(new URL('../../api/chat.js',import.meta.url),'utf8');
const routerSource=fs.readFileSync(new URL('../../api/chat-router.js',import.meta.url),'utf8');
const appSource=fs.readFileSync(new URL('../../app.js',import.meta.url),'utf8');
assert.match(routerSource,/STRUCTURED STATE RECEIPTS/);
assert.match(routerSource,/never authorize prose or continuation beyond USER ACTION/);
assert.match(routerSource,/별도 질문 문장은 필수가 아니다/);
assert.doesNotMatch(routerSource,/실제 선택 질문을 scene의 마지막 항목에 두고/);
assert.match(routerSource,/delete node\.properties\.director/,'Writer schema must not require a Director plan');
assert.match(routerSource,/delete node\.properties\.event_progress/,'Writer schema must not require event checkpoint progression');
assert.match(routerSource,/UNCOMMITTED_TURN/,'hard-invariant mismatch must fail without a save commit');
assert.doesNotMatch(routerSource,/플레이어의 판단이 필요한 선택 지점|후속 상황이 발현했다/,'runtime internals must not become replacement fiction');
assert.match(routerSource,/runtime_synthesized:false/,'pipeline telemetry must not claim that validation authored fiction');
assert.match(chatSource,/scene:\s*z\.array\(SceneItem\)\.min\(1\)\.max\(18\)/,'scene remains a flexible ordered presentation container');
assert.match(appSource,/for \(const item of turn\.scene \|\| \[\]\)/,'renderer must preserve the Writer scene order');
assert.match(appSource,/actionInput\.placeholder = `\$\{save\.pc\.name \|\| 'PC'\}의 행동이나 대사를 직접 입력/,'mobile placeholder identity must come from the same canonical save PC');
assert.equal((chatSource.match(/client\.responses\.parse\(/g)||[]).length,1,'production must keep one canonical model call');

console.log('PASS P3-PR01R thin scene packet / identity / event-authority regressions');
