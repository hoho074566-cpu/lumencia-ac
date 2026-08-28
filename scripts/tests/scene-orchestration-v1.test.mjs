#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  buildSceneOrchestrationDirective,
  deriveSceneOrchestrationPlan,
  deriveSceneOrchestrationState,
  sceneOrchestrationActionFrame,
  sceneOrchestrationSuppressesDirectorResult,
} from '../../lib/scene-orchestration.js';

const adapter = readFileSync('api/chat-router.js', 'utf8');
const contextRouter = readFileSync('api/lib/context-router.js', 'utf8');
const health = readFileSync('api/health.js', 'utf8');

const directQuestion = deriveSceneOrchestrationPlan({
  mode: 'game',
  action: '그 제안을 받아들이면 어떻게 될까?',
  saveState: { world: { location: '학생회실' }, sceneRuntime: { momentum: { pressure: 'required' } } },
  directorTelemetry: { result: 'NPC_EVENT', selected_key: 'chloe' },
});
assert.equal(directQuestion.primary, 'user-action', 'a direct player question must remain the primary driver');
assert.equal(directQuestion.secondary, 'none', 'a direct question must not acquire an unrelated secondary beat');
assert.equal(directQuestion.order, 'answer-only', 'a direct question must stop after the answer instead of executing the contemplated action');
assert.ok(directQuestion.suppressed.includes('director-event'), 'question sovereignty must suppress a random Director event');

const activeEvent = deriveSceneOrchestrationPlan({
  mode: 'game',
  action: '주변의 변화를 살핀다.',
  saveState: {
    world: { location: '중앙광장' },
    sceneRuntime: { eventProgress: { eventInstanceId: 'event:duel', activeBeat: null, paused: false } },
  },
  directorTelemetry: { result: 'NPC_EVENT', selected_key: 'chloe' },
});
assert.equal(activeEvent.primary, 'user-action', 'the current player action must still resolve first inside an active event');
assert.equal(activeEvent.secondary, 'active-event', 'the active event must own the single secondary world beat');
assert.ok(activeEvent.suppressed.includes('director-event'), 'an active event must suppress an unrelated random cameo');
assert.equal(sceneOrchestrationSuppressesDirectorResult(activeEvent, { result: 'NPC_EVENT' }), true);

const dueActiveEvent = deriveSceneOrchestrationPlan({
  mode: 'game',
  action: '입학식의 다음 순서를 지켜본다.',
  saveState: {
    sceneRuntime: { eventProgress: { eventInstanceId: 'entrance_ceremony#1285-03-01t09:00', activeBeat: 'welcome', paused: false } },
    scheduleContext: { due: [{ id: 'entrance_ceremony', kind: 'academic' }] },
  },
  directorTelemetry: { result: 'NO_RANDOM_EVENT_DUE' },
});
assert.equal(dueActiveEvent.secondary, 'active-event', 'a due schedule that is already the active occurrence must not displace its own event flow');

const presentGoal = deriveSceneOrchestrationPlan({
  mode: 'game',
  action: '연무장을 돌아다닌다.',
  saveState: { world: { location: '연무장' }, sceneRuntime: {} },
  directorTelemetry: { result: 'PRESENT_NPC_GOAL_TICK', selected_key: 'artemis' },
});
assert.equal(presentGoal.primary, 'user-action');
assert.equal(presentGoal.secondary, 'present-npc-goal');
assert.equal(presentGoal.order, 'user-action-first', 'proactive NPC behavior must follow completion of the committed player action');
assert.equal(presentGoal.max_drivers, 2, 'one turn may have only one primary plus one causally connected secondary driver');

