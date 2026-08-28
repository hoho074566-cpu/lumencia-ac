#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  NPC_SIGNIFICANCE_VERSION,
  applyNpcSignificanceReceipt,
  deriveNpcSignificanceBoundary,
} from '../../lib/npc-significance.js';

const registry = { artemis: '아르테미스', emily: '에밀리', mirabelle: '미라벨' };

const boundary = deriveNpcSignificanceBoundary({
  candidateKeys: ['artemis', 'unknown', 'emily', 'artemis', 'mirabelle'],
  registry,
  mode: 'game',
  orchestration: { primary: 'user-action', secondary: 'world-response', max_drivers: 2 },
});
assert.equal(boundary.version, NPC_SIGNIFICANCE_VERSION);
assert.equal(boundary.mode, 'semantic');
assert.deepEqual(boundary.eligible_keys, ['artemis', 'emily', 'mirabelle'], 'only unique routed canonical candidates may reach semantic judgment');
assert.equal(boundary.primary_limit, 1);
assert.equal(boundary.support_limit, 1);

const modelTurn = { director: { spotlight_keys: ['artemis', 'unknown', 'emily', 'mirabelle'] } };
const receipt = applyNpcSignificanceReceipt(modelTurn, { boundary });
assert.deepEqual(modelTurn.director.spotlight_keys, ['artemis', 'emily'], 'the model owns ordering while code enforces routed membership and the 1+1 cap');
assert.equal(receipt.primary_key, 'artemis');
assert.equal(receipt.support_key, 'emily');
assert.deepEqual(receipt.significant_keys, ['artemis', 'emily']);
assert.deepEqual(receipt.rejected_keys, ['unknown', 'mirabelle'], 'unrouted and over-cap claims must fail closed');

const noForegroundTurn = { director: { spotlight_keys: [] } };
const noForeground = applyNpcSignificanceReceipt(noForegroundTurn, { boundary });
assert.equal(noForeground.primary_key, null, 'the semantic evaluator may decide that no NPC needs foreground attention');
assert.deepEqual(noForeground.significant_keys, []);

for (const frozen of [
  deriveNpcSignificanceBoundary({ candidateKeys: ['artemis'], registry, mode: 'continue', orchestration: { primary: 'frozen', max_drivers: 0 } }),
  deriveNpcSignificanceBoundary({ candidateKeys: ['artemis'], registry, mode: 'meta' }),
  deriveNpcSignificanceBoundary({ candidateKeys: ['artemis'], registry, mode: 'auto', orchestration: { primary: 'player-boundary', max_drivers: 0 } }),
]) {
  assert.equal(frozen.mode, 'freeze');
  assert.deepEqual(frozen.eligible_keys, []);
  const turn = { director: { spotlight_keys: ['artemis'] } };
  const frozenReceipt = applyNpcSignificanceReceipt(turn, { boundary: frozen });
  assert.deepEqual(turn.director.spotlight_keys, [], 'freeze modes must not create or advance NPC foreground state');
  assert.equal(frozenReceipt.primary_key, null);
}

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스, emily=에밀리, mirabelle=미라벨
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
const originalInput = '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}';
const routed = routeOpenAIParams(
  { instructions, input: originalInput },
  { incoming: {
    action: '에밀리에게 현재 상황을 묻는다.',
    saveState: {
      turnNumber: 8,
      world: { location: '학생회실' },
      pc: { name: '아리아', department: '기사과', skills: {}, skillCandidates: {} },
      sceneRuntime: { participants: ['artemis', 'emily', 'mirabelle'] },
      scheduleContext: { due: [], upcoming: [] },
    },
    recentTurns: [],
  }, mode: 'game' },
);
assert.equal(routed.telemetry.npc_significance_v1.version, NPC_SIGNIFICANCE_VERSION);
assert.equal(routed.telemetry.npc_significance_v1.mode, 'semantic');
assert.deepEqual(routed.telemetry.npc_significance_v1.eligible_keys, routed.telemetry.selected_npcs, 'the receipt boundary must use the same routed NPC authority');
assert.ok(routed.telemetry.npc_significance_v1.eligible_keys.includes('emily'), 'direct player focus must remain eligible for model judgment');
assert.doesNotMatch(routed.params.instructions, /NPC significance를 현재 행동|전면 primary와 직접 연결된 support|점수\/문구 매칭/,'significance acceptance vocabulary must not remain as a runtime writing checklist');
assert.match(routed.params.input, /"relevantNpcKeys":\[[^\]]*"emily"/s, 'the semantic model rule must receive the same bounded candidates in authoritative routed state');
assert.ok(routed.params.input.length <= 9000, `the semantic directive exceeded the stable routine input budget: ${routed.params.input.length}`);

const autoBoundary = routeOpenAIParams(
  { instructions, input: originalInput },
  { incoming: {
    action: '',
    saveState: {
      turnNumber: 8,
      world: { location: '학생회실' },
      pc: { name: '아리아', skills: {}, skillCandidates: {} },
      sceneRuntime: { participants: ['artemis'], turn_hook: { kind: 'player-choice', status: 'awaiting-player', anchor: '대답' } },
    },
    recentTurns: [],
  }, mode: 'auto' },
);
assert.equal(autoBoundary.telemetry.npc_significance_v1.mode, 'freeze', 'AUTO at a player-owned stop must not advance NPC significance');
assert.deepEqual(autoBoundary.telemetry.npc_significance_v1.eligible_keys, []);

const moduleSource = readFileSync('lib/npc-significance.js', 'utf8');
const adapterSource = readFileSync('api/chat-router.js', 'utf8');
const coreSource = readFileSync('api/chat.js', 'utf8');
const healthSource = readFileSync('api/health.js', 'utf8');
assert.doesNotMatch(moduleSource, /relationship.*[+*]|affinity.*[+*]|priority.*[+*]/i, 'V1 must not turn significance into a deterministic relationship/priority score');
assert.match(coreSource, /D10\. 장면을 쓰기 전.*NPC significance/);
assert.match(adapterSource, /npc_significance:npcSignificance/);
assert.match(healthSource, /npcSignificance:/);
assert.equal((adapterSource.match(/coreHandler\(/g) || []).length, 1, 'NPC Significance V1 must preserve one canonical model call');
assert.doesNotMatch(adapterSource, /sceneRuntime\.npc_significance|npcSignificanceState/, 'V1 must not add a persistence root or lifecycle state');

console.log('PASS NPC Significance Evaluator V1 semantic judgment, canonical bounds, sovereignty freezes, routing budget, and one-call invariants');
