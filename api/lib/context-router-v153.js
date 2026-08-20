// LUMENSIA V1.5.3 HF1 Context Router
// Strict relevance routing for 15-20K routine/scheduled turns.
// Drop-in replacement for api/lib/context-router-v153.js

const VERSION = '1.5.3-hf1';

const IMPORTANT_RE = /(전투|공격|기습|결투|도망|추적|구출|협상|정치|황위|조사|잠입|권능|부상|치료|판정|대련|시험|고백|배신|의식|각성|성유물|마유물|던전|정령왕)/i;
const CRITICAL_ACTION_RE = /(L5|마신|델피렘|대죄주교|사도|심검|8서클|9서클|국가\s*전략|암살|살해|죽음|치명|대규모|전면전|성유물|마유물)/i;
const COMBAT_RE = /(전투|공격|베어|베고|찌르|쏘|회피|막아|막고|패링|결투|대련|검기|오러|마법을?\s*쏘|주먹|발차기|기습|제압|살해|죽이)/i;
const SECRET_RE = /(L4|L5|비밀|기밀|진실|정체|흑막|마신|델피렘|대죄주교|사도|어비스|심연)/i;

const PROFILES = Object.freeze({
  continue: {
    name:'continue-compact-hf1', targetTokens:11000, softMaxTokens:14000,
    instructionChars:12500, inputChars:7000, worldChars:1800, npcChars:3000, speechChars:1700, pcChars:1800,
    maxNpcs:3, recentTurns:2, memoriesGlobal:4, memoriesPerNpc:3,
  },
  routine: {
    name:'routine-17k-hf1', targetTokens:17000, softMaxTokens:20000,
    instructionChars:17500, inputChars:9000, worldChars:2800, npcChars:4300, speechChars:2400, pcChars:2400,
    maxNpcs:4, recentTurns:2, memoriesGlobal:5, memoriesPerNpc:4,
  },
  scheduled: {
    name:'scheduled-18k-hf1', targetTokens:18000, softMaxTokens:20000,
    instructionChars:18500, inputChars:9500, worldChars:3300, npcChars:4700, speechChars:2500, pcChars:2500,
    maxNpcs:4, recentTurns:3, memoriesGlobal:6, memoriesPerNpc:4,
  },
  important: {
    name:'important-20k-hf1', targetTokens:20000, softMaxTokens:23000,
    instructionChars:21500, inputChars:10500, worldChars:4400, npcChars:5600, speechChars:3000, pcChars:3000,
    maxNpcs:5, recentTurns:3, memoriesGlobal:7, memoriesPerNpc:5,
  },
  critical: {
    name:'critical-24k-hf1', targetTokens:24000, softMaxTokens:30000,
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
13) 제공된 구조화 JSON 스키마만 반환하고 내부 판정 메모/Router 설명은 출력하지 않는다.`;

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
function addExplicitKeys(set,text,registry,limit){const lower=norm(text);for(const [k,n] of Object.entries(registry)){if(set.size>=limit)break;if(lower.includes(k.toLowerCase())||lower.includes(norm(n)))set.add(k);}}
function deriveKeys(incoming,registry,maxNpcs){
  const save=incoming.saveState||{}, set=new Set();
  for(const k of array(save?.sceneRuntime?.participants).slice(0,3))if(registry[k])set.add(String(k));
  addExplicitKeys(set,incoming.action||'',registry,maxNpcs);
  const last=array(incoming.recentTurns).slice(-1)[0];
  for(const item of array(last?.scene).slice(-4)){if(set.size>=maxNpcs)break;if(item?.speaker_key&&registry[item.speaker_key])set.add(String(item.speaker_key));}
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
  const action=String(incoming.action||''); if(!SECRET_RE.test(action))return false;
  const save=incoming.saveState||{}; const evidence=[...array(save.pcKnowledge),...array(save.hooks),...array(save?.memories?.global)].map(x=>norm(memoryText(x))).join('\n');
  if(!evidence.trim())return /L4|L5|델피렘|마신|대죄주교|사도|어비스|심연/i.test(action);
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
  if(save?.flags?.majorScene||CRITICAL_ACTION_RE.test(action))return PROFILES.critical;
  const dueMajor=array(save?.scheduleContext?.due).some(ev=>Number(ev?.importance||0)>=4);
  if(dueMajor)return PROFILES.scheduled;
  if(incoming.proReasoning||IMPORTANT_RE.test(action))return PROFILES.important;
  return PROFILES.routine;
}
function adjustedProfile(base,incoming={}){
  const fb=object(incoming.saveState?.routerFeedback);if(fb.routerVersion!==VERSION||fb.profile!==base.name)return{...base,scale:1};const last=Number(fb.lastInputTokens||0);if(!last||last<=base.softMaxTokens)return{...base,scale:1};const scale=Math.max(.76,Math.min(1,(base.targetTokens*.94)/last));return{...base,scale,instructionChars:Math.floor(base.instructionChars*scale),inputChars:Math.floor(base.inputChars*scale),worldChars:Math.floor(base.worldChars*scale),npcChars:Math.floor(base.npcChars*scale),speechChars:Math.floor(base.speechChars*scale),pcChars:Math.floor(base.pcChars*scale)};
}
function contextSeed(incoming){const save=incoming.saveState||{},last=array(incoming.recentTurns).slice(-1)[0];return[incoming.action,save?.world?.location,save?.pc?.department,clampText(incoming.rollingSummary||'',900),safeJson(save?.sceneRuntime||{}),safeJson(array(save?.scheduleContext?.due).map(x=>({title:x?.title,location:x?.location,time:x?.time}))),last?.summary,array(last?.scene).map(x=>`${x?.speaker_key||''} ${x?.text||''}`).join(' ')].filter(Boolean).join('\n');}
function buildInstructions(original,incoming,profile){
  const sec=parseInstructionSections(original),registry=parseRegistry(sec.registry),seed=contextSeed(incoming),keywords=extractKeywords(seed,36),keys=deriveKeys(incoming,registry,profile.maxNpcs),names=keys.map(k=>registry[k]).filter(Boolean),secretAllowed=secretAccess(incoming,keywords),combat=COMBAT_RE.test(String(incoming.action||''));
  const world=chooseBlocks(parseBlocks(sec.world),{budget:profile.worldChars,keywords,names,secretAllowed,mode:'world',combat});
  const npc=chooseBlocks(parseBlocks(sec.npc),{budget:profile.npcChars,keywords,names,secretAllowed,mode:'npc'});
  const speech=chooseBlocks(parseBlocks(sec.speech),{budget:profile.speechChars,keywords,names,secretAllowed:false,mode:'speech'});
  const pc=chooseBlocks(parseBlocks(sec.pc),{budget:profile.pcChars,keywords,names,secretAllowed:false,mode:'pc',combat});
  let adult='';if(incoming.adultMode&&Number(incoming.saveState?.pc?.age||0)>=18)adult=clampText(sec.adult,Math.min(1800,profile.speechChars));
  const registryText=Object.entries(registry).map(([k,n])=>`${k}=${n}`).join(', ');
  let text=[ROUTER_GM_RULES,NATURAL_STYLE,ROUTER_NOTE,combat?COMBAT_RULE:'',`===== CHARACTER REGISTRY =====\n${registryText}`,world.text?`===== ROUTED WORLD CANON =====\n${world.text}`:'',npc.text?`===== ROUTED NPC CANON =====\n${npc.text}`:'',speech.text?`===== ROUTED NPC SPEECH =====\n${speech.text}`:'',adult?`===== ROUTED ADULT LAYER =====\n${adult}`:'',pc.text?`===== ROUTED PC SYSTEM =====\n${pc.text}`:''].filter(Boolean).join('\n\n');
  text=clampText(text,profile.instructionChars);return{text,registry,keys,names,keywords,moduleTitles:{world:world.titles,npc:npc.titles,speech:speech.titles,pc:pc.titles,adult:Boolean(adult)},originalChars:sec.originalChars,secretAllowed};
}
function cleanDirector(originalInput,limit){
  let d=sectionBetween(originalInput,'===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====','===== SCHEDULE ENGINE (AUTHORITATIVE) =====');
  d=d.split('\n').filter(line=>!/candidate|후보|planCandidates|candidates=/i.test(line)).join('\n');return clampText(d,limit);
}
function buildInput(incoming,originalInput,profile,routed){
  const save=compactSave(incoming,routed.keys,routed.registry,profile,routed.keywords),recent=compactRecent(incoming.recentTurns,profile.recentTurns),opts=clampText(sectionBetween(originalInput,'===== TURN OPTIONS =====','===== AUTHORITATIVE SAVE_STATE ====='),700),director=cleanDirector(originalInput,profile.name.includes('routine')?1000:1400),schedule=compactSchedule(incoming.saveState||{},routed.keys),runtime={npcInnerStates:Object.fromEntries(routed.keys.filter(k=>incoming.saveState?.npcInnerStates?.[k]).map(k=>[k,incoming.saveState.npcInnerStates[k]])),sceneRuntime:incoming.saveState?.sceneRuntime||{},backgroundDigest:clampText(incoming.saveState?.backgroundDigest||'',350)},action=clampText(incoming.action||'',5000),cg=array(incoming.availableCgIds).slice(0,60).join(', ');
  let text=`===== TURN OPTIONS =====\n${opts}\n\n===== AUTHORITATIVE SAVE_STATE (ROUTED) =====\n${safeJson(save)}\n\n===== ROLLING SUMMARY TAIL =====\n${clampText(incoming.rollingSummary||'아직 없음',1500)}\n\n===== RECENT TURNS =====\n${safeJson(recent)}\n\n===== CURRENT NPC/SCENE RUNTIME =====\n${clampText(runtime,1600)}\n\n===== AVAILABLE_CG_IDS =====\n${cg||'없음'}\n\n===== GM EVENT DIRECTOR (ROUTED) =====\n${director||'없음'}\n\n===== SCHEDULE ENGINE (ROUTED) =====\n${safeJson(schedule)}\n\n===== USER ACTION =====\n${action}\n\n위 행동까지만 처리하고 PC의 다음 행동을 정하지 마라. ROUTINE은 빠르게 압축하고 주요 NPC 대사에는 감정 태그/강도/근거를 일치시켜라.`;
  return{text:clampText(text,profile.inputChars)};
}

export function routeOpenAIParams(params,{incoming={},mode='game'}={}){
  if(mode==='meta')return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'meta-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'META keeps full canon',original_chars:String(params?.instructions||'').length+String(params?.input||'').length,routed_chars:String(params?.instructions||'').length+String(params?.input||'').length}};
  const base=classifyProfile(incoming,mode),profile=adjustedProfile(base,incoming),originalInstructions=String(params?.instructions||''),originalInput=String(params?.input||'');
  const required=['===== CHARACTER REGISTRY =====','===== WORLD CANON =====','===== NPC CANON =====','===== NPC SPEECH =====','===== PC SYSTEM ====='];
  if(!required.every(m=>originalInstructions.includes(m)))return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'core prompt markers changed',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length}};
  const routed=buildInstructions(originalInstructions,incoming,profile);if(!Object.keys(routed.registry||{}).length)return{params,telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'registry parse failed',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length}};
  const built=buildInput(incoming,originalInput,profile,routed),newParams={...params,instructions:routed.text,input:built.text,prompt_cache_key:process.env.OPENAI_PROMPT_CACHE_KEY||'lumensia-v153-hf1-context-router',prompt_cache_retention:'24h'},originalChars=originalInstructions.length+originalInput.length,routedChars=routed.text.length+built.text.length;
  return{params:newParams,telemetry:{routerVersion:VERSION,enabled:true,profile:profile.name,target_input_tokens:profile.targetTokens,soft_max_tokens:profile.softMaxTokens,adaptive_scale:Number((profile.scale||1).toFixed(3)),instructions_chars:routed.text.length,input_chars:built.text.length,routed_chars:routedChars,original_chars:originalChars,char_reduction_ratio:originalChars>0?Number((1-routedChars/originalChars).toFixed(4)):0,selected_npcs:routed.keys,selected_npc_names:routed.names,canon_modules:routed.moduleTitles,recent_turns:profile.recentTurns,secret_allowed:routed.secretAllowed}};
}
export function routerVersion(){return VERSION;}
