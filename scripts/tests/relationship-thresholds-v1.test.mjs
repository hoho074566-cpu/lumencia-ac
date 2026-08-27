#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  RELATIONSHIP_THRESHOLDS_VERSION,
  applyRelationshipThresholdReceipts,
  deriveRelationshipThresholdContext,
} from '../../lib/relationship-thresholds.js';

const registeredNpcKeys = ['artemis'];
const change = (patch = {}) => ({
  npc_key: 'artemis',
  affinity_delta: 0,
  trust_delta: 0,
  status: null,
  reason: '실제 공동 사건의 결과',
  cause: '약속을 지켰다.',
  expression: '아르테미스가 판단을 달리했다.',
  followup: '다음에는 제한된 정보를 공유할 수 있다.',
  threshold_signal: 'none',
  ...patch,
});
const turnWith = (row) => ({ state_delta: { relationship_changes: [row] } });
const apply = (row, options = {}) => {
  const turn = turnWith(row);
  const result = applyRelationshipThresholdReceipts(turn, { registeredNpcKeys, turnNumber: 12, ...options });
  return { turn, result };
};

const eligibleTrust = deriveRelationshipThresholdContext({ relationship: { affinity: 4, trust: 31 } });
assert.equal(eligibleTrust.version, RELATIONSHIP_THRESHOLDS_VERSION);
assert.equal(eligibleTrust.trust_active, false);
assert.deepEqual(eligibleTrust.eligible_signals, ['trust_opened'], 'the hard boundary may make trust semantically eligible without activating it');

const activeTrust = { relationship_thresholds: { version: RELATIONSHIP_THRESHOLDS_VERSION, trust_active: true, hostility_active: false } };
assert.deepEqual(
  deriveRelationshipThresholdContext({ relationship: { affinity: 5, trust: 29 }, innerState: activeTrust }).eligible_signals,
  [],
  'hysteresis must keep an established threshold stable inside the release band',
);
assert.deepEqual(
  deriveRelationshipThresholdContext({ relationship: { affinity: 5, trust: 19 }, innerState: activeTrust }).eligible_signals,
  ['trust_withdrawn'],
  'a real release-bound crossing may become eligible for semantic withdrawal',
);

const minor = apply(change({ trust_delta: 1, threshold_signal: 'trust_opened' }), { relationships: { artemis: { affinity: 0, trust: 10 } } });
assert.equal(minor.turn.state_delta.relationship_changes[0].threshold_signal, 'none', 'a minor below-boundary change must fail closed');
assert.equal(minor.result.accepted_count, 0);
assert.equal(minor.result.rejected_count, 1);
assert.deepEqual(minor.result.npc_updates, {});

const modelDeclines = apply(change({ trust_delta: 3, threshold_signal: 'none' }), { relationships: { artemis: { affinity: 4, trust: 28 } } });
assert.equal(modelDeclines.result.accepted_count, 0, 'crossing numeric eligibility must never auto-activate a semantic threshold');
assert.deepEqual(modelDeclines.result.npc_updates, {});

const trustOpened = apply(change({ trust_delta: 4, threshold_signal: 'trust_opened' }), { relationships: { artemis: { affinity: 4, trust: 28 } } });
assert.equal(trustOpened.result.accepted_count, 1);
assert.equal(trustOpened.result.transitions[0].signal, 'trust_opened');
assert.equal(trustOpened.result.npc_updates.artemis.relationship_thresholds.trust_active, true);
assert.equal(trustOpened.result.npc_updates.artemis.relationship_thresholds.hostility_active, false);
assert.equal(trustOpened.result.npc_updates.artemis.relationship_thresholds.followup, '다음에는 제한된 정보를 공유할 수 있다.');

const noFollowup = apply(change({ trust_delta: 4, followup: null, threshold_signal: 'trust_opened' }), { relationships: { artemis: { trust: 28 } } });
assert.equal(noFollowup.result.accepted_count, 0, 'a threshold receipt without a concrete future behavior candidate must fail closed');

const duplicateActive = apply(change({ trust_delta: 2, threshold_signal: 'trust_opened' }), {
  relationships: { artemis: { affinity: 5, trust: 35 } },
  npcInnerStates: { artemis: activeTrust },
});
assert.equal(duplicateActive.result.accepted_count, 0, 'an already active threshold is not a new crossing');

const trustWithdrawn = apply(change({ trust_delta: -4, threshold_signal: 'trust_withdrawn', followup: '개인적 정보 공유를 중단한다.' }), {
  relationships: { artemis: { affinity: 5, trust: 22 } },
  npcInnerStates: { artemis: activeTrust },
});
assert.equal(trustWithdrawn.result.npc_updates.artemis.relationship_thresholds.trust_active, false);

const hostilityOpened = apply(change({ affinity_delta: -4, threshold_signal: 'hostility_opened', followup: '공개적으로 거리를 두고 경계한다.' }), {
  relationships: { artemis: { affinity: -28, trust: 0 } },
});
assert.equal(hostilityOpened.result.accepted_count, 1);
assert.equal(hostilityOpened.result.npc_updates.artemis.relationship_thresholds.hostility_active, true);

