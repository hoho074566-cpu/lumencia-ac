#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildScenePurposeDirective, deriveScenePurpose, normalizeScenePurpose, SCENE_PURPOSE_VERSION } from '../../lib/scene-purpose.js';

const baseDelta={intent:'generic',structuralScore:0,flags:{locationChanged:false,npcAction:false}};
const turn={scene_title:'도서관 열람실',scene_summary:'이사벨이 봉인된 기록의 출처를 확인하고 있다.',scene:[],choices:[]};

const initial=deriveScenePurpose({previousRuntime:{scene_key:'도서관 열람실'},turn,sceneDelta:baseDelta,sceneKey:turn.scene_title,turnNumber:12});
assert.deepEqual(initial,{version:SCENE_PURPOSE_VERSION,kind:'scene',focus:turn.scene_summary,source:'scene-summary',established_turn:12});

const retained=deriveScenePurpose({previousRuntime:{scene_key:turn.scene_title,purpose:initial},turn:{...turn,scene_summary:'빛의 각도만 조금 달라졌다.'},sceneDelta:baseDelta,sceneKey:turn.scene_title,turnNumber:13});
assert.deepEqual(retained,initial,'same-scene descriptive churn must not replace the bounded purpose');

const refreshedGenericAction=deriveScenePurpose({previousRuntime:{scene_key:turn.scene_title,purpose:initial},turn:{...turn,scene_summary:'같은 열람실에서 봉인 기록을 읽기 시작한다.'},sceneDelta:baseDelta,action:'책을 읽는다.',sceneKey:turn.scene_title,turnNumber:13});
assert.equal(refreshedGenericAction.kind,'action','a nonempty generic player action must replace stale purpose');
assert.equal(refreshedGenericAction.source,'player-action');
assert.equal(refreshedGenericAction.focus,'같은 열람실에서 봉인 기록을 읽기 시작한다.');

const retainedQuestion=deriveScenePurpose({previousRuntime:{scene_key:turn.scene_title,purpose:initial},turn:{...turn,scene_summary:'이사벨이 대답을 기다리고 있다.'},sceneDelta:{...baseDelta,intent:'decision-sensitive'},action:'지금 입학식에 돌아갈까?',sceneKey:turn.scene_title,turnNumber:13});
assert.deepEqual(retainedQuestion,initial,'a decision-sensitive question must not replace or resolve the active purpose');

const refreshedAction=deriveScenePurpose({previousRuntime:{scene_key:turn.scene_title,purpose:initial},turn:{...turn,scene_summary:'같은 열람실에서 검술 훈련을 시작한다.'},sceneDelta:{...baseDelta,intent:'committed-consequence'},action:'검술 훈련을 시작한다.',sceneKey:turn.scene_title,turnNumber:13});
assert.equal(refreshedAction.kind,'action','a new committed same-scene objective must replace stale purpose');
assert.equal(refreshedAction.source,'player-action');

const refreshedInteraction=deriveScenePurpose({previousRuntime:{scene_key:turn.scene_title,purpose:initial},turn:{...turn,scene_summary:'안내인이 다가와 봉인 기록에 관해 묻는다.'},sceneDelta:{...baseDelta,flags:{...baseDelta.flags,npcAction:true}},sceneKey:turn.scene_title,turnNumber:13});
assert.equal(refreshedInteraction.kind,'interaction','a new same-scene NPC interaction must replace stale purpose');
assert.equal(refreshedInteraction.source,'npc-interaction');

const eventPurpose=deriveScenePurpose({previousRuntime:{scene_key:turn.scene_title,purpose:initial},turn:{...turn,scene_summary:'봉인 해제 절차가 첫 단계에 들어갔다.'},sceneDelta:{...baseDelta,structuralScore:1,flags:{...baseDelta.flags,eventProgress:true}},eventProgress:{eventInstanceId:'sealed_archive#12',activeBeat:'unlock'},sceneKey:turn.scene_title,turnNumber:14});
assert.equal(eventPurpose.kind,'event');
assert.equal(eventPurpose.source,'event-progress');
assert.equal(eventPurpose.event_instance_id,'sealed_archive#12');

const eventRetained=deriveScenePurpose({previousRuntime:{scene_key:turn.scene_title,purpose:eventPurpose},turn:{...turn,scene_summary:'같은 해제 절차에서 안내인이 다음 봉인을 가리킨다.'},sceneDelta:{...baseDelta,intent:'committed-consequence',flags:{...baseDelta.flags,npcAction:true}},eventProgress:{eventInstanceId:'sealed_archive#12',activeBeat:'unlock'},sceneKey:turn.scene_title,turnNumber:15});
assert.deepEqual(eventRetained,eventPurpose,'the same active occurrence must remain authoritative across actions and NPC interaction');

const decision=deriveScenePurpose({previousRuntime:{scene_key:turn.scene_title,purpose:eventPurpose},turn:{...turn,scene_summary:'어느 봉인을 먼저 풀지 선택해야 한다.',choices:['왼쪽 봉인을 푼다.','오른쪽 봉인을 푼다.','아직 건드리지 않는다.']},sceneDelta:baseDelta,eventProgress:{eventInstanceId:'sealed_archive#12',activeBeat:'choice'},sceneKey:turn.scene_title,turnNumber:16});
assert.equal(decision.kind,'decision');
assert.equal(decision.source,'player-decision');
assert.ok(!JSON.stringify(decision).includes('왼쪽 봉인을 푼다'),'purpose state must not persist a chosen player action');

const transitioned=deriveScenePurpose({previousRuntime:{scene_key:turn.scene_title,purpose:decision},turn:{scene_title:'기록 보관실',scene_summary:'기록 보관실에 도착해 안내인의 말을 듣는다.',scene:[{kind:'dialogue',speaker_key:'guide',text:'이쪽입니다.'}],choices:[]},sceneDelta:{intent:'travel',structuralScore:2,afterLocation:'기록 보관실',flags:{locationChanged:true,npcAction:true}},action:'기록 보관실로 간다.',sceneKey:'기록 보관실',turnNumber:17});
assert.equal(transitioned.kind,'transition');
assert.equal(transitioned.source,'scene-transition');
assert.equal(transitioned.established_turn,17);

const bounded=normalizeScenePurpose({kind:'event',focus:`첫 줄\n${'매우 긴 목적 '.repeat(100)}`,source:'event-progress',established_turn:Infinity,event_instance_id:'x'.repeat(300),ignored:'must not persist'});
assert.equal(bounded.focus.includes('\n'),false);
assert.ok(bounded.focus.length<=180);
assert.ok(bounded.event_instance_id.length<=100);
assert.deepEqual(Object.keys(bounded),['version','kind','focus','source','established_turn','event_instance_id']);

const directive=buildScenePurposeDirective({saveState:{sceneRuntime:{purpose:decision}}});
assert.match(directive,/NPC·세계·이벤트 반응 방향/);
assert.match(directive,/PC의 새로운 행동·대사·감정·생각·수락·거절·선택을 대신 만들지 않는다/);
assert.match(directive,/저장된 선택점을 임의로 해결하거나 특정 선택지를 실행하지 않는다/);

const continueDirective=buildScenePurposeDirective({action:'[LUMENSIA V1.5.6 CONTINUE] 같은 순간을 이어 쓴다.',saveState:{sceneRuntime:{purpose:initial}}});
assert.match(continueDirective,/PURPOSE_MODE=preserve-only/);
assert.match(continueDirective,/진행·완료·교체하지 않는다/);

console.log('PASS Scene Purpose V1 bounded continuity, transition, event, decision-sovereignty, and CONTINUE freeze');
