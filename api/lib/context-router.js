// LUMENSIA V1.5.4 Stable Context Router + Event Director V2
// Preserves V1.5.3 HF1 15-20K relevance budgets.
// Stable path: api/lib/context-router.js

const VERSION = '1.5.4';
const DIRECTOR_V2_VERSION = '2.0';
const DIRECTOR_COOLDOWN_TURNS = 3;

const IMPORTANT_RE = /(전투|공격|기습|결투|도망|추적|구출|협상|정치|황위|조사|잠입|권능|부상|치료|판정|대련|시험|고백|배신|의식|각성|성유물|마유물|던전|정령왕)/i;
const CRITICAL_ACTION_RE = /(L5|마신|델피렘|Delphirem|대죄주교|사도|심검|8서클|9서클|국가\s*전략|암살|살해|죽음|치명|대규모|전면전|성유물|마유물)/i;
const COMBAT_RE = /(전투|공격|베어|베고|찌르|쏘|회피|막아|막고|패링|결투|대련|검기|오러|마법을?\s*쏘|주먹|발차기|기습|제압|살해|죽이)/i;
const SECRET_RE = /(L4|L5|비밀|기밀|진실|정체|흑막|마신|델피렘|Delphirem|대죄주교|사도|어비스|심연)/i;

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
1) PC의 행동·대사·감정·생각·의도·수락/거절을 대신 확정하지 않는다. 사용자가 선언한 행동까지만 처리한다.
2) 동적 사실은 AUTHORITATIVE SAVE_STATE가 최우선이다. 선택 제공된 CANON과 충돌하면 SAVE_STATE의 현재값을 따른다.
3) Context Router가 무관한 CANON을 생략할 수 있다. 제공되지 않은 세부설정을 즉흥 창작하지 말고 보수적으로 처리한다.
4) NPC는 자기 일정·목표·지식·관계·말투를 가진 독립 인물이다. 모두가 PC 중심으로 움직이지 않는다.
5) NPC는 실제로 아는 정보만 사용한다. L4~L5/비밀/메타정보를 정당한 발견 없이 PC나 일반 NPC 지식으로 쓰지 않는다.
6) 시도는 자동 성공하지 않는다. 전투·판정은 능력, 준비, 정보, 경험, 상성, 거리, 타이밍, 지형, 피로, 부상, 심리를 종합한다.
7) 성장·스킬 경험은 실제 훈련·실전·실패·교정·통찰이 있을 때만 천천히 누적한다. 즉흥 각성/스킬/혈통/유물 생성 금지.
8) 관계는 실제 사건으로 서서히 변한다. state_delta에는 실제 발생한 변화만 기록한다.
9) 시간·학사일정·세계 사건은 PC를 기다리지 않지만 일정 때문에 PC 행동을 강제로 결정하지 않는다.
10) 등록 NPC speaker_key는 CHARACTER REGISTRY의 정확한 키만 쓴다. 단역은 speaker_key=null과 표시명 사용.
11) choices는 PC 선택이 실제로 필요한 지점에서만 정확히 3개, 아니면 빈 배열.
12) scene_summary는 장기적으로 유용한 사실을 1~4문장으로 압축한다.
13) USER ACTION의 긍정형 직접 선언은 이번 턴에 확정된 행동/대사다. 생각·의도로 되돌리지 말고 시도와 즉각적인 반응을 처리한다. 단, 명시적으로 부정·거절되었거나 하지 않겠다고 한 행동, 가정·질문·조건으로만 언급된 행동은 확정 행동이 아니므로 실행하지 않는다.
14) USER ACTION 원문 전체를 반영한다. 서로 충돌하지 않는 선언을 생략하지 않되 성공 여부와 결과는 능력·상황·판정에 따른다.
15) 제공된 구조화 JSON 스키마만 반환하고 내부 판정 메모/Router 설명은 출력하지 않는다.
16) event_progress는 현재 논리적 이벤트 occurrence의 compact 진행 상태다. event_instance_id는 제공된 schedule/Event Director occurrence ID를 우선하고 event/beat ID는 안정된 짧은 영문 소문자로 쓴다. 명확히 끝난 beat만 completed_beats에 추가한다. AUTHORITATIVE SAVE_STATE.sceneRuntime.eventProgress의 완료 beat는 언급·회상할 수 있지만 현재 행동으로 재실행하거나 active로 되돌리지 않는다. 같은 occurrence에서는 완료 목록을 줄이거나 누락하지 말고 완료 뒤로 전진하며, 새 occurrence가 실제 시작되면 그 ID로 교체한다. 이벤트가 끝났거나 구조화할 활성 이벤트가 없으면 event_progress=null이다.`;

const NATURAL_STYLE = String.raw`[NATURAL NPC / SCENE]
- NPC 대사는 설정집 낭독이 아니라 직전 말/행동에 대한 실제 반응이어야 한다.
- 모두가 같은 길이의 완벽한 설명문을 말하지 않는다. 단문, 끊김, 침묵, 반문, 말끝 흐림, 시선·손동작을 캐릭터에 맞게 섞는다.
- 관계가 좋다고 자동 동의/친절, 나쁘다고 자동 적대하지 않는다. 목표·자존심·이해관계가 함께 작동한다.
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
function buildEventDirectorV2(incoming,originalInput,registry,mode='game'){
  const save=incoming.saveState||{}, plan=parseDirectorV2Guidance(originalInput), turn=Number(save.turnNumber||0);
  const seedRaw=String(save?.director?.rngSeed||save?.directorSeed||save?.id||`${save?.pc?.name||'pc'}|${save?.pc?.origin||''}|legacy`);
  const seedBase=`${seedRaw}|T${turn}|${save?.world?.date||''}|${save?.world?.time||''}|${save?.world?.location||''}`;
  const seedTag=hash32(seedRaw).toString(16).padStart(8,'0').slice(0,8);
  const base={version:DIRECTOR_V2_VERSION,seed_tag:seedTag,cooldown_turns:DIRECTOR_COOLDOWN_TURNS,intervention:plan.intervention,routine_streak:plan.routineStreak,event_gap:plan.eventGap,selected_key:null,selected_name:null,event_style:'none',eligible_keys:[],roll:null,none_weight:null,result:'NO_ROLL',mode:'fixed-flow'};
  const fixedDirective=(reason)=>({telemetry:{...base,result:reason},selectedKey:null,directive:`[EVENT DIRECTOR V2]\nMODE=FIXED_FLOW\n${reason}. 기존 일정·사용자 직접 행동·진행 중인 훅을 우선하고, 이 지시 때문에 새 우연 사건을 추가하지 마라.`});
  if(['meta','continue','auto'].includes(mode))return fixedDirective(`RNG_DISABLED_${mode.toUpperCase()}`);
  const explicit=mentionedNpcKeys(incoming.action||'',registry);
  if(explicit.length||plan.focused.length)return fixedDirective('DIRECT_USER_FOCUS');
  if(plan.payoffDue||plan.callbacks)return fixedDirective('CALLBACK_PRIORITY');

  const scheduled=plan.intervention==='scheduled';
  const medium=plan.intervention==='medium'&&(plan.routineStreak>=2||plan.eventGap>=3||plan.crossDue);
  if(!scheduled&&!medium)return fixedDirective('NO_RANDOM_EVENT_DUE');

  const exposure=object(save?.director?.npcExposure),recent=recentSpeakerCountsV2(incoming.recentTurns),present=new Set(array(save?.sceneRuntime?.participants).map(String));
  const dueFixed=new Set(array(save?.scheduleContext?.due).flatMap(ev=>array(ev?.participants)).map(String));
  let pool=plan.candidates.filter(c=>registry[c.key]);
  // Surprise/cameo cooldown: no repeat within 3 turns unless that NPC is part of the fixed due schedule.
  pool=pool.filter(c=>{
    if(dueFixed.has(c.key))return false; // fixed schedule participants are handled by the schedule itself, never by the random side slot
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
    return{...c,weight:scoreWeight*freshness*penalty};
  });
  // "Nothing happens" is intentionally part of the weighted pool.
  const noneWeight=scheduled?Math.max(24,rows.reduce((n,x)=>n+x.weight,0)*1.15):Math.max(6,22-plan.eventGap*2-plan.routineStreak*2);
  const weighted=[{key:null,name:null,weight:noneWeight},...rows];
  const roll=rng01(`${seedBase}|pick`),picked=weightedChoice(weighted,roll);
  const eventMode=scheduled?'scheduled-side-roll':'weighted-random';
  if(!picked?.key){
    const telemetry={...base,mode:eventMode,result:'NO_EVENT',eligible_keys:rows.map(x=>x.key),roll:Number(roll.toFixed(4)),none_weight:Number(noneWeight.toFixed(2))};
    return{telemetry,selectedKey:null,directive:`[EVENT DIRECTOR V2 — SEEDED WEIGHTED VARIATION]\nMODE=${eventMode}\nRESULT=NO_EVENT\n이번 턴에는 새 우연 조우/마찰/카메오를 추가하지 마라. 고정 일정과 현재 장면만 자연스럽게 진행한다.`};
  }
  const style=eventStyleFor(seedBase,eventMode);
  const occurrenceId=`director:${save?.world?.date||'undated'}:t${turn}:${picked.key}`.toLowerCase();
  const telemetry={...base,mode:eventMode,result:'NPC_EVENT',occurrence_id:occurrenceId,selected_key:picked.key,selected_name:registry[picked.key]||picked.name,event_style:style,eligible_keys:rows.map(x=>x.key),roll:Number(roll.toFixed(4)),none_weight:Number(noneWeight.toFixed(2)),weights:Object.fromEntries(rows.map(x=>[x.key,Number(x.weight.toFixed(2))]))};
  const directive=`[EVENT DIRECTOR V2 — SEEDED WEIGHTED VARIATION]\nMODE=${eventMode}\nRESULT=NPC_EVENT\nEVENT_INSTANCE_ID=${occurrenceId}\nSELECTED=${picked.key}(${registry[picked.key]||picked.name})\nSTYLE=${style}\n- 고정 일정, 사용자의 직접 행동, 기존 훅이 항상 우선한다.\n- 물리적 위치/일정상 자연스러울 때만 선택 NPC를 작은 접점에 사용한다. 불가능하면 순간이동시키지 말고 NO_EVENT처럼 처리한다.\n- 이 랜덤 슬롯은 작은 조우·마찰·관찰·공개 정보·사소한 실무 문제 수준이다. 새 대형 사건, 새 비밀, 새 능력, 중상, 강제 관계변화는 만들지 않는다.\n- 선택 NPC가 등장해도 PC에게 자동 관심/호감을 주지 않는다.`;
  return{telemetry,selectedKey:picked.key,directive};
}

