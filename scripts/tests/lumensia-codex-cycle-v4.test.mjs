import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureCodexReviewRequest,
  findLatestCodexReviewRequest,
  makeCodexReviewRequestBody,
  parseCodexReviewRequest,
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

function requestComment(id, head, baselineIssueCommentIds = []) {
  const body = makeCodexReviewRequestBody({
    prNumber: 16,
    head,
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

test('v4 request marker round-trips and requires trusted author when selected', () => {
  const comment = requestComment(10, A, ['1', '2']);
  assert.equal(parseCodexReviewRequest(comment.body).head, A);
  assert.equal(parseTrustedCodexReviewRequest(comment.body).head, A);
  assert.equal(findLatestCodexReviewRequest([comment], 16, OWNER).comment.id, 10);
  assert.equal(findLatestTrustedCodexReviewRequest([comment], 16, OWNER).comment.id, 10);
  assert.equal(findLatestTrustedCodexReviewRequest([{ ...comment, user: { login: 'attacker' } }], 16, OWNER), null);
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

test('trusted scanner creates one request per HEAD occurrence and a fresh request on A-B-A', async () => {
  let head = A;
  let nextId = 100;
  const issueComments = [];
  const api = {
    getPull: async () => ({ number: 16, state: 'open', draft: false, head: { sha: head } }),
    listIssueComments: async () => [...issueComments],
    listReviews: async () => [],
    listReviewComments: async () => [],
    createIssueComment: async (_number, body) => {
      const comment = { id: nextId++, body, user: { login: OWNER } };
      issueComments.push(comment);
      return comment;
    },
  };
  const pull = () => ({ number: 16, state: 'open', draft: false, head: { sha: head } });
  const firstA = await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } });
  const duplicateA = await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } });
  assert.equal(firstA.created, true);
  assert.equal(duplicateA.created, false);
  assert.equal(issueComments.length, 1);

  head = B;
  assert.equal((await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } })).created, true);
  head = A;
  assert.equal((await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } })).created, true);
  assert.equal(issueComments.length, 3);
  assert.equal(parseCodexReviewRequest(issueComments.at(-1).body).head, A);
  assert.notEqual(parseCodexReviewRequest(issueComments[0].body).generationKey, parseCodexReviewRequest(issueComments.at(-1).body).generationKey);
});

test('scanner request carries immutable baselines', async () => {
  const comments = [{ id: 1, body: 'old', user: { login: CODEX } }];
  let posted;
  const api = {
    getPull: async () => ({ number: 16, state: 'open', draft: false, head: { sha: A } }),
    listIssueComments: async () => [...comments],
    listReviews: async () => [{ id: 11 }],
    listReviewComments: async () => [{ id: 12 }],
    createIssueComment: async (_number, body) => (posted = { id: 13, body, user: { login: OWNER } }),
  };
  await ensureCodexReviewRequest({ api, pull: { number: 16, state: 'open', draft: false, head: { sha: A } }, owner: OWNER, logger: { log() {} } });
  const marker = parseCodexReviewRequest(posted.body);
  assert.deepEqual(marker.baselineReviewIds, ['11']);
  assert.deepEqual(marker.baselineReviewCommentIds, ['12']);
  assert.deepEqual(marker.baselineIssueCommentIds, ['1']);
});
