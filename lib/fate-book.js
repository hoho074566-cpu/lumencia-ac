const cleanText = (value, max = 240) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const uniq = (values) => [...new Set(array(values).map((value) => cleanText(value, 160)).filter(Boolean))];
const ENDING_ID_RE = /^[a-z0-9][a-z0-9._:-]{1,95}$/;
const CHARACTER_SIGNAL_RE = /^(?:ending:)?character[.:](companion|political_alliance|co_rule|journey|rival_respect)[.:]([a-z0-9_-]{1,64})$/;
const INTERVENTION_ACTION_RE = /(?:운명|운명록|과거\s*(?:회차|비극|죽음)|비극|사망|죽음|되돌|개입|fate|past\s+(?:life|tragedy)|intervention)/i;
const TERMINAL_STATUS = new Set(['사망', '사망 확정', '회복 불가능', 'dead', 'deceased', 'irrecoverable']);

export const FATE_BOOK_VERSION = 1;

export const ENDING_CATEGORY_LABELS = Object.freeze({
  general: '종장',
  character: '인연',
  world: '세계',
  dead: '생사',
  secret: '미지',
});

const definition = (endingId, category, title, conditions, rewardAmount, signals = []) => Object.freeze({
  endingId,
  category,
  title,
  conditions: Object.freeze([...conditions]),
  characters: Object.freeze([]),
  worldState: Object.freeze({}),
  reward: Object.freeze({ kind: 'fate_mark', amount: rewardAmount }),
  discovered: false,
  signals: Object.freeze([...signals]),
});

export const ENDING_REGISTRY = Object.freeze([
  definition('graduation.standard', 'general', '일반 졸업', ['3년 이수', '졸업시험 통과'], 1, ['ending:graduation:standard', 'graduation:standard', '일반 졸업']),
  definition('graduation.honors', 'general', '우등 졸업', ['3년 이수', '졸업시험 통과', '공식 우등 판정'], 2, ['ending:graduation:honors', 'graduation:honors', '우등 졸업']),
  definition('character.companion', 'character', '끝까지 함께한 동료', ['해당 NPC의 resolved character-ending signal'], 2),
  definition('character.political_alliance', 'character', '정치적 동맹', ['해당 NPC의 resolved character-ending signal'], 2),
  definition('character.co_rule', 'character', '공동 통치', ['해당 NPC의 resolved character-ending signal'], 3),
  definition('character.journey', 'character', '함께 떠난 여행', ['해당 NPC의 resolved character-ending signal'], 2),
  definition('character.rival_respect', 'character', '경쟁과 상호 인정', ['해당 NPC의 resolved character-ending signal'], 2),
  definition('world.imperial', 'world', '제국의 다음 시대', ['Imperial end-state resolved'], 3, ['ending:world:imperial', 'world:imperial']),
  definition('world.academy', 'world', '아카데미의 새 질서', ['Academy end-state resolved'], 3, ['ending:world:academy', 'world:academy']),
  definition('world.military', 'world', '전쟁과 군의 결말', ['Military end-state resolved'], 3, ['ending:world:military', 'world:military']),
  definition('world.demon_cult', 'world', '마신교의 결말', ['Demon/Cult end-state resolved'], 4, ['ending:world:demon_cult', 'world:demon_cult']),
  definition('world.god_covenant', 'world', '신과 맺은 계약', ['God branch covenant resolved'], 4, ['ending:world:god_covenant', 'world:god_covenant']),
  definition('world.god_guardian', 'world', '질서의 수호자', ['God branch guardianship resolved'], 4, ['ending:world:god_guardian', 'world:god_guardian']),
  definition('world.god_refusal', 'world', '신의 뜻을 거부한 세계', ['God branch refusal resolved'], 4, ['ending:world:god_refusal', 'world:god_refusal']),
  definition('world.transcendence', 'world', '초월의 문 너머', ['Transcendence end-state resolved'], 4, ['ending:world:transcendence', 'world:transcendence']),
  definition('world.collapse', 'world', '무너진 세계', ['Collapse end-state resolved'], 4, ['ending:world:collapse', 'world:collapse']),
  definition('world.wanderer', 'world', '경계 밖의 방랑자', ['Wanderer end-state resolved'], 3, ['ending:world:wanderer', 'world:wanderer']),
  definition('world.secret', 'secret', '???', ['Secret end-state resolved'], 5, ['ending:world:secret', 'world:secret']),
  definition('dead.irrecoverable', 'dead', '돌아오지 못한 운명', ['authoritative PC status is irrecoverable'], 2, ['ending:dead:irrecoverable', 'dead:irrecoverable']),
]);

