// LUMENSIA V1.5.3 Context Router
// Pure server-side prompt compaction. No model calls.

const VERSION = '1.5.3';

const IMPORTANT_RE = /(전투|공격|기습|결투|살해|죽음|도망|추적|구출|협상|정치|황위|비밀|조사|잠입|권능|사도|대죄주교|마신|심연|부상|치료|판정|대련|시험|고백|배신|의식|L4|L5|각성|성유물|마유물|던전|정령왕)/i;
const CRITICAL_RE = /(L5|마신|델피렘|대죄주교|사도|심검|8서클|9서클|국가\s*전략|황위|암살|살해|죽음|치명|대규모|전면전|성유물|마유물)/i;
const COMBAT_RE = /(전투|공격|베어|베고|찌르|쏘|회피|막아|막고|패링|결투|대련|검기|오러|마법을?\s*쏘|주먹|발차기|기습|제압|살해|죽이)/i;
const SECRET_RE = /(L4|L5|비밀|기밀|진실|정체|흑막|마신|델피렘|대죄주교|사도|어비스|심연)/i;

const PROFILES = Object.freeze({
  continue: {
    name: 'continue-compact', targetTokens: 12000, softMaxTokens: 15000,
    instructionChars: 15000, inputChars: 8500,
    worldChars: 2500, npcChars: 4500, speechChars: 2200, pcChars: 2200,
    maxNpcs: 3, recentTurns: 2, memoriesGlobal: 5, memoriesPerNpc: 4,
  },
  routine: {
    name: 'routine-18k', targetTokens: 18000, softMaxTokens: 20000,
    instructionChars: 20500, inputChars: 11500,
    worldChars: 3600, npcChars: 6500, speechChars: 3200, pcChars: 3000,
    maxNpcs: 4, recentTurns: 3, memoriesGlobal: 7, memoriesPerNpc: 5,
  },
  important: {
    name: 'important-20k', targetTokens: 20000, softMaxTokens: 23000,
    instructionChars: 24500, inputChars: 13500,
    worldChars: 5200, npcChars: 8000, speechChars: 4000, pcChars: 3800,
    maxNpcs: 6, recentTurns: 4, memoriesGlobal: 9, memoriesPerNpc: 6,
  },
  critical: {
    name: 'critical-expand', targetTokens: 24000, softMaxTokens: 30000,
    instructionChars: 33000, inputChars: 17000,
    worldChars: 8500, npcChars: 11000, speechChars: 5200, pcChars: 5200,
    maxNpcs: 8, recentTurns: 5, memoriesGlobal: 12, memoriesPerNpc: 7,
  },
});

