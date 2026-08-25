import {
  classifySceneIntent,
  nextScheduleBoundaryMinutes,
  scheduleBoundaryLimitMinutes,
} from './scene-momentum.js';

export const SCENE_ORCHESTRATION_VERSION = '1.0';

const PRIMARY_DRIVERS = new Set([
  'user-action', 'player-boundary', 'event-consequence', 'active-event',
  'schedule-boundary', 'present-npc-goal', 'director-event',
  'momentum-recovery', 'scene-continuity', 'frozen',
]);
const SECONDARY_DRIVERS = new Set([
  'none', 'event-consequence', 'active-event', 'schedule-boundary',
  'present-npc-goal', 'director-event', 'momentum-recovery', 'world-response',
]);
const ORDERS = new Set(['answer-only', 'user-action-first', 'action-until-interruption', 'fixed-flow', 'stop', 'freeze']);
const DIRECTOR_GOAL_RESULTS = new Set(['PRESENT_NPC_GOAL_TICK', 'PRESENT_NPC_GOAL_PRIORITY']);
const EFFECT_AXES = new Set(['relationship', 'objective', 'resource', 'growth', 'schedule', 'world-thread']);
const AXIS_MAP = [
  ['locationChanged', 'location'],
  ['timeAdvanced', 'time'],
  ['npcEntered', 'npc-entered'],
  ['npcLeft', 'npc-left'],
  ['npcAction', 'npc-action'],
  ['npcStateChanged', 'npc-state'],
  ['newInformation', 'information'],
  ['eventProgress', 'event'],
  ['relationshipChanged', 'relationship'],
  ['objectiveChanged', 'objective'],
  ['resourceChanged', 'resource'],
  ['growthChanged', 'growth'],
  ['scheduleChanged', 'schedule'],
  ['worldThreadChanged', 'world-thread'],
  ['dangerChanged', 'danger'],
  ['environmentChanged', 'environment'],
];

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function clampText(value, max = 140) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function unique(values) { return [...new Set(array(values).map((value) => clampText(value, 48)).filter(Boolean))].slice(0, 8); }
function driver(value, allowed, fallback) { const token = clampText(value, 48); return allowed.has(token) ? token : fallback; }
function boundedNumber(value, min, max, fallback = min) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }

function hasPlayerBoundary(saveState = {}) {
  const runtime = object(saveState?.sceneRuntime);
  return runtime?.turn_hook?.status === 'awaiting-player'
    || runtime?.exit_condition?.status === 'awaiting-player'
    || Boolean(clampText(runtime?.unresolved_question, 20));
}

function hasActiveEvent(saveState = {}) {
  const progress = object(saveState?.sceneRuntime?.eventProgress);
  const id = clampText(progress.eventInstanceId || progress.event_instance_id, 100);
  return Boolean(id && !progress.paused);
}

function activeEventMatchesDueSchedule(saveState = {}) {
  const progress = object(saveState?.sceneRuntime?.eventProgress);
  const activeId = clampText(progress.eventInstanceId || progress.event_instance_id, 100).toLowerCase();
  if (!activeId || progress.paused) return false;
  return array(saveState?.scheduleContext?.due).some((event) => {
    const dueId = clampText(event?.id || event?.event_instance_id || event?.eventInstanceId, 100).toLowerCase();
    return Boolean(dueId && (activeId === dueId || activeId.startsWith(`${dueId}#`)));
  });
}

function reachableSchedule(saveState, intent) {
  const minutes = nextScheduleBoundaryMinutes(saveState, { futureOnly: false });
  if (minutes == null || minutes < 0) return { reached: false, minutes: null };
  if (minutes === 0) return { reached: true, minutes: 0 };
  const limit = scheduleBoundaryLimitMinutes(intent);
  return { reached: Boolean(intent?.compression && limit > 0 && minutes <= limit), minutes };
}

function directorDriver(telemetry = {}) {
  const result = clampText(telemetry?.result, 80).toUpperCase();
  if (result === 'EVENT_CONSEQUENCE_DUE') return 'event-consequence';
  if (DIRECTOR_GOAL_RESULTS.has(result)) return 'present-npc-goal';
  if (result === 'NPC_EVENT') return 'director-event';
  return 'none';
}

