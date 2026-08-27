export const SETUP_PAYOFF_MEMORY_VERSION = '1';

const ACTIVE_STATUSES = new Set(['open', 'opportunity']);
const SETUP_PHASES = new Set(['friction', 'pressure']);
const RESOLUTION_PHASES = new Set(['payoff', 'aftermath']);
export const CALLBACK_PHASE_BEAT_CONTRACT = Object.freeze({
  friction: Object.freeze(['friction', 'encounter']),
  pressure: Object.freeze(['friction', 'encounter']),
  payoff_opportunity_open: Object.freeze(['choice', 'payoff_opportunity']),
  payoff_opportunity_continuation: Object.freeze(['choice', 'payoff_opportunity', 'combat']),
  payoff: Object.freeze(['payoff']),
  aftermath: Object.freeze(['aftermath']),
});

function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function clampText(value, max = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) : text;
}
function safeKey(value) {
  const key = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._:#-]{0,79}$/i.test(key) ? key.toLowerCase() : '';
}
function safeNpcKey(value) {
  const key = String(value || '').trim();
  return /^[a-z0-9_-]{1,64}$/i.test(key) ? key.toLowerCase() : '';
}

function callbackRows(saveState = {}) {
  const turn = Math.max(0, Math.trunc(Number(saveState?.turnNumber || 0)));
  return array(saveState?.director?.callbacks).map((raw) => {
    const row = object(raw);
    const key = safeKey(row.key);
    const status = String(row.status || '');
    if (!key || !['open', 'opportunity', 'resolved'].includes(status)) return null;
    const createdTurn = Math.max(0, Math.trunc(Number(row.createdTurn || turn)));
    return {
      key,
      persisted_key: String(row.key || '').trim(),
      status,
      age: Math.max(0, turn - createdTurn),
      created_turn: createdTurn,
      last_turn: Math.max(createdTurn, Math.trunc(Number(row.lastTurn || createdTurn))),
      note: clampText(row.note || '', 220),
      spotlight_keys: [...new Set(array(row.spotlight_keys).map(safeNpcKey).filter(Boolean))].slice(0, 4),
    };
  }).filter(Boolean);
}

function playerOwnedBoundary(saveState = {}) {
  const runtime = object(saveState?.sceneRuntime);
  const hook = object(runtime.turn_hook);
  const exit = object(runtime.exit_condition);
  const hookOwned = hook.status === 'awaiting-player';
  const exitOwned = exit.status === 'awaiting-player';
  const legacyOwned = Boolean(clampText(runtime.unresolved_question || '', 240));
  const establishedTurns = [
    hookOwned ? Number(hook.established_turn) : NaN,
    exitOwned ? Number(exit.established_turn) : NaN,
  ].filter(Number.isFinite).map((value) => Math.max(0, Math.trunc(value)));
  return {
    present: hookOwned || exitOwned || legacyOwned,
    established_turn: establishedTurns.length ? Math.max(...establishedTurns) : null,
    presented_choices: hookOwned && hook.source === 'choices'
      ? String(hook.anchor || '').split(' / ').map((choice) => clampText(choice, 220)).filter(Boolean)
      : [],
  };
}

function selectedPresentedChoice(action, playerBoundary) {
  const selected = clampText(action, 220);
  return Boolean(selected && playerBoundary.presented_choices.includes(selected));
}

function isReachable(row, reachableNpcKeys) {
  if (!row.spotlight_keys.length) return true;
  const reachable = new Set(array(reachableNpcKeys).map(safeNpcKey).filter(Boolean));
  return row.spotlight_keys.some((key) => reachable.has(key));
}

