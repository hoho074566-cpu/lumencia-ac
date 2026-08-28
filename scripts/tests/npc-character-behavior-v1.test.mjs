#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  NPC_CHARACTER_BEHAVIOR_VERSION,
  buildNpcCharacterBehaviorDirective,
  compactNpcCharacterBehavior,
} from '../../lib/npc-character-behavior.js';

const registry = { artemis: '아르테미스', emily: '에밀리' };
const saveState = {
  version: 6,
  turnNumber: 12,
  world: { date: '1285-03-04', time: '15:20', location: '기사과 훈련장' },
  pc: { name: '카인', department: '기사과 1학년', skills: {}, skillCandidates: {} },
  sceneRuntime: { participants: ['artemis', 'emily'] },
  relationships: {
    artemis: { affinity: 12, trust: 8, status: '주의 깊은 평가', stage: 'acquaintance', history: ['훈련 약속을 지켰다'] },
  },
  npcInnerStates: {
    artemis: {
      opinion_of_pc: '운이 좋았을 가능성을 아직 배제하지 않는다.',
      social_stance: '엄격한 검증자',
      wants_from_pc: '같은 기술을 통제된 조건에서 다시 보여라.',
      concern: '무모함과 실력을 혼동할 수 있다.',
      active_goal: { desire: '카인의 검술을 공정하게 검증한다.', state: 'active', progress: 45, next_actions: ['같은 동작의 재현을 요구한다.'] },
    },
  },
  emotionStates: {
    artemis: { current: 'serious', intensity: 0.72, reason: '예상보다 정확한 기술 설명을 들었다.' },
  },
  memories: {
    global: [],
    npc: {
      artemis: [
        { type: 'observer', subject: 'pc', fact: '카인이 첫 수업에서 검을 안정적으로 쥐었다.', turn: 3, confidence: 0.55, source: '직접 목격' },
        { type: 'belief', subject: 'pc', fact: '두 번째 수업의 성공은 조건이 쉬웠을 수 있다.', turn: 5, confidence: 0.61, source: '직접 목격' },
        { type: 'observer', subject: 'pc', fact: '카인이 첫 훈련에서 자세의 결함을 한 번에 교정했다.', turn: 7, confidence: 0.72, source: '직접 목격' },
        { type: 'belief', subject: '카인', fact: '두 번째 훈련에서도 같은 교정을 재현해 우연 가능성이 낮아졌다.', turn: 9, confidence: 0.83, source: '직접 재검증' },
        { type: 'observer', subject: 'pc', fact: '세 번째 훈련에서 다른 검으로도 원리를 적용했다.', turn: 11, confidence: 0.94, source: '조건 변경 시험' },
      ],
      emily: [{ type: 'fact', fact: '도서관 열람 시간을 확인했다.', turn: 10 }],
    },
  },
};

const context = compactNpcCharacterBehavior({
  saveState,
  candidateKeys: ['artemis', 'unknown', 'emily'],
  registry,
  mode: 'game',
  significanceBoundary: { mode: 'semantic', eligible_keys: ['artemis', 'emily'] },
});
assert.equal(context.version, NPC_CHARACTER_BEHAVIOR_VERSION);
assert.equal(context.mode, 'semantic');
assert.deepEqual(context.npc_keys, ['artemis', 'emily']);
assert.equal(context.profiles[0].goal.progress, 45);
assert.equal(context.profiles[0].relationship.status, '주의 깊은 평가');
assert.equal(context.profiles[0].pc_evidence.length, 3, 'the routed NPC must receive bounded prior PC evidence instead of reacting as if every turn were the first');
assert.deepEqual(context.profiles[0].pc_evidence.map((row) => row.turn), [7, 9, 11], 'a five-turn training history must keep the latest independent evidence that can revise the NPC judgment');
assert.match(context.profiles[0].pc_evidence[2].fact, /다른 검으로도 원리를 적용/);

