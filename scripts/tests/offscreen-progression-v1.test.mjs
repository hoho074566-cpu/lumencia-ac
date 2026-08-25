#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendOffscreenDigest, deriveBoundedOffscreenProgression, OFFSCREEN_PROGRESSION_VERSION } from '../../lib/offscreen-progression.js';

function event(overrides = {}) {
  return {
    id: 'magic-orientation', title: '마법과 1학년 오리엔테이션', date: '1285-03-01', time: '12:00',
    location: '마법과 지정 오리엔테이션 장소', kind: 'academic', status: 'scheduled', participants: ['chloe'], ...overrides,
  };
}
function save(patch = {}) {
  return {
    world: { date: '1285-03-01', time: '11:50', location: '기사과 훈련장' }, pc: { name: '카인', department: '기사과' },
    npcStates: { chloe: { location: '기숙사 A', status: '자유 시간' } }, npcInnerStates: {}, relationships: {}, emotionStates: {},
    memories: { npc: {} }, director: { npcExposure: {} }, completedEvents: [], scheduledEvents: [event()], ...patch,
  };
}
function turn(advance = 20, patch = {}) {
  return { state_delta: { advance_minutes: advance, npc_state_updates: [], scheduled_events_complete: [], completed_events_add: [], ...patch } };
}

const started = deriveBoundedOffscreenProgression({ saveState: save(), turn: turn(), participants: [] });
assert.equal(OFFSCREEN_PROGRESSION_VERSION, '2');
assert.equal(started.telemetry.reason, 'schedule-start');
assert.deepEqual(started.telemetry.event_ids, ['magic-orientation']);
assert.deepEqual(started.telemetry.started_event_ids, ['magic-orientation']);
assert.deepEqual(started.telemetry.completed_event_ids, []);
assert.deepEqual(started.telemetry.npc_keys, ['chloe']);
assert.deepEqual(started.npc_state_updates, [{ npc_key: 'chloe', location: '마법과 지정 오리엔테이션 장소', status: '마법과 1학년 오리엔테이션 일정에 참여 중', source_event_id: 'magic-orientation', phase: 'started', at: '1285-03-01 12:00' }]);
assert.match(started.digest_rows[0], /OFFSCREEN 1285-03-01 12:00.*chloe.*마법과 1학년 오리엔테이션 시작/);

assert.equal(deriveBoundedOffscreenProgression({ saveState: save(), turn: turn(), enabled: false }).telemetry.reason, 'disabled');
assert.equal(deriveBoundedOffscreenProgression({ saveState: save(), turn: turn(0) }).telemetry.reason, 'no-time-advance');
const pcSchedule = save({ scheduledEvents: [event({ id: 'knight-orientation', title: '기사과 1학년 오리엔테이션' })] });
assert.equal(deriveBoundedOffscreenProgression({ saveState: pcSchedule, turn: turn() }).telemetry.reason, 'no-eligible-transition', 'the PC department schedule must remain in foreground flow');
const unknownNpc = save({ npcStates: {}, scheduledEvents: [event({ participants: ['unknown-student'] })] });
assert.equal(deriveBoundedOffscreenProgression({ saveState: unknownNpc, turn: turn() }).telemetry.reason, 'no-eligible-transition', 'an unseen NPC must not be materialized');
assert.equal(deriveBoundedOffscreenProgression({ saveState: save(), turn: turn(), participants: ['chloe'] }).telemetry.reason, 'no-eligible-transition', 'a current-scene NPC is not off-screen');
assert.equal(deriveBoundedOffscreenProgression({ saveState: save(), turn: turn(20, { npc_state_updates: [{ npc_key: 'chloe', location: '광장' }] }) }).telemetry.reason, 'no-eligible-transition', 'a model update must not be overwritten');
assert.equal(deriveBoundedOffscreenProgression({ saveState: save({ scheduledEvents: [event({ secret_level: 3 })] }), turn: turn() }).telemetry.reason, 'no-eligible-transition', 'secret schedules stay hidden');
assert.equal(deriveBoundedOffscreenProgression({ saveState: save({ completedEvents: ['magic-orientation'] }), turn: turn() }).telemetry.reason, 'no-eligible-transition');
const sameTurnCompletion = deriveBoundedOffscreenProgression({ saveState: save(), turn: turn(20, { scheduled_events_complete: ['magic-orientation'] }) });
assert.equal(sameTurnCompletion.telemetry.reason, 'schedule-complete');
assert.deepEqual(sameTurnCompletion.telemetry.started_event_ids, [], 'an explicitly completed event must not also be recorded as a start');

