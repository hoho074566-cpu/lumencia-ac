import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIX_STALL_MINUTES,
  MAX_AUTO_FIX_ATTEMPTS,
  decideMaintenanceAction,
  findTrustedHumanCheck,
  isAutoManagedPull,
  maintainAutoPulls,
  makeAutoFixRequestBody,
  makeHumanCheckBody,
  parseAutoFixRequest,
  protectedMergePaths,
  protectedMergeReason,
  trustedAutoFixRequests,
  trustedCodexActors,
} from '../lumensia-auto-maintenance.mjs';
import {
  AUTO_PR_MARKER,
  DISCORD_DELIVERED_MARKER,
  makeCodexReviewRequestBody,
} from '../lumensia-auto-pr.mjs';

const OWNER = 'hoho074566-cpu';
const REPO = 'lumencia-ac';
const FULL = `${OWNER}/${REPO}`;
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BASE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const pull = (extra = {}) => ({
  number: 21,
  state: 'open',
  draft: false,
  mergeable: true,
  mergeable_state: 'clean',
  body: `test\n${AUTO_PR_MARKER}\n${DISCORD_DELIVERED_MARKER}`,
  html_url: 'https://github.com/hoho074566-cpu/lumencia-ac/pull/21',
  user: { login: OWNER },
  head: { ref: 'codex/feature-test', sha: HEAD, repo: { full_name: FULL } },
  base: { ref: 'main', sha: BASE, repo: { full_name: FULL } },
  ...extra,
});
const codex = (state = 'PASS', extra = {}) => ({ state, P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0, ...extra });
const checks = (extra = {}) => ({ safety: 'PASS', vercel: 'PASS', required: 'PASS', ...extra });
const ready = { state: 'READY', conflict: 'NONE' };

function fixEntry(attempt, head = `head-${attempt}`, created_at = '2026-08-23T00:00:00Z') {
  const body = makeAutoFixRequestBody({
    prNumber: 21,
    head,
    baseSha: BASE,
    branch: 'codex/feature-test',
    attempt,
    reviewRequestCommentId: 100 + attempt,
  });
  return { comment: { id: 200 + attempt, body, created_at, user: { login: OWNER } }, request: parseAutoFixRequest(body) };
}

test('only owner-authored same-repository delivered Auto-PRs are managed', () => {
  assert.equal(isAutoManagedPull(pull(), OWNER, REPO), true);
  assert.equal(isAutoManagedPull(pull({ body: 'manual PR' }), OWNER, REPO), false);
  assert.equal(isAutoManagedPull(pull({ body: `${AUTO_PR_MARKER}\n<!-- lumensia-auto-pr-discord:pending -->` }), OWNER, REPO), false);
  assert.equal(isAutoManagedPull(pull({ user: { login: 'attacker' } }), OWNER, REPO), false);
  assert.equal(isAutoManagedPull(pull({ head: { ref: 'codex/feature-test', sha: HEAD, repo: { full_name: 'attacker/fork' } } }), OWNER, REPO), false);
  assert.equal(isAutoManagedPull(pull({ head: { ref: 'feature/manual', sha: HEAD, repo: { full_name: FULL } } }), OWNER, REPO), false);
  assert.equal(isAutoManagedPull(pull({ head: { ref: 'codex/feature-no-pr', sha: HEAD, repo: { full_name: FULL } } }), OWNER, REPO), false);
  assert.equal(isAutoManagedPull(pull({ draft: true }), OWNER, REPO), false);
});

test('official Codex actors are additive to configured actors', () => {
  const actors = trustedCodexActors('custom-reviewer[bot]');
  assert.match(actors, /chatgpt-codex-connector\[bot\]/);
  assert.match(actors, /chatgpt-codex-connector/);
  assert.match(actors, /custom-reviewer\[bot\]/);
});

test('auto-fix marker round-trips and trusted selection is owner-scoped', () => {
  const entry = fixEntry(1, HEAD);
  assert.equal(entry.request.pr, 21);
  assert.equal(entry.request.head, HEAD);
  assert.equal(entry.request.attempt, 1);
  assert.equal(trustedAutoFixRequests([entry.comment], 21, OWNER).length, 1);
  assert.equal(trustedAutoFixRequests([{ ...entry.comment, user: { login: 'attacker' } }], 21, OWNER).length, 0);
});

test('human-check hold markers must be owner-authored and current-head scoped', () => {
  const body = makeHumanCheckBody({ prNumber: 21, head: HEAD, reason: 'merge-rejected' });
  const trusted = { id: 1, body, user: { login: OWNER } };
  const spoofed = { id: 2, body, user: { login: 'attacker' } };
  assert.equal(findTrustedHumanCheck([spoofed], 21, HEAD, OWNER), null);
  assert.equal(findTrustedHumanCheck([spoofed, trusted], 21, HEAD, OWNER).id, 1);
  assert.equal(findTrustedHumanCheck([trusted], 21, 'different-head', OWNER), null);
});

