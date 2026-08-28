#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const source = readFileSync('api/lib/context-router.js', 'utf8');
const adapter = readFileSync('api/chat-router.js', 'utf8');
const schemaSource = readFileSync('api/chat.js', 'utf8');
const rendererSource = readFileSync('app.js', 'utf8');
const hardContract = source.match(/const ROUTER_GM_RULES = String\.raw`([\s\S]*?)`;/)?.[1] || '';
const novelContract = source.match(/const NATURAL_STYLE = String\.raw`([\s\S]*?)`;/)?.[1] || '';
const combatContract = source.match(/const COMBAT_RULE = String\.raw`([\s\S]*?)`;/)?.[1] || '';
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
  'ordered sequence',
  '독립 보고·카드',
  '같은 Named NPC',
  'opening→environment/reaction→named action/dialogue',
  'dialogue continuation',
  'tease',
  '다음 meaningful state',
  '서로 끼어들고 반박',
  'Suggested Action',
  '시스템 사실·스킬·관계·손실',
  'canonical power gap',
  'Failure는 새 Story State',
  'physical exit',
  'world-native continuation',
]) assert.match(novelContract, new RegExp(marker));

for (const hardBoundary of [
  'USER ACTION 원문 전체',
  'AUTHORITATIVE SAVE_STATE',
  '날짜·계절·학년·학사 단계',
  'PUBLIC만 NPC 기본 지식',
  'state_delta에는 실제 변화만',
  '작은 변화는 점진적으로 누적',
  'event_progress는 현재 논리적 이벤트 occurrence',
  '짧은 영문 소문자 ID',
  'NPC significance',
]) assert.match(hardContract, new RegExp(hardBoundary));
assert.match(combatContract, /심리/, 'combat verdict must retain established psychological state');

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

function route(action, { recentTurns = [], savePatch = {} } = {}) {
  return routeOpenAIParams(
    { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
    { incoming: {
      action,
      saveState: {
        turnNumber: 12,
        world: { date: '1285-03-02', time: '11:20', location: '길드 접수실' },
        pc: { name: 'Ari', department: '기사과 1학년', status: '초기 기량평가 직후', skills: {}, skillCandidates: {} },
        sceneRuntime: { participants: ['artemis', 'lillia', 'sera'] },
        scheduleContext: { due: [], upcoming: [] },
        ...savePatch,
      },
      recentTurns,
    }, mode: 'game' },
  );
}

const broadAction = '주변을 둘러보다 12시까지 오리엔테이션 장소로 간다.';
const broad = route(broadAction);
assert.equal(broad.telemetry.enabled, true);
assert.ok(broad.params.input.includes(broadAction), 'broad USER ACTION must survive routing unchanged');
assert.match(broad.params.instructions, /NOVEL DIRECTOR V2/);
assert.match(broad.params.instructions, /SCENE COMPLETION > TURN COMPLETION/);
assert.match(broad.params.instructions, /학년·학사 단계/);
assert.match(broad.params.input, /"date":"1285-03-02"/);
assert.match(broad.params.input, /"department":"기사과 1학년"/);
assert.match(broad.params.input, /"status":"초기 기량평가 직후"/);
assert.match(broad.params.input, /NOVEL_OUTPUT=scene-first/);
assert.match(broad.params.input, /Purpose\/Exit\/Hook≠조기 종료\/choice/);
assert.doesNotMatch(broad.params.input, /EXIT_TARGET 뒤의 첫 판단점|EXIT_TARGET 뒤에 실제 판단/);
assert.ok(
  broad.params.input.lastIndexOf('NOVEL_OUTPUT=scene-first') > broad.params.input.lastIndexOf('===== STRONGER TURN HOOK V1 ====='),
  'the final action-adjacent authority must resolve late Exit/Hook pressure in favor of scene completion',
);

const restrictedAction = '문 앞에서 안쪽 소리만 듣는다. 문은 열지 않고 안으로 들어가지 않는다.';
const restricted = route(restrictedAction);
assert.ok(restricted.params.input.includes(restrictedAction), 'specific USER restriction must survive routing unchanged');
assert.match(restricted.params.instructions, /명시한 금지·거리·목적지·완료 조건은 넘지 않는다/);

const routineTransition = route('입학식 뒤 기숙사로 이동한다.');
assert.match(routineTransition.params.input, /ROUTINE→meaningful state/);
assert.match(routineTransition.params.input, /else choices=\[\]/);

const reactionScene = Array.from({ length: 8 }, (_, index) => ({
  kind: index % 2 ? 'dialogue' : 'narration',
  speaker_key: index % 2 ? 'artemis' : null,
  text: `recent-reaction-beat-${index + 1}`,
}));
const withRecentReactions = route('입학식 연설이 끝날 때까지 지켜본다.', {
  recentTurns: [{ action: '연설을 듣는다.', summary: '강당의 반응이 변했다.', importance: 'important', scene: reactionScene }],
});
const recentContext = withRecentReactions.params.input
  .split('===== RECENT SCENE/REACTION CONTEXT =====\n')[1]
  ?.split('\n\n===== CURRENT NPC/SCENE RUNTIME =====')[0] || '';
assert.match(withRecentReactions.params.input, /===== RECENT SCENE\/REACTION CONTEXT =====/);
assert.match(recentContext, /recent-reaction-beat-3/);
assert.match(recentContext, /recent-reaction-beat-8/);
assert.doesNotMatch(recentContext, /recent-reaction-beat-[12](?!\d)/, 'latest scene context must retain six ordered beats rather than the former final three');
assert.ok(
  withRecentReactions.params.input.indexOf('===== RECENT SCENE/REACTION CONTEXT =====') < withRecentReactions.params.input.indexOf('===== AUTHORITATIVE SAVE_STATE (ROUTED DETAIL) ====='),
  'recent reaction context must survive optional-context tail truncation ahead of detailed save data',
);

assert.match(schemaSource, /scene:\s*z\.array\(SceneItem\)\.min\(1\)\.max\(18\)/, 'structured output already permits a multi-beat scene');
assert.match(schemaSource, /turn\.importance === 'routine' \? 8 : turn\.importance === 'important' \? 14 : 18/, 'importance caps permit expanded important scenes without a new schema');
assert.match(rendererSource, /for \(const item of turn\.scene \|\| \[\]\)/, 'renderer preserves the ordered scene item sequence');

assert.equal((adapter.match(/coreHandler\(/g) || []).length, 1, 'Novel Director V2 must keep one canonical model call');
assert.doesNotMatch(source, /novelDirectorState|novel_director_receipt|prose_score|subtext_state/i, 'V2 must not add a narrative engine or persistence lifecycle');

console.log(`PASS Novel Director V2 lean AI contract (${previousCombinedFootprint} -> ${hardContract.length + novelContract.length} chars), USER ACTION safety, and one-call architecture`);
