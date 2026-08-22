import assert from 'node:assert/strict';
import test from 'node:test';
import { protectedMergeReason } from '../lumensia-auto-maintenance.mjs';

test('event progress persistence is human-merge only', () => {
  assert.notEqual(protectedMergeReason('lib/event-progress.js'), '');
});
