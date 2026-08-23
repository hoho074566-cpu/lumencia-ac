import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contract = readFileSync('docs/v156-npc-goal-v2-task.txt','utf8');

test('V1.5.6 contract preserves the one-call and guarded-goal invariants', () => {
  assert.match(contract,/exactly one canonical core\/model call/i);
  assert.match(contract,/goal_progress_delta/);
  assert.match(contract,/completed => 100/);
  assert.match(contract,/goal_history\s*\(max 6\)|goal_history capped to 6/);
  assert.match(contract,/must not bypass direct-focus/);
  assert.match(contract,/goal_replace/);
  assert.match(contract,/completed->active is allowed ONLY/i);
  assert.match(contract,/app 1\.5\.6/);
  assert.match(contract,/API adapter 0\.8\.2/);
});
