// Lumensia V1.5.6 Explicit Scene Exit Condition V1
// Deterministic turn boundary guidance. No model calls and no player-choice authority.

import { classifySceneIntent } from './scene-momentum.js';
import { normalizeScenePurpose } from './scene-purpose.js';

export const SCENE_EXIT_VERSION = '1.0';

const CONTINUE_ACTION_RE = /^\[LUMENSIA V1\.5\.6 CONTINUE\]/i;
const AUTO_ACTION_RE = /^\[AUTO FLOW: PC 새 행동 없음\]\s*$/i;
const ROUTED_AUTO_ACTION_RE = /^\[LUMENSIA V1\.5\.6 AUTO FLOW — SCENE MOMENTUM HF1\]/i;
const EXIT_KINDS = new Set(['semantic-destination','meaningful-discovery','new-information','downtime-complete','time-advanced','action-resolved','question-answered','event-step','interaction-turn','scene-change','player-choice']);
const EXIT_SOURCES = new Set(['current-action','scene-purpose']);
const EXIT_STATUSES = new Set(['open','reached','awaiting-player']);

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function clampText(value,max=180) { return String(value ?? '').replace(/\s+/g,' ').trim().slice(0,max); }
function boundedTurn(value) {
  const number=Math.floor(Number(value||0));
  return Number.isFinite(number)?Math.min(1_000_000_000,Math.max(0,number)):0;
}
function isAutoAction(value) { const raw=String(value||'').trim(); return AUTO_ACTION_RE.test(raw)||ROUTED_AUTO_ACTION_RE.test(raw); }
function eventId(progress={}) { const row=object(progress); return clampText(row.eventInstanceId||row.event_instance_id||'',100); }
function eventSignature(progress={}) {
  const row=object(progress),completed=array(row.completedBeats||row.completed_beats).map((beat)=>clampText(beat,100)).filter(Boolean).slice(-24);
  return JSON.stringify([eventId(row),clampText(row.activeBeat||row.active_beat||'',100),completed,Math.max(0,Math.floor(Number(row.omittedCompletedCount??row.omitted_completed_count)||0))]);
}

export function normalizeSceneExitCondition(value={}) {
  const row=object(value),kind=EXIT_KINDS.has(row.kind)?row.kind:'scene-change',source=EXIT_SOURCES.has(row.source)?row.source:'scene-purpose',status=EXIT_STATUSES.has(row.status)?row.status:'open';
  const target=clampText(row.target,180);
  if(!target)return null;
  const normalized={version:SCENE_EXIT_VERSION,kind,target,source,status,established_turn:boundedTurn(row.established_turn),purpose_established_turn:boundedTurn(row.purpose_established_turn)};
  const instanceId=eventId(row);
  if(kind==='event-step'&&instanceId)normalized.event_instance_id=instanceId;
  return normalized;
}

function makeCondition({kind,target,source,status='open',turnNumber=0,purposeTurn=0,eventInstanceId=''}) {
  return normalizeSceneExitCondition({kind,target,source,status,established_turn:turnNumber,purpose_established_turn:purposeTurn,event_instance_id:eventInstanceId});
}

