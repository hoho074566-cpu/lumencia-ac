// LUMENSIA MOBILE V1.5.6 — Stable Router + Event Director V3 + Living World V1 + Adaptive Time Scale V2
// External API version: 0.8.7
// NPC Goal V2 + Relationship Reason V1.
// One canonical core call per turn, but intercepts the final OpenAI request server-side
// and replaces full CANON/save/history with a relevance-routed context budget.

import OpenAI from 'openai';
import { AsyncLocalStorage } from 'node:async_hooks';
import coreHandler, { CHARACTER_REGISTRY } from './chat.js';
import { routeOpenAIParams, routerVersion, array, object, clampText } from './lib/context-router.js';
import { actualScheduledEntrants, freshChoices, reconcileParticipants } from '../lib/scene-continuity.js';
import { ADAPTIVE_TIME_SCALE_VERSION, SCENE_MOMENTUM_VERSION, classifySceneIntent, deriveSceneDelta, isPcRelevantScheduleEvent, nextScheduleBoundaryMinutes, updateSceneMomentum } from '../lib/scene-momentum.js';
import { TIME_PLAN_PARSER_VERSION, isAdditiveAdverbialStem, parseTimePlan, summarizeTimePlan } from '../lib/time-plan-parser.js';
import { projectStructuredOwnedEffects, rebaseStructuredEffectOwners, replaceStructuredEffectRows, structuredEffectRows, validateStructuredTimeExecution } from '../lib/time-plan-reconciliation.js';
import { SCENE_NOVELTY_VERSION, deriveSceneNovelty } from '../lib/scene-novelty.js';
import { deriveScenePurpose } from '../lib/scene-purpose.js';
import { deriveSceneExitCondition, evaluateSceneExitCondition } from '../lib/scene-exit.js';
import { deriveTurnHook, filterTurnHookChoices } from '../lib/turn-hook.js';
import { compactEventProgress, mergeContinuationEventProgressState, mergeRoutedEventProgressState, occurrenceIdFromStartEvidence, promotePausedEventProgress, scheduledIdsDueByTurnEnd, unscheduledPausedIdsForResume } from '../lib/event-progress.js';
import { findEventConsequence, minutesUntilEventConsequence, reconcileEventConsequenceLifecycle } from '../lib/event-consequence.js';
import { deriveGoalTickState } from '../lib/npc-goal-tick.js';
import { appendOffscreenDigest, deriveBoundedOffscreenProgression } from '../lib/offscreen-progression.js';
import { compactFactionSocialTelemetry, deriveFactionSocialState } from '../lib/faction-social-consequence.js';
import { compactSkillLearningTelemetry, deriveSkillLearningState, filterExistingSkillExperience } from '../lib/skill-learning.js';
import { compactAwakeningTalentTelemetry, deriveAwakeningTalentState } from '../lib/awakening-talent-evolution.js';
import { compactCombatGrowthTelemetry, deriveCombatGrowthState } from '../lib/combat-growth.js';
import { deriveSceneOrchestrationState } from '../lib/scene-orchestration.js';
import { deriveWorldResultSurfaceState } from '../lib/world-result-surfacing.js';
import { applyNpcSignificanceReceipt, deriveNpcSignificanceBoundary } from '../lib/npc-significance.js';

export const config = { maxDuration: 300 };

const ADAPTER_VERSION = '0.8.7';
const APP_VERSION = '1.5.6';
const SUPPORTED_MODES = new Set(['game','meta','auto','continue']);
const ROUTER_CONTEXT = new AsyncLocalStorage();
const PATCH_SYMBOL = Symbol.for('lumensia.stable.responses.parse.router.v156hf1');
const GOAL_STATES = new Set(['active','blocked','completed','abandoned']);

const AUTO_DIRECTIVE = String.raw`[LUMENSIA V1.5.6 AUTO FLOW — SCENE MOMENTUM HF1]
이 요청은 PC의 새 행동/대사/생각/감정/결정이 아니다. PC의 선택을 대신 만들지 않는다.
PC 판단이 필요 없는 세계의 자연스러운 흐름은 진행한다: 진행 중/예정된 사건의 후속, NPC의 목표·일정에 따른 접근/퇴장/상호작용, 다른 NPC끼리의 행동, 시간·환경 변화와 이미 발생한 결과의 파급을 허용한다.
NPC와 사건은 PC가 먼저 찾아오기를 기다릴 필요가 없다. 다만 물리 위치·일정·지식·관계 제약을 지키고 순간이동/새 대형 사건/새 비밀을 억지로 만들지 않는다.
PC가 대답·판단·위험한 선택을 해야 하는 첫 의미 있는 지점에서 즉시 멈춘다.`;

const CONTINUE_DIRECTIVE = String.raw`[LUMENSIA V1.5.6 CONTINUE]
이 요청은 PC 행동이 아니다. 직전 GM 응답의 같은 순간/같은 장면을 문학적으로 조금 더 이어 쓴다.
시간·위치·관계·기억·성장·일정·훅·보상·감정 저장상태를 변경하지 않는다. 직전 state_delta를 절대 다시 적용하지 않는다.
PC의 행동·대사·감정·생각·수락·거절을 새로 만들지 않는다.`;

const GOAL_V2_RULES = String.raw`[NPC GOAL V2]
npc_state_updates의 Goal V2 필드는 실제 턴 근거가 있을 때만 쓴다. goal_progress_delta는 -100..100 정수이며 0이 아닌 변화에는 goal_reason이 필수다. goal_state 전환에도 goal_reason이 필수다. 같은 목표의 표현만 다듬는 것은 goal_replace=false/null이고 기존 목표 ID·진행도·우선도·긴급도·시작 턴을 유지한다. 실제로 다른 목표로 교체할 때만 goal_replace=true로 보고한다. goal_next_action은 실제 다음 행동 근거가 있을 때만 쓴다. completed 목표를 active로 재개하려면 명시적 reason과 음수 delta로 100 미만이 되어야 한다. abandoned 목표는 명시적 active 재개 전까지 진행도를 바꾸지 않는다. 대화/등장만으로 목표 진행도를 올리지 않는다.`;

const TIME_EXECUTION_RULES = String.raw`[TPP PHASE 3 — STRUCTURED EXECUTION OWNERSHIP]
time_execution은 사용자에게 보이는 서술이 아니라 이번 응답의 구조화된 실행 영수증이다.
입력에 STRUCTURED_TIME_PLAN이 있으면 plan_used=true로 하고, 제공된 action_N ID만 사용한다. 없으면 plan_used=false, boundary_kind=none, boundary_minutes=state_delta.advance_minutes, completed_clause_ids/effect_owners/scalar_contributions는 빈 배열, 나머지는 null로 둔다.
completed_clause_ids에는 실제 완료된 연속 prefix action만 넣고, 중간에 멈춘 첫 action은 interrupted_clause_id에 넣는다. 0분 동안 양의 최대시간을 가진 action을 완료했다고 보고하지 않는다.
choices가 있으면 실제 선택 질문을 scene의 마지막 항목에 두고 decision_scene_index를 그 0-based index로 보고한다. choices가 없으면 decision_scene_index=null이다.
state_delta의 각 array 원소와 숫자가 아닌 scalar에는 effect_owners 한 개를 둔다. scope=state_delta, field는 실제 필드명, array는 effect_index, scalar는 null이다. fatigue_delta/gold_delta는 합계 소유자를 쓰지 말고 scalar_contributions에 action/event별 실제 기여량을 각각 보고하며, 기여량 합계는 state_delta 값과 정확히 같아야 한다. 완료한 사용자 action에서 생긴 효과는 owner_kind=clause/owner_id=action_N이다. 일정·인과·Director 경계 자체의 효과는 owner_kind=boundary-event와 실제 boundary_event_id를 쓴다. 서로 다른 action의 효과를 한 array row에 섞지 않는다.
1440분 턴 상한에서 아직 plan이 끝나지 않았다면 boundary_kind=turn-limit가 다른 choice보다 우선한다. choices는 다음 턴으로 미루고 남은 action을 완료했다고 보고하지 않는다.
event_progress나 director가 실제 선택 경계 사건에 속하면 scope=turn, field=event_progress 또는 director, effect_index=null, owner_kind=boundary-event로 귀속한다. 서술 표현을 근거로 미래 action 효과를 앞선 action에 귀속하지 않는다.`;

const SKILL_LEARNING_RULES = String.raw`[SKILL LEARNING V1]
skill_learning은 PC에게 아직 없는 독립적이고 반복 사용 가능한 기술을 실제 훈련·수업·교정·실전 통찰로 배우는 경우에만 쓴다. 기존 기술의 동의어·세부 동작·일회성 연출·단순 사용을 새 기술로 만들지 않는다. skill에는 짧고 일관된 기술명, amount에는 한 턴 1~15의 보수적 진척, basis에는 이번 턴에 실제로 관찰 가능한 훈련법·교정·실전 근거, reason에는 진척 원인을 쓴다. basis 없는 진척은 금지한다. 이미 pc.skills에 있는 기술은 skill_experience만 사용하고, 기존 pc.skillCandidates의 같은 기술은 저장된 정확한 이름을 유지한다. 한 턴에 최대 2개만 보고하며 META·AUTO·CONTINUE에서는 성장시키지 않는다.`;

const COMBAT_GROWTH_RULES = String.raw`[COMBAT GROWTH V2]
stat_progress와 skill_experience는 PC가 직접 수행한 훈련·수업·분석·실전에서 실제 적응이나 학습 자극이 장면에 드러난 경우에만 쓴다. 단순 사용, 쉬운 반복, 승리·패배 사실만으로는 성장시키지 않는다. 전투 중 기존 스킬 경험치는 resolution_log에 실제 반영된 정확한 스킬에만 주고, 실패도 교정·통찰·압박 적응이 실제 발생했다면 성장할 수 있다. 기초 반복/교정은 보통 +1, 강적·실전 압박·새 응용은 최대 +3, 생사 경계의 결정적 통찰도 최대 +5다. S권은 강한 자극, SS 이상은 극한의 결정적 돌파 없이는 진척시키지 않는다. 무관한 스탯을 묶어 올리거나 NPC 행동을 PC 성장으로 기록하지 않는다. META·AUTO·CONTINUE에서는 stat_progress와 skill_experience를 모두 비운다.`;

const AWAKENING_TALENT_RULES = String.raw`[AWAKENING / TALENT EVOLUTION V1]
awakening_progress는 단순 훈련·평범한 승리·감정 고조가 아니라 장면에 실제 드러난 희귀 원인이 있을 때만 쓴다. Trait은 반복되는 특이 현상·극한 적응·혈통/영혼의 고유 반응, Authority는 운명 전환·영혼 각인·초월적 계약/계승·세계 법칙의 응답이 필요하다. 기존 후보는 저장된 정확한 kind/name/description/limitation을 유지하고 한 턴 최대 1개, amount 1~10만 보고한다. milestone=true는 별개의 결정적 장면에만 쓴다. Trait은 100 진척과 서로 다른 이정표 3개, Authority는 100 진척과 4개를 모두 충족해야 앱이 각성한다. Trait을 Authority로 진화시키지 않는다.
talent_evolution은 성유물·신의 직접 축복·초월자/정령왕 개입·영혼 재구성처럼 PC의 성장 천장을 영구 변경한 신화적 사건이 현재 장면에 실제 보일 때만 쓴다. talent는 magic/martial/soul/knowledge 중 하나, amount는 정확히 1, cause는 확인된 신화적 원인, reason은 해당 재능의 천장이 변한 이유다. 일반 훈련·승리·패배 직후 무료 구원·즉흥 유물/신격·같은 원인 반복 적용은 금지하며 10을 넘지 않는다. META·AUTO·CONTINUE에서는 두 필드를 모두 비운다.`;

function goalV2FieldSchema(){
  return {
    goal_progress_delta:{anyOf:[{type:'integer',minimum:-100,maximum:100},{type:'null'}]},
    goal_state:{anyOf:[{type:'string',enum:['active','blocked','completed','abandoned']},{type:'null'}]},
    goal_reason:{anyOf:[{type:'string',maxLength:280},{type:'null'}]},
    goal_next_action:{anyOf:[{type:'string',maxLength:240},{type:'null'}]},
    goal_replace:{anyOf:[{type:'boolean'},{type:'null'}]},
  };
}
function delayedConsequenceFieldSchema(){
  return {
    type:'array',maxItems:6,
    items:{
      type:'object',additionalProperties:false,
      properties:{
        event_name:{type:'string',minLength:1,maxLength:220},
        target_bucket:{type:'string',enum:['active','world']},
        delay_minutes:{type:'integer',minimum:1,maximum:43200},
        reason:{type:'string',minLength:1,maxLength:320},
        secret_level:{type:'integer',minimum:0,maximum:5},
      },
      required:['event_name','target_bucket','delay_minutes','reason','secret_level'],
    },
  };
}
function timeExecutionFieldSchema(){
  return {
    type:'object',additionalProperties:false,
    properties:{
      version:{type:'string',enum:['1.0']},
      plan_used:{type:'boolean'},
      boundary_kind:{type:'string',enum:['none','choice','schedule','consequence','turn-limit']},
      boundary_minutes:{type:'integer',minimum:0,maximum:1440},
      completed_clause_ids:{type:'array',maxItems:8,items:{type:'string',pattern:'^action_[1-8]$'}},
      interrupted_clause_id:{anyOf:[{type:'string',pattern:'^action_[1-8]$'},{type:'null'}]},
      decision_scene_index:{anyOf:[{type:'integer',minimum:0,maximum:17},{type:'null'}]},
      boundary_event_id:{anyOf:[{type:'string',minLength:1,maxLength:120},{type:'null'}]},
      effect_owners:{type:'array',maxItems:80,items:{type:'object',additionalProperties:false,properties:{scope:{type:'string',enum:['state_delta','turn']},field:{type:'string',minLength:1,maxLength:80},effect_index:{anyOf:[{type:'integer',minimum:0,maximum:31},{type:'null'}]},owner_kind:{type:'string',enum:['clause','boundary-event','world']},owner_id:{type:'string',minLength:1,maxLength:120}},required:['scope','field','effect_index','owner_kind','owner_id']}},
      scalar_contributions:{type:'array',maxItems:16,items:{type:'object',additionalProperties:false,properties:{field:{type:'string',enum:['fatigue_delta','gold_delta']},amount:{type:'integer',minimum:-10000,maximum:10000},owner_kind:{type:'string',enum:['clause','boundary-event','world']},owner_id:{type:'string',minLength:1,maxLength:120}},required:['field','amount','owner_kind','owner_id']}},
    },
    required:['version','plan_used','boundary_kind','boundary_minutes','completed_clause_ids','interrupted_clause_id','decision_scene_index','boundary_event_id','effect_owners','scalar_contributions'],
  };
}
function skillLearningFieldSchema(){
  return {
    type:'array',maxItems:2,
    items:{
      type:'object',additionalProperties:false,
      properties:{
        skill:{type:'string',minLength:2,maxLength:48},
        amount:{type:'integer',minimum:1,maximum:15},
        basis:{anyOf:[{type:'string',minLength:1,maxLength:120},{type:'null'}]},
        reason:{type:'string',minLength:1,maxLength:280},
      },
      required:['skill','amount','basis','reason'],
    },
  };
}
function awakeningProgressFieldSchema(){
  return {
    type:'array',maxItems:1,
    items:{
      type:'object',additionalProperties:false,
      properties:{
        kind:{type:'string',enum:['trait','authority']},
        name:{type:'string',minLength:2,maxLength:64},
        amount:{type:'integer',minimum:1,maximum:10},
        milestone:{type:'boolean'},
        description:{type:'string',minLength:1,maxLength:360},
        limitation:{type:'string',minLength:1,maxLength:360},
        reason:{type:'string',minLength:1,maxLength:300},
      },
      required:['kind','name','amount','milestone','description','limitation','reason'],
    },
  };
}
function talentEvolutionFieldSchema(){
  return {
    type:'array',maxItems:1,
    items:{
      type:'object',additionalProperties:false,
      properties:{
        talent:{type:'string',enum:['magic','martial','soul','knowledge']},
        amount:{type:'integer',minimum:1,maximum:1},
        cause:{type:'string',minLength:1,maxLength:280},
        reason:{type:'string',minLength:1,maxLength:300},
      },
      required:['talent','amount','cause','reason'],
    },
  };
}
function extendGoalV2JsonSchema(schema){
  if(!schema||typeof schema!=='object')return false;
  let changed=false;
  const visit=(node)=>{
    if(!node||typeof node!=='object')return;
    const rows=node?.properties?.npc_state_updates;
    const item=rows?.items;
    if(item?.properties?.npc_key&&item?.properties?.current_goal){
      Object.assign(item.properties,goalV2FieldSchema());
      item.required=[...new Set([...(Array.isArray(item.required)?item.required:[]),'goal_progress_delta','goal_state','goal_reason','goal_next_action','goal_replace'])];
      changed=true;
    }
    const stateDelta=node?.properties?.state_delta;
    if(stateDelta?.properties?.advance_minutes&&node?.properties?.scene&&node?.properties?.choices&&!node.properties.time_execution){
      node.properties.time_execution=timeExecutionFieldSchema();
      node.required=[...new Set([...(Array.isArray(node.required)?node.required:[]),'time_execution'])];
      changed=true;
    }
    if(stateDelta?.properties?.hooks_add&&!stateDelta.properties.delayed_consequences_add){
      stateDelta.properties.delayed_consequences_add=delayedConsequenceFieldSchema();
      stateDelta.required=[...new Set([...(Array.isArray(stateDelta.required)?stateDelta.required:[]),'delayed_consequences_add'])];
      changed=true;
    }
    if(stateDelta?.properties?.skill_experience&&!stateDelta.properties.skill_learning){
      stateDelta.properties.skill_learning=skillLearningFieldSchema();
      stateDelta.required=[...new Set([...(Array.isArray(stateDelta.required)?stateDelta.required:[]),'skill_learning'])];
      changed=true;
    }
    if(stateDelta?.properties?.skill_experience&&!stateDelta.properties.awakening_progress){
      stateDelta.properties.awakening_progress=awakeningProgressFieldSchema();
      stateDelta.required=[...new Set([...(Array.isArray(stateDelta.required)?stateDelta.required:[]),'awakening_progress'])];
      changed=true;
    }
    if(stateDelta?.properties?.skill_experience&&!stateDelta.properties.talent_evolution){
      stateDelta.properties.talent_evolution=talentEvolutionFieldSchema();
      stateDelta.required=[...new Set([...(Array.isArray(stateDelta.required)?stateDelta.required:[]),'talent_evolution'])];
      changed=true;
    }
    for(const value of Object.values(node)){
      if(Array.isArray(value))for(const child of value)visit(child);
      else if(value&&typeof value==='object')visit(value);
    }
  };
  visit(schema);
  return changed;
}
function mergeRawGoalV2Fields(parsed,raw){
  if(parsed&&typeof parsed==='object'&&raw?.time_execution&&typeof raw.time_execution==='object')parsed.time_execution=raw.time_execution;
  const parsedRows=parsed?.state_delta?.npc_state_updates;
  const rawRows=raw?.state_delta?.npc_state_updates;
  if(Array.isArray(parsedRows)&&Array.isArray(rawRows)){
    const limit=Math.min(parsedRows.length,rawRows.length);
    for(let i=0;i<limit;i++){
      const row=parsedRows[i];
      const source=rawRows[i];
      if(!row||typeof row!=='object'||!source||typeof source!=='object')continue;
      if(String(row.npc_key||'')!==String(source.npc_key||''))continue;
      for(const field of ['goal_progress_delta','goal_state','goal_reason','goal_next_action','goal_replace']){
        if(Object.prototype.hasOwnProperty.call(source,field))row[field]=source[field];
      }
    }
  }
  const rawConsequences=raw?.state_delta?.delayed_consequences_add;
  if(parsed?.state_delta&&Array.isArray(rawConsequences))parsed.state_delta.delayed_consequences_add=rawConsequences.slice(0,6);
  const rawSkillLearning=raw?.state_delta?.skill_learning;
  if(parsed?.state_delta&&Array.isArray(rawSkillLearning))parsed.state_delta.skill_learning=rawSkillLearning.slice(0,2);
  const rawAwakeningProgress=raw?.state_delta?.awakening_progress;
  if(parsed?.state_delta&&Array.isArray(rawAwakeningProgress))parsed.state_delta.awakening_progress=rawAwakeningProgress.slice(0,1);
  const rawTalentEvolution=raw?.state_delta?.talent_evolution;
  if(parsed?.state_delta&&Array.isArray(rawTalentEvolution))parsed.state_delta.talent_evolution=rawTalentEvolution.slice(0,1);
  const parsedDelta=parsed?.state_delta;
  if(parsedDelta&&typeof parsedDelta==='object'&&!Array.isArray(parsedDelta))for(const field of Object.keys(parsedDelta)){
    if(Array.isArray(parsedDelta[field]))structuredEffectRows(parsed,field);
  }
  return parsed;
}
function patchGoalV2StructuredFormat(params){
  const format=params?.text?.format;
  if(!format||typeof format!=='object'||!format.schema)return params;
  let schema;
  try{schema=structuredClone(format.schema);}catch{schema=JSON.parse(JSON.stringify(format.schema));}
  if(!extendGoalV2JsonSchema(schema))return params;
  const originalParseRaw=format.$parseRaw;
  const patchedFormat={...format,schema};
  if(typeof originalParseRaw==='function'){
    patchedFormat.$parseRaw=(content)=>{
      const parsed=originalParseRaw(content);
      try{return mergeRawGoalV2Fields(parsed,JSON.parse(content));}catch{return parsed;}
    };
  }
  const combatGrowthRules=typeof COMBAT_GROWTH_RULES==='string'?`\n\n${COMBAT_GROWTH_RULES}`:'';
  const skillLearningRules=typeof SKILL_LEARNING_RULES==='string'?`\n\n${SKILL_LEARNING_RULES}`:'';
  const awakeningTalentRules=typeof AWAKENING_TALENT_RULES==='string'?`\n\n${AWAKENING_TALENT_RULES}`:'';
  return {...params,instructions:`${String(params.instructions||'')}\n\n${GOAL_V2_RULES}\n\n${TIME_EXECUTION_RULES}${combatGrowthRules}${skillLearningRules}${awakeningTalentRules}`,text:{...(params.text||{}),format:patchedFormat}};
}

