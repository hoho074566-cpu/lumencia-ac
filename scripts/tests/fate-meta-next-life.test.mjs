#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { applyEndingReceipts, inspectFateBook, normalizeFateBook } from '../../lib/fate-ending.js';
import {
  emptyInheritanceMeta,
  inheritanceBalance,
  inspectInheritanceMeta,
  inspectRunInheritance,
  prepareCanonicalProgressionImport,
  prepareInheritanceNextLife,
  purchaseNextLifeSerialized,
} from '../../lib/fate-inheritance.js';

const NPCS=['artemis','lillia'];
const at='2026-08-28T04:00:00.000Z';
const baseRun=(id)=>({id,world:{date:'1285-03-01',time:'08:40'},creation:{mode:'free',fateStart:null},pc:{gold:0,inventory:[],stats:{},talents:{}},relationships:{}});
const ending=(book=null,id='general.graduation',now=at)=>applyEndingReceipts({
  fateBook:book,receipts:[{ending_id:id,terminal_outcome:'life_complete',irreversible:true}],stateDelta:{completed_events_add:[`ending:${id}`]},runId:'run-ended',turnNumber:12,mode:'game',now,
}).fateBook;
const request=(overrides={})=>({
  gender:'female',socialClass:'commoner',department:'마법과 1학년',originSeed:'next-life-seed',originLocks:{region:'',occupation:''},
  allocations:[{kind:'stat',target:'mana',units:1},{kind:'resource',target:'gold',units:1}],...overrides,
});

// A/B/I — first discovery is immutable earned authority and duplicates never farm.
const firstResult=applyEndingReceipts({fateBook:null,receipts:[{ending_id:'general.graduation',terminal_outcome:'life_complete',irreversible:true}],stateDelta:{completed_events_add:['ending:general.graduation']},runId:'run-a',turnNumber:1,mode:'game',now:at});
const repeated=applyEndingReceipts({fateBook:firstResult.fateBook,receipts:[{ending_id:'general.graduation',terminal_outcome:'life_complete',irreversible:true}],stateDelta:{completed_events_add:['ending:general.graduation']},runId:'run-b',turnNumber:1,mode:'game',now:'2026-08-29T04:00:00.000Z'});
assert.equal(firstResult.acceptedDiscoveries.length,1);
assert.equal(repeated.acceptedDiscoveries.length,0);
assert.equal(repeated.fateBook.rewardTotal,3);

// C — a renamed/retired Ending remains historical earned accounting authority.
const retiredBook=normalizeFateBook({version:2,rewardLedger:{'retired.ending':{receiptId:'earned:retired.ending',discoveryId:'retired.ending',source:'ending:first-discovery:retired.ending',amount:7,grantedAt:at}},discoveries:{'retired.ending':{discoveryId:'retired.ending',title:'retired',reward:7,discoveredAt:at}}});
assert.equal(inspectFateBook(retiredBook).valid,true);
assert.equal(retiredBook.rewardTotal,7);
const retiredPurchase=prepareInheritanceNextLife({fateBook:retiredBook,inheritanceMeta:emptyInheritanceMeta(),sourceRun:{...baseRun('retired-source'),completedEvents:['ending:retired.ending']},nextRunBase:baseRun('retired-life'),request:request({allocations:[{kind:'resource',target:'gold',units:1}]}),allowedAffinityKeys:NPCS,now:at,receiptId:'purchase:retired'});
assert.equal(inheritanceBalance(retiredBook,retiredPurchase.inheritanceMeta).valid,true,'retirement must not make an existing spend overspent');

