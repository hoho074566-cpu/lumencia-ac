#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildSceneExitDirective, deriveSceneExitCondition, evaluateSceneExitCondition, normalizeSceneExitCondition, SCENE_EXIT_VERSION } from '../../lib/scene-exit.js';

const purpose={version:'1.0',kind:'event',focus:'봉인 해제 절차가 진행 중이다.',source:'event-progress',established_turn:12,event_instance_id:'sealed_archive#12'};
const baseSave={turnNumber:12,world:{location:'A동 개인실'},sceneRuntime:{purpose}};

const exterior=deriveSceneExitCondition({action:'밖으로 간다.',saveState:baseSave,turnNumber:13});
assert.equal(exterior.kind,'semantic-destination');
assert.equal(exterior.source,'current-action');
assert.match(exterior.target,/건물 외부/);

const exteriorOpen=evaluateSceneExitCondition(exterior,{turn:{scene:[{kind:'narration',text:'복도로 나왔다.'}],choices:[]},sceneDelta:{score:1,structuralScore:1,advanceMinutes:1,flags:{timeAdvanced:true,locationChanged:false}}});
assert.equal(exteriorOpen.status,'open','a trivial corridor step must not satisfy the exterior destination');
const actionPurpose={version:'1.0',kind:'action',focus:'건물 밖으로 이동한다.',source:'player-action',established_turn:13};
const exteriorWithPurpose=deriveSceneExitCondition({action:'밖으로 간다.',saveState:baseSave,purpose:actionPurpose,turnNumber:13});
const exteriorOpenWithPurpose=evaluateSceneExitCondition(exteriorWithPurpose,{turn:{scene:[{kind:'narration',text:'복도로 나왔다.'}],choices:[]},sceneDelta:{score:1,structuralScore:1,advanceMinutes:1,flags:{timeAdvanced:true,locationChanged:false}}});
const exteriorAutoRecovery=deriveSceneExitCondition({action:'[AUTO FLOW: PC 새 행동 없음]',saveState:{...baseSave,turnNumber:13,sceneRuntime:{purpose:actionPurpose,exit_condition:exteriorOpenWithPurpose}},purpose:actionPurpose,turnNumber:14});
assert.deepEqual(exteriorAutoRecovery,exteriorOpenWithPurpose,'AUTO must retain an unsatisfied current-action boundary instead of forgetting a premature stop');
const exteriorReached=evaluateSceneExitCondition(exterior,{turn:{scene:[{kind:'narration',text:'현관을 지나 바깥에 도착했다.'}],choices:[]},sceneDelta:{score:2,structuralScore:2,advanceMinutes:4,flags:{timeAdvanced:true,locationChanged:true}}});
assert.equal(exteriorReached.status,'reached');

const question=deriveSceneExitCondition({action:'지금 입학식에 돌아갈까?',saveState:baseSave,turnNumber:13});
assert.equal(question.kind,'question-answered');
const answered=evaluateSceneExitCondition(question,{turn:{scene:[{kind:'dialogue',speaker_key:'guide',text:'아직 늦지는 않았어.'}],choices:[]},sceneDelta:{score:1,structuralScore:0,advanceMinutes:0,flags:{npcAction:true}}});
assert.equal(answered.status,'reached');
assert.match(buildSceneExitDirective({action:'지금 입학식에 돌아갈까?',saveState:baseSave}),/질문 속 가능 행동을 실행하거나 시간·위치·진행 상태를 바꾸지 않는다/);

const openEvent=deriveSceneExitCondition({action:'[AUTO FLOW: PC 새 행동 없음]',saveState:baseSave,purpose,turnNumber:13});
assert.equal(openEvent.kind,'event-step');
assert.equal(openEvent.event_instance_id,'sealed_archive#12');
const retained=deriveSceneExitCondition({action:'[AUTO FLOW: PC 새 행동 없음]',saveState:{...baseSave,sceneRuntime:{purpose,exit_condition:openEvent}},purpose,turnNumber:14});
assert.deepEqual(retained,openEvent,'AUTO continuity must retain an open exit for the same purpose checkpoint');
const currentTravelOverridesOpenEvent=deriveSceneExitCondition({action:'도서관으로 간다.',saveState:{...baseSave,sceneRuntime:{purpose,exit_condition:openEvent}},purpose,turnNumber:14});
assert.equal(currentTravelOverridesOpenEvent.kind,'semantic-destination');
assert.equal(currentTravelOverridesOpenEvent.source,'current-action','a current user action must outrank a stale open exit boundary');
const eventReached=evaluateSceneExitCondition(openEvent,{turn:{scene:[],choices:[]},sceneDelta:{score:1,structuralScore:1,flags:{eventProgress:true}},previousRuntime:{eventProgress:{eventInstanceId:'sealed_archive#12',activeBeat:'unlock',completedBeats:[]}},eventProgress:{eventInstanceId:'sealed_archive#12',activeBeat:'inspect',completedBeats:['unlock']}});
assert.equal(eventReached.status,'reached');

const decisionPurpose={version:'1.0',kind:'decision',focus:'어느 봉인을 먼저 풀지 선택해야 한다.',source:'player-decision',established_turn:15};
const decisionExit=deriveSceneExitCondition({action:'[AUTO FLOW: PC 새 행동 없음]',saveState:{turnNumber:15,sceneRuntime:{purpose:decisionPurpose}},purpose:decisionPurpose,turnNumber:16});
assert.equal(decisionExit.kind,'player-choice');
assert.equal(decisionExit.status,'awaiting-player');
assert.match(buildSceneExitDirective({action:'[AUTO FLOW: PC 새 행동 없음]',saveState:{turnNumber:15,sceneRuntime:{purpose:decisionPurpose}}}),/플레이어가 고르기 전에는 어느 선택도 실행·확정하지 않고/);
const selectedDecision=deriveSceneExitCondition({action:'왼쪽 봉인을 푼다.',saveState:{turnNumber:15,sceneRuntime:{purpose:decisionPurpose,exit_condition:decisionExit}},purpose:decisionPurpose,turnNumber:16});
assert.equal(selectedDecision.source,'current-action','an explicit player selection must replace the awaiting-player boundary');

const bounded=normalizeSceneExitCondition({kind:'event-step',target:`첫 줄\n${'매우 긴 조건 '.repeat(100)}`,source:'scene-purpose',status:'open',established_turn:Infinity,purpose_established_turn:-2,event_instance_id:'x'.repeat(300),ignored:'drop'});
assert.equal(bounded.version,SCENE_EXIT_VERSION);
assert.equal(bounded.target.includes('\n'),false);
assert.ok(bounded.target.length<=180);
assert.ok(bounded.event_instance_id.length<=100);
assert.deepEqual(Object.keys(bounded),['version','kind','target','source','status','established_turn','purpose_established_turn','event_instance_id']);

const continueDirective=buildSceneExitDirective({action:'[LUMENSIA V1.5.6 CONTINUE] 같은 순간을 이어 쓴다.',saveState:{sceneRuntime:{exit_condition:openEvent}}});
assert.match(continueDirective,/EXIT_MODE=preserve-only/);
assert.match(continueDirective,/진전·충족·교체하지 않는다/);

console.log('PASS Explicit Scene Exit Condition V1 boundaries, AUTO continuity, decision sovereignty, and CONTINUE freeze');
