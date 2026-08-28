// Lumensia V1.5.6 Active Threads V1
// Read-only continuity view derived from existing authoritative save roots. No model calls or save mutation.

import { normalizeEventConsequenceHook } from './event-consequence.js';
import { normalizeSceneExitCondition } from './scene-exit.js';
import { normalizeTurnHook } from './turn-hook.js';
import { compactFatePersonalStoryForModel } from './fate-personal-story.js';

export const ACTIVE_THREADS_VERSION = '1.0';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'resolved', 'expired', 'declined']);
const CONTINUE_ACTION_RE = /^\[LUMENSIA V1\.5\.6 CONTINUE\]/i;
const AUTO_ACTION_RE = /^(?:\[AUTO FLOW: PC 새 행동 없음\]|\[LUMENSIA V1\.5\.6 AUTO FLOW — SCENE MOMENTUM HF1\])/i;

function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function cleanText(value, max = 180) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function boundedNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function hash32(value = '') {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function stableTextId(prefix, value) { return `${prefix}:${hash32(cleanText(value, 500).toLowerCase())}`; }
function isTerminal(value) { return TERMINAL_STATUSES.has(String(value || '').toLowerCase()); }
function worldClock(saveState = {}) {
  const world = object(saveState?.world);
  const date = cleanText(world.date, 10);
  const time = cleanText(world.time, 5);
  const match = date.match(/^(\d{1,4})-(\d{2})-(\d{2})$/);
  return match && /^\d{2}:\d{2}$/.test(time) ? `${match[1].padStart(4, '0')}-${match[2]}-${match[3]}T${time}` : null;
}
function scheduleStamp(row = {}) {
  const date = cleanText(row?.date, 10);
  const time = cleanText(row?.time, 5);
  return /^\d{1,4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) ? `${date}T${time}` : null;
}
function sameOccurrence(eventInstanceId = '', scheduleId = '') {
  const eventId = cleanText(eventInstanceId, 120), id = cleanText(scheduleId, 100);
  return Boolean(eventId && id && (eventId === id || eventId.startsWith(`${id}#`)));
}
function completedEventSet(saveState = {}) {
  return new Set(array(saveState?.completedEvents)
    .map((value) => cleanText(typeof value === 'string' ? value : value?.id || value?.title || value?.name, 220).toLowerCase())
    .filter(Boolean));
}
function eventOccurrenceBase(value = '') { return cleanText(value, 120).split('#')[0]; }
function isCompletedEvent(completed, ...values) {
  return values.some((value) => {
    const key = cleanText(value, 220).toLowerCase();
    return key && completed.has(key);
  });
}
function compactThread({ id, source, kind, title, status = 'active', priority = 50, dueAt = null, playerOwned = false, background = false, establishedTurn = 0 } = {}) {
  const stableId = cleanText(id, 120), safeTitle = cleanText(title, 220);
  if (!stableId || !safeTitle) return null;
  return {
    id: stableId,
    source: cleanText(source, 40),
    kind: cleanText(kind, 40),
    title: safeTitle,
    status: cleanText(status, 40) || 'active',
    priority: Math.max(0, Math.min(99, Math.trunc(boundedNumber(priority, 50)))),
    ...(dueAt ? { due_at: cleanText(dueAt, 16) } : {}),
    ...(playerOwned ? { player_owned: true } : {}),
    ...(background ? { background: true } : {}),
    ...(establishedTurn ? { established_turn: Math.max(0, Math.trunc(boundedNumber(establishedTurn, 0))) } : {}),
  };
}
function pushUnique(target, seen, thread) {
  if (!thread || seen.has(thread.id)) return;
  seen.add(thread.id);
  target.push(thread);
}

export function deriveActiveThreads({ saveState = {}, limit = 6, scheduleIds = null } = {}) {
  const save = object(saveState), runtime = object(save.sceneRuntime), rows = [], seen = new Set();
  const max = Math.max(1, Math.min(8, Math.trunc(boundedNumber(limit, 6))));
  const visibleScheduleIds = Array.isArray(scheduleIds) ? new Set(scheduleIds.map((value) => cleanText(value, 100)).filter(Boolean)) : null;
  const completed = completedEventSet(save);
  const turnHook = normalizeTurnHook(runtime.turn_hook), exit = normalizeSceneExitCondition(runtime.exit_condition);

  if (turnHook?.status === 'awaiting-player') {
    pushUnique(rows, seen, compactThread({
      id: `player-boundary:turn-hook:${turnHook.established_turn || 0}`,
      source: 'turn-hook', kind: turnHook.kind, title: turnHook.anchor,
      status: 'awaiting-player', priority: 0, playerOwned: true, establishedTurn: turnHook.established_turn,
    }));
  } else if (exit?.status === 'awaiting-player') {
    pushUnique(rows, seen, compactThread({
      id: `player-boundary:scene-exit:${exit.established_turn || 0}`,
      source: 'scene-exit', kind: exit.kind, title: exit.target,
      status: 'awaiting-player', priority: 0, playerOwned: true, establishedTurn: exit.established_turn,
    }));
  }

  const progress = object(runtime.eventProgress);
  const eventInstanceId = cleanText(progress.eventInstanceId || progress.event_instance_id, 100);
  if (eventInstanceId && progress.paused !== true && !isCompletedEvent(completed, eventInstanceId, eventOccurrenceBase(eventInstanceId))) {
    const beat = cleanText(progress.activeBeat || progress.active_beat, 140);
    pushUnique(rows, seen, compactThread({
      id: `event:${eventInstanceId}`, source: 'scene-runtime', kind: 'current-event',
      title: beat ? `${eventInstanceId} · ${beat}` : eventInstanceId,
      status: 'active', priority: 5,
    }));
  }

  const dueSchedules = array(save?.scheduleContext?.due).filter((row) => {
    if (isTerminal(row?.status)) return false;
    const id = cleanText(row?.id, 100) || stableTextId('schedule', `${row?.title}|${row?.date}|${row?.time}`);
    if (visibleScheduleIds && !visibleScheduleIds.has(id)) return false;
    return !isCompletedEvent(completed, id, row?.title);
  });
  for (const row of dueSchedules.slice(0, 3)) {
    const id = cleanText(row?.id, 100) || stableTextId('schedule', `${row?.title}|${row?.date}|${row?.time}`);
    if (sameOccurrence(eventInstanceId, id)) {
      const current = rows.find((thread) => thread.id === `event:${eventInstanceId}`);
      if (current) {
        current.status = 'active-due';
        const dueAt = scheduleStamp(row);
        if (dueAt) current.due_at = dueAt;
      }
      continue;
    }
    pushUnique(rows, seen, compactThread({
      id: `schedule:${id}`, source: 'schedule', kind: 'hard-boundary',
      title: cleanText(row?.title || row?.note || '도착한 필수 일정', 220), status: 'due', priority: 10,
      dueAt: scheduleStamp(row),
    }));
  }

  const now = worldClock(save);
  for (const hook of array(save.hooks)) {
    const consequence = normalizeEventConsequenceHook(hook);
    if (!consequence || isTerminal(consequence.status) || !now || consequence.due_at > now || consequence.expires_at <= now) continue;
    const hidden = consequence.secret_level >= 3;
    pushUnique(rows, seen, compactThread({
      id: consequence.id, source: 'event-consequence', kind: 'due-consequence',
      title: hidden ? '관찰 가능한 후속 결과가 도착할 시점' : consequence.event_name,
      status: 'due', priority: 12, dueAt: consequence.due_at,
    }));
  }

  for (const value of array(save.activeEvents)) {
    const title = cleanText(typeof value === 'string' ? value : value?.title || value?.name, 220);
    const status = typeof value === 'string' ? 'active' : cleanText(value?.status, 40) || 'active';
    if (!title || isTerminal(status)) continue;
    const id = cleanText(typeof value === 'object' ? value?.id : '', 100) || stableTextId('active-event', title);
    if (isCompletedEvent(completed, id, title)) continue;
    pushUnique(rows, seen, compactThread({ id: `active:${id}`, source: 'active-events', kind: 'active-event', title, status, priority: 20 }));
  }

  for (const [ledgerId, value] of Object.entries(object(runtime.eventProgressByInstance))) {
    const paused = object(value), pausedId = cleanText(paused.eventInstanceId || paused.event_instance_id || ledgerId, 100);
    if (!pausedId || pausedId === eventInstanceId || isCompletedEvent(completed, pausedId, eventOccurrenceBase(pausedId))) continue;
    const beat = cleanText(paused.activeBeat || paused.active_beat, 140);
    pushUnique(rows, seen, compactThread({
      id: `event:${pausedId}`, source: 'scene-runtime', kind: 'paused-event',
      title: beat ? `${pausedId} · ${beat}` : pausedId,
      status: 'paused', priority: 25,
    }));
  }

  for (const hook of array(save.hooks)) {
    if (!hook || isTerminal(hook.status) || normalizeEventConsequenceHook(hook)) continue;
    const title = cleanText(hook.title || hook.note, 220), id = cleanText(hook.id, 100);
    if (!title || !id) continue;
    pushUnique(rows, seen, compactThread({ id: `hook:${id}`, source: 'hooks', kind: cleanText(hook.kind, 40) || 'open-hook', title, status: hook.status || 'open', priority: 30, establishedTurn: hook.createdTurn }));
  }

  for (const callback of array(save?.director?.callbacks)) {
    if (!callback || isTerminal(callback.status)) continue;
    const key = cleanText(callback.key, 100), title = cleanText(callback.note || callback.key, 220);
    if (!key || !title) continue;
    pushUnique(rows, seen, compactThread({ id: `callback:${key}`, source: 'director-callback', kind: 'callback', title, status: callback.status || 'open', priority: 35, establishedTurn: callback.createdTurn }));
  }

  for (const value of array(save.worldArcs)) {
    const title = cleanText(typeof value === 'string' ? value : value?.title || value?.name, 220);
    const status = typeof value === 'string' ? 'active' : cleanText(value?.status, 40) || 'active';
    if (!title || isTerminal(status)) continue;
    const authorityId = cleanText(typeof value === 'object' ? value?.id : '', 100);
    if (isCompletedEvent(completed, authorityId, title)) continue;
    pushUnique(rows, seen, compactThread({ id: stableTextId('world', authorityId || title), source: 'world-arcs', kind: 'background-arc', title: '독립 진행 중인 세계 장기 사건', status, priority: 45, background: true }));
  }

  for (const row of array(save?.scheduleContext?.upcoming).filter((item) => {
    if (isTerminal(item?.status)) return false;
    const id = cleanText(item?.id, 100) || stableTextId('schedule', `${item?.title}|${item?.date}|${item?.time}`);
    if (visibleScheduleIds && !visibleScheduleIds.has(id)) return false;
    return !isCompletedEvent(completed, id, item?.title);
  }).slice(0, 3)) {
    const id = cleanText(row?.id, 100) || stableTextId('schedule', `${row?.title}|${row?.date}|${row?.time}`);
    if (sameOccurrence(eventInstanceId, id)) continue;
    pushUnique(rows, seen, compactThread({
      id: `schedule:${id}`, source: 'schedule', kind: 'upcoming-schedule',
      title: cleanText(row?.title || row?.note || '다가오는 일정', 220), status: 'upcoming', priority: 50,
      dueAt: scheduleStamp(row),
    }));
  }

  const personalStory=compactFatePersonalStoryForModel(save.creation,{existingHooks:save.hooks});
  for(const candidate of array(personalStory?.detail?.candidates)){
    pushUnique(rows,seen,compactThread({
      id:`personal:${candidate.id}`, source:'personal-story', kind:'origin-candidate', title:candidate.title,
      status:'candidate', priority:55, background:true,
    }));
  }

  return rows
    .sort((a, b) => a.priority - b.priority || boundedNumber(a.established_turn) - boundedNumber(b.established_turn) || a.id.localeCompare(b.id))
    .slice(0, max)
    .map(({ priority, ...thread }) => thread);
}

export function buildActiveThreadsDirective({ action = '', saveState = {}, mode = 'game', limit = 6, maxChars = 1150, scheduleIds = null } = {}) {
  const threads = deriveActiveThreads({ saveState, limit, scheduleIds });
  const rawAction = String(action || '').trim();
  const freeze = mode === 'continue' || CONTINUE_ACTION_RE.test(rawAction);
  const auto = mode === 'auto' || AUTO_ACTION_RE.test(rawAction);
  const topPlayerBoundary = threads[0]?.player_owned === true;
  const threadMode = freeze ? 'freeze' : auto && topPlayerBoundary ? 'await-player' : 'current-action-first';
  const compact = threads.map((thread) => ({
    id: cleanText(thread.id, 72), kind: thread.kind, status: thread.status, title: cleanText(thread.title, 92),
    ...(thread.due_at ? { due_at: thread.due_at } : {}),
    ...(thread.player_owned ? { player_owned: true } : {}),
    ...(thread.background ? { background: true } : {}),
  }));
  const safetyRules = [
    '- 기존 save에서 파생한 읽기 전용 보기다. 이 목록 자체를 저장하거나 완료/해결 근거로 사용하지 않는다.',
    '- 현재 USER ACTION이 우선이다. 인과적으로 맞는 최상위 thread 하나만 이어가며 background는 현재 장면에 억지로 호출하지 않는다.',
    '- status=candidate는 아직 발동된 사건이 아니다. 현재 장면과 인과적으로 맞는 후보 최대 하나만 기존 hook으로 구체화한다.',
    '- player_owned/awaiting-player는 플레이어 응답 전 AUTO·NPC·세계가 선택하거나 해결하지 않는다.',
    ...(freeze ? ['- CONTINUE FREEZE: thread를 진전·해결·교체하지 않고 이미 발생한 같은 순간만 보강한다.'] : []),
  ];
  const render = (visible) => ['[ACTIVE THREADS V1 — DERIVED READ-ONLY VIEW]', `THREAD_MODE=${threadMode}`, `THREADS=${JSON.stringify(visible)}`, ...safetyRules].join('\n');
  const budget = Math.max(700, Math.min(1800, Math.trunc(boundedNumber(maxChars, 1150))));
  const visible = compact.slice();
  while (visible.length > 1 && render(visible).length > budget) visible.pop();
  if (visible.length === 1 && render(visible).length > budget) {
    visible[0] = { ...visible[0], id:cleanText(visible[0].id, 48), title:cleanText(visible[0].title, 48) };
  }
  const directive = render(visible);
  return { version: ACTIVE_THREADS_VERSION, mode: threadMode, threads, visible_threads:visible.length, directive };
}