export function normalizeSceneOrchestrationPlan(value = {}) {
  const row = object(value);
  const primary = driver(row.primary, PRIMARY_DRIVERS, 'scene-continuity');
  const secondary = driver(row.secondary, SECONDARY_DRIVERS, 'none');
  const maxDrivers = primary === 'frozen' || primary === 'player-boundary'
    ? 0
    : Math.floor(boundedNumber(row.max_drivers, 1, 2, secondary === 'none' ? 1 : 2));
  return {
    version: SCENE_ORCHESTRATION_VERSION,
    mode: clampText(row.mode || 'game', 16),
    intent: clampText(row.intent || 'generic', 40),
    primary,
    secondary,
    order: driver(row.order, ORDERS, primary === 'frozen' ? 'freeze' : 'fixed-flow'),
    max_drivers: maxDrivers,
    delta_target: Math.floor(boundedNumber(row.delta_target, 0, 8, 0)),
    stop_policy: clampText(row.stop_policy || 'first-important-choice', 120),
    trigger_minutes: row.trigger_minutes == null ? null : Math.floor(boundedNumber(row.trigger_minutes, 0, 1440, 0)),
    source_result: clampText(row.source_result || '', 80) || null,
    suppressed: unique(row.suppressed),
  };
}

export function deriveSceneOrchestrationPlan({ action = '', saveState = {}, mode = 'game', directorTelemetry = null } = {}) {
  const normalizedMode = ['game', 'auto', 'continue', 'meta'].includes(mode) ? mode : 'game';
  const intent = classifySceneIntent(action, { location: saveState?.world?.location || '' });
  const telemetry = object(directorTelemetry);
  const result = clampText(telemetry.result, 80).toUpperCase();
  const systemDriver = directorDriver(telemetry);
  const activeEvent = hasActiveEvent(saveState);
  const activeScheduledEvent = activeEventMatchesDueSchedule(saveState);
  const schedule = reachableSchedule(saveState, intent);
  const pressure = saveState?.sceneRuntime?.momentum?.pressure === 'required'
    || Number(saveState?.sceneRuntime?.momentum?.stall_streak || 0) >= 2;
  const directAction = normalizedMode === 'game' && Boolean(clampText(action, 20));

  if (normalizedMode === 'continue' || normalizedMode === 'meta') {
    return normalizeSceneOrchestrationPlan({
      mode: normalizedMode, intent: intent.kind, primary: 'frozen', secondary: 'none',
      order: 'freeze', max_drivers: 0, delta_target: 0, stop_policy: 'preserve-same-moment', source_result: result,
    });
  }

  if (!directAction && hasPlayerBoundary(saveState)) {
    return normalizeSceneOrchestrationPlan({
      mode: normalizedMode, intent: intent.kind, primary: 'player-boundary', secondary: 'none',
      order: 'stop', max_drivers: 0, delta_target: 0, stop_policy: 'await-player', source_result: result,
      suppressed: ['event-consequence', 'active-event', 'schedule-boundary', 'present-npc-goal', 'director-event', 'momentum-recovery'],
    });
  }

  let selectedSystem = 'none';
  const suppressed = [];
  let triggerMinutes = null;
  if (systemDriver === 'event-consequence') {
    selectedSystem = systemDriver;
    triggerMinutes = Number.isFinite(Number(telemetry.event_consequence_trigger_minutes))
      ? Number(telemetry.event_consequence_trigger_minutes)
      : null;
    if (activeEvent) suppressed.push('active-event');
  } else if (schedule.reached && !activeScheduledEvent) {
    selectedSystem = 'schedule-boundary';
    triggerMinutes = schedule.minutes;
    if (activeEvent) suppressed.push('active-event');
    if (systemDriver !== 'none') suppressed.push(systemDriver);
  } else if (activeEvent) {
    selectedSystem = 'active-event';
    if (systemDriver !== 'none') suppressed.push(systemDriver);
  } else if (systemDriver !== 'none') {
    selectedSystem = systemDriver;
  } else if (pressure) {
    selectedSystem = 'momentum-recovery';
  }

  if (directAction) {
    if (intent.kind === 'decision-sensitive') {
      return normalizeSceneOrchestrationPlan({
        mode: normalizedMode, intent: intent.kind, primary: 'user-action', secondary: 'none', order: 'answer-only',
        max_drivers: 1, delta_target: 0, stop_policy: intent.stopPolicy, source_result: result,
        suppressed: ['event-consequence', 'active-event', 'schedule-boundary', 'present-npc-goal', 'director-event', 'momentum-recovery'],
      });
    }
    const secondary = selectedSystem === 'none' ? 'world-response' : selectedSystem;
    const interrupting = secondary === 'event-consequence' || secondary === 'schedule-boundary';
    return normalizeSceneOrchestrationPlan({
      mode: normalizedMode, intent: intent.kind, primary: 'user-action', secondary,
      order: interrupting ? 'action-until-interruption' : 'user-action-first', max_drivers: 2,
      delta_target: Math.max(1, Number(intent.deltaTarget || 0)), stop_policy: intent.stopPolicy,
      trigger_minutes: triggerMinutes, source_result: result, suppressed,
    });
  }

  const primary = selectedSystem === 'none' ? 'scene-continuity' : selectedSystem;
  if (activeEvent && systemDriver === 'director-event') suppressed.push('director-event');
  return normalizeSceneOrchestrationPlan({
    mode: normalizedMode, intent: intent.kind, primary, secondary: 'none', order: 'fixed-flow', max_drivers: 1,
    delta_target: Math.max(1, Number(intent.deltaTarget || 0)), stop_policy: intent.stopPolicy,
    trigger_minutes: triggerMinutes, source_result: result, suppressed,
  });
}

