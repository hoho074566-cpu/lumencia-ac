export const FATE_ENDING_VERSION = 1;

export const ENDING_REGISTRY = Object.freeze({
  'general.graduation': Object.freeze({ endingId:'general.graduation', category:'general', title:'일반 졸업', conditions:'학업을 정식으로 마치고 졸업한다.', characters:[], worldState:'academy', reward:3 }),
  'general.honors': Object.freeze({ endingId:'general.honors', category:'general', title:'우등 졸업', conditions:'탁월한 성취를 인정받아 우등으로 졸업한다.', characters:[], worldState:'academy', reward:5 }),
  'character.companion': Object.freeze({ endingId:'character.companion', category:'character', title:'끝까지 함께한 동료', conditions:'한 인물과 동료로서 회차의 결말을 함께한다.', characters:['{npc_key}'], worldState:'character', reward:4 }),
  'character.alliance': Object.freeze({ endingId:'character.alliance', category:'character', title:'정치적 동맹', conditions:'한 인물과 지속 가능한 정치적 동맹을 완성한다.', characters:['{npc_key}'], worldState:'politics', reward:5 }),
  'character.co_rule': Object.freeze({ endingId:'character.co_rule', category:'character', title:'공동 통치', conditions:'한 인물과 공동 통치의 결말에 도달한다.', characters:['{npc_key}'], worldState:'imperial', reward:6 }),
  'character.journey': Object.freeze({ endingId:'character.journey', category:'character', title:'함께 떠난 여행', conditions:'한 인물과 다음 여정을 함께 시작한다.', characters:['{npc_key}'], worldState:'wanderer', reward:4 }),
  'character.rival': Object.freeze({ endingId:'character.rival', category:'character', title:'경쟁과 상호 인정', conditions:'한 인물과 서로를 인정하는 경쟁의 결말에 도달한다.', characters:['{npc_key}'], worldState:'character', reward:4 }),
  'world.imperial': Object.freeze({ endingId:'world.imperial', category:'world', title:'제국의 새 질서', conditions:'제국의 권력 구조가 회복 불가능하게 재편된다.', characters:[], worldState:'imperial', reward:7 }),
  'world.academy': Object.freeze({ endingId:'world.academy', category:'world', title:'아카데미의 미래', conditions:'루멘시아 아카데미의 미래가 결정되는 결말에 도달한다.', characters:[], worldState:'academy', reward:6 }),
  'world.military': Object.freeze({ endingId:'world.military', category:'world', title:'전장의 시대', conditions:'군사 질서와 전쟁의 향방이 결정된다.', characters:[], worldState:'military', reward:7 }),
  'world.demon_cult': Object.freeze({ endingId:'world.demon_cult', category:'world', title:'마신과 교단', conditions:'마신 또는 교단을 둘러싼 세계 질서가 확정된다.', characters:[], worldState:'demon_cult', reward:8 }),
  'world.god': Object.freeze({ endingId:'world.god', category:'world', title:'신들의 응답', conditions:'신격과 세계의 관계가 하나의 결말에 도달한다.', characters:[], worldState:'god', reward:8 }),
  'world.transcendence': Object.freeze({ endingId:'world.transcendence', category:'world', title:'초월', conditions:'PC 또는 세계가 기존 경계를 넘어선 결말에 도달한다.', characters:[], worldState:'transcendence', reward:9 }),
  'world.collapse': Object.freeze({ endingId:'world.collapse', category:'world', title:'붕괴 이후', conditions:'세계의 핵심 질서가 붕괴하고 그 결과가 확정된다.', characters:[], worldState:'collapse', reward:8 }),
  'world.wanderer': Object.freeze({ endingId:'world.wanderer', category:'world', title:'방랑자의 길', conditions:'기존 질서 밖의 여정을 선택하며 회차를 마친다.', characters:[], worldState:'wanderer', reward:5 }),
  'world.secret': Object.freeze({ endingId:'world.secret', category:'secret', title:'미지의 종장', conditions:'숨겨진 세계 조건을 충족한 결말에 도달한다.', characters:[], worldState:'secret', reward:10 }),
  'dead.irrecoverable': Object.freeze({ endingId:'dead.irrecoverable', category:'dead', title:'되돌릴 수 없는 종말', conditions:'실제 사망 또는 회복 불가능한 terminal catastrophe가 확정된다.', characters:[], worldState:'dead', reward:2 }),
});

export const ENDING_CONDITION_GUIDE = Object.values(ENDING_REGISTRY)
  .map((row)=>`${row.endingId}${row.category==='character'?':<npc_key>':''}: ${row.conditions}`)
  .join('\n');

