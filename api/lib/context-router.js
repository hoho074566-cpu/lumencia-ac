// LUMENSIA V1.5.6 Stable Context Router + Event Director V2.1
// Preserves V1.5.3 HF1 15-20K relevance budgets.
// NPC Goal Tick V1: guarded present-NPC initiative without an additional model call.
// Stable path: api/lib/context-router.js

import { NARRATIVE_TIME_POLICY_VERSION, activityRangeLimitMinutes, buildSceneMomentumDirective, classifySceneIntent, nextScheduleBoundaryMinutes, scheduleBoundaryLimitMinutes } from '../../lib/scene-momentum.js';
import { buildSceneNoveltyDirective } from '../../lib/scene-novelty.js';
import { buildScenePurposeDirective, normalizeScenePurpose } from '../../lib/scene-purpose.js';
import { buildSceneExitDirective, normalizeSceneExitCondition } from '../../lib/scene-exit.js';
import { buildTurnHookDirective, normalizeTurnHook } from '../../lib/turn-hook.js';
import { buildEventConsequenceDirective, minutesUntilEventConsequence, selectDueEventConsequence } from '../../lib/event-consequence.js';
import { NPC_GOAL_TICK_VERSION, isGoalTickCoolingDown } from '../../lib/npc-goal-tick.js';
import { compactFactionSocialForContext } from '../../lib/faction-social-consequence.js';
import { buildSceneOrchestrationDirective, deriveSceneOrchestrationPlan, sceneOrchestrationActionFrame, sceneOrchestrationSuppressesDirectorResult } from '../../lib/scene-orchestration.js';
import { buildWorldResultSurfacingDirective, selectWorldResultForSurfacing, WORLD_RESULT_SURFACING_VERSION } from '../../lib/world-result-surfacing.js';
import { buildActiveThreadsDirective } from '../../lib/active-threads.js';
import { deriveNpcSignificanceBoundary } from '../../lib/npc-significance.js';
import { buildNpcKnowledgeBoundaryDirective, deriveNpcKnowledgeBoundary } from '../../lib/npc-knowledge-boundaries.js';

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

