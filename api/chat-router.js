// LUMENSIA MOBILE V1.5.6 — Stable Router + Event Director V2.1
// External API version: 0.8.2
// NPC Goal V2 + Relationship Reason V1.
// One canonical core call per turn, but intercepts the final OpenAI request server-side
// and replaces full CANON/save/history with a relevance-routed context budget.

import OpenAI from 'openai';
import { AsyncLocalStorage } from 'node:async_hooks';
import coreHandler, { CHARACTER_REGISTRY } from './chat.js';
import { routeOpenAIParams, routerVersion, array, object, clampText } from './lib/context-router.js';
import { actualScheduledEntrants, freshChoices, reconcileParticipants } from '../lib/scene-continuity.js';
import { SCENE_MOMENTUM_VERSION, classifySceneIntent, deriveSceneDelta, isPcRelevantScheduleEvent, nextScheduleBoundaryMinutes, scheduleBoundaryLimitMinutes, updateSceneMomentum } from '../lib/scene-momentum.js';
import { deriveScenePurpose } from '../lib/scene-purpose.js';
import { deriveSceneExitCondition, evaluateSceneExitCondition } from '../lib/scene-exit.js';
import { deriveTurnHook, filterTurnHookChoices } from '../lib/turn-hook.js';
import { compactEventProgress, mergeContinuationEventProgressState, mergeRoutedEventProgressState, occurrenceIdFromStartEvidence, promotePausedEventProgress, scheduledIdsDueByTurnEnd, unscheduledPausedIdsForResume } from '../lib/event-progress.js';
import { findEventConsequence, minutesUntilEventConsequence, reconcileEventConsequenceLifecycle } from '../lib/event-consequence.js';
import { deriveGoalTickState } from '../lib/npc-goal-tick.js';

export const config = { maxDuration: 300 };

const ADAPTER_VERSION = '0.8.3';
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
    if(stateDelta?.properties?.hooks_add&&!stateDelta.properties.delayed_consequences_add){
      stateDelta.properties.delayed_consequences_add=delayedConsequenceFieldSchema();
      stateDelta.required=[...new Set([...(Array.isArray(stateDelta.required)?stateDelta.required:[]),'delayed_consequences_add'])];
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
  return {...params,instructions:`${String(params.instructions||'')}\n\n${GOAL_V2_RULES}`,text:{...(params.text||{}),format:patchedFormat}};
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
    relationship_changes:[],intimacy_changes:[],stat_progress:[],skill_experience:[],
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
function applySceneMomentumTimeFloor(incoming,turn,mode='game',consequenceLifecycle=null){
  const intent=classifySceneIntent(incoming?.action||'',{location:incoming?.saveState?.world?.location||''});
  if(mode!=='game'||!turn?.state_delta||!intent.compression||intent.minAdvanceMinutes<=0)return intent;
  const hasMeaningfulStop=array(turn?.choices).length>0;
  const current=Math.max(0,Number(turn.state_delta.advance_minutes||0));
  const requestedFloor=Math.min(1440,Math.max(0,Number(intent.minAdvanceMinutes||0)));
  const scheduleBoundary=nextScheduleBoundaryMinutes(incoming?.saveState||{},{futureOnly:true});
  const consequenceBoundary=consequenceLifecycle?.selected_id?minutesUntilEventConsequence(incoming?.saveState||{},consequenceLifecycle.selected_id):null;
  const boundaries=[scheduleBoundary,consequenceBoundary].filter(value=>value!=null&&Number.isFinite(Number(value))).map(Number);
  const boundary=boundaries.length?Math.min(...boundaries):null;
  const boundedFloor=boundary==null?requestedFloor:Math.min(requestedFloor,Math.max(0,boundary));
  const allowedMax=scheduleBoundaryLimitMinutes(intent);
  const eventId=String(turn?.event_progress?.event_instance_id||turn?.event_progress?.eventInstanceId||'').trim().toLowerCase();
  const dueAtBoundary=new Set(scheduleBoundary==null?[]:scheduledIdsDueByTurnEnd(incoming?.saveState||{},scheduleBoundary).map(value=>String(value).trim().toLowerCase()));
  const dueBeforeBoundary=new Set(scheduleBoundary==null?[]:scheduledIdsDueByTurnEnd(incoming?.saveState||{},Math.max(0,scheduleBoundary-1)).map(value=>String(value).trim().toLowerCase()));
  const boundaryRows=scheduleRowsAtBoundary(incoming?.saveState||{},scheduleBoundary),boundaryIds=new Set(boundaryRows.map(row=>String(row?.id||'').trim().toLowerCase()).filter(Boolean)),structuredBoundary=Boolean(eventId&&boundaryIds.has(eventId)&&dueAtBoundary.has(eventId)&&!dueBeforeBoundary.has(eventId)),visibleBoundary=Boolean(!eventId&&boundaryRows.some(row=>scheduleRowMentioned(turn,row)));
  const reachedScheduledBoundary=Boolean(scheduleBoundary!=null&&scheduleBoundary===boundary&&boundary<=allowedMax&&(structuredBoundary||visibleBoundary));
  const reachedConsequenceBoundary=Boolean(consequenceBoundary!=null&&consequenceBoundary===boundary&&boundary<=allowedMax&&consequenceLifecycle?.status==='resolved');
  if(!hasMeaningfulStop||reachedScheduledBoundary||reachedConsequenceBoundary){
    turn.state_delta.advance_minutes=Math.max(current,reachedScheduledBoundary||reachedConsequenceBoundary?boundary:boundedFloor);
  }
  return intent;
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
  const speakerRows=array(turn?.scene).filter(x=>x?.speaker_key);
  const relationKeys=array(turn?.state_delta?.relationship_changes).map(x=>String(x?.npc_key||x?.key||'')).filter(Boolean);
  const stateKeys=array(turn?.state_delta?.npc_state_updates).map(x=>String(x?.npc_key||x?.key||'')).filter(Boolean);
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
    };
  }
  return out;
}

