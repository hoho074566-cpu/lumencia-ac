#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildTurnHookDirective, deriveTurnHook, filterTurnHookChoices, normalizeTurnHook, TURN_HOOK_VERSION } from '../../lib/turn-hook.js';

const reachedExit={version:'1.0',kind:'action-resolved',target:'행동 결과 뒤의 다음 실질 지점',source:'current-action',status:'reached',established_turn:10,purpose_established_turn:10};
const actionPurpose={version:'1.0',kind:'action',focus:'도서관에서 발견한 단서를 확인한다.',source:'player-action',established_turn:10};

const genericTravelChoices=['학생식당으로 간다.','호숫가를 둘러본다.','기숙사 공용공간을 살핀다.'];
assert.deepEqual(filterTurnHookChoices('밖으로 간다.',{importance:'routine',scene:[{kind:'narration',text:'A동 현관 밖에 도착했다.'}],state_delta:{new_location:'A동 기숙사 외부'},choices:genericTravelChoices}),[],'routine travel options are not an important decision boundary');
assert.deepEqual(filterTurnHookChoices('개인실로 들어간다.',{importance:'important',scene:[{kind:'dialogue',speaker_key:'isabel',text:'시시하게 예의 바르네. 뭐, 나쁘진 않아.'}],state_delta:{new_location:'A동 기숙사 개인실'},choices:['오리엔테이션을 준비한다.','잠시 쉰다.','다시 밖으로 나간다.']}),[],'scene importance alone does not turn routine follow-up suggestions into a player decision');
assert.deepEqual(filterTurnHookChoices('주변을 본다.',{importance:'routine',scene:[{kind:'narration',text:'중앙광장에 도착했다.'}],state_delta:{},choices:['마법과 건물로 간다.','기사과 건물로 간다.','학생식당으로 간다.']}),[],'department names containing magic are not mistaken for combat decisions');
assert.deepEqual(filterTurnHookChoices('탁자 위를 살핀다.',{importance:'routine',scene:[{kind:'narration',text:'서로 다른 액체가 든 병 세 개가 놓여 있다.'}],state_delta:{},choices:['붉은 병을 집는다.','푸른 병을 집는다.','둘 다 내려놓는다.']}),['붉은 병을 집는다.','푸른 병을 집는다.','둘 다 내려놓는다.'],'valid nonverbal choices survive without belonging to a keyword allowlist');
assert.deepEqual(filterTurnHookChoices('갈림길 앞에서 멈춘다.',{importance:'routine',scene:[{kind:'narration',text:'왼쪽과 오른쪽 길 중 어느 쪽으로 갈지 결정해야 한다.'}],state_delta:{},choices:['왼쪽 길로 간다.','오른쪽 길로 간다.','왔던 길로 돌아간다.']}),['왼쪽 길로 간다.','오른쪽 길로 간다.','왔던 길로 돌아간다.'],'a contextual fork keeps travel-shaped choices');
assert.deepEqual(filterTurnHookChoices('방을 둘러본다.',{importance:'routine',scene:[{kind:'narration',text:'조용한 개인실이다.'}],state_delta:{},choices:['오리엔테이션을 준비한다.','책상을 정리한다.','잠시 쉬며 시간을 보낸다.']}),[],'demonstrably routine generic suggestions are removed as a complete set');
assert.deepEqual(filterTurnHookChoices('문을 연다.',{importance:'routine',resolution_log:{outcome:'failure'},scene:[{kind:'narration',text:'잠긴 문은 열리지 않았다.'}],state_delta:{},choices:['다시 문을 연다.']}),['다시 문을 연다.'],'structured failure keeps its retry choice');
assert.deepEqual(filterTurnHookChoices('기다린다.',{importance:'routine',event_progress:{event_instance_id:'orientation#1',active_beat:'arrival'},scene:[{kind:'narration',text:'오리엔테이션 시작 종이 울렸다.'}],state_delta:{},choices:['참석한다.','남는다.','다른 일을 한다.']}),['참석한다.','남는다.','다른 일을 한다.'],'an authoritative event boundary keeps player choices');
assert.deepEqual(filterTurnHookChoices('주변을 본다.',{importance:'routine',scene:[{kind:'dialogue',speaker_key:'isabel',text:'너도 정오 일정 때문에 나온 거야?'}],state_delta:{},choices:['기사과라고 답한다.','되묻는다.','대답하지 않는다.']}),['기사과라고 답한다.','되묻는다.','대답하지 않는다.'],'a direct NPC question keeps its response choices');
assert.deepEqual(filterTurnHookChoices('적을 공격한다.',{importance:'routine',scene:[{kind:'narration',text:'전투가 계속된다.'}],state_delta:{},choices:['다시 공격한다.']}),['다시 공격한다.'],'combat keeps its tactical choice');

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
const interruptedExit=deriveTurnHook({turn:{scene:[{kind:'dialogue',speaker_key:'isabel',text:'잠깐, 어디로 가는 거야?'}],choices:[]},sceneDelta:{flags:{npcAction:true}},purpose:{kind:'interaction',focus:'이사벨이 이동을 막고 물었다.'},exitCondition:{...reachedExit,status:'open',target:'대도서관에 도착한 때'},turnNumber:11});
assert.equal(interruptedExit.kind,'npc-address','a direct NPC question outranks an unfinished travel exit');
assert.equal(interruptedExit.status,'awaiting-player');
const declarativeDialogue=deriveTurnHook({turn:{scene:[{kind:'dialogue',speaker_key:'isabel',text:'알겠어.'},{kind:'dialogue',speaker_key:'isabel',text:'그 부탁은 이미 처리했어.'}],choices:[],scene_summary:'이사벨이 처리를 마쳤다.'},sceneDelta:{flags:{npcAction:true}},purpose:{kind:'interaction',focus:'처리 결과를 확인했다.'},exitCondition:reachedExit,turnNumber:11});
assert.notEqual(declarativeDialogue.status,'awaiting-player','ordinary declarative dialogue must not create a false player boundary');

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
const preservedAuto=deriveTurnHook({turn:{scene:[{kind:'narration',text:'주변의 소음만 이어졌다.'}],choices:[]},sceneDelta:{flags:{}},purpose:actionPurpose,exitCondition:reachedExit,previousRuntime:saveState.sceneRuntime,mode:'auto',turnNumber:16});
assert.deepEqual(preservedAuto,decision,'AUTO must retain an unanswered player hook even if the response contains only narration');
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