export function deriveSetupPayoffPlan({ saveState = {}, mode = 'game', action = '', reachableNpcKeys = [] } = {}) {
  const normalizedMode = String(mode || 'game').toLowerCase();
  const frozen = ['meta', 'auto', 'continue'].includes(normalizedMode);
  const rows = callbackRows(saveState);
  const resolved = new Set(rows.filter((row) => row.status === 'resolved').map((row) => row.key));
  if (frozen) return { version:SETUP_PAYOFF_MEMORY_VERSION, mode:normalizedMode, selected:null, candidates:[], resolved_keys:[...resolved], reason:`${normalizedMode}-freeze` };

  const playerBoundary = playerOwnedBoundary(saveState);
  const selectedChoice = selectedPresentedChoice(action, playerBoundary);
  const candidates = rows
    .filter((row) => ACTIVE_STATUSES.has(row.status))
    .filter((row) => row.status === 'opportunity'
      ? selectedChoice && playerBoundary.established_turn != null && row.last_turn === playerBoundary.established_turn
      : !playerBoundary.present)
    .filter((row) => isReachable(row, reachableNpcKeys))
    .filter((row) => row.status === 'opportunity' || row.age >= 2)
    .sort((left, right) => {
      const statusOrder = (row) => row.status === 'opportunity' ? 0 : 1;
      return statusOrder(left) - statusOrder(right)
        || right.age - left.age
        || left.last_turn - right.last_turn
        || left.key.localeCompare(right.key);
    })
    .slice(0, 6);
  const selected = candidates[0] || null;
  return {
    version: SETUP_PAYOFF_MEMORY_VERSION,
    mode: normalizedMode,
    selected,
    candidates,
    resolved_keys: [...resolved],
    reason: selected ? (selected.status === 'opportunity' ? 'owned-player-payoff' : 'mature-setup') : playerBoundary.present ? (selectedChoice ? 'player-boundary' : 'player-choice-mismatch') : 'no-eligible-setup',
  };
}

export function buildSetupPayoffDirective(plan = {}) {
  const row = object(plan?.selected);
  const selected = safeKey(row.key);
  const transition = row.status === 'opportunity' ? 'PAYOFF_OR_AFTERMATH_AFTER_PC_ACTION' : selected ? 'PAYOFF_OPPORTUNITY_ONLY' : 'REGISTER_VISIBLE_SETUP_ONLY';
  return [
    '[SETUP -> PAYOFF MEMORY V1]',
    `MODE=${clampText(plan?.mode || 'game', 16)}`,
    `SELECTED_CALLBACK=${selected || '-'}`,
    `SELECTED_STATUS=${selected ? row.status : '-'}`,
    `ALLOWED_TRANSITION=${transition}`,
    'GUARDS=STABLE_EXACT_ID|NO_REOPEN|VISIBLE_SETUP|PLAYER_CHOICE_OWNS_PAYOFF|NO_PC_CONTROL|ONE_CALL',
    '- 실제로 보인 마찰만 friction/pressure와 짧은 영문 stable ID로 등록한다. 숨은 계획은 setup이 아니다.',
    '- selected open은 자동 성공이 아니라 payoff_opportunity와 실제 choices로만 전환한다.',
    '- selected opportunity는 PC의 이번 행동 결과가 보일 때만 payoff/aftermath로 종료한다. ID 교체·완료 ID 재개방 금지.',
    '- selected opportunity가 같은 payoff의 다음 중요 선택으로 이어지면 같은 ID와 payoff_opportunity를 반복해 그 선택에 소유권을 넘긴다. 무관한 선택에는 반복하지 않는다.',
    '- META/AUTO/CONTINUE는 callback 상태를 변경하지 않는다.',
  ].join('\n');
}

function neutralizeDirectorCallback(turn, reason, { rejectTurn = false } = {}) {
  const director = object(turn?.director);
  if (turn && typeof turn === 'object') turn.director = { ...director, callback_key:null, callback_phase:'none', callback_note:null };
  return { version:SETUP_PAYOFF_MEMORY_VERSION, status:'rejected', reason, reject_turn:rejectTurn };
}

function callbackBeatAllowed(contractKey, beat) {
  return array(CALLBACK_PHASE_BEAT_CONTRACT[contractKey]).includes(String(beat || ''));
}

export function restoreSetupPayoffOpportunity({ turn = {}, lifecycle = null, acceptedDirector = null, acceptedChoices = [] } = {}) {
  if (lifecycle?.status !== 'opportunity' || !turn || typeof turn !== 'object') return false;
  const accepted = object(acceptedDirector);
  const acceptedKey = safeKey(accepted.callback_key);
  if (!acceptedKey || acceptedKey !== safeKey(lifecycle?.callback_key) || accepted.callback_phase !== 'payoff_opportunity') return false;

  const retainedChoices = array(turn.choices).map((choice) => clampText(choice, 240)).filter(Boolean);
  const ownedChoices = array(acceptedChoices).map((choice) => clampText(choice, 240)).filter(Boolean);
  const ownedChoiceSurvives = retainedChoices.length > 0
    && retainedChoices.length === ownedChoices.length
    && retainedChoices.every((choice, index) => choice === ownedChoices[index]);
  if (!ownedChoiceSurvives) return false;

  const current = object(turn.director);
  const currentKey = safeKey(current.callback_key);
  const currentPhase = String(current.callback_phase || 'none');
  if ((currentKey && currentKey !== acceptedKey) || !['none', 'payoff_opportunity'].includes(currentPhase)) return false;

  turn.director = {
    ...accepted,
    ...current,
    beat: accepted.beat,
    callback_key: accepted.callback_key,
    callback_phase: 'payoff_opportunity',
    callback_note: null,
  };
  return true;
}

