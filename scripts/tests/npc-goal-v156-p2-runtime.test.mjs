import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source=readFileSync('api/chat-router.js','utf8');
const lifecycleStart=source.indexOf('function bounded(');
const lifecycleEnd=source.indexOf('function relationshipReasonFor(');
assert.ok(lifecycleStart>=0&&lifecycleEnd>lifecycleStart,'Goal V2 lifecycle source markers missing');
const lifecycleSource=source.slice(lifecycleStart,lifecycleEnd);
const makeLifecycle=new Function('array','object','clampText','CHARACTER_REGISTRY',`
  const GOAL_STATES=new Set(['active','blocked','completed','abandoned']);
  ${lifecycleSource}
  return {goalRuntimeFor};
`);
const array=(v)=>Array.isArray(v)?v:[];
const object=(v)=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const clampText=(v,max=1200)=>typeof v==='string'?v.slice(0,max):JSON.stringify(v??'').slice(0,max);
const {goalRuntimeFor}=makeLifecycle(array,object,clampText,{anastasia:'아나스타샤',isabel:'이사벨'});

const key='anastasia';
function oldGoal(overrides={}){
  return {active_goal:{id:'goal:anastasia:old',desire:'학생회 질서를 지킨다',priority:5,urgency:3,progress:40,state:'active',reasons:['기존 이유'],next_actions:['회의실 순찰'],obstacle:'',source_turn:3,updated_turn:9,...overrides},goal_history:[]};
}
function incoming(old={},patch={}){
  return {saveState:{turnNumber:10,pc:{name:'Aaa'},world:{location:'academy'},npcStates:{[key]:{current_goal:old?.active_goal?.desire||''}},npcInnerStates:{[key]:old},scheduleContext:{due:[]},hooks:[],...patch}};
}

test('blocked -> active reopen clears the stale blocking obstacle',()=>{
  const old=oldGoal({state:'blocked',progress:42,obstacle:'학생회실이 봉쇄됐다'});
  const result=goalRuntimeFor(incoming(old),key,old,{goal_state:'active',goal_reason:'봉쇄가 해제되어 다시 진행할 수 있다'}, {}, {});
  assert.equal(result.goal.state,'active');
  assert.equal(result.goal.progress,42);
  assert.equal(result.goal.obstacle,'');
});

test('replacement creation stays active even if the same row requests a terminal state',()=>{
  const old=oldGoal({progress:61});
  const result=goalRuntimeFor(incoming(old),key,old,{
    current_goal:'이사벨의 움직임을 조사한다',
    goal_replace:true,
    goal_reason:'새로운 사건이 발생했다',
    goal_progress_delta:7,
    goal_state:'completed',
  }, {}, {});
  assert.equal(result.goal.state,'active');
  assert.equal(result.goal.progress,7);
  assert.notEqual(result.goal.id,old.active_goal.id);
});

test('completion records the effective progress change to 100',()=>{
  const old=oldGoal({progress:40});
  const completed=goalRuntimeFor(incoming(old),key,old,{goal_state:'completed',goal_reason:'학생회 정비를 끝냈다'}, {}, {});
  assert.equal(completed.goal.progress,100);
  assert.equal(completed.goal.last_progress_delta,60);

  const withIntermediateSetback=goalRuntimeFor(incoming(old),key,old,{goal_state:'completed',goal_progress_delta:-10,goal_reason:'마지막 장애물을 넘어서 결국 완료했다'}, {}, {});
  assert.equal(withIntermediateSetback.goal.progress,100);
  assert.equal(withIntermediateSetback.goal.last_progress_delta,60);
});

test('explicit NPC state keys are prioritized before the bounded passive synthesis set',()=>{
  assert.match(source,/const explicitKeys=\[\.\.\.new Set\(stateKeys\)\]\.slice\(0,12\)/);
  assert.match(source,/const passiveKeys=\[\.\.\.new Set\(\[\.\.\.relationKeys,\.\.\.speakerRows\.map/);
  assert.match(source,/const keys=\[\.\.\.explicitKeys,\.\.\.passiveKeys\]\.slice\(0,12\)/);
});

test('terminal plan cleanup recognizes prior goal next-actions',()=>{
  assert.match(source,/priorGoalActions=new Set\(array\(old\?\.active_goal\?\.next_actions\)/);
  assert.match(source,/priorGoalActions\.has\(oldPlanText\)/);
});
