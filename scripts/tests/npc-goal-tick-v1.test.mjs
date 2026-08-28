#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveGoalTickState, goalTickCooldownTurns, isGoalTickCoolingDown } from '../../lib/npc-goal-tick.js';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
p1=One, p2=Two
===== WORLD CANON =====
${divider}
PUBLIC ACADEMY
${divider}
Public academy facts.
===== NPC CANON =====
${divider}
One
${divider}
NPC One.
${divider}
Two
${divider}
NPC Two.
===== NPC SPEECH =====
${divider}
One
${divider}
Short speech.
${divider}
Two
${divider}
Short speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC ACTION RULES
${divider}
Resolve declared actions.`;

const baseDirector=`===== TURN OPTIONS =====
normal
===== AUTHORITATIVE SAVE_STATE =====
{}
===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====
INTERVENTION: light
ROUTINE_STREAK=0 / EVENT_GAP=0 / CHOICE_GAP=0 / CROSS_DEPT_GAP=0
- p1(One) score=50: baseline
- p2(Two) score=50: baseline
===== SCHEDULE ENGINE (AUTHORITATIVE) =====
none`;

function goal(id,priority=5,urgency=4){
  return{id,desire:'PC에게 실기 평가 결과를 직접 확인한다.',priority,urgency,progress:30,state:'active',target_type:'pc',target_key:'pc',next_actions:['평가 결과를 먼저 묻는다.']};
}
function route(action='주변을 살펴본다.',patch={},director=baseDirector,mode='game'){
  return routeOpenAIParams({instructions,input:director},{incoming:{action,saveState:{id:'goal-tick-v1',turnNumber:8,world:{date:'1285-03-01',time:'10:00',location:'academy'},pc:{name:'Tester'},sceneRuntime:{participants:['p1']},npcInnerStates:{p1:{active_goal:goal('goal:p1:test')}},...patch},recentTurns:[]},mode});
}

const proactive=route();
assert.equal(proactive.telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','a high-drive present goal must tick without waiting for a scene stall');
assert.equal(proactive.telemetry.event_director_v2.selected_key,'p1');
assert.match(proactive.params.input,/MODE=goal-tick/);
assert.match(proactive.params.input,/USER ACTION을 의미 목표까지 먼저 완료한 뒤/,'Goal Tick must not preempt the declared player action');
assert.match(proactive.params.input,/NEXT_ACTION=평가 결과를 먼저 묻는다/,'the bounded next action must reach the selected Goal Tick directive');
assert.match(proactive.params.input,/선택만으로 목표 진척을 만들지 말고/,'selection alone must not synthesize progress');
assert.match(proactive.params.input,/PC의 행동·대사·감정·중요 선택을 대신 결정하지 마라/,'player sovereignty must survive the routine authority budget');

const maximumGoal={...goal('g'.repeat(80)),desire:'긴 목표 설명 '.repeat(40),target_type:'pc',target_key:'t'.repeat(100),next_actions:['긴 다음 행동 '.repeat(35)]};
const maximumGuarded=route('주변을 살펴본다.',{
  npcInnerStates:{p1:{active_goal:maximumGoal}},
  routerFeedback:{routerVersion:'1.5.6-hf1',profile:'routine-17k-v154',lastInputTokens:26000},
});
assert.match(maximumGuarded.params.input,/ORDER=USER_ACTION_FIRST/,'action order must precede variable goal text at the minimum authority budget');
assert.match(maximumGuarded.params.input,/GUARDS=NO_PC_CONTROL\|FEASIBLE_ONLY\|GOAL_PROGRESS_EVIDENCE_ONLY\|IMPOSSIBLE_TO_HOOK/,'all invariant Goal Tick guards must survive maximum-length goal fields');

const lowDrive=route('주변을 살펴본다.',{npcInnerStates:{p1:{active_goal:goal('goal:p1:low',3,3)}}});
assert.equal(lowDrive.telemetry.event_director_v2.result,'NO_RANDOM_EVENT_DUE','low-drive goals must still wait for ordinary momentum pressure');

const stalled=route('10분 기다린다.',{sceneRuntime:{participants:['p1'],momentum:{stall_streak:2}},npcInnerStates:{p1:{active_goal:goal('goal:p1:stall',3,3)}}});
assert.equal(stalled.telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_PRIORITY','the existing stall-recovery path must remain available for ordinary active goals');

const coolingState={sceneRuntime:{participants:['p1'],goal_tick:{npc_key:'p1',goal_id:'goal:p1:test',goal_desire:'PC에게 실기 평가 결과를 직접 확인한다.',turn:8,manifested:true}}};
assert.equal(route('주변을 살펴본다.',coolingState).telemetry.event_director_v2.result,'NO_RANDOM_EVENT_DUE','a manifested goal tick must not repeat on the next turn');
const ignoredState={sceneRuntime:{participants:['p1'],goal_tick:{npc_key:'p1',goal_id:'goal:p1:test',goal_desire:'PC에게 실기 평가 결과를 직접 확인한다.',turn:8,manifested:false}}};
assert.equal(route('주변을 살펴본다.',ignoredState).telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','an ignored tick may retry after one turn');

const alternate=route('주변을 살펴본다.',{
  sceneRuntime:{participants:['p1','p2'],goal_tick:{npc_key:'p1',goal_id:'goal:p1:test',turn:8,manifested:true}},
  npcInnerStates:{p1:{active_goal:goal('goal:p1:test')},p2:{active_goal:goal('goal:p2:test')}},
});
assert.equal(alternate.telemetry.event_director_v2.selected_key,'p2','another eligible present NPC may act while the previous owner cools down');

const localPlaceGoal={...goal('goal:p1:place'),target_type:'place',target_key:'academy'};
assert.equal(route('주변을 살펴본다.',{npcInnerStates:{p1:{active_goal:localPlaceGoal}}}).telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','a present NPC may pursue a goal whose place target is the current location');
assert.equal(route('주변을 살펴본다.',{npcInnerStates:{p1:{active_goal:{...localPlaceGoal,target_key:'royal-palace'}}}}).telemetry.event_director_v2.result,'NO_RANDOM_EVENT_DUE','a remote place target must not authorize local initiative');

assert.equal(route('도서관으로 간다.').telemetry.event_director_v2.result,'NO_RANDOM_EVENT_DUE','committed travel must not be displaced by a present Goal Tick');
assert.equal(route('p2에게 질문한다.').telemetry.event_director_v2.result,'DIRECT_USER_FOCUS','direct NPC focus must remain authoritative');
assert.equal(route('그녀에게 질문한다.').telemetry.event_director_v2.result,'DIRECT_USER_FOCUS','pronoun-based direct NPC focus must remain ahead of unrelated Goal Tick initiative');
assert.equal(route('ask her about the result.').telemetry.event_director_v2.result,'DIRECT_USER_FOCUS','English pronoun-based direct NPC focus must also remain authoritative');
assert.equal(route('주변을 살펴본다.',{sceneRuntime:{participants:['p1'],turn_hook:{kind:'player-choice',status:'awaiting-player',anchor:'대답을 고른다.'}}}).telemetry.event_director_v2.result,'NO_RANDOM_EVENT_DUE','an awaiting-player hook must block proactive Goal Tick');
assert.equal(route('주변을 살펴본다.',{sceneRuntime:{participants:['p1'],unresolved_question:'대답할 선택이 남아 있다.'}}).telemetry.event_director_v2.result,'NO_RANDOM_EVENT_DUE','legacy unresolved player choice state must block proactive Goal Tick');
assert.equal(route('주변을 살펴본다.',{sceneRuntime:{participants:['p1'],eventProgress:{eventInstanceId:'active:test',activeBeat:'choice',paused:false}}}).telemetry.event_director_v2.result,'NO_RANDOM_EVENT_DUE','an active event beat must remain ahead of proactive Goal Tick');
const scheduled=baseDirector.replace('INTERVENTION: light','INTERVENTION: scheduled');
assert.notEqual(route('주변을 살펴본다.',{},scheduled).telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','fixed schedule flow must remain ahead of Goal Tick');
const upcomingAt=(time)=>({scheduleContext:{upcoming:[{id:'academy:fixed',title:'고정 수업',date:'1285-03-01',time,kind:'academic',participants:['pc']}]}});
assert.notEqual(route('주변을 살펴본다.',upcomingAt('10:01')).telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','an observation reaching the next fixed schedule boundary must block Goal Tick');
assert.notEqual(route('돌아다닌다.',upcomingAt('10:08')).telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','exploration must not cross a reachable fixed schedule boundary for Goal Tick');
assert.notEqual(route('좀 쉰다.',upcomingAt('10:10')).telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','open-ended downtime must yield to a reachable fixed schedule boundary');
assert.equal(route('주변을 살펴본다.',upcomingAt('10:02')).telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','a schedule beyond the observation window must not suppress eligible initiative');
const overdueSchedule={id:'academy:overdue',title:'이미 시작한 필수 수업',date:'1285-03-01',time:'09:59',kind:'academic',status:'scheduled',participants:['pc']};
assert.notEqual(route('주변을 살펴본다.',{scheduledEvents:[overdueSchedule],scheduleContext:{due:[overdueSchedule],upcoming:[]}}).telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','an overdue unfinished schedule must block unrelated proactive Goal Tick initiative');
assert.notEqual(route('주변을 살펴본다.',{},baseDirector,'auto').telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','AUTO keeps its existing fixed-flow authority');
assert.notEqual(route('주변을 살펴본다.',{},baseDirector,'continue').telemetry.event_director_v2.result,'PRESENT_NPC_GOAL_TICK','CONTINUE remains frozen');

assert.equal(goalTickCooldownTurns(goal('goal:p1:high')),2);
assert.equal(goalTickCooldownTurns(goal('goal:p1:low',3,3)),3);
assert.equal(isGoalTickCoolingDown({saveState:{sceneRuntime:coolingState.sceneRuntime},key:'p1',goal:goal('goal:p1:test'),turnNumber:9}),true);

const tickState=deriveGoalTickState({
  previousRuntime:{},
  directorTelemetry:proactive.telemetry.event_director_v2,
  turn:{scene:[{kind:'dialogue',speaker_key:'p1',text:'평가 결과를 보여 줘.'}],state_delta:{npc_state_updates:[]}},
  turnNumber:9,
});
assert.equal(tickState.npc_key,'p1');
assert.equal(tickState.manifested,true);
assert.equal(tickState.progress_evidence,false,'visible initiative without explicit Goal V2 evidence must not claim progress');

const ignoredTick=deriveGoalTickState({previousRuntime:{},directorTelemetry:proactive.telemetry.event_director_v2,turn:{scene:[],state_delta:{}},turnNumber:9});
assert.equal(ignoredTick.manifested,false);
const unchangedSave={npcStates:{p1:{location:'academy',status:'관찰 중',current_goal:'PC에게 실기 평가 결과를 직접 확인한다.'}},npcInnerStates:{p1:{active_goal:goal('goal:p1:test')}}};
const bookkeepingTick=deriveGoalTickState({
  previousRuntime:{},directorTelemetry:proactive.telemetry.event_director_v2,saveState:unchangedSave,turnNumber:9,
  turn:{scene:[{kind:'narration',speaker_key:null,text:'복도는 여전히 조용했다.'}],state_delta:{npc_state_updates:[{npc_key:'p1',location:'academy',status:'관찰 중',current_goal:'PC에게 실기 평가 결과를 직접 확인한다.'}]}},
});
assert.equal(bookkeepingTick.manifested,false,'unchanged NPC bookkeeping must not start the manifested cooldown');
assert.equal(bookkeepingTick.progress_evidence,false,'repeated goal metadata is not Goal V2 evidence');
const relationshipBookkeepingTick=deriveGoalTickState({
  previousRuntime:{},directorTelemetry:proactive.telemetry.event_director_v2,saveState:{relationships:{p1:{status:'중립'}}},turnNumber:9,
  turn:{scene:[],state_delta:{relationship_changes:[{npc_key:'p1',affinity_delta:0,trust_delta:0,status:'중립'}]}},
});
assert.equal(relationshipBookkeepingTick.manifested,false,'an unchanged zero-delta relationship status must not start cooldown');
const relationshipChangeTick=deriveGoalTickState({
  previousRuntime:{},directorTelemetry:proactive.telemetry.event_director_v2,saveState:{relationships:{p1:{status:'중립'}}},turnNumber:9,
  turn:{scene:[],state_delta:{relationship_changes:[{npc_key:'p1',affinity_delta:0,trust_delta:0,status:'경계'}]}},
});
assert.equal(relationshipChangeTick.manifested,true,'an actual selected-NPC relationship status change may start cooldown');
const movedTick=deriveGoalTickState({
  previousRuntime:{},directorTelemetry:proactive.telemetry.event_director_v2,saveState:unchangedSave,turnNumber:9,
  turn:{scene:[],state_delta:{npc_state_updates:[{npc_key:'p1',location:'courtyard',status:'이동 중'}]}},
});
assert.equal(movedTick.manifested,true,'an actual selected-NPC state change may start cooldown');

const driveEightGoal=goal('goal:p1:drive-eight',4,4);
const firstOwner=deriveGoalTickState({
  previousRuntime:{},turnNumber:9,saveState:{},
  directorTelemetry:{result:'PRESENT_NPC_GOAL_TICK',selected_key:'p1',selected_name:'One',selected_goal:driveEightGoal},
  turn:{scene:[{kind:'dialogue',speaker_key:'p1',text:'먼저 확인하지.'}],state_delta:{}},
});
const secondOwner=deriveGoalTickState({
  previousRuntime:{goal_tick:firstOwner},turnNumber:10,saveState:{},
  directorTelemetry:{result:'PRESENT_NPC_GOAL_TICK',selected_key:'p2',selected_name:'Two',selected_goal:goal('goal:p2:drive-eight',4,4)},
  turn:{scene:[{kind:'dialogue',speaker_key:'p2',text:'내 차례군.'}],state_delta:{}},
});
assert.equal(secondOwner.recent.length,2,'alternating NPC ticks must retain both bounded checkpoints');
assert.equal(isGoalTickCoolingDown({saveState:{sceneRuntime:{goal_tick:secondOwner}},key:'p1',goal:driveEightGoal,turnNumber:11}),true,'another NPC tick must not erase the first NPC per-goal cooldown');
const preserved=deriveGoalTickState({previousRuntime:{goal_tick:tickState},directorTelemetry:{result:'NO_RANDOM_EVENT_DUE'},turn:{},turnNumber:10});
assert.deepEqual(preserved,tickState,'non-tick turns must preserve the last bounded cooldown checkpoint');

const chatRouter=readFileSync('api/chat-router.js','utf8');
assert.equal((chatRouter.match(/coreHandler\(/g)||[]).length,1,'Goal Tick V1 must preserve one canonical core call site');
assert.match(chatRouter,/goal_tick:goalTick/,'the stable runtime must persist the Goal Tick checkpoint');
assert.match(chatRouter,/npc_goal_tick_v1:true/,'pipeline telemetry must advertise Goal Tick V1');

const pressuredAction=`${'조용히 생각을 정리한다. '.repeat(220)} 주변을 살펴본다.`;
const pressured=route(pressuredAction,{routerFeedback:{routerVersion:'1.5.6-hf1',profile:'routine-17k-v154',lastInputTokens:26000}});
assert.match(pressured.params.input,/RESULT=PRESENT_NPC_GOAL_TICK/,'Goal Tick authority must survive the minimum adaptive routine budget');
assert.match(pressured.params.input,/주변을 살펴본다\.[\s\S]*ROLE=SCENE_WRITER;POLICY≠FICTION;DEPTH>DISTANCE/,'the committed ending of a long user action must remain authoritative ahead of the composition authority tail');

console.log('PASS NPC Goal Tick V1 guarded present-NPC initiative regressions');
