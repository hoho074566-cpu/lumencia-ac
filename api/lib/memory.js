import { collectMentionedNpcKeys } from './character-registry.js';

const trimText = (value, max = 400) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const cleanMemory = (memory) => ({
  fact: trimText(memory?.fact, 360),
  importance: memory?.importance === 'critical' ? 'critical' : (memory?.importance === 'major' || memory?.importance === 'important') ? 'major' : 'minor',
  secret_level: Math.max(0, Math.min(5, Number(memory?.secret_level || 0))),
  knowledge_type: ['direct','hearsay','inference','secret','world'].includes(memory?.knowledge_type) ? memory.knowledge_type : null,
  source: trimText(memory?.source || '', 140) || null,
  credibility: memory?.credibility == null ? null : Math.max(0, Math.min(1, Number(memory.credibility || 0))),
});

const scoreRelationship = (row = {}) => Math.abs(Number(row.affinity || 0)) + Math.abs(Number(row.trust || 0));
const importanceScore = (value) => value === 'critical' ? 3 : (value === 'major' || value === 'important') ? 2 : 1;

function rankedRelevantNpcKeys(saveState = {}, action = '', recentTurns = [], max = 10) {
  const score = new Map();
  const bump = (key, amount) => {
    if (!key) return;
    score.set(key, (score.get(key) || 0) + amount);
  };

  // 지금 사용자가 직접 언급한 NPC가 가장 중요하다.
  for (const key of collectMentionedNpcKeys(action)) bump(key, 140);

  // 최근 실제 등장 인물. 최신 턴일수록 더 높은 우선순위.
  const recent = recentTurns.slice(-4);
  recent.forEach((turn, index) => {
    const recency = index + 1;
    for (const item of turn?.scene || []) if (item?.speaker_key) bump(item.speaker_key, 70 + recency * 8);
    for (const key of collectMentionedNpcKeys(turn?.action || '', turn?.summary || '')) bump(key, 28 + recency * 4);
  });

  // 현재 장소에 있는 NPC는 장면 후보이지만, 무조건 모두 넣지는 않는다.
  const location = saveState?.world?.location;
  for (const [key, state] of Object.entries(saveState?.npcStates || {})) {
    if (location && state?.location === location) bump(key, 36);
    const updated = Number(state?.updatedAtTurn ?? -999);
    const currentTurn = Number(saveState?.turnNumber || 0);
    if (currentTurn - updated <= 3) bump(key, 16);
  }

  // 관계가 깊은 인물은 장기 맥락상 보조 가중치.
  for (const [key, row] of Object.entries(saveState?.relationships || {})) {
    const rel = scoreRelationship(row);
    if (rel > 0 || (row?.status && row.status !== '중립')) bump(key, Math.min(32, 6 + rel * 0.22));
  }

  // 친밀도 단계가 있는 경우도 누락 방지.
  for (const [key, row] of Object.entries(saveState?.intimacyStates || {})) {
    const level = Number(row?.level || 0);
    if (level > 0) bump(key, 12 + level * 5);
  }

  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([key]) => key);
}

function compactRelationships(relationships = {}, relevantKeys = []) {
  const rank = new Map(relevantKeys.map((key, i) => [key, relevantKeys.length - i]));
  const relevant = new Set(relevantKeys);
  const selected = Object.entries(relationships)
    .filter(([key, row]) => relevant.has(key) || scoreRelationship(row) > 0 || (row?.status && row.status !== '중립'))
    .sort((a,b) => (rank.get(b[0]) || 0) - (rank.get(a[0]) || 0) || scoreRelationship(b[1]) - scoreRelationship(a[1]))
    .slice(0, 14);
  return Object.fromEntries(selected.map(([key, row]) => [key, {
    affinity: Number(row?.affinity || 0),
    trust: Number(row?.trust || 0),
    status: trimText(row?.status || '중립', 70),
    stage: trimText(row?.stage || 'stranger', 24),
    milestones: (row?.milestones || []).slice(relevant.has(key) ? -4 : -2).map((x) => ({
      kind: trimText(x?.kind || 'other', 32),
      description: trimText(x?.description || '', 220),
      turn: Number(x?.turn || 0),
    })),
    history: (row?.history || []).slice(relevant.has(key) ? -6 : -2).map((x) => trimText(x, 170)),
  }]));
}

