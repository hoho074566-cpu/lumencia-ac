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
  hasCodexCycleEcho,
  isCurrentCleanCodexComment,
  parseTrustedCodexReviewRequest,
} from '../lumensia-merge-readiness.mjs';

const OWNER = 'hoho074566-cpu';
const CODEX = 'chatgpt-codex-connector[bot]';
const ACTORS = CODEX;
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function requestComment(id, head, baselineIssueCommentIds = [], extra = {}) {
  const body = makeCodexReviewRequestBody({
    prNumber: 16,
    head,
    generationKey: `after-${id - 1}`,
    baselineReviewIds: [],
    baselineReviewCommentIds: [],
    baselineIssueCommentIds,
    ...extra,
  });
  return { id, body, user: { login: OWNER } };
}

function cleanComment(id, head, login = CODEX, extra = '') {
  return {
    id,
    body: `Codex Review: Didn't find any major issues. Bravo.\n\n**Reviewed commit:** \`${head.slice(0, 10)}\`${extra ? `\n\n${extra}` : ''}`,
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

test('trusted scanner creates one request per HEAD occurrence and requires echo on repeated A-B-A head', async () => {
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
  assert.equal(firstA.request.requireCycleEcho, false);
  assert.equal(duplicateA.created, false);
  assert.equal(issueComments.length, 1);

  head = B;
  const firstB = await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } });
  assert.equal(firstB.created, true);
  assert.equal(firstB.request.requireCycleEcho, false);

  head = A;
  const secondA = await ensureCodexReviewRequest({ api, pull: pull(), owner: OWNER, logger: { log() {} } });
  assert.equal(secondA.created, true);
  assert.equal(issueComments.length, 3);
  assert.equal(secondA.request.head, A);
  assert.equal(secondA.request.requireCycleEcho, true);
  assert.equal(secondA.request.cycleToken, 'pr-16-after-101');
  assert.ok(secondA.comment.body.includes('Lumensia-Review-Cycle: pr-16-after-101'));
  assert.notEqual(parseCodexReviewRequest(issueComments[0].body).generationKey, secondA.request.generationKey);
});

test('repeated HEAD cannot PASS on a late old clean result without current cycle echo', () => {
  const token = 'pr-16-after-101';
  const lateOld = cleanComment(200, A);
  const current = cleanComment(201, A, CODEX, `Lumensia-Review-Cycle: ${token}`);
  assert.equal(hasCodexCycleEcho(lateOld.body, token), false);
  assert.equal(hasCodexCycleEcho(current.body, token), true);
  assert.equal(evaluateCodex({
    head: A,
    issueComments: [lateOld],
    configuredActors: ACTORS,
    requireCycleEcho: true,
    cycleToken: token,
  }).state, 'PENDING');
  assert.equal(evaluateCodex({
    head: A,
    issueComments: [lateOld, current],
    configuredActors: ACTORS,
    requireCycleEcho: true,
    cycleToken: token,
  }).state, 'PASS');
});

test('repeated HEAD still blocks on a trusted P1 even before the echo arrives', () => {
  const reviews = [{ id: 70, commit_id: A, body: 'P1: blocker', state: 'COMMENTED', submitted_at: '2026-08-22T12:20:00Z', user: { login: CODEX } }];
  const result = evaluateCodex({
    head: A,
    reviews,
    configuredActors: ACTORS,
    requireCycleEcho: true,
    cycleToken: 'pr-16-after-101',
  });
  assert.equal(result.state, 'BLOCK');
  assert.equal(result.P1, 1);
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
