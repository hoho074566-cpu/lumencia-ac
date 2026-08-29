#!/usr/bin/env node

import assert from 'node:assert/strict';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
guide=Guide
===== WORLD CANON =====
${divider}
Academy
${divider}
Public facts.
===== NPC CANON =====
${divider}
Guide
${divider}
- Identity: canonical guide.
===== NPC SPEECH =====
${divider}
Guide
${divider}
- Brief and calm.
===== PC SYSTEM =====
${divider}
Rules
${divider}
Resolve actions.`;
const originalInput=`===== TURN OPTIONS =====
normal
===== AUTHORITATIVE SAVE_STATE =====
{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
DIRECTOR_SENTINEL=DROP
===== SCHEDULE ENGINE (AUTHORITATIVE) =====
SCHEDULE_SENTINEL=DROP`;
const suffix='대도서관으로 간다.';
const action=`${'최대 행동 압력 '.repeat(900)}`.slice(0,5000-suffix.length)+suffix;
const saveState={
  turnNumber:8,
  world:{date:'1285-03-01',time:'09:00',location:'SAVE_WORLD_SENTINEL'},
  pc:{name:'SAVE_PC_SENTINEL',department:'기사과'},
  sceneRuntime:{participants:['guide'],purpose:{focus:'PURPOSE_DROP'},exit_condition:{target:'EXIT_DROP'},turn_hook:{anchor:'HOOK_DROP'}},
  scheduleContext:{due:[],upcoming:[{id:'schedule-1',title:'필수 일정',date:'1285-03-01',time:'12:00',location:'다른 장소',participants:['guide'],note:'NOTE_DROP'}]},
  routerFeedback:{routerVersion:'1.5.6-hf1',profile:'routine-17k-v154',lastInputTokens:100000},
};
const routed=routeOpenAIParams({instructions,input:originalInput},{mode:'game',incoming:{action,rollingSummary:'old '.repeat(5000),recentTurns:[],saveState}});

assert.equal(routed.telemetry.adaptive_scale,.76);
assert.ok(routed.params.input.length<=6840,`adaptive Thin Scene Packet exceeded budget: ${routed.params.input.length}`);
assert.match(routed.params.input,/THIN SCENE PACKET — CURRENT FACTS/);
assert.match(routed.params.input,/SAVE_WORLD_SENTINEL/);
assert.match(routed.params.input,/SAVE_PC_SENTINEL/);
for(const forbidden of ['DIRECTOR_SENTINEL','SCHEDULE_SENTINEL','NOTE_DROP','PURPOSE_DROP','EXIT_DROP','HOOK_DROP','GM EVENT DIRECTOR','SCHEDULE ENGINE','SCENE MOMENTUM','TURN HOOK'])assert.equal(routed.params.input.includes(forbidden),false,`${forbidden} leaked under pressure`);
assert.ok(routed.params.input.endsWith(action),'the full 5,000-character USER ACTION must remain exact at the authority tail');
assert.ok(routed.params.input.lastIndexOf('===== USER ACTION — EXACT ORIGINAL TEXT =====')>routed.params.input.lastIndexOf('THIN SCENE PACKET'),'USER ACTION must be the final authority');

console.log('PASS Context Router R2 authority tail and pressure isolation');
