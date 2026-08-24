import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEventConsequenceDirective,
  eventConsequenceEvidence,
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

  const ignored={scene_title:'조용한 복도',scene:[{kind:'narration',text:'창밖으로 바람이 불었다.'}],scene_summary:'복도에 머물렀다.',state_delta:{hooks_update:[{id:hook.id,status:'resolved',reason:'근거 없는 완료'}]}};
  const open=reconcileEventConsequenceLifecycle({saveState:save,turn:ignored,selectedConsequence:selected});
  assert.equal(open.status,'open');
  assert.deepEqual(ignored.state_delta.hooks_update.map(row=>[row.id,row.status]),[[hook.id,'open']]);
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
});

const instructions=`===== CHARACTER REGISTRY =====\nguide=가이드\n===== WORLD CANON =====\nacademy\n===== NPC CANON =====\nguide\n===== NPC SPEECH =====\nguide speech\n===== PC SYSTEM =====\npc`;
const input=`===== TURN OPTIONS =====\nROUTINE_STREAK: 0\n===== AUTHORITATIVE SAVE_STATE =====\n{}\n===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====\nINTERVENTION: light\nROUTINE_STREAK=0 / EVENT_GAP=0 / CHOICE_GAP=0 / CROSS_DEPT_GAP=0\nUSER_FOCUS:\n===== SCHEDULE ENGINE (AUTHORITATIVE) =====\n{}\n===== USER ACTION =====\n돌아다닌다.`;

test('router reserves a due consequence as fixed flow and a direct player question still outranks it', () => {
  const hook=makeHook();
  const saveState={turnNumber:8,world:{date:'1285-03-01',time:'09:40',location:'중앙광장'},pc:{name:'아리아'},hooks:[hook],sceneRuntime:{participants:[],momentum:{}},scheduleContext:{due:[],upcoming:[]},director:{}};
  const routed=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'돌아다닌다.',saveState,recentTurns:[]}});
  assert.equal(routed.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE');
  assert.equal(routed.telemetry.event_director_v2.event_consequence_id,hook.id);
  assert.match(routed.params.input,/===== EVENT CONSEQUENCE V1 =====/);
  assert.match(routed.params.input,/이전 행동\/세계 변화에서 예약된 인과 결과/);

  const question=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'지금 밖으로 나갈까?',saveState,recentTurns:[]}});
  assert.notEqual(question.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE');
  assert.doesNotMatch(question.params.input,/===== EVENT CONSEQUENCE V1 =====/);
});

test('an explicit wait routes to its consequence boundary and an earlier fixed schedule wins', () => {
  const hook=makeHook();
  const waitingSave={turnNumber:8,world:{date:'1285-03-01',time:'09:20',location:'중앙광장'},pc:{name:'아리아'},hooks:[hook],sceneRuntime:{participants:[],momentum:{}},director:{},scheduleContext:{due:[],upcoming:[]},scheduledEvents:[]};
  const waiting=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'40분 기다린다.',saveState:waitingSave,recentTurns:[]}});
  assert.equal(waiting.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE');
  assert.equal(waiting.telemetry.event_director_v2.event_consequence_trigger_minutes,20);
  assert.match(waiting.params.input,/TRIGGER_IN=20min/);

  const scheduled={id:'class#1',title:'필수 수업',date:'1285-03-01',time:'09:30',kind:'academic',status:'scheduled',participants:[]};
  const scheduledSave={...waitingSave,pc:{name:'아리아',department:'기사과'},scheduledEvents:[scheduled],scheduleContext:{due:[],upcoming:[scheduled]}};
  const routed=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action:'40분 기다린다.',saveState:scheduledSave,recentTurns:[]}});
  assert.notEqual(routed.telemetry.event_director_v2.result,'EVENT_CONSEQUENCE_DUE');
  assert.doesNotMatch(routed.params.input,/===== EVENT CONSEQUENCE V1 =====/);
});

test('due-result authority survives the minimum adaptive routine input budget', () => {
  const hook=makeHook();
  const action=`상황을 길게 검토한다. ${'세부 맥락을 확인한다. '.repeat(320)} 마지막으로 돌아다닌다.`;
  const saveState={turnNumber:8,world:{date:'1285-03-01',time:'09:40',location:'중앙광장'},pc:{name:'아리아'},hooks:[hook],sceneRuntime:{participants:[],momentum:{}},scheduleContext:{due:[],upcoming:[]},director:{},routerFeedback:{routerVersion:'1.5.6-hf1',profile:'routine-17k-v154',lastInputTokens:99999}};
  const routed=routeOpenAIParams({instructions,input},{mode:'game',incoming:{action,saveState,recentTurns:[]}});
  assert.equal(routed.telemetry.adaptive_scale,.76);
  assert.ok(routed.params.input.length<=6840,`adaptive due-result input exceeded 6840 chars: ${routed.params.input.length}`);
  assert.match(routed.params.input,/===== EVENT CONSEQUENCE V1 =====/);
  assert.match(routed.params.input,new RegExp(hook.id.replace(':','\\:')));
  assert.match(routed.params.input,/마지막으로 돌아다닌다\./);
});