const ROUTER_GM_RULES = String.raw`너는 판타지 아카데미 장기 RPG 「루멘시아 아카데미」의 GM이자 독립적으로 움직이는 세계 시뮬레이터다.
절대 규칙:
1) PC의 행동·대사·감정·생각·의도·수락/거절을 대신 확정하지 않는다. 사용자가 선언한 행동까지만 처리한다.
2) 동적 사실은 AUTHORITATIVE SAVE_STATE가 최우선이다. 아래에 선택적으로 제공된 CANON과 충돌하면 SAVE_STATE의 현재값을 따른다.
3) 라우터가 이번 턴과 무관한 CANON을 생략했을 수 있다. 제공되지 않은 세부설정을 즉흥 창작하지 말고 보수적으로 처리한다.
4) NPC는 자기 일정·목표·지식·관계·말투를 가진 독립 인물이다. 모든 NPC가 PC를 좋아하거나 PC 중심으로 움직이지 않는다.
5) NPC는 자신이 실제로 아는 정보만 사용한다. L4~L5/비밀/메타정보를 정당한 발견 없이 PC나 일반 NPC 지식으로 쓰지 않는다.
6) 시도는 자동 성공하지 않는다. 전투·판정은 능력, 준비, 정보, 경험, 상성, 거리, 타이밍, 지형, 피로, 부상, 심리를 종합한다. 강약을 억지 평준화하지 않는다.
7) 성장·스킬 경험은 실제 훈련·실전·실패·교정·통찰이 있을 때만 천천히 누적한다. 즉흥 각성/스킬/혈통/유물 생성 금지.
8) 관계는 실제 사건으로 서서히 변한다. relationship_changes에는 원인(cause), 드러난 반응(expression), 다음에 남을 변화(followup)를 일치시킨다.
9) 시간·학사일정·세계 사건은 PC를 기다리지 않지만, 일정 때문에 PC의 행동을 강제로 결정하지 않는다.
10) state_delta에는 실제 발생한 변화만 기록한다. memories_add는 다음 턴 이후에도 기억할 구체적 사실만 저장하고 FACT/BELIEF/RUMOR/SECRET을 구분한다.
11) 등록 NPC speaker_key는 CHARACTER REGISTRY의 정확한 키만 쓴다. 단역은 speaker_key=null과 표시명 사용.
12) choices는 PC 선택이 실제로 필요한 지점에서만 정확히 3개, 아니면 빈 배열. 자유행동 가능성을 유지한다.
13) scene_summary는 이번 턴의 장기적으로 유용한 사실을 1~4문장으로 압축한다.
14) 제공된 구조화 JSON 스키마만 반환한다. 내부 판정 메모나 Context Router 설명을 출력하지 않는다.`;

const NATURAL_STYLE = String.raw`[NATURAL NPC / SCENE]
- NPC 대사는 설정집 낭독이 아니라 직전 말/행동에 대한 실제 반응이어야 한다.
- 모두가 같은 길이의 완벽한 설명문을 말하지 않는다. 단문, 끊김, 침묵, 반문, 말끝 흐림, 시선·손동작을 캐릭터에 맞게 섞는다.
- 관계가 좋다고 자동 동의/친절, 나쁘다고 자동 적대하지 않는다. 목표·자존심·이해관계가 함께 작동한다.
- 한 장면의 NPC가 PC에게 차례대로 한마디씩 설명하는 구조를 피하고 NPC-NPC 반응과 침묵도 허용한다.
- 감정은 먼저 해설하지 말고 거리·표정·어휘·말의 속도·행동으로 보여준다. narration과 dialogue의 중복을 줄인다.
- '그렇군/흥미롭군/이해했다 → 설명 → 질문' 같은 정형 루프와 매번 질문으로 끝내는 습관을 피한다.
- 눈앞에서 이미 본 사실은 굳이 다시 말로 설명하지 않는다.
- ROUTINE은 짧고 밀도 있게. 갈등·대화·전투·중요 사건일 때만 필요한 만큼 확대한다.`;

const COMBAT_RULE = String.raw`[COMBAT INTERNAL VERDICT]
서술 전에 경지·신체·마나·스킬·실전경험·거리·선수권·장비·피로·부상·정보·지형·상성을 내부적으로 비교해 성공/부분성공/실패와 이유를 먼저 정한다. 판정 메모는 출력하지 않고 결과 묘사와 state_delta만 일치시킨다.`;

const ROUTER_NOTE = String.raw`[CONTEXT ROUTER]
이번 요청에는 현재 장면에 관련도가 높은 CANON만 선택 제공된다. 생략된 설정은 폐기/변경된 것이 아니다. 필요한 세부가 현재 컨텍스트에 없으면 새 사실을 만들어 메우지 말고 기존 SAVE_STATE와 제공된 CANON 범위에서 보수적으로 진행한다.`;

const STOP_WORDS = new Set([
  '그리고','그러나','그래서','하지만','이번','현재','지금','그냥','대한','있는','없는','한다','했다','하게','에게','에서','으로','까지','같은','정도','장면','행동','대사','사용자','플레이어','캐릭터','루멘시아','아카데미','the','and','with','this','that','from','turn','scene','action'
]);

