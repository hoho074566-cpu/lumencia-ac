// LUMENSIA V1.5.6 Stable Context Router + Event Director V2.1
// Preserves V1.5.3 HF1 15-20K relevance budgets.
// NPC Goal Tick V1: guarded present-NPC initiative without an additional model call.
// Stable path: api/lib/context-router.js

import { NARRATIVE_TIME_POLICY_VERSION, activityRangeLimitMinutes, buildSceneMomentumDirective, classifySceneIntent, isPcRelevantScheduleEvent, nextScheduleBoundaryMinutes, scheduleBoundaryLimitMinutes } from '../../lib/scene-momentum.js';
import { buildSceneNoveltyDirective } from '../../lib/scene-novelty.js';
import { buildScenePurposeDirective, normalizeScenePurpose } from '../../lib/scene-purpose.js';
import { buildSceneExitDirective, normalizeSceneExitCondition } from '../../lib/scene-exit.js';
import { buildTurnHookDirective, normalizeTurnHook } from '../../lib/turn-hook.js';
import { buildEventConsequenceDirective, minutesUntilEventConsequence, selectDueEventConsequence } from '../../lib/event-consequence.js';
import { NPC_GOAL_TICK_VERSION, isGoalTickCoolingDown } from '../../lib/npc-goal-tick.js';
import { FACTION_REGISTRY, compactFactionSocialForContext } from '../../lib/faction-social-consequence.js';
import { buildSceneOrchestrationDirective, deriveSceneOrchestrationPlan, sceneOrchestrationActionFrame, sceneOrchestrationSuppressesDirectorResult } from '../../lib/scene-orchestration.js';
import { buildWorldResultSurfacingDirective, selectWorldResultForSurfacing, WORLD_RESULT_SURFACING_VERSION } from '../../lib/world-result-surfacing.js';
import { buildActiveThreadsDirective } from '../../lib/active-threads.js';
import { deriveNpcSignificanceBoundary } from '../../lib/npc-significance.js';
import { buildNpcCharacterBehaviorDirective, compactNpcCharacterBehavior } from '../../lib/npc-character-behavior.js';
import { buildFateBackgroundDirective, compactFateBackgroundForModel } from '../../lib/fate-background.js';
import { buildFatePersonalStoryDirective, compactFatePersonalStoryForModel } from '../../lib/fate-personal-story.js';
import { FATE_ENDING_CONTRACT } from '../../lib/fate-ending.js';

const VERSION = '1.5.6-hf1';
const DIRECTOR_V2_VERSION = '2.1';
const DIRECTOR_V3_VERSION = '3.0';
const DIRECTOR_COOLDOWN_TURNS = 3;
const PROACTIVE_GOAL_TICK_MIN_DRIVE = 8;

const IMPORTANT_RE = /(전투|공격|기습|결투|도망|추적|구출|협상|정치|황위|조사|잠입|권능|부상|치료|판정|대련|시험|고백|배신|의식|각성|성유물|마유물|던전|정령왕)/i;
const CRITICAL_ACTION_RE = /(L5|마신|델피렘|Delphirem|대죄주교|사도|심검|8서클|9서클|국가\s*전략|암살|살해|죽음|치명|대규모|전면전|성유물|마유물)/i;
const COMBAT_RE = /(전투|공격|베어|베고|찌르|쏘|회피|막아|막고|패링|결투|대련|검기|오러|마법을?\s*쏘|주먹|발차기|기습|제압|살해|죽이)/i;
const SECRET_RE = /(L4|L5|비밀|기밀|진실|정체|흑막|마신|델피렘|Delphirem|대죄주교|사도|어비스|심연)/i;
const DIRECT_NPC_PRONOUN_RE = /(?:(?:그녀|그이|그|그\s*사람|그\s*학생|상대|저\s*사람|너|당신)(?:에게|한테|께|와|과|랑|이랑|을|를)\s*(?:질문|묻|말|대답|대화|부르|다가가|접근|따라가|쫓|붙잡|바라보|살펴보|도와|건네|보여|확인)|(?:ask|question|tell|talk\s+to|speak\s+to|follow|approach|help)\s+(?:her|him|them)\b)/i;

const PROFILES = Object.freeze({
  continue: {
    name:'continue-11k-v154', targetTokens:11000, softMaxTokens:14000,
    instructionChars:12500, inputChars:7000, worldChars:1800, npcChars:3000, speechChars:1700, pcChars:1800,
    maxNpcs:3, recentTurns:2, memoriesGlobal:4, memoriesPerNpc:3,
  },
  routine: {
    name:'routine-17k-v154', targetTokens:17000, softMaxTokens:20000,
    instructionChars:17500, inputChars:9000, worldChars:2800, npcChars:4300, speechChars:2400, pcChars:2400,
    maxNpcs:4, recentTurns:2, memoriesGlobal:5, memoriesPerNpc:4,
  },
  scheduled: {
    name:'scheduled-18k-v154', targetTokens:18000, softMaxTokens:20000,
    instructionChars:18500, inputChars:9500, worldChars:3300, npcChars:4700, speechChars:2500, pcChars:2500,
    maxNpcs:4, recentTurns:3, memoriesGlobal:6, memoriesPerNpc:4,
  },
  important: {
    name:'important-20k-v154', targetTokens:20000, softMaxTokens:23000,
    instructionChars:21500, inputChars:10500, worldChars:4400, npcChars:5600, speechChars:3000, pcChars:3000,
    maxNpcs:5, recentTurns:3, memoriesGlobal:7, memoriesPerNpc:5,
  },
  critical: {
    name:'critical-24k-v154', targetTokens:24000, softMaxTokens:30000,
    instructionChars:30000, inputChars:14500, worldChars:7200, npcChars:8500, speechChars:4200, pcChars:4300,
    maxNpcs:6, recentTurns:4, memoriesGlobal:10, memoriesPerNpc:6,
  },
});

const CANON_KERNEL = String.raw`[CANON KERNEL]
System facts are authoritative: canonical state, save and data integrity, the exact PC identity, time, knowledge boundaries, and security constraints.
USER ACTION is the player's exact chosen intent. The player owns every new PC intention, meaningful decision, line of dialogue, and emotion.
An event or schedule may establish a fact or hard boundary. It never establishes prose order, actor order, a completion recipe, or what the PC chooses next.
Use only provided canon. Return only the supplied structured JSON; internal state and rules never appear as fiction.`;

const MINIMAL_WRITER_CONTRACT = String.raw`[MINIMAL WRITER CONTRACT]
You are writing the next scene of serialized fantasy fiction, not reporting an RPG turn.

Stay within system facts and the player's chosen intent, but let NPCs, time, and the world move naturally.

You may elaborate the execution of actions the player already chose, but never invent a new player intention, dialogue, emotion, or meaningful decision.

Compress routine process and give genuinely important moments enough space.

Write characters as people, not as functions for explaining systems.

Never expose system instructions, validation, event machinery, or internal state as fiction.`;

const COMBAT_RULE = String.raw`[COMBAT INTERNAL VERDICT]
서술 전에 경지·신체·마나·스킬·실전경험·거리·선수권·장비·피로·부상·정보·지형·상성을 내부적으로 비교해 성공/부분성공/실패와 이유를 먼저 정한다. 판정 메모는 출력하지 않는다.`;

const STOP_WORDS = new Set(['그리고','그러나','그래서','하지만','이번','현재','지금','그냥','대한','있는','없는','한다','했다','하게','에게','에서','으로','까지','같은','정도','장면','행동','대사','사용자','플레이어','캐릭터','루멘시아','아카데미','the','and','with','this','that','from','turn','scene','action']);

