#!/usr/bin/env node

const API_ROOT = 'https://api.github.com';
export const DEFAULT_FRESHNESS_HOURS = 24;
export const AUTO_PR_MARKER = '<!-- lumensia-auto-pr:v1 -->';
export const DISCORD_PENDING_MARKER = '<!-- lumensia-auto-pr-discord:pending -->';
export const DISCORD_DELIVERED_MARKER = '<!-- lumensia-auto-pr-discord:delivered -->';
export const CODEX_REVIEW_REQUEST_MARKER = 'lumensia-codex-review-request:v4';
const DEFAULT_CODEX_ACTORS = ['chatgpt-codex-connector[bot]', 'chatgpt-codex-connector'];

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
  return `## Auto-created Lumensia PR\n\nThis PR was created automatically from Codex branch:\n\`${safeBranch}\`\n\nHEAD:\n\`${safeSha.slice(0, 7)}\`\n\nBase:\n\`main\`\n\n### Automated pipeline\n\nAfter PR creation, Lumensia PR safety gate, Vercel, Codex Review, Lumensia Merge Readiness, and Discord notifications will evaluate the PR.\n\nManual merge only. P0/P1 and failed authoritative checks block merge. P2/P3 are non-blocking by project policy.\n\n${AUTO_PR_MARKER}\n${DISCORD_PENDING_MARKER}`;
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

export function sameCodexReviewTarget(request = {}, head = '', baseSha = '') {
  return request.head === head && Boolean(request.baseSha) && request.baseSha === baseSha;
}

export function findLatestCodexReviewRequest(comments = [], prNumber, trustedActor = '', head = '', baseSha = '') {
  const requests = trustedCodexReviewRequests(comments, prNumber, trustedActor)
    .filter(({ request }) => !head || sameCodexReviewTarget(request, head, baseSha));
  return requests.sort((left, right) => Number(right.comment.id || 0) - Number(left.comment.id || 0))[0] || null;
}

export async function resolveCurrentBaseTarget(api, pull = {}) {
  const head = String(pull?.head?.sha || '');
  if (!head || typeof api?.compare !== 'function') return null;
  // Compare current main directly against the immutable pull HEAD SHA. GitHub's
  // compare response has base_commit/merge_base_commit but no head_commit field,
  // so pinning the compare operand to the exact SHA is the authoritative head check.
  const comparison = await api.compare('main', head);
  const baseSha = String(comparison?.base_commit?.sha || '');
  const mergeBaseSha = String(comparison?.merge_base_commit?.sha || '');
  if (!baseSha || !mergeBaseSha) return null;
  return { head, baseSha, mergeBaseSha, comparison };
}

