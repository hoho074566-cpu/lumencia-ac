#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildSceneMomentumDirective, classifySceneIntent } from '../../lib/scene-momentum.js';

// Negated actions are declarations not to perform the action, never compressed execution.
assert.notEqual(classifySceneIntent('탐색하지 않는다.',{location:'A동'}).kind,'explore');
assert.notEqual(classifySceneIntent('싸우지 않는다.',{location:'중앙광장'}).kind,'committed-consequence');
assert.notEqual(classifySceneIntent('공격하지 않는다.',{location:'중앙광장'}).kind,'committed-consequence');
assert.notEqual(classifySceneIntent('밖으로 나가지 않는다.',{location:'A동 개인실'}).kind,'exit-exterior');

// Intent keywords describing another actor/noun are not the player's predicate.
assert.notEqual(classifySceneIntent('잠든 이사벨을 깨운다.',{location:'기숙사'}).kind,'downtime');
assert.notEqual(classifySceneIntent('기다린 학생에게 말을 건다.',{location:'복도'}).kind,'wait');
assert.notEqual(classifySceneIntent('탐색대에게 상황을 묻는다.',{location:'광장'}).kind,'explore');
assert.notEqual(classifySceneIntent('배회하던 학생을 붙잡는다.',{location:'광장'}).kind,'explore');