function conditionForIntent(intent,turnNumber,purposeTurn=0) {
  const common={source:'current-action',turnNumber,purposeTurn};
  if(intent.kind==='decision-sensitive')return makeCondition({...common,kind:'question-answered',target:'현재 질문·가정·고민에 직접 답하되, 언급된 행동이나 선택을 대신 실행하지 않은 때'});
  if(intent.kind==='exit-exterior')return makeCondition({...common,kind:'semantic-destination',target:'실제 방해가 없다면 사소한 실내 동선을 압축해 현재 건물 외부에 도착한 때'});
  if(intent.kind==='travel')return makeCondition({...common,kind:'semantic-destination',target:`실제 방해가 없다면 선언한 목적지(${clampText(intent.semanticTarget||'목적지',100)})에 도착한 때`});
  if(intent.kind==='explore')return makeCondition({...common,kind:'meaningful-discovery',target:'주변 여러 지점을 압축 탐색해 새 NPC·정보·사건·소문·의미 있는 장소 중 하나를 발견한 때'});
  if(intent.kind==='observe')return makeCondition({...common,kind:'new-information',target:'아직 보지 못했거나 새로 변했거나 현재 행동과 관련된 요소를 확인한 때'});
  if(intent.kind==='downtime')return makeCondition({...common,kind:'downtime-complete',target:'휴식의 무의미한 중간 단계를 압축하고 적절한 시간이 지난 뒤 변화한 상황에서 재개한 때'});
  if(intent.kind==='wait')return makeCondition({...common,kind:'time-advanced',target:'선언한 대기 시간을 실제로 진행하고 세계·일정·NPC의 변화 또는 중요한 방해가 드러난 때'});
  if(intent.kind==='committed-consequence')return makeCondition({...common,kind:'action-resolved',target:'이미 선언한 행동의 시도·즉각 결과·상대와 세계의 직접 반응을 처리한 뒤 새 판단점에 도달한 때'});
  return makeCondition({...common,kind:'action-resolved',target:'현재 행동의 직접 결과와 자연스러운 NPC·세계 반응을 처리한 뒤 다음 실질 행동 지점에 도달한 때'});
}

function conditionForPurpose(purpose,turnNumber) {
  const common={source:'scene-purpose',turnNumber,purposeTurn:purpose?.established_turn||0};
  if(purpose?.kind==='decision')return makeCondition({...common,kind:'player-choice',target:'열려 있는 중요한 선택을 플레이어가 직접 판단해야 하는 현재 지점',status:'awaiting-player'});
  if(purpose?.kind==='event')return makeCondition({...common,kind:'event-step',target:'현재 사건의 활성 단계가 실제로 진전·완료되거나 플레이어 판단이 필요한 첫 지점에 도달한 때',eventInstanceId:purpose.event_instance_id});
  if(purpose?.kind==='interaction')return makeCondition({...common,kind:'interaction-turn',target:'현재 NPC의 의도 있는 말·행동과 그 직접 반응이 드러나 다음 대응 지점에 도달한 때'});
  if(purpose?.kind==='transition')return makeCondition({...common,kind:'scene-change',target:'새 위치의 달라진 상황이 자리 잡고 다음 실질 행동 지점이 드러난 때'});
  if(purpose?.kind==='action')return makeCondition({...common,kind:'action-resolved',target:'현재 행동의 결과와 자연스러운 NPC·세계 반응을 처리한 뒤 다음 실질 행동 지점에 도달한 때'});
  return makeCondition({...common,kind:'scene-change',target:'정적 재묘사가 아닌 실제 상태 변화나 플레이어 판단이 필요한 첫 지점에 도달한 때'});
}

export function deriveSceneExitCondition({ action = '', saveState = {}, purpose = null, turnNumber = 0 } = {}) {
  const rawAction=String(action||'').trim(),runtime=object(saveState?.sceneRuntime),currentPurpose=normalizeScenePurpose(purpose||runtime.purpose),previous=normalizeSceneExitCondition(runtime.exit_condition);
  if(CONTINUE_ACTION_RE.test(rawAction))return previous;
  if(rawAction&&!isAutoAction(rawAction))return conditionForIntent(classifySceneIntent(rawAction,{location:saveState?.world?.location||''}),turnNumber,currentPurpose?.established_turn||0);
  if(previous?.status==='open'&&currentPurpose&&previous.purpose_established_turn===currentPurpose.established_turn)return previous;
  return conditionForPurpose(currentPurpose,turnNumber);
}