const scheduleBoundary = deriveSceneOrchestrationPlan({
  mode: 'game',
  action: '좀 쉰다.',
  saveState: {
    world: { date: '1285-03-01', time: '09:00', location: '기숙사' },
    pc: { department: '기사과' },
    scheduledEvents: [{ id: 'orientation', title: '기사과 오리엔테이션', kind: 'academic', date: '1285-03-01', time: '09:30' }],
    sceneRuntime: {},
  },
  directorTelemetry: { result: 'PRESENT_NPC_GOAL_TICK', selected_key: 'artemis' },
});
assert.equal(scheduleBoundary.secondary, 'schedule-boundary', 'compressed downtime must stop at a reachable authoritative schedule');
assert.equal(scheduleBoundary.trigger_minutes, 30);
assert.ok(scheduleBoundary.suppressed.includes('present-npc-goal'), 'a reachable hard schedule must defer a competing NPC goal beat');
const scheduleDirective = buildSceneOrchestrationDirective({ plan: scheduleBoundary });
assert.match(scheduleDirective, /TRIGGER_MINUTES=30/);
assert.match(scheduleDirective, /action-until-interruption은 TRIGGER_MINUTES까지만 진행/,
  'an interrupting boundary must cut off compressed primary action instead of waiting for its full completion');

const resumedTimedScheduleBoundary=deriveSceneOrchestrationPlan({
  mode:'game',
  action:'계속한다.',
  saveState:{
    world:{date:'1285-03-01',time:'09:00',location:'개인실'},
    pc:{name:'카인',department:'기사과'},
    scheduledEvents:[{id:'resumed-class',title:'기사과 필수 수업',kind:'academic',date:'1285-03-01',time:'10:00',status:'scheduled'}],
    scheduleContext:{due:[],upcoming:[{id:'resumed-class',title:'기사과 필수 수업',kind:'academic',date:'1285-03-01',time:'10:00',status:'scheduled'}]},
    sceneRuntime:{timed_action:{kind:'downtime',remaining_minutes:1440}},
  },
  directorTelemetry:{result:'NO_RANDOM_EVENT_DUE'},
});
assert.equal(resumedTimedScheduleBoundary.intent,'downtime','orchestration must classify a resumable timed action with the saved runtime record');
assert.equal(resumedTimedScheduleBoundary.secondary,'schedule-boundary','a required schedule must interrupt a resumed timed action');
assert.equal(resumedTimedScheduleBoundary.trigger_minutes,60,'the resumed orchestration boundary must use the authoritative schedule offset');

const requestedClass={id:'basic-class',title:'기사과 기초 수업',kind:'academic',date:'1285-03-01',time:'10:00',status:'scheduled'};
const ownScheduledActivity=deriveSceneOrchestrationPlan({
  mode:'game',
  action:'10시에 기초 수업에 참석한다.',
  saveState:{world:{date:'1285-03-01',time:'09:00',location:'기숙사'},pc:{department:'기사과'},scheduleContext:{due:[],upcoming:[requestedClass]},scheduledEvents:[requestedClass],sceneRuntime:{}},
  directorTelemetry:{result:'NO_RANDOM_EVENT_DUE'},
});
assert.equal(ownScheduledActivity.secondary,'none','the orchestration layer must not reintroduce the requested class or a redundant world-response driver');
assert.equal(ownScheduledActivity.trigger_minutes,null);

const requestedConsult={id:'personal-consult',title:'개인 상담',kind:'personal',date:'1285-03-01',time:'10:00',status:'scheduled',participants:['emily']};
const namedScheduledActivity=deriveSceneOrchestrationPlan({
  mode:'game',
  action:'10시에 에밀리와 상담한다.',
  saveState:{world:{date:'1285-03-01',time:'09:00',location:'기숙사'},scheduleContext:{due:[],upcoming:[requestedConsult]},scheduledEvents:[requestedConsult],sceneRuntime:{}},
  directorTelemetry:{result:'DIRECT_USER_FOCUS'},
  registry:{emily:'에밀리'},
});
assert.equal(namedScheduledActivity.secondary,'none','canonical participant labels must keep a requested personal appointment out of schedule arbitration and redundant drivers');
assert.equal(namedScheduledActivity.trigger_minutes,null);

