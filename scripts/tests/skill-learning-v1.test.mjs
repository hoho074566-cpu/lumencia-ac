#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import { deriveSceneDelta } from '../../lib/scene-momentum.js';
import {
  compactSkillLearningTelemetry,
  deriveSkillLearningState,
  MAX_SKILL_CANDIDATES,
  normalizeSkillCandidates,
} from '../../lib/skill-learning.js';

const router = readFileSync('api/chat-router.js', 'utf8');
const runtime = readFileSync('app-runtime.js', 'utf8');
const app = readFileSync('app.js', 'utf8');
const contextRouter = readFileSync('api/lib/context-router.js', 'utf8');
const sharedUtils = readFileSync('api/lib/utils.js', 'utf8');
const health = readFileSync('api/health.js', 'utf8');

assert.match(router, /function skillLearningFieldSchema\(\)/, 'stable adapter must extend the canonical structured schema without a second model call');
assert.match(router, /stateDelta\.properties\.skill_learning=skillLearningFieldSchema\(\)/, 'structured state delta must expose bounded skill learning rows');
assert.match(router, /rawSkillLearning[\s\S]*skill_learning=rawSkillLearning\.slice\(0,2\)/, 'raw structured fields must survive the canonical parser');
assert.match(router, /skill_learning:\[\]/, 'CONTINUE freeze must clear skill learning changes');
assert.match(router, /mode==='meta'[^\n]*state_delta\.skill_learning=\[\]/, 'META must explicitly clear skill learning changes');
assert.match(router, /allowProgress:mode==='game'/, 'AUTO must not create PC growth without a player action');
assert.ok(router.indexOf('const skillLearningState=deriveSkillLearningState') < router.indexOf('const sceneIntent=applySceneMomentumTimeFloor'), 'invalid learning rows must be rejected before Scene Momentum measures State Delta');
assert.match(runtime, /skill_learning: \[\]/, 'client frozen delta must clear skill learning');
assert.match(runtime, /save\.pc\.skillCandidates = candidates/, 'client runtime must persist bounded candidates in the existing PC root');
assert.match(runtime, /새 스킬 습득:/, 'client must surface deterministic unlocks to the player');
assert.match(runtime, /학습 중: \$\{learning\}/, 'PC info must show active learning candidates');
assert.match(app, /const skills = Object\.entries\(save\.pc\.skills \|\| \{\}\)[\s\S]*?const stats = Object\.entries\(save\.pc\.stats \|\| \{\}\)/, 'stable runtime render patch must still match the canonical app source');
assert.match(contextRouter, /skillCandidates:compactSkillCandidates\(pc\.skillCandidates,1\)/, 'adaptive minimum context must retain bounded learning candidates');
assert.match(sharedUtils, /validCandidateName\(row\.skill\) && row\.basis && row\.reason/, 'shared sanitizer must reject basis-less candidate rows');
assert.match(health, /skillLearning:/, 'health response must advertise Skill Learning V1');
assert.equal((router.match(/coreHandler\(/g) || []).length, 1, 'Skill Learning V1 must preserve one canonical core call site');

const newCandidate = deriveSkillLearningState({
  existingSkills: { 대검술: { grade: 'D', hiddenXp: 12 } },
  previousCandidates: {},
  changes: [{ skill: '반월 보법', amount: 8, basis: '아르테미스의 발놀림 교정과 세 차례 반복 연습', reason: '대련 중 같은 회피 궤적을 재현했다.' }],
  action: '아르테미스에게 회피 보법을 배우며 반복 훈련한다.',
  scene: [{ text: '발 위치를 교정받은 뒤 세 번 연속 같은 궤적을 재현했다.' }],
  turnNumber: 7,
});
assert.equal(newCandidate.candidates['반월 보법'].progress, 8, 'real instruction and repeated practice must create bounded candidate progress');
assert.equal(newCandidate.candidates['반월 보법'].history.length, 1, 'candidate progress must retain a causal history row');
assert.deepEqual(newCandidate.accepted_changes.map((row) => row.skill), ['반월 보법'], 'accepted delta must contain only authoritative changes');

const noBasis = deriveSkillLearningState({
  changes: [{ skill: '그림자 보법', amount: 10, basis: null, reason: '훈련했다.' }],
  action: '보법을 훈련한다.',
  scene: [{ text: '연습을 마쳤다.' }],
});
assert.deepEqual(noBasis.accepted_changes, [], 'basis-less model claims must not create learning progress');

const noEvidence = deriveSkillLearningState({
  changes: [{ skill: '그림자 보법', amount: 10, basis: '복도에서 걸었다.', reason: '그냥 이동했다.' }],
  action: '복도를 걷는다.',
  scene: [{ text: '평범하게 복도를 통과했다.' }],
});
assert.deepEqual(noEvidence.accepted_changes, [], 'ordinary movement must not become skill learning');

const existingRejected = deriveSkillLearningState({
  existingSkills: { '대검술': { grade: 'D' } },
  changes: [{ skill: ' 대 검 술 ', amount: 9, basis: '교수의 검술 교정', reason: '훈련으로 숙련됐다.' }],
  action: '대검술을 훈련한다.',
});
assert.deepEqual(existingRejected.accepted_changes, [], 'spacing or casing variants of an existing skill must not become a new candidate');

const genericRejected = deriveSkillLearningState({
  changes: [{ skill: '새 기술', amount: 15, basis: '훈련', reason: '연습했다.' }],
  action: '훈련한다.',
});
assert.deepEqual(genericRejected.accepted_changes, [], 'generic placeholder names must not enter the save');

const duplicateBounded = deriveSkillLearningState({
  changes: [
    { skill: '반월 보법', amount: 12, basis: '반복 연습', reason: '첫 교정' },
    { skill: '반월보법', amount: 12, basis: '추가 훈련', reason: '중복 보고' },
    { skill: '호흡 제어', amount: 99, basis: '호흡 수련', reason: '교수의 지도' },
  ],
  action: '두 기술을 수련하고 교정을 받는다.',
});
assert.equal(duplicateBounded.accepted_changes.length, 2, 'one turn must accept at most two distinct candidate changes');
assert.equal(duplicateBounded.candidates['호흡 제어'].progress, 15, 'malicious oversized progress must clamp to the per-turn maximum');

const unlocked = deriveSkillLearningState({
  existingSkills: { 대검술: { grade: 'D' } },
  previousCandidates: { '반월 보법': { progress: 94, basis: '이전 교정', reason: '반복 훈련', updated_turn: 8, history: [] } },
  changes: [{ skill: '반월 보법', amount: 6, basis: '대련에서 완전한 궤적을 다섯 차례 재현', reason: '실전 압박 속에서도 기술을 안정적으로 재현했다.' }],
  action: '반월 보법을 실전 대련에서 반복한다.',
  scene: [{ text: '교수는 다섯 번째 재현이 완성됐다고 판정했다.' }],
  turnNumber: 9,
});
assert.equal(unlocked.candidates['반월 보법'], undefined, 'a completed candidate must leave the candidate map');
assert.deepEqual(unlocked.unlocked_skills, [{ skill: '반월 보법', grade: 'F', hiddenXp: 0, basis: '대련에서 완전한 궤적을 다섯 차례 재현', reason: '실전 압박 속에서도 기술을 안정적으로 재현했다.' }], '100 progress must unlock exactly one neutral F-grade skill');

const frozen = deriveSkillLearningState({
  previousCandidates: newCandidate.candidates,
  changes: [{ skill: '반월 보법', amount: 15, basis: '훈련', reason: '자동 진행' }],
  action: '[AUTO FLOW: PC 새 행동 없음]',
  scene: [{ text: '훈련 장면을 관찰했다.' }],
  allowProgress: false,
});
assert.deepEqual(frozen.candidates, newCandidate.candidates, 'AUTO/CONTINUE-style freeze must preserve the exact normalized candidate state');
assert.deepEqual(frozen.accepted_changes, [], 'frozen flows must accept no growth');

const denseCandidates = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`후보 기술 ${index}`, {
  progress: index + 1,
  basis: `훈련 근거 ${index}`,
  reason: `교정 이유 ${index}`,
  updated_turn: index,
  history: Array.from({ length: 10 }, (_, historyIndex) => ({ turn: historyIndex, amount: 1, basis: '반복 훈련', reason: '교정' })),
}]));
const normalized = normalizeSkillCandidates({ ...denseCandidates, constructor: { progress: 99 } });
assert.equal(Object.keys(normalized).length, MAX_SKILL_CANDIDATES, 'saved candidate count must remain bounded');
assert.ok(Object.values(normalized).every((row) => row.history.length <= 6), 'saved candidate history must remain bounded');
assert.equal(normalized.constructor, Object.prototype.constructor, 'prototype-sensitive candidate keys must not become own save fields');
const aliasNormalized = normalizeSkillCandidates({
  '반월 보법': { progress: 10, basis: '초기 연습', reason: '첫 시도', updated_turn: 2 },
  '반월보법': { progress: 70, basis: '최근 실전 훈련', reason: '안정적 재현', updated_turn: 9 },
});
assert.deepEqual(Object.keys(aliasNormalized), ['반월보법'], 'spacing aliases must keep the most recently updated authoritative candidate');
assert.equal(aliasNormalized['반월보법'].progress, 70, 'legacy alias cleanup must not discard newer progress');