function codexActorAllowed(user = {}, configuredActors = '') {
  const configured = String(configuredActors || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const allowed = new Set([...DEFAULT_CODEX_ACTORS, ...configured]);
  return allowed.has(String(user.login || '').toLowerCase());
}

function codexReviewedCommit(body = '') {
  const match = String(body).match(/\*\*Reviewed commit:\*\*\s*`([a-f0-9]{7,40})`/i)
    || String(body).match(/Reviewed commit:\s*`([a-f0-9]{7,40})`/i);
  return match?.[1]?.toLowerCase() || '';
}

function afterRequest(value, requestCreatedAt = '') {
  const requestTime = Date.parse(requestCreatedAt);
  const resultTime = Date.parse(value);
  return Number.isFinite(requestTime) && Number.isFinite(resultTime) && resultTime > requestTime;
}

export function hasCodexCompletionForRequest({ requestEntry, reviews = [], issueComments = [], configuredActors = '' }) {
  if (!requestEntry?.request?.head || !requestEntry?.comment?.created_at) return false;
  const head = String(requestEntry.request.head).toLowerCase();
  const requestCreatedAt = requestEntry.comment.created_at;
  const reviewComplete = reviews.some((review) => String(review.commit_id || '').toLowerCase() === head
    && review.submitted_at
    && review.state?.toUpperCase() !== 'DISMISSED'
    && codexActorAllowed(review.user, configuredActors)
    && afterRequest(review.submitted_at, requestCreatedAt));
  if (reviewComplete) return true;
  return issueComments.some((comment) => {
    if (!codexActorAllowed(comment.user, configuredActors)) return false;
    if (!afterRequest(comment.created_at || comment.updated_at, requestCreatedAt)) return false;
    const reviewed = codexReviewedCommit(comment.body);
    return Boolean(reviewed) && head.startsWith(reviewed);
  });
}

export function makeCodexReviewRequestBody({
  prNumber,
  head,
  baseSha,
  generationKey,
  baselineReviewIds = [],
  baselineReviewCommentIds = [],
  baselineIssueCommentIds = [],
}) {
  const request = {
    pr: Number(prNumber),
    head: String(head || ''),
    baseSha: String(baseSha || ''),
    generationKey: String(generationKey || ''),
    baselineReviewIds: baselineReviewIds.map(String),
    baselineReviewCommentIds: baselineReviewCommentIds.map(String),
    baselineIssueCommentIds: baselineIssueCommentIds.map(String),
  };
  return `<!-- ${CODEX_REVIEW_REQUEST_MARKER}\n${JSON.stringify(request)}\n-->\n\n@codex review`;
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
    listOpenPulls: () => paginate('/pulls?state=open'),
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

export async function ensureCodexReviewRequest({ api, pull, owner, logger = console, configuredActors = '' }) {
  if (!pull || pull.state !== 'open' || pull.draft || !pull.head?.sha) {
    return { created: false, reason: 'ineligible' };
  }
  const required = ['compare', 'getPull', 'listIssueComments', 'listReviews', 'listReviewComments', 'createIssueComment'];
  if (required.some((name) => typeof api?.[name] !== 'function')) {
    return { created: false, reason: 'unsupported' };
  }

  const initialTarget = await resolveCurrentBaseTarget(api, pull);
  if (!initialTarget) return { created: false, reason: 'race' };
  let issueComments = await api.listIssueComments(pull.number);
  let currentTargetRequest = findLatestCodexReviewRequest(issueComments, pull.number, owner, pull.head.sha, initialTarget.baseSha);
  if (currentTargetRequest) {
    return { created: false, reason: 'current', comment: currentTargetRequest.comment, request: currentTargetRequest.request };
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
  const currentTarget = await resolveCurrentBaseTarget(api, currentPull);
  if (!currentTarget || currentTarget.baseSha !== initialTarget.baseSha) return { created: false, reason: 'race' };
  const baseSha = currentTarget.baseSha;

  issueComments = freshIssueComments;
  currentTargetRequest = findLatestCodexReviewRequest(issueComments, pull.number, owner, currentPull.head.sha, baseSha);
  if (currentTargetRequest) {
    return { created: false, reason: 'current', comment: currentTargetRequest.comment, request: currentTargetRequest.request };
  }

  const priorSameHeadTargets = trustedCodexReviewRequests(issueComments, pull.number, owner)
    .filter(({ request }) => request.head === currentPull.head.sha && request.baseSha !== baseSha)
    .sort((left, right) => Number(right.comment.id || 0) - Number(left.comment.id || 0));
  const unfinishedPrior = priorSameHeadTargets.find((entry) => !hasCodexCompletionForRequest({
    requestEntry: entry,
    reviews,
    issueComments,
    configuredActors,
  }));
  if (unfinishedPrior) {
    logger.log(`CODEX REVIEW DEFERRED: PR #${pull.number} ${currentPull.head.sha.slice(0, 7)} base ${baseSha.slice(0, 7)}; prior same-head target is still running.`);
    return { created: false, reason: 'prior-same-head-pending', request: unfinishedPrior.request, comment: unfinishedPrior.comment };
  }

  const latestRequest = findLatestCodexReviewRequest(issueComments, pull.number, owner);
  const generationKey = `after-${latestRequest?.comment?.id || 0}`;
  const body = makeCodexReviewRequestBody({
    prNumber: pull.number,
    head: currentPull.head.sha,
    baseSha,
    generationKey,
    baselineReviewIds: reviews.map((review) => review.id),
    baselineReviewCommentIds: reviewComments.map((comment) => comment.id),
    baselineIssueCommentIds: issueComments.map((comment) => comment.id),
  });
  const comment = await api.createIssueComment(pull.number, body);
  logger.log(`CODEX REVIEW REQUESTED: PR #${pull.number} ${currentPull.head.sha.slice(0, 7)} base ${baseSha.slice(0, 7)} (${generationKey})`);
  return {
    created: true,
    comment,
    request: parseCodexReviewRequest(body),
  };
}

export async function reconcileOpenPullReviewRequests({ api, owner, summary, logger = console, configuredActors = '' }) {
  if (typeof api?.listOpenPulls !== 'function') return { scanned: 0, created: 0 };
  const pulls = await api.listOpenPulls();
  let created = 0;
  for (const pull of pulls) {
    if (!pull || pull.state !== 'open') continue;
    try {
      const request = await ensureCodexReviewRequest({ api, pull, owner, logger, configuredActors });
      if (!request.created) continue;
      created += 1;
      const entry = {
        number: pull.number,
        branch: pull.head?.ref || '',
        sha: pull.head?.sha || '',
        commentId: request.comment?.id || null,
      };
      if (!summary.reviewRequests.some((item) => item.commentId && item.commentId === entry.commentId)) {
        summary.reviewRequests.push(entry);
      }
    } catch (error) {
      if ([401, 403].includes(error?.status)) throw error;
      summary.errors.push({ branch: `PR #${pull.number}`, status: error?.status || null });
      logger.error(`Codex review reconciliation failed: PR #${pull.number} (${error?.status ? `HTTP ${error.status}` : error?.name || 'error'}).`);
    }
  }
  return { scanned: pulls.length, created };
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

export async function scanAutoPulls({ token, owner, repo, api, webhook = '', now = new Date(), freshnessHours = DEFAULT_FRESHNESS_HOURS, logger = console, discordFetch = fetch, configuredActors = '' }) {
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
          const request = await ensureCodexReviewRequest({ api, pull: openPull, owner, logger, configuredActors });
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
      const request = await ensureCodexReviewRequest({ api, pull, owner, logger, configuredActors });
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

  try {
    await reconcileOpenPullReviewRequests({ api, owner, summary, logger, configuredActors });
  } catch (error) {
    if ([401, 403].includes(error?.status)) {
      logger.error('AUTO PR DISABLED / TOKEN PERMISSION ERROR');
      summary.disabled = true;
      return summary;
    }
    throw error;
  }

  return summary;
}

export function logSummary(summary, logger = console) {
  logger.log(`AUTO PR SCAN\n\nBranches scanned: ${summary.scanned}\nEligible: ${summary.eligible}\nSkipped existing PR: ${summary.skipped.existing}\nSkipped stale: ${summary.skipped.stale}\nSkipped opt-out: ${summary.skipped.optOut}\nCodex review requests: ${summary.reviewRequests.length}\nErrors: ${summary.errors.length}`);
  for (const pull of summary.created) logger.log(`\nCREATED:\nPR #${pull.number}\n${pull.branch}\n${pull.sha.slice(0, 7)}`);
}

async function main() {
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
  const token = process.env.LUMENSIA_PR_CREATOR_TOKEN || '';
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be set to owner/repository.');
  const freshnessHours = Number(process.env.LUMENSIA_AUTO_PR_FRESHNESS_HOURS || DEFAULT_FRESHNESS_HOURS);
  const api = createGitHubClient({ token, owner, repo });
  const summary = await scanAutoPulls({
    token,
    owner,
    repo,
    api,
    webhook: process.env.DISCORD_WEBHOOK_URL || '',
    freshnessHours: Number.isFinite(freshnessHours) && freshnessHours > 0 ? freshnessHours : DEFAULT_FRESHNESS_HOURS,
    configuredActors: process.env.CODEX_ACTORS || '',
  });
  logSummary(summary);
  if (summary.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error?.message || 'Auto PR scan failed.');
    process.exitCode = 1;
  });
}
