// Lumensia V1.5.6 Stronger Turn Hook V1
// Bounded next-direction continuity. No model calls and no player-choice authority.

import { classifySceneIntent } from './scene-momentum.js';

export const TURN_HOOK_VERSION = '1.0';

const CONTINUE_ACTION_RE = /^\[LUMENSIA V1\.5\.6 CONTINUE\]/i;
const AUTO_ACTION_RE = /^\[AUTO FLOW: PC 새 행동 없음\]\s*$/i;
const ROUTED_AUTO_ACTION_RE = /^\[LUMENSIA V1\.5\.6 AUTO FLOW — SCENE MOMENTUM HF1\]/i;
const HOOK_KINDS = new Set(['player-choice','npc-address','event-pressure','new-lead','world-response','continuation','next-step']);
const HOOK_SOURCES = new Set(['choices','scene-dialogue','event-progress','state-delta','scene-exit','scene-purpose']);
const HOOK_STATUSES = new Set(['awaiting-player','active','soft']);
const DIRECT_ADDRESS_RE = /(?:[?？]\s*["”’']?\s*$|(?:대답해|말해\s*(?:줘|봐)|선택해|결정해|도와\s*줘|부탁(?:할게|한다|이야)|해\s*줘)\s*[.!。…]?\s*["”’']?\s*$)/iu;
const COMBAT_RE = /(?:전투|공격|방어|회피|도망|결투|대련|베어|찌르|마법을?\s*(?:사용|시전|발동|쏘)|스킬을?\s*(?:사용|발동)|능력을?\s*(?:사용|발동)|combat|attack|defend|flee)/iu;
const ROUTINE_CHOICE_KINDS = new Set(['travel','exit-exterior','explore','observe','downtime','wait']);
const ROUTINE_GENERIC_RE = /(?:준비(?:를|해|한|하)|정리(?:를|해|한|하)|둘러(?:보|본)|살펴(?:보|본)|살피|살핀|구경|산책|휴식|쉬(?:어|고|며|ㄴ|는|다)|기다리|대기|시간을?\s*보내|식사(?:를|해|한|하)|밥을?\s*먹|아무것도\s*하지)/iu;
const DECISION_CONTEXT_RE = /(?:갈림길|어느\s*쪽|둘\s*중|셋\s*중|선택(?:해야|지는|지가|을)|결정(?:해야|을)|되돌릴\s*수\s*없|위험을?\s*감수|포기할|양자택일)/iu;

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function clampText(value,max=220) { return String(value ?? '').replace(/\s+/g,' ').trim().slice(0,max); }
function boundedTurn(value) {
  const number=Math.floor(Number(value||0));
  return Number.isFinite(number)?Math.min(1_000_000_000,Math.max(0,number)):0;
}
function isAutoAction(value) { const raw=String(value||'').trim(); return AUTO_ACTION_RE.test(raw)||ROUTED_AUTO_ACTION_RE.test(raw); }
function eventId(progress={}) { const row=object(progress); return clampText(row.eventInstanceId||row.event_instance_id||'',100); }
function activeBeat(progress={}) { const row=object(progress); return clampText(row.activeBeat||row.active_beat||'',120); }
function lastDialogue(turn={}) { return array(turn?.scene).filter((row)=>row?.kind==='dialogue'&&clampText(row?.text,220)).slice(-1)[0]||null; }
function fallbackAnchor(turn,purpose,exitCondition) { return clampText(turn?.scene_summary||turn?.scene_title||purpose?.focus||exitCondition?.target||'현재 장면의 다음 실질 행동 지점',220); }
function normalizedGrounding(value='') { return String(value||'').toLowerCase().replace(/[\s.,!?？。…'"“”‘’·:;()[\]{}]/gu,''); }
function isDemonstrablyRoutineChoice(choice='') {
  const text=String(choice||'').trim();
  if(!text)return true;
  const intent=classifySceneIntent(text);
  return ROUTINE_CHOICE_KINDS.has(intent?.kind)||(intent?.kind==='generic'&&ROUTINE_GENERIC_RE.test(text));
}

export function filterTurnHookChoices(action='',turn={}) {
  const choices=array(turn?.choices).map((choice)=>String(choice||'').trim()).filter(Boolean).slice(0,3);
  if(!choices.length)return [];
  const delta=object(turn?.state_delta),dialogue=lastDialogue(turn),sceneContext=[action,turn?.scene_title,...array(turn?.scene).map((row)=>row?.text)].filter(Boolean).join(' '),visible=[sceneContext,...choices].filter(Boolean).join(' ');
  const failed=String(turn?.resolution_log?.outcome||'').toLowerCase()==='failure';
  const eventBoundary=turn?.event_progress!=null||array(delta.active_events_add).length>0||array(delta.scheduled_events_add).length>0;
  const directNpcBoundary=Boolean(dialogue&&DIRECT_ADDRESS_RE.test(clampText(dialogue.text,220)));
  const contextualDecision=DECISION_CONTEXT_RE.test(sceneContext),combat=COMBAT_RE.test(visible),groundedScene=normalizedGrounding(sceneContext);
  const choiceIntents=choices.map((choice)=>classifySceneIntent(choice));
  const groundedTravelAlternatives=choices.length>=2&&choiceIntents.every((intent)=>intent?.kind==='travel'&&normalizedGrounding(intent.semanticTarget).length>=1&&groundedScene.includes(normalizedGrounding(intent.semanticTarget)));
  if(failed||eventBoundary||directNpcBoundary||contextualDecision||groundedTravelAlternatives||combat)return choices;
  return choices.every(isDemonstrablyRoutineChoice)?[]:choices;
}

export function normalizeTurnHook(value={}) {
  const row=object(value),kind=HOOK_KINDS.has(row.kind)?row.kind:'next-step',source=HOOK_SOURCES.has(row.source)?row.source:'scene-purpose',status=HOOK_STATUSES.has(row.status)?row.status:'soft';
  const anchor=clampText(row.anchor,220);
  if(!anchor)return null;
  const normalized={version:TURN_HOOK_VERSION,kind,anchor,source,status,established_turn:boundedTurn(row.established_turn)};
  const speakerKey=clampText(row.speaker_key,80),instanceId=eventId(row);
  if(kind==='npc-address'&&speakerKey)normalized.speaker_key=speakerKey;
  if(kind==='event-pressure'&&instanceId)normalized.event_instance_id=instanceId;
  return normalized;
}

function makeHook({kind,anchor,source,status='active',turnNumber=0,speakerKey='',eventInstanceId=''}) {
  return normalizeTurnHook({kind,anchor,source,status,established_turn:turnNumber,speaker_key:speakerKey,event_instance_id:eventInstanceId});
}

export function deriveTurnHook({ turn = {}, sceneDelta = {}, purpose = null, exitCondition = null, eventProgress = null, previousRuntime = {}, action = '', mode = 'game', turnNumber = 0 } = {}) {
  const previous=normalizeTurnHook(previousRuntime?.turn_hook);
  if(mode==='auto'&&previous?.status==='awaiting-player')return previous;
  const choices=array(turn?.choices).map((choice)=>clampText(choice,140)).filter(Boolean).slice(0,3);
  if(choices.length)return makeHook({kind:'player-choice',anchor:choices.join(' / '),source:'choices',status:'awaiting-player',turnNumber});

  const exit=object(exitCondition),flags=object(sceneDelta?.flags),dialogue=lastDialogue(turn),dialogueText=clampText(dialogue?.text,220),anchor=fallbackAnchor(turn,purpose,exit);
  if(dialogue&&DIRECT_ADDRESS_RE.test(dialogueText))return makeHook({kind:'npc-address',anchor:dialogueText,source:'scene-dialogue',status:'awaiting-player',turnNumber,speakerKey:dialogue.speaker_key});
  if(exit.status==='open')return makeHook({kind:'continuation',anchor:exit.target||anchor,source:'scene-exit',status:'active',turnNumber});

  const instanceId=eventId(eventProgress)||clampText(purpose?.event_instance_id||'',100);
  if(instanceId&&(flags.eventProgress||purpose?.kind==='event'))return makeHook({kind:'event-pressure',anchor:activeBeat(eventProgress)||anchor,source:'event-progress',status:'active',turnNumber,eventInstanceId:instanceId});
  if(flags.objectiveChanged||flags.newInformation||flags.worldThreadChanged)return makeHook({kind:'new-lead',anchor,source:'state-delta',status:'active',turnNumber});
  if(flags.npcEntered||flags.npcLeft||flags.npcStateChanged||flags.relationshipChanged||flags.resourceChanged||flags.dangerChanged||flags.environmentChanged)return makeHook({kind:'world-response',anchor,source:'state-delta',status:'active',turnNumber});
  return makeHook({kind:'next-step',anchor,source:purpose?.focus?'scene-purpose':'scene-exit',status:'soft',turnNumber});
}

export function buildTurnHookDirective({ action = '', saveState = {} } = {}) {
  const rawAction=String(action||'').trim(),previous=normalizeTurnHook(saveState?.sceneRuntime?.turn_hook);
  if(CONTINUE_ACTION_RE.test(rawAction))return ['[STRONGER TURN HOOK V1 — CONTINUE FREEZE]','HOOK_MODE=preserve-only','- 저장된 Turn Hook을 진행·해결·교체하지 않고 같은 순간의 표현만 보강한다. 새 질문·선택지·NPC 행동을 만들지 않는다.'].join('\n');
  const currentActionFirst=Boolean(rawAction&&!isAutoAction(rawAction));
  const lines=[`HOOK_MODE=${currentActionFirst?'current-action-first':'world-continuity'}`,'- Hook은 완결 뒤 흐름이다. soft hook·남은 시간은 질문/choices가 아니다.'];
  if(currentActionFirst)lines.push('- CURRENT ACTION PRIORITY: 현재 USER ACTION 우선. 이전 훅 재실행 금지.');
  if(!currentActionFirst&&previous?.status==='awaiting-player')lines.push('- PLAYER BOUNDARY: 플레이어 응답을 기다리는 이전 훅을 AUTO가 대신 선택·해결하지 않는다.');
  return lines.join('\n');
}
