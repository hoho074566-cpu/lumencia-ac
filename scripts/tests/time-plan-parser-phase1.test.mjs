import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIME_PLAN_PARSER_VERSION, parseTimePlan, summarizeTimePlan } from '../../lib/time-plan-parser.js';
import { TIME_PLAN_PHASE1_CORPUS } from './fixtures/time-plan-parser-phase1.mjs';

for (const row of TIME_PLAN_PHASE1_CORPUS) {
  const plan = parseTimePlan(row.action, row.context);
  assert.equal(plan.version, TIME_PLAN_PARSER_VERSION, `${row.id}: parser version`);
  assert.equal(plan.mode, 'shadow', `${row.id}: Phase 1 must remain shadow-only`);
  assert.deepEqual(plan.clauses.map((clause) => clause.action_type), row.expected.types, `${row.id}: clause action order`);
  if (row.expected.actors) assert.deepEqual(plan.clauses.map((clause) => clause.actor.kind), row.expected.actors, `${row.id}: structured actors`);
  assert.deepEqual(plan.clauses.map((clause) => clause.committed), row.expected.committed, `${row.id}: commitment ownership`);
  assert.deepEqual(plan.clauses.map((clause) => clause.completion_required), row.expected.committed, `${row.id}: only committed PC actions require completion`);
  assert.deepEqual(plan.clauses.map((clause) => [clause.duration.min_minutes, clause.duration.max_minutes]), row.expected.durations, `${row.id}: duration plan`);
  if (row.expected.destinations) assert.deepEqual(plan.clauses.map((clause) => clause.destination), row.expected.destinations, `${row.id}: destinations`);
  if (row.expected.sequence) assert.deepEqual(plan.clauses.map((clause) => clause.sequence_relation), row.expected.sequence, `${row.id}: sequence relations`);
  if (row.expected.third_party) assert.deepEqual(plan.clauses.map((clause) => clause.third_party), row.expected.third_party, `${row.id}: third-party attribution`);
  if (row.expected.quoted) assert.deepEqual(plan.clauses.map((clause) => clause.quoted), row.expected.quoted, `${row.id}: quoted guard`);
  if (row.expected.hypothetical) assert.deepEqual(plan.clauses.map((clause) => clause.hypothetical), row.expected.hypothetical, `${row.id}: hypothetical guard`);
  if (row.expected.starts) {
    row.expected.starts.forEach((expected, index) => {
      for (const [key, value] of Object.entries(expected)) assert.equal(plan.clauses[index].start[key], value, `${row.id}: start.${key}`);
    });
  }
}

const sample = parseTimePlan('오전 10시에 1시간 훈련하고 8시간 잔다', { currentTime: '09:00', actorName: '카인', location: '훈련장' });
const summary = summarizeTimePlan(sample, { kind: 'downtime' });
assert.deepEqual(summary.action_types, ['training', 'sleep'], 'shadow summary preserves compound clause order without raw text');
assert.equal(summary.terminal_action_type, 'sleep', 'shadow summary exposes the terminal committed action');
assert.equal(summary.legacy_intent, 'downtime', 'shadow summary records the authoritative legacy result for comparison');
assert.equal(summary.terminal_agreement, true, 'the shadow comparison normalizes sleep/rest to the legacy downtime intent');
assert.equal('source' in summary, false, 'compact telemetry must not echo raw player input');
const longInput = parseTimePlan(`${'아주 '.repeat(1000)}1시간 훈련한다`, { currentTime: '09:00' });
assert.ok(longInput.diagnostics.includes('input-truncated'), 'shadow parsing bounds untrusted action length');
assert.deepEqual(parseTimePlan('').clauses, [], 'an empty action produces no phantom clause');
const deadlinePlan = parseTimePlan('내일 오전 10시까지 잠을 잔다', { currentTime: '09:00', currentDate: '1285-03-05' });
assert.deepEqual(deadlinePlan.clauses[0].explicit_deadline, { raw: '내일 오전 10시까지', date_offset_days: 1, absolute_date: null, clock_minutes: 600 }, 'a deadline is separated from action start timing');
assert.equal(deadlinePlan.clauses[0].start.relation, 'immediate', 'deadline timing must not become a delayed action start');
assert.doesNotThrow(() => parseTimePlan('A[1]가 1시간 훈련한다', { actorName: 'A[1]', currentTime: '09:00' }), 'escaped saved actor names cannot break shadow parsing');

const router = readFileSync(new URL('../../api/chat-router.js', import.meta.url), 'utf8');
const health = readFileSync(new URL('../../api/health.js', import.meta.url), 'utf8');
assert.match(router, /parseTimePlan/);
assert.match(router, /summarizeTimePlan/);
assert.match(router, /time_plan_parser_v1:true/);
assert.match(router, /sceneIntent=applySceneMomentumTimeFloor\([\s\S]*?let timePlan;try\{timePlan=parseTimePlan/, 'the authoritative legacy time-floor result is computed before shadow parsing');
assert.doesNotMatch(router, /applySceneMomentumTimeFloor\([^;]*timePlan/, 'the shadow plan must not feed schedule, consequence, or time-floor execution');
assert.match(router, /catch\{timePlan=\{version:TIME_PLAN_PARSER_VERSION,mode:'shadow',clauses:\[\],diagnostics:\['shadow-parser-error'\]\}/, 'shadow parser failure must degrade to telemetry instead of failing the turn');
assert.match(health, /timePlanParser:/);
assert.equal((router.match(/coreHandler\(/g) || []).length, 1, 'TPP Phase 1 preserves one canonical core/model call');

console.log('PASS Time Plan Parser Phase 1 structured shadow plan, regression corpus, telemetry, and one-call invariants');