const ROUTER_GM_RULES = String.raw`너는 판타지 아카데미 장기 RPG 「루멘시아 아카데미」의 GM이자 독립적으로 움직이는 세계 시뮬레이터다.
절대 규칙:
1) PC의 새로운 행동·대사·감정·생각·수락/거절을 대신 만들지 않는다. 그러나 USER ACTION이 이미 선언한 의미적 행동 목표를 완료하는 데 필요한 결정 가치 없는 중간 단계(문, 복도, 계단, 현관, 평범한 이동)는 자동 처리하고 다음으로 실제 판단 가치가 있는 지점까지 세계를 진행한다.
2) 동적 사실은 AUTHORITATIVE SAVE_STATE가 최우선이다. 선택 제공된 CANON과 충돌하면 SAVE_STATE의 현재값을 따른다.
3) Context Router가 무관한 CANON을 생략할 수 있다. 제공되지 않은 세부설정을 즉흥 창작하지 말고 보수적으로 처리한다.
4) NPC는 자기 일정·목표·지식·관계·말투를 가진 독립 인물이다. 모두가 PC 중심으로 움직이지 않는다.
5) NPC는 자기 기억, 실제 직접 목격, 명시적으로 전달받은 내용, 공개 사실만 행동 근거로 사용한다. PC만 아는 정보·다른 NPC 기억·GM/off-screen 정보는 근거가 아니다. 근거가 없으면 그 정보를 사용하지 않는 것이 기본이며 반드시 “모른다”고 대사할 필요는 없다. L4~L5/비밀/메타정보를 정당한 발견 없이 PC나 일반 NPC 지식으로 쓰지 않는다.
6) 시도는 자동 성공하지 않는다. 전투·판정은 능력, 준비, 정보, 경험, 상성, 거리, 타이밍, 지형, 피로, 부상, 심리를 종합한다.
7) 성장·스킬 경험은 실제 훈련·실전·실패·교정·통찰이 있을 때만 천천히 누적한다. 아직 없는 독립 기술은 skill_learning에 구체적 basis와 함께 기록하고, 기존 기술의 동의어·세부 동작·일회성 연출을 새 스킬로 만들지 않는다. 즉흥 각성/스킬/혈통/유물 생성 금지.
8) 관계는 실제 사건으로 서서히 변한다. relationship_changes는 NPC와 PC 사이, npc_relationship_changes는 NPC가 다른 NPC를 향해 보인 방향성 변화다. NPC 간 변화는 직접 상호작용이나 권위 있는 공동 사건의 인과가 있을 때만 기록하며 공동 장면에 있었다는 이유만으로 관계를 바꾸지 않는다. faction_reputation_changes는 공개 조직이 PC를 보는 집단 평판이며 공개 사건·공식 기록·등록 NPC의 실제 목격·출처 있는 소문이 있을 때만 기록한다. credible_rumor에는 실제 출처/전달 경로를 source에 적는다. 사적 행동/단순 동석으로 바꾸거나 개인 관계와 자동 연동하지 않는다. 늦게 돌아올 조직 반응은 delayed_consequences_add를 사용한다. state_delta에는 실제 발생한 변화만 기록한다.
9) [NARRATIVE TIME POLICY ${NARRATIVE_TIME_POLICY_VERSION}] 서사 우선, clock 보조. minute는 일정/deadline/consequence/duration 등 검증용. prose에 raw/경과분을 보고하지 않는다. 시각은 일정·기한·위험·질문/지정에만 보이며 일정은 PC를 강제하지 않는다.
10) 등록 NPC speaker_key는 CHARACTER REGISTRY의 정확한 키만 쓴다. 단역은 speaker_key=null과 표시명 사용.
11) choices는 PC 선택이 실제로 필요한 지점에서만 정확히 3개, 아니면 빈 배열.
12) scene_summary는 장기적으로 유용한 사실을 1~4문장으로 압축한다.
13) USER ACTION의 긍정형 직접 선언은 이번 턴에 확정된 행동/대사다. 생각·의도로 되돌리지 말고 시도와 즉각적인 반응을 처리한다. 단, 명시적으로 부정·거절되었거나 하지 않겠다고 한 행동, 가정·질문·조건으로만 언급된 행동은 확정 행동이 아니므로 실행하지 않는다.
14) USER ACTION 원문 전체를 반영한다. 서로 충돌하지 않는 선언을 생략하지 않되 성공 여부와 결과는 능력·상황·판정에 따른다.
15) 제공된 구조화 JSON 스키마만 반환하고 내부 판정 메모/Router 설명은 출력하지 않는다.
16) event_progress는 현재 논리적 이벤트 occurrence의 compact 진행 상태다. event_instance_id는 제공된 schedule/Event Director occurrence ID를 우선하고 event/beat ID는 안정된 짧은 영문 소문자로 쓴다. 명확히 끝난 beat만 completed_beats에 추가하고 최근 완료 ID를 최대 24개 반환한다. AUTHORITATIVE SAVE_STATE.sceneRuntime.eventProgress의 완료 beat는 언급·회상할 수 있지만 현재 행동으로 재실행하거나 active로 되돌리지 않는다. omittedCompletedCount가 1 이상이면 compact 목록에서 생략된 더 이른 beat도 전부 완료된 것이므로 설정/대기/실행 상태로 되돌리지 않는다. 같은 occurrence의 완료 상태를 의미상 지우지 말고 완료 뒤로 전진하며, 새 occurrence가 실제 시작되면 그 ID로 교체한다. 이벤트가 끝났거나 구조화할 활성 이벤트가 없으면 event_progress=null이다.
17) npc_state_updates.current_goal은 NPC가 실제로 추구하는 현재 목표가 새로 생기거나 의미 있게 바뀐 경우에만 짧고 구체적으로 갱신한다. 목표 대상은 PC일 필요가 없으며 다른 NPC·장소·조직·물건·수업·사건일 수 있다. 기존 현재 목표와 충돌하는 새 목표를 근거 없이 만들지 말고, 목표가 행동·거절·접근·회피·우선순위에 자연스럽게 영향을 주게 한다.
18) SCENE CHANGE 우선: 직전 턴 이후 실제로 달라진 위치·시간·NPC 행동/출입·정보·사건·관계·목표·위험·환경을 우선 서술한다. scene_title/문장 표현만 바꾸고 같은 상태를 재묘사하는 것은 진행이 아니다.
19) 이미 공개된 게시판·창구·공지·목록·배경 정보는 변한 것이 없으면 다시 목록처럼 읽어주지 않는다. 새 요소/변화/현재 행동 관련 요소를 우선한다.
20) NPC는 자기 일정·목표·욕망·관계·감정에 따라 PC 입력을 기다리지 않고 먼저 말 걸기, 이동/퇴장, 다른 NPC와 상호작용, 조사·파벌 행동·사건 개입을 할 수 있다. 단 물리 위치·일정·지식 제약을 지킨다.
21) 한 턴에서 이동·식사·대기·훈련·downtime은 변화까지 압축하되 일정·consequence·NPC initiative·관계/성장·world event는 보존한다.
22) clock tick은 STOP 사유가 아니다. 전투·위험·중요 대화·불가역 판단에서 멈추며 중간 단계는 재입력받지 않는다.
23) 사용자에게 보이는 narration/dialogue에서 내부 명칭 'PC' 또는 자리표시자 'Aaa'를 주어로 출력하지 않는다. 실제 플레이어 이름을 쓰거나 자연스럽게 주어를 생략한다.
 24) TURN HOOK은 행동 결과와 EXIT_TARGET 뒤에 남는 구체적인 다음 방향이다. 진짜 판단점, NPC의 의도 있는 접근·요청·행동, 새 정보·목표·위험, 사건/세계 압력 중 하나를 우선하되, 단순 재묘사·기존 정보·가짜 질문으로 훅을 만들지 않는다.
 25) 현재 결과가 즉시 끝나지 않고 나중에 인과적으로 돌아오는 것이 자연스러울 때만 delayed_consequences_add를 사용한다. ROUTINE 한 턴에는 최대 1건, 그 외에도 꼭 필요한 최소 건수만 예약하고 이미 hooks에 있는 같은 결과를 중복 예약하지 않는다. 예약 결과는 EVENT CONSEQUENCE V1의 DUE 지시 전에는 미리 발현시키지 않는다.
 26) 장면을 쓰기 전 NPC significance를 현재 행동·사건·목표·관계·지식의 의미와 인과로 판단한다. AUTHORITATIVE SAVE_STATE.relevantNpcKeys 중 전면 primary와 직접 연결된 support만 director.spotlight_keys에 우선순위 순으로 보통 0~2명 넣는다. 점수/문구 매칭, 유명도·호감도·미등장 기간만으로 전면화하지 않고, 나머지는 배경/부재로 두며 위치·일정·지식과 PC 선택권을 지킨다.`;

