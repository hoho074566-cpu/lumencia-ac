import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  deliverDiscord,
  evaluateChecks,
  evaluateCodex,
  evaluateReadiness,
  hydratePulls,
  isOpenPull,
  newestAttempts,
  parseCodexSeverities,
  parseMachineState,
  plannedNotifications,
  recordDeliveredNotification,
  reusableReadinessCheck,
  renderComment,
  renderCheckSummary,
} from '../lumensia-merge-readiness.mjs';

const HEAD = 'new-head-sha';
const ACTORS = 'trusted-codex[bot]';
const codex = (state = 'PASS', extra = {}) => ({ state, P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0, ...extra });
const checks = (extra = {}) => ({ safety: 'PASS', vercel: 'PASS', required: 'PASS', ...extra });
const review = (commit_id, body = 'No findings.', extra = {}) => ({ id: 1, commit_id, body, state: 'COMMENTED', submitted_at: '2026-01-01T00:00:00Z', user: { login: 'trusted-codex[bot]' }, ...extra });
const comment = (commit_id, body, extra = {}) => ({ commit_id, body, user: { login: 'trusted-codex[bot]' }, ...extra });
const evaluateReview = (input) => evaluateCodex({ configuredActors: ACTORS, ...input });
const readyInput = (extra = {}) => ({ codex: codex(), checks: checks(), mergeable: true, mergeableState: 'clean', ...extra });

test('old P1 plus current clean review ignores the previous SHA', () => {
  const result = evaluateReview({ head: HEAD, reviews: [review('old'), review(HEAD)], comments: [comment('old', 'P1: stale')] });
  assert.equal(result.state, 'PASS'); assert.equal(result.P1, 0);
});

test('current-head P1 blocks', () => {
  const result = evaluateReview({ head: HEAD, reviews: [review(HEAD, 'P1: fix this')] });
  assert.equal(result.state, 'BLOCK'); assert.equal(result.P1, 1);
  assert.equal(evaluateReadiness({ ...readyInput(), codex: result }).state, 'BLOCKED');
});

test('P2 and P3 are non-blocking', () => {
  const result = evaluateReview({ head: HEAD, reviews: [review(HEAD, '### P2 - suggestion\n- P3: polish')] });
  assert.equal(result.state, 'PASS'); assert.deepEqual([result.P2, result.P3], [1, 1]);
});

test('new head without a current review waits', () => {
  const result = evaluateReview({ head: HEAD, reviews: [review('old')] });
  assert.equal(result.state, 'PENDING');
  assert.equal(evaluateReadiness({ ...readyInput(), codex: result }).state, 'WAITING');
});

test('clean current review passes', () => assert.equal(evaluateReview({ head: HEAD, reviews: [review(HEAD)] }).state, 'PASS'));

test('old Vercel success cannot satisfy a new head', () => {
  const result = evaluateChecks({ head: HEAD, checkRuns: [{ name: 'Vercel', head_sha: 'old', conclusion: 'success' }, { name: 'Vercel', head_sha: HEAD, conclusion: null }], statuses: [] });
  assert.equal(result.vercel, 'PENDING');
});

test('Vercel failure blocks', () => {
  const result = evaluateReadiness({ ...readyInput(), checks: checks({ vercel: 'FAIL' }) });
  assert.equal(result.state, 'BLOCKED');
});

test('Safety Gate failure blocks', () => {
  const result = evaluateReadiness({ ...readyInput(), checks: checks({ safety: 'FAIL' }) });
  assert.equal(result.state, 'BLOCKED');
});

test('unknown mergeability waits', () => assert.equal(evaluateReadiness({ ...readyInput(), mergeable: null }).state, 'WAITING'));
test('merge conflict blocks', () => assert.equal(evaluateReadiness({ ...readyInput(), mergeable: false, mergeableState: 'dirty' }).state, 'BLOCKED'));
test('all required signals passing is ready', () => assert.equal(evaluateReadiness(readyInput()).state, 'READY'));

test('same state and head does not duplicate Discord', () => {
  const current = { head: HEAD, codex: codex(), checks: checks(), readiness: { state: 'READY' } };
  const first = plannedNotifications({ head: HEAD }, current);
  let delivered = first.state;
  for (const event of first.events) delivered = recordDeliveredNotification(delivered, event, current);
  const second = plannedNotifications(delivered, current);
  assert.deepEqual(first.events, ['codex', 'vercel', 'ready']); assert.deepEqual(second.events, []);
});

