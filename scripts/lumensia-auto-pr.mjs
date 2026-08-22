#!/usr/bin/env node

const API_ROOT = 'https://api.github.com';
export const DEFAULT_FRESHNESS_HOURS = 24;
export const AUTO_PR_MARKER = '<!-- lumensia-auto-pr:v1 -->';

export function isCandidateBranch(name, defaultBranch = 'main') {
  return typeof name === 'string'
    && name !== defaultBranch
    && name.startsWith('codex/')
    && !name.toLowerCase().includes('-no-pr');
}

export function isFresh(date, now = new Date(), freshnessHours = DEFAULT_FRESHNESS_HOURS) {
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) && timestamp <= now.getTime()
    && now.getTime() - timestamp <= freshnessHours * 60 * 60 * 1000;
}

function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function makeTitle(branch, subject = '') {
  const commitTitle = cleanText(subject).replace(/^[-#]+\s*/, '');
  const readableBranch = cleanText(String(branch).replace(/^codex\//, '').replace(/[-_]+/g, ' '));
  const meaningful = commitTitle.length >= 4 && !/^(wip|update|changes?|fix)$/i.test(commitTitle);
  return (meaningful ? commitTitle : readableBranch || `Codex: ${cleanText(branch)}`).slice(0, 120).trim();
}

export function makeBody(branch, sha) {
  const safeBranch = cleanText(branch).replace(/`/g, "'");
  const safeSha = cleanText(sha).replace(/[^a-f0-9]/gi, '').slice(0, 40);
  return `## Auto-created Lumensia PR

This PR was created automatically from Codex branch:
\`${safeBranch}\`

HEAD:
\`${safeSha.slice(0, 7)}\`

Base:
\`main\`

### Automated pipeline

After PR creation, Lumensia PR safety gate, Vercel, Codex Review, Lumensia Merge Readiness, and Discord notifications will evaluate the PR.

Manual merge only. P0/P1 and failed authoritative checks block merge. P2/P3 are non-blocking by project policy.

${AUTO_PR_MARKER}`;
}

export function isAlreadyExistsError(error) {
  if (error?.status !== 422) return false;
  const text = JSON.stringify(error.data || error.message || '').toLowerCase();
  return text.includes('pull request already exists') || (text.includes('head') && text.includes('already exists'));
}

export function createGitHubClient({ token, owner, repo, fetchImpl = fetch }) {
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

  async function paginate(path) {
    const items = [];
    for (let page = 1; ; page += 1) {
      const separator = path.includes('?') ? '&' : '?';
      const batch = await request('GET', `${path}${separator}per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
  }

  return {
    validate: () => Promise.all([request('GET', ''), request('GET', '/pulls?state=all&per_page=1')]),
    listBranches: () => paginate('/branches'),
    compare: (base, head) => request('GET', `/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`),
    listPulls: (head) => paginate(`/pulls?state=all&head=${encodeURIComponent(`${owner}:${head}`)}`),
    createPull: (payload) => request('POST', '/pulls', payload),
  };
}

export async function deliverDiscord(webhook, pull, branch, sha, fetchImpl = fetch, logger = console) {
  if (!webhook) {
    logger.warn('Discord PR-created notification disabled: DISCORD_WEBHOOK_URL is not configured.');
    return { delivered: false, reason: 'missing' };
  }
  const content = `📬 **Lumensia PR #${pull.number} 자동 생성**\n\`${cleanText(pull.title)}\`\nBranch: \`${cleanText(branch)}\`\nHEAD: \`${cleanText(sha).slice(0, 7)}\`\n${pull.html_url}`;
  try {
    const response = await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      logger.warn(`Discord PR-created notification failed with HTTP ${response.status}.`);
      return { delivered: false, reason: 'http' };
    }
    return { delivered: true };
  } catch (error) {
    logger.warn(`Discord PR-created notification failed: ${error?.name || 'network error'}.`);
    return { delivered: false, reason: 'network' };
  }
}

function initialSummary() {
  return { disabled: false, scanned: 0, eligible: 0, created: [], errors: [], skipped: { scope: 0, existing: 0, stale: 0, optOut: 0, notAhead: 0, race: 0 } };
}

export async function scanAutoPulls({ token, owner, repo, api, webhook = '', now = new Date(), freshnessHours = DEFAULT_FRESHNESS_HOURS, logger = console, discordFetch = fetch }) {
  const summary = initialSummary();
  if (!token) {
    summary.disabled = true;
    logger.warn('AUTO PR DISABLED / missing LUMENSIA_PR_CREATOR_TOKEN');
    return summary;
  }
  try {
    await api.validate();
  } catch (error) {
    if ([401, 403].includes(error?.status)) {
      summary.disabled = true;
      logger.error('AUTO PR DISABLED / TOKEN PERMISSION ERROR');
      return summary;
    }
    throw error;
  }

  const branches = await api.listBranches();
  summary.scanned = branches.length;
  for (const branchData of branches) {
    const branch = branchData.name;
    if (String(branch).toLowerCase().includes('-no-pr')) { summary.skipped.optOut += 1; continue; }
    if (!isCandidateBranch(branch)) { summary.skipped.scope += 1; continue; }
    try {
      if ((await api.listPulls(branch)).length > 0) { summary.skipped.existing += 1; continue; }
      const comparison = await api.compare('main', branch);
      const commit = comparison.commits?.at(-1) || branchData.commit;
      const sha = comparison.head_commit?.sha || commit?.sha || branchData.commit?.sha || '';
      const date = comparison.head_commit?.commit?.committer?.date || commit?.commit?.committer?.date || commit?.commit?.author?.date;
      const hasChanges = comparison.status === 'ahead' && Number(comparison.ahead_by) > 0
        && Number(comparison.total_commits ?? comparison.commits?.length ?? 0) > 0;
      if (!hasChanges) { summary.skipped.notAhead += 1; continue; }
      if (!isFresh(date, now, freshnessHours)) { summary.skipped.stale += 1; continue; }
      summary.eligible += 1;
      if ((await api.listPulls(branch)).length > 0) { summary.skipped.race += 1; continue; }
      const subject = comparison.head_commit?.commit?.message?.split(/\r?\n/, 1)[0] || commit?.commit?.message?.split(/\r?\n/, 1)[0] || '';
      const title = makeTitle(branch, subject);
      let pull;
      try {
        pull = await api.createPull({ title, body: makeBody(branch, sha), head: branch, base: 'main', draft: false });
      } catch (error) {
        if (isAlreadyExistsError(error)) { summary.skipped.race += 1; continue; }
        if ([401, 403].includes(error?.status)) {
          logger.error('AUTO PR DISABLED / TOKEN PERMISSION ERROR');
          summary.disabled = true;
          return summary;
        }
        throw error;
      }
      summary.created.push({ number: pull.number, branch, sha, url: pull.html_url });
      await deliverDiscord(webhook, { ...pull, title }, branch, sha, discordFetch, logger);
    } catch (error) {
      if ([401, 403].includes(error?.status)) {
        logger.error('AUTO PR DISABLED / TOKEN PERMISSION ERROR');
        summary.disabled = true;
        return summary;
      }
      summary.errors.push({ branch, status: error?.status || null });
      logger.error(`Auto PR candidate failed: ${cleanText(branch)} (${error?.status ? `HTTP ${error.status}` : error?.name || 'error'}).`);
    }
  }
  return summary;
}

export function logSummary(summary, logger = console) {
  logger.log(`AUTO PR SCAN\n\nBranches scanned: ${summary.scanned}\nEligible: ${summary.eligible}\nSkipped existing PR: ${summary.skipped.existing}\nSkipped stale: ${summary.skipped.stale}\nSkipped opt-out: ${summary.skipped.optOut}\nErrors: ${summary.errors.length}`);
  for (const pull of summary.created) logger.log(`\nCREATED:\nPR #${pull.number}\n${pull.branch}\n${pull.sha.slice(0, 7)}`);
}

async function main() {
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
  const token = process.env.LUMENSIA_PR_CREATOR_TOKEN || '';
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be set to owner/repository.');
  const freshnessHours = Number(process.env.LUMENSIA_AUTO_PR_FRESHNESS_HOURS || DEFAULT_FRESHNESS_HOURS);
  const api = createGitHubClient({ token, owner, repo });
  const summary = await scanAutoPulls({ token, owner, repo, api, webhook: process.env.DISCORD_WEBHOOK_URL || '', freshnessHours: Number.isFinite(freshnessHours) && freshnessHours > 0 ? freshnessHours : DEFAULT_FRESHNESS_HOURS });
  logSummary(summary);
  if (summary.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error?.message || 'Auto PR scan failed.');
    process.exitCode = 1;
  });
}
