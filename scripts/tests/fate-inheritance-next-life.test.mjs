#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ASSETS } from '../../assets.js';
import { normalizeFateBook } from '../../lib/fate-ending.js';
import {
  commitInheritancePurchase,
  inheritancePointSummary,
  inheritanceRuntimeSnapshot,
  normalizeInheritanceAllocation,
  quoteInheritanceAllocation,
  reconcileInheritanceStates,
} from '../../lib/fate-inheritance.js';
import {
  createFreeCharacterCreation,
  evaluateFateStartingRealm,
  fateOriginLockOptions,
  generateFateStartingCharacter,
  normalizeCharacterCreation,
} from '../../lib/fate-start.js';

const npcKeys=Object.keys(ASSETS.characters||{}),options={allowedNpcKeys:npcKeys,allowedCharacterKeys:npcKeys};
const fateBook=normalizeFateBook({discoveredIds:['general.honors','world.secret','world.transcendence','world.demon_cult']},{allowedCharacterKeys:npcKeys});
assert.equal(fateBook.rewardTotal,5+10+9+8,'only canonical first-discovery Ending rewards may create inheritance-point authority');
assert.equal(normalizeFateBook({discoveredIds:['general.honors','general.honors']},{allowedCharacterKeys:npcKeys}).rewardTotal,5,'duplicate Ending IDs must not farm inheritance points');

const allocation=normalizeInheritanceAllocation({
  stats:{mana:2},
  talents:{magic:2},
  startingResources:1,
  fateAffinity:{npcKey:'artemis',level:1},
  originRerolls:1,
  originLocks:{regionKey:'south',occupationKey:'dockhand'},
},options);
const quote=quoteInheritanceAllocation(allocation,options);
assert.equal(quote.breakdown.stats,6,'stat costs must rise progressively');
assert.equal(quote.breakdown.talents,6,'talent costs must rise progressively');
assert.equal(quote.breakdown.startingResources,1);
assert.equal(quote.breakdown.fateAffinity,2);
assert.equal(quote.breakdown.originRerolls,1);
assert.equal(quote.breakdown.originLocks,5);
assert.equal(quote.cost,21);
assert.ok(quoteInheritanceAllocation({...allocation,stats:{...allocation.stats,body:2}},options).cost>quoteInheritanceAllocation({...allocation,stats:{...allocation.stats,body:1}},options).cost,'a second boost must cost more than the first');
assert.throws(()=>quoteInheritanceAllocation({...allocation,realm:'마스터'},options),/Realm \/ Circle/,'Realm must not be directly purchasable');
assert.throws(()=>quoteInheritanceAllocation({...allocation,circle:5},options),/Realm \/ Circle/,'Circle must not be directly purchasable');
assert.throws(()=>quoteInheritanceAllocation({...allocation,fateAffinity:{npcKey:'not_registered',level:1}},options),/등록된 NPC/,'Fate Affinity must use a canonical NPC');

const firstCommit=commitInheritancePurchase(null,{fateBook,allocation,lifeId:'life-2',sourceRunId:'life-1',now:'2026-08-28T04:00:00.000Z',...options});
assert.equal(firstCommit.purchase.cost,quote.cost);
assert.deepEqual(firstCommit.purchase.rewardSources,Object.keys(fateBook.rewardLedger).sort(),'the purchase must cite STAB-01 canonical first-discovery sources');
assert.deepEqual(inheritancePointSummary(firstCommit.state,fateBook,options),{
  earned:32,spent:21,available:11,overspent:0,rewardSources:Object.keys(fateBook.rewardLedger).sort(),
});
assert.deepEqual(inheritanceRuntimeSnapshot(firstCommit.state,fateBook,options),{version:1,earned:32,spent:21,available:11,lifeCount:1});

const idempotent=commitInheritancePurchase(firstCommit.state,{fateBook,allocation,lifeId:'life-2',sourceRunId:'life-1',...options});
assert.equal(idempotent.reused,true);
assert.equal(idempotent.state.purchaseOrder.length,1,'the same Next Life receipt must not spend twice');
assert.throws(()=>commitInheritancePurchase(firstCommit.state,{fateBook,allocation,lifeId:'life-3',...options}),/계승 포인트 부족/,'the ledger must reject purchases beyond canonical available points');

