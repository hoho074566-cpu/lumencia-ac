// Lumensia V1.5.6 Scene Momentum Recovery HF1
// Deterministic intent/compression + state-delta/stall accounting. No model calls.

import { scheduledIdsDueByTurnEnd } from './event-progress.js';

export const SCENE_MOMENTUM_VERSION = '1.0';

const CONSEQUENTIAL_ACTION_RE = /(?:전투(?:를|에)?\s*(?:시작|돌입|계속|참가|한다|하겠다|할지|할까)|공격(?:을|를)?\s*(?:한다|시도|시작|하겠다|하려|할지|할까|해)|결투(?!장)(?:를|을)?\s*(?:받아들|수락|거절|신청|시작|한다|하겠다|할지|할까)|대련(?:을|를)?\s*(?:한다|시작|신청|수락|거절|할지|할까)|죽이|살해|기습(?:을|를)?\s*(?:한다|시도|하겠다|할지|할까)?|협상(?:을|를)?\s*(?:한다|시작|수락|거절|할지|할까)|고백(?:을|를)?\s*(?:한다|하겠다|할지|할까)|배신(?:을|를)?\s*(?:한다|하겠다|할지|할까)|계약(?:을|를)?\s*(?:맺|체결|수락|거절|서명|한다|할지|할까)|서명(?:한다|하겠다|할지|할까)|맹세(?:한다|하겠다|할지|할까)|(?:능력|스킬|권능|마법)(?:을|를)?\s*(?:사용|발동|시전|쓴|쓸|쓸지|쓸까)|도망치|싸우|\b(?:duel|attack|fight|kill|contract|confess)\b)/i;
const DELIBERATION_RE = /(?:할지|할까|해야\s*할지|할\s*것인지|고민|망설|결정(?:할지|해야|하지\s*못)|생각(?:해|한다|중)|수락할지|거절할지|받아들일지|whether|should\s+i|\?)/i;
const EXTERIOR_RE = /(?:^|\s)(?:밖으로|바깥으로|밖에|건물\s*밖(?:으로|에)|기숙사\s*밖(?:으로|에)|외부로)\s*(?:나가|나갈|간|갈|가|이동|향)/i;
const EXTERIOR_NEGATION_RE = /(?:밖으로|바깥으로|밖에|건물\s*밖(?:으로|에)|기숙사\s*밖(?:으로|에)|외부로)\s*(?:(?:안|못)\s*(?:나가|가|이동|향)|(?:나가|가|이동|향)(?:지(?:는)?)?\s*(?:않|못))/i;
const EXTERIOR_DELIBERATION_RE = /(?:밖으로|바깥으로|밖에|건물\s*밖(?:으로|에)|기숙사\s*밖(?:으로|에)|외부로).{0,20}(?:나갈지|나갈까|갈지|갈까|이동할지|이동할까|향할지|향할까|고민|망설|\?)/i;
const EXPLORE_RE = /(돌아다닌|돌아본|배회|탐색|구경|여기저기|주변을\s*둘러|일대를\s*둘러|campus\s*around|\b(?:wander|explore)\b)/i;
const OBSERVE_RE = /^\s*(?:(?:(?:.+?)(?:을|를)\s*(?:자세히\s*)?)?(?:본다|살펴본다|살핀다|관찰한다|확인한다)|주위를\s*본다|주변을\s*본다|\b(?:look|observe|inspect)\b)\s*[.!?。！？]*$/i;
const DOWNTIME_RE = /(?:좀\s*쉰|쉰다|쉴|휴식|쉬어|잠깐\s*잔다|잠을\s*잔다|잠든|눈을\s*붙|수면|\b(?:sleep|rest)\b)/i;
const DOWNTIME_NEGATION_RE = /(?:휴식(?:하)?지\s*않|휴식\s*(?:안|않)\s*(?:하|해)|쉬지\s*않|안\s*쉬|잠(?:을\s*)?자지\s*않|잠들지\s*않|눈을\s*붙이지\s*않|수면(?:하)?지\s*않|\b(?:do\s*not|don't|without)\s+(?:sleep|rest(?:ing)?)\b)/i;
const DOWNTIME_DELIBERATION_RE = /(?:휴식|쉬|쉰|쉴|잠|수면|\b(?:sleep|rest)\b).{0,16}(?:할지|할까|하면|한다면|어떨까|고민|망설|\?)/i;
const WAIT_RE = /(?:기다린|대기|시간을\s*보낸|가만히\s*있는다|\bwait\b)/i;
const WAIT_NEGATION_RE = /(?:기다리지\s*않|대기(?:하)?지\s*않|안\s*기다|\b(?:do\s*not|don't|without)\s+wait(?:ing)?\b)/i;
const WAIT_DELIBERATION_RE = /(?:기다리|대기|\bwait\b).{0,16}(?:할지|할까|하면|한다면|어떨까|고민|망설|\?)/i;
const TRAVEL_RE = /([^\n,.!?。！？]{1,48}?)(?:으로|로|에)\s*(?:간다|가자|이동한다|향한다|가본다|간다니까|go|move|head)\s*[.!?。！？]*\s*$/i;
const INDOOR_RE = /(개인실|방|복도|건물|기숙사|교실|강의실|도서관|로비|홀|실내|사무실|학생회실|식당|상점|창고|은신처|지하|계단)/i;
const OUTDOOR_RE = /(밖|외부|광장|거리|골목|정원|운동장|마당|야외|옥외|정문\s*밖|건물\s*앞|기숙사\s*앞|도서관\s*앞)/i;
const ORDINARY_NPC_STATE_FIELDS = Object.freeze(['location','status','long_term_goal','short_term_goal','goal_progress','obstacle','next_activity','next_location','next_change_minutes','last_seen']);

function norm(value='') { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function uniq(values) { return [...new Set(array(values).map(String).filter(Boolean))]; }
function stableJson(value) { try { return JSON.stringify(value ?? null); } catch { return ''; } }
function isLikelyIndoor(location='') { const text=String(location||'').trim(); return Boolean(text && INDOOR_RE.test(text) && !OUTDOOR_RE.test(text)); }
function cleanTravelTarget(raw='') {
  let target=String(raw||'').trim().replace(/^(?:그냥|바로|곧장|이제|그럼|그리고)\s+/i,'');
  target=target.replace(/^.*?(?:와|과|랑|이랑|하고)\s+(?:함께|같이)\s+/i,'');
  target=target.replace(/^.*?(?:하지\s*않고|지\s*않고|안\s*하고|말고)\s+/i,'');
  const temporal=target.match(/(?:후|뒤|나서)\s+(.+)$/); if(temporal?.[1])target=temporal[1].trim();
  target=target.replace(/^(?:나는|난|내가|우리는|우린|PC가|Aaa가)\s+/i,'').trim();
  const tokens=target.split(/\s+/).filter(Boolean); if(tokens.length>3)target=tokens.slice(-3).join(' ');
  return target.slice(-36).trim();
}
function scalarDifferent(previous,next) {
  if(next===null||next===undefined)return false;
  if(typeof next==='number')return !Number.isFinite(Number(previous))||Number(previous)!==next;
  if(typeof next==='boolean')return Boolean(previous)!==next;
  return norm(previous)!==norm(next);
}
function goalUpdateChangesObjective(saveState,row={}) {
  const key=String(row?.npc_key||row?.key||'').trim(); if(!key)return false;
  const previous=object(saveState?.npcInnerStates?.[key]?.active_goal);
  const previousDesire=norm(previous.desire||saveState?.npcStates?.[key]?.current_goal||'');
  const requestedDesire=norm(row?.current_goal||'');
  if(row?.goal_replace===true)return true;
  if(requestedDesire&&requestedDesire!==previousDesire)return true;
  const progressDelta=Number(row?.goal_progress_delta||0); if(Number.isFinite(progressDelta)&&progressDelta!==0)return true;
  const requestedState=String(row?.goal_state||'').trim().toLowerCase();
  const previousState=String(previous.state||(previousDesire?'active':'')).trim().toLowerCase();
  if(requestedState&&requestedState!==previousState)return true;
  return false;
}
function npcStateUpdateChanges(saveState,row={}) {
  const key=String(row?.npc_key||row?.key||'').trim(); if(!key)return false;
  const previous=object(saveState?.npcStates?.[key]);
  if(goalUpdateChangesObjective(saveState,row))return true;
  return ORDINARY_NPC_STATE_FIELDS.some((field)=>Object.prototype.hasOwnProperty.call(row,field)&&scalarDifferent(previous[field],row[field]));
}
function hasCommittedDowntime(text='') { return DOWNTIME_RE.test(text)&&!DOWNTIME_NEGATION_RE.test(text)&&!DOWNTIME_DELIBERATION_RE.test(text); }
function hasCommittedWait(text='') { return WAIT_RE.test(text)&&!WAIT_NEGATION_RE.test(text)&&!WAIT_DELIBERATION_RE.test(text); }
function isLowValueDeliberation(text='') { return (DOWNTIME_RE.test(text)&&DOWNTIME_DELIBERATION_RE.test(text))||(WAIT_RE.test(text)&&WAIT_DELIBERATION_RE.test(text)); }
function eventNullMeansPause(saveState,previousRuntime,delta,turn) {
  if(turn?.event_progress!==null)return false;
  const previous=object(previousRuntime?.eventProgress);
  const priorId=norm(previous.eventInstanceId||previous.event_instance_id||''); if(!priorId)return false;
  const removed=new Set([...array(delta.active_events_remove),...array(delta.completed_events_add),...array(delta.scheduled_events_complete)].map((value)=>norm(value)).filter(Boolean));
  if(removed.has(priorId))return false;
  const dueIds=new Set(scheduledIdsDueByTurnEnd(saveState,delta.advance_minutes).map((value)=>norm(value)).filter(Boolean));
  if(dueIds.has(priorId))return true;
  const resumeKey=norm(previous.resumeKey||previous.resume_key||'');
  const activeEvents=new Set(array(saveState?.activeEvents).map((value)=>norm(value)).filter(Boolean));
  return Boolean(resumeKey&&activeEvents.has(resumeKey)&&!removed.has(resumeKey));
}

export function classifySceneIntent(action='', { location='' } = {}) {
  const text = String(action || '').trim();
  const consequential = CONSEQUENTIAL_ACTION_RE.test(text);
  const exteriorMatch = EXTERIOR_RE.test(text);
  const deliberating = (consequential && DELIBERATION_RE.test(text)) || isLowValueDeliberation(text) || (exteriorMatch && EXTERIOR_DELIBERATION_RE.test(text));
  if (deliberating) return { kind:'decision-sensitive',semanticTarget:null,compression:false,minAdvanceMinutes:0,suggestedAdvanceMinutes:[0,5],deltaTarget:0,requiresNovelty:false,stopPolicy:'important-choice',location };
  if (exteriorMatch && !EXTERIOR_NEGATION_RE.test(text)) return { kind:'exit-exterior',semanticTarget:'current-building-exterior',compression:true,minAdvanceMinutes:2,suggestedAdvanceMinutes:[2,10],deltaTarget:2,requiresNovelty:true,stopPolicy:'semantic-destination-or-meaningful-interruption',location };
  if (hasCommittedDowntime(text)) return { kind:'downtime',semanticTarget:'rest-complete',compression:true,minAdvanceMinutes:30,suggestedAdvanceMinutes:[30,240],deltaTarget:2,requiresNovelty:true,stopPolicy:'post-rest-meaningful-state',location };
  if (hasCommittedWait(text)) return { kind:'wait',semanticTarget:'time-advanced',compression:true,minAdvanceMinutes:10,suggestedAdvanceMinutes:[10,60],deltaTarget:1,requiresNovelty:true,stopPolicy:'changed-world-or-important-interruption',location };
  if (EXPLORE_RE.test(text)) return { kind:'explore',semanticTarget:'several-nearby-points',compression:true,minAdvanceMinutes:8,suggestedAdvanceMinutes:[8,25],deltaTarget:2,requiresNovelty:true,stopPolicy:'meaningful-discovery-or-choice',location };
  if (OBSERVE_RE.test(text)) return { kind:'observe',semanticTarget:'new-or-changed-relevant-detail',compression:true,minAdvanceMinutes:1,suggestedAdvanceMinutes:[1,3],deltaTarget:1,requiresNovelty:true,stopPolicy:'new-information-or-world-advance',location };
  const travel = text.match(TRAVEL_RE);
  if (travel) { const target=cleanTravelTarget(travel[1]); return { kind:'travel',semanticTarget:target||'declared-destination',compression:true,minAdvanceMinutes:3,suggestedAdvanceMinutes:[3,30],deltaTarget:2,requiresNovelty:false,stopPolicy:'declared-destination-or-meaningful-interruption',location }; }
  if (consequential) return { kind:'committed-consequence',semanticTarget:null,compression:false,minAdvanceMinutes:0,suggestedAdvanceMinutes:[0,10],deltaTarget:1,requiresNovelty:false,stopPolicy:'resolve-committed-action-then-meaningful-choice',location };
  return { kind:'generic',semanticTarget:null,compression:false,minAdvanceMinutes:0,suggestedAdvanceMinutes:[0,10],deltaTarget:1,requiresNovelty:false,stopPolicy:'important-choice-only',location };
}

function eventSignature(progress) {
  const row=object(progress);
  return stableJson({id:row.eventInstanceId||row.event_instance_id||null,active:row.activeBeat||row.active_beat||null,completed:array(row.completedBeats||row.completed_beats).slice(-8),paused:Boolean(row.paused)});
}

export function deriveSceneDelta({ saveState = {}, previousRuntime = {}, turn = {}, nextParticipants = null, action = '' } = {}) {
  const delta=object(turn.state_delta),beforeLocation=norm(saveState?.world?.location||''),afterLocation=norm(delta.new_location||saveState?.world?.location||'');
  const beforeParticipants=uniq(previousRuntime?.participants).sort(),afterParticipants=uniq(nextParticipants==null?beforeParticipants:nextParticipants).sort();
  const beforeSet=new Set(beforeParticipants),afterSet=new Set(afterParticipants);
  const npcEnteredKeys=afterParticipants.filter((key)=>!beforeSet.has(key)),npcLeftKeys=beforeParticipants.filter((key)=>!afterSet.has(key));
  const advanceMinutes=Math.max(0,Number(delta.advance_minutes||0));
  const previousEvent=eventSignature(previousRuntime?.eventProgress),nextEvent=eventSignature(turn?.event_progress),pausedEventNull=eventNullMeansPause(saveState,previousRuntime,delta,turn);
  const eventListsChanged=[...array(delta.active_events_add),...array(delta.active_events_remove),...array(delta.completed_events_add),...array(delta.scheduled_events_complete)].length>0;
  const relationshipChanged=array(delta.relationship_changes).length>0||array(delta.relationship_milestones_add).length>0||array(delta.intimacy_changes).length>0;
  const goalRows=array(delta.npc_state_updates),goalObjectiveChanged=goalRows.some((row)=>goalUpdateChangesObjective(saveState,row)),npcStateChanged=goalRows.some((row)=>npcStateUpdateChanges(saveState,row));
  const objectiveChanged=array(delta.hooks_add).length>0||array(delta.hooks_update).length>0||goalObjectiveChanged;
  const newInformation=array(delta.pc_knowledge_add).length>0||array(delta.memories_add).length>0||array(delta.hooks_add).length>0||array(delta.hooks_update).length>0;
  const resourceChanged=Number(delta.fatigue_delta||0)!==0||Number(delta.gold_delta||0)!==0||array(delta.items_add).length>0||array(delta.items_remove).length>0;
  const growthChanged=array(delta.stat_progress).length>0||array(delta.skill_experience).length>0||array(delta.skill_learning).length>0||array(delta.awakening_progress).length>0;
  const scheduleChanged=array(delta.scheduled_events_add).length>0||array(delta.scheduled_events_remove).length>0||array(delta.scheduled_events_complete).length>0||array(delta.npc_schedule_updates).length>0;
  const worldThreadChanged=array(delta.world_arcs_add).length>0||array(delta.world_arcs_remove).length>0||array(delta.rumors_add).length>0||array(delta.delayed_consequences_add).length>0;
  const npcAction=array(turn?.scene).some((row)=>row?.kind==='dialogue'&&Boolean(row?.speaker_key||String(row?.speaker_name||'').trim()))||goalObjectiveChanged||relationshipChanged||npcStateChanged;
  const dangerChanged=Boolean(delta.pc_status)||array(delta.active_events_add).some((x)=>/(전투|습격|위험|combat|attack|danger)/i.test(String(x)));
  const environmentChanged=array(delta.items_add).length>0||array(delta.items_remove).length>0;
  const eventProgressChanged=eventListsChanged||(!pausedEventNull&&((Boolean(previousRuntime?.eventProgress)||Boolean(turn?.event_progress))&&previousEvent!==nextEvent));
  const flags={locationChanged:Boolean(delta.new_location)&&beforeLocation!==afterLocation,timeAdvanced:advanceMinutes>0,npcEntered:npcEnteredKeys.length>0,npcLeft:npcLeftKeys.length>0,npcAction,npcStateChanged,newInformation,eventProgress:eventProgressChanged,relationshipChanged,objectiveChanged,resourceChanged,growthChanged,scheduleChanged,worldThreadChanged,dangerChanged,environmentChanged};
  const score=Object.values(flags).filter(Boolean).length;
  const structuralScore=[flags.locationChanged,flags.timeAdvanced,flags.npcEntered,flags.npcLeft,flags.npcStateChanged,flags.newInformation,flags.eventProgress,flags.relationshipChanged,flags.objectiveChanged,flags.resourceChanged,flags.growthChanged,flags.scheduleChanged,flags.worldThreadChanged,flags.dangerChanged,flags.environmentChanged].filter(Boolean).length;
  const intent=classifySceneIntent(action,{location:saveState?.world?.location||''}),target=Math.max(0,Number(intent.deltaTarget||0)),metTarget=target===0||score>=target;
  return {version:SCENE_MOMENTUM_VERSION,intent:intent.kind,target,score,structuralScore,metTarget,flags,advanceMinutes,beforeLocation:saveState?.world?.location||null,afterLocation:delta.new_location||saveState?.world?.location||null,npcEnteredKeys,npcLeftKeys};
}

export function updateSceneMomentum(previousRuntime = {}, deltaRecord = {}, { turnNumber = 0 } = {}) {
  const previous=object(previousRuntime?.momentum),target=Math.max(0,Number(deltaRecord?.target||0)),score=Math.max(0,Number(deltaRecord?.score||0)),missed=target>0&&score<target;
  const stallStreak=missed?Math.min(9,Math.max(0,Number(previous.stall_streak||0))+1):0;
  const recent=[...array(previous.recent_deltas),{turn:Number(turnNumber||0),intent:deltaRecord?.intent||'generic',score,structural_score:Math.max(0,Number(deltaRecord?.structuralScore||0)),target,met_target:!missed,flags:object(deltaRecord?.flags),advance_minutes:Math.max(0,Number(deltaRecord?.advanceMinutes||0)),location:deltaRecord?.afterLocation||null}].slice(-3);
  return {version:SCENE_MOMENTUM_VERSION,stall_streak:stallStreak,pressure:stallStreak>=2?'required':stallStreak===1?'watch':'normal',last_score:score,last_structural_score:Math.max(0,Number(deltaRecord?.structuralScore||0)),last_target:target,last_intent:deltaRecord?.intent||'generic',recent_deltas:recent};
}

export function buildSceneMomentumDirective({ action = '', saveState = {} } = {}) {
  const intent=classifySceneIntent(action,{location:saveState?.world?.location||''}),momentum=object(saveState?.sceneRuntime?.momentum),stall=Math.max(0,Number(momentum.stall_streak||0)),[minMinutes,maxMinutes]=intent.suggestedAdvanceMinutes;
  const lines=['[SCENE MOMENTUM V1 — SEMANTIC ACTION COMPLETION]',`INTENT=${intent.kind}`,`SEMANTIC_TARGET=${intent.semanticTarget||'-'}`,`TARGET_STATE_DELTA=${intent.deltaTarget}`,`TIME_GUIDE=${minMinutes}-${maxMinutes}min`,`STALL_STREAK=${stall}`,'- PC의 새로운 독립적 선택·대사·감정은 만들지 않는다. 대신 사용자가 이미 선언한 의미적 목표를 완료하는 데 필요한 문/복도/계단/현관/평범한 길 같은 결정 가치 없는 중간 단계는 자동 처리한다.','- Scene Description보다 Scene Change를 우선한다. 직전 턴 이후 실제로 달라진 것부터 서술하고, 변하지 않은 게시판/창구/복도/공지 같은 이미 공개된 정보는 목록처럼 다시 읽어주지 않는다.','- NPC는 목표·일정·관계·감정과 물리적 가능성이 맞으면 먼저 말하거나 움직이거나 떠나거나 다른 NPC와 상호작용할 수 있다. PC가 찾아오기를 항상 기다리지 않는다.','- 사건이 끝난 뒤에도 자연스러운 세계 반응·후속 위험·소문·다음 가능성까지 이어갈 수 있다. 단, 새 대형 사건/보스/비밀을 억지로 생성하지 않는다.','- STOP은 전투 돌입/되돌리기 어려운 위험/중대한 관계 선택/중요 대화의 직접 질문/갈림길/능력 사용 여부처럼 플레이어 판단 자체가 콘텐츠인 순간에만 한다. 사소한 문·계단·복도·평범한 이동에서는 STOP하지 않는다.','- choices는 위와 같은 실제 결정점에서만 정확히 3개. 그렇지 않으면 빈 배열.','- 사용자에게 보이는 서술에서 내부 명칭 "PC"나 자리표시자 "Aaa"를 주어로 출력하지 않는다. 이름이 있으면 실제 이름을 쓰거나 한국어답게 주어를 생략한다.'];
  if(intent.kind==='exit-exterior'){
    if(isLikelyIndoor(intent.location))lines.push('- EXIT 규칙: 별도 장애물이 없다면 현재 방/생활공간 → 복도 → 계단/현관을 한 턴에 압축해 건물 외부까지 도착시킨다. 복도에서 멈추려면 실제 방해/사건/중요 선택 근거가 있어야 한다.');
    else lines.push('- EXIT 규칙: 현재 위치가 이미 야외/외부라면 존재하지 않는 방·복도·현관을 만들어내지 않는다. 사용자가 말한 “밖”의 자연스러운 의미를 현재 장소의 경계/주변 맥락으로 해석해 이동하거나, 의미가 모호하면 짧은 세계 변화까지만 처리한다.');
  }else if(intent.kind==='travel')lines.push(`- TRAVEL 규칙: 특별한 방해가 없으면 평범한 이동 과정을 압축해 선언 목적지(${intent.semanticTarget||'목적지'})까지 이동 완료한다.`);
  else if(intent.kind==='explore')lines.push('- EXPLORE 규칙: 같은 복도 몇 걸음이 아니라 주변 여러 지점을 자연스럽게 훑고, 새 NPC/새 정보/작은 사건/소문/의미 있는 장소 중 최소 하나를 발견한다.');
  else if(intent.kind==='observe')lines.push('- OBSERVE 규칙: 우선순위는 ①아직 못 본 중요 요소 ②새로 변한 요소 ③현재 행동과 관련된 요소다. 기존 정보만 남았다면 재목록화하지 말고 짧게 넘기며 세계 시간을 진행시킨다.');
  else if(intent.kind==='downtime')lines.push('- DOWNTIME 규칙: 앉기→눈감기→잠들기 같은 미세 단계를 여러 턴 요구하지 않는다. 의미 없는 휴식 구간을 압축해 충분한 시간을 넘긴 뒤 변화한 상황에서 장면을 재개한다.');
  else if(intent.kind==='wait')lines.push('- WAIT 규칙: 정지 화면처럼 묘사만 반복하지 말고 적절한 시간을 실제로 진행시킨 뒤 일정/NPC/환경의 변화를 반영한다.');
  else if(intent.kind==='committed-consequence')lines.push('- COMMITTED ACTION 규칙: 사용자가 이미 공격/결투 수락/협상/계약/능력 사용 등을 선언했다면 다시 “할지 말지”를 묻지 않는다. 그 시도와 즉각 결과·상대 반응·세계 반응까지 처리한 뒤, 새로 중요한 판단이 생긴 지점에서만 STOP한다.');
  if(stall>=2)lines.push('- SCENE_STALL=true: 이번 턴은 문장만 바꾸거나 scene_title만 바꾸는 것으로 통과할 수 없다. 위치/시간/NPC 출입·행동·상태/새 정보/이벤트/관계/목표/자원/성장/일정/소문·월드 스레드/위험/환경 중 최소 하나의 실제 변화가 필요하다. 작은 변화면 충분하며 대형 사건을 강제하지 않는다.');
  return lines.join('\n');
}
