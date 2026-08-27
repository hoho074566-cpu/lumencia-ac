export const FATE_PROGRESSION_VERSION = 1;
export const FATE_INHERITANCE_VERSION = '1.0';

const STAT_KEYS = Object.freeze(['body','mana','intelligence','divinity']);
const TALENT_KEYS = Object.freeze(['magic','martial','soul','knowledge']);
const ORIGIN_LOCK_FIELDS = Object.freeze(['regionKey','occupationKey']);
const STAT_LABELS = Object.freeze({ body:'신체', mana:'마나', intelligence:'지능', divinity:'신성' });
const GRADE_LADDER = Object.freeze(['F','E','D','C','B','A','S','SS','SSS']);
const REWARD_BY_KIND = Object.freeze({ ending:4, dead_ending:2 });
const PURCHASE_RULES = Object.freeze({
  stat:Object.freeze({ cap:6, base:2, step:2 }),
  talent:Object.freeze({ cap:7, base:3, step:3 }),
  npc_fate_affinity:Object.freeze({ cap:3, base:2, step:2 }),
  starting_resources:Object.freeze({ cap:4, base:2, step:3 }),
  origin_reroll:Object.freeze({ cap:3, base:2, step:3 }),
  origin_lock:Object.freeze({ cap:2, base:4, step:4 }),
  skill_affinity:Object.freeze({ cap:3, base:2, step:2 }),
});

