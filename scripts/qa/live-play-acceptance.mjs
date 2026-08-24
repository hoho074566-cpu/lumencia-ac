#!/usr/bin/env node

import assert from 'node:assert/strict';

const BASE_URL = String(process.env.LUMENSIA_LIVE_BASE_URL || 'https://lumencia-ac.vercel.app').replace(/\/$/, '');
const ENDPOINT = `${BASE_URL}/api/chat-router`;
const TIMEOUT_MS = Number(process.env.LUMENSIA_LIVE_TIMEOUT_MS || 120000);
const ACCESS_TOKEN = String(process.env.LUMENSIA_LIVE_ACCESS_TOKEN || '').trim();

function array(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function merge(base, patch) {
  if (Array.isArray(patch)) return structuredClone(patch);
  if (!patch || typeof patch !== 'object') return patch;
  const out = { ...object(base) };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(out[key], value)
      : structuredClone(value);
  }
  return out;
}

function baseSave(patch = {}) {
  return merge({
    version: 3,
    turnNumber: 20,
    world: { date: '1285-03-02', time: '09:00', location: 'A동 기숙사 개인실', weather: '맑음' },
    pc: {
      name: '카인', age: 20, department: '기사과', status: '정상', fatigue: 12, gold: 30,
      skills: [], inventory: [],
    },
    relationships: { isabel: { affinity: 5, trust: 2, status: '초면' } },
    npcStates: {
      isabel: { location: '중앙광장', status: '주변을 살피는 중', current_goal: '입학식 이후 교내 분위기를 직접 확인한다.' },
      laris: { location: '대도서관', status: '검술 자료를 찾는 중', current_goal: '필요한 검술 자료를 확보한다.' },
    },
    npcInnerStates: {
      isabel: {
        mood: '경계 섞인 호기심', social_stance: '직설적',
        active_goal: {
          id: 'isabel-campus-read', desire: '입학식 이후 교내 분위기를 직접 확인한다.',
          state: 'active', priority: 3, urgency: 3, progress: 20, target_type: 'place', target_key: '중앙광장',
        },
      },
    },
    emotionStates: {}, activeEvents: [], completedEvents: [], pcKnowledge: [],
    memories: { global: [], npc: {} }, hooks: [],
    scheduledEvents: [
      { id: 'lunch', title: '점심 식사', date: '1285-03-02', time: '12:00', location: '학생식당', status: 'scheduled', importance: 1, participants: [] },
    ],
    scheduleContext: {
      due: [],
      upcoming: [
        { id: 'lunch', title: '점심 식사', date: '1285-03-02', time: '12:00', location: '학생식당', importance: 1, participants: [] },
      ],
      npc_schedule: {},
    },
    director: { lastEventTurn: 16, lastChoicePressureTurn: 16, lastCrossDepartmentTurn: 16, recentBeats: [], callbacks: [] },
    sceneRuntime: {
      scene_key: 'dorm-morning', participants: [], ongoing_topic: '', unresolved_question: '', remaining_beats: [],
      momentum: { stall_streak: 0, pressure: 'normal', recent_deltas: [] },
    },
  }, patch);
}

function recent(action, summary, text, extra = {}) {
  return {
    action, summary, importance: 'routine',
    scene: [{ kind: 'narration', speaker_key: null, speaker_name: null, text }],
    ...extra,
  };
}

function sceneText(turn) {
  return array(turn?.scene).map((row) => String(row?.text || '')).join('\n');
}

function hasPlayerDialogue(turn) {
  return array(turn?.scene).some((row) => row?.kind === 'dialogue' && (
    String(row?.speaker_key || '').toLowerCase() === 'pc' ||
    ['카인', 'Aaa', 'PC'].includes(String(row?.speaker_name || '').trim())
  ));
}

function commonChecks(data) {
  const turn = object(data?.turn);
  const visibleText = JSON.stringify({ title: turn.scene_title, scene: turn.scene, choices: turn.choices });
  return {
    http_contract: Boolean(turn.scene_title && array(turn.scene).length),
    one_stage: Number(data?.pipeline?.stages) === 1,
    stable_route: data?.route?.input_mode === 'game' || data?.route?.input_mode === 'continue',
    no_internal_name_leak: !/(^|[^A-Za-z])(Aaa|PC)([^A-Za-z]|$)/.test(visibleText),
    no_invented_player_dialogue: !hasPlayerDialogue(turn),
    choice_shape: array(turn.choices).length === 0 || array(turn.choices).length === 3,
  };
}

