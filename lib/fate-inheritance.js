export const FATE_INHERITANCE_VERSION = 1;

const FORBIDDEN_KEYS=new Set(['__proto__','prototype','constructor']);
const STAT_TARGETS=new Set(['body','mana','intelligence','divinity']);
const TALENT_TARGETS=new Set(['magic','martial','soul','knowledge']);
const RESOURCE_TARGETS=new Set(['gold','supplies']);
const ALLOCATION_KINDS=new Set(['stat','talent','resource','affinity','origin_reroll','origin_lock']);
const BASE_COST=Object.freeze({stat:1,talent:2,resource:1,affinity:2,origin_reroll:1,origin_lock:2});

function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function array(value){return Array.isArray(value)?value:[];}
function clean(value,max=160){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);}
function safeKey(value,max=80){const key=clean(value,max);return /^[a-z0-9_-]+$/i.test(key)&&!FORBIDDEN_KEYS.has(key)?key:'';}
function iso(value){const text=clean(value,40);return /^\d{4}-\d{2}-\d{2}T/.test(text)?text:'';}
function stable(value){
  if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value){let hash=2166136261;for(const ch of stable(value)){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return`fnv1a-${(hash>>>0).toString(16).padStart(8,'0')}`;}
function receiptRows(meta){return Object.values(object(meta?.purchaseReceipts)).sort((a,b)=>Number(a.sequence)-Number(b.sequence)||String(a.receiptId).localeCompare(String(b.receiptId)));}
function allocationIdentity(row){return`${row.kind}:${row.target}${row.field?`:${row.field}`:''}${row.value?`:${row.value}`:''}`;}

function normalizeAllocation(raw,{historical=false,allowedAffinityKeys=[]}={}){
  const row=object(raw),kind=clean(row.kind,32);
  if(!ALLOCATION_KINDS.has(kind))return null;
  if(kind==='stat'){
    const target=clean(row.target,32);return STAT_TARGETS.has(target)?{kind,target}:null;
  }
  if(kind==='talent'){
    const target=clean(row.target,32);return TALENT_TARGETS.has(target)?{kind,target}:null;
  }
  if(kind==='resource'){
    const target=clean(row.target,32);return RESOURCE_TARGETS.has(target)?{kind,target}:null;
  }
  if(kind==='affinity'){
    const target=safeKey(row.target,64);
    if(!target||(!historical&&allowedAffinityKeys.length&&!new Set(allowedAffinityKeys.map(String)).has(target)))return null;
    return{kind,target};
  }
  if(kind==='origin_reroll')return clean(row.target,32)==='origin'?{kind,target:'origin'}:null;
  const field=clean(row.field,32),value=safeKey(row.value,80);
  if(clean(row.target,32)!=='origin'||!['region','occupation'].includes(field)||!value)return null;
  return{kind,target:'origin',field,value};
}

function nextAllocationCost(previous,row){
  const prior=previous.filter((item)=>allocationIdentity(item)===allocationIdentity(row)).length;
  return BASE_COST[row.kind]+prior;
}

function normalizeReceipt(raw,previous,{historical=false,allowedAffinityKeys=[],validateOriginLocks}={}){
  const source=object(raw),receiptId=safeKey(source.receiptId,100),runId=safeKey(source.runId,100),committedAt=iso(source.committedAt);
  const sequence=Number(source.sequence),rows=array(source.allocations).map((row)=>normalizeAllocation(row,{historical,allowedAffinityKeys}));
  if(!receiptId||!runId||!committedAt||!Number.isInteger(sequence)||sequence<1||!rows.length||rows.some((row)=>!row))return null;
  if(rows.some((row)=>['realm','circle'].includes(row.target)))return null;
  const lockRows=rows.filter((row)=>row.kind==='origin_lock');
  if(new Set(lockRows.map((row)=>row.field)).size!==lockRows.length)return null;
  if(!historical&&typeof validateOriginLocks==='function'&&!validateOriginLocks(Object.fromEntries(lockRows.map((row)=>[row.field,row.value]))))return null;
  const history=[...previous],allocations=[],costs=[];
  for(const row of rows){const cost=nextAllocationCost(history,row);history.push(row);allocations.push(row);costs.push(cost);}
  const cost=costs.reduce((sum,value)=>sum+value,0);
  if(Number(source.cost)!==cost||Number(source.costVersion)!==1)return null;
  const core={receiptId,runId,sequence,committedAt,costVersion:1,cost,allocations};
  if(clean(source.digest,32)!==digest(core))return null;
  return{...core,digest:digest(core)};
}

export function inspectInheritanceMeta(raw,{allowedAffinityKeys=[],validateOriginLocks}={}){
  const source=object(raw),receiptSource=object(source.purchaseReceipts),mapKeyErrors=Array.isArray(source.purchaseReceipts)?[]:Object.entries(receiptSource).filter(([key,row])=>key!==clean(row?.receiptId,100)).map(([key])=>`purchase receipt key mismatch:${clean(key,100)}`),sourceRows=Array.isArray(source.purchaseReceipts)?source.purchaseReceipts:Object.values(receiptSource);
  const ordered=[...sourceRows].sort((a,b)=>Number(a?.sequence)-Number(b?.sequence)||String(a?.receiptId).localeCompare(String(b?.receiptId)));
  const purchaseReceipts={},previous=[],errors=[...mapKeyErrors],runIds=new Set();
  for(const rawReceipt of ordered){
    const receipt=normalizeReceipt(rawReceipt,previous,{historical:true,allowedAffinityKeys,validateOriginLocks});
    const id=clean(rawReceipt?.receiptId,100);
    if(!receipt){errors.push(`invalid purchase receipt:${id||'unknown'}`);continue;}
    if(purchaseReceipts[receipt.receiptId]||runIds.has(receipt.runId)||receipt.sequence!==Object.keys(purchaseReceipts).length+1){errors.push(`conflicting purchase receipt:${receipt.receiptId}`);continue;}
    purchaseReceipts[receipt.receiptId]=receipt;runIds.add(receipt.runId);previous.push(...receipt.allocations);
  }
  const spent=Object.values(purchaseReceipts).reduce((sum,row)=>sum+row.cost,0);
  const meta={version:FATE_INHERITANCE_VERSION,purchaseReceipts,spent};
  if(source.version!=null&&Number(source.version)!==FATE_INHERITANCE_VERSION)errors.push('unsupported inheritance version');
  if(source.spent!=null&&Number(source.spent)!==spent)errors.push('spent total mismatch');
  return{meta,valid:errors.length===0,errors:[...new Set(errors)]};
}

export function normalizeInheritanceMeta(raw,options={}){return inspectInheritanceMeta(raw,options).meta;}

export function inheritanceBalance(fateBook,meta){
  const earned=Math.max(0,Math.trunc(Number(fateBook?.rewardTotal)||0)),spent=Math.max(0,Math.trunc(Number(meta?.spent)||0));
  return{earned,spent,available:Math.max(0,earned-spent),valid:spent<=earned};
}

export function quoteInheritanceAllocations(rawAllocations,meta,options={}){
  const normalized=normalizeInheritanceMeta(meta),history=receiptRows(normalized).flatMap((row)=>row.allocations),allocations=[];
  for(const raw of array(rawAllocations)){
    const row=normalizeAllocation(raw,{historical:false,allowedAffinityKeys:options.allowedAffinityKeys});
    if(!row||['realm','circle'].includes(row.target))throw new Error('구매할 수 없는 계승 항목임.');
    allocations.push(row);
  }
  if(!allocations.length)throw new Error('계승 항목을 하나 이상 선택해야 함.');
  const lockRows=allocations.filter((row)=>row.kind==='origin_lock');
  if(new Set(lockRows.map((row)=>row.field)).size!==lockRows.length)throw new Error('같은 Origin 항목을 두 번 잠글 수 없음.');
  if(typeof options.validateOriginLocks==='function'&&!options.validateOriginLocks(Object.fromEntries(lockRows.map((row)=>[row.field,row.value]))))throw new Error('서로 양립할 수 없는 Origin lock임.');
  const costs=[];
  for(const row of allocations){const cost=nextAllocationCost(history,row);costs.push(cost);history.push(row);}
  return{allocations,costs,cost:costs.reduce((sum,value)=>sum+value,0)};
}

export function createInheritancePurchase(meta,fateBook,{receiptId,runId,allocations,committedAt=new Date().toISOString()}={},options={}){
  const inspected=inspectInheritanceMeta(meta,options);
  if(!inspected.valid)throw new Error(`기존 계승 기록이 손상됨: ${inspected.errors[0]}`);
  const balance=inheritanceBalance(fateBook,inspected.meta);
  if(!balance.valid)throw new Error('계승 소비가 획득량을 초과함.');
  const id=safeKey(receiptId,100),targetRunId=safeKey(runId,100);
  if(!id||!targetRunId||!iso(committedAt))throw new Error('계승 transaction identity가 올바르지 않음.');
  if(inspected.meta.purchaseReceipts[id])throw new Error('이미 처리된 계승 transaction임.');
  if(receiptRows(inspected.meta).some((row)=>row.runId===targetRunId))throw new Error('이 Next Life에는 이미 계승 purchase가 있음.');
  const quote=quoteInheritanceAllocations(allocations,inspected.meta,options);
  if(quote.cost>balance.available)throw new Error('계승 원천이 부족함.');
  const core={receiptId:id,runId:targetRunId,sequence:receiptRows(inspected.meta).length+1,committedAt:iso(committedAt),costVersion:1,cost:quote.cost,allocations:quote.allocations};
  const receipt={...core,digest:digest(core)},purchaseReceipts={...inspected.meta.purchaseReceipts,[id]:{...core,digest:digest(core)}};
  const next={version:FATE_INHERITANCE_VERSION,purchaseReceipts,spent:inspected.meta.spent+receipt.cost};
  if(next.spent>balance.earned)throw new Error('계승 소비가 획득량을 초과함.');
  return{meta:next,receipt,balance:{earned:balance.earned,spent:next.spent,available:balance.earned-next.spent,valid:true}};
}

export async function commitInheritancePurchase({withLock,readMeta,writeMeta,fateBook,request,options={}}={}){
  if(typeof withLock!=='function'||typeof readMeta!=='function'||typeof writeMeta!=='function')throw new Error('계승 purchase persistence boundary가 없음.');
  return withLock(async()=>{
    const result=createInheritancePurchase(readMeta(),fateBook,request,options);
    await writeMeta(result.meta);
    return result;
  });
}

function receiptRelation(current,incoming,selector){
  const a=object(selector(current)),b=object(selector(incoming));
  for(const id of new Set([...Object.keys(a),...Object.keys(b)]))if(a[id]&&b[id]&&stable(a[id])!==stable(b[id]))return'conflict';
  const aIds=Object.keys(a),bIds=Object.keys(b),aInB=aIds.every((id)=>b[id]),bInA=bIds.every((id)=>a[id]);
  if(aInB&&bInA)return'equal';
  if(aInB)return'superset';
  if(bInA)return'subset';
  return'conflict';
}

export function inheritanceReceiptDigest(receipt){
  const row=object(receipt);return digest({receiptId:row.receiptId,runId:row.runId,sequence:row.sequence,committedAt:row.committedAt,costVersion:row.costVersion,cost:row.cost,allocations:row.allocations});
}

export function createRunInheritance(receipt){
  if(!receipt)return null;
  return{version:1,receiptId:receipt.receiptId,runId:receipt.runId,receiptDigest:receipt.digest};
}

export function inspectRunInheritance(run,meta){
  const marker=run?.inheritance;
  if(marker==null)return{valid:true,receipt:null};
  if(!marker||typeof marker!=='object'||Array.isArray(marker))return{valid:false,error:'invalid run inheritance marker'};
  const receipt=object(meta?.purchaseReceipts)[clean(marker.receiptId,100)];
  if(!receipt||Number(marker.version)!==1||clean(marker.runId,100)!==clean(run?.id,100)||marker.runId!==receipt.runId||marker.receiptDigest!==receipt.digest)return{valid:false,error:'run benefit has no matching committed purchase receipt'};
  return{valid:true,receipt};
}

export function prepareCanonicalImport({currentFateBook,currentMeta,incomingFateBook,incomingMeta,incomingRun,inspectFateBook,options={}}={}){
  if(typeof inspectFateBook!=='function')throw new Error('Fate Book validator가 없음.');
  const incomingBookCheck=inspectFateBook(incomingFateBook,options),incomingMetaCheck=inspectInheritanceMeta(incomingMeta,options);
  if(!incomingBookCheck.valid)throw new Error(`가져온 earned receipt가 손상됨: ${incomingBookCheck.errors[0]}`);
  if(!incomingMetaCheck.valid)throw new Error(`가져온 spent receipt가 손상됨: ${incomingMetaCheck.errors[0]}`);
  const currentBookCheck=inspectFateBook(currentFateBook,options),currentMetaCheck=inspectInheritanceMeta(currentMeta,options);
  if(!currentBookCheck.valid)throw new Error(`현재 earned receipt가 손상됨: ${currentBookCheck.errors[0]}`);
  if(!currentMetaCheck.valid)throw new Error(`현재 spent receipt가 손상됨: ${currentMetaCheck.errors[0]}`);
  const currentBook=currentBookCheck.book,currentInheritance=currentMetaCheck.meta;
  const earnedRelation=receiptRelation(currentBook,incomingBookCheck.book,(value)=>value.rewardLedger);
  const spentRelation=receiptRelation(currentInheritance,incomingMetaCheck.meta,(value)=>value.purchaseReceipts);
  if(earnedRelation==='conflict'||spentRelation==='conflict')throw new Error('서로 갈라진 계승 기록은 자동 병합할 수 없음.');
  const incomingIsNewer=['equal','superset'].includes(earnedRelation)&&['equal','superset'].includes(spentRelation)&&(earnedRelation==='superset'||spentRelation==='superset');
  const incomingIsOlder=['equal','subset'].includes(earnedRelation)&&['equal','subset'].includes(spentRelation);
  if(!incomingIsNewer&&!incomingIsOlder)throw new Error('서로 갈라진 계승 기록은 자동 병합할 수 없음.');
  const fateBook=incomingIsNewer?incomingBookCheck.book:currentBook,meta=incomingIsNewer?incomingMetaCheck.meta:currentInheritance;
  const balance=inheritanceBalance(fateBook,meta);
  if(!balance.valid)throw new Error('가져온 계승 소비가 획득량을 초과함.');
  const runCheck=inspectRunInheritance(incomingRun,meta);
  if(!runCheck.valid)throw new Error(runCheck.error);
  return{fateBook,meta,run:incomingRun,balance,relation:{earned:earnedRelation,spent:spentRelation}};
}

export function applyInheritanceReceipt(generated,receipt){
  if(!receipt)return generated;
  const next=structuredClone(generated),pc=next.pc,origin=next.creation?.fateStart?.origin;
  const gradeOrder=['F','E','D','C','B','A','S','SS','SSS'];
  const statLabels={body:'신체',mana:'마나',intelligence:'지능',divinity:'신성'};
  let goldPacks=0,supplyPacks=0;
  for(const row of receipt.allocations){
    if(row.kind==='stat'){
      const stat=pc.stats?.[statLabels[row.target]];if(stat){const index=Math.max(0,gradeOrder.indexOf(String(stat.grade||'F').replace(/[+-]/g,'')));stat.grade=gradeOrder[Math.min(gradeOrder.length-1,index+1)];stat.progress=0;}
    }else if(row.kind==='talent')pc.talents[row.target]=Math.min(10,Math.max(1,Number(pc.talents[row.target]||1)+1));
    else if(row.kind==='resource'&&row.target==='gold')goldPacks+=1;
    else if(row.kind==='resource'&&row.target==='supplies')supplyPacks+=1;
    else if(row.kind==='affinity'){
      next.relationships=next.relationships||{};const old=next.relationships[row.target]||{};
      next.relationships[row.target]={...old,affinity:Math.max(Number(old.affinity)||0,5),trust:Math.max(Number(old.trust)||0,3),status:old.status||'운명의 잔향',history:array(old.history)};
    }
  }
  pc.gold=Math.max(0,Number(pc.gold)||0)+goldPacks*50;
  if(supplyPacks)pc.inventory=[...new Set([...array(pc.inventory),`계승 보급품 x${supplyPacks}`])];
  const manaGrade=gradeOrder.indexOf(String(pc.stats?.['마나']?.grade||'F').replace(/[+-]/g,'')),magic=Number(pc.talents?.magic)||1;
  pc.realm=pc.department==='마법과 1학년'?`${Math.max(1,Math.min(9,1+Math.floor((Math.max(0,manaGrade-1)+Math.max(0,magic-1))/4)))}서클`:(Math.max(...Object.values(pc.stats||{}).map((row)=>gradeOrder.indexOf(String(row?.grade||'F').replace(/[+-]/g,''))))>=4?'오러 견습':'비기너');
  if(origin)origin.realm=pc.realm;
  return next;
}