function installResponsesRouter() {
  const probe = new OpenAI({ apiKey:'sk-lumensia-router-probe' });
  const proto = Object.getPrototypeOf(probe.responses);
  if (!proto || typeof proto.parse !== 'function') throw new Error('OpenAI Responses.parse prototype을 찾지 못했습니다.');
  if (proto[PATCH_SYMBOL]) return;
  const originalParse = proto.parse;
  Object.defineProperty(proto,PATCH_SYMBOL,{value:originalParse,configurable:false,enumerable:false,writable:false});
  proto.parse = function routedParse(params, options) {
    const ctx = ROUTER_CONTEXT.getStore();
    if (!ctx?.enabled) return originalParse.call(this,params,options);
    const routed = routeOpenAIParams(params,{incoming:ctx.incoming,mode:ctx.mode});
    ctx.telemetry = routed.telemetry;
    const nextParams=(ctx.mode==='game'||ctx.mode==='auto')?patchGoalV2StructuredFormat(routed.params):routed.params;
    return originalParse.call(this,nextParams,options);
  };
}
installResponsesRouter();

function emptyStateDelta() {
  return {
    advance_minutes:0,new_location:null,pc_status:null,fatigue_delta:0,gold_delta:0,
    relationship_changes:[],npc_relationship_changes:[],faction_reputation_changes:[],intimacy_changes:[],stat_progress:[],skill_experience:[],skill_learning:[],awakening_progress:[],talent_evolution:[],
    items_add:[],items_remove:[],active_events_add:[],active_events_remove:[],completed_events_add:[],
    pc_knowledge_add:[],scheduled_events_add:[],scheduled_events_complete:[],hooks_add:[],hooks_update:[],
    memories_add:[],npc_state_updates:[],delayed_consequences_add:[],
  };
}

function continueAction(incoming) {
  const runtime = object(incoming.saveState?.sceneRuntime);
  const eventAnchor = compactEventProgress(runtime.eventProgress);
  const continuity={scene_key:runtime.scene_key||'',participants:array(runtime.participants).slice(0,8),ongoing_topic:runtime.ongoing_topic||'',unresolved_question:runtime.unresolved_question||''};
  return clampText(`${CONTINUE_DIRECTIVE}${eventAnchor?`\n현재 이벤트 진행(권위 상태): ${eventAnchor}`:''}\n직전 장면 연속성: ${clampText(continuity,900)}`,5000);
}

function continueRouteSave(saveState={}) {
  const save=object(saveState),safeRuntime={...object(save.sceneRuntime)};
  delete safeRuntime.remaining_beats;
  return{...save,sceneRuntime:safeRuntime};
}

function lockContinueTurn(turn) {
  if (!turn || typeof turn !== 'object') return turn;
  turn.state_delta = emptyStateDelta();
  turn.emotion_updates = [];
  turn.cg_id = null;
  turn.director = {
    intervention:'none',beat:'routine',event_kind:'none',spotlight_keys:[],callback_key:null,callback_phase:'none',callback_note:null,
    reason:'V1.5.6 CONTINUE hard freeze',
  };
  return turn;
}

function moodFromExpression(expression='') {
  const map={smile:'호의적/가벼운 기분',laugh:'즐거움/웃음',smug:'자신만만/능글맞음',blush:'수줍음/호감',flustered:'당황',serious:'진지/집중',annoyed:'짜증/불편',angry:'분노',worried:'걱정/불안',sad:'침울/슬픔',confused:'혼란/의아',shock:'놀람/충격',default:'중립'};
  return map[String(expression||'').toLowerCase()]||'';
}
function relationChangeFor(turn,key){return array(turn?.state_delta?.relationship_changes).find(x=>String(x?.npc_key||x?.key||'')===key)||null;}
function npcStateUpdateFor(turn,key){return array(turn?.state_delta?.npc_state_updates).find(x=>String(x?.npc_key||x?.key||'')===key)||null;}
function emotionFor(turn,key){return array(turn?.emotion_updates).find(x=>String(x?.npc_key||x?.key||x?.speaker_key||'')===key)||null;}
function bounded(value,min,max,fallback){if(value==null||value==='')return fallback;const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}

function npcRelationshipRuntimeFor(sourceKey,previousLinks={},changes=[],turnNo=0,sourceEvent=''){
  const links={},safeTurnNo=Math.trunc(bounded(turnNo,0,1e9,0));
  for(const [targetKey,raw] of Object.entries(object(previousLinks))){
    if(targetKey===sourceKey||!Object.prototype.hasOwnProperty.call(CHARACTER_REGISTRY,targetKey))continue;
    const row=object(raw);
    links[targetKey]={
      affinity:Math.trunc(bounded(row.affinity,-100,100,0)),trust:Math.trunc(bounded(row.trust,-100,100,0)),status:clampText(row.status||'중립',80)||'중립',
      reason:clampText(row.reason||'',300),updated_turn:Math.trunc(bounded(row.updated_turn,0,1e9,0)),
      history:array(row.history).slice(-8).map(item=>typeof item==='string'?clampText(item,300):{
        turn:Math.trunc(bounded(item?.turn,0,1e9,0)),affinity_delta:Math.trunc(bounded(item?.affinity_delta,-10,10,0)),trust_delta:Math.trunc(bounded(item?.trust_delta,-10,10,0)),
        status:clampText(item?.status||'',80)||null,reason:clampText(item?.reason||'',300),source_event:clampText(item?.source_event||'',120)||null,
      }),
    };
  }
  for(const raw of array(changes).slice(0,6)){
    const targetKey=String(raw?.target_npc_key||'').trim(),reason=clampText(raw?.reason||'',300).trim();
    if(!reason||targetKey===sourceKey||!Object.prototype.hasOwnProperty.call(CHARACTER_REGISTRY,targetKey))continue;
    const old=object(links[targetKey]),affinityDelta=Math.trunc(bounded(raw?.affinity_delta,-10,10,0)),trustDelta=Math.trunc(bounded(raw?.trust_delta,-10,10,0));
    const historyRow={turn:safeTurnNo,affinity_delta:affinityDelta,trust_delta:trustDelta,status:clampText(raw?.status||'',80)||null,reason,source_event:clampText(sourceEvent||'',120)||null};
    if(affinityDelta===0&&trustDelta===0&&(!historyRow.status||historyRow.status===String(old.status||'중립')))continue;
    links[targetKey]={affinity:Math.trunc(bounded(Number(old.affinity||0)+affinityDelta,-100,100,0)),trust:Math.trunc(bounded(Number(old.trust||0)+trustDelta,-100,100,0)),status:historyRow.status||clampText(old.status||'중립',80)||'중립',reason,updated_turn:safeTurnNo,history:[...array(old.history),historyRow].slice(-8)};
  }
  return Object.fromEntries(Object.entries(links).sort((a,b)=>Number(b[1]?.updated_turn||0)-Number(a[1]?.updated_turn||0)||(Math.abs(Number(b[1]?.affinity||0))+Math.abs(Number(b[1]?.trust||0)))-(Math.abs(Number(a[1]?.affinity||0))+Math.abs(Number(a[1]?.trust||0)))||a[0].localeCompare(b[0])).slice(0,16));
}

