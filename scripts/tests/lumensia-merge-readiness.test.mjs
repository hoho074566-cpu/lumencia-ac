import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyCheckRunTransition,
  deliverDiscord,
  evaluateChecks,
  evaluateCodex,
  planCodexReviewCycle,
  codexReviewRequestMarker,
  baselineCodexReviewCycle,
  ensureCodexReviewRequest,
  evaluateReadiness,
  findReadinessCheck,
  hydratePulls,
  isCurrentPull,
  isAuthoritativeVercelSignal,
  isOpenPull,
  newestAttempts,
  parseCodexSeverities,
  parseMachineState,
  partitionNotifications,
  plannedNotifications,
  recordDeliveredNotification,
  readinessCheckIdentity,
  readinessCheckName,
  reusableReadinessCheck,
  renderComment,
  renderCheckSummary,
  safetyMatchesPull,
  shouldRequestCodexReview,
} from '../lumensia-merge-readiness.mjs';

const HEAD = 'new-head-sha';
const ACTORS = 'trusted-codex[bot]';
const codex = (state = 'PASS', extra = {}) => ({ state, P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0, ...extra });
const checks = (extra = {}) => ({ safety: 'PASS', vercel: 'PASS', required: 'PASS', ...extra });
const review = (commit_id, body = 'No findings.', extra = {}) => ({ id: 1, commit_id, body, state: 'COMMENTED', submitted_at: '2026-01-01T00:00:00Z', user: { login: 'trusted-codex[bot]' }, ...extra });
const reaction = (id, login = 'trusted-codex[bot]', created_at = '2026-01-01T00:01:00Z') => ({ id, content: '+1', created_at, user: { login } });
const comment = (commit_id, body, extra = {}) => ({ commit_id, body, pull_request_review_id: 1, user: { login: 'trusted-codex[bot]' }, ...extra });
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

test('HEAD A request reaction passes only through its scoped request', () => {
  const result = evaluateReview({ head: 'head-a', requestReactions: [reaction(1)] });
  assert.equal(result.state, 'PASS');
});

test('HEAD A request reaction cannot satisfy HEAD B request', () => {
  assert.equal(evaluateReview({ head: 'head-a', requestReactions: [reaction(1)] }).state, 'PASS');
  assert.equal(evaluateReview({ head: 'head-b', requestReactions: [] }).state, 'PENDING');
  assert.equal(evaluateReview({ head: 'head-b', requestReactions: [reaction(2)] }).state, 'PASS');
});

test('A to B to A transition creates a new request cycle and cannot resurrect old completion', () => {
  const a1 = { codexReviewRequest: { headSha: 'head-a', cycle: 1, commentId: 10 } };
  const a2 = planCodexReviewCycle(a1, 'head-a', '300');
  assert.deepEqual(a2, { headSha: 'head-a', cycle: 2, generationKey: 'sync-300', transitionRunId: '300' });
  assert.notEqual(codexReviewRequestMarker(15, 'head-a', 'cycle-1'), codexReviewRequestMarker(15, 'head-a', a2.generationKey));
  assert.equal(evaluateReview({ head: 'head-a', requestReactions: [] }).state, 'PENDING');
});

test('reversed synchronize runs cannot overwrite a newer generation', () => {
  const initial = { codexReviewRequest: { headSha: 'head-a', cycle: 1, commentId: 10 } };
  const newest = planCodexReviewCycle(initial, 'head-a', '300');
  const storedNewest = { codexReviewRequest: { ...newest, commentId: 12 } };
  assert.deepEqual(planCodexReviewCycle(storedNewest, 'head-a', '200'), { stale: true });
  assert.deepEqual(planCodexReviewCycle(storedNewest, 'head-a', '300'), storedNewest.codexReviewRequest);
});

test('ordinary A to B synchronize creates exactly one new cycle', () => {
  const initial = { codexReviewRequest: { headSha: 'head-a', cycle: 1, commentId: 10, transitionRunId: '100' } };
  const next = planCodexReviewCycle(initial, 'head-b', '200');
  assert.deepEqual(next, { headSha: 'head-b', cycle: 2, generationKey: 'sync-200', transitionRunId: '200' });
  assert.deepEqual(planCodexReviewCycle({ codexReviewRequest: next }, 'head-b', '200'), next);
});

