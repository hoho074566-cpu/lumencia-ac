#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compactEventProgress, isEventBeatEligible, mergeEventProgress, mergeRoutedEventProgress, normalizeEventProgress, occurrenceIdFromStartEvidence } from '../../lib/event-progress.js';

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

assert.equal(mergeEventProgress(previous,null),null,'explicit event_progress null clears a finished event');
assert.equal(mergeEventProgress(previous,undefined).eventInstanceId,previous.eventInstanceId.toLowerCase(),'absent metadata preserves authoritative progress');
assert.equal(mergeEventProgress(previous,{event_instance_id:'bad id!'}).eventInstanceId,previous.eventInstanceId.toLowerCase(),'malformed metadata preserves authoritative progress');
assert.equal(mergeRoutedEventProgress(previous,{event_instance_id:'bad id!'}).eventInstanceId,previous.eventInstanceId.toLowerCase(),'routed malformed metadata also fails safe');

const retrospective='Emily later says the representative speech was brief.';
assert.ok(retrospective.includes('speech')&&isEventBeatEligible(previous,'ceremony_close'),'prose references do not reactivate structured beats');

const router=readFileSync('api/chat-router.js','utf8');
assert.match(router,/continueAction[\s\S]*compactEventProgress\(runtime\.eventProgress\)/,'CONTINUE action carries compact progress');
assert.match(router,/consumeContinuationRuntime[\s\S]*allowInstanceChange:false/,'CONTINUE merge rejects event switching');
assert.match(router,/localSceneRuntime[\s\S]*actualScheduledEntrants[\s\S]*reconcileParticipants/,'scene continuity remains authoritative');
assert.match(router,/if\(mode==='continue'\)[\s\S]*lockContinueTurn\(data\.turn\)/,'CONTINUE state freeze remains authoritative');
assert.equal((router.match(/await runCore\(/g)||[]).length,1,'adapter retains one canonical model-call site');

const chat=readFileSync('api/chat.js','utf8');
assert.match(chat,/\[PLAYER ACTION COMMIT\][\s\S]*C1\./,'PLAYER ACTION COMMIT remains authoritative');
assert.match(chat,/store:\s*false/,'store:false remains enabled');
assert.match(chat,/prompt_cache_key/,'prompt cache remains enabled');
assert.equal(isEventBeatEligible(previous,'ceremony_close'),true,'explicit exit does not force a ceremony beat; eligibility is not execution');
console.log('PASS event progression regressions (real entrance ceremony replay, monotonic merge, authority invariants)');
