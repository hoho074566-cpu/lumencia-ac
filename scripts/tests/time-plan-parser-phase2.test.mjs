import assert from 'node:assert/strict';
import { buildSceneMomentumDirective, classifySceneIntent } from '../../lib/scene-momentum.js';
import { deriveStructuredTimingCandidate, parseTimePlan } from '../../lib/time-plan-parser.js';

const context = { currentDate: '1285-03-05', currentTime: '09:00', currentWeekday: '수요일', actorName: '카인', location: '훈련장' };

const elapsed = classifySceneIntent('어제 오전 10시에 1시간 훈련한다', context);
assert.equal(elapsed.kind, 'decision-sensitive', 'a committed action with an elapsed relative-date start must fail closed');
assert.equal(elapsed.elapsedScheduledStart, true, 'the structured elapsed start is exposed to reconciliation');
assert.deepEqual(elapsed.suggestedAdvanceMinutes, [0, 0], 'an impossible past start cannot advance authoritative time');
assert.deepEqual(elapsed.structuredTimePlanApplied, ['relative-date-start'], 'elapsed migration records structured provenance');

const future = classifySceneIntent('3일 후 오전 10시에 1시간 훈련한다', context);
assert.equal(future.kind, 'training', 'relative day plus clock remains a committed training action');
assert.equal(future.dateQualifiedStart, true, 'a multi-day relative start is represented as date-qualified');
assert.equal(future.dateQualifiedStartOffsetMinutes, 4380, 'the relative date and requested clock are composed before execution');
assert.equal(future.turnLimitTruncated, true, 'a start beyond the one-turn cap remains resumable rather than executing early');
assert.ok(future.structuredTimePlanApplied.includes('relative-date-start'), 'future start migration records structured provenance');
const missingClockContext = deriveStructuredTimingCandidate(parseTimePlan('3일 후 오전 10시에 1시간 훈련한다', { ...context, currentTime: '' }));
assert.equal(missingClockContext.relative_date_start_offset_minutes, null, 'date-plus-clock execution requires an authoritative current clock');
for (const [calendarAction, expectedOffset] of [['다음주 금요일에 1시간 훈련한다', 12960], ['한 달 후 1시간 훈련한다', 44640]]) {
  const calendar = classifySceneIntent(calendarAction, context);
  assert.ok(!calendar.structuredTimePlanApplied?.includes('relative-date-start'), 'calendar-aware offsets stay on the established calendar path');
  assert.equal(calendar.dateQualifiedStartOffsetMinutes, expectedOffset, 'calendar-aware fallback preserves the authoritative legacy offset');
}
const droppedColonPeriod = classifySceneIntent('내일 오후 3:00에 1시간 훈련한다', context);
assert.equal(droppedColonPeriod.dateQualifiedStartOffsetMinutes, 1800, 'a colon clock with a separate period marker falls back to the established normalized clock');
assert.ok(!droppedColonPeriod.structuredTimePlanApplied.includes('relative-date-start'), 'a partially parsed period marker cannot enter structured execution');

