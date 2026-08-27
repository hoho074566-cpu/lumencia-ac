#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  awardFirstEndingDiscovery,
  buildFateInheritanceDirective,
  createFateProgressionState,
  inheritanceGenerationOptions,
  inheritanceUpgradeCost,
  normalizeFateProgressionState,
  purchaseFateInheritance,
} from '../../lib/fate-inheritance.js';
import { generateFateStartingCharacter, normalizeCharacterCreation } from '../../lib/fate-start.js';

const empty=createFateProgressionState();
assert.equal(empty.points,0);
assert.deepEqual(normalizeFateProgressionState(undefined),empty,'legacy saves must gain an empty Fate progression ledger');

const firstEnding=awardFirstEndingDiscovery(empty,{id:'ending:academy-graduate',kind:'ending',discoveredAt:'1288-02-28'});
assert.equal(firstEnding.firstDiscovery,true);
assert.equal(firstEnding.awarded,4);
assert.equal(firstEnding.state.points,4);
const duplicate=awardFirstEndingDiscovery(firstEnding.state,{id:'ending:academy-graduate',kind:'ending'});
assert.equal(duplicate.firstDiscovery,false,'the same ending must never be farmable');
assert.equal(duplicate.awarded,0);
assert.equal(duplicate.state.points,4);
const deadEnding=awardFirstEndingDiscovery(duplicate.state,{id:'dead-ending:abyss-fall',kind:'dead_ending'});
assert.equal(deadEnding.awarded,2);
assert.equal(deadEnding.state.endingDiscoveries.length,2);

let bank=normalizeFateProgressionState({points:999,totalEarned:999});
assert.equal(inheritanceUpgradeCost(bank,{category:'stat',key:'body'}),2);
let purchase=purchaseFateInheritance(bank,{category:'stat',key:'body'});
assert.equal(purchase.ok,true); assert.equal(purchase.cost,2); bank=purchase.state;
assert.equal(inheritanceUpgradeCost(bank,{category:'stat',key:'body'}),4,'higher allocations must cost more');
purchase=purchaseFateInheritance(bank,{category:'stat',key:'body'}); bank=purchase.state;
assert.equal(purchase.cost,4);
purchase=purchaseFateInheritance(bank,{category:'talent',key:'martial'}); bank=purchase.state;
assert.equal(purchase.cost,3);
assert.equal(purchaseFateInheritance(bank,{category:'realm',key:'master'}).ok,false,'Realm/Circle must not be directly purchasable');
assert.equal(purchaseFateInheritance(empty,{category:'talent',key:'magic'}).reason,'insufficient-points');

let locks=normalizeFateProgressionState({points:20,totalEarned:20});
purchase=purchaseFateInheritance(locks,{category:'origin_lock',key:'regionKey',value:'north'}); locks=purchase.state;
assert.equal(purchase.cost,4);
assert.equal(inheritanceUpgradeCost(locks,{category:'origin_lock',key:'regionKey'}),0,'retargeting an owned Origin lock must remain free');
purchase=purchaseFateInheritance(locks,{category:'origin_lock',key:'regionKey',value:'south'}); locks=purchase.state;
assert.equal(purchase.cost,0);
assert.equal(locks.allocations.originLocks.regionKey,'south');
assert.equal(inheritanceUpgradeCost(locks,{category:'origin_lock',key:'occupationKey'}),8,'a second Origin lock must use the progressive slot cost');

const inheritedState=normalizeFateProgressionState({
  points:31,totalEarned:400,totalSpent:369,
  allocations:{
    stats:{body:6,mana:2}, talents:{martial:7,magic:2}, npcFateAffinity:{isabel:2}, startingResources:4,
    originRerolls:2, originLocks:{regionKey:'north',occupationKey:'hunter'}, skillAffinity:{'기초 검술':2},
  },
});
assert.deepEqual(inheritanceGenerationOptions(inheritedState,{rerollIndex:99}),{rerollIndex:2,originLocks:{regionKey:'north',occupationKey:'hunter'}});
const knight=generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'기사과 1학년',seed:'scan-2',inheritance:inheritedState});
assert.equal(knight.creation.fateStart.origin.regionKey,'north');
assert.equal(knight.creation.fateStart.origin.occupationKey,'hunter');
assert.equal(knight.pc.talents.martial,Math.min(10,knight.creation.fateStart.origin.talents.martial+7));
assert.equal(knight.pc.realm,'마스터','high final stats/talents may naturally recalculate the starting Realm');
assert.equal(knight.pc.gold,30);
assert.ok(knight.pc.inventory.includes('초급 회복 물약'));
assert.ok(knight.pc.inventory.includes('아카데미 보급권'));
assert.deepEqual(knight.pc.fateAffinities,{isabel:2});
assert.deepEqual(knight.pc.skillAffinities,{'기초 검술':2});
assert.equal(knight.creation.fateStart.inheritance.finalEvaluation.directRealmPurchase,false);
assert.equal(normalizeCharacterCreation(JSON.parse(JSON.stringify(knight.creation))).fateStart.inheritance.finalEvaluation.realm,'마스터','the applied inheritance receipt must survive save/load normalization');

