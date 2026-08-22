import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/lumensia-merge-readiness.yml', import.meta.url), 'utf8');

test('Merge Readiness always supplies both official Codex connector actors', () => {
  const expected = 'CODEX_ACTORS: ${{ vars.CODEX_REVIEW_ACTORS }},chatgpt-codex-connector[bot],chatgpt-codex-connector';
  assert.equal(workflow.split(expected).length - 1, 2);
});

test('issue-comment runner gate remains exact for official Codex actors', () => {
  assert.match(workflow, /github\.actor == 'chatgpt-codex-connector\[bot\]'/);
  assert.match(workflow, /github\.actor == 'chatgpt-codex-connector'/);
  assert.doesNotMatch(workflow, /startsWith\(github\.actor, 'chatgpt-codex-connector'/);
});