const futureDateInterrupted=deriveSceneOrchestrationPlan({
  mode:'game',
  action:'내일 오전 8시에 기사과 기초 수업을 듣는다.',
  saveState:{world:{date:'1285-03-01',time:'09:00',location:'기숙사'},pc:{department:'기사과'},scheduledEvents:[{id:'today-briefing',title:'기사과 필수 브리핑',kind:'academic',date:'1285-03-01',time:'09:30',status:'scheduled'}],scheduleContext:{due:[],upcoming:[{id:'today-briefing',title:'기사과 필수 브리핑',kind:'academic',date:'1285-03-01',time:'09:30',status:'scheduled'}]},sceneRuntime:{}},
  directorTelemetry:{result:'NO_RANDOM_EVENT_DUE'},
});
assert.equal(futureDateInterrupted.secondary,'schedule-boundary','a bounded future-date plan must yield to an earlier authoritative schedule');
assert.equal(futureDateInterrupted.order,'action-until-interruption','orchestration must agree with the date-qualified Scene Momentum boundary');
assert.equal(futureDateInterrupted.trigger_minutes,30);

const dueScheduleDoesNotFreezeAction = deriveSceneOrchestrationPlan({
  mode: 'game',
  action: '기숙사로 간다.',
  saveState: {
    world: { date: '1285-03-01', time: '13:00', location: '중앙광장' },
    pc: { department: '기사과' },
    scheduleContext: { due: [{ id: 'overdue-class', title: '기사과 수업', kind: 'academic' }], upcoming: [] },
    scheduledEvents: [{ id: 'overdue-class', title: '기사과 수업', kind: 'academic', date: '1285-03-01', time: '12:00' }],
    sceneRuntime: {},
  },
  directorTelemetry: { result: 'NO_RANDOM_EVENT_DUE' },
});
assert.equal(dueScheduleDoesNotFreezeAction.secondary, 'none',
  'a due or overdue row is current context and must not become a new schedule interruption or redundant driver');
assert.equal(dueScheduleDoesNotFreezeAction.trigger_minutes, null,
  'a newly committed action must never receive a contradictory 0-minute hard stop from overdue context');

const overduePlusFutureSchedule = deriveSceneOrchestrationPlan({
  mode: 'game',
  action: '두 시간 쉰다.',
  saveState: {
    world: { date: '1285-03-01', time: '13:00', location: '기숙사' },
    pc: { department: '기사과' },
    scheduleContext: {
      due: [{ id: 'overdue-class', title: '기사과 수업', kind: 'academic' }],
      upcoming: [{ id: 'future-class', title: '기사과 보충 수업', kind: 'academic', date: '1285-03-01', time: '13:10' }],
    },
    scheduledEvents: [{ id: 'future-class', title: '기사과 보충 수업', kind: 'academic', date: '1285-03-01', time: '13:10' }],
    sceneRuntime: {},
  },
  directorTelemetry: { result: 'NO_RANDOM_EVENT_DUE' },
});
assert.equal(overduePlusFutureSchedule.secondary, 'schedule-boundary',
  'overdue context must not hide the next strictly future schedule boundary');
assert.equal(overduePlusFutureSchedule.trigger_minutes, 10);

const dueConsequence = deriveSceneOrchestrationPlan({
  mode: 'game',
  action: '잠시 기다린다.',
  saveState: { sceneRuntime: { eventProgress: { eventInstanceId: 'event:lesson', activeBeat: 'lecture', paused: false } } },
  directorTelemetry: { result: 'EVENT_CONSEQUENCE_DUE', event_consequence_trigger_minutes: 5 },
});
assert.equal(dueConsequence.secondary, 'event-consequence');
assert.ok(dueConsequence.suppressed.includes('active-event'), 'the selected due consequence must keep an unrelated active event from becoming a third beat');

const frozenBoundary = deriveSceneOrchestrationPlan({
  mode: 'auto',
  action: '',
  saveState: { sceneRuntime: { turn_hook: { status: 'awaiting-player', kind: 'player-choice' } } },
  directorTelemetry: { result: 'RNG_DISABLED_AUTO' },
});
assert.equal(frozenBoundary.primary, 'player-boundary');
assert.equal(frozenBoundary.secondary, 'none');
assert.equal(frozenBoundary.order, 'stop');

const continueFreeze = deriveSceneOrchestrationPlan({ mode: 'continue', action: 'continue', saveState: {} });
assert.equal(continueFreeze.primary, 'frozen');
assert.equal(continueFreeze.max_drivers, 0);