const rerolled=generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'기사과 1학년',seed:'scan-2',inheritance:inheritedState,rerollIndex:1});
const clampedReroll=generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'기사과 1학년',seed:'scan-2',inheritance:inheritedState,rerollIndex:99});
const allowedReroll=generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'기사과 1학년',seed:'scan-2',inheritance:inheritedState,rerollIndex:2});
assert.notEqual(rerolled.creation.fateStart.origin.seedTag,knight.creation.fateStart.origin.seedTag,'purchased rerolls must produce a different deterministic Origin candidate');
assert.deepEqual(clampedReroll,allowedReroll,'rerolls beyond the purchased allowance must clamp');
assert.equal(rerolled.creation.fateStart.origin.regionKey,'north','rerolls must preserve purchased Origin locks');
assert.equal(rerolled.creation.fateStart.origin.occupationKey,'hunter');

const mage=generateFateStartingCharacter({gender:'male',socialClass:'fallen_noble',department:'마법과 1학년',seed:'mage-2',inheritance:normalizeFateProgressionState({allocations:{stats:{mana:6},talents:{magic:7}}})});
assert.equal(mage.pc.realm,'7서클','high final magic conditions may naturally recalculate Circle without a Circle purchase');
assert.equal(mage.creation.fateStart.inheritance.finalEvaluation.directRealmPurchase,false);

const directive=buildFateInheritanceDirective({creation:knight.creation});
assert.match(directive,/자동으로 지급하지 않는다/);
assert.match(directive,/Shared History로 해석하지 않는다/);
assert.match(directive,/직접 구매값이 아니라/);

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
isabel=이사벨
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Academy entrance ceremony.
===== NPC CANON =====
${divider}
Isabel
${divider}
Independent imperial princess.
===== NPC SPEECH =====
${divider}
Isabel
${divider}
Measured informal speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC
${divider}
Resolve declared actions.`;
const saveState={
  version:6,turnNumber:1,world:{date:'1285-03-01',time:'08:40',location:'대강당 앞'},creation:knight.creation,pc:knight.pc,
  relationships:{},intimacyStates:{},npcStates:{isabel:{location:'대강당 앞'}},emotionStates:{},npcInnerStates:{},activeEvents:[],completedEvents:[],pcKnowledge:[],memories:{global:[],npc:{}},hooks:[],scheduledEvents:[],director:{callbacks:[]},sceneRuntime:{participants:['isabel']},
};
const routed=routeOpenAIParams({instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},{incoming:{action:'이사벨에게 정중히 인사한다.',saveState,recentTurns:[]},mode:'game'});
assert.match(routed.params.input,/===== FATE INHERITANCE V1 =====/);
assert.match(routed.params.input,/npc_fate_affinity/);
assert.match(routed.params.input,/관계 수치, 호감, 성공, 정보, 선택 결과를 자동으로 지급하지 않는다/);
assert.equal(routed.telemetry.fate_inheritance_v1?.affinity_count,2);
assert.ok(routed.params.input.length<=9000,`inheritance routing exceeded the routine budget: ${routed.params.input.length}`);

const moduleSource=readFileSync('lib/fate-inheritance.js','utf8');
const appSource=readFileSync('app.js','utf8');
const runtimeSource=readFileSync('app-runtime.js','utf8');
const routerSource=readFileSync('api/lib/context-router.js','utf8');
const coreSource=readFileSync('api/chat-router.js','utf8');
assert.doesNotMatch(`${moduleSource}\n${routerSource}`,/responses\.create|chat\.completions|new OpenAI/,'P2-PR05 must not add a model call');
assert.equal((coreSource.match(/=>coreHandler\(/g)||[]).length,1,'the adapter must keep one canonical core call');
assert.match(appSource,/fateProgression: createFateProgressionState\(\)/,'new and legacy saves must own the persistent cross-run ledger');
assert.match(appSource,/base\.fateProgression=normalizeFateProgressionState\(save\.fateProgression\)/,'a new PC must retain prior-run progression');
assert.match(appSource,/inheritance:base\.fateProgression/,'Fate generation must consume the persistent ledger');
assert.match(runtimeSource,/"import \{ createFateProgressionState, normalizeFateProgressionState \} from '\.\/lib\/fate-inheritance\.js';"[\s\S]*?\/lib\/fate-inheritance\.js\?v=156[\s\S]*?'fate inheritance import'/,'the blob runtime must rewrite the inheritance module to an origin URL before import');
assert.equal(knight.creation.fateStart.background.strengthProfile.band,'advanced_start','inherited final conditions must refresh the persisted start-strength band');
const normalizedKnight=normalizeCharacterCreation(JSON.parse(JSON.stringify(knight.creation)));
assert.equal(normalizedKnight.fateStart.background.strengthProfile.band,'advanced_start','the inherited start-strength band must survive creation normalization');
const knightContext=routeOpenAIParams({instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},{incoming:{action:'기사과 신입 평가를 받는다.',saveState:{...saveState,creation:knight.creation,pc:knight.pc},recentTurns:[]},mode:'game'});
assert.match(knightContext.params.input,/advanced_start/,'routed Background authority must use inherited final conditions');
assert.doesNotMatch(knightContext.params.input,/foundation_start/,'routed Background authority must not retain the pre-inheritance beginner band');
assert.doesNotMatch(moduleSource,/endingDialog|fateBookDialog|Ending UI/,'P2-PR05 must not implement the P2-PR08 Ending/Fate Book UI');

console.log('fate-inheritance-progression: PASS');