// D/H/K — historical spent receipt, actual application, final realm recalculation.
const initialMeta=emptyInheritanceMeta(),source={...baseRun('source-run'),completedEvents:['ending:general.graduation']},next=baseRun('next-run');
const prepared=prepareInheritanceNextLife({fateBook:firstResult.fateBook,inheritanceMeta:initialMeta,sourceRun:source,nextRunBase:next,request:request(),allowedAffinityKeys:NPCS,now:at,receiptId:'purchase:first'});
assert.equal(prepared.balance.earned,3);
assert.equal(prepared.balance.spent,2);
assert.equal(prepared.nextRun.pc.gold,50);
assert.equal(prepared.nextRun.creation.mode,'fate');
assert.match(prepared.nextRun.pc.realm,/서클$/);
assert.equal(inspectRunInheritance(prepared.nextRun,prepared.inheritanceMeta).valid,true);
assert.equal(inspectInheritanceMeta(prepared.inheritanceMeta).valid,true,'historical receipt inspection must not use a current target allowlist');

const affinityBook=ending(firstResult.fateBook,'world.academy','2026-08-28T05:00:00.000Z');
const affinityPurchase=prepareInheritanceNextLife({fateBook:affinityBook,inheritanceMeta:emptyInheritanceMeta(),sourceRun:source,nextRunBase:baseRun('affinity-life'),request:request({allocations:[{kind:'affinity',target:'artemis',units:1}]}),allowedAffinityKeys:NPCS,now:at,receiptId:'purchase:affinity'});
assert.equal(affinityPurchase.nextRun.relationships.artemis.affinity,5);
assert.equal(inspectInheritanceMeta(affinityPurchase.inheritanceMeta).valid,true,'removed current NPC eligibility must not delete a historical receipt');
assert.throws(()=>prepareInheritanceNextLife({fateBook:affinityBook,inheritanceMeta:emptyInheritanceMeta(),sourceRun:source,nextRunBase:baseRun('removed-target-life'),request:request({allocations:[{kind:'affinity',target:'artemis',units:1}]}),allowedAffinityKeys:[],now:at,receiptId:'purchase:removed'}),/구매할 수 없음/);
const removedHistoricalImport=prepareCanonicalProgressionImport({currentFateBook:firstResult.fateBook,currentInheritanceMeta:emptyInheritanceMeta(),incomingFateBook:affinityBook,incomingInheritanceMeta:affinityPurchase.inheritanceMeta,incomingRun:affinityPurchase.nextRun,allowedCharacterKeys:[]});
assert.equal(removedHistoricalImport.inheritanceMeta.spent,2,'current allowlist removal must not invalidate committed historical affinity accounting');

const broadAllocation=prepareInheritanceNextLife({fateBook:affinityBook,inheritanceMeta:emptyInheritanceMeta(),sourceRun:source,nextRunBase:baseRun('broad-life'),request:request({allocations:[{kind:'stat',target:'mana',units:1},{kind:'talent',target:'magic',units:1},{kind:'resource',target:'gold',units:1},{kind:'resource',target:'supplies',units:1}]}),allowedAffinityKeys:NPCS,now:at,receiptId:'purchase:broad'});
assert.equal(broadAllocation.nextRun.pc.gold,50);assert.ok(broadAllocation.nextRun.pc.inventory.includes('계승 보급품 ×1'));assert.ok(broadAllocation.nextRun.creation.fateStart.origin.talents.magic>=2);assert.equal(broadAllocation.receipt.cost,5);
const circleRecalculated=prepareInheritanceNextLife({fateBook:affinityBook,inheritanceMeta:emptyInheritanceMeta(),sourceRun:source,nextRunBase:baseRun('circle-life'),request:request({allocations:[{kind:'stat',target:'mana',units:3}]}),allowedAffinityKeys:NPCS,now:at,receiptId:'purchase:circle'});
assert.match(circleRecalculated.nextRun.pc.realm,/^[2-5]서클$/,'Circle must be recalculated only after inherited axes are applied');assert.equal(circleRecalculated.receipt.cost,6,'progressive stat costs must be 1 + 2 + 3');

// E — stale non-divergent import preserves the newer canonical progression.
const staleImport=prepareCanonicalProgressionImport({currentFateBook:affinityBook,currentInheritanceMeta:affinityPurchase.inheritanceMeta,incomingFateBook:firstResult.fateBook,incomingInheritanceMeta:emptyInheritanceMeta(),incomingRun:baseRun('stale-run'),allowedCharacterKeys:NPCS});
assert.equal(staleImport.inheritanceMeta.spent,2);
assert.equal(staleImport.fateBook.rewardTotal,9);
assert.deepEqual(staleImport.relations,{fate:'incoming-subset',inheritance:'incoming-subset'});

