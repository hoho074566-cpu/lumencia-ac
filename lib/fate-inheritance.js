import { normalizeFateBook } from './fate-ending.js';

export const FATE_INHERITANCE_VERSION = 1;

export const FATE_AFFINITY_CANDIDATE_KEYS = Object.freeze([
  'lillia','laris','sera','isabel','artemis','anastasia',
  'lena','sia','serena','chloe','elena','lucia','elise',
  'mirabelle','aria','emily',
]);

export const INHERITANCE_LIMITS = Object.freeze({
  statBoost: 2,
  talentBoost: 2,
  startingResources: 3,
  fateAffinity: 2,
  originRerolls: 2,
  originDraw: 2,
});

const STAT_KEYS = Object.freeze(['body','mana','intelligence','divinity']);
const TALENT_KEYS = Object.freeze(['magic','martial','soul','knowledge']);
const FORBIDDEN_LEDGER_KEYS = new Set(['__proto__','prototype','constructor']);
const FORBIDDEN_DIRECT_PURCHASES = Object.freeze(['realm','circle','realmLevel','circleLevel']);
const COST_STEPS = Object.freeze({
  statBoost: Object.freeze([2,4]),
  talentBoost: Object.freeze([2,4]),
  startingResources: Object.freeze([1,2,3]),
  fateAffinity: Object.freeze([2,3]),
  originRerolls: Object.freeze([1,2]),
  regionLock: 2,
  occupationLock: 3,
});

function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function clean(value,max=120){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);}
function iso(value){const text=clean(value,40);return /^\d{4}-\d{2}-\d{2}T/.test(text)?text:'';}
function integer(value){return Number.isInteger(Number(value))?Number(value):NaN;}
function sumSteps(steps,count){let total=0;for(let index=0;index<count;index+=1)total+=Number(steps[index]||0);return total;}

function boundedInteger(value,max,label,{strict=false}={}){
  const number=integer(value??0);
  if(Number.isInteger(number)&&number>=0&&number<=max)return number;
  if(strict)throw new Error(`${label} 계승 단계가 허용 범위를 벗어남.`);
  return null;
}

function normalizeBoostMap(raw,keys,max,label,options){
  const source=object(raw),result={};
  for(const key of keys){
    const value=boundedInteger(source[key],max,`${label}.${key}`,options);
    if(value===null)return null;
    result[key]=value;
  }
  return result;
}

function parseAllocation(raw,{allowedNpcKeys=[],strict=false}={}){
  const source=object(raw);
  if(FORBIDDEN_DIRECT_PURCHASES.some((key)=>Object.hasOwn(source,key))){
    if(strict)throw new Error('Realm / Circle은 계승 포인트로 직접 구매할 수 없음.');
    return null;
  }
  const stats=normalizeBoostMap(source.stats,STAT_KEYS,INHERITANCE_LIMITS.statBoost,'stats',{strict});
  const talents=normalizeBoostMap(source.talents,TALENT_KEYS,INHERITANCE_LIMITS.talentBoost,'talents',{strict});
  const startingResources=boundedInteger(source.startingResources,INHERITANCE_LIMITS.startingResources,'startingResources',{strict});
  const originRerolls=boundedInteger(source.originRerolls,INHERITANCE_LIMITS.originRerolls,'originRerolls',{strict});
  const originDraw=boundedInteger(source.originDraw,INHERITANCE_LIMITS.originDraw,'originDraw',{strict});
  const affinitySource=object(source.fateAffinity),affinityLevel=boundedInteger(affinitySource.level,INHERITANCE_LIMITS.fateAffinity,'fateAffinity.level',{strict});
  if(!stats||!talents||startingResources===null||originRerolls===null||originDraw===null||affinityLevel===null)return null;
  if(originDraw>originRerolls){
    if(strict)throw new Error('선택한 Origin 후보가 구매한 추가 추첨 수를 초과함.');
    return null;
  }
  const allowed=new Set((Array.isArray(allowedNpcKeys)?allowedNpcKeys:[]).map(String));
  const npcKey=affinityLevel>0?clean(affinitySource.npcKey,64):'';
  if(affinityLevel>0&&(!npcKey||(allowed.size&&!allowed.has(npcKey)))){
    if(strict)throw new Error('Fate Affinity는 등록된 NPC를 선택해야 함.');
    return null;
  }
  const locks=object(source.originLocks),regionKey=clean(locks.regionKey,32),occupationKey=clean(locks.occupationKey,64);
  return{
    version:FATE_INHERITANCE_VERSION,
    stats,
    talents,
    startingResources,
    fateAffinity:{npcKey,level:affinityLevel},
    originRerolls,
    originDraw,
    originLocks:{regionKey,occupationKey},
  };
}

export function normalizeInheritanceAllocation(raw,options={}){
  return parseAllocation(raw,options)||parseAllocation({},options);
}

export function quoteInheritanceAllocation(raw,options={}){
  const allocation=parseAllocation(raw,{...options,strict:true}),breakdown={};
  breakdown.stats=Object.values(allocation.stats).reduce((sum,count)=>sum+sumSteps(COST_STEPS.statBoost,count),0);
  breakdown.talents=Object.values(allocation.talents).reduce((sum,count)=>sum+sumSteps(COST_STEPS.talentBoost,count),0);
  breakdown.startingResources=sumSteps(COST_STEPS.startingResources,allocation.startingResources);
  breakdown.fateAffinity=sumSteps(COST_STEPS.fateAffinity,allocation.fateAffinity.level);
  breakdown.originRerolls=sumSteps(COST_STEPS.originRerolls,allocation.originRerolls);
  breakdown.originLocks=(allocation.originLocks.regionKey?COST_STEPS.regionLock:0)+(allocation.originLocks.occupationKey?COST_STEPS.occupationLock:0);
  return{allocation,breakdown,cost:Object.values(breakdown).reduce((sum,value)=>sum+Number(value||0),0)};
}