function compactIntimacyStates(states = {}, relevantKeys = []) {
  const rank = new Map(relevantKeys.map((key, i) => [key, relevantKeys.length - i]));
  const relevant = new Set(relevantKeys);
  const selected = Object.entries(states || {})
    .filter(([key, row]) => relevant.has(key) || Number(row?.level || 0) > 0)
    .sort((a,b) => (rank.get(b[0]) || 0) - (rank.get(a[0]) || 0) || Number(b[1]?.level || 0) - Number(a[1]?.level || 0))
    .slice(0, 10);
  return Object.fromEntries(selected.map(([key, row]) => [key, {
    level: Math.max(0, Math.min(5, Number(row?.level || 0))),
    status: trimText(row?.status || '없음', 70),
    history: (row?.history || []).slice(relevant.has(key) ? -4 : -2).map((x) => trimText(x, 150)),
  }]));
}

function pickMemories(rows = [], max = 6) {
  const indexed = (rows || []).map((row, index) => ({ row: cleanMemory(row), index })).filter((x) => x.row.fact);
  indexed.sort((a, b) => importanceScore(b.row.importance) - importanceScore(a.row.importance) || b.index - a.index);
  return indexed.slice(0, max).sort((a, b) => a.index - b.index).map((x) => x.row);
}

function compactNpcMemories(memories = {}, relevantKeys = []) {
  const selected = {};
  const relevant = new Set(relevantKeys);
  for (const key of relevantKeys) {
    const rows = memories?.[key];
    if (Array.isArray(rows) && rows.length) selected[key] = pickMemories(rows, 6);
  }

  const criticalFromOthers = [];
  for (const [key, rows] of Object.entries(memories || {})) {
    if (relevant.has(key)) continue;
    (rows || []).forEach((raw, index) => {
      const row = cleanMemory(raw);
      if (row.fact && row.importance === 'critical') criticalFromOthers.push({ npc_key: key, ...row, _index: index });
    });
  }
  criticalFromOthers.sort((a,b) => b._index - a._index);
  return {
    relevant: selected,
    critical_elsewhere: criticalFromOthers.slice(0, 8).map(({ _index, ...row }) => row),
  };
}

function compactEmotionStates(states = {}, relevantKeys = []) {
  const out = {};
  const keys = [...relevantKeys, ...Object.keys(states || {}).filter((key) => !relevantKeys.includes(key))].slice(0, 10);
  for (const key of keys) {
    const row = states?.[key];
    if (!row) continue;
    out[key] = {
      current: row?.current || 'default',
      intensity: Number(row?.intensity || 0),
      turnsHeld: Number(row?.turnsHeld || 0),
      lastChangedTurn: Number(row?.lastChangedTurn ?? -1),
      reason: trimText(row?.reason || '', 140),
    };
  }
  return out;
}

function compactNpcStates(states = {}, saveState = {}, relevantKeys = []) {
  const relevant = new Set(relevantKeys);
  const rank = new Map(relevantKeys.map((key, i) => [key, relevantKeys.length - i]));
  const location = saveState?.world?.location;
  return Object.fromEntries(Object.entries(states || {})
    .filter(([key, row]) => relevant.has(key) || (location && row?.location === location))
    .sort((a,b) => (rank.get(b[0]) || 0) - (rank.get(a[0]) || 0) || Number(b[1]?.updatedAtTurn || 0) - Number(a[1]?.updatedAtTurn || 0))
    .slice(0, 12)
    .map(([key, row]) => [key, {
      location: trimText(row?.location, 110),
      status: trimText(row?.status, 140),
      current_goal: trimText(row?.current_goal, 180),
      long_term_goal: trimText(row?.long_term_goal, 220),
      short_term_goal: trimText(row?.short_term_goal || row?.current_goal, 220),
      goal_progress: Math.max(0, Math.min(100, Number(row?.goal_progress || 0))),
      obstacle: trimText(row?.obstacle, 180),
      goal_reason: trimText(row?.goal_reason, 180),
      next_activity: trimText(row?.next_activity, 180),
      next_location: trimText(row?.next_location, 110),
      next_change_minutes: row?.next_change_minutes == null ? null : Math.max(0, Math.min(10080, Number(row.next_change_minutes || 0))),
      last_seen: trimText(row?.last_seen, 110),
      updatedAtTurn: Number(row?.updatedAtTurn ?? -1),
    }]));
}