const staleImported={version:1,purchases:{},purchaseOrder:[]};
const reconciled=reconcileInheritanceStates(firstCommit.state,staleImported,options);
assert.deepEqual(reconciled,firstCommit.state,'an old save with no meta ledger must not delete newer inheritance spending');
const staleSubset={version:1,purchases:{'life-2':firstCommit.purchase},purchaseOrder:['life-2']};
assert.deepEqual(reconcileInheritanceStates(firstCommit.state,staleSubset,options),firstCommit.state,'a stale subset must not roll back the live ledger');
const historicalNpcState={version:1,purchases:{'old-life':{lifeId:'old-life',cost:2,allocation:{fateAffinity:{npcKey:'retired_canonical_npc',level:1}}}},purchaseOrder:['old-life']};
assert.equal(reconcileInheritanceStates(historicalNpcState,null,options).purchases['old-life'].cost,2,'a later registry change must not delete the cost of a historically valid purchase');
assert.throws(()=>commitInheritancePurchase(null,{fateBook,allocation,lifeId:'__proto__',...options}),/유효한 Next Life/,'prototype keys must never enter the meta ledger');

const commonerOptions=fateOriginLockOptions({socialClass:'commoner'});
assert.ok(commonerOptions.regions.some((row)=>row.key==='south'));
assert.ok(commonerOptions.occupations.some((row)=>row.key==='dockhand'&&row.regionKey==='south'));
const southOptions=fateOriginLockOptions({socialClass:'commoner',regionKey:'south'});
assert.equal(southOptions.occupations.every((row)=>row.regionKey==='south'),true);

const seed='stab-02-life';
const baseline=generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'마법과 1학년',seed,inheritance:{originRerolls:1,originLocks:{regionKey:'south',occupationKey:'dockhand'}},inheritancePurchase:{lifeId:'baseline'},allowedNpcKeys:npcKeys});
const inherited=generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'마법과 1학년',seed,inheritance:allocation,inheritancePurchase:{lifeId:'life-2'},allowedNpcKeys:npcKeys});
const origin=inherited.creation.fateStart.origin,baseOrigin=baseline.creation.fateStart.origin;
assert.equal(origin.regionKey,'south');
assert.equal(origin.occupationKey,'dockhand');
assert.equal(origin.baseStats.mana,Math.min(5,baseOrigin.baseStats.mana+2));
assert.equal(origin.talents.magic,Math.min(5,baseOrigin.talents.magic+2));
assert.equal(inherited.pc.gold,25);
assert.ok(inherited.pc.inventory.includes('기초 여행 보급품'));
assert.equal(inherited.initialRelationships.artemis.affinity,2);
assert.equal(inherited.initialRelationships.artemis.trust,1);
assert.equal(inherited.creation.fateStart.version,3);
assert.equal(inherited.creation.fateStart.inheritance.lifeId,'life-2');
assert.equal(inherited.creation.fateStart.inheritance.cost,quote.cost);
assert.equal(inherited.pc.realm,evaluateFateStartingRealm(origin),'Realm/Circle must be recalculated from final inherited conditions');
assert.notEqual(inherited.pc.realm,'마스터');
assert.notEqual(inherited.pc.realm,'고서클');
assert.deepEqual(normalizeCharacterCreation(JSON.parse(JSON.stringify(inherited.creation))),inherited.creation,'applied inheritance must survive run save normalization');

