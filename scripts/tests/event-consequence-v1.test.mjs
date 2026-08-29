import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEventConsequenceDirective,
  eventConsequenceEvidence,
  explicitFutureDelayMinutes,
  expiredEventConsequences,
  materializeDelayedConsequences,
  nextEventConsequenceBoundaryMinutes,
  reconcileEventConsequenceLifecycle,
  selectDueEventConsequence,
} from '../../lib/event-consequence.js';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const delayed = {
  event_name:'교수 호출',
  target_bucket:'active',
  delay_minutes:30,
  reason:'공개 결투의 여파를 확인하기 위해 교수가 호출한다',
  secret_level:0,
};

function makeHook() {
  const [hook] = materializeDelayedConsequences({
    rows:[delayed],
    world:{date:'1285-03-01',time:'09:00'},
    advanceMinutes:10,
    turnNumber:8,
    existingHooks:[],
    sourceEvent:'duel#1',
  });
  return hook;
}

test('delayed result becomes one bounded persisted hook and duplicate queue entries are denied', () => {
  const hook = makeHook();
  assert.ok(hook.id.startsWith('consequence:'));
  assert.equal(hook.status, 'deferred');
  assert.equal(hook.event_consequence.due_at, '1285-03-01T09:40');
  assert.equal(hook.event_consequence.expires_at, '1285-03-04T09:40');
  assert.equal(hook.event_consequence.source_event, 'duel#1');

  const duplicate = materializeDelayedConsequences({
    rows:[delayed],
    world:{date:'1285-03-01',time:'09:10'},
    turnNumber:9,
    existingHooks:[hook],
  });
  assert.deepEqual(duplicate, []);

  const resolved={...hook,status:'resolved'};
  const replay=materializeDelayedConsequences({rows:[delayed],world:{date:'1285-03-02',time:'09:10'},turnNumber:10,existingHooks:[resolved]});
  assert.deepEqual(replay,[],'terminal consequence fingerprints must keep a one-shot result from replaying');

  const second={...delayed,event_name:'학생회 조사',reason:'기록 신호를 학생회가 확인한다'};
  const bounded=materializeDelayedConsequences({rows:[delayed,second],world:{date:'1285-03-01',time:'09:10'},turnNumber:9,maxAdditions:1});
  assert.equal(bounded.length,1,'a due result may create at most one causal follow-up');
});

test('an explicit future delay is a hard lower bound for model queue timing', () => {
  assert.equal(explicitFutureDelayMinutes('15분 뒤 파란 빛을 내게 한다.'),15);
  assert.equal(explicitFutureDelayMinutes('2시간 후 다시 확인한다.'),120);
  assert.equal(explicitFutureDelayMinutes('그냥 기다린다.'),null);
  const [hook]=materializeDelayedConsequences({rows:[{...delayed,delay_minutes:5}],world:{date:'1285-03-01',time:'10:07'},advanceMinutes:3,turnNumber:10,minimumDelayMinutes:explicitFutureDelayMinutes('15분 뒤 파란 빛을 내게 한다.')});
  assert.equal(hook.event_consequence.due_at,'1285-03-01T10:25');
});

test('due selection supports an explicit wait crossing the trigger but not an early ordinary turn', () => {
  const hook = makeHook();
  const save={world:{date:'1285-03-01',time:'09:20'},hooks:[hook]};
  assert.equal(selectDueEventConsequence(save), null);
  assert.equal(selectDueEventConsequence(save,{lookaheadMinutes:20})?.id, hook.id);
  assert.equal(nextEventConsequenceBoundaryMinutes(save), 20);
});

