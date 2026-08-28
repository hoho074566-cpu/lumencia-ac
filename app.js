import { ASSETS } from './assets.js';
import { migrateLegacyNpcKeys } from './save-migrations.js';
import { createFreeCharacterCreation, FATE_START_DEPARTMENTS, fateOriginLockOptions, fateStartLabels, generateFateStartingCharacter, normalizeCharacterCreation } from './lib/fate-start.js';
import { fateBookRuntimeSnapshot, inspectFateBook, reconcileFateBooks } from './lib/fate-ending.js';
import { FATE_INHERITANCE_KEY, inheritanceBalance, inspectInheritanceMeta, META_PROGRESSION_LOCK, prepareCanonicalProgressionImport, purchaseNextLifeSerialized, quoteInheritanceAllocations } from './lib/fate-inheritance.js';
import { captureRunOwnership, commitRunFateAndInheritance, isRunOwnershipCurrent, recoverPendingRunCommit, RUN_COMMIT_PENDING_KEY } from './lib/run-commit-boundary.js';
import { createNovelPresentationState, novelSceneTitle, resetNovelPresentationState, shouldShowNovelPortrait } from './lib/novel-presentation.js';

const APP_VERSION = '1.4.8';
const SAVE_KEY = 'lumensia.save.v1';
const SETTINGS_KEY = 'lumensia.settings.v1';
const FATE_BOOK_KEY = 'lumensia.fate-book.v1';
const INHERITANCE_PREVIEW_SESSION_KEY='lumensia.inheritance-preview.session.v1';
const RUN_COMMIT_KEYS = Object.freeze({saveKey:SAVE_KEY,fateBookKey:FATE_BOOK_KEY,inheritanceKey:FATE_INHERITANCE_KEY,pendingKey:RUN_COMMIT_PENDING_KEY});
const ALLOWED_CHARACTER_KEYS=Object.freeze(Object.keys(ASSETS.characters||{}));

const $ = (id) => document.getElementById(id);
const story = $('story');
const choicesEl = $('choices');
const actionForm = $('actionForm');
const actionInput = $('actionInput');
const sendBtn = $('sendBtn');
const novelPresentation = createNovelPresentationState();

const defaultSettings = {
  modelMode: 'auto',
  reasoningEffort: 'auto',
  proseLength: 'medium',
  adultMode: false,
  proReasoning: false,
  demoMode: false,
  accessToken: '',
  showEmotionDebug: false,
  developerMode: false,
};


const MEMORY_TYPE_LABELS = { fact:'FACT', observer:'OBSERVER', belief:'BELIEF', rumor:'RUMOR', promise:'PROMISE', deferred_hook:'DEFERRED', relationship:'RELATION', secret:'SECRET', event:'EVENT', obligation:'OBLIGATION', knowledge:'KNOWLEDGE' };
const DIRECTOR_NPC_DEPT = {
  lillia:'knight', laris:'knight', sera:'knight', isabel:'knight', artemis:'knight', anastasia:'knight',
  lena:'magic', sia:'magic', serena:'magic', chloe:'magic', elena:'magic', lucia:'magic', elise:'magic',
  mirabelle:'theology', aria:'theology', emily:'common'
};
const FATE_AFFINITY_ELIGIBLE_KEYS=Object.freeze(Object.keys(DIRECTOR_NPC_DEPT));
function pcDirectorDept() {
  const d = String(save?.pc?.department || '');
  if (/기사/.test(d)) return 'knight';
  if (/마법/.test(d)) return 'magic';
  if (/신학|성직|신성/.test(d)) return 'theology';
  return 'common';
}
const DEFAULT_SCHEDULE_EVENTS = [
  { id:'entrance_ceremony', title:'입학식', date:'1285-03-01', time:'09:00', location:'루멘시아 아카데미 대강당', kind:'academic', participants:['emily','lena'], importance:4, note:'09:00 에밀리 환영사. 09:15 레나 신입생 대표 짧은 연설과 기숙사/정오 학과 오리엔테이션 안내.', status:'scheduled' },
  { id:'knight_orientation', title:'기사과 1학년 오리엔테이션', date:'1285-03-01', time:'12:00', location:'기사과 지정 오리엔테이션 장소', kind:'academic', participants:['artemis','lillia','laris','sera','isabel'], importance:3, note:'기사과 1학년 대상.', status:'scheduled' },
  { id:'magic_orientation', title:'마법과 1학년 오리엔테이션', date:'1285-03-01', time:'12:00', location:'마법과 지정 오리엔테이션 장소', kind:'academic', participants:['elena','lena','sia','serena','chloe'], importance:3, note:'마법과 1학년 대상.', status:'scheduled' },
  { id:'theology_orientation', title:'신학부 1학년 오리엔테이션', date:'1285-03-01', time:'12:00', location:'신학부 지정 오리엔테이션 장소', kind:'academic', participants:['mirabelle'], importance:3, note:'신학부 1학년 대상.', status:'scheduled' },
];

function memoryImportance(value) {
  if (typeof value === 'number') return clamp(value, 1, 5);
  return ({ minor:2, routine:2, major:4, important:4, critical:5 }[String(value || '').toLowerCase()] || 2);
}
function normalizeMemoryRow(m = {}) {
  return { ...m, type: m.type || (Number(m.secret_level||0) >= 3 ? 'secret' : 'fact'), importance: memoryImportance(m.importance), secret_level: clamp(m.secret_level,0,5) };
}
function mergeDefaultSchedule(rows = []) {
  const map = new Map((Array.isArray(rows) ? rows : []).map(x => [x.id, {...x}]));
  for (const row of DEFAULT_SCHEDULE_EVENTS) if (!map.has(row.id)) map.set(row.id, {...row});
  return [...map.values()];
}
function dtKey(date, time='00:00') { return `${String(date||'0000-00-00')}T${String(time||'00:00').padStart(5,'0')}`; }
function minutesUntil(date, time) {
  if (date !== save.world.date) return null;
  return minutesFromTime(time) - minutesFromTime(save.world.time);
}
function npcScheduleSnapshot() {
  const out = {};
  if (save.world.date !== '1285-03-01') return out;
  const m = minutesFromTime(save.world.time);
  const set = (keys, commitment, area, confidence='fixed') => keys.forEach(key => out[key] = { commitment, area, confidence });
  const knight = ['lillia','laris','sera','isabel'];
  const magic = ['lena','sia','serena','chloe'];
  if (m < 570) { // before 09:30
    set([...knight,...magic,'mirabelle'], '09:00 입학식 참석', '대강당/대강당 앞 집결 동선', 'fixed');
    set(['emily'], '09:00 환영사', '대강당', 'fixed');
    set(['anastasia','lucia'], '입학식/학생회 운영', '대강당 일대', 'expected');
    set(['artemis','elena'], '입학식 및 신입생 일정 대응', '대강당/학과 동선', 'expected');
  } else if (m < 710) { // 09:30~11:49 free window
    set(knight, '12:00 기사과 오리엔테이션 예정', '기숙사 A·기사과 지정교실·교내 자유 동선', 'expected');
    set(magic, '12:00 마법과 오리엔테이션 예정', '기숙사 A·마법과 지정교실·교내 자유 동선', 'expected');
    set(['mirabelle'], '12:00 신학부 오리엔테이션 예정', '기숙사 A·신학부 지정교실·교내 자유 동선', 'expected');
    set(['artemis'], '12:00 기사과 오리엔테이션 준비', '기사과', 'fixed');
    set(['elena'], '12:00 마법과 오리엔테이션 준비', '마법과', 'fixed');
  } else if (m < 790) { // 11:50~13:09
    set(knight, '기사과 1학년 오리엔테이션', '기사과 지정 오리엔테이션 장소', 'fixed');
    set(magic, '마법과 1학년 오리엔테이션', '마법과 지정 오리엔테이션 장소', 'fixed');
    set(['mirabelle'], '신학부 1학년 오리엔테이션', '신학부 지정 오리엔테이션 장소', 'fixed');
    set(['artemis'], '기사과 오리엔테이션 진행', '기사과', 'fixed');
    set(['elena'], '마법과 오리엔테이션 진행', '마법과', 'fixed');
  }
  return out;
}
function refreshScheduleContext() {
  save.scheduledEvents = mergeDefaultSchedule(save.scheduledEvents);
  const now = dtKey(save.world.date, save.world.time);
  const completedIds = new Set(save.scheduledEvents.filter(x => x.status === 'completed').map(x => x.id));
  const due = [], upcoming = [];
  for (const ev of save.scheduledEvents) {
    if (!ev?.id || completedIds.has(ev.id) || ev.status === 'cancelled') continue;
    const key = dtKey(ev.date, ev.time);
    const compact = { id:ev.id, title:ev.title, date:ev.date, time:ev.time, location:ev.location||'', kind:ev.kind||'personal', participants:ev.participants||[], importance:memoryImportance(ev.importance), note:ev.note||'', status:ev.status||'scheduled' };
    if (key <= now) due.push(compact);
    else if (ev.date === save.world.date && Number(minutesUntil(ev.date, ev.time)) <= 240) upcoming.push(compact);
  }
  due.sort((x,y) => dtKey(x.date,x.time).localeCompare(dtKey(y.date,y.time)));
  upcoming.sort((x,y) => dtKey(x.date,x.time).localeCompare(dtKey(y.date,y.time)));
  save.scheduleContext = { now: { date:save.world.date, time:save.world.time, location:save.world.location }, due:due.slice(0,8), upcoming:upcoming.slice(0,8), npc_schedule:npcScheduleSnapshot() };
  return save.scheduleContext;
}

const defaultSave = () => ({
  version: 6,
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
  creation: createFreeCharacterCreation(),
  pc: {
    // 스키마 기본값은 특정 프리셋이 아닌 완전 중립값이어야 한다.
    // 새 캐릭터의 스킬/장비는 생성창에 사용자가 입력한 것만 저장한다.
    name: 'Aaa', age: 20, gender: '미지정', department: '미지정',
    origin: '', socialStatus: '', admission: '', appearance: '',
    characterSetting: '',
    realm: '비기너', status: '안정', fatigue: 0, gold: 0,
    talents: { magic: 5, martial: 5, soul: 5, knowledge: 5 },
    stats: {
      '신체': { grade: 'D', progress: 0 },
      '마나': { grade: 'D', progress: 0 },
      '지능': { grade: 'D', progress: 0 },
      '신성': { grade: 'F', progress: 0 },
    },
    skills: {},
    inventory: [],
  },
  relationships: {},
  intimacyStates: {},
  npcStates: {},
  emotionStates: {},
  timeline: [],
  activeEvents: ['입학식/학과 오리엔테이션', '신입생 기량평가', '회색 늑대의 숲', '황위 경쟁'],
  completedEvents: [],
  pcKnowledge: [],
  memories: { global: [], npc: {} },
  hooks: [],
  director: {
    version:1,
    npcExposure:{},
    recentBeats:[],
    recentSpotlights:[],
    callbacks:[],
    lastEventTurn:0,
    lastChoicePressureTurn:0,
    lastCrossDepartmentTurn:0,
  },
  scheduledEvents: DEFAULT_SCHEDULE_EVENTS.map(x => ({...x})),
  scheduleContext: {},
  debug: { lastRoute:null, lastUsage:null, lastMemoryAdds:[], lastRelationChanges:[], lastHookChanges:[], lastSchedule:null, lastRequestBytes:0, lastDirector:null },
  flags: { majorScene: false, forceTerraNextTurn: true },
  rollingSummary: '입학식 당일 08:40. PC는 루멘시아 아카데미 대강당 앞에 도착했으며 입학식 개막 전이다.',
  recentTurns: [],
  renderedTurns: [],
  usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, estimatedUsd: 0, lastTurnUsd: 0, lastCacheHitRate: 0, lastInputTokens: 0, lastOutputTokens: 0 },
});

