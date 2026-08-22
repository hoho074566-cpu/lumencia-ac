import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
import { AUTO_PR_MARKER, DISCORD_DELIVERED_MARKER } from '../lumensia-auto-pr.mjs';

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

test('stalled same-head fix escalates instead of spamming Codex', () => {
  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex('BLOCK', { P1: 1 }), checks: checks(), readiness: { state: 'BLOCKED' }, files: [],
    fixRequests: [fixEntry(1, HEAD, '2026-08-23T00:00:00Z')], now: new Date(`2026-08-23T00:${FIX_STALL_MINUTES}:01Z`),
  });
  assert.equal(decision.action, 'HUMAN');
  assert.equal(decision.reason, 'fix-stalled');
});

test('P0/P1 loop stops after five requests', () => {
  const fixRequests = Array.from({ length: MAX_AUTO_FIX_ATTEMPTS }, (_, index) => fixEntry(index + 1));
  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex('BLOCK', { P1: 1 }), checks: checks(), readiness: { state: 'BLOCKED' }, files: [], fixRequests,
  });
  assert.equal(decision.action, 'HUMAN');
  assert.equal(decision.reason, 'max-fix-attempts');
});

test('low-risk ready Auto-PR may auto-merge only from clean merge state', () => {
  const merge = decideMaintenanceAction({
    pull: pull(), codex: codex(), checks: checks(), readiness: ready,
    files: [{ filename: 'docs/guide.md' }, { filename: 'assets/characters-v2/test.webp' }], fixRequests: [], mergeTokenAvailable: true,
  });
  assert.deepEqual(merge, { action: 'MERGE' });

  for (const mergeable_state of ['unstable', 'behind', 'blocked', 'dirty']) {
    const decision = decideMaintenanceAction({
      pull: pull({ mergeable_state }), codex: codex(), checks: checks(), readiness: ready,
      files: [{ filename: 'docs/guide.md' }], fixRequests: [], mergeTokenAvailable: true,
    });
    assert.deepEqual(decision, { action: 'WAIT', reason: 'merge-state-not-clean' });
  }
  assert.deepEqual(decideMaintenanceAction({
    pull: pull({ mergeable: null }), codex: codex(), checks: checks(), readiness: ready,
    files: [{ filename: 'docs/guide.md' }], fixRequests: [], mergeTokenAvailable: true,
  }), { action: 'WAIT', reason: 'merge-state-not-clean' });
});

test('protected core and automation paths always require human merge', () => {
  const protectedFiles = [
    'api/chat.js',
    'app.js',
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

  const decision = decideMaintenanceAction({
    pull: pull(), codex: codex(), checks: checks(), readiness: ready,
    files: [{ filename: 'scripts/lumensia-auto-maintenance-run.mjs' }], fixRequests: [], mergeTokenAvailable: true,
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