export function array(value) { return Array.isArray(value) ? value : []; }
export function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
export function clampText(value, max = 1200) {
  let text;
  try { text = typeof value === 'string' ? value : JSON.stringify(value ?? null); }
  catch { text = String(value ?? ''); }
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}
function uniq(values) { return [...new Set(array(values).filter(Boolean))]; }
function safeJson(value) { try { return JSON.stringify(value ?? null); } catch { return '{}'; } }
function normalizeText(value) { return String(value || '').toLowerCase(); }

function extractKeywords(text = '', max = 36) {
  const tokens = normalizeText(text).match(/[가-힣a-z0-9_]{2,}/g) || [];
  const counts = new Map();
  for (const token of tokens) {
    if (STOP_WORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1] || b[0].length-a[0].length).slice(0,max).map(([k])=>k);
}

function sectionBetween(text, marker, nextMarker = null) {
  const src = String(text || '');
  const start = src.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = start + marker.length;
  const end = nextMarker ? src.indexOf(nextMarker, bodyStart) : -1;
  return src.slice(bodyStart, end >= 0 ? end : src.length).trim();
}

function parseInstructionSections(instructions = '') {
  const src = String(instructions || '');
  const M = {
    style:'===== GM STYLE CANON V4 =====', registry:'===== CHARACTER REGISTRY =====', world:'===== WORLD CANON =====',
    npc:'===== NPC CANON =====', speech:'===== NPC SPEECH =====', adult:'===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====',
    pc:'===== PC SYSTEM =====', current:'===== INITIAL CURRENT STATE =====',
  };
  return {
    originalChars: src.length,
    originalPrefix: src.slice(0, Math.max(0, src.indexOf(M.style))).trim(),
    style: sectionBetween(src,M.style,M.registry),
    registry: sectionBetween(src,M.registry,M.world),
    world: sectionBetween(src,M.world,M.npc),
    npc: sectionBetween(src,M.npc,M.speech),
    speech: sectionBetween(src,M.speech,M.adult),
    adult: sectionBetween(src,M.adult,M.pc),
    pc: sectionBetween(src,M.pc,M.current),
    current: sectionBetween(src,M.current,null),
  };
}

function parseRegistry(text = '') {
  const map = {};
  for (const match of String(text).matchAll(/\b([a-z][a-z0-9_]*)=([^,\n]+)/gi)) {
    map[match[1].trim()] = match[2].trim();
  }
  return map;
}

function parseCanonBlocks(section = '') {
  const src = String(section || '').replace(/\r/g,'');
  const out = [];
  const re = /={20,}\n([^\n]+)\n={20,}\n([\s\S]*?)(?=\n={20,}\n|$)/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({ title:m[1].trim(), body:m[2].trim(), text:`${m[1].trim()}\n${m[2].trim()}`.trim() });
  }
  if (!out.length && src.trim()) out.push({ title:'section', body:src.trim(), text:src.trim() });
  return out;
}

function scoreBlock(block, keywords, selectedNames = []) {
  const title = normalizeText(block.title);
  const text = normalizeText(block.text);
  let score = 0;
  for (const name of selectedNames) {
    const n = normalizeText(name);
    if (!n) continue;
    if (title.includes(n)) score += 60;
    else if (text.includes(n)) score += 8;
  }
  for (const kw of keywords) {
    if (title.includes(kw)) score += 10;
    else if (text.includes(kw)) score += 2;
  }
  if (/관계망|관계|relationship/.test(title)) score += selectedNames.filter(n=>text.includes(normalizeText(n))).length * 7;
  return score;
}