recoverPendingRunCommit(localStorage,RUN_COMMIT_KEYS);
const loadedRunSave = loadJson(SAVE_KEY) || defaultSave();
let save = normalizeSave(loadedRunSave);
const initialFateInspection=inspectFateBook(readJsonStrict(FATE_BOOK_KEY),{allowedCharacterKeys:ALLOWED_CHARACTER_KEYS});
const initialInheritanceInspection=inspectInheritanceMeta(readJsonStrict(FATE_INHERITANCE_KEY));
if(!initialFateInspection.valid)throw new Error(`canonical Fate Book 손상: ${initialFateInspection.errors.join(' ')}`);
if(!initialInheritanceInspection.valid)throw new Error(`canonical Inheritance ledger 손상: ${initialInheritanceInspection.errors.join(' ')}`);
let fateBook = initialFateInspection.book;
let inheritanceMeta = initialInheritanceInspection.meta;
prepareCanonicalProgressionImport({currentFateBook:fateBook,currentInheritanceMeta:inheritanceMeta,incomingFateBook:fateBook,incomingInheritanceMeta:inheritanceMeta,incomingRun:save,allowedCharacterKeys:ALLOWED_CHARACTER_KEYS});
let settings = { ...defaultSettings, ...(loadJson(SETTINGS_KEY) || {}) };
let busy = false;
let forceTerraOnce = false;
let metaModeOnce = false;
let activeRunEpoch = 0;
let nextLifePreviewSeed = '';
let nextLifePreviewCount = 0;
let nextLifePreviewCharacter = null;
let nextLifePreviewSourceRunId = '';