export function reconcileSetupPayoffTurn({ saveState = {}, turn = {}, mode = 'game', plan = null } = {}) {
  const normalizedMode = String(mode || 'game').toLowerCase();
  const director = object(turn?.director);
  const phase = String(director.callback_phase || 'none');
  const payoffClaim = phase === 'payoff_opportunity' || RESOLUTION_PHASES.has(phase);
  const key = safeKey(director.callback_key);
  if (phase === 'none' || !director.callback_key) return { version:SETUP_PAYOFF_MEMORY_VERSION, status:'idle', reason:'no-callback-transition' };
  if (['meta', 'auto', 'continue'].includes(normalizedMode)) return neutralizeDirectorCallback(turn, `${normalizedMode}-freeze`, { rejectTurn:payoffClaim });
  if (!key) return neutralizeDirectorCallback(turn, 'invalid-callback-id', { rejectTurn:payoffClaim });

  const rows = callbackRows(saveState);
  const existing = rows.find((row) => row.key === key) || null;
  const selected = safeKey(plan?.selected?.key);
  const sceneVisible = array(turn?.scene).some((row) => clampText(row?.text || '', 500));

  if (SETUP_PHASES.has(phase)) {
    if (existing?.status === 'resolved') return neutralizeDirectorCallback(turn, 'resolved-callback-cannot-reopen');
    if (existing?.status === 'opportunity') return neutralizeDirectorCallback(turn, 'opportunity-cannot-downgrade');
    if (!sceneVisible || !clampText(director.callback_note || '', 280) || !callbackBeatAllowed(phase, director.beat)) return neutralizeDirectorCallback(turn, 'setup-not-visible');
    turn.director.callback_key = existing?.persisted_key || key;
    return { version:SETUP_PAYOFF_MEMORY_VERSION, status:existing ? 'setup-updated' : 'setup-created', reason:'visible-setup', callback_key:key };
  }

  if (phase === 'payoff_opportunity') {
    if (!existing || !ACTIVE_STATUSES.has(existing.status) || selected !== key) return neutralizeDirectorCallback(turn, 'unselected-payoff-opportunity', { rejectTurn:true });
    const contractKey = existing.status === 'opportunity' ? 'payoff_opportunity_continuation' : 'payoff_opportunity_open';
    if (!callbackBeatAllowed(contractKey, director.beat)) return neutralizeDirectorCallback(turn, 'payoff-opportunity-beat-mismatch', { rejectTurn:true });
    if (!array(turn?.choices).length) return neutralizeDirectorCallback(turn, 'payoff-opportunity-requires-choice', { rejectTurn:true });
    turn.director.callback_key = existing.persisted_key;
    return { version:SETUP_PAYOFF_MEMORY_VERSION, status:'opportunity', reason:'selected-setup-choice', callback_key:key };
  }

  if (RESOLUTION_PHASES.has(phase)) {
    if (!existing || existing.status !== 'opportunity' || selected !== key) return neutralizeDirectorCallback(turn, 'payoff-requires-owned-opportunity', { rejectTurn:true });
    if (!callbackBeatAllowed(phase, director.beat)) return neutralizeDirectorCallback(turn, 'payoff-beat-mismatch', { rejectTurn:true });
    if (!sceneVisible) return neutralizeDirectorCallback(turn, 'payoff-not-visible', { rejectTurn:true });
    if (String(turn?.resolution_log?.outcome || '').toLowerCase() === 'failure') {
      if (!array(turn?.choices).length) return neutralizeDirectorCallback(turn, 'payoff-failure-requires-retry-choice', { rejectTurn:true });
      turn.director = {
        ...director,
        beat: 'payoff_opportunity',
        callback_key: existing.persisted_key,
        callback_phase: 'payoff_opportunity',
        callback_note: null,
      };
      return { version:SETUP_PAYOFF_MEMORY_VERSION, status:'opportunity', reason:'owned-payoff-failure-retry', callback_key:key };
    }
    turn.director.callback_key = existing.persisted_key;
    return { version:SETUP_PAYOFF_MEMORY_VERSION, status:'resolved', reason:'owned-payoff', callback_key:key };
  }

  return neutralizeDirectorCallback(turn, 'unsupported-callback-phase');
}
