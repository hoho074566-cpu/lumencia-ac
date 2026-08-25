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
assert.equal(classifySceneIntent('10시에 에밀리와 면담을 한다.', { location:'상담실',currentTime:'09:00' }).kind,'dialogue','object-marked 면담 must use the dialogue profile');
assert.equal(classifySceneIntent('에밀리와 대화를 한다.', { location:'상담실' }).kind,'dialogue','object-marked 대화 must remain a committed dialogue action');

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
const rangedTraining=classifySceneIntent('1시간에서 2시간 동안 훈련한다.', { location:'훈련장' });
assert.equal(rangedTraining.explicitDurationMinutes,null,'duration range endpoints must not be summed into one exact duration');
assert.deepEqual(rangedTraining.explicitDurationRangeMinutes,[60,120],'the declared training duration range must remain explicit');
assert.equal(rangedTraining.minAdvanceMinutes,60,'the lower range endpoint must be the deterministic minimum');
assert.deepEqual(rangedTraining.suggestedAdvanceMinutes,[60,120],'the time guide must retain both range endpoints without summing them');
assert.match(buildSceneMomentumDirective({action:'1시간에서 2시간 동안 훈련한다.',saveState:{world:{date:'1285-03-01',time:'09:00',location:'훈련장'}}}),/EXPLICIT_DURATION_RANGE=60-120min/,'the model must receive the declared range as a range');
assert.deepEqual(classifySceneIntent('30분~1시간 동안 기다린다.').suggestedAdvanceMinutes,[30,60],'tilde-separated duration ranges must also retain their endpoints');
assert.deepEqual(classifySceneIntent('훈련을 1시간부터 2시간까지 한다.').suggestedAdvanceMinutes,[60,120],'object-marked from/to duration ranges must remain bounded ranges');
const rangedFutureStart=classifySceneIntent('1시간에서 2시간 후에 훈련한다.',{currentTime:'09:00'});
assert.equal(rangedFutureStart.explicitDurationRangeMinutes,null,'a future start window must not become an activity duration range');
assert.equal(rangedFutureStart.scheduledStartOffsetMinutes,120,'the terminal relative start qualifier must remain the selected start offset');
assert.equal(classifySceneIntent('10분 전에 배운 동작을 훈련한다.').explicitDurationMinutes, null, 'historical time must not become a training duration');
assert.equal(classifySceneIntent('한 시간 후에 검술을 훈련한다.').explicitDurationMinutes, null, 'future start time must not become a training duration');
assert.equal(classifySceneIntent('10분 전에 배운 동작을 한 시간 동안 훈련한다.').explicitDurationMinutes, 60, 'a historical reference must not hide a separate explicit activity duration');
assert.equal(classifySceneIntent('한 시간 훈련하고 20분 쉰다.').explicitDurationMinutes, 20, 'a terminal rest must use only the duration attached to that rest clause');
assert.deepEqual(classifySceneIntent('30분 동안 훈련한 뒤 잠을 잔다.').suggestedAdvanceMinutes, [270, 510], 'an explicit preceding training duration must be added to the terminal sleep range');
const compoundExplicitSleep=classifySceneIntent('1시간 동안 훈련을 하고 8시간 동안 잠을 잔다.');
assert.equal(compoundExplicitSleep.explicitDurationMinutes,480,'the terminal explicit sleep duration must remain separately identifiable');
assert.equal(compoundExplicitSleep.precedingActivityMinutes,60,'the committed preceding training duration must be retained');
assert.deepEqual(compoundExplicitSleep.suggestedAdvanceMinutes,[540,540],'compound explicit activities must use their full declared total duration');
const rangedCompoundSleep=classifySceneIntent('1시간에서 2시간 동안 훈련을 하고 8시간 동안 잠을 잔다.');
assert.deepEqual(rangedCompoundSleep.precedingActivityRangeMinutes,[60,120],'a preceding activity range must retain both endpoints');
assert.deepEqual(rangedCompoundSleep.suggestedAdvanceMinutes,[540,600],'a preceding activity range must offset the terminal activity with separate lower and upper bounds');
assert.deepEqual(classifySceneIntent('훈련을 1시간에서 2시간 동안 하고 8시간 동안 잠을 잔다.').suggestedAdvanceMinutes,[540,600],'a duration between the preceding activity object and connector must remain scoped to that activity');
const compoundZeroSleep=classifySceneIntent('1시간 동안 훈련을 하고 0분 동안 잠을 잔다.');
assert.equal(compoundZeroSleep.explicitDurationMinutes,0,'the terminal zero duration must remain visible');
assert.equal(compoundZeroSleep.minAdvanceMinutes,60,'the full turn duration must retain the completed preceding hour');
const compoundExplicitDirective=buildSceneMomentumDirective({action:'1시간 동안 훈련을 하고 8시간 동안 잠을 잔다.',saveState:{world:{date:'1285-03-01',time:'09:00',location:'기숙사'}}});
assert.match(compoundExplicitDirective,/PRECEDING_ACTIVITY_DURATION=60min/,'the model directive must expose the preceding activity duration');
assert.match(compoundExplicitDirective,/사용자가 540분을 직접 지정했다\(앞선 행동 60분 포함\)/,'the explicit-duration rule must describe the full compound total without contradicting TIME_GUIDE');
const rangedCompoundDirective=buildSceneMomentumDirective({action:'1시간에서 2시간 동안 훈련을 하고 8시간 동안 잠을 잔다.',saveState:{world:{date:'1285-03-01',time:'09:00',location:'기숙사'}}});
assert.match(rangedCompoundDirective,/PRECEDING_ACTIVITY_DURATION_RANGE=60-120min/,'the directive must expose a preceding activity range without collapsing it');
assert.match(rangedCompoundDirective,/사용자가 540-600분을 직접 지정했다\(앞선 행동 60-120분 포함\)/,'the directive must describe the full compound range');
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
const compoundClockClass=classifySceneIntent('9시에 아침을 먹고 10시에 수업을 듣는다.', { location:'여관',currentTime:'08:00' });
assert.equal(compoundClockClass.scheduledStartOffsetMinutes,120,'a terminal class must bind to its own clock rather than an earlier compound meal clock');
assert.deepEqual(compoundClockClass.suggestedAdvanceMinutes,[165,240],'the terminal activity clock offset must be added to the class duration range');
assert.equal(classifySceneIntent('내일 9시에 아침을 먹고 10시에 수업을 듣는다.', { location:'여관',currentTime:'08:00' }).scheduledStartOffsetMinutes,null,'scoping to the terminal activity must not collapse an inherited next-day compound clock onto today');
assert.deepEqual(classifySceneIntent('10:30에 수업을 듣는다.', { location:'여관',currentTime:'07:40' }).suggestedAdvanceMinutes,[215,290],'colon clock notation must use the same scheduled-start semantics');
assert.equal(classifySceneIntent('오늘 오후 3시 반에 수업을 듣는다.', { location:'강의실',currentTime:'14:00' }).scheduledStartOffsetMinutes,90,'the 시 반 clock form must normalize to thirty minutes past the hour');
const intervalClockClass=classifySceneIntent('10시 30분부터 11시 30분까지 수업을 듣는다.', { location:'여관',currentTime:'07:40' });
assert.equal(intervalClockClass.explicitDurationMinutes,60,'an explicit start-to-end clock interval must derive the activity duration');
assert.deepEqual(intervalClockClass.suggestedAdvanceMinutes,[230,230],'an explicit clock interval must include the wait to start and end at the requested clock');
assert.deepEqual(classifySceneIntent('22시부터 2시까지 잠을 잔다.', { location:'개인실',currentTime:'20:00' }).suggestedAdvanceMinutes,[360,360],'an unmarked 24-hour interval ending before its start must cross midnight');
assert.equal(classifySceneIntent('10시 30분에 수업을 듣는다.', { location:'강의실',currentTime:'12:00' }).scheduledStartOffsetMinutes,null,'an already-past ambiguous clock must not silently roll into the next day');
const nextDayClass=classifySceneIntent('내일 10시 30분에 수업을 듣는다.', { location:'여관',currentTime:'07:40' });
assert.equal(nextDayClass.scheduledStartOffsetMinutes,null,'a next-day clock must not be collapsed onto today');
assert.equal(nextDayClass.compression,false,'a date-qualified activity beyond the one-turn clock cap must not receive immediate deterministic enforcement');
assert.deepEqual(nextDayClass.suggestedAdvanceMinutes,[0,1440],'a date-qualified activity must inspect the bounded next-day window without inheriting the same-day class floor');
assert.equal(nextDayClass.boundaryLookaheadMinutes,1440,'a date-qualified activity must expose one bounded day for schedule and consequence arbitration');
assert.match(buildSceneMomentumDirective({action:'내일 10시 30분에 수업을 듣는다.',saveState:{world:{date:'1285-03-01',time:'07:40',location:'여관'}}}),/날짜 지정 시작 규칙/,'the model must be told to preserve the requested day instead of pulling the class into today');
const todayTerminalClass=classifySceneIntent('내일 계획을 세운 뒤 오늘 오전 10시에 수업을 듣는다.', { location:'여관',currentTime:'09:00' });
assert.equal(todayTerminalClass.dateQualifiedStart,false,'an earlier next-day planning clause must not date-qualify the terminal today activity');
assert.equal(todayTerminalClass.scheduledStartOffsetMinutes,60,'the terminal today clock must remain the selected activity start');
assert.deepEqual(todayTerminalClass.suggestedAdvanceMinutes,[105,180],'the terminal today class must retain same-day wait plus activity timing');
const topicQualifiedClass=classifySceneIntent('내일은 오전 8시에 기사과 기초 수업을 듣는다.', { location:'기숙사',currentTime:'09:00' });
assert.equal(topicQualifiedClass.dateQualifiedStart,true,'a future-day topic particle must preserve the date-qualified activity');
assert.equal(topicQualifiedClass.compression,false,'a topic-qualified next-day class must not receive the immediate class floor');
assert.deepEqual(topicQualifiedClass.suggestedAdvanceMinutes,[0,1440]);
assert.equal(classifySceneIntent('모레는 오전 8시에 수업을 듣는다.', { location:'기숙사',currentTime:'09:00' }).dateQualifiedStart,true,'모레는 must remain a future date qualifier');
assert.equal(classifySceneIntent('정오에 수업을 듣는다.', { location:'강의실',currentTime:'09:00' }).scheduledStartOffsetMinutes,180,'noon must normalize to the same-day 12:00 start');
assert.equal(classifySceneIntent('자정에 훈련한다.', { location:'훈련장',currentTime:'09:00' }).scheduledStartOffsetMinutes,900,'midnight must normalize to the next upcoming 00:00 start');
assert.equal(classifySceneIntent('12시에 기사과 오리엔테이션에 참석한다.', { location:'기숙사',currentTime:'09:00' }).kind,'class-attendance','orientation attendance must use the scheduled academic profile');
assert.equal(classifySceneIntent('12시에 신입생 교육을 받는다.', { location:'기숙사',currentTime:'09:00' }).kind,'class-attendance','scheduled education must use the academic profile');
assert.equal(classifySceneIntent('12시에 입학식에 참석한다.', { location:'기숙사',currentTime:'09:00' }).kind,'class-attendance','entrance ceremony attendance must use the academic profile');
assert.equal(classifySceneIntent('오늘 아침 8시에 수업을 듣는다.', { location:'강의실',currentTime:'07:00' }).scheduledStartOffsetMinutes,60,'아침 must normalize to an AM clock marker');
assert.equal(classifySceneIntent('오늘 저녁 8시에 수업을 듣는다.', { location:'강의실',currentTime:'19:00' }).scheduledStartOffsetMinutes,60,'저녁 must normalize to a PM clock marker');
assert.equal(classifySceneIntent('오늘 밤 10시에 훈련한다.', { location:'훈련장',currentTime:'21:00' }).scheduledStartOffsetMinutes,60,'밤 must normalize to a PM clock marker');

