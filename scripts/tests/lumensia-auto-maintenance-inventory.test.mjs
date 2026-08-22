import assert from 'node:assert/strict';
import test from 'node:test';
import { decideMaintenanceAction, protectedMergeReason } from '../lumensia-auto-maintenance.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BASE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const cleanCodex = { state: 'PASS', P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 };
const checks = { safety: 'PASS', vercel: 'PASS', required: 'PASS' };
const readiness = { state: 'READY', conflict: 'NONE' };

function pull(changed_files) {
  return {
    number: 21,
    state: 'open',
    draft: false,
    mergeable: true,
    mergeable_state: 'clean',
    changed_files,
    head: { ref: 'codex/inventory-test', sha: HEAD },
    base: { ref: 'main', sha: BASE },
  };
}

function decide(changed_files, files) {
  return decideMaintenanceAction({
    pull: pull(changed_files),
    codex: cleanCodex,
    checks,
    readiness,
    files,
    fixRequests: [],
    mergeTokenAvailable: true,
  });
}

test('npm deployment metadata is human-merge only', () => {
  assert.equal(protectedMergeReason('npm-shrinkwrap.json'), 'core-or-config');
  assert.equal(protectedMergeReason('.npmrc'), 'core-or-config');
});

test('mismatched PR file inventory is human-required', () => {
  const result = decide(2, [{ filename: 'docs/visible.md', status: 'modified', changes: 1 }]);
  assert.equal(result.action, 'HUMAN');
  assert.equal(result.reason, 'file-inventory-incomplete');
});

test('matching complete low-risk inventory may continue to merge', () => {
  const result = decide(1, [{ filename: 'docs/visible.md', status: 'modified', changes: 1 }]);
  assert.deepEqual(result, { action: 'MERGE' });
});

test('invalid changed_files metadata fails closed', () => {
  const result = decide('not-a-number', [{ filename: 'docs/visible.md', status: 'modified', changes: 1 }]);
  assert.equal(result.action, 'HUMAN');
  assert.equal(result.reason, 'file-inventory-incomplete');
});
