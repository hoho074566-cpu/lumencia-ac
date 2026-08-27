#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSceneMomentumDirective, classifySceneIntent } from '../../lib/scene-momentum.js';
import { deriveStructuredDecisionPlan, deriveStructuredExecutionPlan, parseTimePlan } from '../../lib/time-plan-parser.js';
import { projectStructuredOwnedEffects, rebaseStructuredEffectOwners, replaceStructuredEffectRows, structuredEffectRows, validateStructuredTimeExecution } from '../../lib/time-plan-reconciliation.js';

const context={location:'기숙사',currentTime:'08:00',currentDate:'1285-03-01',currentWeekday:'수요일',actorName:'아리아'};
const routerSource=readFileSync('api/chat-router.js','utf8');
assert.match(routerSource,/mergeRawGoalV2Fields[\s\S]*structuredEffectRows\(parsed,field\)[\s\S]*rebaseStructuredEffectOwners\(data\.turn\)/,'the adapter tags pre-sanitization rows and rebases the returned receipt before any runtime validators');

const exact=deriveStructuredExecutionPlan(parseTimePlan('1시간 훈련하고 8시간 잔다',context));
assert.equal(exact.eligible,true,'an owned committed compound becomes an ordered execution plan');
assert.deepEqual(exact.clauses.map(row=>row.clause_id),['action_1','action_2'],'execution clauses expose stable action IDs');
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

const directive=buildSceneMomentumDirective({action:'1시간 훈련하고 8시간 잔다',saveState:{pc:{name:'아리아'},world:{date:'1285-03-01',time:'08:00',location:'기숙사'},sceneRuntime:{}},registry:{}});
assert.match(directive,/STRUCTURED_TIME_PLAN=action_1:training@0-60\/0-60;action_2:sleep@60-540\/60-540/,'the canonical call receives the exact clause IDs and timeline');
assert.match(directive,/effect_owners/,'the canonical call is instructed to return structural effect ownership');

const structuralTurn={
  scene:[{text:'훈련은 끝났고, 잠든 지 한 시간이 지났다.'}],
  choices:[],
  state_delta:{advance_minutes:120,fatigue_delta:-3,gold_delta:0,items_add:['미완료 수면 보상']},
  time_execution:{
    version:'1.0',plan_used:true,boundary_kind:'schedule',boundary_minutes:120,
    completed_clause_ids:['action_1'],interrupted_clause_id:'action_2',decision_scene_index:null,
    boundary_event_id:'schedule:morning-roll-call',
    effect_owners:[
      {scope:'state_delta',field:'items_add',effect_index:0,owner_kind:'clause',owner_id:'action_2'},
    ],
    scalar_contributions:[{field:'fatigue_delta',amount:-3,owner_kind:'clause',owner_id:'action_1'}],
  },
};
const scheduleRuntime={boundaries:{schedule:{minutes:120,event_ids:['schedule:morning-roll-call']}}};
const structuralAuthority=validateStructuredTimeExecution(structuralTurn,exact,scheduleRuntime);
assert.equal(structuralAuthority.valid,true,'a started incomplete action is explicitly identified by clause ID');
assert.deepEqual(projectStructuredOwnedEffects(structuralTurn,structuralAuthority,120).preserved_delta,{fatigue_delta:-3},'projection keeps completed-clause effects and drops interrupted-clause effects');
const missingInterrupted=structuredClone(structuralTurn);
missingInterrupted.time_execution.interrupted_clause_id=null;
assert.equal(validateStructuredTimeExecution(missingInterrupted,exact,scheduleRuntime).reason,'missing-interrupted-clause','a started incomplete action cannot disappear from the execution receipt');
const incompleteNoneBoundary=structuredClone(structuralTurn);
incompleteNoneBoundary.state_delta={advance_minutes:60,fatigue_delta:0,gold_delta:0};
incompleteNoneBoundary.time_execution={version:'1.0',plan_used:true,boundary_kind:'none',boundary_minutes:60,completed_clause_ids:['action_1'],interrupted_clause_id:'action_2',decision_scene_index:null,boundary_event_id:null,effect_owners:[],scalar_contributions:[]};
assert.equal(validateStructuredTimeExecution(incompleteNoneBoundary,exact).reason,'incomplete-none-boundary','a no-boundary receipt cannot leave an interrupted suffix for the profile floor to complete');
const completedNoneBoundary=structuredClone(incompleteNoneBoundary);
completedNoneBoundary.state_delta.advance_minutes=540;
completedNoneBoundary.time_execution.boundary_minutes=540;
completedNoneBoundary.time_execution.completed_clause_ids=['action_1','action_2'];
completedNoneBoundary.time_execution.interrupted_clause_id=null;
assert.equal(validateStructuredTimeExecution(completedNoneBoundary,exact).valid,true,'a no-boundary receipt remains valid only after the whole structured plan completed');
assert.equal(projectStructuredOwnedEffects(structuralTurn,structuralAuthority,90).reason,'boundary-rebased','a receipt from a longer model timeline cannot authorize effects after a locally earlier boundary');
const wholeArrayClaim=structuredClone(structuralTurn);
wholeArrayClaim.time_execution.effect_owners[0].effect_index=null;
assert.equal(validateStructuredTimeExecution(wholeArrayClaim,exact,scheduleRuntime).reason,'invalid-array-effect-index','an array cannot be preserved wholesale through a scalar ownership claim');
const outOfRangeClaim=structuredClone(structuralTurn);
outOfRangeClaim.time_execution.effect_owners[0].effect_index=1;
assert.equal(validateStructuredTimeExecution(outOfRangeClaim,exact,scheduleRuntime).reason,'invalid-array-effect-index','an ownership claim cannot point beyond the returned effect rows');