const NATURAL_STYLE = String.raw`[NATURAL NPC / SCENE]
- NPC 대사는 설정집 낭독이 아니라 직전 말/행동에 대한 실제 반응이어야 한다.
- 모두가 같은 길이의 완벽한 설명문을 말하지 않는다. 단문, 끊김, 침묵, 반문, 말끝 흐림, 시선·손동작을 캐릭터에 맞게 섞는다.
- 관계가 좋다고 자동 동의/친절, 나쁘다고 자동 적대하지 않는다. 목표·자존심·이해관계가 함께 작동한다.
- 현재 목표가 있으면 그 목표가 말투·선택·접근/회피·다음 행동의 이유로 드러나야 하지만, 물리적 위치·일정·지식·관계보다 우선해 순간이동하거나 억지 등장하지 않는다.
- 한 장면의 NPC가 PC에게 차례대로 한마디씩 설명하는 구조를 피하고 NPC-NPC 반응과 침묵도 허용한다.
- 감정은 해설보다 거리·표정·어휘·행동으로 먼저 보여주고 narration/dialogue 중복을 줄인다.
- '그렇군/흥미롭군/이해했다 → 설명 → 질문' 같은 정형 루프와 매번 질문으로 끝내는 습관을 피한다.
- 눈앞에서 이미 본 사실은 굳이 다시 말로 설명하지 않는다. ROUTINE은 짧고 밀도 있게 진행한다.`;

