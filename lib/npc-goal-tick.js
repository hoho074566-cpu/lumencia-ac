export const NPC_GOAL_TICK_VERSION = '1';

const PRESENT_GOAL_RESULTS = new Set(['PRESENT_NPC_GOAL_PRIORITY','PRESENT_NPC_GOAL_TICK']);
const MAX_RECENT_CHECKPOINTS = 6;
const NPC_ACTION_RE = /(?:말(?:했|한|하|을)|묻|대답|다가오|다가왔|이동|떠나|나가|들어오|고개|손을?|시선|걸음|움직|붙잡|잡아|건네|꺼내|펼치|막아|개입|외치|웃|미소|지시|명령|부르|쫓|공격|방어|제지|확인|살피)/i;

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
function scalarDifferent(previous,next){
  if(next===null||next===undefined)return false;
  if(typeof next==='number')return !Number.isFinite(Number(previous))||Number(previous)!==next;
  if(typeof next==='boolean')return Boolean(previous)!==next;
  return normalized(previous)!==normalized(next);
}
function checkpoint(row={}){
  const src=object(row);
  if(!src.npc_key)return null;
  return{
    version:NPC_GOAL_TICK_VERSION,
    npc_key:clampText(src.npc_key,80),
    goal_id:clampText(src.goal_id||'',100)||null,
    goal_desire:clampText(src.goal_desire||'',180),
    next_action:clampText(src.next_action||'',160),
    turn:Math.max(0,Number(src.turn||0)),
    result:String(src.result||''),
    manifested:src.manifested!==false,
    progress_evidence:Boolean(src.progress_evidence),
  };
}
function checkpointIdentity(row={}){ return `${String(row.npc_key||'')}|${normalized(row.goal_id)||normalized(row.goal_desire)}`; }
function recentCheckpoints(value={}){
  const src=object(value),seen=new Set(),rows=[];
  for(const candidate of [src,...array(src.recent)]){
    const row=checkpoint(candidate),identity=row?checkpointIdentity(row):'';
    if(!row||!identity||seen.has(identity))continue;
    seen.add(identity);rows.push(row);
  }
  return rows.sort((a,b)=>b.turn-a.turn).slice(0,MAX_RECENT_CHECKPOINTS);
}

export function goalTickCooldownTurns(goal={}){
  const row=object(goal);
  const drive=bounded(row.priority,1,5,3)+bounded(row.urgency,1,5,3);
  return drive>=9?2:3;
}

export function isGoalTickCoolingDown({saveState={},key='',goal={},turnNumber=0}={}){
  const currentId=normalized(goal?.id),currentDesire=normalized(goal?.desire);
  const previous=recentCheckpoints(saveState?.sceneRuntime?.goal_tick).find(row=>{
    if(String(row.npc_key)!==String(key))return false;
    const previousId=normalized(row.goal_id);
    return currentId||previousId?Boolean(currentId&&previousId&&currentId===previousId):currentDesire===normalized(row.goal_desire);
  });
  if(!previous)return false;
  const elapsed=Math.max(0,Number(turnNumber||0)-Number(previous.turn||0));
  const cooldown=previous.manifested===false?1:goalTickCooldownTurns(goal);
  return elapsed<cooldown;
}

function goalEvidenceInRow(saveState,row,key){
  if(String(row?.npc_key||row?.key||'')!==key)return false;
  const previous=object(saveState?.npcInnerStates?.[key]?.active_goal);
  const previousDesire=normalized(previous.desire||saveState?.npcStates?.[key]?.current_goal||'');
  const delta=Number(row?.goal_progress_delta||0);
  if((Number.isFinite(delta)&&delta!==0)||row?.goal_replace===true)return true;
  if(String(row?.goal_state||'').trim()&&normalized(row.goal_state)!==normalized(previous.state||(previousDesire?'active':'')))return true;
  return Boolean(String(row?.current_goal||'').trim()&&normalized(row.current_goal)!==previousDesire);
}
function npcStateChangedInRow(saveState,row,key){
  if(String(row?.npc_key||row?.key||'')!==key)return false;
  if(goalEvidenceInRow(saveState,row,key))return true;
  const previous=object(saveState?.npcStates?.[key]);
  return ['location','status','next_activity','next_location','next_change_minutes'].some(field=>Object.prototype.hasOwnProperty.call(row,field)&&scalarDifferent(previous[field],row[field]));
}
function manifestedInTurn(turn,key,name,saveState){
  if(array(turn?.state_delta?.npc_state_updates).some(row=>npcStateChangedInRow(saveState,row,key)))return true;
  const relationChanges=array(turn?.state_delta?.relationship_changes);
  if(relationChanges.some(row=>String(row?.npc_key||row?.key||'')===key&&(Number(row?.affinity_delta||0)!==0||Number(row?.trust_delta||0)!==0||Boolean(String(row?.status||'').trim()))))return true;
  const needle=normalized(name);
  return array(turn?.scene).some(row=>String(row?.speaker_key||'')===key||normalized(row?.speaker_name)===needle||(needle&&normalized(row?.text).includes(needle)&&NPC_ACTION_RE.test(String(row?.text||''))));
}

function hasGoalEvidence(turn,key,saveState){
  return array(turn?.state_delta?.npc_state_updates).some(row=>goalEvidenceInRow(saveState,row,key));
}

export function deriveGoalTickState({previousRuntime={},directorTelemetry=null,turn={},turnNumber=0,saveState={}}={}){
  const previous=object(previousRuntime?.goal_tick);
  const telemetry=object(directorTelemetry);
  if(!PRESENT_GOAL_RESULTS.has(String(telemetry.result||'')))return Object.keys(previous).length?previous:null;
  const key=clampText(telemetry.selected_key||'',80);
  if(!key)return Object.keys(previous).length?previous:null;
  const goal=object(telemetry.selected_goal);
  const name=clampText(telemetry.selected_name||'',100);
  const current={
    version:NPC_GOAL_TICK_VERSION,
    npc_key:key,
    goal_id:clampText(goal.id||'',100)||null,
    goal_desire:clampText(goal.desire||'',180),
    next_action:clampText(goal.next_action||'',160),
    turn:Math.max(0,Number(turnNumber||0)),
    result:String(telemetry.result||''),
    manifested:manifestedInTurn(turn,key,name,saveState),
    progress_evidence:hasGoalEvidence(turn,key,saveState),
  };
  const identity=checkpointIdentity(current);
  const recent=[current,...recentCheckpoints(previous).filter(row=>checkpointIdentity(row)!==identity)].slice(0,MAX_RECENT_CHECKPOINTS);
  return{...current,recent};
}