test('old same-SHA cycle reaction never satisfies the later cycle', () => {
  const initial = { codexReviewRequest: { headSha: 'head-a', cycle: 1, commentId: 10 } };
  const later = planCodexReviewCycle(initial, 'head-a', '300');
  assert.equal(later.cycle, 2);
  assert.equal(evaluateReview({ head: 'head-a', requestReactions: [] }).state, 'PENDING');
});

test('same-SHA new cycle baselines old review and inline comment IDs', () => {
  const oldReview = review('head-a', 'No findings.', { id: 41 });
  const oldComment = comment('head-a', 'P1: historical', { id: 51, pull_request_review_id: 41 });
  const cycle = baselineCodexReviewCycle(planCodexReviewCycle({ codexReviewRequest: { headSha: 'head-b', cycle: 2 } }, 'head-a', '300'), [oldReview], [oldComment]);
  const result = evaluateReview({ head: 'head-a', reviews: [oldReview], comments: [oldComment], baselineReviewIds: cycle.baselineReviewIds, baselineReviewCommentIds: cycle.baselineReviewCommentIds });
  assert.equal(result.state, 'PENDING');
  assert.equal(result.P1, 0);
});

test('new review ID on repeated SHA may complete the new cycle', () => {
  const oldReview = review('head-a', 'P1: historical', { id: 41 });
  const newReview = review('head-a', 'P2: current suggestion', { id: 42 });
  const result = evaluateReview({ head: 'head-a', reviews: [oldReview, newReview], baselineReviewIds: ['41'] });
  assert.equal(result.state, 'PASS');
  assert.equal(result.P1, 0);
  assert.equal(result.P2, 1);
});

test('untrusted reaction on current HEAD request remains pending', () => {
  assert.equal(evaluateReview({ head: HEAD, requestReactions: [reaction(1, 'ordinary-user')] }).state, 'PENDING');
});

test('reaction removal before READY revalidation returns Codex to pending', () => {
  assert.equal(evaluateReview({ head: HEAD, requestReactions: [reaction(1)] }).state, 'PASS');
  const revalidated = evaluateReview({ head: HEAD, requestReactions: [] });
  assert.equal(revalidated.state, 'PENDING');
  assert.equal(evaluateReadiness({ ...readyInput(), codex: revalidated }).state, 'WAITING');
});

test('active clean review dismissal before READY returns Codex to pending', () => {
  const active = review(HEAD, 'No findings.', { id: 77 });
  assert.equal(evaluateReview({ head: HEAD, reviews: [active] }).state, 'PASS');
  const dismissed = { ...active, state: 'DISMISSED' };
  assert.equal(evaluateReview({ head: HEAD, reviews: [dismissed] }).state, 'PENDING');
});

test('current-head P1 blocks even with trusted request reaction', () => {
  const result = evaluateReview({ head: HEAD, reviews: [review(HEAD, 'P1: blocking finding')], requestReactions: [reaction(1)] });
  assert.equal(result.state, 'BLOCK');
  assert.equal(result.P1, 1);
});

test('current-head P2-only review remains non-blocking', () => {
  const result = evaluateReview({ head: HEAD, reviews: [review(HEAD, 'P2: non-blocking suggestion')], requestReactions: [reaction(1)] });
  assert.equal(result.state, 'PASS');
  assert.equal(result.P2, 1);
});

