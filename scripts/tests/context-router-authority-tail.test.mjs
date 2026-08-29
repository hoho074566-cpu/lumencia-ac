#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeRoutedInput, routeOpenAIParams } from '../../api/lib/context-router.js';

const optionalContext=`===== OPTIONAL SCENE FACTS =====\n${'OPTIONAL_CONTEXT_'.repeat(1400)}`;
const hardFacts='===== THIN SCENE PACKET — HARD FACTS =====\n{"pc_identity":{"canonical_name":"Tester"}}';
const actionBlock='===== USER ACTION — EXACT PLAYER TEXT =====\n돌아다닌다.';
const text=composeRoutedInput({saveState:hardFacts,optionalContext,actionBlock,inputChars:9000});
assert.ok(text.length<=9000,`routed input must respect routine budget: ${text.length}`);
assert.ok(text.length<optionalContext.length,'oversized optional context must be clipped');
assert.match(text,/THIN SCENE PACKET — HARD FACTS/);
assert.ok(text.endsWith(actionBlock),'USER ACTION must remain the final authority');

const source=readFileSync('api/lib/context-router.js','utf8');
assert.match(source,/function compactClockFacts\(/,'clock facts must be structurally compacted');
assert.match(source,/function buildCharacterPackets\(/,'causal character facts must be structurally compacted');
assert.doesNotMatch(source,/const authorityTail=fitAuthorityTail\(/,'legacy Director/schedule authority tail must not be assembled');

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
${divider}\nRules\n${divider}\n이름: 카일 (임시)\nAaa.`;
const originalInput=`===== TURN OPTIONS =====
normal
===== AUTHORITATIVE SAVE_STATE =====
{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
DIRECTOR_SENTINEL=KEEP
===== SCHEDULE ENGINE (AUTHORITATIVE) =====
SCHEDULE_SENTINEL`;
const suffix='도서관에 간다.';
const action=`${'긴 행동 설명 '.repeat(700)}`.slice(0,5000-suffix.length)+suffix;
const saveState={
  turnNumber:8,
  world:{date:'1285-03-01',time:'09:00',location:'SAVE_WORLD_SENTINEL'},
  pc:{name:'SAVE_PC_SENTINEL',department:'기사과'},
  npcStates:{guide:{location:'hall'}},
  sceneRuntime:{participants:['guide'],purpose:{focus:'PURPOSE_RUNTIME_SENTINEL'},exit_condition:{target:'EXIT_RUNTIME_SENTINEL'},turn_hook:{anchor:'TURN_HOOK_RUNTIME_SENTINEL'}},
  scheduleContext:{due:[{id:'SCHEDULE_SENTINEL',title:'ceremony',note:'NOTE_SENTINEL',time:'09:10',location:'other hall',participants:['guide']}],npc_schedule:{guide:{commitment:'fixed class',confidence:'fixed'}}},
};
const routed=routeOpenAIParams({instructions,input:originalInput},{mode:'game',incoming:{action,recentTurns:[],saveState}});
assert.ok(routed.params.input.length<=9000,`long-action routine input exceeded budget: ${routed.params.input.length}`);
assert.match(routed.params.input,/THIN SCENE PACKET — HARD FACTS/);
assert.match(routed.params.input,/SAVE_WORLD_SENTINEL/);
assert.match(routed.params.input,/SAVE_PC_SENTINEL/);
assert.ok(routed.params.input.endsWith(action),'5,000-character USER ACTION must remain exact and final');
for(const hidden of ['DIRECTOR_SENTINEL','SCHEDULE_SENTINEL','NOTE_SENTINEL','fixed class','PURPOSE_RUNTIME_SENTINEL','EXIT_RUNTIME_SENTINEL','TURN_HOOK_RUNTIME_SENTINEL','GM EVENT DIRECTOR','SCENE MOMENTUM','SCENE PURPOSE','SCENE EXIT','TURN HOOK']){
  assert.equal(routed.params.input.includes(hidden),false,`${hidden} must remain internal`);
}
assert.equal(routed.params.instructions.includes('카일'),false,'static PC example identity must be excluded');
assert.equal(routed.params.instructions.includes('Aaa'),false,'static PC placeholder must be excluded');

const adaptiveSave={...saveState,routerFeedback:{routerVersion:'p3-pr01r-thin-scene-packet-v1',profile:'routine-17k-v154',lastInputTokens:100000}};
const adaptive=routeOpenAIParams({instructions,input:originalInput},{mode:'game',incoming:{action,recentTurns:[],saveState:adaptiveSave}});
assert.equal(adaptive.telemetry.adaptive_scale,.76);
assert.ok(adaptive.params.input.length<=6840,`adaptive input exceeded budget: ${adaptive.params.input.length}`);
assert.ok(adaptive.params.input.endsWith(action),'adaptive pressure must not clip the exact USER ACTION');

const aftermath=source.indexOf('AFTERMATH_FIXED_FLOW');
const combat=source.indexOf('ACTIVE_COMBAT_FIXED_FLOW');
const momentum=source.indexOf('const momentumDue=momentumPressure');
assert.ok(aftermath>=0&&aftermath<momentum,'internal aftermath guard ordering changed');
assert.ok(combat>=0&&combat<momentum,'internal active-combat guard ordering changed');

console.log('PASS P3-PR01R thin-packet authority tail and context-pressure regressions');
