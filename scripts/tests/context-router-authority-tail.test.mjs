#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeRoutedInput, routeOpenAIParams } from '../../api/lib/context-router.js';

const optionalContext=`===== AUTHORITATIVE SAVE_STATE (ROUTED) =====\n${'OPTIONAL_CONTEXT_'.repeat(1400)}`;
const authorityTail=[
  '===== IMMEDIATE EVENT FACTS (HARD DATA) =====',
  '{"due":[{"id":"SCHEDULE_SENTINEL","title":"반드시 보존"}]}',
].join('\n');
const reservedContext='===== HARD EXECUTION FACTS (DATA, NOT FICTION) =====\n{"intent_kind":"travel","semantic_target":"도서관"}\nHARD_FACT_SENTINEL=KEEP';
const actionBlock='===== USER ACTION (EXACT) =====\n돌아다닌다.';
const text=composeRoutedInput({optionalContext,reservedContext,authorityTail,actionBlock,inputChars:9000});

assert.ok(text.length<=9000,`routed input must respect routine budget: ${text.length}`);
assert.ok(text.length<optionalContext.length,'oversized optional context must be clipped');
assert.match(text,/===== HARD EXECUTION FACTS \(DATA, NOT FICTION\) =====/);
assert.match(text,/"intent_kind":"travel"/);
assert.match(text,/HARD_FACT_SENTINEL=KEEP/,'hard execution facts must survive prefix pressure');
assert.match(text,/===== IMMEDIATE EVENT FACTS \(HARD DATA\) =====/);
assert.match(text,/SCHEDULE_SENTINEL/,'authoritative schedule payload must survive prefix pressure');
assert.ok(text.endsWith(actionBlock),'USER ACTION must remain the final authoritative turn instruction');