test('new head resets notification state', () => {
  const current = { head: HEAD, codex: codex(), checks: checks(), readiness: { state: 'READY' } };
  assert.deepEqual(plannedNotifications({ head: 'old', codexNotified: 'pass', readyNotified: true }, current).events, ['codex', 'vercel', 'ready']);
});

test('sticky marker is stable and machine state is recoverable', () => {
  const result = { head: HEAD, codex: codex(), checks: checks(), readiness: { state: 'READY', conflict: 'NONE' } };
  const body = renderComment(result, { head: HEAD, readyNotified: true });
  assert.equal((body.match(/<!-- lumensia-merge-readiness:v1 -->/g) || []).length, 1);
  assert.equal(parseMachineState(body, HEAD).readyNotified, true);
});

test('missing webhook warns without failing readiness', async () => {
  const warnings = [];
  const result = await deliverDiscord('', 'message', undefined, { warn: (value) => warnings.push(value) });
  assert.deepEqual(result, { delivered: false, reason: 'missing' }); assert.equal(warnings.length, 1);
});

test('webhook failure is sanitized', async () => {
  const secret = 'https://discord.invalid/a-secret-value'; const warnings = [];
  const result = await deliverDiscord(secret, 'message', async () => ({ ok: false, status: 503 }), { warn: (value) => warnings.push(value) });
  assert.equal(result.delivered, false); assert.equal(warnings.join(' ').includes(secret), false); assert.match(warnings[0], /503/);
});

test('unparseable Codex finding warns without crashing or blocking', () => {
  assert.equal(parseCodexSeverities('Finding: investigate this').unknown, 1);
  const result = evaluateReview({ head: HEAD, reviews: [review(HEAD, 'Finding: investigate this')] });
  assert.equal(result.unknown, 1); assert.equal(result.state, 'PASS');
});

test('quoted and previous-commit severity text is ignored', () => {
  assert.equal(parseCodexSeverities('> P1: quoted example\nNormal prose mentions P1 in passing.').P1, 0);
  assert.equal(evaluateReview({ head: HEAD, reviews: [review(HEAD)], comments: [comment('old', 'P0: outdated')] }).P0, 0);
});

test('safety and Vercel are detected from current repository check names', () => {
  const result = evaluateChecks({ head: HEAD, checkRuns: [
    { name: 'Repository checks', head_sha: HEAD, conclusion: 'success' },
    { name: 'Vercel Preview Comments', head_sha: HEAD, conclusion: 'success', app: { name: 'Vercel' } },
  ], statuses: [] });
  assert.deepEqual(result, { safety: 'PASS', vercel: 'PASS', required: 'PASS' });
});

test('malformed hidden state is rebuilt safely', () => assert.deepEqual(parseMachineState('lumensia-readiness-state: {broken} -->', HEAD), { head: HEAD }));

test('only an exact configured Codex actor can complete review', () => {
  const impostor = review(HEAD, 'No findings.', { user: { login: 'helpful-codex-reviewer' } });
  assert.equal(evaluateReview({ head: HEAD, reviews: [impostor] }).state, 'PENDING');
  assert.equal(evaluateReview({ head: HEAD, reviews: [review(HEAD)] }).state, 'PASS');
});

test('notification flags persist only after successful delivery', async () => {
  const current = { head: HEAD, codex: codex(), checks: checks(), readiness: { state: 'READY' } };
  const planned = plannedNotifications({ head: HEAD }, current);
  const silent = { warn() {} };
  const missing = await deliverDiscord('', 'ready', undefined, silent);
  const failed = await deliverDiscord('secret', 'ready', async () => ({ ok: false, status: 503 }), silent);
  assert.equal(missing.delivered, false); assert.equal(failed.delivered, false);
  assert.deepEqual(plannedNotifications(planned.state, current).events, planned.events);
  const succeeded = await deliverDiscord('secret', 'ready', async () => ({ ok: true }), silent);
  assert.equal(succeeded.delivered, true);
  const delivered = recordDeliveredNotification(planned.state, 'ready', current);
  assert.equal(plannedNotifications(delivered, current).events.includes('ready'), false);
});

test('unrelated failed check-run is not treated as required', () => {
  const result = evaluateChecks({ head: HEAD, checkRuns: [
    { name: 'Repository checks', head_sha: HEAD, conclusion: 'success' },
    { name: 'Optional screenshot job', head_sha: HEAD, conclusion: 'failure' },
  ] });
  assert.equal(result.required, 'PASS');
  assert.equal(evaluateChecks({ head: HEAD, checkRuns: [{ name: 'Lint', head_sha: HEAD, conclusion: 'failure' }], requiredCheckNames: ['Lint'] }).required, 'FAIL');
});

