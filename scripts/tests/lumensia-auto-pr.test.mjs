import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AUTO_PR_MARKER,
  deliverDiscord,
  isCandidateBranch,
  isFresh,
  makeBody,
  makeTitle,
  scanAutoPulls,
} from '../lumensia-auto-pr.mjs';

const NOW = new Date('2026-08-22T12:00:00Z');
const recent = '2026-08-22T11:00:00Z';
const stale = '2026-08-20T11:00:00Z';

function comparison(name, { date = recent, status = 'ahead', ahead = 1 } = {}) {
  return {
    status,
    ahead_by: ahead,
    total_commits: ahead,
    commits: ahead ? [{ sha: `${name.replace(/\W/g, '')}1234567890`, commit: { message: `feat: ${name}`, committer: { date } } }] : [],
    head_commit: ahead ? { sha: `${name.replace(/\W/g, '')}1234567890`, commit: { message: `feat: ${name}`, committer: { date } } } : null,
  };
}

function harness({ branches = ['codex/feature'], comparisons = {}, existing = {}, createError = {}, validateError, webhook = '', discordFetch } = {}) {
  const pulls = new Map(Object.entries(existing));
  const calls = { create: [], update: [], pulls: [], discord: 0 };
  const api = {
    validate: async () => { if (validateError) throw validateError; },
    listBranches: async () => branches.map((name) => ({ name, commit: { sha: `${name}sha` } })),
    compare: async (_base, name) => {
      const value = comparisons[name] ?? comparison(name);
      if (value instanceof Error) throw value;
      return value;
    },
    listPulls: async (name) => { calls.pulls.push(name); return pulls.get(name) || []; },
    createPull: async (payload) => {
      calls.create.push(payload);
      if (createError[payload.head]) throw createError[payload.head];
      const pull = { number: calls.create.length, html_url: `https://example.test/pull/${calls.create.length}`, state: 'open', title: payload.title, body: payload.body, head: { sha: `${payload.head}-sha` } };
      pulls.set(payload.head, [pull]);
      return pull;
    },
    updatePull: async (number, payload) => {
      calls.update.push({ number, payload });
      for (const branchPulls of pulls.values()) {
        const pull = branchPulls.find((item) => item.number === number);
        if (pull) Object.assign(pull, payload);
      }
    },
  };
  const logs = [];
  const logger = { log: (v) => logs.push(String(v)), warn: (v) => logs.push(String(v)), error: (v) => logs.push(String(v)) };
  const wrappedDiscord = discordFetch && (async (...args) => { calls.discord += 1; return discordFetch(...args); });
  const run = (token = 'test-token') => scanAutoPulls({ token, owner: 'hoho074566-cpu', repo: 'lumencia-ac', api, webhook, now: NOW, logger, discordFetch: wrappedDiscord });
  return { run, api, pulls, calls, logs };
}

test('codex branch ahead of main with no PR is eligible and creates exactly once', async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.eligible, 1);
  assert.equal(result.created.length, 1);
  assert.deepEqual(h.calls.create[0], { title: 'feat: codex/feature', body: makeBody('codex/feature', 'codexfeature1234567890'), head: 'codex/feature', base: 'main', draft: false });
});

test('non-codex branches and main are ignored', async () => {
  const h = harness({ branches: ['main', 'feature/x', 'dependabot/npm', 'asset-studio/a'] });
  const result = await h.run();
  assert.equal(result.skipped.scope, 4);
  assert.equal(h.calls.create.length, 0);
  assert.equal(isCandidateBranch('main'), false);
});

test('an OPEN PR prevents creation', async () => {
  const h = harness({ existing: { 'codex/feature': [{ state: 'open' }] } });
  assert.equal((await h.run()).skipped.existing, 1);
  assert.equal(h.calls.create.length, 0);
});

test('a CLOSED or MERGED PR prevents creation under V1.1 policy', async () => {
  const h = harness({ branches: ['codex/closed', 'codex/merged'], existing: { 'codex/closed': [{ state: 'closed' }], 'codex/merged': [{ state: 'closed', merged_at: recent }] } });
  assert.equal((await h.run()).skipped.existing, 2);
  assert.equal(h.calls.create.length, 0);
});