const sleep = classifySceneIntent('잠을 잔다.', { location:'개인실' });
assert.equal(sleep.kind, 'downtime');
assert.equal(sleep.timeProfile, 'sleep');
assert.deepEqual(sleep.suggestedAdvanceMinutes, [240, 480]);
assert.equal(classifySceneIntent('근처 여관에 방을 잡고 충분히 잠을 잔다.', { location:'중앙광장' }).timeProfile, 'sleep', 'a compressed travel-and-sleep action must retain its terminal sleep intent');
assert.equal(classifySceneIntent('아르테미스가 잠을 잔다?', { location:'개인실' }).kind, 'decision-sensitive', 'a question about sleep must not execute the described action');
assert.notEqual(classifySceneIntent('잠을 자지 않는다.', { location:'개인실' }).timeProfile, 'sleep', 'negated sleep must not become committed downtime');
assert.match(buildSceneMomentumDirective({ action:'잠을 잔다.', saveState:{ world:{ date:'1285-03-02', time:'07:20', location:'개인실' } } }), /완료 시간과 advance_minutes를 TIME_GUIDE 240-480 안에 두며/, 'completed sleep must receive explicit hard profile bounds');
assert.deepEqual(classifySceneIntent('한 시간 잠을 잔다.').suggestedAdvanceMinutes, [60, 60], 'explicit sleep duration must remain exact');
assert.deepEqual(classifySceneIntent('1시간 반 동안 잠을 잔다.').suggestedAdvanceMinutes, [90, 90], 'the half-hour suffix must add thirty minutes to an explicit hour duration');
assert.equal(classifySceneIntent('잠깐 눈을 붙인다.').timeProfile, 'rest', 'a short-rest cue must not become a four-hour sleep floor');
assert.equal(classifySceneIntent('잠깐 대화를 하고 잠을 잔다.').timeProfile, 'sleep', 'a short cue on a preceding dialogue must not downgrade the terminal sleep action');
const scheduledSleep=classifySceneIntent('오늘 오후 10시에 잠을 잔다.', { location:'개인실',currentTime:'09:00' });
assert.equal(scheduledSleep.scheduledStartOffsetMinutes,780,'same-day scheduled sleep must retain its start offset');
assert.deepEqual(scheduledSleep.suggestedAdvanceMinutes,[1020,1260],'scheduled sleep timing must include waiting until start plus the sleep range');
const futureSleep=classifySceneIntent('내일 오전 8시에 잠을 잔다.', { location:'개인실',currentTime:'09:00' });
assert.equal(futureSleep.dateQualifiedStart,true,'next-day sleep must use future-date handling');
assert.equal(futureSleep.compression,false,'next-day sleep must not execute on the immediate sleep profile');
assert.deepEqual(futureSleep.suggestedAdvanceMinutes,[0,1440]);
const scheduledWait=classifySceneIntent('오늘 오전 10시에 기다린다.', { location:'광장',currentTime:'09:00' });
assert.equal(scheduledWait.kind,'wait','a clock-qualified wait must still be recognized as committed waiting');
assert.equal(scheduledWait.scheduledStartOffsetMinutes,60);
assert.deepEqual(scheduledWait.suggestedAdvanceMinutes,[70,120],'scheduled waiting must include its start offset plus the ordinary wait range');

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
const scheduledTravel=classifySceneIntent('10시에 도서관으로 간다.', { location:'A동 개인실',currentTime:'09:00' });
assert.equal(scheduledTravel.semanticTarget,'도서관','a scheduled-start clock must not pollute the travel destination');
assert.equal(scheduledTravel.scheduledStartOffsetMinutes,60,'scheduled travel must retain the wait until departure');
assert.deepEqual(scheduledTravel.suggestedAdvanceMinutes,[65,80],'scheduled travel must add the departure offset to the natural travel range');
const destinationFirstScheduledTravel=classifySceneIntent('도서관으로 10시에 간다.', { location:'A동 개인실',currentTime:'09:00' });
assert.equal(destinationFirstScheduledTravel.semanticTarget,'도서관','a trailing scheduled-start clock must not leave either the clock or destination particle in the target');
assert.deepEqual(destinationFirstScheduledTravel.suggestedAdvanceMinutes,[65,80],'travel timing must not depend on whether the destination or clock is stated first');
const nextDayTravel=classifySceneIntent('내일 10시에 도서관으로 간다.', { location:'A동 개인실',currentTime:'09:00' });
assert.equal(nextDayTravel.semanticTarget,'도서관','a future date qualifier must not pollute the travel destination');
assert.equal(nextDayTravel.compression,false,'next-day travel must not inherit a same-day deterministic travel floor');
const intervalTravel=classifySceneIntent('10시부터 11시까지 도서관으로 간다.', { location:'A동 개인실',currentTime:'09:00' });
assert.equal(intervalTravel.semanticTarget,'도서관','a clock interval must not pollute the travel destination');
assert.deepEqual(intervalTravel.suggestedAdvanceMinutes,[120,120],'a travel clock interval must end at the explicit requested clock');

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
assert.match(fs.readFileSync(new URL('../../api/lib/context-router.js', import.meta.url), 'utf8'), /boundaryLookahead>0\?activityRangeLimitMinutes\(sceneIntent\):0/, 'compressed timed and bounded future-date activities must expose their full valid consequence lookahead');
assert.match(health, /version:\s*'0\.8\.7'/);
assert.match(repositoryRules, /External API adapter:\s*`0\.8\.7`/, 'the authoritative release manifest must match the adapter and health surface');
assert.match(health, /adaptiveTimeScale:\s*'V2/);
assert.equal((router.match(/coreHandler\(/g) || []).length, 1, 'Adaptive Time Scale V2 must preserve one canonical core model call');

console.log('PASS Adaptive Time Scale V2 action profiles, explicit durations, travel distance, schedule priority, freeze, health, and one-call regressions');