test('dismissed Codex review and its comments are excluded', () => {
  const dismissed = review(HEAD, 'P1: dismissed', { id: 42, state: 'DISMISSED' });
  const result = evaluateReview({ head: HEAD, reviews: [dismissed, review(HEAD)], comments: [comment(HEAD, 'P1: dismissed comment', { pull_request_review_id: 42 })] });
  assert.equal(result.state, 'PASS'); assert.equal(result.P1, 0);
});

test('custom check summary retains visible readiness content', () => {
  const body = renderComment({ head: HEAD, codex: codex(), checks: checks(), readiness: { state: 'READY', conflict: 'NONE' } }, { head: HEAD });
  const summary = renderCheckSummary(body);
  assert.match(summary, /Lumensia Merge Readiness/); assert.match(summary, /READY TO MERGE/); assert.doesNotMatch(summary, /readiness-state/);
});

test('draft PR remains waiting and never plans ready notification', () => {
  const readiness = evaluateReadiness({ ...readyInput(), draft: true });
  assert.equal(readiness.state, 'WAITING');
  const current = { head: HEAD, codex: codex(), checks: checks(), readiness };
  assert.equal(plannedNotifications({ head: HEAD }, current).events.includes('ready'), false);
});

test('Codex badge-formatted inline P0/P1 findings block current head', () => {
  const body = '**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)</sub></sub> Fix the unsafe transition**';
  assert.equal(parseCodexSeverities(body).P1, 1);
  const result = evaluateReview({ head: HEAD, reviews: [review(HEAD)], comments: [comment(HEAD, body)] });
  assert.equal(result.P1, 1); assert.equal(result.state, 'BLOCK');
});

test('same-head Codex and Vercel state transitions notify once per new state', () => {
  const blocked = { head: HEAD, codex: codex('BLOCK', { P1: 1 }), checks: checks({ vercel: 'FAIL' }), readiness: { state: 'BLOCKED' } };
  const blockedPlan = plannedNotifications({ head: HEAD }, blocked);
  let state = blockedPlan.state;
  for (const event of blockedPlan.events) state = recordDeliveredNotification(state, event, blocked);
  const passing = { head: HEAD, codex: codex('PASS'), checks: checks({ vercel: 'PASS' }), readiness: { state: 'READY' } };
  const transitioned = plannedNotifications(state, passing);
  assert.deepEqual(transitioned.events, ['codex', 'vercel', 'ready']);
  state = transitioned.state;
  for (const event of transitioned.events) state = recordDeliveredNotification(state, event, passing);
  assert.deepEqual(plannedNotifications(state, passing).events, []);
});

test('scan and event evaluations share the same per-PR concurrency group', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/lumensia-merge-readiness.yml', import.meta.url), 'utf8');
  assert.match(workflow, /group: lumensia-readiness-pr-\$\{\{ matrix\.pr \}\}/);
  assert.match(workflow, /group: lumensia-readiness-pr-\$\{\{ github\.event\.pull_request\.number \|\| github\.event\.check_run\.pull_requests\[0\]\.number \}\}/);
  assert.equal((workflow.match(/cancel-in-progress: false/g) || []).length, 2);
  assert.match(workflow, /PR_NUMBER: \$\{\{ matrix\.pr \}\}/);
});

test('GitHub mergeable_state blocked cannot become ready', () => {
  assert.equal(evaluateReadiness({ ...readyInput(), mergeableState: 'blocked' }).state, 'WAITING');
});

test('all-open reconciliation hydrates every abbreviated pull', async () => {
  const requested = [];
  const pulls = await hydratePulls([{ number: 14 }, { number: 15 }], async (number) => {
    requested.push(number);
    return { number, mergeable: true, mergeable_state: number === 14 ? 'clean' : 'behind' };
  });
  assert.deepEqual(requested, [14, 15]);
  assert.deepEqual(pulls.map((pull) => pull.mergeable_state), ['clean', 'behind']);
});

test('GitHub mergeable_state behind cannot become ready', () => {
  assert.equal(evaluateReadiness({ ...readyInput(), mergeableState: 'behind' }).state, 'WAITING');
});

