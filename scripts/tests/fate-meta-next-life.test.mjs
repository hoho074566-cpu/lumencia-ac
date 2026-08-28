#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ASSETS } from '../../assets.js';
import { applyEndingReceipts, inspectFateBook, normalizeFateBook } from '../../lib/fate-ending.js';
import {
  applyInheritanceReceipt,
  commitInheritancePurchase,
  createInheritancePurchase,
  createRunInheritance,
  inheritanceBalance,
  inspectInheritanceMeta,
  inspectRunInheritance,
  prepareCanonicalImport,
  quoteInheritanceAllocations,
} from '../../lib/fate-inheritance.js';
import { generateFateStartingCharacter, normalizeCharacterCreation, validateFateOriginLocks } from '../../lib/fate-start.js';

const npcKeys=Object.keys(ASSETS.characters||{});
const options={allowedCharacterKeys:npcKeys,allowedAffinityKeys:npcKeys};
const discover=(book,endingId,at)=>applyEndingReceipts({
  fateBook:book,
  receipts:[{ending_id:endingId,terminal_outcome:'life_complete',irreversible:true,reason:'확정된 종장',world_state:'academy'}],
  stateDelta:{completed_events_add:[`ending:${endingId}`]},allowedCharacterKeys:npcKeys,runId:`run-${at}`,turnNumber:100,mode:'game',now:at,
}).fateBook;

let book=discover(null,'character.companion:artemis','2026-08-01T00:00:00.000Z');
book=discover(book,'general.graduation','2026-08-02T00:00:00.000Z');
book=discover(book,'world.academy','2026-08-03T00:00:00.000Z');
assert.equal(book.rewardTotal,13);

// A — a committed earned receipt remains authority after a character is renamed or retired.
const retired=inspectFateBook(JSON.parse(JSON.stringify(book)),{allowedCharacterKeys:npcKeys.filter((key)=>key!=='artemis')});
assert.equal(retired.valid,true);
assert.ok(retired.book.rewardLedger['character.companion:artemis']);
assert.equal(retired.book.rewardTotal,13);
const renamedHistorical={version:2,discoveries:{'character.legacy_companion:retired_npc':{discoveryId:'character.legacy_companion:retired_npc',endingId:'character.legacy_companion',category:'character',title:'은퇴한 인연 Ending',characters:['retired_npc'],worldState:'character',reason:'과거 확정',reward:4,discoveredAt:'2026-07-01T00:00:00.000Z',runId:'legacy-run',turnNumber:90}},rewardLedger:{'character.legacy_companion:retired_npc':{receiptId:'earned:character.legacy_companion:retired_npc',discoveryId:'character.legacy_companion:retired_npc',source:'ending:first-discovery:character.legacy_companion:retired_npc',amount:4,grantedAt:'2026-07-01T00:00:00.000Z'}},rewardTotal:4};
const renamedCheck=inspectFateBook(renamedHistorical,{allowedCharacterKeys:npcKeys});
assert.equal(renamedCheck.valid,true);
assert.equal(renamedCheck.book.rewardTotal,4,'historical accounting must not be inferred again from the current Ending registry');

const emptyMeta={version:1,purchaseReceipts:{},spent:0};
const affinityPurchase=createInheritancePurchase(emptyMeta,book,{
  receiptId:'purchase-affinity',runId:'life-affinity',committedAt:'2026-08-04T00:00:00.000Z',allocations:[{kind:'affinity',target:'artemis'}],
},options);
assert.equal(affinityPurchase.receipt.cost,2);

// B — current eligibility is not historical accounting authority.
const removedAffinity=inspectInheritanceMeta(affinityPurchase.meta,{allowedAffinityKeys:npcKeys.filter((key)=>key!=='artemis')});
assert.equal(removedAffinity.valid,true);
assert.equal(removedAffinity.meta.spent,2);
assert.ok(removedAffinity.meta.purchaseReceipts['purchase-affinity']);

