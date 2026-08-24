#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeRoutedInput, routeOpenAIParams } from '../../api/lib/context-router.js';

const optionalContext=`===== AUTHORITATIVE SAVE_STATE (ROUTED) =====\n${'OPTIONAL_CONTEXT_'.repeat(1400)}`;
const authorityTail=[
  '===== GM EVENT DIRECTOR (ROUTED) =====',
  'DIRECTOR_SENTINEL=KEEP',
  '',
  '===== EVENT DIRECTOR V2.1 (ROUTED) =====',
  'DIRECTOR_V2_SENTINEL=KEEP',
  '',
  '===== SCHEDULE ENGINE (ROUTED) =====',
  '{"due":[{"id":"SCHEDULE_SENTINEL","title":"반드시 보존"}]}',
].join('\n');
const reservedContext='===== SCENE MOMENTUM HF1 =====\nINTENT=travel\nMOMENTUM_SENTINEL=KEEP\n\n===== SCENE PURPOSE V1 =====\nPURPOSE_SENTINEL=KEEP\n\n===== STRONGER TURN HOOK V1 =====\nTURN_HOOK_SENTINEL=KEEP';
const actionBlock='===== USER ACTION =====\n돌아다닌다.\n\n의미적 목표를 완료한다.';
const text=composeRoutedInput({optionalContext,reservedContext,authorityTail,actionBlock,inputChars:9000});

assert.ok(text.length<=9000,`routed input must respect routine budget: ${text.length}`);
assert.ok(text.length<optionalContext.length,'oversized optional context must be clipped');
assert.match(text,/===== SCENE MOMENTUM HF1 =====/);
assert.match(text,/INTENT=travel/);
assert.match(text,/MOMENTUM_SENTINEL=KEEP/,'reserved Scene Momentum payload must survive prefix pressure');
assert.match(text,/===== SCENE PURPOSE V1 =====/);
assert.match(text,/PURPOSE_SENTINEL=KEEP/,'reserved Scene Purpose payload must survive prefix pressure');
assert.match(text,/===== STRONGER TURN HOOK V1 =====/);
assert.match(text,/TURN_HOOK_SENTINEL=KEEP/,'reserved Turn Hook payload must survive prefix pressure');
assert.match(text,/===== GM EVENT DIRECTOR \(ROUTED\) =====/);
assert.match(text,/DIRECTOR_SENTINEL=KEEP/);
assert.match(text,/===== EVENT DIRECTOR V2\.1 \(ROUTED\) =====/);
assert.match(text,/DIRECTOR_V2_SENTINEL=KEEP/);
assert.match(text,/===== SCHEDULE ENGINE \(ROUTED\) =====/);
assert.match(text,/SCHEDULE_SENTINEL/,'authoritative schedule payload must survive prefix pressure');
assert.ok(text.endsWith(actionBlock),'USER ACTION must remain the final authoritative turn instruction');

