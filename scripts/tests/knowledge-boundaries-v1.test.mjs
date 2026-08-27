#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  NPC_KNOWLEDGE_BOUNDARIES_VERSION,
  buildNpcKnowledgeBoundaryDirective,
  deriveNpcKnowledgeBoundary,
  sanitizeKnowledgeMemoryRows,
} from '../../lib/npc-knowledge-boundaries.js';

const registeredNpcKeys = ['artemis', 'emily'];
const saveState = {
  world: { location: '훈련장' },
  npcStates: {
    artemis: { location: '훈련장' },
    emily: { location: '교장실' },
  },
  sceneRuntime: { participants: ['artemis', 'unknown'] },
  pcKnowledge: ['PC만 확인한 봉인실 암호'],
  memories: {
    global: [
      { fact: '입학식 일정은 전교에 공지되었다.', importance: 3, secret_level: 0, source: '교내 공지', knowledge_basis: 'public' },
      { fact: '비공개 징계안', importance: 5, secret_level: 4, source: '교장 문서', knowledge_basis: 'public' },
      { fact: '출처 없는 공개 주장', importance: 2, secret_level: 0, source: null, knowledge_basis: 'public' },
      { fact: 'GM만 아는 장면 밖 결과', importance: 5, secret_level: 0, source: 'GM', knowledge_basis: 'private' },
    ],
    npc: {
      artemis: [{ fact: 'PC가 대련 약속을 지켰다.', importance: 4, source: '직접 목격', knowledge_basis: 'witnessed' }],
      emily: [{ fact: '교장실 금고의 위치', importance: 5, source: '본인', knowledge_basis: 'private' }],
    },
  },
};

const boundary = deriveNpcKnowledgeBoundary({
  saveState,
  npcKeys: ['artemis', 'unknown', 'emily', 'artemis'],
  registeredNpcKeys,
});
assert.equal(boundary.version, NPC_KNOWLEDGE_BOUNDARIES_VERSION);
assert.deepEqual(Object.keys(boundary.npcs), ['artemis', 'emily'], 'only routed canonical NPC keys may receive a boundary');
assert.deepEqual(boundary.present_npc_keys, ['artemis'], 'explicit scene participants are authoritative and unknown keys fail closed');
assert.equal(boundary.npcs.artemis.present, true);
assert.equal(boundary.npcs.emily.present, false, 'same-location fallback must not override an explicit participant list');
assert.deepEqual(boundary.npcs.artemis.owned_memory_refs.map((row) => row.fact), ['PC가 대련 약속을 지켰다.']);
assert.deepEqual(boundary.npcs.emily.owned_memory_refs.map((row) => row.fact), ['교장실 금고의 위치']);
assert.deepEqual(boundary.public_facts.map((row) => row.fact), ['입학식 일정은 전교에 공지되었다.'], 'only sourced low-secret explicitly public memories cross the public boundary');
assert.equal(boundary.pc_only_field, 'pcKnowledge');
assert.equal(boundary.pc_only_count, 1);

const emptyParticipants = deriveNpcKnowledgeBoundary({
  saveState: { ...saveState, sceneRuntime: { participants: [] } },
  npcKeys: registeredNpcKeys,
  registeredNpcKeys,
});
assert.deepEqual(emptyParticipants.present_npc_keys, [], 'an explicit empty participant list must not be replaced by location inference');

const locationFallback = deriveNpcKnowledgeBoundary({
  saveState: { ...saveState, sceneRuntime: {} },
  npcKeys: registeredNpcKeys,
  registeredNpcKeys,
});
assert.deepEqual(locationFallback.present_npc_keys, ['artemis'], 'legacy saves without a participant field may use bounded same-location fallback');

const currentTurnArrival = deriveNpcKnowledgeBoundary({
  saveState: { ...saveState, sceneRuntime: { participants: [] } },
  npcKeys: registeredNpcKeys,
  registeredNpcKeys,
  currentSceneNpcKeys: ['emily', 'unknown'],
});
assert.deepEqual(currentTurnArrival.present_npc_keys, ['emily'], 'a canonical NPC who actually appears in the current response remains an eligible witness/recipient');

const metaBoundary = deriveNpcKnowledgeBoundary({
  saveState,
  npcKeys: registeredNpcKeys,
  registeredNpcKeys,
  currentSceneNpcKeys: registeredNpcKeys,
  mode: 'meta',
});
assert.deepEqual(metaBoundary.present_npc_keys, [], 'META must not create witness or transfer eligibility');

const directive = buildNpcKnowledgeBoundaryDirective(boundary);
assert.match(directive, /BASIS=OWNED\|WITNESSED\|TOLD\|PUBLIC/);
assert.match(directive, /PC_ONLY=pcKnowledge/);
assert.match(directive, /PRESENT=CANDIDATE_NOT_PROOF/);
assert.match(directive, /artemis:P:npc:artemis:0/);
assert.match(directive, /emily:O:npc:emily:0/);