function hookPresent(turn) {
  const dialogue = array(turn?.scene).some((row) => row?.kind === 'dialogue');
  const delta = object(turn?.state_delta);
  const stateHook = [
    ...array(delta.pc_knowledge_add), ...array(delta.hooks_add), ...array(delta.active_events_add),
    ...array(delta.memories_add), ...array(delta.npc_state_updates),
  ].length > 0;
  return array(turn?.choices).length === 3 || dialogue || stateHook || Boolean(turn?.event_progress);
}

const suffix = '도서관에 간다.';
const longPrefix = '전날의 훈련 기록을 차분히 정리한다. '.repeat(300);
const longAction = longPrefix.slice(0, 5000 - suffix.length) + suffix;
assert.equal(longAction.length, 5000);

const cases = [
  {
    id: 'short-travel',
    action: '도서관에 간다.',
    saveState: baseSave(),
    recentTurns: [recent('아침 준비를 마친다.', '기숙사에서 외출 준비를 마쳤다.', '아침 준비를 마쳤다.')],
    rollingSummary: '1285-03-02 아침, 카인은 A동 기숙사 개인실에서 외출 준비를 마쳤다.',
    evaluate(data) {
      const turn = data.turn, delta = object(turn.state_delta);
      return {
        intent_travel: data?.pipeline?.scene_momentum?.intent === 'travel',
        destination_reached: /도서관/.test(String(delta.new_location || '')),
        time_advanced: Number(delta.advance_minutes) >= 3,
        no_corridor_stop: !/복도|계단|현관/.test(String(delta.new_location || '')),
        turn_hook: hookPresent(turn),
      };
    },
  },
  {
    id: 'long-action-travel',
    action: longAction,
    saveState: baseSave(),
    recentTurns: [],
    rollingSummary: '아침 준비가 끝났고 아직 기숙사 방에 있다.',
    evaluate(data) {
      const delta = object(data.turn?.state_delta);
      return {
        intent_travel: data?.pipeline?.scene_momentum?.intent === 'travel',
        destination_reached: /도서관/.test(String(delta.new_location || '')),
        time_advanced: Number(delta.advance_minutes) >= 3,
        bounded_narration: sceneText(data.turn).length < 5000,
      };
    },
  },
  {
    id: 'explicit-wait',
    action: '10분 기다린다.',
    saveState: baseSave({ world: { location: '중앙광장' }, sceneRuntime: { scene_key: 'plaza-wait' } }),
    recentTurns: [],
    rollingSummary: '중앙광장에 도착했다.',
    evaluate(data) {
      const momentum = object(data?.pipeline?.scene_momentum), delta = object(data.turn?.state_delta);
      return {
        intent_wait: momentum.intent === 'wait',
        exact_duration_respected: Number(delta.advance_minutes) === 10,
        real_delta: Number(momentum.score) >= Number(momentum.target),
      };
    },
  },
  {
    id: 'explicit-rest',
    action: '한 시간 쉰다.',
    saveState: baseSave(),
    recentTurns: [],
    rollingSummary: '기숙사 개인실에서 쉴 수 있는 상태다.',
    evaluate(data) {
      const momentum = object(data?.pipeline?.scene_momentum), delta = object(data.turn?.state_delta);
      return {
        intent_downtime: momentum.intent === 'downtime',
        exact_hour_advanced: Number(delta.advance_minutes) === 60,
        real_delta: Number(momentum.score) >= Number(momentum.target),
        no_microstep_stop: !/^(복도|침대 앞|의자 앞)$/.test(String(delta.new_location || '')),
      };
    },
  },
  {
    id: 'repeated-observation',
    action: '게시판을 다시 확인한다.',
    saveState: baseSave({
      world: { location: '기사과 게시판 앞' },
      pcKnowledge: ['기량평가는 3월 5일 오전 10시에 제1연병장에서 열린다.'],
      sceneRuntime: { scene_key: 'knight-board', momentum: { stall_streak: 1, pressure: 'watch', recent_deltas: [] } },
    }),
    recentTurns: [recent('게시판을 확인한다.', '기량평가 일정 공지를 확인했다.', '게시판에는 기량평가가 3월 5일 오전 10시 제1연병장에서 열린다고 적혀 있었다.')],
    rollingSummary: '카인은 기사과 게시판에서 기량평가 일정과 장소를 이미 확인했다.',
    evaluate(data) {
      const text = sceneText(data.turn), delta = object(data.turn?.state_delta);
      const relistsKnownFact = [/3월\s*5일/, /(?:오전\s*)?10시/, /제1연병장/].every((pattern) => pattern.test(text));
      return {
        intent_observe: data?.pipeline?.scene_momentum?.intent === 'observe',
        time_advanced: Number(delta.advance_minutes) >= 1,
        no_bare_known_fact_relist: !relistsKnownFact || hookPresent(data.turn),
        bounded_narration: text.length <= 900,
      };
    },
  },
  {
    id: 'npc-approach-question',
    action: '이사벨에게 다가가 "입학식은 어땠어?"라고 묻는다.',
    saveState: baseSave({
      world: { location: '중앙광장' },
      npcStates: { isabel: { location: '중앙광장', status: '분수대 옆에서 학생들을 살피는 중' } },
      sceneRuntime: { scene_key: 'plaza-isabel', participants: ['isabel'], ongoing_topic: '' },
    }),
    recentTurns: [],
    rollingSummary: '중앙광장에서 이사벨을 발견했다.',
    evaluate(data) {
      const rows = array(data.turn?.scene);
      return {
        isabel_responds: rows.some((row) => row.kind === 'dialogue' && row.speaker_key === 'isabel'),
        no_approach_microturn: rows.some((row) => row.kind === 'dialogue'),
        turn_hook: hookPresent(data.turn),
      };
    },
  },
  {
    id: 'door-location-transition',
    action: '방을 나가 중앙광장으로 간다.',
    saveState: baseSave(),
    recentTurns: [],
    rollingSummary: 'A동 기숙사 개인실에 있다.',
    evaluate(data) {
      const delta = object(data.turn?.state_delta);
      return {
        intent_travel: data?.pipeline?.scene_momentum?.intent === 'travel',
        final_destination: /중앙광장/.test(String(delta.new_location || '')),
        no_door_corridor_stop: !/방문 앞|복도|계단|현관/.test(String(delta.new_location || '')),
        time_advanced: Number(delta.advance_minutes) >= 3,
      };
    },
  },
  {
    id: 'pre-schedule-long-rest',
    action: '두 시간 쉰다.',
    saveState: baseSave({
      world: { time: '11:50', location: 'A동 기숙사 개인실' },
      scheduledEvents: [{ id: 'combat-orientation', title: '기사과 필수 오리엔테이션', date: '1285-03-02', time: '12:00', location: '제1연병장', status: 'scheduled', importance: 5, participants: ['artemis'] }],
      scheduleContext: {
        due: [],
        upcoming: [{ id: 'combat-orientation', title: '기사과 필수 오리엔테이션', date: '1285-03-02', time: '12:00', location: '제1연병장', importance: 5, participants: ['artemis'] }],
      },
    }),
    recentTurns: [],
    rollingSummary: '필수 오리엔테이션까지 10분 남았다.',
    evaluate(data) {
      const turn = object(data.turn), delta = object(turn.state_delta);
      const advance = Number(delta.advance_minutes);
      const scheduled = turn.event_progress?.event_instance_id === 'combat-orientation' ||
        array(delta.scheduled_events_complete).includes('combat-orientation') ||
        /오리엔테이션|연병장/.test(sceneText(turn));
      const meaningfulEarlyStop = advance > 0 && advance < 10 && hookPresent(turn);
      return {
        intent_downtime: data?.pipeline?.scene_momentum?.intent === 'downtime',
        schedule_boundary_not_crossed: advance >= 0 && advance <= 10,
        boundary_or_meaningful_stop: advance === 10 || scheduled || meaningfulEarlyStop,
      };
    },
  },
  {
    id: 'question-form',
    action: '지금 오리엔테이션이 끝난 뒤 대장간에 들를 시간이 있을까?',
    saveState: baseSave({
      world: { date: '1285-03-02', time: '12:00', location: '기사과 강의동 지정교실', weather: '맑음' },
      activeEvents: ['combat-orientation'],
      sceneRuntime: {
        scene_key: 'combat-orientation', participants: ['artemis'], ongoing_topic: '기사과 오리엔테이션 진행 중',
        unresolved_question: '', remaining_beats: ['장비 점검 안내'],
        eventProgress: { eventInstanceId: 'combat-orientation', activeBeat: 'briefing', completedBeats: ['arrival'], paused: false, resumeKey: 'combat-orientation' },
        momentum: { stall_streak: 3, pressure: 'required', recent_deltas: [] },
      },
    }),
    recentTurns: [],
    rollingSummary: '아직 기숙사 개인실에 있다.',
    evaluate(data) {
      const turn = object(data.turn), delta = object(turn.state_delta), event = object(turn.event_progress);
      const eventArrays = [
        ...array(delta.active_events_remove), ...array(delta.completed_events_add), ...array(delta.scheduled_events_complete),
      ].map(String);
      return {
        decision_sensitive: data?.pipeline?.scene_momentum?.intent === 'decision-sensitive',
        no_travel_execution: delta.new_location == null,
        same_moment_preserved: Number(delta.advance_minutes) === 0,
        active_event_not_completed: !eventArrays.includes('combat-orientation'),
        active_event_identity_preserved: !turn.event_progress || (
          event.event_instance_id === 'combat-orientation' && event.active_beat === 'briefing' &&
          array(event.completed_beats).join('|') === 'arrival'
        ),
      };
    },
  },
  {
    id: 'continue-freeze',
    action: '',
    inputMode: 'continue',
    saveState: baseSave({
      world: { location: '대도서관 입구', time: '09:15' },
      sceneRuntime: {
        scene_key: 'library-laris', participants: ['laris'], ongoing_topic: '라리스가 방문 목적을 물었다.',
        unresolved_question: '여기서 뭘 찾는 거야?', remaining_beats: ['라리스가 책을 덮으며 대답을 기다리는 같은 순간을 보강한다.'],
        momentum: { stall_streak: 0, pressure: 'normal', recent_deltas: [] },
      },
    }),
    recentTurns: [{
      action: '도서관에 간다.', summary: '도서관 입구에서 라리스가 방문 목적을 물었다.', importance: 'important',
      scene: [{ kind: 'dialogue', speaker_key: 'laris', speaker_name: '라리스', text: '여기서 뭘 찾는 거야?' }],
    }],
    rollingSummary: '카인은 대도서관 입구에 도착했고 라리스가 방문 목적을 물었다.',
    evaluate(data) {
      const delta = object(data.turn?.state_delta), rows = array(data.turn?.scene), visible = sceneText(data.turn);
      const zeroArrays = Object.entries(delta).filter(([, value]) => Array.isArray(value)).every(([, value]) => value.length === 0);
      const zeroScalars = Number(delta.advance_minutes) === 0 && delta.new_location == null && delta.pc_status == null &&
        Number(delta.fatigue_delta || 0) === 0 && Number(delta.gold_delta || 0) === 0;
      return {
        continue_mode: data?.route?.input_mode === 'continue',
        continue_freeze_intent: data?.route?.scene_momentum?.intent === 'continue-freeze' || data?.pipeline?.context_router?.profile === 'continue-11k-v154',
        zero_scalar_state: zeroScalars,
        zero_state_arrays: zeroArrays,
        no_new_npc_dialogue: rows.every((row) => row.kind !== 'dialogue' && !row.speaker_key && !row.speaker_name),
        no_new_npc_action: !/(?:라리스|NPC).{0,24}(?:말했|대답했|물었|일어섰|움직였|다가왔|떠났|고개를|손을|책을\s*(?:덮|폈))/u.test(visible),
      };
    },
  },
  {
    id: 'completed-event-forward',
    action: '이제 첫 수업을 들으러 강의실로 간다.',
    saveState: baseSave({
      world: { location: '대강당 앞', time: '10:20' },
      activeEvents: [], completedEvents: ['entrance-ceremony'],
      sceneRuntime: {
        scene_key: 'ceremony-aftermath', participants: [], eventProgress: null,
        eventProgressByInstance: { 'entrance-ceremony': { eventInstanceId: 'entrance-ceremony', activeBeat: null, completedBeats: ['welcome', 'freshman-speech', 'ceremony-close'], paused: false } },
      },
    }),
    recentTurns: [recent('입학식을 끝까지 지켜본다.', '입학식이 끝나고 학생들이 대강당을 빠져나왔다.', '입학식은 끝났고 학생들은 각자의 다음 일정으로 흩어졌다.')],
    rollingSummary: '입학식은 완료됐다. 카인은 대강당 앞에서 첫 수업으로 이동하려 한다.',
    evaluate(data) {
      const turn = object(data.turn), text = sceneText(turn), delta = object(turn.state_delta);
      const reactivated = array(delta.active_events_add).some((value) => String(value).includes('entrance-ceremony'));
      return {
        intent_travel: data?.pipeline?.scene_momentum?.intent === 'travel',
        destination_or_meaningful_stop: /강의실|기사과/.test(String(delta.new_location || '')) || array(turn.choices).length === 3,
        no_completed_event_replay: !/신입생 대표 연설|환영사|입학식이 시작/.test(text),
        old_occurrence_not_reactivated: turn.event_progress?.event_instance_id !== 'entrance-ceremony' && !reactivated,
      };
    },
  },
  {
    id: 'npc-initiative',
    action: '10분 기다린다.',
    saveState: baseSave({
      world: { location: '중앙광장' },
      npcStates: { isabel: { location: '중앙광장', status: '카인을 의식하며 주변을 살피는 중', current_goal: '카인의 실력을 직접 확인할 단서를 찾는다.' } },
      npcInnerStates: { isabel: { active_goal: { id: 'isabel-assess-pc', desire: '카인의 실력을 직접 확인할 단서를 찾는다.', state: 'active', priority: 5, urgency: 4, progress: 30, target_type: 'pc', target_key: 'pc' } } },
      sceneRuntime: { scene_key: 'plaza-wait-isabel', participants: ['isabel'], momentum: { stall_streak: 2, pressure: 'required', recent_deltas: [] } },
      director: { lastEventTurn: 12, lastChoicePressureTurn: 18, lastCrossDepartmentTurn: 12 },
    }),
    recentTurns: [recent('분수대 옆에 선다.', '중앙광장 분수대 옆에 섰고 이사벨이 근처에 있다.', '이사벨은 멀지 않은 곳에서 주변 학생들을 살피고 있었다.')],
    rollingSummary: '중앙광장에서 이사벨과 같은 장면에 있다. 이사벨은 카인의 실력을 확인하려는 목표가 있다.',
    evaluate(data) {
      const rows = array(data.turn?.scene);
      const isabelActs = rows.some((row) => row.kind === 'dialogue' && row.speaker_key === 'isabel') ||
        array(data.turn?.state_delta?.npc_state_updates).some((row) => row.npc_key === 'isabel');
      return {
        intent_wait: data?.pipeline?.scene_momentum?.intent === 'wait',
        npc_acts_first: isabelActs,
        time_advanced: Number(data.turn?.state_delta?.advance_minutes) >= 10,
        turn_hook: hookPresent(data.turn),
      };
    },
  },
];

