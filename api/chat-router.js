// LUMENSIA MOBILE V1.5.4 — Stable Router + Event Director V2
// External API version: 0.8.0
// One canonical core call per turn, but intercepts the final OpenAI request server-side
// and replaces full CANON/save/history with a relevance-routed context budget.

import OpenAI from 'openai';
import { AsyncLocalStorage } from 'node:async_hooks';
import coreHandler from './chat.js';
import { routeOpenAIParams, routerVersion, array, object, clampText } from './lib/context-router.js';
import { freshChoices, reconcileParticipants } from '../lib/scene-continuity.js';

export const config = { maxDuration: 300 };

const ADAPTER_VERSION = '0.8.0';
const APP_VERSION = '1.5.4';
const SUPPORTED_MODES = new Set(['game','meta','auto','continue']);
const ROUTER_CONTEXT = new AsyncLocalStorage();
const PATCH_SYMBOL = Symbol.for('lumensia.stable.responses.parse.router.v154');

const AUTO_DIRECTIVE = String.raw`[LUMENSIA V1.5.4 AUTO FLOW]
이 요청은 PC의 행동/대사/생각/감정/결정이 아니다. PC는 새 행동을 하지 않았다.
현재 같은 장면에서 PC 개입이 필요 없는 흐름만 진행한다. 이미 시작된 NPC의 말, NPC끼리의 상호작용, 이미 예정되어 진행 중인 절차만 허용한다.
PC가 대답/판단/행동해야 하는 첫 지점에서 즉시 멈춘다. AUTO를 핑계로 새 사건·새 인물·새 장소를 억지로 삽입하지 않는다.`;

const CONTINUE_DIRECTIVE = String.raw`[LUMENSIA V1.5.4 CONTINUE]
이 요청은 PC 행동이 아니다. 직전 GM 응답의 같은 순간/같은 장면을 문학적으로 조금 더 이어 쓴다.
시간·위치·관계·기억·성장·일정·훅·보상·감정 저장상태를 변경하지 않는다. 직전 state_delta를 절대 다시 적용하지 않는다.
PC의 행동·대사·감정·생각·수락·거절을 새로 만들지 않는다.`;

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
    return originalParse.call(this,routed.params,options);
  };
}
installResponsesRouter();

function emptyStateDelta() {
  return {
    advance_minutes:0,new_location:null,pc_status:null,fatigue_delta:0,gold_delta:0,
    relationship_changes:[],intimacy_changes:[],stat_progress:[],skill_experience:[],
    items_add:[],items_remove:[],active_events_add:[],active_events_remove:[],completed_events_add:[],
    pc_knowledge_add:[],scheduled_events_add:[],scheduled_events_complete:[],hooks_add:[],hooks_update:[],
    memories_add:[],npc_state_updates:[],
  };
}

function continueAction(incoming) {
  const runtime = object(incoming.saveState?.sceneRuntime);
  const beat = array(runtime.remaining_beats)[0] || '';
  return clampText(`${CONTINUE_DIRECTIVE}${beat?`\n미처리 같은-장면 beat: ${beat}`:''}\n직전 장면 연속성: ${clampText(runtime,900)}`,5000);
}