test('authoritative failure outranks P0/P1 auto-fix', () => {
  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex('BLOCK', { P1: 1 }), checks: checks({ safety: 'FAIL' }), readiness: { state: 'BLOCKED' }, files: [], fixRequests: [],
  });
  assert.equal(decision.action, 'HUMAN');
  assert.equal(decision.reason, 'authoritative-check-failed');
});

test('current P0/P1 requests one focused fix when hosted checks are healthy', () => {
  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex('BLOCK', { P1: 1 }), checks: checks(), readiness: { state: 'BLOCKED' }, files: [{ filename: 'docs/readme.md' }], fixRequests: [],
  });
  assert.deepEqual(decision, { action: 'FIX', attempt: 1 });
});

test('same-head fix is never duplicated while in flight', () => {
  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex('BLOCK', { P0: 1 }), checks: checks(), readiness: { state: 'BLOCKED' }, files: [],
    fixRequests: [fixEntry(1, HEAD, '2026-08-23T00:00:00Z')], now: new Date('2026-08-23T00:10:00Z'),
  });
  assert.deepEqual(decision, { action: 'WAIT', reason: 'fix-in-flight' });
});

test('fifth same-head fix gets its full stall window before escalation', () => {
  const prior = Array.from({ length: MAX_AUTO_FIX_ATTEMPTS - 1 }, (_, index) => fixEntry(index + 1));
  const fifth = fixEntry(MAX_AUTO_FIX_ATTEMPTS, HEAD, '2026-08-23T00:00:00Z');
  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex('BLOCK', { P1: 1 }), checks: checks(), readiness: { state: 'BLOCKED' }, files: [],
    fixRequests: [...prior, fifth], now: new Date('2026-08-23T00:10:00Z'),
  });
  assert.deepEqual(decision, { action: 'WAIT', reason: 'fix-in-flight' });
});

test('stalled same-head fix escalates instead of spamming Codex', () => {
  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex('BLOCK', { P1: 1 }), checks: checks(), readiness: { state: 'BLOCKED' }, files: [],
    fixRequests: [fixEntry(1, HEAD, '2026-08-23T00:00:00Z')], now: new Date(`2026-08-23T00:${FIX_STALL_MINUTES}:01Z`),
  });
  assert.equal(decision.action, 'HUMAN');
  assert.equal(decision.reason, 'fix-stalled');
});

test('P0/P1 loop stops after five completed prior-head requests', () => {
  const fixRequests = Array.from({ length: MAX_AUTO_FIX_ATTEMPTS }, (_, index) => fixEntry(index + 1));
  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex('BLOCK', { P1: 1 }), checks: checks(), readiness: { state: 'BLOCKED' }, files: [], fixRequests,
  });
  assert.equal(decision.action, 'HUMAN');
  assert.equal(decision.reason, 'max-fix-attempts');
});

test('low-risk ready Auto-PR may auto-merge from clean or authoritative unstable merge state', () => {
  const merge = decideMaintenanceAction({
    pull: pull(), codex: codex(), checks: checks(), readiness: ready,
    files: [{ filename: 'docs/guide.md' }, { filename: 'assets/characters-v2/test.webp' }], fixRequests: [], mergeTokenAvailable: true,
  });
  assert.deepEqual(merge, { action: 'MERGE' });

  const unstable = decideMaintenanceAction({
    pull: pull({ mergeable_state: 'unstable' }), codex: codex(), checks: checks(), readiness: ready,
    files: [{ filename: 'docs/guide.md' }], fixRequests: [], mergeTokenAvailable: true,
  });
  assert.deepEqual(unstable, { action: 'MERGE' });

  for (const mergeable_state of ['behind', 'blocked', 'dirty']) {
    const decision = decideMaintenanceAction({
      pull: pull({ mergeable_state }), codex: codex(), checks: checks(), readiness: ready,
      files: [{ filename: 'docs/guide.md' }], fixRequests: [], mergeTokenAvailable: true,
    });
    assert.deepEqual(decision, { action: 'WAIT', reason: 'merge-state-not-safe' });
  }
  assert.deepEqual(decideMaintenanceAction({
    pull: pull({ mergeable: null }), codex: codex(), checks: checks(), readiness: ready,
    files: [{ filename: 'docs/guide.md' }], fixRequests: [], mergeTokenAvailable: true,
  }), { action: 'WAIT', reason: 'merge-state-not-safe' });
});

