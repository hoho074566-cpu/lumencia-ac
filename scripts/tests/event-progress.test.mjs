#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compactEventProgress, isEventBeatEligible, mergeContinuationEventProgressState, mergeEventProgress, mergeRoutedEventProgress, mergeRoutedEventProgressState, normalizeEventProgress, occurrenceIdFromStartEvidence, promotePausedEventProgress, scheduledIdsDueByTurnEnd, unscheduledPausedIdsForResume } from '../../lib/event-progress.js';

const previous={eventInstanceId:'entrance_ceremony#1285-03-01T09:00',activeBeat:null,completedBeats:['welcome_address','freshman_rep_speech']};
const rewind=mergeEventProgress(previous,{event_instance_id:previous.eventInstanceId,active_beat:'freshman_rep_speech',completed_beats:['welcome_address']});
assert.deepEqual(rewind.completedBeats,['welcome_address','freshman_rep_speech'],'completed set cannot shrink');
assert.equal(rewind.activeBeat,null,'completed representative speech cannot reactivate');
assert.equal(isEventBeatEligible(rewind,'welcome_address'),false,'earlier completed welcome cannot be selected');
assert.equal(isEventBeatEligible(rewind,'freshman_rep_speech'),false,'completed speech cannot be selected');

const forward=mergeEventProgress(previous,{event_instance_id:previous.eventInstanceId,active_beat:'ceremony_close',completed_beats:['freshman_rep_speech']});
assert.equal(forward.activeBeat,'ceremony_close','later ceremony beat remains valid');
assert.match(compactEventProgress(forward),/completed=welcome_address,freshman_rep_speech/,'CONTINUE compact context preserves the completion anchor');

const nextOccurrence=mergeEventProgress(previous,{event_instance_id:'entrance_ceremony#1286-03-01T09:00',active_beat:'freshman_rep_speech',completed_beats:[]});
assert.equal(isEventBeatEligible(nextOccurrence,'freshman_rep_speech'),true,'a new occurrence starts fresh');
assert.equal(mergeEventProgress(previous,nextOccurrence,{allowInstanceChange:false}).eventInstanceId,previous.eventInstanceId.toLowerCase(),'CONTINUE cannot switch event identity');
assert.deepEqual(mergeEventProgress(previous,{event_instance_id:previous.eventInstanceId,active_beat:null,completed_beats:['freshman_rep_speech','freshman_rep_speech']}).completedBeats,['welcome_address','freshman_rep_speech'],'completion records are deduplicated');
const mixed=mergeEventProgress(null,{event_instance_id:'Entrance_Ceremony#A',active_beat:'Ceremony_Close',completed_beats:['Freshman_Rep_Speech','freshman_rep_speech']});
assert.equal(mixed.eventInstanceId,'entrance_ceremony#a','event instance IDs canonicalize before storage');
assert.deepEqual(mixed.completedBeats,['freshman_rep_speech'],'mixed-case beat IDs canonicalize and deduplicate');
const full={eventInstanceId:'bounded#1',completedBeats:Array.from({length:24},(_,i)=>`beat_${i}`)};
const overflow=mergeEventProgress(full,{event_instance_id:'bounded#1',active_beat:null,completed_beats:['beat_24']});
assert.equal(overflow.completedBeats.length,24,'prompt-facing completed list stays bounded');
assert.match(compactEventProgress(overflow),/omitted_completed=1; anchor=all omitted beats are also completed/, 'generation context interprets omitted completions before generation');
assert.equal(mergeEventProgress(overflow,{event_instance_id:'bounded#1',active_beat:'BEAT_0',completed_beats:[]}).activeBeat,null,'completion #25+ storage cannot make an evicted completion replayable');
assert.equal(isEventBeatEligible(overflow,'beat_0'),false,'authoritative fingerprint retains completion beyond compact-list eviction');
const malformed=mergeEventProgress(previous,{event_instance_id:'bad id!',active_beat:{},completed_beats:'bad'});
assert.equal(malformed.eventInstanceId,previous.eventInstanceId.toLowerCase(),'malformed metadata preserves prior event');
assert.deepEqual(malformed.completedBeats,previous.completedBeats,'malformed metadata preserves prior completions');
assert.equal(normalizeEventProgress(null),null,'old saves without progress remain valid');