function lockContinueTurn(turn) {
  if (!turn || typeof turn !== 'object') return turn;
  turn.state_delta = emptyStateDelta();
  turn.emotion_updates = [];
  turn.cg_id = null;
  turn.director = {
    intervention:'none',beat:'routine',event_kind:'none',spotlight_keys:[],callback_key:null,callback_phase:'none',callback_note:null,
    reason:'V1.5.4 CONTINUE hard freeze',
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

function localNpcUpdates(incoming,turn){
  const previous=object(incoming.saveState?.npcInnerStates);
  const speakerRows=array(turn?.scene).filter(x=>x?.speaker_key);
  const keys=[...new Set(speakerRows.map(x=>String(x.speaker_key)).filter(Boolean))].slice(0,4);
  const out={};
  for(const key of keys){
    const old=object(previous[key]);
    const lastDialogue=[...speakerRows].reverse().find(x=>String(x.speaker_key)===key)||{};
    const em=emotionFor(turn,key)||{}; const rel=relationChangeFor(turn,key)||{}; const npc=npcStateUpdateFor(turn,key)||{};
    const expression=em.expression||em.current||lastDialogue.display_expression||lastDialogue.expression||'';
    const cause=clampText(rel.cause||rel.reason||em.reason||'',150);
    const follow=clampText(rel.followup||npc.current_goal||npc.goal||'',160);
    out[key]={
      mood:moodFromExpression(expression)||old.mood||'',
      social_stance:clampText(rel.status||old.social_stance||'',80),
      opinion_of_pc:cause?`최근 인상: ${cause}`:clampText(old.opinion_of_pc||'',180),
      short_term_plan:follow||clampText(old.short_term_plan||'',180),
      concern:clampText(npc.concern||old.concern||'',180),
      wants_from_pc:clampText(npc.wants_from_pc||old.wants_from_pc||'',180),
      unresolved_issue:clampText(old.unresolved_issue||'',180),
    };
  }
  return out;
}

function localSceneRuntime(incoming,turn){
  const previous=object(incoming.saveState?.sceneRuntime);
  const participants=reconcileParticipants({previous:previous.participants,turn,recentTurns:incoming.recentTurns});
  const choices=array(turn?.choices).map(x=>clampText(x,140)).filter(Boolean).slice(0,3);
  const hasDecision=choices.length>0;
  return {
    scene_key:clampText(turn?.scene_title||previous.scene_key||'scene',120),
    participants,
    objects:array(previous.objects).slice(0,10),
    positions:Object.fromEntries(Object.entries(object(previous.positions)).slice(0,10)),
    ongoing_topic:clampText(turn?.scene_summary||previous.ongoing_topic||'',280),
    unresolved_question:hasDecision?clampText(choices.join(' / '),300):'',
    immediate_pressure:clampText(previous.immediate_pressure||'',220),
    tone:clampText(turn?.importance||previous.tone||'routine',80),
    remaining_beats:hasDecision?[]:array(previous.remaining_beats).slice(0,1),
  };
}
function clone(value){try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}}
function consumeContinuationRuntime(incoming){const prev=clone(object(incoming.saveState?.sceneRuntime));prev.remaining_beats=array(prev.remaining_beats).slice(1);return{npc_updates:{},scene_runtime:prev};}

function localBackgroundDigest(incoming,turn,participants){
  const prior=String(incoming.saveState?.backgroundDigest||'').slice(-1100);
  if(incoming.backgroundSim===false)return prior;
  const turnNo=Number(incoming.saveState?.turnNumber||0); const advance=Number(turn?.state_delta?.advance_minutes||0);
  if(turnNo%4!==0&&advance<30)return prior;
  const schedule=object(incoming.saveState?.scheduleContext?.npc_schedule); const present=new Set(array(participants).map(String)); const rows=[];
  for(const [key,info] of Object.entries(schedule)){
    if(present.has(key)||!info||typeof info!=='object')continue;
    const commitment=clampText(info.commitment||info.title||'',100); const area=clampText(info.area||info.location||'',80);
    if(!commitment&&!area)continue; rows.push(`${key}: ${commitment}${area?` @ ${area}`:''}`); if(rows.length>=2)break;
  }
  if(!rows.length)return prior;
  const stamp=`${clampText(incoming.saveState?.world?.date||'',20)} ${clampText(incoming.saveState?.world?.time||'',10)}`.trim();
  return `${prior}${prior?'\n':''}[${stamp}] ${rows.join(' / ')}`.slice(-1800);
}

function textBag(item,saveState){const inner=object(saveState?.npcInnerStates)?.[item?.speaker_key]||{};return[item?.text,item?.emotion_reason,item?.emotion_transition,inner?.mood,inner?.social_stance].filter(Boolean).join(' ');}
function classifyExtendedExpression(item,saveState){
  if(!item||item.kind!=='dialogue')return null;
  const base=String(item.display_expression||item.detected_expression||item.expression||'default').toLowerCase(); const bag=textBag(item,saveState); const has=re=>re.test(bag);
  const strongAngry=base==='angry'&&has(/격노|분노|노기|고함|으르렁|죽여|닥쳐|이를\s*악물/i); const strongShock=base==='shock'&&has(/경악|충격|소스라|화들짝|눈을\s*크게|믿을\s*수/i);
  if(has(/ㅋㅋ|하하|하핫|후후|후훗|키득|깔깔|풉|푸핫|웃음을?\s*(?:터뜨|참지\s*못)|폭소/i))return'laugh';
  if(has(/비웃|우쭐|의기양양|자신만만|능글|얄밉게\s*웃|씨익|깔보|도발적\s*미소|승리감|잘난\s*척/i))return'smug';
  if(!strongShock&&has(/당황|허둥|말을\s*더듬|말문이\s*막|얼굴.{0,8}(?:붉|빨개)|귀.{0,8}(?:붉|빨개)|시선을?\s*피하|쩔쩔/i))return'flustered';
  if(!strongAngry&&has(/짜증|성가|귀찮|신경질|못마땅|질린|진절머리|한숨|미간을\s*찌푸/i))return'annoyed';
  if(has(/걱정|불안|초조|염려|안절부절|조마조마|근심|신경\s*쓰|괜찮(?:아|냐|은지)/i))return'worried';
  if(!strongShock&&has(/혼란|의아|갸웃|어리둥절|이해(?:가|를)\s*(?:안|못)|무슨\s*뜻|영문을\s*모르|당혹/i))return'confused';
  return base;
}
function applyExtendedExpressions(turn,saveState){if(!turn||!Array.isArray(turn.scene))return turn;turn.scene=turn.scene.map(item=>item?.kind==='dialogue'?{...item,display_expression:classifyExtendedExpression(item,saveState),stable_extended_expression:true}:item);return turn;}

function isCombatLike(action=''){return /(전투|공격|베어|베고|찌르|쏘|회피|막아|막고|패링|결투|대련|검기|오러|마법을?\s*쏘|주먹|발차기|기습|제압|죽이|살해)/i.test(String(action));}

function makeCaptureResponse(){
  return {
    statusCode:200,payload:null,headers:{},
    status(code){this.statusCode=Number(code)||200;return this;},
    json(payload){this.payload=payload;return this;},
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;return this;},
    getHeader(name){return this.headers[String(name).toLowerCase()];},
  };
}

