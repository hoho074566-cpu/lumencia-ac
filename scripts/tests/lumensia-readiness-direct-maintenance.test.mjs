import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/lumensia-merge-readiness.yml', import.meta.url), 'utf8');

test('Merge Readiness directly follows a successful single-PR evaluation with trusted maintenance', () => {
  assert.match(workflow, /maintain-after-pr:\s*\n\s*needs: evaluate-pr/);
  assert.match(workflow, /if: always\(\) && needs\.evaluate-pr\.result == 'success'/);
  assert.match(workflow, /environment: lumensia-trusted-auto-pr/);
  assert.match(workflow, /permissions:\s*\n\s*contents: write\s*\n\s*checks: read\s*\n\s*statuses: read/);
  assert.match(workflow, /LUMENSIA_AUTO_MERGE_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /LUMENSIA_PR_CREATOR_TOKEN: \$\{\{ secrets\.LUMENSIA_PR_CREATOR_TOKEN \}\}/);
  assert.match(workflow, /run: node scripts\/lumensia-auto-maintenance-run\.mjs/);
});

test('direct maintenance executes only trusted default-branch automation scripts', () => {
  const job = workflow.split(/\n  maintain-after-pr:\n/)[1] || '';
  assert.match(job, /ref: refs\/heads\/\$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(job, /scripts\/lumensia-auto-pr\.mjs/);
  assert.match(job, /scripts\/lumensia-auto-maintenance\.mjs/);
  assert.match(job, /scripts\/lumensia-auto-maintenance-run\.mjs/);
  assert.match(job, /scripts\/lumensia-merge-readiness\.mjs/);
  assert.match(job, /persist-credentials: false/);
  assert.doesNotMatch(job, /github\.event\.pull_request\.head|github\.head_ref|refs\/pull\//);
});

test('readiness evaluator keeps workflow-level contents read permission', () => {
  const header = workflow.split(/\njobs:\n/)[0] || '';
  assert.match(header, /permissions:\s*\n\s*contents: read/);
});