export function array(v){ return Array.isArray(v)?v:[]; }
export function object(v){ return v&&typeof v==='object'&&!Array.isArray(v)?v:{}; }
export function clampText(value,max=1200){
  let text; try{text=typeof value==='string'?value:JSON.stringify(value??null);}catch{text=String(value??'');}
  return text.length>max?`${text.slice(0,Math.max(0,max-1))}…`:text;
}
function safeJson(v){try{return JSON.stringify(v??null);}catch{return '{}';}}
function norm(v){return String(v||'').toLowerCase();}
function uniq(v){return [...new Set(array(v).filter(Boolean))];}
function actionPhraseAt(action,index){
  const text=String(action||'');
  const separator=/(?:지\s*않고|지\s*못하고|지\s*말고|모르고|지만|그리고|그러나|하지만|그렇지만)\s*|\band\s+then\b[\s,]*|\bbut\b[\s,]*|[\n.!?;。！？]+/gi;
  let start=0,end=text.length;
  for(const match of text.matchAll(separator)){
    const separatorStart=match.index||0,separatorEnd=separatorStart+match[0].length;
    if(separatorEnd<=index){start=separatorEnd;continue;}
    end=separatorEnd;break;
  }
  return text.slice(start,end).trim();
}
function isNonCommittedPhrase(phrase){
  const text=String(phrase||'').trim();
  if(!text)return true;
  if(/[?？]/.test(text))return true;
  if(/(?:(?:언제|누구|누가|무엇|뭐|어디|왜|어떻게|어느|몇).*(?:야|니|냐|나요|까|지)|(?:알려|설명해|말해|가르쳐)\s*(?:줘|주세요|줄래)|궁금(?:해|하다)|정보(?:를|가)?\s*[.!。！]?$)/.test(text))return true;
  if(/(?:만약|가정(?:하면|해서|하자면)?|상상(?:하면|해서)?|경우(?:에는|엔)?|(?:으|라|다|한다|된다|온다|오|하|되|이|라)면\b|면[,.\s]|면$|고\s*싶|(?:할|될|일)\s*수\s*있|(?:하|되|이)려면|(?:한|할|된|될)\s*때|해도)/.test(text))return true;
  if(/\b(?:if|unless|suppose|assuming|imagine|hypothetically|maybe|would|could|should|can|may|want|wish|what|who|when|where|why|how|explain|information)\b/i.test(text))return true;
  if(/(?:하지|되지|아니|않|못하|못해|못했|못할|말자|말고|말아|말라)|(?:^|\s)안\s/.test(text))return true;
  if(/(?:모(?:르|른|를|릅)|아는\s*(?:것|게|바)?\s*(?:이\s*)?없)/.test(text))return true;
  if(/\b(?:do\s+not|don't|not|never|won't|will\s+not)\b/i.test(text))return true;
  if(/\b(?:have\s+no\s+idea|know\s+nothing|(?:am|are|is)\s+not\s+sure)\b/i.test(text))return true;
  if(/(?:알려|설명해|말해|가르쳐)\s*[.!。！]?$/.test(text))return true;
  if(/(?:는|은|냐|니|나요|인가요|일까요|[가-힣]+까(?:요)?|해도\s*돼|해도\s*될까)\s*[.!。！]?$/.test(text))return true;
  return false;
}
function hasCommittedFindFollowup(action,index){
  const tail=String(action||'').slice(index);
  const followup=tail.match(/(?:지만|그리고|그러나|하지만|그렇지만)\s*([^.!?。！？]+[.!?。！？]?)|\b(?:but|and\s+then)\b[\s,]*([^.!?]+[.!?]?)/i);
  const phrase=(followup?.[1]||followup?.[2]||'').trim();
  return /(?:찾으러|찾는다|찾아가|수색|추적|go\s+(?:and\s+)?find|find\s+them|seek|look\s+for)/i.test(phrase)&&!isNonCommittedPhrase(phrase);
}
function hasAffirmedActionKeyword(action,pattern){
  const matcher=new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:`${pattern.flags}g`);
  for(const match of String(action).matchAll(matcher)){
    if(!isNonCommittedPhrase(actionPhraseAt(action,match.index||0))||(/^(?:L4|L5|델피렘|Delphirem|마신|대죄주교|사도|어비스|심연)$/i.test(match[0])&&hasCommittedFindFollowup(action,match.index||0)))return true;
  }
  return false;
}
function extractKeywords(text='',max=32){
  const tokens=norm(text).match(/[가-힣a-z0-9_]{2,}/g)||[]; const counts=new Map();
  for(const t of tokens){if(STOP_WORDS.has(t)||/^\d+$/.test(t))continue;counts.set(t,(counts.get(t)||0)+1);}
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length).slice(0,max).map(([k])=>k);
}
function sectionBetween(text,marker,nextMarker=null){const src=String(text||'');const s=src.indexOf(marker);if(s<0)return'';const b=s+marker.length;const e=nextMarker?src.indexOf(nextMarker,b):-1;return src.slice(b,e>=0?e:src.length).trim();}
function parseInstructionSections(instructions=''){
  const src=String(instructions||''); const M={style:'===== GM STYLE CANON V4 =====',registry:'===== CHARACTER REGISTRY =====',world:'===== WORLD CANON =====',npc:'===== NPC CANON =====',speech:'===== NPC SPEECH =====',adult:'===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====',pc:'===== PC SYSTEM =====',current:'===== INITIAL CURRENT STATE ====='};
  return {originalChars:src.length,registry:sectionBetween(src,M.registry,M.world),world:sectionBetween(src,M.world,M.npc),npc:sectionBetween(src,M.npc,M.speech),speech:sectionBetween(src,M.speech,M.adult),adult:sectionBetween(src,M.adult,M.pc),pc:sectionBetween(src,M.pc,M.current)};
}
function parseRegistry(text=''){const map={};for(const m of String(text).matchAll(/\b([a-z][a-z0-9_]*)=([^,\n]+)/gi))map[m[1].trim()]=m[2].trim();return map;}
function parseBlocks(section=''){
  const src=String(section||'').replace(/\r/g,''); const out=[]; const re=/={20,}\n([^\n]+)\n={20,}\n([\s\S]*?)(?=\n={20,}\n|$)/g; let m;
  while((m=re.exec(src)))out.push({title:m[1].trim(),body:m[2].trim(),text:`${m[1].trim()}\n${m[2].trim()}`.trim()});
  if(!out.length&&src.trim())out.push({title:'section',body:src.trim(),text:src.trim()}); return out;
}
function titleHasAny(title,names=[]){const t=norm(title);return names.some(n=>{const x=norm(n);return x&&t.includes(x);});}
function textHasAny(text,names=[]){const t=norm(text);return names.some(n=>{const x=norm(n);return x&&t.includes(x);});}
function secretTitle(title=''){return /(L4|L5|5단계\s*비밀|비밀\s*관계|극비|기밀)/i.test(title);}
function scoreGeneric(block,keywords,names){
  const title=norm(block.title),text=norm(block.text); let score=0;
  for(const n of names){const x=norm(n);if(!x)continue;if(title.includes(x))score+=70;else if(text.includes(x))score+=5;}
  for(const kw of keywords){if(title.includes(kw))score+=12;else if(text.includes(kw))score+=1;}
  return score;
}
function chooseBlocks(blocks,{budget,keywords,names,secretAllowed=false,mode='generic',combat=false}={}){
  const rows=[];
  for(let i=0;i<blocks.length;i++){
    const b=blocks[i]; if(!secretAllowed&&secretTitle(b.title))continue;
    const title=norm(b.title); let score=scoreGeneric(b,keywords,names); let allowed=true;
    if(mode==='npc'||mode==='speech'){
      const exact=titleHasAny(b.title,names);
      const relation=/관계망|관계\s*정리|relationship/i.test(b.title)&&names.filter(n=>norm(b.text).includes(norm(n))).length>=2;
      const globalRule=mode==='npc'&&/공통\s*규칙|통합\s*원칙|NPC\s*규칙/i.test(b.title)&&!/(상세\s*설정|초기\s*상세)/i.test(b.title);
      allowed=exact||relation||globalRule;
      if(exact)score+=120; if(relation)score+=22; if(globalRule)score+=12;
    }else if(mode==='world'){
      if(/주요\s*인물|NPC\s*상세|관계망|L5|비밀\s*관계/i.test(b.title))score-=100;
      if(combat&&/힘의\s*기본|재능|BCAS|신체|마나|전투|경지|마법/i.test(b.title))score+=60;
      if(!combat&&/아카데미|공간\s*구조|학사\s*일정|일정|시간|사회/i.test(b.title))score+=45;
    }else if(mode==='pc'){
      if(/PC|스탯|스킬|성장|기억|관계|캐릭터/i.test(b.title))score+=35;
    }
    if(!allowed||score<=0)continue; rows.push({b,i,score});
  }
  rows.sort((a,b)=>b.score-a.score||a.i-b.i); const chosen=[]; let used=0;
  for(const row of rows){const left=budget-used;if(left<=120)break;const clip=clampText(row.b.text,left);chosen.push({...row,text:clip});used+=clip.length+2;if(used>=budget)break;}
  chosen.sort((a,b)=>a.i-b.i); return{text:chosen.map(x=>x.text).join('\n\n'),titles:chosen.map(x=>x.b.title)};
}