const sanitized = sanitizeKnowledgeMemoryRows([
  { owner: 'npc:artemis', fact: '직접 본 훈련', knowledge_basis: 'witnessed', source: '훈련장 목격', secret_level: 0 },
  { owner: 'npc:artemis', fact: 'PC가 전한 일정', knowledge_basis: 'told', source: 'PC의 직접 전달', secret_level: 1 },
  { owner: 'npc:emily', fact: '장면 밖 목격 주장', knowledge_basis: 'witnessed', source: '목격', secret_level: 0 },
  { owner: 'npc:artemis', fact: '출처 없는 전달', knowledge_basis: 'told', source: null, secret_level: 0 },
  { owner: 'global', fact: '공식 공지', knowledge_basis: 'public', source: '학생회 게시판', secret_level: 0 },
  { owner: 'npc:artemis', fact: '개인 기억의 공개 오표기', knowledge_basis: 'public', source: '아르테미스', secret_level: 0 },
  { owner: 'global', fact: '기밀의 공개 오표기', knowledge_basis: 'public', source: '봉인 문서', secret_level: 4 },
  { owner: 'global', fact: '출처 없는 공개 오표기', knowledge_basis: 'public', source: null, secret_level: 0 },
  { owner: 'global', fact: '세계 직접 목격 오표기', knowledge_basis: 'witnessed', source: '서술자', secret_level: 0 },
  { owner: 'npc:unknown', fact: '미등록 소유자', knowledge_basis: 'private', source: null, secret_level: 0 },
  { owner: 'pc', fact: 'PC 전용 지식', knowledge_basis: 'private', source: null, secret_level: 0 },
  { owner: 'npc:artemis', fact: '알 수 없는 provenance', knowledge_basis: 'invented', source: '불명', secret_level: 0 },
], { boundary, registeredNpcKeys });
assert.deepEqual(sanitized.rows.map((row) => row.fact), [
  '직접 본 훈련',
  'PC가 전한 일정',
  '공식 공지',
  '개인 기억의 공개 오표기',
  '기밀의 공개 오표기',
  '출처 없는 공개 오표기',
  '세계 직접 목격 오표기',
  '알 수 없는 provenance',
]);
assert.equal(sanitized.rows.find((row) => row.fact === '공식 공지').knowledge_basis, 'public');
for (const fact of ['개인 기억의 공개 오표기', '기밀의 공개 오표기', '출처 없는 공개 오표기', '세계 직접 목격 오표기', '알 수 없는 provenance']) {
  assert.equal(sanitized.rows.find((row) => row.fact === fact).knowledge_basis, 'private', `${fact} must fail closed to private`);
}
assert.equal(sanitized.rejected_count, 4, 'off-screen evidence, source-free transfer, unknown NPC, and PC pseudo-owner must be rejected');
assert.equal(sanitized.downgraded_count, 4);

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
  { mode: 'game', incoming: {
    action: '아르테미스에게 에밀리의 일정을 묻는다.',
    saveState: { ...saveState, turnNumber: 7, pc: { name: '아리아', skills: {}, skillCandidates: {} }, scheduleContext: { due: [], upcoming: [] } },
    recentTurns: [],
  } },
);
assert.equal(routed.telemetry.knowledge_boundaries_v1.version, NPC_KNOWLEDGE_BOUNDARIES_VERSION);
assert.equal(routed.telemetry.knowledge_boundaries_v1.present_count, 1);
assert.equal(routed.telemetry.knowledge_boundaries_v1.public_count, 1);
assert.equal(routed.telemetry.knowledge_boundaries_v1.pc_only_count, 1);
assert.match(routed.params.instructions, /자기 기억, 실제 직접 목격, 명시적으로 전달받은 내용, 공개 사실만 행동 근거/);
assert.match(routed.params.input, /===== NPC KNOWLEDGE BOUNDARIES V1 =====/);
assert.match(routed.params.input, /PC_ONLY=pcKnowledge/);
assert.match(routed.params.input, /artemis:P:npc:artemis:0/);
assert.match(routed.params.input, /입학식 일정은 전교에 공지되었다/);
assert.ok(routed.params.input.length <= 9000, `knowledge boundary exceeded the routine input budget: ${routed.params.input.length}`);
assert.ok(routed.params.input.lastIndexOf('===== USER ACTION =====') > routed.params.input.lastIndexOf('===== NPC KNOWLEDGE BOUNDARIES V1 ====='), 'USER ACTION must remain the final authority block');

const moduleSource = readFileSync('lib/npc-knowledge-boundaries.js', 'utf8');
const coreSource = readFileSync('api/chat.js', 'utf8');
const routerSource = readFileSync('api/lib/context-router.js', 'utf8');
const adapterSource = readFileSync('api/chat-router.js', 'utf8');
const healthSource = readFileSync('api/health.js', 'utf8');
assert.doesNotMatch(moduleSource, /RegExp|\.match\(|\.test\(/, 'Knowledge Boundaries V1 must not add a wording parser or regex');
assert.match(coreSource, /knowledge_basis: z\.enum\(\['witnessed','told','public','private'\]\)/);
assert.match(coreSource, /sanitizeKnowledgeMemoryRows\(normalizedMemories/);
assert.match(routerSource, /knowledge_boundaries_v1:/);
assert.match(adapterSource, /knowledge_boundaries_v1:true/);
assert.match(healthSource, /knowledgeBoundaries:/);
assert.equal((adapterSource.match(/coreHandler\(/g) || []).length, 1, 'V1 must preserve one canonical model call');
for (const source of [coreSource, routerSource, adapterSource]) {
  assert.doesNotMatch(source, /saveState\.knowledgeBoundaries|sceneRuntime\.knowledge_boundaries|knowledgeLifecycle/, 'V1 must not add a save root or generic lifecycle');
}

console.log('PASS Knowledge Boundaries V1 owned/witnessed/told/public evidence, private/off-screen fail-closed guards, routing budget, freeze, and one-call invariants');
