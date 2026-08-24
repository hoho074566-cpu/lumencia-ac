export const NPC_GOAL_TICK_VERSION = '1';

const PRESENT_GOAL_RESULTS = new Set(['PRESENT_NPC_GOAL_PRIORITY','PRESENT_NPC_GOAL_TICK']);

function array(value){ return Array.isArray(value)?value:[]; }
function object(value){ return value&&typeof value==='object'&&!Array.isArray(value)?value:{}; }
function clampText(value,max=160){
  const text=String(value??'').replace(/\s+/g,' ').trim();
  return text.length>max?text.slice(0,max):text;
}
function bounded(value,min,max,fallback){
  const number=Number(value);
  return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
}
function normalized(value){ return String(value||'').trim().toLowerCase(); }

export function goalTickCooldownTurns(goal={}){
  const row=object(goal);
  const drive=bounded(row.priority,1,5,3)+bounded(row.urgency,1,5,3);
  return drive>=9?2:3;
}

export function isGoalTickCoolingDown({saveState={},key='',goal={},turnNumber=0}={}){
  const previous=object(saveState?.sceneRuntime?.goal_tick);
  if(!previous.npc_key||String(previous.npc_key)!==String(key))return false;
  const currentId=normalized(goal?.id),previousId=normalized(previous.goal_id);
  const sameGoal=currentId||previousId?Boolean(currentId&&previousId&&currentId===previousId):normalized(goal?.desire)===normalized(previous.goal_desire);
  if(!sameGoal)return false;
  const elapsed=Math.max(0,Number(turnNumber||0)-Number(previous.turn||0));
  const cooldown=previous.manifested===false?1:goalTickCooldownTurns(goal);
  return elapsed<cooldown;
}

function manifestedInTurn(turn,key,name){
  const npcUpdates=array(turn?.state_delta?.npc_state_updates);
  if(npcUpdates.some(row=>String(row?.npc_key||row?.key||'')===key))return true;
  const relationChanges=array(turn?.state_delta?.relationship_changes);
  if(relationChanges.some(row=>String(row?.npc_key||row?.key||'')===key))return true;
  const needle=normalized(name);
  return array(turn?.scene).some(row=>String(row?.speaker_key||'')===key||(needle&&normalized(row?.text).includes(needle)));
}

function hasGoalEvidence(turn,key){
  return array(turn?.state_delta?.npc_state_updates).some(row=>{
    if(String(row?.npc_key||row?.key||'')!==key)return false;
    const delta=Number(row?.goal_progress_delta||0);
    return (Number.isFinite(delta)&&delta!==0)||Boolean(String(row?.goal_state||'').trim())||Boolean(String(row?.goal_reason||'').trim())||row?.goal_replace===true;
  });
}

export function deriveGoalTickState({previousRuntime={},directorTelemetry=null,turn={},turnNumber=0}={}){
  const previous=object(previousRuntime?.goal_tick);
  const telemetry=object(directorTelemetry);
  if(!PRESENT_GOAL_RESULTS.has(String(telemetry.result||'')))return Object.keys(previous).length?previous:null;
  const key=clampText(telemetry.selected_key||'',80);
  if(!key)return Object.keys(previous).length?previous:null;
  const goal=object(telemetry.selected_goal);
  const name=clampText(telemetry.selected_name||'',100);
  return{
    version:NPC_GOAL_TICK_VERSION,
    npc_key:key,
    goal_id:clampText(goal.id||'',100)||null,
    goal_desire:clampText(goal.desire||'',180),
    next_action:clampText(goal.next_action||'',160),
    turn:Math.max(0,Number(turnNumber||0)),
    result:String(telemetry.result||''),
    manifested:manifestedInTurn(turn,key,name),
    progress_evidence:hasGoalEvidence(turn,key),
  };
}
