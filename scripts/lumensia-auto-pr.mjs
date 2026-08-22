#!/usr/bin/env node

const API_ROOT = 'https://api.github.com';
export const DEFAULT_FRESHNESS_HOURS = 24;
export const AUTO_PR_MARKER = '<!-- lumensia-auto-pr:v1 -->';
export const DISCORD_PENDING_MARKER = '<!-- lumensia-auto-pr-discord:pending -->';
export const DISCORD_DELIVERED_MARKER = '<!-- lumensia-auto-pr-discord:delivered -->';
export const CODEX_REVIEW_REQUEST_MARKER = 'lumensia-codex-review-request:v4';

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

${AUTO_PR_MARKER}
${DISCORD_PENDING_MARKER}`;
}

export function isAlreadyExistsError(error) {
  if (error?.status !== 422) return false;
  const text = JSON.stringify(error.data || error.message || '').toLowerCase();
  return text.includes('pull request already exists') || (text.includes('head') && text.includes('already exists'));
}

export function parseCodexReviewRequest(body = '') {
  const match = String(body).match(/<!--\s*lumensia-codex-review-request:v4\s*\n(\{[^]*?\})\s*\n?-->/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    if (!value || typeof value !== 'object') return null;
    return value;
  } catch {
    return null;
  }
}

function trustedCodexReviewRequests(comments = [], prNumber, trustedActor = '') {
  const actor = String(trustedActor || '').toLowerCase();
  return comments
    .map((comment) => ({ comment, request: parseCodexReviewRequest(comment.body) }))
    .filter(({ comment, request }) =>
      request
      && Number(request.pr) === Number(prNumber)
      && (!actor || String(comment.user?.login || '').toLowerCase() === actor));
}

export function findLatestCodexReviewRequest(comments = [], prNumber, trustedActor = '') {
  return trustedCodexReviewRequests(comments, prNumber, trustedActor)
    .sort((left, right) => Number(right.comment.id || 0) - Number(left.comment.id || 0))[0] || null;
}

export function makeCodexReviewRequestBody({
  prNumber,
  head,
  generationKey,
  baselineReviewIds = [],
  baselineReviewCommentIds = [],
  baselineIssueCommentIds = [],
  requireCycleEcho = false,
  cycleToken = '',
}) {
  const request = {
    pr: Number(prNumber),
    head: String(head || ''),
    generationKey: String(generationKey || ''),
    baselineReviewIds: baselineReviewIds.map(String),
    baselineReviewCommentIds: baselineReviewCommentIds.map(String),
    baselineIssueCommentIds: baselineIssueCommentIds.map(String),
    requireCycleEcho: Boolean(requireCycleEcho),
    cycleToken: requireCycleEcho ? String(cycleToken || '') : '',
  };
  const echoInstruction = request.requireCycleEcho
    ? `. In your final top-level review result, include this exact line: \`Lumensia-Review-Cycle: ${request.cycleToken}\``
    : '';
  return `<!-- ${CODEX_REVIEW_REQUEST_MARKER}
${JSON.stringify(request)}
-->

@codex review${echoInstruction}`;
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
    getPull: (number) => request('GET', `/pulls/${number}`),
    listIssueComments: (number) => paginate(`/issues/${number}/comments`),
    listReviews: (number) => paginate(`/pulls/${number}/reviews`),
    listReviewComments: (number) => paginate(`/pulls/${number}/comments`),
    createIssueComment: (number, body) => request('POST', `/issues/${number}/comments`, { body }),
    createPull: (payload) => request('POST', '/pulls', payload),
    updatePull: (number, payload) => request('PATCH', `/pulls/${number}`, payload),
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
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
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

async function notifyCreatedPull({ api, webhook, pull, branch, sha, fetchImpl, logger }) {
  if (!pull.body?.includes(AUTO_PR_MARKER) || !pull.body.includes(DISCORD_PENDING_MARKER)) return { retried: false };
  const delivery = await deliverDiscord(webhook, pull, branch, sha, fetchImpl, logger);
  if (!delivery.delivered) return { retried: true, delivered: false };
  const body = pull.body.replace(DISCORD_PENDING_MARKER, DISCORD_DELIVERED_MARKER);
  await api.updatePull(pull.number, { body });
  pull.body = body;
  return { retried: true, delivered: true };
}

