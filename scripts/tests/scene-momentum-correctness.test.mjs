#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildSceneMomentumDirective, classifySceneIntent, deriveSceneDelta, updateSceneMomentum } from '../../lib/scene-momentum.js';

const rest=classifySceneIntent('1시간 30분 쉰다.');
assert.equal(rest.kind,'downtime','compound rest duration must stay downtime');
assert.equal(rest.explicitDurationMinutes,90,'compound rest duration must parse to 90 minutes');
assert.equal(rest.minAdvanceMinutes,90,'compound rest floor must respect explicit duration');
const wait=classifySceneIntent('1시간 30분 기다린다.');
assert.equal(wait.kind,'wait','compound wait duration must stay wait');
assert.equal(wait.explicitDurationMinutes,90,'compound wait duration must parse to 90 minutes');
const historicalObserve=classifySceneIntent('10분 전에 본 게시판을 확인한다.');
assert.equal(historicalObserve.kind,'observe','historical duration context must still classify by the committed observation predicate');
assert.equal(historicalObserve.explicitDurationMinutes,null,'historical “10분 전에” must not become an explicit action duration');

for(const action of ['도서관에 간다?','주변을 살핀다?','주변을 돌아다닌다?','10분 기다린다?','쉰다?']){
  const intent=classifySceneIntent(action);
  assert.equal(intent.kind,'decision-sensitive',`question-form compressed action must not execute: ${action}`);
  assert.equal(intent.compression,false,`question-form compressed action must disable compression: ${action}`);
  assert.equal(intent.minAdvanceMinutes,0,`question-form compressed action must not force time: ${action}`);
}

const noOpGrowth=deriveSceneDelta({
  action:'훈련한다.',
  saveState:{pc:{status:'안정'}},
  turn:{choices:[],scene:[],state_delta:{stat_progress:[{stat:'신체',amount:0}],skill_experience:[{skill:'대검술',amount:0}],awakening_progress:[{amount:0}]}},
});
assert.equal(noOpGrowth.flags.growthChanged,false,'amount:0 growth rows must not fake progress');
assert.equal(noOpGrowth.score,0,'no-op growth rows must not increase Scene Momentum score');
const realGrowth=deriveSceneDelta({
  action:'훈련한다.',
  turn:{choices:[],scene:[],state_delta:{stat_progress:[{stat:'신체',amount:1}]}},
});
assert.equal(realGrowth.flags.growthChanged,true,'non-zero growth must still count');

const npcMutation=deriveSceneDelta({
  action:'주변을 본다.',
  saveState:{npcStates:{guide:{status:'idle'}}},
  turn:{choices:[],scene:[],state_delta:{npc_state_updates:[{npc_key:'guide',status:'moving'}]}},
});
assert.equal(npcMutation.flags.npcStateChanged,true,'real NPC state mutation must count');
assert.equal(npcMutation.flags.npcAction,false,'NPC state mutation alone must not double-count as NPC action');
assert.equal(npcMutation.score,1,'one NPC state mutation must count exactly once');

const choiceStop=deriveSceneDelta({
  action:'앞을 살핀다.',
  turn:{choices:['왼쪽으로 간다.','오른쪽으로 간다.','돌아간다.'],scene:[],state_delta:{}},
});
assert.equal(choiceStop.score,0,'choice-only stop need not fabricate state delta');
assert.equal(choiceStop.metTarget,true,'fresh meaningful choices must satisfy Scene Momentum stop policy');
const choiceMomentum=updateSceneMomentum({momentum:{stall_streak:1}},choiceStop,{turnNumber:9});
assert.equal(choiceMomentum.stall_streak,0,'legitimate choice stop must not build stall pressure');
assert.equal(choiceMomentum.pressure,'normal');

const sameStatus=deriveSceneDelta({
  action:'상태를 점검한다.',
  saveState:{pc:{status:'안정'}},
  turn:{choices:[],scene:[],state_delta:{pc_status:'안정'}},
});
assert.equal(sameStatus.flags.dangerChanged,false,'echoing identical PC status must not count as progress');
const changedStatus=deriveSceneDelta({
  action:'상태를 점검한다.',
  saveState:{pc:{status:'안정'}},
  turn:{choices:[],scene:[],state_delta:{pc_status:'부상'}},
});
assert.equal(changedStatus.flags.dangerChanged,true,'real PC status change must still count');

const continueDirective=buildSceneMomentumDirective({
  action:'[LUMENSIA V1.5.6 CONTINUE]\n직전 장면의 같은 순간을 이어 쓴다.',
  saveState:{sceneRuntime:{momentum:{stall_streak:3}}},
});
assert.match(continueDirective,/CONTINUE HARD FREEZE/,'CONTINUE must receive freeze-safe momentum replacement');
assert.doesNotMatch(continueDirective,/SCENE_STALL=true/,'CONTINUE must never receive stall-recovery pressure');
assert.doesNotMatch(continueDirective,/실제 변화가 필요/,'CONTINUE replacement must not demand state change');
assert.match(continueDirective,/새 NPC 대사·발화·몸짓·이동·결정·도착·퇴장을 추가하지 않는다/,'CONTINUE must forbid new NPC interaction even within the same clock minute');
assert.match(continueDirective,/정적인 감각 묘사만 허용/,'CONTINUE may elaborate prose without progressing the scene');

console.log('PASS Scene Momentum correctness (question guards, duration predicate, no-op delta, dedupe, choice stop, status, CONTINUE freeze)');