const COMBAT_RULE = String.raw`[COMBAT INTERNAL VERDICT]
서술 전에 경지·신체·마나·스킬·실전경험·거리·선수권·장비·피로·부상·정보·지형·상성을 내부적으로 비교해 성공/부분성공/실패와 이유를 먼저 정한다. 판정 메모는 출력하지 않는다.`;

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
function memoryText(row){return typeof row==='string'?row:[row?.fact,row?.subject,row?.source,row?.type,row?.status,row?.knowledge_basis].filter(Boolean).join(' ');}
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
  return{version:save?.version,turnNumber:Number(save?.turnNumber||0),world:save?.world||{},pc:compactPc(save?.pc||{},profile.name.includes('important')||profile.name.includes('critical'),text),relationships:rel,intimacyStates:intimacy,npcStates,emotionStates:emotions,npcInnerStates:inner,relevantNpcKeys:keys,activeEvents:relevantEvents,completedEvents:array(save?.completedEvents).slice(-8),pcKnowledge:knowledge,memories:{global:globalMem,npc:npcMem},hooks:array(save?.hooks).filter(x=>!['resolved','expired'].includes(x?.status)&&!x?.event_consequence).slice(-6),scheduledEvents:array(save?.scheduledEvents).filter(x=>!['completed','cancelled'].includes(x?.status)).slice(0,6),director:{lastEventTurn:Number(save?.director?.lastEventTurn||0),lastChoicePressureTurn:Number(save?.director?.lastChoicePressureTurn||0),lastCrossDepartmentTurn:Number(save?.director?.lastCrossDepartmentTurn||0),recentBeats:array(save?.director?.recentBeats).slice(-3),callbacks:array(save?.director?.callbacks).filter(x=>x?.status!=='resolved').slice(-4)},flags:save?.flags||{},sceneRuntime:compactSceneRuntime(save?.sceneRuntime,keywords,text,Object.keys(registry),3,2,recentTexts),backgroundDigest:clampText(save?.backgroundDigest||'',450)};
}
function compactRecent(recentTurns,count){return array(recentTurns).slice(-count).map(t=>({action:clampText(t?.action||'',320),summary:clampText(t?.summary||'',520),importance:t?.importance||null,scene:array(t?.scene).slice(-3).map(i=>({kind:i?.kind,speaker_key:i?.speaker_key||null,expression:i?.display_expression||i?.expression||null,text:clampText(i?.text||'',180)}))}));}
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
function contextSeed(incoming){const save=incoming.saveState||{},last=array(incoming.recentTurns).slice(-1)[0];return[incoming.action,save?.world?.location,save?.pc?.department,clampText(incoming.rollingSummary||'',900),safeJson(save?.sceneRuntime||{}),safeJson(array(save?.scheduleContext?.due).map(x=>({title:x?.title,location:x?.location,time:x?.time}))),last?.summary,array(last?.scene).map(x=>`${x?.speaker_key||''} ${x?.text||''}`).join(' ')].filter(Boolean).join('\n');}
function buildInstructions(original,incoming,profile,originalInput,mode){
  const sec=parseInstructionSections(original),registry=parseRegistry(sec.registry),directorV2=buildEventDirectorV2(incoming,originalInput,registry,mode),orchestration=deriveSceneOrchestrationPlan({action:incoming.action||'',saveState:incoming.saveState||{},mode,directorTelemetry:directorV2?.telemetry,registry}),directorSuppressed=sceneOrchestrationSuppressesDirectorResult(orchestration,directorV2?.telemetry),routingDirectorV2=directorSuppressed?{...directorV2,selectedKey:null,consequenceKeys:[]}:directorV2,seed=contextSeed(incoming),keywords=extractKeywords(seed,36),keys=deriveKeys(incoming,registry,profile.maxNpcs,routingDirectorV2),names=keys.map(k=>registry[k]).filter(Boolean),secretAllowed=secretAccess(incoming,keywords),combat=hasAffirmedActionKeyword(incoming.action||'',COMBAT_RE);
  const world=chooseBlocks(parseBlocks(sec.world),{budget:profile.worldChars,keywords,names,secretAllowed,mode:'world',combat});
  const npc=chooseBlocks(parseBlocks(sec.npc),{budget:profile.npcChars,keywords,names,secretAllowed,mode:'npc'});
  const speech=chooseBlocks(parseBlocks(sec.speech),{budget:profile.speechChars,keywords,names,secretAllowed:false,mode:'speech'});
  const pc=chooseBlocks(parseBlocks(sec.pc),{budget:profile.pcChars,keywords,names,secretAllowed:false,mode:'pc',combat});
  let adult='';if(incoming.adultMode&&Number(incoming.saveState?.pc?.age||0)>=18)adult=clampText(sec.adult,Math.min(1800,profile.speechChars));
  const registryText=Object.entries(registry).map(([k,n])=>`${k}=${n}`).join(', ');
  let text=[ROUTER_GM_RULES,NATURAL_STYLE,ROUTER_NOTE,combat?COMBAT_RULE:'',`===== CHARACTER REGISTRY =====\n${registryText}`,world.text?`===== ROUTED WORLD CANON =====\n${world.text}`:'',npc.text?`===== ROUTED NPC CANON =====\n${npc.text}`:'',speech.text?`===== ROUTED NPC SPEECH =====\n${speech.text}`:'',adult?`===== ROUTED ADULT LAYER =====\n${adult}`:'',pc.text?`===== ROUTED PC SYSTEM =====\n${pc.text}`:''].filter(Boolean).join('\n\n');
  text=clampText(text,profile.instructionChars);return{text,registry,keys,names,keywords,moduleTitles:{world:world.titles,npc:npc.titles,speech:speech.titles,pc:pc.titles,adult:Boolean(adult)},originalChars:sec.originalChars,secretAllowed,directorV2,orchestration};
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
  const action=String(incoming.action||'');
  const recent=compactRecent(incoming.recentTurns,profile.recentTurns),recentFactionTexts=recent.map((turn)=>`${turn.action||''} ${turn.summary||''} ${array(turn.scene).map((item)=>item.text||'').join(' ')}`);
  const routine=profile.name.includes('routine'),registeredNpcKeys=Object.keys(routed.registry),save=compactSave(incoming,routed.keys,routed.registry,profile,routed.keywords,action,recentFactionTexts),opts=clampText(sectionBetween(originalInput,'===== TURN OPTIONS =====','===== AUTHORITATIVE SAVE_STATE ====='),700),schedule=compactSchedule(incoming.saveState||{},routed.keys),runtime={npcInnerStates:Object.fromEntries(routed.keys.filter(k=>incoming.saveState?.npcInnerStates?.[k]).map(k=>[k,compactInnerNpc(incoming.saveState.npcInnerStates[k])])),sceneRuntime:compactSceneRuntime(incoming.saveState?.sceneRuntime,routed.keywords,action,registeredNpcKeys,3,2,recentFactionTexts),backgroundDigest:clampText(incoming.saveState?.backgroundDigest||'',350)},cg=array(incoming.availableCgIds).slice(0,60).join(', '),momentumDirective=clampText(buildSceneMomentumDirective({action,saveState:incoming.saveState||{},registry:routed.registry}),2800),noveltyDirective=clampText(buildSceneNoveltyDirective({action,saveState:incoming.saveState||{},recentTurns:incoming.recentTurns}),900),purposeDirective=clampText(buildScenePurposeDirective({action,saveState:incoming.saveState||{}}),1400),exitDirective=clampText(buildSceneExitDirective({action,saveState:incoming.saveState||{}}),1600),turnHookDirective=clampText(buildTurnHookDirective({action,saveState:incoming.saveState||{}}),900),activeThreads=buildActiveThreadsDirective({action,saveState:incoming.saveState||{},mode,limit:6,maxChars:1150}),activeThreadsDirective=activeThreads.directive;
  const orchestration=routed.orchestration||deriveSceneOrchestrationPlan({action,saveState:incoming.saveState||{},mode,directorTelemetry:routed.directorV2?.telemetry,registry:routed.registry});
  const npcSignificance=deriveNpcSignificanceBoundary({candidateKeys:routed.keys,registry:routed.registry,mode,orchestration});
  const knowledgeBoundary=deriveNpcKnowledgeBoundary({saveState:incoming.saveState||{},npcKeys:routed.keys,registeredNpcKeys,mode});
  const knowledgeBoundaryDirective=buildNpcKnowledgeBoundaryDirective(knowledgeBoundary,{maxChars:320});
  const directorSuppressed=sceneOrchestrationSuppressesDirectorResult(orchestration,routed.directorV2?.telemetry);
  const director=directorSuppressed?'':cleanDirector(originalInput,routine?400:900);
  const directorV2=directorSuppressed?'[EVENT DIRECTOR V2.1]\nRESULT=SUPPRESSED_BY_SCENE_ORCHESTRATION\nSELECTED NPC/후보 지시는 무효다. PRIMARY/SECONDARY만 진행하라.':clampText(routed.directorV2?.directive||'',routine?600:1000);
  const consequenceDirective=directorSuppressed?'':clampText(routed.directorV2?.consequenceDirective||'',1050);
  const orchestrationDirective=clampText(buildSceneOrchestrationDirective({plan:orchestration}),1200);
  const world=object(save.world),pc=object(save.pc),scene=object(save.sceneRuntime);
  const momentum=object(scene.momentum),eventProgress=object(scene.eventProgress),turnHook=normalizeTurnHook(scene.turn_hook);
  const essentialFactionSocial=compactFactionSocialForContext(incoming.saveState?.sceneRuntime?.faction_social,{text:action,recentTexts:recentFactionTexts,keywords:routed.keywords,maxFactions:2,historyLimit:1,registeredNpcKeys});
  const essentialTalents=compactTalents(pc.talents),essentialTraits=compactAbilityMap(pc.traits,false,action),essentialAuthorities=compactAbilityMap(pc.authorities,false,action),essentialAwakening=compactMandatoryAwakeningCandidates(pc.awakeningCandidates);
  const essentialPc=pressureBoundEssentialPc({name:clampText(pc.name||'',80),department:clampText(pc.department||'',100),status:clampText(pc.status||'',160),skills:Object.fromEntries(Object.entries(compactSkills(pc.skills)).map(([key,row])=>[key,{grade:row.grade}])),skillCandidates:compactMandatorySkillCandidates(pc.skillCandidates),...(Object.keys(essentialTalents).length?{talents:essentialTalents}:{}),...(Object.keys(essentialTraits).length?{traits:essentialTraits}:{}),...(Object.keys(essentialAuthorities).length?{authorities:essentialAuthorities}:{}),...(Object.values(essentialAwakening).some((bucket)=>Object.keys(bucket).length)?{awakeningCandidates:essentialAwakening}:{})},action);
  const essentialSave={version:save.version,turnNumber:save.turnNumber,world:{date:world.date||null,...(world.weekday?{weekday:world.weekday}:{}),time:world.time||null,location:clampText(world.location||'',140)},pc:essentialPc,relevantNpcKeys:array(save.relevantNpcKeys).slice(0,4),npcStates:Object.fromEntries(Object.entries(object(save.npcStates)).slice(0,4).map(([key,row])=>[key,{location:clampText(row?.location||'',100),status:clampText(row?.status||row?.state||'',120)}])),sceneRuntime:{participants:array(scene.participants).slice(0,6),purpose:normalizeScenePurpose(scene.purpose),exit_condition:normalizeSceneExitCondition(scene.exit_condition),turn_hook:turnHook?{kind:turnHook.kind,status:turnHook.status,anchor:clampText(turnHook.anchor,140)}:null,momentum:{stall_streak:Number(momentum.stall_streak||0),last_intent:clampText(momentum.last_intent||'',60)},...(scene.timed_action?{timed_action:scene.timed_action}:{}),eventProgress:scene.eventProgress==null?null:{eventInstanceId:clampText(eventProgress.eventInstanceId||'',100),activeBeat:clampText(eventProgress.activeBeat||'',100)},faction_social:Object.keys(essentialFactionSocial.reputations).length?essentialFactionSocial:null}};
  const saveState=`===== AUTHORITATIVE SAVE_STATE (ROUTED MINIMUM) =====\n${safeJson(essentialSave)}`;
  const optionalContext=`===== NPC KNOWLEDGE BOUNDARIES V1 =====\n${knowledgeBoundaryDirective}\n\n===== ACTIVE THREADS V1 =====\n${activeThreadsDirective}\n\n===== TURN OPTIONS =====\n${opts}\n\n===== AUTHORITATIVE SAVE_STATE (ROUTED DETAIL) =====\n${safeJson(save)}\n\n===== ROLLING SUMMARY TAIL =====\n${clampText(incoming.rollingSummary||'아직 없음',1500)}\n\n===== RECENT TURNS =====\n${safeJson(recent)}\n\n===== CURRENT NPC/SCENE RUNTIME =====\n${clampText(runtime,1800)}\n\n===== AVAILABLE_CG_IDS =====\n${cg||'없음'}`;
  const reservedContext=`===== MULTI-SYSTEM SCENE ORCHESTRATION V1 =====\n${orchestrationDirective}\n\n===== SCENE MOMENTUM HF1 =====\n${momentumDirective}${noveltyDirective?`\n\n===== DETERMINISTIC SCENE NOVELTY V1 =====\n${noveltyDirective}`:''}\n\n===== SCENE PURPOSE V1 =====\n${purposeDirective}\n\n===== EXPLICIT SCENE EXIT CONDITION V1 =====\n${exitDirective}\n\n===== STRONGER TURN HOOK V1 =====\n${turnHookDirective}${consequenceDirective?`\n\n===== EVENT CONSEQUENCE V1 =====\n${consequenceDirective}`:''}`;
  const actionFrame=(text)=>`===== USER ACTION =====\n${text}\n\n${sceneOrchestrationActionFrame(orchestration)}\nUSER ACTION의 의미 목표를 압축 완료하고 새 PC 선택 없이 EXIT_TARGET 뒤의 첫 판단점에서 멈춰라. ROUTINE은 변화 중심, 주요 NPC 감정 태그·강도·근거를 일치시켜라.`,fixedSeparators=6,emptyActionFrame=actionFrame(''),scheduledProfile=profile.name.includes('scheduled'),baseAuthorityBudget=routine||scheduledProfile?900:180,desiredAuthorityBudget=baseAuthorityBudget+(noveltyDirective?Math.max(900,noveltyDirective.length):0),continueProfile=profile.name.includes('continue');
  const actionTextBudget=continueProfile?5200:Math.max(0,Math.min(5200,profile.inputChars-saveState.length-reservedContext.length-emptyActionFrame.length-fixedSeparators-desiredAuthorityBudget));
  const actionBlock=actionFrame(clampMiddleText(action,actionTextBudget));
  const authorityBudget=Math.max(0,profile.inputChars-saveState.length-reservedContext.length-actionBlock.length-fixedSeparators);
  const authorityTail=fitAuthorityTail({director,directorV2,schedule,maxChars:authorityBudget,routine});
  return{text:composeRoutedInput({saveState,optionalContext,reservedContext,authorityTail,actionBlock,inputChars:profile.inputChars}),orchestration,activeThreads,npcSignificance,knowledgeBoundary};
}

