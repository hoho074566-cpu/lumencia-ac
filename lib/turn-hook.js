// Lumensia V1.5.6 Stronger Turn Hook V1
// Bounded next-direction continuity. No model calls and no player-choice authority.

export const TURN_HOOK_VERSION = '1.0';

const CONTINUE_ACTION_RE = /^\[LUMENSIA V1\.5\.6 CONTINUE\]/i;
const AUTO_ACTION_RE = /^\[AUTO FLOW: PC 새 행동 없음\]\s*$/i;
const ROUTED_AUTO_ACTION_RE = /^\[LUMENSIA V1\.5\.6 AUTO FLOW — SCENE MOMENTUM HF1\]/i;
const HOOK_KINDS = new Set(['player-choice','npc-address','event-pressure','new-lead','world-response','continuation','next-step']);
const HOOK_SOURCES = new Set(['choices','scene-dialogue','event-progress','state-delta','scene-exit','scene-purpose']);
const HOOK_STATUSES = new Set(['awaiting-player','active','soft']);
const DIRECT_ADDRESS_RE = /(?:\?|？|어떻게|어느|무엇|뭐|왜|어디|언제|누구|할래|갈래|줄래|겠어|인가|대답|말해\s*(?:줘|봐)|선택해|결정해|도와\s*(?:줘|줄)|부탁)/iu;
const COMBAT_RE = /(?:전투|공격|방어|회피|도망|결투|대련|베어|찌르|마법을?\s*(?:사용|시전|발동|쏘)|스킬을?\s*(?:사용|발동)|능력을?\s*(?:사용|발동)|combat|attack|defend|flee)/iu;
const DECISION_RE = /(?:수락|거절|참석|불참|고백|협상|진실|비밀|숨긴|밝힌|구한다|버린다|희생|봉인|갈림길|왼쪽|오른쪽|되돌릴|위험|결투|전투|공격|방어|도망|마법을?\s*(?:사용|시전|발동)|스킬을?\s*(?:사용|발동)|능력을?\s*(?:사용|발동)|accept|refuse|decline|confess|secret|fight|flee)/iu;

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

export function filterTurnHookChoices(action='',turn={}) {
  const choices=array(turn?.choices).map((choice)=>String(choice||'').trim()).filter(Boolean).slice(0,3);
  if(!choices.length)return [];
  const delta=object(turn?.state_delta),dialogue=lastDialogue(turn),visible=[action,turn?.scene_title,...array(turn?.scene).map((row)=>row?.text),...choices].filter(Boolean).join(' ');
  const importance=String(turn?.importance||'').toLowerCase(),failed=String(turn?.resolution_log?.outcome||'').toLowerCase()==='failure';
  const eventBoundary=turn?.event_progress!=null||array(delta.active_events_add).length>0||array(delta.scheduled_events_add).length>0;
  const directNpcBoundary=Boolean(dialogue&&DIRECT_ADDRESS_RE.test(clampText(dialogue.text,220)));
  const explicitDecision=DECISION_RE.test(choices.join(' ')),combat=COMBAT_RE.test(visible);
  const highImportance=/(?:important|critical|major|high|combat)/i.test(importance);
  return failed||eventBoundary||directNpcBoundary||explicitDecision||combat||highImportance?choices:[];
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

export function deriveTurnHook({ turn = {}, sceneDelta = {}, purpose = null, exitCondition = null, eventProgress = null, turnNumber = 0 } = {}) {
  const choices=array(turn?.choices).map((choice)=>clampText(choice,140)).filter(Boolean).slice(0,3);
  if(choices.length)return makeHook({kind:'player-choice',anchor:choices.join(' / '),source:'choices',status:'awaiting-player',turnNumber});

  const exit=object(exitCondition),flags=object(sceneDelta?.flags),dialogue=lastDialogue(turn),dialogueText=clampText(dialogue?.text,220),anchor=fallbackAnchor(turn,purpose,exit);
  if(exit.status==='open')return makeHook({kind:'continuation',anchor:exit.target||anchor,source:'scene-exit',status:'active',turnNumber});
  if(dialogue&&DIRECT_ADDRESS_RE.test(dialogueText))return makeHook({kind:'npc-address',anchor:dialogueText,source:'scene-dialogue',status:'awaiting-player',turnNumber,speakerKey:dialogue.speaker_key});

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
  const lines=[`HOOK_MODE=${currentActionFirst?'current-action-first':'world-continuity'}`,'- EXIT_TARGET 뒤에 실제 판단·NPC 행동/요청·새 정보/목표/위험·사건 압력 중 하나를 남긴다.'];
  if(currentActionFirst)lines.push('- CURRENT ACTION PRIORITY: 현재 USER ACTION 우선. 이전 훅 재실행 금지.');
  if(!currentActionFirst&&previous?.status==='awaiting-player')lines.push('- PLAYER BOUNDARY: 플레이어 응답을 기다리는 이전 훅을 AUTO가 대신 선택·해결하지 않는다.');
  return lines.join('\n');
}
