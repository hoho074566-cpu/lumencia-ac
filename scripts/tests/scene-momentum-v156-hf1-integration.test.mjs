#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const context = readFileSync('api/lib/context-router.js','utf8');
const chat = readFileSync('api/chat-router.js','utf8');
const health = readFileSync('api/health.js','utf8');
const runtime = readFileSync('app-runtime.js','utf8');

assert.match(context,/buildSceneMomentumDirective/);
assert.match(context,/buildScenePurposeDirective/);
assert.match(context,/buildSceneExitDirective/);
assert.match(context,/buildTurnHookDirective/);
assert.match(context,/SCENE MOMENTUM HF1/);
assert.match(context,/SCENE PURPOSE V1/);
assert.match(context,/EXPLICIT SCENE EXIT CONDITION V1/);
assert.match(context,/STRONGER TURN HOOK V1/);
assert.match(context,/EVENT CONSEQUENCE V1/);
assert.doesNotMatch(context,/위 행동까지만 처리하고 PC의 다음 행동을 정하지 마라/);
assert.match(context,/결정 가치 없는 중간 단계/);
assert.match(context,/SCENE CHANGE 우선/);
assert.match(context,/momentum_stall_streak/);
assert.match(context,/momentum-recovery/);
assert.match(context,/NO_EVENT/,'momentum must retain a no-event outcome');
assert.match(context,/DIRECT_USER_FOCUS/,'momentum must preserve direct-user-focus guard');
assert.match(context,/CALLBACK_PRIORITY/,'momentum must preserve callback guard');
assert.match(context,/DIRECTOR_COOLDOWN_TURNS/,'momentum must preserve cooldown guard');