export function routeOpenAIParams(params,{incoming={},mode='game'}={}){
  if(mode==='meta')return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'meta-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'META keeps full canon',original_chars:String(params?.instructions||'').length+String(params?.input||'').length,routed_chars:String(params?.instructions||'').length+String(params?.input||'').length}};
  const base=classifyProfile(incoming,mode),profile=adjustedProfile(base,incoming),originalInstructions=String(params?.instructions||''),originalInput=String(params?.input||'');
  const required=['===== CHARACTER REGISTRY =====','===== WORLD CANON =====','===== NPC CANON =====','===== NPC SPEECH =====','===== PC SYSTEM ====='];
  if(!required.every(m=>originalInstructions.includes(m)))return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'core prompt markers changed',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length}};
  const routed=buildInstructions(originalInstructions,incoming,profile,originalInput,mode);if(!Object.keys(routed.registry||{}).length)return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'registry parse failed',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length}};
  const built=buildInput(incoming,originalInput,profile,routed,mode),newParams={...params,instructions:routed.text,input:built.text,prompt_cache_key:process.env.OPENAI_PROMPT_CACHE_KEY||'lumensia-stable-context-router-v156-hf1',prompt_cache_retention:'24h'},originalChars=originalInstructions.length+originalInput.length,routedChars=routed.text.length+built.text.length;
  const eventDirectorTelemetry=routed.directorV2?.telemetry||null;
  return{params:newParams,telemetry:{routerVersion:VERSION,enabled:true,profile:profile.name,target_input_tokens:profile.targetTokens,soft_max_tokens:profile.softMaxTokens,adaptive_scale:Number((profile.scale||1).toFixed(3)),instructions_chars:routed.text.length,input_chars:built.text.length,routed_chars:routedChars,original_chars:originalChars,char_reduction_ratio:originalChars>0?Number((1-routedChars/originalChars).toFixed(4)):0,selected_npcs:routed.keys,selected_npc_names:routed.names,canon_modules:routed.moduleTitles,recent_turns:profile.recentTurns,secret_allowed:routed.secretAllowed,event_director_v2:eventDirectorTelemetry,event_director_v3:eventDirectorTelemetry?{...eventDirectorTelemetry,version:DIRECTOR_V3_VERSION,weighted_core_version:DIRECTOR_V2_VERSION}:null,scene_orchestration:built.orchestration,npc_significance_v1:built.npcSignificance,knowledge_boundaries_v1:{version:built.knowledgeBoundary.version,mode:built.knowledgeBoundary.mode,npc_count:Object.keys(built.knowledgeBoundary.npcs||{}).length,present_count:built.knowledgeBoundary.present_npc_keys.length,public_count:built.knowledgeBoundary.public_facts.length,pc_only_count:built.knowledgeBoundary.pc_only_count},active_threads_v1:{version:built.activeThreads.version,mode:built.activeThreads.mode,count:built.activeThreads.threads.length,visible_count:built.activeThreads.visible_threads,top_id:built.activeThreads.threads[0]?.id||null,sources:[...new Set(built.activeThreads.threads.map((thread)=>thread.source))]}}};
}
export function routerVersion(){return VERSION;}
