#!/usr/bin/env node

import assert from 'node:assert/strict';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
guide=Guide
===== WORLD CANON =====
${divider}
PUBLIC ACADEMY
${divider}
Public location facts.

${divider}
L5 SECRET ARCHIVE
${divider}
PRIVATE_TEST_MARKER
===== NPC CANON =====
${divider}
Guide
${divider}
Helpful guide.
===== NPC SPEECH =====
${divider}
Guide
${divider}
Brief speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC ACTION RULES
${divider}
Resolve declared actions.`;

function route(action, extra = {}) {
  const incoming = {
    action,
    saveState: { turnNumber: 3, world: { location: 'academy' }, ...extra.saveState },
    recentTurns: [],
    ...extra,
  };
  return routeOpenAIParams(
    { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
    { incoming, mode: 'game' },
  );
}

const cases = [
  ['committed movement', '나는 도서관으로 이동한다.', 'routine-17k-v154'],
  ['committed important movement', '나는 적을 추적해서 기숙사로 이동한다.', 'important-20k-v154'],
  ['non-committed movement question', '적을 추적하면 어디로 이동하게 될까?', 'routine-17k-v154'],
  ['hypothetical', '만약 적을 공격한다면 어떻게 될까?', 'routine-17k-v154'],
  ['negation', '적을 공격하지 않고 기다린다.', 'routine-17k-v154'],
  ['mixed committed sentence', '마신에 대해 아는 게 없지만, 마신을 찾으러 이동한다.', 'critical-24k-v154'],
];

for (const [name, action, expectedProfile] of cases) {
  const result = route(action);
  assert.equal(result.telemetry.enabled, true, `${name}: router should be enabled`);
  assert.equal(result.telemetry.profile, expectedProfile, `${name}: classification changed`);
  assert.match(result.params.input, /===== USER ACTION =====/, `${name}: action block missing`);
  assert.ok(result.params.input.includes(action), `${name}: original action was not retained`);
}

const oversizedAction = `나는 북문으로 이동한다. ${'계속 전진한다. '.repeat(1800)}`;
const oversized = route(oversizedAction, { rollingSummary: 'old context '.repeat(3000) });
assert.ok(oversized.params.input.includes(oversizedAction), 'oversized USER ACTION must be retained verbatim');
assert.ok(oversized.params.input.indexOf('===== USER ACTION =====') > 0, 'variable context should precede USER ACTION');

const continueAction = `[LUMENSIA V1.5.4 CONTINUE]\n${'직전 장면의 같은 순간을 이어 쓴다. '.repeat(120)}`;
const continuedRouted = routeOpenAIParams(
  { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming: { action: continueAction, saveState: {}, recentTurns: [], rollingSummary: 'optional '.repeat(10000) }, mode: 'continue' },
);
assert.equal(continuedRouted.telemetry.profile, 'continue-11k-v154', 'CONTINUE profile must remain selected');
assert.equal(continuedRouted.telemetry.target_input_tokens, 11000, 'CONTINUE target budget changed');
assert.equal(continuedRouted.telemetry.soft_max_tokens, 14000, 'CONTINUE soft maximum changed');
assert.match(continuedRouted.params.input, /===== USER ACTION =====\n\[LUMENSIA V1\.5\.4 CONTINUE\]/, 'routed CONTINUE marker is missing');
assert.ok(continuedRouted.params.input.includes(continueAction), 'complete synthetic CONTINUE action must survive optional-context truncation');

const secretQuestion = route('L5 비밀 기록은 무엇인가요?');
assert.equal(secretQuestion.telemetry.secret_allowed, false, 'a question must not unlock secret routing');
assert.equal(secretQuestion.params.instructions.includes('PRIVATE_TEST_MARKER'), false, 'secret block leaked into a question');

const publicTurn = route('도서관으로 이동한다.');
assert.equal(publicTurn.telemetry.secret_allowed, false, 'ordinary movement must not unlock secret routing');
assert.equal(publicTurn.params.instructions.includes('PRIVATE_TEST_MARKER'), false, 'secret block leaked into ordinary context');

const crowdedInstructions = instructions.replace('guide=Guide', 'p1=One, p2=Two, p3=Three, p4=Four, p5=Five');
const crowded = routeOpenAIParams(
  { instructions:crowdedInstructions, input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming:{ action:'기다린다.', saveState:{turnNumber:3,world:{location:'academy'},sceneRuntime:{participants:['p1','p2','p3','p4','p5']}}, recentTurns:[{scene:[{kind:'dialogue',speaker_key:'p5',text:'말한다.'}]}] }, mode:'game' },
);
assert.equal(crowded.telemetry.selected_npcs[0], 'p5', 'latest authoritative speaker must be prioritized before truncation');
assert.equal(crowded.telemetry.selected_npcs.includes('p5'), true, 'latest authoritative speaker was dropped from a crowded scene');

const addressed = routeOpenAIParams(
  { instructions:crowdedInstructions, input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming:{ action:'p5에게 직접 질문한다.', saveState:{turnNumber:3,world:{location:'academy'},sceneRuntime:{participants:['p1','p2','p3','p4']}}, recentTurns:[] }, mode:'game' },
);
assert.equal(addressed.telemetry.selected_npcs.includes('p5'), true, 'action-mentioned canonical NPC must be selected before lower-priority participants');
assert.equal(addressed.telemetry.selected_npcs.length, 4, 'action priority must preserve the context NPC cap');

console.log(`PASS context router regressions (${cases.length + 13} checks)`);