function loadJsonFromStorage(storage,key){try{return JSON.parse(storage.getItem(key));}catch{return null;}}
function loadJson(key) { return loadJsonFromStorage(localStorage,key); }
function readJsonStrict(key){const raw=localStorage.getItem(key);if(raw==null)return null;try{return JSON.parse(raw);}catch{throw new Error(`${key} JSON이 손상됨.`);}}
function persist() { save.updatedAt = new Date().toISOString(); localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
function persistSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function replaceActiveRun(next){save=next;activeRunEpoch+=1;return save;}
function captureActiveRunOwnership(){return captureRunOwnership(save,activeRunEpoch);}
function isActiveRunOwner(owner){return isRunOwnershipCurrent(owner,save,activeRunEpoch);}
function assertActiveRunOwner(owner){if(!isActiveRunOwner(owner))throw new Error('active run이 변경되어 이전 async 결과를 폐기함.');}
function stageTurnCommit(owner){assertActiveRunOwner(owner);const stage={save,fateBook,inheritanceMeta};save=structuredClone(save);fateBook=structuredClone(fateBook);inheritanceMeta=structuredClone(inheritanceMeta);return stage;}
function rollbackTurnCommit(stage){if(!stage)return;save=stage.save;fateBook=stage.fateBook;inheritanceMeta=stage.inheritanceMeta;}
async function withMetaProgressionLock(task,{required=false}={}){
  if(globalThis.navigator?.locks?.request)return navigator.locks.request(META_PROGRESSION_LOCK,{mode:'exclusive'},task);
  if(required)throw new Error('이 브라우저에서는 안전한 Inheritance transaction lock을 사용할 수 없음.');
  return task();
}
function readCanonicalProgression(){
  const bookInspection=inspectFateBook(readJsonStrict(FATE_BOOK_KEY),{allowedCharacterKeys:ALLOWED_CHARACTER_KEYS}),metaInspection=inspectInheritanceMeta(readJsonStrict(FATE_INHERITANCE_KEY));
  if(!bookInspection.valid||!metaInspection.valid)throw new Error([...bookInspection.errors,...metaInspection.errors].join(' '));
  return{fateBook:bookInspection.book,inheritanceMeta:metaInspection.meta};
}
async function commitTurnState(stage,owner){
  assertActiveRunOwner(owner);save.updatedAt=new Date().toISOString();
  try{
    await withMetaProgressionLock(async()=>{
      assertActiveRunOwner(owner);
      const persistedRun=readJsonStrict(SAVE_KEY);if(persistedRun&&String(persistedRun.id)!==owner.runId)throw new Error('canonical active run이 변경되어 이전 async 결과를 폐기함.');
      const canonical=readCanonicalProgression(),prepared=prepareCanonicalProgressionImport({currentFateBook:canonical.fateBook,currentInheritanceMeta:canonical.inheritanceMeta,incomingFateBook:fateBook,incomingInheritanceMeta:inheritanceMeta,incomingRun:save,allowedCharacterKeys:ALLOWED_CHARACTER_KEYS});
      fateBook=prepared.fateBook;inheritanceMeta=prepared.inheritanceMeta;
      commitRunFateAndInheritance(localStorage,RUN_COMMIT_KEYS,{owner,isOwnerCurrent:isActiveRunOwner,nextRun:save,nextFateBook:fateBook,nextInheritanceMeta:inheritanceMeta});
    });
  }catch(error){rollbackTurnCommit(stage);throw error;}
}
if(loadedRunSave?.fateBook){
  const owner=captureActiveRunOwnership(),embeddedFateBook=loadedRunSave.fateBook,nextRun={...save};delete nextRun.fateBook;
  try{
    const prepared=prepareCanonicalProgressionImport({currentFateBook:fateBook,currentInheritanceMeta:inheritanceMeta,incomingFateBook:embeddedFateBook,incomingInheritanceMeta:inheritanceMeta,incomingRun:nextRun,allowedCharacterKeys:ALLOWED_CHARACTER_KEYS});
    commitRunFateAndInheritance(localStorage,RUN_COMMIT_KEYS,{owner,isOwnerCurrent:isActiveRunOwner,nextRun,nextFateBook:prepared.fateBook,nextInheritanceMeta:prepared.inheritanceMeta});
    save=nextRun;fateBook=prepared.fateBook;inheritanceMeta=prepared.inheritanceMeta;
  }catch(error){console.error('Legacy Fate Book migration rejected before embedded authority deletion',error);}
}else delete save.fateBook;
function uniq(arr) { return [...new Set((arr || []).filter(Boolean))]; }
function clamp(n, min, max) { return Math.min(max, Math.max(min, Number(n) || 0)); }

function normalizeSave(raw) {
  const base = defaultSave();
  const migrated = migrateLegacyNpcKeys(raw);
  const next = migrated && typeof migrated === 'object' ? migrated : base;
  next.version = 6;
  next.appVersion = APP_VERSION;
  next.world = { ...base.world, ...(next.world || {}) };
  next.creation = normalizeCharacterCreation(next.creation);
  next.pc = { ...base.pc, ...(next.pc || {}) };
  next.pc.stats = { ...base.pc.stats, ...(next.pc.stats || {}) };
  next.pc.skills = (next.pc.skills && typeof next.pc.skills === 'object' && !Array.isArray(next.pc.skills)) ? { ...next.pc.skills } : {};
  next.pc.inventory = Array.isArray(next.pc.inventory) ? [...next.pc.inventory] : [];
  next.relationships = next.relationships || {};
  next.intimacyStates = next.intimacyStates || {};
  next.npcStates = next.npcStates || {};
  next.emotionStates = next.emotionStates || {};
  next.timeline = Array.isArray(next.timeline) ? next.timeline : [];
  next.activeEvents = Array.isArray(next.activeEvents) ? next.activeEvents : [];
  next.completedEvents = Array.isArray(next.completedEvents) ? next.completedEvents : [];
  next.pcKnowledge = Array.isArray(next.pcKnowledge) ? next.pcKnowledge : [];
  next.memories = next.memories || { global: [], npc: {} };
  next.hooks = Array.isArray(next.hooks) ? next.hooks : [];
  next.director = { ...base.director, ...(next.director || {}) };
  next.director.npcExposure = next.director.npcExposure || {};
  next.director.recentBeats = Array.isArray(next.director.recentBeats) ? next.director.recentBeats : [];
  next.director.recentSpotlights = Array.isArray(next.director.recentSpotlights) ? next.director.recentSpotlights : [];
  next.director.callbacks = Array.isArray(next.director.callbacks) ? next.director.callbacks : [];
  next.memories.global = (Array.isArray(next.memories.global) ? next.memories.global : []).map(normalizeMemoryRow);
  next.memories.npc = next.memories.npc || {};
  for (const key of Object.keys(next.memories.npc)) next.memories.npc[key] = (Array.isArray(next.memories.npc[key]) ? next.memories.npc[key] : []).map(normalizeMemoryRow);
  next.scheduledEvents = mergeDefaultSchedule(next.scheduledEvents);
  next.scheduleContext = next.scheduleContext || {};
  next.debug = { ...base.debug, ...(next.debug || {}) };
  next.flags = { ...base.flags, ...(next.flags || {}) };
  next.recentTurns = Array.isArray(next.recentTurns) ? next.recentTurns : [];
  next.sceneRuntime = next.sceneRuntime && typeof next.sceneRuntime === 'object' ? next.sceneRuntime : {};
  next.renderedTurns = Array.isArray(next.renderedTurns) ? next.renderedTurns : [];
  next.usage = { ...base.usage, ...(next.usage || {}) };
  return next;
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
function nextGrade(grade) { const i = GRADE_LADDER.indexOf(grade); return i >= 0 && i < GRADE_LADDER.length - 1 ? GRADE_LADDER[i+1] : grade; }
function addMemoryUnique(list, memory, max = 250) {
  if (!memory?.fact) return list || [];
  const row = normalizeMemoryRow(memory);
  const rows = (Array.isArray(list) ? list : []).map(normalizeMemoryRow);
  const signature = `${row.type}|${row.fact}|${row.secret_level || 0}`;
  const merged = [...rows.filter((x) => `${x.type}|${x.fact}|${x.secret_level || 0}` !== signature), row];
  if (merged.length <= max) return merged;
  // 중요도 4~5 기억은 최근 잡담 때문에 밀려나지 않도록 보호한다.
  const protectedRows = merged.filter(x => memoryImportance(x.importance) >= 4);
  const normalRows = merged.filter(x => memoryImportance(x.importance) < 4);
  const keepProtected = protectedRows.slice(-Math.min(max, protectedRows.length));
  const room = Math.max(0, max - keepProtected.length);
  return [...keepProtected, ...normalRows.slice(-room)].sort((x,y) => Number(x.turn||0)-Number(y.turn||0));
}

// ===== characters-v2 portrait routing: BEGIN =====

const EXPRESSION_FALLBACKS = Object.freeze({
  default: ['default'],

  smile: ['smile', 'default'],
  laugh: ['laugh', 'smile', 'default'],
  smug: ['smug', 'smile', 'default'],

  blush: ['blush', 'default'],
  flustered: ['flustered', 'blush', 'confused', 'default'],

  serious: ['serious', 'default'],
  annoyed: ['annoyed', 'serious', 'angry', 'default'],
  angry: ['angry', 'annoyed', 'serious', 'default'],

  worried: ['worried', 'sad', 'serious', 'default'],
  sad: ['sad', 'worried', 'default'],

  confused: ['confused', 'serious', 'worried', 'default'],
  shock: ['shock', 'confused', 'worried', 'default'],
});

function portraitCandidates(key, expression = 'default') {
  const char = ASSETS.characters[key];
  if (!char) return [];

  const normalized = String(expression || 'default').toLowerCase();
  const requested = ASSETS.portraitExpressions.includes(normalized) ? normalized : 'default';
  const order = EXPRESSION_FALLBACKS[requested];

  const seen = new Set();
  const rows = [];

  for (const state of order) {
    const url =
      state === 'default'
        ? char.default
        : char.expressions?.[state];

    if (!url || seen.has(url)) continue;

    seen.add(url);
    rows.push({ state, url });
  }

  return rows;
}

function assetUrl(key, expression = 'default') {
  return portraitCandidates(key, expression)[0]?.url || null;
}

function createPortrait(key, expression, alt) {
  const wrap = document.createElement('div');
  wrap.className = 'portrait-wrap';
  wrap.dataset.requestedExpression = String(expression || 'default');

  const placeholder = document.createElement('div');
  placeholder.className = 'portrait-placeholder';
  placeholder.textContent = `${alt || key || 'NPC'} 초상화`;
  wrap.append(placeholder);

  const candidates = portraitCandidates(
    key,
    expression || 'default'
  );

  if (!candidates.length) {
    return wrap;
  }

  const img = document.createElement('img');
  img.alt = alt || key || 'NPC';
  img.loading = 'lazy';

  let cursor = 0;

  function loadNextCandidate() {
    const next = candidates[cursor++];

    if (!next) {
      img.remove();
      wrap.dataset.displayExpression = 'none';
      return;
    }

    img.dataset.expression = next.state;
    img.src = next.url;
  }

  img.addEventListener('load', () => {
    placeholder.remove();
    wrap.dataset.displayExpression =
      img.dataset.expression || 'default';
  });

  img.addEventListener('error', () => {
    loadNextCandidate();
  });

  wrap.append(img);
  loadNextCandidate();

  return wrap;
}

// ===== characters-v2 portrait routing: END =====

function appendWelcome() {
  story.innerHTML = '';
  const box = document.createElement('section');
  box.className = 'welcome';
  box.innerHTML = `<h2>입학식 당일</h2><p>제국력 1285년 3월 1일, 오전 8시 40분. 대강당 앞은 신입생과 귀족 자제, 교수와 상급생들로 붐빈다. ${escapeHtml(save.pc.name)}의 행동은 전적으로 네가 정한다.</p>`;
  const btn = document.createElement('button');
  btn.className = 'start-btn';
  btn.textContent = '첫 장면 시작';
  btn.addEventListener('click', () => sendAction('게임을 시작한다. 입학식에 오전 9시에 참석한다.'));
  box.append(btn);
  story.append(box);
}

function renderAll() {
  story.innerHTML = '';
  resetNovelPresentationState(novelPresentation);
  if (!save.renderedTurns?.length) appendWelcome();
  else save.renderedTurns.forEach(renderTurnRecord);
  updateStatus();
  renderInfo();
  scrollBottom(false);
}

function renderTurnRecord(record) {
  let user = null;
  if (record.action) {
    user = document.createElement('div');
    user.className = 'user-action';
    user.textContent = record.action;
    story.append(user);
  }
  const turn = record.turn;
  if (!turn) return { user, card: null };
  const card = document.createElement('section');
  card.className = record.meta ? 'turn-card meta-turn' : 'turn-card';
  const head = document.createElement('div');
  head.className = 'turn-head';
  const turnIndex = Math.max(0, (save.renderedTurns || []).indexOf(record));
  const displayTitle = novelSceneTitle(novelPresentation, record);
  const cachePct = Math.round(Number(record.usage?.cache_hit_rate || 0) * 100);
  const usageTag = record.usage && record.route?.tier !== 'demo' ? ` · $${Number(record.usage.estimated_usd || 0).toFixed(4)} · cache ${cachePct}%` : '';
  const technicalTag = settings.developerMode ? `<span>${escapeHtml(record.route?.tier || 'demo')}${usageTag}</span>` : '';
  head.innerHTML = `<span>${record.meta ? 'META · ' : ''}${escapeHtml(displayTitle)}</span>${technicalTag}`;
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
      if (item.speaker_key && (!shown.has(item.speaker_key) || shown.get(item.speaker_key) !== finalExpression) && shouldShowNovelPortrait(novelPresentation, { speakerKey:item.speaker_key, expression:finalExpression, emotionTransition:item.emotion_transition, turnIndex })) {
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
  for (const notice of record.notices || []) {
    const n = document.createElement('div'); n.className = 'progress-notice'; n.textContent = `✦ ${notice}`; card.append(n);
  }
  if (settings.developerMode && record.usage?.cold_cache) {
    const n = document.createElement('div'); n.className = 'cache-notice';
    n.textContent = '첫 호출/캐시 만료 턴: 세계관 프롬프트 캐시를 새로 만드는 턴이라 비용이 평소보다 높을 수 있음.';
    card.append(n);
  }
  story.append(card);
  if (record.meta) renderChoices([]);
  else renderChoices(turn.choices || []);
  return { user, card };
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

  const label = document.createElement('div');
  label.className = 'suggested-actions-label';
  label.textContent = 'Suggested Actions · 직접 입력 가능';
  choicesEl.append(label);

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
  if (settings.developerMode && route) $('routeStatus').textContent = `${route.input_mode === 'meta' ? 'META · ' : ''}${route.tier.toUpperCase()} · ${route.reasoning_effort}${route.reasoning_mode === 'pro' ? ' · PRO' : ''}`;
  if (settings.developerMode) $('costStatus').textContent = `턴 $${Number(save.usage.lastTurnUsd || 0).toFixed(4)} / Σ$${Number(save.usage.estimatedUsd || 0).toFixed(3)}`;
  updateDeveloperUi();
}

function renderInfo() {
  const inheritance=inheritanceBalance(fateBook,inheritanceMeta);
  const rel = Object.entries(save.relationships || {}).map(([key,v]) => `${ASSETS.characters[key]?.name || key}[호감 ${v.affinity||0} / 신뢰 ${v.trust||0}${v.status ? ` / ${v.status}`:''}]`).join(', ') || '-';
  const intimacy = Object.entries(save.intimacyStates || {}).filter(([,v]) => Number(v?.level || 0) > 0)
    .map(([key,v]) => `${ASSETS.characters[key]?.name || key}[L${Math.min(4, Number(v.level||0))}${Number(v.level||0)>=5 ? '/MAX':''}${v.status ? ` · ${v.status}`:''}]`)
    .join(', ') || '-';
  const skills = Object.entries(save.pc.skills || {}).map(([k,v]) => `${k} ${v.grade}`).join(' | ') || '-';
  const stats = Object.entries(save.pc.stats || {}).map(([k,v]) => `- ${k}: ${v.grade} [${v.progress}/100]`).join('\n');
  const fateOrigin=save.creation?.mode==='fate'?save.creation?.fateStart?.origin:null;
  const fateStory=Array.isArray(fateOrigin?.originStory)?fateOrigin.originStory.join('\n'):'';
  $('infoContent').textContent = `PC: ${save.pc.name} (${save.pc.age}세 / ${save.pc.gender})
출신: ${save.pc.origin || '-'} | 신분: ${save.pc.socialStatus || '-'} | 입학: ${save.pc.admission || '-'}${fateStory?`\n운명 배경:\n${fateStory}\n---------`:''}
경지: ${save.pc.realm} | 소속: 루멘시아 아카데미\n---------\n직위: ${save.pc.department} | 상황: 🟢\n---------\n스킬: ${skills}\n---------\n스탯:\n${stats}\n---------\n🔮[魔] ${save.pc.talents.magic} | ⚔️[武] ${save.pc.talents.martial} | 🌟[魂] ${save.pc.talents.soul} | 📘[智] ${save.pc.talents.knowledge}\n---------\n상태: ${save.pc.status} | 피로 ${save.pc.fatigue}/100\n💼: ${(save.pc.inventory||[]).join(', ') || '-'} | 금화 ${save.pc.gold}G\n관계: ${rel}\n친밀도(성인모드): ${intimacy}\n---------\n진행 사건: ${save.activeEvents.join(', ') || '-'}\n토큰 누적: 입력 ${save.usage.inputTokens || 0} / 캐시 ${save.usage.cachedTokens || 0} / 출력 ${save.usage.outputTokens || 0} / 추론 ${save.usage.reasoningTokens || 0}\n직전 턴: 입력 ${save.usage.lastInputTokens || 0} / 출력 ${save.usage.lastOutputTokens || 0} / 캐시 적중 ${Math.round(Number(save.usage.lastCacheHitRate || 0)*100)}% / 비용 $${Number(save.usage.lastTurnUsd || 0).toFixed(4)}\n누적 API 비용(추정): $${Number(save.usage.estimatedUsd || 0).toFixed(4)}\n영구 타임라인: ${save.timeline?.length || 0}건 | NPC 감정상태: ${Object.keys(save.emotionStates || {}).length}명
예약 일정: ${(save.scheduledEvents||[]).filter(x=>x.status!=='completed'&&x.status!=='cancelled').length}건 | 훅: ${(save.hooks||[]).filter(x=>!['resolved','expired'].includes(x.status)).length}건 | 기억: ${(save.memories?.global||[]).length + Object.values(save.memories?.npc||{}).reduce((n,x)=>n+(x?.length||0),0)}건
운명록: ${Object.keys(fateBook.discoveries||{}).length}개 | 계승 원천 ${inheritance.earned} / 사용 ${inheritance.spent} / 잔여 ${inheritance.available}`;
  if (!settings.developerMode) {
    $('infoContent').textContent = $('infoContent').textContent.split('\n').filter((line) => !['토큰 누적:', '직전 턴:', '누적 API 비용'].some((prefix) => line.startsWith(prefix))).join('\n');
  }
  updateNextLifeButton();
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
    let progress = Math.max(0, Number(stat.progress || 0) + clamp(row.amount, -5, 5));
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
    if (!save.pc.skills[row.skill]) save.pc.skills[row.skill] = { grade: 'F', hiddenXp: 0 };
    const skill = save.pc.skills[row.skill];
    let xp = Math.max(0, Number(skill.hiddenXp || 0) + clamp(row.amount, 0, 5));
    while (xp >= 100) {
      xp -= 100;
      const before = skill.grade;
      skill.grade = nextGrade(skill.grade);
      if (skill.grade !== before) notices.push(`스킬 상승: ${row.skill} ${before} → ${skill.grade}`);
      else { xp = 99; break; }
    }
    skill.hiddenXp = clamp(xp, 0, 99);
  }

  const relationshipChanges = [];
  for (const row of delta.relationship_changes || []) {
    const r = save.relationships[row.npc_key] || { affinity: 0, trust: 0, status: '중립', history: [] };
    r.affinity = clamp(r.affinity + row.affinity_delta, -100, 100);
    r.trust = clamp(r.trust + row.trust_delta, -100, 100);
    if (row.status) r.status = row.status;
    const detail = [
      row.reason,
      row.cause ? `원인: ${row.cause}` : '',
      row.expression ? `표현: ${row.expression}` : '',
      row.followup ? `후속: ${row.followup}` : '',
    ].filter(Boolean).join(' | ');
    r.history = [...(r.history || []), detail].filter(Boolean).slice(-30);
    save.relationships[row.npc_key] = r;
    relationshipChanges.push({...row});
  }

  for (const row of delta.intimacy_changes || []) {
    // 성인 친밀도는 한 턴에 최대 1단계만 움직인다. 모델이 과하게 점프시켜도 앱이 막는다.
    if (Number(save.pc?.age || 0) < 18) continue;
    const r = save.intimacyStates[row.npc_key] || { level: 0, status: '없음', history: [] };
    const step = clamp(row.level_delta, -1, 1);
    r.level = clamp(Number(r.level || 0) + step, 0, 5);
    if (row.status) r.status = row.status;
    r.history = [...(r.history || []), row.reason].filter(Boolean).slice(-30);
    save.intimacyStates[row.npc_key] = r;
  }

  for (const row of delta.npc_state_updates || []) {
    const old = save.npcStates[row.npc_key] || {};
    save.npcStates[row.npc_key] = {
      ...old,
      ...(row.location ? { location: row.location } : {}),
      ...(row.status ? { status: row.status } : {}),
      ...(row.current_goal ? { current_goal: row.current_goal } : {}),
      ...(row.last_seen ? { last_seen: row.last_seen } : {}),
      updatedAtTurn: save.turnNumber + 1,
    };
  }

  save.pc.inventory = uniq([...save.pc.inventory, ...(delta.items_add || [])]).filter(x => !(delta.items_remove || []).includes(x));
  save.activeEvents = uniq([...save.activeEvents, ...(delta.active_events_add || [])]).filter(x => !(delta.active_events_remove || []).includes(x));
  save.completedEvents = uniq([...save.completedEvents, ...(delta.completed_events_add || [])]);
  save.pcKnowledge = uniq([...save.pcKnowledge, ...(delta.pc_knowledge_add || [])]).slice(-300);

  const memoryAdds = [];
  for (const m of delta.memories_add || []) {
    const enriched = normalizeMemoryRow({ ...m, turn:save.turnNumber+1, date:save.world.date, time:save.world.time });
    memoryAdds.push(enriched);
    if (m.owner === 'world' || m.owner === 'global') save.memories.global = addMemoryUnique(save.memories.global, enriched, 300);
    else {
      const key = m.owner.replace(/^npc:/, '');
      save.memories.npc[key] = addMemoryUnique(save.memories.npc[key], enriched, 120);
    }
  }

  for (const ev of delta.scheduled_events_add || []) {
    if (!ev?.id || !ev?.title || !ev?.date || !ev?.time) continue;
    const row = { ...ev, participants:uniq(ev.participants||[]), importance:memoryImportance(ev.importance), status:'scheduled', createdTurn:save.turnNumber+1 };
    const idx = save.scheduledEvents.findIndex(x => x.id === row.id);
    if (idx >= 0) save.scheduledEvents[idx] = { ...save.scheduledEvents[idx], ...row };
    else save.scheduledEvents.push(row);
    notices.push(`일정 등록: ${row.date} ${row.time} · ${row.title}`);
  }
  for (const id of delta.scheduled_events_complete || []) {
    const ev = save.scheduledEvents.find(x => x.id === id);
    if (!ev) continue;
    ev.status = 'completed'; ev.completedTurn = save.turnNumber + 1;
  }

  const hookChanges = [];
  for (const hook of delta.hooks_add || []) {
    if (!hook?.id || !hook?.title) continue;
    const row = {
      ...hook,
      status: ['open','deferred','declined','resolved','expired'].includes(hook.status) ? hook.status : 'open',
      importance: memoryImportance(hook.importance),
      createdTurn: save.turnNumber + 1,
      updatedTurn: save.turnNumber + 1,
    };
    const idx = save.hooks.findIndex(x => x.id === row.id);
    if (idx >= 0) save.hooks[idx] = { ...save.hooks[idx], ...row };
    else save.hooks.push(row);
    hookChanges.push({id:row.id, status:row.status, title:row.title, reason:'추가'});
  }
  for (const patch of delta.hooks_update || []) {
    const hook = save.hooks.find(x => x.id === patch.id);
    if (!hook) continue;
    hook.status = patch.status;
    hook.updatedTurn = save.turnNumber + 1;
    hook.history = [...(hook.history || []), patch.reason].filter(Boolean).slice(-20);
    hookChanges.push({id:hook.id, status:hook.status, title:hook.title, reason:patch.reason});
  }
  save.hooks = (save.hooks || []).slice(-120);

  refreshScheduleContext();
  save.debug.lastMemoryAdds = memoryAdds;
  save.debug.lastRelationChanges = relationshipChanges;
  save.debug.lastHookChanges = hookChanges;
  return notices;
}

function applyEmotionUpdates(updates = []) {
  for (const row of updates || []) {
    if (!row?.npc_key || !row?.state) continue;
    save.emotionStates[row.npc_key] = { ...row.state };
  }
}

function updateDirectorState(turn) {
  save.director = save.director || defaultSave().director;
  const d = save.director;
  d.npcExposure = d.npcExposure || {};
  d.recentBeats = Array.isArray(d.recentBeats) ? d.recentBeats : [];
  d.recentSpotlights = Array.isArray(d.recentSpotlights) ? d.recentSpotlights : [];
  d.callbacks = Array.isArray(d.callbacks) ? d.callbacks : [];

  const t = save.turnNumber + 1;
  const meta = turn?.director || {
    intervention:'light', beat:turn?.importance === 'routine' ? 'routine':'encounter',
    event_kind:'none', spotlight_keys:[], callback_key:null, callback_phase:'none',
    callback_note:null, reason:'director meta 누락'
  };
  const speakers = uniq((turn?.scene || []).filter(x=>x?.kind==='dialogue' && x?.speaker_key).map(x=>x.speaker_key));
  const spotlights = uniq([...(meta.spotlight_keys || []), ...speakers]).filter(key=>ASSETS.characters?.[key]);

  for (const key of spotlights) {
    const old = d.npcExposure[key] || {};
    d.npcExposure[key] = {
      lastSeenTurn:t,
      appearances:Number(old.appearances || 0) + (speakers.includes(key) ? 1 : 0),
      lastSceneTitle:String(turn?.scene_title || '').slice(0,120),
    };
  }

  d.recentSpotlights.push({turn:t, keys:spotlights.slice(0,5), beat:meta.beat, event_kind:meta.event_kind});
  d.recentSpotlights = d.recentSpotlights.slice(-24);
  d.recentBeats.push({turn:t, beat:meta.beat, event_kind:meta.event_kind, intervention:meta.intervention});
  d.recentBeats = d.recentBeats.slice(-16);

  if (!['routine','aftermath'].includes(meta.beat)) d.lastEventTurn = t;
  if (['choice','payoff_opportunity'].includes(meta.beat)) d.lastChoicePressureTurn = t;

  const pcDept = pcDirectorDept();
  if (spotlights.some(key => {
    const dept = DIRECTOR_NPC_DEPT[key];
    return dept && ['knight','magic','theology'].includes(dept) && dept !== pcDept;
  })) d.lastCrossDepartmentTurn = t;

  const cbKey = String(meta.callback_key || '').trim().slice(0,80);
  const phase = meta.callback_phase || 'none';
  if (cbKey && phase !== 'none') {
    let row = d.callbacks.find(x=>x.key===cbKey);
    if (!row) {
      row = { key:cbKey, status:'open', createdTurn:t, lastTurn:t, note:'', spotlight_keys:[] };
      d.callbacks.push(row);
    }
    row.lastTurn = t;
    row.note = String(meta.callback_note || row.note || '').slice(0,280);
    row.spotlight_keys = uniq([...(row.spotlight_keys||[]), ...spotlights]).slice(0,4);
    if (['friction','pressure'].includes(phase)) row.status = 'open';
    else if (phase === 'payoff_opportunity') row.status = 'opportunity';
    else if (['payoff','aftermath'].includes(phase)) row.status = 'resolved';
  }
  const unresolved = d.callbacks.filter(x=>x.status!=='resolved').slice(-12);
  const resolved = d.callbacks.filter(x=>x.status==='resolved').slice(-8);
  d.callbacks = [...resolved, ...unresolved].slice(-20);
  save.debug.lastDirector = meta;
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
  const recent = rows.slice(-10);
  const important = rows.filter(x => x.importance !== 'routine').slice(-12);
  const merged = [...important, ...recent]
    .sort((a,b) => a.turn - b.turn)
    .filter((x,i,a) => i === 0 || x.turn !== a[i-1].turn);
  save.rollingSummary = merged.map(x => `[T${x.turn} ${x.date} ${x.time} ${x.location} ${x.importance}] ${x.summary}`).join('\n').slice(-6500);
}

function compactState() {
  return {
    version: save.version, turnNumber: save.turnNumber, world: save.world, creation: save.creation, pc: save.pc, relationships: save.relationships, intimacyStates: save.intimacyStates, npcStates: save.npcStates,
    emotionStates: save.emotionStates, activeEvents: save.activeEvents, completedEvents: save.completedEvents,
    pcKnowledge: save.pcKnowledge, memories: save.memories, hooks:save.hooks, scheduledEvents:save.scheduledEvents, scheduleContext:save.scheduleContext, director:save.director, flags: save.flags,
  };
}

// LUMENSIA_FATE_ENDING_HANDLER_V1
function applyFateEndingRuntime(packet = {}) {
  const accepted=Array.isArray(packet?.accepted_discoveries)?packet.accepted_discoveries:[];
  const repeated=Array.isArray(packet?.repeated_discoveries)?packet.repeated_discoveries:[];
  if(!accepted.length&&!repeated.length)return[];
  fateBook=reconcileFateBooks(fateBook,{discoveries:accepted},{allowedCharacterKeys:ALLOWED_CHARACTER_KEYS});
  return [
    ...accepted.map((row)=>`운명록 최초 발견: ${row.title} (+${Number(row.reward||0)} 계승 원천)`),
    ...repeated.map((row)=>`운명록 재발견: ${row.title} (최초 보상 없음)`),
  ];
}

async function sendAction(action) {
  action = String(action || '').trim();
  if (!action || busy) return;
  const runOwner=captureActiveRunOwnership();
  const inputMode = detectInputMode(action);
  const displayAction = action;
  const apiAction = inputMode === 'meta' ? (stripMetaPrefix(action) || '현재 게임 상태와 규칙을 점검해줘.') : action;
  busy = true; sendBtn.disabled = true; actionInput.disabled = true; choicesEl.classList.add('hidden');
  const loader = document.createElement('div'); loader.className = inputMode === 'meta' ? 'turn-card meta-turn' : 'turn-card'; loader.innerHTML = '<div class="loading-dots"><i></i><i></i><i></i></div>'; story.append(loader); scrollBottom();
  let stagedTurn=null;
  try {
    refreshScheduleContext();
    const { accessToken, ...apiSettings } = settings;
    const payload = { action:apiAction, inputMode, saveState: compactState(), fateBook:fateBookRuntimeSnapshot(fateBook,{allowedCharacterKeys:ALLOWED_CHARACTER_KEYS}), recentTurns: save.recentTurns, rollingSummary: save.rollingSummary, availableCgIds: Object.keys(ASSETS.cg || {}), forceTerra: forceTerraOnce, ...apiSettings };
    let data;
    if (settings.demoMode) data = demoResponse(apiAction, inputMode);
    else {
      const payloadText = JSON.stringify(payload);
      const requestBytes = new Blob([payloadText]).size;
      if (save?.debug) save.debug.lastRequestBytes = requestBytes;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type':'application/json', 'X-Lumensia-Token': accessToken || ''},
        body: payloadText
      });

      const raw = await res.text();
      const contentType = res.headers.get('content-type') || '';
      const vercelId = res.headers.get('x-vercel-id') || '';
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        const preview = String(raw || '').replace(/\s+/g, ' ').slice(0, 280);
        const err = new Error(
          `서버가 JSON이 아닌 응답을 보냈습니다. (HTTP ${res.status})` +
          `${preview ? `\n${preview}` : ''}` +
          `${vercelId ? `\nVercel ID: ${vercelId}` : ''}`
        );
        err.code = 'NON_JSON_SERVER_RESPONSE';
        throw err;
      }

      if (!res.ok) {
        throw new Error(
          `${data.error || `API 오류 (HTTP ${res.status})`}` +
          `${data.code ? `\nCode: ${data.code}` : ''}` +
          `${data.request_id ? `\nRequest ID: ${data.request_id}` : ''}` +
          `${vercelId ? `\nVercel ID: ${vercelId}` : ''}`
        );
      }
    }
    assertActiveRunOwner(runOwner);
    stagedTurn=stageTurnCommit(runOwner);
    loader.remove();
    const isMeta = inputMode === 'meta' || data.route?.input_mode === 'meta';
    let notices = [];
    if (!isMeta) {
      notices = applyDelta(data.turn.state_delta);
      notices.push(...applyFateEndingRuntime(data.fate_ending));
      applyEmotionUpdates(data.turn.emotion_updates || []);
      updateDirectorState(data.turn);
      addTimeline(data.turn);
      rebuildRollingSummary();
    }
    const record = { action:displayAction, turn: data.turn, route: data.route, usage: data.usage, notices, meta:isMeta, at: new Date().toISOString() };
    if (!isMeta) {
      save.turnNumber += 1;
      save.recentTurns.push({ action:apiAction, summary: data.turn.scene_summary, importance: data.turn.importance || 'routine', scene: data.turn.scene.slice(0,10) });
      save.recentTurns = save.recentTurns.slice(-12);
    }
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
    metaModeOnce = false; updateMetaButton();
    if (!isMeta) {
      save.flags.forceTerraNextTurn = false;
      save.flags.majorScene = data.turn.importance === 'critical';
      refreshScheduleContext();
    }
    save.debug.lastRoute = data.route || null;
    save.debug.lastUsage = data.usage || null;
    save.debug.lastSchedule = save.scheduleContext;
    await commitTurnState(stagedTurn,runOwner);stagedTurn=null;
    const rendered = renderTurnRecord(record);
    updateStatus(data.route);
    renderInfo();
    actionInput.value = '';
    scrollToTurnStart(rendered?.card || rendered?.user);
  } catch (err) {
    if(stagedTurn)rollbackTurnCommit(stagedTurn);
    loader.remove();
    const e = document.createElement('div');
    e.className = 'error-card';
    e.textContent = err.message || String(err);
    story.append(e);
    // 실패한 요청은 게임 상태에 적용하지 않는다. 선택지는 다시 사용할 수 있게 복구.
    if (inputMode !== 'meta' && save?.renderedTurns?.length) {
      const lastGame = [...save.renderedTurns].reverse().find(x => !x?.meta);
      const lastChoices = lastGame?.turn?.choices || [];
      if (lastChoices.length) renderChoices(lastChoices);
    }
    metaModeOnce = false; updateMetaButton();
    scrollBottom();
  } finally { busy = false; sendBtn.disabled = false; actionInput.disabled = false; actionInput.focus(); }
}