function localNpcRelationshipUpdates(incoming,turn){
  const rows=array(turn?.state_delta?.npc_relationship_changes).slice(0,6),grouped={};
  for(const row of rows){
    const sourceKey=String(row?.source_npc_key||'').trim(),targetKey=String(row?.target_npc_key||'').trim();
    if(sourceKey===targetKey||!Object.prototype.hasOwnProperty.call(CHARACTER_REGISTRY,sourceKey)||!Object.prototype.hasOwnProperty.call(CHARACTER_REGISTRY,targetKey)||(Number(row?.affinity_delta||0)===0&&Number(row?.trust_delta||0)===0&&!String(row?.status||'').trim()))continue;
    (grouped[sourceKey]||(grouped[sourceKey]=[])).push(row);
  }
  const out={},previous=object(incoming.saveState?.npcInnerStates),turnNo=Number(incoming.saveState?.turnNumber||0)+1,sourceEvent=turn?.event_progress?.event_instance_id||turn?.director?.callback_key||turn?.scene_title||'';
  for(const [sourceKey,changes] of Object.entries(grouped))out[sourceKey]={npc_relationships:npcRelationshipRuntimeFor(sourceKey,object(previous[sourceKey]).npc_relationships,changes,turnNo,sourceEvent)};
  return out;
}
function scheduleTimestamp(date='',time=''){
  const dm=String(date||'').trim().match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/),tm=String(time||'').trim().match(/^(\d{1,2}):(\d{2})$/);if(!dm||!tm)return null;
  const year=Number(dm[1]),month=Number(dm[2]),day=Number(dm[3]),hour=Number(tm[1]),minute=Number(tm[2]);if(month<1||month>12||day<1||day>31||hour<0||hour>23||minute<0||minute>59)return null;
  const stamp=new Date(0);stamp.setUTCFullYear(year,month-1,day);stamp.setUTCHours(hour,minute,0,0);if(stamp.getUTCFullYear()!==year||stamp.getUTCMonth()!==month-1||stamp.getUTCDate()!==day||stamp.getUTCHours()!==hour||stamp.getUTCMinutes()!==minute)return null;return stamp.getTime();
}
function scheduleRowsAtBoundary(saveState={},boundary=null){
  const save=object(saveState),world=object(save.world),start=scheduleTimestamp(world.date,world.time),minutes=Number(boundary);if(start==null||!Number.isFinite(minutes)||minutes<=0)return[];
  const target=start+minutes*60000,seen=new Set(),rows=[];
  for(const row of [...array(save.scheduledEvents),...array(save?.scheduleContext?.upcoming)]){if(!row||['completed','cancelled'].includes(String(row.status||'').trim().toLowerCase())||!isPcRelevantScheduleEvent(save,row))continue;const at=scheduleTimestamp(row.date||world.date,row.time);if(at!==target)continue;const key=`${String(row.id||'').trim().toLowerCase()}|${row.date||world.date}|${row.time||''}`;if(seen.has(key))continue;seen.add(key);rows.push(row);}
  return rows;
}
function scheduleRowMentioned(turn,row={}){
  const visible=[turn?.scene_title,...array(turn?.scene).map(item=>item?.text),...array(turn?.choices)].filter(Boolean).join(' ').toLowerCase(),id=String(row.id||'').trim().toLowerCase();if(id.length>=4&&visible.includes(id))return true;
  const generic=new Set(['필수','일정','시작','종료','예정','행사','event','required']),raw=String(row.title||'').toLowerCase().match(/[가-힣a-z0-9]+/g)||[],tokens=[...new Set(raw.filter(token=>token.length>=2&&!generic.has(token)))];if(!tokens.length)return false;
  const matched=tokens.filter(token=>visible.includes(token)).length;return matched>=Math.min(2,tokens.length);
}
function scheduleTimeMentioned(text,row={}){
  const match=String(row?.time||'').trim().match(/^(\d{1,2}):(\d{2})$/);if(!match)return false;
  const hour=Number(match[1]),minute=Number(match[2]),value=String(text||'');if(!Number.isInteger(hour)||!Number.isInteger(minute))return false;
  const hourToken=hour<10?`0?${hour}`:`${hour}`,minuteToken=String(minute).padStart(2,'0'),colon=new RegExp(`(?:^|\\D)${hourToken}:${minuteToken}(?!\\d)`),korean=minute===0?new RegExp(`(?:^|\\D)${hour}\\s*시(?!\\s*(?:\\d+\\s*분|반))`):minute===30?new RegExp(`(?:^|\\D)${hour}\\s*시\\s*(?:30\\s*분|반)`):new RegExp(`(?:^|\\D)${hour}\\s*시\\s*${minute}\\s*분`),unmarkedValue=value.replace(/(?:오전|오후|아침|새벽|낮|저녁|밤)\s*\d{1,2}(?:\s*시(?:\s*(?:\d{1,2}\s*분|반))?|:\d{2})/g,' ');
  const period=hour===0?'밤':hour<=5?'밤':hour<=11?'(?:오전|아침)':hour<=17?'(?:오후|낮)':'(?:오후|저녁|밤)',twelveHour=hour%12||12,twelveHourKorean=minute===0?new RegExp(`${period}\\s*${twelveHour}\\s*시(?!\\s*(?:\\d+\\s*분|반))`):minute===30?new RegExp(`${period}\\s*${twelveHour}\\s*시\\s*(?:30\\s*분|반)`):new RegExp(`${period}\\s*${twelveHour}\\s*시\\s*${minute}\\s*분`);
  const twelveHourColon=new RegExp(`${period}\\s*${twelveHour}:${minuteToken}(?!\\d)`);
  if(colon.test(unmarkedValue)||korean.test(unmarkedValue)||twelveHourKorean.test(value)||twelveHourColon.test(value))return true;
  return minute===0&&((hour===12&&/정오/.test(value))||(hour===0&&/자정/.test(value)));
}
function scheduleBoundaryOccurred(turn,row={}){
  if(!scheduleRowMentioned(turn,row))return false;
  const segments=[turn?.scene_title,...array(turn?.scene).map(item=>item?.text)].filter(Boolean).flatMap(value=>String(value).split(/(?<=[.!?。！？])|\n+/)).map(value=>value.trim()).filter(Boolean);
  const nonCurrent=/(?:예정|계획|하려|할\s*(?:예정|계획)|아직|않았|못했|미완료|어제|지난\s*(?:날|주|달|해|학기|번|수업|강의|세미나|실습|오리엔테이션|교육|입학식|일정|행사)|예전에|과거|앞서|이전에|[?？])/;
  const started=segments.some(text=>!nonCurrent.test(text)&&scheduleRowMentioned({scene:[{text}]},row)&&/(?:시작(?:되어(?!야)|되었|됐다|되었다|했으며|했다)|개막(?:하여(?!야)|했|했다)|개시(?:되어(?!야)|되었|됐다|되었다|했다))/.test(text));
  if(started)return true;
  const bellCue=/(?:종(?:이|소리가|소리도)?\s*(?:울렸다|울렸(?:다|고|으며|지만|는데)|울리기\s*시작했(?:다|고|으며)|들렸다|들렸(?:다|고|으며))|종소리가\s*(?:퍼졌다|퍼졌(?:다|고|으며)|들려왔다|들려왔(?:다|고|으며)|들렸다))/,bellSegments=segments.filter(text=>!nonCurrent.test(text)&&bellCue.test(text));
  if(bellSegments.some(text=>scheduleTimeMentioned(text,row)))return true;
  const title=String(turn?.scene_title||'');return bellSegments.length>0&&/종/.test(title)&&scheduleTimeMentioned(title,row);
}
function scheduleBoundaryCompletionMentioned(turn,row={}){
  if(!scheduleRowMentioned(turn,row))return false;
  const segments=[turn?.scene_title,turn?.scene_summary,...array(turn?.scene).map(item=>item?.text)].filter(Boolean).flatMap(value=>String(value).split(/(?<=[.!?。！？])|\n+/)).map(value=>value.trim()).filter(Boolean),completionCue=/(?:마쳤|끝냈|완료|종료|수료|보상|상금|지급|complete|finished|reward)/,hypothetical=/(?:예정|계획|하려|할\s*(?:예정|계획)|아직|않았|못했|미완료|어제|지난|예전에|과거|앞서|이전에|[?？])/;
  return segments.some(text=>completionCue.test(text)&&!hypothetical.test(text)&&scheduleRowMentioned({scene:[{text}]},row));
}
function consequenceEvidenceSegments(turn,consequence){
  const source=[consequence?.event_name,Number(consequence?.secret_level||0)<=2?consequence?.reason:''].filter(Boolean).join(' ').toLowerCase();
  const generic=new Set(['결과','후속','사건','상황','변화','발생','진행','관련','event','result','consequence']);
  const tokens=[...new Set((source.match(/[가-힣a-z0-9_]{2,}/g)||[]).map(token=>token.replace(/(?:에게서|에게|한테|께서|으로|에서|까지|부터|처럼|보다|에는|은|는|이|가|을|를|와|과|도|의)$/u,'')).filter(token=>token.length>=2&&!generic.has(token)))];
  const segments=[turn?.scene_title,turn?.scene_summary,...array(turn?.scene).map(item=>item?.text)].filter(Boolean).flatMap(value=>String(value).toLowerCase().split(/(?<=[.!?。！？])|\n+/)).map(value=>value.trim()).filter(Boolean);
  const eventName=String(consequence?.event_name||'').trim().toLowerCase();
  const matched=segments.filter(segment=>(eventName.length>=3&&segment.includes(eventName))||(tokens.length&&tokens.filter(token=>segment.includes(token)).length>=Math.min(2,Math.max(1,tokens.length))));
  return{tokens,segments,matched};
}
function consequenceEffectMatches(value,segments=[]){
  const text=(typeof value==='string'?value:[value?.reason,value?.cause,value?.fact,value?.description,value?.summary,value?.note,value?.title,value?.event_name,value?.name,value?.status,value?.source].filter(Boolean).join(' ')).trim().toLowerCase();
  if(text.length<2||!segments.length)return false;
  if(text.length>=4&&segments.some(segment=>segment.includes(text)))return true;
  const generic=new Set(['결과','후속','사건','상황','변화','발생','진행','관련','상태','시간','분','동안','하루','이틀','사흘','나흘','일','주','달','개월','년','event','result','consequence']);
  const tokens=[...new Set((text.match(/[가-힣a-z0-9_]{2,}/g)||[]).map(token=>token.replace(/(?:에게서|에게|한테|께서|으로|에서|까지|부터|처럼|보다|에는|은|는|이|가|을|를|와|과|도|의)$/u,'').replace(/(?:하였다|했습니다|했다|합니다|한다|되었다|됐다|됩니다|된다|이었다|였다|입니다|이다)$/u,'')).filter(token=>token.length>=2&&!generic.has(token)))];
  return tokens.length>=2&&segments.some(segment=>tokens.filter(token=>segment.includes(token)).length>=Math.min(2,tokens.length));
}
function prefixEffectMatches(value,segments=[]){
  if(typeof value==='string'){
    const text=value.trim().toLowerCase();if(text.length>=2&&array(segments).some(segment=>String(segment||'').toLowerCase().includes(text)))return true;
  }
  return consequenceEffectMatches(value,segments);
}
function effectActionTypes(value){
  const text=(typeof value==='string'?value:Object.values(object(value)).flatMap(item=>Array.isArray(item)?item:[item]).filter(item=>['string','number'].includes(typeof item)).join(' ')).toLowerCase(),types=new Set();
  const cues={training:/(?:훈련|연습|수련|단련)/,'class-attendance':/(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)/,meal:/(?:식사|아침|점심|저녁|밥|만찬)/,dialogue:/(?:대화|이야기|상담|논의|면담|회의|브리핑|협상)/,sleep:/(?:잠|수면|숙면)/,rest:/(?:휴식|쉬었|쉼)/,wait:/(?:기다림|기다렸|대기)/,travel:/(?:이동|도착|출발|여정)/};
  for(const [type,cue] of Object.entries(cues))if(cue.test(text))types.add(type);return types;
}
function prefixEffectMatchesCompletedClauses(value,segments=[],completedTypes=[]){
  const completed=new Set(array(completedTypes).map(String)),mentioned=effectActionTypes(value);if(mentioned.size&&[...mentioned].some(type=>!completed.has(type)))return false;
  if(typeof value==='string')return prefixEffectMatches(value,segments);
  const exactValues=Object.values(object(value)).flatMap(item=>Array.isArray(item)?item:[item]).filter(item=>typeof item==='string').map(item=>item.trim().toLowerCase()).filter(item=>item.length>=4);if(exactValues.some(text=>array(segments).some(segment=>String(segment||'').toLowerCase().includes(text))))return true;
  return prefixEffectMatches(value,segments);
}
function npcOwnedEvidenceSegments(key='',segments=[],registry=CHARACTER_REGISTRY){
  const labels=[String(key||'').trim().toLowerCase(),String(registry?.[key]||'').trim().toLowerCase()].filter(label=>label.length>=2);
  return array(segments).filter(segment=>labels.some(label=>new RegExp(`(?:^|[\\s,;:])${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:은|는|이|가|께서|도|와|과|랑|이랑)(?=$|[\\s,;:])`,'u').test(String(segment||'').toLowerCase())));
}
function prefixEffectNpcAttributionMatches(value,segments=[],registry=CHARACTER_REGISTRY){
  const source=object(value),keys=[source.npc_key,source.key,source.source_npc_key,source.target_npc_key].map(item=>String(item||'').trim()).filter(Boolean);if(!keys.length)return true;
  return keys.every(key=>npcOwnedEvidenceSegments(key,segments,registry).length>0);
}
function consequenceNpcScheduleMatches(row,segments=[]){
  const source=object(row),visible=array(segments).join(' ').toLowerCase(),location=String(source.location||'').trim().toLowerCase(),activity=String(source.activity||'').trim().toLowerCase();
  const visiblyMatches=(value)=>{if(visible.includes(value))return true;const tokens=value.match(/[가-힣a-z0-9_]{2,}/gi)||[];return tokens.length>0&&tokens.every(token=>visible.includes(token));};
  if(!visible||!location||!activity||!visiblyMatches(location)||!visiblyMatches(activity))return false;
  return array(segments).some(segment=>/(?:오늘|내일|모레|다음\s*날|익일|\d{1,4}\s*년|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{3,4}[-/.]\d{1,2}[-/.]\d{1,2}|(?:\d+|한|두|세|네|다섯|여섯|일곱)\s*(?:분|시간|일|주)\s*(?:뒤|후)|(?:오전|오후|아침|새벽|저녁|밤)\s*\d{1,2}\s*(?:시|:\d{2})|정오|자정|나중|예정|계획|예약|하기로|기로\s*(?:했|한|한다)|(?:일정|회의|면담)(?:을|를)?\s*(?:잡|정하|정했|예약))/i.test(segment));
}
function prefixNpcScheduleMatches(row,segments=[],registry=CHARACTER_REGISTRY){
  const key=String(row?.npc_key||row?.key||'').trim(),attributed=npcOwnedEvidenceSegments(key,segments,registry);
  return Boolean(attributed.length&&consequenceNpcScheduleMatches(row,attributed));
}
function prefixNpcStateUpdate(row,segments=[]){
  const source=object(row),key=String(source.npc_key||source.key||'').trim();if(!key)return null;
  const supported=new Set(['location','status','long_term_goal','short_term_goal','obstacle','next_activity','next_location','last_seen']),kept={npc_key:key};
  for(const field of supported){const value=source[field];if(value==null||value===''||value===false)continue;if(prefixEffectMatches(value,segments))kept[field]=value;}
  const currentGoal=String(source.current_goal||'').trim(),goalReason=String(source.goal_reason||'').trim(),goalNextAction=String(source.goal_next_action||'').trim();
  if(source.goal_replace===true&&currentGoal&&goalReason&&prefixEffectMatches(currentGoal,segments)&&prefixEffectMatches(goalReason,segments)){kept.current_goal=source.current_goal;kept.goal_replace=true;kept.goal_reason=source.goal_reason;if(goalNextAction&&prefixEffectMatches(goalNextAction,segments))kept.goal_next_action=source.goal_next_action;}
  return Object.keys(kept).length>1?kept:null;
}
function consequenceNpcEffectsForShortening(turn,consequence,routedKeys=[],registry=CHARACTER_REGISTRY){
  const routed=new Set(array(routedKeys).map(value=>String(value||'').trim()).filter(value=>Object.prototype.hasOwnProperty.call(registry,value))),keys=new Set(routed),evidence=consequenceEvidenceSegments(turn,consequence);
  if(!evidence.tokens.length&&!evidence.matched.length){const delta=object(turn?.state_delta),hasUnpreservedEffect=Object.entries(delta).some(([field,value])=>{if(['advance_minutes','hooks_update'].includes(field))return false;if(Array.isArray(value))return value.length>0;if(typeof value==='number')return value!==0;return value!=null&&value!==''&&value!==false;});return{npc_keys:[...keys].slice(0,4),npc_state_updates:[],npc_schedule_updates:[],preserved_delta:{},attribution_safe:!hasUnpreservedEffect};}
  const updated=new Set([...array(turn?.state_delta?.npc_state_updates),...array(turn?.state_delta?.npc_schedule_updates)].map(row=>String(row?.npc_key||row?.key||'').trim()).filter(Boolean));
  for(const key of updated){
    if(!Object.prototype.hasOwnProperty.call(registry,key))continue;
    const labels=[key,String(registry[key]||'').trim().toLowerCase()].filter(value=>value.length>=2);
    if(evidence.matched.some(segment=>labels.some(label=>segment.includes(label))))keys.add(key);
  }
  const limitedKeys=new Set([...keys].slice(0,4)),effectSegments=new Map();
  for(const key of limitedKeys){
    const labels=[key,String(registry[key]||'').trim().toLowerCase()].filter(value=>value.length>=2),rows=evidence.matched.filter(segment=>labels.some(label=>segment.includes(label)));
    effectSegments.set(key,rows);
  }
  const stateFields=new Set(['location','status','current_goal','long_term_goal','short_term_goal','obstacle','next_activity','next_location','goal_reason','goal_next_action','last_seen']),preservedState=[];let stateAttributionSafe=true;
  for(const row of array(turn?.state_delta?.npc_state_updates)){
    const key=String(row?.npc_key||row?.key||'').trim(),segments=effectSegments.get(key)||[];if(!limitedKeys.has(key)||!segments.length)continue;
    const visible=segments.join(' '),kept={npc_key:key};
    for(const [field,value] of Object.entries(object(row))){if(['npc_key','key'].includes(field)||value==null||value===''||value===false||typeof value==='number'&&value===0||Array.isArray(value)&&value.length===0)continue;if(!stateFields.has(field)){stateAttributionSafe=false;continue;}const text=String(value).trim().toLowerCase();if(text.length>=2&&visible.includes(text))kept[field]=value;else stateAttributionSafe=false;}
    if(Object.keys(kept).length>1)preservedState.push(kept);
  }
  const delta=object(turn?.state_delta),preservedDelta={};
  const preservedSchedule=array(delta.npc_schedule_updates).filter(row=>{const key=String(row?.npc_key||row?.key||'').trim();return limitedKeys.has(key)&&consequenceNpcScheduleMatches(row,effectSegments.get(key)||[]);});
  const linkedRelationshipFields=['relationship_changes','relationship_milestones_add','intimacy_changes'];
  let linkedRelationshipCount=0,preservedLinkedRelationshipCount=0;
  for(const field of linkedRelationshipFields){
    const rows=array(delta[field]).filter(row=>limitedKeys.has(String(row?.npc_key||row?.key||'').trim()));
    linkedRelationshipCount+=rows.length;
    const kept=rows.filter(row=>consequenceEffectMatches(row,effectSegments.get(String(row?.npc_key||row?.key||'').trim())||[]));
    preservedLinkedRelationshipCount+=kept.length;if(kept.length)preservedDelta[field]=kept;
  }
  const linkedNpcRelationships=array(delta.npc_relationship_changes).filter(row=>limitedKeys.has(String(row?.source_npc_key||'').trim())||limitedKeys.has(String(row?.target_npc_key||'').trim()));
  linkedRelationshipCount+=linkedNpcRelationships.length;
  const keptNpcRelationships=linkedNpcRelationships.filter(row=>consequenceEffectMatches(row,evidence.matched));
  preservedLinkedRelationshipCount+=keptNpcRelationships.length;if(keptNpcRelationships.length)preservedDelta.npc_relationship_changes=keptNpcRelationships;
  const reservedFields=new Set([...linkedRelationshipFields,'npc_relationship_changes','npc_state_updates','npc_schedule_updates','hooks_update']),evidenceFields=Object.entries(delta).filter(([field,value])=>Array.isArray(value)&&!reservedFields.has(field)).map(([field])=>field);
  for(const field of evidenceFields){const kept=array(delta[field]).filter(row=>consequenceEffectMatches(row,evidence.matched));if(kept.length)preservedDelta[field]=kept;}
  const scalarCues={gold_delta:/(?:금화|골드|돈|상금|보상|지급|지불|상환|빚|채무|대금|비용|소지금)/,fatigue_delta:/(?:피로|지침|지쳤|회복|휴식|탈진|기력)/};
  let scalarAttributionSafe=true;
  for(const [field,cue] of Object.entries(scalarCues)){const value=Number(delta[field]||0);if(value===0)continue;if(evidence.matched.some(segment=>cue.test(segment)))preservedDelta[field]=value;else scalarAttributionSafe=false;}
  const preservedPcState={};let pcStateAttributionSafe=true;
  for(const field of ['new_location','pc_status']){const value=String(delta[field]||'').trim(),normalized=value.toLowerCase();if(!value)continue;if(normalized.length>=2&&evidence.matched.some(segment=>segment.includes(normalized)))preservedPcState[field]=value;else pcStateAttributionSafe=false;}
  const arrayAttributionSafe=evidenceFields.every(field=>array(delta[field]).length===array(preservedDelta[field]).length);
  const relevantNpcStateCount=array(delta.npc_state_updates).filter(row=>limitedKeys.has(String(row?.npc_key||row?.key||'').trim())).length,relevantNpcScheduleCount=array(delta.npc_schedule_updates).filter(row=>limitedKeys.has(String(row?.npc_key||row?.key||'').trim())).length;
  const npcAttributionSafe=stateAttributionSafe&&relevantNpcStateCount===preservedState.length&&relevantNpcScheduleCount===preservedSchedule.length,relationshipAttributionSafe=linkedRelationshipCount===preservedLinkedRelationshipCount,matchedSet=new Set(evidence.matched),visibleScene=array(turn?.scene).filter(item=>matchedSet.has(String(item?.text||'').trim().toLowerCase())).slice(0,4);
  return{npc_keys:[...limitedKeys],npc_state_updates:preservedState,npc_schedule_updates:preservedSchedule,preserved_delta:preservedDelta,new_location:preservedPcState.new_location||'',pc_status:preservedPcState.pc_status||'',attribution_safe:npcAttributionSafe&&relationshipAttributionSafe&&arrayAttributionSafe&&scalarAttributionSafe&&pcStateAttributionSafe,visible_scene:visibleScene.length?visibleScene:evidence.matched.slice(0,4).map(text=>({kind:'narration',text}))};
}
function consequenceNpcKeysForShortening(turn,consequence,routedKeys=[],registry=CHARACTER_REGISTRY){
  return consequenceNpcEffectsForShortening(turn,consequence,routedKeys,registry).npc_keys;
}
function scheduleBoundaryEffectTokens(value=''){
  const text=typeof value==='string'?value:Object.values(object(value)).flatMap(item=>Array.isArray(item)?item:[item]).filter(item=>['string','number'].includes(typeof item)).join(' '),generic=new Set(['event','class','academic','personal','scheduled','필수','일정','예정','기사과','마법과','신학부','연금술과','일반과','학부']);
  return[...new Set((String(text||'').toLowerCase().match(/[가-힣a-z0-9_]{2,}/g)||[]).map(token=>token.replace(/(?:에게서|에게|한테|께서|으로|에서|까지|부터|처럼|보다|에는|은|는|이|가|을|를|와|과|도|의)$/u,'')).filter(token=>token.length>=2&&!generic.has(token)))];
}
function reconcileReachedScheduleStart(turn,boundaryRows=[]){
  const delta=object(turn?.state_delta),rows=array(boundaryRows),boundaryIds=new Set(rows.map(row=>String(row?.id||'').trim().toLowerCase()).filter(Boolean));if(!turn?.state_delta||!boundaryIds.size)return false;
  const lifecycleCompleted=['active_events_remove','completed_events_add','scheduled_events_complete'].some(field=>array(delta[field]).some(value=>boundaryIds.has(String(value||'').trim().toLowerCase())));
  const progress=object(turn?.event_progress),eventId=String(progress.event_instance_id||progress.eventInstanceId||'').trim().toLowerCase(),terminal=new Set(['complete','completed','done','finished','end']);
  const completionSignals=[progress.active_beat,progress.activeBeat,progress.status,...array(progress.completed_beats||progress.completedBeats)].map(value=>String(value||'').trim().toLowerCase());
  const terminalProgress=boundaryIds.has(eventId)&&completionSignals.some(value=>terminal.has(value));
  if(terminalProgress)turn.event_progress=null;
  const rowTokens=new Set(rows.flatMap(row=>scheduleBoundaryEffectTokens([row?.title,row?.kind,row?.location].filter(Boolean).join(' ')))),segments=[turn?.scene_title,turn?.scene_summary,...array(turn?.scene).map(item=>item?.text)].filter(Boolean).flatMap(value=>String(value).split(/(?<=[.!?。！？])|\n+/)).map(value=>value.trim().toLowerCase()).filter(Boolean),completionCue=/(?:마쳤|끝냈|완료|종료|수료|보상|상금|지급|complete|finished|reward)/,hypotheticalCompletion=/(?:예정|계획|하려|할\s*(?:예정|계획)|아직|않았|못했|미완료|어제|지난|예전에|과거|앞서|이전에|[?？])/,terminalSegments=segments.filter(segment=>completionCue.test(segment)&&!hypotheticalCompletion.test(segment)),matchedSegments=terminalSegments.filter(segment=>rowTokens.size===0||[...rowTokens].some(token=>segment.includes(token))),completionSegments=matchedSegments.length?matchedSegments:terminalProgress?terminalSegments:[],cueTokens=new Set(['보상','상금','수료','지급','완료','종료','내용','지식','호감','신뢰']),categoryTokens=new Set(['수업','강의','세미나','실습','오리엔테이션','교육','입학식','훈련','연습','수련','단련','면담','상담','회의','대화','식사','수면','휴식']);
  const prematureCompletion=lifecycleCompleted||terminalProgress||matchedSegments.length>0;if(!prematureCompletion)return false;
  for(const field of ['active_events_remove','completed_events_add','scheduled_events_remove','scheduled_events_complete'])delta[field]=array(delta[field]).filter(value=>!boundaryIds.has(String(value||'').trim().toLowerCase()));
  delta.active_events_add=array(delta.active_events_add).filter(value=>!boundaryIds.has(String(value||'').trim().toLowerCase()));
  const boundaryOwned=(value)=>{const src=object(value),directId=String(src.id||src.event_id||src.event_instance_id||'').trim().toLowerCase(),tokens=scheduleBoundaryEffectTokens(value),text=typeof value==='string'?value:Object.values(src).filter(item=>['string','number'].includes(typeof item)).join(' '),overlap=tokens.filter(token=>rowTokens.has(token));if(directId&&boundaryIds.has(directId))return true;if(overlap.length>=2)return true;if(rowTokens.size===0&&consequenceEffectMatches(value,completionSegments))return true;if(overlap.length===1&&categoryTokens.has(overlap[0])&&tokens.some(token=>cueTokens.has(token))&&completionSegments.some(segment=>segment.includes(overlap[0])))return true;return tokens.some(token=>['보상','상금','지급'].includes(token)&&completionSegments.some(segment=>segment.includes(token)))||(String(text||'').trim().length>=4&&completionSegments.some(segment=>segment.includes(String(text).trim().toLowerCase())));};
  const lifecycleFields=new Set(['active_events_remove','completed_events_add','scheduled_events_remove','scheduled_events_complete']);
  for(const [field,value] of Object.entries(delta)){if(!Array.isArray(value)||lifecycleFields.has(field))continue;delta[field]=value.filter(row=>!boundaryOwned(row));}
  if(delta.new_location&&boundaryOwned(delta.new_location))delta.new_location=null;
  if(delta.pc_status&&boundaryOwned(delta.pc_status))delta.pc_status=null;
  if(Number(delta.gold_delta||0)!==0&&completionSegments.some(segment=>/(?:보상|상금|지급|금화|골드)/.test(segment)))delta.gold_delta=0;
  if(Number(delta.fatigue_delta||0)!==0&&completionSegments.some(segment=>/(?:피로|지쳤|지침|탈진|기력|힘이\s*빠)/.test(segment)))delta.fatigue_delta=0;
  return true;
}
function reconcileReturnedScheduleBoundary(turn,boundaryRows=[],elapsed=0){
  if(!turn||typeof turn!=='object')return false;
  const rows=array(boundaryRows),source=array(turn.scene);if(!rows.length||!source.length)return false;
  const kept=[];let foundBoundary=false,postBoundary=false;
  for(let rowIndex=0;rowIndex<source.length;rowIndex+=1){
    const item=source[rowIndex],segments=String(item?.text||'').split(/(?<=[.!?。！？])|\n+/).map(value=>value.trim()).filter(Boolean);
    if(foundBoundary){if(segments.length)postBoundary=true;continue;}
    const keptSegments=[];
    for(let segmentIndex=0;segmentIndex<segments.length;segmentIndex+=1){
      const segment=segments[segmentIndex];keptSegments.push(segment);
      const boundaryTurn={scene_title:turn.scene_title,scene:[...kept,{...object(item),text:segment}],choices:[]};
      if(rows.some(row=>scheduleBoundaryOccurred(boundaryTurn,row))){foundBoundary=true;if(segmentIndex<segments.length-1||rowIndex<source.length-1)postBoundary=true;break;}
    }
    if(keptSegments.length)kept.push({...object(item),text:keptSegments.join(' ')});
  }
  if(!foundBoundary||!postBoundary)return false;
  const minutes=Math.max(0,Math.trunc(Number(elapsed)||0)),title=String(rows[0]?.title||'예정된 일정').trim()||'예정된 일정';
  turn.scene_title=`${title} 시작`;turn.scene_summary=`${minutes}분 뒤 ${title} 시작 시점에 도달했다.`;turn.scene=kept;turn.choices=[];turn.emotion_updates=[];turn.director=null;
  return true;
}
function prefixEffectsFromSegments(turn,prefixSegments=[],{travelPrefix=false,travelDestination='',completedPrefixActionTypes=[],completedPrefixClauseIndexes=[],structuredExecution=false}={}){
  const segments=array(prefixSegments).map(value=>String(value||'').trim().toLowerCase()).filter(Boolean),empty={preserved_delta:{},npc_state_updates:[],npc_schedule_updates:[],new_location:'',pc_status:'',completed_prefix_action_types:completedPrefixActionTypes,completed_prefix_clause_indexes:completedPrefixClauseIndexes,structured_execution:structuredExecution};if(!segments.length)return empty;
  const delta=object(turn?.state_delta),blockedArrays=new Set(['active_events_add','active_events_remove','completed_events_add','scheduled_events_remove','scheduled_events_complete','npc_schedule_updates']),preservedDelta={};
  for(const [field,value] of Object.entries(delta)){if(!Array.isArray(value)||blockedArrays.has(field)||field==='npc_state_updates')continue;const kept=value.filter(row=>prefixEffectNpcAttributionMatches(row,segments)&&prefixEffectMatchesCompletedClauses(row,segments,completedPrefixActionTypes));if(kept.length)preservedDelta[field]=kept;}
  const npcStateUpdates=array(delta.npc_state_updates).map(row=>prefixNpcStateUpdate(row,segments)).filter(Boolean),npcScheduleUpdates=array(delta.npc_schedule_updates).filter(row=>prefixNpcScheduleMatches(row,segments)),verifiedTravelLocation=travelPrefix&&travelDestination&&travelDestinationReachedForReconciliation(delta.new_location,travelDestination),newLocation=travelPrefix&&(verifiedTravelLocation||prefixEffectMatches(delta.new_location,segments))?String(delta.new_location||'').trim():'',pcStatus=prefixEffectMatches(delta.pc_status,segments)?String(delta.pc_status||'').trim():'';
  return{preserved_delta:preservedDelta,npc_state_updates:npcStateUpdates,npc_schedule_updates:npcScheduleUpdates,new_location:newLocation,pc_status:pcStatus,completed_prefix_action_types:completedPrefixActionTypes,completed_prefix_clause_indexes:completedPrefixClauseIndexes,structured_execution:structuredExecution};
}
function structuredPrefixEffectsForShortening(turn,plan={},applied=0,executionAuthority=null){
  if(!plan?.eligible||!Array.isArray(plan.clauses)||plan.clauses.length<1)return null;
  if(executionAuthority?.applicable&&executionAuthority?.reason!=='missing-contract')return projectStructuredOwnedEffects(turn,executionAuthority,applied);
  const elapsed=Math.max(0,Number(applied)||0),requireUpperCompletion=turn?._boundary_evidence_unordered===true,allowUnderreportedCompletion=turn?._decision_evidence_ordered===true,prefix=array(plan.clauses).slice(0,-1).filter(clause=>{const startMin=Number(clause?.start_min_minutes),rawStartMax=clause?.start_max_minutes,rawCompleteMax=clause?.complete_max_minutes,startMax=rawStartMax==null?null:Number(rawStartMax),completeMin=Number(clause?.complete_min_minutes),completeMax=rawCompleteMax==null?null:Number(rawCompleteMax),positiveMinimum=Number.isFinite(startMin)&&Number.isFinite(completeMin)&&completeMin>startMin,positiveMaximum=Number.isFinite(startMax)&&Number.isFinite(completeMax)&&completeMax>startMax,exactCompletion=Number.isFinite(completeMin)&&Number.isFinite(completeMax)&&completeMin===completeMax;if(!positiveMinimum&&!positiveMaximum)return false;return requireUpperCompletion?positiveMaximum&&completeMax<=elapsed:allowUnderreportedCompletion&&exactCompletion||Number.isFinite(completeMin)&&completeMin<=elapsed;});
  if(!prefix.length)return prefixEffectsFromSegments(turn,[],{structuredExecution:true});
  const actorName=String(plan.actor_name||'').trim().toLowerCase(),escapedActor=actorName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),explicitPcDialogue=new RegExp(`^\\s*(?:${escapedActor?`${escapedActor}(?=\\s*(?:[,;:]|(?:이|가|은|는|도|께서)(?:\\s|[,;:])))|`:''}너(?:가|는|도)|네가|넌|당신(?:이|은|도)|그대(?:가|는|도))`,'u');
  const segments=[turn?.scene_title,turn?.scene_summary,...array(turn?.scene).filter(item=>String(item?.kind||'')!=='dialogue'||explicitPcDialogue.test(String(item?.text||'').toLowerCase())).map(item=>item?.text)].filter(Boolean).flatMap(value=>String(value).toLowerCase().split(/(?<=[.!?。！？])|\n+/)).map(value=>value.trim()).filter(Boolean),conditionalCompletion=/(?:끝났(?:다면|으면)|(?:완료|종료)되(?:면|었으면|었다면|기\s*(?:전|전에|까지)|어야(?:만)?|ㄹ))/,hypothetical=/(?:예정|계획|하려|할\s*(?:예정|계획)|아직|미완료|[?？])/;
  const durationNumber=String.raw`(?:\d+(?:\.\d+)?|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)`,actionCue={training:/(?:훈련|연습|수련|단련)/,'class-attendance':/(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)/,meal:/(?:식사|아침|점심|저녁|밥|만찬)/,dialogue:/(?:대화|이야기|상담|논의|면담|회의|브리핑|협상)/,sleep:/(?:잠|수면|숙면)/,rest:/(?:휴식|쉬었|쉼)/,wait:/(?:기다림|대기|기다렸)/,travel:/(?:이동|도착|나가|들어가|향했|다다랐|닿았)/},modifier=String.raw`(?:(?:모두|전부|완전히|남김없이)\s*)?`,boundaryDone=turn?._boundary_evidence_clipped===true?String.raw`|마치자|끝내자|완료하자|마무리하자`:'',done=String.raw`(?:마쳤|마치고|끝냈|끝내고|완료했|완료하고|마무리했|마무리하고${boundaryDone})`,ended=String.raw`(?:끝났|(?:종료|완료)(?:되었|됐다|되었다|됐|되어(?!야))(?=$|[\s,.;!?。！？]|고|으며|지만|는데))`,completionByKind={training:new RegExp(`(?:훈련|연습|수련|단련)(?:(?:을|를|도)\\s*${modifier}${done}|(?:이|가)\\s*${modifier}${ended})`),'class-attendance':new RegExp(`(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)(?:(?:을|를|도)\\s*${modifier}(?:${done}|수료했)|(?:이|가)\\s*${modifier}${ended})`),meal:new RegExp(`(?:식사|아침|점심|저녁|밥|만찬)(?:(?:을|를|도)\\s*${modifier}(?:마쳤|마치고|끝냈|다\\s*먹었|비웠|해치웠)|(?:이|가)\\s*${modifier}(?:끝났|완료됐))`),dialogue:new RegExp(`(?:대화|이야기|상담|논의|면담|회의|브리핑|협상)(?:(?:을|를|도)\\s*${modifier}${done}|(?:이|가)\\s*${modifier}${ended})`),sleep:new RegExp(`(?:잠|수면|숙면)(?:(?:을|를|도)\\s*${modifier}(?:마쳤|완료했)|(?:이|가)\\s*${modifier}(?:끝났|완료됐))|잠에서\\s*깨어|눈을\\s*떴|푹\\s*잤`),rest:new RegExp(`(?:휴식|쉬기)(?:(?:을|를|도)\\s*${modifier}(?:마쳤|완료했)|(?:이|가)\\s*${modifier}(?:끝났|완료됐))|충분히\\s*쉬었`),wait:new RegExp(`(?:기다림|대기)(?:(?:을|를|도)\\s*${modifier}(?:마쳤|완료했)|(?:이|가)\\s*${modifier}(?:끝났|완료됐))|${durationNumber}\\s*(?:분|시간)(?:을|를)?\\s*(?:기다렸|대기했)`),travel:new RegExp(`(?:이동|여정)(?:(?:을|를|도)\\s*${modifier}(?:마쳤|완료했)|(?:이|가)\\s*${modifier}(?:끝났|완료됐))|(?:도착했|다다랐|닿았|나왔|들어왔)`)},startByKind={training:/(?:훈련|연습|수련|단련)(?:을|를|에)?\s*(?:시작했|시작하고|돌입했|돌입하고|들어갔|들어가)/,'class-attendance':/(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)(?:을|를|에)?\s*(?:시작했|시작하고|참석했|참석하고|들어갔|들어가)/,meal:/(?:식사|아침|점심|저녁|밥|만찬)(?:을|를)?\s*(?:시작했|시작하고|먹기\s*시작)/,dialogue:/(?:대화|이야기|상담|논의|면담|회의|브리핑|협상)(?:을|를)?\s*(?:시작했|시작하고|들어갔|들어가)/,sleep:/(?:잠|수면|숙면)(?:을|를|에)?\s*(?:청했|청하고|시작했|시작하고|들었|들고)|잠들(?:었|고)/,rest:/(?:휴식|쉬기)(?:을|를)?\s*(?:시작했|시작하고)/,wait:/(?:기다림|대기)(?:을|를)?\s*(?:시작했|시작하고)|기다리기\s*시작/,travel:/(?:이동|여정)(?:을|를)?\s*(?:시작했|시작하고)|(?:출발했|출발하고|향했|향하고)/};
  const matchedTypes=[],matchedIndexes=[],matchedSegments=[],planClauses=array(plan.clauses);
  const visibleDurationMinutes=(value='')=>{const match=String(value).match(new RegExp(`(${durationNumber})\\s*(분|시간)`)),native={한:1,두:2,세:3,네:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10};if(!match)return null;const amount=Number(match[1])||native[match[1]]||0;return amount*(match[2]==='시간'?60:1);};
  const completionRetracted=(fragment,matchEnd,cue)=>{const tail=String(fragment).slice(matchEnd);return/(?:하지만|그러나|실제로|정작|으나|지만)/.test(tail)&&/(?:못|않)/.test(tail)&&(cue.test(tail)||/(?:실제로|정작)[^.!?。！？]{0,16}(?:못|않)/.test(tail));};
  for(const clause of prefix){const kind=String(clause?.action_type||''),cue=actionCue[kind],completion=completionByKind[kind],planPosition=planClauses.findIndex(row=>Number(row?.index)===Number(clause?.index));if(!cue||!completion||planClauses.filter(row=>String(row?.action_type||'')===kind).length>1)continue;const destination=String(clause?.destination||'').trim().toLowerCase(),laterTransitions=planClauses.slice(planPosition+1).flatMap(row=>{const laterKind=String(row?.action_type||''),laterCue=actionCue[laterKind],genericCompletion=laterCue?new RegExp(`${laterCue.source}(?:을|를|도|까지|마저|이|가)?\\s*${modifier}(?:${done}|${ended}|수료했|먹었|잤)`):null;return[completionByKind[laterKind],startByKind[laterKind],genericCompletion].filter(Boolean);}),rows=[];for(const segment of segments){const actionAt=segment.search(cue);if(actionAt<0)continue;let boundary=segment.length;for(const laterTransition of laterTransitions){const relative=segment.slice(actionAt+1).search(laterTransition);if(relative>=0)boundary=Math.min(boundary,actionAt+1+relative);}const fragment=segment.slice(0,boundary).trim(),completionMatch=completion.exec(fragment);if(!fragment||hypothetical.test(fragment)||conditionalCompletion.test(fragment)||!completionMatch||completionRetracted(fragment,completionMatch.index+completionMatch[0].length,cue)||!completionSegmentAttributedToPc(fragment,actionAt,kind,String(plan.actor_name||''))||(kind==='travel'&&destination&&!travelDestinationReachedForReconciliation(fragment,destination)))continue;if(kind==='wait'&&/(?:기다렸|대기했)/.test(completionMatch[0])){const visible=visibleDurationMinutes(completionMatch[0]),minimum=Number(clause.complete_min_minutes)-Number(clause.start_min_minutes),rawCompleteMax=clause.complete_max_minutes,rawStartMax=clause.start_max_minutes,maximum=rawCompleteMax==null||rawStartMax==null?null:Number(rawCompleteMax)-Number(rawStartMax);if(!Number.isFinite(visible)||visible<minimum||Number.isFinite(maximum)&&visible>maximum)continue;}rows.push(fragment);}if(!rows.length)continue;matchedTypes.push(kind);matchedIndexes.push(Number(clause.index));matchedSegments.push(...rows);}
  const uniqueSegments=[...new Set(matchedSegments)],completedTravel=prefix.findLast(clause=>matchedIndexes.includes(Number(clause?.index))&&String(clause?.action_type||'')==='travel'),travelDestination=String(completedTravel?.destination||'').trim().toLowerCase(),travelPrefix=Boolean(completedTravel);
  return prefixEffectsFromSegments(turn,uniqueSegments,{travelPrefix,travelDestination,completedPrefixActionTypes:[...new Set(matchedTypes)],completedPrefixClauseIndexes:matchedIndexes,structuredExecution:true});
}
function structuredDecisionBoundaryMinutes(turn,plan={},current=0,hasMeaningfulStop=false,terminalCompletion=false,executionAuthority=null){
  if(!hasMeaningfulStop||terminalCompletion||!plan?.eligible||!Array.isArray(plan.clauses)||plan.clauses.length<1)return null;
  if(executionAuthority?.applicable&&executionAuthority?.reason!=='missing-contract')return executionAuthority.valid&&executionAuthority.boundary_kind==='choice'?executionAuthority.boundary_minutes:Math.max(0,Number(current)||0);
  if(plan.clauses.length<2)return null;
  const effects=structuredPrefixEffectsForShortening(turn,plan,current,executionAuthority);if(!effects)return null;const matched=new Set(array(effects.completed_prefix_clause_indexes).map(Number)),prefix=array(plan.clauses).slice(0,-1);let completed=null;
  for(const clause of prefix){if(!matched.has(Number(clause?.index)))break;completed=clause;}
  const clauses=array(plan.clauses),completedPosition=completed?clauses.findIndex(clause=>Number(clause?.index)===Number(completed?.index)):-1,next=clauses[completedPosition+1],elapsed=Math.max(0,Number(current)||0),nextLatest=Number(next?.complete_max_minutes),prompt=String(turn?._choice_prompt_text||''),terminalChoiceCue={sleep:/(?:눈을\s*뜬|깨어|일어났|잠에서|수면\s*(?:후|뒤|끝))/u,rest:/(?:휴식|쉬기)\s*(?:후|뒤|끝)|충분히\s*쉰/u,training:/(?:훈련|연습|수련|단련)\s*(?:후|뒤|끝)|(?:훈련|연습|수련|단련)(?:을|를)?\s*(?:마친|끝낸|완료한)/u,'class-attendance':/(?:수업|강의|세미나|실습|교육)\s*(?:후|뒤|끝)|(?:수업|강의|세미나|실습|교육)(?:을|를)?\s*(?:마친|끝낸|수료한)/u,meal:/(?:식사|아침|점심|저녁|밥)\s*(?:후|뒤|끝)|(?:식사|밥)(?:을|를)?\s*(?:마친|끝낸|다\s*먹은)/u,dialogue:/(?:대화|이야기|상담|논의|면담|회의)\s*(?:후|뒤|끝)|(?:대화|이야기|상담|논의|면담|회의)(?:을|를)?\s*(?:마친|끝낸)/u,wait:/(?:기다림|대기)\s*(?:후|뒤|끝)|(?:기다림|대기)(?:을|를)?\s*(?:마친|끝낸)/u,travel:/(?:도착한|도착했|다다른|닿은|이동\s*(?:후|뒤|끝))/u}[String(next?.action_type||'')],terminalMaximumGrounded=Boolean(terminalChoiceCue?.test(prompt));
  if(completed){const latest=Number(completed.complete_max_minutes),earliest=Number(completed.complete_min_minutes);if(Number.isFinite(earliest)&&elapsed<earliest){if(plan?.exact_timeline!==false&&Number.isFinite(latest)&&latest===earliest)return latest;return null;}}
  if(next&&Number.isFinite(nextLatest)&&(elapsed<nextLatest||elapsed===nextLatest&&terminalMaximumGrounded))return elapsed;
  if(!completed||plan?.exact_timeline===false)return elapsed;
  const latest=Number(completed.complete_max_minutes),earliest=Number(completed.complete_min_minutes);if(!Number.isFinite(latest)||!Number.isFinite(earliest)||elapsed<earliest)return null;
  return latest;
}
function choicePromptScore(text='',choices=[]){
  const lexemes=(value)=>String(value||'').toLowerCase().match(/[가-힣a-z0-9_]{1,24}/g)||[],prompt=lexemes(text),options=array(choices).flatMap(lexemes);let score=0;
  for(const left of prompt)for(const right of options){if(left.length>=2&&right.length>=2&&(left.includes(right)||right.includes(left)))score+=4;else{let common=0;while(common<left.length&&common<right.length&&left[common]===right[common])common+=1;if(common>=2)score+=2;else if(common===1&&left.length>=2&&right.length>=2)score+=1;}}
  return score;
}
function turnBeforePlayerChoice(turn,executionAuthority=null){
  if(executionAuthority?.valid){
    const scene=array(turn?.scene),decisionIndex=Number(executionAuthority.decision_scene_index),item=object(scene[decisionIndex]),prompt=String(item.text||'').trim();
    return{...turn,scene_title:'',scene_summary:'',scene:scene.slice(0,decisionIndex),choices:[],_choice_prompt_text:prompt,_decision_evidence_ordered:true,_structured_choice_authority:true};
  }
  const scene=array(turn?.scene),choices=array(turn?.choices),candidates=scene.map((item,index)=>({index,question:/[?？]/.test(String(item?.text||'')),dialogue:String(item?.kind||'')==='dialogue',score:choicePromptScore(item?.text,choices)})).filter(row=>row.question||row.dialogue),scored=[...candidates].sort((left,right)=>right.score-left.score||right.index-left.index),questionIndexes=candidates.filter(row=>row.question).map(row=>row.index),dialogueIndexes=candidates.filter(row=>row.dialogue).map(row=>row.index),decisionIndex=scored[0]?.score>0?scored[0].index:questionIndexes.at(-1)??dialogueIndexes.at(-1)??scene.length;
  const item=object(scene[decisionIndex]),source=String(item.text||''),parts=[...source.matchAll(/[^.!?。！？\n]+[.!?。！？]?/gu)].map(match=>({text:String(match[0]||'').trim(),index:match.index??0,question:/[?？]/.test(match[0]),score:choicePromptScore(match[0],choices)})).filter(row=>row.text),questionParts=parts.filter(row=>row.question),promptPart=[...(questionParts.length?questionParts:parts)].sort((left,right)=>right.score-left.score||right.index-left.index)[0]||null,promptSource=String(promptPart?.text||source),clauseBreaks=[...promptSource.matchAll(/[,;:]\s*/gu)],clauseOffset=clauseBreaks.at(-1)?(clauseBreaks.at(-1).index??0)+clauseBreaks.at(-1)[0].length:0,promptIndex=(promptPart?.index??0)+clauseOffset,prefix=promptPart?source.slice(0,promptIndex).trim():'',prompt=promptSource.slice(clauseOffset).trim(),evidenceScene=[...scene.slice(0,decisionIndex),...(prefix?[{...item,text:prefix}]:[])];
  return{...turn,scene_title:'',scene_summary:'',scene:evidenceScene,choices:[],_choice_prompt_text:String(prompt||source),_decision_evidence_ordered:true};
}
function directorStateVisibleBeforeDecision(turn,director={}){
  const segments=array(turn?.scene).map(item=>String(item?.text||'').trim().toLowerCase()).filter(Boolean),source=object(director),candidates=[source.reason,source.callback_note,source.beat].map(value=>String(value||'').trim().toLowerCase()).filter(value=>value.length>=4);
  return candidates.some(value=>prefixEffectMatches(value,segments));
}
function turnBeforeVisibleBoundary(turn,locateBoundary){
  const kept=[];
  for(const item of array(turn?.scene)){
    const segments=String(item?.text||'').split(/(?<=[.!?。！？])|\n+/).map(value=>value.trim()).filter(Boolean),before=[];
    for(const segment of segments){const boundaryAt=Number(locateBoundary(segment));if(Number.isInteger(boundaryAt)&&boundaryAt>=0){const prefix=segment.slice(0,boundaryAt).trim(),itemText=[...before,...(prefix?[prefix]:[])].join(' ');return{...turn,scene_title:'',scene_summary:'',scene:[...kept,...(itemText?[{...object(item),text:itemText}]:[])],choices:[],_boundary_evidence_unordered:false,_boundary_evidence_clipped:boundaryAt>0};}before.push(segment);}
    if(before.length)kept.push({...object(item),text:before.join(' ')});
  }
  return{...turn,scene_title:'',scene_summary:'',scene:array(turn?.scene),choices:[],_boundary_evidence_unordered:true};
}
function turnBeforeScheduleBoundary(turn,boundaryRows=[]){
  const rows=array(boundaryRows);return turnBeforeVisibleBoundary(turn,segment=>{const matched=rows.filter(row=>scheduleBoundaryOccurred({scene:[{kind:'narration',text:segment}]},row));if(!matched.length)return-1;const text=String(segment||'').toLowerCase(),indexes=matched.map(row=>String(row?.title||'').trim().toLowerCase()).filter(Boolean).map(title=>text.indexOf(title)).filter(index=>index>=0);return indexes.length?Math.min(...indexes):0;});
}
function turnBeforeConsequenceBoundary(turn,visibleScene=[]){
  const targets=array(visibleScene).flatMap(item=>String(item?.text||'').toLowerCase().split(/(?<=[.!?。！？])|\n+/)).map(value=>value.trim()).filter(value=>value.length>=2);
  return turnBeforeVisibleBoundary(turn,segment=>{const text=String(segment||'').trim().toLowerCase(),indexes=targets.map(target=>text.indexOf(target)).filter(index=>index>=0);if(indexes.length)return Math.min(...indexes);return targets.some(target=>target.includes(text))?0:-1;});
}
function precedingActivityEffectsForShortening(turn,action,intent={},applied=0){
  const completedAt=Math.max(0,Number(array(intent?.precedingActivityRangeMinutes)[0]??intent?.precedingActivityMinutes??0));if(completedAt<=0||Number(applied)<completedAt)return{preserved_delta:{},npc_state_updates:[],new_location:'',pc_status:''};
  const raw=String(action||'').toLowerCase(),terminalTokens={downtime:['잠','수면','휴식','쉬'],wait:['기다','대기'],meal:['식사','아침','점심','저녁','밥'],training:['훈련','연습','수련','단련'], 'class-attendance':['수업','강의','세미나','실습','오리엔테이션','교육','입학식'],dialogue:['대화','이야기','질문','답변','설명','상담','논의','면담','회의','브리핑'],travel:['간다','이동한다','향한다','가본다']}[String(intent?.kind||'')]||[],terminalIndex=terminalTokens.reduce((latest,token)=>Math.max(latest,raw.lastIndexOf(token)),-1),prefixText=terminalIndex>0?raw.slice(0,terminalIndex):'';
  const cueGroups=[['훈련','연습','수련','단련'],['수업','강의','세미나','실습','오리엔테이션','교육','입학식'],['식사','아침','점심','저녁','밥'],['대화','이야기','질문','답변','설명','상담','논의','면담','회의','브리핑'],['잠','수면','휴식','쉬'],['기다','대기'],['이동','도착','나가','들어가','가서','와서']],prefixTokens=[...new Set(cueGroups.filter(group=>group.some(token=>prefixText.includes(token))).flat())];if(!prefixTokens.length)return{preserved_delta:{},npc_state_updates:[],new_location:'',pc_status:''};
  const hypothetical=/(?:예정|계획|하려|할\s*(?:예정|계획)|아직|않았|못했|미완료|[?？])/,segments=[turn?.scene_title,turn?.scene_summary,...array(turn?.scene).map(item=>item?.text)].filter(Boolean).flatMap(value=>String(value).toLowerCase().split(/(?<=[.!?。！？])|\n+/)).map(value=>value.trim()).filter(Boolean),prefixSegments=[];
  for(const segment of segments){const prefixIndex=prefixTokens.reduce((first,token)=>{const at=segment.indexOf(token);return at>=0&&(first<0||at<first)?at:first;},-1);if(prefixIndex<0||hypothetical.test(segment))continue;const terminalAfter=terminalTokens.reduce((first,token)=>{const at=segment.indexOf(token,prefixIndex+1);return at>=0&&(first<0||at<first)?at:first;},-1),fragment=(terminalAfter>prefixIndex?segment.slice(0,terminalAfter):segment).trim();if(fragment.length>=2)prefixSegments.push(fragment);}
  if(!prefixSegments.length)return{preserved_delta:{},npc_state_updates:[],new_location:'',pc_status:''};
  const travelPrefix=prefixTokens.some(token=>['이동','도착','나가','들어가','가서','와서'].includes(token));
  return prefixEffectsFromSegments(turn,prefixSegments,{travelPrefix});
}
function mergePreservedDeltas(...sources){
  const merged={};for(const source of sources)for(const [field,value] of Object.entries(object(source))){if(Array.isArray(value)){const seen=new Set(array(merged[field]).map(row=>JSON.stringify(row)));merged[field]=[...array(merged[field])];for(const row of value){const key=JSON.stringify(row);if(!seen.has(key)){seen.add(key);merged[field].push(row);}}}else merged[field]=value;}return merged;
}
function mergePreservedRows(...sources){const rows=[],seen=new Set();for(const source of sources)for(const row of array(source)){const key=JSON.stringify(row);if(!seen.has(key)){seen.add(key);rows.push(row);}}return rows;}
function reconcileShortenedTimedTurn(turn,{preserveConsequenceId='',preserveNpcStateUpdates=[],preserveNpcScheduleUpdates=[],preserveDelta={},preserveIntermediateLocation='',preservePcStatus=''}={}){
  const delta=object(turn?.state_delta);if(!turn?.state_delta)return;
  const consequenceId=String(preserveConsequenceId||'').trim();
  const hooksUpdate=consequenceId?array(delta.hooks_update).filter(row=>String(row?.id||'').trim()===consequenceId):[],frozen={},attributed={};
  for(const [field,value] of Object.entries(delta))frozen[field]=Array.isArray(value)?[]:typeof value==='number'?0:null;
  for(const [field,value] of Object.entries(object(preserveDelta))){if(Array.isArray(delta[field])&&Array.isArray(value)&&!['npc_state_updates','npc_schedule_updates','hooks_update'].includes(field))attributed[field]=value;else if(['fatigue_delta','gold_delta'].includes(field)&&Number.isFinite(Number(value)))attributed[field]=Number(value);}
  const attributedHookUpdates=array(preserveDelta?.hooks_update);
  turn.state_delta={...frozen,...attributed,advance_minutes:0,new_location:String(preserveIntermediateLocation||'').trim()||null,pc_status:String(preservePcStatus||'').trim()||null,fatigue_delta:Number(attributed.fatigue_delta||0),gold_delta:Number(attributed.gold_delta||0),npc_state_updates:array(preserveNpcStateUpdates),npc_schedule_updates:array(preserveNpcScheduleUpdates),hooks_update:mergePreservedRows(attributedHookUpdates,hooksUpdate)};
  turn.event_progress=null;
}
function reconcileExplicitZeroTurn(turn){
  const delta=object(turn?.state_delta);if(!turn?.state_delta)return;
  const frozen={};
  for(const [field,value] of Object.entries(delta))frozen[field]=Array.isArray(value)?[]:typeof value==='number'?0:null;
  turn.state_delta={...frozen,advance_minutes:0,new_location:null,pc_status:null,fatigue_delta:0,gold_delta:0};
  delete turn.event_progress;
}
function completionSegmentAttributedToPc(segment='',matchIndex=0,kind='',actorName=''){
  const allowedSubjects=new Set(['나','내','저','제','우리','저희',String(actorName||'').trim().toLowerCase()].filter(Boolean));
  const activitySubjects={downtime:new Set(['잠','수면','휴식']),sleep:new Set(['잠','수면','숙면']),rest:new Set(['휴식','쉬기']),wait:new Set(['기다림','대기']),meal:new Set(['식사','밥','아침','점심','저녁']),training:new Set(['훈련','연습','수련','단련']),'class-attendance':new Set(['수업','강의','세미나','실습','오리엔테이션','교육','입학식']),dialogue:new Set(['대화','이야기','질문','답변','설명','상담','논의','면담','회의','브리핑'])}[kind]||new Set();
  let prefix=String(segment||'').slice(0,Math.max(0,Number(matchIndex)||0)).toLowerCase();
  const clauseBreaks=[...prefix.matchAll(/(?:해서|하여|하니|라서|어서|아서|기에|때문에|지만|는데|더니|고서)\s+/gu)],lastBreak=clauseBreaks.at(-1);if(lastBreak)prefix=prefix.slice((lastBreak.index||0)+lastBreak[0].length);
  const attributions=[...prefix.matchAll(/(?:^|[\s,;:])([^\s,;:]{1,32}?)(가|이|은|는|께서|도)(?=\s|[,;:])(?:\s*[,;:]\s*|\s+)/gu)].map(match=>({index:match.index??-1,owner:String(match[1]||'').trim().toLowerCase(),possessive:false,particle:String(match[2]||'')})).filter(row=>row.particle!=='도'||!isAdditiveAdverbialStem(row.owner));
  const temporalPossessives=new Set(['분','시간','기간','날','하루','이틀','사흘','나흘','주','달','개월','해','년']);
  for(const match of prefix.matchAll(/(?:^|[\s,;:])([^\s,;:]{1,32}?)의(?=\s|[,;:])/gu)){const owner=String(match[1]||'').trim().toLowerCase();if(!temporalPossessives.has(owner))attributions.push({index:match.index??-1,owner,possessive:true});}
  const attribution=attributions.sort((a,b)=>a.index-b.index).at(-1);if(!attribution)return true;
  return allowedSubjects.has(attribution.owner)||!attribution.possessive&&activitySubjects.has(attribution.owner);
}
function timedActionCompletionEvidence(turn,intent={},action='',actorName=''){
  const segments=[turn?.scene_title,turn?.scene_summary,...array(turn?.scene).filter(item=>String(item?.kind||'')!=='dialogue').map(item=>item?.text)].filter(Boolean).flatMap(value=>String(value).split(/(?<=[.!?。！？])|\n+/)).map(value=>value.trim()).filter(Boolean),kind=String(intent?.completionActionType||intent?.kind||'');if(!segments.length)return false;
  const patterns={
    downtime:/(?:잠에서\s*깨어|눈을\s*떴|잠을\s*(?:푹\s*)?잤|수면을\s*마쳤|휴식을\s*마쳤|충분히\s*쉬었)/,
    sleep:/(?:잠에서\s*깨어|눈을\s*떴|잠을\s*(?:푹\s*)?잤|수면을\s*마쳤)/,
    rest:/(?:휴식을\s*마쳤|충분히\s*쉬었)/,
    wait:/(?:기다림을\s*마쳤|대기를\s*마쳤|요청한\s*시간이\s*(?:흘렀|지났)(?!다고|다는|는지|을지|을까)|(?<waitAmount>\d+(?:\.\d+)?|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?<waitUnit>분|시간)(?:이|가)?\s*(?:흘렀|지났)(?!다고|다는|는지|을지|을까)|시간을\s*보낸\s*뒤)/,
    meal:/(?:식사를\s*(?:마쳤|끝냈)|밥을\s*다\s*먹었|식사\s*후)/,
    training:/(?:훈련|연습|수련|단련)(?:을|를)?\s*(?:마쳤|끝냈|완료했|마무리했)|(?:훈련|연습|수련|단련)(?:이|가)\s*(?:끝났|종료되었|종료됐다|완료되었|완료됐다|마무리되었|마무리됐다)/,
    'class-attendance':/(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)(?:을|를)?\s*(?:마쳤|끝냈|완료했|수료했)|(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)(?:이|가)\s*(?:끝났|종료되었|종료됐다)/,
    dialogue:/(?:대화|이야기|질문|답변|설명|상담|논의|면담|회의|브리핑)(?:을|를)?\s*(?:마쳤|끝냈|마무리했)|(?:대화|이야기|질문|답변|설명|상담|논의|면담|회의|브리핑)(?:이|가)\s*(?:끝났|마무리되었)/,
    explore:/(?:탐색|구경|둘러보기|순회)(?:를)?\s*(?:마쳤|끝냈|마무리했)/,
    'exit-exterior':/(?:건물|기숙사|방)\s*밖(?:에|으로)\s*(?:나왔|도착했)/,
  };
  const hypothetical=/(?:다면|라면|했으면|했을\s*경우|했는지|했을지|했을까|했을\s*(?:것인가|텐가)|아직|않았|못했|미완료|가정|예정|계획|어제|그제|그저께|지난\s*(?:날|주|달|해|학기|번|수업|강의|세미나|실습|오리엔테이션|교육|입학식|훈련|연습|수련|단련|식사|회의|면담)|예전에|과거(?:에|의)?|앞서|이전에|[?？])/;
  const uncertainWait=/(?:흘렀|지났)(?:는지|을지|을까)|(?:흘렀|지났)(?:다고|다는)\s*(?:착각|오해|생각|믿|여겼|추측|주장|말|소문)|(?:흐르|지나)지\s*(?:않|못)|(?:안|못)\s*(?:흘렀|지났)/;
  const foodObject=[...String(action||'').matchAll(/([가-힣A-Za-z0-9_]{1,24})(?:을|를)[^\n,.!?。！？]{0,32}(?:먹는다|먹겠다|먹을게)\s*[.!。！]*$/gi)].at(-1)?.[1]?.toLowerCase()||'',foodCompletion=foodObject?new RegExp(`${foodObject}\\s*(?:을|를)\\s*(?:(?:다|모두|전부|남김없이)\\s*)?(?:먹었|먹어\\s*치웠|비웠|해치웠)`):null;
  if(kind==='travel'){
    if(travelDestinationReachedForReconciliation(turn?.state_delta?.new_location,intent?.semanticTarget))return true;
    const allowedSubjects=new Set(['나','내','저','제','우리','저희',String(actorName||'').trim().toLowerCase()].filter(Boolean)),arrival=/(?:목적지|행선지|[^\s]{2,24})(?:에|로)\s*(?:도착했|도착했다|도착했다가|닿았|다다랐)/;
    return segments.some(segment=>{if(hypothetical.test(segment)||!arrival.test(segment)||!travelDestinationReachedForReconciliation(segment,intent?.semanticTarget))return false;const before=segment.slice(0,segment.search(arrival)),subjects=[...before.matchAll(/(?:^|[\s,])([^\s,]{1,32}?)(?:가|이|은|는|께서)\s+/gu)].map(match=>String(match[1]||'').trim().toLowerCase()),subject=subjects.at(-1);return!subject||allowedSubjects.has(subject);});
  }
  if(!patterns[kind])return false;
  const pcAttributedKinds=new Set(['downtime','sleep','rest','wait','meal','training','class-attendance','dialogue']);
  return segments.some(segment=>{if(hypothetical.test(segment)||kind==='wait'&&uncertainWait.test(segment))return false;const match=patterns[kind].exec(segment);if(match){if(kind==='wait'&&match.groups?.waitAmount){const native={한:1,두:2,세:3,네:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10},amount=Number(match.groups.waitAmount) || native[match.groups.waitAmount] || 0,cueMinutes=amount*(match.groups.waitUnit==='시간'?60:1),required=Math.max(0,Number(intent?.minAdvanceMinutes||0));if(cueMinutes<required)return false;}return!pcAttributedKinds.has(kind)||completionSegmentAttributedToPc(segment,match.index,kind,actorName);}const foodMatch=kind==='meal'&&foodCompletion?foodCompletion.exec(segment.toLowerCase()):null;return Boolean(foodMatch&&completionSegmentAttributedToPc(segment,foodMatch.index,kind,actorName));});
}
function travelDestinationReachedForReconciliation(location='',target=''){
  const compact=(value)=>String(value||'').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,''),actual=compact(location),expected=compact(target);if(!actual||!expected)return false;if(expected.length>=2&&actual.includes(expected))return true;
  const tokens=String(target||'').split(/[\s/·,()_-]+/).map(token=>compact(token).replace(/(?:으로|에게|에서|까지|부터|안으로|내부)$/u,'')).filter(token=>token.length>=2);return tokens.length>0&&tokens.every(token=>actual.includes(token));
}
function applySceneMomentumTimeFloor(incoming,turn,mode='game',consequenceLifecycle=null,consequenceVisibleScene=[],runtimeAuthority={}){
  const intent=classifySceneIntent(incoming?.action||'',{location:incoming?.saveState?.world?.location||'',currentTime:incoming?.saveState?.world?.time||'',currentDate:incoming?.saveState?.world?.date||'',currentWeekday:incoming?.saveState?.world?.weekday||'',actorName:incoming?.saveState?.pc?.name||'',resumeTimedAction:incoming?.saveState?.sceneRuntime?.timed_action});
  const boundaryLookahead=Math.min(1440,Math.max(0,Number(intent.boundaryLookaheadMinutes||0)));
  if(mode!=='game'||!turn?.state_delta||(!intent.compression&&boundaryLookahead<=0))return intent;
  const modelHasMeaningfulStop=array(turn?.choices).length>0;
  const current=Math.max(0,Number(turn.state_delta.advance_minutes||0));
  const turnLimitPreemptsChoice=Boolean(intent.turnLimitTruncated&&current>=1440),hasMeaningfulStop=Boolean(modelHasMeaningfulStop&&!turnLimitPreemptsChoice);
  const requestedFloor=Math.min(1440,Math.max(0,Number(intent.minAdvanceMinutes||0)));
  const explicitZeroRange=array(intent.explicitDurationRangeMinutes).length===2&&intent.explicitDurationRangeMinutes.every(value=>Number(value)===0);
  if((intent.explicitDurationMinutes===0||explicitZeroRange)&&requestedFloor<=0&&boundaryLookahead<=0&&Number(intent.scheduledStartOffsetMinutes||0)<=0){reconcileExplicitZeroTurn(turn);reconcileReturnedTimedTurn(turn,{reason:'explicit-zero',elapsed:0});return{...intent,runtimeSceneTrusted:false,returnedSceneReconciled:true,reconciliationReason:'explicit-zero'};}
  const requestedMaximum=Math.min(1440,Math.max(requestedFloor,Number(array(intent.suggestedAdvanceMinutes)[1]||0)));
  if(requestedFloor<=0&&boundaryLookahead<=0&&requestedMaximum<=0)return intent;
  const profileMax=boundaryLookahead>0?boundaryLookahead:requestedMaximum;
  const scheduleBoundary=nextScheduleBoundaryMinutes(incoming?.saveState||{},{futureOnly:true,action:incoming?.action||'',intent,registry:CHARACTER_REGISTRY});
  const consequenceBoundary=consequenceLifecycle?.selected_id?minutesUntilEventConsequence(incoming?.saveState||{},consequenceLifecycle.selected_id):null;
  const consequenceAttributionSafe=consequenceLifecycle?.attribution_safe!==false;
  const consequenceWithinProfile=Boolean(consequenceBoundary!=null&&Number.isFinite(Number(consequenceBoundary))&&consequenceBoundary<=profileMax);
  const floorBoundaries=[scheduleBoundary,consequenceWithinProfile?consequenceBoundary:null].filter(value=>value!=null&&Number.isFinite(Number(value))).map(Number),floorBoundary=floorBoundaries.length?Math.min(...floorBoundaries):null;
  const boundedFloor=floorBoundary==null?requestedFloor:Math.min(requestedFloor,Math.max(0,floorBoundary));
  const eventId=String(turn?.event_progress?.event_instance_id||turn?.event_progress?.eventInstanceId||'').trim().toLowerCase();
  const dueAtBoundary=new Set(scheduleBoundary==null?[]:scheduledIdsDueByTurnEnd(incoming?.saveState||{},scheduleBoundary).map(value=>String(value).trim().toLowerCase()));
  const dueBeforeBoundary=new Set(scheduleBoundary==null?[]:scheduledIdsDueByTurnEnd(incoming?.saveState||{},Math.max(0,scheduleBoundary-1)).map(value=>String(value).trim().toLowerCase()));
  const boundaryRows=scheduleRowsAtBoundary(incoming?.saveState||{},scheduleBoundary),boundaryIds=new Set(boundaryRows.map(row=>String(row?.id||'').trim().toLowerCase()).filter(Boolean)),structuredBoundary=Boolean(eventId&&boundaryIds.has(eventId)&&dueAtBoundary.has(eventId)&&!dueBeforeBoundary.has(eventId)),visibleBoundary=Boolean(boundaryRows.some(row=>scheduleBoundaryOccurred(turn,row)||(current===scheduleBoundary&&scheduleBoundaryCompletionMentioned(turn,row))));
  const crossedScheduledBoundary=Boolean(scheduleBoundary!=null&&scheduleBoundary<=profileMax&&current>scheduleBoundary);
  const surfacedScheduledBoundary=Boolean(scheduleBoundary!=null&&scheduleBoundary<=profileMax&&(structuredBoundary||visibleBoundary));
  const reachedScheduledBoundary=surfacedScheduledBoundary||crossedScheduledBoundary;
  const previousEventId=String(incoming?.saveState?.sceneRuntime?.eventProgress?.eventInstanceId||incoming?.saveState?.sceneRuntime?.eventProgress?.event_instance_id||'').trim().toLowerCase();
  const directorOccurrenceId=String(runtimeAuthority?.director_occurrence_id||'').trim().toLowerCase(),routedChoiceEventIds=array(runtimeAuthority?.choice_event_ids).map(value=>String(value||'').trim().toLowerCase()),dueChoiceScheduleIds=current===scheduleBoundary?[...boundaryIds]:[],dueChoiceConsequenceId=current===consequenceBoundary?String(consequenceLifecycle?.selected_id||'').trim().toLowerCase():'',trustedChoiceEventIds=new Set([...routedChoiceEventIds,...dueChoiceScheduleIds,dueChoiceConsequenceId,directorOccurrenceId].filter(Boolean));
  const structuredInterruption=Boolean(eventId.startsWith('director:')&&eventId===directorOccurrenceId&&eventId!==previousEventId&&!structuredBoundary&&eventId!==String(consequenceLifecycle?.selected_id||'').trim().toLowerCase());
  const decisionPlan=intent?.structuredExecutionPlan||intent?.structuredDecisionPlan,boundaryRuntime={required_boundary_kind:turnLimitPreemptsChoice?'turn-limit':'',boundaries:{schedule:scheduleBoundary==null?{}:{minutes:scheduleBoundary,event_ids:[...boundaryIds]},consequence:consequenceWithinProfile?{minutes:Number(consequenceBoundary),event_ids:[consequenceLifecycle?.selected_id].filter(Boolean)}:{},choice:modelHasMeaningfulStop?{minutes:current,event_ids:[...trustedChoiceEventIds]}:{},'turn-limit':intent.turnLimitTruncated?{minutes:1440,event_ids:[]}:{}}},executionAuthority=validateStructuredTimeExecution(turn,decisionPlan,boundaryRuntime),terminalClause=array(decisionPlan?.clauses).at(-1),terminalClauseId=String(terminalClause?.clause_id||`action_${Number(terminalClause?.index||0)}`),completionIntent=terminalClause?{...intent,completionActionType:String(terminalClause.action_type||'')}:intent,completionEvidence=timedActionCompletionEvidence(turn,completionIntent,incoming?.action||'',incoming?.saveState?.pc?.name||''),decisionEvidenceTurn=hasMeaningfulStop?turnBeforePlayerChoice(turn,executionAuthority):turn,legacyCompletionBeforeDecision=hasMeaningfulStop?timedActionCompletionEvidence(decisionEvidenceTurn,completionIntent,incoming?.action||'',incoming?.saveState?.pc?.name||''):completionEvidence,compoundPlan=executionAuthority.applicable&&array(decisionPlan?.clauses).length>1,completionBeforeDecision=executionAuthority.valid?executionAuthority.completed_clause_set.has(terminalClauseId):compoundPlan?false:legacyCompletionBeforeDecision,completedBeforeChoice=!hasMeaningfulStop||completionBeforeDecision,rawDecisionBoundary=structuredDecisionBoundaryMinutes(decisionEvidenceTurn,decisionPlan,current,hasMeaningfulStop,completionBeforeDecision,executionAuthority),decisionBoundary=rawDecisionBoundary==null||Number(rawDecisionBoundary)>profileMax?null:Math.max(0,Number(rawDecisionBoundary)||0),earlierInterruptionBeforeConsequence=Boolean(consequenceWithinProfile&&current<consequenceBoundary&&(structuredInterruption||(hasMeaningfulStop&&!completedBeforeChoice)));
  const rejectedClaimedExecution=Boolean(!hasMeaningfulStop&&executionAuthority.applicable&&!executionAuthority.valid&&object(turn?.time_execution).plan_used===true&&String(turn?.time_execution?.boundary_kind||'')==='none');
  const reachedConsequenceBoundary=consequenceWithinProfile&&!earlierInterruptionBeforeConsequence&&(current>=consequenceBoundary||consequenceLifecycle?.status==='resolved'),manifestedConsequenceBoundary=Boolean(reachedConsequenceBoundary&&consequenceLifecycle?.status==='resolved');
  const reachedBoundaries=[reachedScheduledBoundary?scheduleBoundary:null,reachedConsequenceBoundary?consequenceBoundary:null,decisionBoundary].filter(value=>value!=null&&Number.isFinite(Number(value))).map(Number),reachedBoundary=reachedBoundaries.length?Math.min(...reachedBoundaries):null;
  const appliedScheduleBoundary=reachedScheduledBoundary&&scheduleBoundary===reachedBoundary,appliedConsequenceBoundary=manifestedConsequenceBoundary&&consequenceBoundary===reachedBoundary,appliedConsequenceTimeBoundary=reachedConsequenceBoundary&&consequenceBoundary===reachedBoundary,appliedDecisionBoundary=decisionBoundary!=null&&decisionBoundary===reachedBoundary;
  const boundaryProgress=object(turn?.event_progress),boundaryProgressSignals=[boundaryProgress.active_beat,boundaryProgress.activeBeat,boundaryProgress.status,...array(boundaryProgress.completed_beats||boundaryProgress.completedBeats)].map(value=>String(value||'').trim().toLowerCase()),boundaryProgressTerminal=boundaryProgressSignals.some(value=>['complete','completed','done','finished','end'].includes(value)),trustedScheduleProgress=structuredBoundary&&!boundaryProgressTerminal?{...boundaryProgress}:null,trustedScheduleActiveAdds=array(turn?.state_delta?.active_events_add).filter(value=>boundaryIds.has(String(value||'').trim().toLowerCase())),trustedSchedulePendingRemovals=array(turn?.state_delta?.scheduled_events_remove).filter(value=>boundaryIds.has(String(value||'').trim().toLowerCase())),ownedTurnFields=new Set(array(executionAuthority?.effect_owners).filter(owner=>owner?.scope==='turn'&&owner?.owner_kind==='boundary-event'&&String(owner?.owner_id||'')===eventId).map(owner=>String(owner?.field||''))),structuredChoiceDirector=Boolean(eventId.startsWith('director:')&&executionAuthority.valid&&executionAuthority.boundary_kind==='choice'&&executionAuthority.boundary_event_id===eventId&&ownedTurnFields.has('event_progress')&&ownedTurnFields.has('director')),preserveChoiceDirectorState=Boolean(appliedDecisionBoundary&&hasMeaningfulStop&&!boundaryProgressTerminal&&(structuredChoiceDirector||structuredInterruption&&directorStateVisibleBeforeDecision(decisionEvidenceTurn,turn?.director))),trustedChoiceDirectorProgress=preserveChoiceDirectorState?{...boundaryProgress}:null,trustedChoiceDirectorActiveAdds=preserveChoiceDirectorState?array(turn?.state_delta?.active_events_add).filter(value=>String(value||'').trim().toLowerCase()===eventId):[],trustedChoiceDirector=preserveChoiceDirectorState&&turn?.director&&typeof turn.director==='object'?{...turn.director}:null;
  let applied=current;
  if(reachedBoundary!=null)applied=reachedBoundary;
  else if(current>profileMax)applied=profileMax;
  else if(!rejectedClaimedExecution&&!structuredInterruption&&completedBeforeChoice)applied=Math.min(profileMax,Math.max(current,boundedFloor));
  const boundaryTruncatesAction=Boolean(reachedBoundary!=null&&reachedBoundary<requestedFloor),preserveStartedScheduleState=Boolean(appliedScheduleBoundary&&boundaryTruncatesAction&&surfacedScheduledBoundary&&!completionEvidence&&!boundaryProgressTerminal),preserveSurfacedScheduleScene=Boolean(preserveStartedScheduleState&&visibleBoundary),unsurfacedScheduleCapsFloor=Boolean(scheduleBoundary!=null&&scheduleBoundary===floorBoundary&&!reachedScheduledBoundary&&scheduleBoundary<requestedFloor&&applied===scheduleBoundary),unresolvedConsequenceCapsFloor=Boolean(consequenceBoundary!=null&&consequenceBoundary===floorBoundary&&!reachedConsequenceBoundary&&consequenceBoundary<requestedFloor&&applied===consequenceBoundary),coincidentScheduleBoundary=Boolean(scheduleBoundary!=null&&!reachedScheduledBoundary&&scheduleBoundary===requestedFloor&&current>=scheduleBoundary&&applied===scheduleBoundary),coincidentConsequenceBoundary=Boolean(consequenceBoundary!=null&&!manifestedConsequenceBoundary&&consequenceBoundary===requestedFloor&&current>=consequenceBoundary&&applied===consequenceBoundary),overrunStartBoundary=Boolean(intent.scheduledStartOverrun&&Number(intent.scheduledStartOffsetMinutes||0)>0&&applied===Number(intent.scheduledStartOffsetMinutes)),startOnlyBoundary=Boolean(intent.scheduledStartBoundaryOnly&&Number(intent.scheduledStartOffsetMinutes||0)>0&&applied===Number(intent.scheduledStartOffsetMinutes)),reconcileTruncatedTurn=rejectedClaimedExecution||applied<current||boundaryTruncatesAction||unsurfacedScheduleCapsFloor||unresolvedConsequenceCapsFloor||overrunStartBoundary||startOnlyBoundary;
  const ambiguousAppliedConsequence=Boolean(appliedConsequenceBoundary&&!consequenceAttributionSafe);
  if((reconcileTruncatedTurn||ambiguousAppliedConsequence)&&consequenceLifecycle?.status==='resolved'&&(!appliedConsequenceBoundary||ambiguousAppliedConsequence)){
    if(!consequenceAttributionSafe){const id=String(consequenceLifecycle.selected_id||'');turn.state_delta.hooks_update=[...array(turn.state_delta.hooks_update).filter(row=>String(row?.id||'')!==id),{id,status:'open',reason:'발현 시각 도달; NPC 경계 효과 귀속 대기'}].slice(0,8);consequenceLifecycle.evidence='ambiguous-npc-effect';}
    else consequenceLifecycle.evidence='deferred-by-earlier-boundary';
    consequenceLifecycle.status='open';
  }
  const preserveAttributedConsequence=Boolean(appliedConsequenceBoundary&&consequenceAttributionSafe),turnLimitCompletion=Boolean(intent.turnLimitTruncated&&(applied>=1440||completionEvidence||(intent.kind==='travel'&&travelDestinationReachedForReconciliation(turn?.state_delta?.new_location,intent.semanticTarget)))),preserveIntermediateLocation=intent.turnLimitTruncated&&intent.kind==='travel'&&applied>=1440&&!completionEvidence&&!travelDestinationReachedForReconciliation(turn?.state_delta?.new_location,intent.semanticTarget)?turn?.state_delta?.new_location:'',reconcileTimedTurn=reconcileTruncatedTurn||appliedDecisionBoundary||ambiguousAppliedConsequence||turnLimitCompletion;
  let rewoundScheduleCompletion=false,completedPrefixActionTypes=[],structuredBoundaryReconciliationApplied=false,preservedStructuredTurn={};
  if(reconcileTimedTurn){const timedBoundaryEvidence=appliedScheduleBoundary?turnBeforeScheduleBoundary(turn,boundaryRows):appliedConsequenceTimeBoundary?turnBeforeConsequenceBoundary(turn,consequenceVisibleScene):null,unorderedChoiceEvidence=timedBoundaryEvidence?._boundary_evidence_unordered===true&&hasMeaningfulStop?{...decisionEvidenceTurn,_boundary_evidence_unordered:true}:null,effectEvidenceTurn=appliedDecisionBoundary?decisionEvidenceTurn:unorderedChoiceEvidence||timedBoundaryEvidence||turn,structuredPrefixEffects=structuredPrefixEffectsForShortening(effectEvidenceTurn,decisionPlan,applied,executionAuthority),prefixEffects=rejectedClaimedExecution?{preserved_delta:{},npc_state_updates:[],npc_schedule_updates:[],new_location:'',pc_status:'',completed_prefix_action_types:[],preserved_turn:{}}:structuredPrefixEffects??precedingActivityEffectsForShortening(effectEvidenceTurn,incoming?.action||'',intent,applied);completedPrefixActionTypes=array(prefixEffects.completed_prefix_action_types);structuredBoundaryReconciliationApplied=prefixEffects.structured_execution===true;preservedStructuredTurn=object(prefixEffects.preserved_turn);reconcileShortenedTimedTurn(turn,{preserveConsequenceId:preserveAttributedConsequence||consequenceLifecycle?.evidence==='ambiguous-npc-effect'?consequenceLifecycle?.selected_id:'',preserveNpcStateUpdates:mergePreservedRows(prefixEffects.npc_state_updates,preserveAttributedConsequence?consequenceLifecycle?.npc_state_updates:[]),preserveNpcScheduleUpdates:mergePreservedRows(prefixEffects.npc_schedule_updates,preserveAttributedConsequence?consequenceLifecycle?.npc_schedule_updates:[]),preserveDelta:mergePreservedDeltas(prefixEffects.preserved_delta,preserveAttributedConsequence?consequenceLifecycle?.preserved_delta:{}),preserveIntermediateLocation:(preserveAttributedConsequence?consequenceLifecycle?.new_location:'')||prefixEffects.new_location||preserveIntermediateLocation,preservePcStatus:(preserveAttributedConsequence?consequenceLifecycle?.pc_status:'')||prefixEffects.pc_status});if(preserveStartedScheduleState){turn.state_delta.active_events_add=trustedScheduleActiveAdds;turn.state_delta.scheduled_events_remove=trustedSchedulePendingRemovals;if(trustedScheduleProgress)turn.event_progress=trustedScheduleProgress;}}
  else if(appliedScheduleBoundary)rewoundScheduleCompletion=reconcileReachedScheduleStart(turn,boundaryRows);
  turn.state_delta.advance_minutes=applied;
  const trimmedSurfacedScheduleScene=Boolean(!appliedDecisionBoundary&&preserveSurfacedScheduleScene&&reconcileReturnedScheduleBoundary(turn,boundaryRows,applied));
  const raisedElapsedTime=applied>current,pureRaisedFloor=Boolean(raisedElapsedTime&&!reconcileTimedTurn&&!coincidentScheduleBoundary&&!coincidentConsequenceBoundary&&!trimmedSurfacedScheduleScene&&!rewoundScheduleCompletion),hasRaisedFloorEvidenceScene=array(turn.scene).some(item=>String(item?.text||'').trim()),preserveRaisedFloorScene=Boolean(pureRaisedFloor&&!completionEvidence&&hasRaisedFloorEvidenceScene),raisedFloorSceneRuntimeTrusted=Boolean(preserveRaisedFloorScene&&!boundaryRows.some(row=>scheduleRowMentioned(turn,row))),sanitizeReplacedRaisedFloorScene=Boolean(pureRaisedFloor&&!preserveRaisedFloorScene),returnedSceneReconciled=Boolean(appliedDecisionBoundary||trimmedSurfacedScheduleScene||rewoundScheduleCompletion||coincidentScheduleBoundary||coincidentConsequenceBoundary||!preserveSurfacedScheduleScene&&(reconcileTimedTurn||raisedElapsedTime)),reconciliationReason=rejectedClaimedExecution?'invalid-structured-execution':appliedDecisionBoundary?'decision-boundary':appliedScheduleBoundary||unsurfacedScheduleCapsFloor||coincidentScheduleBoundary||overrunStartBoundary||rewoundScheduleCompletion?'schedule-boundary':appliedConsequenceTimeBoundary||unresolvedConsequenceCapsFloor||coincidentConsequenceBoundary||ambiguousAppliedConsequence?'consequence-boundary':turnLimitCompletion||startOnlyBoundary?'turn-limit':raisedElapsedTime?'profile-floor':'profile-cap',runtimeTrustedConsequenceScene=returnedSceneReconciled&&preserveAttributedConsequence?array(consequenceVisibleScene):[];
  if(sanitizeReplacedRaisedFloorScene){const delta=object(turn.state_delta);reconcileShortenedTimedTurn(turn,{preserveDelta:{fatigue_delta:Number(delta.fatigue_delta||0),gold_delta:Number(delta.gold_delta||0)}});turn.state_delta.advance_minutes=applied;}
  if(returnedSceneReconciled&&!trimmedSurfacedScheduleScene){if(appliedDecisionBoundary)reconcileReturnedTimedTurn(turn,{reason:'decision-boundary',elapsed:applied,completedPrefixActionTypes,decisionPromptText:decisionEvidenceTurn?._choice_prompt_text});else if(preserveRaisedFloorScene)reconcileReturnedRaisedFloorContinuation(turn,{elapsed:applied});else if(preserveAttributedConsequence&&array(consequenceVisibleScene).length)reconcileReturnedConsequenceTurn(turn,{elapsed:applied,scene:consequenceVisibleScene});else reconcileReturnedTimedTurn(turn,{reason:reconciliationReason,elapsed:applied,boundaryTitle:coincidentScheduleBoundary?boundaryRows[0]?.title:'',completedPrefixActionTypes});}
  if(Object.prototype.hasOwnProperty.call(preservedStructuredTurn,'event_progress'))turn.event_progress={...object(preservedStructuredTurn.event_progress)};
  if(Object.prototype.hasOwnProperty.call(preservedStructuredTurn,'director'))turn.director={...object(preservedStructuredTurn.director)};
  if(preserveChoiceDirectorState&&!Object.keys(preservedStructuredTurn).length){turn.event_progress=trustedChoiceDirectorProgress;turn.state_delta.active_events_add=mergePreservedRows(turn.state_delta.active_events_add,trustedChoiceDirectorActiveAdds);if(trustedChoiceDirector)turn.director=trustedChoiceDirector;}
  return{...intent,runtimeSceneTrusted:appliedDecisionBoundary||preserveSurfacedScheduleScene||raisedFloorSceneRuntimeTrusted||!returnedSceneReconciled,runtimeTrustedConsequenceScene,returnedSceneReconciled,reconciliationReason:returnedSceneReconciled?reconciliationReason:null,structuredBoundaryReconciliationApplied,completedPrefixActionTypes};
}
function deriveTimedActionRuntime(previousRuntime={},intent={},action='',turn={},mode='game'){
  const previous=object(previousRuntime?.timed_action);if(mode!=='game')return Object.keys(previous).length?previous:null;
  const resumed=intent?.resumedTimedAction===true,range=array(intent?.explicitDurationRangeMinutes),prefixMinimum=Math.max(0,Math.trunc(Number(array(intent?.precedingActivityRangeMinutes)[0]??intent?.precedingActivityMinutes??0))),terminalMinimum=Math.max(0,Math.trunc(Number(intent?.activityMinimumMinutes??(intent?.explicitDurationMinutes!=null?intent.explicitDurationMinutes:intent?.strictDurationLowerBoundMinutes!=null?Number(intent.strictDurationLowerBoundMinutes)+(intent.strictDurationLowerBoundInclusive?0:1):range.length===2?range[0]:0))||0)),dateStart=intent?.dateQualifiedStartOffsetMinutes!=null&&Number.isFinite(Number(intent.dateQualifiedStartOffsetMinutes))?Math.max(0,Math.trunc(Number(intent.dateQualifiedStartOffsetMinutes))):null,scheduledStart=intent?.scheduledStartOffsetMinutes!=null&&Number.isFinite(Number(intent.scheduledStartOffsetMinutes))?Math.max(0,Math.trunc(Number(intent.scheduledStartOffsetMinutes))):null,initialWait=dateStart??scheduledStart??0,declared=Math.max(0,Math.trunc((initialWait>0?initialWait:prefixMinimum)+terminalMinimum)),eligibleNew=!resumed&&declared>1440&&intent?.turnLimitTruncated===true;
  if((!resumed&&!eligibleNew)||intent?.reconciliationReason!=='turn-limit')return null;
  const beforeWait=resumed?Math.max(0,Math.trunc(Number(intent?.resumeRemainingWaitMinutes??previous.remaining_wait_minutes)||0)):initialWait,beforeActivity=resumed?Math.max(0,Math.trunc(Number(intent?.resumeRemainingActivityMinutes??previous.remaining_activity_minutes??intent?.resumeRemainingMinutes)||0)):Math.max(0,declared-beforeWait),before=beforeWait+beforeActivity,elapsed=Math.max(0,Math.trunc(Number(turn?.state_delta?.advance_minutes)||0)),remainingWait=Math.max(0,beforeWait-Math.min(beforeWait,elapsed)),activityElapsed=Math.max(0,elapsed-beforeWait),remainingActivity=Math.max(0,beforeActivity-activityElapsed),remaining=remainingWait+remainingActivity;if(remaining<=0)return null;
  const total=resumed?Math.max(before,Math.trunc(Number(previous.total_minutes)||before)):declared,totalElapsed=Math.max(0,total-remaining);
  return{version:'1.0',kind:String(intent.kind||previous.kind||''),original_action:String(previous.original_action||action||'').slice(0,240),semantic_target:String(intent.semanticTarget||previous.semantic_target||'').slice(0,120)||null,total_minutes:total,elapsed_minutes:totalElapsed,remaining_minutes:remaining,remaining_wait_minutes:remainingWait,remaining_activity_minutes:remainingActivity,status:'active'};
}
function runtimeSynthesisTurn(turn,intent={}){
  if(intent?.runtimeSceneTrusted!==false)return turn;
  const trustedConsequenceScene=array(intent?.runtimeTrustedConsequenceScene).filter(item=>String(item?.text||'').trim());
  return{...object(turn),scene:trustedConsequenceScene,scene_title:'',scene_summary:'',choices:[],emotion_updates:[],director:null,runtime_incomplete_boundary:true};
}
function reconcileReturnedTimedTurn(turn,{reason='profile-cap',elapsed=0,boundaryTitle='',completedPrefixActionTypes=[],decisionPromptText=''}={}){
  if(!turn||typeof turn!=='object')return false;
  const minutes=Math.max(0,Math.trunc(Number(elapsed)||0)),labels={training:'훈련','class-attendance':'수업',meal:'식사',dialogue:'대화',sleep:'수면',rest:'휴식',wait:'대기',travel:'이동'},completed=[...new Set(array(completedPrefixActionTypes).map(value=>labels[value]).filter(Boolean))],completedLabel=completed.length?completed.length===1?completed[0]:`${completed.slice(0,-1).join('·')}과 ${completed.at(-1)}`:'',prefix=completedLabel?`앞선 ${completedLabel}을 마친 뒤, `:minutes>0?'행동을 이어가던 중, ':'행동을 시작하려던 순간, ';
  const completedAtRaisedFloor=reason==='profile-floor',scheduleLabel=String(boundaryTitle||'예정된 일정').trim()||'예정된 일정',detail=reason==='schedule-boundary'?`${scheduleLabel}의 시작 시점에 도달했다.`:reason==='consequence-boundary'?'후속 상황이 발현할 시점에 도달했다.':reason==='decision-boundary'?'플레이어의 판단이 필요한 선택 지점에 도달했다.':reason==='turn-limit'?'한 턴의 진행 한계에 도달했다.':reason==='explicit-zero'?'요청한 지속시간이 0분이므로 행동 결과는 발생하지 않았다.':reason==='invalid-structured-execution'?'구조화된 실행 결과를 검증할 수 없어 반환된 시점에서 진행을 중단했다.':completedAtRaisedFloor?'요청한 행동이 완료될 수 있는 최소 시간을 채워 행동을 마쳤다.':'요청한 시간 범위의 끝에 도달했다.';
  const text=`${prefix}${detail}${completedAtRaisedFloor?'':' 그 이후 과정은 아직 확정되지 않았다.'}`;
  turn.scene_title=reason==='schedule-boundary'?'일정 경계':reason==='consequence-boundary'?'후속 상황 경계':reason==='decision-boundary'?'선택 지점':reason==='turn-limit'?'진행 중':['explicit-zero','invalid-structured-execution'].includes(reason)?'행동 보류':completedAtRaisedFloor?'행동 완료':'행동 진행 중';
  const preservedChoices=reason==='decision-boundary'?array(turn.choices).slice(0,3):[],decisionCandidates=reason==='decision-boundary'?array(turn.scene).filter(item=>String(item?.text||'').trim()):[],prompt=String(decisionPromptText||'').trim(),promptRows=prompt?decisionCandidates.filter(item=>String(item?.text||'').includes(prompt)).map(item=>({...object(item),text:prompt})):[],questionRows=decisionCandidates.filter(item=>/[?？]/.test(String(item?.text||''))),decisionRows=(promptRows.length?promptRows:questionRows.length?questionRows:decisionCandidates.filter(item=>String(item?.kind||'')==='dialogue')).slice(-2);
  const decisionSpeakerKeys=new Set(decisionRows.map(item=>String(item?.speaker_key||'').trim()).filter(Boolean)),retainedEmotionUpdates=reason==='decision-boundary'?array(turn.emotion_updates).filter(row=>decisionSpeakerKeys.has(String(row?.npc_key||row?.key||row?.speaker_key||'').trim())):[];
  turn.scene_summary=text;turn.scene=[{kind:'narration',text},...decisionRows];turn.choices=preservedChoices;turn.emotion_updates=retainedEmotionUpdates;turn.cg_id=null;turn.director=null;
  return true;
}
function reconcileReturnedRaisedFloorContinuation(turn){
  if(!turn||typeof turn!=='object')return false;
  const text='기존에 드러난 변화 뒤에도 요청한 행동을 이어 최소 진행 시간을 채웠다.';
  turn.scene_title='행동 완료';turn.scene_summary='요청한 행동의 진행과 그 사이 발생한 변화가 함께 반영되었다.';turn.scene=[...array(turn.scene),{kind:'narration',text}];
  return true;
}
function reconcileReturnedConsequenceTurn(turn,{elapsed=0,scene=[]}={}){
  if(!turn||typeof turn!=='object')return false;
  const minutes=Math.max(0,Math.trunc(Number(elapsed)||0)),rows=array(scene).filter(item=>String(item?.text||'').trim()).slice(0,4),boundaryText='행동을 이어가던 중 후속 상황이 발현했다.';
  if(!rows.length)return reconcileReturnedTimedTurn(turn,{reason:'consequence-boundary',elapsed:minutes});
  turn.scene_title='후속 상황';turn.scene_summary=boundaryText;turn.scene=[{kind:'narration',text:boundaryText},...rows];turn.choices=[];turn.emotion_updates=[];turn.director=null;
  return true;
}
function uniqText(rows,limit=4){return [...new Set(array(rows).map(x=>clampText(x,140).trim()).filter(Boolean))].slice(-limit);}
function tinyHash(text=''){let h=0x811c9dc5;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,0x01000193);}return(h>>>0).toString(16).padStart(8,'0');}
function containsName(text,value){const a=String(text||'').toLowerCase(),b=String(value||'').trim().toLowerCase();return b.length>=2&&a.includes(b);}
function inferGoalTarget(text,incoming,key){
  const value=String(text||'').trim();
  const pcName=String(incoming.saveState?.pc?.name||'').trim();
  if(/\b(?:pc|player)\b|플레이어|사용자|Aaa/i.test(value)||(pcName&&containsName(value,pcName)))return{target_type:'pc',target_key:'pc'};
  const npcRows=Object.entries(CHARACTER_REGISTRY).filter(([k])=>k!==key).sort((a,b)=>String(b[1]).length-String(a[1]).length);
  for(const [npcKey,name] of npcRows)if(containsName(value,name)||containsName(value,npcKey))return{target_type:'npc',target_key:npcKey};
  for(const ev of array(incoming.saveState?.scheduleContext?.due)){
    if((ev?.id&&containsName(value,ev.id))||(ev?.title&&containsName(value,ev.title)))return{target_type:'event',target_key:String(ev.id||ev.title).slice(0,100)};
  }
  const location=String(incoming.saveState?.world?.location||'').trim();
  if(location&&containsName(value,location))return{target_type:'place',target_key:location.slice(0,100)};
  const classMatch=value.match(/(?:기사과|마법과|신학부|연금(?:술)?과|수업|강의|세미나)/i);
  if(classMatch)return{target_type:'class',target_key:classMatch[0]};
  const orgMatch=value.match(/([가-힣A-Za-z0-9_]{2,36}(?:학생회|황실|가문|상회|교단|길드|조직|학부))/i);
  if(orgMatch)return{target_type:'organization',target_key:orgMatch[1].slice(0,100)};
  return{target_type:'event',target_key:null};
}
function appendGoalHistory(history,row){
  const rows=array(history).filter(Boolean);
  if(!row?.id)return rows.slice(-6);
  const filtered=rows.filter(x=>String(x?.id||'')!==String(row.id));
  return [...filtered,row].slice(-6);
}
function goalArchiveRow(goal,turnNo,reason=''){
  if(!goal?.id)return null;
  return {
    id:String(goal.id),desire:clampText(goal.desire||'',220),final_state:GOAL_STATES.has(String(goal.state))?String(goal.state):'active',
    final_progress:bounded(goal.progress,0,100,0),ended_turn:turnNo,end_reason:clampText(reason||goal.last_progress_reason||'',180),
  };
}
function goalRuntimeFor(incoming,key,old,npc,rel,em){
  const previous=object(old.active_goal);
  const hasPrevious=Boolean(previous.id||previous.desire);
  const currentState=object(incoming.saveState?.npcStates?.[key]);
  const reportedDesire=clampText(npc.current_goal||'',220).trim();
  const fallbackDesire=clampText(previous.desire||currentState.current_goal||old.short_term_plan||'',220).trim();
  const reason=clampText(npc.goal_reason||'',180).trim();
  const requestedReplace=npc.goal_replace===true;
  const replace=Boolean(hasPrevious&&requestedReplace&&reportedDesire&&reason);
  const desire=reportedDesire||fallbackDesire;
  if(!desire)return{goal:null,history:array(old.goal_history).slice(-6)};

  const turnNo=Number(incoming.saveState?.turnNumber||0)+1;
  let history=array(old.goal_history).slice(-6);
  const isNew=!hasPrevious||replace;
  const previousState=GOAL_STATES.has(String(previous.state))?String(previous.state):'active';
  if(replace){
    const priorSnapshot=history.find(x=>String(x?.id||'')===String(previous.id||''));
    const terminal=['completed','abandoned'].includes(previousState);
    if(!terminal||!priorSnapshot){
      const archiveTurn=terminal?bounded(previous.updated_turn,0,1e9,turnNo):turnNo;
      const archiveReason=terminal?clampText(previous.last_progress_reason||reason,180):reason;
      const archived=goalArchiveRow(previous,archiveTurn,archiveReason||'goal replaced');
      if(archived)history=appendGoalHistory(history,archived);
    }
  }

  const due=array(incoming.saveState?.scheduleContext?.due).some(ev=>array(ev?.participants).map(String).includes(key));
  const activeHook=array(incoming.saveState?.hooks).some(h=>!['resolved','expired','declined'].includes(h?.status)&&String(h?.source_npc_key||'')===key);
  const target=inferGoalTarget(desire,incoming,key);
  const priority=isNew?(activeHook?4:3):bounded(previous.priority,1,5,3);
  const urgency=isNew?(due?5:activeHook?4:3):bounded(previous.urgency,1,5,3);
  const requestedState=reason&&GOAL_STATES.has(String(npc.goal_state))?String(npc.goal_state):null;
  const rawDelta=Number(npc.goal_progress_delta);
  const deltaSupplied=npc.goal_progress_delta!=null&&Number.isFinite(rawDelta);
  const requestedDelta=deltaSupplied?bounded(Math.trunc(rawDelta),-100,100,0):0;
  const validDelta=Boolean(reason&&deltaSupplied&&requestedDelta!==0);
  const nextAction=clampText(npc.goal_next_action||'',140).trim();
  let state=isNew?'active':previousState;
  let progress=isNew?0:bounded(previous.progress,0,100,0);
  const initialProgress=progress;
  let actualDelta=0;
  let meaningful=false;

  if(isNew){
    if(validDelta){const next=bounded(progress+requestedDelta,0,100,progress);actualDelta=next-progress;progress=next;meaningful=actualDelta!==0;}
    if(requestedState&&(!replace||requestedState==='active')){state=requestedState;meaningful=true;}
  }else if(previousState==='completed'){
    if(requestedState==='active'&&validDelta&&requestedDelta<0){
      const next=bounded(100+requestedDelta,0,99,99);
      if(next<100){state='active';actualDelta=next-100;progress=next;meaningful=true;}
    }
    if(state==='completed')progress=100;
  }else if(previousState==='abandoned'){
    if(requestedState==='active'){
      state='active';meaningful=true;
      if(validDelta){const next=bounded(progress+requestedDelta,0,100,progress);actualDelta=next-progress;progress=next;}
    }
  }else{
    if(validDelta){const next=bounded(progress+requestedDelta,0,100,progress);actualDelta=next-progress;progress=next;meaningful=actualDelta!==0;}
    if(requestedState&&requestedState!==previousState){state=requestedState;meaningful=true;}
  }

  if(state==='completed'){
    const completionDelta=100-initialProgress;
    progress=100;
    actualDelta=completionDelta;
    if(completionDelta!==0)meaningful=true;
  }
  const transition=state!==previousState||isNew;
  const rephrased=Boolean(!isNew&&reportedDesire&&reportedDesire!==String(previous.desire||'').trim());
  const goalTouched=Boolean(isNew||replace||meaningful||transition||rephrased||nextAction);
  const evidenceReason=(meaningful||transition||replace)?reason:'';
  const cause=clampText(rel.cause||rel.reason||em.reason||'',140).trim();
  const previousNext=array(previous.next_actions).map(x=>clampText(x,140).trim()).filter(Boolean);
  const nextActions=nextAction?[nextAction,...previousNext.filter(x=>x!==nextAction)].slice(0,4):previousNext.slice(0,4);
  const reopenedFromBlocked=!isNew&&previousState==='blocked'&&state==='active'&&requestedState==='active';
  const goal={
    id:isNew?`goal:${key}:${tinyHash(`${desire}:${turnNo}`)}`:String(previous.id||`goal:${key}:${tinyHash(desire)}`),
    target_type:target.target_type,target_key:target.target_key,desire,
    priority,urgency,progress,state,
    reasons:uniqText([...(isNew?[]:array(previous.reasons)),cause,evidenceReason],4),
    next_actions:nextActions,
    obstacle:clampText(state==='blocked'?(reason||previous.obstacle||old.concern||old.unresolved_issue||''):(reopenedFromBlocked?'':(previous.obstacle||old.concern||old.unresolved_issue||'')),140),
    source_turn:isNew?turnNo:bounded(previous.source_turn,0,1e9,turnNo),
    updated_turn:goalTouched?turnNo:bounded(previous.updated_turn,0,1e9,bounded(previous.source_turn,0,1e9,turnNo)),
    last_progress_delta:meaningful?actualDelta:bounded(previous.last_progress_delta,-100,100,0),
    last_progress_reason:evidenceReason||clampText(previous.last_progress_reason||'',180),
  };

  const becameTerminal=!isNew&&!['completed','abandoned'].includes(previousState)&&['completed','abandoned'].includes(state);
  const newTerminal=isNew&&['completed','abandoned'].includes(state);
  if(becameTerminal||newTerminal){const archived=goalArchiveRow(goal,turnNo,reason);if(archived)history=appendGoalHistory(history,archived);}
  return{goal,history};
}
function relationshipReasonFor(incoming,turn,key,rel){
  if(!rel||typeof rel!=='object'||!Object.keys(rel).length)return null;
  return{
    turn:Number(incoming.saveState?.turnNumber||0)+1,
    dimensions:{affinity:bounded(rel.affinity_delta,-10,10,0),trust:bounded(rel.trust_delta,-10,10,0)},
    status:rel.status||null,
    cause:clampText(rel.cause||rel.reason||'',150),
    expression:clampText(rel.expression||'',150),
    followup:clampText(rel.followup||'',150),
    source_event:clampText(turn?.event_progress?.event_instance_id||turn?.director?.callback_key||turn?.scene_title||'',120),
  };
}

