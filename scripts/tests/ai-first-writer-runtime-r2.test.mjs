#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
emily=에밀리, lena=레나, lillia=릴리아
===== WORLD CANON =====
${divider}
ACADEMY HALL
${divider}
대강당은 입학식과 공식 행사가 열리는 장소다.
===== NPC CANON =====
${divider}
10. 에밀리
${divider}
- 여성, 루멘시아 아카데미 교장.
- 성격: 장난기와 날카로운 통찰.
- 신념: 아카데미는 가능성의 정원.
- 목표: 학생들이 자기 선택으로 만드는 이야기를 관찰.
${divider}
9. 레나
${divider}
- 마법과 신입생 수석.
- 성격: 나태하고 압도적으로 재능 있는 현실주의자.
- 목표: 가능한 조용히 지내기.
${divider}
8. 릴리아
${divider}
- 기사과 1학년.
- 성격: 밝고 열정적이며 기사도를 중시.
- 신조: 약자를 보호한다.
- 목표: 자기 실력으로 최고의 기사 되기.
===== NPC SPEECH =====
${divider}
10. 에밀리
${divider}
- 기본: 학생에게 친근한 반말, 공식석상에서는 따뜻한 존댓말.
- 진짜 화나면 장난기가 사라지고 차갑고 정중하다.
- 대표: 사용하지 않는 견본 대사.
${divider}
9. 레나
${divider}
- 기본: 짧고 느리며 군더더기가 없다.
${divider}
8. 릴리아
${divider}
- 기본: 밝고 활기찬 반말.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Canonical state only.`;

const coreInput = '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}';
const baseSave = {
  turnNumber: 0,
  world: { date:'1285-03-01', weekday:'월요일', time:'08:40', location:'루멘시아 아카데미 대강당 앞' },
  pc: { name:'니콜 하르트', age:20, gender:'여성', department:'마법과', status:'안정', skills:{} },
  sceneRuntime: { participants:[] },
  scheduleContext: {
    due:[],
    upcoming:[{ id:'entrance_ceremony', title:'입학식', date:'1285-03-01', time:'09:00', location:'루멘시아 아카데미 대강당', participants:['emily','lena'], importance:4, note:'환영사 뒤 다음 절차를 진행한다.' }],
  },
};

function route(action, saveState=baseSave, recentTurns=[]) {
  return routeOpenAIParams({ instructions, input:coreInput }, { incoming:{ action, saveState, recentTurns, rollingSummary:'대강당 앞에 도착했다.' }, mode:'game' });
}

const opening = route('대강당 안으로 들어간다.');
assert.equal(opening.telemetry.packet_version, 'thin-scene-packet-r2');
assert.deepEqual(opening.telemetry.selected_npcs, ['emily','lena'], 'imminent same-place canonical actors must receive character packets');
assert.match(opening.params.input, /"reason_relevant":"imminent canonical event"/);
assert.match(opening.params.input, /"core_personality_value":"- 성격: 장난기와 날카로운 통찰\. - 신념: 아카데미는 가능성의 정원\."/);
assert.match(opening.params.input, /"voice":"- 기본: 학생에게 친근한 반말, 공식석상에서는 따뜻한 존댓말\. - 진짜 화나면 장난기가 사라지고 차갑고 정중하다\."/);
assert.match(opening.params.input, /"current_goal":"학생들이 자기 선택으로 만드는 이야기를 관찰\."/);
assert.doesNotMatch(opening.params.input, /환영사 뒤 다음 절차/, 'schedule note/procedure must stay hidden');
assert.doesNotMatch(opening.params.input, /"participants":/, 'schedule participant queues must stay hidden');

const signSave = {
  ...baseSave,
  world:{ ...baseSave.world, time:'09:15', location:'루멘시아 아카데미 대강당' },
  scheduleContext:{ due:[], upcoming:[{ id:'magic_orientation', title:'마법과 오리엔테이션', date:'1285-03-01', time:'12:00', location:'마법과 지정 장소', participants:['lena'], note:'적성검사→대기열→담당자→다음 학생' }] },
};
const sign = route('마법과 오리엔테이션 표지판을 먼저 확인한다.', signSave);
assert.deepEqual(sign.telemetry.selected_npcs, [], 'a distant future event must not manufacture a current actor');
assert.match(sign.params.input, /"title":"마법과 오리엔테이션"/);
assert.doesNotMatch(sign.params.input, /적성검사|대기열|담당자|다음 학생/, 'future procedure must not enter Writer context');
assert.ok(sign.params.input.endsWith('마법과 오리엔테이션 표지판을 먼저 확인한다.'), 'exact sign-only intent must be the final authority');

const noCharacter = route('빈 연습실의 창문을 확인한다.', { ...baseSave, scheduleContext:{due:[],upcoming:[]} });
assert.deepEqual(noCharacter.telemetry.selected_npcs, []);
assert.match(noCharacter.params.input, /"relevant_characters":\[\]/, 'zero-character Scene must remain valid');

const currentCharacter = route('릴리아가 남긴 검흔을 살핀다.', {
  ...baseSave,
  npcStates:{ lillia:{ location:'루멘시아 아카데미 대강당 앞', status:'훈련을 막 끝냄' } },
  relationships:{ lillia:{ affinity:3, trust:2, status:'호의', history:['함께 훈련했다.'] } },
  memories:{ npc:{ lillia:[{ fact:'니콜이 정면 승부를 피하지 않았다.', importance:4 }] } },
  sceneRuntime:{ participants:['lillia'] },
  scheduleContext:{due:[],upcoming:[]},
});
assert.deepEqual(currentCharacter.telemetry.selected_npcs, ['lillia']);
assert.match(currentCharacter.params.input, /"reason_relevant":"explicit user focus"/);
assert.match(currentCharacter.params.input, /"relationship_to_pc":\{"affinity":3,"trust":2,"status":"호의"/);

const npcConversation = route('에밀리와 레나의 대화를 지켜본다.', {
  ...baseSave,
  sceneRuntime:{ participants:['emily','lena'] },
  npcInnerStates:{ emily:{ npc_relationships:{ lena:{ affinity:12, trust:5, status:'관심', reason:'입학식에서 재능을 눈여겨봤다.', updated_turn:4 } } } },
  scheduleContext:{due:[],upcoming:[]},
});
assert.match(npcConversation.params.input, /"relationships_to_present_characters":\{"lena":\{"affinity":12,"trust":5,"status":"관심"/, 'only relationships among selected present Named NPCs should be factual character context');

const growthFacts = route('마력을 조심스럽게 움직인다.', {
  ...baseSave,
  pc:{ ...baseSave.pc, skillCandidates:{ '마력 조작':{progress:37} }, awakeningCandidates:{ trait:{ '마력 감응':{progress:42,milestones:1} }, authority:{} } },
  scheduleContext:{due:[],upcoming:[]},
});
assert.match(growthFacts.params.input, /"skill_candidates":\{"마력 조작":\{"progress":37\}\}/);
assert.match(growthFacts.params.input, /"awakening_candidates":\{"trait":\{"마력 감응":\{"progress":42,"milestones":1\}\}/);

const recent = route('그 자리에 잠시 머문다.', { ...baseSave, scheduleContext:{due:[],upcoming:[]} }, [{
  action:'문을 열었다.', summary:'낡은 연습실 문이 열렸다.',
  scene:[{kind:'narration',text:'먼지가 빛 속에서 천천히 가라앉았다.'},{kind:'dialogue',speaker_key:'lillia',text:'여긴 오래 비어 있었어.'}],
}]);
assert.match(recent.params.input, /"immediate_physical_situation":\{"recent_summary":"낡은 연습실 문이 열렸다\."/);
assert.match(recent.params.input, /먼지가 빛 속에서 천천히 가라앉았다/);

const broadAction = '적성검사를 받고 오리엔테이션으로 간다.';
const broad = route(broadAction, signSave);
assert.ok(broad.params.input.endsWith(broadAction), 'broad chosen intent must survive without micro-step rewriting');

const longSuffix = '마지막에는 대도서관으로 간다.';
const longAction = `${'긴 사용자 행동 원문 '.repeat(600)}`.slice(0,5000-longSuffix.length)+longSuffix;
assert.equal(longAction.length, 5000);
const long = route(longAction, { ...baseSave, scheduleContext:{due:[],upcoming:[]} });
assert.ok(long.params.input.length <= 9000, `long action exceeded routine budget: ${long.params.input.length}`);
assert.match(long.params.input, /"canonical_name":"니콜 하르트"/);
assert.ok(long.params.input.endsWith(longAction), 'the complete 5,000-character USER ACTION must remain exact at the tail');

for (const forbidden of [
  'GM EVENT DIRECTOR', 'EVENT DIRECTOR V2.1', 'SCHEDULE ENGINE', 'SCENE MOMENTUM',
  'SCENE PURPOSE', 'SCENE EXIT', 'TURN HOOK', 'MULTI-SYSTEM SCENE ORCHESTRATION',
  'eventProgress', 'completedBeats', 'remaining_beats', 'next_action', 'NEXT_ACTION',
]) assert.equal(opening.params.input.includes(forbidden), false, `${forbidden} leaked into Writer input`);

assert.match(opening.params.instructions, /You are writing the next scene of serialized fantasy fiction, not reporting an RPG turn\./);
assert.match(opening.params.instructions, /let NPCs, time, and the world move naturally/);
assert.match(opening.params.instructions, /Write characters as people, not as functions for explaining systems\./);
assert.doesNotMatch(opening.params.instructions, /reaction count|paragraph quota|dialogue quota|scene depth/i);
assert.ok(opening.params.instructions.length + opening.params.input.length < 7000, 'representative Writer context should remain thin');

const chat = readFileSync('api/chat.js','utf8');
const router = readFileSync('api/chat-router.js','utf8');
const context = readFileSync('api/lib/context-router.js','utf8');
assert.match(chat, /choices: z\.array\(z\.string\(\)\)\.max\(0\)/, 'Suggested Actions must be schema-disabled');
assert.doesNotMatch(chat.slice(chat.indexOf('const TurnSchema'), chat.indexOf('// ===== END schema.js')), /director: DirectorMeta|event_progress:/, 'Writer output schema must not request Director/event progress');
assert.match(chat, /scene: z\.array\(SceneItem\)\.min\(1\)\.max\(18\)/, 'free ordered beat stream must remain');
assert.match(router, /data\.turn\.choices=\[\]/, 'runtime must keep Suggested Actions off');
assert.doesNotMatch(router, /freshChoices\(/, 'post-processing must not recreate Suggested Actions');
const rawReceiptMerge = router.slice(router.indexOf('function mergeRawGoalV2Fields'), router.indexOf('function patchGoalV2StructuredFormat'));
assert.doesNotMatch(rawReceiptMerge, /goal_progress_delta|goal_next_action|delayed_consequences_add/, 'removed Writer planning fields must not be reattached from raw output');
assert.match(router, /error\.status=409;error\.code='UNCOMMITTED_TURN'/, 'hard invariant mismatch must fail without replacement fiction');
assert.doesNotMatch(router, /요청한 행동이 완료될 수 있는 최소 시간을 채워 행동을 마쳤다/, 'runtime must not synthesize internal-state narration');
assert.equal((chat.match(/client\.responses\.parse\(/g)||[]).length, 1, 'one canonical model call must remain');
assert.doesNotMatch(context, /raw reference|견본_260828|세라를 등장|릴리아를 등장/, 'reference content must not enter runtime');

console.log('PASS P3-PR01R2 AI-first Writer runtime rebuild');