function cleanText(value, max = 120) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function clampInt(value, min, max) { return Math.min(max, Math.max(min, Math.trunc(Number(value) || 0))); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function boundedMap(value, keys, cap) {
  const source=object(value);
  return Object.fromEntries(keys.map((key)=>[key,clampInt(source[key],0,cap)]).filter(([,level])=>level>0));
}
function namedLevels(value, cap, limit = 16) {
  return Object.fromEntries(Object.entries(object(value)).map(([key,level])=>[cleanText(key,80),clampInt(level,0,cap)]).filter(([key,level])=>key&&level>0).slice(0,limit));
}
function cloneProgression(value) { return JSON.parse(JSON.stringify(normalizeFateProgressionState(value))); }
function gradeIndex(value) {
  const broad=cleanText(value,12).replace(/[+-]+$/,'');
  return Math.max(0,GRADE_LADDER.indexOf(broad));
}

export function createFateProgressionState() {
  return {
    version:FATE_PROGRESSION_VERSION,
    points:0,
    totalEarned:0,
    totalSpent:0,
    endingDiscoveries:[],
    allocations:{ stats:{}, talents:{}, npcFateAffinity:{}, startingResources:0, originRerolls:0, originLocks:{}, skillAffinity:{} },
  };
}

export function normalizeFateProgressionState(value) {
  const source=object(value),allocations=object(source.allocations);
  const endingDiscoveries=[];
  const seen=new Set();
  for(const raw of safeArray(source.endingDiscoveries).slice(-256)){
    const id=cleanText(raw?.id,100),kind=Object.hasOwn(REWARD_BY_KIND,raw?.kind)?raw.kind:null;
    if(!id||!kind||seen.has(id))continue;
    seen.add(id);
    endingDiscoveries.push({id,kind,reward:clampInt(raw?.reward,0,20),discoveredAt:cleanText(raw?.discoveredAt,80)});
  }
  const points=clampInt(source.points,0,99999),totalSpent=clampInt(source.totalSpent,0,99999);
  return {
    version:FATE_PROGRESSION_VERSION,
    points,
    totalEarned:Math.max(points+totalSpent,clampInt(source.totalEarned,0,99999)),
    totalSpent,
    endingDiscoveries,
    allocations:{
      stats:boundedMap(allocations.stats,STAT_KEYS,PURCHASE_RULES.stat.cap),
      talents:boundedMap(allocations.talents,TALENT_KEYS,PURCHASE_RULES.talent.cap),
      npcFateAffinity:namedLevels(allocations.npcFateAffinity,PURCHASE_RULES.npc_fate_affinity.cap),
      startingResources:clampInt(allocations.startingResources,0,PURCHASE_RULES.starting_resources.cap),
      originRerolls:clampInt(allocations.originRerolls,0,PURCHASE_RULES.origin_reroll.cap),
      originLocks:Object.fromEntries(ORIGIN_LOCK_FIELDS.map((field)=>[field,cleanText(allocations.originLocks?.[field],80)]).filter(([,entry])=>entry)),
      skillAffinity:namedLevels(allocations.skillAffinity,PURCHASE_RULES.skill_affinity.cap),
    },
  };
}

export function awardFirstEndingDiscovery(value, { id, kind = 'ending', discoveredAt = '' } = {}) {
  const state=cloneProgression(value),endingId=cleanText(id,100),endingKind=Object.hasOwn(REWARD_BY_KIND,kind)?kind:null;
  if(!endingId||!endingKind)return {state,awarded:0,firstDiscovery:false,reason:'invalid-ending'};
  if(state.endingDiscoveries.some((row)=>row.id===endingId))return {state,awarded:0,firstDiscovery:false,reason:'already-discovered'};
  const reward=REWARD_BY_KIND[endingKind];
  state.endingDiscoveries.push({id:endingId,kind:endingKind,reward,discoveredAt:cleanText(discoveredAt,80)});
  state.points+=reward;
  state.totalEarned+=reward;
  return {state,awarded:reward,firstDiscovery:true,reason:'first-discovery'};
}

function purchaseLevel(state, category, key = '') {
  const allocations=state.allocations;
  if(category==='stat')return STAT_KEYS.includes(key)?Number(allocations.stats[key]||0):-1;
  if(category==='talent')return TALENT_KEYS.includes(key)?Number(allocations.talents[key]||0):-1;
  if(category==='npc_fate_affinity')return key?Number(allocations.npcFateAffinity[key]||0):-1;
  if(category==='starting_resources')return Number(allocations.startingResources||0);
  if(category==='origin_reroll')return Number(allocations.originRerolls||0);
  if(category==='origin_lock')return ORIGIN_LOCK_FIELDS.includes(key)?Object.keys(allocations.originLocks).length:-1;
  if(category==='skill_affinity')return key?Number(allocations.skillAffinity[key]||0):-1;
  return -1;
}

export function inheritanceUpgradeCost(value, { category, key = '' } = {}) {
  const state=normalizeFateProgressionState(value),normalizedCategory=cleanText(category,40),normalizedKey=cleanText(key,80),rule=PURCHASE_RULES[normalizedCategory];
  if(!rule)return null;
  if(normalizedCategory==='origin_lock'&&state.allocations.originLocks[normalizedKey])return 0;
  const level=purchaseLevel(state,normalizedCategory,normalizedKey);
  if(level<0||level>=rule.cap)return null;
  return rule.base+(level*rule.step);
}

export function purchaseFateInheritance(value, { category, key = '', value: selectedValue = '' } = {}) {
  const state=cloneProgression(value),normalizedCategory=cleanText(category,40),normalizedKey=cleanText(key,80),normalizedValue=cleanText(selectedValue,80),rule=PURCHASE_RULES[normalizedCategory];
  if(!rule)return {state,ok:false,cost:0,reason:'invalid-category'};
  if(normalizedCategory==='origin_lock'&&state.allocations.originLocks[normalizedKey]){
    if(!normalizedValue)return {state,ok:false,cost:0,reason:'invalid-lock'};
    state.allocations.originLocks[normalizedKey]=normalizedValue;
    return {state,ok:true,cost:0,reason:'lock-retargeted'};
  }
  const level=purchaseLevel(state,normalizedCategory,normalizedKey);
  if(level<0)return {state,ok:false,cost:0,reason:'invalid-target'};
  if(level>=rule.cap)return {state,ok:false,cost:0,reason:'cap-reached'};
  if(normalizedCategory==='origin_lock'&&!normalizedValue)return {state,ok:false,cost:0,reason:'invalid-lock'};
  const cost=rule.base+(level*rule.step);
  if(state.points<cost)return {state,ok:false,cost,reason:'insufficient-points'};
  if(normalizedCategory==='stat')state.allocations.stats[normalizedKey]=level+1;
  else if(normalizedCategory==='talent')state.allocations.talents[normalizedKey]=level+1;
  else if(normalizedCategory==='npc_fate_affinity')state.allocations.npcFateAffinity[normalizedKey]=level+1;
  else if(normalizedCategory==='starting_resources')state.allocations.startingResources=level+1;
  else if(normalizedCategory==='origin_reroll')state.allocations.originRerolls=level+1;
  else if(normalizedCategory==='origin_lock')state.allocations.originLocks[normalizedKey]=normalizedValue;
  else if(normalizedCategory==='skill_affinity')state.allocations.skillAffinity[normalizedKey]=level+1;
  state.points-=cost;
  state.totalSpent+=cost;
  return {state,ok:true,cost,reason:'purchased'};
}

export function inheritanceGenerationOptions(value, { rerollIndex = 0 } = {}) {
  const state=normalizeFateProgressionState(value);
  return {
    rerollIndex:clampInt(rerollIndex,0,state.allocations.originRerolls),
    originLocks:{...state.allocations.originLocks},
  };
}

function recalculateStartingRealm(pc, department, fallback) {
  const martialScore=gradeIndex(pc?.stats?.['신체']?.grade)+clampInt(pc?.talents?.martial,1,10);
  const magicScore=gradeIndex(pc?.stats?.['마나']?.grade)+clampInt(pc?.talents?.magic,1,10);
  if(department==='마법과 1학년'){
    const circle=magicScore>=18?7:magicScore>=17?6:magicScore>=15?5:magicScore>=13?4:magicScore>=10?3:magicScore>=7?2:1;
    return `${circle}서클`;
  }
  if(department==='기사과 1학년'){
    if(martialScore>=17)return'마스터';
    if(martialScore>=15)return'익스퍼트 최상급';
    if(martialScore>=13)return'익스퍼트 상급';
    if(martialScore>=10)return'익스퍼트 중급';
    if(martialScore>=7)return'익스퍼트 하급';
  }
  return cleanText(fallback,100)||'비기너';
}

export function applyFateInheritance(generated, progressionValue) {
  const progression=normalizeFateProgressionState(progressionValue),creation=JSON.parse(JSON.stringify(generated?.creation||{})),pc=JSON.parse(JSON.stringify(generated?.pc||{}));
  if(creation?.mode!=='fate'||!creation.fateStart?.origin)return {creation,pc};
  const allocations=progression.allocations;
  for(const [axis,level] of Object.entries(allocations.stats)){
    const label=STAT_LABELS[axis],row=pc.stats?.[label];
    if(!label||!row)continue;
    row.grade=GRADE_LADDER[Math.min(GRADE_LADDER.length-1,gradeIndex(row.grade)+level)];
  }
  for(const [talent,level] of Object.entries(allocations.talents)){
    if(!Object.hasOwn(pc.talents||{},talent))continue;
    pc.talents[talent]=clampInt(Number(pc.talents[talent]||1)+level,1,10);
  }
  const resourceLevel=allocations.startingResources,resourceGold=[0,5,12,20,30][resourceLevel]||0;
  pc.gold=Math.max(0,Number(pc.gold)||0)+resourceGold;
  pc.inventory=safeArray(pc.inventory);
  if(resourceLevel>=2&&!pc.inventory.includes('초급 회복 물약'))pc.inventory.push('초급 회복 물약');
  if(resourceLevel>=4&&!pc.inventory.includes('아카데미 보급권'))pc.inventory.push('아카데미 보급권');
  pc.fateAffinities={...allocations.npcFateAffinity};
  pc.skillAffinities={...allocations.skillAffinity};
  pc.realm=recalculateStartingRealm(pc,creation.fateStart.department,pc.realm);
  creation.fateStart.inheritance={
    version:1,
    applied:{
      stats:{...allocations.stats}, talents:{...allocations.talents}, npcFateAffinity:{...allocations.npcFateAffinity},
      startingResources:resourceLevel, originRerolls:allocations.originRerolls, originLocks:{...allocations.originLocks}, skillAffinity:{...allocations.skillAffinity},
    },
    finalEvaluation:{realm:pc.realm,stats:Object.fromEntries(Object.entries(pc.stats||{}).map(([key,row])=>[key,cleanText(row?.grade??row,12)])),talents:{...pc.talents},directRealmPurchase:false},
  };
  return {creation,pc};
}

export function normalizeFateInheritanceReceipt(value) {
  const receipt=object(value);
  if(Number(receipt.version)!==1)return null;
  const applied=object(receipt.applied),finalEvaluation=object(receipt.finalEvaluation);
  return {
    version:1,
    applied:{
      stats:boundedMap(applied.stats,STAT_KEYS,PURCHASE_RULES.stat.cap),
      talents:boundedMap(applied.talents,TALENT_KEYS,PURCHASE_RULES.talent.cap),
      npcFateAffinity:namedLevels(applied.npcFateAffinity,PURCHASE_RULES.npc_fate_affinity.cap),
      startingResources:clampInt(applied.startingResources,0,PURCHASE_RULES.starting_resources.cap),
      originRerolls:clampInt(applied.originRerolls,0,PURCHASE_RULES.origin_reroll.cap),
      originLocks:Object.fromEntries(ORIGIN_LOCK_FIELDS.map((field)=>[field,cleanText(applied.originLocks?.[field],80)]).filter(([,entry])=>entry)),
      skillAffinity:namedLevels(applied.skillAffinity,PURCHASE_RULES.skill_affinity.cap),
    },
    finalEvaluation:{
      realm:cleanText(finalEvaluation.realm,100),
      stats:Object.fromEntries(Object.entries(object(finalEvaluation.stats)).map(([key,grade])=>[cleanText(key,40),cleanText(grade,12)]).filter(([key,grade])=>key&&grade).slice(0,8)),
      talents:boundedMap(finalEvaluation.talents,TALENT_KEYS,10),
      directRealmPurchase:false,
    },
  };
}

export function compactFateInheritanceForModel(creation) {
  const receipt=creation?.mode==='fate'?normalizeFateInheritanceReceipt(creation.fateStart?.inheritance):null;
  if(!receipt)return null;
  const applied=object(receipt.applied),finalEvaluation=object(receipt.finalEvaluation);
  const npcFateAffinity=namedLevels(applied.npcFateAffinity,PURCHASE_RULES.npc_fate_affinity.cap),skillAffinity=namedLevels(applied.skillAffinity,PURCHASE_RULES.skill_affinity.cap);
  if(!Object.keys(npcFateAffinity).length&&!Object.keys(skillAffinity).length)return null;
  return {
    version:FATE_INHERITANCE_VERSION,
    detail:{
      npc_fate_affinity:npcFateAffinity, skill_affinity:skillAffinity,
      final_evaluation:{realm:cleanText(finalEvaluation.realm,100),stats:object(finalEvaluation.stats),talents:object(finalEvaluation.talents),direct_realm_purchase:false},
      policy:'affinity eases first impression, trust formation, or entry conditions only; no automatic success, relationship delta, shared history, or result purchase',
    },
    affinityCount:Object.keys(npcFateAffinity).length+Object.keys(skillAffinity).length,
  };
}

export function buildFateInheritanceDirective({ creation } = {}) {
  const model=compactFateInheritanceForModel(creation);
  if(!model)return'';
  return `[P2-PR05 FATE INHERITANCE]\n${JSON.stringify(model.detail)}\n계승은 현재 회차의 시작 조건 보정이다. NPC Fate Affinity는 첫인상·신뢰 형성·관련 이벤트 진입 난도를 완화할 수 있지만 관계 수치, 호감, 성공, 정보, 선택 결과를 자동으로 지급하지 않는다. Origin/Background에 실제 과거 인연 근거가 없으면 Shared History로 해석하지 않는다. Skill Affinity는 관련 기술의 학습 적성과 시작 조건일 뿐 숙련 등급이나 판정 성공을 자동 구매하지 않는다. 경지/서클은 직접 구매값이 아니라 최종 Stats/Talents 평가 결과다.`;
}