function localNpcUpdates(incoming,turn){
  const previous=object(incoming.saveState?.npcInnerStates);
  const npcRelationshipUpdates=localNpcRelationshipUpdates(incoming,turn);
  const speakerRows=array(turn?.scene).filter(x=>x?.speaker_key);
  const relationKeys=[...Object.keys(npcRelationshipUpdates),...array(turn?.state_delta?.relationship_changes).map(x=>String(x?.npc_key||x?.key||'')).filter(Boolean)];
  const stateKeys=[...Object.keys(npcRelationshipUpdates),...array(turn?.state_delta?.npc_state_updates).map(x=>String(x?.npc_key||x?.key||'')).filter(Boolean)];
  const explicitKeys=[...new Set(stateKeys)].slice(0,12);
  const passiveKeys=[...new Set([...relationKeys,...speakerRows.map(x=>String(x.speaker_key)).filter(Boolean)])].filter(key=>!explicitKeys.includes(key)).slice(0,6);
  const keys=[...explicitKeys,...passiveKeys].slice(0,12);
  const out={};
  for(const key of keys){
    const old=object(previous[key]);
    const lastDialogue=[...speakerRows].reverse().find(x=>String(x.speaker_key)===key)||{};
    const em=emotionFor(turn,key)||{}; const rel=relationChangeFor(turn,key)||{}; const npc=npcStateUpdateFor(turn,key)||{};
    const expression=em.expression||em.current||lastDialogue.display_expression||lastDialogue.expression||'';
    const cause=clampText(rel.cause||rel.reason||em.reason||'',150);
    const follow=clampText(rel.followup||'',160);
    const goalResult=goalRuntimeFor(incoming,key,old,npc,rel,em);
    const activeGoal=goalResult.goal;
    const relationshipReason=relationshipReasonFor(incoming,turn,key,rel);
    const relationshipHistory=relationshipReason?[...array(old.relationship_history),relationshipReason].slice(-8):array(old.relationship_history).slice(-8);
    const goalPlan=activeGoal?.state==='active'?clampText(activeGoal?.next_actions?.[0]||activeGoal?.desire||'',180):'';
    const oldPlanText=String(old.short_term_plan||'').trim();
    const terminalGoal=Boolean(activeGoal&&activeGoal.state!=='active');
    const priorGoalActions=new Set(array(old?.active_goal?.next_actions).map(x=>String(x||'').trim()).filter(Boolean));
    const terminalPlanMatches=terminalGoal&&(oldPlanText===String(activeGoal?.desire||'').trim()||oldPlanText===String(old?.active_goal?.desire||'').trim()||priorGoalActions.has(oldPlanText));
    const oldPlan=terminalPlanMatches?'':old.short_term_plan;
    out[key]={
      mood:moodFromExpression(expression)||old.mood||'',
      social_stance:clampText(rel.status||old.social_stance||'',80),
      opinion_of_pc:cause?`최근 인상: ${cause}`:clampText(old.opinion_of_pc||'',180),
      short_term_plan:follow||goalPlan||clampText(oldPlan||'',180),
      concern:clampText(old.concern||'',180),
      wants_from_pc:clampText(old.wants_from_pc||'',180),
      unresolved_issue:clampText(old.unresolved_issue||'',180),
      ...(activeGoal?{active_goal:activeGoal}:{}),
      goal_history:goalResult.history,
      ...(relationshipReason?{relationship_reason:relationshipReason}:{}),
      relationship_history:relationshipHistory,
      ...object(npcRelationshipUpdates[key]),
    };
  }
  return out;
}