test('duplicate evaluation of the same synchronize transition reuses one request comment', async () => {
  const comments = [];
  let creates = 0;
  const transition = planCodexReviewCycle({ codexReviewRequest: { headSha: 'old', cycle: 1, transitionRunId: '100' } }, HEAD, '200');
  const duplicate = planCodexReviewCycle({ codexReviewRequest: transition }, HEAD, '200');
  assert.deepEqual(duplicate, transition);
  const args = {
    prNumber: 15,
    head: HEAD,
    generationKey: transition.generationKey,
    refreshComments: async () => comments,
    createComment: async (body) => {
      creates += 1;
      const created = { id: 99, body, user: { login: 'github-actions[bot]' } };
      comments.push(created);
      return created;
    },
  };
  const first = await ensureCodexReviewRequest({ ...args, comments });
  const second = await ensureCodexReviewRequest({ ...args, comments });
  assert.equal(creates, 1);
  assert.equal(first.id, second.id);
  assert.match(first.body, /@codex review/);
  assert.ok(first.body.includes(codexReviewRequestMarker(15, HEAD, transition.generationKey)));
});

test('draft waits without a request and ready_for_review permits one request', () => {
  assert.equal(shouldRequestCodexReview({ draft: true }), false);
  assert.equal(shouldRequestCodexReview({ draft: false }), true);
});