export async function ensureCodexReviewRequest({ api, pull, owner, logger = console }) {
  if (!pull || pull.state !== 'open' || pull.draft || !pull.head?.sha) {
    return { created: false, reason: 'ineligible' };
  }
  const required = ['getPull', 'listIssueComments', 'listReviews', 'listReviewComments', 'createIssueComment'];
  if (required.some((name) => typeof api?.[name] !== 'function')) {
    return { created: false, reason: 'unsupported' };
  }

  let issueComments = await api.listIssueComments(pull.number);
  let latestRequest = findLatestCodexReviewRequest(issueComments, pull.number, owner);
  if (latestRequest?.request?.head === pull.head.sha) {
    return { created: false, reason: 'current', comment: latestRequest.comment, request: latestRequest.request };
  }

  const [currentPull, reviews, reviewComments, freshIssueComments] = await Promise.all([
    api.getPull(pull.number),
    api.listReviews(pull.number),
    api.listReviewComments(pull.number),
    api.listIssueComments(pull.number),
  ]);
  if (currentPull?.state !== 'open' || currentPull?.draft || currentPull?.head?.sha !== pull.head.sha) {
    return { created: false, reason: 'race' };
  }

  issueComments = freshIssueComments;
  latestRequest = findLatestCodexReviewRequest(issueComments, pull.number, owner);
  if (latestRequest?.request?.head === currentPull.head.sha) {
    return { created: false, reason: 'current', comment: latestRequest.comment, request: latestRequest.request };
  }

  const priorRequests = trustedCodexReviewRequests(issueComments, pull.number, owner);
  const repeatedHead = priorRequests.some(({ request }) => request.head === currentPull.head.sha);
  const generationKey = `after-${latestRequest?.comment?.id || 0}`;
  const cycleToken = `pr-${pull.number}-${generationKey}`;
  const body = makeCodexReviewRequestBody({
    prNumber: pull.number,
    head: currentPull.head.sha,
    generationKey,
    baselineReviewIds: reviews.map((review) => review.id),
    baselineReviewCommentIds: reviewComments.map((comment) => comment.id),
    baselineIssueCommentIds: issueComments.map((comment) => comment.id),
    requireCycleEcho: repeatedHead,
    cycleToken,
  });
  const comment = await api.createIssueComment(pull.number, body);
  logger.log(`CODEX REVIEW REQUESTED: PR #${pull.number} ${currentPull.head.sha.slice(0, 7)} (${generationKey}${repeatedHead ? ', repeated-head echo required' : ''})`);
  return {
    created: true,
    comment,
    request: parseCodexReviewRequest(body),
  };
}

function initialSummary() {
  return {
    disabled: false,
    scanned: 0,
    eligible: 0,
    created: [],
    reviewRequests: [],
    errors: [],
    skipped: { scope: 0, existing: 0, stale: 0, optOut: 0, notAhead: 0, race: 0 },
  };
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
      const existingPulls = await api.listPulls(branch);
      if (existingPulls.length > 0) {
        const openPull = existingPulls.find((pull) => pull.state === 'open');
        const retryPull = existingPulls.find((pull) => pull.state === 'open' && pull.body?.includes(AUTO_PR_MARKER) && pull.body.includes(DISCORD_PENDING_MARKER));
        if (retryPull) await notifyCreatedPull({ api, webhook, pull: retryPull, branch, sha: retryPull.head?.sha || '', fetchImpl: discordFetch, logger });
        if (openPull) {
          const request = await ensureCodexReviewRequest({ api, pull: openPull, owner, logger });
          if (request.created) summary.reviewRequests.push({ number: openPull.number, branch, sha: openPull.head?.sha || '', commentId: request.comment?.id || null });
        }
        summary.skipped.existing += 1;
        continue;
      }
      const comparison = await api.compare('main', branch);
      const commit = comparison.commits?.at(-1) || branchData.commit;
      const sha = comparison.head_commit?.sha || commit?.sha || branchData.commit?.sha || '';
      const date = comparison.head_commit?.commit?.committer?.date || commit?.commit?.committer?.date || commit?.commit?.author?.date;
      const hasChanges = ['ahead', 'diverged'].includes(comparison.status) && Number(comparison.ahead_by) > 0
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
      pull = { ...pull, title, body: pull.body || makeBody(branch, sha) };
      summary.created.push({ number: pull.number, branch, sha, url: pull.html_url });
      await notifyCreatedPull({ api, webhook, pull, branch, sha, fetchImpl: discordFetch, logger });
      const request = await ensureCodexReviewRequest({ api, pull, owner, logger });
      if (request.created) summary.reviewRequests.push({ number: pull.number, branch, sha: pull.head?.sha || sha, commentId: request.comment?.id || null });
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
  logger.log(`AUTO PR SCAN

Branches scanned: ${summary.scanned}
Eligible: ${summary.eligible}
Skipped existing PR: ${summary.skipped.existing}
Skipped stale: ${summary.skipped.stale}
Skipped opt-out: ${summary.skipped.optOut}
Codex review requests: ${summary.reviewRequests.length}
Errors: ${summary.errors.length}`);
  for (const pull of summary.created) logger.log(`
CREATED:
PR #${pull.number}
${pull.branch}
${pull.sha.slice(0, 7)}`);
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