const source=readFileSync('api/lib/context-router.js','utf8');
assert.match(source,/function compactScheduleAuthority\(/,'schedule authority must be structurally compacted before reservation');
assert.match(source,/function formatAuthorityTail\(/,'router must construct a labeled reserved authority tail');
assert.match(source,/authorityTail=fitAuthorityTail\(/,'buildInput must budget the reserved authority tail against fixed context');
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
const routed=routeOpenAIParams({instructions,input:originalInput},{mode:'game',incoming:{action:longAction,rollingSummary:'old '.repeat(5000),recentTurns:[],saveState:{turnNumber:8,world:{date:'1285-03-01',time:'09:00',location:'SAVE_WORLD_SENTINEL'},pc:{name:'SAVE_PC_SENTINEL'},npcStates:{guide:{location:'hall'}},sceneRuntime:{participants:['guide'],purpose:{version:'1.0',kind:'interaction',focus:'PURPOSE_RUNTIME_SENTINEL',source:'npc-interaction',established_turn:8},exit_condition:{version:'1.0',kind:'interaction-turn',target:'EXIT_RUNTIME_SENTINEL',source:'scene-purpose',status:'open',established_turn:8,purpose_established_turn:8},turn_hook:{version:'1.0',kind:'npc-address',anchor:'TURN_HOOK_RUNTIME_SENTINEL',source:'scene-dialogue',status:'awaiting-player',established_turn:8,speaker_key:'guide'},momentum:{stall_streak:2}},scheduleContext:{due:[{id:'SCHEDULE_SENTINEL',title:'ceremony',note:'NOTE_SENTINEL',time:'09:10',participants:['guide'],pc_required:true}],npc_schedule:{guide:{location:'hall',activity:'class',commitment:'fixed class',confidence:'fixed',time:'09:10'}}}}}});
assert.ok(routed.params.input.length<=9000,`long-action routine input exceeded budget: ${routed.params.input.length}`);
assert.match(routed.params.input,/AUTHORITATIVE SAVE_STATE \(ROUTED MINIMUM\)/);
assert.match(routed.params.input,/SAVE_WORLD_SENTINEL/);
assert.match(routed.params.input,/SAVE_PC_SENTINEL/);
assert.match(routed.params.input,/HARD EXECUTION FACTS \(DATA, NOT FICTION\)/);
assert.match(routed.params.input,/IMMEDIATE EVENT FACTS \(HARD DATA\)/);
assert.match(routed.params.input,/SCHEDULE_SENTINEL/);
assert.match(routed.params.input,/NOTE_SENTINEL/);
assert.match(routed.params.input,/"commitment":"fixed class"/);
assert.match(routed.params.input,/"confidence":"fixed"/);
assert.match(routed.params.input,/"intent_kind":"travel"/,'classified travel intent must reach the model as data under long-action pressure');
assert.match(routed.params.input,/TURN_HOOK_RUNTIME_SENTINEL/,'the bounded saved Turn Hook must remain in authoritative minimum state');
assert.doesNotMatch(routed.params.input,/PURPOSE_RUNTIME_SENTINEL|EXIT_RUNTIME_SENTINEL|SCENE PURPOSE V1|EXPLICIT SCENE EXIT|STRONGER TURN HOOK/,'runtime scene-control policy must not reach the writer');
assert.match(routed.params.input,/도서관에 간다\./,'the bounded USER ACTION must retain its committed travel predicate');
assert.ok(routed.params.input.endsWith(`===== USER ACTION (EXACT) =====\n${longAction}`),'5,000-character USER ACTION must remain exact and final');

const denseActionSuffix='대도서관으로 간다.';
const denseAction=`${'밀집 행동 설명 '.repeat(600)}`.slice(0,3900-denseActionSuffix.length)+denseActionSuffix;
const denseEvents=Array.from({length:5},(_,index)=>({id:`dense-${index}`,title:`기사과 필수 일정 ${index} ${'상세 '.repeat(20)}`,note:`NOTE_DENSE_${index} ${'권위 일정 설명 '.repeat(30)}`,date:'1285-03-01',time:`${String(10+index).padStart(2,'0')}:00`,location:`DENSE_LOCATION_${index}`,status:'scheduled',participants:['guide'],pc_required:true}));
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
    novelty:{version:'1.0',repetition_streak:2,recent_terms:['게시판','배정','창구','정정','목록','기량평가','안내'],repeated_terms:['게시판','목록','안내'],recent_axes:['information'],last_turn:8},
  },
  scheduleContext:{
    due:denseEvents.slice(0,4),upcoming:denseEvents,
    npc_schedule:{guide:{location:'hall',activity:'DENSE_ACTIVITY '.repeat(20),commitment:'DENSE_COMMITMENT '.repeat(20),confidence:'fixed',time:'10:00'}},
  },
  scheduledEvents:denseEvents,
};
const denseRouted=routeOpenAIParams({instructions,input:denseOriginalInput},{mode:'game',incoming:{action:denseAction,rollingSummary:'dense old '.repeat(1000),recentTurns:[],saveState:denseSave}});
assert.ok(denseRouted.params.input.length<=9000,`dense routine authority input exceeded budget: ${denseRouted.params.input.length}`);
assert.match(denseRouted.params.input,/IMMEDIATE EVENT FACTS \(HARD DATA\)/);
assert.match(denseRouted.params.input,/NOTE_DENSE_0/);
assert.doesNotMatch(denseRouted.params.input,/STRONGER TURN HOOK|DETERMINISTIC SCENE NOVELTY|REPEAT_GUARD=required/);
assert.match(denseRouted.params.input,/TURN_HOOK_DENSE_SENTINEL/);
assert.match(denseRouted.params.input,/대도서관으로 간다\./);

const moderateAction=`${'중간 길이 행동 설명 '.repeat(260)}`.slice(0,2000);
const moderateSave={turnNumber:8,world:{date:'1285-03-01',time:'09:00',location:'SAVE_WORLD_MODERATE'},pc:{name:'SAVE_PC_MODERATE'},sceneRuntime:{novelty:denseSave.sceneRuntime.novelty}};
const moderateRouted=routeOpenAIParams({instructions,input:originalInput},{mode:'game',incoming:{action:moderateAction,rollingSummary:'',recentTurns:[],saveState:moderateSave}});
assert.ok(moderateRouted.params.input.includes(moderateAction),'an active novelty directive must not truncate a 2,000-character action when the routed input has room');

const maximumActionSuffix='대도서관으로 간다.';
const maximumAction=`${'최대 행동 압력 '.repeat(900)}`.slice(0,5200-maximumActionSuffix.length)+maximumActionSuffix;
const maximumRouted=routeOpenAIParams({instructions,input:denseOriginalInput},{mode:'game',incoming:{action:maximumAction,rollingSummary:'dense old '.repeat(1000),recentTurns:[],saveState:denseSave}});
assert.ok(maximumRouted.params.input.length<=9000,`maximum fixed authority input exceeded budget: ${maximumRouted.params.input.length}`);
assert.match(maximumRouted.params.input,/HARD EXECUTION FACTS/);
assert.match(maximumRouted.params.input,/IMMEDIATE EVENT FACTS/);
assert.doesNotMatch(maximumRouted.params.input,/GM EVENT DIRECTOR|EVENT DIRECTOR V2\.1 \(ROUTED\)|STRONGER TURN HOOK/);
assert.match(maximumRouted.params.input,/대도서관으로 간다\./);

const adaptiveSave={...denseSave,routerFeedback:{routerVersion:'1.5.6-hf1',profile:'routine-17k-v154',lastInputTokens:100000}};
const adaptiveRouted=routeOpenAIParams({instructions,input:denseOriginalInput},{mode:'game',incoming:{action:maximumAction,rollingSummary:'dense old '.repeat(1000),recentTurns:[],saveState:adaptiveSave}});
assert.equal(adaptiveRouted.telemetry.adaptive_scale,.76,'pressure fixture must exercise the minimum supported adaptive scale');
assert.ok(adaptiveRouted.params.input.length<=6840,`adaptive routine input exceeded its 0.76 profile budget: ${adaptiveRouted.params.input.length}`);
assert.match(adaptiveRouted.params.input,/AUTHORITATIVE SAVE_STATE \(ROUTED MINIMUM\)/);
assert.match(adaptiveRouted.params.input,/HARD EXECUTION FACTS/);
assert.match(adaptiveRouted.params.input,/IMMEDIATE EVENT FACTS/);
assert.match(adaptiveRouted.params.input,/"id":"dense-0"/,'adaptive pressure must retain the first authoritative schedule occurrence');
assert.match(adaptiveRouted.params.input,/최대 행동 압력/,'adaptive middle compaction must retain the beginning of USER ACTION');
assert.match(adaptiveRouted.params.input,/대도서관으로 간다\./,'adaptive pressure must retain the committed USER ACTION predicate');
assert.equal(adaptiveRouted.params.input.includes(maximumAction),true,'adaptive pressure must preserve the complete USER ACTION before optional context');
assert.ok(adaptiveRouted.params.input.endsWith(`===== USER ACTION (EXACT) =====\n${maximumAction}`),'adaptive USER ACTION marker must remain exact and final');

const mandatoryEvents=denseEvents.map((event,index)=>({...event,importance:4,id:`mandatory-${index}`}));
const scheduledSave={...denseSave,scheduleContext:{...denseSave.scheduleContext,due:mandatoryEvents.slice(0,4),upcoming:mandatoryEvents},scheduledEvents:mandatoryEvents,routerFeedback:{routerVersion:'1.5.6-hf1',profile:'scheduled-18k-v154',lastInputTokens:100000}};
const scheduledRouted=routeOpenAIParams({instructions,input:denseOriginalInput},{mode:'game',incoming:{action:maximumAction,rollingSummary:'dense old '.repeat(1000),recentTurns:[],saveState:scheduledSave}});
assert.equal(scheduledRouted.telemetry.profile,'scheduled-18k-v154');
assert.equal(scheduledRouted.telemetry.adaptive_scale,.76,'scheduled fixture must exercise the minimum supported adaptive scale');
assert.ok(scheduledRouted.params.input.length<=7220,`adaptive scheduled input exceeded its 0.76 profile budget: ${scheduledRouted.params.input.length}`);
assert.match(scheduledRouted.params.input,/IMMEDIATE EVENT FACTS \(HARD DATA\)/);
assert.match(scheduledRouted.params.input,/"id":"mandatory-0"/,'adaptive scheduled pressure must retain the first mandatory occurrence');
assert.match(scheduledRouted.params.input,/대도서관으로 간다\./,'adaptive scheduled pressure must retain the committed USER ACTION predicate');

const aftermath=source.indexOf("AFTERMATH_FIXED_FLOW");
const combat=source.indexOf("ACTIVE_COMBAT_FIXED_FLOW");
const momentum=source.indexOf('const momentumDue=momentumPressure');
assert.ok(aftermath>=0&&aftermath<momentum,'aftermath fixed-flow guard must precede momentum random selection');
assert.ok(combat>=0&&combat<momentum,'active-combat fixed-flow guard must precede momentum random selection');

console.log('PASS Context Router Diet priority (exact USER ACTION + hard facts + schedule, no narrative control tail)');
