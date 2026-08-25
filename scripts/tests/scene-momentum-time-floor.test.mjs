#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scheduledIdsDueByTurnEnd } from '../../lib/event-progress.js';
import { minutesUntilEventConsequence } from '../../lib/event-consequence.js';
import { buildSceneMomentumDirective, classifySceneIntent, isPcRelevantScheduleEvent, nextScheduleBoundaryMinutes, scheduleBoundaryLimitMinutes } from '../../lib/scene-momentum.js';

const source=readFileSync('api/chat-router.js','utf8');
const start=source.indexOf('function bounded(');
const end=source.indexOf('function uniqText(');
assert.ok(start>=0&&end>start,'Scene Momentum time-floor source markers missing');
const timeFloorSource=source.slice(start,end);
const makeHelpers=new Function('array','object','classifySceneIntent','isPcRelevantScheduleEvent','nextScheduleBoundaryMinutes','scheduleBoundaryLimitMinutes','scheduledIdsDueByTurnEnd','minutesUntilEventConsequence',`${timeFloorSource}\nreturn {applySceneMomentumTimeFloor,consequenceNpcKeysForShortening,consequenceNpcEffectsForShortening};`);
const array=(value)=>Array.isArray(value)?value:[];
const object=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const {applySceneMomentumTimeFloor,consequenceNpcKeysForShortening,consequenceNpcEffectsForShortening}=makeHelpers(array,object,classifySceneIntent,isPcRelevantScheduleEvent,nextScheduleBoundaryMinutes,scheduleBoundaryLimitMinutes,scheduledIdsDueByTurnEnd,minutesUntilEventConsequence);

const knightPc={name:'카인',department:'기사과'};
const irrelevantScheduleSave={
  pc:knightPc,
  world:{date:'1285-03-01',time:'09:50'},
  scheduleContext:{due:[],upcoming:[
    {id:'npc-briefing',title:'아르테미스 교관 회의',date:'1285-03-01',time:'09:54',participants:['artemis']},
    {id:'world-bell',title:'서문 종각 타종',date:'1285-03-01',time:'09:55',kind:'world',participants:[]},
    {id:'magic-class',title:'마법과 필수 수업',date:'1285-03-01',time:'09:56',kind:'academic',participants:['elena']},
    {id:'knight-class',title:'기사과 필수 수업',date:'1285-03-01',time:'10:00',kind:'academic',participants:['artemis']},
  ]},
};
assert.equal(isPcRelevantScheduleEvent(irrelevantScheduleSave,irrelevantScheduleSave.scheduleContext.upcoming[0]),false,'an NPC-only legacy row must not constrain the PC clock');
assert.equal(isPcRelevantScheduleEvent(irrelevantScheduleSave,irrelevantScheduleSave.scheduleContext.upcoming[1]),false,'a world-only event must progress independently');
assert.equal(isPcRelevantScheduleEvent(irrelevantScheduleSave,irrelevantScheduleSave.scheduleContext.upcoming[2]),false,'another department schedule must not constrain this PC');
assert.equal(isPcRelevantScheduleEvent(irrelevantScheduleSave,irrelevantScheduleSave.scheduleContext.upcoming[3]),true,'the PC department schedule remains authoritative');
assert.equal(isPcRelevantScheduleEvent(irrelevantScheduleSave,{id:'personal-magic-visit',title:'마법과 건물 개인 면담',kind:'personal',participants:['elena']}),true,'a personal PC appointment stays relevant even when its location names another department');
assert.equal(isPcRelevantScheduleEvent(irrelevantScheduleSave,{id:'joint-class',title:'기사과·마법과 합동 수업',kind:'academic',participants:['artemis','elena']}),true,'a cross-department academic event remains relevant to every named department');
assert.equal(nextScheduleBoundaryMinutes(irrelevantScheduleSave,{futureOnly:true}),10,'only the next PC-relevant schedule may become a hard stop');

const shortTravelSave={pc:knightPc,world:{date:'1285-03-01',time:'09:40'},scheduleContext:{due:[],upcoming:[{id:'knight-class',title:'기사과 필수 수업',date:'1285-03-01',time:'10:00',kind:'academic'}]}};
const shortTravelDirective=buildSceneMomentumDirective({action:'도서관에 간다.',saveState:shortTravelSave});
assert.doesNotMatch(shortTravelDirective,/SCHEDULE_BOUNDARY=20min/,'a short travel estimate must not be stretched to a later schedule boundary');
assert.match(shortTravelDirective,/SCHEDULE_CAP=20min/,'a later boundary inside the travel guide is a cap, not a required target');
assert.equal(scheduleBoundaryLimitMinutes(classifySceneIntent('도서관에 간다.')),3,'short travel hard-stop targeting is bounded by its minimum completion estimate');
let shortTravelTurn={state_delta:{advance_minutes:0},choices:['수업으로 간다','도서관으로 간다','기다린다'],event_progress:{event_instance_id:'knight-class'}};
applySceneMomentumTimeFloor({action:'도서관에 간다.',saveState:shortTravelSave},shortTravelTurn,'game');
assert.equal(shortTravelTurn.state_delta.advance_minutes,0,'post-processing must not align a short action to a later cap');

