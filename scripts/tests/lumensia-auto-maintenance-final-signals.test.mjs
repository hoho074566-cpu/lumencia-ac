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
const NEW_HEAD = 'cccccccccccccccccccccccccccccccccccccccc';
const BASE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function pull(head = HEAD, mergeableState = 'clean', base = BASE) {
  return {
    number: 21,
    state: 'open',
    draft: false,
    mergeable: true,
    mergeable_state: mergeableState,
    changed_files: 1,
    body: `${AUTO_PR_MARKER}\n${DISCORD_DELIVERED_MARKER}`,
    html_url: 'https://github.com/hoho074566-cpu/lumencia-ac/pull/21',
    user: { login: OWNER },
    head: { ref: 'codex/final-signals', sha: head, repo: { full_name: FULL } },
    base: { ref: 'main', sha: base, repo: { full_name: FULL } },
  };
}

function requestComment() {
  return {
    id: 1,
    body: makeCodexReviewRequestBody({
      prNumber: 21,
      head: HEAD,
      baseSha: BASE,
      generationKey: 'final-signals',
      baselineReviewIds: [],
      baselineReviewCommentIds: [],
      baselineIssueCommentIds: [],
    }),
    created_at: '2026-08-23T00:00:00Z',
    user: { login: OWNER },
  };
}

function cleanCodexComment() {
  return {
    id: 2,
    body: `Codex Review: Didn't find any major issues. Great.\n\n**Reviewed commit:** \`${HEAD.slice(0, 10)}\``,
    created_at: '2026-08-23T00:01:00Z',
    user: { login: 'chatgpt-codex-connector[bot]' },
  };
}

function successCheck(conclusion = 'success') {
  return {
    id: Math.random(),
    name: 'Repository checks',
    head_sha: HEAD,
    conclusion,
    created_at: '2026-08-23T00:00:30Z',
    pull_requests: [{ number: 21, head: { sha: HEAD }, base: { sha: BASE } }],
  };
}

const vercelStatus = { context: 'Vercel', state: 'success', sha: HEAD, created_at: '2026-08-23T00:00:30Z' };
const file = { filename: 'docs/guide.md', status: 'modified', additions: 1, deletions: 0, changes: 1 };
const silent = { log() {}, warn() {}, error() {} };

test('.vercelignore is protected deployment configuration', () => {
  assert.notEqual(protectedMergeReason('.vercelignore'), '');
});

test('auto-fix is not posted after HEAD advances', async () => {
  let getPullCalls = 0;
  let commentCalls = 0;
  const api = {
    validate: async () => true,
    listOpenPulls: async () => [pull()],
    getPull: async () => (++getPullCalls === 1 ? pull() : pull(NEW_HEAD)),
    listIssueComments: async () => [requestComment()],
    listReviews: async () => [{
      id: 20,
      commit_id: HEAD,
      submitted_at: '2026-08-23T00:01:00Z',
      state: 'COMMENTED',
      user: { login: 'chatgpt-codex-connector[bot]' },
      body: '',
    }],
    listReviewComments: async () => [{
      id: 21,
      commit_id: HEAD,
      pull_request_review_id: 20,
      created_at: '2026-08-23T00:01:00Z',
      user: { login: 'chatgpt-codex-connector[bot]' },
      body: '[P1] current blocker',
    }],
    listCheckRuns: async () => ({ check_runs: [successCheck()] }),
    getCombinedStatus: async () => ({ statuses: [vercelStatus] }),
    listPullFiles: async () => [file],
    updatePull: async () => pull(),
    createIssueComment: async () => { commentCalls += 1; },
  };
  const summary = await maintainAutoPulls({
    token: 'pat', mergeToken: 'ephemeral', owner: OWNER, repo: REPO, api,
    mergeApi: { mergePull: async () => ({ merged: true }) }, logger: silent,
    now: new Date('2026-08-23T00:02:00Z'),
  });
  assert.equal(commentCalls, 0);
  assert.equal(summary.fixesRequested, 0);
  assert.equal(summary.waiting, 1);
  assert.equal(summary.merged, 0);
});

test('hosted check failure on final signal reread prevents merge', async () => {
  const issueComments = [requestComment(), cleanCodexComment()];
  let checkCalls = 0;
  let mergeCalls = 0;
  const api = {
    validate: async () => true,
    listOpenPulls: async () => [pull()],
    getPull: async () => pull(),
    listIssueComments: async () => [...issueComments],
    listReviews: async () => [],
    listReviewComments: async () => [],
    listCheckRuns: async () => {
      checkCalls += 1;
      return { check_runs: [successCheck(checkCalls >= 3 ? 'failure' : 'success')] };
    },
    getCombinedStatus: async () => ({ statuses: [vercelStatus] }),
    listPullFiles: async () => [file],
    updatePull: async () => pull(),
    createIssueComment: async (_number, body) => {
      const comment = { id: 100 + issueComments.length, body, created_at: '2026-08-23T00:03:00Z', user: { login: OWNER } };
      issueComments.push(comment);
      return comment;
    },
  };
  const summary = await maintainAutoPulls({
    token: 'pat', mergeToken: 'ephemeral', owner: OWNER, repo: REPO, api,
    mergeApi: { mergePull: async () => { mergeCalls += 1; return { merged: true, sha: 'd'.repeat(40) }; } },
    logger: silent, now: new Date('2026-08-23T00:02:00Z'),
  });
  assert.equal(checkCalls, 3);
  assert.equal(mergeCalls, 0);
  assert.equal(summary.merged, 0);
  assert.equal(summary.humanRequired, 1);
  assert.equal(summary.errors.length, 0);
});

