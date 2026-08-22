import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { protectedMergeReason } from '../lumensia-auto-maintenance.mjs';

const workflow = readFileSync(new URL('../../.github/workflows/lumensia-auto-pr.yml', import.meta.url), 'utf8');

test('scene continuity runtime is human-merge only', () => {
  assert.notEqual(protectedMergeReason('lib/scene-continuity.js'), '');
});

test('nested AGENTS.md policy files are human-merge only', () => {
  assert.notEqual(protectedMergeReason('lib/AGENTS.md'), '');
  assert.notEqual(protectedMergeReason('nested/deeper/AGENTS.md'), '');
});

test('V1.2 maintenance steps survive recoverable scanner failure', () => {
  const continueAfterFailure = "if: ${{ !cancelled() && steps.script.outputs.available == 'true' }}";
  assert.ok(workflow.split(continueAfterFailure).length - 1 >= 2);
  assert.ok(workflow.includes("if: ${{ !cancelled() && steps.script.outputs.available == 'true' && steps.maintenance.outputs.available == 'true' }}"));
});