function demoResponse(action, inputMode='game') {
  if (inputMode === 'meta') {
    return {
      turn:{
        director:{intervention:'none',beat:'routine',event_kind:'none',spotlight_keys:[],callback_key:null,callback_phase:'none',callback_note:null,reason:'META freeze'},
        scene_title:'META 점검', importance:'routine', cg_id:null,
        scene:[{kind:'narration',text:`데모 META 응답: ${action}`,speaker_key:null,speaker_name:null,expression:null}],
        choices:[],
        state_delta:{advance_minutes:0,new_location:null,pc_status:null,fatigue_delta:0,gold_delta:0,relationship_changes:[],intimacy_changes:[],stat_progress:[],skill_experience:[],items_add:[],items_remove:[],active_events_add:[],active_events_remove:[],completed_events_add:[],pc_knowledge_add:[],scheduled_events_add:[],scheduled_events_complete:[],hooks_add:[],hooks_update:[],memories_add:[],npc_state_updates:[]},
        scene_summary:'META 점검. 게임 상태 변화 없음.'
      },
      route:{model:'demo',tier:'demo',reasoning_effort:'none',reasoning_mode:'standard',reason:'demo-meta',input_mode:'meta'},
      usage:{input_tokens:0,output_tokens:0,cached_tokens:0,estimated_usd:0}
    };
  }
  const first = save.turnNumber === 0;
  const turn = first ? {
    director:{intervention:'light',beat:'encounter',event_kind:'social',spotlight_keys:['lillia'],callback_key:null,callback_phase:'none',callback_note:null,reason:'입학식 전 자연스러운 신입생 조우'},
    scene_title: '입학식 전, 대강당 앞', importance: 'routine', cg_id: null,
    scene: [
      {kind:'narration', text:'대강당을 둘러싼 흰 석조 회랑에 아침 햇살이 비친다. 신입생들의 목소리 사이로 검집이 부딪히는 소리와 마법 도구의 미세한 진동음이 섞인다.', speaker_key:null, speaker_name:null, expression:null},
      {kind:'dialogue', text:'너도 기사과야? 그 대검, 꽤 오래 쓴 것 같은데!', speaker_key:'lillia', speaker_name:'릴리아', expression:'smile'},
      {kind:'narration', text:`붉은 머리의 소녀가 거리낌 없이 다가오며 ${save.pc.name}의 대검을 흥미롭게 살핀다.`, speaker_key:null, speaker_name:null, expression:null}
    ],
    choices:['소녀에게 이름과 소속을 묻는다.','대검을 살피는 이유를 묻는다.','입학식 전에 가볍게 검을 맞춰보자고 제안한다.'],
    state_delta:{advance_minutes:3,new_location:null,pc_status:null,fatigue_delta:0,gold_delta:0,relationship_changes:[],stat_progress:[],skill_experience:[],items_add:[],items_remove:[],active_events_add:[],active_events_remove:[],completed_events_add:[],pc_knowledge_add:[],scheduled_events_add:[],scheduled_events_complete:[],hooks_add:[],hooks_update:[],memories_add:[{owner:'npc:lillia',fact:`입학식 전 대강당 앞에서 ${save.pc.name}의 오래된 대검에 먼저 관심을 보였다.`,type:'event',importance:2,secret_level:0}],npc_state_updates:[{npc_key:'lillia',location:'루멘시아 아카데미 대강당 앞',status:`${save.pc.name}에게 먼저 말을 건 상태`,current_goal:'신입생 입학식 참가',last_seen:'1285-03-01 08:43'}]},
    scene_summary:`입학식 전 대강당 앞에서 릴리아가 ${save.pc.name}의 대검에 관심을 보이며 먼저 말을 걸었다.`
  } : {
    director:{intervention:'light',beat:'routine',event_kind:'none',spotlight_keys:[],callback_key:null,callback_phase:'none',callback_note:null,reason:'데모'},
    scene_title:'데모 응답',importance:'routine',cg_id:null,
    scene:[{kind:'narration',text:`${save.pc.name}의 행동 「${action}」에 주변 상황이 반응한다. 데모 모드라 실제 AI 판정은 생략된다.`,speaker_key:null,speaker_name:null,expression:null}],choices:[],
    state_delta:{advance_minutes:1,new_location:null,pc_status:null,fatigue_delta:0,gold_delta:0,relationship_changes:[],stat_progress:[],skill_experience:[],items_add:[],items_remove:[],active_events_add:[],active_events_remove:[],completed_events_add:[],pc_knowledge_add:[],scheduled_events_add:[],scheduled_events_complete:[],hooks_add:[],hooks_update:[],memories_add:[],npc_state_updates:[]},scene_summary:'데모 모드로 UI 동작을 확인했다.'
  };
  return { turn, route:{model:'demo',tier:'demo',reasoning_effort:'none',reasoning_mode:'standard',reason:'demo'}, usage:{input_tokens:0,output_tokens:0,cached_tokens:0,estimated_usd:0} };
}