// F — malformed receipt + surviving benefit is rejected atomically.
const malformed=structuredClone(affinityPurchase.inheritanceMeta);
malformed.purchaseReceipts['purchase:affinity'].cost=99;
assert.throws(()=>prepareCanonicalProgressionImport({currentFateBook:firstResult.fateBook,currentInheritanceMeta:emptyInheritanceMeta(),incomingFateBook:affinityBook,incomingInheritanceMeta:malformed,incomingRun:affinityPurchase.nextRun,allowedCharacterKeys:NPCS}),/import 거부/);
assert.equal(inspectRunInheritance(affinityPurchase.nextRun,emptyInheritanceMeta()).valid,false,'a run benefit without canonical spend must never be accepted');
const alteredBenefit=structuredClone(affinityPurchase.nextRun);alteredBenefit.inheritance.benefitDigest='fnv1a:00000000';
assert.throws(()=>prepareCanonicalProgressionImport({currentFateBook:affinityBook,currentInheritanceMeta:affinityPurchase.inheritanceMeta,incomingFateBook:affinityBook,incomingInheritanceMeta:affinityPurchase.inheritanceMeta,incomingRun:alteredBenefit,allowedCharacterKeys:NPCS}),/partial import/);

// G — independent spent branches are divergent; automatic union is forbidden.
const branchA=prepareInheritanceNextLife({fateBook:affinityBook,inheritanceMeta:emptyInheritanceMeta(),sourceRun:source,nextRunBase:baseRun('branch-a'),request:request({allocations:[{kind:'resource',target:'gold',units:1}]}),allowedAffinityKeys:NPCS,now:at,receiptId:'purchase:branch-a'});
const branchB=prepareInheritanceNextLife({fateBook:affinityBook,inheritanceMeta:emptyInheritanceMeta(),sourceRun:source,nextRunBase:baseRun('branch-b'),request:request({allocations:[{kind:'resource',target:'supplies',units:1}]}),allowedAffinityKeys:NPCS,now:at,receiptId:'purchase:branch-b'});
assert.throws(()=>prepareCanonicalProgressionImport({currentFateBook:affinityBook,currentInheritanceMeta:branchA.inheritanceMeta,incomingFateBook:affinityBook,incomingInheritanceMeta:branchB.inheritanceMeta,incomingRun:branchB.nextRun,allowedCharacterKeys:NPCS}),/divergent/);
assert.equal(inheritanceBalance(affinityBook,branchA.inheritanceMeta).valid,true);
assert.equal(inheritanceBalance(affinityBook,branchB.inheritanceMeta).valid,true);
const divergentEarnedA=ending(firstResult.fateBook,'world.academy','2026-08-28T06:00:00.000Z'),divergentEarnedB=ending(firstResult.fateBook,'general.honors','2026-08-28T06:00:00.000Z');
assert.throws(()=>prepareCanonicalProgressionImport({currentFateBook:divergentEarnedA,currentInheritanceMeta:emptyInheritanceMeta(),incomingFateBook:divergentEarnedB,incomingInheritanceMeta:emptyInheritanceMeta(),incomingRun:baseRun('divergent-earned'),allowedCharacterKeys:NPCS}),/divergent/);

