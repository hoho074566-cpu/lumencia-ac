#!/usr/bin/env node

import assert from 'node:assert/strict';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import { promotePausedEventProgress, unscheduledPausedIdsForResume } from '../../lib/event-progress.js';

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
  assert.match(result.params.input, /===== USER ACTION — EXACT PLAYER TEXT =====/, `${name}: action block missing`);
  assert.ok(result.params.input.includes(action), `${name}: original action was not retained`);
}

const oversizedSuffix='나는 북문으로 이동한다.';
const oversizedAction = `${'계속 전진한다. '.repeat(500)}`.slice(0,5000-oversizedSuffix.length)+oversizedSuffix;
const oversized = route(oversizedAction, { rollingSummary: 'old context '.repeat(3000) });
assert.ok(oversized.params.input.length<=9000, 'oversized USER ACTION must respect the routine input budget');
assert.match(oversized.params.input,/===== THIN SCENE PACKET — HARD FACTS =====/,'oversized USER ACTION must retain minimum authoritative state');
assert.ok(oversized.params.input.endsWith(oversizedAction),'maximum supported USER ACTION must remain exact at the authority tail');
const scheduledRest=route('두 시간 쉰다.',{saveState:{world:{date:'1285-03-02',time:'11:50',location:'기숙사'},scheduledEvents:[{id:'combat-orientation',date:'1285-03-02',time:'12:00',status:'scheduled'}],scheduleContext:{due:[],upcoming:[{id:'combat-orientation',title:'필수 오리엔테이션',date:'1285-03-02',time:'12:00',importance:5}]}}});
assert.match(scheduledRest.params.input,/"time":"12:00","title":"필수 오리엔테이션"/,'schedule may reach the Writer only as a factual clock constraint');
assert.doesNotMatch(scheduledRest.params.input,/SCHEDULE_BOUNDARY|경계 너머까지 실행하지 말고|completion_recipe/,'schedule choreography must stay internal');
const routedContract=route('주변을 살핀다.').params.instructions;
assert.match(routedContract,/SYSTEM \/ CANON KERNEL/);
assert.match(routedContract,/MINIMAL WRITER CONTRACT/);
assert.match(routedContract,/after-the-scene factual receipts/);
const overflowContext=route('행사를 계속 지켜본다.',{saveState:{sceneRuntime:{eventProgress:{eventInstanceId:'long_event#1',activeBeat:'beat_25',completedBeats:Array.from({length:24},(_,i)=>`beat_${i+1}`),omittedCompletedCount:1,completionFingerprint:'0'.repeat(256)}}}});
assert.doesNotMatch(overflowContext.params.input,/omittedCompletedCount|beat_24|activeBeat/, 'event checkpoints must remain internal runtime state');
const pausedRuntime={eventProgress:null,eventProgressByInstance:{entrance_ceremony:{eventInstanceId:'entrance_ceremony',activeBeat:'ceremony_close',completedBeats:['welcome_address','freshman_rep_speech']}}};
const resumedBeforeGeneration=promotePausedEventProgress(pausedRuntime,['entrance_ceremony']);
const resumedContext=route('입학식을 계속 지켜본다.',{saveState:{sceneRuntime:resumedBeforeGeneration,scheduleContext:{due:[{id:'entrance_ceremony'}]}}});
assert.doesNotMatch(resumedContext.params.input,/welcome_address|freshman_rep_speech/, 'resumed checkpoint order must not become a prose plan');
const duelId='started:1285-03-01:t12:abcd1234';
const pausedDuel={eventProgress:null,eventProgressByInstance:{[duelId]:{eventInstanceId:duelId,activeBeat:'second_exchange',completedBeats:['opening_salute'],resumeKey:'lena duel'}}};
const duelResumeIds=unscheduledPausedIdsForResume(pausedDuel,'Return and continue the Lena duel.',['lena duel']);
const duelContext=route('Return and continue the Lena duel.',{saveState:{activeEvents:['lena duel'],sceneRuntime:promotePausedEventProgress(pausedDuel,duelResumeIds)}});
assert.doesNotMatch(duelContext.params.input,/opening_salute|second_exchange/, 'unscheduled checkpoints must stay internal');