export function buildSceneOrchestrationDirective({ plan = null, action = '', saveState = {}, mode = 'game', directorTelemetry = null } = {}) {
  const row = normalizeSceneOrchestrationPlan(plan || deriveSceneOrchestrationPlan({ action, saveState, mode, directorTelemetry }));
  return [
    '[MULTI-SYSTEM SCENE ORCHESTRATION V1 — CROSS-SYSTEM ARBITRATION]',
    `PRIMARY=${row.primary}`,
    `SECONDARY=${row.secondary}`,
    `ORDER=${row.order}`,
    `MAX_DRIVERS=${row.max_drivers}`,
    `DELTA_TARGET=${row.delta_target}`,
    `STOP_POLICY=${row.stop_policy}`,
    `TRIGGER_MINUTES=${row.trigger_minutes ?? '-'}`,
    `SUPPRESSED=${row.suppressed.join('|') || '-'}`,
    'CONTROL=purpose|exit|hook',
    'EFFECT_ONLY=relationship|faction|skill-learning|offscreen|novelty',
    '- 이 블록은 Purpose·Exit·Hook·Event Director 사이의 최종 우선순위 조정자다. 충돌하면 PRIMARY/SECONDARY/ORDER를 따른다.',
    '- ORDER=action-until-interruption이면 PRIMARY를 TRIGGER_MINUTES의 경계까지만 진행한 뒤 SECONDARY를 처리한다. 그 외에는 PRIMARY를 의미 목표까지 완료한 뒤 SECONDARY가 현재 결과에서 물리적·인과적으로 이어질 때만 한 번 추가한다.',
    '- 무관한 세 번째 사건·카메오·목표를 병렬로 시작하지 않는다.',
    '- EFFECT_ONLY 시스템은 보이는 결과의 근거가 있을 때만 상태 효과를 기록하며, 그 자체가 새 장면 비트나 별도 사건을 요구하지 않는다.',
    '- 첫 중요한 판단점에서 멈추고 PC의 새 행동·대사·감정·생각·수락·거절·선택을 대신 만들지 않는다.',
  ].join('\n');
}

export function sceneOrchestrationActionFrame(value = {}) {
  const row = normalizeSceneOrchestrationPlan(value);
  const chain = row.secondary === 'none' ? row.primary : `${row.primary}>${row.secondary}`;
  return `TURN_PLAN=${chain}; ORDER=${row.order}; MAX_DRIVERS=${row.max_drivers}; EFFECTS_ARE_NOT_DRIVERS`;
}

export function deriveSceneOrchestrationState({ plan = {}, sceneDelta = {}, exitCondition = null, turnHook = null, turnNumber = 0 } = {}) {
  const row = normalizeSceneOrchestrationPlan(plan);
  const flags = object(sceneDelta?.flags);
  const observedAxes = AXIS_MAP.filter(([key]) => Boolean(flags[key])).map(([, axis]) => axis);
  const effectAxes = observedAxes.filter((axis) => EFFECT_AXES.has(axis));
  let status = 'active';
  if (row.primary === 'frozen') status = 'frozen';
  else if (row.primary === 'player-boundary' || exitCondition?.status === 'awaiting-player' || turnHook?.status === 'awaiting-player') status = 'awaiting-player';
  else if (exitCondition?.status === 'reached') status = 'reached';
  return {
    ...row,
    turn_number: Math.max(0, Math.floor(Number(turnNumber) || 0)),
    status,
    observed_axes: observedAxes.slice(0, 12),
    effect_axes: effectAxes.slice(0, 6),
    actual_delta_score: Math.floor(boundedNumber(sceneDelta?.score, 0, 16, 0)),
    actual_structural_score: Math.floor(boundedNumber(sceneDelta?.structuralScore, 0, 16, 0)),
  };
}