test('stale branches are ignored while recent branches remain eligible', async () => {
  const h = harness({ branches: ['codex/stale', 'codex/recent'], comparisons: { 'codex/stale': comparison('stale', { date: stale }) } });
  const result = await h.run();
  assert.equal(result.skipped.stale, 1);
  assert.deepEqual(result.created.map((item) => item.branch), ['codex/recent']);
  assert.equal(isFresh(stale, NOW), false);
  assert.equal(isFresh(recent, NOW), true);
});

test('not-ahead and empty comparisons are ignored', async () => {
  const h = harness({ branches: ['codex/equal'], comparisons: { 'codex/equal': comparison('equal', { status: 'identical', ahead: 0 }) } });
  assert.equal((await h.run()).skipped.notAhead, 1);
});

test('a diverged branch with commits not in main remains eligible', async () => {
  const h = harness({ comparisons: { 'codex/feature': comparison('feature', { status: 'diverged', ahead: 2 }) } });
  const result = await h.run();
  assert.equal(result.eligible, 1);
  assert.equal(result.created.length, 1);
});

test('a diverged branch without unique commits remains ineligible', async () => {
  const h = harness({ comparisons: { 'codex/feature': comparison('feature', { status: 'diverged', ahead: 0 }) } });
  const result = await h.run();
  assert.equal(result.skipped.notAhead, 1);
  assert.equal(result.created.length, 0);
});

test('a repeated scan cannot duplicate a PR', async () => {
  const h = harness();
  await h.run();
  await h.run();
  assert.equal(h.calls.create.length, 1);
});

test('the immediate second existence check handles a race as a no-op', async () => {
  const h = harness();
  let queries = 0;
  h.api.listPulls = async () => ++queries === 1 ? [] : [{ state: 'open' }];
  const result = await h.run();
  assert.equal(result.skipped.race, 1);
  assert.equal(h.calls.create.length, 0);
});

test('GitHub already-exists response is a safe no-op', async () => {
  const error = Object.assign(new Error('unprocessable'), { status: 422, data: { errors: [{ message: 'A pull request already exists for this head' }] } });
  const h = harness({ createError: { 'codex/feature': error } });
  const result = await h.run();
  assert.equal(result.skipped.race, 1);
  assert.equal(result.errors.length, 0);
});

test('-no-pr marker opts a branch out before metadata inspection', async () => {
  const h = harness({ branches: ['codex/experiment-no-pr', 'codex/-no-pr-test'] });
  const result = await h.run();
  assert.equal(result.skipped.optOut, 2);
  assert.equal(h.calls.pulls.length, 0);
});

test('missing token exits cleanly without API calls or creation', async () => {
  const h = harness();
  h.api.validate = async () => assert.fail('API must not be called');
  const result = await h.run('');
  assert.equal(result.disabled, true);
  assert.match(h.logs.join('\n'), /AUTO PR DISABLED \/ missing/);
  assert.equal(h.calls.create.length, 0);
});

test('token 401 and 403 are sanitized permission errors', async () => {
  for (const status of [401, 403]) {
    const h = harness({ validateError: Object.assign(new Error('contains-secret-value'), { status }) });
    const result = await h.run('secret-value');
    assert.equal(result.disabled, true);
    assert.match(h.logs.join('\n'), /AUTO PR DISABLED \/ TOKEN PERMISSION ERROR/);
    assert.doesNotMatch(h.logs.join('\n'), /secret-value/);
  }
});

test('one candidate failure is isolated and the next candidate is evaluated', async () => {
  const h = harness({ branches: ['codex/broken', 'codex/good'], comparisons: { 'codex/broken': new Error('broken') } });
  const result = await h.run();
  assert.equal(result.errors.length, 1);
  assert.deepEqual(result.created.map((item) => item.branch), ['codex/good']);
});