const activeHostility = { relationship_thresholds: { version: RELATIONSHIP_THRESHOLDS_VERSION, trust_active: false, hostility_active: true } };
const hostilityEased = apply(change({ affinity_delta: 5, threshold_signal: 'hostility_eased', followup: '노골적인 방해 대신 신중한 관찰로 물러선다.' }), {
  relationships: { artemis: { affinity: -22, trust: -5 } },
  npcInnerStates: { artemis: activeHostility },
});
assert.equal(hostilityEased.result.npc_updates.artemis.relationship_thresholds.hostility_active, false);

const unknown = apply(change({ trust_delta: 4, threshold_signal: 'instant_best_friend' }), { relationships: { artemis: { trust: 28 } } });
assert.equal(unknown.turn.state_delta.relationship_changes[0].threshold_signal, 'none', 'unknown semantic states must fail closed');
assert.equal(unknown.result.rejected_count, 1);

const unregistered = applyRelationshipThresholdReceipts(turnWith(change({ npc_key: 'unknown', trust_delta: 4, threshold_signal: 'trust_opened' })), {
  relationships: { unknown: { trust: 28 } },
  registeredNpcKeys,
  mode: 'game',
});
assert.equal(unregistered.accepted_count, 0, 'unregistered NPC ownership must fail closed');

for (const mode of ['meta', 'auto', 'continue']) {
  const frozen = apply(change({ trust_delta: 4, threshold_signal: 'trust_opened' }), {
    relationships: { artemis: { trust: 28 } },
    mode,
  });
  assert.equal(frozen.result.frozen, true);
  assert.equal(frozen.result.accepted_count, 0);
  assert.equal(frozen.turn.state_delta.relationship_changes[0].threshold_signal, 'none', `${mode} must freeze threshold mutation`);
}

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스
===== WORLD CANON =====
${divider}\nPUBLIC\n${divider}\nPublic facts.
===== NPC CANON =====
${divider}\nNPC RULES\n${divider}\nCanon.
===== NPC SPEECH =====
${divider}\nNPC SPEECH\n${divider}\nSpeech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}\nPC RULES\n${divider}\nResolve.`;
const routed = routeOpenAIParams(
  { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming: {
    action: '아르테미스에게 약속한 기록을 건넨다.',
    saveState: {
      turnNumber: 11,
      world: { location: '학생회실' },
      pc: { name: '카일', skills: {}, skillCandidates: {} },
      relationships: { artemis: { affinity: 12, trust: 31, status: '신중한 신뢰', history: ['약속을 지켰다.'] } },
      npcInnerStates: { artemis: { relationship_thresholds: { version: RELATIONSHIP_THRESHOLDS_VERSION, trust_active: false, hostility_active: false } } },
      sceneRuntime: { participants: ['artemis'] },
      scheduleContext: { due: [], upcoming: [] },
    },
    recentTurns: [],
  }, mode: 'game' },
);
assert.equal(routed.telemetry.relationship_thresholds_v1.version, RELATIONSHIP_THRESHOLDS_VERSION);
assert.equal(routed.telemetry.relationship_thresholds_v1.count, 1);
assert.match(routed.params.input, /"relationshipThresholds":\{"artemis":\{[^}]*"eligible_signals":\["trust_opened"\]/s, 'bounded threshold context must survive in routed minimum state');
assert.match(routed.params.instructions, /relationship threshold는 작은 수치 변화마다 태도를 뒤집는 단계표가 아니다/);
assert.match(routed.params.instructions, /eligible_signals는 hard eligibility일 뿐 자동 발동이 아니며/);
assert.match(routed.params.instructions, /즉시 사건이나 PC 선택을 강제하지 않는다/);
assert.ok(routed.params.input.length <= 9000, `Relationship Thresholds V1 exceeded the stable routine input budget: ${routed.params.input.length}`);

const moduleSource = readFileSync('lib/relationship-thresholds.js', 'utf8');
const adapterSource = readFileSync('api/chat-router.js', 'utf8');
const coreSource = readFileSync('api/chat.js', 'utf8');
const contextSource = readFileSync('api/lib/context-router.js', 'utf8');
const healthSource = readFileSync('api/health.js', 'utf8');
assert.doesNotMatch(moduleSource, /RegExp|\.match\(|\.test\(/, 'V1 must not add a wording classifier or regex');
assert.match(coreSource, /threshold_signal: z\.enum\(\['none','trust_opened','trust_withdrawn','hostility_opened','hostility_eased'\]\)/);
assert.match(coreSource, /AUTO\/META\/CONTINUE에서는 none/);
assert.match(contextSource, /relationship_thresholds_v1:built\.relationshipThresholds/);
assert.match(adapterSource, /relationship_thresholds:relationshipThresholds/);
assert.match(adapterSource, /localNpcUpdates\(incoming0,runtimeTurn\)/);
assert.match(adapterSource, /Object\.entries\(object\(relationshipThresholds\.npc_updates\)\)/);
assert.match(healthSource, /relationshipThresholds:/);
assert.equal((adapterSource.match(/coreHandler\(/g) || []).length, 1, 'Relationship Thresholds V1 must preserve one canonical model call');
assert.doesNotMatch(adapterSource, /sceneRuntime\.relationship_threshold|relationshipLifecycle/, 'V1 must not create a save root or lifecycle engine');

console.log('PASS Relationship Thresholds V1 semantic receipts, bounded eligibility, hysteresis, freeze, routing, and one-call invariants');
