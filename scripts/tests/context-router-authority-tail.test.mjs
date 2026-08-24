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
const reservedContext='===== SCENE MOMENTUM HF1 =====\nINTENT=travel\nMOMENTUM_SENTINEL=KEEP\n\n===== SCENE PURPOSE V1 =====\nPURPOSE_SENTINEL=KEEP';
const actionBlock='===== USER ACTION =====\n돌아다닌다.\n\n의미적 목표를 완료한다.';
const text=composeRoutedInput({optionalContext,reservedContext,authorityTail,actionBlock,inputChars:9000});

assert.ok(text.length<=9000,`routed input must respect routine budget: ${text.length}`);
assert.ok(text.length<optionalContext.length,'oversized optional context must be clipped');
assert.match(text,/===== SCENE MOMENTUM HF1 =====/);
assert.match(text,/INTENT=travel/);
assert.match(text,/MOMENTUM_SENTINEL=KEEP/,'reserved Scene Momentum payload must survive prefix pressure');
assert.match(text,/===== SCENE PURPOSE V1 =====/);
assert.match(text,/PURPOSE_SENTINEL=KEEP/,'reserved Scene Purpose payload must survive prefix pressure');
assert.match(text,/===== GM EVENT DIRECTOR \(ROUTED\) =====/);
assert.match(text,/DIRECTOR_SENTINEL=KEEP/);
assert.match(text,/===== EVENT DIRECTOR V2\.1 \(ROUTED\) =====/);
assert.match(text,/DIRECTOR_V2_SENTINEL=KEEP/);
assert.match(text,/===== SCHEDULE ENGINE \(ROUTED\) =====/);
assert.match(text,/SCHEDULE_SENTINEL/,'authoritative schedule payload must survive prefix pressure');
assert.ok(text.endsWith(actionBlock),'USER ACTION must remain the final authoritative turn instruction');

const source=readFileSync('api/lib/context-router.js','utf8');
assert.match(source,/function compactScheduleAuthority\(/,'schedule authority must be structurally compacted before reservation');
assert.match(source,/const authorityTail=`===== GM EVENT DIRECTOR \(ROUTED\) =====/,'buildInput must create a reserved authority tail');
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
const routed=routeOpenAIParams({instructions,input:originalInput},{mode:'game',incoming:{action:longAction,rollingSummary:'old '.repeat(5000),recentTurns:[],saveState:{turnNumber:8,world:{date:'1285-03-01',time:'09:00',location:'SAVE_WORLD_SENTINEL'},pc:{name:'SAVE_PC_SENTINEL'},npcStates:{guide:{location:'hall'}},sceneRuntime:{participants:['guide'],purpose:{version:'1.0',kind:'interaction',focus:'PURPOSE_RUNTIME_SENTINEL',source:'npc-interaction',established_turn:8},momentum:{stall_streak:2}},scheduleContext:{due:[{id:'SCHEDULE_SENTINEL',title:'ceremony',note:'NOTE_SENTINEL',time:'09:10',participants:['guide']}],npc_schedule:{guide:{location:'hall',activity:'class',commitment:'fixed class',confidence:'fixed',time:'09:10'}}}}}});
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
assert.match(routed.params.input,/도서관에 간다\./,'the bounded USER ACTION must retain its committed travel predicate');
assert.ok(routed.params.input.lastIndexOf('===== USER ACTION =====')>routed.params.input.lastIndexOf('===== SCHEDULE ENGINE (ROUTED) ====='),'USER ACTION marker must remain final');

const aftermath=source.indexOf("AFTERMATH_FIXED_FLOW");
const combat=source.indexOf("ACTIVE_COMBAT_FIXED_FLOW");
const momentum=source.indexOf('const momentumDue=momentumPressure');
assert.ok(aftermath>=0&&aftermath<momentum,'aftermath fixed-flow guard must precede momentum random selection');
assert.ok(combat>=0&&combat<momentum,'active-combat fixed-flow guard must precede momentum random selection');

console.log('PASS Context Router authority-tail reservation (9k budget preserves momentum + director + schedule payload)');
