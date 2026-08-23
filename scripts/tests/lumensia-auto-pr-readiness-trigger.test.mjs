import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflowUrl = new URL('../../.github/workflows/lumensia-auto-pr.yml', import.meta.url);
const workflow = readFileSync(workflowUrl, 'utf8');

test('Auto PR keeps cron fallback and reacts to completed Merge Readiness runs', () => {
  assert.match(workflow, /schedule:\s*\n\s*- cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /workflow_run:\s*\n\s*workflows: \['Lumensia Merge Readiness'\]\s*\n\s*types: \[completed\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if: github\.event_name != 'workflow_run' \|\| github\.event\.workflow_run\.conclusion == 'success'/);
});

test('Auto PR event-driven path still uses trusted environment and default-branch scripts', () => {
  assert.match(workflow, /environment: lumensia-trusted-auto-pr/);
  assert.match(workflow, /ref: refs\/heads\/main/);
  assert.match(workflow, /run: node scripts\/lumensia-auto-maintenance-run\.mjs/);
});