function localSceneRuntime(incoming,turn,directorTelemetry=null,mode='game',orchestrationPlan=null,sceneIntent=null){
  const previous=object(incoming.saveState?.sceneRuntime);
  const scheduledEntries=actualScheduledEntrants({due:incoming.saveState?.scheduleContext?.due,turn,recentTurns:incoming.recentTurns,currentLocation:incoming.saveState?.world?.location,registry:CHARACTER_REGISTRY});
  const participants=reconcileParticipants({previous:previous.participants,action:incoming.action,turn,recentTurns:incoming.recentTurns,scheduledEntries,registry:CHARACTER_REGISTRY,currentLocation:incoming.saveState?.world?.location});
  const choices=array(turn?.choices).map(x=>clampText(x,140)).filter(Boolean).slice(0,3);
  const hasDecision=choices.length>0;
  const directorOccurrence=String(directorTelemetry?.occurrence_id||'').trim().toLowerCase();
  const dueIds=scheduledIdsDueByTurnEnd(incoming.saveState,turn?.state_delta?.advance_minutes);
  const callbackKey=String(turn?.director?.callback_key||'').trim();
  const knownCallback=new Set([...array(incoming.saveState?.director?.callbacks).map(row=>String(row?.key||'')),...array(incoming.saveState?.hooks).map(row=>String(row?.id||''))]);
  const explicitPlayerStart=/(?:결투|대련|조사|수사|추적|탐사|의뢰를?\s*(?:시작|수락)|duel|investigat|start(?:s|ed|ing)?\s+(?:a\s+)?(?:duel|investigation))/i.test(String(incoming.action||''));
  const startedEvidence=(explicitPlayerStart?array(turn?.state_delta?.active_events_add)[0]:'')||(knownCallback.has(callbackKey)?callbackKey:'');
  const startedOccurrence=occurrenceIdFromStartEvidence(incoming.saveState?.world?.date,incoming.saveState?.turnNumber,startedEvidence);
  const priorProgress=previous.eventProgress;
  const removed=new Set([...array(turn?.state_delta?.active_events_remove),...array(turn?.state_delta?.completed_events_add),...array(turn?.state_delta?.scheduled_events_complete)].map(x=>String(x).trim().toLowerCase()));
  const priorResumeKey=String(priorProgress?.resumeKey||'').trim().toLowerCase();
  const priorId=String(priorProgress?.eventInstanceId||'').trim().toLowerCase();
  const scheduledStillActive=dueIds.map(x=>String(x).trim().toLowerCase()).includes(priorId)&&!removed.has(priorId);
  const unscheduledStillActive=priorResumeKey&&array(incoming.saveState?.activeEvents).map(x=>String(x).trim().toLowerCase()).includes(priorResumeKey)&&!removed.has(priorResumeKey);
  const pauseOnNull=Boolean(scheduledStillActive||unscheduledStillActive);
  const progressState=mergeRoutedEventProgressState(priorProgress,previous.eventProgressByInstance,turn?.event_progress,{dueEventIds:dueIds,directorOccurrenceId:directorOccurrence,startedOccurrenceId:startedOccurrence,startedResumeKey:startedEvidence,pauseOnNull});
  const sceneDelta=deriveSceneDelta({saveState:incoming.saveState||{},previousRuntime:previous,turn,nextParticipants:participants,action:incoming.action||''});
  const momentum=updateSceneMomentum(previous,sceneDelta,{turnNumber:Number(incoming.saveState?.turnNumber||0)+1});
  const sceneKey=clampText(turn?.scene_title||previous.scene_key||'scene',120),turnNumber=Number(incoming.saveState?.turnNumber||0)+1;
  const novelty=deriveSceneNovelty({previousRuntime:previous,turn,sceneDelta,action:incoming.action||'',turnNumber,mode});
  const purpose=deriveScenePurpose({previousRuntime:previous,turn,sceneDelta,eventProgress:progressState.eventProgress,action:incoming.action||'',sceneKey,turnNumber});
  const proposedExit=deriveSceneExitCondition({action:incoming.action||'',saveState:incoming.saveState||{},purpose,turnNumber});
  const exitCondition=evaluateSceneExitCondition(proposedExit,{turn,sceneDelta,previousRuntime:previous,eventProgress:progressState.eventProgress,incompleteBoundary:turn?.runtime_incomplete_boundary===true});
  const turnHook=deriveTurnHook({turn,sceneDelta,purpose,exitCondition,eventProgress:progressState.eventProgress,previousRuntime:previous,action:incoming.action||'',mode,turnNumber});
  const goalTick=deriveGoalTickState({previousRuntime:previous,directorTelemetry,turn,turnNumber,saveState:incoming.saveState||{}});
  const worldResultSurface=deriveWorldResultSurfaceState({previousRuntime:previous,directorTelemetry,turn,turnNumber});
  const sceneOrchestration=deriveSceneOrchestrationState({plan:orchestrationPlan,sceneDelta,purpose,exitCondition,turnHook,turnNumber});
  const factionChanges=array(turn?.state_delta?.faction_reputation_changes),hasFactionState=Boolean(previous.faction_social)||factionChanges.length>0;
  const factionSocial=hasFactionState?deriveFactionSocialState({
    previous:previous.faction_social,changes:factionChanges,turnNumber,
    sourceEvent:turn?.event_progress?.event_instance_id||turn?.director?.callback_key||turn?.scene_title||'',
    registeredNpcKeys:Object.keys(CHARACTER_REGISTRY),
  }):null;
  const timedAction=deriveTimedActionRuntime(previous,object(sceneIntent),incoming.action||'',turn,mode);
  return {
    scene_key:sceneKey,participants,objects:array(previous.objects).slice(0,10),
    positions:Object.fromEntries(Object.entries(object(previous.positions)).slice(0,10)),ongoing_topic:clampText(turn?.scene_summary||previous.ongoing_topic||'',280),
    unresolved_question:hasDecision?clampText(choices.join(' / '),300):'',immediate_pressure:clampText(previous.immediate_pressure||'',220),
    tone:clampText(turn?.importance||previous.tone||'routine',80),remaining_beats:hasDecision?[]:array(previous.remaining_beats).slice(0,1),purpose,exit_condition:exitCondition,turn_hook:turnHook,goal_tick:goalTick,world_result_surface:worldResultSurface,orchestration:sceneOrchestration,momentum,novelty,scene_delta:sceneDelta,timed_action:timedAction,...(factionSocial?{faction_social:factionSocial}:{}),...progressState,
  };
}
function clone(value){try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}}
function consumeContinuationRuntime(incoming,turn){const prev=clone(object(incoming.saveState?.sceneRuntime));prev.remaining_beats=array(prev.remaining_beats).slice();Object.assign(prev,mergeContinuationEventProgressState(prev.eventProgress,prev.eventProgressByInstance,turn?.event_progress));return{npc_updates:{},scene_runtime:prev};}

