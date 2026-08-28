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
const previousCombinedFootprint = 4246;

assert.ok(hardContract && novelContract, 'the routed hard and narrative contracts must both exist');
assert.ok(
  hardContract.length + novelContract.length <= 2300,
  'Novel Director Diet must cut the prior 4k contract nearly in half without dropping hard facts',
);
for (const marker of [
  'serialized fantasy novel',
  'not an RPG turn report',
  'natural stopping point',
  'Compress routine process',
  'ordinary execution of the action',
  'never invent a new player intention',
  'immutable',
  'Do not explain a beat before playing it',
  'control composition only',
  'Never paraphrase them as character dialogue',
]) assert.match(novelContract, new RegExp(marker));
for (const removedMicromanagement of [
  'Reaction Field', 'Subtext', 'Conversation in Motion', 'Progressive Attrition', 'CHARACTER MUST SURVIVE FUNCTION',
  'DEPTH > DISTANCE', 'HARD_DECISION', 'physical opening', 'gesture/silence/reaction', 'Failure의 손실은 Story State',
]) assert.doesNotMatch(novelContract, new RegExp(removedMicromanagement));

for (const hardBoundary of [
  'USER ACTION은 사용자가 이미 고른 행동',
  '일상적 신체 동작·필요한 이동·즉각 결과',
  '새로운 PC 의도·목표·대사·감정',
  'AUTHORITATIVE SAVE_STATE',
  '날짜·계절·학년·학기·졸업·장기 progression',
  'PUBLIC만 기본 지식',
  'state_delta에는 실제 발생한 변화만',
  'event_progress는 현재 occurrence',
  '실제로 새로운 PC 결정을 요구',
]) assert.match(hardContract, new RegExp(hardBoundary));
assert.match(combatContract, /심리/, 'combat verdict must retain established psychological state');

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스, emily=에밀리, elena=엘레나, lena=레나, lillia=릴리아, laris=라리스, sera=세라, serena=세레나, isabel=이사벨, mirabelle=미라벨
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
${divider}
ELENA 엘레나
${divider}
Elena collision signal must not route for Lena.
${divider}
EMILY 에밀리
${divider}
Emily leads the academy and gives the entrance welcome speech.
${divider}
LENA 레나
${divider}
Lena is the incoming student representative.
${divider}
SERENA 세레나
${divider}
Serena collision signal must not route for Lena.
${divider}
MIRABELLE 미라벨
${divider}
Mirabelle is a theology student who approaches practical care with quiet precision.
===== NPC SPEECH =====
${divider}
NPC SPEECH
${divider}
Character voices.
${divider}
ELENA SPEECH 엘레나
${divider}
Elena collision voice must not route for Lena.
${divider}
EMILY SPEECH 에밀리
${divider}
Emily speaks warmly and with institutional authority.
${divider}
LENA SPEECH 레나
${divider}
Lena speaks clearly but carries first-day tension.
${divider}
SERENA SPEECH 세레나
${divider}
Serena collision voice must not route for Lena.
${divider}
MIRABELLE SPEECH 미라벨
${divider}
Mirabelle speaks sparingly and notices concrete physical details before offering help.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve declared actions.
${divider}
11. 플레이어 주권
${divider}
상황, NPC 반응, 결과와 선택 가능한 환경만 제시한다.`;

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
assert.match(broad.params.instructions, /serialized fantasy novel/);
assert.match(broad.params.instructions, /날짜·계절·학년·학기·졸업·장기 progression/);
assert.match(broad.params.input, /"date":"1285-03-02"/);
assert.match(broad.params.input, /"department":"기사과 1학년"/);
assert.match(broad.params.input, /"status":"초기 기량평가 직후"/);
assert.match(broad.params.input, /===== HARD EXECUTION FACTS \(DATA, NOT FICTION\) =====/);
assert.ok(broad.params.input.endsWith(`===== USER ACTION (EXACT) =====\n${broadAction}`), 'USER ACTION must be the exact final block');
for (const removedRuntimeBlock of [
  'MULTI-SYSTEM SCENE ORCHESTRATION', 'SCENE MOMENTUM HF1', 'DETERMINISTIC SCENE NOVELTY',
  'SCENE PURPOSE V1', 'EXPLICIT SCENE EXIT CONDITION', 'STRONGER TURN HOOK',
  'GM EVENT DIRECTOR (ROUTED)', 'EVENT DIRECTOR V2.1 (ROUTED)',
]) assert.doesNotMatch(broad.params.input, new RegExp(removedRuntimeBlock));

const restrictedAction = '문 앞에서 안쪽 소리만 듣는다. 문은 열지 않고 안으로 들어가지 않는다.';
const restricted = route(restrictedAction);
assert.ok(restricted.params.input.includes(restrictedAction), 'specific USER restriction must survive routing unchanged');
assert.ok(restricted.params.input.endsWith(restrictedAction));

const routineTransition = route('입학식 뒤 기숙사로 이동한다.');
assert.match(routineTransition.params.input, /"intent_kind":"travel"/);
assert.doesNotMatch(routineTransition.params.input, /ROUTINE→SCENE_THRESHOLD|HARD_DECISION_ONLY/);

const entranceEvent = {
  id: 'entrance_ceremony', title: '입학식', date: '1285-03-01', time: '09:00',
  location: '루멘시아 아카데미 대강당', kind: 'academic', participants: ['emily', 'lena'],
  importance: 4, note: '09:00 에밀리 환영사. 09:15 레나 신입생 대표 연설.', status: 'scheduled',
};
const laterOrientationEvent = {
  id: 'knight_orientation', title: '기사과 1학년 오리엔테이션', date: '1285-03-01', time: '12:00',
  location: '기사과 지정 오리엔테이션 장소', kind: 'academic', participants: ['artemis', 'lillia', 'sera'],
  importance: 3, note: '기사과 1학년 대상.', status: 'scheduled',
};
const openingAction = '게임을 시작한다. 입학식에 오전 9시에 참석한다.';
const opening = route(openingAction, { savePatch: {
  turnNumber: 0,
  world: { date: '1285-03-01', weekday: '월요일', time: '08:40', location: '루멘시아 아카데미 대강당 앞' },
  pc: { name: 'Ari', department: '기사과 1학년', status: '입학식 전', skills: {}, skillCandidates: {} },
  sceneRuntime: { participants: [] },
  scheduledEvents: [entranceEvent, laterOrientationEvent],
  scheduleContext: {
    due: [], upcoming: [entranceEvent, laterOrientationEvent],
    npc_schedule: {
      emily: { commitment: '09:00 환영사', area: '대강당', confidence: 'fixed' },
      lena: { commitment: '09:00 입학식 참석', area: '대강당 일대', confidence: 'fixed' },
    },
  },
} });
assert.equal(opening.telemetry.profile, 'scheduled-18k-v154', 'an explicitly requested major upcoming event must receive scheduled scene space');
assert.deepEqual(opening.telemetry.selected_npcs, ['emily', 'lena'], 'the requested event participants must become canonical scene context');
assert.equal(opening.telemetry.event_director_v2?.result, 'REQUESTED_SCHEDULE_FIXED_FLOW', 'the requested event must outrank a random routine encounter');
assert.equal(opening.telemetry.scene_orchestration?.secondary, 'none', 'current-scene NPC/world reactions must stay inside the primary scene instead of forcing a second world-response driver');
assert.equal(opening.telemetry.scene_orchestration?.max_drivers, 1, 'one requested opening scene must not be treated as multiple schedule drivers');
assert.match(opening.params.instructions, /Emily leads the academy/);
assert.match(opening.params.instructions, /Lena is the incoming student representative/);
assert.doesNotMatch(opening.params.instructions, /Elena collision|Serena collision/, 'selected NPC names must match whole title names instead of routing Elena/Serena for Lena');
assert.doesNotMatch(opening.params.instructions, /11\. 플레이어 주권|선택 가능한 환경만 제시/, 'the obsolete report-only sovereignty block must be consolidated into the hard authority contract');
assert.doesNotMatch(opening.params.input, /===== CHARACTER-DRIVEN NPC BEHAVIOR V1 =====/, 'fresh NPCs with no goal, relationship, emotion, memory, or judgment must not spend context on empty profiles');
assert.match(opening.params.input, /"participants":\["emily","lena"\]/);
assert.match(opening.params.input, /"scheduled_start_offset_minutes":20/);
assert.doesNotMatch(opening.params.input, /"schedule_boundary_minutes":20(?:,|})/, 'attending the requested entrance ceremony must not stop before that same ceremony');
assert.doesNotMatch(opening.params.input, /knight_orientation|기사과 1학년 오리엔테이션/, 'later schedule items must remain boundaries outside the active requested scene instead of becoming narrative tasks');

const deepCurrentScene = route('강당의 반응을 지켜본다.', { savePatch: {
  world: { date: '1285-03-01', weekday: '월요일', time: '09:05', location: '루멘시아 아카데미 대강당' },
  sceneRuntime: { participants: ['emily', 'lena'] },
  scheduledEvents: [laterOrientationEvent],
  scheduleContext: { due: [], upcoming: [laterOrientationEvent] },
} });
assert.doesNotMatch(deepCurrentScene.params.input, /knight_orientation|기사과 1학년 오리엔테이션/, 'an unrelated future schedule must not pull an active important scene into distance-first reporting');

const waitForOrientation = route('정오 오리엔테이션까지 기다린다.', { savePatch: {
  world: { date: '1285-03-01', weekday: '월요일', time: '10:00', location: '1학년 A동 기숙사' },
  sceneRuntime: { participants: [] },
  scheduledEvents: [laterOrientationEvent],
  scheduleContext: { due: [], upcoming: [laterOrientationEvent] },
} });
assert.match(waitForOrientation.params.input, /"schedule_boundary_minutes":120/, 'an already-chosen wait intent must retain its next hard schedule boundary without duplicating administrative content');

const mentorBoundary = {
  id: 'mentor_meeting', title: '에밀리와 사전 면담', date: '1285-03-01', time: '09:30',
  location: '본관 응접실', kind: 'personal', participants: ['emily'], pc_required: true, status: 'scheduled',
};
const requestedClass = {
  id: 'basic_class', title: '기사과 기초 수업', date: '1285-03-01', time: '10:00',
  location: '기사과 강의실', kind: 'academic', participants: ['artemis', 'lillia', 'laris', 'sera', 'isabel'], status: 'scheduled',
};
const afterClass = {
  id: 'after_class_drill', title: '오후 자율 훈련', date: '1285-03-01', time: '13:00',
  location: '기사과 연무장', kind: 'academic', participants: ['lillia'], status: 'scheduled',
};
const boundedRequestedClass = route('이사벨과 10시에 기사과 기초 수업에 참석한다.', { savePatch: {
  world: { date: '1285-03-01', time: '09:00', location: '기숙사' },
  sceneRuntime: { participants: [] },
  scheduledEvents: [mentorBoundary, requestedClass, afterClass],
  scheduleContext: { due: [], upcoming: [mentorBoundary, requestedClass, afterClass] },
} });
assert.deepEqual(boundedRequestedClass.telemetry.selected_npcs.slice(0, 2), ['isabel', 'emily'], 'explicit USER ACTION and the immediate boundary participant must outrank requested-event bulk participants');
assert.match(boundedRequestedClass.params.input, /"schedule_boundary_minutes":30/, 'the earlier PC appointment must remain the deterministic stop boundary');
assert.match(boundedRequestedClass.params.input, /mentor_meeting/);
assert.match(boundedRequestedClass.params.input, /본관 응접실/);
assert.match(boundedRequestedClass.params.input, /"participants":\["emily"\]/, 'the intervening boundary participant must retain routed character authority');
assert.match(boundedRequestedClass.params.input, /basic_class/);
assert.doesNotMatch(boundedRequestedClass.params.input, /after_class_drill|오후 자율 훈련/, 'schedule rows after the requested occurrence must not become narrative tasks');
assert.match(rendererSource, /sendAction\('게임을 시작한다\. 입학식에 오전 9시에 참석한다\.'\)/, 'the first-scene button must express event attendance rather than ask for an 08:40 state report');
assert.match(rendererSource, /레나 신입생 대표의 짧은 연설\. 이후 교직원이 기숙사와 정오 학과 오리엔테이션을 안내/, 'the canonical schedule must not assign the staff notice to Lena');
assert.doesNotMatch(rendererSource, /레나 신입생 대표 짧은 연설과 기숙사\/정오 학과 오리엔테이션 안내/, 'the ambiguous administrative Lena role must be removed');

const seraCharacterSignal = route('세라와 함께 기숙사 복도를 걷는다.', { savePatch: {
  world: { date: '1285-03-01', time: '10:10', location: '1학년 A동 기숙사 복도' },
  sceneRuntime: { participants: ['sera'] },
  relationships: { sera: { affinity: 2, trust: 1, status: '경계', history: ['서로 이름을 확인했다.'] } },
  npcInnerStates: { sera: {
    active_goal: { desire: '정오 일정 전에 자기 짐과 장비를 확인한다.', state: 'active', progress: 20, next_actions: ['낡은 검의 상태를 살핀다.'] },
    social_stance: '손익을 먼저 재는 현실주의자',
    wants_from_pc: '불필요하게 간섭하지 않는지 확인한다.',
  } },
  emotionStates: { sera: { current: 'wary', intensity: 0.4, reason: '아직 서로를 잘 모른다.' } },
  memories: { npc: { sera: [{ type: 'observer', subject: 'pc', fact: '복도에서 먼저 거리를 지켰다.', turn: 11, confidence: 0.7, source: '직접 목격' }] } },
} });
assert.match(seraCharacterSignal.params.input, /===== ACTIVE NPC SIGNAL \(READ-ONLY FACTS\) =====/);
assert.match(seraCharacterSignal.params.input, /자기 짐과 장비를 확인한다/);
assert.match(seraCharacterSignal.params.input, /손익을 먼저 재는 현실주의자/);
assert.doesNotMatch(seraCharacterSignal.params.input, /같은 유형의 수행은 횟수만 세지 말고|내부 감정을 대사로 그대로 읽지 않는다/);

const unseenGeneralization = route('미라벨과 온실 옆 약초 건조실에서 표본 상태를 기다리며 대화한다.', { savePatch: {
  world: { date: '1285-03-08', time: '16:20', location: '신학부 약초 건조실' },
  sceneRuntime: { participants: ['mirabelle'] },
  npcInnerStates: { mirabelle: {
    active_goal: { desire: '변색된 약초 표본이 치료용으로 안전한지 확인한다.', state: 'active', progress: 40, next_actions: ['잎맥의 변색 범위를 비교한다.'] },
    social_stance: '확신보다 관찰을 먼저 말한다.',
  } },
} });
assert.deepEqual(unseenGeneralization.telemetry.selected_npcs, ['mirabelle'], 'a non-reference location and NPC must route from current canonical relevance');
assert.match(unseenGeneralization.params.instructions, /Mirabelle is a theology student/);
assert.match(unseenGeneralization.params.input, /변색된 약초 표본/);
assert.match(unseenGeneralization.params.input, /ACTIVE NPC SIGNAL/);
assert.doesNotMatch(unseenGeneralization.params.input, /Sera|Lena|Emily|기숙사|입학식/, 'unseen composition must not inherit reference-scene content templates');

const dormCandidates = ['lillia(릴리아)', 'laris(라리스)', 'sera(세라)', 'isabel(이사벨)']
  .map((name) => `- ${name} score=18: NPC 일정 expected / 현재 장소와 자연스러움 / 최근 노출 공백 10턴`)
  .join('\n');
const dormDirectorInput = `===== TURN OPTIONS =====
normal
===== AUTHORITATIVE SAVE_STATE =====
{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
INTERVENTION: medium
ROUTINE_STREAK=2 / EVENT_GAP=4 / CHOICE_GAP=1 / CROSS_DEPT_GAP=1
SPOTLIGHT CANDIDATES (등장 강제가 아니라 개연성 있는 우선 후보):
${dormCandidates}
===== SCHEDULE ENGINE (AUTHORITATIVE) =====
{}`;
const dormSelections = new Set();
for (let index = 0; index < 80; index += 1) {
  const result = routeOpenAIParams(
    { instructions, input: dormDirectorInput },
    { incoming: {
      action: '방에서 짐을 정리한다.',
      saveState: {
        id: `npc-selection-independence-${index}`,
        turnNumber: 4,
        world: { date: '1285-03-01', time: '10:00', location: '1학년 A동 기숙사' },
        pc: { name: 'Ari', department: '기사과 1학년' },
        sceneRuntime: { participants: [] },
        director: { lastEventTurn: 0 },
        scheduleContext: { due: [], upcoming: [] },
      },
      recentTurns: [],
    }, mode: 'game' },
  );
  dormSelections.add(result.telemetry.event_director_v2?.selected_key || 'NO_EVENT');
}
assert.deepEqual(
  [...dormSelections].sort(),
  ['NO_EVENT', 'isabel', 'laris', 'lillia', 'sera'].sort(),
  'equivalent dorm candidates must remain seed-dependent instead of hardcoding Sera or forcing an encounter',
);

assert.doesNotMatch(
  `${source}\n${adapter}\n${rendererSource}`,
  /견본|260828|여행용 트렁크|조용히 거든다|원고를 접|dormitory trunk/i,
  'qualitative reference files and their distinctive scene content must not enter the production runtime',
);

const reactionScene = Array.from({ length: 8 }, (_, index) => ({
  kind: index % 2 ? 'dialogue' : 'narration',
  speaker_key: index % 2 ? 'artemis' : null,
  text: `recent-reaction-beat-${index + 1}`,
}));
const withRecentReactions = route('입학식 연설이 끝날 때까지 지켜본다.', {
  recentTurns: [{ action: '연설을 듣는다.', summary: '강당의 반응이 변했다.', importance: 'important', scene: reactionScene }],
});
const recentContext = withRecentReactions.params.input
  .split('===== RECENT SCENE CONTEXT =====\n')[1]
  ?.split(/\n\n===== (?:ACTIVE NPC SIGNAL|CURRENT SCENE FACTS)/)[0] || '';
assert.match(withRecentReactions.params.input, /===== RECENT SCENE CONTEXT =====/);
assert.match(recentContext, /recent-reaction-beat-3/);
assert.match(recentContext, /recent-reaction-beat-8/);
assert.doesNotMatch(recentContext, /recent-reaction-beat-[12](?!\d)/, 'latest scene context must retain six ordered beats rather than the former final three');
assert.ok(
  withRecentReactions.params.input.indexOf('===== RECENT SCENE CONTEXT =====') < withRecentReactions.params.input.indexOf('===== AUTHORITATIVE SAVE_STATE (ROUTED DETAIL) ====='),
  'recent reaction context must survive optional-context tail truncation ahead of detailed save data',
);

assert.match(schemaSource, /scene:\s*z\.array\(SceneItem\)\.min\(1\)\.max\(18\)/, 'structured output already permits a multi-beat scene');
assert.match(schemaSource, /turn\.importance === 'routine' \? 8 : turn\.importance === 'important' \? 14 : 18/, 'importance caps permit expanded important scenes without a new schema');
assert.match(rendererSource, /for \(const item of turn\.scene \|\| \[\]\)/, 'renderer preserves the ordered scene item sequence');

assert.equal((adapter.match(/coreHandler\(/g) || []).length, 1, 'Novel Director V2 must keep one canonical model call');
assert.doesNotMatch(source, /novelDirectorState|novel_director_receipt|prose_score|subtext_state/i, 'V2 must not add a narrative engine or persistence lifecycle');

console.log(`PASS Novel Director Diet / Reset (${previousCombinedFootprint} -> ${hardContract.length + novelContract.length} chars), no runtime scene checklist, USER ACTION safety, and one-call architecture`);