function setAdapterRoute(data,mode,pipeline,telemetry){
  data.route={
    ...(data.route||{}),input_mode:mode,adapter_version:ADAPTER_VERSION,app_version:APP_VERSION,
    core_server_version:data.server_version||data.route?.server_version||'0.5.6',
    quality_pipeline:pipeline?.pipeline||'legacy',qa_result:pipeline?.qa_result||'SKIP',rewrite_applied:false,
    context_router:telemetry||null,
  };
  data.server_version=ADAPTER_VERSION;
  return data;
}

async function runCore(req,incoming,mode){
  const capture=makeCaptureResponse();
  const routedReq={method:req.method,headers:req.headers||{},body:incoming};
  const ctx={enabled:true,incoming,mode,telemetry:null};
  await ROUTER_CONTEXT.run(ctx,()=>coreHandler(routedReq,capture));
  return {status:capture.statusCode,data:capture.payload||{},telemetry:ctx.telemetry};
}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'POST only',server_version:ADAPTER_VERSION});}
  try{
    const incoming0=req.body&&typeof req.body==='object'?req.body:{};
    const mode=SUPPORTED_MODES.has(incoming0.inputMode)?incoming0.inputMode:'game';
    const incoming={...incoming0};

    if(mode==='meta'){
      incoming.inputMode='meta';
      incoming.action=String(incoming0.action||'');
    }else if(mode==='continue'){
      incoming.inputMode='game'; incoming.action=continueAction(incoming0); incoming.forceTerra=false;
      incoming.rollingSummary=String(incoming0.rollingSummary||'').slice(-3600);
    }else if(mode==='auto'){
      incoming.inputMode='game'; incoming.action=AUTO_DIRECTIVE;
    }else{
      incoming.inputMode='game'; incoming.action=String(incoming0.action||'');
    }

    if(isCombatLike(incoming.action)&&incoming.reasoningEffort==='auto') incoming.reasoningEffort='medium';

    const result=await runCore(req,incoming,mode);
    if(result.status<200||result.status>=300) return res.status(result.status).json({...result.data,server_version:ADAPTER_VERSION,adapter_version:ADAPTER_VERSION});
    const data=result.data;
    if(!data?.turn)throw new Error('코어 API 응답에 turn이 없습니다.');

    let telemetry=result.telemetry||{routerVersion:routerVersion(),enabled:false,profile:'unknown'};
    telemetry={...telemetry,actual_input_tokens:Number(data?.usage?.input_tokens||0),actual_output_tokens:Number(data?.usage?.output_tokens||0)};
    if(Number(telemetry.soft_max_tokens||0)>0) telemetry.budget_status=telemetry.actual_input_tokens<=telemetry.soft_max_tokens?'OK':'OVER';

    if(mode==='continue'){
      lockContinueTurn(data.turn); applyExtendedExpressions(data.turn,incoming0.saveState||{});
      data.runtime_state=consumeContinuationRuntime(incoming0);
      data.background_digest=String(incoming0.saveState?.backgroundDigest||'').slice(-1800);
      const pipeline={pipeline:'continue-stable-v154',stages:1,qa_result:'SKIP',rewrite_applied:false,background_sim:false,context_router:telemetry,event_director_v2:telemetry?.event_director_v2||null};
      data.pipeline=pipeline; setAdapterRoute(data,mode,pipeline,telemetry); return res.status(200).json(data);
    }

    if(mode==='meta'){
      const pipeline={pipeline:'meta-full-stable-v154',stages:1,qa_result:'SKIP',rewrite_applied:false,background_sim:false,context_router:telemetry,event_director_v2:telemetry?.event_director_v2||null};
      data.pipeline=pipeline; setAdapterRoute(data,mode,pipeline,telemetry); return res.status(200).json(data);
    }

    applyExtendedExpressions(data.turn,incoming0.saveState||{});
    data.turn.choices=freshChoices(incoming.action,data.turn);
    const sceneRuntime=localSceneRuntime(incoming0,data.turn);
    const npcUpdates=incoming0.qualityPipeline===false?{}:localNpcUpdates(incoming0,data.turn);
    data.runtime_state={npc_updates:npcUpdates,scene_runtime:sceneRuntime};
    data.background_digest=localBackgroundDigest(incoming0,data.turn,sceneRuntime.participants);

    const pipeline={
      pipeline:incoming0.qualityPipeline===false?'single-writer-stable-v154':'single-pass-q3-stable-v154',
      stages:1,qa_result:incoming0.qualityPipeline===false?'SKIP':'LOCAL_GUARD',rewrite_applied:false,
      background_sim:false,background_local:incoming0.backgroundSim!==false,combat_engine:isCombatLike(incoming.action),runtime_synthesized:true,
      continuation_beats:array(sceneRuntime.remaining_beats).length,context_router:telemetry,
      event_director_v2:telemetry?.event_director_v2||null,
      note:'V1.5.4 stable paths keep one core model call, HF1 token budgets, and Event Director V2 weighted variation.',
    };
    data.pipeline=pipeline; setAdapterRoute(data,mode,pipeline,telemetry);
    return res.status(200).json(data);
  }catch(error){
    console.error('[V1.5.4]',error);
    return res.status(Number.isInteger(error?.status)?error.status:500).json({error:error?.message||String(error),code:error?.code||'STABLE_ROUTER_V154_ERROR',server_version:ADAPTER_VERSION});
  }
}
