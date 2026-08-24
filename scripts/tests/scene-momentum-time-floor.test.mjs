#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scheduledIdsDueByTurnEnd } from '../../lib/event-progress.js';
import { buildSceneMomentumDirective, nextScheduleBoundaryMinutes } from '../../lib/scene-momentum.js';

const source=readFileSync('api/chat-router.js','utf8');
const start=source.indexOf('function bounded(');
const end=source.indexOf('function uniqText(');
assert.ok(start>=0&&end>start,'Scene Momentum time-floor source markers missing');
const timeFloorSource=source.slice(start,end);
const makeHelpers=new Function('array','object','classifySceneIntent','nextScheduleBoundaryMinutes','scheduledIdsDueByTurnEnd',`${timeFloorSource}\nreturn {applySceneMomentumTimeFloor};`);
const array=(value)=>Array.isArray(value)?value:[];
const object=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const classifySceneIntent=(action)=>{const min=String(action).includes('48시간')?2880:String(action).includes('6시간')?360:String(action).includes('두 시간')?120:30;return{kind:'downtime',compression:true,minAdvanceMinutes:min,suggestedAdvanceMinutes:min===30?[30,240]:[min,min]};};
const {applySceneMomentumTimeFloor}=makeHelpers(array,object,classifySceneIntent,nextScheduleBoundaryMinutes,scheduledIdsDueByTurnEnd);

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

const boundaryChoiceSave={...boundarySave,scheduledEvents:[{id:'past-ceremony',date:'1285-03-01',time:'08:00',status:'scheduled'},{id:'class',date:'1285-03-01',time:'10:00',status:'scheduled'}]};
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
assert.equal(turn.state_delta.advance_minutes,15,'post-processing must not reduce a positive model-produced advance');
turn={state_delta:{advance_minutes:400},choices:[]};
applySceneMomentumTimeFloor({action:'6시간 쉰다.',saveState:fullScheduleSave},turn,'game');
assert.equal(turn.state_delta.advance_minutes,400,'schedule bounding must not reduce a positive model-produced advance');

turn={state_delta:{advance_minutes:0},choices:[]};
applySceneMomentumTimeFloor({action:'쉰다.',saveState:{world:{date:'1285-03-01',time:'10:00'},scheduleContext:{due:[{id:'class'}],upcoming:[]}}},turn,'game');
assert.equal(turn.state_delta.advance_minutes,30,'an already-due event is current context and must not freeze a newly committed action');

console.log('PASS Scene Momentum deterministic time-floor bounds (full schedule + boundary + 1440 cap)');