test('protected core, service-worker, automation, and renamed source paths require human merge', () => {
  const protectedFiles = [
    'api/chat.js',
    'app.js',
    'sw.js',
    '.github/workflows/test.yml',
    'scripts/lumensia-auto-pr.mjs',
    'scripts/lumensia-auto-maintenance.mjs',
    'scripts/lumensia-auto-maintenance-run.mjs',
    'scripts/tests/lumensia-auto-maintenance.test.mjs',
    'data/save-schema.json',
    'CANON/secret.md',
    'package-lock.json',
  ];
  for (const filename of protectedFiles) assert.notEqual(protectedMergeReason(filename), '');
  assert.equal(protectedMergeReason('docs/guide.md'), '');
  assert.equal(protectedMergeReason('assets/characters-v2/a.webp'), '');
  assert.equal(protectedMergePaths(protectedFiles).length, protectedFiles.length);

  const renamed = protectedMergePaths([{ filename: 'docs/old-agents.md', previous_filename: 'AGENTS.md', status: 'renamed' }]);
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].path, 'AGENTS.md');
  assert.equal(renamed[0].source, 'previous_filename');

  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex(), checks: checks(), readiness: ready,
    files: [{ filename: 'docs/old-agents.md', previous_filename: 'AGENTS.md', status: 'renamed' }], fixRequests: [], mergeTokenAvailable: true,
  });
  assert.equal(decision.action, 'HUMAN');
  assert.equal(decision.reason, 'protected-paths');
});

test('missing merge token never degrades to an unsafe merge', () => {
  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex(), checks: checks(), readiness: ready,
    files: [{ filename: 'docs/guide.md' }], fixRequests: [], mergeTokenAvailable: false,
  });
  assert.deepEqual(decision, { action: 'HUMAN', reason: 'merge-token-unavailable' });
});

test('HTTP merge rejection creates a persistent human hold and is not retried next scan', async () => {
  const requestBody = makeCodexReviewRequestBody({
    prNumber: 21,
    head: HEAD,
    baseSha: BASE,
    generationKey: 'test-cycle',
    baselineReviewIds: [],
    baselineReviewCommentIds: [],
    baselineIssueCommentIds: [],
  });
  const issueComments = [
    { id: 10, body: requestBody, created_at: '2026-08-23T00:00:00Z', user: { login: OWNER } },
    {
      id: 11,
      body: `Codex Review: Didn't find any major issues. Great.\n\n**Reviewed commit:** \`${HEAD.slice(0, 10)}\``,
      created_at: '2026-08-23T00:01:00Z',
      user: { login: 'chatgpt-codex-connector[bot]' },
    },
  ];
  const p = pull();
  const api = {
    validate: async () => true,
    compare: async () => ({ head_commit: { sha: HEAD }, base_commit: { sha: BASE }, merge_base_commit: { sha: BASE } }),
    listOpenPulls: async () => [p],
    getPull: async () => p,
    listIssueComments: async () => [...issueComments],
    listReviews: async () => [],
    listReviewComments: async () => [],
    listCheckRuns: async () => ({ check_runs: [{
      id: 100,
      name: 'Repository checks',
      head_sha: HEAD,
      conclusion: 'success',
      created_at: '2026-08-23T00:00:00Z',
      pull_requests: [{ number: 21, head: { sha: HEAD }, base: { sha: BASE } }],
    }] }),
    getCombinedStatus: async () => ({ statuses: [{ context: 'Vercel', state: 'success', sha: HEAD, created_at: '2026-08-23T00:00:00Z' }] }),
    listPullFiles: async () => [{ filename: 'docs/guide.md', status: 'modified' }],
    updatePull: async () => p,
    createIssueComment: async (_number, body) => {
      const comment = { id: 1000 + issueComments.length, body, created_at: '2026-08-23T00:02:00Z', user: { login: OWNER } };
      issueComments.push(comment);
      return comment;
    },
  };
  let mergeCalls = 0;
  const mergeApi = {
    mergePull: async () => {
      mergeCalls += 1;
      const error = new Error('GitHub API request returned HTTP 409.');
      error.status = 409;
      error.data = { message: 'Head branch was modified' };
      throw error;
    },
  };
  const silent = { log() {}, warn() {}, error() {} };

  const first = await maintainAutoPulls({
    token: 'pat', mergeToken: 'ephemeral', owner: OWNER, repo: REPO, api, mergeApi, logger: silent,
    discordFetch: async () => ({ ok: true }), now: new Date('2026-08-23T00:03:00Z'),
  });
  assert.equal(first.humanRequired, 1);
  assert.equal(first.merged, 0);
  assert.equal(first.errors.length, 0);
  assert.equal(mergeCalls, 1);
  assert.ok(findTrustedHumanCheck(issueComments, 21, HEAD, OWNER, 'merge-rejected'));

  const second = await maintainAutoPulls({
    token: 'pat', mergeToken: 'ephemeral', owner: OWNER, repo: REPO, api, mergeApi, logger: silent,
    discordFetch: async () => ({ ok: true }), now: new Date('2026-08-23T00:04:00Z'),
  });
  assert.equal(second.humanRequired, 1);
  assert.equal(second.errors.length, 0);
  assert.equal(mergeCalls, 1);
});