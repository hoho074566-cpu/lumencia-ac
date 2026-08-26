#!/usr/bin/env node

import assert from 'node:assert/strict';
import { classifySceneIntent } from '../../lib/scene-momentum.js';
import { deriveStructuredExecutionPlan, parseTimePlan } from '../../lib/time-plan-parser.js';

const context={location:'기숙사',currentTime:'08:00',currentDate:'1285-03-01',currentWeekday:'수요일',actorName:'아리아'};

const exact=deriveStructuredExecutionPlan(parseTimePlan('1시간 훈련하고 8시간 잔다',context));
assert.equal(exact.eligible,true,'an owned committed compound becomes an ordered execution plan');
assert.deepEqual(exact.clauses.map(row=>[row.action_type,row.start_min_minutes,row.complete_min_minutes]),[['training',0,60],['sleep',60,540]],'exact clauses preserve order and cumulative completion boundaries');
assert.deepEqual([exact.total_min_minutes,exact.total_max_minutes],[540,540]);

const scheduled=deriveStructuredExecutionPlan(parseTimePlan('오전 10시에 1시간 수업을 듣고 8시간 잔다',context));
assert.deepEqual(scheduled.clauses.map(row=>[row.start_min_minutes,row.complete_min_minutes]),[[120,180],[180,660]],'an authoritative wait belongs to the first clause and shifts its successor');

const ranged=classifySceneIntent('왕도로 이동하고 1시간 훈련한다',context);
assert.deepEqual([ranged.structuredExecutionPlan.total_min_minutes,ranged.structuredExecutionPlan.total_max_minutes],[75,120],'range endpoints remain separate through the structured execution timeline');

const threeStep=classifySceneIntent('2시간 대화하고 1시간 훈련하고 8시간 잔다',context);
assert.deepEqual(threeStep.structuredExecutionPlan.clauses.map(row=>row.complete_min_minutes),[120,180,660],'more than one completed prefix remains addressable by clause index');

const concurrent=classifySceneIntent('1시간 훈련하면서 1시간 대화한다',context);
assert.equal(concurrent.structuredExecutionPlan,null,'a sequential parser interpretation cannot take boundary authority when the legacy concurrent total disagrees');
const explicitConcurrent=parseTimePlan('1시간 훈련하고 동시에 1시간 대화한다',context);
assert.equal(explicitConcurrent.clauses[1].concurrent,true,'an explicit concurrency marker becomes a structured relation instead of a synthetic sequence');
assert.equal(deriveStructuredExecutionPlan(explicitConcurrent).eligible,false,'concurrent clauses cannot enter sequential boundary execution');
assert.equal(deriveStructuredExecutionPlan(parseTimePlan('1시간 훈련하고 병행하여 1시간 대화한다',context)).eligible,false,'병행 concurrency cannot become a sequential execution plan');
assert.equal(deriveStructuredExecutionPlan(parseTimePlan('에밀리도 1시간 훈련하고 나는 8시간 잔다',context)).eligible,false,'a named topic-marked third party cannot enter the PC execution plan');

for(const action of ['준비되면 1시간 훈련하자','에밀리가 1시간 훈련하고 나는 8시간 잔다','「1시간 훈련하고 8시간 자라」고 말했다']){
  assert.equal(deriveStructuredExecutionPlan(parseTimePlan(action,context)).eligible,false,`${action}: conditional, third-party, and quoted plans fail closed`);
}

console.log('PASS Time Plan Parser Phase 3 ordered execution timeline, range, alignment, and fail-closed boundaries');