test('unstable final snapshot rereads authoritative signals and blocks stale PASS', async () => {
  const issueComments = [requestComment(), cleanCodexComment()];
  let getPullCalls = 0;
  let checkCalls = 0;
  let mergeCalls = 0;
  const api = {
    validate: async () => true,
    listOpenPulls: async () => [pull()],
    getPull: async () => {
      getPullCalls += 1;
      return getPullCalls >= 4 ? pull(HEAD, 'unstable') : pull();
    },
    listIssueComments: async () => [...issueComments],
    listReviews: async () => [],
    listReviewComments: async () => [],
    listCheckRuns: async () => {
      checkCalls += 1;
      return { check_runs: [successCheck(checkCalls >= 4 ? 'failure' : 'success')] };
    },
    getCombinedStatus: async () => ({ statuses: [vercelStatus] }),
    listPullFiles: async () => [file],
    updatePull: async () => pull(),
    createIssueComment: async (_number, body) => {
      const comment = { id: 200 + issueComments.length, body, created_at: '2026-08-23T00:03:00Z', user: { login: OWNER } };
      issueComments.push(comment);
      return comment;
    },
  };
  const summary = await maintainAutoPulls({
    token: 'pat', mergeToken: 'ephemeral', owner: OWNER, repo: REPO, api,
    mergeApi: { mergePull: async () => { mergeCalls += 1; return { merged: true, sha: 'd'.repeat(40) }; } },
    logger: silent, now: new Date('2026-08-23T00:02:00Z'),
  });
  assert.equal(getPullCalls, 4);
  assert.equal(checkCalls, 4);
  assert.equal(mergeCalls, 0);
  assert.equal(summary.merged, 0);
  assert.equal(summary.humanRequired, 1);
  assert.equal(summary.errors.length, 0);
});

test('unstable final snapshot merges only after post-snapshot signals pass', async () => {
  const issueComments = [requestComment(), cleanCodexComment()];
  let getPullCalls = 0;
  let checkCalls = 0;
  let mergeCalls = 0;
  const api = {
    validate: async () => true,
    listOpenPulls: async () => [pull()],
    getPull: async () => {
      getPullCalls += 1;
      return getPullCalls >= 4 ? pull(HEAD, 'unstable') : pull();
    },
    listIssueComments: async () => [...issueComments],
    listReviews: async () => [],
    listReviewComments: async () => [],
    listCheckRuns: async () => {
      checkCalls += 1;
      return { check_runs: [successCheck()] };
    },
    getCombinedStatus: async () => ({ statuses: [vercelStatus] }),
    listPullFiles: async () => [file],
    updatePull: async () => pull(),
    createIssueComment: async (_number, body) => {
      const comment = { id: 300 + issueComments.length, body, created_at: '2026-08-23T00:03:00Z', user: { login: OWNER } };
      issueComments.push(comment);
      return comment;
    },
  };
  const summary = await maintainAutoPulls({
    token: 'pat', mergeToken: 'ephemeral', owner: OWNER, repo: REPO, api,
    mergeApi: { mergePull: async () => { mergeCalls += 1; return { merged: true, sha: 'd'.repeat(40) }; } },
    logger: silent, now: new Date('2026-08-23T00:02:00Z'),
  });
  assert.equal(getPullCalls, 5);
  assert.equal(checkCalls, 4);
  assert.equal(mergeCalls, 1);
  assert.equal(summary.merged, 1);
  assert.equal(summary.humanRequired, 0);
  assert.equal(summary.errors.length, 0);
});

test('base advance during unstable post-snapshot signal read prevents merge', async () => {
  const issueComments = [requestComment(), cleanCodexComment()];
  const newBase = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  let getPullCalls = 0;
  let checkCalls = 0;
  let mergeCalls = 0;
  const api = {
    validate: async () => true,
    listOpenPulls: async () => [pull()],
    getPull: async () => {
      getPullCalls += 1;
      if (getPullCalls >= 5) return pull(HEAD, 'unstable', newBase);
      return getPullCalls >= 4 ? pull(HEAD, 'unstable') : pull();
    },
    listIssueComments: async () => [...issueComments],
    listReviews: async () => [],
    listReviewComments: async () => [],
    listCheckRuns: async () => {
      checkCalls += 1;
      return { check_runs: [successCheck()] };
    },
    getCombinedStatus: async () => ({ statuses: [vercelStatus] }),
    listPullFiles: async () => [file],
    updatePull: async () => pull(),
    createIssueComment: async (_number, body) => {
      const comment = { id: 400 + issueComments.length, body, created_at: '2026-08-23T00:03:00Z', user: { login: OWNER } };
      issueComments.push(comment);
      return comment;
    },
  };
  const summary = await maintainAutoPulls({
    token: 'pat', mergeToken: 'ephemeral', owner: OWNER, repo: REPO, api,
    mergeApi: { mergePull: async () => { mergeCalls += 1; return { merged: true, sha: 'd'.repeat(40) }; } },
    logger: silent, now: new Date('2026-08-23T00:02:00Z'),
  });
  assert.equal(getPullCalls, 5);
  assert.equal(checkCalls, 4);
  assert.equal(mergeCalls, 0);
  assert.equal(summary.merged, 0);
  assert.equal(summary.waiting, 1);
  assert.equal(summary.errors.length, 0);
});
