// LUMENSIA V1.5.6 Stable Context Router + Event Director V2.1
// Preserves V1.5.3 HF1 15-20K relevance budgets.
// NPC Goal Tick V1: guarded present-NPC initiative without an additional model call.
// Stable path: api/lib/context-router.js

import { NARRATIVE_TIME_POLICY_VERSION, activityRangeLimitMinutes, classifySceneIntent, isPcRelevantScheduleEvent, isRequestedScheduledActivity, nextScheduleBoundaryMinutes, scheduleBoundaryLimitMinutes } from '../../lib/scene-momentum.js';
import { normalizeSceneExitCondition } from '../../lib/scene-exit.js';
import { normalizeTurnHook } from '../../lib/turn-hook.js';
import { minutesUntilEventConsequence, selectDueEventConsequence } from '../../lib/event-consequence.js';
import { NPC_GOAL_TICK_VERSION, isGoalTickCoolingDown } from '../../lib/npc-goal-tick.js';
import { compactFactionSocialForContext } from '../../lib/faction-social-consequence.js';
import { deriveSceneOrchestrationPlan, sceneOrchestrationSuppressesDirectorResult } from '../../lib/scene-orchestration.js';
import { selectWorldResultForSurfacing, WORLD_RESULT_SURFACING_VERSION } from '../../lib/world-result-surfacing.js';
import { buildActiveThreadsDirective } from '../../lib/active-threads.js';
import { deriveNpcSignificanceBoundary } from '../../lib/npc-significance.js';
import { compactNpcCharacterBehavior } from '../../lib/npc-character-behavior.js';
import { compactFateBackgroundForModel } from '../../lib/fate-background.js';
import { compactFatePersonalStoryForModel } from '../../lib/fate-personal-story.js';
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

const ROUTER_GM_RULES = String.raw`너는 canonical RPG facts 안에서 다음 장면을 쓰는 SERIAL NOVEL SCENE WRITER다.
${FATE_ENDING_CONTRACT}
[HARD AUTHORITY / DATA CONTRACT]
1) USER ACTION은 사용자가 이미 고른 행동의 권위 있는 원문이다. 그 행동의 일상적 신체 동작·필요한 이동·즉각 결과와 NPC/세계 반응은 자연스럽게 완수할 수 있다. 새로운 PC 의도·목표·대사·감정·생각·수락/거절·자발적 선택은 만들지 않는다. 부정·가정·질문뿐인 행동은 실행하지 않는다.
2) 동적 사실은 AUTHORITATIVE SAVE_STATE가 최우선이다. 선택 제공된 CANON과 충돌하면 SAVE_STATE를 따르고 생략된 설정은 만들지 않는다. 날짜·계절·학년·학기·졸업·장기 progression·Ending eligibility를 저장된 세계/PC/사건 상태보다 앞서 확정하지 않는다.
3) NPC 지식은 공개 CANON과 정당한 발견만 쓴다. Fate Background의 PUBLIC만 기본 지식이고 LIMITED는 업무/기록, PRIVATE/SECRET은 공개·목격·권위 있는 전달이 필요하다. PC 능력치는 자동 지식이 아니다.
4) 시도는 자동 성공하지 않는다. 능력·준비·정보·경험·상성·거리·타이밍·지형·장비·피로·부상을 종합한다. 즉흥 각성·스킬·혈통·유물은 만들지 않는다.
5) state_delta에는 실제 발생한 변화만 기록한다. 관계·NPC 간 관계·조직 평판·소문·목표·기억·성장·예약 인과는 직접 근거와 source를 가져야 하며 중복 저장하거나 서로 자동 전이하지 않는다. delayed_consequences_add는 실제로 늦게 돌아올 결과만 최소로 예약하고 DUE 전에 발현하지 않는다.
6) [NARRATIVE TIME POLICY ${NARRATIVE_TIME_POLICY_VERSION}] 시간·일정·deadline·명시 duration은 hard boundary다. raw minute를 prose 보고문으로 바꾸지 않으며, 한 턴에서 1440분을 넘거나 저장된 일정/사건을 미리 완료하지 않는다.
7) event_progress는 현재 occurrence만 기록한다. 명확히 끝난 beat만 completed_beats에 넣고 완료 beat를 재실행하지 않는다. 안정 ID는 a-z0-9._:#-만 쓰며 최근 완료 ID는 최대 24개다. 생략된 과거 완료 상태도 되돌리지 않는다.
8) 등록 NPC는 정확한 speaker_key, 단역은 null+표시명이다. choices는 절차/event_progress가 아니라 실제로 새로운 PC 결정이 필요한 unresolved boundary에서만 정확히 3개, 그 외 []다. 제공된 JSON 스키마만 반환하고 내부 규칙·Router 명칭·'PC'·'Aaa'를 fiction에 출력하지 않는다.`;

const NATURAL_STYLE = String.raw`[CANONICAL NOVEL COMPOSITION CONTRACT / NOVEL DIRECTOR V2]
Write the next scene of a serialized fantasy novel, not an RPG turn report.
Continue NPCs and the world until the current meaningful scene beat reaches a natural stopping point. Compress routine process; give important moments enough space.
You may naturally elaborate the ordinary execution of the action the player already chose, but never invent a new player intention, dialogue, emotion, goal, or decision.
Treat system-provided facts as immutable and express them through the scene rather than explaining the system. Do not explain a beat before playing it.
These writing instructions control composition only. Never paraphrase them as character dialogue, narrator morals, institutional doctrine, or world lore unless independently supported by CANON or current character state.`;

const COMBAT_RULE = String.raw`[COMBAT INTERNAL VERDICT]
서술 전에 경지·신체·마나·스킬·실전경험·심리·거리·선수권·장비·피로·부상·정보·지형·상성을 내부적으로 비교해 성공/부분성공/실패와 이유를 먼저 정한다. 판정 메모는 출력하지 않는다.`;