const directive = buildSceneOrchestrationDirective({ plan: presentGoal });
assert.match(directive, /PRIMARY=user-action/);
assert.match(directive, /SECONDARY=present-npc-goal/);
assert.match(directive, /MAX_DRIVERS=2/);
assert.match(directive, /EFFECT_ONLY=relationship\|faction\|growth\|offscreen\|novelty/);
assert.match(directive, /HARD_DECISION.*종료용 NPC 질문은 금지/);
assert.match(sceneOrchestrationActionFrame(presentGoal), /TURN_PLAN=user-action>present-npc-goal/);
assert.match(sceneOrchestrationActionFrame(activeEvent), /BLOCK=director-event; EFFECT_ONLY/);

const observed = deriveSceneOrchestrationState({
  plan: presentGoal,
  sceneDelta: {
    score: 4,
    structuralScore: 3,
    flags: { locationChanged: true, timeAdvanced: true, relationshipChanged: true, growthChanged: true },
  },
  exitCondition: { status: 'reached' },
  turnHook: { kind: 'new-lead', status: 'active' },
  turnNumber: 8,
});
assert.equal(observed.status, 'reached');
assert.deepEqual(observed.observed_axes, ['location', 'time', 'relationship', 'growth']);
assert.deepEqual(observed.effect_axes, ['relationship', 'growth']);
assert.equal(observed.actual_delta_score, 4);