function pickBlocks(section, { keywords = [], selectedNames = [], budget = 4000, baseCount = 0, secretAllowed = false, preferredTitle = null } = {}) {
  const blocks = parseCanonBlocks(section);
  if (!blocks.length || budget <= 0) return { text:'', titles:[] };
  const scored = blocks.map((block,index)=>({ block,index,score:scoreBlock(block,keywords,selectedNames) }));
  for (let i=0;i<Math.min(baseCount,scored.length);i++) scored[i].score += 24 - i;
  if (preferredTitle) for (const row of scored) if (preferredTitle.test(row.block.title)) row.score += 25;
  scored.sort((a,b)=>b.score-a.score || a.index-b.index);
  const chosen = [];
  let used = 0;
  for (const row of scored) {
    if (row.score <= 0 && chosen.length >= baseCount) continue;
    if (!secretAllowed && /(L5|5단계\s*비밀|비밀\s*관계|극비)/i.test(row.block.title)) continue;
    const text = row.block.text;
    const allowance = budget - used;
    if (allowance <= 120) break;
    const clipped = clampText(text, allowance);
    chosen.push({ index:row.index, title:row.block.title, text:clipped });
    used += clipped.length + 2;
    if (used >= budget) break;
  }
  chosen.sort((a,b)=>a.index-b.index);
  return { text:chosen.map(x=>x.text).join('\n\n'), titles:chosen.map(x=>x.title) };
}

function contextText(incoming = {}, originalInput = '') {
  const save = incoming.saveState || {};
  const recent = array(incoming.recentTurns).slice(-3);
  return [
    incoming.action,
    save?.world?.location,
    save?.pc?.department,
    array(save?.activeEvents).join(' '),
    clampText(incoming.rollingSummary || '', 1800),
    safeJson(save?.sceneRuntime || {}),
    safeJson(save?.scheduleContext?.due || []),
    safeJson(save?.scheduleContext?.upcoming || []),
    recent.map(t=>`${t?.action||''} ${t?.summary||''} ${array(t?.scene).map(x=>`${x?.speaker_key||''} ${x?.text||''}`).join(' ')}`).join(' '),
    clampText(sectionBetween(originalInput,'===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====','===== SCHEDULE ENGINE (AUTHORITATIVE) ====='),1800),
  ].filter(Boolean).join('\n');
}

function addMentionedKeys(set, text, registry, limit = 99) {
  const lower = normalizeText(text);
  for (const [key,name] of Object.entries(registry)) {
    if (set.size >= limit) break;
    if (lower.includes(key.toLowerCase()) || lower.includes(normalizeText(name))) set.add(key);
  }
}

function similarLocation(a='', b='') {
  const x = String(a||'').replace(/\s/g,'');
  const y = String(b||'').replace(/\s/g,'');
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x) || x.split(/[\/·,]/).some(p=>p.length>=2 && y.includes(p));
}

function deriveRelevantNpcKeys(incoming, registry, originalInput, maxNpcs) {
  const save = incoming.saveState || {};
  const set = new Set();
  // 1) Current scene is strongest.
  for (const key of array(save?.sceneRuntime?.participants)) if (registry[key]) set.add(String(key));
  // 2) Explicit user mention.
  addMentionedKeys(set, incoming.action || '', registry, maxNpcs);
  // 3) Very recent speakers.
  for (const turn of array(incoming.recentTurns).slice(-2)) {
    for (const item of array(turn?.scene)) if (item?.speaker_key && registry[item.speaker_key]) set.add(String(item.speaker_key));
  }
  // 4) Due schedule participants.
  for (const ev of array(save?.scheduleContext?.due).slice(0,3)) {
    for (const key of array(ev?.participants)) if (registry[key]) set.add(String(key));
  }
  for (const ev of array(save?.scheduleContext?.upcoming).slice(0,2)) {
    if (Number(ev?.importance || 0) < 3) continue;
    for (const key of array(ev?.participants)) if (registry[key]) set.add(String(key));
  }
  // 5) Last director spotlight.
  for (const row of array(save?.director?.recentSpotlights).slice(-1)) {
    for (const key of array(row?.keys)) if (registry[key]) set.add(String(key));
  }
  // 6) NPCs whose recorded location matches the PC's current area.
  const here = save?.world?.location || '';
  for (const [key,row] of Object.entries(object(save?.npcStates))) {
    if (set.size >= maxNpcs) break;
    if (registry[key] && similarLocation(here,row?.location)) set.add(key);
  }
  // 7) Current server Director can propose a natural candidate.
  const director = sectionBetween(originalInput,'===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====','===== SCHEDULE ENGINE (AUTHORITATIVE) =====');
  addMentionedKeys(set, director, registry, maxNpcs);
  return [...set].slice(0,maxNpcs);
}

