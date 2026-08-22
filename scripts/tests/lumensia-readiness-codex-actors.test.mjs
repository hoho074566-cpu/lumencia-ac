import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/lumensia-merge-readiness.yml', 'utf8');
const expected = 'CODEX_ACTORS: ${{ vars.CODEX_REVIEW_ACTORS }},chatgpt-codex-connector[bot],chatgpt-codex-connector';

test('merge readiness always includes the trusted Codex connector actors', () => {
  assert.equal(workflow.split(expected).length - 1, 2);
  assert.match(workflow, /github\.actor == 'chatgpt-codex-connector\[bot\]'/);
  assert.match(workflow, /github\.actor == 'chatgpt-codex-connector'/);
});
