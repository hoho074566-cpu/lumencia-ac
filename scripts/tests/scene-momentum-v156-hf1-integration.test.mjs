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
assert.match(chat,/deriveSceneDelta/);
assert.match(chat,/updateSceneMomentum/);
assert.match(chat,/deriveScenePurpose/);
assert.match(chat,/deriveSceneExitCondition/);
assert.match(chat,/evaluateSceneExitCondition/);
assert.match(chat,/deriveTurnHook/);
assert.match(chat,/filterTurnHookChoices/);
assert.match(chat,/exit_condition:exitCondition,turn_hook:turnHook,momentum,scene_delta:sceneDelta/);
assert.match(chat,/scene_momentum_v1:true/);
assert.match(chat,/purpose,exit_condition:exitCondition,turn_hook:turnHook,momentum,scene_delta:sceneDelta/);
assert.match(chat,/scene_purpose_v1:true/);
assert.match(chat,/scene_exit_condition_v1:true/);
assert.match(chat,/turn_hook_v1:true/);
assert.match(chat,/const ADAPTER_VERSION = '0\.8\.3'/);
assert.equal((chat.match(/coreHandler\(/g)||[]).length,1,'stable adapter must keep exactly one canonical coreHandler call site');
assert.match(chat,/const hasMeaningfulStop=array\(turn\?\.choices\)\.length>0/,'time-floor stop evidence must come from an explicit player decision');
assert.doesNotMatch(chat,/hasMeaningfulStop[^;\n]*importance[^;\n]*critical/i,'critical scene severity must not suppress deterministic elapsed time');

assert.match(health,/version: '0\.8\.3'/);
assert.match(health,/appVersion: '1\.5\.6'/);
assert.match(health,/sceneMomentum:/);
assert.match(runtime,/suppressDuplicateFlowControlsStable/);
assert.match(runtime,/Scene Momentum Recovery HF1/);
assert.match(runtime,/· MOM/);

console.log('PASS Scene Momentum HF1 production wiring (router, runtime State Delta, one-call invariant, time-floor stop evidence, health/debug/UI)');