function memoryText(row) {
  if (typeof row === 'string') return row;
  return [row?.fact,row?.subject,row?.source,row?.type,row?.status].filter(Boolean).join(' ');
}

function selectMemories(rows, keywords, selectedNames, limit) {
  return array(rows).map((row,index)=>{
    const text = normalizeText(memoryText(row));
    const importance = Number(row?.importance || 1);
    let score = importance * 6 + index / Math.max(1,array(rows).length);
    for (const kw of keywords) if (text.includes(kw)) score += 4;
    for (const name of selectedNames) if (text.includes(normalizeText(name))) score += 7;
    if (Number(row?.secret_level || 0) >= 4) score += 2;
    return { row,score,index };
  }).sort((a,b)=>b.score-a.score || b.index-a.index).slice(0,limit).sort((a,b)=>a.index-b.index).map(x=>x.row);
}

function compactPc(pc = {}, important = false) {
  const src = object(pc);
  const out = { ...src };
  if ('characterSetting' in out) out.characterSetting = clampText(out.characterSetting || '', important ? 2200 : 1300);
  if ('appearance' in out) out.appearance = clampText(out.appearance || '', 450);
  if (Array.isArray(out.inventory)) out.inventory = out.inventory.slice(0,24);
  if (out.skills && typeof out.skills === 'object') out.skills = Object.fromEntries(Object.entries(out.skills).slice(0,30));
  return out;
}

function compactSchedule(save, keys) {
  const sc = object(save?.scheduleContext);
  const npc = object(sc.npc_schedule);
  const npcPicked = {};
  for (const key of keys) if (npc[key]) npcPicked[key] = npc[key];
  return {
    due: array(sc.due).slice(0,5),
    upcoming: array(sc.upcoming).slice(0,7),
    npc_schedule: npcPicked,
  };
}