const longSkip = deriveBoundedOffscreenProgression({ saveState: save(), turn: turn(180) });
assert.equal(longSkip.telemetry.digest_count, 1, 'a crossed public start remains historical background evidence');
assert.equal(longSkip.telemetry.applied_count, 0, 'an old start must not pretend the NPC is still at the event');
const laterStart = save({
  world: { date: '1285-03-01', time: '08:00', location: '기사과 훈련장' },
  scheduledEvents: [
    event({ id: 'old-study', time: '09:00', title: '마법과 오전 연구회' }),
    event({ id: 'current-study', time: '11:30', title: '마법과 정오 연구회' }),
  ],
});
const latestWins = deriveBoundedOffscreenProgression({ saveState: laterStart, turn: turn(240) });
assert.equal(latestWins.telemetry.applied_count, 1, 'a recent start must not be masked by an older digest-only start for the same NPC');
assert.equal(latestWins.npc_state_updates[0].source_event_id, 'current-study');
const midnight = save({ world: { date: '1285-03-01', time: '23:50', location: '기숙사' }, scheduledEvents: [event({ id: 'night-study', title: '마법과 야간 연구회', date: '1285-03-02', time: '00:10', location: '마법과 연구실' })] });
const midnightTick = deriveBoundedOffscreenProgression({ saveState: midnight, turn: turn(30) });
assert.equal(midnightTick.telemetry.end_at, '1285-03-02 00:20');
assert.equal(midnightTick.telemetry.applied_count, 1, 'next-day transitions must work across midnight');

const bounded = save({ npcStates: Object.fromEntries(['chloe', 'lena', 'sia'].map(key => [key, { location: '기숙사' }])), scheduledEvents: [event({ id: 'a', time: '11:55', participants: ['chloe', 'lena', 'sia'] }), event({ id: 'b', time: '12:00', participants: ['chloe'] }), event({ id: 'c', time: '12:05', participants: ['sia'] })] });
const boundedTick = deriveBoundedOffscreenProgression({ saveState: bounded, turn: turn() });
assert.equal(boundedTick.telemetry.applied_count, 2, 'one turn may update at most two known absent NPCs');
assert.ok(boundedTick.telemetry.event_ids.length <= 2, 'one turn may record at most two starts');
const duplicateRows = save({ npcStates: { chloe: { location: '기숙사' }, lena: { location: '기숙사' } }, scheduledEvents: [event({ id: 'same', participants: ['chloe', 'chloe'] }), event({ id: 'same', participants: ['lena'] })] });
const deduped = deriveBoundedOffscreenProgression({ saveState: duplicateRows, turn: turn() });
assert.equal(deduped.telemetry.applied_count, 1, 'duplicate participants and duplicate event IDs must not double-apply one transition');
const unsafeKey = save({ npcStates: { constructor: { location: '기숙사' } }, scheduledEvents: [event({ participants: ['constructor'] })] });
assert.equal(deriveBoundedOffscreenProgression({ saveState: unsafeKey, turn: turn() }).telemetry.reason, 'no-eligible-transition', 'unsafe object keys must never reach runtime persistence');
const invalidDate = save({
  world: { date: '1285-03-03', time: '11:50', location: '기사과 훈련장' },
  scheduledEvents: [event({ date: '1285-02-31' })],
});
assert.equal(deriveBoundedOffscreenProgression({ saveState: invalidDate, turn: turn() }).telemetry.reason, 'no-eligible-transition', 'calendar-invalid dates must not normalize into another day');
const restricted = save({ scheduledEvents: [event({ visibility: 'restricted' })] });
assert.equal(deriveBoundedOffscreenProgression({ saveState: restricted, turn: turn() }).telemetry.reason, 'no-eligible-transition', 'explicitly restricted schedules must not fall through the academic public default');
const mixedVisibility = save({ scheduledEvents: [event({ visibility: 'public', access: 'invite-only' })] });
assert.equal(deriveBoundedOffscreenProgression({ saveState: mixedVisibility, turn: turn() }).telemetry.reason, 'no-eligible-transition', 'every explicit visibility field must be public');
const crowdedKeys = Array.from({ length: 9 }, (_, index) => `crowd-${index + 1}`);
const crowdedSave = save({
  npcStates: Object.fromEntries(crowdedKeys.map(key => [key, { location: '기사과 훈련장' }])),
  scheduledEvents: [event({ participants: ['crowd-9'] })],
});
const crowdedTurn = { ...turn(), scene: crowdedKeys.map(key => ({ kind: 'dialogue', speaker_key: key, text: '현재 장면 대사' })) };
assert.equal(deriveBoundedOffscreenProgression({ saveState: crowdedSave, turn: crowdedTurn, participants: crowdedKeys.slice(0, 8) }).telemetry.reason, 'no-eligible-transition', 'every visible turn speaker must be protected beyond the bounded runtime participant list');