const telemetry = compactSkillLearningTelemetry(newCandidate);
assert.deepEqual(telemetry.candidate_keys, ['반월 보법'], 'telemetry may identify bounded candidate keys');
assert.doesNotMatch(JSON.stringify(telemetry), /progress|basis|reason|history|amount/, 'telemetry must not duplicate authoritative progress or causal evidence');

const growthDelta = deriveSceneDelta({ saveState: {}, turn: { choices: [], scene: [], state_delta: { skill_learning: newCandidate.accepted_changes } } });
assert.equal(growthDelta.flags.growthChanged, true, 'an accepted learning mutation must count as real growth State Delta');

assert.match(router, /maxItems:2[\s\S]*skill:\{type:'string',minLength:2,maxLength:48\}[\s\S]*amount:\{type:'integer',minimum:1,maximum:15\}/, 'patched structured schema must bound candidate rows and per-turn progress');
assert.match(router, /basis 없는 진척은 금지/, 'model instructions must preserve the evidence gate');

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Public facts.
===== NPC CANON =====
${divider}
아르테미스
${divider}
Canon.
===== NPC SPEECH =====
${divider}
아르테미스
${divider}
Speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve.`;
const denseRouted = routeOpenAIParams(
  { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming: {
    action: `반월 보법을 이어서 훈련한다. ${'긴 행동 '.repeat(1400)}`,
    saveState: {
      turnNumber: 20,
      world: { location: '훈련장' },
      pc: { name: '아리아', department: '기사과', skills: { 대검술: { grade: 'D' } }, skillCandidates: newCandidate.candidates },
      sceneRuntime: { participants: ['artemis'] },
      npcInnerStates: {},
      routerFeedback: { routerVersion: '1.5.6-hf1', profile: 'routine-17k-v154', lastInputTokens: 100000 },
    },
    recentTurns: [],
  }, mode: 'game' },
);
assert.equal(denseRouted.telemetry.adaptive_scale, .76, 'dense fixture must exercise the minimum adaptive route');
assert.ok(denseRouted.params.input.length <= 6840, `dense learning input exceeded adaptive routine budget: ${denseRouted.params.input.length}`);
const minimumText = denseRouted.params.input.split('===== AUTHORITATIVE SAVE_STATE (ROUTED MINIMUM) =====\n')[1].split('\n\n=====')[0];
const minimumSave = JSON.parse(minimumText);
assert.equal(minimumSave.pc.skillCandidates['반월 보법'].progress, 8, 'active candidate progress must survive the mandatory minimum block');
assert.equal(minimumSave.pc.skills['대검술'].grade, 'D', 'existing skill names must survive the mandatory minimum to prevent duplicate candidates');

console.log('PASS Skill Learning V1 schema, evidence, bounds, persistence, freeze, routing, unlock, and one-call regressions');