const inventedBoundary=structuredClone(structuralTurn);
inventedBoundary.time_execution.boundary_event_id='schedule:invented';
assert.equal(validateStructuredTimeExecution(inventedBoundary,exact,scheduleRuntime).reason,'unverified-boundary-event','a model-declared boundary owner must match a real runtime boundary');

const activeChoiceTurn={
  scene:[{text:'동문과 서문 중 어느 길로 갈까?'}],choices:['동문','서문'],
  event_progress:{event_instance_id:'quest:escort',active_beat:'route-choice',completed_beats:['briefing']},
  state_delta:{advance_minutes:120,fatigue_delta:0,gold_delta:0},
  time_execution:{version:'1.0',plan_used:true,boundary_kind:'choice',boundary_minutes:120,completed_clause_ids:['action_1'],interrupted_clause_id:'action_2',decision_scene_index:0,boundary_event_id:'quest:escort',effect_owners:[{scope:'turn',field:'event_progress',effect_index:null,owner_kind:'boundary-event',owner_id:'quest:escort'}],scalar_contributions:[]},
};
const activeChoiceAuthority=validateStructuredTimeExecution(activeChoiceTurn,exact,{boundaries:{choice:{minutes:120,event_ids:['quest:escort']}}});
assert.equal(activeChoiceAuthority.valid,true,'an externally authenticated active event can own its returned turn progress');
assert.deepEqual(projectStructuredOwnedEffects(activeChoiceTurn,activeChoiceAuthority,120).preserved_turn.event_progress,activeChoiceTurn.event_progress,'projection returns the validated turn-owned value, not only its field name');

const mixedScalar=structuredClone(structuralTurn);
mixedScalar.state_delta.fatigue_delta=2;
mixedScalar.time_execution.scalar_contributions=[
  {field:'fatigue_delta',amount:3,owner_kind:'clause',owner_id:'action_1'},
  {field:'fatigue_delta',amount:-1,owner_kind:'clause',owner_id:'action_2'},
];
const mixedAuthority=validateStructuredTimeExecution(mixedScalar,exact,scheduleRuntime);
assert.equal(mixedAuthority.valid,true,'aggregate scalars retain per-clause contributions');
assert.equal(projectStructuredOwnedEffects(mixedScalar,mixedAuthority,120).preserved_delta.fatigue_delta,3,'projection keeps only the completed clause contribution');
const oversizedScalar=structuredClone(mixedScalar);
oversizedScalar.time_execution.scalar_contributions=[{field:'fatigue_delta',amount:12,owner_kind:'clause',owner_id:'action_1'},{field:'fatigue_delta',amount:-10,owner_kind:'clause',owner_id:'action_2'}];
assert.equal(validateStructuredTimeExecution(oversizedScalar,exact,scheduleRuntime).reason,'invalid-scalar-contribution','per-clause contributions cannot bypass the canonical scalar limit');

