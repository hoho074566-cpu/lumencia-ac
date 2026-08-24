// Lumensia V1.5.6 Event Consequence V1
// Bounded delayed-result queue and lifecycle helpers. No model calls.

export const EVENT_CONSEQUENCE_VERSION = '1.0';

const ACTIVE_STATUSES = new Set(['deferred', 'open']);
const TERMINAL_STATUSES = new Set(['resolved', 'expired', 'declined']);
const GENERIC_TOKENS = new Set(['결과', '후속', '사건', '상황', '변화', '발생', '진행', '관련', 'event', 'result', 'consequence']);

function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function cleanText(value, max = 240) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function normalizeText(value) { return cleanText(value, 600).toLowerCase(); }

function hash32(text = '') {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function dateTimeMinutes(date = '', time = '') {
  const dateMatch = String(date || '').trim().match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
  const timeMatch = String(time || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const stamp = new Date(0);
  stamp.setUTCFullYear(year, month - 1, day);
  stamp.setUTCHours(hour, minute, 0, 0);
  if (stamp.getUTCFullYear() !== year || stamp.getUTCMonth() !== month - 1 || stamp.getUTCDate() !== day || stamp.getUTCHours() !== hour || stamp.getUTCMinutes() !== minute) return null;
  return Math.floor(stamp.getTime() / 60000);
}

function clockMinutes(value = '') {
  const match = String(value || '').trim().match(/^(\d{1,4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return match ? dateTimeMinutes(`${match[1]}-${match[2]}-${match[3]}`, `${match[4]}:${match[5]}`) : null;
}

function clockFromMinutes(total) {
  if (!Number.isFinite(total)) return null;
  const stamp = new Date(total * 60000);
  const year = stamp.getUTCFullYear();
  const month = String(stamp.getUTCMonth() + 1).padStart(2, '0');
  const day = String(stamp.getUTCDate()).padStart(2, '0');
  const hour = String(stamp.getUTCHours()).padStart(2, '0');
  const minute = String(stamp.getUTCMinutes()).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${month}-${day}T${hour}:${minute}`;
}

function worldClock(world = {}) {
  const row = object(world);
  const minutes = dateTimeMinutes(row.date, row.time);
  return minutes == null ? null : clockFromMinutes(minutes);
}

function consequenceFingerprint(row = {}) {
  return normalizeText([row.event_name, row.target_bucket, row.reason].join('|'));
}

export function explicitFutureDelayMinutes(action = '') {
  const matches = [...String(action || '').matchAll(/(\d{1,4})\s*(분|시간|일)\s*(?:뒤|후)/gu)];
  const values = matches.map((match) => {
    const amount = Math.max(1, Number(match[1]) || 0);
    const factor = match[2] === '일' ? 1440 : match[2] === '시간' ? 60 : 1;
    return Math.trunc(clamp(amount * factor, 1, 43200));
  });
  return values.length ? Math.min(...values) : null;
}

export function normalizeEventConsequenceHook(hook = {}) {
  const row = object(hook);
  const meta = object(row.event_consequence);
  if (String(meta.version || '') !== EVENT_CONSEQUENCE_VERSION) return null;
  const id = cleanText(row.id, 80);
  const eventName = cleanText(meta.event_name || row.title, 220);
  const dueAt = cleanText(meta.due_at, 16);
  const expiresAt = cleanText(meta.expires_at, 16);
  const dueMinutes = clockMinutes(dueAt);
  const expiresMinutes = clockMinutes(expiresAt);
  if (!id || !eventName || dueMinutes == null || expiresMinutes == null || expiresMinutes <= dueMinutes) return null;
  return {
    id,
    title: cleanText(row.title || eventName, 220),
    event_name: eventName,
    target_bucket: meta.target_bucket === 'world' ? 'world' : 'active',
    reason: cleanText(meta.reason, 320),
    secret_level: Math.trunc(clamp(meta.secret_level, 0, 5)),
    due_at: dueAt,
    expires_at: expiresAt,
    due_minutes: dueMinutes,
    expires_minutes: expiresMinutes,
    status: ACTIVE_STATUSES.has(row.status) || TERMINAL_STATUSES.has(row.status) ? row.status : 'deferred',
    importance: Math.trunc(clamp(row.importance, 1, 5)) || 3,
    created_turn: Math.max(0, Number(row.createdTurn ?? meta.created_turn ?? 0) || 0),
    source_event: cleanText(meta.source_event, 120) || null,
    fingerprint: cleanText(meta.fingerprint, 600) || consequenceFingerprint(meta),
    raw: row,
  };
}

export function materializeDelayedConsequences({ rows = [], world = {}, advanceMinutes = 0, turnNumber = 0, existingHooks = [], sourceEvent = null, maxAdditions = 3, minimumDelayMinutes = null } = {}) {
  const start = worldClock(world);
  const startMinutes = clockMinutes(start);
  if (startMinutes == null) return [];
  const endMinutes = startMinutes + Math.trunc(clamp(advanceMinutes, 0, 1440));
  const consequenceExisting = array(existingHooks).map(normalizeEventConsequenceHook).filter(Boolean);
  const activeExisting = consequenceExisting.filter((row) => ACTIVE_STATUSES.has(row.status));
  const fingerprints = new Set(consequenceExisting.map((row) => row.fingerprint));
  const queueRoom = Math.max(0, 12 - activeExisting.length);
  const additionLimit = Math.trunc(clamp(maxAdditions, 0, 3));
  const delayFloor = minimumDelayMinutes == null ? 1 : Math.trunc(clamp(minimumDelayMinutes, 1, 43200));
  const additions = [];

  for (const input of array(rows).slice(0, 6)) {
    if (additions.length >= Math.min(additionLimit, queueRoom)) break;
    const eventName = cleanText(input?.event_name, 220);
    const reason = cleanText(input?.reason, 320);
    if (!eventName || !reason) continue;
    const targetBucket = input?.target_bucket === 'world' ? 'world' : 'active';
    const delayMinutes = Math.max(delayFloor, Math.trunc(clamp(input?.delay_minutes, 1, 43200)));
    const secretLevel = Math.trunc(clamp(input?.secret_level, 0, 5));
    const fingerprint = consequenceFingerprint({ event_name:eventName, target_bucket:targetBucket, reason });
    if (!fingerprint || fingerprints.has(fingerprint)) continue;
    const dueMinutes = endMinutes + delayMinutes;
    const lifetimeMinutes = targetBucket === 'world' ? 10080 : 4320;
    const dueAt = clockFromMinutes(dueMinutes);
    const expiresAt = clockFromMinutes(dueMinutes + lifetimeMinutes);
    const id = `consequence:${hash32(`${fingerprint}|${dueAt}|${turnNumber}`)}`;
    const hiddenNote = secretLevel >= 3 ? '원인은 비공개이며 관찰 가능한 결과가 나타날 때만 공개' : reason;
    additions.push({
      id,
      title: eventName,
      kind: 'other',
      source_npc_key: null,
      location: null,
      status: 'deferred',
      importance: targetBucket === 'active' ? 4 : 3,
      note: `[예약된 결과] ${hiddenNote}`.slice(0, 360),
      event_consequence: {
        version: EVENT_CONSEQUENCE_VERSION,
        event_name: eventName,
        target_bucket: targetBucket,
        reason,
        secret_level: secretLevel,
        due_at: dueAt,
        expires_at: expiresAt,
        created_turn: Math.max(0, Number(turnNumber) || 0),
        source_event: cleanText(sourceEvent, 120) || null,
        fingerprint,
      },
    });
    fingerprints.add(fingerprint);
  }
  return additions;
}

export function selectDueEventConsequence(saveState = {}, { lookaheadMinutes = 0 } = {}) {
  const save = object(saveState);
  const now = clockMinutes(worldClock(save.world));
  if (now == null) return null;
  const horizon = now + Math.max(0, Math.trunc(Number(lookaheadMinutes) || 0));
  const rows = array(save.hooks)
    .map(normalizeEventConsequenceHook)
    .filter((row) => row && ACTIVE_STATUSES.has(row.status) && row.expires_minutes > now && row.due_minutes <= horizon)
    .sort((a, b) => a.due_minutes - b.due_minutes || b.importance - a.importance || a.created_turn - b.created_turn || a.id.localeCompare(b.id));
  return rows[0] || null;
}

export function findEventConsequence(saveState = {}, id = '') {
  const target = cleanText(id, 80);
  if (!target) return null;
  return array(saveState?.hooks).map(normalizeEventConsequenceHook).find((row) => row?.id === target) || null;
}

export function minutesUntilEventConsequence(saveState = {}, id = '') {
  const row = findEventConsequence(saveState, id);
  const now = clockMinutes(worldClock(saveState?.world));
  if (!row || now == null) return null;
  return Math.max(0, row.due_minutes - now);
}

export function nextEventConsequenceBoundaryMinutes(saveState = {}) {
  const save = object(saveState);
  const now = clockMinutes(worldClock(save.world));
  if (now == null) return null;
  const deltas = array(save.hooks)
    .map(normalizeEventConsequenceHook)
    .filter((row) => row && ACTIVE_STATUSES.has(row.status) && row.expires_minutes > now)
    .map((row) => Math.max(0, row.due_minutes - now));
  return deltas.length ? Math.min(...deltas) : null;
}

export function expiredEventConsequences(saveState = {}) {
  const save = object(saveState);
  const now = clockMinutes(worldClock(save.world));
  if (now == null) return [];
  return array(save.hooks)
    .map(normalizeEventConsequenceHook)
    .filter((row) => row && ACTIVE_STATUSES.has(row.status) && row.expires_minutes <= now)
    .sort((a, b) => a.expires_minutes - b.expires_minutes || a.id.localeCompare(b.id));
}

function evidenceTokens(row) {
  const source = [row?.event_name, Number(row?.secret_level || 0) <= 2 ? row?.reason : ''].filter(Boolean).join(' ');
  const raw = normalizeText(source).match(/[가-힣a-z0-9_]{2,}/g) || [];
  return [...new Set(raw.map((token) => token.replace(/(?:에게서|에게|한테|께서|으로|에서|까지|부터|처럼|보다|에는|은|는|이|가|을|를|와|과|도|의)$/u, '')).filter((token) => token.length >= 2 && !GENERIC_TOKENS.has(token)))].slice(0, 12);
}

export function eventConsequenceEvidence(turn = {}, consequence = null) {
  const row = consequence?.event_name && consequence?.due_at ? consequence : normalizeEventConsequenceHook(consequence);
  if (!row) return { realized:false, reason:'missing-consequence', matched:[] };
  const delta = object(turn?.state_delta);
  const acknowledgement = array(delta.hooks_update).some((patch) => String(patch?.id || '') === row.id && patch?.status === 'resolved');
  const visible = [turn?.scene_title, turn?.scene_summary, ...array(turn?.scene).map((item) => item?.text), ...array(delta.active_events_add), ...array(delta.completed_events_add), ...array(delta.pc_knowledge_add), ...array(delta.memories_add).map((item) => item?.fact)].filter(Boolean).join(' ').toLowerCase();
  const tokens = evidenceTokens(row);
  const matched = tokens.filter((token) => visible.includes(token));
  const named = normalizeText(row.event_name);
  const directName = named.length >= 3 && visible.includes(named);
  const structuredEvent = array(delta.active_events_add).some((value) => {
    const candidate = normalizeText(value);
    return Boolean(candidate && (candidate.includes(named) || named.includes(candidate)));
  });
  const visibleEvidence = directName || structuredEvent || matched.length >= Math.min(2, Math.max(1, tokens.length));
  const realized = Boolean(visibleEvidence);
  return { realized, reason:visibleEvidence ? 'visible-result' : acknowledgement ? 'structured-ack' : 'not-shown', matched };
}

export function reconcileEventConsequenceLifecycle({ saveState = {}, turn = {}, selectedConsequence = null } = {}) {
  const delta = object(turn?.state_delta);
  const selected = selectedConsequence?.event_name && selectedConsequence?.due_at ? selectedConsequence : normalizeEventConsequenceHook(selectedConsequence);
  const selectedId = selected?.id || '';
  const existingUpdates = array(delta.hooks_update).filter((patch) => patch?.id && String(patch.id) !== selectedId);
  const lifecycle = [];
  let status = 'idle';
  let evidence = { realized:false, reason:'not-selected', matched:[] };

  if (selected && ACTIVE_STATUSES.has(selected.status)) {
    evidence = eventConsequenceEvidence(turn, selected);
    if (evidence.realized) {
      lifecycle.push({ id:selected.id, status:'resolved', reason:`예약된 결과 발현: ${selected.event_name}`.slice(0, 300) });
      status = 'resolved';
    } else {
      if (selected.status !== 'open') lifecycle.push({ id:selected.id, status:'open', reason:'발현 시각 도달; 장면 반영 대기' });
      status = 'open';
    }
  }

  const expired = expiredEventConsequences(saveState).filter((row) => row.id !== selectedId).slice(0, 4);
  for (const row of expired) lifecycle.push({ id:row.id, status:'expired', reason:'Event Consequence V1 bounded lifetime 종료' });
  const expiredIds = new Set(expired.map((row) => row.id));
  const retained = existingUpdates.filter((patch) => !expiredIds.has(String(patch.id)));
  const merged = [...retained.slice(0, Math.max(0, 8 - lifecycle.length)), ...lifecycle].slice(0, 8);
  if (turn?.state_delta && typeof turn.state_delta === 'object') turn.state_delta.hooks_update = merged;
  return {
    version: EVENT_CONSEQUENCE_VERSION,
    selected_id: selectedId || null,
    status,
    evidence: evidence.reason,
    expired_ids: expired.map((row) => row.id),
  };
}

export function buildEventConsequenceDirective(consequence = null, { currentAction = '', triggerMinutes = 0 } = {}) {
  const row = consequence?.event_name && consequence?.due_at ? consequence : normalizeEventConsequenceHook(consequence);
  if (!row) return '';
  const hiddenCause = row.secret_level >= 3;
  const causeLine = hiddenCause
    ? 'CAUSE=HIDDEN — 숨은 원인이나 비밀을 설명하지 말고 지금 관찰 가능한 결과만 보여준다.'
    : `CAUSE=${cleanText(row.reason, 220)}`;
  return `[EVENT CONSEQUENCE V1 — AUTHORITATIVE DUE RESULT]\nID=${row.id}\nEVENT=${row.event_name}\nTARGET=${row.target_bucket}\nDUE=${row.due_at}\nTRIGGER_IN=${Math.max(0, Math.trunc(Number(triggerMinutes) || 0))}min\n${causeLine}\n- 이것은 새 랜덤 사건이 아니라 이전 행동/세계 변화에서 예약된 인과 결과다. 위치·일정·지식·관계 제약 안에서 관찰 가능한 세계/NPC 반응으로 연결한다.\n- 현재 USER ACTION을 지우거나 PC의 행동·대사·감정·수락·거절을 대신하지 않는다. 도중 발현이면 그 시각까지 압축한 뒤 실제 판단이 필요한 첫 지점에서만 멈춘다.\n- 결과를 장면에 실제로 보여준 경우에만 hooks_update에 {id:${row.id}, status:resolved}를 반환한다. 보여주지 못했으면 resolved로 만들지 않는다.\n- 이 결과가 별도의 미래 인과를 정말 만들었을 때만 delayed_consequences_add를 최대 1건 추가한다. 같은 결과를 다시 예약하지 않는다.\nCURRENT_ACTION=${cleanText(currentAction, 240)}`;
}