const REGISTRY_BY_ID = new Map(ENDING_REGISTRY.map((row) => [row.endingId, row]));

function normalizeEndingId(value) {
  const id = cleanText(value, 96).toLowerCase();
  return ENDING_ID_RE.test(id) ? id : '';
}

function splitCharacterEndingId(endingId) {
  const match = normalizeEndingId(endingId).match(/^character\.(companion|political_alliance|co_rule|journey|rival_respect):([a-z0-9_-]{1,64})$/);
  return match ? { baseId: `character.${match[1]}`, npcKey: match[2] } : null;
}

export function endingDefinition(endingId) {
  const id = normalizeEndingId(endingId);
  if (REGISTRY_BY_ID.has(id)) return { definition: REGISTRY_BY_ID.get(id), endingId: id, characters: [] };
  const dynamic = splitCharacterEndingId(id);
  const base = dynamic ? REGISTRY_BY_ID.get(dynamic.baseId) : null;
  return base ? { definition: base, endingId: id, characters: [dynamic.npcKey] } : null;
}

function normalizeWorldState(value = {}) {
  const state = object(value);
  return {
    date: cleanText(state.date, 16),
    time: cleanText(state.time, 8),
    location: cleanText(state.location, 160),
    status: cleanText(state.status, 120),
    completedEvents: uniq(state.completedEvents).slice(-8),
    activeEvents: uniq(state.activeEvents).slice(-8),
  };
}

function normalizeRecord(raw = {}) {
  const resolved = endingDefinition(raw.endingId ?? raw.ending_id);
  if (!resolved) return null;
  const discoveredTurn = Math.max(0, Math.trunc(Number(raw.discoveredTurn ?? raw.discovered_turn) || 0));
  const characters = resolved.characters.length ? resolved.characters : uniq(raw.characters).slice(0, 4);
  return {
    endingId: resolved.endingId,
    category: resolved.definition.category,
    title: resolved.definition.title,
    conditions: [...resolved.definition.conditions],
    characters,
    worldState: normalizeWorldState(raw.worldState ?? raw.world_state),
    reward: { ...resolved.definition.reward },
    discovered: true,
    discoveredTurn,
    discoveredAt: cleanText(raw.discoveredAt ?? raw.discovered_at, 40),
    runId: cleanText(raw.runId ?? raw.run_id, 80),
    reason: cleanText(raw.reason, 320),
  };
}

export function createFateBookState(runId = '') {
  return {
    version: FATE_BOOK_VERSION,
    records: [],
    rewardTotal: 0,
    currentRun: {
      runId: cleanText(runId, 80),
      status: 'active',
      endingIds: [],
      endedTurn: null,
    },
  };
}

export function normalizeFateBookState(value, { runId = '' } = {}) {
  const source = object(value);
  const records = [];
  const seen = new Set();
  for (const raw of array(source.records ?? source.discoveries)) {
    const row = normalizeRecord(raw);
    if (!row || seen.has(row.endingId)) continue;
    seen.add(row.endingId);
    records.push(row);
  }
  const current = object(source.currentRun ?? source.current_run);
  const currentRunId = cleanText(current.runId ?? current.run_id ?? runId, 80);
  const endingIds = uniq(current.endingIds ?? current.ending_ids).filter((id) => seen.has(id)).slice(-8);
  return {
    version: FATE_BOOK_VERSION,
    records,
    rewardTotal: records.reduce((sum, row) => sum + Math.max(0, Number(row.reward?.amount) || 0), 0),
    currentRun: {
      runId: currentRunId,
      status: current.status === 'ended' && endingIds.length ? 'ended' : 'active',
      endingIds,
      endedTurn: current.endedTurn == null && current.ended_turn == null ? null : Math.max(0, Math.trunc(Number(current.endedTurn ?? current.ended_turn) || 0)),
    },
  };
}

