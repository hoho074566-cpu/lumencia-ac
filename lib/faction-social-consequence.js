// Lumensia V1.5.6 Faction / Social Consequence V1
// Bounded public-faction reputation state. No model calls and no save migration.

export const FACTION_SOCIAL_VERSION = '1.0';

export const FACTION_REGISTRY = Object.freeze({
  student_council: Object.freeze({ name:'학생회', aliases:Object.freeze(['학생회','학생 자치']) }),
  blue_knights: Object.freeze({ name:'청기사단', aliases:Object.freeze(['청기사단','기율단체','교내 순찰']) }),
  white_rose: Object.freeze({ name:'백장미회', aliases:Object.freeze(['백장미회','백장미','사교회']) }),
  knight_department: Object.freeze({ name:'기사과', aliases:Object.freeze(['기사과','기사학부']) }),
  magic_department: Object.freeze({ name:'마법과', aliases:Object.freeze(['마법과','마법학부']) }),
  theology_department: Object.freeze({ name:'신학부', aliases:Object.freeze(['신학부','신학과']) }),
});

export const FACTION_KEYS = Object.freeze(Object.keys(FACTION_REGISTRY));
export const FACTION_EVIDENCE_TYPES = Object.freeze(['public_event','official_record','witnessed_action','credible_rumor']);

const FACTION_KEY_SET = new Set(FACTION_KEYS);
const EVIDENCE_TYPE_SET = new Set(FACTION_EVIDENCE_TYPES);

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function clamp(value,min,max,fallback=0) {
  const number=Number(value);
  return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback;
}
function clampText(value,max=120) { return String(value??'').replace(/\s+/g,' ').trim().slice(0,max); }
function boundedTurn(value) { return Math.trunc(clamp(value,0,1_000_000_000,0)); }
function uniqueNpcKeys(value,registeredNpcKeys=null) {
  const registered=registeredNpcKeys==null?null:new Set(array(registeredNpcKeys).map(String));
  return [...new Set(array(value).map((key)=>clampText(key,64)).filter((key)=>key&&(!registered||registered.has(key))))].slice(0,4);
}
function evidenceIsSufficient(type,observerKeys,source='') {
  if(type==='public_event'||type==='official_record')return true;
  if(type==='witnessed_action')return observerKeys.length>0;
  return type==='credible_rumor'&&observerKeys.length>0&&Boolean(source);
}
function normalizeHistory(value,registeredNpcKeys=null) {
  return array(value).slice(-8).flatMap((raw)=>{
    const row=object(raw),evidenceType=String(row.evidence_type||''),observerKeys=uniqueNpcKeys(row.observer_npc_keys,registeredNpcKeys),source=clampText(row.source,120)||null;
    if(!EVIDENCE_TYPE_SET.has(evidenceType)||!evidenceIsSufficient(evidenceType,observerKeys,source))return [];
    return {
      turn:boundedTurn(row.turn),reputation_delta:Math.trunc(clamp(row.reputation_delta,-10,10,0)),
      stance:clampText(row.stance,80)||null,evidence_type:evidenceType,
      observer_npc_keys:observerKeys,source,reason:clampText(row.reason,300),
      source_event:clampText(row.source_event,120)||null,
    };
  }).filter((row)=>row.reason);
}

export function normalizeFactionSocial(value={}, { registeredNpcKeys = null } = {}) {
  const source=object(object(value).reputations),rows=[];
  for(const [factionKey,raw] of Object.entries(source)){
    if(!FACTION_KEY_SET.has(factionKey))continue;
    const row=object(raw);
    rows.push([factionKey,{
      reputation:Math.trunc(clamp(row.reputation,-100,100,0)),stance:clampText(row.stance,80)||'중립',
      reason:clampText(row.reason,300),updated_turn:boundedTurn(row.updated_turn),history:normalizeHistory(row.history,registeredNpcKeys),
    }]);
  }
  rows.sort((left,right)=>right[1].updated_turn-left[1].updated_turn||Math.abs(right[1].reputation)-Math.abs(left[1].reputation)||left[0].localeCompare(right[0]));
  return { version:FACTION_SOCIAL_VERSION, reputations:Object.fromEntries(rows.slice(0,8)) };
}

