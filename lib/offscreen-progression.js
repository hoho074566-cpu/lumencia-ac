import { isPcRelevantScheduleEvent } from './scene-momentum.js';

export const OFFSCREEN_PROGRESSION_VERSION = '1';

const MAX_EVENTS = 2;
const MAX_NPC_UPDATES = 2;
const MAX_CURRENT_STATE_AGE_MINUTES = 60;

function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function clampText(value, max = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) : text;
}
function normalized(value) { return clampText(value, 120).toLowerCase(); }
function safeNpcKey(value) {
  const key = String(value || '').trim();
  return /^[a-z0-9_-]{1,80}$/i.test(key) && !['__proto__', 'prototype', 'constructor'].includes(key) ? key : '';
}
function boundedMinutes(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1440, Math.trunc(number))) : 0;
}
function dateTimeMinutes(date, time = '00:00') {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  if (!dateMatch || !timeMatch) return null;
  const [, year, month, day] = dateMatch.map(Number);
  const [, hour, minute] = timeMatch.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute) / 60000);
}
function dateTimeFromMinutes(value) {
  const stamp = new Date(Number(value) * 60000);
  if (!Number.isFinite(stamp.getTime())) return null;
  const pad = (number) => String(number).padStart(2, '0');
  return {
    date: `${String(stamp.getUTCFullYear()).padStart(4, '0')}-${pad(stamp.getUTCMonth() + 1)}-${pad(stamp.getUTCDate())}`,
    time: `${pad(stamp.getUTCHours())}:${pad(stamp.getUTCMinutes())}`,
  };
}
function knownNpcKeys(saveState = {}) {
  const save = object(saveState);
  const keys = new Set();
  for (const bucket of [save.npcStates, save.npcInnerStates, save.relationships, save.emotionStates, save.memories?.npc]) {
    for (const value of Object.keys(object(bucket))) {
      const key = safeNpcKey(value);
      if (key) keys.add(key);
    }
  }
  for (const [value, row] of Object.entries(object(save.director?.npcExposure))) {
    const key = safeNpcKey(value);
    if (key && Number(row?.appearances || 0) > 0) keys.add(key);
  }
  return keys;
}
function isPublicScheduledEvent(event = {}) {
  const row = object(event);
  if (Number(row.secret_level || 0) > 1 || row.public === false) return false;
  const visibility = normalized(row.visibility || row.access || '');
  if (['secret', 'hidden', 'private', 'gm', 'gm-only'].includes(visibility)) return false;
  const kind = normalized(row.kind);
  return kind === 'academic' || kind === 'public' || row.public === true || visibility === 'public';
}
function terminalScheduleIds(saveState = {}, turn = {}) {
  const save = object(saveState);
  const delta = object(turn?.state_delta);
  return new Set([
    ...array(save.completedEvents),
    ...array(delta.completed_events_add),
    ...array(delta.scheduled_events_complete),
  ].map(String));
}
function emptyResult(reason, { advanceMinutes = 0, startAt = null, endAt = null } = {}) {
  return {
    npc_state_updates: [],
    digest_rows: [],
    telemetry: {
      version: OFFSCREEN_PROGRESSION_VERSION,
      reason,
      advance_minutes: advanceMinutes,
      start_at: startAt,
      end_at: endAt,
      event_ids: [],
      npc_keys: [],
      applied_count: 0,
      digest_count: 0,
    },
  };
}