// Progressive costs are bounded and Realm/Circle are never purchasable.
const progressive=quoteInheritanceAllocations([{kind:'stat',target:'body'},{kind:'stat',target:'body'}],emptyMeta,options);
assert.deepEqual(progressive.costs,[1,2]);
assert.throws(()=>quoteInheritanceAllocations([{kind:'stat',target:'realm'}],emptyMeta,options),/구매할 수 없는/);
assert.throws(()=>quoteInheritanceAllocations([{kind:'affinity',target:'artemis'},{kind:'affinity',target:'artemis'}],emptyMeta,options),/같은 Fate Affinity/,'one receipt must not charge twice for the same non-stacking affinity benefit');

// H — a committed receipt is the only authority for an applied Next Life benefit.
const generated=generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'기사과 1학년',seed:'next-life-affinity'});
const applied=applyInheritanceReceipt(generated,affinityPurchase.receipt);
applied.id='life-affinity';
applied.inheritance=createRunInheritance(affinityPurchase.receipt);
assert.equal(applied.relationships.artemis.affinity,5);
assert.equal(inspectRunInheritance(applied,affinityPurchase.meta).valid,true);
const orphaned=structuredClone(applied);orphaned.inheritance.receiptId='missing-receipt';
assert.equal(inspectRunInheritance(orphaned,affinityPurchase.meta).valid,false);

const fullPurchase=createInheritancePurchase(emptyMeta,book,{
  receiptId:'purchase-full',runId:'life-full',committedAt:'2026-08-04T00:10:00.000Z',allocations:[{kind:'stat',target:'mana'},{kind:'talent',target:'magic'},{kind:'resource',target:'gold'},{kind:'resource',target:'supplies'}],
},options);
const afterMultiPurchase=createInheritancePurchase(fullPurchase.meta,book,{receiptId:'purchase-after-multi',runId:'life-after-multi',committedAt:'2026-08-04T00:11:00.000Z',allocations:[{kind:'stat',target:'body'}]},options);
assert.equal(inspectInheritanceMeta(afterMultiPurchase.meta).valid,true,'receipt sequence must count receipts rather than allocation rows');
const magicBase=generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'마법과 1학년',seed:'full-next-life'});
const magicApplied=applyInheritanceReceipt(magicBase,fullPurchase.receipt);
assert.equal(magicApplied.pc.gold,50);
assert.ok(magicApplied.pc.inventory.includes('계승 보급품 x1'));
assert.notEqual(magicApplied.pc.realm,'','Realm/Circle must be recalculated only after inheritance is applied');
assert.equal(magicApplied.creation.fateStart.origin.baseStats.mana,['F','E','D','C','B','A','S','SS','SSS'].indexOf(magicApplied.pc.stats['마나'].grade)+1,'inherited stats must update the canonical Origin evaluation source');
assert.equal(magicApplied.creation.fateStart.origin.talents.magic,magicApplied.pc.talents.magic,'inherited talents must update the canonical Origin evaluation source');
assert.equal(magicApplied.creation.fateStart.background.strengthProfile.band,'advanced_start','final background evaluation must include inherited stats and talents');
assert.equal(normalizeCharacterCreation(magicApplied.creation).fateStart.version,2,'final inherited PC evaluation must preserve the structured Origin lifecycle');

// C — malformed receipt + surviving benefit is rejected before any canonical mutation.
const malformedMeta=structuredClone(affinityPurchase.meta);
malformedMeta.purchaseReceipts['purchase-affinity'].cost=1;
assert.throws(()=>prepareCanonicalImport({
  currentFateBook:book,currentMeta:emptyMeta,incomingFateBook:book,incomingMeta:malformedMeta,incomingRun:applied,inspectFateBook,options,
}),/spent receipt가 손상/);