function addExplicitKeys(set,text,registry,limit){for(const key of mentionedNpcKeys(text,registry)){if(set.size>=limit)break;set.add(key);}}
function deriveKeys(incoming,registry,maxNpcs,directorV2=null){
  const save=incoming.saveState||{}, set=new Set();
  const authoritative=array(save?.sceneRuntime?.participants).map(String), present=new Set(authoritative);
  const last=array(incoming.recentTurns).slice(-1)[0], latestSpeaker=[...array(last?.scene)].reverse().find(item=>item?.speaker_key)?.speaker_key;
  if(latestSpeaker&&present.has(String(latestSpeaker))&&registry[latestSpeaker])set.add(String(latestSpeaker));
  if(directorV2?.selectedKey&&registry[directorV2.selectedKey]&&set.size<maxNpcs)set.add(String(directorV2.selectedKey));
  addExplicitKeys(set,incoming.action||'',registry,maxNpcs);
  for(const k of array(save?.scheduleContext?.due).flatMap(ev=>array(ev?.participants)))if(set.size<maxNpcs&&registry[k])set.add(String(k));
  for(const k of authoritative)if(set.size<maxNpcs&&registry[k])set.add(String(k));
  // Once runtime presence exists it is authoritative; speaker history is context, not physical presence.
  if(!Object.hasOwn(object(save?.sceneRuntime),'participants'))for(const item of array(last?.scene).slice(-4)){if(set.size>=maxNpcs)break;if(item?.speaker_key&&registry[item.speaker_key])set.add(String(item.speaker_key));}
  for(const row of array(save?.director?.recentSpotlights).slice(-1)){for(const k of array(row?.keys).slice(0,2)){if(set.size>=maxNpcs)break;if(registry[k])set.add(String(k));}}
  // Large ceremonies often list the whole class. Never treat every attendee as context-relevant.
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
function compactPc(pc={},important=false){const out={...object(pc)};if('characterSetting'in out)out.characterSetting=clampText(out.characterSetting||'',important?1700:1100);if('appearance'in out)out.appearance=clampText(out.appearance||'',350);if(Array.isArray(out.inventory))out.inventory=out.inventory.slice(0,18);if(out.skills&&typeof out.skills==='object')out.skills=Object.fromEntries(Object.entries(out.skills).slice(0,24));return out;}
function compactSchedule(save,keys){
  const sc=object(save?.scheduleContext), selected=new Set(keys); const clean=(ev)=>({...ev,participants:array(ev?.participants).filter(k=>selected.has(k)).slice(0,4)});
  const npc={};for(const k of keys)if(sc?.npc_schedule?.[k])npc[k]=sc.npc_schedule[k];
  return{due:array(sc.due).slice(0,4).map(clean),upcoming:array(sc.upcoming).slice(0,5).map(clean),npc_schedule:npc};
}
function compactSave(incoming,keys,registry,profile,keywords){
  const save=incoming.saveState||{},names=keys.map(k=>registry[k]).filter(Boolean),rel={},intimacy={},npcStates={},emotions={},inner={},npcMem={};
  for(const k of keys){if(save?.relationships?.[k]!=null)rel[k]=save.relationships[k];if(save?.intimacyStates?.[k]!=null)intimacy[k]=save.intimacyStates[k];if(save?.npcStates?.[k]!=null)npcStates[k]=save.npcStates[k];if(save?.emotionStates?.[k]!=null)emotions[k]=save.emotionStates[k];if(save?.npcInnerStates?.[k]!=null)inner[k]=save.npcInnerStates[k];if(save?.memories?.npc?.[k])npcMem[k]=selectMemories(save.memories.npc[k],keywords,names,profile.memoriesPerNpc);}
  const globalMem=selectMemories(save?.memories?.global,keywords,names,profile.memoriesGlobal);
  const knowledge=selectMemories(array(save?.pcKnowledge).map(x=>typeof x==='string'?{fact:x,importance:2}:x),keywords,names,Math.max(6,profile.memoriesGlobal)).map(x=>x?.fact||x);
  const relevantEvents=array(save?.activeEvents).filter(ev=>{const t=norm(ev);return keywords.some(k=>k.length>=2&&t.includes(k));}).slice(0,6);
  return{version:save?.version,turnNumber:Number(save?.turnNumber||0),world:save?.world||{},pc:compactPc(save?.pc||{},profile.name.includes('important')||profile.name.includes('critical')),relationships:rel,intimacyStates:intimacy,npcStates,emotionStates:emotions,npcInnerStates:inner,relevantNpcKeys:keys,activeEvents:relevantEvents,completedEvents:array(save?.completedEvents).slice(-8),pcKnowledge:knowledge,memories:{global:globalMem,npc:npcMem},hooks:array(save?.hooks).filter(x=>!['resolved','expired'].includes(x?.status)).slice(-6),scheduledEvents:array(save?.scheduledEvents).filter(x=>!['completed','cancelled'].includes(x?.status)).slice(0,6),director:{lastEventTurn:Number(save?.director?.lastEventTurn||0),lastChoicePressureTurn:Number(save?.director?.lastChoicePressureTurn||0),lastCrossDepartmentTurn:Number(save?.director?.lastCrossDepartmentTurn||0),recentBeats:array(save?.director?.recentBeats).slice(-3),callbacks:array(save?.director?.callbacks).filter(x=>x?.status!=='resolved').slice(-4)},flags:save?.flags||{},sceneRuntime:save?.sceneRuntime||{},backgroundDigest:clampText(save?.backgroundDigest||'',450)};
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
  const sec=parseInstructionSections(original),registry=parseRegistry(sec.registry),directorV2=buildEventDirectorV2(incoming,originalInput,registry,mode),seed=contextSeed(incoming),keywords=extractKeywords(seed,36),keys=deriveKeys(incoming,registry,profile.maxNpcs,directorV2),names=keys.map(k=>registry[k]).filter(Boolean),secretAllowed=secretAccess(incoming,keywords),combat=hasAffirmedActionKeyword(incoming.action||'',COMBAT_RE);
  const world=chooseBlocks(parseBlocks(sec.world),{budget:profile.worldChars,keywords,names,secretAllowed,mode:'world',combat});
  const npc=chooseBlocks(parseBlocks(sec.npc),{budget:profile.npcChars,keywords,names,secretAllowed,mode:'npc'});
  const speech=chooseBlocks(parseBlocks(sec.speech),{budget:profile.speechChars,keywords,names,secretAllowed:false,mode:'speech'});
  const pc=chooseBlocks(parseBlocks(sec.pc),{budget:profile.pcChars,keywords,names,secretAllowed:false,mode:'pc',combat});
  let adult='';if(incoming.adultMode&&Number(incoming.saveState?.pc?.age||0)>=18)adult=clampText(sec.adult,Math.min(1800,profile.speechChars));
  const registryText=Object.entries(registry).map(([k,n])=>`${k}=${n}`).join(', ');
  let text=[ROUTER_GM_RULES,NATURAL_STYLE,ROUTER_NOTE,combat?COMBAT_RULE:'',`===== CHARACTER REGISTRY =====\n${registryText}`,world.text?`===== ROUTED WORLD CANON =====\n${world.text}`:'',npc.text?`===== ROUTED NPC CANON =====\n${npc.text}`:'',speech.text?`===== ROUTED NPC SPEECH =====\n${speech.text}`:'',adult?`===== ROUTED ADULT LAYER =====\n${adult}`:'',pc.text?`===== ROUTED PC SYSTEM =====\n${pc.text}`:''].filter(Boolean).join('\n\n');
  text=clampText(text,profile.instructionChars);return{text,registry,keys,names,keywords,moduleTitles:{world:world.titles,npc:npc.titles,speech:speech.titles,pc:pc.titles,adult:Boolean(adult)},originalChars:sec.originalChars,secretAllowed,directorV2};
}
function cleanDirector(originalInput,limit){
  let d=sectionBetween(originalInput,'===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====','===== SCHEDULE ENGINE (AUTHORITATIVE) =====');
  d=d.split('\n').filter(line=>!/candidate|후보|planCandidates|candidates=/i.test(line)).join('\n');return clampText(d,limit);
}
function buildInput(incoming,originalInput,profile,routed){
  const save=compactSave(incoming,routed.keys,routed.registry,profile,routed.keywords),recent=compactRecent(incoming.recentTurns,profile.recentTurns),opts=clampText(sectionBetween(originalInput,'===== TURN OPTIONS =====','===== AUTHORITATIVE SAVE_STATE ====='),700),director=cleanDirector(originalInput,profile.name.includes('routine')?650:900),directorV2=clampText(routed.directorV2?.directive||'',850),schedule=compactSchedule(incoming.saveState||{},routed.keys),runtime={npcInnerStates:Object.fromEntries(routed.keys.filter(k=>incoming.saveState?.npcInnerStates?.[k]).map(k=>[k,incoming.saveState.npcInnerStates[k]])),sceneRuntime:incoming.saveState?.sceneRuntime||{},backgroundDigest:clampText(incoming.saveState?.backgroundDigest||'',350)},action=String(incoming.action||''),cg=array(incoming.availableCgIds).slice(0,60).join(', ');
  const variableContext=`===== TURN OPTIONS =====\n${opts}\n\n===== AUTHORITATIVE SAVE_STATE (ROUTED) =====\n${safeJson(save)}\n\n===== ROLLING SUMMARY TAIL =====\n${clampText(incoming.rollingSummary||'아직 없음',1500)}\n\n===== RECENT TURNS =====\n${safeJson(recent)}\n\n===== CURRENT NPC/SCENE RUNTIME =====\n${clampText(runtime,1600)}\n\n===== AVAILABLE_CG_IDS =====\n${cg||'없음'}\n\n===== GM EVENT DIRECTOR (ROUTED) =====\n${director||'없음'}\n\n===== EVENT DIRECTOR V2 (ROUTED) =====\n${directorV2||'없음'}\n\n===== SCHEDULE ENGINE (ROUTED) =====\n${safeJson(schedule)}`;
  const actionBlock=`===== USER ACTION =====\n${action}\n\n위 행동까지만 처리하고 PC의 다음 행동을 정하지 마라. ROUTINE은 빠르게 압축하고 주요 NPC 대사에는 감정 태그/강도/근거를 일치시켜라.`;
  const variableBudget=Math.max(0,profile.inputChars-actionBlock.length-2);
  return{text:`${clampText(variableContext,variableBudget)}\n\n${actionBlock}`};
}

export function routeOpenAIParams(params,{incoming={},mode='game'}={}){
  if(mode==='meta')return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'meta-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'META keeps full canon',original_chars:String(params?.instructions||'').length+String(params?.input||'').length,routed_chars:String(params?.instructions||'').length+String(params?.input||'').length}};
  const base=classifyProfile(incoming,mode),profile=adjustedProfile(base,incoming),originalInstructions=String(params?.instructions||''),originalInput=String(params?.input||'');
  const required=['===== CHARACTER REGISTRY =====','===== WORLD CANON =====','===== NPC CANON =====','===== NPC SPEECH =====','===== PC SYSTEM ====='];
  if(!required.every(m=>originalInstructions.includes(m)))return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'core prompt markers changed',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length}};
  const routed=buildInstructions(originalInstructions,incoming,profile,originalInput,mode);if(!Object.keys(routed.registry||{}).length)return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'registry parse failed',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length}};
  const built=buildInput(incoming,originalInput,profile,routed),newParams={...params,instructions:routed.text,input:built.text,prompt_cache_key:process.env.OPENAI_PROMPT_CACHE_KEY||'lumensia-stable-context-router-v154',prompt_cache_retention:'24h'},originalChars=originalInstructions.length+originalInput.length,routedChars=routed.text.length+built.text.length;
  return{params:newParams,telemetry:{routerVersion:VERSION,enabled:true,profile:profile.name,target_input_tokens:profile.targetTokens,soft_max_tokens:profile.softMaxTokens,adaptive_scale:Number((profile.scale||1).toFixed(3)),instructions_chars:routed.text.length,input_chars:built.text.length,routed_chars:routedChars,original_chars:originalChars,char_reduction_ratio:originalChars>0?Number((1-routedChars/originalChars).toFixed(4)):0,selected_npcs:routed.keys,selected_npc_names:routed.names,canon_modules:routed.moduleTitles,recent_turns:profile.recentTurns,secret_allowed:routed.secretAllowed,event_director_v2:routed.directorV2?.telemetry||null}};
}
export function routerVersion(){return VERSION;}
