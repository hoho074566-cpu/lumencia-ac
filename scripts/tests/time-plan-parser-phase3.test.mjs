#!/usr/bin/env node

import assert from 'node:assert/strict';
import { classifySceneIntent } from '../../lib/scene-momentum.js';
import { deriveStructuredDecisionPlan, deriveStructuredExecutionPlan, parseTimePlan } from '../../lib/time-plan-parser.js';

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
const interveningAction=parseTimePlan('1시간 훈련하고 샤워한 뒤 8시간 잔다',context);
assert.equal(interveningAction.clauses[1].unparsed_prefix_action,true,'an unsupported action between recognized anchors remains explicit parser uncertainty');
assert.equal(interveningAction.clauses[1].committed,false,'a clause with an unparsed intervening action cannot become committed execution');
assert.equal(deriveStructuredExecutionPlan(interveningAction).eligible,false,'an omitted intervening action cannot grant exact timeline authority');
const explicitConcurrent=parseTimePlan('1시간 훈련하고 동시에 1시간 대화한다',context);
assert.equal(explicitConcurrent.clauses[1].concurrent,true,'an explicit concurrency marker becomes a structured relation instead of a synthetic sequence');
assert.equal(deriveStructuredExecutionPlan(explicitConcurrent).eligible,false,'concurrent clauses cannot enter sequential boundary execution');
assert.equal(deriveStructuredExecutionPlan(parseTimePlan('1시간 훈련하고 병행하여 1시간 대화한다',context)).eligible,false,'병행 concurrency cannot become a sequential execution plan');
for(const action of ['에밀리도 1시간 훈련하고 나는 8시간 잔다','에밀리는, 1시간 훈련하고 나는 8시간 잔다','에밀리가, 1시간 훈련하고 나는 8시간 잔다']){
  assert.equal(deriveStructuredExecutionPlan(parseTimePlan(action,context)).eligible,false,`${action}: a punctuated or additive named third party cannot enter the PC execution plan`);
}
const unboundedLower=parseTimePlan('적어도 1시간 훈련하고 8시간 잔다',context);
assert.equal(unboundedLower.clauses[0].actor.kind,'pc','적어도 remains an additive timing adverb, not an NPC actor');
assert.equal(unboundedLower.clauses[0].duration.upper_bounded,false,'a lower-bound-only duration remains explicitly unbounded');
assert.equal(deriveStructuredExecutionPlan(unboundedLower).eligible,false,'an invented profile maximum cannot grant exact timeline authority');
const unboundedDecision=deriveStructuredDecisionPlan(unboundedLower);
assert.equal(unboundedDecision.eligible,true,'a lower-bound-only compound remains available for choice-only reconciliation');
assert.equal(unboundedDecision.exact_timeline,false,'the choice-only plan never claims exact timestamp authority');
assert.equal(unboundedDecision.clauses[0].complete_max_minutes,null,'the open upper bound remains structurally open');
assert.equal(classifySceneIntent('적어도 1시간 훈련하고 8시간 잔다',context).structuredDecisionPlan?.exact_timeline,false,'the runtime intent exposes only the non-authoritative choice plan');
const minimumAdverb=parseTimePlan('최소한 1시간 훈련하고 8시간 잔다',context);
assert.equal(minimumAdverb.clauses[0].duration.upper_bounded,false,'최소한 remains a lower-bound-only duration qualifier');
assert.equal(deriveStructuredExecutionPlan(minimumAdverb).eligible,false,'최소한 cannot invent an exact prefix completion time');
assert.equal(deriveStructuredDecisionPlan(minimumAdverb).exact_timeline,false,'최소한 keeps only non-authoritative choice reconciliation');
for(const action of ['1시간 정도 훈련하고 8시간 잔다','이번에도 1시간 훈련하고 8시간 잔다']){
  assert.equal(classifySceneIntent(action,context).structuredExecutionPlan?.eligible,true,`${action}: additive timing adverbs cannot become NPC actors`);
}

for(const action of ['준비되면 1시간 훈련하자','에밀리가 1시간 훈련하고 나는 8시간 잔다','「1시간 훈련하고 8시간 자라」고 말했다']){
  assert.equal(deriveStructuredExecutionPlan(parseTimePlan(action,context)).eligible,false,`${action}: conditional, third-party, and quoted plans fail closed`);
}

console.log('PASS Time Plan Parser Phase 3 ordered execution timeline, range, alignment, and fail-closed boundaries');