export function factionReputationChangeIsReal(saveState={},raw={}) {
  const row=object(raw),factionKey=String(row.faction_key||'').trim(),reason=clampText(row.reason,300);
  if(!FACTION_KEY_SET.has(factionKey)||!reason)return false;
  const evidenceType=String(row.evidence_type||'');
  if(!EVIDENCE_TYPE_SET.has(evidenceType))return false;
  const observers=uniqueNpcKeys(row.observer_npc_keys),source=clampText(row.source,120)||null;
  if(!evidenceIsSufficient(evidenceType,observers,source))return false;
  const previous=object(normalizeFactionSocial(saveState?.sceneRuntime?.faction_social).reputations[factionKey]);
  const delta=Math.trunc(clamp(row.reputation_delta,-10,10,0)),stance=clampText(row.stance,80)||null;
  return delta!==0||Boolean(stance&&stance!==String(previous.stance||'중립'));
}

export function deriveFactionSocialState({ previous = {}, changes = [], turnNumber = 0, sourceEvent = '', registeredNpcKeys = null } = {}) {
  const normalized=normalizeFactionSocial(previous,{registeredNpcKeys}),reputations={...normalized.reputations},safeTurn=boundedTurn(turnNumber);
  for(const raw of array(changes).slice(0,4)){
    const row=object(raw),factionKey=String(row.faction_key||'').trim(),reason=clampText(row.reason,300);
    if(!FACTION_KEY_SET.has(factionKey)||!reason)continue;
    const evidenceType=String(row.evidence_type||'');
    if(!EVIDENCE_TYPE_SET.has(evidenceType))continue;
    const observers=uniqueNpcKeys(row.observer_npc_keys,registeredNpcKeys),source=clampText(row.source,120)||null;
    if(!evidenceIsSufficient(evidenceType,observers,source))continue;
    const old=object(reputations[factionKey]),delta=Math.trunc(clamp(row.reputation_delta,-10,10,0)),stance=clampText(row.stance,80)||null;
    if(delta===0&&(!stance||stance===String(old.stance||'중립')))continue;
    const historyRow={turn:safeTurn,reputation_delta:delta,stance,evidence_type:evidenceType,observer_npc_keys:observers,source,reason,source_event:clampText(sourceEvent,120)||null};
    reputations[factionKey]={
      reputation:Math.trunc(clamp(Number(old.reputation||0)+delta,-100,100,0)),stance:stance||clampText(old.stance,80)||'중립',
      reason,updated_turn:safeTurn,history:[...array(old.history),historyRow].slice(-8),
    };
  }
  return normalizeFactionSocial({reputations},{registeredNpcKeys});
}

export function compactFactionSocialForContext(value={}, { text = '', recentTexts = [], keywords = [], maxFactions = 3, historyLimit = 2, registeredNpcKeys = null } = {}) {
  const normalized=normalizeFactionSocial(value,{registeredNpcKeys}),directText=String(text||'').toLowerCase(),recentContexts=array(recentTexts).map((value)=>String(value||'').toLowerCase()),keywordText=array(keywords).join(' ').toLowerCase();
  const ranked=Object.entries(normalized.reputations).map(([key,row])=>{
    const faction=FACTION_REGISTRY[key],aliases=[key,faction.name,...faction.aliases].map((alias)=>String(alias).toLowerCase());
    const directMatch=aliases.some((alias)=>directText.includes(alias)),keywordMatch=aliases.some((alias)=>keywordText.includes(alias));
    const recentScore=recentContexts.reduce((score,context,index)=>aliases.some((alias)=>context.includes(alias))?Math.max(score,2_000_000+(index+1)*100_000):score,0);
    return {key,row,score:(directMatch?3_000_000:recentScore||(keywordMatch?1_000_000:0))+Number(row.updated_turn||0)*10+Math.abs(Number(row.reputation||0))};
  }).sort((left,right)=>right.score-left.score||left.key.localeCompare(right.key)).slice(0,Math.max(0,Math.min(6,Number(maxFactions)||0)));
  return {
    version:FACTION_SOCIAL_VERSION,
    reputations:Object.fromEntries(ranked.map(({key,row})=>[key,{...row,history:array(row.history).slice(-Math.max(0,Math.min(2,Number(historyLimit)||0)))}])),
  };
}

export function compactFactionSocialTelemetry(value={},previous={}) {
  const normalized=normalizeFactionSocial(value),prior=normalizeFactionSocial(previous),factionKeys=Object.keys(normalized.reputations).slice(0,6);
  if(!factionKeys.length)return null;
  const changedFactionKeys=factionKeys.filter((key)=>JSON.stringify(normalized.reputations[key])!==JSON.stringify(prior.reputations[key])).slice(0,4);
  return {version:FACTION_SOCIAL_VERSION,faction_keys:factionKeys,changed_faction_keys:changedFactionKeys};
}