export function evaluateSceneExitCondition(condition,{ turn = {}, sceneDelta = {}, previousRuntime = {}, eventProgress = null } = {}) {
  const current=normalizeSceneExitCondition(condition);
  if(!current)return null;
  const choices=array(turn?.choices).map(String).map((value)=>value.trim()).filter(Boolean);
  if(choices.length)return normalizeSceneExitCondition({...current,status:'awaiting-player'});
  if(current.kind==='player-choice')return normalizeSceneExitCondition({...current,status:'awaiting-player'});
  const flags=object(sceneDelta?.flags),structural=Math.max(0,Number(sceneDelta?.structuralScore||0)),score=Math.max(0,Number(sceneDelta?.score||0));
  const hasScene=array(turn?.scene).some((row)=>clampText(row?.text,40));
  const eventAdvanced=eventSignature(previousRuntime?.eventProgress)!==eventSignature(eventProgress);
  let reached=false;
  if(current.kind==='question-answered')reached=hasScene;
  else if(current.kind==='semantic-destination')reached=Boolean(flags.locationChanged);
  else if(current.kind==='meaningful-discovery')reached=Boolean(flags.locationChanged||flags.npcEntered||flags.npcAction||flags.newInformation||flags.eventProgress||flags.objectiveChanged||flags.worldThreadChanged);
  else if(current.kind==='new-information')reached=Boolean(flags.newInformation||flags.eventProgress||flags.objectiveChanged||flags.npcAction||flags.locationChanged);
  else if(current.kind==='downtime-complete'||current.kind==='time-advanced')reached=Math.max(0,Number(sceneDelta?.advanceMinutes||0))>0;
  else if(current.kind==='event-step')reached=eventAdvanced;
  else if(current.kind==='interaction-turn')reached=Boolean(flags.npcAction)&&(score>0||hasScene);
  else if(current.kind==='action-resolved')reached=Boolean(turn?.resolution_log?.outcome)||score>0;
  else if(current.kind==='scene-change')reached=structural>0||Boolean(flags.npcAction);
  return normalizeSceneExitCondition({...current,status:reached?'reached':'open'});
}

export function buildSceneExitDirective({ action = '', saveState = {} } = {}) {
  const rawAction=String(action||'').trim();
  if(CONTINUE_ACTION_RE.test(rawAction))return ['[EXPLICIT SCENE EXIT CONDITION V1 — CONTINUE FREEZE]','EXIT_MODE=preserve-only','- 저장된 Scene Exit Condition을 진전·충족·교체하지 않는다. 직전 응답과 같은 순간의 이미 발생한 표현만 보강한다.','- 이 조건은 새로운 PC/NPC 행동, 시간·위치·사건 진행 또는 새 선택지를 허가하지 않는다.'].join('\n');
  const condition=deriveSceneExitCondition({action:rawAction,saveState,turnNumber:Number(saveState?.turnNumber||0)+1});
  const lines=['[EXPLICIT SCENE EXIT CONDITION V1]',`EXIT_KIND=${condition?.kind||'scene-change'}`,`EXIT_TARGET=${condition?.target||'다음 실질 행동 지점'}`,`EXIT_SOURCE=${condition?.source||'scene-purpose'}`,`EXIT_STATUS=${condition?.status||'open'}`,'- EXIT_TARGET은 이번 장면을 어디까지 진행하고 멈출지 정하는 경계일 뿐, PC의 새 행동·대사·감정·생각·수락·거절·선택을 만들 권한이 아니다.'];
  if(condition?.status==='awaiting-player')lines.push('- PLAYER CHOICE BOUNDARY: 이미 중요한 선택점에 도달했다. 플레이어가 고르기 전에는 어느 선택도 실행·확정하지 않고 현재 지점에서 멈춘다.');
  else lines.push('- 실제 방해나 중요한 판단점이 먼저 생기지 않는 한 문·복도·계단·평범한 이동·정적 재묘사 같은 무가치한 중간 단계에서 조기 STOP하지 않는다.','- EXIT_TARGET에 도달하면 같은 목적을 반복·연장하지 않는다. 새 플레이어 판단이 필요하면 정확히 3개의 choices를 열고, 필요하지 않으면 choices=[]로 자연스럽게 턴을 돌려준다.');
  if(condition?.kind==='question-answered')lines.push('- QUESTION EXIT: 질문에 직접 답하는 것이 종료 조건이다. 질문 속 가능 행동을 실행하거나 시간·위치·진행 상태를 바꾸지 않는다.');
  return lines.join('\n');
}
