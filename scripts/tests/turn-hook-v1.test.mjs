#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildTurnHookDirective, deriveTurnHook, normalizeTurnHook, TURN_HOOK_VERSION } from '../../lib/turn-hook.js';

const reachedExit={version:'1.0',kind:'action-resolved',target:'행동 결과 뒤의 다음 실질 지점',source:'current-action',status:'reached',established_turn:10,purpose_established_turn:10};
const actionPurpose={version:'1.0',kind:'action',focus:'도서관에서 발견한 단서를 확인한다.',source:'player-action',established_turn:10};

const decision=deriveTurnHook({turn:{choices:['경비에게 사실을 말한다.','단서를 숨긴다.','대답을 미룬다.']},purpose:actionPurpose,exitCondition:reachedExit,turnNumber:10});
assert.equal(decision.kind,'player-choice');
assert.equal(decision.status,'awaiting-player');
assert.match(decision.anchor,/단서를 숨긴다/);

const continuation=deriveTurnHook({turn:{scene_title:'A동 복도'},purpose:actionPurpose,exitCondition:{...reachedExit,status:'open',target:'기숙사 외부에 도착한 때'},turnNumber:10});
assert.equal(continuation.kind,'continuation');
assert.equal(continuation.status,'active');
assert.equal(continuation.anchor,'기숙사 외부에 도착한 때');

const npcAddress=deriveTurnHook({turn:{scene:[{kind:'dialogue',speaker_key:'isabel',text:'너도 정오 일정 때문에 나온 거야?'}],choices:[],scene_summary:'현관에서 이사벨과 마주쳤다.'},sceneDelta:{flags:{npcAction:true}},purpose:{kind:'interaction',focus:'이사벨이 먼저 말을 걸었다.'},exitCondition:reachedExit,turnNumber:11});
assert.equal(npcAddress.kind,'npc-address');
assert.equal(npcAddress.status,'awaiting-player');
assert.equal(npcAddress.speaker_key,'isabel');

const nonverbalNpc=deriveTurnHook({turn:{scene:[{kind:'narration',text:'이사벨이 봉인된 상자를 건네고 한 걸음 물러섰다.'}],scene_summary:'이사벨이 봉인 상자를 넘겼다.'},sceneDelta:{flags:{npcStateChanged:true,resourceChanged:true}},purpose:{kind:'interaction',focus:'봉인 상자가 전달되었다.'},exitCondition:reachedExit,turnNumber:12});
assert.equal(nonverbalNpc.kind,'world-response','authoritative nonverbal NPC/world mutation is an active hook');
assert.equal(nonverbalNpc.status,'active');

const lead=deriveTurnHook({turn:{scene_title:'찢긴 대진표',scene_summary:'대진표 뒷면에서 낯선 인장을 발견했다.'},sceneDelta:{flags:{newInformation:true}},purpose:actionPurpose,exitCondition:reachedExit,turnNumber:13});
assert.equal(lead.kind,'new-lead');
assert.equal(lead.status,'active');

const mereTravel=deriveTurnHook({turn:{scene_title:'중앙광장',scene_summary:'중앙광장에 도착했다.'},sceneDelta:{flags:{locationChanged:true}},purpose:{kind:'transition',focus:'중앙광장에 도착했다.'},exitCondition:reachedExit,turnNumber:14});
assert.equal(mereTravel.kind,'next-step','location change alone must not be promoted to a strong hook');
assert.equal(mereTravel.status,'soft');

const event=deriveTurnHook({turn:{scene_summary:'봉인의 두 번째 고리가 흔들리기 시작했다.'},sceneDelta:{flags:{eventProgress:true}},purpose:{kind:'event',focus:'봉인 해제 절차가 진행 중이다.',event_instance_id:'sealed_archive#9'},exitCondition:reachedExit,eventProgress:{eventInstanceId:'sealed_archive#9',activeBeat:'second-ring'},turnNumber:15});
assert.equal(event.kind,'event-pressure');
assert.equal(event.event_instance_id,'sealed_archive#9');

const saveState={turnNumber:15,sceneRuntime:{turn_hook:decision}};
const actionDirective=buildTurnHookDirective({action:'대도서관으로 간다.',saveState});
assert.match(actionDirective,/HOOK_MODE=current-action-first/);
assert.match(actionDirective,/현재 USER ACTION 우선/);
const autoDirective=buildTurnHookDirective({action:'[AUTO FLOW: PC 새 행동 없음]',saveState});
assert.match(autoDirective,/PLAYER BOUNDARY/);
assert.match(autoDirective,/AUTO가 대신 선택·해결하지 않는다/);
const continueDirective=buildTurnHookDirective({action:'[LUMENSIA V1.5.6 CONTINUE] 같은 순간을 이어 쓴다.',saveState});
assert.match(continueDirective,/HOOK_MODE=preserve-only/);
assert.match(continueDirective,/새 질문·선택지·NPC 행동을 만들지 않는다/);

const bounded=normalizeTurnHook({kind:'npc-address',anchor:`첫 줄\n${'매우 긴 훅 '.repeat(100)}`,source:'scene-dialogue',status:'awaiting-player',established_turn:Infinity,speaker_key:'x'.repeat(200),ignored:'drop'});
assert.equal(bounded.version,TURN_HOOK_VERSION);
assert.equal(bounded.anchor.includes('\n'),false);
assert.ok(bounded.anchor.length<=220);
assert.ok(bounded.speaker_key.length<=80);
assert.deepEqual(Object.keys(bounded),['version','kind','anchor','source','status','established_turn','speaker_key']);

console.log('PASS Stronger Turn Hook V1 decision, initiative, event, continuation, and freeze boundaries');