const inheritedDate = classifySceneIntent('내일 9시에 아침을 먹고 10시에 수업을 듣는다.', { ...context, currentTime: '08:00', location: '여관' });
assert.equal(inheritedDate.scheduledStartOffsetMinutes, null, 'a date qualifier owned by an earlier clause cannot promote the terminal clock onto today');
assert.ok(!inheritedDate.structuredTimePlanApplied.includes('relative-date-start'), 'a clock-only terminal clause stays on the legacy fallback path');
const partialClock = classifySceneIntent('오늘 오후 3시 반에 수업을 듣는다.', { ...context, currentTime: '14:00', location: '강의실' });
assert.equal(partialClock.scheduledStartOffsetMinutes, 90, 'an unsupported partial structured clock must fall back to the established clock parser');
assert.ok(!partialClock.structuredTimePlanApplied.includes('relative-date-start'), 'partial structured clocks cannot enter execution');
const sameDaySleep = classifySceneIntent('오늘 오후 11시에 잠을 잔다.', { ...context, currentTime: '00:00', location: '개인실' });
assert.deepEqual(sameDaySleep.suggestedAdvanceMinutes, [1440, 1440], 'a same-day clock stays in the legacy start-plus-duration cap calculation');
assert.ok(!sameDaySleep.structuredTimePlanApplied.includes('relative-date-start'), 'same-day clock offsets are not future-date migration candidates');
const ambiguousNight = classifySceneIntent('내일 밤 1시에 잠을 잔다.', { ...context, currentTime: '23:00', location: '기숙사' });
assert.equal(ambiguousNight.scheduledStartOffsetMinutes, 120, 'an ambiguous early-night clock stays on the established overnight parser');
assert.ok(!ambiguousNight.structuredTimePlanApplied.includes('relative-date-start'), 'ambiguous night and dawn periods cannot enter structured execution before normalization migrates');
const separateSentence = classifySceneIntent('내일. 지금 30분 동안 기다린다.', { ...context, currentTime: '09:00', location: '광장' });
assert.equal(separateSentence.dateQualifiedStart, false, 'a date in a completed sentence cannot qualify the following action clause');
assert.deepEqual(separateSentence.suggestedAdvanceMinutes, [30, 30], 'the following immediate wait retains its own duration');
const fractionalDay = classifySceneIntent('0.5일 후 1시간 훈련한다', context);
assert.equal(fractionalDay.dateQualifiedStartOffsetMinutes, 720, 'a decimal point inside a number is not a sentence boundary');
assert.deepEqual(fractionalDay.suggestedAdvanceMinutes, [780, 780], 'a fractional fixed-day start preserves its exact offset and activity duration');
for (const embeddedDate of ['어제처럼 1시간 훈련한다', '내일성에서 1시간 훈련한다']) {
  const embedded = classifySceneIntent(embeddedDate, context);
  assert.equal(embedded.kind, 'training', `${embeddedDate}: embedded date text remains an immediate training action`);
  assert.equal(embedded.dateQualifiedStart, false, `${embeddedDate}: a date name must have a supported token or particle boundary`);
  assert.deepEqual(embedded.suggestedAdvanceMinutes, [60, 60], `${embeddedDate}: embedded date text cannot delay or reject the action`);
  assert.ok(!embedded.structuredTimePlanApplied.includes('relative-date-start'), `${embeddedDate}: embedded date text cannot enter structured date execution`);
}
const dateParticle = classifySceneIntent('내일은 1시간 훈련한다', context);
assert.equal(dateParticle.dateQualifiedStartOffsetMinutes, 1440, 'a supported topic particle preserves a standalone named date');
assert.ok(dateParticle.structuredTimePlanApplied.includes('relative-date-start'), 'a bounded date particle remains eligible for structured date execution');
const structuredSleep = classifySceneIntent('잠을 자자', { ...context, location: '개인실' });
assert.equal(structuredSleep.kind, 'downtime', 'a committed structured sleep remains downtime');
assert.equal(structuredSleep.timeProfile, 'sleep', 'the structured sleep subtype survives execution classification');
assert.deepEqual(structuredSleep.suggestedAdvanceMinutes, [240, 480], 'structured sleep uses the sleep range rather than the short-rest range');
assert.ok(structuredSleep.structuredTimePlanApplied.includes('sleep-subtype'), 'sleep subtype migration records structured provenance');

const propositive = classifySceneIntent('1시간 훈련하자', context);
assert.equal(propositive.kind, 'training', 'a propositive committed training action is no longer generic');
assert.equal(propositive.explicitDurationMinutes, 60, 'legacy duration execution consumes the promoted structured action type');
assert.deepEqual(propositive.suggestedAdvanceMinutes, [60, 60], 'the explicit training duration remains exact');
assert.ok(propositive.structuredTimePlanApplied.includes('terminal-action'), 'terminal action migration records structured provenance');