assert.match(contextRouter, /MULTI-SYSTEM SCENE ORCHESTRATION V1/, 'the cross-system plan must live in reserved routed context');
assert.match(contextRouter, /sceneOrchestrationActionFrame\(orchestration\)/, 'the final action frame must repeat the compact arbitration result after lower-priority authority blocks');
assert.match(contextRouter, /scene_orchestration:built\.orchestration/, 'route telemetry must expose the exact pre-response orchestration plan');
assert.match(adapter, /deriveSceneOrchestrationState/, 'the stable adapter must persist bounded post-response orchestration evidence');
assert.match(adapter, /orchestration:sceneOrchestration/, 'the compact orchestration state must remain inside the existing sceneRuntime root');
assert.match(health, /sceneOrchestration:/, 'health must advertise the active cross-system arbitration layer');
assert.equal((adapter.match(/coreHandler\(/g) || []).length, 1, 'Multi-System Scene V1 must preserve one canonical core call');

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스, mirabelle=미라벨, emily=에밀리
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Public facts.
===== NPC CANON =====
${divider}
아르테미스
${divider}
Canon.
===== NPC SPEECH =====
${divider}
아르테미스
${divider}
Speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve.`;
const routed = routeOpenAIParams(
  { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming: {
    action: `연무장을 돌아다닌다. ${'긴 행동 '.repeat(1500)}`,
    saveState: {
      turnNumber: 8,
      world: { location: '연무장' },
      pc: { name: '아리아', department: '기사과', skills: {}, skillCandidates: {} },
      sceneRuntime: { participants: ['artemis'] },
      npcInnerStates: { artemis: { active_goal: { id: 'inspect', desire: '신입생의 기본기를 확인한다', priority: 5, urgency: 4, state: 'active', target_type: 'pc' } } },
      routerFeedback: { routerVersion: '1.5.6-hf1', profile: 'routine-17k-v154', lastInputTokens: 100000 },
    },
    recentTurns: [],
  }, mode: 'game' },
);
assert.equal(routed.telemetry.adaptive_scale, .76);
assert.ok(routed.params.input.length <= 6840, `orchestration authority exceeded the adaptive routine budget: ${routed.params.input.length}`);
assert.match(routed.params.input, /===== MULTI-SYSTEM SCENE ORCHESTRATION V1 =====/);
assert.match(routed.params.input, /TURN_PLAN=user-action>present-npc-goal/);
assert.equal(routed.telemetry.scene_orchestration.primary, 'user-action');
assert.equal(routed.telemetry.scene_orchestration.secondary, 'present-npc-goal');

const routedNamedAppointment=routeOpenAIParams(
  {instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},
  {incoming:{
    action:'10시에 에밀리와 상담한다.',
    saveState:{turnNumber:8,world:{date:'1285-03-01',time:'09:00',location:'기숙사'},pc:{name:'아리아'},scheduleContext:{due:[],upcoming:[requestedConsult]},scheduledEvents:[requestedConsult],sceneRuntime:{}},
    recentTurns:[],
  },mode:'game'},
);
assert.equal(routedNamedAppointment.telemetry.scene_orchestration.secondary,'none','the routed orchestration plan must receive canonical labels without adding a redundant driver');
assert.equal(routedNamedAppointment.telemetry.scene_orchestration.trigger_minutes,null,'the routed requested appointment must not become its own stop boundary');

const suppressedDirector = routeOpenAIParams(
  { instructions, input: `===== TURN OPTIONS =====
normal
===== AUTHORITATIVE SAVE_STATE =====
{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
INTERVENTION: medium
ROUTINE_STREAK=3 / EVENT_GAP=10 / CHOICE_GAP=3 / CROSS_DEPT_GAP=3
- mirabelle(미라벨) score=999999: 연병장에 새 카메오로 등장
===== SCHEDULE ENGINE (AUTHORITATIVE) =====
없음` },
  { incoming: {
    action: '주변의 변화를 살핀다.',
    saveState: {
      id: 'pr49-active-event-live-regression',
      turnNumber: 24,
      world: { date: '1285-03-02', time: '10:10', location: '제1연병장' },
      pc: { name: '카인', department: '기사과', skills: {}, skillCandidates: {} },
      activeEvents: ['practice_duel'],
      sceneRuntime: {
        participants: [],
        eventProgress: { eventInstanceId: 'practice_duel#1285-03-02t10:10', activeBeat: null, paused: false, resumeKey: 'practice_duel' },
        momentum: { stall_streak: 2, pressure: 'required' },
      },
      director: { rngSeed: 'pr49-active-event-live-regression-0', npcExposure: {}, recentBeats: [], callbacks: [] },
      scheduleContext: { due: [], upcoming: [] },
    },
    recentTurns: [],
  }, mode: 'game' },
);
assert.equal(suppressedDirector.telemetry.event_director_v2.result, 'NPC_EVENT',
  `the regression must contain a real competing Director cameo: ${JSON.stringify(suppressedDirector.telemetry.event_director_v2)}`);
assert.equal(suppressedDirector.telemetry.scene_orchestration.secondary, 'active-event');
assert.ok(suppressedDirector.telemetry.scene_orchestration.suppressed.includes('director-event'));
assert.ok(!suppressedDirector.telemetry.selected_npcs.includes('mirabelle'), 'a suppressed Director candidate must not displace active-event context selection');
assert.match(suppressedDirector.params.input, /RESULT=SUPPRESSED_BY_SCENE_ORCHESTRATION/);
assert.match(suppressedDirector.params.input, /BLOCK=director-event; EFFECT_ONLY/);
assert.doesNotMatch(suppressedDirector.params.input, /SELECTED=mirabelle/,
  'the lower-priority selected cameo must not remain as a contradictory routed instruction');

const autoBoundaryRouted = routeOpenAIParams(
  { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming: {
    action: '',
    saveState: { world: { location: '학생회실' }, pc: { name: '아리아' }, sceneRuntime: { turn_hook: { kind: 'player-choice', status: 'awaiting-player', anchor: '대답' } } },
    recentTurns: [],
  }, mode: 'auto' },
);
assert.equal(autoBoundaryRouted.telemetry.scene_orchestration.primary, 'player-boundary', 'AUTO must preserve an unanswered player boundary');
assert.match(autoBoundaryRouted.params.input, /TURN_PLAN=player-boundary; ORDER=stop; MAX_DRIVERS=0/);

const continueRouted = routeOpenAIParams(
  { instructions, input: '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming: { action: '[LUMENSIA V1.5.6 CONTINUE]', saveState: { world: { location: '학생회실' }, pc: { name: '아리아' }, sceneRuntime: {} }, recentTurns: [] }, mode: 'continue' },
);
assert.equal(continueRouted.telemetry.scene_orchestration.primary, 'frozen', 'CONTINUE must route a frozen cross-system plan');
assert.match(continueRouted.params.input, /TURN_PLAN=frozen; ORDER=freeze; MAX_DRIVERS=0/);

console.log('PASS Multi-System Scene Orchestration V1 priority, chaining, sovereignty, budget, persistence, and one-call regressions');
