import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/lumensia-merge-readiness.yml', import.meta.url), 'utf8');
const job = workflow.split(/\n  maintain-after-pr:\n/)[1] || '';

test('direct maintenance remains serialized and trusted after PR or scan evaluation', () => {
  assert.match(job, /needs: \[evaluate-pr, evaluate-scan\]/);
  assert.match(job, /needs\.evaluate-pr\.result == 'success' \|\| needs\.evaluate-scan\.result == 'success'/);
  assert.match(job, /group: lumensia-auto-pr-scan/);
  assert.match(job, /cancel-in-progress: false/);
  assert.match(job, /environment: lumensia-trusted-auto-pr/);
  assert.match(job, /ref: refs\/heads\/\$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(job, /persist-credentials: false/);
  assert.doesNotMatch(job, /github\.event\.pull_request\.head|github\.head_ref|refs\/pull\//);
});

test('direct maintenance verifies its PAT and retries once after a short delay', () => {
  assert.match(job, /issues: write/);
  assert.match(job, /Verify trusted maintenance token/);
  assert.match(job, /LUMENSIA_PR_CREATOR_TOKEN is unavailable to direct maintenance/);
  assert.equal((job.match(/node scripts\/lumensia-auto-maintenance-run\.mjs/g) || []).length, 2);
  assert.match(job, /sleep 5/);
  assert.match(job, /direct maintenance revalidation/);
});

test('direct maintenance publishes a sticky sanitized execution summary for direct or safety workflow events', () => {
  assert.match(job, /Publish direct maintenance status/);
  assert.match(job, /if: always\(\)/);
  assert.match(job, /uses: actions\/github-script@v7/);
  assert.match(job, /lumensia-auto-maintenance-status:v1/);
  assert.match(job, /github\.event\.workflow_run\.pull_requests\[0\]\.number/);
  assert.match(job, /safeLog = log\.replace/);
  assert.match(job, /github\.rest\.issues\.updateComment/);
  assert.match(job, /github\.rest\.issues\.createComment/);
});