function localSceneRuntime(incoming,turn,directorTelemetry=null,mode='game'){
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
  const purpose=deriveScenePurpose({previousRuntime:previous,turn,sceneDelta,eventProgress:progressState.eventProgress,action:incoming.action||'',sceneKey,turnNumber});
  const proposedExit=deriveSceneExitCondition({action:incoming.action||'',saveState:incoming.saveState||{},purpose,turnNumber});
  const exitCondition=evaluateSceneExitCondition(proposedExit,{turn,sceneDelta,previousRuntime:previous,eventProgress:progressState.eventProgress});
  const turnHook=deriveTurnHook({turn,sceneDelta,purpose,exitCondition,eventProgress:progressState.eventProgress,previousRuntime:previous,action:incoming.action||'',mode,turnNumber});
  const goalTick=deriveGoalTickState({previousRuntime:previous,directorTelemetry,turn,turnNumber});
  return {
    scene_key:sceneKey,participants,objects:array(previous.objects).slice(0,10),
    positions:Object.fromEntries(Object.entries(object(previous.positions)).slice(0,10)),ongoing_topic:clampText(turn?.scene_summary||previous.ongoing_topic||'',280),
    unresolved_question:hasDecision?clampText(choices.join(' / '),300):'',immediate_pressure:clampText(previous.immediate_pressure||'',220),
    tone:clampText(turn?.importance||previous.tone||'routine',80),remaining_beats:hasDecision?[]:array(previous.remaining_beats).slice(0,1),purpose,exit_condition:exitCondition,turn_hook:turnHook,goal_tick:goalTick,momentum,scene_delta:sceneDelta,...progressState,
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
function isCombatLike(action=''){return /(전투|공격|베어|베고|찌르|쏘|회피|막아|막고|패링|결투|대련|검기|오러|마법을?\s*쏘|주먹|발차기|기습|제압|죽이|살해)/i.test(String(action));}
function makeCaptureResponse(){return{statusCode:200,payload:null,headers:{},status(code){this.statusCode=Number(code)||200;return this;},json(payload){this.payload=payload;return this;},setHeader(name,value){this.headers[String(name).toLowerCase()]=value;return this;},getHeader(name){return this.headers[String(name).toLowerCase()];}};}
function setAdapterRoute(data,mode,pipeline,telemetry){data.route={...(data.route||{}),input_mode:mode,adapter_version:ADAPTER_VERSION,app_version:APP_VERSION,core_server_version:data.server_version||data.route?.server_version||'0.5.6',quality_pipeline:pipeline?.pipeline||'legacy',qa_result:pipeline?.qa_result||'SKIP',rewrite_applied:false,context_router:telemetry||null,scene_momentum:pipeline?.scene_momentum||null,scene_purpose:pipeline?.scene_purpose||null,scene_exit_condition:pipeline?.scene_exit_condition||null,turn_hook:pipeline?.turn_hook||null,event_consequence:pipeline?.event_consequence||null};data.server_version=ADAPTER_VERSION;return data;}
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
    let telemetry=result.telemetry||{routerVersion:routerVersion(),enabled:false,profile:'unknown'};telemetry={...telemetry,actual_input_tokens:Number(data?.usage?.input_tokens||0),actual_output_tokens:Number(data?.usage?.output_tokens||0)};if(Number(telemetry.soft_max_tokens||0)>0)telemetry.budget_status=telemetry.actual_input_tokens<=telemetry.soft_max_tokens?'OK':'OVER';
    if(mode==='continue'){lockContinueTurn(data.turn);applyExtendedExpressions(data.turn,incoming0.saveState||{});data.runtime_state=consumeContinuationRuntime({...incoming,saveState:object(incoming0.saveState)},data.turn);data.background_digest=String(incoming.saveState?.backgroundDigest||'').slice(-1800);const pipeline={pipeline:'continue-stable-v156',stages:1,qa_result:'SKIP',rewrite_applied:false,background_sim:false,context_router:telemetry,event_director_v2:telemetry?.event_director_v2||null,scene_purpose:data.runtime_state.scene_runtime?.purpose||null,scene_purpose_v1:true,scene_exit_condition:data.runtime_state.scene_runtime?.exit_condition||null,scene_exit_condition_v1:true,turn_hook:data.runtime_state.scene_runtime?.turn_hook||null,turn_hook_v1:true,npc_motivation_v1:true,npc_goal_v2:true,relationship_reason_v1:true};data.pipeline=pipeline;setAdapterRoute(data,mode,pipeline,telemetry);return res.status(200).json(data);}
    if(mode==='meta'){const pipeline={pipeline:'meta-full-stable-v156',stages:1,qa_result:'SKIP',rewrite_applied:false,background_sim:false,context_router:telemetry,event_director_v2:telemetry?.event_director_v2||null,npc_motivation_v1:true,npc_goal_v2:true,relationship_reason_v1:true};data.pipeline=pipeline;setAdapterRoute(data,mode,pipeline,telemetry);return res.status(200).json(data);}
    applyExtendedExpressions(data.turn,incoming0.saveState||{});data.turn.choices=filterTurnHookChoices(incoming.action,{...data.turn,choices:freshChoices(incoming.action,data.turn)});const consequenceId=String(telemetry?.event_director_v2?.event_consequence_id||'');const selectedConsequence=findEventConsequence(incoming.saveState,consequenceId);const consequenceLifecycle=reconcileEventConsequenceLifecycle({saveState:incoming.saveState,turn:data.turn,selectedConsequence});const sceneIntent=applySceneMomentumTimeFloor({...incoming0,saveState:incoming.saveState,action:incoming0.action||''},data.turn,mode,consequenceLifecycle);const sceneRuntime=localSceneRuntime({...incoming0,saveState:incoming.saveState,action:incoming0.action||''},data.turn,telemetry?.event_director_v2,mode);const npcUpdates=incoming0.qualityPipeline===false?{}:localNpcUpdates(incoming0,data.turn);data.runtime_state={npc_updates:npcUpdates,scene_runtime:sceneRuntime};data.background_digest=localBackgroundDigest(incoming0,data.turn,sceneRuntime.participants);
    const sceneMomentum={version:SCENE_MOMENTUM_VERSION,intent:sceneIntent?.kind||sceneRuntime?.momentum?.last_intent||'generic',score:Number(sceneRuntime?.momentum?.last_score||0),structural_score:Number(sceneRuntime?.momentum?.last_structural_score||0),target:Number(sceneRuntime?.momentum?.last_target||0),stall_streak:Number(sceneRuntime?.momentum?.stall_streak||0),pressure:sceneRuntime?.momentum?.pressure||'normal'};
    const pipeline={pipeline:incoming0.qualityPipeline===false?'single-writer-stable-v156-hf1':'single-pass-q3-stable-v156-hf1',stages:1,qa_result:incoming0.qualityPipeline===false?'SKIP':'LOCAL_GUARD',rewrite_applied:false,background_sim:false,background_local:incoming0.backgroundSim!==false,combat_engine:isCombatLike(incoming.action),runtime_synthesized:true,continuation_beats:array(sceneRuntime.remaining_beats).length,context_router:telemetry,event_director_v2:telemetry?.event_director_v2||null,scene_momentum:sceneMomentum,scene_momentum_v1:true,scene_purpose:sceneRuntime.purpose||null,scene_purpose_v1:true,scene_exit_condition:sceneRuntime.exit_condition||null,scene_exit_condition_v1:true,turn_hook:sceneRuntime.turn_hook||null,turn_hook_v1:true,event_consequence:consequenceLifecycle,event_consequence_v1:true,npc_motivation_v1:true,npc_goal_v2:true,npc_goal_tick:sceneRuntime.goal_tick||null,npc_goal_tick_v1:true,relationship_reason_v1:true,note:'V1.5.6 Scene Momentum Recovery HF1 keeps one core model call while restoring semantic action compression, deterministic State Delta/stall tracking, NPC initiative, downtime skip, and meaningful stop points. Scene Purpose V1 adds bounded scene-focus continuity; Explicit Scene Exit Condition V1 adds deterministic stop boundaries; Stronger Turn Hook V1 keeps a concrete next direction; Event Consequence V1 gives delayed causal results a bounded persisted lifecycle; NPC Goal Tick V1 lets an eligible present NPC pursue a high-drive goal after player-owned action resolution without bypassing fixed-flow guards.'};
    data.pipeline=pipeline;setAdapterRoute(data,mode,pipeline,telemetry);return res.status(200).json(data);
  }catch(error){console.error('[V1.5.6]',error);return res.status(Number.isInteger(error?.status)?error.status:500).json({error:error?.message||String(error),code:error?.code||'STABLE_ROUTER_V156_ERROR',server_version:ADAPTER_VERSION});}
}

export { applySceneMomentumTimeFloor, goalRuntimeFor, patchGoalV2StructuredFormat };
