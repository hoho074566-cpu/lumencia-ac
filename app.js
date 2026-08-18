import { ASSETS } from './assets.js';

const APP_VERSION = '0.4.9';
const SAVE_SCHEMA_VERSION = 6;
const SAVE_KEY = 'lumensia.save.v1';
const SETTINGS_KEY = 'lumensia.settings.v1';
const BACKUP_HISTORY_KEY = 'lumensia.backups.v1';
const BACKUP_STEP_TURNS = 10;
const BACKUP_MAX_SNAPSHOTS = 8;

const $ = (id) => document.getElementById(id);
const story = $('story');
const choicesEl = $('choices');
const actionForm = $('actionForm');
const actionInput = $('actionInput');
const sendBtn = $('sendBtn');

const defaultSettings = {
  modelMode: 'auto',
  reasoningEffort: 'auto',
  proseLength: 'medium',
  adultMode: false,
  proReasoning: false,
  demoMode: false,
  accessToken: '',
  showEmotionDebug: false,
  showResolutionLog: true,
};

const defaultSave = () => ({
  version: SAVE_SCHEMA_VERSION,
  appVersion: APP_VERSION,
  id: crypto.randomUUID?.() || String(Date.now()),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  turnNumber: 0,
  world: {
    dayElapsed: 0,
    date: '1285-03-01',
    weekday: '월요일',
    time: '08:40',
    location: '루멘시아 아카데미 대강당 앞',
  },
  pc: {
    name: '카일', age: 20, gender: '남성', department: '기사과 1학년',
    realm: '익스퍼트 상급', status: '안정', fatigue: 0, gold: 18,
    talents: { magic: 2, martial: 9, soul: 7, knowledge: 5 },
    stats: {
      '신체': { grade: 'A-', progress: 36 },
      '마나': { grade: 'B+', progress: 41 },
      '지능': { grade: 'C', progress: 28 },
      '신성': { grade: 'F', progress: 0 },
    },
    skills: {
      '대검술': { grade: 'A++', hiddenXp: 0 }, '오러 운용': { grade: 'A', hiddenXp: 0 },
      '검기': { grade: 'A-', hiddenXp: 0 }, '실전 전투': { grade: 'S', hiddenXp: 0 },
      '위험 감지': { grade: 'A++', hiddenXp: 0 }, '전장 판단': { grade: 'A+', hiddenXp: 0 },
      '회피': { grade: 'A+', hiddenXp: 0 }, '체력 관리': { grade: 'A', hiddenXp: 0 },
      '응급처치': { grade: 'B+', hiddenXp: 0 }, '야전 생존': { grade: 'A', hiddenXp: 0 },
      '투척': { grade: 'C+', hiddenXp: 0 }, '승마': { grade: 'B', hiddenXp: 0 },
    },
    skillCandidates: {},
    traits: {
      '사선감각': {
        description: '자신을 향한 실질적인 살의와 치명적 공격의 기척·궤도를 매우 빠르게 감지하는 영혼각인 특성.',
        limitation: '미래예지가 아니며 감지 불가능한 공격·압도적 속도·정보 없는 광역공격에는 대응을 보장하지 않는다.',
        awakenedAtTurn: 0,
        source: '초기 설정',
      },
    },
    authorities: {},
    awakeningCandidates: { trait: {}, authority: {} },
    inventory: ['강철 양손대검', '예비 단검 2자루', '가죽 장갑', '야전 치료도구', '숫돌', '용병단 인식표'],
  },
  relationships: {},
  intimacyStates: {},
  npcStates: {},
  emotionStates: {},
  npcSchedule: [],
  rumorQueue: [],
  consequenceQueue: [],
  timeline: [],
  activeEvents: ['입학식/학과 오리엔테이션'],
  scheduledEvents: ['신입생 기량평가'],
  worldArcs: ['회색 늑대의 숲', '황위 경쟁'],
  completedEvents: [],
  pcKnowledge: [],
  memories: { global: [], npc: {} },
  flags: { majorScene: false, forceTerraNextTurn: true },
  rollingSummary: '입학식 당일 08:40. 카일은 루멘시아 아카데미 대강당 앞에 도착했으며 입학식 개막 전이다.',
  recentTurns: [],
  renderedTurns: [],
  usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, estimatedUsd: 0, lastTurnUsd: 0, lastCacheHitRate: 0, lastInputTokens: 0, lastOutputTokens: 0 },
});

let save = normalizeSave(loadJson(SAVE_KEY) || defaultSave());
let settings = { ...defaultSettings, ...(loadJson(SETTINGS_KEY) || {}) };
let busy = false;
let forceTerraOnce = false;

