import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoMergeStateAllowed,
  decideMaintenanceAction,
} from '../lumensia-auto-maintenance.mjs';

const PASS = { safety: 'PASS', vercel: 'PASS', required: 'PASS' };
const DOC_FILE = { filename: 'docs/v12-auto-merge-smoke.txt', additions: 1, deletions: 0, changes: 1 };

function pull(mergeableState = 'unstable') {
  return {
    mergeable: true,
    mergeable_state: mergeableState,
    changed_files: 1,
    head: { sha: 'a'.repeat(40) },
  };
}

test('unstable is auto-merge eligible only after every authoritative check passes', () => {
  assert.equal(autoMergeStateAllowed(pull('unstable'), PASS), true);
  assert.equal(autoMergeStateAllowed(pull('unstable'), { ...PASS, safety: 'PENDING' }), false);
  assert.equal(autoMergeStateAllowed(pull('unstable'), { ...PASS, safety: 'FAIL' }), false);
  assert.equal(autoMergeStateAllowed(pull('unstable'), { ...PASS, vercel: 'PENDING' }), false);
  assert.equal(autoMergeStateAllowed(pull('unstable'), { ...PASS, required: 'PENDING' }), false);
  assert.equal(autoMergeStateAllowed(pull('unstable'), { ...PASS, required: 'FAIL' }), false);
});

test('only clean or fully-authoritative unstable merge states are eligible', () => {
  assert.equal(autoMergeStateAllowed(pull('clean'), PASS), true);
  for (const state of ['behind', 'blocked', 'dirty', 'unknown', '', null]) {
    assert.equal(autoMergeStateAllowed(pull(state), PASS), false, `state=${state}`);
  }
  assert.equal(autoMergeStateAllowed({ ...pull('clean'), mergeable: false }, PASS), false);
});

test('READY low-risk docs PR may MERGE from unstable after exact authoritative PASS', () => {
  const result = decideMaintenanceAction({
    pull: pull('unstable'),
    codex: { state: 'PASS', P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 },
    checks: PASS,
    readiness: { state: 'READY' },
    files: [DOC_FILE],
    fixRequests: [],
    mergeTokenAvailable: true,
  });
  assert.deepEqual(result, { action: 'MERGE' });
});

test('unstable remains WAIT when an authoritative signal is not PASS', () => {
  const result = decideMaintenanceAction({
    pull: pull('unstable'),
    codex: { state: 'PASS', P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 },
    checks: { ...PASS, vercel: 'PENDING' },
    readiness: { state: 'READY' },
    files: [DOC_FILE],
    fixRequests: [],
    mergeTokenAvailable: true,
  });
  assert.equal(result.action, 'WAIT');
  assert.equal(result.reason, 'merge-state-not-safe');
});
