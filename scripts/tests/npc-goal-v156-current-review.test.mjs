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
function oldGoal(overrides={}){
  return {active_goal:{id:'goal:anastasia:old',desire:'학생회 질서를 지킨다',priority:5,urgency:2,progress:40,state:'active',reasons:['기존 이유'],next_actions:['기존 행동'],source_turn:3,updated_turn:9,last_progress_delta:5,last_progress_reason:'이전 진전',...overrides},goal_history:[]};
}
function incoming(old={},patch={}){
  return {saveState:{turnNumber:10,pc:{name:'Aaa'},world:{location:'academy'},npcStates:{[key]:{current_goal:old?.active_goal?.desire||''}},npcInnerStates:{[key]:old},scheduleContext:{due:[]},hooks:[],...patch}};
}

test('duplicate npc_state_updates stay row-aligned after legacy parsing',()=>{
  const format={
    schema:{type:'object',properties:{state_delta:{type:'object',properties:{npc_state_updates:{type:'array',items:{type:'object',properties:{npc_key:{type:'string'},current_goal:{anyOf:[{type:'string'},{type:'null'}]}},required:['npc_key','current_goal'],additionalProperties:false}}}}}},
    $parseRaw:(content)=>{const raw=JSON.parse(content);return{state_delta:{npc_state_updates:raw.state_delta.npc_state_updates.map(r=>({npc_key:r.npc_key,current_goal:r.current_goal}))}};},
  };
  const patched=patchGoalV2StructuredFormat({instructions:'base',text:{format}});
  const raw={state_delta:{npc_state_updates:[
    {npc_key:key,current_goal:'첫 목표',goal_progress_delta:5,goal_state:'active',goal_reason:'첫 근거',goal_next_action:'첫 행동',goal_replace:false},
    {npc_key:key,current_goal:'둘째 목표',goal_progress_delta:-7,goal_state:'blocked',goal_reason:'둘째 근거',goal_next_action:'둘째 행동',goal_replace:true},
  ]}};
  const parsed=patched.text.format.$parseRaw(JSON.stringify(raw));
  assert.equal(parsed.state_delta.npc_state_updates[0].current_goal,'첫 목표');
  assert.equal(parsed.state_delta.npc_state_updates[0].goal_progress_delta,5);
  assert.equal(parsed.state_delta.npc_state_updates[0].goal_reason,'첫 근거');
  assert.equal(parsed.state_delta.npc_state_updates[0].goal_replace,false);
  assert.equal(parsed.state_delta.npc_state_updates[1].current_goal,'둘째 목표');
  assert.equal(parsed.state_delta.npc_state_updates[1].goal_progress_delta,-7);
  assert.equal(parsed.state_delta.npc_state_updates[1].goal_reason,'둘째 근거');
  assert.equal(parsed.state_delta.npc_state_updates[1].goal_replace,true);
});

test('legacy structured output preserves the Event Consequence queue field added by the adapter',()=>{
  const format={
    schema:{type:'object',properties:{state_delta:{type:'object',properties:{
      hooks_add:{type:'array',items:{type:'object'}},
      npc_state_updates:{type:'array',items:{type:'object',properties:{npc_key:{type:'string'},current_goal:{anyOf:[{type:'string'},{type:'null'}]}},required:['npc_key','current_goal'],additionalProperties:false}},
    },required:['hooks_add','npc_state_updates'],additionalProperties:false}}},
    $parseRaw:(content)=>{const raw=JSON.parse(content);return{state_delta:{hooks_add:raw.state_delta.hooks_add,npc_state_updates:raw.state_delta.npc_state_updates.map(r=>({npc_key:r.npc_key,current_goal:r.current_goal}))}};},
  };
  const patched=patchGoalV2StructuredFormat({instructions:'base',text:{format}});
  assert.ok(patched.text.format.schema.properties.state_delta.properties.delayed_consequences_add);
  assert.ok(patched.text.format.schema.properties.state_delta.required.includes('delayed_consequences_add'));
  const consequence={event_name:'교수 호출',target_bucket:'active',delay_minutes:30,reason:'결투 여파',secret_level:0};
  const raw={state_delta:{hooks_add:[],npc_state_updates:[],delayed_consequences_add:[consequence]}};
  assert.deepEqual(patched.text.format.$parseRaw(JSON.stringify(raw)).state_delta.delayed_consequences_add,[consequence]);
});

test('rephrasing preserves persisted priority and urgency even with due schedule and active hook',()=>{
  const old=oldGoal({priority:5,urgency:2,progress:61});
  const inc=incoming(old,{
    scheduleContext:{due:[{participants:[key]}]},
    hooks:[{status:'active',source_npc_key:key}],
  });
  const result=goalRuntimeFor(inc,key,old,{current_goal:'학생회 내 질서와 규율을 유지한다'}, {}, {});
  assert.equal(result.goal.id,old.active_goal.id);
  assert.equal(result.goal.priority,5);
  assert.equal(result.goal.urgency,2);
  assert.equal(result.goal.progress,61);
});

test('replacing an already terminal goal preserves its original terminal history snapshot',()=>{
  const old=oldGoal({state:'completed',progress:100,updated_turn:6,last_progress_reason:'원래 목표 달성'});
  old.goal_history=[{id:old.active_goal.id,desire:old.active_goal.desire,final_state:'completed',final_progress:100,ended_turn:6,end_reason:'원래 목표 달성'}];
  const result=goalRuntimeFor(incoming(old),key,old,{current_goal:'새로운 조사 목표',goal_replace:true,goal_reason:'새 사건이 발생했다'}, {}, {});
  const snapshot=result.history.find(x=>x.id===old.active_goal.id);
  assert.equal(snapshot.ended_turn,6);
  assert.equal(snapshot.end_reason,'원래 목표 달성');
  assert.equal(snapshot.final_state,'completed');
});

test('newest reported goal_next_action is stored first and no-evidence turns preserve updated_turn',()=>{
  const old=oldGoal({next_actions:['기존 행동','더 오래된 행동'],updated_turn:9});
  const withNext=goalRuntimeFor(incoming(old),key,old,{goal_next_action:'새 행동'}, {}, {});
  assert.equal(withNext.goal.next_actions[0],'새 행동');
  assert.equal(withNext.goal.updated_turn,11);
  const untouched=goalRuntimeFor(incoming(old),key,old,{}, {}, {});
  assert.equal(untouched.goal.updated_turn,9);
});

test('terminal cleanup compares both rephrased and previous goal desire',()=>{
  assert.match(source,/oldPlanText===String\(activeGoal\?\.desire\|\|''\)\.trim\(\)\|\|oldPlanText===String\(old\?\.active_goal\?\.desire\|\|''\)\.trim\(\)/);
  assert.match(source,/const goalPlan=activeGoal\?\.state==='active'\?clampText\(activeGoal\?\.next_actions\?\.\[0\]/);
});