const directive = buildNpcCharacterBehaviorDirective({ context });
assert.match(directive, /얼마나 이례적\/위험한가/);
assert.match(directive, /첫 관찰은 우연 가능성/);
assert.match(directive, /두 번째 독립 관찰은 시험\/의심/);
assert.match(directive, /세 번째로 충분히 일관된 증거/);
assert.match(directive, /매번 똑같이 놀라거나 같은 칭찬을 반복하지 않는다/);
assert.match(directive, /내부 감정을 대사로 그대로 읽지 않는다/);
assert.match(directive, /행동·호칭·거리·공격 방식·질문·선제 접근·도움·정보 공유\/보류/);
assert.match(directive, /자동 동의·성공·관계 수치 변화·새 지식/);
assert.match(directive, /owner=npc:<key>, type=belief, subject=pc/);
assert.ok(directive.length <= 2800);

const frozen = compactNpcCharacterBehavior({
  saveState,
  candidateKeys: ['artemis'],
  registry,
  mode: 'continue',
  significanceBoundary: { mode: 'freeze', eligible_keys: [] },
});
assert.equal(frozen.mode, 'freeze');
assert.deepEqual(frozen.profiles, []);
assert.equal(buildNpcCharacterBehaviorDirective({ context: frozen }), '', 'CONTINUE must not advance or invent NPC judgment');

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스, emily=에밀리
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Public facts.
===== NPC CANON =====
${divider}
NPC RULES
${divider}
Canon.
===== NPC SPEECH =====
${divider}
NPC SPEECH
${divider}
Speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve.`;
const routed = routeOpenAIParams(
  { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming: { action: '아르테미스에게 같은 자세를 다시 정확히 설명하고 시범을 보인다.', saveState, recentTurns: [] }, mode: 'game' },
);
assert.equal(routed.telemetry.npc_character_behavior_v1.version, NPC_CHARACTER_BEHAVIOR_VERSION);
assert.equal(routed.telemetry.npc_character_behavior_v1.mode, 'semantic');
assert.ok(routed.telemetry.npc_character_behavior_v1.npc_keys.includes('artemis'));
assert.equal(routed.telemetry.npc_character_behavior_v1.evidence_count, 3);
assert.match(routed.params.instructions, /NPC는 현재 행동을 자기 기억·기존 판단·목표·관계·지식과 비교/);
assert.match(routed.params.instructions, /내부 감정은 대사 원문이 아니다/);
assert.match(routed.params.input, /===== CHARACTER-DRIVEN NPC BEHAVIOR V1 =====/);
assert.match(routed.params.input, /세 번째 훈련에서 다른 검으로도 원리를 적용/);
assert.match(routed.params.input, /state_delta\.memories_add/);
assert.ok(routed.params.input.length <= 9000, `P2-PR06 exceeded the routine input budget: ${routed.params.input.length}`);

const moduleSource = readFileSync('lib/npc-character-behavior.js', 'utf8');
const routerSource = readFileSync('api/lib/context-router.js', 'utf8');
const adapterSource = readFileSync('api/chat-router.js', 'utf8');
const coreSource = readFileSync('api/chat.js', 'utf8');
const appSource = readFileSync('app.js', 'utf8');
const healthSource = readFileSync('api/health.js', 'utf8');
assert.doesNotMatch(`${moduleSource}\n${routerSource}`, /responses\.create|chat\.completions|new OpenAI/, 'P2-PR06 must not add a model call');
assert.equal((adapterSource.match(/coreHandler\(/g) || []).length, 1, 'P2-PR06 must preserve one canonical core call');
assert.doesNotMatch(moduleSource, /affinity\s*(?:>=|<=|>|<)\s*-?\d|trust\s*(?:>=|<=|>|<)\s*-?\d/i, 'relationship behavior remains semantic instead of reviving a deterministic threshold engine');
assert.doesNotMatch(`${moduleSource}\n${routerSource}`, /fateProgression|fate-inheritance|originLocks/, 'P2-PR06 must not depend on deferred PR #76');
assert.doesNotMatch(appSource, /npcCharacterBehavior|npc_character_behavior/, 'P2-PR06 must not add a save root');
assert.match(coreSource, /D11\. NPC는 현재 행동을 자기 기억·기존 판단·목표·관계·지식과 비교/);
assert.match(healthSource, /npcCharacterBehavior:/);

console.log('PASS P2-PR06 Character-driven NPC Behavior semantic learning, indirect emotion, relationship behavior, bounded routing, and no-new-engine invariants');