export function mergeFateBookStates(primary, retained = [], { runId = '' } = {}) {
  const preferred = normalizeFateBookState(primary, { runId });
  const records = [...preferred.records];
  const seen = new Set(records.map((row) => row.endingId));
  for (const source of array(retained)) {
    for (const row of normalizeFateBookState(source).records) {
      if (seen.has(row.endingId)) continue;
      seen.add(row.endingId);
      records.push(row);
    }
  }
  return normalizeFateBookState({ ...preferred, records }, { runId });
}

export function beginFateBookRun(value, { runId = '' } = {}) {
  const state = normalizeFateBookState(value);
  return {
    ...state,
    currentRun: {
      runId: cleanText(runId, 80),
      status: 'active',
      endingIds: [],
      endedTurn: null,
    },
  };
}

function endingSignals(saveState = {}) {
  const values = [...array(saveState.completedEvents)];
  for (const hook of array(saveState.hooks)) {
    if (hook?.status === 'resolved') values.push(hook.id);
  }
  return new Set(values.map((value) => cleanText(value, 160).toLowerCase()).filter(Boolean));
}

function knownNpcKeys(saveState = {}) {
  return new Set([
    ...Object.keys(object(saveState.relationships)),
    ...Object.keys(object(saveState.npcStates)),
    ...Object.keys(object(saveState.memories?.npc)),
  ].map((key) => cleanText(key, 64).toLowerCase()).filter(Boolean));
}

function snapshotWorldState(saveState = {}) {
  return normalizeWorldState({
    date: saveState.world?.date,
    time: saveState.world?.time,
    location: saveState.world?.location,
    status: saveState.pc?.status,
    completedEvents: saveState.completedEvents,
    activeEvents: saveState.activeEvents,
  });
}

export function isIrrecoverableStatus(value) {
  const status = cleanText(value, 160).toLowerCase();
  if (!status) return false;
  if (TERMINAL_STATUS.has(status)) return true;
  if (/\b(?:not\s+dead|not\s+deceased|recoverable|revivable|resuscitatable)\b/i.test(status)) return false;
  if (/(?:회복\s*불가능|소생\s*(?:불가|불가능)|부활\s*(?:불가|불가능)|사망\s*확정|irrecoverable)/i.test(status)) return true;
  if (/(?:사망|죽음).{0,12}(?:위험|가능(?:성)?|직전|위기|면함|면했|모면|피함|피했|아님|아니|않음|않았)/.test(status)) return false;
  if (/(?:회복|소생|부활).{0,6}(?:가능|성공|예정)/.test(status)) return false;
  return /(?:(?:치명상.{0,16})?사망|\b(?:dead|deceased)\b)/i.test(status);
}

export function projectEndingState(saveState = {}, turnDelta = {}) {
  const delta = object(turnDelta);
  const hooks = array(saveState.hooks).map((hook) => {
    const patch = array(delta.hooks_update).find((row) => row?.id && row.id === hook?.id);
    return patch ? { ...hook, status: patch.status } : hook;
  });
  return {
    ...saveState,
    pc: { ...object(saveState.pc), ...(cleanText(delta.pc_status, 160) ? { status: cleanText(delta.pc_status, 160) } : {}) },
    completedEvents: uniq([...array(saveState.completedEvents), ...array(delta.completed_events_add)]),
    hooks,
  };
}

function candidateFromDefinition(row, endingId = row.endingId, characters = [], saveState = {}) {
  return {
    endingId,
    category: row.category,
    title: row.title,
    conditions: [...row.conditions],
    characters: [...characters],
    worldState: snapshotWorldState(saveState),
    reward: { ...row.reward },
    discovered: false,
  };
}