const completedSave = save({ world: { date: '1285-03-01', time: '12:50', location: '기사과 훈련장' } });
const completed = deriveBoundedOffscreenProgression({ saveState: completedSave, turn: turn(20, { scheduled_events_complete: ['magic-orientation'] }) });
assert.equal(completed.telemetry.reason, 'schedule-complete');
assert.deepEqual(completed.telemetry.started_event_ids, []);
assert.deepEqual(completed.telemetry.completed_event_ids, ['magic-orientation']);
assert.deepEqual(completed.npc_state_updates, [{ npc_key: 'chloe', status: '마법과 1학년 오리엔테이션 일정을 마침', source_event_id: 'magic-orientation', phase: 'completed', at: '1285-03-01 13:10' }]);
assert.match(completed.digest_rows[0], /OFFSCREEN 1285-03-01 13:10.*chloe.*마법과 1학년 오리엔테이션 종료 확정/);
const completedAtCurrentClock = deriveBoundedOffscreenProgression({ saveState: completedSave, turn: turn(0, { scheduled_events_complete: ['magic-orientation'] }) });
assert.equal(completedAtCurrentClock.telemetry.reason, 'schedule-complete', 'an authoritative completion at the current clock must propagate even without a time increment');
assert.equal(completedAtCurrentClock.npc_state_updates[0].at, '1285-03-01 12:50');

const futureCompletion = save({ world: { date: '1285-03-01', time: '11:00', location: '기사과 훈련장' } });
assert.equal(deriveBoundedOffscreenProgression({ saveState: futureCompletion, turn: turn(10, { scheduled_events_complete: ['magic-orientation'] }) }).telemetry.reason, 'no-eligible-transition', 'an explicit completion cannot propagate before the scheduled start');
assert.equal(deriveBoundedOffscreenProgression({ saveState: completedSave, turn: turn(20, { completed_events_add: ['magic-orientation'] }) }).telemetry.reason, 'no-eligible-transition', 'generic event completion is not an authoritative scheduled-event completion');
assert.equal(deriveBoundedOffscreenProgression({ saveState: save({ world: completedSave.world, scheduledEvents: [event({ secret_level: 3 })] }), turn: turn(20, { scheduled_events_complete: ['magic-orientation'] }) }).telemetry.reason, 'no-eligible-transition', 'secret completion remains outside the public background digest');
assert.equal(deriveBoundedOffscreenProgression({ saveState: completedSave, turn: turn(20, { scheduled_events_complete: ['magic-orientation'] }), participants: ['chloe'] }).telemetry.reason, 'no-eligible-transition', 'a visible NPC completion remains in foreground state');
assert.equal(deriveBoundedOffscreenProgression({ saveState: completedSave, turn: turn(20, { scheduled_events_complete: ['magic-orientation'], npc_state_updates: [{ npc_key: 'chloe', status: '직접 장면 갱신' }] }) }).telemetry.reason, 'no-eligible-transition', 'explicit model state wins over a completion-derived background status');

const lifecycleSave = save({
  world: { date: '1285-03-01', time: '11:50', location: '기사과 훈련장' },
  npcStates: { chloe: { location: '마법과 연구실' }, lena: { location: '기숙사' } },
  scheduledEvents: [
    event({ id: 'morning-study', title: '마법과 오전 연구회', time: '11:00', participants: ['chloe'] }),
    event({ id: 'noon-study', title: '마법과 정오 연구회', time: '12:00', participants: ['lena'] }),
  ],
});
const lifecycle = deriveBoundedOffscreenProgression({ saveState: lifecycleSave, turn: turn(20, { scheduled_events_complete: ['morning-study'] }) });
assert.equal(lifecycle.telemetry.reason, 'schedule-lifecycle');
assert.deepEqual(lifecycle.telemetry.completed_event_ids, ['morning-study']);
assert.deepEqual(lifecycle.telemetry.started_event_ids, ['noon-study']);
assert.equal(lifecycle.telemetry.applied_count, 2);
assert.deepEqual(lifecycle.npc_state_updates.map(row => [row.npc_key, row.phase]), [['chloe', 'completed'], ['lena', 'started']]);

assert.match(appendOffscreenDigest('old background', started), /^old background\n\[OFFSCREEN/);
assert.ok(appendOffscreenDigest('x'.repeat(2200), started).length <= 1800, 'background digest remains bounded');
const router = readFileSync('api/chat-router.js', 'utf8');
const runtime = readFileSync('app-runtime.js', 'utf8');
assert.equal((router.match(/coreHandler\(/g) || []).length, 1, 'off-screen progression preserves one canonical model call');
assert.match(router, /offscreen_npc_updates:offscreenProgression\.npc_state_updates/);
assert.match(router, /offscreen_progression_v2:true/);
assert.match(router, /living_world_v1:true/);
assert.match(runtime, /runtime\.offscreen_npc_updates/);

console.log('PASS Living World V1 bounded public off-screen schedule lifecycle');