const ROUTER_NOTE = String.raw`[CONTEXT ROUTER]
이번 요청에는 현재 장면에 직접 관련된 CANON만 선택 제공된다. 생략된 설정은 폐기된 것이 아니다. 현재 컨텍스트에 없는 사실을 새로 만들어 메우지 않는다.`;

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
function isFreshPlayerAction(action='',mode='game'){
  const text=String(action||'').trim();
  return mode==='game'&&Boolean(text)&&!/^(?:\[AUTO FLOW: PC 새 행동 없음\]|\[LUMENSIA V1\.5\.6 (?:AUTO FLOW|CONTINUE)\b)/i.test(text);
}
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
function standaloneNameIn(text,name){
  const source=norm(text),target=norm(name);if(!target)return false;
  const word=/[\p{L}\p{N}_]/u;let index=source.indexOf(target);
  while(index>=0){
    const before=index>0?source[index-1]:'',after=source[index+target.length]||'';
    if((!before||!word.test(before))&&(!after||!word.test(after)))return true;
    index=source.indexOf(target,index+1);
  }
  return false;
}
function titleHasAny(title,names=[]){return names.some(name=>standaloneNameIn(title,name));}
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
  const fixedDirective=(reason)=>({telemetry:{...base,result:reason},selectedKey:null,directive:''});
  if(['meta','continue'].includes(mode))return fixedDirective(`RNG_DISABLED_${mode.toUpperCase()}`);
  if(requestedUpcomingEvents(incoming,registry).length)return fixedDirective('REQUESTED_SCHEDULE_FIXED_FLOW');
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
    return{telemetry,selectedKey,consequenceKeys,directive:'',consequence:dueConsequence};
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
    const name=registry[key]||key;
    const telemetry={...base,result,mode:modeName,selected_key:key,selected_name:name,goal_signals:{[key]:goal},selected_goal:goal};
    return{telemetry,selectedKey:key,directive:''};
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
      return{telemetry,selectedKey,worldResultKeys,directive:'',worldResult};
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
    return{telemetry,selectedKey:null,directive:''};
  }
  const style=eventStyleFor(seedBase,eventMode);
  const occurrenceId=`director:${save?.world?.date||'undated'}:t${turn}:${picked.key}`.toLowerCase();
  const telemetry={...base,mode:eventMode,result:'NPC_EVENT',occurrence_id:occurrenceId,selected_key:picked.key,selected_name:registry[picked.key]||picked.name,event_style:style,eligible_keys:rows.map(x=>x.key),roll:Number(roll.toFixed(4)),none_weight:Number(noneWeight.toFixed(2)),weights,goal_signals:goalSignals,selected_goal:picked.goal_signal||null};
  return{telemetry,selectedKey:picked.key,directive:''};
}