const source=readFileSync('api/lib/context-router.js','utf8');
assert.match(source,/function compactScheduleAuthority\(/,'schedule authority must be structurally compacted before reservation');
assert.match(source,/function formatAuthorityTail\(/,'router must construct a labeled reserved authority tail');
assert.match(source,/const authorityTail=fitAuthorityTail\(/,'buildInput must budget the reserved authority tail against fixed context');
assert.match(source,/composeRoutedInput\(\{saveState,optionalContext,reservedContext,authorityTail,actionBlock,inputChars:profile\.inputChars\}\)/,'buildInput must use the reserved-state-and-tail composer');
assert.doesNotMatch(source,/clampText\(variableContext,variableBudget\)/,'legacy prefix-only clamp must stay removed');

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
guide=Guide
===== WORLD CANON =====
${divider}\nAcademy\n${divider}\nPublic facts.
===== NPC CANON =====
${divider}\nGuide\n${divider}\nHelpful.
===== NPC SPEECH =====
${divider}\nGuide\n${divider}\nBrief.
===== PC SYSTEM =====
${divider}\nRules\n${divider}\nResolve actions.`;
const longActionSuffix='도서관에 간다.';
const longAction=`${'긴 행동 설명 '.repeat(700)}`.slice(0,5000-longActionSuffix.length)+longActionSuffix;
assert.equal(longAction.length,5000,'pressure fixture must stay at the supported 5,000-character boundary');
const originalInput=`===== TURN OPTIONS =====\nnormal
===== AUTHORITATIVE SAVE_STATE =====\n{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
INTERVENTION: light\nDIRECTOR_SENTINEL=KEEP
===== SCHEDULE ENGINE (AUTHORITATIVE) =====\nSCHEDULE_SENTINEL`;
const routed=routeOpenAIParams({instructions,input:originalInput},{mode:'game',incoming:{action:longAction,rollingSummary:'old '.repeat(5000),recentTurns:[],saveState:{turnNumber:8,world:{date:'1285-03-01',time:'09:00',location:'SAVE_WORLD_SENTINEL'},pc:{name:'SAVE_PC_SENTINEL'},npcStates:{guide:{location:'hall'}},sceneRuntime:{participants:['guide'],purpose:{version:'1.0',kind:'interaction',focus:'PURPOSE_RUNTIME_SENTINEL',source:'npc-interaction',established_turn:8},exit_condition:{version:'1.0',kind:'interaction-turn',target:'EXIT_RUNTIME_SENTINEL',source:'scene-purpose',status:'open',established_turn:8,purpose_established_turn:8},turn_hook:{version:'1.0',kind:'npc-address',anchor:'TURN_HOOK_RUNTIME_SENTINEL',source:'scene-dialogue',status:'awaiting-player',established_turn:8,speaker_key:'guide'},momentum:{stall_streak:2}},scheduleContext:{due:[{id:'SCHEDULE_SENTINEL',title:'ceremony',note:'NOTE_SENTINEL',time:'09:10',participants:['guide']}],npc_schedule:{guide:{location:'hall',activity:'class',commitment:'fixed class',confidence:'fixed',time:'09:10'}}}}}});
assert.ok(routed.params.input.length<=9000,`long-action routine input exceeded budget: ${routed.params.input.length}`);
assert.match(routed.params.input,/AUTHORITATIVE SAVE_STATE \(ROUTED MINIMUM\)/);
assert.match(routed.params.input,/SAVE_WORLD_SENTINEL/);
assert.match(routed.params.input,/SAVE_PC_SENTINEL/);
assert.match(routed.params.input,/GM EVENT DIRECTOR \(ROUTED\)/);
assert.match(routed.params.input,/EVENT DIRECTOR V2\.1 \(ROUTED\)/);
assert.match(routed.params.input,/SCHEDULE ENGINE \(ROUTED\)/);
assert.match(routed.params.input,/SCHEDULE_SENTINEL/);
assert.match(routed.params.input,/NOTE_SENTINEL/);
assert.match(routed.params.input,/"commitment":"fixed class"/);
assert.match(routed.params.input,/"confidence":"fixed"/);
assert.match(routed.params.input,/===== SCENE MOMENTUM HF1 =====/,'Scene Momentum heading must survive long-action pressure');
assert.match(routed.params.input,/INTENT=travel/,'classified travel intent must reach the model under long-action pressure');
assert.match(routed.params.input,/===== SCENE PURPOSE V1 =====/,'Scene Purpose heading must survive long-action pressure');
assert.match(routed.params.input,/PURPOSE_RUNTIME_SENTINEL/,'bounded Scene Purpose must reach the model under long-action pressure');
assert.match(routed.params.input,/PURPOSE_MODE=current-action-first/,'current committed action must outrank the saved purpose under long-action pressure');
assert.match(routed.params.input,/USER ACTION이 저장된 PURPOSE_FOCUS보다 우선한다/,'saved purpose must be explicitly subordinate to the current action');
assert.match(routed.params.input,/===== EXPLICIT SCENE EXIT CONDITION V1 =====/,'Scene Exit heading must survive long-action pressure');
assert.match(routed.params.input,/EXIT_KIND=semantic-destination/,'the current travel action must set the active exit boundary');
assert.match(routed.params.input,/EXIT_RUNTIME_SENTINEL/,'the bounded saved exit checkpoint must remain in authoritative minimum state');
assert.match(routed.params.input,/===== STRONGER TURN HOOK V1 =====/,'Turn Hook heading must survive long-action pressure');
assert.match(routed.params.input,/TURN_HOOK_RUNTIME_SENTINEL/,'the bounded saved Turn Hook must remain in authoritative minimum state');
assert.match(routed.params.input,/HOOK_MODE=current-action-first/,'current committed action must outrank the saved Turn Hook');
assert.match(routed.params.input,/도서관에 간다\./,'the bounded USER ACTION must retain its committed travel predicate');
assert.ok(routed.params.input.lastIndexOf('===== USER ACTION =====')>routed.params.input.lastIndexOf('===== SCHEDULE ENGINE (ROUTED) ====='),'USER ACTION marker must remain final');

const denseActionSuffix='대도서관으로 간다.';
const denseAction=`${'밀집 행동 설명 '.repeat(600)}`.slice(0,3900-denseActionSuffix.length)+denseActionSuffix;
const denseEvents=Array.from({length:5},(_,index)=>({id:`dense-${index}`,title:`기사과 필수 일정 ${index} ${'상세 '.repeat(20)}`,note:`NOTE_DENSE_${index} ${'권위 일정 설명 '.repeat(30)}`,date:'1285-03-01',time:`${String(10+index).padStart(2,'0')}:00`,location:`DENSE_LOCATION_${index}`,status:'scheduled',participants:['guide']}));
const denseOriginalInput=`===== TURN OPTIONS =====\nnormal
===== AUTHORITATIVE SAVE_STATE =====\n{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
${'DIRECTOR_DENSE '.repeat(80)}
===== SCHEDULE ENGINE (AUTHORITATIVE) =====\nSCHEDULE_DENSE_SENTINEL`;
const denseSave={
  turnNumber:8,
  world:{date:'1285-03-01',time:'09:00',location:'SAVE_WORLD_DENSE'},
  pc:{name:'SAVE_PC_DENSE',department:'기사과'},
  npcStates:{guide:{location:'hall',status:'waiting'}},
  sceneRuntime:{
    participants:['guide'],
    purpose:{version:'1.0',kind:'interaction',focus:'PURPOSE_DENSE_SENTINEL',source:'npc-interaction',established_turn:8},
    exit_condition:{version:'1.0',kind:'interaction-turn',target:'EXIT_DENSE_SENTINEL',source:'scene-purpose',status:'open',established_turn:8,purpose_established_turn:8},
    turn_hook:{version:'1.0',kind:'npc-address',anchor:'TURN_HOOK_DENSE_SENTINEL',source:'scene-dialogue',status:'awaiting-player',established_turn:8,speaker_key:'guide'},
    momentum:{stall_streak:2},
  },
  scheduleContext:{
    due:denseEvents.slice(0,4),upcoming:denseEvents,
    npc_schedule:{guide:{location:'hall',activity:'DENSE_ACTIVITY '.repeat(20),commitment:'DENSE_COMMITMENT '.repeat(20),confidence:'fixed',time:'10:00'}},
  },
  scheduledEvents:denseEvents,
};
const denseRouted=routeOpenAIParams({instructions,input:denseOriginalInput},{mode:'game',incoming:{action:denseAction,rollingSummary:'dense old '.repeat(1000),recentTurns:[],saveState:denseSave}});
assert.ok(denseRouted.params.input.length<=9000,`dense routine authority input exceeded budget: ${denseRouted.params.input.length}`);
assert.match(denseRouted.params.input,/SCHEDULE ENGINE \(ROUTED\)/);
assert.match(denseRouted.params.input,/NOTE_DENSE_0/);
assert.match(denseRouted.params.input,/STRONGER TURN HOOK V1/);
assert.match(denseRouted.params.input,/TURN_HOOK_DENSE_SENTINEL/);
assert.match(denseRouted.params.input,/대도서관으로 간다\./);

const maximumActionSuffix='대도서관으로 간다.';
const maximumAction=`${'최대 행동 압력 '.repeat(900)}`.slice(0,5200-maximumActionSuffix.length)+maximumActionSuffix;
const maximumRouted=routeOpenAIParams({instructions,input:denseOriginalInput},{mode:'game',incoming:{action:maximumAction,rollingSummary:'dense old '.repeat(1000),recentTurns:[],saveState:denseSave}});
assert.ok(maximumRouted.params.input.length<=9000,`maximum fixed authority input exceeded budget: ${maximumRouted.params.input.length}`);
assert.match(maximumRouted.params.input,/GM EVENT DIRECTOR \(ROUTED\)/);
assert.match(maximumRouted.params.input,/EVENT DIRECTOR V2\.1 \(ROUTED\)/);
assert.match(maximumRouted.params.input,/SCHEDULE ENGINE \(ROUTED\)/);
assert.match(maximumRouted.params.input,/STRONGER TURN HOOK V1/);
assert.match(maximumRouted.params.input,/대도서관으로 간다\./);

const aftermath=source.indexOf("AFTERMATH_FIXED_FLOW");
const combat=source.indexOf("ACTIVE_COMBAT_FIXED_FLOW");
const momentum=source.indexOf('const momentumDue=momentumPressure');
assert.ok(aftermath>=0&&aftermath<momentum,'aftermath fixed-flow guard must precede momentum random selection');
assert.ok(combat>=0&&combat<momentum,'active-combat fixed-flow guard must precede momentum random selection');

console.log('PASS Context Router authority-tail reservation (9k budget preserves momentum + director + schedule payload)');
