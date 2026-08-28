#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const source = readFileSync('api/lib/context-router.js', 'utf8');
const adapter = readFileSync('api/chat-router.js', 'utf8');
const hardContract = source.match(/const ROUTER_GM_RULES = String\.raw`([\s\S]*?)`;/)?.[1] || '';
const novelContract = source.match(/const NATURAL_STYLE = String\.raw`([\s\S]*?)`;/)?.[1] || '';
const previousCombinedFootprint = 5254;

assert.ok(hardContract && novelContract, 'the routed hard and narrative contracts must both exist');
assert.ok(
  hardContract.length + novelContract.length <= previousCombinedFootprint - 1000,
  'Novel Director V2 must replace/consolidate prompt rules and save at least 1,000 chars',
);
assert.equal((novelContract.match(/SCENE COMPLETION > TURN COMPLETION/g) || []).length, 1);
for (const marker of [
  'User Specificity',
  'Soft hook',
  'hard interruption',
  '행동→감각/결과→반응',
  '서로 끼어들고 반박하고 정리',
  '시스템 사실·스킬·관계·손실',
  '관찰→가설→정밀한 단서',
  'Failure는 retry가 아니라 새 Story State',
  'physical exit',
  'world-native continuation',
]) assert.match(novelContract, new RegExp(marker));

for (const hardBoundary of [
  'USER ACTION 원문 전체',
  'AUTHORITATIVE SAVE_STATE',
  'PUBLIC만 NPC 기본 지식',
  'state_delta에는 실제 변화만',
  'event_progress는 현재 논리적 이벤트 occurrence',
  'NPC significance',
]) assert.match(hardContract, new RegExp(hardBoundary));

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스, lillia=릴리아, sera=세라
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Academy facts.
===== NPC CANON =====
${divider}
NPC RULES
${divider}
Character facts.
===== NPC SPEECH =====
${divider}
NPC SPEECH
${divider}
Character voices.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve declared actions.`;

function route(action) {
  return routeOpenAIParams(
    { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
    { incoming: {
      action,
      saveState: {
        turnNumber: 12,
        world: { date: '1285-03-02', time: '11:20', location: '길드 접수실' },
        pc: { name: 'Ari', department: '기사과', skills: {}, skillCandidates: {} },
        sceneRuntime: { participants: ['artemis', 'lillia', 'sera'] },
        scheduleContext: { due: [], upcoming: [] },
      },
      recentTurns: [],
    }, mode: 'game' },
  );
}

const broadAction = '주변을 둘러보다 12시까지 오리엔테이션 장소로 간다.';
const broad = route(broadAction);
assert.equal(broad.telemetry.enabled, true);
assert.ok(broad.params.input.includes(broadAction), 'broad USER ACTION must survive routing unchanged');
assert.match(broad.params.instructions, /NOVEL DIRECTOR V2/);
assert.match(broad.params.instructions, /SCENE COMPLETION > TURN COMPLETION/);

const restrictedAction = '문 앞에서 안쪽 소리만 듣는다. 문은 열지 않고 안으로 들어가지 않는다.';
const restricted = route(restrictedAction);
assert.ok(restricted.params.input.includes(restrictedAction), 'specific USER restriction must survive routing unchanged');
assert.match(restricted.params.instructions, /명시한 금지·거리·목적지·완료 조건은 넘지 않는다/);

assert.equal((adapter.match(/coreHandler\(/g) || []).length, 1, 'Novel Director V2 must keep one canonical model call');
assert.doesNotMatch(source, /novelDirectorState|novel_director_receipt|prose_score|subtext_state/i, 'V2 must not add a narrative engine or persistence lifecycle');

console.log(`PASS Novel Director V2 lean AI contract (${previousCombinedFootprint} -> ${hardContract.length + novelContract.length} chars), USER ACTION safety, and one-call architecture`);