async function callCase(testCase) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const payload = {
    action: testCase.action,
    inputMode: testCase.inputMode || 'game',
    saveState: testCase.saveState,
    recentTurns: testCase.recentTurns || [],
    rollingSummary: testCase.rollingSummary || '',
    availableCgIds: [], forceTerra: false, modelMode: 'luna', reasoningEffort: 'low',
    proseLength: 'short', qualityPipeline: true, backgroundSim: false,
  };
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ACCESS_TOKEN ? { 'x-lumensia-token': ACCESS_TOKEN } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error(`${testCase.id}: HTTP ${response.status} returned non-JSON: ${raw.slice(0, 240)}`); }
    if (!response.ok) {
      const detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error || data).slice(0, 240);
      throw new Error(`${testCase.id}: HTTP ${response.status}: ${detail}`);
    }
    const checks = { ...commonChecks(data), ...testCase.evaluate(data) };
    const failed = Object.entries(checks).filter(([, value]) => value !== true).map(([key]) => key);
    return {
      id: testCase.id, pass: failed.length === 0, failed, checks,
      route: { model: data?.route?.model, profile: data?.route?.context_router?.profile, inputMode: data?.route?.input_mode },
      momentum: data?.pipeline?.scene_momentum,
      usage: data?.usage,
      turn: {
        title: data?.turn?.scene_title,
        importance: data?.turn?.importance,
        scene: array(data?.turn?.scene).map((row) => ({ kind: row.kind, speaker: row.speaker_key || row.speaker_name || null, text: row.text })),
        choices: data?.turn?.choices,
        delta: data?.turn?.state_delta,
        eventProgress: data?.turn?.event_progress,
        summary: data?.turn?.scene_summary,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const testCase of cases) {
  const started = Date.now();
  try {
    const result = await callCase(testCase);
    result.durationMs = Date.now() - started;
    results.push(result);
    process.stderr.write(`${result.pass ? 'PASS' : 'FAIL'} ${result.id} (${result.durationMs}ms)${result.failed.length ? `: ${result.failed.join(', ')}` : ''}\n`);
  } catch (error) {
    results.push({ id: testCase.id, pass: false, failed: ['request_error'], error: error?.message || String(error), durationMs: Date.now() - started });
    process.stderr.write(`FAIL ${testCase.id}: ${error?.message || error}\n`);
  }
}

const failed = results.filter((row) => !row.pass);
console.log(JSON.stringify({ endpoint: ENDPOINT, total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