function fateRewardAuthority(fateBook,{allowedCharacterKeys=[]}={}){
  const normalized=normalizeFateBook(fateBook,{allowedCharacterKeys});
  return{
    total:Math.max(0,Math.trunc(Number(normalized.rewardTotal)||0)),
    sourceIds:Object.keys(normalized.rewardLedger||{}).sort(),
  };
}

function normalizedPurchase(raw,options={}){
  const source=object(raw),lifeId=clean(source.lifeId,100),historicalOptions={...options,allowedNpcKeys:[]},allocation=parseAllocation(source.allocation,historicalOptions);
  if(!lifeId||FORBIDDEN_LEDGER_KEYS.has(lifeId)||!allocation)return null;
  let quote;
  try{quote=quoteInheritanceAllocation(allocation,historicalOptions);}catch{return null;}
  return{
    lifeId,
    sourceRunId:clean(source.sourceRunId,100)||null,
    purchasedAt:iso(source.purchasedAt)||new Date(0).toISOString(),
    cost:quote.cost,
    allocation:quote.allocation,
    rewardSources:[...new Set((Array.isArray(source.rewardSources)?source.rewardSources:[]).map((value)=>clean(value,120)).filter(Boolean))].sort(),
  };
}

export function normalizeInheritanceState(raw,options={}){
  const source=object(raw),sourcePurchases=object(source.purchases),preferred=Array.isArray(source.purchaseOrder)?source.purchaseOrder.map((value)=>clean(value,100)).filter(Boolean):[];
  const remaining=Object.keys(sourcePurchases).filter((key)=>!preferred.includes(key)).sort((a,b)=>{
    const at=iso(sourcePurchases[a]?.purchasedAt)||new Date(0).toISOString(),bt=iso(sourcePurchases[b]?.purchasedAt)||new Date(0).toISOString();
    return at.localeCompare(bt)||a.localeCompare(b);
  });
  const purchases={},purchaseOrder=[];
  for(const rawId of [...preferred,...remaining]){
    const row=normalizedPurchase({...object(sourcePurchases[rawId]),lifeId:sourcePurchases[rawId]?.lifeId||rawId},options);
    if(!row||Object.hasOwn(purchases,row.lifeId))continue;
    purchases[row.lifeId]=row;purchaseOrder.push(row.lifeId);
  }
  return{version:FATE_INHERITANCE_VERSION,purchases,purchaseOrder};
}

export function reconcileInheritanceStates(current,incoming,options={}){
  const live=normalizeInheritanceState(current,options),stale=normalizeInheritanceState(incoming,options);
  const purchases={...live.purchases},purchaseOrder=[...live.purchaseOrder];
  for(const lifeId of stale.purchaseOrder){
    if(Object.hasOwn(purchases,lifeId))continue;
    purchases[lifeId]=stale.purchases[lifeId];purchaseOrder.push(lifeId);
  }
  return{version:FATE_INHERITANCE_VERSION,purchases,purchaseOrder};
}

export function inheritancePointSummary(state,fateBook,options={}){
  const normalized=normalizeInheritanceState(state,options),authority=fateRewardAuthority(fateBook,options);
  const spent=normalized.purchaseOrder.reduce((sum,lifeId)=>sum+Number(normalized.purchases[lifeId]?.cost||0),0);
  return{earned:authority.total,spent,available:Math.max(0,authority.total-spent),overspent:Math.max(0,spent-authority.total),rewardSources:authority.sourceIds};
}

export function commitInheritancePurchase(state,{fateBook,allocation,lifeId,sourceRunId='',now=new Date().toISOString(),allowedNpcKeys=[],allowedCharacterKeys=[]}={}){
  const options={allowedNpcKeys,allowedCharacterKeys},normalized=normalizeInheritanceState(state,options),id=clean(lifeId,100);
  if(!id||FORBIDDEN_LEDGER_KEYS.has(id))throw new Error('유효한 Next Life 식별자가 필요함.');
  if(Object.hasOwn(normalized.purchases,id))return{state:normalized,purchase:normalized.purchases[id],summary:inheritancePointSummary(normalized,fateBook,options),reused:true};
  const quote=quoteInheritanceAllocation(allocation,options),before=inheritancePointSummary(normalized,fateBook,options);
  if(quote.cost>before.available)throw new Error(`계승 포인트 부족: 필요 ${quote.cost}, 사용 가능 ${before.available}`);
  if(quote.cost===0)return{state:normalized,purchase:null,summary:before,reused:false};
  const purchase={lifeId:id,sourceRunId:clean(sourceRunId,100)||null,purchasedAt:iso(now)||new Date().toISOString(),cost:quote.cost,allocation:quote.allocation,rewardSources:[...before.rewardSources]};
  const next={version:FATE_INHERITANCE_VERSION,purchases:{...normalized.purchases,[id]:purchase},purchaseOrder:[...normalized.purchaseOrder,id]};
  return{state:next,purchase,summary:inheritancePointSummary(next,fateBook,options),reused:false};
}

export function inheritanceRuntimeSnapshot(state,fateBook,options={}){
  const normalized=normalizeInheritanceState(state,options),summary=inheritancePointSummary(normalized,fateBook,options);
  return{version:FATE_INHERITANCE_VERSION,earned:summary.earned,spent:summary.spent,available:summary.available,lifeCount:normalized.purchaseOrder.length};
}