// Positive predicates still classify normally.
assert.equal(classifySceneIntent('탐색한다.',{location:'A동'}).kind,'explore');
assert.equal(classifySceneIntent('좀 쉰다.',{location:'기숙사'}).kind,'downtime');
const oneHourRest=classifySceneIntent('한 시간 쉰다.',{location:'기숙사'});
assert.equal(oneHourRest.kind,'downtime','native-Korean one-hour rest must be compressed as downtime');
assert.equal(oneHourRest.explicitDurationMinutes,60,'한 시간 must parse as 60 explicit minutes');
const twoHourRest=classifySceneIntent('두 시간 쉰다.',{location:'기숙사'});
assert.equal(twoHourRest.kind,'downtime','native-Korean two-hour rest must be compressed as downtime');
assert.equal(twoHourRest.explicitDurationMinutes,120,'두 시간 must parse as 120 explicit minutes');
assert.equal(classifySceneIntent('한 시간 30분 쉰다.',{location:'기숙사'}).explicitDurationMinutes,90,'mixed native-Korean hour and numeric minutes must compose');
assert.equal(classifySceneIntent('게시판을 다시 확인한다.',{location:'기사과 게시판 앞'}).kind,'observe','repeated observation adverb must remain observe intent');
const travelQuestion=classifySceneIntent('도서관에 갈까?',{location:'기숙사'});
assert.equal(travelQuestion.kind,'decision-sensitive','travel deliberation must not execute as a committed move');
assert.equal(travelQuestion.minAdvanceMinutes,0,'travel deliberation must not receive a movement time floor');
assert.equal(classifySceneIntent('도서관에 갈지 고민한다.',{location:'기숙사'}).kind,'decision-sensitive','travel deliberation statement must not execute as committed movement');
for(const action of ['도서관에 갈까 말까?','도서관에 가야 할까?','도서관에 갈까요?']){
  assert.equal(classifySceneIntent(action,{location:'기숙사'}).kind,'decision-sensitive',`${action} must remain an unresolved player decision`);
}
const indirectScheduleQuestion='지금 오리엔테이션이 끝난 뒤 대장간에 들를 시간이 있을까?';
assert.equal(classifySceneIntent(indirectScheduleQuestion,{location:'기사과 강의실'}).kind,'decision-sensitive','an indirect feasibility question must not become generic scene progression');
const indirectQuestionDirective=buildSceneMomentumDirective({action:indirectScheduleQuestion,saveState:{world:{location:'기사과 강의실'},sceneRuntime:{}}});
assert.match(indirectQuestionDirective,/QUESTION \/ DELIBERATION 규칙/,'question-only turns must receive an explicit sovereignty freeze');
assert.match(indirectQuestionDirective,/advance_minutes=0/,'question-only turns must keep the same moment');
assert.match(indirectQuestionDirective,/진행 중인 일정\/이벤트를 완료하지 않는다/,'question-only turns must not complete an active event');
const stalledQuestionDirective=buildSceneMomentumDirective({action:indirectScheduleQuestion,saveState:{world:{location:'기사과 강의실'},sceneRuntime:{momentum:{stall_streak:3}}}});
assert.doesNotMatch(stalledQuestionDirective,/SCENE_STALL=true/,'decision-sensitive sovereignty freeze must suppress contradictory stall pressure');
assert.doesNotMatch(stalledQuestionDirective,/실제 변화가 필요/,'a stalled question turn must not require world mutation');
for(const action of ['지금 오리엔테이션이 끝난 뒤 대장간에 들를 시간이 있을까.', '지금 오리엔테이션이 끝난 뒤 대장간에 들를 시간이 있을까요.', '대장간에 들를 시간이 있을까']){
  const intent=classifySceneIntent(action,{location:'기사과 강의실'});
  assert.equal(intent.kind,'decision-sensitive',`Korean interrogative ending must preserve sovereignty without a question mark: ${action}`);
  assert.doesNotMatch(buildSceneMomentumDirective({action,saveState:{world:{location:'기사과 강의실'},sceneRuntime:{momentum:{stall_streak:3}}}}),/SCENE_STALL=true/,`question without ? must suppress stall pressure: ${action}`);
}
assert.equal(classifySceneIntent('기다린다.',{location:'광장'}).kind,'wait');
assert.equal(classifySceneIntent('공격한다.',{location:'광장'}).kind,'committed-consequence');
assert.equal(classifySceneIntent('경비를 죽이고 잠을 잔다.',{location:'광장'}).kind,'committed-consequence','a consequential prefix must outrank a terminal sleep suffix');
assert.equal(classifySceneIntent('경비를 죽이고 검술을 훈련한다.',{location:'광장'}).kind,'committed-consequence','a consequential prefix must outrank every routine compression suffix');
assert.equal(classifySceneIntent('경비를 죽이지 않고 잠을 잔다.',{location:'광장'}).kind,'downtime','an explicitly negated consequential prefix may still leave a committed sleep action');
assert.equal(classifySceneIntent('공격하지 않고 협상을 하고 잠을 잔다.',{location:'광장'}).kind,'committed-consequence','negating one consequential clause must not erase a later committed consequential clause');
assert.equal(classifySceneIntent('누군가 “죽이겠다”고 외치는 소리를 듣고 잠을 잔다.',{location:'광장'}).kind,'downtime','quoted consequential speech must not become the player action');
assert.equal(classifySceneIntent('누군가 죽이겠다고 외치는 소리를 듣고 잠을 잔다.',{location:'광장'}).kind,'downtime','reported consequential speech must not become the player action');
assert.equal(classifySceneIntent('그가 경비를 죽이겠다는 소리를 듣고 잠을 잔다.',{location:'광장'}).kind,'downtime','nominalized third-party consequential reports must not become the player action');
assert.equal(classifySceneIntent('그가 경비를 죽이겠다는 사실을 알고 잠을 잔다.',{location:'광장'}).kind,'downtime','third-party consequential knowledge reports must not become the player action');
assert.equal(classifySceneIntent('나는 경비를 죽이겠다고 말하고 잠을 잔다.',{location:'광장'}).kind,'committed-consequence','first-person consequential intent must not be discarded as third-party attributed speech');
assert.equal(classifySceneIntent('나는 경비를 죽이겠다는 결심을 하고 잠을 잔다.',{location:'광장'}).kind,'committed-consequence','first-person nominalized intent must remain a committed player action');
assert.equal(classifySceneIntent('저는 경비를 죽이겠다는 계획을 확인하고 잠을 잔다.',{location:'광장'}).kind,'committed-consequence','polite first-person consequential intent must not be filtered as third-party speech');
assert.equal(classifySceneIntent('우리는 경비를 죽이겠다는 계획을 확인하고 잠을 잔다.',{location:'광장'}).kind,'committed-consequence','plural first-person consequential intent must not be filtered as third-party speech');

// Explicit durations override generic wait/downtime minimum floors.
const wait5=classifySceneIntent('5분만 기다린다.',{location:'광장'});
assert.equal(wait5.kind,'wait');
assert.equal(wait5.explicitDurationMinutes,5);
assert.equal(wait5.minAdvanceMinutes,5);
assert.deepEqual(wait5.suggestedAdvanceMinutes,[5,5]);

const rest5=classifySceneIntent('5분만 쉰다.',{location:'기숙사'});
assert.equal(rest5.kind,'downtime');
assert.equal(rest5.explicitDurationMinutes,5);
assert.equal(rest5.minAdvanceMinutes,5);
assert.deepEqual(rest5.suggestedAdvanceMinutes,[5,5]);
assert.match(buildSceneMomentumDirective({action:'5분만 쉰다.',saveState:{world:{location:'기숙사'},sceneRuntime:{}}}),/EXPLICIT_DURATION=5min/);
assert.match(buildSceneMomentumDirective({action:'5분만 쉰다.',saveState:{world:{location:'기숙사'},sceneRuntime:{}}}),/일반적인 downtime 시간 floor로 더 늘리지/);

console.log('PASS Scene Momentum intent guards (negation, predicate anchoring, explicit duration)');
