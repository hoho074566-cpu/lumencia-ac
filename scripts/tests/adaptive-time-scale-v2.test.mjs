#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ADAPTIVE_TIME_SCALE_VERSION,
  activityRangeLimitMinutes,
  buildSceneMomentumDirective,
  classifySceneIntent,
  scheduleBoundaryLimitMinutes,
} from '../../lib/scene-momentum.js';

assert.equal(ADAPTIVE_TIME_SCALE_VERSION, '2.0');

const dialogue = classifySceneIntent('아르테미스와 대화한다.', { location:'A동 복도' });
assert.equal(dialogue.kind, 'dialogue');
assert.equal(dialogue.timeProfile, 'dialogue');
assert.deepEqual(dialogue.suggestedAdvanceMinutes, [2, 10]);
assert.equal(dialogue.compression, true);

const directQuestion = classifySceneIntent('아르테미스에게 오리엔테이션이 끝났느냐고 묻는다?', { location:'A동 복도' });
assert.equal(directQuestion.kind, 'decision-sensitive', 'a direct question must retain same-moment player sovereignty');
assert.equal(directQuestion.minAdvanceMinutes, 0);

const meal = classifySceneIntent('점심 식사를 한다.', { location:'식당' });
assert.equal(meal.kind, 'meal');
assert.deepEqual(meal.suggestedAdvanceMinutes, [20, 45]);

const explicitMeal = classifySceneIntent('한 시간 동안 점심 식사를 한다.', { location:'식당' });
assert.equal(explicitMeal.explicitDurationMinutes, 60);
assert.deepEqual(explicitMeal.suggestedAdvanceMinutes, [60, 60]);
assert.deepEqual(classifySceneIntent('점심을 한 시간 동안 먹는다.', { location:'식당' }).suggestedAdvanceMinutes, [60, 60], 'object-duration-verb meal order must honor the explicit duration');

const training = classifySceneIntent('검술을 훈련한다.', { location:'훈련장' });
assert.equal(training.kind, 'training');
assert.deepEqual(training.suggestedAdvanceMinutes, [30, 120]);

const explicitTraining = classifySceneIntent('45분 동안 마법을 연습한다.', { location:'훈련장' });
assert.equal(explicitTraining.explicitDurationMinutes, 45);
assert.deepEqual(explicitTraining.suggestedAdvanceMinutes, [45, 45]);
assert.equal(classifySceneIntent('10분 전에 배운 동작을 훈련한다.').explicitDurationMinutes, null, 'historical time must not become a training duration');
assert.equal(classifySceneIntent('한 시간 후에 검술을 훈련한다.').explicitDurationMinutes, null, 'future start time must not become a training duration');
assert.equal(classifySceneIntent('10분 전에 배운 동작을 한 시간 동안 훈련한다.').explicitDurationMinutes, 60, 'a historical reference must not hide a separate explicit activity duration');
assert.equal(classifySceneIntent('한 시간 훈련하고 20분 쉰다.').explicitDurationMinutes, 20, 'a terminal rest must use only the duration attached to that rest clause');
assert.deepEqual(classifySceneIntent('30분 동안 훈련한 뒤 잠을 잔다.').suggestedAdvanceMinutes, [240, 480], 'an earlier training duration must not become the terminal sleep duration');
assert.equal(classifySceneIntent('한 시간 동안 친구하고 대화한다.').explicitDurationMinutes, 60, 'the comitative 하고 particle must not be mistaken for an activity boundary');

const classAttendance = classifySceneIntent('강의에 참석한다.', { location:'강의실' });
assert.equal(classAttendance.kind, 'class-attendance');
assert.deepEqual(classAttendance.suggestedAdvanceMinutes, [45, 120]);