test('visible manifestation resolves the queue item while an ignored result remains open', () => {
  const hook = makeHook();
  const save={world:{date:'1285-03-01',time:'09:40'},hooks:[hook]};
  const selected=selectDueEventConsequence(save);
  const shown={scene_title:'교수의 호출',scene:[{kind:'narration',text:'학생회 서기가 교수 호출장을 내밀었다.'}],scene_summary:'공개 결투의 여파로 교수가 불렀다.',state_delta:{hooks_update:[]}};
  assert.equal(eventConsequenceEvidence(shown,selected).realized,true);
  const resolved=reconcileEventConsequenceLifecycle({saveState:save,turn:shown,selectedConsequence:selected});
  assert.equal(resolved.status,'resolved');
  assert.deepEqual(shown.state_delta.hooks_update.map(row=>[row.id,row.status]),[[hook.id,'resolved']]);

  const prefixPatch={id:'prefix-hook',status:'open',reason:'완료된 대화에서 정한 약속'};
  const reordered={scene_title:'교수의 호출',scene:[{kind:'narration',text:'학생회 서기가 교수 호출장을 내밀었다.'}],scene_summary:'공개 결투의 여파로 교수가 불렀다.',state_delta:{hooks_update:[{id:hook.id,status:'resolved',reason:'모델 원본'},prefixPatch]},time_execution:{effect_owners:[{scope:'state_delta',field:'hooks_update',effect_index:1,owner_kind:'clause',owner_id:'action_1'}]}};
  reconcileEventConsequenceLifecycle({saveState:save,turn:reordered,selectedConsequence:selected});
  assert.deepEqual(reordered.state_delta.hooks_update.map(row=>row.id),['prefix-hook',hook.id],'lifecycle reconciliation may move the selected consequence behind retained updates');
  assert.equal(reordered.time_execution.effect_owners[0].effect_index,0,'hook ownership follows the exact retained source row after lifecycle compaction and reordering');

  const ignored={scene_title:'조용한 복도',scene:[{kind:'narration',text:'창밖으로 바람이 불었다.'}],scene_summary:'복도에 머물렀다.',state_delta:{hooks_update:[{id:hook.id,status:'resolved',reason:'근거 없는 완료'}]}};
  const open=reconcileEventConsequenceLifecycle({saveState:save,turn:ignored,selectedConsequence:selected});
  assert.equal(open.status,'open');
  assert.deepEqual(ignored.state_delta.hooks_update.map(row=>[row.id,row.status]),[[hook.id,'open']]);

  const choiceOnly={scene_title:'조용한 복도',scene:[{kind:'narration',text:'복도에는 아무 변화가 없다.'}],scene_summary:'변화 없이 머물렀다.',choices:['교수 호출을 확인한다'],state_delta:{hooks_update:[]}};
  assert.equal(eventConsequenceEvidence(choiceOnly,selected).realized,false,'a future choice is not manifestation evidence');
});

test('secret cause is not copied into the due directive and expired items close without firing', () => {
  const [secretHook]=materializeDelayedConsequences({rows:[{...delayed,event_name:'봉인실 출입 제한',reason:'L5 비밀 조사관이 신원을 특정했다',secret_level:5}],world:{date:'1285-03-01',time:'09:00'},turnNumber:1});
  const directive=buildEventConsequenceDirective(secretHook,{currentAction:'기다린다',triggerMinutes:30});
  assert.match(directive,/CAUSE=HIDDEN/);
  assert.doesNotMatch(directive,/L5 비밀 조사관/);

  const expiredSave={world:{date:'1285-03-04',time:'09:40'},hooks:[makeHook()]};
  assert.equal(expiredEventConsequences(expiredSave).length,1);
  const turn={state_delta:{hooks_update:[{id:makeHook().id,status:'resolved',reason:'stale model update'}]}};
  const lifecycle=reconcileEventConsequenceLifecycle({saveState:expiredSave,turn});
  assert.equal(lifecycle.expired_ids.length,1);
  assert.equal(turn.state_delta.hooks_update.length,1);
  assert.equal(turn.state_delta.hooks_update[0].status,'expired');

  const identicalExpired={id:expiredSave.hooks[0].id,status:'expired',reason:'Event Consequence V1 bounded lifetime 종료'};
  const identicalTurn={
    state_delta:{hooks_update:[identicalExpired]},
    time_execution:{effect_owners:[{scope:'state_delta',field:'hooks_update',effect_index:0,owner_kind:'clause',owner_id:'action_1'}]},
  };
  reconcileEventConsequenceLifecycle({saveState:expiredSave,turn:identicalTurn});
  assert.deepEqual(identicalTurn.time_execution.effect_owners,[],'a runtime-created expiry row cannot borrow ownership from an identical model row');
  assert.doesNotThrow(()=>reconcileEventConsequenceLifecycle({saveState:expiredSave,turn:identicalTurn}),'an explicitly unowned runtime row stays safe when a later lifecycle pass tags raw source rows');
});

