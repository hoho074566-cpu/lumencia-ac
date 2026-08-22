import assert from 'node:assert/strict';
import test from 'node:test';
import { isCodexActor } from '../lumensia-merge-readiness.mjs';

test('official Codex connector actors are trusted without repo variable configuration', () => {
  assert.equal(isCodexActor({ login: 'chatgpt-codex-connector[bot]' }, ''), true);
  assert.equal(isCodexActor({ login: 'chatgpt-codex-connector' }, ''), true);
});

test('configured actors extend built-in Codex actors without broad matching', () => {
  assert.equal(isCodexActor({ login: 'trusted-codex[bot]' }, 'trusted-codex[bot]'), true);
  assert.equal(isCodexActor({ login: 'helpful-codex-reviewer' }, ''), false);
  assert.equal(isCodexActor({ login: 'chatgpt-codex-connector-evil' }, ''), false);
});
