import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCurrentBaseTarget } from '../lumensia-auto-pr.mjs';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

function pull() {
  return {
    head: { ref: 'codex/stale-or-moving-ref', sha: HEAD },
    base: { ref: 'main', sha: 'c'.repeat(40) },
  };
}

test('current-base resolution compares main against the immutable pull HEAD SHA', async () => {
  const calls = [];
  const api = {
    compare: async (base, head) => {
      calls.push([base, head]);
      return {
        status: 'ahead',
        ahead_by: 1,
        base_commit: { sha: BASE },
        merge_base_commit: { sha: BASE },
        commits: [{ sha: HEAD }],
      };
    },
  };

  const target = await resolveCurrentBaseTarget(api, pull());
  assert.deepEqual(calls, [['main', HEAD]]);
  assert.equal(target.head, HEAD);
  assert.equal(target.baseSha, BASE);
  assert.equal(target.mergeBaseSha, BASE);
});

test('production-shaped compare responses do not require a non-existent head_commit field', async () => {
  const target = await resolveCurrentBaseTarget({
    compare: async () => ({
      status: 'ahead',
      base_commit: { sha: BASE },
      merge_base_commit: { sha: BASE },
      commits: [{ sha: HEAD }],
    }),
  }, pull());

  assert.ok(target);
  assert.equal(target.head, HEAD);
});

test('missing authoritative base or merge-base still fails closed', async () => {
  assert.equal(await resolveCurrentBaseTarget({ compare: async () => ({ base_commit: { sha: BASE } }) }, pull()), null);
  assert.equal(await resolveCurrentBaseTarget({ compare: async () => ({ merge_base_commit: { sha: BASE } }) }, pull()), null);
});