const instructions=`===== CHARACTER REGISTRY =====\nguide=가이드\n===== WORLD CANON =====\nacademy\n===== NPC CANON =====\nguide\n===== NPC SPEECH =====\nguide speech\n===== PC SYSTEM =====\npc`;
const input=`===== TURN OPTIONS =====\nROUTINE_STREAK: 0\n===== AUTHORITATIVE SAVE_STATE =====\n{}\n===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====\nINTERVENTION: light\nROUTINE_STREAK=0 / EVENT_GAP=0 / CHOICE_GAP=0 / CROSS_DEPT_GAP=0\nUSER_FOCUS:\n===== SCHEDULE ENGINE (AUTHORITATIVE) =====\n{}\n===== USER ACTION =====\n돌아다닌다.`;

test('router reserves a due consequence as fixed flow and a direct player question still outranks it', () => {
  const hook=makeHook();
  const saveState={turnNumber:8,world:{date:'1285-03-01',time:'09:40',location:'중앙광장'},pc:{name:'아리아'},hooks:[hook],sceneRuntime:{participants:[],momentum:{}},scheduleContext:{due:[],upcoming:[]},director:{}};
  const routed=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'돌아다닌다.',saveState,recentTurns:[]}});
  assert.equal(routed.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE');
  assert.equal(routed.telemetry.event_director_v2.event_consequence_id,hook.id);
  assert.match(routed.params.input,/"kind":"due-consequence"/);
  assert.match(routed.params.input,/"fact":"교수 호출"/);
  assert.doesNotMatch(routed.params.input,/EVENT CONSEQUENCE V1|ORDER=|GUARDS=/,'only the due fact may reach the Writer');

  const question=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'지금 밖으로 나갈까?',saveState,recentTurns:[]}});
  assert.notEqual(question.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE');
  assert.doesNotMatch(question.params.input,/"kind":"due-consequence"|EVENT CONSEQUENCE V1/);
});