const explicitClass = classifySceneIntent('두 시간 동안 수업을 듣는다.', { location:'강의실' });
assert.equal(explicitClass.explicitDurationMinutes, 120);
assert.deepEqual(explicitClass.suggestedAdvanceMinutes, [120, 120]);
assert.deepEqual(classifySceneIntent('수업을 두 시간 동안 듣는다.', { location:'강의실' }).suggestedAdvanceMinutes, [120, 120], 'object-duration-verb class order must honor the explicit duration');
assert.equal(classifySceneIntent('10시 30분에 수업을 듣는다.', { location:'강의실' }).explicitDurationMinutes, null, 'a clock minute component must not become an activity duration');
assert.deepEqual(classifySceneIntent('10시 30분에 수업을 한 시간 동안 듣는다.', { location:'강의실' }).suggestedAdvanceMinutes, [60, 60], 'masking a clock must preserve a separate explicit activity duration');
const futureClockClass=classifySceneIntent('10시 30분에 수업을 듣는다.', { location:'여관',currentTime:'07:40' });
assert.equal(futureClockClass.scheduledStartOffsetMinutes,170,'a future clock must become a start offset, not a duration');
assert.deepEqual(futureClockClass.suggestedAdvanceMinutes,[215,290],'scheduled activity time must include waiting until the start plus the class duration');
assert.deepEqual(classifySceneIntent('10시 30분에 수업을 한 시간 동안 듣는다.', { location:'여관',currentTime:'07:40' }).suggestedAdvanceMinutes,[230,230],'a separate explicit duration must be added after the scheduled start');
assert.deepEqual(classifySceneIntent('10:30에 수업을 듣는다.', { location:'여관',currentTime:'07:40' }).suggestedAdvanceMinutes,[215,290],'colon clock notation must use the same scheduled-start semantics');
assert.equal(classifySceneIntent('10시 30분부터 11시 30분까지 수업을 듣는다.', { location:'여관',currentTime:'07:40' }).explicitDurationMinutes,null,'both clock minute components must stay out of duration parsing');
assert.equal(classifySceneIntent('10시 30분에 수업을 듣는다.', { location:'강의실',currentTime:'12:00' }).scheduledStartOffsetMinutes,null,'an already-past ambiguous clock must not silently roll into the next day');
assert.equal(classifySceneIntent('내일 10시 30분에 수업을 듣는다.', { location:'여관',currentTime:'07:40' }).scheduledStartOffsetMinutes,null,'a next-day clock must not be collapsed onto today');

const sleep = classifySceneIntent('잠을 잔다.', { location:'개인실' });
assert.equal(sleep.kind, 'downtime');
assert.equal(sleep.timeProfile, 'sleep');
assert.deepEqual(sleep.suggestedAdvanceMinutes, [240, 480]);
assert.equal(classifySceneIntent('근처 여관에 방을 잡고 충분히 잠을 잔다.', { location:'중앙광장' }).timeProfile, 'sleep', 'a compressed travel-and-sleep action must retain its terminal sleep intent');
assert.equal(classifySceneIntent('아르테미스가 잠을 잔다?', { location:'개인실' }).kind, 'decision-sensitive', 'a question about sleep must not execute the described action');
assert.notEqual(classifySceneIntent('잠을 자지 않는다.', { location:'개인실' }).timeProfile, 'sleep', 'negated sleep must not become committed downtime');
assert.match(buildSceneMomentumDirective({ action:'잠을 잔다.', saveState:{ world:{ date:'1285-03-02', time:'07:20', location:'개인실' } } }), /완료 시간과 advance_minutes를 TIME_GUIDE 240-480 안에 두며/, 'completed sleep must receive explicit hard profile bounds');
assert.deepEqual(classifySceneIntent('한 시간 잠을 잔다.').suggestedAdvanceMinutes, [60, 60], 'explicit sleep duration must remain exact');
assert.equal(classifySceneIntent('잠깐 눈을 붙인다.').timeProfile, 'rest', 'a short-rest cue must not become a four-hour sleep floor');

const withinBuilding = classifySceneIntent('A동 복도로 간다.', { location:'A동 개인실' });
assert.equal(withinBuilding.timeProfile, 'travel-within-building');
assert.deepEqual(withinBuilding.suggestedAdvanceMinutes, [2, 8]);

