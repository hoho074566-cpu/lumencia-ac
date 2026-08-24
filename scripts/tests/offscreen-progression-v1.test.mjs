#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendOffscreenDigest, deriveBoundedOffscreenProgression } from '../../lib/offscreen-progression.js';

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
assert.equal(started.telemetry.reason, 'schedule-start');
assert.deepEqual(started.telemetry.event_ids, ['magic-orientation']);
assert.deepEqual(started.telemetry.npc_keys, ['chloe']);
assert.deepEqual(started.npc_state_updates, [{ npc_key: 'chloe', location: '마법과 지정 오리엔테이션 장소', status: '마법과 1학년 오리엔테이션 일정에 참여 중', source_event_id: 'magic-orientation', at: '1285-03-01 12:00' }]);
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
assert.equal(deriveBoundedOffscreenProgression({ saveState: save(), turn: turn(20, { scheduled_events_complete: ['magic-orientation'] }) }).telemetry.reason, 'no-eligible-transition');

const longSkip = deriveBoundedOffscreenProgression({ saveState: save(), turn: turn(180) });
assert.equal(longSkip.telemetry.digest_count, 1, 'a crossed public start remains historical background evidence');
assert.equal(longSkip.telemetry.applied_count, 0, 'an old start must not pretend the NPC is still at the event');
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

assert.match(appendOffscreenDigest('old background', started), /^old background\n\[OFFSCREEN/);
assert.ok(appendOffscreenDigest('x'.repeat(2200), started).length <= 1800, 'background digest remains bounded');
const router = readFileSync('api/chat-router.js', 'utf8');
const runtime = readFileSync('app-runtime.js', 'utf8');
assert.equal((router.match(/coreHandler\(/g) || []).length, 1, 'off-screen progression preserves one canonical model call');
assert.match(router, /offscreen_npc_updates:offscreenProgression\.npc_state_updates/);
assert.match(router, /offscreen_progression_v1:true/);
assert.match(runtime, /runtime\.offscreen_npc_updates/);

console.log('PASS Bounded Off-screen Progression V1 public schedule transitions');