function compactSystemQueues(saveState = {}, relevantKeys = []) {
  const relevant = new Set(relevantKeys);
  return {
    npcSchedule: (saveState?.npcSchedule || [])
      .filter((x) => relevant.has(x?.npc_key))
      .slice(0, 10)
      .map((x) => ({ npc_key:x.npc_key, remaining_minutes:Math.max(0, Number(x.remaining_minutes ?? 0)), location:trimText(x.location,110), activity:trimText(x.activity,160) })),
    rumors: (saveState?.rumorQueue || []).slice(0, 8).map((x) => ({
      remaining_turns:Math.max(0, Number(x.remaining_turns ?? 0)), fact:trimText(x.fact,240), source_npc_key:x.source_npc_key||null,
      target_npc_keys:(x.target_npc_keys||[]).filter((k)=>relevant.has(k)).slice(0,4), credibility:Number(x.credibility||0),
    })).filter((x)=>x.target_npc_keys.length),
    consequences: (saveState?.consequenceQueue || []).slice(0, 8).map((x) => ({
      remaining_minutes:Math.max(0, Number(x.remaining_minutes ?? 0)), event_name:trimText(x.event_name,160), target_bucket:x.target_bucket, reason:trimText(x.reason,180), secret_level:Number(x.secret_level||0),
    })),
  };
}

export function compactSaveForModel(saveState = {}, { action = '', recentTurns = [] } = {}) {
  const relevantKeys = rankedRelevantNpcKeys(saveState, action, recentTurns, 10);
  const globalMemory = (saveState?.memories?.global || []).map(cleanMemory).filter((x) => x.fact);
  const majorGlobal = globalMemory.filter((x) => x.importance !== 'minor').slice(-24);
  const recentMinorGlobal = globalMemory.filter((x) => x.importance === 'minor').slice(-8);

  return {
    version: saveState?.version || 6,
    turnNumber: Number(saveState?.turnNumber || 0),
    world: saveState?.world || {},
    pc: saveState?.pc || {},
    relationships: compactRelationships(saveState?.relationships || {}, relevantKeys),
    intimacyStates: compactIntimacyStates(saveState?.intimacyStates || {}, relevantKeys),
    npcStates: compactNpcStates(saveState?.npcStates || {}, saveState, relevantKeys),
    emotionStates: compactEmotionStates(saveState?.emotionStates || {}, relevantKeys),
    activeEvents: (saveState?.activeEvents || []).slice(-20).map((x) => trimText(x, 180)),
    scheduledEvents: (saveState?.scheduledEvents || []).slice(-16).map((x) => trimText(x, 180)),
    worldArcs: (saveState?.worldArcs || []).slice(-16).map((x) => trimText(x, 180)),
    completedEvents: (saveState?.completedEvents || []).slice(-30).map((x) => trimText(x, 180)),
    pcKnowledge: (saveState?.pcKnowledge || []).slice(-50).map((x) => trimText(x, 320)),
    memories: {
      global: [...majorGlobal, ...recentMinorGlobal].slice(-32),
      npc: compactNpcMemories(saveState?.memories?.npc || {}, relevantKeys),
    },
    systemQueues: compactSystemQueues(saveState, relevantKeys),
    relevantNpcKeys: relevantKeys,
    flags: saveState?.flags || {},
  };
}

function cloneJson(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return {}; }
}

function trimStringsDeep(value, maxString = 300) {
  if (typeof value === 'string') return trimText(value, maxString);
  if (Array.isArray(value)) return value.map((x) => trimStringsDeep(x, maxString));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimStringsDeep(v, maxString)]));
  return value;
}