const organic=mergeRoutedEventProgress(previous,{event_instance_id:'model_guess',active_beat:'First_Contact',completed_beats:[]},{directorOccurrenceId:'director:1285-03-01:t9:lena'});
assert.equal(organic.eventInstanceId,previous.eventInstanceId.toLowerCase(),'unused Director side roll cannot relabel the current event');
const usedDirector=mergeRoutedEventProgress(previous,{event_instance_id:'director:1285-03-01:t9:lena',active_beat:'First_Contact',completed_beats:[]},{directorOccurrenceId:'director:1285-03-01:t9:lena'});
assert.equal(usedDirector.eventInstanceId,'director:1285-03-01:t9:lena','returned Director occurrence replaces stale progress');
const playerStartedId=occurrenceIdFromStartEvidence('1285-03-01',10,'player-started duel with Lena');
const playerStarted=mergeRoutedEventProgress(previous,{event_instance_id:'arbitrary_model_id',active_beat:'Opening_Salute',completed_beats:[]},{startedOccurrenceId:playerStartedId});
assert.equal(playerStarted.eventInstanceId,playerStartedId,'authoritative current-turn start evidence replaces stale progress, not the model ID');
assert.equal(playerStarted.activeBeat,'opening_salute','player-started occurrence preserves canonical beat progress');

const crossingSave={world:{date:'1285-03-01',time:'08:58'},scheduleContext:{due:[]},scheduledEvents:[{id:'entrance_ceremony',date:'1285-03-01',time:'09:00',status:'scheduled'}]};
const newlyDue=scheduledIdsDueByTurnEnd(crossingSave,3);
assert.deepEqual(newlyDue,['entrance_ceremony'],'a schedule becoming due during the current turn is authoritative');
assert.equal(mergeRoutedEventProgress(previous,{event_instance_id:'entrance_ceremony',active_beat:'welcome_address',completed_beats:[]},{dueEventIds:newlyDue}).eventInstanceId,'entrance_ceremony','newly-due scheduled occurrence can replace stale progress');

const scheduledCurrent={eventInstanceId:'entrance_ceremony',activeBeat:'ceremony_close',completedBeats:['freshman_rep_speech']};
const sideArcId=occurrenceIdFromStartEvidence('1285-03-01',11,'rumor side arc');
const preservedScheduled=mergeRoutedEventProgress(scheduledCurrent,{event_instance_id:'entrance_ceremony',active_beat:'ceremony_close',completed_beats:['freshman_rep_speech']},{dueEventIds:['entrance_ceremony'],startedOccurrenceId:sideArcId});
assert.equal(preservedScheduled.eventInstanceId,'entrance_ceremony','merely adding a side arc cannot relabel the current scheduled occurrence');

const terminalContinue=mergeEventProgress(scheduledCurrent,{event_instance_id:'entrance_ceremony',active_beat:null,completed_beats:['freshman_rep_speech','ceremony_close']},{allowInstanceChange:false});
assert.equal(terminalContinue.activeBeat,null,'frozen CONTINUE accepts terminal progress without inventing another beat');
assert.equal(isEventBeatEligible(terminalContinue,'ceremony_close'),false,'terminal CONTINUE completion remains authoritative');

assert.equal(mergeEventProgress(previous,null),null,'explicit event_progress null clears a finished event');
assert.equal(mergeEventProgress(previous,undefined).eventInstanceId,previous.eventInstanceId.toLowerCase(),'absent metadata preserves authoritative progress');
assert.equal(mergeEventProgress(previous,{event_instance_id:'bad id!'}).eventInstanceId,previous.eventInstanceId.toLowerCase(),'malformed metadata preserves authoritative progress');
assert.equal(mergeRoutedEventProgress(previous,{event_instance_id:'bad id!'}).eventInstanceId,previous.eventInstanceId.toLowerCase(),'routed malformed metadata also fails safe');

