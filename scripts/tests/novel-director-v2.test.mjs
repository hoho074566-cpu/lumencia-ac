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
assert.equal((novelContract.match(/IMPORTANT SCENE: DEPTH > DISTANCE/g) || []).length, 1);
for (const marker of [
  'SCENE WRITER / WORLD ACTOR',
  '비가시 composition 메타',
  'narrator moral',
  '한 active Scene/한 schedule occurrence',
  'Scene Completion은 다음 일정 소비가 아니다',
  'ROUTINE: DISTANCE > DEPTH',
  '사건 quota는 없다',
  'User Specificity',
  'hard interruption',
  'ordered sequence',
  '같은 NPC도 여러 beat',
  '미리 요약하거나 재해설하지 않는다',
  'CHARACTER MUST SURVIVE FUNCTION',
  '현재 순간에 필요한 만큼만',
  '서로 끼어들고 반박',
  'canonical power gap',
  'Failure의 손실은 Story State',
  'later schedule/event로 점프하지 않는다',
  'HARD_DECISION',
  'generic NPC 질문/choices',
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
assert.match(broad.params.instructions, /IMPORTANT SCENE: DEPTH > DISTANCE/);
assert.match(broad.params.instructions, /Director 규칙은 비가시 composition 메타/);
assert.match(broad.params.instructions, /학년·학사 단계/);
assert.match(broad.params.input, /"date":"1285-03-02"/);
assert.match(broad.params.input, /"department":"기사과 1학년"/);
assert.match(broad.params.input, /"status":"초기 기량평가 직후"/);
assert.match(broad.params.input, /ROLE=SCENE_WRITER/);
assert.match(broad.params.input, /POLICY≠FICTION/);
assert.match(broad.params.input, /DEPTH>DISTANCE;ONE_ACTIVE_SCENE/);
assert.match(broad.params.input, /HARD_DECISION_ONLY/);
assert.doesNotMatch(broad.params.input, /EXIT_TARGET 뒤의 첫 판단점|EXIT_TARGET 뒤에 실제 판단/);
assert.ok(
  broad.params.input.lastIndexOf('ROLE=SCENE_WRITER') > broad.params.input.lastIndexOf('===== STRONGER TURN HOOK V1 ====='),
  'the final action-adjacent authority must resolve late Exit/Hook pressure in favor of depth and the fiction firewall',
);

const restrictedAction = '문 앞에서 안쪽 소리만 듣는다. 문은 열지 않고 안으로 들어가지 않는다.';
const restricted = route(restrictedAction);
assert.ok(restricted.params.input.includes(restrictedAction), 'specific USER restriction must survive routing unchanged');
assert.match(restricted.params.instructions, /명시한 금지·거리·목적지·완료 조건은 넘지 않/);

const routineTransition = route('입학식 뒤 기숙사로 이동한다.');
assert.match(routineTransition.params.input, /ROUTINE→SCENE_THRESHOLD/);
assert.match(routineTransition.params.input, /else choices=\[\]/);

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
assert.match(opening.params.input, /SCHEDULED_START_OFFSET=20min/);
assert.doesNotMatch(opening.params.input, /SCHEDULE_BOUNDARY=20min/, 'attending the requested entrance ceremony must not stop before that same ceremony');
assert.doesNotMatch(opening.params.input, /knight_orientation|기사과 1학년 오리엔테이션/, 'later schedule items must remain boundaries outside the active requested scene instead of becoming narrative tasks');

const mentorBoundary = {
  id: 'mentor_meeting', title: '에밀리와 사전 면담', date: '1285-03-01', time: '09:30',
  location: '본관 응접실', kind: 'personal', participants: ['emily'], pc_required: true, status: 'scheduled',
};
const requestedClass = {
  id: 'basic_class', title: '기사과 기초 수업', date: '1285-03-01', time: '10:00',
  location: '기사과 강의실', kind: 'academic', participants: ['artemis'], status: 'scheduled',
};
const afterClass = {
  id: 'after_class_drill', title: '오후 자율 훈련', date: '1285-03-01', time: '13:00',
  location: '기사과 연무장', kind: 'academic', participants: ['lillia'], status: 'scheduled',
};
const boundedRequestedClass = route('10시에 기사과 기초 수업에 참석한다.', { savePatch: {
  world: { date: '1285-03-01', time: '09:00', location: '기숙사' },
  sceneRuntime: { participants: [] },
  scheduledEvents: [mentorBoundary, requestedClass, afterClass],
  scheduleContext: { due: [], upcoming: [mentorBoundary, requestedClass, afterClass] },
} });
assert.match(boundedRequestedClass.params.input, /SCHEDULE_BOUNDARY=30min/, 'the earlier PC appointment must remain the deterministic stop boundary');
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
assert.match(seraCharacterSignal.params.input, /===== CHARACTER-DRIVEN NPC BEHAVIOR V1 =====/);
assert.match(seraCharacterSignal.params.input, /자기 짐과 장비를 확인한다/);
assert.match(seraCharacterSignal.params.input, /손익을 먼저 재는 현실주의자/);

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
assert.match(unseenGeneralization.params.input, /DEPTH>DISTANCE;ONE_ACTIVE_SCENE/);
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