// JSON 문자열 자체를 중간에서 자르지 않는다. 용량이 커지면 낮은 우선순위 범주부터 단계적으로 축약한다.
export function serializeCompactSaveForPrompt(compactSave = {}, maxChars = 38000) {
  const state = cloneJson(compactSave);
  const render = () => JSON.stringify(state);
  let text = render();
  if (text.length <= maxChars) return text;

  for (const row of Object.values(state.relationships || {})) {
    row.history = (row.history || []).slice(-3);
    row.milestones = (row.milestones || []).slice(-3);
  }
  for (const row of Object.values(state.intimacyStates || {})) row.history = (row.history || []).slice(-2);
  if (state.pcKnowledge) state.pcKnowledge = state.pcKnowledge.slice(-30);
  if (state.completedEvents) state.completedEvents = state.completedEvents.slice(-20);
  if (state.memories?.global) state.memories.global = pickMemories(state.memories.global, 20);
  if (state.memories?.npc?.critical_elsewhere) state.memories.npc.critical_elsewhere = state.memories.npc.critical_elsewhere.slice(-4);
  for (const [key, rows] of Object.entries(state.memories?.npc?.relevant || {})) state.memories.npc.relevant[key] = pickMemories(rows, 4);
  text = render();
  if (text.length <= maxChars) return text;

  // 두 번째 단계: 현재 장면에 덜 중요한 부가 정보 축약.
  if (state.activeEvents) state.activeEvents = state.activeEvents.slice(-16);
  if (state.scheduledEvents) state.scheduledEvents = state.scheduledEvents.slice(-12);
  if (state.worldArcs) state.worldArcs = state.worldArcs.slice(-12);
  if (state.completedEvents) state.completedEvents = state.completedEvents.slice(-12);
  if (state.pcKnowledge) state.pcKnowledge = state.pcKnowledge.slice(-20);
  const npcKeys = state.relevantNpcKeys || [];
  if (state.npcStates) state.npcStates = Object.fromEntries(Object.entries(state.npcStates).filter(([key]) => npcKeys.includes(key)).slice(0, 8));
  if (state.emotionStates) state.emotionStates = Object.fromEntries(Object.entries(state.emotionStates).filter(([key]) => npcKeys.includes(key)).slice(0, 8));
  if (state.systemQueues) {
    state.systemQueues.npcSchedule = (state.systemQueues.npcSchedule || []).slice(0, 6);
    state.systemQueues.rumors = (state.systemQueues.rumors || []).slice(0, 4);
    state.systemQueues.consequences = (state.systemQueues.consequences || []).slice(0, 4);
  }
  text = JSON.stringify(trimStringsDeep(state, 260));
  if (text.length <= maxChars) return text;

  // 최후 안전망: 핵심 현재상태는 보존하고 상세 이력만 제거한 유효 JSON을 만든다.
  let essential = {
    version: state.version,
    turnNumber: state.turnNumber,
    world: trimStringsDeep(state.world || {}, 220),
    pc: trimStringsDeep(state.pc || {}, 220),
    relationships: Object.fromEntries(Object.entries(state.relationships || {}).slice(0, 10).map(([k, v]) => [k, { ...v, history: [], milestones:(v?.milestones||[]).slice(-2) }])),
    intimacyStates: Object.fromEntries(Object.entries(state.intimacyStates || {}).slice(0, 8).map(([k, v]) => [k, { ...v, history: [] }])),
    npcStates: trimStringsDeep(state.npcStates || {}, 180),
    emotionStates: trimStringsDeep(state.emotionStates || {}, 120),
    activeEvents: (state.activeEvents || []).slice(-12),
    scheduledEvents: (state.scheduledEvents || []).slice(-10),
    worldArcs: (state.worldArcs || []).slice(-10),
    completedEvents: (state.completedEvents || []).slice(-8),
    pcKnowledge: (state.pcKnowledge || []).slice(-12),
    memories: {
      global: pickMemories(state.memories?.global || [], 12),
      npc: { relevant: {}, critical_elsewhere: (state.memories?.npc?.critical_elsewhere || []).slice(-3) },
    },
    systemQueues: trimStringsDeep(state.systemQueues || {}, 160),
    relevantNpcKeys: (state.relevantNpcKeys || []).slice(0, 8),
    flags: trimStringsDeep(state.flags || {}, 160),
    context_compacted: true,
  };
  text = JSON.stringify(essential);
  if (text.length <= maxChars) return text;

  // 비정상적으로 큰 커스텀 PC/flags까지 들어온 경우에도 유효 JSON 예산을 보장한다.
  const pc = state.pc || {};
  const compactSkills = Object.fromEntries(Object.entries(pc.skills || {}).slice(0, 60).map(([key, row]) => [key, {
    grade: row?.grade || row,
    hiddenXp: Number(row?.hiddenXp || 0),
  }]));
  essential = {
    version: state.version,
    turnNumber: state.turnNumber,
    world: {
      dayElapsed: Number(state.world?.dayElapsed || 0),
      date: trimText(state.world?.date || '', 32),
      weekday: trimText(state.world?.weekday || '', 20),
      time: trimText(state.world?.time || '', 16),
      location: trimText(state.world?.location || '', 160),
    },
    pc: {
      name: trimText(pc.name || '', 80), age: Number(pc.age || 0), gender: trimText(pc.gender || '', 40),
      department: trimText(pc.department || '', 100), realm: trimText(pc.realm || '', 100), status: trimText(pc.status || '', 100),
      fatigue: Number(pc.fatigue || 0), gold: Number(pc.gold || 0), talents: trimStringsDeep(pc.talents || {}, 80),
      stats: trimStringsDeep(pc.stats || {}, 100), skills: compactSkills,
      traits: trimStringsDeep(pc.traits || {}, 140), authorities: trimStringsDeep(pc.authorities || {}, 140),
      skillCandidates: trimStringsDeep(pc.skillCandidates || {}, 140), awakeningCandidates: trimStringsDeep(pc.awakeningCandidates || {}, 140),
      inventory: (pc.inventory || []).slice(-30).map((x) => trimText(x, 120)),
    },
    relationships: Object.fromEntries(Object.entries(state.relationships || {}).slice(0, 8).map(([k, v]) => [k, { affinity:Number(v?.affinity||0), trust:Number(v?.trust||0), status:trimText(v?.status||'',60), stage:trimText(v?.stage||'stranger',24), milestones:(v?.milestones||[]).slice(-2), history:[] }])),
    intimacyStates: Object.fromEntries(Object.entries(state.intimacyStates || {}).slice(0, 6).map(([k, v]) => [k, { level:Number(v?.level||0), status:trimText(v?.status||'',60), history:[] }])),
    npcStates: Object.fromEntries(Object.entries(state.npcStates || {}).slice(0, 6).map(([k,v]) => [k, trimStringsDeep(v,120)])),
    emotionStates: Object.fromEntries(Object.entries(state.emotionStates || {}).slice(0, 6).map(([k,v]) => [k, trimStringsDeep(v,100)])),
    activeEvents: (state.activeEvents || []).slice(-10).map((x) => trimText(x,120)),
    scheduledEvents: (state.scheduledEvents || []).slice(-8).map((x) => trimText(x,120)),
    worldArcs: (state.worldArcs || []).slice(-8).map((x) => trimText(x,120)),
    completedEvents: (state.completedEvents || []).slice(-6).map((x) => trimText(x,120)),
    pcKnowledge: (state.pcKnowledge || []).slice(-8).map((x) => trimText(x,180)),
    memories: { global: pickMemories(state.memories?.global || [], 8), npc: { relevant:{}, critical_elsewhere:[] } },
    systemQueues: trimStringsDeep(state.systemQueues || {}, 120),
    relevantNpcKeys: (state.relevantNpcKeys || []).slice(0, 6),
    flags: {},
    context_compacted: true,
  };
  text = JSON.stringify(essential);
  if (text.length <= maxChars) return text;

  // 절대 최종 안전망: 핵심 진행상태만 남긴다. 여전히 JSON 객체 단위로 축약하며 문자열 절단은 하지 않는다.
  return JSON.stringify({
    version: state.version,
    turnNumber: state.turnNumber,
    world: essential.world,
    pc: { ...essential.pc, skills: Object.fromEntries(Object.entries(compactSkills).slice(0, 30)), inventory: essential.pc.inventory.slice(-15) },
    relationships: Object.fromEntries(Object.entries(essential.relationships).slice(0, 5)),
    npcStates: Object.fromEntries(Object.entries(essential.npcStates).slice(0, 5)),
    activeEvents: essential.activeEvents.slice(-8),
    scheduledEvents: (essential.scheduledEvents || []).slice(-6),
    worldArcs: (essential.worldArcs || []).slice(-6),
    pcKnowledge: essential.pcKnowledge.slice(-5),
    systemQueues: essential.systemQueues || {},
    relevantNpcKeys: essential.relevantNpcKeys.slice(0, 5),
    context_compacted: true,
  });
}