const boundarySave={world:{date:'1285-03-01',time:'09:50'},scheduleContext:{due:[],upcoming:[{id:'class',date:'1285-03-01',time:'10:00'}]}};
assert.equal(nextScheduleBoundaryMinutes(boundarySave),10,'next schedule boundary should be ten minutes away');
const boundedRestDirective=buildSceneMomentumDirective({action:'두 시간 쉰다.',saveState:boundarySave});
assert.match(boundedRestDirective,/SCHEDULE_BOUNDARY=10min/,'the model must receive the exact upcoming schedule boundary');
assert.match(boundedRestDirective,/120분 휴식을 경계 너머까지 실행하지 말고 10분 뒤 일정 시작 순간에서 멈춘다/,'the earlier mandatory schedule must override the longer downtime duration');
assert.match(boundedRestDirective,/SCHEDULE_BOUNDARY가 더 짧으면 그 일정 경계가 최우선/,'the explicit-duration rule must not contradict the earlier schedule boundary');
const implicitRestSave={world:{date:'1285-03-01',time:'09:25'},scheduleContext:{due:[],upcoming:[{id:'class',date:'1285-03-01',time:'10:00'}]}};
assert.match(buildSceneMomentumDirective({action:'쉰다.',saveState:implicitRestSave}),/SCHEDULE_BOUNDARY=35min/,'an implicit rest must expose any boundary reachable within its 30-240 minute guide');
assert.match(buildSceneMomentumDirective({action:'10분 기다린다.',saveState:boundarySave}),/SCHEDULE_BOUNDARY=10min/,'a boundary equal to the explicit duration must remain a hard stop');
let turn={state_delta:{advance_minutes:0},choices:[]};
applySceneMomentumTimeFloor({action:'쉰다.',saveState:boundarySave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,10,'forced downtime floor must stop at the next authoritative schedule boundary');
turn={state_delta:{advance_minutes:0},choices:[]};
applySceneMomentumTimeFloor({action:'두 시간 쉰다.',saveState:boundarySave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,10,'native-Korean long rest must stop at the next authoritative schedule boundary');

const ownClass={id:'basic-class',title:'기사과 기초 수업',date:'1285-03-01',time:'10:00',kind:'academic',status:'scheduled'};
const ownClassSave={pc:knightPc,world:{date:'1285-03-01',time:'09:00',location:'기숙사'},scheduleContext:{due:[],upcoming:[ownClass]},scheduledEvents:[ownClass]};
const ownClassAction='10시에 기초 수업에 참석한다.';
const ownClassIntent=classifySceneIntent(ownClassAction,{location:'기숙사',currentTime:'09:00'});
assert.equal(nextScheduleBoundaryMinutes(ownClassSave,{futureOnly:true,action:ownClassAction,intent:ownClassIntent}),null,'an explicitly requested scheduled activity must not interrupt itself at its own start');
const modifiedOwnClassAction='오전 10시에 기사과의 기초 수업을 듣는다.';
const modifiedOwnClassIntent=classifySceneIntent(modifiedOwnClassAction,{location:'기숙사',currentTime:'09:00'});
assert.equal(nextScheduleBoundaryMinutes(ownClassSave,{futureOnly:true,action:modifiedOwnClassAction,intent:modifiedOwnClassIntent}),null,'temporal modifiers and Korean possessive particles must not make the requested class interrupt itself');
const compoundOwnClassAction='9시에 아침을 먹고 10시에 기사과의 기초 수업을 듣는다.';
const compoundOwnClassIntent=classifySceneIntent(compoundOwnClassAction,{location:'기숙사',currentTime:'09:00'});
assert.equal(nextScheduleBoundaryMinutes(ownClassSave,{futureOnly:true,action:compoundOwnClassAction,intent:compoundOwnClassIntent}),null,'tokens from an earlier compound-action clause must not make the selected terminal class interrupt itself');
const otherSameTimeClass={id:'advanced-class',title:'기사과 고급 수업',date:'1285-03-01',time:'10:00',kind:'academic',status:'scheduled'};
assert.equal(nextScheduleBoundaryMinutes({...ownClassSave,scheduleContext:{due:[],upcoming:[ownClass,otherSameTimeClass]},scheduledEvents:[ownClass,otherSameTimeClass]},{futureOnly:true,action:ownClassAction,intent:ownClassIntent}),60,'a different same-time class must remain authoritative even when it shares a department token with the requested class');
assert.doesNotMatch(buildSceneMomentumDirective({action:ownClassAction,saveState:ownClassSave}),/SCHEDULE_BOUNDARY=60min/,'the requested class start must remain part of class completion rather than become a new choice stop');
turn={scene_title:'기초 수업',scene:[{kind:'narration',text:'10시에 수업이 시작되어 첫 교시를 마쳤다.'}],state_delta:{advance_minutes:60,scheduled_events_complete:['basic-class']},choices:[],event_progress:{event_instance_id:'basic-class'}};
applySceneMomentumTimeFloor({action:ownClassAction,saveState:ownClassSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,105,'the requested class must advance through its start and minimum session duration');
assert.deepEqual(turn.state_delta.scheduled_events_complete,['basic-class'],'completing the requested class must survive because the turn was not shortened at its own start');
const earlierAppointment={id:'mentor-meeting',title:'교수 면담',date:'1285-03-01',time:'09:30',kind:'personal',status:'scheduled'};
assert.equal(nextScheduleBoundaryMinutes({...ownClassSave,scheduleContext:{due:[],upcoming:[earlierAppointment,ownClass]},scheduledEvents:[earlierAppointment,ownClass]},{futureOnly:true,action:ownClassAction,intent:ownClassIntent}),30,'excluding the requested class must not hide an earlier unrelated appointment');

const boundaryChoiceSave={...boundarySave,pc:knightPc,scheduledEvents:[{id:'past-ceremony',date:'1285-03-01',time:'08:00',status:'scheduled'},{id:'class',date:'1285-03-01',time:'10:00',status:'scheduled'}]};
turn={state_delta:{advance_minutes:0},choices:['수업에 간다','남는다','다른 일을 한다'],event_progress:{event_instance_id:'class'}};
applySceneMomentumTimeFloor({action:'두 시간 쉰다.',saveState:boundaryChoiceSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,10,'an unrelated overdue row must not hide the structured future schedule boundary');
turn={scene_title:'정오의 호출',scene:[{kind:'narration',text:'기사과 1학년 필수 오리엔테이션이 시작되어 참석 여부를 정해야 한다.'}],state_delta:{advance_minutes:0},choices:['참석한다','남는다','다른 일을 한다'],event_progress:null};
applySceneMomentumTimeFloor({action:'두 시간 쉰다.',saveState:{...boundaryChoiceSave,scheduledEvents:[{id:'class',title:'기사과 필수 오리엔테이션',date:'1285-03-01',time:'10:00',status:'scheduled'}]}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,10,'authoritative boundary title evidence must align the clock even when event_progress is omitted');
turn={scene_title:'오리엔테이션 전의 소란',scene:[{kind:'narration',text:'기사과 필수 오리엔테이션 이야기가 들리지만 지금은 다른 개입이다.'}],state_delta:{advance_minutes:0},choices:['대응한다','피한다','지켜본다'],event_progress:{event_instance_id:'director:interruption'}};
applySceneMomentumTimeFloor({action:'두 시간 쉰다.',saveState:{...boundaryChoiceSave,scheduledEvents:[{id:'class',title:'기사과 필수 오리엔테이션',date:'1285-03-01',time:'10:00',status:'scheduled'}]}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,0,'an unrelated structured interruption must not be mistaken for the mentioned future schedule');
turn={state_delta:{advance_minutes:0},choices:['대응한다','피한다','지켜본다'],event_progress:{event_instance_id:'director:interruption'}};
applySceneMomentumTimeFloor({action:'두 시간 쉰다.',saveState:boundaryChoiceSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,0,'an unrelated meaningful interruption must remain at its model-produced moment');
const implicitBoundaryChoiceSave={...implicitRestSave,scheduledEvents:[{id:'class',date:'1285-03-01',time:'10:00',status:'scheduled'}]};
turn={state_delta:{advance_minutes:0},choices:['수업에 간다','남는다','다른 일을 한다'],event_progress:{event_instance_id:'class'}};
applySceneMomentumTimeFloor({action:'쉰다.',saveState:implicitBoundaryChoiceSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,35,'a boundary within the implicit 30-240 minute guide must align the structured event and clock');

const fullScheduleSave={world:{date:'1285-03-01',time:'07:00'},scheduleContext:{due:[],upcoming:[]},scheduledEvents:[{id:'noon-class',date:'1285-03-01',time:'12:00',status:'scheduled'}]};
assert.equal(nextScheduleBoundaryMinutes(fullScheduleSave),300,'full authoritative schedule must expose events beyond the four-hour upcoming window');
turn={state_delta:{advance_minutes:0},choices:[]};
applySceneMomentumTimeFloor({action:'6시간 쉰다.',saveState:fullScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,300,'long downtime must stop at a later authoritative scheduled event');

const nextDaySave={world:{date:'1285-03-01',time:'23:00'},scheduleContext:{due:[],upcoming:[]},scheduledEvents:[{id:'night-watch',date:'1285-03-02',time:'01:00',status:'scheduled'}]};
assert.equal(nextScheduleBoundaryMinutes(nextDaySave),120,'next-day authoritative events must bound a long time floor');
turn={state_delta:{advance_minutes:0},choices:[]};
applySceneMomentumTimeFloor({action:'6시간 쉰다.',saveState:nextDaySave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,120,'long downtime must not cross a next-day scheduled event');

const ignoredSchedule={world:{date:'1285-03-01',time:'07:00'},scheduleContext:{due:[],upcoming:[]},scheduledEvents:[{id:'done',date:'1285-03-01',time:'08:00',status:'completed'},{id:'cancelled',date:'1285-03-01',time:'09:00',status:'cancelled'}]};
assert.equal(nextScheduleBoundaryMinutes(ignoredSchedule),null,'completed/cancelled authoritative events must not create a time boundary');
turn={state_delta:{advance_minutes:0},choices:[]};
applySceneMomentumTimeFloor({action:'6시간 쉰다.',saveState:ignoredSchedule},turn,'game');
assert.equal(turn.state_delta.advance_minutes,360,'ignored terminal schedule rows must not shorten the requested floor');

const overdueSchedule={world:{date:'1285-03-01',time:'13:00'},scheduleContext:{due:[],upcoming:[]},scheduledEvents:[{id:'overdue',date:'1285-03-01',time:'12:00',status:'scheduled'}]};
assert.equal(nextScheduleBoundaryMinutes(overdueSchedule),0,'an overdue unfinished authoritative event must stop local time advancement immediately');
assert.equal(nextScheduleBoundaryMinutes(overdueSchedule,{futureOnly:true}),null,'an overdue event is current context, not a future model hard stop');
assert.doesNotMatch(buildSceneMomentumDirective({action:'기숙사로 간다.',saveState:overdueSchedule}),/SCHEDULE_BOUNDARY=0min/,'an overdue event must not contradict a newly committed travel action');
turn={state_delta:{advance_minutes:0},choices:[]};
applySceneMomentumTimeFloor({action:'6시간 쉰다.',saveState:overdueSchedule},turn,'game');
assert.equal(turn.state_delta.advance_minutes,360,'an already-overdue event must not freeze a newly committed downtime action');

turn={state_delta:{advance_minutes:0},choices:[]};
applySceneMomentumTimeFloor({action:'48시간 쉰다.',saveState:{world:{date:'1285-03-01',time:'14:00'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,1440,'locally forced floor must respect canonical one-turn maximum');

turn={state_delta:{advance_minutes:15},choices:[]};
applySceneMomentumTimeFloor({action:'쉰다.',saveState:boundarySave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,10,'a positive model advance that crosses a required schedule must clamp to that schedule');
turn={state_delta:{advance_minutes:400},choices:[]};
applySceneMomentumTimeFloor({action:'6시간 쉰다.',saveState:fullScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,300,'an explicit duration that crosses a required schedule must clamp even when the model omits the boundary');

turn={scene:[{kind:'narration',text:'잠에서 깨어나 몸을 일으켰다.'}],state_delta:{advance_minutes:60},choices:['일어난다','일정을 확인한다','더 쉰다']};
applySceneMomentumTimeFloor({action:'잠을 잔다.',saveState:{world:{date:'1285-03-02',time:'07:20'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,240,'post-sleep choices must not let a completed sleep action undercut its profile minimum');
turn={state_delta:{advance_minutes:960},choices:[]};
applySceneMomentumTimeFloor({action:'잠을 잔다.',saveState:{world:{date:'1285-03-01',time:'15:20'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,480,'a completed sleep action must not jump to a convenient next morning beyond its profile maximum');

turn={scene_title:'기초 수업의 첫 교시',scene:[{kind:'narration',text:'10시 30분에 기초 수업이 시작되었다.'}],state_delta:{advance_minutes:120},choices:[]};
applySceneMomentumTimeFloor({action:'10시 30분에 기초 수업을 듣는다.',saveState:{world:{date:'1285-03-02',time:'07:40'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,215,'a future class start plus its minimum duration must not be clamped to the unscheduled class maximum');

turn={
  event_progress:{event_instance_id:'next-morning',active_beat:'complete',completed_beats:['complete']},choices:[],
  state_delta:{advance_minutes:960,new_location:'여관',fatigue_delta:-3,stat_progress:[{stat:'신체',amount:1}],active_events_add:['next-morning'],active_events_remove:['night'],completed_events_add:['next-morning'],scheduled_events_add:[{id:'future'}],scheduled_events_remove:['old-future'],scheduled_events_complete:['morning-class'],npc_state_updates:[{npc_key:'artemis',last_seen:'1285-03-02 07:20'}],npc_schedule_updates:[{npc_key:'artemis',time:'07:20'}],pc_knowledge_add:['다음 날 결과'],memories_add:[{fact:'다음 날 결과'}],hooks_add:[{id:'future'}],hooks_update:[{id:'future',status:'resolved'}],delayed_consequences_add:[{event_name:'future'}]},
};
applySceneMomentumTimeFloor({action:'잠을 잔다.',saveState:{world:{date:'1285-03-01',time:'15:20'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,480,'overshooting sleep still clamps to the profile maximum');
assert.equal(turn.event_progress,null,'future event progress must not survive a shortened turn');
for(const field of ['active_events_add','active_events_remove','completed_events_add','scheduled_events_add','scheduled_events_remove','scheduled_events_complete','npc_state_updates','npc_schedule_updates','pc_knowledge_add','memories_add','hooks_add','hooks_update','delayed_consequences_add'])assert.deepEqual(turn.state_delta[field],[],`${field} must fail closed when model time is shortened`);
assert.equal(turn.state_delta.new_location,'여관','action-local location completion survives time reconciliation');
assert.equal(turn.state_delta.fatigue_delta,-3,'action-local resource effects survive time reconciliation');
assert.equal(turn.state_delta.stat_progress.length,1,'action-local growth evidence survives time reconciliation');

const consequenceHook={id:'consequence:emily-arrival',title:'에밀리의 도착',status:'deferred',importance:3,event_consequence:{version:'1.0',event_name:'에밀리의 도착',target_bucket:'active',reason:'에밀리가 약속 장소에 도착한다',secret_level:0,due_at:'1285-03-01T09:40',expires_at:'1285-03-04T09:40'}};
const consequenceSave={world:{date:'1285-03-01',time:'09:20'},hooks:[consequenceHook],scheduleContext:{due:[],upcoming:[]},scheduledEvents:[]};
turn={scene:[{kind:'narration',text:'약속 시각이 되자 에밀리가 중앙광장에 도착해 후문 경계를 시작했다.'}],state_delta:{advance_minutes:40,npc_state_updates:[{npc_key:'emily',location:'중앙광장',status:'도착',next_activity:'오후 순찰'},{npc_key:'artemis',location:'기사과 교관실'}],npc_schedule_updates:[{npc_key:'emily',delay_minutes:20,location:'중앙광장',activity:'후문 경계',reason:'도착 후 경계'},{npc_key:'artemis',delay_minutes:20,location:'기사과 교관실',activity:'회의',reason:'정기 일정'}],hooks_update:[{id:consequenceHook.id,status:'resolved'}]},choices:[]};
const consequenceNpcKeys=consequenceNpcKeysForShortening(turn,{event_name:'약속 상대의 도착',reason:'약속 장소에 도착한다',secret_level:0},[],{emily:'에밀리',artemis:'아르테미스'});
assert.deepEqual(consequenceNpcKeys,['emily'],'a visible NPC named in the consequence-bearing sentence must be attributed even when the queued title did not name them');
const consequenceEffects=consequenceNpcEffectsForShortening(turn,{event_name:'약속 상대의 도착',reason:'약속 장소에 도착한다',secret_level:0},[],{emily:'에밀리',artemis:'아르테미스'});
applySceneMomentumTimeFloor({action:'40분 기다린다.',saveState:consequenceSave},turn,'game',{selected_id:consequenceHook.id,status:'resolved',...consequenceEffects});
assert.equal(turn.state_delta.advance_minutes,20,'a due consequence inside a longer wait must stop at its exact trigger');
assert.deepEqual(turn.state_delta.npc_state_updates,[{npc_key:'emily',location:'중앙광장',status:'도착'}],'NPC state attributable to the resolved consequence must survive shortening');
assert.deepEqual(turn.state_delta.npc_schedule_updates,[],'relative NPC schedules must fail closed because their delay cannot be safely rebased to the shortened boundary');
assert.deepEqual(turn.state_delta.hooks_update,[{id:consequenceHook.id,status:'resolved'}],'the preserved consequence state and its resolved lifecycle must remain aligned');

const rangedConsequenceSave={...consequenceSave,world:{...consequenceSave.world,time:'08:40'}};
turn={scene:[{kind:'narration',text:'한 시간째 약속 시각이 되어 에밀리가 중앙광장에 도착했다.'}],state_delta:{advance_minutes:90,npc_state_updates:[{npc_key:'emily',location:'중앙광장',status:'도착'}],hooks_update:[{id:consequenceHook.id,status:'resolved'}]},choices:[]};
const rangedEffects=consequenceNpcEffectsForShortening(turn,{event_name:'약속 상대의 도착',reason:'약속 장소에 도착한다',secret_level:0},['emily'],{emily:'에밀리'});
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:rangedConsequenceSave},turn,'game',{selected_id:consequenceHook.id,status:'resolved',...rangedEffects});
assert.equal(turn.state_delta.advance_minutes,60,'a resolved consequence inside the full valid training range must align to its routed trigger');
assert.deepEqual(turn.state_delta.npc_state_updates,[{npc_key:'emily',location:'중앙광장',status:'도착'}],'full-range consequence alignment must retain its attributable NPC state');

turn={scene:[{kind:'narration',text:'한 시간째 약속 시각이 되어 에밀리가 중앙광장에 도착했다.'},{kind:'narration',text:'그 뒤 에밀리는 기숙사로 떠났다.'}],state_delta:{advance_minutes:90,npc_state_updates:[{npc_key:'emily',location:'기숙사',status:'떠남'}],npc_schedule_updates:[{npc_key:'emily',delay_minutes:30,location:'기숙사',activity:'휴식',reason:'약속 종료'}],hooks_update:[{id:consequenceHook.id,status:'resolved'}]},choices:[]};
const ambiguousEffects=consequenceNpcEffectsForShortening(turn,{event_name:'약속 상대의 도착',reason:'약속 장소에 도착한다',secret_level:0},['emily'],{emily:'에밀리'});
assert.equal(ambiguousEffects.attribution_safe,false,'a later final state for the same NPC must not be attributed to the earlier consequence boundary');
assert.deepEqual(ambiguousEffects.npc_state_updates,[],'future same-NPC state must fail closed when it does not match the boundary effect');
assert.deepEqual(ambiguousEffects.npc_schedule_updates,[],'future same-NPC schedule must fail closed when it does not match the boundary effect');
const namedNpcEffects=consequenceNpcEffectsForShortening(turn,{event_name:'에밀리의 도착',reason:'에밀리가 약속 장소에 도착한다',secret_level:0},['emily'],{emily:'에밀리'});
assert.equal(namedNpcEffects.attribution_safe,false,'the NPC name in the consequence title must not make a later same-NPC sentence boundary-owned');
assert.deepEqual(namedNpcEffects.npc_state_updates,[],'a named consequence must still reject the NPC final state from a later sentence');
const ambiguousLifecycle={selected_id:consequenceHook.id,status:'resolved',evidence:'visible-result',...ambiguousEffects};
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:rangedConsequenceSave},turn,'game',ambiguousLifecycle);
assert.equal(turn.state_delta.advance_minutes,90,'an unshortened full response may retain its later same-NPC state at the matching final clock');
assert.deepEqual(turn.state_delta.npc_state_updates,[{npc_key:'emily',location:'기숙사',status:'떠남'}],'full-clock state remains aligned when unsafe boundary attribution prevents shortening');
const sameLocationLaterTurn={scene:[{kind:'narration',text:'약속 시각이 되어 에밀리가 중앙광장에 도착했다.'},{kind:'narration',text:'그 뒤 에밀리는 중앙광장에 남아 약속 종료 후 휴식할 계획을 세웠다.'}],state_delta:{npc_state_updates:[{npc_key:'emily',location:'중앙광장',status:'도착'}],npc_schedule_updates:[{npc_key:'emily',delay_minutes:30,location:'중앙광장',activity:'약속 종료 후 휴식',reason:'후속 계획'}]}};
const sameLocationLaterEffects=consequenceNpcEffectsForShortening(sameLocationLaterTurn,{event_name:'약속 상대의 도착',reason:'약속 장소에 도착한다',secret_level:0},['emily'],{emily:'에밀리'});
assert.deepEqual(sameLocationLaterEffects.npc_state_updates,[{npc_key:'emily',location:'중앙광장',status:'도착'}],'matching boundary state may survive even when a later same-location plan is present');
assert.deepEqual(sameLocationLaterEffects.npc_schedule_updates,[],'a later same-location schedule must not survive from a partial event-token overlap');
const identicalLaterScheduleTurn={scene:[{kind:'narration',text:'약속 시각이 되어 에밀리가 중앙광장에 도착해 휴식을 시작했다.'}],state_delta:{npc_schedule_updates:[{npc_key:'emily',delay_minutes:30,location:'중앙광장',activity:'휴식',reason:'후속 휴식'}]}};
const identicalLaterScheduleEffects=consequenceNpcEffectsForShortening(identicalLaterScheduleTurn,{event_name:'에밀리의 도착',reason:'에밀리가 약속 장소에 도착한다',secret_level:0},['emily'],{emily:'에밀리'});
assert.equal(identicalLaterScheduleEffects.attribution_safe,false,'an identical location/activity schedule without absolute boundary timing must keep attribution unresolved');
assert.deepEqual(identicalLaterScheduleEffects.npc_schedule_updates,[],'unverified relative delay and reason must never survive consequence-boundary shortening');
turn={scene:[{kind:'narration',text:'한 시간째 약속 시각이 되어 에밀리가 중앙광장에 도착했다.'},{kind:'narration',text:'그 뒤 에밀리는 기숙사로 떠났다.'}],state_delta:{advance_minutes:180,npc_state_updates:[{npc_key:'emily',location:'기숙사',status:'떠남'}],hooks_update:[{id:consequenceHook.id,status:'resolved'}]},choices:[]};
const cappedAmbiguousLifecycle={selected_id:consequenceHook.id,status:'resolved',evidence:'visible-result',...ambiguousEffects};
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:rangedConsequenceSave},turn,'game',cappedAmbiguousLifecycle);
assert.equal(turn.state_delta.advance_minutes,120,'an unsafe oversized response still obeys the activity maximum without rewinding to the consequence boundary');
assert.deepEqual(turn.state_delta.npc_state_updates,[],'future same-NPC state must be cleared when the oversized response is shortened');
assert.deepEqual(turn.state_delta.hooks_update,[{id:consequenceHook.id,status:'open',reason:'발현 시각 도달; NPC 경계 효과 귀속 대기'}],'an ambiguously attributed consequence must remain unresolved after shortening');
assert.equal(cappedAmbiguousLifecycle.status,'open','telemetry must agree that the shortened ambiguous consequence is unresolved');

const liveBoundarySave={
  pc:knightPc,
  world:{date:'1285-03-01',time:'11:05',location:'기사과 훈련장'},
  scheduleContext:{due:[],upcoming:[{id:'knight-orientation',title:'기사과 1학년 필수 오리엔테이션',date:'1285-03-01',time:'12:00',kind:'academic'}]},
  scheduledEvents:[{id:'knight-orientation',title:'기사과 1학년 필수 오리엔테이션',date:'1285-03-01',time:'12:00',kind:'academic',status:'scheduled'}],
};
turn={scene_title:'정오를 알리는 종',scene:[{kind:'narration',text:'세 시간을 채우기 전에 기사과 필수 오리엔테이션을 알리는 종이 울렸다.'}],state_delta:{advance_minutes:180},choices:['참석한다','남는다','다른 곳으로 간다'],event_progress:null};
applySceneMomentumTimeFloor({action:'정확히 세 시간 동안 검술 훈련을 계속한다.',saveState:liveBoundarySave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,55,'a surfaced required schedule boundary must reduce an overshooting positive model advance to the exact boundary');

const rangedScheduleSave={...liveBoundarySave,world:{...liveBoundarySave.world,time:'09:00'},scheduleContext:{due:[],upcoming:[{id:'knight-orientation',title:'기사과 1학년 필수 오리엔테이션',date:'1285-03-01',time:'10:00',kind:'academic'}]},scheduledEvents:[{id:'knight-orientation',title:'기사과 1학년 필수 오리엔테이션',date:'1285-03-01',time:'10:00',kind:'academic',status:'scheduled'}]};
turn={scene_title:'훈련 종료',scene:[{kind:'narration',text:'검술 훈련을 마쳤다.'}],state_delta:{advance_minutes:90,scheduled_events_complete:['knight-orientation'],npc_state_updates:[{npc_key:'artemis',last_seen:'10:30'}]},choices:[],event_progress:null};
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:rangedScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,60,'a ranged activity that crosses an intervening required schedule must stop at that schedule');
assert.deepEqual(turn.state_delta.scheduled_events_complete,[],'the crossed schedule must not remain completed after the clock is shortened to its start');
assert.deepEqual(turn.state_delta.npc_state_updates,[],'future NPC state must not survive schedule-cap reconciliation');

const underreportedScheduleSave={...rangedScheduleSave,world:{...rangedScheduleSave.world,time:'11:00'},scheduleContext:{due:[],upcoming:[{id:'knight-orientation',title:'기사과 1학년 필수 오리엔테이션',date:'1285-03-01',time:'12:00',kind:'academic'}]},scheduledEvents:[{id:'knight-orientation',title:'기사과 1학년 필수 오리엔테이션',date:'1285-03-01',time:'12:00',kind:'academic',status:'scheduled'}]};
turn={scene_title:'훈련장의 마지막 보폭',scene:[{kind:'narration',text:'약 40분 뒤, 훈련장 외부에서 정오를 알리는 종이 울렸다.'},{kind:'narration',text:'기사과 필수 오리엔테이션에 대응할 시점이다.'}],state_delta:{advance_minutes:40,scheduled_events_complete:['knight-orientation'],completed_events_add:['knight-orientation'],active_events_remove:['knight-orientation']},choices:['오리엔테이션으로 간다','남는다','다른 곳으로 간다'],event_progress:null};
applySceneMomentumTimeFloor({action:'기본 검술 자세와 발놀림을 충분히 훈련한다.',saveState:underreportedScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,60,'a visibly occurred boundary inside the activity range must align an underreported model clock');
for(const field of ['scheduled_events_complete','completed_events_add','active_events_remove'])assert.deepEqual(turn.state_delta[field],[],`${field} must not complete the occurrence at its start boundary`);

turn={scene_title:'훈련장의 기본기',scene:[{kind:'narration',text:'40분 동안 기본 자세를 반복했다.'},{kind:'narration',text:'기사과 필수 오리엔테이션은 정오에 예정되어 있어 아직 20분 남아 있다.'}],state_delta:{advance_minutes:40},choices:[],event_progress:null};
applySceneMomentumTimeFloor({action:'기본 검술 자세와 발놀림을 충분히 훈련한다.',saveState:underreportedScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,40,'a future schedule mention must not stretch a completed short activity to the boundary');

turn={scene_title:'훈련장의 예고',scene:[{kind:'narration',text:'곧 정오를 알리는 종이 울릴 것이다.'},{kind:'narration',text:'기사과 필수 오리엔테이션에 늦지 않을 만큼 시간이 남아 있다.'}],state_delta:{advance_minutes:40},choices:[],event_progress:null};
applySceneMomentumTimeFloor({action:'기본 검술 자세와 발놀림을 충분히 훈련한다.',saveState:underreportedScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,40,'a predicted bell must not be mistaken for an already occurred boundary');

turn={scene_title:'훈련장의 예고',scene:[{kind:'narration',text:'정오를 알리는 종이 울렸을 것이다.'},{kind:'narration',text:'기사과 필수 오리엔테이션의 시작 여부는 아직 확인되지 않았다.'}],state_delta:{advance_minutes:40},choices:[],event_progress:null};
applySceneMomentumTimeFloor({action:'기본 검술 자세와 발놀림을 충분히 훈련한다.',saveState:underreportedScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,40,'a speculative past-form bell must not be treated as observed occurrence evidence');

turn={scene_title:'기사과 필수 오리엔테이션 개막',scene:[{kind:'narration',text:'기사과 필수 오리엔테이션이 시작되었다.'}],state_delta:{advance_minutes:40},choices:['참석한다','남는다','다른 곳으로 간다'],event_progress:null};
applySceneMomentumTimeFloor({action:'기본 검술 자세와 발놀림을 충분히 훈련한다.',saveState:underreportedScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,60,'an exact visibly started occurrence must align to its authoritative schedule even without a bell');

turn={scene_title:'오리엔테이션 호출',scene:[{kind:'narration',text:'호출에 대응해야 한다.'}],state_delta:{advance_minutes:40,scheduled_events_complete:['knight-orientation']},choices:['참석한다','남는다','다른 곳으로 간다'],event_progress:{event_instance_id:'knight-orientation',active_beat:'start'}};
applySceneMomentumTimeFloor({action:'기본 검술 자세와 발놀림을 충분히 훈련한다.',saveState:underreportedScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,60,'an exact structured occurrence ID must align an underreported clock without textual title matching');
assert.deepEqual(turn.state_delta.scheduled_events_complete,[],'structured start evidence must not complete its own schedule at the boundary');

turn={scene_title:'오리엔테이션 종료',scene:[{kind:'narration',text:'기사과 필수 오리엔테이션을 모두 마쳤다.'}],state_delta:{advance_minutes:40,scheduled_events_complete:['knight-orientation'],completed_events_add:['knight-orientation']},choices:[],event_progress:{event_instance_id:'knight-orientation',active_beat:'complete',completed_beats:['arrival','complete']}};
applySceneMomentumTimeFloor({action:'기본 검술 자세와 발놀림을 충분히 훈련한다.',saveState:underreportedScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,60,'structured completion evidence may align only to the authoritative start when the reported clock is short');
assert.equal(turn.event_progress,null,'event completion progress must not survive reconciliation to the occurrence start');
assert.deepEqual(turn.state_delta.scheduled_events_complete,[],'the rewound occurrence must remain incomplete at its start');

turn={scene_title:'진행 중인 의뢰와 정오',scene:[{kind:'narration',text:'기사과 필수 오리엔테이션이 정오에 시작되었다.'}],state_delta:{advance_minutes:40},choices:['참석한다','의뢰를 계속한다','다른 곳으로 간다'],event_progress:{event_instance_id:'active:quest',active_beat:'investigate'}};
applySceneMomentumTimeFloor({action:'기본 검술 자세와 발놀림을 충분히 훈련한다.',saveState:underreportedScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,60,'a visibly started schedule must align even while an unrelated event remains active');
assert.equal(turn.event_progress.event_instance_id,'active:quest','the unrelated active event must remain intact at the schedule boundary');

turn={scene_title:'훈련장의 기본기',scene:[{kind:'narration',text:'기사과 필수 오리엔테이션은 10시에 예정되어 있다.'},{kind:'narration',text:'10시 30분을 알리는 종이 울렸다.'}],state_delta:{advance_minutes:40},choices:[],event_progress:null};
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:rangedScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,40,'a later clock sharing the same hour must not satisfy an earlier exact schedule boundary');

const beyondProfileScheduleSave={...underreportedScheduleSave,scheduleContext:{due:[],upcoming:[{id:'late-orientation',title:'기사과 심화 오리엔테이션',date:'1285-03-01',time:'13:30',kind:'academic'}]},scheduledEvents:[{id:'late-orientation',title:'기사과 심화 오리엔테이션',date:'1285-03-01',time:'13:30',kind:'academic',status:'scheduled'}]};
turn={scene_title:'기사과 심화 오리엔테이션 개막',scene:[{kind:'narration',text:'기사과 심화 오리엔테이션이 시작되었다.'}],state_delta:{advance_minutes:40},choices:['참석한다','남는다','다른 곳으로 간다'],event_progress:null};
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:beyondProfileScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,40,'visible schedule text beyond the activity maximum must not stretch the action to a distant boundary');

turn={state_delta:{advance_minutes:10},choices:['대응한다','피한다','지켜본다'],event_progress:{event_instance_id:'director:interruption'}};
applySceneMomentumTimeFloor({action:'잠을 잔다.',saveState:{world:{date:'1285-03-02',time:'07:20'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,10,'a structured unrelated interruption must preserve its model-produced early stop');
turn={scene:[{kind:'narration',text:'10분 동안 자세를 반복하던 중 훈련장 문밖에서 비명이 들렸다.'}],state_delta:{advance_minutes:10},choices:['밖으로 달려간다','교관을 부른다','훈련을 계속한다'],event_progress:null};
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:{world:{date:'1285-03-02',time:'07:20'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,10,'a positive-time hazard choice during an unfinished activity must stop at its actual moment');
turn={scene:[{kind:'dialogue',speaker_key:'artemis',text:'5분쯤 훈련했을 때 아르테미스가 물었다. 계속할 텐가?'}],state_delta:{advance_minutes:5},choices:['계속한다','이유를 묻는다','그만둔다'],event_progress:{event_instance_id:'active:training'}};
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:{world:{date:'1285-03-02',time:'07:20'},scheduleContext:{due:[],upcoming:[]},sceneRuntime:{eventProgress:{eventInstanceId:'active:training'}}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,5,'an NPC-owned question inside the same structured activity must preserve the player decision point');
turn={scene:[{kind:'dialogue',speaker_key:'artemis',text:'훈련을 마쳤다면 다음 과정으로 갈 텐가?'}],state_delta:{advance_minutes:5},choices:['계속한다','다음 과정으로 간다','그만둔다'],event_progress:null};
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:{world:{date:'1285-03-02',time:'07:20'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,5,'hypothetical completion in NPC dialogue must not raise an unfinished decision to the training floor');
turn={scene:[{kind:'narration',text:'5분쯤 지났을 때, 훈련을 마쳤다면 다음 과정으로 갈 수 있다는 설명이 들렸다.'}],state_delta:{advance_minutes:5},choices:['계속한다','다음 과정으로 간다','그만둔다'],event_progress:null};
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:{world:{date:'1285-03-02',time:'07:20'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,5,'hypothetical completion in narration must not raise an unfinished decision to the training floor');
turn={scene:[{kind:'narration',text:'훈련을 마쳤고 교관이 다음 과정을 고르라고 했다.'}],state_delta:{advance_minutes:10},choices:['대련한다','쉰다','돌아간다'],event_progress:null};
applySceneMomentumTimeFloor({action:'검술을 훈련한다.',saveState:{world:{date:'1285-03-02',time:'07:20'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,30,'a clearly completed activity may still raise an underreported clock before post-completion choices');
turn={scene:[{kind:'narration',text:'잠에서 깨어나 몸을 일으켰다.'}],state_delta:{advance_minutes:60},choices:['일어난다','일정을 확인한다','더 쉰다'],event_progress:{event_instance_id:'active:rest'}};
applySceneMomentumTimeFloor({action:'잠을 잔다.',saveState:{world:{date:'1285-03-02',time:'07:20'},scheduleContext:{due:[],upcoming:[]},sceneRuntime:{eventProgress:{eventInstanceId:'active:rest'}}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,240,'continuing the same structured scene is not a new interruption and must retain the sleep floor');
turn={scene:[{kind:'narration',text:'잠에서 깨어나 몸을 일으켰다.'}],state_delta:{advance_minutes:60},choices:['일어난다','일정을 확인한다','더 쉰다'],event_progress:{event_instance_id:'started:rest'}};
applySceneMomentumTimeFloor({action:'잠을 잔다.',saveState:{world:{date:'1285-03-02',time:'07:20'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,240,'a normal newly structured scene must not be mistaken for a Director interruption');

turn={state_delta:{advance_minutes:60,new_location:'훈련장',pc_status:'훈련 완료',fatigue_delta:3,gold_delta:-10,relationship_changes:[{npc_key:'artemis',affinity_delta:1}],stat_progress:[{stat:'신체',amount:1}],skill_experience:[{skill:'검술',amount:1}],items_add:['훈련 증표'],items_remove:['낡은 목검'],npc_state_updates:[{npc_key:'artemis',location:'훈련장'}],hooks_update:[{id:'future',status:'resolved'}]},choices:[]};
applySceneMomentumTimeFloor({action:'0분 동안 훈련한다.',saveState:{world:{date:'1285-03-02',time:'07:20'},scheduleContext:{due:[],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,0,'an explicitly zero-minute compressed action must clamp model time to zero');
assert.equal(turn.state_delta.new_location,null,'explicit zero minutes must reject model-produced travel');
assert.equal(turn.state_delta.pc_status,null,'explicit zero minutes must reject model-produced completion status');
assert.equal(turn.state_delta.fatigue_delta,0,'explicit zero minutes must reject resource effects');
assert.equal(turn.state_delta.gold_delta,0,'explicit zero minutes must reject currency effects');
for(const field of ['relationship_changes','stat_progress','skill_experience','items_add','items_remove'])assert.deepEqual(turn.state_delta[field],[],`${field} must freeze on an explicit zero-minute action`);
assert.deepEqual(turn.state_delta.npc_state_updates,[],'future NPC state must not survive an explicit zero-minute clamp');
assert.deepEqual(turn.state_delta.hooks_update,[],'future hook state must not survive an explicit zero-minute clamp');

turn={state_delta:{advance_minutes:0},choices:[]};
applySceneMomentumTimeFloor({action:'쉰다.',saveState:{world:{date:'1285-03-01',time:'10:00'},scheduleContext:{due:[{id:'class'}],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,30,'an already-due event is current context and must not freeze a newly committed action');

console.log('PASS Scene Momentum deterministic time-floor bounds (full schedule + boundary + 1440 cap)');