test('old Vercel success cannot satisfy a new head', () => {
  const app = { name: 'Vercel' };
  const result = evaluateChecks({ head: HEAD, checkRuns: [{ name: 'Vercel', head_sha: 'old', conclusion: 'success', app }, { name: 'Vercel', head_sha: HEAD, conclusion: null, app }], statuses: [] });
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
    { name: 'Vercel', head_sha: HEAD, conclusion: 'success', app: { name: 'Vercel' } },
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
      { name: 'Vercel', head_sha: HEAD, conclusion, app: { name: 'Vercel' } },
    ] });
    assert.equal(result.safety, 'PENDING');
    assert.equal(result.vercel, 'PENDING');
    assert.equal(evaluateReadiness({ ...readyInput(), checks: result }).state, 'WAITING');
  }
  const cancelled = evaluateChecks({ head: HEAD, checkRuns: [
    { name: 'Repository checks', head_sha: HEAD, conclusion: 'cancelled' },
    { name: 'Vercel', head_sha: HEAD, conclusion: 'cancelled', app: { name: 'Vercel' } },
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

test('every configured required check must have a newest current result', () => {
  const base = { head_sha: HEAD, app: { id: 5 }, completed_at: '2026-01-01T00:00:00Z' };
  const missing = evaluateChecks({ head: HEAD, requiredCheckNames: ['Lint', 'Unit'], checkRuns: [
    { ...base, id: 1, name: 'Lint', conclusion: 'success' },
  ] });
  assert.equal(missing.required, 'PENDING');
  const complete = evaluateChecks({ head: HEAD, requiredCheckNames: ['Lint', 'Unit'], checkRuns: [
    { ...base, id: 1, name: 'Lint', conclusion: 'failure' },
    { ...base, id: 2, name: 'Lint', conclusion: 'success', completed_at: '2026-01-01T00:01:00Z' },
    { ...base, id: 3, name: 'Unit', conclusion: 'success' },
  ] });
  assert.equal(complete.required, 'PASS');
});

test('Safety Gate result must match the current PR base and head', () => {
  const pull = (base) => ({ number: 14, head: { sha: HEAD }, base: { sha: base } });
  const safety = { id: 1, name: 'Repository checks', head_sha: HEAD, conclusion: 'success', completed_at: '2026-01-01T00:00:00Z', pull_requests: [pull('old-base')] };
  assert.equal(safetyMatchesPull(safety, { head: HEAD, baseSha: 'new-base', prNumber: 14 }), false);
  assert.equal(evaluateChecks({ head: HEAD, baseSha: 'new-base', prNumber: 14, checkRuns: [safety] }).safety, 'PENDING');
  const current = { ...safety, id: 2, pull_requests: [pull('new-base')] };
  assert.equal(evaluateChecks({ head: HEAD, baseSha: 'new-base', prNumber: 14, checkRuns: [safety, current] }).safety, 'PASS');
});

test('stale or closed PR snapshots abort before readiness mutations', () => {
  const snapshot = { state: 'open', head: { sha: HEAD }, base: { sha: 'base-a' } };
  assert.equal(isCurrentPull(snapshot, { ...snapshot }), true);
  assert.equal(isCurrentPull(snapshot, { ...snapshot, state: 'closed' }), false);
  assert.equal(isCurrentPull(snapshot, { ...snapshot, head: { sha: 'new-head' } }), false);
  assert.equal(isCurrentPull(snapshot, { ...snapshot, base: { sha: 'base-b' } }), false);
  const source = readFileSync(new URL('../lumensia-merge-readiness.mjs', import.meta.url), 'utf8');
  assert.ok(source.indexOf('if (!isCurrentPull(pr, currentPr))') < source.indexOf('deliverDiscord(process.env.DISCORD_WEBHOOK_URL'));
});

test('triple-backtick fenced P1 example is ignored', () => {
  assert.equal(parseCodexSeverities('```\nP1: example only\n```').P1, 0);
});

test('four-backtick fence is not closed by an inner triple-backtick fence', () => {
  const body = '````markdown\n```\nP0: nested example\n```\nP1: still an example\n````';
  assert.deepEqual(parseCodexSeverities(body), { P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 });
});

test('severity after the matching closing fence is detected normally', () => {
  const body = '````\n```\nP1: example only\n```\n````\nP1: real finding';
  assert.equal(parseCodexSeverities(body).P1, 1);
});

test('language-tagged delimiter inside a fence is content, not a close', () => {
  const body = '```markdown\n```javascript\nP1: example only\n```';
  assert.equal(parseCodexSeverities(body).P1, 0);
});

test('whitespace-only matching delimiter closes the fence', () => {
  const body = '```markdown\nP1: example only\n```   \nP2: real finding';
  const result = parseCodexSeverities(body);
  assert.equal(result.P1, 0); assert.equal(result.P2, 1);
});

test('real P1 after a valid whitespace-only closing fence is detected', () => {
  const body = '```markdown\n```javascript\nP1: example only\n```   \nP1: real finding';
  assert.equal(parseCodexSeverities(body).P1, 1);
});

test('Vercel helper checks cannot satisfy the deployment signal', () => {
  const helper = { name: 'Vercel Preview Comments', head_sha: HEAD, conclusion: 'success', app: { name: 'Vercel' } };
  assert.equal(isAuthoritativeVercelSignal(helper), false);
  assert.equal(evaluateChecks({ head: HEAD, checkRuns: [helper] }).vercel, 'NOT_PRESENT');
  const deployment = { name: 'Vercel', head_sha: HEAD, conclusion: 'success', app: { name: 'Vercel' } };
  assert.equal(isAuthoritativeVercelSignal(deployment), true);
  assert.equal(evaluateChecks({ head: HEAD, checkRuns: [helper, deployment] }).vercel, 'PASS');
});

test('READY notification is deferred until comment and check publication', () => {
  assert.deepEqual(partitionNotifications(['codex', 'vercel', 'ready']), { beforePublish: ['codex', 'vercel'], afterPublish: ['ready'] });
  const source = readFileSync(new URL('../lumensia-merge-readiness.mjs', import.meta.url), 'utf8');
  const checkPublish = source.indexOf("await github(existing ? `/repos/${owner}/${repo}/check-runs/${existing.id}`");
  const readyDelivery = source.indexOf('for (const event of notificationPhases.afterPublish)');
  assert.ok(checkPublish >= 0 && readyDelivery > checkPublish);
});

test('same-head authoritative rerun returns READY to WAITING until success', () => {
  const app = { id: 8, name: 'Vercel' };
  const safetyApp = { id: 7, name: 'GitHub Actions' };
  const successful = [
    { id: 1, name: 'Repository checks', head_sha: HEAD, conclusion: 'success', completed_at: '2026-01-01T00:00:00Z', app: safetyApp },
    { id: 2, name: 'Vercel', head_sha: HEAD, conclusion: 'success', completed_at: '2026-01-01T00:00:00Z', app },
  ];
  const passing = evaluateChecks({ head: HEAD, checkRuns: successful });
  assert.equal(evaluateReadiness({ ...readyInput(), checks: passing }).state, 'READY');

  const rerunning = [
    ...successful,
    { id: 3, name: 'Repository checks', head_sha: HEAD, conclusion: null, status: 'in_progress', started_at: '2026-01-01T00:01:00Z', app: safetyApp },
    { id: 4, name: 'Vercel', head_sha: HEAD, conclusion: null, status: 'in_progress', started_at: '2026-01-01T00:01:00Z', app },
  ];
  const pending = evaluateChecks({ head: HEAD, checkRuns: rerunning });
  assert.deepEqual([pending.safety, pending.vercel], ['PENDING', 'PENDING']);
  assert.equal(evaluateReadiness({ ...readyInput(), checks: pending }).state, 'WAITING');

  const succeeded = rerunning.map((check) => check.id >= 3
    ? { ...check, status: 'completed', conclusion: 'success', completed_at: '2026-01-01T00:02:00Z' }
    : check);
  const repassing = evaluateChecks({ head: HEAD, checkRuns: succeeded });
  assert.equal(evaluateReadiness({ ...readyInput(), checks: repassing }).state, 'READY');
});

test('workflow subscribes to authoritative rerun start transitions', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/lumensia-merge-readiness.yml', import.meta.url), 'utf8');
  assert.match(workflow, /types: \[requested, in_progress, completed\]/);
  assert.match(workflow, /types: \[created, rerequested, completed\]/);
});

test('rerequested check event overrides stale completed API attempt', () => {
  const completed = { id: 9, name: 'Vercel', head_sha: HEAD, status: 'completed', conclusion: 'success', completed_at: '2026-01-01T00:00:00Z', app: { name: 'Vercel' } };
  const checkRuns = applyCheckRunTransition([completed], { action: 'rerequested', check_run: completed }, HEAD);
  const result = evaluateChecks({ head: HEAD, checkRuns });
  assert.equal(result.vercel, 'PENDING');
});

test('newer clean same-head Codex review supersedes older P1', () => {
  const old = review(HEAD, 'P1: old finding', { id: 10, submitted_at: '2026-01-01T00:00:00Z' });
  const latest = review(HEAD, 'No findings.', { id: 11, submitted_at: '2026-01-01T00:01:00Z' });
  const result = evaluateReview({ head: HEAD, reviews: [old, latest], comments: [comment(HEAD, 'P1: old inline', { pull_request_review_id: 10 })] });
  assert.equal(result.state, 'PASS'); assert.equal(result.P1, 0);
});

test('newer P2-only same-head Codex review supersedes older P1', () => {
  const old = review(HEAD, 'P1: old finding', { id: 20, submitted_at: '2026-01-01T00:00:00Z' });
  const latest = review(HEAD, 'P2: non-blocking suggestion', { id: 21, submitted_at: '2026-01-01T00:01:00Z' });
  const result = evaluateReview({ head: HEAD, reviews: [old, latest] });
  assert.equal(result.state, 'PASS'); assert.deepEqual([result.P1, result.P2], [0, 1]);
});

test('latest same-head Codex review still containing P1 blocks', () => {
  const old = review(HEAD, 'No findings.', { id: 30, submitted_at: '2026-01-01T00:00:00Z' });
  const latest = review(HEAD, 'P1: current finding', { id: 31, submitted_at: '2026-01-01T00:01:00Z' });
  const result = evaluateReview({ head: HEAD, reviews: [old, latest] });
  assert.equal(result.state, 'BLOCK'); assert.equal(result.P1, 1);
});

test('latest review selection continues to ignore prior-head findings', () => {
  const stale = review('old-head', 'P0: stale finding', { id: 40, submitted_at: '2026-01-01T00:02:00Z' });
  const current = review(HEAD, 'No findings.', { id: 41, submitted_at: '2026-01-01T00:01:00Z' });
  const result = evaluateReview({ head: HEAD, reviews: [current, stale], comments: [comment('old-head', 'P1: stale inline', { pull_request_review_id: 40 })] });
  assert.equal(result.state, 'PASS'); assert.deepEqual([result.P0, result.P1], [0, 0]);
});

test('privileged workflow bootstraps only from the trusted default branch', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/lumensia-merge-readiness.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/uses: actions\/checkout@v4/g) || []).length, 2);
  assert.equal((workflow.match(/ref: refs\/heads\/\$\{\{ github\.event\.repository\.default_branch \}\}/g) || []).length, 2);
  assert.equal((workflow.match(/persist-credentials: false/g) || []).length, 2);
  assert.doesNotMatch(workflow, /pull_request\.head|github\.head_ref|refs\/pull/);
});