// D — two independently spent ledgers from the same earned authority never auto-union.
const branchA=createInheritancePurchase(emptyMeta,book,{receiptId:'branch-a',runId:'life-a',committedAt:'2026-08-05T00:00:00.000Z',allocations:[{kind:'talent',target:'magic'}]},options);
const branchB=createInheritancePurchase(emptyMeta,book,{receiptId:'branch-b',runId:'life-b',committedAt:'2026-08-05T00:01:00.000Z',allocations:[{kind:'talent',target:'martial'}]},options);
const branchBRun={id:'life-b',pc:{},world:{},inheritance:createRunInheritance(branchB.receipt)};
assert.throws(()=>prepareCanonicalImport({
  currentFateBook:book,currentMeta:branchA.meta,incomingFateBook:book,incomingMeta:branchB.meta,incomingRun:branchBRun,inspectFateBook,options,
}),/갈라진 계승 기록/);
assert.equal(inheritanceBalance(book,branchA.meta).valid,true);
assert.throws(()=>createInheritancePurchase(branchA.meta,book,{receiptId:'branch-a',runId:'life-a',committedAt:'2026-08-05T00:02:00.000Z',allocations:[{kind:'stat',target:'body'}]},options),/이미 처리된|이미 계승 purchase/,'the same life transaction must not apply twice');

// E — a stale non-divergent import keeps the newer canonical receipts without rollback.
const staleBook=normalizeFateBook({discoveries:[book.discoveries['character.companion:artemis']]},options);
const stale=prepareCanonicalImport({
  currentFateBook:book,currentMeta:branchA.meta,incomingFateBook:staleBook,incomingMeta:emptyMeta,incomingRun:{id:'plain-run',pc:{},world:{}},inspectFateBook,options,
});
assert.equal(stale.fateBook.rewardTotal,book.rewardTotal);
assert.equal(stale.meta.spent,branchA.meta.spent);
const safeSuperset=prepareCanonicalImport({
  currentFateBook:staleBook,currentMeta:emptyMeta,incomingFateBook:book,incomingMeta:branchA.meta,incomingRun:{id:'plain-run',pc:{},world:{}},inspectFateBook,options,
});
assert.equal(safeSuperset.fateBook.rewardTotal,book.rewardTotal);
assert.equal(safeSuperset.meta.spent,branchA.meta.spent);

const overspentBook=discover(null,'general.graduation','2026-08-05T00:03:00.000Z');
assert.throws(()=>prepareCanonicalImport({currentFateBook:overspentBook,currentMeta:fullPurchase.meta,incomingFateBook:overspentBook,incomingMeta:fullPurchase.meta,incomingRun:{id:'plain-run',pc:{},world:{}},inspectFateBook,options}),/소비가 획득량을 초과/);

// F/G — validation and persistence are serialized; the same balance cannot be spent twice.
const smallBook=discover(null,'general.graduation','2026-08-06T00:00:00.000Z');
let stored=emptyMeta;
let tail=Promise.resolve();
const withLock=(task)=>{const result=tail.then(task);tail=result.catch(()=>{});return result;};
const commit=(suffix)=>commitInheritancePurchase({
  withLock,readMeta:()=>structuredClone(stored),writeMeta:async(next)=>{stored=structuredClone(next);},fateBook:smallBook,
  request:{receiptId:`concurrent-${suffix}`,runId:`concurrent-life-${suffix}`,committedAt:`2026-08-06T00:0${suffix}:00.000Z`,allocations:[{kind:'talent',target:'magic'}]},options,
});
const concurrent=await Promise.allSettled([commit(1),commit(2)]);
assert.equal(concurrent.filter((row)=>row.status==='fulfilled').length,1);
assert.equal(concurrent.filter((row)=>row.status==='rejected').length,1);
assert.equal(stored.spent,2);
assert.equal(inheritanceBalance(smallBook,stored).valid,true);

// Origin occupation locks either determine a compatible region or fail loudly.
assert.equal(validateFateOriginLocks({socialClass:'commoner',region:'north',occupation:'dockhand'}),false);
assert.throws(()=>generateFateStartingCharacter({gender:'male',socialClass:'commoner',department:'기사과 1학년',seed:'bad-lock',originLocks:{region:'north',occupation:'dockhand'}}),/양립/);
const locked=generateFateStartingCharacter({gender:'male',socialClass:'commoner',department:'기사과 1학년',seed:'occupation-only',originLocks:{occupation:'dockhand'}});
assert.equal(locked.creation.fateStart.origin.regionKey,'south');
assert.equal(locked.creation.fateStart.origin.occupationKey,'dockhand');