const compoundAction = '왕도로 가서 1시간 훈련한다';
const compound = classifySceneIntent(compoundAction, { ...context, location: 'A동 기숙사 개인실' });
assert.equal(compound.kind, 'training', 'the terminal action remains training');
assert.deepEqual(compound.precedingActivityRangeMinutes, [15, 60], 'the regional travel prefix keeps its destination-aware range');
assert.deepEqual(compound.suggestedAdvanceMinutes, [75, 120], 'compound timing sums regional travel and exact training');
assert.ok(compound.structuredTimePlanApplied.includes('regional-travel-prefix'), 'compound migration records structured provenance');
const boundarySave = { pc: { name: '카인' }, world: { date: '1285-03-05', time: '09:00', location: 'A동 기숙사 개인실' }, scheduleContext: { due: [], upcoming: [{ id: 'required-meeting', title: '필수 면담', date: '1285-03-05', time: '10:10', pc_required: true }] } };
assert.match(buildSceneMomentumDirective({ action: compoundAction, saveState: boundarySave }), /SCHEDULE_BOUNDARY=70min/, 'an intervening required schedule is visible inside the structured compound range');
for (const delayedPrefix of ['내일 왕도로 가서 1시간 훈련한다', '30분 후 왕도로 가서 1시간 훈련한다']) {
  const delayed = classifySceneIntent(delayedPrefix, { ...context, location: '기숙사' });
  assert.ok(!delayed.structuredTimePlanApplied?.includes('regional-travel-prefix'), 'a delayed travel prefix must stay on the legacy calculation path');
}

