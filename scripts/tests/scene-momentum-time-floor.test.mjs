#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSceneMomentumDirective, classifySceneIntent, isPcRelevantScheduleEvent, nextScheduleBoundaryMinutes } from '../../lib/scene-momentum.js';

const knightPc={name:'카인',department:'기사과'};
const scheduleSave={
  pc:knightPc,
  world:{date:'1285-03-01',time:'09:50'},
  scheduleContext:{due:[],upcoming:[
    {id:'npc-briefing',title:'아르테미스 교관 회의',date:'1285-03-01',time:'09:54',participants:['artemis']},
    {id:'magic-class',title:'마법과 필수 수업',date:'1285-03-01',time:'09:56',kind:'academic',participants:['elena']},
    {id:'knight-class',title:'기사과 필수 수업',date:'1285-03-01',time:'10:00',kind:'academic',participants:['artemis']},
  ]},
};
assert.equal(isPcRelevantScheduleEvent(scheduleSave,scheduleSave.scheduleContext.upcoming[0]),false);
assert.equal(isPcRelevantScheduleEvent(scheduleSave,scheduleSave.scheduleContext.upcoming[1]),false);
assert.equal(isPcRelevantScheduleEvent(scheduleSave,scheduleSave.scheduleContext.upcoming[2]),true);
assert.equal(nextScheduleBoundaryMinutes(scheduleSave,{futureOnly:true}),10,'canonical schedule arithmetic must remain internal and exact');
assert.equal(classifySceneIntent('30분 정도 훈련한다',{currentDate:'1285-03-01',currentTime:'09:00'}).explicitDurationMinutes,30);
assert.match(buildSceneMomentumDirective({action:'두 시간 쉰다.',saveState:scheduleSave}),/SCHEDULE_BOUNDARY=10min/,'the internal state guard remains available');

const source=readFileSync('api/chat-router.js','utf8');
const start=source.indexOf('function bounded('),end=source.indexOf('function uniqText(');
assert.ok(start>=0&&end>start);
const timeFloorSource=source.slice(start,end);
const runtimeMatch=timeFloorSource.match(/function runtimeSynthesisTurn\([\s\S]*?\n\}/)?.[0]||'';
assert.match(runtimeMatch,/UNCOMMITTED_TURN/,'untrusted reconciliation must fail closed');
assert.match(runtimeMatch,/status=409/,'untrusted reconciliation must not generate replacement fiction');
assert.match(source,/function reconcileReturnedTimedTurn\([^)]*\)\{\s*return false;\s*\}/);
assert.match(source,/function reconcileReturnedRaisedFloorContinuation\([^)]*\)\{\s*return false;\s*\}/);
assert.match(source,/function reconcileReturnedConsequenceTurn\([^)]*\)\{\s*return false;\s*\}/);
assert.doesNotMatch(source,/요청한 행동이 완료될 수 있는 최소 시간을 채워 행동을 마쳤다/,'runtime must not turn clock reconciliation into generic narration');

console.log('PASS Scene Momentum hard-state arithmetic without runtime fiction synthesis');