const campusTravel = classifySceneIntent('도서관으로 간다.', { location:'A동 개인실' });
assert.equal(campusTravel.timeProfile, 'travel-campus');
assert.deepEqual(campusTravel.suggestedAdvanceMinutes, [5, 20]);
assert.equal(classifySceneIntent('B동으로 간다.', { location:'A동 개인실' }).timeProfile, 'travel-campus');
const explicitTravel=classifySceneIntent('30분 동안 기숙사로 간다.', { location:'도서관' });
assert.equal(explicitTravel.kind,'travel');
assert.equal(explicitTravel.semanticTarget,'기숙사','the duration phrase must not pollute the travel destination');
assert.equal(explicitTravel.explicitDurationMinutes,30);
assert.deepEqual(explicitTravel.suggestedAdvanceMinutes,[30,30],'an explicit travel duration must override the natural distance range');

const regionalTravel = classifySceneIntent('왕도로 간다.', { location:'중앙광장' });
assert.equal(regionalTravel.timeProfile, 'travel-regional');
assert.deepEqual(regionalTravel.suggestedAdvanceMinutes, [15, 60]);
assert.equal(classifySceneIntent('북쪽 숲으로 간다.', { location:'중앙광장' }).timeProfile, 'travel-regional');
assert.equal(classifySceneIntent('계산대로 간다.', { location:'식당' }).timeProfile, 'travel-local', 'a place name containing 산 must not become regional travel');
assert.deepEqual(classifySceneIntent('도서관으로 간다.').suggestedAdvanceMinutes, [3, 30], 'missing location context must preserve the proven fallback');

const boundarySave = {
  pc:{ department:'기사과' },
  world:{ date:'1285-03-01', time:'09:40', location:'훈련장' },
  scheduleContext:{ due:[], upcoming:[{ id:'class', title:'기사과 필수 수업', date:'1285-03-01', time:'10:00', kind:'academic' }] },
};
const trainingDirective = buildSceneMomentumDirective({ action:'검술을 훈련한다.', saveState:boundarySave });
assert.match(trainingDirective, /TIME_PROFILE=training@2\.0/);
assert.match(trainingDirective, /TIME_GUIDE=30-120min/);
assert.match(trainingDirective, /SCHEDULE_BOUNDARY=20min/, 'an earlier mandatory schedule must interrupt a compressed training session');
assert.equal(scheduleBoundaryLimitMinutes(training), 30);
assert.equal(activityRangeLimitMinutes(training),120,'consequence lookahead must cover the complete valid training range');

const continueDirective = buildSceneMomentumDirective({ action:'[LUMENSIA V1.5.6 CONTINUE]', saveState:boundarySave });
assert.match(continueDirective, /CONTINUE HARD FREEZE/);
assert.doesNotMatch(continueDirective, /TIME_PROFILE=/, 'CONTINUE must not receive a new time profile');

const router = fs.readFileSync(new URL('../../api/chat-router.js', import.meta.url), 'utf8');
const health = fs.readFileSync(new URL('../../api/health.js', import.meta.url), 'utf8');
const repositoryRules = fs.readFileSync(new URL('../../AGENTS.md', import.meta.url), 'utf8');
assert.match(router, /ADAPTIVE_TIME_SCALE_VERSION/);
assert.match(router, /adaptive_time_scale_v2:true/);
assert.match(router, /mode!==['"]game['"]/, 'META/AUTO/CONTINUE must stay outside the deterministic time floor');
assert.match(fs.readFileSync(new URL('../../api/lib/context-router.js', import.meta.url), 'utf8'), /sceneIntent\.compression&&sceneIntent\.minAdvanceMinutes>0\?activityRangeLimitMinutes\(sceneIntent\):0/, 'all compressed timed activities must expose their full valid consequence lookahead');
assert.match(health, /version:\s*'0\.8\.6'/);
assert.match(repositoryRules, /External API adapter:\s*`0\.8\.6`/, 'the authoritative release manifest must match the adapter and health surface');
assert.match(health, /adaptiveTimeScale:\s*'V2/);
assert.equal((router.match(/coreHandler\(/g) || []).length, 1, 'Adaptive Time Scale V2 must preserve one canonical core model call');

console.log('PASS Adaptive Time Scale V2 action profiles, explicit durations, travel distance, schedule priority, freeze, health, and one-call regressions');