const continueAction = `[LUMENSIA V1.5.6 CONTINUE]\n${'직전 장면의 같은 순간을 이어 쓴다. '.repeat(120)}`;
const continuedRouted = routeOpenAIParams(
  { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming: { action: continueAction, saveState: {}, recentTurns: [], rollingSummary: 'optional '.repeat(10000) }, mode: 'continue' },
);
assert.equal(continuedRouted.telemetry.profile, 'continue-11k-v154', 'CONTINUE profile must remain selected');
assert.equal(continuedRouted.telemetry.target_input_tokens, 11000, 'CONTINUE target budget changed');
assert.equal(continuedRouted.telemetry.soft_max_tokens, 14000, 'CONTINUE soft maximum changed');
assert.match(continuedRouted.params.input, /===== USER ACTION — EXACT PLAYER TEXT =====\n\[LUMENSIA V1\.5\.6 CONTINUE\]/, 'routed CONTINUE marker is missing');
assert.ok(continuedRouted.params.input.includes(continueAction), 'complete synthetic CONTINUE action must survive optional-context truncation');
assert.doesNotMatch(continuedRouted.params.input,/SCENE MOMENTUM|INTENT=continue-freeze/,'CONTINUE runtime state must not become prose choreography');

const autoAction = '[LUMENSIA V1.5.6 AUTO FLOW — SCENE MOMENTUM HF1]\nPC 판단이 필요 없는 세계 흐름을 진행한다.';
const autoRouted = routeOpenAIParams(
  { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming: { action: autoAction, saveState: {}, recentTurns: [], rollingSummary: 'optional '.repeat(10000) }, mode: 'auto' },
);
assert.equal(autoRouted.telemetry.profile, 'routine-17k-v154', 'AUTO must preserve the routine routing profile');
assert.ok(autoRouted.params.input.includes(autoAction), 'AUTO directive must remain the final USER ACTION payload');
assert.doesNotMatch(autoRouted.params.input,/===== SCENE MOMENTUM|INTENT=generic/,'AUTO internal classifier must not become prose choreography');

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

const directorInput = `===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}\n===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====\nINTERVENTION: medium\nROUTINE_STREAK=3 / EVENT_GAP=4 / CHOICE_GAP=1 / CROSS_DEPT_GAP=0\n- p5(Five) score=100: test\n===== SCHEDULE ENGINE (AUTHORITATIVE) =====\nnone`;
let directorSelected;
for(let seed=0;seed<100&&!directorSelected;seed++){
  const result=routeOpenAIParams({instructions:crowdedInstructions,input:directorInput},{incoming:{action:'기다린다.',saveState:{id:`seed-${seed}`,turnNumber:8,world:{location:'academy'},sceneRuntime:{participants:['p1','p2','p3','p4']}},recentTurns:[]},mode:'game'});
  if(result.telemetry.event_director_v2?.selected_key==='p5')directorSelected=result;
}
assert.ok(directorSelected,'test fixture must produce a director-selected NPC');
assert.equal(directorSelected.telemetry.selected_npcs.includes('p5'),false,'Director selection must not assign a Writer-facing actor');
assert.equal(directorSelected.telemetry.selected_npcs.length,4,'current scene participants must preserve the NPC cap');

const similarInstructions=instructions.replace('guide=Guide','elena=Elena, lena=Lena');
const exactAddress=routeOpenAIParams({instructions:similarInstructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},{incoming:{action:'Elena에게 질문한다.',saveState:{turnNumber:3,world:{location:'academy'},sceneRuntime:{participants:[]}},recentTurns:[]},mode:'game'});
assert.equal(exactAddress.telemetry.selected_npcs.includes('elena'),true,'exact addressed NPC must be routed');
assert.equal(exactAddress.telemetry.selected_npcs.includes('lena'),false,'Lena must not match inside Elena');
const koreanSimilar=instructions.replace('guide=Guide','elena=엘레나, lena=레나');
const koreanExact=routeOpenAIParams({instructions:koreanSimilar,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},{incoming:{action:'엘레나에게 질문한다.',saveState:{turnNumber:3,world:{location:'academy'},sceneRuntime:{participants:[]}},recentTurns:[]},mode:'game'});
assert.equal(koreanExact.telemetry.selected_npcs.includes('elena'),true,'exact Korean display name must be routed');
assert.equal(koreanExact.telemetry.selected_npcs.includes('lena'),false,'레나 must not match inside 엘레나');

const duePriority=routeOpenAIParams({instructions:crowdedInstructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},{incoming:{action:'기다린다.',saveState:{turnNumber:3,world:{location:'academy'},sceneRuntime:{participants:['p1','p2','p3','p4']},scheduleContext:{due:[{participants:['p5']}]}},recentTurns:[]},mode:'game'});
assert.equal(duePriority.telemetry.selected_npcs.includes('p5'),false,'a participant queue without a current-location causal link must not assign a Writer-facing actor');
assert.equal(duePriority.telemetry.selected_npcs.length,4,'due reservation must preserve the NPC cap');

console.log(`PASS context router regressions (${cases.length + 30} checks)`);