assert.match(chat,/SCENE_MOMENTUM_VERSION/);
assert.match(chat,/applySceneMomentumTimeFloor/);
assert.match(chat,/const runtimeTurn=runtimeSynthesisTurn\(data\.turn,sceneIntent\)/,'time-shortened visible scenes must be filtered before runtime synthesis');
assert.match(chat,/localSceneRuntime\([^;]+,runtimeTurn,/,'scene runtime synthesis must consume the filtered turn');
assert.match(chat,/localNpcUpdates\(incoming0,runtimeTurn\)/,'NPC runtime synthesis must consume the filtered turn');
assert.match(chat,/deriveSceneDelta/);
assert.match(chat,/updateSceneMomentum/);
assert.match(chat,/deriveScenePurpose/);
assert.match(chat,/deriveSceneExitCondition/);
assert.match(chat,/evaluateSceneExitCondition/);
assert.match(chat,/deriveTurnHook/);
assert.match(chat,/filterTurnHookChoices/);
assert.match(chat,/deriveSceneNovelty/);
assert.match(chat,/exit_condition:exitCondition,turn_hook:turnHook,goal_tick:goalTick,world_result_surface:worldResultSurface,orchestration:sceneOrchestration,momentum,novelty,scene_delta:sceneDelta/);
assert.match(chat,/scene_momentum_v1:true/);
assert.match(chat,/purpose,exit_condition:exitCondition,turn_hook:turnHook,goal_tick:goalTick,world_result_surface:worldResultSurface,orchestration:sceneOrchestration,momentum,novelty,scene_delta:sceneDelta/);
assert.match(chat,/scene_novelty_v1:true/);
assert.match(chat,/scene_purpose_v1:true/);
assert.match(chat,/scene_exit_condition_v1:true/);
assert.match(chat,/turn_hook_v1:true/);
assert.match(chat,/event_consequence_v1:true/);
assert.match(chat,/const ADAPTER_VERSION = '0\.8\.7'/);
assert.equal((chat.match(/coreHandler\(/g)||[]).length,1,'stable adapter must keep exactly one canonical coreHandler call site');
assert.match(chat,/const hasMeaningfulStop=array\(turn\?\.choices\)\.length>0/,'time-floor stop evidence must come from an explicit player decision');
assert.match(chat,/const reachedConsequenceBoundary=/,'manifested delayed results must be recognized as compression boundaries');
assert.match(chat,/applySceneMomentumTimeFloor\([^;]+consequenceLifecycle,consequenceVisibleScene\)/,'the selected consequence lifecycle and attributable narration must reach the elapsed-time guard');
assert.doesNotMatch(chat,/hasMeaningfulStop[^;\n]*importance[^;\n]*critical/i,'critical scene severity must not suppress deterministic elapsed time');
assert.match(chat,/growthAllowed=mode==='game'&&!zeroElapsedIntent/,'explicit zero-minute and non-game actions must share one deterministic growth freeze gate');
assert.equal((chat.match(/allowProgress:growthAllowed/g)||[]).length,6,'initial validation and all three post-boundary persistence rebuilds must share the growth gate');
assert.match(chat,/zeroElapsedRange=array\(growthIntent\.explicitDurationRangeMinutes\)[^;]+zeroElapsedIntent=mode==='game'&&\(growthIntent\.explicitDurationMinutes===0\|\|zeroElapsedRange\)&&Number\(growthIntent\.minAdvanceMinutes\|\|0\)<=0/,'zero-growth freeze must cover both scalar-zero and zero-length range requests');
assert.match(chat,/growthIntent=classifySceneIntent\(incoming0\.action\|\|'',\{[^}]*actorName:incoming\.saveState\?\.pc\?\.name\|\|''\}\)/,'zero-growth classification must preserve the saved player as the first-party actor');
const timeReconciliationIndex=chat.indexOf('const sceneIntent=applySceneMomentumTimeFloor');
for(const marker of ['persistedCombatGrowthState=deriveCombatGrowthState','persistedSkillLearningState=deriveSkillLearningState','persistedAwakeningTalentState=deriveAwakeningTalentState']){
  assert.ok(timeReconciliationIndex>=0&&chat.lastIndexOf(marker)>timeReconciliationIndex,`${marker} must be recomputed after time-boundary reconciliation freezes rejected completion deltas`);
}
assert.match(chat,/growthValidationScene=data\.turn\?\.scene[\s\S]*persistedCombatGrowthState=deriveCombatGrowthState\([^\n]*scene:growthValidationScene[^\n]*allowProgress:growthAllowed/,'a shortened turn must retain prevalidated prefix combat growth using the original evidence scene');
assert.match(chat,/data\.turn\.state_delta\.skill_learning!==skillLearningState\.accepted_changes[\s\S]*persistedSkillLearningState=deriveSkillLearningState\([^\n]*scene:growthValidationScene[^\n]*allowProgress:growthAllowed/,'a shortened turn must rebuild the persisted skill-learning packet from its prevalidated final subset');
assert.match(chat,/data\.turn\.state_delta\.awakening_progress!==awakeningTalentState\.accepted_awakening_changes[\s\S]*persistedAwakeningTalentState=deriveAwakeningTalentState\([^\n]*scene:growthValidationScene[^\n]*allowProgress:growthAllowed/,'a shortened turn must rebuild awakening and talent persistence from its prevalidated final subset');
assert.match(chat,/runtimeTrustedConsequenceScene[\s\S]*trustedConsequenceScene=array\(intent\?\.runtimeTrustedConsequenceScene\)/,'runtime synthesis must retain attributed consequence arrivals while discarding untrusted boundary prose');
assert.match(chat,/runtime_state=\{[^\n]*skill_learning:persistedSkillLearningState,awakening_talent:persistedAwakeningTalentState/,'the client must receive only the post-reconciliation growth packets');

assert.match(health,/version: '0\.8\.7'/);
assert.match(health,/appVersion: '1\.5\.6'/);
assert.match(health,/sceneMomentum:/);
assert.match(health,/sceneNovelty:/);
assert.match(runtime,/suppressDuplicateFlowControlsStable/);
assert.match(runtime,/Scene Momentum Recovery HF1/);
assert.match(runtime,/materializeEventConsequencesStable\(data\.turn, data\.pipeline, action\)/,'delayed consequences must materialize before canonical applyDelta persists hooks');
assert.match(runtime,/materializeDelayedConsequences/,'stable runtime must use the bounded Event Consequence queue helper');
assert.match(runtime,/minimumDelayMinutes: explicitFutureDelayMinutes\(action\)/,'an explicit future delay must be a hard lower bound for queue timing');
assert.match(runtime,/maxAdditions: isDueFollowUp \? \(pipeline\?\.event_consequence\?\.status === 'resolved' \? 1 : 0\) : 3/,'only a visibly resolved due consequence may create one follow-up');
assert.match(runtime,/8 - reserved\.length/,'materialized consequences must reserve canonical hook capacity');
assert.match(runtime,/turn\?\.event_progress\?\.event_instance_id/,'new delayed results must prefer the current response occurrence as their causal source');
assert.match(runtime,/materializeEventConsequencesStable\.toString\(\)/,'the delayed-result adapter must be inserted into the patched app module');
assert.match(runtime,/lib\/event-consequence\.js\?v=156/,'the patched app module must import the shared queue helper');
assert.match(runtime,/· MOM/);

console.log('PASS Scene Momentum HF1 production wiring (router, runtime State Delta, one-call invariant, time-floor stop evidence, health/debug/UI)');