function candidatePriority(candidate) {
  if (candidate.category === 'dead') return 100;
  if (candidate.category === 'secret') return 95;
  if (candidate.category === 'world') return 80;
  if (candidate.category === 'character') return 70;
  if (candidate.endingId === 'graduation.honors') return 60;
  return 50;
}

export function deriveEndingCandidates(saveState = {}) {
  const book = normalizeFateBookState(saveState.fateBook, { runId: saveState.id });
  const discovered = new Set(book.records.map((row) => row.endingId));
  const signals = endingSignals(saveState);
  const knownNpcs = knownNpcKeys(saveState);
  const candidates = [];

  for (const row of ENDING_REGISTRY) {
    if (row.category === 'character') continue;
    const signalEligible = row.signals.some((signal) => signals.has(signal));
    const statusEligible = row.endingId === 'dead.irrecoverable' && isIrrecoverableStatus(saveState.pc?.status);
    if ((signalEligible || statusEligible) && !discovered.has(row.endingId)) candidates.push(candidateFromDefinition(row, row.endingId, [], saveState));
  }

  for (const signal of signals) {
    const match = signal.match(CHARACTER_SIGNAL_RE);
    if (!match) continue;
    const npcKey = match[2];
    const baseId = `character.${match[1]}`;
    const row = REGISTRY_BY_ID.get(baseId);
    const endingId = `${baseId}:${npcKey}`;
    if (!row || !knownNpcs.has(npcKey) || discovered.has(endingId)) continue;
    candidates.push(candidateFromDefinition(row, endingId, [npcKey], saveState));
  }

  return candidates.sort((a, b) => candidatePriority(b) - candidatePriority(a) || a.endingId.localeCompare(b.endingId)).slice(0, 3);
}

export function compactFateBookForModel({ saveState = {}, action = '', mode = 'game' } = {}) {
  const book = normalizeFateBookState(saveState.fateBook, { runId: saveState.id });
  const candidates = mode === 'game' ? deriveEndingCandidates(saveState) : [];
  const interventionRelevant = mode === 'game' && INTERVENTION_ACTION_RE.test(String(action || ''));
  const currentRunId = cleanText(saveState.id ?? book.currentRun.runId, 80);
  const pastTragedies = interventionRelevant
    ? book.records.filter((row) => row.category === 'dead' && row.runId && row.runId !== currentRunId).slice(-2).map((row) => ({ endingId: row.endingId, title: row.title, reason: row.reason }))
    : [];
  if (!candidates.length && !pastTragedies.length) return null;
  return {
    version: FATE_BOOK_VERSION,
    rewardTotal: book.rewardTotal,
    discoveredIds: book.records.slice(-12).map((row) => row.endingId),
    eligibleEndings: candidates.map((row) => ({
      endingId: row.endingId,
      category: row.category,
      title: row.title,
      conditions: row.conditions,
      characters: row.characters,
      reward: row.reward,
    })),
    pastTragedies,
  };
}

export function buildFateBookDirective({ saveState = {}, action = '', mode = 'game' } = {}) {
  const context = compactFateBookForModel({ saveState, action, mode });
  if (!context) return '';
  const candidates = context.eligibleEndings.map((row) => `${row.endingId} [${row.category}] characters=${row.characters.join(',') || '-'} reward=${row.reward.amount}`).join(' | ');
  const tragedies = context.pastTragedies.map((row) => row.endingId).join(', ');
  return `[ENDING / DEAD ENDING / FATE BOOK V1]\nELIGIBLE=${candidates || 'none'}\nPAST_TRAGEDIES=${tragedies || 'none'}\n- ending_discoveries는 ELIGIBLE 중 이번 장면에서 회차 결말을 실제로 보여 준 정확한 ending_id 한 건에만 쓴다. 후보가 있다는 이유로 자동 종결하지 않는다.\n- 일반 실패는 Fail Forward이며 Dead Ending이 아니다. Character Ending은 연애 전용이 아니고, characters는 제공된 값을 유지한다. God branch는 제공된 분기를 따르며 임의의 단일 신살 결말로 수렴시키지 않는다.\n- 이미 발견한 결말을 새 발견처럼 지급하지 않는다. 과거 비극은 새 기회의 근거일 뿐 결과 구매/자동 성공이 아니며 현재 회차 능력·관계·정보·선택·아이템으로 판정한다.`;
}