function hash32(text=''){
  let h=0x811c9dc5;
  for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,0x01000193);}
  return h>>>0;
}
function rng01(text=''){
  let a=hash32(text)||0x6d2b79f5;
  a|=0;a=(a+0x6D2B79F5)|0;
  let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;
  return ((t^(t>>>14))>>>0)/4294967296;
}
function parseDirectorV2Guidance(originalInput=''){
  const raw=sectionBetween(originalInput,'===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====','===== SCHEDULE ENGINE (AUTHORITATIVE) =====');
  const intervention=(raw.match(/INTERVENTION:\s*([^\n]+)/i)?.[1]||'light').trim().toLowerCase();
  const gap=raw.match(/ROUTINE_STREAK=(\d+)\s*\/\s*EVENT_GAP=(\d+)\s*\/\s*CHOICE_GAP=(\d+)\s*\/\s*CROSS_DEPT_GAP=(\d+)/i);
  const routineStreak=Number(gap?.[1]||0), eventGap=Number(gap?.[2]||0), choiceGap=Number(gap?.[3]||0), crossGap=Number(gap?.[4]||0);
  const payoffDue=/PAYOFF_DUE=YES/i.test(raw), crossDue=/CROSS_DEPT_BRIDGE_DUE=YES/i.test(raw), choiceDue=/CHOICE_PRESSURE_DUE=YES/i.test(raw);
  const focused=(raw.match(/USER_FOCUS:\s*([^\n]+)/i)?.[1]||'').split(',').map(x=>x.trim()).filter(Boolean);
  const callbacks=/OPEN FRICTION\/PAYOFF CALLBACKS:/i.test(raw);
  const candidates=[];
  const re=/^\s*-\s*([a-z][a-z0-9_]*)\(([^)]+)\)\s+score=([-+]?\d+(?:\.\d+)?):\s*(.*)$/gmi;
  let m; while((m=re.exec(raw))) candidates.push({key:m[1],name:m[2],score:Number(m[3])||0,reasons:m[4]||''});
  return{raw,intervention,routineStreak,eventGap,choiceGap,crossGap,payoffDue,crossDue,choiceDue,focused,callbacks,candidates};
}
function mentionedNpcKeys(action='',registry={}){
  const out=[],t=String(action||'');const esc=v=>String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const rows=Object.entries(registry).flatMap(([key,name])=>[{key,name:key},{key,name}]).sort((a,b)=>String(b.name).length-String(a.name).length);
  for(const row of rows){const suffix='(?=$|[\\s.,!?…\'"():;]|은|는|이|가|을|를|와|과|도|에게|께서)';if(new RegExp(`(?<![\\p{L}\\p{N}_])${esc(row.name)}${suffix}`,'iu').test(t)&&!out.includes(row.key))out.push(row.key);}
  return out;
}
function recentSpeakerCountsV2(recentTurns=[]){
  const out={};for(const turn of array(recentTurns).slice(-3))for(const row of array(turn?.scene))if(row?.speaker_key)out[row.speaker_key]=(out[row.speaker_key]||0)+1;return out;
}
function weightedChoice(rows,roll){
  const total=rows.reduce((n,x)=>n+Math.max(0,Number(x.weight)||0),0);if(total<=0)return null;
  let cursor=roll*total;for(const row of rows){cursor-=Math.max(0,Number(row.weight)||0);if(cursor<=0)return row;}return rows[rows.length-1]||null;
}
function eventStyleFor(seed,mode){
  const scheduled=['passing-cameo','brief-reaction','small-observation'];
  const roaming=['brief-encounter','minor-friction','small-practical-problem','public-information-glimpse','observation-only'];
  const pool=mode==='scheduled-side-roll'?scheduled:roaming;
  return pool[Math.min(pool.length-1,Math.floor(rng01(`${seed}|style`)*pool.length))];
}
function boundedNumber(value,min,max,fallback){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function goalSignalFor(save,key){
  const inner=object(save?.npcInnerStates?.[key]);
  const active=object(inner.active_goal);
  if(active.state&&active.state!=='active')return null;
  const fallback=clampText(save?.npcStates?.[key]?.current_goal||inner.short_term_plan||'',180).trim();
  const desire=clampText(active.desire||fallback,180).trim();
  if(!desire)return null;
  const priority=boundedNumber(active.priority,1,5,3);
  const urgency=boundedNumber(active.urgency,1,5,3);
  const progress=boundedNumber(active.progress,0,100,0);
  const targetType=String(active.target_type||'event');
  const targetKey=clampText(active.target_key||'',100).trim()||null;
  const currentLocation=norm(save?.world?.location||'');
  const participants=new Set(array(save?.sceneRuntime?.participants).map(String));
  const due=array(save?.scheduleContext?.due);
  let relevance=1;
  if(targetType==='pc')relevance=1.06;
  else if(targetType==='npc'&&targetKey&&participants.has(targetKey))relevance=1.12;
  else if(targetType==='place'&&targetKey&&currentLocation.includes(norm(targetKey)))relevance=1.16;
  else if(targetType==='event'&&targetKey&&due.some(ev=>norm([ev?.id,ev?.title].filter(Boolean).join(' ')).includes(norm(targetKey))))relevance=1.15;
  else if(targetType==='class'&&targetKey&&norm(save?.pc?.department||'').includes(norm(targetKey)))relevance=1.08;
  const drive=1.08+(priority-3)*0.08+(urgency-3)*0.06;
  const multiplier=Math.max(.84,Math.min(1.48,drive*relevance));
  return{id:clampText(active.id||'',80)||null,desire,priority,urgency,progress,state:'active',target_type:targetType,target_key:targetKey,next_action:clampText(array(active.next_actions)[0]||'',120),obstacle:clampText(active.obstacle||'',120),updated_turn:Number(active.updated_turn||0),multiplier:Number(multiplier.toFixed(3)),source:active.desire?'runtime-active-goal':'npc-state-current_goal'};
}
function compactNpcRelationships(value={},relevantKeys=[],registry={},sourceKey=''){
  const relevant=new Set(array(relevantKeys).map(String));
  return Object.fromEntries(Object.entries(object(value))
    .filter(([target])=>target!==sourceKey&&relevant.has(target)&&Object.prototype.hasOwnProperty.call(registry,target)&&/^[a-z0-9_-]{1,64}$/i.test(target)&&!['__proto__','prototype','constructor'].includes(target))
    .sort((a,b)=>Number(relevant.has(b[0]))-Number(relevant.has(a[0]))||Number(b[1]?.updated_turn||0)-Number(a[1]?.updated_turn||0)||(Math.abs(Number(b[1]?.affinity||0))+Math.abs(Number(b[1]?.trust||0)))-(Math.abs(Number(a[1]?.affinity||0))+Math.abs(Number(a[1]?.trust||0)))||a[0].localeCompare(b[0]))
    .slice(0,6)
    .map(([target,row])=>[target,{affinity:boundedNumber(row?.affinity,-100,100,0),trust:boundedNumber(row?.trust,-100,100,0),status:clampText(row?.status||'중립',80),reason:clampText(row?.reason||'',180),updated_turn:Number(row?.updated_turn||0),history:array(row?.history).slice(-2).map(item=>typeof item==='string'?clampText(item,180):{turn:Number(item?.turn||0),affinity_delta:boundedNumber(item?.affinity_delta,-10,10,0),trust_delta:boundedNumber(item?.trust_delta,-10,10,0),status:clampText(item?.status||'',60)||null,reason:clampText(item?.reason||'',180),source_event:clampText(item?.source_event||'',100)||null})}]));
}
function compactInnerNpc(row={},relevantKeys=[],registry={},sourceKey=''){
  const src=object(row),goal=object(src.active_goal),reason=object(src.relationship_reason);
  const out={
    mood:clampText(src.mood||'',80),social_stance:clampText(src.social_stance||'',80),opinion_of_pc:clampText(src.opinion_of_pc||'',180),
    short_term_plan:clampText(src.short_term_plan||'',180),concern:clampText(src.concern||'',180),wants_from_pc:clampText(src.wants_from_pc||'',180),unresolved_issue:clampText(src.unresolved_issue||'',180),
  };
  if(goal.desire)out.active_goal={id:clampText(goal.id||'',80),target_type:goal.target_type||'event',target_key:goal.target_key||null,desire:clampText(goal.desire,180),priority:boundedNumber(goal.priority,1,5,3),urgency:boundedNumber(goal.urgency,1,5,3),progress:boundedNumber(goal.progress,0,100,0),state:goal.state||'active',reasons:array(goal.reasons).slice(-4).map(x=>clampText(x,120)),next_actions:array(goal.next_actions).slice(-4).map(x=>clampText(x,120)),obstacle:clampText(goal.obstacle||'',140)};
  if(reason.cause||reason.followup)out.relationship_reason={turn:Number(reason.turn||0),dimensions:object(reason.dimensions),status:reason.status||null,cause:clampText(reason.cause||'',150),expression:clampText(reason.expression||'',150),followup:clampText(reason.followup||'',150),source_event:clampText(reason.source_event||'',120)};
  const npcRelationships=compactNpcRelationships(src.npc_relationships,relevantKeys,registry,sourceKey);if(Object.keys(npcRelationships).length)out.npc_relationships=npcRelationships;
  return out;
}
function presentGoalTargetIsFeasible(goal,save,present){
  if(goal.target_type==='pc')return true;
  if(goal.target_type==='npc')return Boolean(goal.target_key&&present.has(String(goal.target_key)));
  if(goal.target_type==='place')return Boolean(goal.target_key&&norm(save?.world?.location||'').includes(norm(goal.target_key)));
  if(goal.target_type==='event')return Boolean(goal.target_key&&array(save?.scheduleContext?.due).some(ev=>norm([ev?.id,ev?.title].filter(Boolean).join(' ')).includes(norm(goal.target_key))));
  return false;
}
function buildEventDirectorV2(incoming,originalInput,registry,mode='game'){
  const save=incoming.saveState||{}, plan=parseDirectorV2Guidance(originalInput), turn=Number(save.turnNumber||0), momentum=object(save?.sceneRuntime?.momentum), stallStreak=Math.max(0,Number(momentum.stall_streak||0)), momentumPressure=stallStreak>=2,sceneIntent=classifySceneIntent(incoming.action||'',{location:save?.world?.location||'',currentTime:save?.world?.time||'',currentDate:save?.world?.date||'',currentWeekday:save?.world?.weekday||'',actorName:save?.pc?.name||'',resumeTimedAction:save?.sceneRuntime?.timed_action});
  const seedRaw=String(save?.director?.rngSeed||save?.directorSeed||save?.id||`${save?.pc?.name||'pc'}|${save?.pc?.origin||''}|legacy`);
  const seedBase=`${seedRaw}|T${turn}|${save?.world?.date||''}|${save?.world?.time||''}|${save?.world?.location||''}`;
  const seedTag=hash32(seedRaw).toString(16).padStart(8,'0').slice(0,8);
  const base={version:DIRECTOR_V2_VERSION,event_director_v3_version:DIRECTOR_V3_VERSION,world_result_surfacing_version:WORLD_RESULT_SURFACING_VERSION,goal_tick_version:NPC_GOAL_TICK_VERSION,seed_tag:seedTag,cooldown_turns:DIRECTOR_COOLDOWN_TURNS,intervention:plan.intervention,routine_streak:plan.routineStreak,event_gap:plan.eventGap,momentum_stall_streak:stallStreak,momentum_pressure:momentumPressure?'required':stallStreak===1?'watch':'normal',selected_key:null,selected_name:null,event_style:'none',eligible_keys:[],roll:null,none_weight:null,result:'NO_ROLL',mode:'fixed-flow',goal_signals:{},selected_goal:null};
  const fixedDirective=(reason)=>({telemetry:{...base,result:reason},selectedKey:null,directive:`[EVENT DIRECTOR V2.1]\nMODE=FIXED_FLOW\n${reason}. 기존 일정·사용자 직접 행동·진행 중인 훅을 우선하고, 이 지시 때문에 새 우연 사건을 추가하지 마라.`});
  if(['meta','continue'].includes(mode))return fixedDirective(`RNG_DISABLED_${mode.toUpperCase()}`);
  const explicit=mentionedNpcKeys(incoming.action||'',registry);
  const directUserFocus=Boolean(explicit.length||plan.focused.length||DIRECT_NPC_PRONOUN_RE.test(String(incoming.action||'')));
  if(!directUserFocus&&(plan.payoffDue||plan.callbacks))return fixedDirective('CALLBACK_PRIORITY');
  if(!directUserFocus&&plan.intervention==='aftermath')return fixedDirective('AFTERMATH_FIXED_FLOW');
  if(!directUserFocus&&(plan.intervention==='combat'||plan.intervention==='critical'||hasAffirmedActionKeyword(incoming.action||'',COMBAT_RE)))return fixedDirective('ACTIVE_COMBAT_FIXED_FLOW');

  const boundaryLookahead=Math.max(0,Number(sceneIntent.boundaryLookaheadMinutes||0));
  const consequenceLookahead=(sceneIntent.compression&&activityRangeLimitMinutes(sceneIntent)>0)||boundaryLookahead>0?activityRangeLimitMinutes(sceneIntent):0;
  const dueConsequence=plan.intervention==='scheduled'||['decision-sensitive','committed-consequence'].includes(sceneIntent.kind)?null:selectDueEventConsequence(save,{lookaheadMinutes:consequenceLookahead});
  const consequenceMinutes=dueConsequence?minutesUntilEventConsequence(save,dueConsequence.id):null;
  const scheduleBoundary=nextScheduleBoundaryMinutes(save,{futureOnly:false,action:incoming?.action||'',intent:sceneIntent,registry});
  const futureScheduleBoundary=nextScheduleBoundaryMinutes(save,{futureOnly:true,action:incoming?.action||'',intent:sceneIntent,registry});
  const goalTickScheduleLimit=(sceneIntent.compression&&sceneIntent.minAdvanceMinutes>0)||boundaryLookahead>0?scheduleBoundaryLimitMinutes(sceneIntent):0;
  const goalTickHitsSchedule=scheduleBoundary!=null&&scheduleBoundary>=0&&goalTickScheduleLimit>0&&scheduleBoundary<=goalTickScheduleLimit;
  const scheduleFirst=futureScheduleBoundary!=null&&consequenceMinutes!=null&&futureScheduleBoundary<=consequenceMinutes;
  if(dueConsequence&&!scheduleFirst){
    const consequenceNpcText=[dueConsequence.event_name,Number(dueConsequence.secret_level||0)<=2?dueConsequence.reason:''].filter(Boolean).join(' ');
    const consequenceKeys=mentionedNpcKeys(consequenceNpcText,registry).slice(0,2);
    const selectedKey=consequenceKeys[0]||null;
    const telemetry={...base,result:'EVENT_CONSEQUENCE_DUE',mode:'fixed-flow',selected_key:selectedKey,selected_name:selectedKey?registry[selectedKey]||null:null,event_consequence_id:dueConsequence.id,event_consequence_due_at:dueConsequence.due_at,event_consequence_trigger_minutes:consequenceMinutes,event_consequence_npc_keys:consequenceKeys};
    const consequenceDirective=buildEventConsequenceDirective(dueConsequence,{currentAction:incoming.action||'',triggerMinutes:consequenceMinutes});
    return{telemetry,selectedKey,consequenceKeys,directive:`[EVENT DIRECTOR V2.1]\nMODE=FIXED_FLOW\nRESULT=EVENT_CONSEQUENCE_DUE\nCONSEQUENCE_ID=${dueConsequence.id}\n이전 인과 결과를 우선하며 새 랜덤 사건을 추가하지 마라.`,consequenceDirective};
  }
  if(directUserFocus)return fixedDirective('DIRECT_USER_FOCUS');
  if(mode==='auto')return fixedDirective('RNG_DISABLED_AUTO');

  const scheduled=plan.intervention==='scheduled';
  const medium=plan.intervention==='medium'&&(plan.routineStreak>=2||plan.eventGap>=3||plan.crossDue);
  const momentumDue=momentumPressure;
  const exposure=object(save?.director?.npcExposure),recent=recentSpeakerCountsV2(incoming.recentTurns),present=new Set(array(save?.sceneRuntime?.participants).map(String));
  const dueFixed=new Set(array(save?.scheduleContext?.due).flatMap(ev=>array(ev?.participants)).map(String));
  const presentGoalRows=[...present].map(key=>({key,goal:goalSignalFor(save,key)})).filter(({goal})=>goal&&presentGoalTargetIsFeasible(goal,save,present)).sort((a,b)=>b.goal.priority-a.goal.priority||b.goal.urgency-a.goal.urgency||b.goal.multiplier-a.goal.multiplier||a.key.localeCompare(b.key));
  const availableGoalRows=presentGoalRows.filter(({key,goal})=>!isGoalTickCoolingDown({saveState:save,key,goal,turnNumber:turn+1}));
  const passiveInitiativeIntent=['downtime','wait'].includes(sceneIntent.kind);
  const proactiveInitiativeIntent=['generic','observe','explore','downtime','wait'].includes(sceneIntent.kind);
  const hook=normalizeTurnHook(save?.sceneRuntime?.turn_hook),exit=normalizeSceneExitCondition(save?.sceneRuntime?.exit_condition),progress=object(save?.sceneRuntime?.eventProgress);
  const playerOwnedStop=hook?.status==='awaiting-player'||exit?.status==='awaiting-player'||Boolean(String(save?.sceneRuntime?.unresolved_question||'').trim());
  const activeEventFlow=Boolean((progress.activeBeat||progress.active_beat)&&!progress.paused);
  const goalFlowBlocked=playerOwnedStop||activeEventFlow||goalTickHitsSchedule;
  const buildPresentGoalResult=(result,key,goal,modeName)=>{
    const name=registry[key]||key,nextLine=goal.next_action?`\nNEXT_ACTION=${clampText(goal.next_action,120)}`:'';
    const telemetry={...base,result,mode:modeName,selected_key:key,selected_name:name,goal_signals:{[key]:goal},selected_goal:goal};
    const actionOrder=result==='PRESENT_NPC_GOAL_TICK'?'USER ACTION을 의미 목표까지 먼저 완료한 뒤, 같은 턴의 세계 반응으로 이 NPC가 행동하게 하라.':'현재 장면의 NPC initiative가 우선이다.';
    const order=result==='PRESENT_NPC_GOAL_TICK'?'USER_ACTION_FIRST':'NPC_INITIATIVE_FIRST';
    const directive=`[EVENT DIRECTOR V2.1]\nRESULT=${result}\nORDER=${order}\nGUARDS=NO_PC_CONTROL|FEASIBLE_ONLY|GOAL_PROGRESS_EVIDENCE_ONLY|IMPOSSIBLE_TO_HOOK\nMODE=${modeName}\nGOAL_TICK_VERSION=${NPC_GOAL_TICK_VERSION}\nPRESENT_NPC=${key}(${clampText(name,60)})\nACTIVE_GOAL=${clampText(goal.desire,120)}\nGOAL_TARGET=${goal.target_type}:${clampText(goal.target_key||'-',60)} / P${goal.priority} U${goal.urgency}${nextLine}\n- 새 카메오를 추가하지 마라. ${actionOrder}\n- PC의 행동·대사·감정·중요 선택을 대신 결정하지 마라.\n- 위치·일정·지식·성격·관계상 가능할 때만 목표에 맞는 짧고 구체적인 말/행동을 스스로 하게 하라.\n- 선택만으로 목표 진척을 만들지 말고, 실제 결과가 보일 때만 근거와 함께 Goal V2 필드를 기록하라.\n- 불가능하면 강행하지 말고 자연스러운 반응 hook만 남겨라.`;
    return{telemetry,selectedKey:key,directive};
  };
  if(momentumDue&&!scheduled&&!goalFlowBlocked&&passiveInitiativeIntent&&availableGoalRows.length){
    const {key,goal}=availableGoalRows[0];
    return buildPresentGoalResult('PRESENT_NPC_GOAL_PRIORITY',key,goal,'fixed-flow');
  }
  const proactiveGoalRow=availableGoalRows.find(({goal})=>goal.priority+goal.urgency>=PROACTIVE_GOAL_TICK_MIN_DRIVE);
  if(!scheduled&&!goalFlowBlocked&&proactiveInitiativeIntent&&proactiveGoalRow){
    return buildPresentGoalResult('PRESENT_NPC_GOAL_TICK',proactiveGoalRow.key,proactiveGoalRow.goal,'goal-tick');
  }
  const worldResultIntent=['generic','observe','explore','downtime','wait','travel','exit-exterior'].includes(sceneIntent.kind);
  const activeWorldFlow=Boolean((progress.eventInstanceId||progress.event_instance_id)&&!progress.paused);
  const worldResultBlocked=playerOwnedStop||activeWorldFlow||goalTickHitsSchedule||scheduleBoundary===0;
  if(!scheduled&&!worldResultBlocked&&worldResultIntent){
    const worldResultSelection=selectWorldResultForSurfacing({saveState:save,knownNpcKeys:Object.keys(registry),enabled:incoming.backgroundSim!==false});
    if(worldResultSelection.selected){
      const worldResult=worldResultSelection.selected,worldResultKeys=array(worldResult.npc_keys).filter(key=>registry[key]).slice(0,2),selectedKey=worldResultKeys[0]||null;
      const telemetry={...base,result:'WORLD_RESULT_SURFACE',mode:'world-result',event_style:'public-result',selected_key:selectedKey,selected_name:selectedKey?registry[selectedKey]||null:null,world_result_id:worldResult.world_result_id,world_result_fingerprint:worldResult.fingerprint,world_result_source_at:worldResult.source_at,world_result_title:worldResult.title,world_result_fact:worldResult.fact,world_result_npc_keys:worldResultKeys,world_result_npc_names:worldResultKeys.map(key=>registry[key]).filter(Boolean),world_result_attempt:worldResult.attempt,world_result_reason:worldResultSelection.reason};
      return{telemetry,selectedKey,worldResultKeys,directive:buildWorldResultSurfacingDirective(worldResult,registry)};
    }
  }
  if(!scheduled&&!medium&&!momentumDue)return fixedDirective('NO_RANDOM_EVENT_DUE');
  let pool=plan.candidates.filter(c=>registry[c.key]);
  // Surprise/cameo cooldown and physical eligibility remain authoritative. Goals can weight only an already-eligible candidate.
  pool=pool.filter(c=>{
    if(dueFixed.has(c.key))return false;
    const last=Number(exposure?.[c.key]?.lastSeenTurn);
    const gap=Number.isFinite(last)?turn-last:99;
    if(gap<=DIRECTOR_COOLDOWN_TURNS)return false;
    if(present.has(c.key))return false;
    return true;
  });
  if(!pool.length)return fixedDirective('NO_ELIGIBLE_AFTER_COOLDOWN');
  const minScore=Math.min(...pool.map(x=>x.score));
  const rows=pool.slice(0,6).map(c=>{
    const last=Number(exposure?.[c.key]?.lastSeenTurn),gap=Number.isFinite(last)?Math.max(0,turn-last):10;
    const recentN=Number(recent[c.key]||0);
    const scoreWeight=Math.pow(Math.max(3,c.score-minScore+5),0.82);
    const freshness=1+Math.min(1.2,gap/10);
    const penalty=1/(1+recentN*1.4);
    const goalSignal=goalSignalFor(save,c.key);
    const goalMultiplier=goalSignal?.multiplier||1;
    return{...c,goal_signal:goalSignal,goal_multiplier:goalMultiplier,weight:scoreWeight*freshness*penalty*goalMultiplier};
  });
  const goalSignals=Object.fromEntries(rows.filter(x=>x.goal_signal).map(x=>[x.key,x.goal_signal]));
  // "Nothing happens" stays in the weighted pool: goals must not make the world spam encounters.
  const noneWeight=scheduled?Math.max(24,rows.reduce((n,x)=>n+x.weight,0)*1.15):Math.max(6,22-plan.eventGap*2-plan.routineStreak*2);
  const weighted=[{key:null,name:null,weight:noneWeight},...rows];
  const roll=rng01(`${seedBase}|pick`),picked=weightedChoice(weighted,roll);
  const eventMode=scheduled?'scheduled-side-roll':momentumDue?'momentum-recovery':'weighted-random';
  const weights=Object.fromEntries(rows.map(x=>[x.key,Number(x.weight.toFixed(2))]));
  if(!picked?.key){
    const telemetry={...base,mode:eventMode,result:'NO_EVENT',eligible_keys:rows.map(x=>x.key),roll:Number(roll.toFixed(4)),none_weight:Number(noneWeight.toFixed(2)),weights,goal_signals:goalSignals};
    return{telemetry,selectedKey:null,directive:`[EVENT DIRECTOR V2.1 — SEEDED WEIGHTED VARIATION]\nMODE=${eventMode}\nRESULT=NO_EVENT\n이번 턴에는 새 우연 조우/마찰/카메오를 추가하지 마라. 고정 일정과 현재 장면만 자연스럽게 진행한다.`};
  }
  const style=eventStyleFor(seedBase,eventMode);
  const occurrenceId=`director:${save?.world?.date||'undated'}:t${turn}:${picked.key}`.toLowerCase();
  const telemetry={...base,mode:eventMode,result:'NPC_EVENT',occurrence_id:occurrenceId,selected_key:picked.key,selected_name:registry[picked.key]||picked.name,event_style:style,eligible_keys:rows.map(x=>x.key),roll:Number(roll.toFixed(4)),none_weight:Number(noneWeight.toFixed(2)),weights,goal_signals:goalSignals,selected_goal:picked.goal_signal||null};
  const goalLine=picked.goal_signal?`\nACTIVE_GOAL=${clampText(picked.goal_signal.desire,160)}\nGOAL_TARGET=${picked.goal_signal.target_type}:${picked.goal_signal.target_key||'-'} / P${picked.goal_signal.priority} U${picked.goal_signal.urgency}`:'';
  const directive=`[EVENT DIRECTOR V2.1 — SEEDED WEIGHTED VARIATION]\nMODE=${eventMode}\nRESULT=NPC_EVENT\nEVENT_INSTANCE_ID=${occurrenceId}\nSELECTED=${picked.key}(${registry[picked.key]||picked.name})\nSTYLE=${style}${goalLine}\n- 고정 일정, 사용자의 직접 행동, 기존 훅이 항상 우선한다.\n- 물리적 위치/일정상 자연스러울 때만 선택 NPC를 작은 접점에 사용한다. 불가능하면 순간이동시키지 말고 NO_EVENT처럼 처리한다.\n- ACTIVE_GOAL이 있으면 왜 이 NPC가 지금 그런 선택을 하는지에 반영하되, 목표가 위치·일정·지식·관계 제약을 무시하는 면허가 아니다.\n- 이 랜덤 슬롯은 작은 조우·마찰·관찰·공개 정보·사소한 실무 문제 수준이다. 새 대형 사건, 새 비밀, 새 능력, 중상, 강제 관계변화는 만들지 않는다.\n- 선택 NPC가 등장해도 PC에게 자동 관심/호감을 주지 않는다.`;
  return{telemetry,selectedKey:picked.key,directive};
}

function addExplicitKeys(set,text,registry,limit){for(const key of mentionedNpcKeys(text,registry)){if(set.size>=limit)break;set.add(key);}}
function deriveKeys(incoming,registry,maxNpcs,directorV2=null){
  const save=incoming.saveState||{}, set=new Set();
  const authoritative=array(save?.sceneRuntime?.participants).map(String), present=new Set(authoritative);
  const last=array(incoming.recentTurns).slice(-1)[0], latestSpeaker=[...array(last?.scene)].reverse().find(item=>item?.speaker_key)?.speaker_key;
  if(latestSpeaker&&present.has(String(latestSpeaker))&&registry[latestSpeaker])set.add(String(latestSpeaker));
  if(directorV2?.selectedKey&&registry[directorV2.selectedKey]&&set.size<maxNpcs)set.add(String(directorV2.selectedKey));
  for(const key of array(directorV2?.worldResultKeys)){if(set.size>=maxNpcs)break;if(registry[key])set.add(String(key));}
  for(const key of array(directorV2?.consequenceKeys)){if(set.size>=maxNpcs)break;if(registry[key])set.add(String(key));}
  addExplicitKeys(set,incoming.action||'',registry,maxNpcs);
  for(const k of array(save?.scheduleContext?.due).flatMap(ev=>array(ev?.participants)))if(set.size<maxNpcs&&registry[k])set.add(String(k));
  for(const k of authoritative)if(set.size<maxNpcs&&registry[k])set.add(String(k));
  if(!Object.hasOwn(object(save?.sceneRuntime),'participants'))for(const item of array(last?.scene).slice(-4)){if(set.size>=maxNpcs)break;if(item?.speaker_key&&registry[item.speaker_key])set.add(String(item.speaker_key));}
  for(const row of array(save?.director?.recentSpotlights).slice(-1)){for(const k of array(row?.keys).slice(0,2)){if(set.size>=maxNpcs)break;if(registry[k])set.add(String(k));}}
  for(const ev of array(save?.scheduleContext?.due).slice(0,2)){
    const parts=array(ev?.participants).filter(k=>registry[k]);
    if(parts.length<=4){for(const k of parts){if(set.size>=maxNpcs)break;set.add(String(k));}}
    else if(set.size===0){for(const k of parts.slice(0,2))set.add(String(k));}
  }
  return [...set].slice(0,maxNpcs);
}
function memoryText(row){return typeof row==='string'?row:[row?.fact,row?.subject,row?.source,row?.type,row?.status].filter(Boolean).join(' ');}
function selectMemories(rows,keywords,names,limit){
  return array(rows).map((row,i)=>{const text=norm(memoryText(row));let score=Number(row?.importance||1)*5+i/Math.max(1,array(rows).length);for(const kw of keywords)if(text.includes(kw))score+=3;for(const n of names)if(text.includes(norm(n)))score+=7;return{row,score,i};}).sort((a,b)=>b.score-a.score||b.i-a.i).slice(0,limit).sort((a,b)=>a.i-b.i).map(x=>x.row);
}
function secretAccess(incoming,keywords){
  const action=String(incoming.action||''); if(!hasAffirmedActionKeyword(action,SECRET_RE))return false;
  const save=incoming.saveState||{}; const evidence=[...array(save.pcKnowledge),...array(save.hooks),...array(save?.memories?.global)].map(x=>norm(memoryText(x))).join('\n');
  if(!evidence.trim())return /L4|L5|델피렘|Delphirem|마신|대죄주교|사도|어비스|심연/i.test(action);
  return keywords.some(k=>k.length>=2&&evidence.includes(k))||/L4|L5/i.test(action);
}
function compactSkills(value={}){return Object.fromEntries(Object.entries(object(value)).map(([key,row])=>[clampText(key,80),{grade:clampText(row?.grade||row||'',24),hiddenXp:boundedNumber(row?.hiddenXp,0,99,0)}]).filter(([key])=>key&&!['__proto__','prototype','constructor'].includes(key)).slice(0,24));}
function compactSkillCandidates(value={},historyLimit=2){const limit=Math.max(0,Math.min(2,Math.trunc(Number(historyLimit)||0)));return Object.fromEntries(Object.entries(object(value)).filter(([key])=>/^[^{}<>\r\n]{2,48}$/.test(key)&&!['__proto__','prototype','constructor'].includes(key)).sort((a,b)=>Number(b[1]?.updated_turn||b[1]?.updatedTurn||0)-Number(a[1]?.updated_turn||a[1]?.updatedTurn||0)||a[0].localeCompare(b[0])).slice(0,8).map(([key,row])=>{const compact={progress:boundedNumber(row?.progress,0,99,0),basis:clampText(row?.basis||'',120)||null,updated_turn:boundedNumber(row?.updated_turn||row?.updatedTurn,0,1e9,0)};if(limit>0)compact.history=array(row?.history).slice(-limit).map(item=>({turn:boundedNumber(item?.turn,0,1e9,0),amount:boundedNumber(item?.amount,1,15,1),basis:clampText(item?.basis||'',120),reason:clampText(item?.reason||'',180)}));return[key,compact];}));}
function compactMandatorySkillCandidates(value={}){return Object.fromEntries(Object.entries(compactSkillCandidates(value,0)).map(([key,row])=>[key,{progress:row.progress}]));}
function compactTalents(value={}){const source=object(value);return Object.fromEntries(['magic','martial','soul','knowledge'].filter((key)=>Object.prototype.hasOwnProperty.call(source,key)).map((key)=>[key,boundedNumber(source[key],1,10,5)]));}
function abilityEntries(value={}){if(Array.isArray(value))return value.map((row)=>[clampText(typeof row==='string'?row:row?.name||'',64),typeof row==='string'?{description:row}:object(row)]);return Object.entries(object(value));}
function compactAbilityMap(value={},detail=true,text=''){const action=norm(text);return Object.fromEntries(abilityEntries(value).filter(([key])=>/^[^{}<>\r\n]{2,64}$/.test(key)&&!['__proto__','prototype','constructor'].includes(key)).map(([key,row],index)=>({key,row,index,direct:action.includes(norm(key))?1:0})).sort((a,b)=>b.direct-a.direct||a.index-b.index).slice(0,8).map(({key,row})=>{if(!detail)return[key,true];const description=clampText(row?.description||'',180),limitation=clampText(row?.limitation||'',180);return[key,{...(description?{description}:{}),...(limitation?{limitation}: {})}];}));}
function compactAwakeningCandidates(value={},historyLimit=2){const limit=Math.max(0,Math.min(2,Math.trunc(Number(historyLimit)||0))),source=object(value),result={trait:{},authority:{}};for(const kind of ['trait','authority'])result[kind]=Object.fromEntries(Object.entries(object(source[kind])).filter(([key])=>/^[^{}<>\r\n]{2,64}$/.test(key)&&!['__proto__','prototype','constructor'].includes(key)).sort((a,b)=>Number(b[1]?.updated_turn||b[1]?.updatedTurn||0)-Number(a[1]?.updated_turn||a[1]?.updatedTurn||0)||a[0].localeCompare(b[0])).slice(0,4).map(([key,row])=>{const compact={progress:boundedNumber(row?.progress,0,100,0),milestones:boundedNumber(row?.milestones,0,20,0),description:clampText(row?.description||'',220),limitation:clampText(row?.limitation||'',220),updated_turn:boundedNumber(row?.updated_turn||row?.updatedTurn,0,1e9,0)};if(limit>0)compact.history=array(row?.history).slice(-limit).map(item=>({turn:boundedNumber(item?.turn,0,1e9,0),amount:boundedNumber(item?.amount,1,10,1),milestone:item?.milestone===true,reason:clampText(item?.reason||'',180)}));return[key,compact];}));return result;}
function compactMandatoryAwakeningCandidates(value={}){const compact=compactAwakeningCandidates(value,0);return Object.fromEntries(['trait','authority'].map((kind)=>[kind,Object.fromEntries(Object.entries(compact[kind]).map(([key,row])=>[key,{progress:row.progress,milestones:row.milestones}]))]));}
function compactTalentEvolutionHistory(value=[]){return array(value).slice(-6).map((row)=>({talent:['magic','martial','soul','knowledge'].includes(row?.talent)?row.talent:null,before:boundedNumber(row?.before,1,10,1),after:boundedNumber(row?.after,1,10,2),cause:clampText(row?.cause||'',180),reason:clampText(row?.reason||'',180),turn:boundedNumber(row?.turn,0,1e9,0)})).filter((row)=>row.talent&&row.after===row.before+1&&row.cause&&row.reason);}
function selectRelevantGrowthEntries(value={},text='',max=1){const action=norm(text);return Object.fromEntries(Object.entries(object(value)).map(([key,row],index)=>({key,row,index,direct:action.includes(norm(key))?1:0})).sort((a,b)=>b.direct-a.direct||a.index-b.index).slice(0,Math.max(0,max)).map(({key,row})=>[key,row]));}
function pressureBoundEssentialPc(value={},action=''){const pc=object(value);if(safeJson(pc).length<=3600)return pc;const awakening=object(pc.awakeningCandidates);return{...pc,skills:selectRelevantGrowthEntries(pc.skills,action,14),skillCandidates:selectRelevantGrowthEntries(pc.skillCandidates,action,5),...(pc.traits?{traits:selectRelevantGrowthEntries(pc.traits,action,2)}:{}),...(pc.authorities?{authorities:selectRelevantGrowthEntries(pc.authorities,action,2)}:{}),...(pc.awakeningCandidates?{awakeningCandidates:{trait:selectRelevantGrowthEntries(awakening.trait,action,1),authority:selectRelevantGrowthEntries(awakening.authority,action,1)}}:{}),growth_context_truncated:true};}
function compactPc(pc={},important=false,text=''){const out={...object(pc)};if('characterSetting'in out)out.characterSetting=clampText(out.characterSetting||'',important?1700:1100);if('appearance'in out)out.appearance=clampText(out.appearance||'',350);if(Array.isArray(out.inventory))out.inventory=out.inventory.slice(0,18);if('talents'in out)out.talents=compactTalents(out.talents);out.skills=compactSkills(out.skills);out.skillCandidates=compactSkillCandidates(out.skillCandidates,2);if('traits'in out)out.traits=compactAbilityMap(out.traits,true,text);if('authorities'in out)out.authorities=compactAbilityMap(out.authorities,true,text);if('awakeningCandidates'in out)out.awakeningCandidates=compactAwakeningCandidates(out.awakeningCandidates,2);if('talentEvolutionHistory'in out)out.talentEvolutionHistory=compactTalentEvolutionHistory(out.talentEvolutionHistory);return out;}
function compactSchedule(save,keys){
  const sc=object(save?.scheduleContext), selected=new Set(keys); const clean=(ev)=>({...ev,participants:array(ev?.participants).filter(k=>selected.has(k)).slice(0,4)});
  const npc={};for(const k of keys)if(sc?.npc_schedule?.[k])npc[k]=sc.npc_schedule[k];
  return{due:array(sc.due).slice(0,4).map(clean),upcoming:array(sc.upcoming).slice(0,5).map(clean),npc_schedule:npc};
}
function compactScheduleAuthority(schedule,max=2400){
  const compactEvent=(ev)=>{const src=object(ev);return{id:clampText(src.id||'',80),title:clampText(src.title||'',120),note:clampText(src.note||'',180),date:src.date||null,time:src.time||null,location:clampText(src.location||'',100),importance:src.importance??null,status:src.status||null,participants:array(src.participants).slice(0,4)};};
  const compactNpc=(row)=>{const src=object(row);return{location:clampText(src.location||src.area||'',100),activity:clampText(src.activity||src.title||'',120),commitment:clampText(src.commitment||'',120),confidence:src.confidence??null,time:src.time||null,next_change_minutes:src.next_change_minutes??null};};
  const value={due:array(schedule?.due).slice(0,4).map(compactEvent),upcoming:array(schedule?.upcoming).slice(0,5).map(compactEvent),npc_schedule:Object.fromEntries(Object.entries(object(schedule?.npc_schedule)).slice(0,6).map(([key,row])=>[key,compactNpc(row)]))};
  let text=safeJson(value);if(text.length<=max)return text;
  const smaller={truncated:true,due:value.due.slice(0,3),upcoming:value.upcoming.slice(0,3),npc_schedule:Object.fromEntries(Object.entries(value.npc_schedule).slice(0,3))};
  text=safeJson(smaller);if(text.length<=max)return text;
  const focused={truncated:true,due:smaller.due.slice(0,2).map(({id,title,note,time,location,participants})=>({id,title,note:clampText(note,100),time,location,participants})),upcoming:smaller.upcoming.slice(0,1).map(({id,title,note,time,location,participants})=>({id,title,note:clampText(note,100),time,location,participants})),npc_schedule:Object.fromEntries(Object.entries(smaller.npc_schedule).slice(0,2).map(([key,row])=>[key,{location:row.location,activity:clampText(row.activity,80),commitment:clampText(row.commitment,80),confidence:row.confidence,time:row.time}]))};
  text=safeJson(focused);if(text.length<=max)return text;
  const minimal={truncated:true,due:focused.due.map(({id,title,time,location})=>({id:clampText(id,50),title:clampText(title,70),time,location:clampText(location,60)})),upcoming:focused.upcoming.map(({id,title,time})=>({id:clampText(id,50),title:clampText(title,60),time})),npc_schedule:Object.fromEntries(Object.entries(focused.npc_schedule).slice(0,1).map(([key,row])=>[key,{location:clampText(row.location,50),activity:clampText(row.activity,60),time:row.time}]))};
  text=safeJson(minimal);if(text.length<=max)return text;
  const tiny={truncated:true,due:minimal.due.slice(0,1).map(({id,title,time})=>({id,title:clampText(title,50),time})),upcoming:[]};
  text=safeJson(tiny);if(text.length<=max)return text;
  return safeJson({truncated:true});
}
function formatAuthorityTail(director,directorV2,scheduleText){return`===== GM EVENT DIRECTOR (ROUTED) =====\n${director||'없음'}\n\n===== EVENT DIRECTOR V2.1 (ROUTED) =====\n${directorV2||'없음'}\n\n===== SCHEDULE ENGINE (ROUTED) =====\n${scheduleText||'없음'}`;}
function fitAuthorityTail({director='',directorV2='',schedule={},maxChars=2400,routine=false}={}){
  const fullSchedule=compactScheduleAuthority(schedule,routine?1300:Math.min(2400,Math.max(1600,Math.floor(maxChars*.55)))),full=formatAuthorityTail(director,directorV2,fullSchedule);
  if(full.length<=maxChars)return full;
  const emptyMarkerChars='없음'.length*3,baseChars=formatAuthorityTail('','','').length-emptyMarkerChars,payload=Math.max(0,maxChars-baseChars);
  const directorBudget=Math.max(0,Math.floor(payload*.15)),directorV2Budget=Math.max(0,Math.floor(payload*.25)),scheduleBudget=Math.max(0,payload-directorBudget-directorV2Budget);
  return formatAuthorityTail(clampText(director,directorBudget),clampText(directorV2,directorV2Budget),compactScheduleAuthority(schedule,scheduleBudget));
}
function compactSceneRuntime(sceneRuntime={},keywords=[],text='',registeredNpcKeys=null,maxFactions=3,historyLimit=2,recentTexts=[]){
  const runtime={...object(sceneRuntime)},factionSocial=compactFactionSocialForContext(runtime.faction_social,{text,recentTexts,keywords,maxFactions,historyLimit,registeredNpcKeys});
  if(Object.keys(factionSocial.reputations).length)runtime.faction_social=factionSocial;
  else delete runtime.faction_social;
  return runtime;
}
function compactSave(incoming,keys,registry,profile,keywords,text='',recentTexts=[]){
  const save=incoming.saveState||{},names=keys.map(k=>registry[k]).filter(Boolean),rel={},intimacy={},npcStates={},emotions={},inner={},npcMem={};
  for(const k of keys){if(save?.relationships?.[k]!=null)rel[k]=save.relationships[k];if(save?.intimacyStates?.[k]!=null)intimacy[k]=save.intimacyStates[k];if(save?.npcStates?.[k]!=null)npcStates[k]=save.npcStates[k];if(save?.emotionStates?.[k]!=null)emotions[k]=save.emotionStates[k];if(save?.npcInnerStates?.[k]!=null)inner[k]=compactInnerNpc(save.npcInnerStates[k],keys,registry,k);if(save?.memories?.npc?.[k])npcMem[k]=selectMemories(save.memories.npc[k],keywords,names,profile.memoriesPerNpc);}
  const globalMem=selectMemories(save?.memories?.global,keywords,names,profile.memoriesGlobal);
  const knowledge=selectMemories(array(save?.pcKnowledge).map(x=>typeof x==='string'?{fact:x,importance:2}:x),keywords,names,Math.max(6,profile.memoriesGlobal)).map(x=>x?.fact||x);
  const relevantEvents=array(save?.activeEvents).filter(ev=>{const t=norm(ev);return keywords.some(k=>k.length>=2&&t.includes(k));}).slice(0,6);
  const fateBackground=compactFateBackgroundForModel(save?.creation,save?.pc),personalStory=compactFatePersonalStoryForModel(save?.creation,{existingHooks:save?.hooks}),pc=compactPc(save?.pc||{},profile.name.includes('important')||profile.name.includes('critical'),text);
  if(fateBackground){delete pc.characterSetting;delete pc.admission;const publicRegion=fateBackground.detail.public_facts.find(row=>row.id==='home_region')?.fact;if(publicRegion)pc.origin=publicRegion;}
  return{version:save?.version,turnNumber:Number(save?.turnNumber||0),world:save?.world||{},pc,...(fateBackground?{characterBackground:fateBackground.detail}:{}),...(personalStory?{characterPersonalStory:personalStory.detail}:{}),relationships:rel,intimacyStates:intimacy,npcStates,emotionStates:emotions,npcInnerStates:inner,relevantNpcKeys:keys,activeEvents:relevantEvents,completedEvents:array(save?.completedEvents).slice(-8),pcKnowledge:knowledge,memories:{global:globalMem,npc:npcMem},hooks:array(save?.hooks).filter(x=>!['resolved','expired'].includes(x?.status)&&!x?.event_consequence).slice(-6),scheduledEvents:array(save?.scheduledEvents).filter(x=>!['completed','cancelled'].includes(x?.status)).slice(0,6),director:{lastEventTurn:Number(save?.director?.lastEventTurn||0),lastChoicePressureTurn:Number(save?.director?.lastChoicePressureTurn||0),lastCrossDepartmentTurn:Number(save?.director?.lastCrossDepartmentTurn||0),recentBeats:array(save?.director?.recentBeats).slice(-3),callbacks:array(save?.director?.callbacks).filter(x=>x?.status!=='resolved').slice(-4)},flags:save?.flags||{},sceneRuntime:compactSceneRuntime(save?.sceneRuntime,keywords,text,Object.keys(registry),3,2,recentTexts),backgroundDigest:clampText(save?.backgroundDigest||'',450)};
}
function compactRecent(recentTurns,count,pressure=false){return array(recentTurns).slice(-count).map(t=>({action:clampText(t?.action||'',pressure?120:260),summary:clampText(t?.summary||'',pressure?180:420),scene:array(t?.scene).slice(pressure?-1:-4).map(i=>({kind:i?.kind,speaker_key:i?.speaker_key||null,text:clampText(i?.text||'',pressure?180:320)}))}));}
function classifyProfile(incoming={},mode='game'){
  if(mode==='continue')return PROFILES.continue;
  const save=incoming.saveState||{},action=String(incoming.action||'');
  if(save?.flags?.majorScene||hasAffirmedActionKeyword(action,CRITICAL_ACTION_RE))return PROFILES.critical;
  const dueMajor=array(save?.scheduleContext?.due).some(ev=>Number(ev?.importance||0)>=4);
  if(dueMajor)return PROFILES.scheduled;
  if(incoming.proReasoning||hasAffirmedActionKeyword(action,IMPORTANT_RE))return PROFILES.important;
  return PROFILES.routine;
}
function adjustedProfile(base,incoming={}){
  const fb=object(incoming.saveState?.routerFeedback);if(fb.routerVersion!==VERSION||fb.profile!==base.name)return{...base,scale:1};const last=Number(fb.lastInputTokens||0);if(!last||last<=base.softMaxTokens)return{...base,scale:1};const scale=Math.max(.76,Math.min(1,(base.targetTokens*.94)/last));return{...base,scale,instructionChars:Math.floor(base.instructionChars*scale),inputChars:Math.floor(base.inputChars*scale),worldChars:Math.floor(base.worldChars*scale),npcChars:Math.floor(base.npcChars*scale),speechChars:Math.floor(base.speechChars*scale),pcChars:Math.floor(base.pcChars*scale)};
}
function contextSeed(incoming){const save=incoming.saveState||{},last=array(incoming.recentTurns).slice(-1)[0];return[incoming.action,save?.world?.location,save?.pc?.department,clampText(incoming.rollingSummary||'',700),last?.summary,array(last?.scene).map(x=>`${x?.speaker_key||''} ${x?.text||''}`).join(' ')].filter(Boolean).join('\n');}
function locationMatches(left='',right=''){
  const a=norm(left).replace(/\s+/g,''),b=norm(right).replace(/\s+/g,'');
  if(!a||!b)return false;
  return a===b||(Math.min(a.length,b.length)>=4&&(a.includes(b)||b.includes(a)));
}
function scheduleMinutesFromNow(save,event){
  const date=String(event?.date||save?.world?.date||''),time=String(event?.time||''),nowDate=String(save?.world?.date||''),nowTime=String(save?.world?.time||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)||!/^\d{4}-\d{2}-\d{2}$/.test(nowDate)||!/^\d{2}:\d{2}$/.test(nowTime))return null;
  const stamp=(d,t)=>{const [y,m,day]=d.split('-').map(Number),[h,min]=t.split(':').map(Number);return Date.UTC(y,m-1,day,h,min);};
  return Math.trunc((stamp(date,time)-stamp(nowDate,nowTime))/60000);
}
function deriveSceneCharacters(incoming,registry,maxNpcs=3,mode='game'){
  const save=object(incoming.saveState),runtime=object(save.sceneRuntime),rows=new Map(),currentLocation=save?.world?.location||'',present=array(runtime.participants).map(String).filter(key=>registry[key]);
  const add=(key,reason)=>{const value=String(key||'');if(!registry[value]||rows.has(value)||rows.size>=maxNpcs)return;rows.set(value,{key:value,reason});};
  for(const key of mentionedNpcKeys(incoming.action||'',registry))add(key,'explicit user focus');
  for(const key of present)add(key,'present in the current scene');
  for(const [key,state] of Object.entries(object(save.npcStates)))if(locationMatches(state?.location,currentLocation))add(key,'canonical current location');
  for(const event of array(save?.scheduleContext?.due)){
    if(!locationMatches(event?.location,currentLocation))continue;
    for(const key of array(event?.participants))add(key,'current canonical event');
  }
  for(const event of array(save?.scheduleContext?.upcoming)){
    const minutes=scheduleMinutesFromNow(save,event);
    if(minutes==null||minutes<0||minutes>30||!locationMatches(event?.location,currentLocation))continue;
    for(const key of array(event?.participants))add(key,'imminent canonical event');
  }
  for(const hook of array(save.hooks)){
    if(['resolved','expired','declined'].includes(String(hook?.status||'')))continue;
    const key=String(hook?.source_npc_key||''),state=object(save?.npcStates?.[key]);
    if(locationMatches(hook?.location,currentLocation)||locationMatches(state.location,currentLocation))add(key,'current causal thread');
  }
  const dueConsequence=selectDueEventConsequence(save,{lookaheadMinutes:0});
  if(dueConsequence){
    const publicCause=[dueConsequence.event_name,Number(dueConsequence.secret_level||0)<=2?dueConsequence.reason:''].filter(Boolean).join(' ');
    for(const key of mentionedNpcKeys(publicCause,registry))add(key,'current canonical consequence');
  }
  const worldResult=selectWorldResultForSurfacing({saveState:save,knownNpcKeys:Object.keys(registry),enabled:mode!=='continue'&&incoming.backgroundSim!==false}).selected;
  for(const key of array(worldResult?.npc_keys))add(key,'recent public world fact');
  return[...rows.values()];
}
function canonicalBlockFor(blocks,name){return blocks.find(block=>!secretTitle(block.title)&&titleHasAny(block.title,[name]))||null;}
function bulletLines(text=''){return String(text).split('\n').map(line=>line.trim()).filter(line=>line.startsWith('- '));}
function lineWithPrefix(lines,prefixes){return lines.find(line=>prefixes.some(prefix=>line.startsWith(`- ${prefix}`)))||'';}
function compactCharacterCanon(block){
  const lines=bulletLines(block?.body),core=[lineWithPrefix(lines,['성격:']),lineWithPrefix(lines,['신념:','신조:'])].filter(Boolean).join(' '),goal=lineWithPrefix(lines,['목표:']);
  const identity=lines.filter(line=>!['- 성격:','- 신념:','- 신조:','- 목표:'].some(prefix=>line.startsWith(prefix))).slice(0,4).join(' ');
  return{identity:clampText(identity,480),core:clampText(core,320),goal:clampText(goal.replace(/^- 목표:\s*/,''),220)};
}
function compactCharacterVoice(block){
  const lines=bulletLines(block?.body).filter(line=>!line.startsWith('- 대표:')&&!line.startsWith('- 금지:')).slice(0,2);
  return clampText(lines.join(' '),420);
}
function relationshipPacket(row){
  const source=object(row);if(!Object.keys(source).length)return null;
  return{affinity:Number(source.affinity||0),trust:Number(source.trust||0),status:clampText(source.status||'중립',80),recent_history:array(source.history).slice(-2).map(value=>clampText(value,160))};
}
function buildCharacterPackets(incoming,characterRows,registry,npcBlocks,speechBlocks,keywords,profile){
  const save=object(incoming.saveState),names=characterRows.map(row=>registry[row.key]).filter(Boolean),selectedKeys=characterRows.map(row=>row.key);
  return characterRows.map(({key,reason})=>{
    const dynamic=object(save?.npcStates?.[key]),inner=object(save?.npcInnerStates?.[key]),activeGoal=object(inner.active_goal),runtimeGoal=(!activeGoal.state||activeGoal.state==='active')?activeGoal.desire:'',canon=compactCharacterCanon(canonicalBlockFor(npcBlocks,registry[key])),voice=compactCharacterVoice(canonicalBlockFor(speechBlocks,registry[key])),memories=selectMemories(save?.memories?.npc?.[key],keywords,names,Math.min(2,profile.memoriesPerNpc)),npcRelationships=compactNpcRelationships(inner.npc_relationships,selectedKeys,registry,key);
    return{key,name:registry[key],reason_relevant:reason,identity:canon.identity,voice,core_personality_value:canon.core,current_goal:clampText(runtimeGoal||(!activeGoal.state?dynamic.current_goal:'')||canon.goal||'',220)||null,relationship_to_pc:relationshipPacket(save?.relationships?.[key]),...(Object.keys(npcRelationships).length?{relationships_to_present_characters:npcRelationships}:{}),immediately_relevant_memory:memories,current_state:{location:clampText(dynamic.location||'',120)||null,status:clampText(dynamic.status||dynamic.state||'',160)||null}};
  });
}
function publicBackgroundFacts(creation,pc){
  const model=compactFateBackgroundForModel(creation,pc);if(!model)return null;
  return array(model?.detail?.public_facts).map(row=>({label:clampText(row?.label||'',60),fact:clampText(row?.fact||'',220)})).filter(row=>row.fact).slice(0,6);
}
function compactPcFacts(pc={},action='',pressure=false){
  const source=object(pc),skills=Object.fromEntries(Object.entries(selectRelevantGrowthEntries(compactSkills(source.skills),action,pressure?2:14)).map(([key,row])=>[key,{grade:row.grade}])),traits=compactAbilityMap(source.traits,!pressure,action),authorities=compactAbilityMap(source.authorities,!pressure,action);
  const skillCandidates=compactMandatorySkillCandidates(source.skillCandidates),awakeningCandidates=compactMandatoryAwakeningCandidates(source.awakeningCandidates),facts={name:clampText(source.name||'',80),age:Number(source.age||0)||null,gender:clampText(source.gender||'',40)||null,department:clampText(source.department||'',100)||null,origin:clampText(source.origin||'',120)||null,social_status:clampText(source.socialStatus||'',100)||null,realm:clampText(source.realm||'',100)||null,status:clampText(source.status||'',160)||null,talents:compactTalents(source.talents),skills,skill_candidates:Object.fromEntries(Object.entries(skillCandidates).slice(0,pressure?1:8)),traits:Object.fromEntries(Object.entries(traits).slice(0,pressure?2:8)),authorities:Object.fromEntries(Object.entries(authorities).slice(0,pressure?2:8)),awakening_candidates:{trait:Object.fromEntries(Object.entries(awakeningCandidates.trait).slice(0,pressure?1:4)),authority:Object.fromEntries(Object.entries(awakeningCandidates.authority).slice(0,pressure?1:4))}};
  if(!pressure){facts.character_setting=clampText(source.characterSetting||'',600)||null;facts.stats=object(source.stats);facts.inventory=array(source.inventory).slice(0,8);}
  return facts;
}
function compactClockFacts(saveState={}){
  const save=object(saveState),rows=[],seen=new Set();
  for(const [state,source] of [['current',array(save?.scheduleContext?.due)],['future',array(save?.scheduleContext?.upcoming)]])for(const event of source){
    if(rows.length>=2)break;
    const id=String(event?.id||`${event?.date||''}:${event?.time||''}:${event?.title||''}`);if(seen.has(id))continue;
    const locationRelevant=locationMatches(event?.location,save?.world?.location),pcRelevant=isPcRelevantScheduleEvent(save,event);
    if(!locationRelevant&&!pcRelevant)continue;
    seen.add(id);rows.push({date:event?.date||save?.world?.date||null,time:event?.time||null,title:clampText(event?.title||'',120),location:clampText(event?.location||'',120)||null,state,minutes_from_now:scheduleMinutesFromNow(save,event)});
  }
  return rows;
}
function relevantThreadFacts(saveState={},keywords=[],characterRows=[]){
  const save=object(saveState),keys=new Set(characterRows.map(row=>row.key)),rows=[],relevant=(text='')=>{const value=norm(text);return keywords.some(key=>key.length>=2&&value.includes(key));};
  for(const hook of array(save.hooks)){
    if(rows.length>=3||['resolved','expired','declined'].includes(String(hook?.status||'')))continue;
    const fact=clampText(hook?.title||hook?.note||'',220),sourceKey=String(hook?.source_npc_key||'');
    if(!fact||(!keys.has(sourceKey)&&!locationMatches(hook?.location,save?.world?.location)&&!relevant(fact)))continue;
    rows.push({kind:'thread',id:clampText(hook?.id||'',100)||null,fact,status:clampText(hook?.status||'open',40),source_npc_key:keys.has(sourceKey)?sourceKey:null});
  }
  const due=selectDueEventConsequence(save,{lookaheadMinutes:0});
  if(due)rows.unshift({kind:'due-consequence',id:clampText(due.id||'',100),fact:clampText(due.event_name||'',220),...(Number(due.secret_level||0)<=2&&due.reason?{reason:clampText(due.reason,240)}:{})});
  return rows.slice(0,3);
}
function relevantWorldResultFact(saveState={},registry={},enabled=true){
  if(!enabled)return null;
  const selected=selectWorldResultForSurfacing({saveState:saveState,knownNpcKeys:Object.keys(registry),enabled:true}).selected;
  return selected?{kind:'public-world-result',id:clampText(selected.world_result_id||'',120),source_at:selected.source_at||null,fact:clampText(selected.fact||'',260),npc_keys:array(selected.npc_keys).slice(0,2)}:null;
}
function relevantFactionFacts(saveState={},action='',recent=[],pressure=false,registeredNpcKeys=[]){
  const source=object(saveState?.sceneRuntime?.faction_social),contexts=[action,...array(recent).flatMap(turn=>[turn?.action,turn?.summary])].map(value=>norm(value)),relevantKeys=new Set();
  for(const [key,row] of Object.entries(FACTION_REGISTRY))if([key,row.name,...array(row.aliases)].some(alias=>contexts.some(text=>text.includes(norm(alias)))))relevantKeys.add(key);
  if(!relevantKeys.size)return null;
  const compact=compactFactionSocialForContext(source,{text:action,recentTexts:contexts.slice(1),keywords:[],maxFactions:pressure?1:2,historyLimit:pressure?1:2,registeredNpcKeys});
  compact.reputations=Object.fromEntries(Object.entries(object(compact.reputations)).filter(([key])=>relevantKeys.has(key)));
  return Object.keys(compact.reputations).length?compact:null;
}
function buildInstructions(original,incoming,profile,_originalInput='',mode='game'){
  const sec=parseInstructionSections(original),registry=parseRegistry(sec.registry),seed=contextSeed(incoming),keywords=extractKeywords(seed,36),characterRows=deriveSceneCharacters(incoming,registry,3,mode),keys=characterRows.map(row=>row.key),names=keys.map(key=>registry[key]).filter(Boolean),secretAllowed=secretAccess(incoming,keywords),combat=hasAffirmedActionKeyword(incoming.action||'',COMBAT_RE),world=chooseBlocks(parseBlocks(sec.world),{budget:Math.min(profile.worldChars,combat?3600:2600),keywords,names,secretAllowed,mode:'world',combat}),npcBlocks=parseBlocks(sec.npc),speechBlocks=parseBlocks(sec.speech),adult=incoming.adultMode&&Number(incoming.saveState?.pc?.age||0)>=18?clampText(sec.adult,900):'',ending=profile.name.includes('critical')||incoming.saveState?.flags?.majorScene?FATE_ENDING_CONTRACT:'';
  const registryText=keys.map(key=>`${key}=${registry[key]}`).join(', ')||'none';
  let text=[CANON_KERNEL,MINIMAL_WRITER_CONTRACT,ending,combat?COMBAT_RULE:'',`===== RELEVANT NAMED CHARACTER KEYS =====\n${registryText}`,world.text?`===== IMMEDIATELY RELEVANT CANON FACTS =====\n${world.text}`:'',adult?`===== RELEVANT ADULT CANON =====\n${adult}`:''].filter(Boolean).join('\n\n');
  text=clampText(text,profile.instructionChars);
  return{text,registry,keys,names,keywords,characterRows,npcBlocks,speechBlocks,moduleTitles:{world:world.titles,npc:keys.map(key=>registry[key]),speech:keys.map(key=>registry[key]),pc:[],adult:Boolean(adult)},originalChars:sec.originalChars,secretAllowed};
}
function cleanDirector(originalInput,limit){
  let d=sectionBetween(originalInput,'===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====','===== SCHEDULE ENGINE (AUTHORITATIVE) =====');
  d=d.split('\n').filter(line=>!/candidate|후보|planCandidates|candidates=/i.test(line)).join('\n');return clampText(d,limit);
}
function clampMiddleText(value,max=5200){
  const text=String(value??''),limit=Math.max(0,Math.floor(Number(max)||0));
  if(text.length<=limit)return text;if(limit===0)return'';if(limit<=5)return text.slice(-limit);
  const marker=' … ',tail=Math.max(1,Math.min(900,Math.floor((limit-marker.length)*.36))),head=Math.max(1,limit-marker.length-tail);
  return`${text.slice(0,head)}${marker}${text.slice(-tail)}`;
}
export function composeRoutedInput({saveState='',optionalContext='',reservedContext='',authorityTail='',actionBlock='',inputChars=9000}={}){
  const save=String(saveState||''),headSource=String(optionalContext||''),reserved=String(reservedContext||''),tail=String(authorityTail||''),action=String(actionBlock||''),maxChars=Math.max(0,Number(inputChars)||0);
  const fixed=[save,reserved,tail,action].filter(Boolean).join('\n\n');
  const headBudget=Math.max(0,maxChars-fixed.length-(headSource?2:0));
  const head=headBudget>0?clampText(headSource,headBudget):'';
  return [save,head,reserved,tail,action].filter(Boolean).join('\n\n');
}
function buildInput(incoming,originalInput,profile,routed,mode='game'){
  const action=String(incoming.action||''),save=object(incoming.saveState),pressure=action.length>3600||Number(profile.scale||1)<1,recent=compactRecent(incoming.recentTurns,pressure?1:profile.recentTurns,pressure),characterPackets=buildCharacterPackets(incoming,routed.characterRows,routed.registry,routed.npcBlocks,routed.speechBlocks,routed.keywords,profile),clockFacts=compactClockFacts(save),worldResultFact=relevantWorldResultFact(save,routed.registry,mode!=='continue'&&incoming.backgroundSim!==false),threadFacts=[...relevantThreadFacts(save,routed.keywords,routed.characterRows),...(worldResultFact?[worldResultFact]:[])].slice(0,3),factionFacts=relevantFactionFacts(save,action,recent,pressure,Object.keys(routed.registry)),dueConsequence=selectDueEventConsequence(save,{lookaheadMinutes:0}),hardEventFacts=dueConsequence?{event_consequence_id:String(dueConsequence.id||''),event_consequence_npc_keys:mentionedNpcKeys([dueConsequence.event_name,Number(dueConsequence.secret_level||0)<=2?dueConsequence.reason:''].filter(Boolean).join(' '),routed.registry).slice(0,2)}:null,names=routed.names,globalMemory=selectMemories(save?.memories?.global,routed.keywords,names,pressure?1:4),pcKnowledge=selectMemories(array(save?.pcKnowledge).map(value=>typeof value==='string'?{fact:value,importance:2}:value),routed.keywords,names,pressure?1:4).map(value=>value?.fact||value),background=publicBackgroundFacts(save.creation,save.pc),pcFacts=compactPcFacts(save.pc,action,pressure),lastTurn=recent.at(-1),activeThreads=buildActiveThreadsDirective({action,saveState:save,mode,limit:6,maxChars:1150}),npcSignificance=deriveNpcSignificanceBoundary({candidateKeys:routed.keys,registry:routed.registry,mode,orchestration:null}),npcCharacterBehavior=compactNpcCharacterBehavior({saveState:save,candidateKeys:routed.keys,registry:routed.registry,mode,significanceBoundary:npcSignificance,maxNpcs:3,memoryLimit:2}),personalStory=compactFatePersonalStoryForModel(save.creation,{existingHooks:save.hooks});
  if(background)delete pcFacts.character_setting;
  const hardPacket={version:'thin-scene-packet-r2',pc_identity:{canonical_key:'pc',canonical_name:pcFacts.name},current_scene:{date:save?.world?.date||null,weekday:save?.world?.weekday||null,time:save?.world?.time||null,location:clampText(save?.world?.location||'',140),immediate_physical_situation:{recent_summary:clampText(lastTurn?.summary||incoming.rollingSummary||'',pressure?180:420),visible_beats:array(lastTurn?.scene).slice(pressure?-1:-4)}},hard_facts:{pc:pcFacts,...(background?{public_background:background}:{}),...(factionFacts?{faction_social:factionFacts}:{})},future_time_facts:clockFacts};
  const optionalPacket={relevant_characters:characterPackets,relevant_memory_consequence_thread:{global_memory:globalMemory,pc_knowledge:pcKnowledge,threads:threadFacts},recent_meaningful_beats:recent,available_cg_ids:array(incoming.availableCgIds).slice(0,40),mode};
  const hardBlock=`===== THIN SCENE PACKET — CURRENT FACTS =====\n${safeJson(hardPacket)}`,optionalContext=`===== THIN SCENE PACKET — RELEVANT CONTEXT =====\n${safeJson(optionalPacket)}`,actionBlock=`===== USER ACTION — EXACT ORIGINAL TEXT =====\n${action}`;
  return{text:composeRoutedInput({saveState:hardBlock,optionalContext,actionBlock,inputChars:profile.inputChars}),orchestration:null,activeThreads,npcSignificance,npcCharacterBehavior,personalStory,hardEventFacts,packet:{hard:hardPacket,optional:optionalPacket}};
}