function updateForceTerraButton() {
  const btn = $('forceTerraBtn');
  if (!btn) return;
  btn.textContent = forceTerraOnce ? 'TERRA 예약됨' : 'TERRA 1턴';
  btn.classList.toggle('active', forceTerraOnce);
}

function updateMetaButton() {
  const btn = $('metaBtn');
  if (!btn) return;
  btn.textContent = metaModeOnce ? 'META ON' : 'META';
  btn.classList.toggle('active', metaModeOnce);
  btn.setAttribute('aria-pressed', metaModeOnce ? 'true' : 'false');
}
function detectInputMode(action='') {
  return metaModeOnce || /^\/meta(?:\s|$)/i.test(String(action).trim()) ? 'meta' : 'game';
}
function stripMetaPrefix(action='') {
  return String(action).replace(/^\/meta(?:\s+|$)/i, '').trim();
}

function scrollToTurnStart(el, smooth = true) {
  if (!el) return;
  requestAnimationFrame(() => {
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - 118);
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  });
}
function scrollBottom(smooth = true) { requestAnimationFrame(() => window.scrollTo({top: document.body.scrollHeight, behavior: smooth ? 'smooth':'auto'})); }

function ensureDynamicUi() {
  document.title = `루멘시아 모바일 V${APP_VERSION}`;
  const h1 = document.querySelector('h1');
  const tag = h1?.querySelector('.version-tag');
  if (tag) tag.textContent = `V${APP_VERSION}`;
  if (!$('v14DynamicStyle')) {
    const style=document.createElement('style'); style.id='v14DynamicStyle';
    style.textContent='.version-tag{font-size:10px;color:#d9b86c;font-weight:800;vertical-align:middle}.emotion-debug{margin:0 14px 12px;padding:6px 8px;border-radius:8px;background:rgba(99,102,241,.10);color:#b8c0ff;font-size:10px;line-height:1.4}.cache-notice{margin:8px 12px 14px;padding:8px 10px;border-radius:10px;background:rgba(59,130,246,.10);border:1px solid rgba(59,130,246,.25);color:#bfdbfe;font-size:10px;line-height:1.5}.asset-item.asset-warn{border-color:rgba(245,158,11,.65)}.asset-item.asset-warn div{color:#fcd34d}.asset-item.asset-fail{border-color:rgba(239,68,68,.65)}.asset-item.asset-fail div{color:#fecaca}';
    document.head.append(style);
  }
  updatePcUi(); updateDeveloperUi(); updateMetaButton();
}

function updatePcUi() {
  actionInput.placeholder = `${save.pc.name || 'PC'}의 행동이나 대사를 직접 입력…`;
}
function updateDeveloperUi() {
  $('debugBtn')?.classList.toggle('hidden', !settings.developerMode);
  $('routeStatus')?.classList.toggle('hidden', !settings.developerMode);
  $('costStatus')?.classList.toggle('hidden', !settings.developerMode);
}

function parseSkills(text='') {
  const out = {};
  for (const raw of String(text).split(/[\n,]+/)) {
    const line = raw.trim(); if (!line) continue;
    const idx = line.lastIndexOf(':');
    const name = (idx >= 0 ? line.slice(0,idx) : line).trim();
    const grade = (idx >= 0 ? line.slice(idx+1) : 'F').trim() || 'F';
    if (name) out[name] = { grade, hiddenXp:0 };
  }
  return out;
}
function parseList(text='') { return uniq(String(text).split(/[\n,]+/).map(x=>x.trim()).filter(Boolean)); }
function clearPcCreatorForm({keepPaste=false} = {}) {
  for (const id of ['pcName','pcAge','pcGender','pcOrigin','pcSocialStatus','pcAdmission','pcRealm','pcGold','pcAppearance','pcCharacterSetting','talentMagic','talentMartial','talentSoul','talentKnowledge','statBody','statMana','statInt','statHoly','pcSkillsText','pcInventoryText']) {
    const el=$(id); if (el) el.value='';
  }
  if ($('pcDepartment')) $('pcDepartment').value='';
  if ($('fateGender')) $('fateGender').value='';
  if ($('fateSocialClass')) $('fateSocialClass').value='';
  if ($('fateDepartment')) $('fateDepartment').value='';
  if (!keepPaste && $('pcPasteText')) $('pcPasteText').value='';
  if ($('pcPasteResult')) { $('pcPasteResult').textContent='빈 새 캐릭터 시트. 직접 입력하거나 위에 설정을 붙여넣어 자동채우기.'; $('pcPasteResult').className='field-help pc-paste-result'; }
}

function setPcCreationMode(mode='free') {
  const selected=mode==='fate'?'fate':'free';
  $('pcCreationMode').value=selected;
  const free=$('pcFreeCreationFields');
  const fate=$('pcFateStartFields');
  free.classList.toggle('hidden',selected!=='free');
  fate.classList.toggle('hidden',selected!=='fate');
  for(const el of free.querySelectorAll('input, textarea, select, button')) el.disabled=selected!=='free';
  for(const el of fate.querySelectorAll('input, textarea, select, button')) el.disabled=selected!=='fate';
  for(const [id,value] of [['pcFreeModeBtn','free'],['pcFateModeBtn','fate']]) {
    const active=selected===value; const button=$(id);
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
  }
  $('pcCreatorSubmit').textContent=selected==='fate'?'이 선택으로 운명 시작':'이 설정으로 새 게임';
}

function syncFateDepartmentOptions() {
  const source=$('pcDepartment'); const target=$('fateDepartment');
  target.replaceChildren(...[...source.options].map(option=>option.cloneNode(true)));
  target.value='';
}

function setCreatorSelectValue(id, value='') {
  const el=$(id); if (!el) return;
  const v=String(value||'').trim();
  if (!v) { el.value=''; return; }
  let opt=[...el.options].find(o=>o.value===v || o.textContent.trim()===v);
  if (!opt) { opt=document.createElement('option'); opt.value=v; opt.textContent=v; el.append(opt); }
  el.value=opt.value;
}

function firstDefined(obj, keys, fallback='') {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  return fallback;
}

function skillsToText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(x => typeof x==='string' ? x : `${x.name||x.skill||''}:${x.grade||x.rank||'F'}`).filter(Boolean).join('\n');
  if (typeof value === 'object') return Object.entries(value).map(([k,v])=>`${k}:${typeof v==='string'?v:(v?.grade||v?.rank||'F')}`).join('\n');
  return '';
}
function inventoryToText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(x=>typeof x==='string'?x:(x?.name||'')).filter(Boolean).join(', ');
  return '';
}

