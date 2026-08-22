import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureCodexReviewRequest,
  findLatestCodexReviewRequest,
  hasCodexCompletionForRequest,
  makeCodexReviewRequestBody,
  parseCodexReviewRequest,
  reconcileOpenPullReviewRequests,
  sameCodexReviewTarget,
} from '../lumensia-auto-pr.mjs';
import {
  evaluateCodex,
  findLatestTrustedCodexReviewRequest,
  isCurrentCleanCodexComment,
  parseTrustedCodexReviewRequest,
} from '../lumensia-merge-readiness.mjs';

const OWNER = 'hoho074566-cpu';
const CODEX = 'chatgpt-codex-connector[bot]';
const ACTORS = CODEX;
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const BASE1 = '1111111111111111111111111111111111111111';
const BASE2 = '2222222222222222222222222222222222222222';

function requestComment(id, head, baseSha = BASE1, baselineIssueCommentIds = []) {
  const body = makeCodexReviewRequestBody({
    prNumber: 16,
    head,
    baseSha,
    generationKey: `after-${id - 1}`,
    baselineReviewIds: [],
    baselineReviewCommentIds: [],
    baselineIssueCommentIds,
  });
  return { id, body, user: { login: OWNER } };
}

function cleanComment(id, head, login = CODEX) {
  return {
    id,
    body: `Codex Review: Didn't find any major issues. Bravo.\n\n**Reviewed commit:** \`${head.slice(0, 10)}\``,
    user: { login },
  };
}

test('v4 request marker round-trips head and base and requires trusted author when selected', () => {
  const comment = requestComment(10, A, BASE1, ['1', '2']);
  const parsed = parseCodexReviewRequest(comment.body);
  assert.equal(parsed.head, A);
  assert.equal(parsed.baseSha, BASE1);
  assert.equal(parseTrustedCodexReviewRequest(comment.body).baseSha, BASE1);
  assert.equal(sameCodexReviewTarget(parsed, A, BASE1), true);
  assert.equal(sameCodexReviewTarget(parsed, A, BASE2), false);
  assert.equal(findLatestCodexReviewRequest([comment], 16, OWNER, A, BASE1).comment.id, 10);
  assert.equal(findLatestTrustedCodexReviewRequest([comment], 16, OWNER, A, BASE1).comment.id, 10);
  assert.equal(findLatestTrustedCodexReviewRequest([{ ...comment, user: { login: 'attacker' } }], 16, OWNER, A, BASE1), null);
});

test('legacy v4 request without baseSha is not authoritative for a current target', () => {
  const legacyBody = `<!-- lumensia-codex-review-request:v4\n${JSON.stringify({ pr: 16, head: A, generationKey: 'legacy' })}\n-->\n\n@codex review`;
  const legacy = { id: 9, body: legacyBody, user: { login: OWNER } };
  assert.equal(parseTrustedCodexReviewRequest(legacy.body), null);
  assert.equal(findLatestTrustedCodexReviewRequest([legacy], 16, OWNER, A, BASE1), null);
});

test('clean result is scoped by baseline and reviewed HEAD', () => {
  const oldClean = cleanComment(20, A);
  const newClean = cleanComment(30, A);
  assert.equal(isCurrentCleanCodexComment(oldClean, A, ['20'], ACTORS), false);
  assert.equal(isCurrentCleanCodexComment(newClean, B, [], ACTORS), false);
  assert.equal(isCurrentCleanCodexComment(newClean, A, ['20'], ACTORS), true);
  assert.equal(evaluateCodex({ head: A, issueComments: [oldClean, newClean], baselineIssueCommentIds: ['20'], configuredActors: ACTORS }).state, 'PASS');
  assert.equal(evaluateCodex({ head: A, issueComments: [oldClean], baselineIssueCommentIds: ['20'], configuredActors: ACTORS }).state, 'PENDING');
});

test('untrusted clean text cannot satisfy Codex', () => {
  const fake = cleanComment(30, A, 'ordinary-user');
  assert.equal(evaluateCodex({ head: A, issueComments: [fake], configuredActors: ACTORS }).state, 'PENDING');
});

test('current trusted P1 review blocks even if a clean timeline comment exists', () => {
  const reviews = [{ id: 50, commit_id: A, body: 'P1: blocker', state: 'COMMENTED', submitted_at: '2026-08-22T12:00:00Z', user: { login: CODEX } }];
  const result = evaluateCodex({ head: A, reviews, issueComments: [cleanComment(60, A)], configuredActors: ACTORS });
  assert.equal(result.state, 'BLOCK');
  assert.equal(result.P1, 1);
});

test('trusted scanner reuses the same head+base target across A-B-A and requests again when base changes', async () => {
  let head = A;
  let baseSha = BASE1;
  let nextId = 100;
  const issueComments = [];
  const api = {
    getPull: async () => ({ number: 16, state: 'open', draft: false, head: { sha: head }, base: { sha: baseSha } }),
    listIssueComments: async () => [...issueComments],
    listReviews: async () => [],
    listReviewComments: async () => [],
    createIssueComment: async (_number, body) => {
      const comment = { id: nextId++, body, user: { login: OWNER }, created_at: `2026-08-22T12:00:${nextId - 100}Z` };
      issueComments.push(comment);
      return comment;
    },
  };
  const pull = () => ({ number: 16, state: 'open', draft: false, head: { sha: head }, base: { sha: baseSha } });

  const firstA = await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } });
  const duplicateA = await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } });
  assert.equal(firstA.created, true);
  assert.equal(firstA.request.baseSha, BASE1);
  assert.equal(duplicateA.created, false);
  assert.equal(issueComments.length, 1);

  head = B;
  const firstB = await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } });
  assert.equal(firstB.created, true);
  assert.equal(issueComments.length, 2);

  head = A;
  const reusedA = await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } });
  assert.equal(reusedA.created, false);
  assert.equal(reusedA.comment.id, firstA.comment.id);
  assert.equal(issueComments.length, 2);

  baseSha = BASE2;
  const deferredA = await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } });
  assert.equal(deferredA.created, false);
  assert.equal(deferredA.reason, 'prior-same-head-pending');
  assert.equal(issueComments.length, 2);
});