export function sanitizeEndingDiscoveries({ saveState = {}, discoveries = [], mode = 'game', turnDelta = null, synthesizeCurrentTurn = false } = {}) {
  if (mode !== 'game') return [];
  const beforeIds = new Set(deriveEndingCandidates(saveState).map((row) => row.endingId));
  const projected = turnDelta ? projectEndingState(saveState, turnDelta) : saveState;
  const candidates = new Map(deriveEndingCandidates(projected).map((row) => [row.endingId, row]));
  for (const raw of array(discoveries).slice(0, 1)) {
    const endingId = normalizeEndingId(raw?.ending_id ?? raw?.endingId);
    const candidate = candidates.get(endingId);
    const reason = cleanText(raw?.reason, 320);
    if (!candidate || !reason) continue;
    return [{
      ending_id: endingId,
      category: candidate.category,
      characters: [...candidate.characters],
      reason,
    }];
  }
  if (synthesizeCurrentTurn && turnDelta) {
    const candidate = [...candidates.values()].find((row) => !beforeIds.has(row.endingId));
    if (candidate) return [{
      ending_id: candidate.endingId,
      category: candidate.category,
      characters: [...candidate.characters],
      reason: '이번 턴의 authoritative state delta에서 결말 조건이 확정되었다.',
    }];
  }
  return [];
}

export function recordEndingDiscoveries(value, discoveries = [], context = {}) {
  const state = normalizeFateBookState(value, { runId: context.runId });
  const seen = new Set(state.records.map((row) => row.endingId));
  const newRecords = [];
  const rewardsGranted = [];
  for (const raw of array(discoveries).slice(0, 1)) {
    const resolved = endingDefinition(raw?.ending_id ?? raw?.endingId);
    if (!resolved || seen.has(resolved.endingId)) continue;
    const row = normalizeRecord({
      endingId: resolved.endingId,
      characters: resolved.characters.length ? resolved.characters : raw.characters,
      worldState: context.worldState,
      discoveredTurn: context.turnNumber,
      discoveredAt: context.discoveredAt,
      runId: context.runId,
      reason: raw.reason,
    });
    if (!row) continue;
    seen.add(row.endingId);
    state.records.push(row);
    newRecords.push(row);
    rewardsGranted.push({ endingId: row.endingId, ...row.reward });
  }
  if (newRecords.length) {
    state.currentRun = {
      runId: cleanText(context.runId || state.currentRun.runId, 80),
      status: 'ended',
      endingIds: uniq([...state.currentRun.endingIds, ...newRecords.map((row) => row.endingId)]).slice(-8),
      endedTurn: Math.max(0, Math.trunc(Number(context.turnNumber) || 0)),
    };
  }
  const normalized = normalizeFateBookState(state, { runId: context.runId });
  return { state: normalized, newRecords, rewardsGranted };
}

export function renderFateBookSummary(value) {
  const state = normalizeFateBookState(value);
  const grouped = new Map(Object.keys(ENDING_CATEGORY_LABELS).map((category) => [category, []]));
  for (const row of state.records) grouped.get(row.category)?.push(row);
  const lines = [`운명록 ${state.records.length}/${ENDING_REGISTRY.length} · 운명 인장 ${state.rewardTotal}`];
  for (const category of ['general', 'character', 'world', 'dead', 'secret']) {
    const rows = grouped.get(category) || [];
    const known = rows.map((row) => `${row.title}${row.characters.length ? ` (${row.characters.join(', ')})` : ''}`).join(' | ');
    const total = ENDING_REGISTRY.filter((row) => row.category === category).length;
    lines.push(`[${ENDING_CATEGORY_LABELS[category]}] ${known || `미발견 ${total}`}`);
  }
  return lines.join('\n');
}