test('title and body are deterministic, bounded, and contain no supplied secret', () => {
  assert.equal(makeTitle('codex/readable-name', 'WIP'), 'readable name');
  assert.equal(makeTitle('codex/readable-name', 'feat: useful change'), 'feat: useful change');
  assert.ok(makeTitle('codex/x', 'x'.repeat(300)).length <= 120);
  const body = makeBody('codex/feature`name', 'abc1234-not-a-sha');
  assert.match(body, new RegExp(AUTO_PR_MARKER));
  assert.doesNotMatch(body, /test-token|Authorization|Bearer/);
  assert.doesNotMatch(body, /`codex\/feature`name`/);
  assert.match(body, /Manual merge only/);
});

test('missing Discord does not undo successful PR creation', async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.created.length, 1);
  assert.match(h.logs.join('\n'), /notification disabled/);
});

test('Discord failure is sanitized and does not undo PR success', async () => {
  const webhook = 'https://discord.test/WEBHOOK-SECRET';
  const h = harness({ webhook, discordFetch: async () => ({ ok: false, status: 500 }) });
  const result = await h.run();
  assert.equal(result.created.length, 1);
  assert.equal(h.calls.discord, 1);
  assert.match(h.logs.join('\n'), /HTTP 500/);
  assert.doesNotMatch(h.logs.join('\n'), /WEBHOOK-SECRET/);
});

test('failed creation notification is retried once and stops after successful delivery', async () => {
  let successfulDeliveries = 0;
  let attempts = 0;
  const h = harness({
    webhook: 'https://discord.test/webhook',
    discordFetch: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 503 };
      successfulDeliveries += 1;
      return { ok: true };
    },
  });
  await h.run();
  await h.run();
  await h.run();
  assert.equal(h.calls.create.length, 1);
  assert.equal(h.calls.discord, 2);
  assert.equal(successfulDeliveries, 1);
  assert.equal(h.calls.update.length, 1);
  assert.match(h.calls.update[0].payload.body, /lumensia-auto-pr-discord:delivered/);
});

test('Discord network errors expose only the error type', async () => {
  const logs = [];
  await deliverDiscord('secret-webhook', { number: 1, title: 'title', html_url: 'https://example.test/1' }, 'codex/test', 'abcdef1', async () => { throw Object.assign(new Error('secret-webhook'), { name: 'TypeError' }); }, { warn: (value) => logs.push(value) });
  assert.match(logs.join('\n'), /TypeError/);
  assert.doesNotMatch(logs.join('\n'), /secret-webhook/);
});

test('Discord disables mention parsing for untrusted title and branch text', async () => {
  let payload;
  const response = await deliverDiscord(
    'secret-webhook',
    { number: 1, title: '@everyone @here', html_url: 'https://example.test/1' },
    'codex/@everyone-@here',
    'abcdef1',
    async (_url, options) => { payload = JSON.parse(options.body); return { ok: true }; },
  );
  assert.equal(response.delivered, true);
  assert.match(payload.content, /@everyone @here/);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test('workflow statically checks out and executes only trusted main automation', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/lumensia-auto-pr.yml', import.meta.url), 'utf8');
  assert.match(workflow, /schedule:\s*\n\s*- cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /workflow_run:\s*\n\s*workflows: \['Lumensia Merge Readiness'\]\s*\n\s*types: \[completed\]/);
  assert.match(workflow, /issue_comment:\s*\n\s*types: \[created\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.event_name == 'workflow_run' && github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event_name == 'issue_comment'/);
  assert.match(workflow, /github\.actor == 'chatgpt-codex-connector\[bot\]'/);
  assert.match(workflow, /github\.actor == 'chatgpt-codex-connector'/);
  assert.match(workflow, /github\.actor == github\.repository_owner && contains\(github\.event\.comment\.body, 'lumensia-maintenance-kick:v1'\)/);
  assert.match(workflow, /environment: lumensia-trusted-auto-pr/);
  assert.match(workflow, /ref: refs\/heads\/main/);
  assert.match(workflow, /sparse-checkout: scripts\/lumensia-auto-pr\.mjs/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /pull_request(?:_target)?:|push:/);
  assert.doesNotMatch(workflow, /ref:\s*\$\{\{[^}]*head/);
  assert.doesNotMatch(workflow, /GITHUB_TOKEN/);
  assert.match(workflow, /LUMENSIA_PR_CREATOR_TOKEN/);
  assert.match(workflow, /cancel-in-progress: false/);
});
