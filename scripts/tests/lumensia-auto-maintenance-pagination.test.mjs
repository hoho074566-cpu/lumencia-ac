import assert from 'node:assert/strict';
import test from 'node:test';
import { createMaintenanceGitHubClient } from '../lumensia-auto-maintenance-run.mjs';

function okJson(data) {
  return { ok: true, status: 200, json: async () => data };
}

test('pull-file reader stops at GitHub 3000-file cap without page 31', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    return okJson(Array.from({ length: 100 }, (_, index) => ({ filename: `docs/${urls.length}-${index}.md` })));
  };
  const api = createMaintenanceGitHubClient({ token: 'pat', owner: 'owner', repo: 'repo', fetchImpl });
  const files = await api.listPullFiles(7);
  assert.equal(files.length, 3000);
  assert.equal(urls.length, 30);
  assert.match(urls.at(-1), /page=30$/);
  assert.equal(urls.some((url) => /page=31(?:&|$)/.test(url)), false);
});

test('pull-file reader stops early when a page is short', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    const size = urls.length === 1 ? 100 : 12;
    return okJson(Array.from({ length: size }, (_, index) => ({ filename: `docs/${urls.length}-${index}.md` })));
  };
  const api = createMaintenanceGitHubClient({ token: 'pat', owner: 'owner', repo: 'repo', fetchImpl });
  const files = await api.listPullFiles(8);
  assert.equal(files.length, 112);
  assert.equal(urls.length, 2);
});
