import assert from 'node:assert/strict';
import test from 'node:test';
import { maintainAutoPulls, protectedMergeReason } from '../lumensia-auto-maintenance.mjs';
import {
  AUTO_PR_MARKER,
  DISCORD_DELIVERED_MARKER,
  makeCodexReviewRequestBody,
} from '../lumensia-auto-pr.mjs';

const OWNER = 'hoho074566-cpu';
const REPO = 'lumencia-ac';
const FULL = `${OWNER}/${REPO}`;
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BASE1 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const BASE2 = 'cccccccccccccccccccccccccccccccccccccccc';

function makePull(baseSha = BASE1) {
  return {
    number: 21,
    state: 'open',
    draft: false,
    mergeable: true,
    mergeable_state: 'clean',
    body: `${AUTO_PR_MARKER}\n${DISCORD_DELIVERED_MARKER}`,
    html_url: 'https://github.com/hoho074566-cpu/lumencia-ac/pull/21',
    user: { login: OWNER },
    head: { ref: 'codex/final-race', sha: HEAD, repo: { full_name: FULL } },
    base: { ref: 'main', sha: baseSha, repo: { full_name: FULL } },
  };
}

test('every deterministic Safety Gate test is protected', () => {
  assert.equal(protectedMergeReason('scripts/tests/core-invariants.test.mjs'), 'automation-safety-test');
  assert.equal(protectedMergeReason('scripts/tests/context-router.test.mjs'), 'automation-safety-test');
});

test('base advance after final signal evaluation prevents merge mutation', async () => {
  const requestBody = makeCodexReviewRequestBody({
    prNumber: 21,
    head: HEAD,
    baseSha: BASE1,
    generationKey: 'final-race',
    baselineReviewIds: [],
    baselineReviewCommentIds: [],
    baselineIssueCommentIds: [],
  });
  const issueComments = [
    { id: 1, body: requestBody, created_at: '2026-08-23T00:00:00Z', user: { login: OWNER } },
    {
      id: 2,
      body: `Codex Review: Didn't find any major issues. Great.\n\n**Reviewed commit:** \`${HEAD.slice(0, 10)}\``,
      created_at: '2026-08-23T00:01:00Z',
      user: { login: 'chatgpt-codex-connector[bot]' },
    },
  ];

  let getPullCalls = 0;
  const api = {
    validate: async () => true,
    listOpenPulls: async () => [makePull()],
    getPull: async () => {
      getPullCalls += 1;
      return getPullCalls >= 3 ? makePull(BASE2) : makePull(BASE1);
    },
    listIssueComments: async () => [...issueComments],
    listReviews: async () => [],
    listReviewComments: async () => [],
    listCheckRuns: async () => ({ check_runs: [{
      id: 10,
      name: 'Repository checks',
      head_sha: HEAD,
      conclusion: 'success',
      created_at: '2026-08-23T00:00:00Z',
      pull_requests: [{ number: 21, head: { sha: HEAD }, base: { sha: BASE1 } }],
    }] }),
    getCombinedStatus: async () => ({ statuses: [{ context: 'Vercel', state: 'success', sha: HEAD, created_at: '2026-08-23T00:00:00Z' }] }),
    listPullFiles: async () => [{ filename: 'docs/guide.md', status: 'modified', changes: 1 }],
    updatePull: async () => makePull(BASE1),
    createIssueComment: async () => { throw new Error('unexpected human/fix comment'); },
  };

  let mergeCalls = 0;
  const mergeApi = { mergePull: async () => { mergeCalls += 1; return { merged: true, sha: 'ddddddd' }; } };
  const summary = await maintainAutoPulls({
    token: 'pat',
    mergeToken: 'ephemeral',
    owner: OWNER,
    repo: REPO,
    api,
    mergeApi,
    now: new Date('2026-08-23T00:02:00Z'),
    logger: { log() {}, warn() {}, error() {} },
  });

  assert.equal(mergeCalls, 0);
  assert.equal(summary.merged, 0);
  assert.equal(summary.waiting, 1);
});
