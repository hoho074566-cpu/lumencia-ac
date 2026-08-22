import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_AUTO_MERGE_CODE_FILES,
  MAX_AUTO_MERGE_LINE_CHANGES,
  autoMergeBreadth,
  decideMaintenanceAction,
  protectedMergeReason,
} from '../lumensia-auto-maintenance.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BASE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function pull(extra = {}) {
  return {
    number: 21,
    state: 'open',
    draft: false,
    mergeable: true,
    mergeable_state: 'clean',
    head: { ref: 'codex/test', sha: HEAD },
    base: { ref: 'main', sha: BASE },
    ...extra,
  };
}

const checks = { safety: 'PASS', vercel: 'PASS', required: 'PASS' };
const readiness = { state: 'READY', conflict: 'NONE' };
const cleanCodex = { state: 'PASS', P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 };

function decide({ codex = cleanCodex, files = [] } = {}) {
  return decideMaintenanceAction({
    pull: pull(),
    codex,
    checks,
    readiness,
    files,
    fixRequests: [],
    mergeTokenAvailable: true,
  });
}

test('unknown Codex severity is persistent human-required, never mergeable', () => {
  const result = decide({ codex: { ...cleanCodex, unknown: 1 } });
  assert.equal(result.action, 'HUMAN');
  assert.equal(result.reason, 'codex-unknown');
});

test('environment configuration patterns are protected', () => {
  for (const path of ['.env', '.env.example', '.env.local', 'config/.env.production', 'config/runtime.env']) {
    assert.equal(protectedMergeReason(path), 'environment-config', path);
  }
  assert.equal(protectedMergeReason('docs/environment.md'), '');
});

test('breadth gate permits the exact file threshold and blocks one file above it', () => {
  const atLimit = Array.from({ length: MAX_AUTO_MERGE_CODE_FILES }, (_, i) => ({ filename: `lib/module-${i}.js`, changes: 1 }));
  assert.deepEqual(autoMergeBreadth(atLimit), { codeFiles: MAX_AUTO_MERGE_CODE_FILES, lineChanges: MAX_AUTO_MERGE_CODE_FILES });
  assert.equal(decide({ files: atLimit }).action, 'MERGE');

  const overLimit = [...atLimit, { filename: 'lib/too-many.js', changes: 1 }];
  const result = decide({ files: overLimit });
  assert.equal(result.action, 'HUMAN');
  assert.equal(result.reason, 'high-risk-breadth');
});

test('breadth gate permits 500 code line changes and blocks 501', () => {
  const atLimit = [{ filename: 'lib/focused.js', changes: MAX_AUTO_MERGE_LINE_CHANGES }];
  assert.equal(decide({ files: atLimit }).action, 'MERGE');

  const overLimit = [{ filename: 'lib/focused.js', changes: MAX_AUTO_MERGE_LINE_CHANGES + 1 }];
  const result = decide({ files: overLimit });
  assert.equal(result.action, 'HUMAN');
  assert.equal(result.reason, 'high-risk-breadth');
});

test('docs and assets remain exempt from breadth accounting', () => {
  const files = [
    ...Array.from({ length: 30 }, (_, i) => ({ filename: `docs/page-${i}.md`, changes: 1000 })),
    ...Array.from({ length: 30 }, (_, i) => ({ filename: `assets/image-${i}.webp`, changes: 1000 })),
  ];
  assert.deepEqual(autoMergeBreadth(files), { codeFiles: 0, lineChanges: 0 });
  assert.equal(decide({ files }).action, 'MERGE');
});