const app=readFileSync('app.js','utf8'),runtime=readFileSync('app-runtime.js','utf8'),html=readFileSync('index.html','utf8'),worker=readFileSync('sw.js','utf8');
assert.match(app,/navigator\.locks\?\.request/,'same-device purchases must use the browser Web Lock boundary');
assert.match(app,/const META_PROGRESSION_LOCK = 'lumensia-meta-progression'/);
assert.ok((app.match(/withMetaProgressionLock\(/g)||[]).length>=5,'Ending persistence, purchase, export, and import must share one meta lock');
assert.match(app,/const loadedRunCheck=inspectRunInheritance\(loadedRunSave,fateBookIntegrity&&inheritanceMetaIntegrity\?inheritanceMeta:null\)/,'a malformed auxiliary ledger must not delete an unmarked run');
assert.match(app,/if\(!nextLifeSessionActive\)[\s\S]*nextLifeDraft=\[\][\s\S]*nextLifeSessionActive=true/,'reopening a cancelled reroll session must preserve its charged draft');
assert.match(app,/resetNextLifeSession\(\)[\s\S]*Next Life 시작/,'the reroll draft may reset only after Next Life succeeds');
assert.match(app,/async function persistFateBook\(\)[\s\S]*inspectFateBook\(loadJson\(FATE_BOOK_KEY\)[\s\S]*reconcileFateBooks\(current\.book,fateBook/,'Ending persistence must re-read and preserve newer canonical receipts');
assert.match(app,/pendingNextLife\?\.meta[\s\S]*await withMetaProgressionLock[\s\S]*currentFateBook:loadJson\(FATE_BOOK_KEY\),currentMeta:loadJson\(FATE_INHERITANCE_KEY\)/,'journal recovery must validate fresh canonical storage inside the shared lock');
const exportPath=app.slice(app.indexOf('async function exportSave()'),app.indexOf('async function importSave'));
assert.doesNotMatch(exportPath,/setItem\(FATE_(?:BOOK|INHERITANCE)_KEY/,'a stale export must never write its in-memory meta snapshot back');
assert.match(app,/async function importSave[\s\S]*withMetaProgressionLock[\s\S]*currentFateBook:loadJson\(FATE_BOOK_KEY\),currentMeta:loadJson\(FATE_INHERITANCE_KEY\)/,'import must validate against fresh canonical storage inside the shared lock');
assert.match(app,/localStorage\.setItem\(NEXT_LIFE_PENDING_KEY[\s\S]*FATE_INHERITANCE_KEY[\s\S]*SAVE_KEY[\s\S]*removeItem\(NEXT_LIFE_PENDING_KEY/,'receipt and run application must use the recovery journal');
assert.match(app,/prepareCanonicalImport\(\{currentFateBook:/,'imports must validate the canonical pair before mutation');
assert.match(app,/format:'lumensia\.save\.bundle\.v3',save,fateBook,inheritanceMeta/);
assert.match(html,/id="nextLifeDialog"[\s\S]*Stats[\s\S]*Talents[\s\S]*Starting Resources[\s\S]*Fate Affinity[\s\S]*Origin reroll/);
assert.doesNotMatch(html,/value="(?:realm|circle)"/i,'Realm/Circle must not appear as a purchase target');
assert.match(runtime,/fate inheritance import/,'the stable loader must route the new module through an origin URL');
assert.match(worker,/\/lib\/fate-inheritance\.js/,'offline shell must include the inheritance runtime');
assert.doesNotMatch(readFileSync('lib/fate-inheritance.js','utf8'),/new OpenAI|responses\.create|chat\.completions/,'STAB-02R must not add a model call');

console.log('PASS STAB-02R canonical earned/spent authority, fail-closed import, concurrency, and Next Life application');