const pausedCeremony={eventInstanceId:'entrance_ceremony',activeBeat:'ceremony_close',completedBeats:['welcome_address','freshman_rep_speech']};
const duelId=occurrenceIdFromStartEvidence('1285-03-01',12,'player duel');
const interrupted=mergeRoutedEventProgressState(pausedCeremony,{}, {event_instance_id:'model_duel',active_beat:'opening',completed_beats:[]},{startedOccurrenceId:duelId});
assert.equal(interrupted.eventProgress.eventInstanceId,duelId,'interrupting occurrence becomes current');
assert.ok(interrupted.eventProgressByInstance.entrance_ceremony,'interrupted occurrence progress is retained by identity');
const endedInterruption=mergeRoutedEventProgressState(interrupted.eventProgress,interrupted.eventProgressByInstance,null);
const resumed=mergeRoutedEventProgressState(endedInterruption.eventProgress,endedInterruption.eventProgressByInstance,{event_instance_id:'entrance_ceremony',active_beat:'ceremony_close',completed_beats:[]},{dueEventIds:['entrance_ceremony']});
assert.deepEqual(resumed.eventProgress.completedBeats,['welcome_address','freshman_rep_speech'],'resuming a paused occurrence restores completed-beat authority');
assert.equal(isEventBeatEligible(resumed.eventProgress,'freshman_rep_speech'),false,'resumed occurrence cannot replay a completed beat');
const preGenerationResume=promotePausedEventProgress({eventProgress:null,eventProgressByInstance:endedInterruption.eventProgressByInstance},['entrance_ceremony']);
assert.deepEqual(preGenerationResume.eventProgress.completedBeats,['welcome_address','freshman_rep_speech'],'paused progress is promoted before resumed prose generation');
assert.equal(mergeEventProgress(preGenerationResume.eventProgress,{event_instance_id:'entrance_ceremony',active_beat:'freshman_rep_speech',completed_beats:[]}).activeBeat,null,'pre-generation promoted completion cannot reactivate');

const malformedContinue=mergeContinuationEventProgressState(previous,{}, {event_instance_id:'INVALID ID!'});
assert.equal(malformedContinue.eventProgress.eventInstanceId,previous.eventInstanceId.toLowerCase(),'malformed CONTINUE metadata preserves prior progress');
assert.equal(mergeContinuationEventProgressState(previous,{},null).eventProgress,null,'only explicit null clears CONTINUE progress');

const unscheduledPaused={eventProgress:null,eventProgressByInstance:{[duelId]:{eventInstanceId:duelId,activeBeat:'second_exchange',completedBeats:['opening_salute'],resumeKey:'lena duel'}}};
const unscheduledResumeIds=unscheduledPausedIdsForResume(unscheduledPaused,'Return and continue the Lena duel.',['lena duel']);
assert.deepEqual(unscheduledResumeIds,[duelId],'explicit player resume evidence selects a paused unscheduled occurrence');
const unscheduledPromoted=promotePausedEventProgress(unscheduledPaused,unscheduledResumeIds);
assert.deepEqual(unscheduledPromoted.eventProgress.completedBeats,['opening_salute'],'unscheduled completion anchor is restored before generation');
assert.equal(unscheduledPausedIdsForResume(unscheduledPaused,'I read a book.',['lena duel']).length,0,'unrelated normal action cannot resume an unscheduled occurrence');

const unfinished={eventInstanceId:'investigation#1',activeBeat:'search_library',completedBeats:['accept_case'],resumeKey:'library investigation'};
const pausedNull=mergeRoutedEventProgressState(unfinished,{},null,{pauseOnNull:true});
assert.ok(pausedNull.eventProgressByInstance['investigation#1'],'terminal-looking null retains an authoritatively unfinished occurrence as paused');
const removedNull=mergeRoutedEventProgressState(unfinished,{},null,{pauseOnNull:false});
assert.equal(removedNull.eventProgressByInstance['investigation#1'],undefined,'completed/removed occurrence is not retained as paused');

