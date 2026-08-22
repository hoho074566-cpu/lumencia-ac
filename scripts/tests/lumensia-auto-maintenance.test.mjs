import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTO_FIX_MARKER,
  FIX_STALL_MINUTES,
  MAX_AUTO_FIX_ATTEMPTS,
  decideMaintenanceAction,
  isAutoManagedPull,
  makeAutoFixRequestBody,
  parseAutoFixRequest,
  protectedMergePaths,
  protectedMergeReason,
  trustedAutoFixRequests,
  trustedCodexActors,
} from '../lumensia-auto-maintenance.mjs';
import { AUTO_PR_MARKER } from '../lumensia-auto-pr.mjs';

const OWNER = 'hoho074566-cpu';
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BASE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const pull = (extra = {}) => ({
  number: 21,
  state: 'open',
  draft: false,
  body: `test\n${AUTO_PR_MARKER}`,
  head: { ref: 'codex/feature-test', sha: HEAD },
  base: { ref: 'main', sha: BASE },
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

test('only marked codex Auto-PRs are managed', () => {
  assert.equal(isAutoManagedPull(pull()), true);
  assert.equal(isAutoManagedPull(pull({ body: 'manual PR' })), false);
  assert.equal(isAutoManagedPull(pull({ head: { ref: 'feature/manual', sha: HEAD } })), false);
  assert.equal(isAutoManagedPull(pull({ head: { ref: 'codex/feature-no-pr', sha: HEAD } })), false);
  assert.equal(isAutoManagedPull(pull({ draft: true })), false);
});

test('official Codex actors are always additive to configured actors', () => {
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
  assert.match(entry.comment.body, new RegExp(AUTO_FIX_MARKER.replace(':', '\\:')));
  assert.equal(trustedAutoFixRequests([entry.comment], 21, OWNER).length, 1);
  assert.equal(trustedAutoFixRequests([{ ...entry.comment, user: { login: 'attacker' } }], 21, OWNER).length, 0);
});

test('current P0/P1 requests one focused fix', () => {
  const decision = decideMaintenanceAction({
    pull: pull(),
    codex: codex('BLOCK', { P1: 1 }),
    checks: checks(),
    readiness: { state: 'BLOCKED' },
    files: [{ filename: 'docs/readme.md' }],
    fixRequests: [],
  });
  assert.deepEqual(decision, { action: 'FIX', attempt: 1 });
});

test('same-head fix is never duplicated while in flight', () => {
  const now = new Date('2026-08-23T00:10:00Z');
  const decision = decideMaintenanceAction({
    pull: pull(),
    codex: codex('BLOCK', { P0: 1 }),
    checks: checks(),
    readiness: { state: 'BLOCKED' },
    files: [],
    fixRequests: [fixEntry(1, HEAD, '2026-08-23T00:00:00Z')],
    now,
  });
  assert.deepEqual(decision, { action: 'WAIT', reason: 'fix-in-flight' });
});

test('stalled same-head fix escalates instead of spamming Codex', () => {
  const now = new Date(`2026-08-23T00:${FIX_STALL_MINUTES}:01Z`);
  const decision = decideMaintenanceAction({
    pull: pull(),
    codex: codex('BLOCK', { P1: 1 }),
    checks: checks(),
    readiness: { state: 'BLOCKED' },
    files: [],
    fixRequests: [fixEntry(1, HEAD, '2026-08-23T00:00:00Z')],
    now,
  });
  assert.equal(decision.action, 'HUMAN');
  assert.equal(decision.reason, 'fix-stalled');
});

test('P0/P1 loop stops after five requests', () => {
  const fixRequests = Array.from({ length: MAX_AUTO_FIX_ATTEMPTS }, (_, index) => fixEntry(index + 1));
  const decision = decideMaintenanceAction({
    pull: pull(),
    codex: codex('BLOCK', { P1: 1 }),
    checks: checks(),
    readiness: { state: 'BLOCKED' },
    files: [],
    fixRequests,
  });
  assert.equal(decision.action, 'HUMAN');
  assert.equal(decision.reason, 'max-fix-attempts');
});

test('authoritative failures require a person instead of auto-merge', () => {
  const decision = decideMaintenanceAction({
    pull: pull(),
    codex: codex(),
    checks: checks({ safety: 'FAIL' }),
    readiness: { state: 'BLOCKED' },
    files: [{ filename: 'docs/readme.md' }],
    fixRequests: [],
  });
  assert.equal(decision.action, 'HUMAN');
  assert.equal(decision.reason, 'authoritative-check-failed');
});

test('low-risk ready Auto-PR may auto-merge', () => {
  const decision = decideMaintenanceAction({
    pull: pull(),
    codex: codex(),
    checks: checks(),
    readiness: ready,
    files: [{ filename: 'docs/guide.md' }, { filename: 'assets/characters-v2/test.webp' }],
    fixRequests: [],
    mergeTokenAvailable: true,
  });
  assert.deepEqual(decision, { action: 'MERGE' });
});

test('protected paths always require human merge', () => {
  const protectedFiles = [
    'api/chat.js',
    'app.js',
    '.github/workflows/test.yml',
    'scripts/lumensia-auto-pr.mjs',
    'data/save-schema.json',
    'CANON/secret.md',
    'package-lock.json',
  ];
  for (const filename of protectedFiles) assert.notEqual(protectedMergeReason(filename), '');
  assert.equal(protectedMergeReason('docs/guide.md'), '');
  assert.equal(protectedMergeReason('assets/characters-v2/a.webp'), '');
  assert.equal(protectedMergePaths(protectedFiles).length, protectedFiles.length);

  const decision = decideMaintenanceAction({
    pull: pull(),
    codex: codex(),
    checks: checks(),
    readiness: ready,
    files: [{ filename: 'api/chat.js' }],
    fixRequests: [],
    mergeTokenAvailable: true,
  });
  assert.equal(decision.action, 'HUMAN');
  assert.equal(decision.reason, 'protected-paths');
});

test('missing merge token never degrades to an unsafe merge', () => {
  const decision = decideMaintenanceAction({
    pull: pull(),
    codex: codex(),
    checks: checks(),
    readiness: ready,
    files: [{ filename: 'docs/guide.md' }],
    fixRequests: [],
    mergeTokenAvailable: false,
  });
  assert.deepEqual(decision, { action: 'HUMAN', reason: 'merge-token-unavailable' });
});