function localBackgroundDigest(incoming,turn,participants){
  const prior=String(incoming.saveState?.backgroundDigest||'').slice(-1100);if(incoming.backgroundSim===false)return prior;
  const turnNo=Number(incoming.saveState?.turnNumber||0),advance=Number(turn?.state_delta?.advance_minutes||0);if(turnNo%4!==0&&advance<30)return prior;
  const schedule=object(incoming.saveState?.scheduleContext?.npc_schedule),present=new Set(array(participants).map(String)),rows=[];
  for(const [key,info] of Object.entries(schedule)){if(present.has(key)||!info||typeof info!=='object')continue;const commitment=clampText(info.commitment||info.title||'',100),area=clampText(info.area||info.location||'',80);if(!commitment&&!area)continue;rows.push(`${key}: ${commitment}${area?` @ ${area}`:''}`);if(rows.length>=2)break;}
  if(!rows.length)return prior;const stamp=`${clampText(incoming.saveState?.world?.date||'',20)} ${clampText(incoming.saveState?.world?.time||'',10)}`.trim();return`${prior}${prior?'\n':''}[${stamp}] ${rows.join(' / ')}`.slice(-1800);
}

function textBag(item,saveState){const inner=object(saveState?.npcInnerStates)?.[item?.speaker_key]||{};return[item?.text,item?.emotion_reason,item?.emotion_transition,inner?.mood,inner?.social_stance].filter(Boolean).join(' ');}
function classifyExtendedExpression(item,saveState){
  if(!item||item.kind!=='dialogue')return null;const base=String(item.display_expression||item.detected_expression||item.expression||'default').toLowerCase(),bag=textBag(item,saveState),has=re=>re.test(bag);
  const strongAngry=base==='angry'&&has(/격노|분노|노기|고함|으르렁|죽여|닥쳐|이를\s*악물/i),strongShock=base==='shock'&&has(/경악|충격|소스라|화들짝|눈을\s*크게|믿을\s*수/i);
  if(has(/ㅋㅋ|하하|하핫|후후|후훗|키득|깔깔|풉|푸핫|웃음을?\s*(?:터뜨|참지\s*못)|폭소/i))return'laugh';
  if(has(/비웃|우쭐|의기양양|자신만만|능글|얄밉게\s*웃|씨익|깔보|도발적\s*미소|승리감|잘난\s*척/i))return'smug';
  if(!strongShock&&has(/당황|허둥|말을\s*더듬|말문이\s*막|얼굴.{0,8}(?:붉|빨개)|귀.{0,8}(?:붉|빨개)|시선을?\s*피하|쩔쩔/i))return'flustered';
  if(!strongAngry&&has(/짜증|성가|귀찮|신경질|못마땅|질린|진절머리|한숨|미간을\s*찌푸/i))return'annoyed';
  if(has(/걱정|불안|초조|염려|안절부절|조마조마|근심|신경\s*쓰|괜찮(?:아|냐|은지)/i))return'worried';
  if(!strongShock&&has(/혼란|의아|갸웃|어리둥절|이해(?:가|를)\s*(?:안|못)|무슨\s*뜻|영문을\s*모르|당혹/i))return'confused';return base;
}
function applyExtendedExpressions(turn,saveState){if(!turn||!Array.isArray(turn.scene))return turn;turn.scene=turn.scene.map(item=>item?.kind==='dialogue'?{...item,display_expression:classifyExtendedExpression(item,saveState),stable_extended_expression:true}:item);return turn;}
function isCombatLike(action=''){return /(전투|공격|베어|베고|찌르|쏘|회피|막아|막고|버티|버틴|버텨|견디|견딘|견뎌|패링|결투|대련|검기|오러|마법을?\s*쏘|주먹|발차기|기습|제압|죽이|살해)/i.test(String(action));}
function makeCaptureResponse(){return{statusCode:200,payload:null,headers:{},status(code){this.statusCode=Number(code)||200;return this;},json(payload){this.payload=payload;return this;},setHeader(name,value){this.headers[String(name).toLowerCase()]=value;return this;},getHeader(name){return this.headers[String(name).toLowerCase()];}};}
function setAdapterRoute(data,mode,pipeline,telemetry){data.route={...(data.route||{}),input_mode:mode,adapter_version:ADAPTER_VERSION,app_version:APP_VERSION,core_server_version:data.server_version||data.route?.server_version||'0.5.6',quality_pipeline:pipeline?.pipeline||'legacy',qa_result:pipeline?.qa_result||'SKIP',rewrite_applied:false,context_router:telemetry||null,scene_momentum:pipeline?.scene_momentum||null,scene_novelty:pipeline?.scene_novelty||null,scene_purpose:pipeline?.scene_purpose||null,scene_exit_condition:pipeline?.scene_exit_condition||null,turn_hook:pipeline?.turn_hook||null,scene_orchestration:pipeline?.scene_orchestration||null,npc_significance:pipeline?.npc_significance||null,event_consequence:pipeline?.event_consequence||null,world_result_surface:pipeline?.world_result_surface||null,faction_social:pipeline?.faction_social||null,combat_growth:pipeline?.combat_growth||null,skill_learning:pipeline?.skill_learning||null,awakening_talent:pipeline?.awakening_talent||null};data.server_version=ADAPTER_VERSION;return data;}
function routedNpcSignificance(turn,telemetry,mode){
  const boundary=telemetry?.npc_significance_v1||(mode==='meta'?deriveNpcSignificanceBoundary({mode:'meta'}):null);
  return boundary?applyNpcSignificanceReceipt(turn,{boundary}):null;
}
async function runCore(req,incoming,mode){const capture=makeCaptureResponse();const routedReq={method:req.method,headers:req.headers||{},body:incoming};const ctx={enabled:true,incoming,mode,telemetry:null};await ROUTER_CONTEXT.run(ctx,()=>coreHandler(routedReq,capture));return{status:capture.statusCode,data:capture.payload||{},telemetry:ctx.telemetry};}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'POST only',server_version:ADAPTER_VERSION});}
  try{
    const incoming0=req.body&&typeof req.body==='object'?req.body:{},mode=SUPPORTED_MODES.has(incoming0.inputMode)?incoming0.inputMode:'game',incoming={...incoming0};
    const resumableIds=mode==='game'?[...scheduledIdsDueByTurnEnd(incoming0.saveState,0),...unscheduledPausedIdsForResume(incoming0.saveState?.sceneRuntime,incoming0.action,incoming0.saveState?.activeEvents)]:[];
    incoming.saveState={...object(incoming0.saveState),sceneRuntime:mode==='game'?promotePausedEventProgress(incoming0.saveState?.sceneRuntime,resumableIds):object(incoming0.saveState?.sceneRuntime)};
    if(mode==='meta'){incoming.inputMode='meta';incoming.action=String(incoming0.action||'');}else if(mode==='continue'){incoming.inputMode='game';incoming.action=continueAction(incoming);incoming.saveState=continueRouteSave(incoming.saveState);incoming.forceTerra=false;incoming.rollingSummary=String(incoming0.rollingSummary||'').slice(-3600);}else if(mode==='auto'){incoming.inputMode='game';incoming.action=AUTO_DIRECTIVE;}else{incoming.inputMode='game';incoming.action=String(incoming0.action||'');}
    if(isCombatLike(incoming.action)&&incoming.reasoningEffort==='auto')incoming.reasoningEffort='medium';
    const result=await runCore(req,incoming,mode);if(result.status<200||result.status>=300)return res.status(result.status).json({...result.data,server_version:ADAPTER_VERSION,adapter_version:ADAPTER_VERSION});
    const data=result.data;if(!data?.turn)throw new Error('코어 API 응답에 turn이 없습니다.');
    rebaseStructuredEffectOwners(data.turn);
    let telemetry=result.telemetry||{routerVersion:routerVersion(),enabled:false,profile:'unknown'};telemetry={...telemetry,actual_input_tokens:Number(data?.usage?.input_tokens||0),actual_output_tokens:Number(data?.usage?.output_tokens||0)};if(Number(telemetry.soft_max_tokens||0)>0)telemetry.budget_status=telemetry.actual_input_tokens<=telemetry.soft_max_tokens?'OK':'OVER';
    if(mode==='continue'){lockContinueTurn(data.turn);applyExtendedExpressions(data.turn,incoming0.saveState||{});const npcSignificance=routedNpcSignificance(data.turn,telemetry,mode);data.runtime_state=consumeContinuationRuntime({...incoming,saveState:object(incoming0.saveState)},data.turn);data.background_digest=String(incoming.saveState?.backgroundDigest||'').slice(-1800);const pipeline={pipeline:'continue-stable-v156',stages:1,qa_result:'SKIP',rewrite_applied:false,background_sim:false,context_router:telemetry,event_director_v2:telemetry?.event_director_v2||null,event_director_v3:telemetry?.event_director_v3||null,event_director_v3_enabled:true,world_result_surface:data.runtime_state.scene_runtime?.world_result_surface||null,world_result_surfacing_v1:true,adaptive_time_scale_version:ADAPTIVE_TIME_SCALE_VERSION,adaptive_time_scale_v2:true,scene_novelty:data.runtime_state.scene_runtime?.novelty||null,scene_novelty_v1:true,scene_purpose:data.runtime_state.scene_runtime?.purpose||null,scene_purpose_v1:true,scene_exit_condition:data.runtime_state.scene_runtime?.exit_condition||null,scene_exit_condition_v1:true,turn_hook:data.runtime_state.scene_runtime?.turn_hook||null,turn_hook_v1:true,scene_orchestration:data.runtime_state.scene_runtime?.orchestration||telemetry?.scene_orchestration||null,scene_orchestration_v1:true,npc_significance:npcSignificance,npc_significance_v1:true,npc_motivation_v1:true,npc_goal_v2:true,relationship_reason_v1:true,faction_social_v1:true,combat_growth_v2:true,skill_learning_v1:true,awakening_talent_v1:true};data.pipeline=pipeline;setAdapterRoute(data,mode,pipeline,telemetry);return res.status(200).json(data);}
    if(mode==='meta'){if(data.turn?.state_delta){data.turn.state_delta.stat_progress=[];data.turn.state_delta.skill_experience=[];data.turn.state_delta.skill_learning=[];data.turn.state_delta.awakening_progress=[];data.turn.state_delta.talent_evolution=[];}const npcSignificance=routedNpcSignificance(data.turn,telemetry,mode);const pipeline={pipeline:'meta-full-stable-v156',stages:1,qa_result:'SKIP',rewrite_applied:false,background_sim:false,context_router:telemetry,event_director_v2:telemetry?.event_director_v2||null,event_director_v3:telemetry?.event_director_v3||null,event_director_v3_enabled:true,world_result_surface:null,world_result_surfacing_v1:true,adaptive_time_scale_version:ADAPTIVE_TIME_SCALE_VERSION,adaptive_time_scale_v2:true,scene_orchestration:telemetry?.scene_orchestration||null,scene_orchestration_v1:true,npc_significance:npcSignificance,npc_significance_v1:true,npc_motivation_v1:true,npc_goal_v2:true,relationship_reason_v1:true,faction_social_v1:true,combat_growth_v2:true,skill_learning_v1:true,awakening_talent_v1:true};data.pipeline=pipeline;setAdapterRoute(data,mode,pipeline,telemetry);return res.status(200).json(data);}
    applyExtendedExpressions(data.turn,incoming0.saveState||{});
    data.turn.choices=filterTurnHookChoices(incoming.action,{...data.turn,choices:freshChoices(incoming.action,data.turn)});
    const growthIntent=classifySceneIntent(incoming0.action||'',{location:incoming.saveState?.world?.location||'',currentTime:incoming.saveState?.world?.time||'',currentDate:incoming.saveState?.world?.date||'',currentWeekday:incoming.saveState?.world?.weekday||'',actorName:incoming.saveState?.pc?.name||'',resumeTimedAction:incoming.saveState?.sceneRuntime?.timed_action}),zeroElapsedRange=array(growthIntent.explicitDurationRangeMinutes).length===2&&growthIntent.explicitDurationRangeMinutes.every(value=>Number(value)===0),zeroElapsedIntent=mode==='game'&&(growthIntent.explicitDurationMinutes===0||zeroElapsedRange)&&Number(growthIntent.minAdvanceMinutes||0)<=0,growthAllowed=mode==='game'&&!zeroElapsedIntent,growthValidationScene=data.turn?.scene;
    if(data.turn?.state_delta)replaceStructuredEffectRows(data.turn,'skill_experience',mode==='auto'?[]:filterExistingSkillExperience(structuredEffectRows(data.turn,'skill_experience'),incoming0.saveState?.pc?.skills));
    const combatGrowthState=deriveCombatGrowthState({
      pc:incoming0.saveState?.pc,
      statChanges:structuredEffectRows(data.turn,'stat_progress'),
      skillChanges:structuredEffectRows(data.turn,'skill_experience'),
      action:incoming0.action||'',
      scene:growthValidationScene,
      resolutionLog:data.turn?.resolution_log,
      allowProgress:growthAllowed,
    });
    if(data.turn?.state_delta){replaceStructuredEffectRows(data.turn,'stat_progress',combatGrowthState.accepted_stat_progress);replaceStructuredEffectRows(data.turn,'skill_experience',combatGrowthState.accepted_skill_experience);}
    const skillLearningState=deriveSkillLearningState({
      existingSkills:incoming0.saveState?.pc?.skills,
      previousCandidates:incoming0.saveState?.pc?.skillCandidates,
      changes:structuredEffectRows(data.turn,'skill_learning'),
      action:incoming0.action||'',
      scene:growthValidationScene,
      turnNumber:Number(incoming0.saveState?.turnNumber||0)+1,
      allowProgress:growthAllowed,
    });
    if(data.turn?.state_delta)replaceStructuredEffectRows(data.turn,'skill_learning',skillLearningState.accepted_changes);
    const awakeningTalentState=deriveAwakeningTalentState({
      existingTraits:incoming0.saveState?.pc?.traits,
      existingAuthorities:incoming0.saveState?.pc?.authorities,
      talents:incoming0.saveState?.pc?.talents,
      previousCandidates:incoming0.saveState?.pc?.awakeningCandidates,
      previousTalentHistory:incoming0.saveState?.pc?.talentEvolutionHistory,
      awakeningChanges:structuredEffectRows(data.turn,'awakening_progress'),
      talentEvolutionChanges:structuredEffectRows(data.turn,'talent_evolution'),
      action:incoming0.action||'',
      saveState:incoming0.saveState||{},
      scene:growthValidationScene,
      turnNumber:Number(incoming0.saveState?.turnNumber||0)+1,
      allowProgress:growthAllowed,
    });
    if(data.turn?.state_delta){
      replaceStructuredEffectRows(data.turn,'awakening_progress',awakeningTalentState.accepted_awakening_changes);
      replaceStructuredEffectRows(data.turn,'talent_evolution',awakeningTalentState.accepted_talent_evolution);
    }
    const consequenceId=String(telemetry?.event_director_v2?.event_consequence_id||'');
    const selectedConsequence=findEventConsequence(incoming.saveState,consequenceId);
    const {visible_scene:consequenceVisibleScene,...consequenceEffects}=consequenceNpcEffectsForShortening(data.turn,selectedConsequence,telemetry?.event_director_v2?.event_consequence_npc_keys),consequenceLifecycleBase=reconcileEventConsequenceLifecycle({saveState:incoming.saveState,turn:data.turn,selectedConsequence});
    const consequenceLifecycle={...consequenceLifecycleBase,...consequenceEffects};
    const sceneIntent=applySceneMomentumTimeFloor({...incoming0,saveState:incoming.saveState,action:incoming0.action||''},data.turn,mode,consequenceLifecycle,consequenceVisibleScene,{director_occurrence_id:telemetry?.event_director_v2?.occurrence_id,choice_event_ids:resumableIds});
    let timePlan;try{timePlan=parseTimePlan(incoming0.action||'',{location:incoming.saveState?.world?.location||'',currentTime:incoming.saveState?.world?.time||'',currentDate:incoming.saveState?.world?.date||'',currentWeekday:incoming.saveState?.world?.weekday||'',actorName:incoming.saveState?.pc?.name||''});}catch{timePlan={version:TIME_PLAN_PARSER_VERSION,mode:'shadow',clauses:[],diagnostics:['shadow-parser-error']};}const timePlanTelemetry=summarizeTimePlan(timePlan,sceneIntent);
    let persistedCombatGrowthState=combatGrowthState,persistedSkillLearningState=skillLearningState,persistedAwakeningTalentState=awakeningTalentState;
    if(data.turn?.state_delta&&(data.turn.state_delta.stat_progress!==combatGrowthState.accepted_stat_progress||data.turn.state_delta.skill_experience!==combatGrowthState.accepted_skill_experience)){
      persistedCombatGrowthState=deriveCombatGrowthState({pc:incoming0.saveState?.pc,statChanges:structuredEffectRows(data.turn,'stat_progress'),skillChanges:structuredEffectRows(data.turn,'skill_experience'),action:incoming0.action||'',scene:growthValidationScene,resolutionLog:data.turn?.resolution_log,allowProgress:growthAllowed});
      replaceStructuredEffectRows(data.turn,'stat_progress',persistedCombatGrowthState.accepted_stat_progress);replaceStructuredEffectRows(data.turn,'skill_experience',persistedCombatGrowthState.accepted_skill_experience);
    }
    if(data.turn?.state_delta&&data.turn.state_delta.skill_learning!==skillLearningState.accepted_changes){
      persistedSkillLearningState=deriveSkillLearningState({existingSkills:incoming0.saveState?.pc?.skills,previousCandidates:incoming0.saveState?.pc?.skillCandidates,changes:structuredEffectRows(data.turn,'skill_learning'),action:incoming0.action||'',scene:growthValidationScene,turnNumber:Number(incoming0.saveState?.turnNumber||0)+1,allowProgress:growthAllowed});
      replaceStructuredEffectRows(data.turn,'skill_learning',persistedSkillLearningState.accepted_changes);
    }
    if(data.turn?.state_delta&&(data.turn.state_delta.awakening_progress!==awakeningTalentState.accepted_awakening_changes||data.turn.state_delta.talent_evolution!==awakeningTalentState.accepted_talent_evolution)){
      persistedAwakeningTalentState=deriveAwakeningTalentState({existingTraits:incoming0.saveState?.pc?.traits,existingAuthorities:incoming0.saveState?.pc?.authorities,talents:incoming0.saveState?.pc?.talents,previousCandidates:incoming0.saveState?.pc?.awakeningCandidates,previousTalentHistory:incoming0.saveState?.pc?.talentEvolutionHistory,awakeningChanges:structuredEffectRows(data.turn,'awakening_progress'),talentEvolutionChanges:structuredEffectRows(data.turn,'talent_evolution'),action:incoming0.action||'',saveState:incoming0.saveState||{},scene:growthValidationScene,turnNumber:Number(incoming0.saveState?.turnNumber||0)+1,allowProgress:growthAllowed});
      replaceStructuredEffectRows(data.turn,'awakening_progress',persistedAwakeningTalentState.accepted_awakening_changes);replaceStructuredEffectRows(data.turn,'talent_evolution',persistedAwakeningTalentState.accepted_talent_evolution);
    }
    const npcSignificance=routedNpcSignificance(data.turn,telemetry,mode);
    const runtimeTurn=runtimeSynthesisTurn(data.turn,sceneIntent);
    const sceneRuntime=localSceneRuntime({...incoming0,saveState:incoming.saveState,action:incoming0.action||''},runtimeTurn,telemetry?.event_director_v2,mode,telemetry?.scene_orchestration,sceneIntent);
    const npcUpdates=incoming0.qualityPipeline===false?{}:localNpcUpdates(incoming0,runtimeTurn);
    const offscreenProgression=deriveBoundedOffscreenProgression({saveState:incoming.saveState,turn:runtimeTurn,participants:sceneRuntime.participants,enabled:incoming0.backgroundSim!==false});
    data.runtime_state={npc_updates:npcUpdates,scene_runtime:sceneRuntime,offscreen_npc_updates:offscreenProgression.npc_state_updates,skill_learning:persistedSkillLearningState,awakening_talent:persistedAwakeningTalentState};
    data.background_digest=appendOffscreenDigest(localBackgroundDigest(incoming0,runtimeTurn,sceneRuntime.participants),offscreenProgression);
    const sceneMomentum={version:SCENE_MOMENTUM_VERSION,intent:sceneIntent?.kind||sceneRuntime?.momentum?.last_intent||'generic',time_profile:sceneIntent?.timeProfile||'contextual',adaptive_time_scale_version:ADAPTIVE_TIME_SCALE_VERSION,score:Number(sceneRuntime?.momentum?.last_score||0),structural_score:Number(sceneRuntime?.momentum?.last_structural_score||0),target:Number(sceneRuntime?.momentum?.last_target||0),stall_streak:Number(sceneRuntime?.momentum?.stall_streak||0),pressure:sceneRuntime?.momentum?.pressure||'normal'};
    const sceneNovelty={version:SCENE_NOVELTY_VERSION,repetition_streak:Number(sceneRuntime?.novelty?.repetition_streak||0),last_similarity:Number(sceneRuntime?.novelty?.last_similarity||0),repeated_terms:array(sceneRuntime?.novelty?.repeated_terms).slice(0,8)};
    const factionSocialTelemetry=compactFactionSocialTelemetry(sceneRuntime.faction_social,incoming.saveState?.sceneRuntime?.faction_social);
    const combatGrowthTelemetry=compactCombatGrowthTelemetry(persistedCombatGrowthState);
    const skillLearningTelemetry=compactSkillLearningTelemetry(persistedSkillLearningState);
    const awakeningTalentTelemetry=compactAwakeningTalentTelemetry(persistedAwakeningTalentState);
    const pipeline={pipeline:incoming0.qualityPipeline===false?'single-writer-stable-v156-hf1':'single-pass-q3-stable-v156-hf1',stages:1,qa_result:incoming0.qualityPipeline===false?'SKIP':'LOCAL_GUARD',rewrite_applied:false,background_sim:false,background_local:incoming0.backgroundSim!==false,offscreen_progression:offscreenProgression.telemetry,offscreen_progression_v2:true,living_world_v1:true,combat_engine:isCombatLike(incoming.action),combat_growth:combatGrowthTelemetry,combat_growth_v2:true,runtime_synthesized:true,continuation_beats:array(sceneRuntime.remaining_beats).length,context_router:telemetry,event_director_v2:telemetry?.event_director_v2||null,event_director_v3:telemetry?.event_director_v3||null,event_director_v3_enabled:true,world_result_surface:sceneRuntime.world_result_surface||null,world_result_surfacing_v1:true,adaptive_time_scale_version:ADAPTIVE_TIME_SCALE_VERSION,adaptive_time_scale_v2:true,time_plan_parser:timePlanTelemetry,time_plan_parser_v1:true,scene_momentum:sceneMomentum,scene_momentum_v1:true,scene_novelty:sceneNovelty,scene_novelty_v1:true,scene_purpose:sceneRuntime.purpose||null,scene_purpose_v1:true,scene_exit_condition:sceneRuntime.exit_condition||null,scene_exit_condition_v1:true,turn_hook:sceneRuntime.turn_hook||null,turn_hook_v1:true,scene_orchestration:sceneRuntime.orchestration||null,scene_orchestration_v1:true,npc_significance:npcSignificance,npc_significance_v1:true,event_consequence:consequenceLifecycle,event_consequence_v1:true,npc_motivation_v1:true,npc_goal_v2:true,npc_goal_tick:sceneRuntime.goal_tick||null,npc_goal_tick_v1:true,relationship_reason_v1:true,faction_social:factionSocialTelemetry,faction_social_v1:true,skill_learning:skillLearningTelemetry,skill_learning_v1:true,awakening_talent:awakeningTalentTelemetry,awakening_talent_v1:true,note:'V1.5.6 Scene Momentum Recovery HF1 keeps one core model call while restoring semantic action compression, deterministic State Delta/stall tracking, NPC initiative, downtime skip, and meaningful stop points. Adaptive Time Scale V2 gives dialogue, meals, training, classes, sleep, and distance-sensitive travel bounded natural time guides while preserving schedule boundaries and freeze paths. Time Plan Parser Phase 1 records a structured shadow plan for comparison while legacy execution remains authoritative. Living World V1 records bounded public off-screen schedule starts and propagates only explicitly confirmed completions to absent known NPC state and the background digest. Event Director V3 surfaces at most one confirmed public world result through a plausible in-scene channel without inventing outcomes or bypassing player/event/schedule authority. Multi-System Scene Orchestration V1 selects one primary driver and at most one causal secondary response while treating relationship, faction, growth, off-screen, and novelty systems as effects. NPC Significance Evaluator V1 lets the canonical model choose up to one foreground primary and one causal support from routed candidates while deterministic code enforces only hard bounds. Combat Growth V2 accepts only PC-attributed, evidence-backed stat and existing-skill adaptation, applies grade-aware caps, and freezes META/AUTO/CONTINUE. Skill Learning V1 persists bounded candidates; Awakening / Talent Evolution V1 keeps rare growth behind milestone and mythic-source gates.'};
    data.pipeline=pipeline;setAdapterRoute(data,mode,pipeline,telemetry);return res.status(200).json(data);
  }catch(error){console.error('[V1.5.6]',error);return res.status(Number.isInteger(error?.status)?error.status:500).json({error:error?.message||String(error),code:error?.code||'STABLE_ROUTER_V156_ERROR',server_version:ADAPTER_VERSION});}
}

export { applySceneMomentumTimeFloor, goalRuntimeFor, patchGoalV2StructuredFormat };