function compactSave(incoming, keys, registry, profile, keywords) {
  const save = incoming.saveState || {};
  const names = keys.map(k=>registry[k]).filter(Boolean);
  const rel = {}, intimacy = {}, npcStates = {}, emotions = {}, inner = {}, npcMem = {};
  for (const key of keys) {
    if (save?.relationships?.[key] != null) rel[key] = save.relationships[key];
    if (save?.intimacyStates?.[key] != null) intimacy[key] = save.intimacyStates[key];
    if (save?.npcStates?.[key] != null) npcStates[key] = save.npcStates[key];
    if (save?.emotionStates?.[key] != null) emotions[key] = save.emotionStates[key];
    if (save?.npcInnerStates?.[key] != null) inner[key] = save.npcInnerStates[key];
    if (save?.memories?.npc?.[key]) npcMem[key] = selectMemories(save.memories.npc[key],keywords,names,profile.memoriesPerNpc);
  }
  const globalMem = selectMemories(save?.memories?.global,keywords,names,profile.memoriesGlobal);
  const knowledge = selectMemories(array(save?.pcKnowledge).map(x=>typeof x==='string'?{fact:x,importance:2}:x),keywords,names,Math.max(8,profile.memoriesGlobal)).map(x=>x?.fact || x);
  const hooks = array(save?.hooks).filter(x=>!['resolved','expired'].includes(x?.status)).map((x,i)=>({x,i,score:scoreBlock({title:x?.title||'',text:safeJson(x)},keywords,names)})).sort((a,b)=>b.score-a.score || b.i-a.i).slice(0,8).sort((a,b)=>a.i-b.i).map(r=>r.x);
  const scheduled = array(save?.scheduledEvents).filter(x=>!['completed','cancelled'].includes(x?.status)).slice(0,10);
  return {
    version: save?.version,
    turnNumber: Number(save?.turnNumber || 0),
    world: save?.world || {},
    pc: compactPc(save?.pc || {}, !String(profile.name||'').startsWith('routine')),
    relationships: rel,
    intimacyStates: intimacy,
    npcStates,
    emotionStates: emotions,
    npcInnerStates: inner,
    relevantNpcKeys: keys,
    activeEvents: array(save?.activeEvents).slice(-14),
    completedEvents: array(save?.completedEvents).slice(-12),
    pcKnowledge: knowledge,
    memories: { global:globalMem, npc:npcMem },
    hooks,
    scheduledEvents: scheduled,
    director: {
      lastEventTurn:Number(save?.director?.lastEventTurn||0),
      lastChoicePressureTurn:Number(save?.director?.lastChoicePressureTurn||0),
      lastCrossDepartmentTurn:Number(save?.director?.lastCrossDepartmentTurn||0),
      recentBeats:array(save?.director?.recentBeats).slice(-5),
      callbacks:array(save?.director?.callbacks).filter(x=>x?.status!=='resolved').slice(-6),
    },
    flags: save?.flags || {},
    sceneRuntime: save?.sceneRuntime || {},
    backgroundDigest: clampText(save?.backgroundDigest || '', 700),
  };
}

function compactRecentTurns(recentTurns, count) {
  return array(recentTurns).slice(-count).map(turn=>({
    action:clampText(turn?.action||'',420),
    summary:clampText(turn?.summary||'',650),
    importance:turn?.importance||null,
    scene:array(turn?.scene).slice(-4).map(item=>({kind:item?.kind,speaker_key:item?.speaker_key||null,expression:item?.display_expression||item?.expression||null,text:clampText(item?.text||'',220)})),
  }));
}

function classifyProfile(incoming = {}, mode = 'game') {
  if (mode === 'continue') return PROFILES.continue;
  const save = incoming.saveState || {};
  const text = [incoming.action,save?.world?.location,array(save?.activeEvents).join(' ')].join(' ');
  const dueMajor = array(save?.scheduleContext?.due).some(ev=>Number(ev?.importance||0)>=4);
  if (incoming.proReasoning || save?.flags?.majorScene || dueMajor || CRITICAL_RE.test(text)) return PROFILES.critical;
  if (IMPORTANT_RE.test(text)) return PROFILES.important;
  return PROFILES.routine;
}

function adjustedProfile(base, incoming = {}) {
  const feedback = object(incoming.saveState?.routerFeedback);
  if (feedback.routerVersion !== VERSION || feedback.profile !== base.name) return { ...base, scale:1 };
  const last = Number(feedback.lastInputTokens || 0);
  if (!last || last <= base.softMaxTokens) return { ...base, scale:1 };
  // Tighten only after a V1.5.3 request proved the model-token ratio. Never shrink below 72% in one step.
  const scale = Math.max(0.72, Math.min(1, (base.targetTokens * 0.96) / last));
  return {
    ...base,
    scale,
    instructionChars:Math.floor(base.instructionChars*scale), inputChars:Math.floor(base.inputChars*scale),
    worldChars:Math.floor(base.worldChars*scale), npcChars:Math.floor(base.npcChars*scale), speechChars:Math.floor(base.speechChars*scale), pcChars:Math.floor(base.pcChars*scale),
  };
}