test('WAITING resets terminal readiness transition dedupe', () => {
  const result = (state) => ({ head: HEAD, codex: codex(), checks: checks(), readiness: { state } });
  let machine = { head: HEAD };
  const deliver = (current) => {
    const planned = plannedNotifications(machine, current);
    machine = planned.state;
    for (const event of planned.events.filter((event) => event === 'blocked' || event === 'ready')) {
      machine = recordDeliveredNotification(machine, event, current);
    }
    return planned.events;
  };
  assert.equal(deliver(result('BLOCKED')).includes('blocked'), true);
  assert.equal(deliver(result('BLOCKED')).includes('blocked'), false);
  deliver(result('WAITING'));
  assert.equal(deliver(result('BLOCKED')).includes('blocked'), true);
  assert.equal(deliver(result('READY')).includes('ready'), true);
  assert.equal(deliver(result('READY')).includes('ready'), false);
  deliver(result('WAITING'));
  assert.equal(deliver(result('READY')).includes('ready'), true);
});

test('Codex severity parser ignores entire fenced code blocks', () => {
  const body = '```markdown\nP0: example only\n![P1 Badge](https://img.shields.io/badge/P1-orange)\n```\nP2: real suggestion\n~~~\nP3: another example\n~~~';
  assert.deepEqual(parseCodexSeverities(body), { P0: 0, P1: 0, P2: 1, P3: 0, unknown: 0 });
});

test('Safety Gate and Vercel pass only on actual success conclusions', () => {
  for (const conclusion of ['neutral', 'skipped']) {
    const result = evaluateChecks({ head: HEAD, checkRuns: [
      { name: 'Repository checks', head_sha: HEAD, conclusion },
      { name: 'Vercel', head_sha: HEAD, conclusion },
    ] });
    assert.equal(result.safety, 'PENDING');
    assert.equal(result.vercel, 'PENDING');
    assert.equal(evaluateReadiness({ ...readyInput(), checks: result }).state, 'WAITING');
  }
  const cancelled = evaluateChecks({ head: HEAD, checkRuns: [
    { name: 'Repository checks', head_sha: HEAD, conclusion: 'cancelled' },
    { name: 'Vercel', head_sha: HEAD, conclusion: 'cancelled' },
  ] });
  assert.equal(cancelled.safety, 'FAIL'); assert.equal(cancelled.vercel, 'FAIL');
  assert.equal(evaluateReadiness({ ...readyInput(), checks: cancelled }).state, 'BLOCKED');
});

test('Safety Gate and Vercel use only the newest logical check attempt', () => {
  const app = { id: 7, name: 'GitHub Actions' };
  const old = { head_sha: HEAD, conclusion: 'failure', completed_at: '2026-01-01T00:00:00Z', app };
  const latest = { head_sha: HEAD, conclusion: 'success', completed_at: '2026-01-01T00:01:00Z', app };
  const result = evaluateChecks({ head: HEAD, checkRuns: [
    { ...old, id: 1, name: 'Repository checks' },
    { ...latest, id: 2, name: 'Repository checks' },
    { ...old, id: 3, name: 'Vercel', app: { id: 8, name: 'Vercel' } },
    { ...latest, id: 4, name: 'Vercel', app: { id: 8, name: 'Vercel' } },
  ] });
  assert.equal(result.safety, 'PASS'); assert.equal(result.vercel, 'PASS');
  assert.equal(newestAttempts([{ id: 1 }, { id: 2 }], () => 'same')[0].id, 2);
});

test('completed readiness check is recreated when state returns to waiting', () => {
  const completed = { id: 99, status: 'completed', conclusion: 'success' };
  assert.equal(reusableReadinessCheck(completed, 'WAITING'), undefined);
  assert.equal(reusableReadinessCheck(completed, 'READY'), completed);
  const active = { id: 100, status: 'in_progress', conclusion: null };
  assert.equal(reusableReadinessCheck(active, 'WAITING'), active);
});

test('zero-open-PR discovery is a successful matrix no-op', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/lumensia-merge-readiness.yml', import.meta.url), 'utf8');
  assert.match(workflow, /has_pulls: \$\{\{ steps\.list\.outputs\.has_pulls \}\}/);
  assert.match(workflow, /needs\.discover\.outputs\.has_pulls == 'true'/);
  assert.match(workflow, /pulls\.data\.length > 0 \? 'true' : 'false'/);
});

test('closed or merged pulls are skipped before evaluation', () => {
  assert.equal(isOpenPull({ state: 'open', merged_at: null }), true);
  assert.equal(isOpenPull({ state: 'closed', merged_at: null }), false);
  assert.equal(isOpenPull({ state: 'closed', merged_at: '2026-01-01T00:00:00Z' }), false);
  assert.equal(isOpenPull({ state: 'open', merged: true, merged_at: '2026-01-01T00:00:00Z' }), false);
});