function addExplicitKeys(set,text,registry,limit){for(const key of mentionedNpcKeys(text,registry)){if(set.size>=limit)break;set.add(key);}}
function explicitlyReferencesScheduledEvent(action,event={}){
  const source=norm(action).replace(/[\s\p{P}\p{S}]+/gu,''),row=object(event),title=norm(row.title).trim(),compactTitle=title.replace(/[\s\p{P}\p{S}]+/gu,'');
  if(compactTitle.length>=4&&source.includes(compactTitle))return true;
  const anchor=title.split(/[\s\p{P}\p{S}]+/u).filter((value)=>value.length>=4).sort((a,b)=>b.length-a.length)[0];
  return Boolean(anchor&&norm(action).includes(anchor));
}
function canonicalActorKeys(event={},registry={}){
  const row=object(event),known=object(registry),values=[
    row.actor_key,row.actorKey,row.npc_key,row.npcKey,row.host_key,row.hostKey,row.owner_key,row.ownerKey,
    ...array(row.actor_keys),...array(row.actorKeys),...array(row.npc_keys),...array(row.npcKeys),
  ];
  for(const field of [row.host,row.owner])if(typeof field==='string'&&Object.hasOwn(known,field))values.push(field);
  return uniq(values.map(String).filter((key)=>Object.hasOwn(known,key))).slice(0,3);
}
function currentEventRow(save={},registry={}){
  const progress=object(save?.sceneRuntime?.eventProgress),rawId=String(progress.eventInstanceId||progress.event_instance_id||'').trim().toLowerCase();
  if(!rawId)return null;
  return [...array(save?.scheduleContext?.due),...array(save?.scheduleContext?.upcoming),...array(save?.scheduledEvents),...array(save?.activeEvents).filter((row)=>row&&typeof row==='object')]
    .find((row)=>{const id=String(row?.id||row?.event_instance_id||row?.eventInstanceId||'').trim().toLowerCase();return Boolean(id&&(rawId===id||rawId.startsWith(`${id}#`))&&canonicalActorKeys(row,registry).length);})||null;
}
function requestedUpcomingEvents(incoming={},registry={}){
  const save=incoming.saveState||{},action=String(incoming.action||'').trim();if(!action)return[];
  const intent=classifySceneIntent(action,{location:save?.world?.location||'',currentTime:save?.world?.time||'',currentDate:save?.world?.date||'',currentWeekday:save?.world?.weekday||'',actorName:save?.pc?.name||'',resumeTimedAction:save?.sceneRuntime?.timed_action});
  return array(save?.scheduleContext?.upcoming).filter(event=>isPcRelevantScheduleEvent(save,event)&&(isRequestedScheduledActivity(save,event,action,intent,registry)||explicitlyReferencesScheduledEvent(action,event))).slice(0,2);
}
function requestedScheduleWindow(incoming={},registry={}){
  const save=incoming.saveState||{},requested=requestedUpcomingEvents(incoming,registry);if(!requested.length)return[];
  const relevant=array(save?.scheduleContext?.upcoming).filter((event)=>isPcRelevantScheduleEvent(save,event)),requestedSet=new Set(requested);
  const lastRequestedIndex=relevant.reduce((last,event,index)=>requestedSet.has(event)?index:last,-1);
  if(lastRequestedIndex<0)return requested;
  const prefix=relevant.slice(0,lastRequestedIndex+1),firstBoundary=prefix.find((event)=>!requestedSet.has(event));
  const visible=new Set([...(firstBoundary?[firstBoundary]:[]),...requested]);
  return prefix.filter((event)=>visible.has(event)).slice(0,3);
}
function deriveKeys(incoming,registry,maxNpcs,directorV2=null){
  const save=incoming.saveState||{}, set=new Set();
  const authoritative=array(save?.sceneRuntime?.participants).map(String), present=new Set(authoritative);
  const last=array(incoming.recentTurns).slice(-1)[0], latestSpeaker=[...array(last?.scene)].reverse().find(item=>item?.speaker_key)?.speaker_key;
  if(latestSpeaker&&present.has(String(latestSpeaker))&&registry[latestSpeaker])set.add(String(latestSpeaker));
  if(directorV2?.selectedKey&&registry[directorV2.selectedKey]&&set.size<maxNpcs)set.add(String(directorV2.selectedKey));
  for(const key of array(directorV2?.worldResultKeys)){if(set.size>=maxNpcs)break;if(registry[key])set.add(String(key));}
  for(const key of array(directorV2?.consequenceKeys)){if(set.size>=maxNpcs)break;if(registry[key])set.add(String(key));}
  const requestedEvents=requestedUpcomingEvents(incoming,registry);
  const requestedIds=new Set(requestedEvents.map((event)=>String(event?.id||'')).filter(Boolean));
  addExplicitKeys(set,incoming.action||'',registry,maxNpcs);
  const boundCurrentEvent=currentEventRow(save,registry);
  for(const key of canonicalActorKeys(boundCurrentEvent,registry))if(set.size<maxNpcs)set.add(key);
  for(const key of requestedEvents.flatMap((event)=>canonicalActorKeys(event,registry)))if(set.size<maxNpcs)set.add(key);
  for(const key of array(save?.scheduleContext?.due).flatMap((event)=>canonicalActorKeys(event,registry)))if(set.size<maxNpcs)set.add(key);
  for(const k of requestedScheduleWindow(incoming,registry).filter((event)=>!requestedIds.has(String(event?.id||''))).flatMap((event)=>array(event?.participants)))if(set.size<maxNpcs&&registry[k])set.add(String(k));
  for(const k of requestedEvents.flatMap(event=>array(event?.participants)))if(set.size<maxNpcs&&registry[k])set.add(String(k));
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
function shouldRouteUpcomingSchedule(save,action='',registry={}){
  if(requestedUpcomingEvents({saveState:save,action},registry).length)return true;
  const intent=classifySceneIntent(action,{location:save?.world?.location||'',currentTime:save?.world?.time||'',currentDate:save?.world?.date||'',currentWeekday:save?.world?.weekday||'',actorName:save?.pc?.name||'',resumeTimedAction:save?.sceneRuntime?.timed_action});
  const limit=activityRangeLimitMinutes(intent);
  if((!intent.compression&&Number(intent.boundaryLookaheadMinutes||0)<=0)||limit<=0)return false;
  const boundary=nextScheduleBoundaryMinutes(save,{futureOnly:true,action,intent,registry});
  return boundary!=null&&boundary>0&&boundary<=limit;
}
function compactSchedule(save,keys,action='',registry={}){
  const sc=object(save?.scheduleContext),selected=new Set(keys),requested=requestedUpcomingEvents({saveState:save,action},registry),window=requestedScheduleWindow({saveState:save,action},registry);
  const clean=(ev)=>({...ev,participants:array(ev?.participants).filter(k=>selected.has(k)).slice(0,4),canonical_actor_keys:canonicalActorKeys(ev,registry).filter((key)=>selected.has(key))});
  const due=array(sc.due).filter((event)=>isPcRelevantScheduleEvent(save,event)).slice(0,2);
  const relevantUpcoming=array(sc.upcoming).filter((event)=>isPcRelevantScheduleEvent(save,event));
  const upcoming=requested.length?window:shouldRouteUpcomingSchedule(save,action,registry)?relevantUpcoming.slice(0,1):[];
  const immediateNpcKeys=new Set(due.flatMap((event)=>array(event?.participants)).map(String));
  const npc={};for(const k of keys)if(immediateNpcKeys.has(String(k))&&sc?.npc_schedule?.[k])npc[k]=sc.npc_schedule[k];
  return{due:due.map(clean),upcoming:upcoming.map(clean),npc_schedule:npc};
}
function compactScheduleAuthority(schedule,max=2400,{future=false}={}){
  const compactEvent=(ev)=>{const src=object(ev),required=[src.pc_required,src.required_for_pc,src.attendance_required].find((value)=>typeof value==='boolean'),actors=array(src.canonical_actor_keys).slice(0,3),base={id:clampText(src.id||'',80),title:clampText(src.title||'',120),date:src.date||null,time:src.time||null,location:clampText(src.location||'',100),...(typeof required==='boolean'?{mandatory:required}:{}),...(actors.length?{canonical_actor_keys:actors}:{})};return future?base:{...base,kind:clampText(src.kind||'',50)||null,participants:array(src.participants).slice(0,4)};};
  const compactNpc=(row)=>{const src=object(row);return{location:clampText(src.location||src.area||'',100),confidence:src.confidence??null,time:src.time||null};};
  const value=future?{upcoming:array(schedule?.upcoming).slice(0,2).map(compactEvent)}:{due:array(schedule?.due).slice(0,4).map(compactEvent),npc_schedule:Object.fromEntries(Object.entries(object(schedule?.npc_schedule)).slice(0,6).map(([key,row])=>[key,compactNpc(row)]))};
  let text=safeJson(value);if(text.length<=max)return text;
  if(future)return safeJson({truncated:true,upcoming:value.upcoming.slice(0,1).map(({id,title,date,time,location,mandatory,canonical_actor_keys})=>({id:clampText(id,50),title:clampText(title,70),date,time,location:clampText(location,60),...(typeof mandatory==='boolean'?{mandatory}:{}),...(array(canonical_actor_keys).length?{canonical_actor_keys}:{})}))});
  const smaller={truncated:true,due:value.due.slice(0,3),npc_schedule:Object.fromEntries(Object.entries(value.npc_schedule).slice(0,3))};
  text=safeJson(smaller);if(text.length<=max)return text;
  const focused={truncated:true,due:smaller.due.slice(0,2).map(({id,title,time,location,participants,canonical_actor_keys})=>({id,title,time,location,participants,...(array(canonical_actor_keys).length?{canonical_actor_keys}:{})})),npc_schedule:Object.fromEntries(Object.entries(smaller.npc_schedule).slice(0,2).map(([key,row])=>[key,{location:row.location,confidence:row.confidence,time:row.time}]))};
  text=safeJson(focused);if(text.length<=max)return text;
  const minimal={truncated:true,due:focused.due.map(({id,title,time,location,canonical_actor_keys})=>({id:clampText(id,50),title:clampText(title,70),time,location:clampText(location,60),...(array(canonical_actor_keys).length?{canonical_actor_keys}:{})})),npc_schedule:Object.fromEntries(Object.entries(focused.npc_schedule).slice(0,1).map(([key,row])=>[key,{location:clampText(row.location,50),time:row.time}]))};
  text=safeJson(minimal);if(text.length<=max)return text;
  const tiny={truncated:true,due:minimal.due.slice(0,1).map(({id,title,time,canonical_actor_keys})=>({id,title:clampText(title,50),time,...(array(canonical_actor_keys).length?{canonical_actor_keys}:{})}))};
  text=safeJson(tiny);if(text.length<=max)return text;
  return safeJson({truncated:true});
}
function formatAuthorityTail(scheduleText){return`===== IMMEDIATE EVENT FACTS (HARD DATA) =====\n${scheduleText||'없음'}`;}
function fitAuthorityTail({schedule={},maxChars=1400,routine=false}={}){
  if(!array(schedule?.due).length&&!Object.keys(object(schedule?.npc_schedule)).length)return'';
  if(maxChars<80)return'';
  const hardSchedule={due:array(schedule?.due),npc_schedule:object(schedule?.npc_schedule)},label=formatAuthorityTail('').length-'없음'.length,scheduleBudget=Math.max(0,maxChars-label),scheduleText=compactScheduleAuthority(hardSchedule,routine?Math.min(900,scheduleBudget):Math.min(1400,scheduleBudget)),full=formatAuthorityTail(scheduleText);
  return full.length<=maxChars?full:formatAuthorityTail(compactScheduleAuthority(hardSchedule,Math.max(0,scheduleBudget)));
}
function formatFutureScheduleContext(schedule={},maxChars=900){return array(schedule?.upcoming).length?`===== FUTURE CLOCK FACTS (SOFT CONTINUITY DATA) =====\n${compactScheduleAuthority({upcoming:schedule.upcoming},maxChars,{future:true})}`:'';}
function compactEventContinuity(progress={},canonicalActorKeys=[]){
  const row=object(progress),eventInstanceId=clampText(row.eventInstanceId||row.event_instance_id||'',100)||null;
  if(!eventInstanceId)return null;
  return{eventInstanceId,completedBeats:array(row.completedBeats||row.completed_beats).slice(-24).map((value)=>clampText(value,100)),omittedCompletedCount:Math.max(0,Number(row.omittedCompletedCount||row.omitted_completed_count||0)),paused:row.paused===true,...(canonicalActorKeys.length?{canonical_actor_keys:canonicalActorKeys.slice(0,3)}:{})};
}
function compactSceneRuntime(sceneRuntime={},keywords=[],text='',registeredNpcKeys=null,maxFactions=3,historyLimit=2,recentTexts=[],{freshPlayerAction=false,canonicalActorKeys=[]}={}){
  const source=object(sceneRuntime),factionSocial=compactFactionSocialForContext(source.faction_social,{text,recentTexts,keywords,maxFactions,historyLimit,registeredNpcKeys}),continuity=compactEventContinuity(source.eventProgress,canonicalActorKeys),runtime={
    scene_key:clampText(source.scene_key||'',120)||null,
    participants:array(source.participants).slice(0,6),
    ongoing_topic:clampText(source.ongoing_topic||'',180)||null,
    ...(!freshPlayerAction&&clampText(source.unresolved_question||'',180)?{unresolved_question:clampText(source.unresolved_question||'',180)}:{}),
    ...(continuity?{eventProgress:continuity}:{}),
    ...(source.timed_action?{timed_action:source.timed_action}:{}),
  };
  if(Object.keys(factionSocial.reputations).length)runtime.faction_social=factionSocial;
  return runtime;
}
function compactSave(incoming,keys,registry,profile,keywords,text='',recentTexts=[],mode='game'){
  const save=incoming.saveState||{},names=keys.map(k=>registry[k]).filter(Boolean),intimacy={},npcStates={};
  for(const k of keys){if(save?.intimacyStates?.[k]!=null)intimacy[k]=save.intimacyStates[k];if(save?.npcStates?.[k]!=null)npcStates[k]=save.npcStates[k];}
  const globalMem=selectMemories(save?.memories?.global,keywords,names,profile.memoriesGlobal);
  const knowledge=selectMemories(array(save?.pcKnowledge).map(x=>typeof x==='string'?{fact:x,importance:2}:x),keywords,names,Math.max(6,profile.memoriesGlobal)).map(x=>x?.fact||x);
  const relevantEvents=array(save?.activeEvents).filter(ev=>{const t=norm(ev);return keywords.some(k=>k.length>=2&&t.includes(k));}).slice(0,6);
  const fateBackground=compactFateBackgroundForModel(save?.creation,save?.pc),personalStory=compactFatePersonalStoryForModel(save?.creation,{existingHooks:save?.hooks}),pc=compactPc(save?.pc||{},profile.name.includes('important')||profile.name.includes('critical'),text);
  if(fateBackground){delete pc.characterSetting;delete pc.admission;const publicRegion=fateBackground.detail.public_facts.find(row=>row.id==='home_region')?.fact;if(publicRegion)pc.origin=publicRegion;}
  const boundEvent=currentEventRow(save,registry),boundActors=canonicalActorKeys(boundEvent,registry),freshPlayerAction=isFreshPlayerAction(text,mode);
  return{version:save?.version,turnNumber:Number(save?.turnNumber||0),world:save?.world||{},pc,...(fateBackground?{characterBackground:fateBackground.detail}:{}),...(personalStory?{characterPersonalStory:personalStory.detail}:{}),...(Object.keys(intimacy).length?{intimacyStates:intimacy}:{}),npcStates,relevantNpcKeys:keys,activeEvents:relevantEvents,completedEvents:array(save?.completedEvents).slice(-8),pcKnowledge:knowledge,memories:{global:globalMem},hooks:array(save?.hooks).filter(x=>!['resolved','expired'].includes(x?.status)&&!x?.event_consequence).slice(-4),flags:save?.flags||{},sceneRuntime:compactSceneRuntime(save?.sceneRuntime,keywords,text,Object.keys(registry),2,1,recentTexts,{freshPlayerAction,canonicalActorKeys:boundActors}),backgroundDigest:clampText(save?.backgroundDigest||'',450)};
}
function compactRecent(recentTurns,count){
  const turns=array(recentTurns).slice(-count);
  return turns.map((t,index)=>{
    const latest=index===turns.length-1,sceneLimit=latest?6:3,textLimit=latest?260:180;
    return{action:clampText(t?.action||'',320),summary:clampText(t?.summary||'',520),importance:t?.importance||null,scene:array(t?.scene).slice(-sceneLimit).map(i=>({kind:i?.kind,speaker_key:i?.speaker_key||null,expression:i?.display_expression||i?.expression||null,text:clampText(i?.text||'',textLimit)}))};
  });
}
function classifyProfile(incoming={},mode='game'){
  if(mode==='continue')return PROFILES.continue;
  const save=incoming.saveState||{},action=String(incoming.action||'');
  if(save?.flags?.majorScene||hasAffirmedActionKeyword(action,CRITICAL_ACTION_RE))return PROFILES.critical;
  const dueMajor=array(save?.scheduleContext?.due).some(ev=>Number(ev?.importance||0)>=4);
  const requestedMajor=requestedUpcomingEvents(incoming).some(ev=>Number(ev?.importance||0)>=4);
  if(dueMajor||requestedMajor)return PROFILES.scheduled;
  if(incoming.proReasoning||hasAffirmedActionKeyword(action,IMPORTANT_RE))return PROFILES.important;
  return PROFILES.routine;
}
function adjustedProfile(base,incoming={}){
  const fb=object(incoming.saveState?.routerFeedback);if(fb.routerVersion!==VERSION||fb.profile!==base.name)return{...base,scale:1};const last=Number(fb.lastInputTokens||0);if(!last||last<=base.softMaxTokens)return{...base,scale:1};const scale=Math.max(.76,Math.min(1,(base.targetTokens*.94)/last));return{...base,scale,instructionChars:Math.floor(base.instructionChars*scale),inputChars:Math.floor(base.inputChars*scale),worldChars:Math.floor(base.worldChars*scale),npcChars:Math.floor(base.npcChars*scale),speechChars:Math.floor(base.speechChars*scale),pcChars:Math.floor(base.pcChars*scale)};
}
function contextSeed(incoming){const save=incoming.saveState||{},last=array(incoming.recentTurns).slice(-1)[0];return[incoming.action,save?.world?.location,save?.pc?.department,clampText(incoming.rollingSummary||'',900),safeJson(save?.sceneRuntime||{}),safeJson(array(save?.scheduleContext?.due).map(x=>({title:x?.title,location:x?.location,time:x?.time}))),last?.summary,array(last?.scene).map(x=>`${x?.speaker_key||''} ${x?.text||''}`).join(' ')].filter(Boolean).join('\n');}
function buildInstructions(original,incoming,profile,originalInput,mode){
  const sec=parseInstructionSections(original),registry=parseRegistry(sec.registry),directorV2=buildEventDirectorV2(incoming,originalInput,registry,mode),orchestration=deriveSceneOrchestrationPlan({action:incoming.action||'',saveState:incoming.saveState||{},mode,directorTelemetry:directorV2?.telemetry,registry}),directorSuppressed=sceneOrchestrationSuppressesDirectorResult(orchestration,directorV2?.telemetry),routingDirectorV2=directorSuppressed?{...directorV2,selectedKey:null,consequenceKeys:[]}:directorV2,seed=contextSeed(incoming),keywords=extractKeywords(seed,36),keys=deriveKeys(incoming,registry,profile.maxNpcs,routingDirectorV2),names=keys.map(k=>registry[k]).filter(Boolean),secretAllowed=secretAccess(incoming,keywords),combat=hasAffirmedActionKeyword(incoming.action||'',COMBAT_RE);
  const world=chooseBlocks(parseBlocks(sec.world),{budget:profile.worldChars,keywords,names,secretAllowed,mode:'world',combat});
  const npc=chooseBlocks(parseBlocks(sec.npc),{budget:profile.npcChars,keywords,names,secretAllowed,mode:'npc'});
  const speech=chooseBlocks(parseBlocks(sec.speech),{budget:profile.speechChars,keywords,names,secretAllowed:false,mode:'speech'});
  const pc=chooseBlocks(parseBlocks(sec.pc).filter(block=>!block.title.includes('플레이어 주권')),{budget:profile.pcChars,keywords,names,secretAllowed:false,mode:'pc',combat});
  let adult='';if(incoming.adultMode&&Number(incoming.saveState?.pc?.age||0)>=18)adult=clampText(sec.adult,Math.min(1800,profile.speechChars));
  const registryText=Object.entries(registry).map(([k,n])=>`${k}=${n}`).join(', ');
  let text=[ROUTER_GM_RULES,NATURAL_STYLE,ROUTER_NOTE,combat?COMBAT_RULE:'',`===== CHARACTER REGISTRY =====\n${registryText}`,world.text?`===== ROUTED WORLD CANON =====\n${world.text}`:'',npc.text?`===== ROUTED NPC CANON =====\n${npc.text}`:'',speech.text?`===== ROUTED NPC SPEECH =====\n${speech.text}`:'',adult?`===== ROUTED ADULT LAYER =====\n${adult}`:'',pc.text?`===== ROUTED PC SYSTEM =====\n${pc.text}`:''].filter(Boolean).join('\n\n');
  text=clampText(text,profile.instructionChars);return{text,registry,keys,names,keywords,moduleTitles:{world:world.titles,npc:npc.titles,speech:speech.titles,pc:pc.titles,adult:Boolean(adult)},originalChars:sec.originalChars,secretAllowed,directorV2,orchestration};
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
function compactActiveNpcSignal(context,saveState={},maxChars=2200){
  const selected=new Set(array(context?.profiles).map((row)=>String(row?.key||'')).filter(Boolean));
  const rows=array(context?.profiles).slice(0,3).map((row)=>Object.fromEntries(Object.entries({
    key:row?.key,name:row?.name,goal:row?.goal,relationship:row?.relationship,prior_judgment:row?.prior_judgment,social_stance:row?.social_stance,wants_from_pc:row?.wants_from_pc,concern:row?.concern,internal_emotion:row?.internal_emotion,pc_evidence:array(row?.pc_evidence).slice(-2),
    npc_relationships:Object.fromEntries(Object.entries(object(saveState?.npcInnerStates?.[row?.key]?.npc_relationships)).filter(([target])=>target!==row?.key&&selected.has(String(target))).slice(0,2).map(([target,value])=>[target,{affinity:boundedNumber(value?.affinity,-100,100,0),trust:boundedNumber(value?.trust,-100,100,0),status:clampText(value?.status||'중립',60),reason:clampText(value?.reason||'',140)||null,updated_turn:boundedNumber(value?.updated_turn,0,1e9,0)}])),
  }).filter(([,value])=>value!=null&&value!==''&&(!Array.isArray(value)||value.length)&&(!(value&&typeof value==='object'&&!Array.isArray(value))||Object.keys(value).length))));
  while(rows.length>1&&safeJson(rows).length>maxChars)rows.pop();
  if(safeJson(rows).length<=maxChars)return safeJson(rows);
  return safeJson(rows.map(({key,name,goal,relationship,prior_judgment,social_stance,npc_relationships})=>({key,name,goal,relationship,prior_judgment,social_stance,npc_relationships})));
}
function buildHardExecutionFacts({action='',saveState={},registry={},mode='game'}={}){
  const intent=classifySceneIntent(action,{location:saveState?.world?.location||'',currentTime:saveState?.world?.time||'',currentDate:saveState?.world?.date||'',currentWeekday:saveState?.world?.weekday||'',actorName:saveState?.pc?.name||'',resumeTimedAction:saveState?.sceneRuntime?.timed_action}),range=array(intent.suggestedAdvanceMinutes),boundaryLookahead=Math.max(0,Number(intent.boundaryLookaheadMinutes||0)),requested=requestedUpcomingEvents({saveState,action},registry),requestedIds=new Set(requested.map((event)=>String(event?.id||''))),intervening=requestedScheduleWindow({saveState,action},registry).some((event)=>!requestedIds.has(String(event?.id||''))),waitsForRequested=requested.length>0&&intent.kind==='wait',boundaryRelevant=requested.length?intervening:(intent.compression&&activityRangeLimitMinutes(intent)>0)||boundaryLookahead>0,boundaryCandidate=waitsForRequested?nextScheduleBoundaryMinutes(saveState,{futureOnly:true,action:'',intent,registry}):boundaryRelevant?nextScheduleBoundaryMinutes(saveState,{futureOnly:true,action,intent,registry}):null,boundaryLimit=waitsForRequested?1440:activityRangeLimitMinutes(intent),scheduleBoundary=boundaryCandidate!=null&&boundaryCandidate>0&&boundaryCandidate<=boundaryLimit?boundaryCandidate:null;
  const facts={mode,intent_kind:intent.kind,semantic_target:intent.semanticTarget||null,time_window_minutes:range.length===2?range:null,...(intent.turnLimitTruncated?{turn_limit_minutes:1440}:{}),...(intent.scheduledStartOffsetMinutes!=null?{scheduled_start_offset_minutes:intent.scheduledStartOffsetMinutes}:{}),...(intent.strictDurationLowerBoundMinutes!=null?{strict_duration_lower_bound_minutes:intent.strictDurationLowerBoundMinutes}:{}),...(intent.explicitDurationUpperBoundMinutes!=null?{explicit_duration_upper_bound_minutes:intent.explicitDurationUpperBoundMinutes}:{}),...(intent.explicitDurationMinutes!=null?{explicit_duration_minutes:intent.explicitDurationMinutes}:{}),...(intent.explicitDurationRangeMinutes?{explicit_duration_range_minutes:intent.explicitDurationRangeMinutes}:{}),...(intent.precedingActivityRangeMinutes?{preceding_activity_range_minutes:intent.precedingActivityRangeMinutes}:intent.precedingActivityMinutes>0?{preceding_activity_minutes:intent.precedingActivityMinutes}:{}),...(scheduleBoundary!=null?{schedule_boundary_minutes:scheduleBoundary}:{})};
  const plan=intent.structuredExecutionPlan||intent.structuredDecisionPlan,lines=['===== HARD EXECUTION FACTS (DATA, NOT FICTION) =====',safeJson(facts)];
  if(plan?.eligible&&array(plan.clauses).length){
    const compactPlan=plan.clauses.map((clause,index)=>`${clause.clause_id||`action_${index+1}`}:${clause.action_type}@${clause.start_min_minutes}-${clause.complete_min_minutes}/${clause.start_max_minutes}-${clause.complete_max_minutes??'open'}`).join(';');
    lines.push('[TPP PHASE 3 — STRUCTURED TIME PLAN]',`STRUCTURED_TIME_PLAN=${compactPlan}`);
  }
  return lines.join('\n');
}
function compactDirectorFactSignal(directorV2=null){
  const consequence=object(directorV2?.consequence),worldResult=object(directorV2?.worldResult),telemetry=object(directorV2?.telemetry);
  if(Object.keys(consequence).length)return safeJson({kind:'due-consequence',id:consequence.id||null,event:consequence.event_name||null,target:consequence.target_bucket||null,due_at:consequence.due_at||null,trigger_in_minutes:telemetry.event_consequence_trigger_minutes??null,visible_cause:Number(consequence.secret_level||0)<=2?consequence.reason||null:null,hidden_cause:Number(consequence.secret_level||0)>=3});
  if(Object.keys(worldResult).length)return safeJson({kind:'public-world-result',id:worldResult.world_result_id||null,source_at:worldResult.source_at||null,fact:worldResult.fact||null,npc_keys:array(worldResult.npc_keys).slice(0,2)});
  if(['PRESENT_NPC_GOAL_TICK','PRESENT_NPC_GOAL_PRIORITY'].includes(telemetry.result)&&telemetry.selected_key){const goal=object(telemetry.selected_goal);return safeJson({kind:'npc-goal-initiative',npc_key:telemetry.selected_key,goal_id:goal.id||null,desire:goal.desire||null,next_action:goal.next_action||null,obstacle:goal.obstacle||null});}
  return'';
}
function buildInput(incoming,originalInput,profile,routed,mode='game'){
  const action=String(incoming.action||'');
  const recent=compactRecent(incoming.recentTurns,profile.recentTurns),recentFactionTexts=recent.map((turn)=>`${turn.action||''} ${turn.summary||''} ${array(turn.scene).map((item)=>item.text||'').join(' ')}`);
  const routine=profile.name.includes('routine'),registeredNpcKeys=Object.keys(routed.registry),freshPlayerAction=isFreshPlayerAction(action,mode),save=compactSave(incoming,routed.keys,routed.registry,profile,routed.keywords,action,recentFactionTexts,mode),schedule=compactSchedule(incoming.saveState||{},routed.keys,action,routed.registry),cg=array(incoming.availableCgIds).slice(0,60).join(', '),activeThreads=buildActiveThreadsDirective({action,saveState:incoming.saveState||{},mode,limit:6,maxChars:1150,scheduleIds:[...array(schedule.due),...array(schedule.upcoming)].map((event)=>event?.id).filter(Boolean)});
  const orchestration=routed.orchestration||deriveSceneOrchestrationPlan({action,saveState:incoming.saveState||{},mode,directorTelemetry:routed.directorV2?.telemetry,registry:routed.registry});
  const npcSignificance=deriveNpcSignificanceBoundary({candidateKeys:routed.keys,registry:routed.registry,mode,orchestration});
  const npcCharacterBehavior=compactNpcCharacterBehavior({saveState:incoming.saveState||{},candidateKeys:routed.keys,registry:routed.registry,mode,significanceBoundary:npcSignificance,maxNpcs:3,memoryLimit:2}),activeNpcSignal=compactActiveNpcSignal(npcCharacterBehavior,incoming.saveState||{},2200);
  const directorSuppressed=sceneOrchestrationSuppressesDirectorResult(orchestration,routed.directorV2?.telemetry);
  const directorFactSignal=directorSuppressed?'':compactDirectorFactSignal(routed.directorV2);
  const fateBackground=compactFateBackgroundForModel(incoming.saveState?.creation,incoming.saveState?.pc),personalStory=compactFatePersonalStoryForModel(incoming.saveState?.creation,{existingHooks:incoming.saveState?.hooks});
  const world=object(save.world),pc=object(save.pc),scene=object(save.sceneRuntime),{sceneRuntime:_routedSceneRuntime,...routedSaveDetail}=save;
  const sourceRuntime=object(incoming.saveState?.sceneRuntime),eventContinuity=object(scene.eventProgress),turnHook=normalizeTurnHook(sourceRuntime.turn_hook),exitCondition=normalizeSceneExitCondition(sourceRuntime.exit_condition),playerBoundary=freshPlayerAction?null:turnHook?.status==='awaiting-player'?{kind:turnHook.kind,anchor:clampText(turnHook.anchor,140)}:exitCondition?.status==='awaiting-player'?{kind:exitCondition.kind,anchor:clampText(exitCondition.target,140)}:null;
  const essentialFactionSocial=compactFactionSocialForContext(incoming.saveState?.sceneRuntime?.faction_social,{text:action,recentTexts:recentFactionTexts,keywords:routed.keywords,maxFactions:2,historyLimit:1,registeredNpcKeys});
  const essentialTalents=compactTalents(pc.talents),essentialTraits=compactAbilityMap(pc.traits,false,action),essentialAuthorities=compactAbilityMap(pc.authorities,false,action),essentialAwakening=compactMandatoryAwakeningCandidates(pc.awakeningCandidates);
  const essentialPc=pressureBoundEssentialPc({name:clampText(pc.name||'',80),department:clampText(pc.department||'',100),status:clampText(pc.status||'',160),skills:Object.fromEntries(Object.entries(compactSkills(pc.skills)).map(([key,row])=>[key,{grade:row.grade}])),skillCandidates:compactMandatorySkillCandidates(pc.skillCandidates),...(Object.keys(essentialTalents).length?{talents:essentialTalents}:{}),...(Object.keys(essentialTraits).length?{traits:essentialTraits}:{}),...(Object.keys(essentialAuthorities).length?{authorities:essentialAuthorities}:{}),...(Object.values(essentialAwakening).some((bucket)=>Object.keys(bucket).length)?{awakeningCandidates:essentialAwakening}:{})},action);
  const essentialSave={version:save.version,turnNumber:save.turnNumber,world:{date:world.date||null,...(world.weekday?{weekday:world.weekday}:{}),time:world.time||null,location:clampText(world.location||'',140)},pc:essentialPc,...(fateBackground?{characterBackground:fateBackground.essential}:{}),...(personalStory?{characterPersonalStory:{version:personalStory.essential.version,layers:personalStory.essential.layers,candidates:array(personalStory.essential.candidates).slice(0,3)}}:{}),relevantNpcKeys:array(save.relevantNpcKeys).slice(0,3),npcStates:Object.fromEntries(Object.entries(object(save.npcStates)).slice(0,3).map(([key,row])=>[key,{location:clampText(row?.location||'',100),status:clampText(row?.status||row?.state||'',120)}])),sceneRuntime:{participants:array(sourceRuntime.participants).slice(0,6),...(playerBoundary?{player_boundary:playerBoundary}:{}),...(sourceRuntime.timed_action?{timed_action:sourceRuntime.timed_action}:{}),...(Object.keys(eventContinuity).length?{eventProgress:eventContinuity}:{}),...(Object.keys(essentialFactionSocial.reputations).length?{faction_social:essentialFactionSocial}:{})}};
  const saveState=`===== AUTHORITATIVE SAVE_STATE (ROUTED MINIMUM) =====\n${safeJson(essentialSave)}`;
  const threadSignal=array(activeThreads.threads).filter((thread)=>thread?.source!=='schedule'&&thread?.background!==true&&!(freshPlayerAction&&(thread?.player_owned===true||thread?.source==='scene-runtime'))).slice(0,4).map(({id,source,kind,status,title,due_at,player_owned})=>({id,source,kind,status,title,...(due_at?{due_at}:{}),...(player_owned?{player_owned:true}:{})}));
  activeThreads.visible_threads=threadSignal.length;
  const {eventProgress:_currentEventProgress,...currentSceneFacts}=scene,softScheduleContext=formatFutureScheduleContext(schedule),optionalContext=`===== RECENT SCENE CONTEXT =====\n${safeJson(recent)}${activeNpcSignal!=='[]'?`\n\n===== ACTIVE NPC SIGNAL (READ-ONLY FACTS) =====\n${activeNpcSignal}`:''}\n\n===== CURRENT SCENE FACTS =====\n${safeJson(currentSceneFacts)}${threadSignal.length?`\n\n===== RELEVANT CONTINUITY THREADS =====\n${safeJson(threadSignal)}`:''}\n\n===== ROLLING SUMMARY TAIL =====\n${clampText(incoming.rollingSummary||'아직 없음',900)}\n\n===== AUTHORITATIVE SAVE_STATE (ROUTED DETAIL) =====\n${safeJson(routedSaveDetail)}\n\n===== TURN FLAGS =====\n${safeJson({input_mode:mode,adult_mode:Boolean(incoming.adultMode)})}\n\n===== AVAILABLE_CG_IDS =====\n${cg||'없음'}${softScheduleContext?`\n\n${softScheduleContext}`:''}`;
  const executionFacts=buildHardExecutionFacts({action,saveState:incoming.saveState||{},registry:routed.registry,mode}),reservedContext=`${executionFacts}${directorFactSignal?`\n\n===== RELEVANT ACTIVE FACT (DATA, NOT FICTION) =====\n${directorFactSignal}`:''}`;
  const actionFrame=(text)=>`===== USER ACTION (EXACT) =====\n${text}`,fixedSeparators=6,actionBlock=actionFrame(clampMiddleText(action,5200));
  const authorityBudget=Math.max(0,profile.inputChars-saveState.length-reservedContext.length-actionBlock.length-fixedSeparators),authorityTail=fitAuthorityTail({schedule,maxChars:authorityBudget,routine});
  return{text:composeRoutedInput({saveState,optionalContext,reservedContext,authorityTail,actionBlock,inputChars:profile.inputChars}),orchestration,activeThreads,npcSignificance,npcCharacterBehavior,personalStory};
}

export function routeOpenAIParams(params,{incoming={},mode='game'}={}){
  if(mode==='meta')return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'meta-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'META keeps full canon',original_chars:String(params?.instructions||'').length+String(params?.input||'').length,routed_chars:String(params?.instructions||'').length+String(params?.input||'').length}};
  const base=classifyProfile(incoming,mode),profile=adjustedProfile(base,incoming),originalInstructions=String(params?.instructions||''),originalInput=String(params?.input||'');
  const required=['===== CHARACTER REGISTRY =====','===== WORLD CANON =====','===== NPC CANON =====','===== NPC SPEECH =====','===== PC SYSTEM ====='];
  if(!required.every(m=>originalInstructions.includes(m)))return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'core prompt markers changed',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length}};
  const routed=buildInstructions(originalInstructions,incoming,profile,originalInput,mode);if(!Object.keys(routed.registry||{}).length)return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'registry parse failed',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length}};
  const built=buildInput(incoming,originalInput,profile,routed,mode),newParams={...params,instructions:routed.text,input:built.text,prompt_cache_key:process.env.OPENAI_PROMPT_CACHE_KEY||'lumensia-stable-context-router-v156-hf1',prompt_cache_retention:'24h'},originalChars=originalInstructions.length+originalInput.length,routedChars=routed.text.length+built.text.length;
  const eventDirectorTelemetry=routed.directorV2?.telemetry||null;
  return{params:newParams,telemetry:{routerVersion:VERSION,enabled:true,profile:profile.name,target_input_tokens:profile.targetTokens,soft_max_tokens:profile.softMaxTokens,adaptive_scale:Number((profile.scale||1).toFixed(3)),instructions_chars:routed.text.length,input_chars:built.text.length,routed_chars:routedChars,original_chars:originalChars,char_reduction_ratio:originalChars>0?Number((1-routedChars/originalChars).toFixed(4)):0,selected_npcs:routed.keys,selected_npc_names:routed.names,canon_modules:routed.moduleTitles,recent_turns:profile.recentTurns,secret_allowed:routed.secretAllowed,event_director_v2:eventDirectorTelemetry,event_director_v3:eventDirectorTelemetry?{...eventDirectorTelemetry,version:DIRECTOR_V3_VERSION,weighted_core_version:DIRECTOR_V2_VERSION}:null,scene_orchestration:built.orchestration,npc_significance_v1:built.npcSignificance,npc_character_behavior_v1:{version:built.npcCharacterBehavior.version,mode:built.npcCharacterBehavior.mode,npc_keys:built.npcCharacterBehavior.npc_keys,profile_count:built.npcCharacterBehavior.profiles.length,evidence_count:built.npcCharacterBehavior.evidence_count,source:built.npcCharacterBehavior.source},active_threads_v1:{version:built.activeThreads.version,mode:built.activeThreads.mode,count:built.activeThreads.threads.length,visible_count:built.activeThreads.visible_threads,top_id:built.activeThreads.threads[0]?.id||null,sources:[...new Set(built.activeThreads.threads.map((thread)=>thread.source))]},...(built.personalStory?{personal_story_v1:{version:built.personalStory.version,candidate_count:built.personalStory.candidateCount}}:{})}};
}
export function routerVersion(){return VERSION;}