const occupationOnly=generateFateStartingCharacter({gender:'male',socialClass:'commoner',department:'기사과 1학년',seed:'occupation-only',inheritance:{originLocks:{occupationKey:'dockhand'}},inheritancePurchase:{lifeId:'life-lock'},allowedNpcKeys:npcKeys});
assert.equal(occupationOnly.creation.fateStart.origin.regionKey,'south','an occupation-only lock must derive its one compatible region instead of being ignored');
assert.equal(occupationOnly.creation.fateStart.origin.occupationKey,'dockhand');
assert.throws(()=>generateFateStartingCharacter({gender:'male',socialClass:'commoner',department:'기사과 1학년',seed:'incompatible',inheritance:{originLocks:{regionKey:'north',occupationKey:'dockhand'}},inheritancePurchase:{lifeId:'bad'},allowedNpcKeys:npcKeys}),/양립할 수 없음/,'an incompatible region/occupation lock must fail visibly');
assert.throws(()=>generateFateStartingCharacter({gender:'male',socialClass:'commoner',department:'기사과 1학년',seed:'missing-life',inheritance:{startingResources:1},allowedNpcKeys:npcKeys}),/Next Life 식별자/,'inherited benefits must never exist without a durable Next Life receipt');

const rerollZero=generateFateStartingCharacter({gender:'male',socialClass:'fallen_noble',department:'일반학부 1학년',seed:'reroll-check'});
const rerollOne=generateFateStartingCharacter({gender:'male',socialClass:'fallen_noble',department:'일반학부 1학년',seed:'reroll-check',inheritance:{originRerolls:1},inheritancePurchase:{lifeId:'reroll-life'}});
assert.notEqual(rerollZero.creation.fateStart.origin.seedTag,rerollOne.creation.fateStart.origin.seedTag,'an Origin reroll must actually select a different deterministic draw');
assert.deepEqual(createFreeCharacterCreation(),{mode:'free',fateStart:null},'free creation must remain unchanged');

assert.equal(evaluateFateStartingRealm({department:'마법과 1학년',baseStats:{mana:5},talents:{magic:5}}),'3서클');
assert.equal(evaluateFateStartingRealm({department:'기사과 1학년',baseStats:{body:5},talents:{martial:5}}),'익스퍼트 중급');

const app=readFileSync('app.js','utf8'),runtime=readFileSync('app-runtime.js','utf8'),html=readFileSync('index.html','utf8'),serviceWorker=readFileSync('sw.js','utf8'),router=readFileSync('api/chat-router.js','utf8'),health=readFileSync('api/health.js','utf8');
assert.match(app,/const FATE_INHERITANCE_KEY = 'lumensia\.inheritance\.v1'/,'inheritance spending must persist outside replaceable run saves');
assert.match(app,/reconcileInheritanceStates\(loadJson\(FATE_INHERITANCE_KEY\), loadedRunSave\?\.inheritance/,'legacy/stale embedded meta state must reconcile with the live ledger');
assert.match(app,/format:'lumensia\.save\.bundle\.v3',save,fateBook,inheritance:inheritanceState/,'exports must carry both canonical meta ledgers');
assert.match(app,/fateBook=reconcileFateBooks\(fateBook,importedBook[\s\S]*inheritanceState=reconcileInheritanceStates\(inheritanceState,importedInheritance/,'imports must reconcile Fate Book authority before inheritance spending');
assert.match(app,/commitInheritancePurchase\(inheritanceState,\{fateBook,allocation,lifeId:base\.id/,'Fate Start must commit a bounded Next Life purchase');
assert.match(runtime,/fate inheritance import/,'the deployed runtime must rewrite the new module import');
assert.match(html,/다음 생 계승/);
assert.match(serviceWorker,/\/lib\/fate-inheritance\.js/,'offline runtime must cache the inheritance dependency');
assert.match(health,/fateInheritance:/,'health metadata must advertise the STAB-02 runtime');
assert.equal((router.match(/=>coreHandler\(/g)||[]).length,1,'STAB-02 must retain one canonical model call');
assert.doesNotMatch(readFileSync('lib/fate-inheritance.js','utf8'),/new OpenAI|responses\.create|chat\.completions|new RegExp/,'STAB-02 must add neither a model call nor a semantic parser');

console.log('PASS STAB-02 Inheritance / Next Life persistence, monotonic reconciliation, allocation, Origin compatibility, and final evaluation');