function parsePcNaturalText(text='') {
  const out={ talents:{}, stats:{} };
  const normalized=String(text).replace(/\r/g,'');
  const lines=normalized.split('\n');
  const aliases={
    name:['이름','name'], age:['나이','age'], gender:['성별','gender','sex'], department:['학과','department'],
    origin:['출신','origin'], socialStatus:['신분','social status','status'], admission:['입학 경로','입학경로','admission'],
    realm:['초기 경지/서클','초기 경지','경지','서클','realm','circle'], gold:['금화','골드','gold'], appearance:['외형/인상','외형','인상','appearance'],
    characterSetting:['캐릭터 상세 설정','캐릭터 설정','캐릭터설정','상세 설정','배경 설정','설정','character setting','profile'],
    skills:['초기 스킬','스킬','skills'], inventory:['초기 장비','장비','소지품','inventory','equipment']
  };
  const keyFor=(label)=>Object.entries(aliases).find(([,arr])=>arr.some(a=>a.toLowerCase()===label.toLowerCase()))?.[0];
  let section='';
  for (let raw of lines) {
    const line=raw.trim(); if(!line) continue;
    const sec=line.match(/^\[?\s*(스킬|skills|장비|소지품|inventory|equipment|캐릭터 상세 설정|캐릭터 설정|캐릭터설정|상세 설정|배경 설정|character setting|profile)\s*\]?\s*$/i);
    if(sec){
      if(/스킬|skills/i.test(sec[1])) section='skills';
      else if(/장비|소지품|inventory|equipment/i.test(sec[1])) section='inventory';
      else section='characterSetting';
      continue;
    }
    const m=line.match(/^([^:=]{1,30})\s*[:=]\s*(.*)$/);
    if(m){
      const label=m[1].trim(), value=m[2].trim(); const key=keyFor(label);
      if(key){
        out[key]=value;
        section=(key==='skills'||key==='inventory'||key==='characterSetting')?key:'';
        continue;
      }
      if(/재능|talent/i.test(label)){ out.talentText=value; continue; }
      if(/스탯|능력치|stats?/i.test(label)){ out.statText=value; continue; }
    }
    if(section==='skills') out.skills=(out.skills?out.skills+'\n':'')+line;
    if(section==='inventory') out.inventory=(out.inventory?out.inventory+', ':'')+line;
    if(section==='characterSetting') out.characterSetting=(out.characterSetting?out.characterSetting+'\n':'')+raw.trim();
  }
  // tolerate "나이 20" style lines
  const simplePatterns=[
    ['name',/(?:^|\n)\s*(?:이름|name)\s+([^\n]+)/i],['age',/(?:^|\n)\s*(?:나이|age)\s+(\d{1,3})/i],
    ['gender',/(?:^|\n)\s*(?:성별|gender|sex)\s+([^\n]+)/i],['department',/(?:^|\n)\s*(?:학과|department)\s+([^\n]+)/i]
  ];
  for(const [k,re] of simplePatterns) if(!out[k]){ const m=normalized.match(re); if(m) out[k]=m[1].trim(); }
  const talentSource=(out.talentText||normalized);
  const talentDefs={magic:['마법','마력','魔','magic'],martial:['무','무예','무력','武','martial'],soul:['영혼','혼','魂','soul'],knowledge:['지식','지능','智','knowledge']};
  for(const [k,names] of Object.entries(talentDefs)){
    for(const n of names){ const re=new RegExp(`${n}\\s*[:=]?\\s*(\\d{1,2})`,'i'); const m=talentSource.match(re); if(m){out.talents[k]=Number(m[1]);break;} }
  }
  const statSource=(out.statText||normalized);
  for(const [k,names] of Object.entries({'신체':['신체','body'],'마나':['마나','mana'],'지능':['지능','intelligence','int'],'신성':['신성','divinity','holy']})){
    for(const n of names){ const re=new RegExp(`${n}\\s*[:=]?\\s*([FEDSABC]{1,3}(?:[+-])?)`,'i'); const m=statSource.match(re); if(m){out.stats[k]=m[1].toUpperCase();break;} }
  }
  return out;
}

function normalizePastedPcObject(value) {
  const src=(value?.pc && typeof value.pc==='object') ? value.pc : value;
  if(!src || typeof src!=='object') return {};
  const talents=firstDefined(src,['talents','재능'],{})||{};
  const stats=firstDefined(src,['stats','스탯','능력치'],{})||{};
  return {
    name:firstDefined(src,['name','이름']), age:firstDefined(src,['age','나이']), gender:firstDefined(src,['gender','sex','성별']),
    department:firstDefined(src,['department','학과']), origin:firstDefined(src,['origin','출신']), socialStatus:firstDefined(src,['socialStatus','social_status','신분']),
    admission:firstDefined(src,['admission','입학경로','입학 경로']), realm:firstDefined(src,['realm','circle','경지','서클']), gold:firstDefined(src,['gold','금화','골드']),
    appearance:firstDefined(src,['appearance','외형','인상']),
    characterSetting:firstDefined(src,['characterSetting','character_setting','profile','캐릭터 상세 설정','캐릭터 설정','상세 설정','설정']),
    skills:firstDefined(src,['skills','스킬']), inventory:firstDefined(src,['inventory','equipment','장비','소지품']),
    talents:{ magic:firstDefined(talents,['magic','魔','마법']), martial:firstDefined(talents,['martial','武','무']), soul:firstDefined(talents,['soul','魂','혼']), knowledge:firstDefined(talents,['knowledge','智','지']) },
    stats:{ '신체':firstDefined(stats,['신체','body']), '마나':firstDefined(stats,['마나','mana']), '지능':firstDefined(stats,['지능','intelligence','int']), '신성':firstDefined(stats,['신성','divinity','holy']) }
  };
}

function applyPcDataToCreator(data={}) {
  const value=(id,v)=>{ if(v!==undefined&&v!==null&&String(v)!=='') $(id).value=String(v); };
  value('pcName',data.name); value('pcAge',data.age); value('pcGender',data.gender); setCreatorSelectValue('pcDepartment',data.department);
  value('pcOrigin',data.origin); value('pcSocialStatus',data.socialStatus); value('pcAdmission',data.admission); value('pcRealm',data.realm); value('pcGold',data.gold); value('pcAppearance',data.appearance); value('pcCharacterSetting',data.characterSetting);
  value('talentMagic',data.talents?.magic); value('talentMartial',data.talents?.martial); value('talentSoul',data.talents?.soul); value('talentKnowledge',data.talents?.knowledge);
  value('statBody',typeof data.stats?.['신체']==='object'?data.stats['신체']?.grade:data.stats?.['신체']);
  value('statMana',typeof data.stats?.['마나']==='object'?data.stats['마나']?.grade:data.stats?.['마나']);
  value('statInt',typeof data.stats?.['지능']==='object'?data.stats['지능']?.grade:data.stats?.['지능']);
  value('statHoly',typeof data.stats?.['신성']==='object'?data.stats['신성']?.grade:data.stats?.['신성']);
  const sk=skillsToText(data.skills); if(sk) $('pcSkillsText').value=sk;
  const inv=inventoryToText(data.inventory); if(inv) $('pcInventoryText').value=inv;
}

function applyPastedPcText() {
  const text=$('pcPasteText').value.trim();
  const result=$('pcPasteResult');
  if(!text){ result.textContent='붙여넣은 내용이 없음.'; result.className='field-help pc-paste-result warn'; return; }
  try {
    let data;
    try { data=normalizePastedPcObject(JSON.parse(text)); }
    catch { data=parsePcNaturalText(text); }
    const before=[...document.querySelectorAll('#pcCreatorForm input, #pcCreatorForm textarea, #pcCreatorForm select')].map(x=>x.value).join('|');
    applyPcDataToCreator(data);
    const after=[...document.querySelectorAll('#pcCreatorForm input, #pcCreatorForm textarea, #pcCreatorForm select')].map(x=>x.value).join('|');
    if(before===after){ result.textContent='읽을 수 있는 필드를 찾지 못함. `이름: 값` 형식이나 JSON을 사용해줘.'; result.className='field-help pc-paste-result warn'; }
    else { result.textContent='자동채우기 완료. 아래 값을 확인하고 필요한 부분만 수정하면 됨.'; result.className='field-help pc-paste-result ok'; }
  } catch(err) { result.textContent=`자동채우기 실패: ${err.message}`; result.className='field-help pc-paste-result warn'; }
}

function openPcCreator() {
  clearPcCreatorForm();
  syncFateDepartmentOptions();
  setPcCreationMode('free');
  $('pcCreatorDialog').showModal();
}
function createNewSaveFromCreator() {
  const base=defaultSave();
  if($('pcCreationMode').value==='fate') {
    const generated=generateFateStartingCharacter({
      gender:$('fateGender').value,
      socialClass:$('fateSocialClass').value,
      department:$('fateDepartment').value,
    });
    const labels=fateStartLabels(generated.creation.fateStart);
    base.creation=generated.creation;
    base.pc={...base.pc,...generated.pc,gender:labels.gender,socialStatus:labels.socialClass,department:labels.department};
    const startRoute=generated.creation.fateStart.background.startingRoute;
    base.rollingSummary=`입학식 당일 08:40. ${base.pc.name}은(는) ${startRoute.arrivalFocus}에 도착했다. ${startRoute.eventMeaning}이며 첫 확인 지점은 ${startRoute.checkpoint}이다. 입학식 개막 전이다.`;
    return normalizeSave(base);
  }
  base.creation=createFreeCharacterCreation();
  base.pc={...base.pc,
    name:$('pcName').value.trim()||'Aaa', age:clamp($('pcAge').value||20,14,99), gender:$('pcGender').value.trim()||'미지정', department:$('pcDepartment').value||'미지정',
    origin:$('pcOrigin').value.trim(), socialStatus:$('pcSocialStatus').value.trim(), admission:$('pcAdmission').value.trim(), appearance:$('pcAppearance').value.trim(),
    characterSetting:$('pcCharacterSetting').value.trim(),
    realm:$('pcRealm').value.trim()||'비기너',
    gold:Math.max(0,Number($('pcGold').value)||0), fatigue:0, status:'안정',
    talents:{magic:clamp($('talentMagic').value||5,1,10),martial:clamp($('talentMartial').value||5,1,10),soul:clamp($('talentSoul').value||5,1,10),knowledge:clamp($('talentKnowledge').value||5,1,10)},
    stats:{'신체':{grade:$('statBody').value.trim()||'D',progress:0},'마나':{grade:$('statMana').value.trim()||'D',progress:0},'지능':{grade:$('statInt').value.trim()||'D',progress:0},'신성':{grade:$('statHoly').value.trim()||'F',progress:0}},
    skills:parseSkills($('pcSkillsText').value), inventory:parseList($('pcInventoryText').value),
  };
  base.rollingSummary=`입학식 당일 08:40. ${base.pc.name}은(는) 루멘시아 아카데미 대강당 앞에 도착했으며 입학식 개막 전이다.`;
  return normalizeSave(base);
}

