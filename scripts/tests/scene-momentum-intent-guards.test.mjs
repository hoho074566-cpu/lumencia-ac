#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildSceneMomentumDirective, classifySceneIntent } from '../../lib/scene-momentum.js';

// Negated actions are declarations not to perform the action, never compressed execution.
assert.notEqual(classifySceneIntent('탐색하지 않는다.',{location:'A동'}).kind,'explore');
assert.notEqual(classifySceneIntent('싸우지 않는다.',{location:'중앙광장'}).kind,'committed-consequence');
assert.notEqual(classifySceneIntent('공격하지 않는다.',{location:'중앙광장'}).kind,'committed-consequence');
assert.notEqual(classifySceneIntent('밖으로 나가지 않는다.',{location:'A동 개인실'}).kind,'exit-exterior');

// Intent keywords describing another actor/noun are not the player's predicate.
assert.notEqual(classifySceneIntent('잠든 이사벨을 깨운다.',{location:'기숙사'}).kind,'downtime');
assert.notEqual(classifySceneIntent('기다린 학생에게 말을 건다.',{location:'복도'}).kind,'wait');
assert.notEqual(classifySceneIntent('탐색대에게 상황을 묻는다.',{location:'광장'}).kind,'explore');
assert.notEqual(classifySceneIntent('배회하던 학생을 붙잡는다.',{location:'광장'}).kind,'explore');

// Positive predicates still classify normally.
assert.equal(classifySceneIntent('탐색한다.',{location:'A동'}).kind,'explore');
assert.equal(classifySceneIntent('좀 쉰다.',{location:'기숙사'}).kind,'downtime');
assert.equal(classifySceneIntent('기다린다.',{location:'광장'}).kind,'wait');
assert.equal(classifySceneIntent('공격한다.',{location:'광장'}).kind,'committed-consequence');

// Explicit durations override generic wait/downtime minimum floors.
const wait5=classifySceneIntent('5분만 기다린다.',{location:'광장'});
assert.equal(wait5.kind,'wait');
assert.equal(wait5.explicitDurationMinutes,5);
assert.equal(wait5.minAdvanceMinutes,5);
assert.deepEqual(wait5.suggestedAdvanceMinutes,[5,5]);

const rest5=classifySceneIntent('5분만 쉰다.',{location:'기숙사'});
assert.equal(rest5.kind,'downtime');
assert.equal(rest5.explicitDurationMinutes,5);
assert.equal(rest5.minAdvanceMinutes,5);
assert.deepEqual(rest5.suggestedAdvanceMinutes,[5,5]);
assert.match(buildSceneMomentumDirective({action:'5분만 쉰다.',saveState:{world:{location:'기숙사'},sceneRuntime:{}}}),/EXPLICIT_DURATION=5min/);
assert.match(buildSceneMomentumDirective({action:'5분만 쉰다.',saveState:{world:{location:'기숙사'},sceneRuntime:{}}}),/일반적인 downtime 시간 floor로 더 늘리지/);

console.log('PASS Scene Momentum intent guards (negation, predicate anchoring, explicit duration)');
