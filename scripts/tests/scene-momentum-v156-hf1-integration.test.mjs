#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const context=readFileSync('api/lib/context-router.js','utf8');
const adapter=readFileSync('api/chat-router.js','utf8');
const runtime=readFileSync('app-runtime.js','utf8');
const health=readFileSync('api/health.js','utf8');

assert.match(adapter,/SCENE_MOMENTUM_VERSION/,'deterministic time/state reconciliation remains internal');
assert.match(adapter,/applySceneMomentumTimeFloor/);
assert.match(adapter,/deriveSceneDelta/);
assert.match(adapter,/updateSceneMomentum/);
assert.match(adapter,/deriveScenePurpose/);
assert.match(adapter,/deriveSceneExitCondition/);
assert.match(adapter,/evaluateSceneExitCondition/);
assert.match(adapter,/deriveTurnHook/);
assert.match(adapter,/deriveSceneNovelty/);
assert.equal((adapter.match(/coreHandler\(/g)||[]).length,1,'the adapter must keep one canonical model call');

for(const forbidden of ['SCENE MOMENTUM HF1','SCENE PURPOSE V1','EXPLICIT SCENE EXIT CONDITION V1','STRONGER TURN HOOK V1','EVENT CONSEQUENCE V1','MULTI-SYSTEM SCENE ORCHESTRATION V1']){
  const productionTail=context.slice(context.indexOf('function buildInput'));
  assert.equal(productionTail.includes(`===== ${forbidden} =====`),false,`${forbidden} must not enter the R2 Writer packet`);
}
assert.match(adapter,/single-writer-p3-pr01r2/);
assert.match(adapter,/event_director_v2:null/);
assert.match(adapter,/runtime_synthesized:false/);
assert.doesNotMatch(adapter,/freshChoices\(/,'Suggested Actions must not be regenerated');
assert.match(adapter,/data\.turn\.choices=\[\]/);
assert.match(runtime,/materializeEventConsequencesStable/,'event consequence persistence remains internal');
assert.match(health,/sceneMomentum:/,'hard-state health telemetry remains available');

console.log('PASS R2 keeps hard-state reconciliation internal and removes its Writer authority');
