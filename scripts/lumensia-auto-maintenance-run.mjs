#!/usr/bin/env node

import { createGitHubClient } from './lumensia-auto-pr.mjs';
import { logMaintenanceSummary, maintainAutoPulls } from './lumensia-auto-maintenance.mjs';

const API_ROOT = 'https://api.github.com';
const MAX_PULL_FILE_PAGES = 30;

export function createMaintenanceGitHubClient({ token, owner, repo, fetchImpl = fetch }) {
  const base = createGitHubClient({ token, owner, repo, fetchImpl });

  async function request(method, path, body) {
    const response = await fetchImpl(`${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`GitHub API request returned HTTP ${response.status}.`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function paginatePullFiles(number) {
    const items = [];
    for (let page = 1; page <= MAX_PULL_FILE_PAGES; page += 1) {
      const batch = await request('GET', `/pulls/${number}/files?per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return items;
  }

  return {
    ...base,
    listPullFiles: paginatePullFiles,
    listCheckRuns: (sha) => request('GET', `/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`),
    getCombinedStatus: (sha) => request('GET', `/commits/${encodeURIComponent(sha)}/status`),
    mergePull: (number, sha, mergeMethod = 'merge') => request('PUT', `/pulls/${number}/merge`, {
      sha,
      merge_method: mergeMethod,
    }),
  };
}

export function splitMaintenanceClients({ patApi, ephemeralApi }) {
  if (!ephemeralApi) return { api: patApi, mergeApi: null };
  return {
    api: {
      ...patApi,
      listCheckRuns: ephemeralApi.listCheckRuns,
      getCombinedStatus: ephemeralApi.getCombinedStatus,
    },
    mergeApi: ephemeralApi,
  };
}

async function main() {
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be set to owner/repository.');

  const token = process.env.LUMENSIA_PR_CREATOR_TOKEN || '';
  const mergeToken = process.env.LUMENSIA_AUTO_MERGE_TOKEN || '';
  const patApi = createMaintenanceGitHubClient({ token, owner, repo });
  const ephemeralApi = mergeToken ? createMaintenanceGitHubClient({ token: mergeToken, owner, repo }) : null;
  const { api, mergeApi } = splitMaintenanceClients({ patApi, ephemeralApi });
  const summary = await maintainAutoPulls({
    token,
    mergeToken,
    owner,
    repo,
    api,
    mergeApi,
    webhook: process.env.DISCORD_WEBHOOK_URL || '',
    configuredActors: process.env.CODEX_ACTORS || '',
  });
  logMaintenanceSummary(summary);
  if (summary.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error?.message || 'Auto maintenance failed.');
    process.exitCode = 1;
  });
}