function currentRunHasEnding(run=save){return (run.completedEvents||[]).some((value)=>String(value).startsWith('ending:'));}
function updateNextLifeButton(){
  const button=$('nextLifeBtn');if(!button)return;
  const balance=inheritanceBalance(fateBook,inheritanceMeta),available=Math.max(0,balance.available);
  button.textContent=`다음 생 (${available})`;
  button.disabled=!currentRunHasEnding()||available<=0;
  button.title=!currentRunHasEnding()?'현재 회차의 Ending 또는 Dead Ending이 확정된 뒤 사용할 수 있음':available<=0?'사용 가능한 계승 원천이 없음':'Inheritance allocation으로 다음 생 시작';
}
function replaceSelectOptions(element,rows,{emptyLabel='선택 안 함'}={}){
  element.replaceChildren();
  if(emptyLabel){const option=document.createElement('option');option.value='';option.textContent=emptyLabel;element.append(option);}
  for(const row of rows){const option=document.createElement('option');option.value=row.value;option.textContent=row.label;element.append(option);}
}
function syncNextLifeOriginOptions(){
  const socialClass=$('nextSocialClass').value||'commoner',options=fateOriginLockOptions(socialClass);
  const previousRegion=$('nextRegionLock').value,previousOccupation=$('nextOccupationLock').value;
  replaceSelectOptions($('nextRegionLock'),options.regions.map((row)=>({value:row.key,label:row.label})));
  replaceSelectOptions($('nextOccupationLock'),options.occupations.map((row)=>({value:row.key,label:`${row.label}${row.regionKey?` · ${options.regions.find((region)=>region.key===row.regionKey)?.label||row.regionKey}`:''}`})));
  if([...$('nextRegionLock').options].some((row)=>row.value===previousRegion))$('nextRegionLock').value=previousRegion;
  if([...$('nextOccupationLock').options].some((row)=>row.value===previousOccupation))$('nextOccupationLock').value=previousOccupation;
}
function nextLifeOriginLocks(){return{region:$('nextRegionLock').value,occupation:$('nextOccupationLock').value};}
function allocationUnits(id){return Math.max(0,Math.trunc(Number($(id).value)||0));}
function nextLifeAllocations(){
  const rows=[];
  for(const [id,target] of [['inheritStatBody','body'],['inheritStatMana','mana'],['inheritStatIntelligence','intelligence'],['inheritStatDivinity','divinity']]){const units=allocationUnits(id);if(units)rows.push({kind:'stat',target,units});}
  for(const [id,target] of [['inheritTalentMagic','magic'],['inheritTalentMartial','martial'],['inheritTalentSoul','soul'],['inheritTalentKnowledge','knowledge']]){const units=allocationUnits(id);if(units)rows.push({kind:'talent',target,units});}
  for(const [id,target] of [['inheritGold','gold'],['inheritSupplies','supplies']]){const units=allocationUnits(id);if(units)rows.push({kind:'resource',target,units});}
  const affinityUnits=allocationUnits('inheritAffinityUnits'),affinityTarget=$('nextAffinity').value;
  if(affinityUnits){if(!affinityTarget)throw new Error('Fate Affinity 대상을 선택해야 함.');rows.push({kind:'affinity',target:affinityTarget,units:affinityUnits});}
  const rerolls=Math.max(0,nextLifePreviewCount-1);if(rerolls)rows.push({kind:'origin_reroll',target:'origin',units:rerolls});
  const locks=nextLifeOriginLocks();if(locks.region)rows.push({kind:'origin_lock',target:`region:${locks.region}`,units:1});if(locks.occupation)rows.push({kind:'origin_lock',target:`occupation:${locks.occupation}`,units:1});
  return rows;
}
function nextLifeRequest(){
  if(!nextLifePreviewSeed||!nextLifePreviewCharacter)throw new Error('Origin 미리보기를 먼저 확정해야 함.');
  return{gender:$('nextGender').value,socialClass:$('nextSocialClass').value,department:$('nextDepartment').value,originSeed:nextLifePreviewSeed,originLocks:nextLifeOriginLocks(),allocations:nextLifeAllocations()};
}
function updateNextLifeQuote(){
  const target=$('nextLifeQuote');if(!nextLifePreviewCharacter){target.textContent='Origin 미리보기 후 비용을 확인할 수 있음.';return;}
  try{
    const rows=nextLifeAllocations();
    if(!rows.length){target.textContent='allocation을 하나 이상 선택해야 함.';return;}
    const quote=quoteInheritanceAllocations(rows,{origin:nextLifePreviewCharacter.creation.fateStart.origin,originLocks:nextLifeOriginLocks(),allowedAffinityKeys:FATE_AFFINITY_ELIGIBLE_KEYS}),balance=inheritanceBalance(fateBook,inheritanceMeta);
    target.textContent=`비용 ${quote.cost} point · 현재 잔여 ${balance.available} · 확정 후 ${balance.available-quote.cost}`;
  }catch(error){target.textContent=`확정 불가: ${error.message}`;}
}
function previewNextLifeOrigin(){
  try{
    if(nextLifePreviewSourceRunId!==save.id)throw new Error('active run이 변경되어 Origin preview를 폐기함.');
    const previewCount=nextLifePreviewCount+1,previewSeed=crypto.randomUUID?.()||`${Date.now()}-${previewCount}`;
    const previewCharacter=generateFateStartingCharacter({gender:$('nextGender').value,socialClass:$('nextSocialClass').value,department:$('nextDepartment').value,seed:previewSeed,originLocks:nextLifeOriginLocks()});
    nextLifePreviewCount=previewCount;nextLifePreviewSeed=previewSeed;nextLifePreviewCharacter=previewCharacter;
    sessionStorage.setItem(INHERITANCE_PREVIEW_SESSION_KEY,JSON.stringify({sourceRunId:save.id,count:nextLifePreviewCount}));
    const origin=nextLifePreviewCharacter.creation.fateStart.origin;
    $('nextOriginPreview').textContent=`${origin.name} · ${origin.region} · ${origin.occupation}\n${origin.originStory.join('\n')}\n기본 경지 평가: ${nextLifePreviewCharacter.pc.realm}`;
    $('nextOriginPreviewBtn').textContent=nextLifePreviewCount===1?'Origin 다시 굴리기 (+cost)':'Origin 다시 굴리기 (+progressive cost)';
    updateNextLifeQuote();
  }catch(error){nextLifePreviewCharacter=null;nextLifePreviewSeed='';$('nextOriginPreview').textContent=`Origin 생성 거부: ${error.message}`;updateNextLifeQuote();}
}
function invalidateNextLifePreview(){nextLifePreviewCharacter=null;nextLifePreviewSeed='';$('nextOriginPreview').textContent='선택이 변경됨. Origin을 다시 미리보기 해야 함.';updateNextLifeQuote();}
function openNextLifeDialog(){
  if(!currentRunHasEnding())return alert('현재 회차의 Ending 또는 Dead Ending이 먼저 확정되어야 함.');
  const balance=inheritanceBalance(fateBook,inheritanceMeta);if(balance.available<=0)return alert('사용 가능한 계승 원천이 없음.');
  const previewSession=loadJsonFromStorage(sessionStorage,INHERITANCE_PREVIEW_SESSION_KEY);
  nextLifePreviewSourceRunId=save.id;nextLifePreviewCount=previewSession?.sourceRunId===save.id?Math.max(0,Math.trunc(Number(previewSession.count)||0)):0;nextLifePreviewSeed='';nextLifePreviewCharacter=null;
  const fate=save.creation?.mode==='fate'?save.creation.fateStart:null;
  $('nextGender').value=fate?.gender||'female';$('nextSocialClass').value=fate?.socialClass||'commoner';
  replaceSelectOptions($('nextDepartment'),FATE_START_DEPARTMENTS.map((value)=>({value,label:value})),{emptyLabel:''});$('nextDepartment').value=fate?.department||FATE_START_DEPARTMENTS[0];
  replaceSelectOptions($('nextAffinity'),FATE_AFFINITY_ELIGIBLE_KEYS.map((key)=>({value:key,label:ASSETS.characters[key]?.name||key})));
  $('nextRegionLock').value='';$('nextOccupationLock').value='';
  syncNextLifeOriginOptions();
  for(const id of ['inheritStatBody','inheritStatMana','inheritStatIntelligence','inheritStatDivinity','inheritTalentMagic','inheritTalentMartial','inheritTalentSoul','inheritTalentKnowledge','inheritGold','inheritSupplies','inheritAffinityUnits'])$(id).value='0';
  $('nextLifeBalance').textContent=`획득 ${balance.earned} · 사용 ${balance.spent} · 잔여 ${balance.available}. receipt가 commit된 allocation만 새 회차에 적용됨.`;
  $('nextOriginPreview').textContent='아직 Origin을 생성하지 않음.';$('nextOriginPreviewBtn').textContent='Origin 미리보기';updateNextLifeQuote();$('nextLifeDialog').showModal();
}
async function submitNextLife(){
  const request=nextLifeRequest(),sourceRunId=save.id,owner=captureActiveRunOwnership(),button=$('nextLifeSubmit');button.disabled=true;
  try{
    const result=await purchaseNextLifeSerialized({
      withLock:(task)=>withMetaProgressionLock(task,{required:true}),sourceRunId,request,allowedAffinityKeys:FATE_AFFINITY_ELIGIBLE_KEYS,
      readCanonical:()=>{
        assertActiveRunOwner(owner);const persisted=readJsonStrict(SAVE_KEY);if(!persisted||String(persisted.id)!==String(sourceRunId))throw new Error('canonical active run이 변경되어 Next Life transaction을 폐기함.');
        const canonical=readCanonicalProgression();
        prepareCanonicalProgressionImport({currentFateBook:canonical.fateBook,currentInheritanceMeta:canonical.inheritanceMeta,incomingFateBook:canonical.fateBook,incomingInheritanceMeta:canonical.inheritanceMeta,incomingRun:persisted,allowedCharacterKeys:ALLOWED_CHARACTER_KEYS});
        return{sourceRun:persisted,...canonical};
      },
      makeNextRun:()=>defaultSave(),
      commitCanonical:(prepared)=>{
        assertActiveRunOwner(owner);prepared.nextRun.updatedAt=new Date().toISOString();
        const route=prepared.nextRun.creation.fateStart.background.startingRoute;
        prepared.nextRun.rollingSummary=`입학식 당일 08:40. ${prepared.nextRun.pc.name}은(는) ${route.arrivalFocus}에 도착했다. ${route.eventMeaning}이며 첫 확인 지점은 ${route.checkpoint}이다. 계승 receipt가 적용된 다음 생이다.`;
        commitRunFateAndInheritance(localStorage,RUN_COMMIT_KEYS,{owner,isOwnerCurrent:isActiveRunOwner,nextRun:prepared.nextRun,nextFateBook:prepared.fateBook,nextInheritanceMeta:prepared.inheritanceMeta});
      },
    });
    fateBook=result.fateBook;inheritanceMeta=result.inheritanceMeta;replaceActiveRun(normalizeSave(result.nextRun));
    sessionStorage.removeItem(INHERITANCE_PREVIEW_SESSION_KEY);nextLifePreviewSourceRunId='';nextLifePreviewCount=0;
    $('nextLifeDialog').close();renderAll();toast(`${save.pc.name}의 다음 생 시작 · ${result.receipt.cost} point 사용`);
  }finally{button.disabled=false;}
}

function renderDebug() {
  refreshScheduleContext();
  const route=save.debug?.lastRoute||{}; const usage=save.debug?.lastUsage||{}; const sc=save.scheduleContext||{};
  const due=(sc.due||[]).map(x=>`- ${x.date} ${x.time} ${x.title} @ ${x.location}`).join('\n')||'-';
  const upcoming=(sc.upcoming||[]).map(x=>`- ${x.time} ${x.title}`).join('\n')||'-';
  const npc=Object.entries(sc.npc_schedule||{}).map(([k,v])=>`- ${ASSETS.characters[k]?.name||k}: ${v.commitment} / ${v.area} [${v.confidence}]`).join('\n')||'-';
  const em=Object.entries(save.emotionStates||{}).slice(-12).map(([k,v])=>`- ${ASSETS.characters[k]?.name||k}: ${v.current} ${Number(v.intensity||0).toFixed(2)} · held ${v.turnsHeld||0}`).join('\n')||'-';
  const mem=(save.debug?.lastMemoryAdds||[]).map(x=>`- [${MEMORY_TYPE_LABELS[x.type]||x.type} P${memoryImportance(x.importance)} L${x.secret_level||0}] ${x.fact}${x.subject ? ` / subject=${x.subject}`:''}${x.confidence!=null ? ` / conf=${Number(x.confidence).toFixed(2)}`:''}`).join('\n')||'-';
  const relchg=(save.debug?.lastRelationChanges||[]).map(x=>`- ${x.npc_key}: 호감 ${x.affinity_delta>=0?'+':''}${x.affinity_delta}, 신뢰 ${x.trust_delta>=0?'+':''}${x.trust_delta}${x.status?` / ${x.status}`:''}\n  cause=${x.cause||x.reason||'-'}\n  expression=${x.expression||'-'}\n  followup=${x.followup||'-'}`).join('\n')||'-';
  const hooks=(save.hooks||[]).filter(x=>!['resolved','expired'].includes(x.status)).slice(-10).map(x=>`- [${x.status}] ${x.title} (${x.id})${x.source_npc_key?` / ${x.source_npc_key}`:''}`).join('\n')||'-';
  const hookchg=(save.debug?.lastHookChanges||[]).map(x=>`- ${x.id}: ${x.status} / ${x.reason||''}`).join('\n')||'-';
  const dir=save.debug?.lastDirector||{};
  const dirPlan=route.director_plan||{};
  const dirCallbacks=(save.director?.callbacks||[]).filter(x=>x.status!=='resolved').slice(-8).map(x=>`- [${x.status}] ${x.key} / T${x.createdTurn}→T${x.lastTurn} / ${x.note||'-'}`).join('\n')||'-';
  const dirRecent=(save.director?.recentSpotlights||[]).slice(-8).map(x=>`- T${x.turn} ${x.beat}/${x.event_kind}: ${(x.keys||[]).join(', ')||'-'}`).join('\n')||'-';
  const eventProgress=save.sceneRuntime?.eventProgress;
  const eventProgressText=eventProgress?.eventInstanceId?`Event: ${eventProgress.eventInstanceId}\nActive beat: ${eventProgress.activeBeat||'-'}\nCompleted:\n${(eventProgress.completedBeats||[]).map(x=>`✓ ${x}`).join('\n')||'-'}`:'No active structured event';
  $('debugContent').textContent=`APP V1.4.8 / SAVE v${save.version}\nTURN ${save.turnNumber}\n\n[MODEL]\n${route.tier||'-'} / ${route.model||'-'}\nreason=${route.reason||'-'} / reasoning=${route.reasoning_effort||'-'}\n\n[TOKENS / COST]\ninput ${usage.input_tokens||0}\ncached ${usage.cached_tokens||0} (${Math.round(Number(usage.cache_hit_rate||0)*100)}%)\noutput ${usage.output_tokens||0}\nreasoning ${usage.reasoning_tokens||0}\nturn $${Number(usage.estimated_usd||0).toFixed(4)} / total $${Number(save.usage.estimatedUsd||0).toFixed(4)}\n\n[WORLD]\n${save.world.date} ${save.world.weekday} ${save.world.time}\n${save.world.location}\n\n[SCHEDULE DUE]\n${due}\n\n[UPCOMING <=4h]\n${upcoming}\n\n[NPC SCHEDULE]\n${npc}\n\n[LAST MEMORY ADDS]\n${mem}\n\n[LAST RELATION CHANGES]\n${relchg}\n\n[ACTIVE HOOKS]\n${hooks}\n\n[LAST HOOK CHANGES]\n${hookchg}\n\n[EMOTION]\n${em}\n\n[EVENT DIRECTOR]\nplan=${dirPlan.intervention||'-'} / choiceDue=${dirPlan.choice_due?'Y':'N'} / crossDue=${dirPlan.cross_department_due?'Y':'N'} / payoffDue=${dirPlan.payoff_due?'Y':'N'}\nplanCandidates=${(dirPlan.candidates||[]).map(x=>`${x.key}:${x.score}`).join(', ')||'-'}\nactual=${dir.intervention||'-'} / beat=${dir.beat||'-'} / kind=${dir.event_kind||'-'}\nspotlight=${(dir.spotlight_keys||[]).join(', ')||'-'}\ncallback=${dir.callback_key||'-'} / phase=${dir.callback_phase||'-'}\nreason=${dir.reason||'-'}\nlastEventTurn=${save.director?.lastEventTurn??'-'} / lastChoice=${save.director?.lastChoicePressureTurn??'-'} / lastCrossDept=${save.director?.lastCrossDepartmentTurn??'-'}\n\n[DIRECTOR CALLBACKS]\n${dirCallbacks}\n\n[RECENT SPOTLIGHT]\n${dirRecent}\n\n[EVENT PROGRESS]\n${eventProgressText}\n\n[COUNTS]\ntimeline ${save.timeline.length}\nscheduled ${(save.scheduledEvents||[]).length}\nhooks ${(save.hooks||[]).length}\nglobal memories ${(save.memories?.global||[]).length}\nnpc memories ${Object.values(save.memories?.npc||{}).reduce((n,x)=>n+(x?.length||0),0)}`;
}