test('missing trusted evaluator is a clean bootstrap no-op', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/lumensia-merge-readiness.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/if \[\[ -f scripts\/lumensia-merge-readiness\.mjs \]\]/g) || []).length, 2);
  assert.equal((workflow.match(/Merge Readiness bootstrap: trusted evaluator is not on default branch yet; it will become active after this PR is merged\./g) || []).length, 2);
  assert.equal((workflow.match(/if: steps\.evaluator\.outputs\.available == 'true'/g) || []).length, 4);
});

test('present trusted evaluator follows the normal runtime path', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/lumensia-merge-readiness.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/echo "available=true" >> "\$GITHUB_OUTPUT"/g) || []).length, 2);
  assert.equal((workflow.match(/run: node scripts\/lumensia-merge-readiness\.mjs/g) || []).length, 2);
});

test('overlapping rerun stays pending when older attempt finishes later', () => {
  const oldSafety = { id: 100, name: 'Repository checks', head_sha: HEAD, status: 'completed', conclusion: 'success', created_at: '2026-01-01T00:00:00Z', started_at: '2026-01-01T00:00:01Z', completed_at: '2026-01-01T00:03:00Z', app: { id: 7, name: 'GitHub Actions' } };
  const newSafety = { id: 101, name: 'Repository checks', head_sha: HEAD, status: 'in_progress', conclusion: null, created_at: '2026-01-01T00:01:00Z', started_at: '2026-01-01T00:01:01Z', app: { id: 7, name: 'GitHub Actions' } };
  const oldVercel = { id: 200, name: 'Vercel', head_sha: HEAD, status: 'completed', conclusion: 'success', created_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:03:00Z', app: { id: 8, name: 'Vercel' } };
  const newVercel = { id: 201, name: 'Vercel', head_sha: HEAD, status: 'queued', conclusion: null, created_at: '2026-01-01T00:01:00Z', app: { id: 8, name: 'Vercel' } };
  const checks = evaluateChecks({ head: HEAD, checkRuns: [newSafety, oldSafety, newVercel, oldVercel] });
  assert.deepEqual([checks.safety, checks.vercel], ['PENDING', 'PENDING']);
  assert.equal(evaluateReadiness({ ...readyInput(), checks }).state, 'WAITING');
});

test('same-head PR readiness check identity is isolated by pull request', () => {
  const sharedHead = HEAD;
  const runs = [
    { id: 1, name: readinessCheckName(14), external_id: readinessCheckIdentity(14), head_sha: sharedHead, status: 'completed', conclusion: 'success', created_at: '2026-01-01T00:00:00Z' },
    { id: 2, name: readinessCheckName(15), external_id: readinessCheckIdentity(15), head_sha: sharedHead, status: 'completed', conclusion: 'failure', created_at: '2026-01-01T00:00:00Z' },
  ];
  assert.equal(findReadinessCheck(runs, 14, sharedHead).id, 1);
  assert.equal(findReadinessCheck(runs, 15, sharedHead).id, 2);
  assert.equal(findReadinessCheck(runs, 16, sharedHead), undefined);
});

test('same-head PRs can retain different base-specific readiness states', () => {
  const prA = evaluateReadiness(readyInput());
  const prB = evaluateReadiness({ ...readyInput(), mergeable: false, mergeableState: 'dirty' });
  assert.equal(prA.state, 'READY'); assert.equal(prB.state, 'BLOCKED');
  assert.notEqual(readinessCheckIdentity(14), readinessCheckIdentity(15));
  assert.notEqual(readinessCheckName(14), readinessCheckName(15));
});

test('PR-specific readiness checks do not trigger recursive evaluation', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/lumensia-merge-readiness.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/!startsWith\(github\.event\.check_run\.name, 'Lumensia Merge Readiness'\)/g) || []).length, 2);
});