// H — one same-device serialized Next Life wins; the rejected request commits no benefit.
let canonical={sourceRun:source,fateBook:firstResult.fateBook,inheritanceMeta:emptyInheritanceMeta(),run:source},tail=Promise.resolve(),commits=0;
const withLock=(task)=>{const result=tail.then(task);tail=result.catch(()=>{});return result;};
const purchase=(receiptId,nextId)=>purchaseNextLifeSerialized({
  withLock,readCanonical:()=>canonical,sourceRunId:'source-run',makeNextRun:()=>baseRun(nextId),request:request({allocations:[{kind:'resource',target:'gold',units:2}]}),allowedAffinityKeys:NPCS,now:at,receiptId,
  commitCanonical:(value)=>{canonical={sourceRun:value.nextRun,fateBook:value.fateBook,inheritanceMeta:value.inheritanceMeta,run:value.nextRun};commits+=1;},
});
const results=await Promise.allSettled([purchase('purchase:race-a','race-a'),purchase('purchase:race-b','race-b')]);
assert.equal(results.filter((row)=>row.status==='fulfilled').length,1);
assert.equal(results.filter((row)=>row.status==='rejected').length,1);
assert.equal(commits,1);
assert.equal(Object.keys(canonical.inheritanceMeta.purchaseReceipts).length,1);
assert.equal(inspectRunInheritance(canonical.run,canonical.inheritanceMeta).valid,true);
assert.equal(inheritanceBalance(canonical.fateBook,canonical.inheritanceMeta).valid,true);

// J — incompatible origin locks fail loudly; Realm/Circle has no purchase path.
const locked=prepareInheritanceNextLife({fateBook:affinityBook,inheritanceMeta:emptyInheritanceMeta(),sourceRun:source,nextRunBase:baseRun('locked-life'),request:request({originLocks:{region:'north',occupation:'hunter'},allocations:[{kind:'origin_lock',target:'region:north',units:1},{kind:'origin_lock',target:'occupation:hunter',units:1}]}),allowedAffinityKeys:NPCS,now:at,receiptId:'purchase:locked'});
assert.equal(locked.nextRun.creation.fateStart.origin.regionKey,'north');assert.equal(locked.nextRun.creation.fateStart.origin.occupationKey,'hunter');
assert.throws(()=>prepareInheritanceNextLife({fateBook:affinityBook,inheritanceMeta:emptyInheritanceMeta(),sourceRun:source,nextRunBase:baseRun('bad-lock'),request:request({originLocks:{region:'north',occupation:'dockhand'},allocations:[{kind:'origin_lock',target:'region:north',units:1},{kind:'origin_lock',target:'occupation:dockhand',units:1}]}),allowedAffinityKeys:NPCS,now:at,receiptId:'purchase:bad-lock'}),/양립하지 않음/);
assert.throws(()=>prepareInheritanceNextLife({fateBook:affinityBook,inheritanceMeta:emptyInheritanceMeta(),sourceRun:source,nextRunBase:baseRun('realm-buy'),request:request({allocations:[{kind:'realm',target:'circle',units:1}]}),allowedAffinityKeys:NPCS,now:at,receiptId:'purchase:realm'}),/직접 구매/);

const app=readFileSync('app.js','utf8'),runtime=readFileSync('app-runtime.js','utf8'),worker=readFileSync('sw.js','utf8'),inheritanceSource=readFileSync('lib/fate-inheritance.js','utf8');
assert.match(app,/navigator\.locks\.request\(META_PROGRESSION_LOCK/,'same-origin purchases must use the canonical Web Lock');
assert.match(app,/commitRunFateAndInheritance\(localStorage,RUN_COMMIT_KEYS/,'receipt, meta, and run benefit must share one rollback journal boundary');
assert.match(app,/prepareCanonicalProgressionImport\([\s\S]*incomingInheritanceMeta:importedMeta/,'save import must use fail-closed progression validation');
assert.match(app,/await commitTurnState\(stagedTurn,runOwner\)/,'direct async turns must await the ownership commit boundary');
assert.match(runtime,/await commitTurnState\(stagedTurn, runOwner\)/,'stable async turns must await the same ownership commit boundary');
assert.match(worker,/\/lib\/fate-inheritance\.js/,'offline runtime must include the canonical Inheritance module');
assert.doesNotMatch(inheritanceSource,/new OpenAI|responses\.create|chat\.completions|CRDT|event sourcing/,'STAB-02R must not add a model call or generic sync architecture');

console.log('PASS STAB-02R canonical historical receipts, fail-closed imports, serialized purchase, Origin locks, and applied Next Life');
