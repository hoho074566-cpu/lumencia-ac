import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deliverDiscord,
  evaluateChecks,
  evaluateCodex,
  evaluateReadiness,
  parseCodexSeverities,
  parseMachineState,
  plannedNotifications,
  renderComment,
} from '../lumensia-merge-readiness.mjs';

const HEAD = 'new-head-sha';
const codex = (state = 'PASS', extra = {}) => ({ state, P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0, ...extra });
const checks = (extra = {}) => ({ safety: 'PASS', vercel: 'PASS', required: 'PASS', ...extra });
const review = (commit_id, body = 'No findings.') => ({ commit_id, body, submitted_at: '2026-01-01T00:00:00Z', user: { login: 'codex-bot' } });
const comment = (commit_id, body) => ({ commit_id, body, user: { login: 'codex-bot' } });
const readyInput = (extra = {}) => ({ codex: codex(), checks: checks(), mergeable: true, mergeableState: 'clean', ...extra });

test('old P1 plus current clean review ignores the previous SHA', () => {
  const result = evaluateCodex({ head: HEAD, reviews: [review('old'), review(HEAD)], comments: [comment('old', 'P1: stale')] });
  assert.equal(result.state, 'PASS'); assert.equal(result.P1, 0);
});

test('current-head P1 blocks', () => {
  const result = evaluateCodex({ head: HEAD, reviews: [review(HEAD, 'P1: fix this')] });
  assert.equal(result.state, 'BLOCK'); assert.equal(result.P1, 1);
  assert.equal(evaluateReadiness({ ...readyInput(), codex: result }).state, 'BLOCKED');
});

test('P2 and P3 are non-blocking', () => {
  const result = evaluateCodex({ head: HEAD, reviews: [review(HEAD, '### P2 - suggestion\n- P3: polish')] });
  assert.equal(result.state, 'PASS'); assert.deepEqual([result.P2, result.P3], [1, 1]);
});

test('new head without a current review waits', () => {
  const result = evaluateCodex({ head: HEAD, reviews: [review('old')] });
  assert.equal(result.state, 'PENDING');
  assert.equal(evaluateReadiness({ ...readyInput(), codex: result }).state, 'WAITING');
});

test('clean current review passes', () => assert.equal(evaluateCodex({ head: HEAD, reviews: [review(HEAD)] }).state, 'PASS'));

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
  const second = plannedNotifications(first.state, current);
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
  const result = evaluateCodex({ head: HEAD, reviews: [review(HEAD, 'Finding: investigate this')] });
  assert.equal(result.unknown, 1); assert.equal(result.state, 'PASS');
});

test('quoted and previous-commit severity text is ignored', () => {
  assert.equal(parseCodexSeverities('> P1: quoted example\nNormal prose mentions P1 in passing.').P1, 0);
  assert.equal(evaluateCodex({ head: HEAD, reviews: [review(HEAD)], comments: [comment('old', 'P0: outdated')] }).P0, 0);
});

test('safety and Vercel are detected from current repository check names', () => {
  const result = evaluateChecks({ head: HEAD, checkRuns: [
    { name: 'Repository checks', head_sha: HEAD, conclusion: 'success' },
    { name: 'Vercel Preview Comments', head_sha: HEAD, conclusion: 'success', app: { name: 'Vercel' } },
  ], statuses: [] });
  assert.deepEqual(result, { safety: 'PASS', vercel: 'PASS', required: 'PASS' });
});

test('malformed hidden state is rebuilt safely', () => assert.deepEqual(parseMachineState('lumensia-readiness-state: {broken} -->', HEAD), { head: HEAD }));