ensureDynamicUi();

actionForm.addEventListener('submit', e => { e.preventDefault(); sendAction(actionInput.value); });
actionInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); actionForm.requestSubmit(); } });
$('infoBtn').addEventListener('click', () => { renderInfo(); $('infoDialog').showModal(); });
$('settingsBtn').addEventListener('click', () => $('settingsDialog').showModal());
$('newGameBtn').addEventListener('click', () => { if (confirm('새 PC를 만들면 현재 세이브는 교체된다. 계속할까?')) openPcCreator(); });
$('nextLifeBtn').addEventListener('click',openNextLifeDialog);
$('saveBtn').addEventListener('click', () => { persist(); toast('폰에 저장됨'); });
$('forceTerraBtn').addEventListener('click', () => { forceTerraOnce = !forceTerraOnce; updateForceTerraButton(); toast(forceTerraOnce ? '다음 1턴 Terra 사용' : 'Terra 예약 취소'); });
$('exportBtn').addEventListener('click',()=>exportSave().catch((error)=>alert(`내보내기 실패: ${error.message}`)));
$('importInput').addEventListener('change', importSave);

for (const key of ['modelMode','reasoningEffort','proseLength']) { $(key).value = settings[key]; $(key).addEventListener('change', e => { settings[key] = e.target.value; persistSettings(); }); }
$('accessToken').value = settings.accessToken || ''; $('accessToken').addEventListener('change', e => { settings.accessToken = e.target.value.trim(); persistSettings(); });
for (const key of ['adultMode','proReasoning','demoMode','showEmotionDebug','developerMode']) { const el=$(key); if (!el) continue; el.checked = Boolean(settings[key]); el.addEventListener('change', e => { settings[key] = e.target.checked; persistSettings(); if(key==='developerMode') { updateDeveloperUi(); renderAll(); } }); }
$('assetTestBtn').addEventListener('click', testAssets);
$('debugBtn').addEventListener('click',async()=>{
  renderDebug(); $('debugDialog').showModal();
  try {
    const regressionUrl = new URL('/lib/debug-regression.js', window.location.origin).href;
    const { mountDebugRegression } = await import(regressionUrl);
    mountDebugRegression($('regressionConsole'));
  } catch (error) {
    const target = $('regressionResults');
    if (target) target.textContent = `회귀 테스트 모듈 로드 실패: ${error.message}`;
  }
});
$('metaBtn')?.addEventListener('click',()=>{ if (busy) return; metaModeOnce=!metaModeOnce; updateMetaButton(); actionInput.focus(); });
$('pcCreatorClose').addEventListener('click',()=>$('pcCreatorDialog').close());
$('pcCreatorClearBtn').addEventListener('click',()=>clearPcCreatorForm({keepPaste:false}));
$('pcPasteApplyBtn').addEventListener('click',applyPastedPcText);
$('pcFreeModeBtn').addEventListener('click',()=>setPcCreationMode('free'));
$('pcFateModeBtn').addEventListener('click',()=>setPcCreationMode('fate'));
$('pcCreatorForm').addEventListener('submit',(e)=>{e.preventDefault();replaceActiveRun(createNewSaveFromCreator());refreshScheduleContext();persist();$('pcCreatorDialog').close();renderAll();toast(save.creation.mode==='fate'?`${save.pc.name}의 운명 생성`:`${save.pc.name} 새 게임 생성`);});
$('nextLifeClose').addEventListener('click',()=>$('nextLifeDialog').close());
$('nextOriginPreviewBtn').addEventListener('click',previewNextLifeOrigin);
$('nextLifeForm').addEventListener('submit',async(e)=>{e.preventDefault();try{await submitNextLife();}catch(error){alert(`Next Life 실패: ${error.message}`);}});
for(const id of ['nextGender','nextDepartment','nextRegionLock','nextOccupationLock'])$(id).addEventListener('change',invalidateNextLifePreview);
$('nextSocialClass').addEventListener('change',()=>{syncNextLifeOriginOptions();invalidateNextLifePreview();});
for(const id of ['inheritStatBody','inheritStatMana','inheritStatIntelligence','inheritStatDivinity','inheritTalentMagic','inheritTalentMartial','inheritTalentSoul','inheritTalentKnowledge','inheritGold','inheritSupplies','inheritAffinityUnits','nextAffinity'])$(id).addEventListener('input',updateNextLifeQuote);

async function exportSave() {
  const bundle=await withMetaProgressionLock(async()=>{
    const canonical=readCanonicalProgression(),persistedRun=readJsonStrict(SAVE_KEY)||save;
    prepareCanonicalProgressionImport({currentFateBook:canonical.fateBook,currentInheritanceMeta:canonical.inheritanceMeta,incomingFateBook:canonical.fateBook,incomingInheritanceMeta:canonical.inheritanceMeta,incomingRun:persistedRun,allowedCharacterKeys:ALLOWED_CHARACTER_KEYS});
    return{format:'lumensia.save.bundle.v3',save:persistedRun,fateBook:canonical.fateBook,inheritanceMeta:canonical.inheritanceMeta};
  });
  const blob = new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`lumensia-save-${bundle.save.world.date}-${bundle.save.world.time.replace(':','')}.json`; a.click(); URL.revokeObjectURL(a.href);
}
async function importSave(e) {
  const file=e.target.files?.[0];if(!file)return;
  try {
    const parsed=JSON.parse(await file.text());
    const bundled=['lumensia.save.bundle.v2','lumensia.save.bundle.v3'].includes(parsed?.format);
    const importedSave=bundled?parsed.save:parsed;
    if(!importedSave?.pc||!importedSave?.world)throw new Error('세이브 형식이 아님');
    const importedBook=bundled?parsed.fateBook:parsed?.fateBook,importedMeta=parsed?.format==='lumensia.save.bundle.v3'?parsed.inheritanceMeta:null;
    const importedRunRaw={...importedSave};delete importedRunRaw.fateBook;const importedRun=normalizeSave(importedRunRaw),owner=captureActiveRunOwnership();
    const prepared=await withMetaProgressionLock(async()=>{
      assertActiveRunOwner(owner);const persistedCurrent=readJsonStrict(SAVE_KEY);if(persistedCurrent&&String(persistedCurrent.id)!==owner.runId)throw new Error('canonical active run이 변경되어 import를 폐기함.');
      const canonical=readCanonicalProgression(),result=prepareCanonicalProgressionImport({currentFateBook:canonical.fateBook,currentInheritanceMeta:canonical.inheritanceMeta,incomingFateBook:importedBook,incomingInheritanceMeta:importedMeta,incomingRun:importedRun,allowedCharacterKeys:ALLOWED_CHARACTER_KEYS});
      result.run.updatedAt=new Date().toISOString();
      commitRunFateAndInheritance(localStorage,RUN_COMMIT_KEYS,{owner,isOwnerCurrent:isActiveRunOwner,nextRun:result.run,nextFateBook:result.fateBook,nextInheritanceMeta:result.inheritanceMeta});
      return result;
    },{required:true});
    fateBook=prepared.fateBook;inheritanceMeta=prepared.inheritanceMeta;replaceActiveRun(prepared.run);
    renderAll();toast('세이브 불러옴');
  } catch(err){alert(`불러오기 실패: ${err.message}`);}
  e.target.value='';
}
function toast(text) { const d=document.createElement('div'); d.textContent=text; d.style.cssText='position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:99;background:#263449;padding:9px 14px;border-radius:999px'; document.body.append(d); setTimeout(()=>d.remove(),1300); }

async function checkHealth() { try { const r=await fetch('/api/health'); const h=await r.json(); $('apiHealth').textContent=h.apiConfigured?`API 연결 준비됨 · ${h.luna} / ${h.terra}${h.accessTokenRequired ? ' · 접속 토큰 필요' : ''}`:'API 키 미설정. Vercel 환경변수 OPENAI_API_KEY를 추가하거나 데모 모드를 켜세요.'; } catch { $('apiHealth').textContent='API 상태를 확인할 수 없음.'; } }

// ===== characters-v2 asset audit: BEGIN =====

const PORTRAIT_EXPRESSION_ORDER = Object.freeze([
  'default',
  'smile',
  'laugh',
  'smug',
  'blush',
  'flustered',
  'serious',
  'annoyed',
  'angry',
  'worried',
  'sad',
  'confused',
  'shock',
]);

function probeImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);

    const img = new Image();

    const done = (ok) => {
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };

    img.onload = () => done(true);
    img.onerror = () => done(false);

    img.src =
      `${url}${url.includes('?') ? '&' : '?'}check=${Date.now()}`;
  });
}

async function testAssets() {
  const results = $('assetResults');
  results.innerHTML = '';
  $('assetDialog').showModal();

  const characters = Object.entries(ASSETS.characters || {});

  if (!characters.length) {
    results.textContent = '등록된 캐릭터가 없습니다.';
    return;
  }

  for (const [key, char] of characters) {
    const item = document.createElement('div');
    item.className = 'asset-item';

    const img = document.createElement('img');
    const label = document.createElement('div');

    label.textContent = `${char?.name || key}: V2 등록 이미지 검사 중`;

    item.append(img, label);
    results.append(item);

    if (!char?.available) {
      img.remove();
      item.classList.add('asset-fail');
      label.textContent = `${char?.name || key}: 등록된 V2 이미지 없음`;
      continue;
    }

    // Only probe files declared by the reviewed manifest. Anastasia intentionally
    // has no portrait/default.webp, while other characters may declare one.
    const portraitRows = PORTRAIT_EXPRESSION_ORDER
      .map((expression) => ({
        expression,
        url: expression === 'default' ? char.default : char?.expressions?.[expression],
      }))
      .filter((row) => row.url);
    const declaredRows = [
      ...portraitRows,
      ...(char.fullbody ? [{ expression: 'fullbody', url: char.fullbody }] : []),
    ];

    label.textContent = `${char?.name || key}: 등록 ${declaredRows.length}종 검사 중`;

    const checks = await Promise.all(
      declaredRows.map(async (row) => ({
        ...row,
        ok: await probeImage(row.url),
      }))
    );

    const failed = checks
      .filter((row) => !row.ok)
      .map((row) => row.expression.toUpperCase());

    const success = declaredRows.length - failed.length;
    const defaultFailed = Boolean(char.default) && failed.includes('DEFAULT');

    const preview = checks.find((row) => row.ok);
    if (preview) img.src = preview.url;
    else img.remove();

    if (!failed.length) {
      label.textContent = `${char?.name || key}: ${success}/${declaredRows.length} DECLARED OK`;
      continue;
    }

    item.classList.add(defaultFailed ? 'asset-fail' : 'asset-warn');

    label.textContent =
      `${char?.name || key}: ${success}/${declaredRows.length} OK · 누락/실패 [${failed.join(', ')}]`;
  }
}

// ===== characters-v2 asset audit: END =====

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
refreshScheduleContext(); updateForceTerraButton(); checkHealth(); renderAll();