export function deriveBoundedOffscreenProgression({ saveState = {}, turn = {}, participants = [], enabled = true } = {}) {
  const save = object(saveState);
  const advanceMinutes = boundedMinutes(turn?.state_delta?.advance_minutes);
  const start = dateTimeMinutes(save?.world?.date, save?.world?.time);
  const end = start == null ? null : start + advanceMinutes;
  const startClock = start == null ? null : dateTimeFromMinutes(start);
  const endClock = end == null ? null : dateTimeFromMinutes(end);
  const startAt = startClock ? `${startClock.date} ${startClock.time}` : null;
  const endAt = endClock ? `${endClock.date} ${endClock.time}` : null;
  if (!enabled) return emptyResult('disabled', { advanceMinutes, startAt, endAt });
  if (!advanceMinutes) return emptyResult('no-time-advance', { advanceMinutes, startAt, endAt });
  if (start == null || end == null) return emptyResult('invalid-clock', { advanceMinutes, startAt, endAt });

  const known = knownNpcKeys(save);
  const present = new Set(array(participants).map(safeNpcKey).filter(Boolean));
  const modelUpdated = new Set(array(turn?.state_delta?.npc_state_updates).map(row => safeNpcKey(row?.npc_key || row?.key)).filter(Boolean));
  const terminalIds = terminalScheduleIds(save, turn);
  const events = array(save.scheduledEvents).filter(event => {
    if (!event?.id || terminalIds.has(String(event.id))) return false;
    if (['completed', 'cancelled'].includes(String(event.status || '').toLowerCase())) return false;
    if (!isPublicScheduledEvent(event) || isPcRelevantScheduleEvent(save, event)) return false;
    const at = dateTimeMinutes(event.date, event.time);
    return at != null && at > start && at <= end;
  }).sort((left, right) => {
    const leftAt = dateTimeMinutes(left?.date, left?.time) ?? 0;
    const rightAt = dateTimeMinutes(right?.date, right?.time) ?? 0;
    return leftAt - rightAt || String(left?.id || '').localeCompare(String(right?.id || ''));
  });

  const updates = [];
  const digestRows = [];
  const eventIds = [];
  const seenEventIds = new Set();
  const selectedKeys = new Set();
  for (const event of events) {
    if (eventIds.length >= MAX_EVENTS || selectedKeys.size >= MAX_NPC_UPDATES) break;
    const eventId = clampText(event.id, 100);
    if (!eventId || seenEventIds.has(eventId)) continue;
    seenEventIds.add(eventId);
    const eligible = [...new Set(array(event.participants).map(safeNpcKey).filter(Boolean))].filter(key => (
      key && known.has(key) && !present.has(key) && !modelUpdated.has(key) && !selectedKeys.has(key)
    )).slice(0, MAX_NPC_UPDATES - selectedKeys.size);
    if (!eligible.length) continue;
    const eventAt = dateTimeMinutes(event.date, event.time);
    const ageMinutes = Math.max(0, end - eventAt);
    const title = clampText(event.title || event.id, 120);
    const location = clampText(event.location || '', 100);
    eventIds.push(eventId);
    for (const key of eligible) {
      selectedKeys.add(key);
      if (ageMinutes <= MAX_CURRENT_STATE_AGE_MINUTES) {
        updates.push({
          npc_key: key,
          ...(location ? { location } : {}),
          status: clampText(`${title} 일정에 참여 중`, 140),
          source_event_id: eventId,
          at: `${event.date} ${event.time}`,
        });
      }
    }
    digestRows.push(`[OFFSCREEN ${event.date} ${event.time}] ${eligible.join(', ')}: ${title} 시작${location ? ` @ ${location}` : ''}`);
  }

  return {
    npc_state_updates: updates,
    digest_rows: digestRows,
    telemetry: {
      version: OFFSCREEN_PROGRESSION_VERSION,
      reason: digestRows.length ? 'schedule-start' : 'no-eligible-transition',
      advance_minutes: advanceMinutes,
      start_at: startAt,
      end_at: endAt,
      event_ids: eventIds,
      npc_keys: [...selectedKeys],
      applied_count: updates.length,
      digest_count: digestRows.length,
    },
  };
}

export function appendOffscreenDigest(prior = '', progression = {}) {
  const base = String(prior || '').slice(-1100);
  const rows = array(progression?.digest_rows).map(row => clampText(row, 300)).filter(Boolean).slice(0, MAX_EVENTS);
  if (!rows.length) return String(prior || '').slice(-1800);
  return `${base}${base ? '\n' : ''}${rows.join('\n')}`.slice(-1800);
}