function loadJson(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function persist() { save.updatedAt = new Date().toISOString(); localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
function persistSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function uniq(arr) { return [...new Set((arr || []).filter(Boolean))]; }
function clamp(n, min, max) { return Math.min(max, Math.max(min, Number(n) || 0)); }
function npcName(key) { return ASSETS.characters?.[key]?.name || key || 'NPC'; }
const REL_STAGE_LABELS = { stranger:'낯선 사이', acquainted:'안면 있음', familiar:'지인', trusted:'신뢰', close:'가까운 사이' };
function relationshipStage(row = {}) {
  const affinity = Number(row?.affinity || 0);
  const trust = Number(row?.trust || 0);
  const milestones = Array.isArray(row?.milestones) ? row.milestones.length : 0;
  if (affinity >= 55 && trust >= 50 && milestones >= 3) return 'close';
  if (affinity >= 30 && trust >= 35 && milestones >= 2) return 'trusted';
  if (affinity >= 15 && trust >= 10 && milestones >= 1) return 'familiar';
  if (Math.abs(affinity) + Math.abs(trust) >= 3 || milestones >= 1 || (row?.history || []).length) return 'acquainted';
  return 'stranger';
}
function isRegisteredNpcKey(key) { return Boolean(key && ASSETS.characters?.[key]); }
function pruneNpcMap(obj = {}) { return Object.fromEntries(Object.entries(obj || {}).filter(([key]) => isRegisteredNpcKey(key))); }

function migrationContext(state = {}) {
  const recent = (state.recentTurns || []).slice(-4).flatMap((x) => [x?.action || '', x?.summary || '']);
  return [state.world?.location || '', ...recent].join('\n');
}

function migrateEventBuckets(state, sourceVersion, raw = {}) {
  let active = Array.isArray(state.activeEvents) ? [...state.activeEvents] : [];
  let scheduled = Array.isArray(raw?.scheduledEvents) ? [...raw.scheduledEvents] : [];
  let worldArcs = Array.isArray(raw?.worldArcs) ? [...raw.worldArcs] : [];

  // V1.3.3 이하의 기본 세이브는 미래 일정/세계 장기 사건까지 activeEvents에 섞여 있었다.
  // 진행 중인 실제 장면을 최대한 보존하면서 명백한 기본 항목만 새 버킷으로 옮긴다.
  if (Number(sourceVersion || 0) < SAVE_SCHEMA_VERSION && !Array.isArray(raw?.scheduledEvents) && !Array.isArray(raw?.worldArcs)) {
    const context = migrationContext(state);
    const dayElapsed = Number(state.world?.dayElapsed || 0);
    const keep = [];
    for (const name of active) {
      if (name === '신입생 기량평가') {
        if (dayElapsed >= 6) keep.push(name);
        else scheduled.push(name);
        continue;
      }
      if (name === '회색 늑대의 숲') {
        if (/(회색 늑대의 숲|트윈헤드 울프|늑대 토벌|토벌 의뢰)/.test(context)) keep.push(name);
        else worldArcs.push(name);
        continue;
      }
      if (name === '황위 경쟁') {
        if (/(황위 경쟁|황위 계승|계승 경쟁|황권|황제 계승|파벌 정치)/.test(context)) keep.push(name);
        else worldArcs.push(name);
        continue;
      }
      keep.push(name);
    }
    active = keep;
  }

  const completed = new Set(Array.isArray(state.completedEvents) ? state.completedEvents : []);
  active = uniq(active).filter((x) => !completed.has(x));
  scheduled = uniq(scheduled).filter((x) => !completed.has(x) && !active.includes(x));
  worldArcs = uniq(worldArcs).filter((x) => !completed.has(x) && !active.includes(x) && !scheduled.includes(x));
  state.activeEvents = active;
  state.scheduledEvents = scheduled;
  state.worldArcs = worldArcs;
}

function normalizeSave(raw) {
  const base = defaultSave();
  const source = raw && typeof raw === 'object' ? raw : base;
  const sourceVersion = Number(source.version || 0);
  const next = source;
  next.version = SAVE_SCHEMA_VERSION;
  next.appVersion = APP_VERSION;
  next.world = { ...base.world, ...(next.world || {}) };
  next.pc = { ...base.pc, ...(next.pc || {}) };
  next.pc.stats = { ...base.pc.stats, ...(next.pc.stats || {}) };
  next.pc.skills = { ...base.pc.skills, ...(next.pc.skills || {}) };
  next.pc.skillCandidates = next.pc.skillCandidates && typeof next.pc.skillCandidates === 'object' ? next.pc.skillCandidates : {};
  next.pc.traits = next.pc.traits && typeof next.pc.traits === 'object' ? next.pc.traits : { ...base.pc.traits };
  next.pc.authorities = next.pc.authorities && typeof next.pc.authorities === 'object' ? next.pc.authorities : {};
  next.pc.awakeningCandidates = next.pc.awakeningCandidates && typeof next.pc.awakeningCandidates === 'object' ? next.pc.awakeningCandidates : { trait:{}, authority:{} };
  next.pc.awakeningCandidates.trait = next.pc.awakeningCandidates.trait && typeof next.pc.awakeningCandidates.trait === 'object' ? next.pc.awakeningCandidates.trait : {};
  next.pc.awakeningCandidates.authority = next.pc.awakeningCandidates.authority && typeof next.pc.awakeningCandidates.authority === 'object' ? next.pc.awakeningCandidates.authority : {};
  next.pc.inventory = Array.isArray(next.pc.inventory) ? next.pc.inventory : [...base.pc.inventory];
  next.relationships = pruneNpcMap(next.relationships || {});
  for (const [key, row] of Object.entries(next.relationships)) {
    next.relationships[key] = {
      affinity: Number(row?.affinity || 0),
      trust: Number(row?.trust || 0),
      status: row?.status || '중립',
      stage: row?.stage || 'stranger',
      milestones: Array.isArray(row?.milestones) ? row.milestones.slice(-12) : [],
      history: Array.isArray(row?.history) ? row.history.slice(-30) : [],
    };
    next.relationships[key].stage = relationshipStage(next.relationships[key]);
  }
  next.intimacyStates = pruneNpcMap(next.intimacyStates || {});
  next.npcStates = pruneNpcMap(next.npcStates || {});
  next.emotionStates = pruneNpcMap(next.emotionStates || {});
  next.npcSchedule = Array.isArray(next.npcSchedule) ? next.npcSchedule.filter((x)=>isRegisteredNpcKey(x?.npc_key)).slice(-80) : [];
  next.rumorQueue = Array.isArray(next.rumorQueue) ? next.rumorQueue.map((x)=>({
    ...x,
    source_npc_key:isRegisteredNpcKey(x?.source_npc_key) ? x.source_npc_key : null,
    target_npc_keys:uniq((x?.target_npc_keys || []).filter(isRegisteredNpcKey)),
  })).filter((x)=>x.fact && x.target_npc_keys.length).slice(-80) : [];
  next.consequenceQueue = Array.isArray(next.consequenceQueue) ? next.consequenceQueue.filter((x)=>x?.event_name && ['active','world'].includes(x?.target_bucket)).slice(-80) : [];
  next.timeline = Array.isArray(next.timeline) ? next.timeline : [];
  next.activeEvents = Array.isArray(next.activeEvents) ? next.activeEvents : [];
  next.completedEvents = Array.isArray(next.completedEvents) ? next.completedEvents : [];
  migrateEventBuckets(next, sourceVersion, raw || {});
  next.pcKnowledge = Array.isArray(next.pcKnowledge) ? next.pcKnowledge : [];
  next.memories = next.memories || { global: [], npc: {} };
  next.memories.global = Array.isArray(next.memories.global) ? next.memories.global : [];
  next.memories.npc = pruneNpcMap(next.memories.npc || {});
  next.flags = { ...base.flags, ...(next.flags || {}) };
  next.recentTurns = Array.isArray(next.recentTurns) ? next.recentTurns : [];
  next.renderedTurns = Array.isArray(next.renderedTurns) ? next.renderedTurns : [];
  next.usage = { ...base.usage, ...(next.usage || {}) };
  return next;
}

function backupSnapshot() {
  const snap = JSON.parse(JSON.stringify(save));
  // 복구에 필요한 상태는 보존하되 브라우저 저장공간 폭증 방지를 위해 오래된 화면 기록만 제한한다.
  snap.renderedTurns = (snap.renderedTurns || []).slice(-16);
  snap.timeline = (snap.timeline || []).slice(-220);
  snap.recentTurns = (snap.recentTurns || []).slice(-8);
  return snap;
}
function allBackupRows() {
  const rows = loadJson(BACKUP_HISTORY_KEY);
  return Array.isArray(rows) ? rows : [];
}
function backupRowsForCurrentSave() {
  return allBackupRows().filter((row) => row?.saveId === save.id && row?.save && Number.isFinite(Number(row.turnNumber)));
}
function writeBackupSnapshot(reason = 'checkpoint', force = false) {
  const turnNumber = Number(save.turnNumber || 0);
  if (!force && turnNumber % BACKUP_STEP_TURNS !== 0) return;
  let rows = allBackupRows().filter((row) => row?.saveId === save.id);
  rows = rows.filter((row) => Number(row.turnNumber) !== turnNumber);
  rows.push({ saveId: save.id, turnNumber, createdAt: new Date().toISOString(), reason, save: backupSnapshot() });
  rows.sort((a,b) => Number(a.turnNumber) - Number(b.turnNumber));
  rows = rows.slice(-BACKUP_MAX_SNAPSHOTS);
  try { localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(rows)); } catch (err) { console.warn('backup write failed', err); }
}
function ensureBackupBaseline() {
  if (!backupRowsForCurrentSave().length) writeBackupSnapshot('baseline', true);
}
function clearBackupHistory() { try { localStorage.removeItem(BACKUP_HISTORY_KEY); } catch {} }
function findBackupTurnsAgo(distance) {
  const target = Number(save.turnNumber || 0) - Math.max(0, Number(distance || 0));
  return backupRowsForCurrentSave().filter((row) => Number(row.turnNumber) <= target).sort((a,b) => Number(b.turnNumber) - Number(a.turnNumber))[0] || null;
}
function updateBackupControls() {
  const b10 = findBackupTurnsAgo(10);
  const b50 = findBackupTurnsAgo(50);
  const btn10 = $('restore10Btn'); const btn50 = $('restore50Btn'); const status = $('backupStatus');
  if (btn10) { btn10.disabled = !b10; btn10.textContent = b10 ? `10턴 전 복구 (T${b10.turnNumber})` : '10턴 전 복구 (아직 없음)'; }
  if (btn50) { btn50.disabled = !b50; btn50.textContent = b50 ? `50턴 전 복구 (T${b50.turnNumber})` : '50턴 전 복구 (아직 없음)'; }
  if (status) status.textContent = `자동 백업: 10턴 간격 · 보관 ${backupRowsForCurrentSave().length}/${BACKUP_MAX_SNAPSHOTS}`;
}
function restoreBackup(distance) {
  const row = findBackupTurnsAgo(distance);
  if (!row) return toast(`${distance}턴 전 백업이 아직 없음`);
  if (!confirm(`현재 T${save.turnNumber} 상태를 T${row.turnNumber} 백업으로 되돌릴까?`)) return;
  writeBackupSnapshot('before-restore', true);
  save = normalizeSave(JSON.parse(JSON.stringify(row.save)));
  persist(); renderAll(); updateBackupControls(); toast(`T${row.turnNumber} 백업으로 복구됨`);
}
const WEEKDAYS = ['월요일','화요일','수요일','목요일','금요일','토요일','일요일'];
const GRADE_LADDER = ['F','F+','E-','E','E+','D-','D','D+','C-','C','C+','B-','B','B+','A-','A','A+','A++','S-','S','S+','S++','SS-','SS','SS+','SSS-','SSS','SSS+'];
function minutesFromTime(t) { const [h,m] = String(t || '00:00').split(':').map(Number); return h*60+m; }
function timeFromMinutes(total) { total = ((total % 1440) + 1440) % 1440; return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`; }
function daysInMonth(year, month) { if (month === 2) return year % 4 === 0 ? 29 : 28; return [4,6,9,11].includes(month) ? 30 : 31; }
function advanceCalendarDays(days) {
  let [year, month, day] = String(save.world.date || '1285-03-01').split('-').map(Number);
  let weekdayIndex = Math.max(0, WEEKDAYS.indexOf(save.world.weekday));
  for (let i=0; i<days; i++) {
    day += 1; weekdayIndex = (weekdayIndex + 1) % 7;
    if (day > daysInMonth(year, month)) { day = 1; month += 1; }
    if (month > 12) { month = 1; year += 1; }
  }
  save.world.date = `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  save.world.weekday = WEEKDAYS[weekdayIndex];
  save.world.dayElapsed += days;
}
function advanceTime(minutes) {
  const before = minutesFromTime(save.world.time);
  const total = before + Math.max(0, Number(minutes) || 0);
  const dayAdd = Math.floor(total / 1440);
  save.world.time = timeFromMinutes(total);
  if (dayAdd > 0) advanceCalendarDays(dayAdd);
}

function absoluteGameMinutes(date = save.world.date, time = save.world.time) {
  const [year, month, day] = String(date || '0001-01-01').split('-').map(Number);
  const y = Math.max(1, year || 1);
  const m = clamp(month || 1, 1, 12);
  const d = clamp(day || 1, 1, 31);
  const beforeYear = (y - 1) * 365 + Math.floor((y - 1) / 4);
  let beforeMonth = 0;
  for (let mm = 1; mm < m; mm++) beforeMonth += daysInMonth(y, mm);
  return (beforeYear + beforeMonth + d - 1) * 1440 + minutesFromTime(time);
}

function queueId(prefix) {
  return `${prefix}-${save.id}-${save.turnNumber}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}

function processDueNpcSchedules() {
  const now = absoluteGameMinutes();
  const pending = [];
  for (const row of save.npcSchedule || []) {
    if (Number(row?.dueMinute || 0) > now) { pending.push(row); continue; }
    if (!isRegisteredNpcKey(row?.npc_key)) continue;
    const old = save.npcStates[row.npc_key] || {};
    save.npcStates[row.npc_key] = {
      ...old,
      location: row.location || old.location,
      status: row.activity || old.status,
      next_activity: null,
      next_location: null,
      next_change_minutes: null,
      schedule_reason: row.reason || null,
      updatedAtTurn: save.turnNumber,
    };
  }
  save.npcSchedule = pending.slice(-80);
}

function processDueRumors() {
  const pending = [];
  for (const row of save.rumorQueue || []) {
    if (Number(row?.dueTurn || 0) > Number(save.turnNumber || 0)) { pending.push(row); continue; }
    for (const key of row.target_npc_keys || []) {
      if (!isRegisteredNpcKey(key)) continue;
      save.memories.npc[key] = addMemoryUnique(save.memories.npc[key], {
        fact: row.fact,
        importance: Number(row.credibility || 0) >= 0.75 ? 'major' : 'minor',
        secret_level: 0,
        knowledge_type: 'hearsay',
        source: row.source_npc_key ? npcName(row.source_npc_key) : '출처 불명 소문',
        credibility: clamp(row.credibility, 0, 1),
      }, 120);
    }
  }
  save.rumorQueue = pending.slice(-80);
}

function processDueConsequences() {
  const now = absoluteGameMinutes();
  const pending = [];
  for (const row of save.consequenceQueue || []) {
    if (Number(row?.dueMinute || 0) > now) { pending.push(row); continue; }
    if (row.target_bucket === 'world') {
      if (!(save.activeEvents || []).includes(row.event_name) && !(save.completedEvents || []).includes(row.event_name)) {
        save.scheduledEvents = (save.scheduledEvents || []).filter((x)=>x !== row.event_name);
        save.worldArcs = uniq([...(save.worldArcs || []), row.event_name]);
      }
    } else if (!(save.completedEvents || []).includes(row.event_name)) {
      save.scheduledEvents = (save.scheduledEvents || []).filter((x)=>x !== row.event_name);
      save.worldArcs = (save.worldArcs || []).filter((x)=>x !== row.event_name);
      save.activeEvents = uniq([...(save.activeEvents || []), row.event_name]);
    }
    save.memories.global = addMemoryUnique(save.memories.global, {
      fact: `지연 결과 발생: ${row.event_name}. 원인: ${row.reason}`,
      importance: 'important',
      secret_level: clamp(row.secret_level, 0, 5),
      knowledge_type: 'world',
      source: '세계 결과 큐',
      credibility: 1,
    }, 300);
  }
  save.consequenceQueue = pending.slice(-80);
}

function processDueSystems() {
  processDueNpcSchedules();
  processDueRumors();
  processDueConsequences();
}
function nextGrade(grade) { const i = GRADE_LADDER.indexOf(grade); return i >= 0 && i < GRADE_LADDER.length - 1 ? GRADE_LADDER[i+1] : grade; }
function progressionGainCap(grade) {
  const g = String(grade || 'F');
  if (g.startsWith('SSS')) return 1;
  if (g.startsWith('SS')) return 1;
  if (g.startsWith('S')) return 2;
  if (g.startsWith('A')) return 3;
  if (g.startsWith('B')) return 4;
  return 5;
}
function progressionReason(reason) {
  const text = String(reason || '').replace(/\s+/g, ' ').trim();
  return text ? ` — ${text.slice(0, 220)}` : '';
}
function skillLearningGainCap(amount) { return clamp(amount, 1, 15); }
function awakeningGainCap(kind, amount, milestone) {
  if (kind === 'authority') return clamp(amount, 1, milestone ? 6 : 2);
  return clamp(amount, 1, milestone ? 10 : 4);
}
function addMemoryUnique(list, memory, max = 250) {
  if (!memory?.fact) return list || [];
  const rows = Array.isArray(list) ? list : [];
  const signature = `${memory.fact}|${memory.secret_level || 0}`;
  const filtered = rows.filter((x) => `${x?.fact}|${x?.secret_level || 0}` !== signature);
  return [...filtered, memory].slice(-max);
}

function assetUrl(key, expression = 'default') {
  const char = ASSETS.characters[key];
  if (!char) return null;
  return char.expressions?.[expression] || char.default || null;
}

function createPortrait(key, expression, alt) {
  const wrap = document.createElement('div');
  wrap.className = 'portrait-wrap';
  const placeholder = document.createElement('div');
  placeholder.className = 'portrait-placeholder';
  placeholder.textContent = `${alt || key || 'NPC'} 초상화`;
  wrap.append(placeholder);
  const img = document.createElement('img');
  let triedDefault = false;
  img.alt = alt || key || 'NPC';
  img.loading = 'lazy';
  img.src = assetUrl(key, expression) || '';
  img.addEventListener('load', () => placeholder.remove());
  img.addEventListener('error', () => {
    const fallback = ASSETS.characters[key]?.default;
    if (!triedDefault && fallback && img.src !== fallback) { triedDefault = true; img.src = fallback; }
    else img.remove();
  });
  if (img.src) wrap.append(img);
  return wrap;
}

function appendWelcome() {
  story.innerHTML = '';
  const box = document.createElement('section');
  box.className = 'welcome';
  box.innerHTML = `<h2>입학식 당일</h2><p>제국력 1285년 3월 1일, 오전 8시 40분. 대강당 앞은 신입생과 귀족 자제, 교수와 상급생들로 붐빈다. 카일의 행동은 전적으로 네가 정한다.</p>`;
  const btn = document.createElement('button');
  btn.className = 'start-btn';
  btn.textContent = '첫 장면 시작';
  btn.addEventListener('click', () => sendAction('게임을 시작한다. 입학식 당일 오전 8시 40분, 대강당 앞의 현재 장면을 열어라. 카일의 행동이나 대사는 대신 정하지 마라.'));
  box.append(btn);
  story.append(box);
}

function renderAll() {
  story.innerHTML = '';
  if (!save.renderedTurns?.length) appendWelcome();
  else save.renderedTurns.forEach(renderTurnRecord);
  updateStatus();
  renderInfo();
  scrollBottom(false);
}

function renderTurnRecord(record) {
  if (record.action) {
    const user = document.createElement('div');
    user.className = 'user-action';
    user.textContent = record.action;
    story.append(user);
  }
  const turn = record.turn;
  if (!turn) return;
  const card = document.createElement('section');
  card.className = 'turn-card';
  const head = document.createElement('div');
  head.className = 'turn-head';
  const cachePct = Math.round(Number(record.usage?.cache_hit_rate || 0) * 100);
  const usageTag = record.usage && record.route?.tier !== 'demo' ? ` · $${Number(record.usage.estimated_usd || 0).toFixed(4)} · cache ${cachePct}%` : '';
  head.innerHTML = `<span>${escapeHtml(turn.scene_title || '장면')}</span><span>${escapeHtml(record.route?.tier || 'demo')}${usageTag}</span>`;
  card.append(head);

  if (turn.cg_id && ASSETS.cg[turn.cg_id]) {
    const cg = document.createElement('div'); cg.className = 'cg-card';
    const img = document.createElement('img'); img.src = ASSETS.cg[turn.cg_id]; img.alt = turn.cg_id; cg.append(img); card.append(cg);
  }

  const shown = new Map();
  for (const item of turn.scene || []) {
    if (item.kind === 'dialogue') {
      const d = document.createElement('div'); d.className = 'dialogue';
      const finalExpression = item.display_expression || item.expression || save.emotionStates?.[item.speaker_key]?.current || 'default';
      if (item.speaker_key && (!shown.has(item.speaker_key) || shown.get(item.speaker_key) !== finalExpression)) {
        d.append(createPortrait(item.speaker_key, finalExpression, item.speaker_name));
        shown.set(item.speaker_key, finalExpression);
      }
      const sp = document.createElement('div'); sp.className = 'speaker'; sp.textContent = `💬 ${item.speaker_name || item.speaker_key || 'NPC'}`;
      const t = document.createElement('div'); t.className = 'dialogue-text'; t.textContent = `“${item.text}”`;
      d.append(sp,t);
      if (settings.showEmotionDebug && item.speaker_key) {
        const dbg = document.createElement('div'); dbg.className = 'emotion-debug';
        const detected = item.detected_expression || item.expression || 'default';
        const intensity = Number(item.emotion_intensity || 0).toFixed(2);
        const confidence = Number(item.emotion_confidence || 0).toFixed(2);
        dbg.textContent = `표정 ${finalExpression} ← 감지 ${detected} · 강도 ${intensity} · 확신 ${confidence}${item.emotion_transition ? ` · ${item.emotion_transition}` : ''}`;
        d.append(dbg);
      }
      card.append(d);
    } else {
      const n = document.createElement('div'); n.className = 'narration'; n.textContent = item.text; card.append(n);
    }
  }
  if (settings.showResolutionLog && turn.resolution_log?.triggered && Array.isArray(turn.resolution_log.abilities) && turn.resolution_log.abilities.length) {
    const log = document.createElement('details'); log.className = 'resolution-log'; log.open = true;
    const outcomeLabels = { success: '성공', partial: '부분 성공', failure: '실패' };
    const roleLabels = { primary: '핵심', support: '보조', passive: '패시브' };
    const summary = document.createElement('summary');
    const abilityHeadline = turn.resolution_log.abilities.map((row) => `${row.name}${row.grade ? ` ${row.grade}` : ''}`).join(' · ');
    summary.textContent = `⚔ 판정 로그 · ${outcomeLabels[turn.resolution_log.outcome] || '판정'} · ${abilityHeadline}`;
    log.append(summary);
    for (const row of turn.resolution_log.abilities) {
      const line = document.createElement('div'); line.className = 'resolution-line';
      const icon = row.kind === 'stat' ? '◆' : row.kind === 'trait' ? '◇' : row.kind === 'authority' ? '✦' : '▸';
      line.textContent = `${icon} ${row.name}${row.grade ? ` ${row.grade}` : ''} [${roleLabels[row.role] || '보조'}] — ${row.reason}`;
      log.append(line);
    }
    if (turn.resolution_log.summary) {
      const verdict = document.createElement('div'); verdict.className = 'resolution-summary'; verdict.textContent = `→ ${turn.resolution_log.summary}`; log.append(verdict);
    }
    card.append(log);
  }
  for (const notice of record.notices || []) {
    const n = document.createElement('div'); n.className = 'progress-notice'; n.textContent = `✦ ${notice}`; card.append(n);
  }
  if (record.usage?.cold_cache) {
    const n = document.createElement('div'); n.className = 'cache-notice';
    n.textContent = '첫 호출/캐시 만료 턴: 세계관 프롬프트 캐시를 새로 만드는 턴이라 비용이 평소보다 높을 수 있음.';
    card.append(n);
  }
  story.append(card);
  renderChoices(turn.choices || []);
}
function escapeHtml(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function renderChoices(choices) {
  choicesEl.innerHTML = '';

  // 선택지는 고정 오버레이가 아니라 최신 GM 턴 바로 뒤의 본문 흐름에 둔다.
  // 기존 위치가 어디든 story의 맨 끝으로 이동한다.
  story.append(choicesEl);

  if (!choices.length) {
    choicesEl.classList.add('hidden');
    return;
  }

  choices.forEach((choice, idx) => {
    const b = document.createElement('button');
    b.className = 'choice-btn';
    b.textContent = `${idx+1}. ${choice}`;
    b.addEventListener('click', () => {
      actionInput.value = choice;
      actionInput.focus();
      choicesEl.classList.add('hidden');
    });
    choicesEl.append(b);
  });

  choicesEl.classList.remove('hidden');
}

function updateStatus(route) {
  $('timeStatus').textContent = `D+${save.world.dayElapsed} · ${save.world.date} ${save.world.weekday} ${save.world.time}`;
  $('locationStatus').textContent = save.world.location;
  if (route) $('routeStatus').textContent = `${route.tier.toUpperCase()} · ${route.reasoning_effort}${route.reasoning_mode === 'pro' ? ' · PRO' : ''}`;
  $('costStatus').textContent = `턴 $${Number(save.usage.lastTurnUsd || 0).toFixed(4)} / Σ$${Number(save.usage.estimatedUsd || 0).toFixed(3)}`;
}

function renderInfo() {
  const rel = Object.entries(save.relationships || {}).map(([key,v]) => `${npcName(key)}[${REL_STAGE_LABELS[v.stage] || '낯선 사이'} · 호감 ${v.affinity||0} / 신뢰 ${v.trust||0}${v.status ? ` / ${v.status}`:''}]`).join(', ') || '-';
  const intimacy = Object.entries(save.intimacyStates || {}).filter(([,v]) => Number(v?.level || 0) > 0)
    .map(([key,v]) => `${npcName(key)}[L${Math.min(4, Number(v.level||0))}${Number(v.level||0)>=5 ? '/MAX':''}${v.status ? ` · ${v.status}`:''}]`)
    .join(', ') || '-';
  const skills = Object.entries(save.pc.skills || {}).map(([k,v]) => `${k} ${v.grade} [${Number(v.hiddenXp||0)}/100]`).join(' | ');
  const stats = Object.entries(save.pc.stats || {}).map(([k,v]) => `- ${k}: ${v.grade} [${v.progress}/100]`).join('\n');
  const traits = Object.keys(save.pc.traits || {}).join(' | ') || '-';
  const authorities = Object.keys(save.pc.authorities || {}).join(' | ') || '-';
  const learning = Object.entries(save.pc.skillCandidates || {}).map(([k,v]) => `${k} [${Number(v.progress||0)}/100]`).join(' | ') || '-';
  const awakening = ['trait','authority'].flatMap((kind) => Object.entries(save.pc.awakeningCandidates?.[kind] || {}).map(([k,v]) => `${kind === 'trait' ? 'Trait' : 'Authority'} ${k} [${Number(v.progress||0)}/100 · 이정표 ${Number(v.milestones||0)}]`)).join(' | ') || '-';
  $('infoContent').textContent = `경지: ${save.pc.realm} | 소속: 루멘시아 아카데미\n---------\n직위: ${save.pc.department} | 상황: 🟢\n---------\n스킬: ${skills}\n습득 후보: ${learning}\nTrait: ${traits}\nAuthority: ${authorities}\n각성 후보: ${awakening}\n---------\n스탯:\n${stats}\n---------\n🔮[魔] ${save.pc.talents.magic} | ⚔️[武] ${save.pc.talents.martial} | 🌟[魂] ${save.pc.talents.soul} | 📘[智] ${save.pc.talents.knowledge}\n---------\n상태: ${save.pc.status} | 피로 ${save.pc.fatigue}/100\n💼: ${save.pc.inventory.join(', ')}, 금화 ${save.pc.gold}G\n관계: ${rel}\n친밀도(성인모드): ${intimacy}\n---------\n진행 사건: ${save.activeEvents.join(', ') || '-'}\n예정 사건: ${save.scheduledEvents.join(', ') || '-'}\n세계 장기 사건: ${save.worldArcs.join(', ') || '-'}\n시스템 큐: NPC 일정 ${save.npcSchedule?.length || 0} / 소문 ${save.rumorQueue?.length || 0} / 지연 결과 ${save.consequenceQueue?.length || 0}\n토큰 누적: 입력 ${save.usage.inputTokens || 0} / 캐시 ${save.usage.cachedTokens || 0} / 출력 ${save.usage.outputTokens || 0} / 추론 ${save.usage.reasoningTokens || 0}\n직전 턴: 입력 ${save.usage.lastInputTokens || 0} / 출력 ${save.usage.lastOutputTokens || 0} / 캐시 적중 ${Math.round(Number(save.usage.lastCacheHitRate || 0)*100)}% / 비용 $${Number(save.usage.lastTurnUsd || 0).toFixed(4)}\n누적 API 비용(추정): $${Number(save.usage.estimatedUsd || 0).toFixed(4)}\n영구 타임라인: ${save.timeline?.length || 0}건 | NPC 감정상태: ${Object.keys(save.emotionStates || {}).length}명`;
}

function applyDelta(delta = {}) {
  const notices = [];
  advanceTime(clamp(delta.advance_minutes, 0, 1440));
  if (delta.new_location) save.world.location = delta.new_location;
  if (delta.pc_status) save.pc.status = delta.pc_status;
  save.pc.fatigue = clamp(save.pc.fatigue + clamp(delta.fatigue_delta, -10, 10), 0, 100);
  save.pc.gold = Math.max(0, save.pc.gold + clamp(delta.gold_delta, -10000, 10000));

  for (const row of delta.stat_progress || []) {
    const stat = save.pc.stats[row.stat]; if (!stat) continue;
    const gained = clamp(row.amount, 0, progressionGainCap(stat.grade));
    if (gained <= 0) continue;
    notices.push(`스탯 경험: ${row.stat} +${gained}${progressionReason(row.reason)}`);
    let progress = Math.max(0, Number(stat.progress || 0) + gained);
    while (progress >= 100) {
      progress -= 100;
      const before = stat.grade;
      stat.grade = nextGrade(stat.grade);
      if (stat.grade !== before) notices.push(`스탯 상승: ${row.stat} ${before} → ${stat.grade}`);
      else { progress = 99; break; }
    }
    stat.progress = clamp(progress, 0, 99);
  }

  for (const row of delta.skill_experience || []) {
    const skill = save.pc.skills[row.skill];
    if (!skill) continue;
    const gained = clamp(row.amount, 0, progressionGainCap(skill.grade));
    if (gained <= 0) continue;
    notices.push(`스킬 경험: ${row.skill} +${gained}${progressionReason(row.reason)}`);
    let xp = Math.max(0, Number(skill.hiddenXp || 0) + gained);
    while (xp >= 100) {
      xp -= 100;
      const before = skill.grade;
      skill.grade = nextGrade(skill.grade);
      if (skill.grade !== before) notices.push(`스킬 상승: ${row.skill} ${before} → ${skill.grade}`);
      else { xp = 99; break; }
    }
    skill.hiddenXp = clamp(xp, 0, 99);
  }

  // 아직 없는 독립 기술은 후보 진척도를 누적하고 100/100에서 정식 F등급 스킬로 등록한다.
  for (const row of delta.skill_learning || []) {
    const name = String(row?.skill || '').trim();
    if (!name || save.pc.skills[name]) continue;
    const old = save.pc.skillCandidates[name] || { progress: 0, basis: null, reason: null, updatedAtTurn: -1 };
    const gained = skillLearningGainCap(row.amount);
    const progress = clamp(Number(old.progress || 0) + gained, 0, 100);
    save.pc.skillCandidates[name] = {
      ...old,
      progress,
      basis: row.basis || old.basis || null,
      reason: row.reason || old.reason || null,
      updatedAtTurn: save.turnNumber + 1,
    };
    notices.push(`스킬 습득 진척: ${name} +${gained} [${progress}/100]${progressionReason(row.reason)}`);
    if (progress >= 100) {
      save.pc.skills[name] = { grade: 'F', hiddenXp: 0, acquiredAtTurn: save.turnNumber + 1, origin: row.reason || old.reason || '훈련과 실전으로 습득' };
      delete save.pc.skillCandidates[name];
      notices.push(`신규 스킬 습득: ${name} F`);
    }
  }

  // Trait/Authority 후보는 진척도와 결정적 이정표를 동시에 요구한다.
  for (const row of delta.awakening_progress || []) {
    const kind = row?.kind === 'authority' ? 'authority' : 'trait';
    const name = String(row?.name || '').trim();
    if (!name) continue;
    const owned = kind === 'authority' ? save.pc.authorities : save.pc.traits;
    if (owned[name]) continue;
    const pool = save.pc.awakeningCandidates[kind] || (save.pc.awakeningCandidates[kind] = {});
    const old = pool[name] || { progress: 0, milestones: 0, description: '', limitation: '', reasons: [] };
    const gained = awakeningGainCap(kind, row.amount, row.milestone);
    const milestones = Number(old.milestones || 0) + (row.milestone ? 1 : 0);
    const neededMilestones = kind === 'authority' ? 4 : 3;
    let progress = clamp(Number(old.progress || 0) + gained, 0, 100);
    if (progress >= 100 && milestones < neededMilestones) progress = 99;
    pool[name] = {
      progress,
      milestones,
      description: row.description || old.description,
      limitation: row.limitation || old.limitation,
      reasons: [...(old.reasons || []), row.reason].filter(Boolean).slice(-8),
      updatedAtTurn: save.turnNumber + 1,
    };
    notices.push(`${kind === 'authority' ? '권능' : '특성'} 각성 징후: ${name} +${gained} [${progress}/100 · 이정표 ${milestones}/${neededMilestones}]${progressionReason(row.reason)}`);
    if (progress >= 100 && milestones >= neededMilestones) {
      owned[name] = {
        description: pool[name].description,
        limitation: pool[name].limitation,
        awakenedAtTurn: save.turnNumber + 1,
        source: row.reason,
      };
      delete pool[name];
      notices.push(`${kind === 'authority' ? '권능 각성' : '특성 각성'}: ${name}`);
    }
  }

  const relationshipTouched = new Set();
  for (const row of delta.relationship_changes || []) {
    if (!isRegisteredNpcKey(row?.npc_key)) continue;
    const r = save.relationships[row.npc_key] || { affinity: 0, trust: 0, status: '중립', stage:'stranger', milestones:[], history: [] };
    const affinityDelta = clamp(row.affinity_delta, -10, 10);
    const trustDelta = clamp(row.trust_delta, -10, 10);
    r.affinity = clamp(Number(r.affinity || 0) + affinityDelta, -100, 100);
    r.trust = clamp(Number(r.trust || 0) + trustDelta, -100, 100);
    if (row.status) r.status = row.status;
    r.milestones = Array.isArray(r.milestones) ? r.milestones : [];
    r.history = [...(r.history || []), row.reason].filter(Boolean).slice(-30);
    save.relationships[row.npc_key] = r;
    relationshipTouched.add(row.npc_key);
    const bits = [];
    if (affinityDelta) bits.push(`호감 ${affinityDelta > 0 ? '+' : ''}${affinityDelta}`);
    if (trustDelta) bits.push(`신뢰 ${trustDelta > 0 ? '+' : ''}${trustDelta}`);
    if (bits.length || row.status) notices.push(`관계 변화: ${npcName(row.npc_key)} ${bits.join(' / ')}${row.status ? ` · ${row.status}` : ''}${progressionReason(row.reason)}`);
  }

  for (const row of delta.relationship_milestones_add || []) {
    if (!isRegisteredNpcKey(row?.npc_key)) continue;
    const r = save.relationships[row.npc_key] || { affinity: 0, trust: 0, status: '중립', stage:'stranger', milestones:[], history: [] };
    const sig = `${row.kind}|${row.description}`;
    const existing = Array.isArray(r.milestones) ? r.milestones : [];
    if (!existing.some((x) => `${x?.kind}|${x?.description}` === sig)) {
      r.milestones = [...existing, { kind:row.kind, description:row.description, reason:row.reason, turn:save.turnNumber + 1 }].slice(-12);
      notices.push(`관계 이정표: ${npcName(row.npc_key)} — ${row.description}`);
    }
    save.relationships[row.npc_key] = r;
    relationshipTouched.add(row.npc_key);
  }

  for (const key of relationshipTouched) {
    const r = save.relationships[key];
    const before = r.stage || 'stranger';
    const after = relationshipStage(r);
    r.stage = after;
    if (before !== after) notices.push(`관계 단계: ${npcName(key)} ${REL_STAGE_LABELS[before] || before} → ${REL_STAGE_LABELS[after] || after}`);
  }

  for (const row of delta.intimacy_changes || []) {
    if (!isRegisteredNpcKey(row?.npc_key)) continue;
    if (Number(save.pc?.age || 0) < 18) continue;
    const r = save.intimacyStates[row.npc_key] || { level: 0, status: '없음', history: [] };
    const step = clamp(row.level_delta, -1, 1);
    r.level = clamp(Number(r.level || 0) + step, 0, 5);
    if (row.status) r.status = row.status;
    r.history = [...(r.history || []), row.reason].filter(Boolean).slice(-30);
    save.intimacyStates[row.npc_key] = r;
  }

  for (const row of delta.npc_state_updates || []) {
    if (!isRegisteredNpcKey(row?.npc_key)) continue;
    const old = save.npcStates[row.npc_key] || {};
    const shortGoal = row.short_term_goal || row.current_goal || null;
    const shortChanged = Boolean(shortGoal && shortGoal !== (old.short_term_goal || old.current_goal));
    save.npcStates[row.npc_key] = {
      ...old,
      ...(row.location ? { location: row.location } : {}),
      ...(row.status ? { status: row.status } : {}),
      ...(row.current_goal ? { current_goal: row.current_goal } : {}),
      ...(row.long_term_goal ? { long_term_goal: row.long_term_goal } : {}),
      ...(shortGoal ? { short_term_goal: shortGoal, current_goal: shortGoal } : {}),
      ...(row.goal_progress != null ? { goal_progress: clamp(row.goal_progress, 0, 100) } : shortChanged ? { goal_progress: 0 } : {}),
      ...(row.obstacle ? { obstacle: row.obstacle } : {}),
      ...(row.goal_reason ? { goal_reason: row.goal_reason } : {}),
      ...(row.next_activity ? { next_activity: row.next_activity } : {}),
      ...(row.next_location ? { next_location: row.next_location } : {}),
      ...(row.next_change_minutes != null ? { next_change_minutes: clamp(row.next_change_minutes, 0, 10080) } : {}),
      ...(row.last_seen ? { last_seen: row.last_seen } : {}),
      updatedAtTurn: save.turnNumber + 1,
    };
  }

  // 실제 미래 이동 계획만 예약한다. 같은 NPC/장소/활동/시각 중복은 제거한다.
  const nowMinute = absoluteGameMinutes();
  for (const row of delta.npc_schedule_updates || []) {
    if (!isRegisteredNpcKey(row?.npc_key)) continue;
    const dueMinute = nowMinute + clamp(row.delay_minutes, 1, 10080);
    const signature = `${row.npc_key}|${dueMinute}|${row.location}|${row.activity}`;
    if ((save.npcSchedule || []).some((x) => x.signature === signature)) continue;
    save.npcSchedule.push({ id:queueId('npc'), signature, npc_key:row.npc_key, dueMinute, location:row.location, activity:row.activity, reason:row.reason });
    save.npcSchedule = save.npcSchedule.slice(-80);
    const old = save.npcStates[row.npc_key] || {};
    save.npcStates[row.npc_key] = { ...old, next_activity:row.activity, next_location:row.location, next_change_minutes:clamp(row.delay_minutes,1,10080) };
  }

  save.pc.inventory = uniq([...save.pc.inventory, ...(delta.items_add || [])]).filter(x => !(delta.items_remove || []).includes(x));

  // 사건은 현재 진행 / 미래 예정 / 세계 장기 사건으로 분리한다. 같은 이름은 한 버킷에만 둔다.
  const activeRemove = new Set(delta.active_events_remove || []);
  const scheduledRemove = new Set(delta.scheduled_events_remove || []);
  const worldRemove = new Set(delta.world_arcs_remove || []);
  let active = uniq([...(save.activeEvents || []), ...(delta.active_events_add || [])]).filter((x) => !activeRemove.has(x));
  let scheduled = uniq([...(save.scheduledEvents || []), ...(delta.scheduled_events_add || [])]).filter((x) => !scheduledRemove.has(x));
  let worldArcs = uniq([...(save.worldArcs || []), ...(delta.world_arcs_add || [])]).filter((x) => !worldRemove.has(x));
  const completedAdd = uniq(delta.completed_events_add || []);
  save.completedEvents = uniq([...(save.completedEvents || []), ...completedAdd]);
  const completed = new Set(save.completedEvents);

  active = active.filter((x) => !completed.has(x));
  const activeSet = new Set(active);
  scheduled = scheduled.filter((x) => !completed.has(x) && !activeSet.has(x));
  const scheduledSet = new Set(scheduled);
  worldArcs = worldArcs.filter((x) => !completed.has(x) && !activeSet.has(x) && !scheduledSet.has(x));
  save.activeEvents = active;
  save.scheduledEvents = scheduled;
  save.worldArcs = worldArcs;
  save.pcKnowledge = uniq([...save.pcKnowledge, ...(delta.pc_knowledge_add || [])]).slice(-300);

  for (const m of delta.memories_add || []) {
    if (m.owner === 'world' || m.owner === 'global') save.memories.global = addMemoryUnique(save.memories.global, m, 300);
    else {
      const key = String(m.owner || '').replace(/^npc:/, '');
      if (!isRegisteredNpcKey(key)) continue;
      save.memories.npc[key] = addMemoryUnique(save.memories.npc[key], m, 120);
    }
  }

  for (const row of delta.rumors_add || []) {
    const targets = uniq((row.target_npc_keys || []).filter(isRegisteredNpcKey));
    if (!row.fact || !targets.length) continue;
    const signature = `${row.fact}|${targets.sort().join(',')}`;
    if ((save.rumorQueue || []).some((x) => x.signature === signature)) continue;
    save.rumorQueue.push({
      id: queueId('rumor'), signature, fact:row.fact, source_npc_key:isRegisteredNpcKey(row.source_npc_key) ? row.source_npc_key : null,
      target_npc_keys:targets, credibility:clamp(row.credibility,0,1), dueTurn:save.turnNumber + 1 + clamp(row.delay_turns,0,20), reason:row.reason,
    });
    save.rumorQueue = save.rumorQueue.slice(-80);
  }

  const consequenceNow = absoluteGameMinutes();
  for (const row of delta.delayed_consequences_add || []) {
    if (!row.event_name) continue;
    const dueMinute = consequenceNow + clamp(row.delay_minutes,1,43200);
    const signature = `${row.event_name}|${row.target_bucket}|${dueMinute}`;
    if ((save.consequenceQueue || []).some((x) => x.signature === signature || x.event_name === row.event_name)) continue;
    if ((save.activeEvents || []).includes(row.event_name) || (save.worldArcs || []).includes(row.event_name) || (save.completedEvents || []).includes(row.event_name)) continue;
    save.consequenceQueue.push({
      id:queueId('consequence'), signature, event_name:row.event_name, target_bucket:row.target_bucket === 'world' ? 'world' : 'active',
      dueMinute, reason:row.reason, secret_level:clamp(row.secret_level,0,5),
    });
    save.consequenceQueue = save.consequenceQueue.slice(-80);
  }

  return notices;
}

function applyEmotionUpdates(updates = []) {
  for (const row of updates || []) {
    if (!row?.npc_key || !row?.state || !isRegisteredNpcKey(row.npc_key)) continue;
    save.emotionStates[row.npc_key] = { ...row.state };
  }
}

function addTimeline(turn) {
  if (!turn?.scene_summary) return;
  save.timeline.push({
    turn: save.turnNumber + 1,
    date: save.world.date,
    time: save.world.time,
    location: save.world.location,
    importance: turn.importance || 'routine',
    summary: String(turn.scene_summary).slice(0,1200),
  });
  save.timeline = save.timeline.slice(-500);
}

function rebuildRollingSummary() {
  const rows = save.timeline || [];
  const MAX_CHARS = 5000;
  const recent = rows.slice(-6);
  const recentTurns = new Set(recent.map(x => x.turn));
  const olderPriority = rows
    .filter(x => !recentTurns.has(x.turn) && x.importance !== 'routine')
    .sort((a,b) => (b.importance === 'critical' ? 2 : 1) - (a.importance === 'critical' ? 2 : 1) || b.turn - a.turn);

  const picked = new Map();
  const lineFor = (x, summaryMax) => {
    const summary = String(x.summary || '');
    const trimmed = summary.length > summaryMax ? `${summary.slice(0, summaryMax)}…` : summary;
    return `[T${x.turn} ${x.date} ${x.time} ${x.location} ${x.importance}] ${trimmed}`;
  };

  // 최근 6턴은 모두 보존하되 각 요약만 압축한다.
  for (const row of recent) picked.set(row.turn, lineFor(row, 430));
  let used = [...picked.values()].reduce((sum, line) => sum + line.length + 1, 0);

  // 남은 예산에는 오래된 critical/important 사건을 통째로 넣는다. 문자열 중간 절단은 하지 않는다.
  for (const row of olderPriority) {
    const line = lineFor(row, row.importance === 'critical' ? 520 : 380);
    if (used + line.length + 1 > MAX_CHARS) continue;
    picked.set(row.turn, line);
    used += line.length + 1;
    if (picked.size >= 14) break;
  }

  save.rollingSummary = [...picked.entries()]
    .sort((a,b) => a[0] - b[0])
    .map(([, line]) => line)
    .join('\n');
}

function compactState() {
  const now = absoluteGameMinutes();
  return {
    version: save.version, turnNumber: save.turnNumber, world: save.world, pc: save.pc, relationships: save.relationships, intimacyStates: save.intimacyStates, npcStates: save.npcStates,
    emotionStates: save.emotionStates, activeEvents: save.activeEvents, scheduledEvents: save.scheduledEvents, worldArcs: save.worldArcs, completedEvents: save.completedEvents,
    pcKnowledge: save.pcKnowledge, memories: save.memories,
    npcSchedule: (save.npcSchedule || []).map((x)=>({ ...x, remaining_minutes:Math.max(0, Number(x.dueMinute||0)-now) })),
    rumorQueue: (save.rumorQueue || []).map((x)=>({ ...x, remaining_turns:Math.max(0, Number(x.dueTurn||0)-Number(save.turnNumber||0)) })),
    consequenceQueue: (save.consequenceQueue || []).map((x)=>({ ...x, remaining_minutes:Math.max(0, Number(x.dueMinute||0)-now) })),
    flags: save.flags,
  };
}

async function sendAction(action) {
  action = String(action || '').trim();
  if (!action || busy) return;
  busy = true; sendBtn.disabled = true; actionInput.disabled = true; choicesEl.classList.add('hidden');
  const loader = document.createElement('div'); loader.className = 'turn-card'; loader.innerHTML = '<div class="loading-dots"><i></i><i></i><i></i></div>'; story.append(loader); scrollBottom();
  try {
    processDueSystems();
    const { accessToken, ...apiSettings } = settings;
    const payload = { action, saveState: compactState(), recentTurns: save.recentTurns, rollingSummary: save.rollingSummary, availableCgIds: Object.keys(ASSETS.cg || {}), forceTerra: forceTerraOnce, ...apiSettings };
    let data;
    if (settings.demoMode) data = demoResponse(action);
    else {
      const res = await fetch('/api/chat', { method: 'POST', headers: {'Content-Type':'application/json', 'X-Lumensia-Token': accessToken || ''}, body: JSON.stringify(payload) });
      const raw = await res.text();
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 280);
        throw new Error(`서버 응답 형식 오류 (HTTP ${res.status})${preview ? `\n${preview}` : ''}`);
      }
      if (!res.ok) throw new Error(`${data.error || `API 오류 (HTTP ${res.status})`}${data.request_id ? `\nRequest ID: ${data.request_id}` : ''}`);
    }
    loader.remove();
    const notices = applyDelta(data.turn.state_delta);
    applyEmotionUpdates(data.turn.emotion_updates || []);
    addTimeline(data.turn);
    rebuildRollingSummary();
    const record = { action, turn: data.turn, route: data.route, usage: data.usage, notices, at: new Date().toISOString() };
    save.turnNumber += 1;
    processDueSystems();
    save.recentTurns.push({ action, summary: data.turn.scene_summary, scene: data.turn.scene.slice(0,10) });
    save.recentTurns = save.recentTurns.slice(-8);
    save.renderedTurns.push(record); save.renderedTurns = save.renderedTurns.slice(-80);
    if (data.usage) {
      save.usage.inputTokens += data.usage.input_tokens || 0;
      save.usage.outputTokens += data.usage.output_tokens || 0;
      save.usage.cachedTokens += data.usage.cached_tokens || 0;
      save.usage.cacheWriteTokens += data.usage.cache_write_tokens || 0;
      save.usage.estimatedUsd += data.usage.estimated_usd || 0;

      // 직전 턴 사용량/비용 표시용 값.
      save.usage.lastTurnUsd = data.usage.estimated_usd || 0;
      save.usage.lastCacheHitRate = data.usage.cache_hit_rate || 0;
      save.usage.lastInputTokens = data.usage.input_tokens || 0;
      save.usage.lastOutputTokens = data.usage.output_tokens || 0;
      save.usage.lastReasoningTokens = data.usage.reasoning_tokens || 0;
    }
    forceTerraOnce = false; updateForceTerraButton();
    save.flags.forceTerraNextTurn = false;
    save.flags.majorScene = data.turn.importance === 'critical';
    persist();
    writeBackupSnapshot('checkpoint');
    renderTurnRecord(record); updateStatus(data.route); renderInfo(); actionInput.value = ''; scrollBottom();
  } catch (err) {
    loader.remove();
    const e = document.createElement('div'); e.className = 'error-card'; e.textContent = err.message || String(err); story.append(e); scrollBottom();
  } finally { busy = false; sendBtn.disabled = false; actionInput.disabled = false; actionInput.focus(); }
}

function demoResponse(action) {
  const first = save.turnNumber === 0;
  const turn = first ? {
    scene_title: '입학식 전, 대강당 앞', importance: 'routine', cg_id: null,
    resolution_log: { triggered:false, outcome:'none', summary:null, abilities:[] },
    scene: [
      {kind:'narration', text:'대강당을 둘러싼 흰 석조 회랑에 아침 햇살이 비친다. 신입생들의 목소리 사이로 검집이 부딪히는 소리와 마법 도구의 미세한 진동음이 섞인다.', speaker_key:null, speaker_name:null, expression:null},
      {kind:'dialogue', text:'너도 기사과야? 그 대검, 꽤 오래 쓴 것 같은데!', speaker_key:'lilia', speaker_name:'릴리아', expression:'smile'},
      {kind:'narration', text:'붉은 머리의 소녀가 거리낌 없이 다가오며 카일의 대검을 흥미롭게 살핀다.', speaker_key:null, speaker_name:null, expression:null}
    ],
    choices:['소녀에게 이름과 소속을 묻는다.','대검을 살피는 이유를 묻는다.','입학식 전에 가볍게 검을 맞춰보자고 제안한다.'],
    state_delta:{advance_minutes:3,new_location:null,pc_status:null,fatigue_delta:0,gold_delta:0,relationship_changes:[],stat_progress:[],skill_experience:[],items_add:[],items_remove:[],active_events_add:[],active_events_remove:[],scheduled_events_add:[],scheduled_events_remove:[],world_arcs_add:[],world_arcs_remove:[],completed_events_add:[],pc_knowledge_add:[],memories_add:[{owner:'npc:lilia',fact:'입학식 전 대강당 앞에서 카일의 오래된 대검에 먼저 관심을 보였다.',importance:'minor',secret_level:0}],npc_state_updates:[{npc_key:'lilia',location:'루멘시아 아카데미 대강당 앞',status:'카일에게 먼저 말을 건 상태',current_goal:'신입생 입학식 참가',last_seen:'1285-03-01 08:43'}]},
    scene_summary:'입학식 전 대강당 앞에서 릴리아가 카일의 대검에 관심을 보이며 먼저 말을 걸었다.'
  } : {
    scene_title:'데모 응답',importance:'routine',cg_id:null,resolution_log:{triggered:false,outcome:'none',summary:null,abilities:[]},
    scene:[{kind:'narration',text:`카일의 행동 「${action}」에 주변 상황이 반응한다. 데모 모드라 실제 AI 판정은 생략된다.`,speaker_key:null,speaker_name:null,expression:null}],choices:[],
    state_delta:{advance_minutes:1,new_location:null,pc_status:null,fatigue_delta:0,gold_delta:0,relationship_changes:[],stat_progress:[],skill_experience:[],items_add:[],items_remove:[],active_events_add:[],active_events_remove:[],scheduled_events_add:[],scheduled_events_remove:[],world_arcs_add:[],world_arcs_remove:[],completed_events_add:[],pc_knowledge_add:[],memories_add:[],npc_state_updates:[]},scene_summary:'데모 모드로 UI 동작을 확인했다.'
  };
  return { turn, route:{model:'demo',tier:'demo',reasoning_effort:'none',reasoning_mode:'standard',reason:'demo'}, usage:{input_tokens:0,output_tokens:0,cached_tokens:0,estimated_usd:0} };
}

function updateForceTerraButton() {
  const btn = $('forceTerraBtn');
  if (!btn) return;
  btn.textContent = forceTerraOnce ? 'TERRA 예약됨' : 'TERRA 1턴';
  btn.classList.toggle('active', forceTerraOnce);
}

function scrollBottom(smooth = true) { requestAnimationFrame(() => window.scrollTo({top: document.body.scrollHeight, behavior: smooth ? 'smooth':'auto'})); }

function ensureV12Ui() {
  document.title = '루멘시아 모바일 V1.3.9';
  const h1 = document.querySelector('h1');
  if (h1 && !h1.querySelector('.version-tag')) {
    const small = document.createElement('small'); small.className='version-tag'; small.textContent='V1.3.9'; h1.append(' ', small);
  }
  if (!$('showEmotionDebug')) {
    const demo = $('demoMode')?.closest('label');
    if (demo) {
      const label=document.createElement('label'); label.className='toggle-row';
      label.innerHTML='<input id="showEmotionDebug" type="checkbox" /><span>감정 태그 디버그 표시 (테스트용)</span>';
      demo.after(label);
    }
  }
  if (!$('showResolutionLog')) {
    const emotion = $('showEmotionDebug')?.closest('label') || $('demoMode')?.closest('label');
    if (emotion) {
      const label=document.createElement('label'); label.className='toggle-row';
      label.innerHTML='<input id="showResolutionLog" type="checkbox" /><span>판정 로그 표시 (사용 스킬/스탯 · 결과 근거)</span>';
      emotion.after(label);
    }
  }
  if (!$('v12DynamicStyle')) {
    const style=document.createElement('style'); style.id='v12DynamicStyle';
    style.textContent='.version-tag{font-size:10px;color:#d9b86c;font-weight:800;vertical-align:middle}.emotion-debug{margin:0 14px 12px;padding:6px 8px;border-radius:8px;background:rgba(99,102,241,.10);color:#b8c0ff;font-size:10px;line-height:1.4}.cache-notice{margin:8px 12px 14px;padding:8px 10px;border-radius:10px;background:rgba(59,130,246,.10);border:1px solid rgba(59,130,246,.25);color:#bfdbfe;font-size:10px;line-height:1.5}.asset-item.asset-warn{border-color:rgba(245,158,11,.65)}.asset-item.asset-warn div{color:#fcd34d}.asset-item.asset-fail{border-color:rgba(239,68,68,.65)}.asset-item.asset-fail div{color:#fecaca}.backup-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.backup-actions .secondary-btn{flex:1;min-width:130px}.backup-status{display:block;width:100%;font-size:10px;color:#94a3b8;margin-top:2px}.resolution-log{margin:10px 12px 12px;padding:9px 10px;border-radius:10px;background:rgba(217,184,108,.08);border:1px solid rgba(217,184,108,.28);font-size:11px;line-height:1.55}.resolution-log summary{cursor:pointer;color:#f5d990;font-weight:800;list-style:none}.resolution-log summary::-webkit-details-marker{display:none}.resolution-line{margin-top:6px;color:#d8dee9}.resolution-summary{margin-top:7px;padding-top:6px;border-top:1px solid rgba(217,184,108,.18);color:#f0e6c8}';
    document.head.append(style);
  }
}

ensureV12Ui();

actionForm.addEventListener('submit', e => { e.preventDefault(); sendAction(actionInput.value); });
actionInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); actionForm.requestSubmit(); } });
$('infoBtn').addEventListener('click', () => { renderInfo(); updateBackupControls(); $('infoDialog').showModal(); });
$('settingsBtn').addEventListener('click', () => $('settingsDialog').showModal());
$('newGameBtn').addEventListener('click', () => { if (confirm('현재 세이브를 지우고 새 게임을 시작할까?')) { clearBackupHistory(); save = defaultSave(); persist(); ensureBackupBaseline(); renderAll(); updateBackupControls(); } });
$('saveBtn').addEventListener('click', () => { persist(); toast('폰에 저장됨'); });
$('forceTerraBtn').addEventListener('click', () => { forceTerraOnce = !forceTerraOnce; updateForceTerraButton(); toast(forceTerraOnce ? '다음 1턴 Terra 사용' : 'Terra 예약 취소'); });
$('exportBtn').addEventListener('click', exportSave);
$('importInput').addEventListener('change', importSave);
$('restore10Btn')?.addEventListener('click', () => restoreBackup(10));
$('restore50Btn')?.addEventListener('click', () => restoreBackup(50));

for (const key of ['modelMode','reasoningEffort','proseLength']) { $(key).value = settings[key]; $(key).addEventListener('change', e => { settings[key] = e.target.value; persistSettings(); }); }
$('accessToken').value = settings.accessToken || ''; $('accessToken').addEventListener('change', e => { settings.accessToken = e.target.value.trim(); persistSettings(); });
for (const key of ['adultMode','proReasoning','demoMode','showEmotionDebug','showResolutionLog']) { const el=$(key); if (!el) continue; el.checked = Boolean(settings[key]); el.addEventListener('change', e => { settings[key] = e.target.checked; persistSettings(); }); }
$('assetTestBtn').addEventListener('click', testAssets);

function exportSave() {
  persist(); const blob = new Blob([JSON.stringify(save,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`lumensia-save-${save.world.date}-${save.world.time.replace(':','')}.json`; a.click(); URL.revokeObjectURL(a.href);
}
async function importSave(e) { const file=e.target.files?.[0]; if(!file)return; try { const parsed=JSON.parse(await file.text()); if(!parsed.pc||!parsed.world)throw new Error('세이브 형식이 아님'); clearBackupHistory(); save=normalizeSave(parsed); persist(); ensureBackupBaseline(); renderAll(); updateBackupControls(); toast('세이브 불러옴'); } catch(err){alert(`불러오기 실패: ${err.message}`);} e.target.value=''; }
function toast(text) { const d=document.createElement('div'); d.textContent=text; d.style.cssText='position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:99;background:#263449;padding:9px 14px;border-radius:999px'; document.body.append(d); setTimeout(()=>d.remove(),1300); }

async function checkHealth() { try { const r=await fetch('/api/health'); const h=await r.json(); $('apiHealth').textContent=h.apiConfigured?`API 연결 준비됨 · ${h.luna} / ${h.terra}${h.accessTokenRequired ? ' · 접속 토큰 필요' : ''}`:'API 키 미설정. Vercel 환경변수 OPENAI_API_KEY를 추가하거나 데모 모드를 켜세요.'; } catch { $('apiHealth').textContent='API 상태를 확인할 수 없음.'; } }

function probeImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    const done = (ok) => { img.onload = null; img.onerror = null; resolve(ok); };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = `${url}${url.includes('?') ? '&' : '?'}check=${Date.now()}`;
  });
}

async function testAssets() {
  const results=$('assetResults'); results.innerHTML=''; $('assetDialog').showModal();
  const keys=['lilia','anastasia','laris','aria','isabel','chloe','lena','veradin','bellian','aris','mirabelle'];
  for (const key of keys) {
    const char=ASSETS.characters[key];
    const preferred=char?.expressions?.smile || char?.default;
    const preferredName=char?.expressions?.smile ? 'SMILE' : 'DEFAULT';
    const item=document.createElement('div'); item.className='asset-item';
    const img=document.createElement('img');
    const label=document.createElement('div'); label.textContent=`${char?.name||key}: ${preferredName} 검사 중`;
    item.append(img,label); results.append(item);
    const preferredOk = await probeImage(preferred);
    if (preferredOk) {
      img.src=preferred; label.textContent=`${char.name}: ${preferredName} OK`;
      continue;
    }
    const fallback=char?.default;
    const defaultOk = fallback && fallback !== preferred ? await probeImage(fallback) : false;
    if (defaultOk) {
      img.src=fallback;
      label.textContent=`${char.name}: ${preferredName} 실패 → DEFAULT OK (게임은 자동 폴백)`;
      item.classList.add('asset-warn');
    } else {
      img.remove();
      label.textContent=`${char?.name||key}: ${preferredName}${fallback!==preferred?' + DEFAULT':''} 실패`;
      item.classList.add('asset-fail');
    }
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
persist(); ensureBackupBaseline(); updateForceTerraButton(); checkHealth(); renderAll(); updateBackupControls();