test('same-head base change waits for prior result then creates one fresh request', async () => {
  let nextId = 301;
  const oldRequest = {
    ...requestComment(300, A, BASE1),
    created_at: '2026-08-22T12:00:00Z',
  };
  const issueComments = [oldRequest];
  const reviews = [];
  const pull = { number: 16, state: 'open', draft: false, head: { sha: A }, base: { sha: BASE2 } };
  const api = {
    getPull: async () => pull,
    listIssueComments: async () => [...issueComments],
    listReviews: async () => [...reviews],
    listReviewComments: async () => [],
    createIssueComment: async (_number, body) => {
      const comment = { id: nextId++, body, user: { login: OWNER }, created_at: '2026-08-22T12:02:00Z' };
      issueComments.push(comment);
      return comment;
    },
  };

  assert.equal(hasCodexCompletionForRequest({ requestEntry: { comment: oldRequest, request: parseCodexReviewRequest(oldRequest.body) }, reviews, issueComments, configuredActors: ACTORS }), false);
  const deferred = await ensureCodexReviewRequest({ api, pull, owner: OWNER, logger: { log() {} }, configuredActors: ACTORS });
  assert.equal(deferred.created, false);
  assert.equal(deferred.reason, 'prior-same-head-pending');

  const clean = { ...cleanComment(350, A), created_at: '2026-08-22T12:01:00Z' };
  issueComments.push(clean);
  assert.equal(hasCodexCompletionForRequest({ requestEntry: { comment: oldRequest, request: parseCodexReviewRequest(oldRequest.body) }, reviews, issueComments, configuredActors: ACTORS }), true);

  const created = await ensureCodexReviewRequest({ api, pull, owner: OWNER, logger: { log() {} }, configuredActors: ACTORS });
  assert.equal(created.created, true);
  assert.equal(created.request.head, A);
  assert.equal(created.request.baseSha, BASE2);
  assert.equal(issueComments.length, 3);
});

test('trusted request selection is exact for both head and base', () => {
  const a1 = requestComment(10, A, BASE1);
  const b1 = requestComment(20, B, BASE1);
  const a2 = requestComment(30, A, BASE2);
  const comments = [a1, b1, a2];
  assert.equal(findLatestTrustedCodexReviewRequest(comments, 16, OWNER, A, BASE1).comment.id, 10);
  assert.equal(findLatestTrustedCodexReviewRequest(comments, 16, OWNER, B, BASE1).comment.id, 20);
  assert.equal(findLatestTrustedCodexReviewRequest(comments, 16, OWNER, A, BASE2).comment.id, 30);
  assert.equal(findLatestTrustedCodexReviewRequest(comments, 16, OWNER, B, BASE2), null);
});

test('scanner request carries immutable baselines and current base SHA', async () => {
  const comments = [{ id: 1, body: 'old', user: { login: CODEX } }];
  let posted;
  const api = {
    getPull: async () => ({ number: 16, state: 'open', draft: false, head: { sha: A }, base: { sha: BASE1 } }),
    listIssueComments: async () => [...comments],
    listReviews: async () => [{ id: 11 }],
    listReviewComments: async () => [{ id: 12 }],
    createIssueComment: async (_number, body) => (posted = { id: 13, body, user: { login: OWNER }, created_at: '2026-08-22T12:00:00Z' }),
  };
  await ensureCodexReviewRequest({ api, pull: { number: 16, state: 'open', draft: false, head: { sha: A }, base: { sha: BASE1 } }, owner: OWNER, logger: { log() {} } });
  const marker = parseCodexReviewRequest(posted.body);
  assert.equal(marker.baseSha, BASE1);
  assert.deepEqual(marker.baselineReviewIds, ['11']);
  assert.deepEqual(marker.baselineReviewCommentIds, ['12']);
  assert.deepEqual(marker.baselineIssueCommentIds, ['1']);
});

test('trusted scheduled reconciliation requests Codex for non-codex open PRs and deduplicates the target', async () => {
  const issueComments = [];
  let nextId = 200;
  const pull = {
    number: 44,
    state: 'open',
    draft: false,
    head: { sha: A, ref: 'feature/manual-pr' },
    base: { sha: BASE1 },
  };
  const api = {
    listOpenPulls: async () => [pull],
    getPull: async () => pull,
    listIssueComments: async () => [...issueComments],
    listReviews: async () => [],
    listReviewComments: async () => [],
    createIssueComment: async (_number, body) => {
      const comment = { id: nextId++, body, user: { login: OWNER }, created_at: '2026-08-22T12:00:00Z' };
      issueComments.push(comment);
      return comment;
    },
  };
  const summary = { reviewRequests: [], errors: [] };
  const logger = { log() {}, error() {} };
  const first = await reconcileOpenPullReviewRequests({ api, owner: OWNER, summary, logger });
  const second = await reconcileOpenPullReviewRequests({ api, owner: OWNER, summary, logger });

  assert.deepEqual(first, { scanned: 1, created: 1 });
  assert.deepEqual(second, { scanned: 1, created: 0 });
  assert.equal(issueComments.length, 1);
  assert.equal(summary.reviewRequests.length, 1);
  const marker = parseCodexReviewRequest(issueComments[0].body);
  assert.equal(marker.pr, 44);
  assert.equal(marker.head, A);
  assert.equal(marker.baseSha, BASE1);
});
