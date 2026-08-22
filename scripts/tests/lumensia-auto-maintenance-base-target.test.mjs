import assert from 'node:assert/strict';
import test from 'node:test';
import { isAutoManagedPull } from '../lumensia-auto-maintenance.mjs';
import { AUTO_PR_MARKER, DISCORD_DELIVERED_MARKER } from '../lumensia-auto-pr.mjs';

const OWNER = 'hoho074566-cpu';
const REPO = 'lumencia-ac';
const FULL = `${OWNER}/${REPO}`;

function pull(baseRef = 'main') {
  return {
    state: 'open',
    draft: false,
    body: `${AUTO_PR_MARKER}\n${DISCORD_DELIVERED_MARKER}`,
    user: { login: OWNER },
    head: { ref: 'codex/target-test', sha: 'a'.repeat(40), repo: { full_name: FULL } },
    base: { ref: baseRef, sha: 'b'.repeat(40), repo: { full_name: FULL } },
  };
}

test('only main-targeted Auto-PRs are eligible for V1.2 maintenance', () => {
  assert.equal(isAutoManagedPull(pull('main'), OWNER, REPO), true);
  assert.equal(isAutoManagedPull(pull('release'), OWNER, REPO), false);
  assert.equal(isAutoManagedPull(pull('develop'), OWNER, REPO), false);
});