function buildInstructions(original, incoming, originalInput, profile) {
  const sec = parseInstructionSections(original);
  const registry = parseRegistry(sec.registry);
  const ctx = contextText(incoming,originalInput);
  const keywords = extractKeywords(ctx,44);
  const keys = deriveRelevantNpcKeys(incoming,registry,originalInput,profile.maxNpcs);
  const names = keys.map(k=>registry[k]).filter(Boolean);
  const secretAllowed = SECRET_RE.test(ctx) || String(incoming.inputMode||'').toLowerCase()==='meta';
  const combat = COMBAT_RE.test(ctx);

  const world = pickBlocks(sec.world,{keywords,selectedNames:names,budget:profile.worldChars,baseCount:combat?2:1,secretAllowed,preferredTitle:combat?/힘의 기본 구조|재능|BCAS|신체|마나|전투/i:/아카데미|일정|사회|제국/i});
  const npc = pickBlocks(sec.npc,{keywords,selectedNames:names,budget:profile.npcChars,baseCount:0,secretAllowed});
  const speech = pickBlocks(sec.speech,{keywords,selectedNames:names,budget:profile.speechChars,baseCount:0,secretAllowed:true});
  const pc = pickBlocks(sec.pc,{keywords,selectedNames:names,budget:profile.pcChars,baseCount:1,secretAllowed:true,preferredTitle:combat?/스탯|스킬|성장|전투|경지/i:/PC|캐릭터|기억|관계/i});

  let adult = '';
  if (incoming.adultMode && Number(incoming.saveState?.pc?.age||0)>=18) {
    const picked = pickBlocks(sec.adult,{keywords,selectedNames:names,budget:Math.min(2600,Math.floor(profile.speechChars*0.7)),baseCount:0,secretAllowed:true});
    adult = picked.text;
  }

  const registryText = Object.entries(registry).map(([k,n])=>`${k}=${n}`).join(', ');
  const chunks = [
    ROUTER_GM_RULES,
    NATURAL_STYLE,
    ROUTER_NOTE,
    combat ? COMBAT_RULE : '',
    `===== CHARACTER REGISTRY =====\n${registryText}`,
    world.text ? `===== ROUTED WORLD CANON =====\n${world.text}` : '',
    npc.text ? `===== ROUTED NPC CANON =====\n${npc.text}` : '',
    speech.text ? `===== ROUTED NPC SPEECH =====\n${speech.text}` : '',
    adult ? `===== ROUTED ADULT LAYER =====\n${adult}` : '',
    pc.text ? `===== ROUTED PC SYSTEM =====\n${pc.text}` : '',
  ].filter(Boolean);
  let text = chunks.join('\n\n');
  text = clampText(text,profile.instructionChars);
  return {
    text, registry, keys, names, keywords,
    moduleTitles:{world:world.titles,npc:npc.titles,speech:speech.titles,pc:pc.titles,adult:Boolean(adult)},
    originalChars:sec.originalChars,
  };
}

function buildInput(incoming, originalInput, profile, routed) {
  const save = compactSave(incoming,routed.keys,routed.registry,profile,routed.keywords);
  const recent = compactRecentTurns(incoming.recentTurns,profile.recentTurns);
  const opts = clampText(sectionBetween(originalInput,'===== TURN OPTIONS =====','===== AUTHORITATIVE SAVE_STATE ====='),900);
  const director = clampText(sectionBetween(originalInput,'===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====','===== SCHEDULE ENGINE (AUTHORITATIVE) ====='),String(profile.name||'').startsWith('routine')?1700:2400);
  const schedule = compactSchedule(incoming.saveState||{},routed.keys);
  const runtime = {
    npcInnerStates:Object.fromEntries(routed.keys.filter(k=>incoming.saveState?.npcInnerStates?.[k]).map(k=>[k,incoming.saveState.npcInnerStates[k]])),
    sceneRuntime:incoming.saveState?.sceneRuntime||{},
    backgroundDigest:clampText(incoming.saveState?.backgroundDigest||'',500),
  };
  const cg = array(incoming.availableCgIds).slice(0,100).join(', ');
  const action = clampText(incoming.action||'',5000);
  let text = `===== TURN OPTIONS =====\n${opts}\n\n===== AUTHORITATIVE SAVE_STATE (ROUTED) =====\n${safeJson(save)}\n\n===== ROLLING SUMMARY TAIL =====\n${clampText(incoming.rollingSummary||'아직 없음',2200)}\n\n===== RECENT TURNS =====\n${safeJson(recent)}\n\n===== CURRENT NPC/SCENE RUNTIME =====\n${clampText(runtime,2200)}\n\n===== AVAILABLE_CG_IDS =====\n${cg||'없음'}\n\n===== GM EVENT DIRECTOR (ROUTED) =====\n${director||'없음'}\n\n===== SCHEDULE ENGINE (ROUTED) =====\n${safeJson(schedule)}\n\n===== USER ACTION =====\n${action}\n\n위 행동까지만 처리하고 PC의 다음 행동을 정하지 마라. ROUTINE은 빠르게 압축하고, 주요 NPC 대사에는 감정 태그/강도/근거를 일치시켜라.`;
  text = clampText(text,profile.inputChars);
  return { text, compactSave:save, recent };
}

