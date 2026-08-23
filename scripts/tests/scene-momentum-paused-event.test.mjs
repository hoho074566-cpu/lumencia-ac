#!/usr/bin/env node

import assert from 'node:assert/strict';
import { deriveSceneDelta } from '../../lib/scene-momentum.js';

const emptyDelta = () => ({
  advance_minutes:0,new_location:null,pc_status:null,fatigue_delta:0,gold_delta:0,
  relationship_changes:[],relationship_milestones_add:[],intimacy_changes:[],
  stat_progress:[],skill_experience:[],skill_learning:[],awakening_progress:[],
  npc_state_updates:[],npc_schedule_updates:[],pc_knowledge_add:[],memories_add:[],
  hooks_add:[],hooks_update:[],active_events_add:[],active_events_remove:[],completed_events_add:[],
  scheduled_events_add:[],scheduled_events_remove:[],scheduled_events_complete:[],
  world_arcs_add:[],world_arcs_remove:[],rumors_add:[],delayed_consequences_add:[],items_add:[],items_remove:[],
});
const turnWith = (patch={}) => ({
  scene_title:'조용한 장면',scene:[{kind:'narration',text:'장면이 잠시 끊겼다.'}],
  state_delta:{...emptyDelta(),...(patch.state_delta||{})},
  event_progress:Object.prototype.hasOwnProperty.call(patch,'event_progress')?patch.event_progress:null,
});
const scheduledProgress={eventInstanceId:'class#1',activeBeat:'lecture',completedBeats:['arrival'],paused:false};
const scheduledRuntime={participants:[],eventProgress:scheduledProgress};
const scheduledSave={
  turnNumber:20,world:{date:'1285-03-11',time:'09:00',location:'강의실'},activeEvents:[],
  scheduleContext:{due:[{id:'class#1',title:'정규 수업'}]},scheduledEvents:[],sceneRuntime:scheduledRuntime,
};

// Raw event_progress:null while the same scheduled occurrence is still due means PAUSE/archive, not completion.
const scheduledPause=deriveSceneDelta({
  saveState:scheduledSave,previousRuntime:scheduledRuntime,turn:turnWith({event_progress:null}),nextParticipants:[],action:'본다',
});
assert.equal(scheduledPause.flags.eventProgress,false,'pausing a still-active scheduled event must not fake Scene Momentum progress');
assert.equal(scheduledPause.score,0,'a pure scheduled-event pause must remain a zero-delta turn');

// Same rule for an unscheduled active occurrence that carries a resume key.
const unscheduledProgress={eventInstanceId:'started:1285-03-11:t20:abcd',activeBeat:'search',completedBeats:[],resumeKey:'library-investigation',paused:false};
const unscheduledRuntime={participants:[],eventProgress:unscheduledProgress};
const unscheduledSave={
  turnNumber:20,world:{date:'1285-03-11',time:'09:00',location:'도서관'},activeEvents:['library-investigation'],
  scheduleContext:{due:[]},scheduledEvents:[],sceneRuntime:unscheduledRuntime,
};
const unscheduledPause=deriveSceneDelta({
  saveState:unscheduledSave,previousRuntime:unscheduledRuntime,turn:turnWith({event_progress:null}),nextParticipants:[],action:'본다',
});
assert.equal(unscheduledPause.flags.eventProgress,false,'pausing a still-active resumable event must not fake progress');

// If the occurrence is no longer active, null is a real completion and must count.
const completedSave={...scheduledSave,scheduleContext:{due:[]},sceneRuntime:scheduledRuntime};
const completion=deriveSceneDelta({
  saveState:completedSave,previousRuntime:scheduledRuntime,turn:turnWith({event_progress:null}),nextParticipants:[],action:'본다',
});
assert.equal(completion.flags.eventProgress,true,'actual event completion must still count as State Delta');

// Explicit removal/completion overrides a due entry and is real progression.
const explicitCompletion=deriveSceneDelta({
  saveState:scheduledSave,previousRuntime:scheduledRuntime,
  turn:turnWith({event_progress:null,state_delta:{completed_events_add:['class#1']}}),
  nextParticipants:[],action:'본다',
});
assert.equal(explicitCompletion.flags.eventProgress,true,'explicit event completion must count even if schedule data still lists the occurrence');

console.log('PASS Scene Momentum paused-event semantics (pause != completion; real completion still progresses)');
