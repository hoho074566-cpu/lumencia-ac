import { inspectFateBook, normalizeFateBook } from './fate-ending.js';
import { generateFateStartingCharacter, materializeFateStartingCharacter, normalizeFateOrigin, validateFateOriginLocks } from './fate-start.js';

export const FATE_INHERITANCE_VERSION=1;
export const FATE_INHERITANCE_KEY='lumensia.inheritance.v1';
export const META_PROGRESSION_LOCK='lumensia.meta-progression.v1';

const STAT_KEYS=Object.freeze(['body','mana','intelligence','divinity']);
const TALENT_KEYS=Object.freeze(['magic','martial','soul','knowledge']);
const SAFE_ID=/^[a-z0-9_.:-]{1,160}$/i;
const FORBIDDEN=new Set(['__proto__','prototype','constructor']);

function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function array(value){return Array.isArray(value)?value:[];}
function clean(value,max=160){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);}
function id(value,max=160){const text=clean(value,max);return SAFE_ID.test(text)&&!FORBIDDEN.has(text)?text:'';}
function integer(value,min=0,max=1_000_000){const number=Number(value);return Number.isSafeInteger(number)&&number>=min&&number<=max?number:null;}
function iso(value){const text=clean(value,40);return /^\d{4}-\d{2}-\d{2}T/.test(text)?text:'';}
function clone(value){return structuredClone(value);}
function stable(value){
  if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value){let hash=2166136261;for(const ch of stable(value)){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return`fnv1a:${(hash>>>0).toString(16).padStart(8,'0')}`;}
function same(a,b){return stable(a)===stable(b);}

export function emptyInheritanceMeta(){return{version:FATE_INHERITANCE_VERSION,purchaseReceipts:{},spent:0};}

function normalizedAllocation(raw){
  const source=object(raw),kind=clean(source.kind,32),target=id(source.target,100),units=integer(source.units,1,20),cost=integer(source.cost,1,10_000);
  if(!['stat','talent','resource','affinity','origin_reroll','origin_lock'].includes(kind)||!target||units==null||cost==null)return null;
  if(kind==='stat'&&!STAT_KEYS.includes(target))return null;
  if(kind==='talent'&&!TALENT_KEYS.includes(target))return null;
  if(kind==='resource'&&!['gold','supplies'].includes(target))return null;
  if(kind==='origin_reroll'&&(target!=='origin'||units>10))return null;
  if(kind==='origin_lock'&&!(target.startsWith('region:')||target.startsWith('occupation:'))||kind==='origin_lock'&&units!==1)return null;
  return{kind,target,units,cost};
}

function receiptCore(raw){
  const source=object(raw),receiptId=id(source.receiptId),sourceRunId=id(source.sourceRunId),nextRunId=id(source.nextRunId),committedAt=iso(source.committedAt),originSeed=id(source.originSeed),allocations=array(source.allocations).map(normalizedAllocation);
  if(Number(source.version)!==FATE_INHERITANCE_VERSION||!receiptId.startsWith('purchase:')||!sourceRunId||!nextRunId||!committedAt||!originSeed||!allocations.length||allocations.length>40||allocations.some((row)=>!row))return null;
  const progressive=new Map(),lockKinds=new Set();
  for(const row of allocations){
    const key=`${row.kind}:${row.target}`,offset=progressive.get(key)||0,expected=Array.from({length:row.units},(_,index)=>unitCost(row.kind,offset+index)).reduce((sum,value)=>sum+value,0);
    if(row.cost!==expected)return null;progressive.set(key,offset+row.units);
    if(row.kind==='origin_lock'){const lockKind=row.target.split(':')[0];if(lockKinds.has(lockKind))return null;lockKinds.add(lockKind);}
  }
  const cost=integer(source.cost,1,100_000);if(cost==null||cost!==allocations.reduce((sum,row)=>sum+row.cost,0))return null;
  const locks=object(source.originLocks),originLocks={region:id(locks.region,40),occupation:id(locks.occupation,60)};
  for(const lockKind of ['region','occupation']){
    const expected=originLocks[lockKind]?`${lockKind}:${originLocks[lockKind]}`:'',lockRows=allocations.filter((row)=>row.kind==='origin_lock'&&row.target.startsWith(`${lockKind}:`));
    if(expected?(lockRows.length!==1||lockRows[0].target!==expected):lockRows.length!==0)return null;
  }
  const benefit=object(source.benefit),initial=object(benefit.initial);
  if(benefit.originSeed!==originSeed||!same(benefit.originLocks,originLocks)||!same(benefit.allocations,allocations)||!Object.keys(object(initial.stats)).length||!Object.keys(object(initial.talents)).length||integer(initial.gold,0,1_000_000)==null||!Array.isArray(initial.inventory)||!clean(initial.realm,100)||!Object.keys(object(initial.origin)).length)return null;
  return{version:FATE_INHERITANCE_VERSION,receiptId,sourceRunId,nextRunId,committedAt,cost,allocations,originSeed,originLocks,benefit:clone(benefit)};
}

function normalizedReceipt(raw){
  const core=receiptCore(raw);if(!core)return null;
  const integrity=clean(object(raw).integrity,32);if(integrity!==digest(core))return null;
  return{...core,integrity};
}

export function inspectInheritanceMeta(raw){
  if(raw==null)return{valid:true,meta:emptyInheritanceMeta(),errors:[]};
  const source=object(raw),errors=[],receipts={};
  if(Number(source.version)!==FATE_INHERITANCE_VERSION)errors.push('Inheritance ledger version이 올바르지 않음.');
  const rawReceipts=object(source.purchaseReceipts),nextRuns=new Set();
  for(const [key,value] of Object.entries(rawReceipts)){
    const receipt=normalizedReceipt(value);
    if(!receipt||receipt.receiptId!==key){errors.push(`purchase receipt 손상: ${clean(key,80)||'unknown'}`);continue;}
    if(nextRuns.has(receipt.nextRunId)){errors.push(`동일 Next Life에 receipt가 중복됨: ${receipt.nextRunId}`);continue;}
    nextRuns.add(receipt.nextRunId);receipts[key]=receipt;
  }
  const spent=Object.values(receipts).reduce((sum,row)=>sum+row.cost,0);
  if(integer(source.spent,0,1_000_000)!==spent)errors.push('Inheritance spent 합계가 receipt와 불일치함.');
  return{valid:errors.length===0,meta:{version:FATE_INHERITANCE_VERSION,purchaseReceipts:receipts,spent},errors};
}

export function inheritanceBalance(fateBookValue,metaValue){
  const book=normalizeFateBook(fateBookValue),inspection=inspectInheritanceMeta(metaValue);
  if(!inspection.valid)throw new Error(inspection.errors.join(' '));
  const earned=integer(book.rewardTotal,0,1_000_000)??0,spent=inspection.meta.spent;
  return{earned,spent,available:earned-spent,valid:spent<=earned};
}

function unitCost(kind,index){
  if(kind==='talent'||kind==='affinity')return 2+index;
  if(kind==='origin_lock')return 2;
  return 1+index;
}

export function quoteInheritanceAllocations(raw,{origin,originLocks={},allowedAffinityKeys=[]}={}){
  const normalizedOrigin=normalizeFateOrigin(origin);if(!normalizedOrigin)throw new Error('Next Life Origin이 올바르지 않음.');
  if(!validateFateOriginLocks({socialClass:normalizedOrigin.socialClass,...originLocks}))throw new Error('선택한 Origin 지역과 직업 lock이 양립하지 않음.');
  const affinity=new Set(array(allowedAffinityKeys).map((value)=>id(value,64)).filter(Boolean)),seen=new Map(),rows=[];
  for(const source of array(raw)){
    const kind=clean(source?.kind,32),target=id(source?.target,100),units=integer(source?.units,1,10);
    if(!kind||!target||units==null)throw new Error('Inheritance allocation 형식이 올바르지 않음.');
    if(kind==='stat'&&!STAT_KEYS.includes(target))throw new Error('Realm/Circle은 직접 구매할 수 없음.');
    if(kind==='talent'&&!TALENT_KEYS.includes(target))throw new Error('알 수 없는 Talent allocation임.');
    if(kind==='resource'&&!['gold','supplies'].includes(target))throw new Error('알 수 없는 Starting Resource allocation임.');
    if(kind==='affinity'&&!affinity.has(target))throw new Error('현재 새 Fate Affinity 대상으로 구매할 수 없음.');
    if(kind==='origin_reroll'&&target!=='origin')throw new Error('Origin reroll allocation이 올바르지 않음.');
    if(kind==='origin_lock'){
      const [lockKind,lockValue]=target.split(':');
      if(units!==1||!['region','occupation'].includes(lockKind)||originLocks[lockKind]!==lockValue)throw new Error('Origin lock allocation이 선택값과 일치하지 않음.');
    }
    if(!['stat','talent','resource','affinity','origin_reroll','origin_lock'].includes(kind))throw new Error('Realm/Circle 또는 알 수 없는 allocation은 직접 구매할 수 없음.');
    const key=`${kind}:${target}`,offset=seen.get(key)||0;
    const cost=Array.from({length:units},(_,index)=>unitCost(kind,offset+index)).reduce((sum,value)=>sum+value,0);
    seen.set(key,offset+units);rows.push({kind,target,units,cost});
  }
  if(!rows.length)throw new Error('Inheritance allocation을 하나 이상 선택해야 함.');
  const statTotals={},talentTotals={};
  for(const row of rows){
    if(row.kind==='stat')statTotals[row.target]=(statTotals[row.target]||0)+row.units;
    if(row.kind==='talent')talentTotals[row.target]=(talentTotals[row.target]||0)+row.units;
  }
  for(const [key,units] of Object.entries(statTotals))if(normalizedOrigin.baseStats[key]+units>9)throw new Error(`Stat allocation 한도 초과: ${key}`);
  for(const [key,units] of Object.entries(talentTotals))if(normalizedOrigin.talents[key]+units>10)throw new Error(`Talent allocation 한도 초과: ${key}`);
  for(const lockKind of ['region','occupation']){
    const expected=originLocks[lockKind]?`${lockKind}:${originLocks[lockKind]}`:'';
    const lockRows=rows.filter((row)=>row.kind==='origin_lock'&&row.target.startsWith(`${lockKind}:`));
    if(expected?(lockRows.length!==1||lockRows[0].target!==expected):lockRows.length!==0)throw new Error(`Origin ${lockKind} lock과 paid allocation이 일치하지 않음.`);
  }
  return{allocations:rows,cost:rows.reduce((sum,row)=>sum+row.cost,0)};
}

function benefitFromRun(run,allocations,originSeed,originLocks){
  const origin=run.creation.fateStart.origin;
  return{
    originSeed,originLocks:{...originLocks},allocations:clone(allocations),
    initial:{stats:clone(run.pc.stats),talents:clone(run.pc.talents),gold:run.pc.gold,inventory:clone(run.pc.inventory),relationships:clone(run.relationships),realm:run.pc.realm,origin:{seedTag:origin.seedTag,regionKey:origin.regionKey,occupationKey:origin.occupationKey,baseStats:clone(origin.baseStats),talents:clone(origin.talents)}},
  };
}

export function prepareInheritanceNextLife({fateBook,inheritanceMeta,sourceRun,nextRunBase,request,allowedAffinityKeys=[],now=new Date().toISOString(),receiptId=`purchase:${globalThis.crypto?.randomUUID?.()||Date.now()}`}={}){
  const sourceRunId=id(sourceRun?.id),nextRunId=id(nextRunBase?.id),seed=id(request?.originSeed);
  if(!sourceRunId||!nextRunId||sourceRunId===nextRunId)throw new Error('Next Life run identity가 올바르지 않음.');
  if(!array(sourceRun?.completedEvents).some((value)=>clean(value,200).startsWith('ending:')))throw new Error('현재 회차의 Ending 또는 Dead Ending이 확정되지 않음.');
  const inspection=inspectInheritanceMeta(inheritanceMeta);if(!inspection.valid)throw new Error(inspection.errors.join(' '));
  const locks={region:id(request?.originLocks?.region,40),occupation:id(request?.originLocks?.occupation,60)};
  const generated=generateFateStartingCharacter({gender:request?.gender,socialClass:request?.socialClass,department:request?.department,seed,originLocks:locks});
  const quote=quoteInheritanceAllocations(request?.allocations,{origin:generated.creation.fateStart.origin,originLocks:locks,allowedAffinityKeys});
  const balance=inheritanceBalance(fateBook,inspection.meta);if(!balance.valid||quote.cost>balance.available)throw new Error('Inheritance point가 부족함.');
  const origin=clone(generated.creation.fateStart.origin);
  for(const row of quote.allocations){
    if(row.kind==='stat')origin.baseStats[row.target]+=row.units;
    if(row.kind==='talent')origin.talents[row.target]+=row.units;
  }
  const finalCharacter=materializeFateStartingCharacter(origin),nextRun=clone(nextRunBase);
  nextRun.creation=finalCharacter.creation;nextRun.pc={...nextRun.pc,...finalCharacter.pc};
  nextRun.relationships=object(nextRun.relationships);nextRun.pc.inventory=array(nextRun.pc.inventory);
  for(const row of quote.allocations){
    if(row.kind==='resource'&&row.target==='gold')nextRun.pc.gold=Math.max(0,Number(nextRun.pc.gold)||0)+(50*row.units);
    if(row.kind==='resource'&&row.target==='supplies')nextRun.pc.inventory.push(`계승 보급품 ×${row.units}`);
    if(row.kind==='affinity'){
      const previous=object(nextRun.relationships[row.target]);
      nextRun.relationships[row.target]={...previous,affinity:(Number(previous.affinity)||0)+(5*row.units),trust:Number(previous.trust)||0};
    }
  }
  const benefit=benefitFromRun(nextRun,quote.allocations,seed,locks),core={version:FATE_INHERITANCE_VERSION,receiptId:id(receiptId),sourceRunId,nextRunId,committedAt:iso(now),cost:quote.cost,allocations:quote.allocations,originSeed:seed,originLocks:locks,benefit};
  if(!core.receiptId.startsWith('purchase:')||!core.committedAt)throw new Error('Inheritance receipt identity가 올바르지 않음.');
  const receipt={...core,integrity:digest(core)},nextMeta=clone(inspection.meta);
  if(nextMeta.purchaseReceipts[receipt.receiptId])throw new Error('동일 Inheritance transaction을 다시 적용할 수 없음.');
  if(Object.values(nextMeta.purchaseReceipts).some((row)=>row.nextRunId===nextRunId))throw new Error('동일 Next Life에 transaction을 중복 적용할 수 없음.');
  nextMeta.purchaseReceipts[receipt.receiptId]=receipt;nextMeta.spent+=receipt.cost;
  const finalBalance=inheritanceBalance(fateBook,nextMeta);if(!finalBalance.valid)throw new Error('spent가 earned를 초과하여 transaction을 거부함.');
  nextRun.inheritance={version:FATE_INHERITANCE_VERSION,receiptId:receipt.receiptId,receiptIntegrity:receipt.integrity,benefitDigest:digest(receipt.benefit)};
  return{fateBook:normalizeFateBook(fateBook),inheritanceMeta:nextMeta,nextRun,receipt,balance:finalBalance};
}

export function inspectRunInheritance(run,metaValue){
  const marker=run?.inheritance;if(marker==null)return{valid:true,receipt:null,errors:[]};
  const inspection=inspectInheritanceMeta(metaValue),errors=[...inspection.errors],receipt=inspection.meta.purchaseReceipts[id(marker.receiptId)];
  if(Number(marker.version)!==FATE_INHERITANCE_VERSION||!receipt)errors.push('run inheritance receipt가 canonical ledger에 없음.');
  if(receipt){
    if(receipt.nextRunId!==id(run?.id)||marker.receiptIntegrity!==receipt.integrity)errors.push('run inheritance identity가 receipt와 불일치함.');
    if(marker.benefitDigest!==digest(receipt.benefit))errors.push('run inheritance benefit이 receipt와 불일치함.');
  }
  return{valid:errors.length===0,receipt:receipt||null,errors};
}

function ledgerRelation(current,incoming,selector){
  const a=object(selector(current)),b=object(selector(incoming));
  for(const key of Object.keys(a))if(Object.hasOwn(b,key)&&!same(a[key],b[key]))return'conflict';
  const aKeys=new Set(Object.keys(a)),bKeys=new Set(Object.keys(b));
  const aSubset=[...aKeys].every((key)=>bKeys.has(key)),bSubset=[...bKeys].every((key)=>aKeys.has(key));
  if(aSubset&&bSubset)return'equal';
  if(aSubset)return'incoming-superset';
  if(bSubset)return'incoming-subset';
  return'conflict';
}

export function prepareCanonicalProgressionImport({currentFateBook,currentInheritanceMeta,incomingFateBook,incomingInheritanceMeta,incomingRun,allowedCharacterKeys=[]}={}){
  const options={allowedCharacterKeys},currentBookInspection=inspectFateBook(currentFateBook,options),incomingBookInspection=inspectFateBook(incomingFateBook,options),currentMetaInspection=inspectInheritanceMeta(currentInheritanceMeta),incomingMetaInspection=inspectInheritanceMeta(incomingInheritanceMeta);
  const errors=[...currentBookInspection.errors,...incomingBookInspection.errors,...currentMetaInspection.errors,...incomingMetaInspection.errors];
  if(errors.length)throw new Error(`canonical progression import 거부: ${errors.join(' ')}`);
  const fateRelation=ledgerRelation(currentBookInspection.book,incomingBookInspection.book,(value)=>value.rewardLedger);
  const metaRelation=ledgerRelation(currentMetaInspection.meta,incomingMetaInspection.meta,(value)=>value.purchaseReceipts);
  if(fateRelation==='conflict'||metaRelation==='conflict')throw new Error('divergent meta progression은 자동 병합할 수 없음.');
  const chosenBook=fateRelation==='incoming-superset'?incomingBookInspection.book:currentBookInspection.book;
  const chosenMeta=metaRelation==='incoming-superset'?incomingMetaInspection.meta:currentMetaInspection.meta;
  const balance=inheritanceBalance(chosenBook,chosenMeta);if(!balance.valid)throw new Error('import가 spent <= earned invariant를 위반함.');
  const runInspection=inspectRunInheritance(incomingRun,chosenMeta);if(!runInspection.valid)throw new Error(`run/meta partial import 거부: ${runInspection.errors.join(' ')}`);
  return{fateBook:chosenBook,inheritanceMeta:chosenMeta,run:incomingRun,balance,relations:{fate:fateRelation,inheritance:metaRelation}};
}

export async function purchaseNextLifeSerialized({withLock,readCanonical,commitCanonical,sourceRunId,makeNextRun,request,allowedAffinityKeys=[],now,receiptId}={}){
  if(typeof withLock!=='function'||typeof readCanonical!=='function'||typeof commitCanonical!=='function'||typeof makeNextRun!=='function')throw new Error('serialized Next Life boundary가 올바르지 않음.');
  return withLock(async()=>{
    const current=await readCanonical();
    if(id(current?.sourceRun?.id)!==id(sourceRunId))throw new Error('active run이 변경되어 Next Life transaction을 폐기함.');
    const prepared=prepareInheritanceNextLife({fateBook:current.fateBook,inheritanceMeta:current.inheritanceMeta,sourceRun:current.sourceRun,nextRunBase:await makeNextRun(),request,allowedAffinityKeys,now,receiptId});
    await commitCanonical(prepared,current);
    return prepared;
  });
}