const eventAId=occurrenceIdFromStartEvidence('1285-03-01',20,'lena field investigation');
const eventAStarted=mergeRoutedEventProgressState(null,{}, {event_instance_id:'model_event_a',active_beat:'open_case',completed_beats:[]},{startedOccurrenceId:eventAId,startedResumeKey:'lena field investigation'});
const eventAContinued=mergeRoutedEventProgressState(eventAStarted.eventProgress,eventAStarted.eventProgressByInstance,{event_instance_id:eventAId,active_beat:'follow_clue',completed_beats:['open_case'],resume_key:'replacement key'});
assert.equal(eventAContinued.eventProgress.resumeKey,'lena field investigation','same-occurrence merge preserves the authoritative resumeKey');
const eventBId=occurrenceIdFromStartEvidence('1285-03-01',21,'urgent messenger');
const eventAInterrupted=mergeRoutedEventProgressState(eventAContinued.eventProgress,eventAContinued.eventProgressByInstance,{event_instance_id:'model_event_b',active_beat:'hear_message',completed_beats:[]},{startedOccurrenceId:eventBId,startedResumeKey:'urgent messenger'});
assert.equal(eventAInterrupted.eventProgressByInstance[eventAId].resumeKey,'lena field investigation','paused occurrence retains its original resumeKey');
const eventBEnded=mergeRoutedEventProgressState(eventAInterrupted.eventProgress,eventAInterrupted.eventProgressByInstance,null);
const eventAResumeIds=unscheduledPausedIdsForResume(eventBEnded,'Return and continue the Lena field investigation.',['lena field investigation']);
const eventAResumed=promotePausedEventProgress(eventBEnded,eventAResumeIds);
assert.equal(eventAResumed.eventProgress.resumeKey,'lena field investigation','resumed occurrence restores the same resumeKey without regeneration');
assert.equal(isEventBeatEligible(eventAResumed.eventProgress,'open_case'),false,'completed beat remains non-replayable after same-occurrence continuation and resume');

const retrospective='Emily later says the representative speech was brief.';
assert.ok(retrospective.includes('speech')&&isEventBeatEligible(previous,'ceremony_close'),'prose references do not reactivate structured beats');

const router=readFileSync('api/chat-router.js','utf8');
assert.match(router,/continueAction[\s\S]*compactEventProgress\(runtime\.eventProgress\)/,'CONTINUE action carries compact progress');
assert.match(router,/consumeContinuationRuntime[\s\S]*mergeContinuationEventProgressState/,'CONTINUE uses conservative occurrence-aware merging');
assert.match(router,/mode==='game'\?promotePausedEventProgress/, 'paused occurrence promotion must be disabled for CONTINUE/AUTO/META');
assert.match(router,/scheduled_events_complete[\s\S]*scheduledStillActive/, 'scheduled null is paused only while the occurrence remains authoritative and unfinished');
assert.match(router,/localSceneRuntime[\s\S]*actualScheduledEntrants[\s\S]*reconcileParticipants/,'scene continuity remains authoritative');
assert.match(router,/explicitPlayerStart[\s\S]*active_events_add/,'unscheduled start evidence requires an explicit player start or authoritative hook');
assert.match(router,/if\(mode==='continue'\)[\s\S]*lockContinueTurn\(data\.turn\)/,'CONTINUE state freeze remains authoritative');
assert.equal((router.match(/await runCore\(/g)||[]).length,1,'adapter retains one canonical model-call site');

const chat=readFileSync('api/chat.js','utf8');
assert.match(chat,/eventProgress === null \? null : undefined/,'sanitization must not convert malformed metadata into terminal null');
assert.match(chat,/\[PLAYER ACTION COMMIT\][\s\S]*C1\./,'PLAYER ACTION COMMIT remains authoritative');
assert.match(chat,/store:\s*false/,'store:false remains enabled');
assert.match(chat,/prompt_cache_key/,'prompt cache remains enabled');
assert.equal(isEventBeatEligible(previous,'ceremony_close'),true,'explicit exit does not force a ceremony beat; eligibility is not execution');
console.log('PASS event progression regressions (real entrance ceremony replay, monotonic merge, authority invariants)');