test('a due consequence routes canon for a named public NPC', () => {
  const [hook]=materializeDelayedConsequences({rows:[{...delayed,event_name:'에밀리의 호출',reason:'에밀리가 결투 기록을 확인하려 부른다'}],world:{date:'1285-03-01',time:'09:00'},advanceMinutes:10,turnNumber:8});
  const namedInstructions=`===== CHARACTER REGISTRY =====\nguide=가이드, emily=에밀리\n===== WORLD CANON =====\nacademy\n===== NPC CANON =====\nemily canon\n===== NPC SPEECH =====\nemily speech\n===== PC SYSTEM =====\npc`;
  const saveState={turnNumber:8,world:{date:'1285-03-01',time:'09:40',location:'중앙광장'},pc:{name:'아리아'},hooks:[hook],sceneRuntime:{participants:[],momentum:{}},scheduleContext:{due:[],upcoming:[]},director:{}};
  const routed=routeOpenAIParams({instructions:namedInstructions,input},{mode:'game',incoming:{action:'기다린다.',saveState,recentTurns:[]}});
  assert.equal(routed.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE');
  assert.ok(routed.telemetry.selected_npcs.includes('emily'));
  assert.deepEqual(routed.telemetry.event_director_v2.event_consequence_npc_keys,['emily']);
});

test('an explicit wait routes to its consequence boundary and an earlier fixed schedule wins', () => {
  const hook=makeHook();
  const waitingSave={turnNumber:8,world:{date:'1285-03-01',time:'09:20',location:'중앙광장'},pc:{name:'아리아'},hooks:[hook],sceneRuntime:{participants:[],momentum:{}},director:{},scheduleContext:{due:[],upcoming:[]},scheduledEvents:[]};
  const waiting=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'40분 기다린다.',saveState:waitingSave,recentTurns:[]}});
  assert.equal(waiting.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE');
  assert.equal(waiting.telemetry.event_director_v2.event_consequence_trigger_minutes,20);
  assert.match(waiting.params.input,/"kind":"reachable-consequence"/);
  assert.match(waiting.params.input,/"due_at":"1285-03-01T09:40"/);
  assert.doesNotMatch(waiting.params.input,/TRIGGER_IN|ORDER=USER_ACTION_FIRST/);

  const zeroRangeSave={...waitingSave,world:{...waitingSave.world,time:'09:35'}};
  const zeroRange=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'0분에서 10분 동안 기다린다.',saveState:zeroRangeSave,recentTurns:[]}});
  assert.equal(zeroRange.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE','a consequence inside a zero-minimum positive range must route before the model call');
  assert.equal(zeroRange.telemetry.event_director_v2.event_consequence_trigger_minutes,5,'zero-minimum range lookahead must retain the positive upper endpoint');
  assert.match(zeroRange.params.input,/"due_at":"1285-03-01T09:40"/,'the factual due time must survive without a prose-order directive');

  for(const action of ['검술을 훈련한다.','기초 수업에 참석한다.']){
    const timed=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action,saveState:waitingSave,recentTurns:[]}});
    assert.equal(timed.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE',`${action}: a consequence due before the activity minimum must route before the model call`);
    assert.equal(timed.telemetry.event_director_v2.event_consequence_trigger_minutes,20);
  }
  const namedTimed=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'가이드와 검술을 훈련한다.',saveState:waitingSave,recentTurns:[]}});
  assert.equal(namedTimed.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE','an NPC-focused compressed action must still route an earlier queued consequence');
  assert.equal(namedTimed.telemetry.event_director_v2.event_consequence_trigger_minutes,20);
  const futureDated=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'내일 오전 10시에 수업을 듣는다.',saveState:waitingSave,recentTurns:[]}});
  assert.equal(futureDated.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE','a date-qualified request must still route a queued consequence inside its bounded next-day window');
  assert.equal(futureDated.telemetry.event_director_v2.event_consequence_trigger_minutes,20);
  const overdue={id:'overdue-class',title:'필수 수업',date:'1285-03-01',time:'09:00',kind:'academic',status:'scheduled'};
  const overdueSave={...waitingSave,scheduledEvents:[overdue],scheduleContext:{due:[overdue],upcoming:[]}};
  const afterOverdue=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'검술을 훈련한다.',saveState:overdueSave,recentTurns:[]}});
  assert.equal(afterOverdue.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE','an overdue schedule must not suppress a genuinely future queued consequence');
  assert.equal(afterOverdue.telemetry.event_director_v2.event_consequence_trigger_minutes,20);

  const rangedSave={...waitingSave,world:{...waitingSave.world,time:'08:40'}};
  const ranged=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'검술을 훈련한다.',saveState:rangedSave,recentTurns:[]}});
  assert.equal(ranged.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE','a consequence inside the valid 30–120 minute training range must be routed before the model call');
  assert.equal(ranged.telemetry.event_director_v2.event_consequence_trigger_minutes,60);

  const relativeStart=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'1시간 후에 훈련한다.',saveState:waitingSave,recentTurns:[]}});
  assert.equal(relativeStart.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE','a consequence before a relative future activity start must route before the model call');
  assert.equal(relativeStart.telemetry.event_director_v2.event_consequence_trigger_minutes,20);

  const scheduled={id:'class#1',title:'필수 수업',date:'1285-03-01',time:'09:30',kind:'academic',status:'scheduled',participants:[]};
  const scheduledSave={...waitingSave,pc:{name:'아리아',department:'기사과'},scheduledEvents:[scheduled],scheduleContext:{due:[],upcoming:[scheduled]}};
  const routed=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'40분 기다린다.',saveState:scheduledSave,recentTurns:[]}});
  assert.notEqual(routed.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE');
  assert.doesNotMatch(routed.params.input,/===== EVENT CONSEQUENCE V1 =====/);
});

test('due-result authority survives the minimum adaptive routine input budget', () => {
  const hook=makeHook();
  const action=`상황을 길게 검토한다. ${'세부 맥락을 확인한다. '.repeat(320)} 마지막으로 돌아다닌다.`;
  const saveState={turnNumber:8,world:{date:'1285-03-01',time:'09:40',location:'중앙광장'},pc:{name:'아리아'},hooks:[hook],sceneRuntime:{participants:[],momentum:{}},scheduleContext:{due:[],upcoming:[]},director:{},routerFeedback:{routerVersion:'p3-pr01r-thin-scene-packet-v1',profile:'routine-17k-v154',lastInputTokens:99999}};
  const routed=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action,saveState,recentTurns:[]}});
  assert.equal(routed.telemetry.adaptive_scale,.76);
  assert.ok(routed.params.input.length<=6840,`adaptive due-result input exceeded 6840 chars: ${routed.params.input.length}`);
  assert.match(routed.params.input,/"kind":"due-consequence"/);
  assert.match(routed.params.input,new RegExp(hook.id.replace(':','\\:')));
  assert.match(routed.params.input,/마지막으로 돌아다닌다\./);
});