export function routeOpenAIParams(params,{incoming={},mode='game'}={}){
  if(mode==='meta')return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'meta-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'META keeps full canon',original_chars:String(params?.instructions||'').length+String(params?.input||'').length,routed_chars:String(params?.instructions||'').length+String(params?.input||'').length}};
  const base=classifyProfile(incoming,mode),profile=adjustedProfile(base,incoming),originalInstructions=String(params?.instructions||''),originalInput=String(params?.input||'');
  const required=['===== CHARACTER REGISTRY =====','===== WORLD CANON =====','===== NPC CANON =====','===== NPC SPEECH =====','===== PC SYSTEM ====='];
  if(!required.every(m=>originalInstructions.includes(m)))return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'core prompt markers changed',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length}};
  const routed=buildInstructions(originalInstructions,incoming,profile,originalInput,mode);if(!Object.keys(routed.registry||{}).length)return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'registry parse failed',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length}};
  const built=buildInput(incoming,originalInput,profile,routed,mode),newParams={...params,instructions:routed.text,input:built.text,prompt_cache_key:process.env.OPENAI_PROMPT_CACHE_KEY||'lumensia-p3-pr01r2-thin-scene-packet',prompt_cache_retention:'24h'},originalChars=originalInstructions.length+originalInput.length,routedChars=routed.text.length+built.text.length;
  return{params:newParams,telemetry:{routerVersion:VERSION,enabled:true,profile:profile.name,packet_version:'thin-scene-packet-r2',target_input_tokens:profile.targetTokens,soft_max_tokens:profile.softMaxTokens,adaptive_scale:Number((profile.scale||1).toFixed(3)),instructions_chars:routed.text.length,input_chars:built.text.length,routed_chars:routedChars,original_chars:originalChars,char_reduction_ratio:originalChars>0?Number((1-routedChars/originalChars).toFixed(4)):0,selected_npcs:routed.keys,selected_npc_names:routed.names,character_packet_count:routed.keys.length,canon_modules:routed.moduleTitles,recent_turns:profile.recentTurns,secret_allowed:routed.secretAllowed,event_director_v2:null,event_director_v3:null,hard_event_facts:built.hardEventFacts,scene_orchestration:null,writer_authority_removed:['event-director','schedule-procedure','event-checkpoint','participant-queue','next-action','scene-orchestration','scene-momentum','scene-purpose','scene-exit','turn-hook','active-thread-directive','generic-role-actor'],suggested_actions:false,npc_significance_v1:built.npcSignificance,npc_character_behavior_v1:{version:built.npcCharacterBehavior.version,mode:built.npcCharacterBehavior.mode,npc_keys:built.npcCharacterBehavior.npc_keys,profile_count:built.npcCharacterBehavior.profiles.length,evidence_count:built.npcCharacterBehavior.evidence_count,source:built.npcCharacterBehavior.source},active_threads_v1:{version:built.activeThreads.version,mode:built.activeThreads.mode,count:built.activeThreads.threads.length,visible_count:built.activeThreads.visible_threads,top_id:built.activeThreads.threads[0]?.id||null,sources:[...new Set(built.activeThreads.threads.map((thread)=>thread.source))]},...(built.personalStory?{personal_story_v1:{version:built.personalStory.version,candidate_count:built.personalStory.candidateCount}}:{})}};
}
export function routerVersion(){return VERSION;}