export function routeOpenAIParams(params, { incoming = {}, mode = 'game' } = {}) {
  if (mode === 'meta') {
    return {
      params,
      telemetry:{routerVersion:VERSION,enabled:false,profile:'meta-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'META keeps full canon',original_chars:String(params?.instructions||'').length+String(params?.input||'').length,routed_chars:String(params?.instructions||'').length+String(params?.input||'').length},
    };
  }
  const base = classifyProfile(incoming,mode);
  const profile = adjustedProfile(base,incoming);
  const originalInstructions = String(params?.instructions||'');
  const originalInput = String(params?.input||'');
  const requiredMarkers = ['===== CHARACTER REGISTRY =====','===== WORLD CANON =====','===== NPC CANON =====','===== NPC SPEECH =====','===== PC SYSTEM ====='];
  if (!requiredMarkers.every(m=>originalInstructions.includes(m))) {
    return {
      params,
      telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'core prompt markers changed; safe full-context fallback',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length},
    };
  }
  const routed = buildInstructions(originalInstructions,incoming,originalInput,profile);
  if (!Object.keys(routed.registry||{}).length) {
    return {
      params,
      telemetry:{routerVersion:VERSION,enabled:false,profile:'fallback-full',target_input_tokens:null,soft_max_tokens:null,selected_npcs:[],reason:'character registry parse failed; safe full-context fallback',original_chars:originalInstructions.length+originalInput.length,routed_chars:originalInstructions.length+originalInput.length},
    };
  }
  const builtInput = buildInput(incoming,originalInput,profile,routed);
  const newParams = {
    ...params,
    instructions:routed.text,
    input:builtInput.text,
    prompt_cache_key:process.env.OPENAI_PROMPT_CACHE_KEY || 'lumensia-v153-context-router-v1',
    prompt_cache_retention:'24h',
  };
  const originalChars = originalInstructions.length + originalInput.length;
  const routedChars = routed.text.length + builtInput.text.length;
  return {
    params:newParams,
    telemetry:{
      routerVersion:VERSION,
      enabled:true,
      profile:profile.name,
      target_input_tokens:profile.targetTokens,
      soft_max_tokens:profile.softMaxTokens,
      adaptive_scale:Number((profile.scale||1).toFixed(3)),
      instructions_chars:routed.text.length,
      input_chars:builtInput.text.length,
      routed_chars:routedChars,
      original_chars:originalChars,
      char_reduction_ratio:originalChars>0?Number((1-routedChars/originalChars).toFixed(4)):0,
      selected_npcs:routed.keys,
      selected_npc_names:routed.names,
      canon_modules:routed.moduleTitles,
      recent_turns:profile.recentTurns,
    },
  };
}

export function routerVersion() { return VERSION; }