export const FATE_ENDING_CONTRACT = String.raw`[FATE ENDING RUNTIME V1]
ending_receipts는 회차가 실제로 끝난 현재 턴에만 쓴다. 일반 실패·패배·부상·후퇴는 Ending이나 Dead Ending이 아니라 새 이야기 상태다.
Dead Ending은 실제 사망 또는 회복 불가능한 terminal catastrophe만 허용하며 terminal_outcome=death/catastrophe와 irreversible=true가 모두 필요하다. 소생·회복·구조 가능성이 남으면 금지한다.
일반/인연/세계 Ending은 terminal_outcome=life_complete와 irreversible=true를 쓴다. 한 종장에서 서로 독립적인 일반·인연·세계 Ending을 함께 기록할 수 있다.
META/AUTO/CONTINUE 요청에서는 Ending/Dead Ending을 서술하거나 ending_receipts/ending: 신호를 만들지 않는다.
허용 ending_id: general.graduation, general.honors, character.companion:<npc_key>, character.alliance:<npc_key>, character.co_rule:<npc_key>, character.journey:<npc_key>, character.rival:<npc_key>, world.imperial, world.academy, world.military, world.demon_cult, world.god, world.transcendence, world.collapse, world.wanderer, world.secret, dead.irrecoverable.
다음 canonical 조건을 실제로 충족한 ID만 고른다:
${ENDING_CONDITION_GUIDE}
각 receipt마다 state_delta.completed_events_add에 정확히 ending:<ending_id> 신호를 함께 넣는다. 조건이 불확실하면 receipt와 신호를 모두 만들지 않는다. 같은 Ending 재발견은 가능하지만 최초 보상은 runtime ledger가 한 번만 지급한다.`;

const FORBIDDEN_KEYS = new Set(['__proto__','prototype','constructor']);
const UNKNOWN_DISCOVERY_AT = new Date(0).toISOString();