const quotedCandidate = deriveStructuredTimingCandidate(parseTimePlan('「어제 오전 10시에 1시간 훈련한다」고 말했다', context));
assert.equal(quotedCandidate.eligible, false, 'quoted relative-date actions cannot enter structured execution');
const uncertainCandidate = deriveStructuredTimingCandidate(parseTimePlan('이번에는 1시간 훈련한다', context));
assert.equal(uncertainCandidate.eligible, false, 'known actor ambiguity falls back to legacy execution');
assert.equal(classifySceneIntent('이번에는 1시간 훈련한다', context).kind, 'training', 'legacy fallback preserves an existing valid committed action');
for (const negatedAction of ['나는 안 기다린다.', '못 기다린다.']) {
  const negatedPlan = parseTimePlan(negatedAction, context), negatedCandidate = deriveStructuredTimingCandidate(negatedPlan);
  assert.equal(negatedPlan.clauses[0].negated, true, 'explicit predicate negation is represented in the structured clause');
  assert.equal(negatedCandidate.eligible, false, 'a negated action cannot enter structured execution');
  assert.equal(classifySceneIntent(negatedAction, context).kind, 'generic', 'legacy negation suppression remains authoritative');
}
assert.equal(classifySceneIntent('안 1시간 훈련하자', context).kind, 'generic', 'a separated predicate negator prevents terminal action promotion');
for (const incompleteAction of ['1시간 훈련하고', '1시간 훈련한 뒤']) {
  const incompletePlan = parseTimePlan(incompleteAction, context), incompleteCandidate = deriveStructuredTimingCandidate(incompletePlan);
  assert.equal(incompletePlan.clauses[0].incomplete_connector, true, 'a terminal connector is represented as an incomplete sequence');
  assert.equal(incompleteCandidate.eligible, false, `${incompleteAction}: an incomplete sequence cannot enter structured execution`);
  assert.equal(classifySceneIntent(incompleteAction, context).kind, 'generic', `${incompleteAction}: legacy fallback cannot double-execute the prefix`);
}
const completeSequence = parseTimePlan('1시간 훈련하고 8시간 잔다', context);
assert.equal(completeSequence.clauses[0].incomplete_connector, false, 'a connector with a parsed successor remains an ordered prefix');
assert.equal(completeSequence.clauses[0].committed, true, 'a completed prefix remains committed when its successor is present');
const conditionalPlan = parseTimePlan('준비되면 1시간 훈련하자', context);
assert.equal(conditionalPlan.clauses[0].conditional, true, 'an unresolved pre-action condition is represented in the structured clause');
assert.equal(deriveStructuredTimingCandidate(conditionalPlan).eligible, false, 'a conditional proposal cannot enter structured execution');
assert.equal(classifySceneIntent('준비되면 1시간 훈련하자', context).kind, 'generic', 'a conditional proposal remains on the non-committed legacy path');
const ambiguousElapsed = classifySceneIntent('어제 밤 1시에 1시간 훈련한다', context);
assert.equal(ambiguousElapsed.kind, 'decision-sensitive', 'a fixed past date remains elapsed even when its clock period is gated');
assert.equal(ambiguousElapsed.elapsedScheduledStart, true, 'reliable past-date ownership survives uncertain clock normalization');
assert.deepEqual(ambiguousElapsed.suggestedAdvanceMinutes, [0, 0], 'an elapsed fixed-date action cannot be rescheduled as a future clock action');
const daytimeClock = classifySceneIntent('내일 낮 1시에 1시간 훈련한다', context);
assert.equal(daytimeClock.dateQualifiedStartOffsetMinutes, 1680, 'a legacy-supported daytime period is normalized before structured execution');
assert.deepEqual(daytimeClock.suggestedAdvanceMinutes, [0, 1440], 'a daytime start beyond the one-turn horizon is deferred instead of executing twelve hours early');
const whenConditional = parseTimePlan('가능할 때 1시간 훈련하자', context);
assert.equal(whenConditional.clauses[0].conditional, true, 'a 때-gated pre-action scope is represented as unresolved');
assert.equal(deriveStructuredTimingCandidate(whenConditional).eligible, false, 'a 때-gated proposal cannot enter structured execution');
assert.equal(classifySceneIntent('가능할 때 1시간 훈련하자', context).kind, 'generic', 'a 때-gated proposal remains noncommitted');
const nounSleep = parseTimePlan('투자자', context);
assert.deepEqual(nounSleep.clauses.map((clause) => clause.action_type), ['unknown'], 'a sleep verb substring inside a noun has no actionable lexical boundary');
assert.equal(deriveStructuredTimingCandidate(nounSleep).eligible, false, 'a noun suffix cannot become a structured sleep action');
assert.equal(classifySceneIntent('투자자', context).kind, 'generic', 'a noun suffix cannot advance downtime');
const deadlineProposal = parseTimePlan('내일까지 훈련하자', context);
assert.ok(deadlineProposal.clauses[0].explicit_deadline, 'the terminal deadline is represented before execution gating');
assert.equal(deriveStructuredTimingCandidate(deadlineProposal).eligible, false, 'terminal deadlines stay on fallback until deadline execution migrates');
assert.equal(classifySceneIntent('내일까지 훈련하자', context).kind, 'generic', 'an unmigrated deadline proposal cannot execute a short default session');
for (const [nonCommittedAction, expectedKind] of [
  ['어제 1시간 훈련했다. 지금 공격한다', 'committed-consequence'],
  ['1시간 훈련한다고 들었다', 'generic'],
  ['1시간 훈련했다', 'generic'],
]) {
  const plan = parseTimePlan(nonCommittedAction, context), candidate = deriveStructuredTimingCandidate(plan);
  assert.equal(candidate.eligible, false, `${nonCommittedAction}: non-committed or partially parsed terminal text cannot enter execution`);
  assert.equal(classifySceneIntent(nonCommittedAction, context).kind, expectedKind, `${nonCommittedAction}: legacy intent remains authoritative`);
}

console.log('PASS Time Plan Parser Phase 2 confidence-gated start/action/compound migration and sovereignty regressions');
