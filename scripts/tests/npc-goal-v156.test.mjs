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

const schemaStart=source.indexOf('function goalV2FieldSchema(){');
const schemaEnd=source.indexOf('function installResponsesRouter()');
assert.ok(schemaStart>=0&&schemaEnd>schemaStart,'Goal V2 structured-format source markers missing');
const schemaSource=source.slice(schemaStart,schemaEnd);
const makeSchema=new Function(`const GOAL_V2_RULES='[NPC GOAL V2]';${schemaSource};return {patchGoalV2StructuredFormat};`);
const {patchGoalV2StructuredFormat}=makeSchema();

const key='anastasia';
function incoming(old={},turnNumber=10){
  return {saveState:{turnNumber,npcStates:{[key]:{current_goal:old?.active_goal?.desire||''}},npcInnerStates:{[key]:old},scheduleContext:{due:[]},hooks:[]}};
}
function apply(old,npc,turnNumber=10){return goalRuntimeFor(incoming(old,turnNumber),key,old,npc||{}, {}, {});}
function oldGoal(overrides={}){
  return {active_goal:{id:'goal:anastasia:old',desire:'학생회 질서를 지킨다',priority:5,urgency:4,progress:40,state:'active',reasons:['기존 이유'],next_actions:['순찰'],source_turn:3,updated_turn:9,last_progress_delta:5,last_progress_reason:'이전 진전',...overrides},goal_history:[]};
}

test('new goal applies only reasoned progress evidence',()=>{
  const yes=apply({}, {current_goal:'학생회 순찰을 강화한다',goal_progress_delta:20,goal_reason:'순찰 계획을 실제로 확정했다'});
  assert.equal(yes.goal.progress,20);
  assert.equal(yes.goal.last_progress_delta,20);
  const no=apply({}, {current_goal:'학생회 순찰을 강화한다',goal_progress_delta:20});
  assert.equal(no.goal.progress,0);
  assert.equal(no.goal.last_progress_delta,0);
});

test('setback clamps at zero and blocked preserves progress',()=>{
  const setback=apply(oldGoal({progress:10}), {goal_progress_delta:-50,goal_reason:'계획이 좌절됐다'});
  assert.equal(setback.goal.progress,0);
  assert.equal(setback.goal.last_progress_delta,-10);
  const blockedOld=oldGoal({progress:33,state:'blocked'});
  const blocked=apply(blockedOld, {});
  assert.equal(blocked.goal.state,'blocked');
  assert.equal(blocked.goal.progress,33);
});

test('completion forces 100 and abandoned goals freeze until explicit reopen',()=>{
  const completed=apply(oldGoal({progress:72}), {goal_state:'completed',goal_reason:'목표를 달성했다'});
  assert.equal(completed.goal.state,'completed');
  assert.equal(completed.goal.progress,100);
  const abandonedOld=oldGoal({progress:45,state:'abandoned'});
  const frozen=apply(abandonedOld,{goal_progress_delta:30,goal_reason:'새 정보가 생겼다'});
  assert.equal(frozen.goal.state,'abandoned');
  assert.equal(frozen.goal.progress,45);
  const reopened=apply(abandonedOld,{goal_state:'active',goal_progress_delta:5,goal_reason:'다시 추진하기로 결정했다'});
  assert.equal(reopened.goal.state,'active');
  assert.equal(reopened.goal.progress,50);
});

test('completed reopen requires a negative delta below 100',()=>{
  const done=oldGoal({progress:100,state:'completed'});
  const rejected=apply(done,{goal_state:'active',goal_reason:'후속 문제가 생겼다'});
  assert.equal(rejected.goal.state,'completed');
  assert.equal(rejected.goal.progress,100);
  const accepted=apply(done,{goal_state:'active',goal_progress_delta:-25,goal_reason:'완료로 알았던 문제가 다시 열렸다'});
  assert.equal(accepted.goal.state,'active');
  assert.equal(accepted.goal.progress,75);
});

test('rephrasing preserves identity while explicit replacement resets metadata and archives old goal',()=>{
  const old=oldGoal({progress:61});
  const rephrased=apply(old,{current_goal:'학생회 내 질서와 규율을 유지한다'});
  assert.equal(rephrased.goal.id,old.active_goal.id);
  assert.equal(rephrased.goal.progress,61);
  assert.equal(rephrased.goal.priority,5);
  assert.equal(rephrased.goal.urgency,4);
  assert.equal(rephrased.goal.source_turn,3);
  assert.equal(rephrased.goal.desire,'학생회 내 질서와 규율을 유지한다');

  const replaced=apply(old,{current_goal:'이사벨의 움직임을 조사한다',goal_replace:true,goal_progress_delta:7,goal_reason:'기존 목표보다 긴급한 조사 필요가 생겼다'});
  assert.notEqual(replaced.goal.id,old.active_goal.id);
  assert.equal(replaced.goal.progress,7);
  assert.equal(replaced.goal.priority,3);
  assert.equal(replaced.goal.urgency,3);
  assert.equal(replaced.goal.source_turn,11);
  assert.equal(replaced.history.at(-1).id,old.active_goal.id);
  assert.equal(replaced.history.at(-1).final_progress,61);
});

test('goal history remains bounded to six entries',()=>{
  const history=Array.from({length:6},(_,i)=>({id:`old-${i}`,desire:`g${i}`,final_state:'completed',final_progress:100,ended_turn:i,end_reason:'done'}));
  const old={...oldGoal(),goal_history:history};
  const replaced=apply(old,{current_goal:'새 목표',goal_replace:true,goal_reason:'목표 교체'});
  assert.equal(replaced.history.length,6);
  assert.equal(replaced.history.at(-1).id,old.active_goal.id);
  assert.equal(replaced.history.some(x=>x.id==='old-0'),false);
});

test('structured format exposes and preserves Goal V2 fields through the legacy parser',()=>{
  const format={
    schema:{type:'object',properties:{state_delta:{type:'object',properties:{npc_state_updates:{type:'array',items:{type:'object',properties:{npc_key:{type:'string'},current_goal:{anyOf:[{type:'string'},{type:'null'}]}},required:['npc_key','current_goal'],additionalProperties:false}}}}}},
    $parseRaw:(content)=>{const raw=JSON.parse(content);return{state_delta:{npc_state_updates:raw.state_delta.npc_state_updates.map(r=>({npc_key:r.npc_key,current_goal:r.current_goal}))}};},
  };
  const patched=patchGoalV2StructuredFormat({instructions:'base',text:{format}});
  const item=patched.text.format.schema.properties.state_delta.properties.npc_state_updates.items;
  for(const field of ['goal_progress_delta','goal_state','goal_reason','goal_next_action','goal_replace'])assert.ok(item.properties[field]);
  const parsed=patched.text.format.$parseRaw(JSON.stringify({state_delta:{npc_state_updates:[{npc_key:key,current_goal:'목표',goal_progress_delta:12,goal_state:'active',goal_reason:'증거',goal_next_action:'다음 행동',goal_replace:false}]}}));
  assert.equal(parsed.state_delta.npc_state_updates[0].goal_progress_delta,12);
  assert.equal(parsed.state_delta.npc_state_updates[0].goal_reason,'증거');
  assert.equal(parsed.state_delta.npc_state_updates[0].goal_replace,false);
  assert.match(patched.instructions,/NPC GOAL V2/);
});