function clean(value,max=320){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function array(value){return Array.isArray(value)?value:[];}
function iso(value){const text=clean(value,40);return /^\d{4}-\d{2}-\d{2}T/.test(text)?text:'';}

export function resolveEndingDefinition(rawId,{allowedCharacterKeys=[]}={}){
  const endingId=clean(rawId,120);
  if(!endingId||FORBIDDEN_KEYS.has(endingId))return null;
  if(Object.hasOwn(ENDING_REGISTRY,endingId))return{...ENDING_REGISTRY[endingId],discoveryId:endingId,characterKeys:[]};
  const split=endingId.lastIndexOf(':');
  if(split<=0)return null;
  const baseId=endingId.slice(0,split),characterKey=endingId.slice(split+1);
  const base=Object.hasOwn(ENDING_REGISTRY,baseId)?ENDING_REGISTRY[baseId]:null;
  if(!base||base.category!=='character'||!/^[a-z0-9_-]{1,64}$/i.test(characterKey)||FORBIDDEN_KEYS.has(characterKey))return null;
  const allowed=new Set(array(allowedCharacterKeys).map(String));
  if(allowed.size&&!allowed.has(characterKey))return null;
  return{...base,discoveryId:`${baseId}:${characterKey}`,characterKeys:[characterKey]};
}

function normalizedRecord(raw,options={}){
  const source=object(raw),definition=resolveEndingDefinition(source.discoveryId||source.endingId||source.id,options);
  if(!definition)return null;
  const discoveredAt=iso(source.discoveredAt||source.firstDiscoveredAt)||UNKNOWN_DISCOVERY_AT;
  return{
    discoveryId:definition.discoveryId,
    endingId:definition.endingId,
    category:definition.category,
    title:definition.title,
    characters:[...definition.characterKeys],
    worldState:clean(source.worldState||definition.worldState,240)||definition.worldState,
    reason:clean(source.reason,500)||definition.conditions,
    reward:Number(definition.reward),
    discoveredAt,
    runId:clean(source.runId,100)||null,
    turnNumber:Math.max(0,Math.trunc(Number(source.turnNumber)||0)),
  };
}

export function normalizeFateBook(raw,options={}){
  const source=object(raw),rows=[];
  if(Array.isArray(source.discoveries))rows.push(...source.discoveries);
  else rows.push(...Object.values(object(source.discoveries)));
  for(const id of array(source.discoveredIds))rows.push({discoveryId:id});
  const discoveries={};
  for(const rawRow of rows){
    const row=normalizedRecord(rawRow,options);if(!row)continue;
    const previous=discoveries[row.discoveryId];
    const rowKnown=row.discoveredAt!==UNKNOWN_DISCOVERY_AT,previousKnown=previous?.discoveredAt!==UNKNOWN_DISCOVERY_AT;
    if(!previous||(!previousKnown&&rowKnown)||(previousKnown===rowKnown&&row.discoveredAt<previous.discoveredAt))discoveries[row.discoveryId]=row;
  }
  const rewardLedger={};
  for(const [id,row] of Object.entries(discoveries))rewardLedger[id]={source:`ending:first-discovery:${id}`,amount:row.reward,grantedAt:row.discoveredAt};
  return{version:FATE_ENDING_VERSION,discoveries,rewardLedger,rewardTotal:Object.values(rewardLedger).reduce((sum,row)=>sum+Number(row.amount||0),0)};
}

export function reconcileFateBooks(current,incoming,options={}){
  const a=normalizeFateBook(current,options),b=normalizeFateBook(incoming,options);
  return normalizeFateBook({discoveries:[...Object.values(a.discoveries),...Object.values(b.discoveries)]},options);
}

export function fateBookRuntimeSnapshot(raw,options={}){
  const book=normalizeFateBook(raw,options);
  return{version:book.version,discoveredIds:Object.keys(book.discoveries),rewardTotal:book.rewardTotal};
}

export function endingRegistryState(raw,options={}){
  const book=normalizeFateBook(raw,options),ids=Object.keys(book.discoveries);
  return Object.fromEntries(Object.entries(ENDING_REGISTRY).map(([id,row])=>{
    const discoveredIds=row.category==='character'?ids.filter((value)=>value.startsWith(`${id}:`)):ids.filter((value)=>value===id);
    return[id,{...row,discovered:discoveredIds.length>0,discoveredIds}];
  }));
}

function normalizeReceipt(raw,options={}){
  const row=object(raw),definition=resolveEndingDefinition(row.ending_id||row.endingId,options);
  if(!definition)return null;
  const terminalOutcome=clean(row.terminal_outcome||row.terminalOutcome,24);
  if(!['life_complete','death','catastrophe'].includes(terminalOutcome))return null;
  const irreversible=row.irreversible===true;
  if(!irreversible)return null;
  if(definition.category==='dead'){
    if(!['death','catastrophe'].includes(terminalOutcome))return null;
  }else if(terminalOutcome!=='life_complete')return null;
  return{
    ending_id:definition.discoveryId,
    terminal_outcome:terminalOutcome,
    irreversible,
    reason:clean(row.reason,500)||definition.conditions,
    world_state:clean(row.world_state||row.worldState,240)||definition.worldState,
    definition,
  };
}

export function applyEndingReceipts({fateBook,receipts,stateDelta,allowedCharacterKeys=[],runId='',turnNumber=0,mode='game',now=new Date().toISOString()}={}){
  const options={allowedCharacterKeys},book=normalizeFateBook(fateBook,options),accepted=[],repeated=[],validReceipts=[],seen=new Set();
  if(mode!=='game')return{fateBook:book,acceptedDiscoveries:accepted,repeatedDiscoveries:repeated,validReceipts};
  const signals=new Set(array(stateDelta?.completed_events_add).map((value)=>clean(value,240)));
  for(const raw of array(receipts).slice(0,4)){
    const receipt=normalizeReceipt(raw,options);if(!receipt||seen.has(receipt.ending_id))continue;
    seen.add(receipt.ending_id);
    if(!signals.has(`ending:${receipt.ending_id}`))continue;
    validReceipts.push({ending_id:receipt.ending_id,terminal_outcome:receipt.terminal_outcome,irreversible:receipt.irreversible,reason:receipt.reason,world_state:receipt.world_state});
    const existing=book.discoveries[receipt.ending_id];
    if(existing){repeated.push(existing);continue;}
    const record=normalizedRecord({
      discoveryId:receipt.ending_id,reason:receipt.reason,worldState:receipt.world_state,
      discoveredAt:now,runId,turnNumber,
    },options);
    if(!record)continue;
    book.discoveries[record.discoveryId]=record;
    book.rewardLedger[record.discoveryId]={source:`ending:first-discovery:${record.discoveryId}`,amount:record.reward,grantedAt:record.discoveredAt};
    accepted.push(record);
  }
  book.rewardTotal=Object.values(book.rewardLedger).reduce((sum,row)=>sum+Number(row.amount||0),0);
  return{fateBook:book,acceptedDiscoveries:accepted,repeatedDiscoveries:repeated,validReceipts};
}

export function projectEndingSignals(completedEventsAdd,validReceipts,{allow=false}={}){
  const valid=allow?new Set(array(validReceipts).map((row)=>`ending:${clean(row?.ending_id,120)}`)):new Set();
  return array(completedEventsAdd).filter((value)=>{
    const signal=clean(value,240);
    return !signal.startsWith('ending:')||valid.has(signal);
  });
}