const filteredTurn={state_delta:{skill_experience:[{skill:'없는 기술',amount:1},{skill:'검술',amount:2}]},time_execution:{effect_owners:[{scope:'state_delta',field:'skill_experience',effect_index:1,owner_kind:'clause',owner_id:'action_1'}]}};
replaceStructuredEffectRows(filteredTurn,'skill_experience',[{skill:'검술',amount:2}]);
assert.equal(filteredTurn.time_execution.effect_owners[0].effect_index,0,'effect ownership follows an accepted row when validation compacts its array');
const duplicateFilteredTurn={state_delta:{skill_experience:[{skill:'검술',amount:0,reason:'무효'},{skill:'검술',amount:2,reason:'유효'}]},time_execution:{effect_owners:[{scope:'state_delta',field:'skill_experience',effect_index:1,owner_kind:'clause',owner_id:'action_1'}]}};
const taggedDuplicateRows=structuredEffectRows(duplicateFilteredTurn,'skill_experience'),acceptedDuplicate={...taggedDuplicateRows[1],amount:1};
replaceStructuredEffectRows(duplicateFilteredTurn,'skill_experience',[acceptedDuplicate]);
assert.equal(duplicateFilteredTurn.time_execution.effect_owners[0].effect_index,0,'an accepted duplicate key keeps its exact raw source instead of borrowing the first rejected row');
assert.doesNotMatch(JSON.stringify(duplicateFilteredTurn.state_delta.skill_experience),/lumensia\.time\.effect/,'internal source markers never enter the JSON response');

const coreSanitizedTurn={
  state_delta:{relationship_changes:[{...structuredEffectRows({state_delta:{relationship_changes:[{npc_key:'invalid'},{npc_key:'emily'}]}},'relationship_changes')[1]}]},
  time_execution:{effect_owners:[
    {scope:'state_delta',field:'relationship_changes',effect_index:0,owner_kind:'clause',owner_id:'action_1'},
    {scope:'state_delta',field:'relationship_changes',effect_index:1,owner_kind:'clause',owner_id:'action_2'},
  ]},
};
rebaseStructuredEffectOwners(coreSanitizedTurn);
assert.deepEqual(coreSanitizedTurn.time_execution.effect_owners,[{scope:'state_delta',field:'relationship_changes',effect_index:0,owner_kind:'clause',owner_id:'action_2'}],'core sanitization drops the removed source owner and rebases the exact retained row instead of lending its compacted index');

const overLimitPlan=deriveStructuredExecutionPlan(parseTimePlan('25시간 기다리고 8시간 잔다',context));
const overLimitTurn={scene:[{text:'계속 기다릴까?'}],choices:['계속한다.'],state_delta:{advance_minutes:1440,fatigue_delta:0,gold_delta:0},time_execution:{version:'1.0',plan_used:true,boundary_kind:'choice',boundary_minutes:1440,completed_clause_ids:[],interrupted_clause_id:'action_1',decision_scene_index:0,boundary_event_id:null,effect_owners:[],scalar_contributions:[]}};
assert.equal(validateStructuredTimeExecution(overLimitTurn,overLimitPlan,{required_boundary_kind:'turn-limit',boundaries:{choice:{minutes:1440,event_ids:[]},'turn-limit':{minutes:1440,event_ids:[]}}}).reason,'required-boundary-kind','an incomplete plan at the one-turn cap cannot be converted into a model choice boundary');

console.log('PASS Time Plan Parser Phase 3 ordered execution timeline, range, alignment, and fail-closed boundaries');
