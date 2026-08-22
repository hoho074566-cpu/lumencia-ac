#!/usr/bin/env node

const MARKER = '<!-- lumensia-merge-readiness:v1 -->';
const STATE_PREFIX = 'lumensia-readiness-state:';
const TERMINAL_FAILURES = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale']);
export const TRUSTED_CODEX_REQUEST_MARKER = 'lumensia-codex-review-request:v4';

export function isCodexActor(actor = {}, configured = '') {
  const allowed = configured.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const login = String(actor.login || '').toLowerCase();
  return Boolean(login) && allowed.includes(login);
}

export function parseCodexSeverities(body = '') {
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 };
  let findingLike = false;
  let fence = null;
  for (const original of String(body).split(/\r?\n/)) {
    const line = original.trim();
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const delimiter = fenceMatch[1];
      if (!fence) fence = { character: delimiter[0], length: delimiter.length };
      else if (fence.character === delimiter[0] && delimiter.length >= fence.length && line.slice(delimiter.length).trim() === '') fence = null;
      continue;
    }
    if (fence || !line || line.startsWith('>')) continue;
    const match = line.match(/^(?:[-*]\s+)?(?:#{1,6}\s*)?(?:\*\*)?\[?(P[0-3])\]?(?:\*\*)?(?=\s|:|[-–—])/i)
      || line.match(/!\[(P[0-3])\s+Badge\]\([^\s)]+\)/i);
    if (match) {
      counts[match[1].toUpperCase()] += 1;
      findingLike = true;
    } else if (/^(?:[-*]\s+)?(?:#{1,6}\s*)?(?:finding|issue|severity)\b/i.test(line)) {
      findingLike = true;
    }
  }
  if (findingLike && counts.P0 + counts.P1 + counts.P2 + counts.P3 === 0) counts.unknown = 1;
  return counts;
}

// Legacy v3 helpers are kept for deterministic regression tests and old machine-state decoding.
// Live review requests are now issued by the trusted Auto-PR scanner with the repository-owner PAT.
export function codexReviewRequestMarker(prNumber, head, generationKey) {
  return `<!-- lumensia-codex-review-cycle:v3\npr=${prNumber}\nhead=${head}\ngeneration=${generationKey}\n-->`;
}

export function findCodexReviewRequest(comments = [], prNumber, head, generationKey) {
  const marker = codexReviewRequestMarker(prNumber, head, generationKey);
  return comments.find((comment) => comment.body?.includes(marker) && /github-actions\[bot\]/i.test(comment.user?.login || ''));
}

function runIdentity(value) {
  try { return /^\d+$/.test(String(value || '')) ? BigInt(value) : null; } catch { return null; }
}

export function planCodexReviewCycle(storedState = {}, head, transitionRunId) {
  const previous = storedState.codexReviewRequest || {};
  const normalizedPrevious = previous.headSha ? { ...previous, generationKey: previous.generationKey || (previous.transitionRunId ? `sync-${previous.transitionRunId}` : `cycle-${previous.cycle || 1}`) } : previous;
  const incomingRun = runIdentity(transitionRunId);
  const storedRun = runIdentity(normalizedPrevious.transitionRunId);
  if (incomingRun != null) {
    if (storedRun != null && incomingRun < storedRun) return { stale: true };
    if (storedRun != null && incomingRun === storedRun) return normalizedPrevious.headSha === head ? normalizedPrevious : { stale: true };
    const cycle = Number(normalizedPrevious.cycle || 0) + 1;
    return { headSha: head, cycle, generationKey: `sync-${transitionRunId}`, transitionRunId: String(transitionRunId) };
  }
  if (normalizedPrevious.headSha === head) return normalizedPrevious;
  const cycle = Number(normalizedPrevious.cycle || 0) + 1;
  return { headSha: head, cycle, generationKey: `cycle-${cycle}`, ...(normalizedPrevious.transitionRunId ? { transitionRunId: normalizedPrevious.transitionRunId } : {}) };
}

export function baselineCodexReviewCycle(cycle, reviews = [], comments = []) {
  if (Array.isArray(cycle.baselineReviewIds) && Array.isArray(cycle.baselineReviewCommentIds)) return cycle;
  return { ...cycle, baselineReviewIds: reviews.map((review) => String(review.id)), baselineReviewCommentIds: comments.map((comment) => String(comment.id)) };
}

export function sameCodexReviewCycle(left = {}, right = {}) {
  return left.headSha === right.headSha && left.generationKey === right.generationKey;
}

export async function ensureCodexReviewRequest({ comments = [], prNumber, head, generationKey, refreshComments, createComment }) {
  let request = findCodexReviewRequest(comments, prNumber, head, generationKey);
  if (!request) request = findCodexReviewRequest(await refreshComments(), prNumber, head, generationKey);
  if (request) return request;
  return createComment(`${codexReviewRequestMarker(prNumber, head, generationKey)}\n\n@codex review`);
}

export function shouldRequestCodexReview(pull = {}) {
  return !pull.draft;
}

export function parseTrustedCodexReviewRequest(body = '') {
  const match = String(body).match(/<!--\s*lumensia-codex-review-request:v4\s*\n(\{[^]*?\})\s*\n?-->/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    if (!value || typeof value !== 'object' || !value.head || !value.baseSha || !value.generationKey) return null;
    return value;
  } catch {
    return null;
  }
}

export function findLatestTrustedCodexReviewRequest(issueComments = [], prNumber, trustedActor = '', head = '', baseSha = '') {
  const actor = String(trustedActor || '').toLowerCase();
  return issueComments
    .map((comment) => ({ comment, request: parseTrustedCodexReviewRequest(comment.body) }))
    .filter(({ comment, request }) => request
      && Number(request.pr) === Number(prNumber)
      && (!actor || String(comment.user?.login || '').toLowerCase() === actor)
      && (!head || request.head === head && request.baseSha === baseSha))
    .sort((left, right) => Number(right.comment.id || 0) - Number(left.comment.id || 0))[0] || null;
}

export function codexReviewedCommit(body = '') {
  const match = String(body).match(/\*\*Reviewed commit:\*\*\s*`([a-f0-9]{7,40})`/i)
    || String(body).match(/Reviewed commit:\s*`([a-f0-9]{7,40})`/i);
  return match?.[1]?.toLowerCase() || '';
}

export function isAfterRequestTimestamp(value, requestCreatedAt = '') {
  const requestTime = Date.parse(requestCreatedAt);
  if (!Number.isFinite(requestTime)) return true;
  const resultTime = Date.parse(value);
  return Number.isFinite(resultTime) && resultTime > requestTime;
}

export function isCurrentCleanCodexComment(comment, head, baselineIssueCommentIds = [], configuredActors = '', requestCreatedAt = '') {
  if (!comment || !isCodexActor(comment.user, configuredActors)) return false;
  if (new Set(baselineIssueCommentIds.map(String)).has(String(comment.id))) return false;
  if (!isAfterRequestTimestamp(comment.created_at || comment.updated_at, requestCreatedAt)) return false;
  if (!/^Codex Review:\s*Didn't find any major issues\./im.test(String(comment.body || ''))) return false;
  const reviewed = codexReviewedCommit(comment.body);
  return Boolean(reviewed) && String(head || '').toLowerCase().startsWith(reviewed);
}

export function evaluateCodex({
  head,
  reviews = [],
  comments = [],
  issueComments = [],
  requestReactions = [],
  baselineReviewIds = [],
  baselineReviewCommentIds = [],
  baselineIssueCommentIds = [],
  configuredActors = '',
  requestCreatedAt = '',
}) {
  const baselineReviews = new Set(baselineReviewIds.map(String));
  const baselineComments = new Set(baselineReviewCommentIds.map(String));
  const trustedReviews = reviews.filter((review) => isCodexActor(review.user, configuredActors));
  const currentReviews = trustedReviews.filter((review) => review.commit_id === head
    && review.submitted_at
    && review.state?.toUpperCase() !== 'DISMISSED'
    && !baselineReviews.has(String(review.id))
    && isAfterRequestTimestamp(review.submitted_at, requestCreatedAt));

  if (currentReviews.length === 0) {
    const trustedCleanComment = issueComments.some((comment) => isCurrentCleanCodexComment(
      comment,
      head,
      baselineIssueCommentIds,
      configuredActors,
      requestCreatedAt,
    ));
    if (trustedCleanComment) return { state: 'PASS', P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 };

    // Legacy fallback for deterministic v3 tests only. Live v4 evaluation does not fetch request reactions.
    const trustedCleanReaction = requestReactions.some((reaction) => reaction.content === '+1' && isCodexActor(reaction.user, configuredActors));
    return { state: trustedCleanReaction ? 'PASS' : 'PENDING', P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 };
  }

  const latestReview = currentReviews.reduce((latest, review) => {
    const submitted = Date.parse(review.submitted_at) || 0;
    const latestSubmitted = Date.parse(latest.submitted_at) || 0;
    return submitted > latestSubmitted || submitted === latestSubmitted && Number(review.id || 0) >= Number(latest.id || 0) ? review : latest;
  });
  const currentComments = comments.filter((comment) => comment.commit_id === head
    && comment.pull_request_review_id === latestReview.id
    && !baselineComments.has(String(comment.id))
    && isCodexActor(comment.user, configuredActors)
    && isAfterRequestTimestamp(comment.created_at || comment.updated_at, requestCreatedAt));
  const totals = { P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 };
  for (const item of [latestReview, ...currentComments]) {
    const parsed = parseCodexSeverities(item.body);
    for (const key of Object.keys(totals)) totals[key] += parsed[key];
  }
  return { state: totals.P0 + totals.P1 > 0 ? 'BLOCK' : 'PASS', ...totals };
}

function normalizeAuthoritativeCheck(check) {
  const conclusion = check.conclusion?.toLowerCase() || null;
  return conclusion === 'success' ? 'PASS' : conclusion && TERMINAL_FAILURES.has(conclusion) ? 'FAIL' : 'PENDING';
}

export function newestAttempts(items, identity) {
  const newest = new Map();
  for (const item of items) {
    const key = identity(item);
    const previous = newest.get(key);
    const stamp = Date.parse(item.created_at || item.started_at || 0) || 0;
    const previousStamp = previous ? Date.parse(previous.created_at || previous.started_at || 0) || 0 : -1;
    if (!previous || stamp > previousStamp || stamp === previousStamp && Number(item.id || 0) > Number(previous.id || 0)) newest.set(key, item);
  }
  return [...newest.values()];
}

export function applyCheckRunTransition(checkRuns, event, head) {
  if (!['created', 'rerequested'].includes(event?.action) || event.check_run?.head_sha !== head) return checkRuns;
  const pending = { ...event.check_run, status: 'queued', conclusion: null, completed_at: null };
  return [...checkRuns.filter((check) => check.id !== pending.id), pending];
}

export function isAuthoritativeVercelSignal(signal, isStatus = false) {
  const name = String(isStatus ? signal.context : signal.name || '');
  const deploymentName = /^vercel(?:\s*[–—-]\s*.+)?$/i.test(name);
  if (!deploymentName) return false;
  return isStatus || /^vercel$/i.test(String(signal.app?.name || signal.app?.slug || ''));
}

export function safetyMatchesPull(check, { head, baseSha, prNumber }) {
  if (!baseSha) return true;
  return Array.isArray(check.pull_requests) && check.pull_requests.some((pull) =>
    (!prNumber || pull.number === prNumber) && pull.head?.sha === head && pull.base?.sha === baseSha);
}

export function evaluateChecks({ head, baseSha, prNumber, checkRuns = [], statuses = [], requiredCheckNames = [] }) {
  const currentChecks = checkRuns.filter((check) => !check.head_sha || check.head_sha === head);
  const checkIdentity = (check) => `${check.app?.id || check.app?.slug || check.app?.name || 'unknown'}:${check.name}`.toLowerCase();
  const safetyItems = newestAttempts(currentChecks.filter((check) => /^(repository checks|lumensia pr safety gate)$/i.test(check.name) && safetyMatchesPull(check, { head, baseSha, prNumber })), checkIdentity);
  const vercelChecks = newestAttempts(currentChecks.filter((check) => isAuthoritativeVercelSignal(check)), checkIdentity);
  const vercelStatuses = newestAttempts(statuses.filter((status) => (!status.sha || status.sha === head) && isAuthoritativeVercelSignal(status, true)), (status) => status.context.toLowerCase());
  const summarize = (states, absent = 'PENDING') => states.length === 0 ? absent : states.some((state) => state === 'FAIL') ? 'FAIL' : states.some((state) => state === 'PENDING') ? 'PENDING' : 'PASS';
  const safety = summarize(safetyItems.map(normalizeAuthoritativeCheck));
  const vercel = summarize([
    ...vercelChecks.map(normalizeAuthoritativeCheck),
    ...vercelStatuses.map((status) => status.state === 'success' ? 'PASS' : ['failure', 'error'].includes(status.state) ? 'FAIL' : 'PENDING'),
  ], 'NOT_PRESENT');
  const requiredNames = new Set(requiredCheckNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const requiredStates = [...requiredNames].map((name) => {
    const latest = newestAttempts(currentChecks.filter((check) => check.name.toLowerCase() === name), () => name)[0];
    return latest ? normalizeAuthoritativeCheck(latest) : 'PENDING';
  });
  const required = requiredNames.size === 0 ? 'PASS' : summarize(requiredStates);
  return { safety, vercel, required };
}

export function evaluateReadiness({ codex, checks, mergeable, mergeableState, draft = false }) {
  const conflict = mergeable === false || mergeableState === 'dirty';
  if (draft) return { state: 'WAITING', conflict: conflict ? 'CONFLICT' : 'NONE' };
  const blocked = conflict || codex.state === 'BLOCK' || checks.safety === 'FAIL' || checks.vercel === 'FAIL' || checks.required === 'FAIL';
  if (blocked) return { state: 'BLOCKED', conflict: conflict ? 'CONFLICT' : 'NONE' };
  const waiting = mergeable == null || ['behind', 'blocked'].includes(mergeableState) || codex.state === 'PENDING' || checks.safety === 'PENDING' || checks.vercel !== 'PASS' || checks.required === 'PENDING';
  return { state: waiting ? 'WAITING' : 'READY', conflict: 'NONE' };
}

function decodeMachineState(body = '') {
  const match = String(body).match(/lumensia-readiness-state:\s*(\{[^]*?\})\s*-->/);
  try { return match ? JSON.parse(match[1]) : {}; } catch { return {}; }
}

export function parseMachineState(body = '', head = '') {
  const state = decodeMachineState(body);
  return state.head === head ? state : { head };
}

export function plannedNotifications(previous, current) {
  const next = previous.head === current.head ? { ...previous } : { head: current.head };
  const events = [];
  const readinessState = current.readiness.state.toLowerCase();
  if (current.codex.state !== 'PENDING' && next.codexNotified !== current.codex.state.toLowerCase()) events.push('codex');
  if (['PASS', 'FAIL'].includes(current.checks.vercel) && next.vercelNotified !== current.checks.vercel.toLowerCase()) events.push('vercel');
  if (current.readiness.state === 'BLOCKED' && (next.readinessNotified !== 'blocked' || next.readinessObserved !== 'blocked')) events.push('blocked');
  if (current.readiness.state === 'READY' && (next.readinessNotified !== 'ready' || next.readinessObserved !== 'ready')) events.push('ready');
  next.readinessObserved = readinessState;
  return { events, state: next };
}

export function recordDeliveredNotification(state, event, current) {
  const next = { ...state };
  if (event === 'codex') next.codexNotified = current.codex.state.toLowerCase();
  else if (event === 'vercel') next.vercelNotified = current.checks.vercel.toLowerCase();
  else if (event === 'blocked') next.readinessNotified = 'blocked';
  else if (event === 'ready') next.readinessNotified = 'ready';
  return next;
}

export function partitionNotifications(events) {
  return { beforePublish: events.filter((event) => event !== 'ready'), afterPublish: events.filter((event) => event === 'ready') };
}

const icon = (state) => state === 'PASS' || state === 'READY' ? '✅' : state === 'FAIL' || state === 'BLOCK' || state === 'CONFLICT' ? '❌' : '⏳';

export function renderComment(result, machineState) {
  const heading = result.readiness.state === 'READY' ? '### READY TO MERGE 🚀' : result.readiness.state === 'BLOCKED' ? '### ACTION REQUIRED 🛠️' : '### WAITING ⏳';
  const codexStatus = result.codex.state === 'PENDING' ? 'PENDING' : result.codex.state === 'BLOCK' ? 'COMPLETE / BLOCK' : 'COMPLETE';
  return `${MARKER}\n## Lumensia Merge Readiness\n\n| Check | Status |\n|---|---|\n| Safety Gate | ${icon(result.checks.safety)} ${result.checks.safety} |\n| Vercel | ${icon(result.checks.vercel)} ${result.checks.vercel} |\n| Codex Review | ${icon(result.codex.state)} ${codexStatus} |\n| Current P0/P1 | ${result.codex.P0 + result.codex.P1 ? '❌' : result.codex.state === 'PENDING' ? '⏳' : '✅'} ${result.codex.P0 + result.codex.P1} |\n| Merge Conflict | ${icon(result.readiness.conflict === 'NONE' ? 'PASS' : 'FAIL')} ${result.readiness.conflict} |\n\n${heading}\n\nHEAD: \`${result.head.slice(0, 7)}\`\n\nP2/P3 are non-blocking by project policy. Prior-head findings are ignored.${result.codex.unknown ? '\n\n⚠️ An unparseable current-head Codex finding was observed.' : ''}\n\n<!--\n${STATE_PREFIX}\n${JSON.stringify(machineState)}\n-->`;
}

export function renderCheckSummary(commentBody) {
  return String(commentBody).replace(`${MARKER}\n`, '').replace(/\n\n<!--\nlumensia-readiness-state:[^]*$/, '').trim();
}

export async function deliverDiscord(webhook, message, fetchImpl = fetch, logger = console) {
  if (!webhook) { logger.warn('Discord notification disabled: DISCORD_WEBHOOK_URL is not configured.'); return { delivered: false, reason: 'missing' }; }
  try {
    const response = await fetchImpl(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: message }) });
    if (!response.ok) { logger.warn(`Discord notification failed with HTTP ${response.status}.`); return { delivered: false, reason: 'http' }; }
    return { delivered: true };
  } catch (error) {
    logger.warn(`Discord notification failed: ${error?.name || 'network error'}.`);
    return { delivered: false, reason: 'network' };
  }
}

function discordMessage(event, result) {
  const prefix = event === 'ready' ? `🚀 **Lumensia PR #${result.number} READY TO MERGE**\nSafety ✅ · Vercel ✅ · Codex P0/P1 0 · Conflict NONE` :
    event === 'blocked' ? `🛠️ **Lumensia PR #${result.number} ACTION REQUIRED**\nCodex P0: ${result.codex.P0} · P1: ${result.codex.P1}\nMerge Readiness: BLOCKED` :
    event === 'codex' ? `🔍 **Lumensia PR #${result.number} Codex Review COMPLETE**\nP0 ${result.codex.P0} · P1 ${result.codex.P1} · P2/P3 non-blocking` :
    `▲ **Lumensia PR #${result.number} Vercel ${result.checks.vercel}**`;
  return `${prefix}\n\`${result.head.slice(0, 7)}\`\n${result.url}`;
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, { ...options, headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'x-github-api-version': '2022-11-28', ...options.headers } });
  if (!response.ok) throw new Error(`GitHub API ${options.method || 'GET'} ${path} returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function githubAll(path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await github(`${path}${separator}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

export async function hydratePulls(pulls, fetchPull) {
  return Promise.all(pulls.map((pull) => fetchPull(pull.number)));
}

export function isOpenPull(pull) {
  return pull?.state === 'open' && !pull.merged && !pull.merged_at;
}

export function isCurrentPull(snapshot, current) {
  return isOpenPull(current) && current.head?.sha === snapshot.head?.sha && current.base?.sha === snapshot.base?.sha;
}

export function reusableReadinessCheck(check, readinessState) {
  return readinessState === 'WAITING' && check?.status === 'completed' ? undefined : check;
}

export function readinessCheckIdentity(prNumber) {
  return `lumensia-merge-readiness:v1:pr:${prNumber}`;
}

export function readinessCheckName(prNumber) {
  return `Lumensia Merge Readiness (PR #${prNumber})`;
}

export function findReadinessCheck(checkRuns, prNumber, head) {
  const identity = readinessCheckIdentity(prNumber);
  return newestAttempts(checkRuns.filter((run) => run.head_sha === head && run.external_id === identity), () => identity)[0];
}

function pendingCodex() {
  return { state: 'PENDING', P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 };
}

function requestCycleSnapshot(activeRequest, head, baseSha) {
  if (!activeRequest || activeRequest.request.head !== head || activeRequest.request.baseSha !== baseSha) return null;
  return {
    headSha: activeRequest.request.head,
    baseSha: activeRequest.request.baseSha,
    generationKey: activeRequest.request.generationKey,
    baselineReviewIds: (activeRequest.request.baselineReviewIds || []).map(String),
    baselineReviewCommentIds: (activeRequest.request.baselineReviewCommentIds || []).map(String),
    baselineIssueCommentIds: (activeRequest.request.baselineIssueCommentIds || []).map(String),
    commentId: activeRequest.comment.id,
    requestCreatedAt: String(activeRequest.comment.created_at || ''),
    source: 'trusted-pat-v4',
  };
}

async function evaluatePull(owner, repo, pr, event = {}) {
  const head = pr.head.sha;
  let [reviews, comments, runs, combined, issueComments] = await Promise.all([
    githubAll(`/repos/${owner}/${repo}/pulls/${pr.number}/reviews`),
    githubAll(`/repos/${owner}/${repo}/pulls/${pr.number}/comments`),
    github(`/repos/${owner}/${repo}/commits/${head}/check-runs?per_page=100`),
    github(`/repos/${owner}/${repo}/commits/${head}/status`),
    githubAll(`/repos/${owner}/${repo}/issues/${pr.number}/comments`),
  ]);
  let currentPr = await github(`/repos/${owner}/${repo}/pulls/${pr.number}`);
  if (!isCurrentPull(pr, currentPr)) { console.log(`PR #${pr.number} changed or closed during evaluation; skipping mutations.`); return; }
  if (event.action === 'synchronize' && event.pull_request?.head?.sha !== head) { console.log(`PR #${pr.number} ignored synchronize event for a superseded HEAD.`); return; }

  const priorComment = issueComments.find((comment) => comment.body?.includes(MARKER) && /github-actions\[bot\]/i.test(comment.user?.login || ''));
  const storedState = decodeMachineState(priorComment?.body);
  const priorState = storedState.head === head ? storedState : { head };
  const latestTrustedRequest = findLatestTrustedCodexReviewRequest(issueComments, pr.number, owner, head, pr.base.sha);
  const reviewCycle = requestCycleSnapshot(latestTrustedRequest, head, pr.base.sha);

  let codex = reviewCycle
    ? evaluateCodex({
      head,
      reviews,
      comments,
      issueComments,
      baselineReviewIds: reviewCycle.baselineReviewIds,
      baselineReviewCommentIds: reviewCycle.baselineReviewCommentIds,
      baselineIssueCommentIds: reviewCycle.baselineIssueCommentIds,
      configuredActors: process.env.CODEX_ACTORS,
      requestCreatedAt: reviewCycle.requestCreatedAt,
    })
    : pendingCodex();

  const requiredCheckNames = (process.env.REQUIRED_CHECKS || '').split(',');
  const checkRuns = applyCheckRunTransition(runs.check_runs, event, head);
  const checks = evaluateChecks({ head, baseSha: pr.base.sha, prNumber: pr.number, checkRuns, statuses: combined.statuses, requiredCheckNames });
  let readiness = evaluateReadiness({ codex, checks, mergeable: currentPr.mergeable, mergeableState: currentPr.mergeable_state, draft: currentPr.draft });

  if (readiness.state === 'READY' && reviewCycle) {
    let finalIssueComments;
    let finalRuns;
    let finalCombined;
    [currentPr, reviews, comments, finalIssueComments, finalRuns, finalCombined] = await Promise.all([
      github(`/repos/${owner}/${repo}/pulls/${pr.number}`),
      githubAll(`/repos/${owner}/${repo}/pulls/${pr.number}/reviews`),
      githubAll(`/repos/${owner}/${repo}/pulls/${pr.number}/comments`),
      githubAll(`/repos/${owner}/${repo}/issues/${pr.number}/comments`),
      github(`/repos/${owner}/${repo}/commits/${head}/check-runs?per_page=100`),
      github(`/repos/${owner}/${repo}/commits/${head}/status`),
    ]);
    if (!isCurrentPull(pr, currentPr)) { console.log(`PR #${pr.number} changed or closed before READY publication; skipping mutations.`); return; }
    const finalTrustedRequest = findLatestTrustedCodexReviewRequest(finalIssueComments, pr.number, owner, head, currentPr.base.sha);
    if (finalTrustedRequest?.comment?.id !== reviewCycle.commentId
      || finalTrustedRequest?.request?.head !== head
      || finalTrustedRequest?.request?.baseSha !== currentPr.base.sha
      || String(finalTrustedRequest?.comment?.created_at || '') !== reviewCycle.requestCreatedAt) {
      console.log(`PR #${pr.number} trusted Codex review cycle changed before READY publication; skipping mutations.`);
      return;
    }
    codex = evaluateCodex({
      head,
      reviews,
      comments,
      issueComments: finalIssueComments,
      baselineReviewIds: reviewCycle.baselineReviewIds,
      baselineReviewCommentIds: reviewCycle.baselineReviewCommentIds,
      baselineIssueCommentIds: reviewCycle.baselineIssueCommentIds,
      configuredActors: process.env.CODEX_ACTORS,
      requestCreatedAt: reviewCycle.requestCreatedAt,
    });
    const finalChecks = evaluateChecks({ head, baseSha: currentPr.base.sha, prNumber: pr.number, checkRuns: finalRuns.check_runs, statuses: finalCombined.statuses, requiredCheckNames });
    readiness = evaluateReadiness({ codex, checks: finalChecks, mergeable: currentPr.mergeable, mergeableState: currentPr.mergeable_state, draft: currentPr.draft });
    Object.assign(checks, finalChecks);
    issueComments = finalIssueComments;
  }

  const result = { number: pr.number, url: pr.html_url, head, codex, checks, readiness };
  const notifications = plannedNotifications(priorState, result);
  const notificationPhases = partitionNotifications(notifications.events);
  const codexReviewRequest = reviewCycle
    ? { ...reviewCycle, status: codex.state }
    : { headSha: head, baseSha: pr.base.sha, generationKey: 'awaiting-trusted-pat-v4', source: 'awaiting-trusted-pat-v4', status: 'PENDING' };
  let notificationState = { ...notifications.state, codexReviewRequest };

  for (const notificationEvent of notificationPhases.beforePublish) {
    const delivery = await deliverDiscord(process.env.DISCORD_WEBHOOK_URL, discordMessage(notificationEvent, result));
    if (delivery.delivered) notificationState = recordDeliveredNotification(notificationState, notificationEvent, result);
  }

  let body = renderComment(result, notificationState);
  let readinessComment = priorComment;
  if (!readinessComment) readinessComment = await github(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
  else if (readinessComment.body !== body) readinessComment = await github(`/repos/${owner}/${repo}/issues/comments/${readinessComment.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });

  const checkName = readinessCheckName(pr.number);
  const externalId = readinessCheckIdentity(pr.number);
  const existing = reusableReadinessCheck(findReadinessCheck(runs.check_runs, pr.number, head), readiness.state);
  const checkPayload = readiness.state === 'WAITING'
    ? { name: checkName, external_id: externalId, head_sha: head, status: 'in_progress', output: { title: 'Waiting for current-head results', summary: renderCheckSummary(body) } }
    : { name: checkName, external_id: externalId, head_sha: head, status: 'completed', conclusion: readiness.state === 'READY' ? 'success' : 'failure', output: { title: readiness.state === 'READY' ? 'Ready for manual merge' : 'Action required', summary: renderCheckSummary(body) } };
  const checkRequest = existing ? (({ head_sha: _head, ...update }) => update)(checkPayload) : checkPayload;
  await github(existing ? `/repos/${owner}/${repo}/check-runs/${existing.id}` : `/repos/${owner}/${repo}/check-runs`, { method: existing ? 'PATCH' : 'POST', body: JSON.stringify(checkRequest) });

  for (const event of notificationPhases.afterPublish) {
    const delivery = await deliverDiscord(process.env.DISCORD_WEBHOOK_URL, discordMessage(event, result));
    if (delivery.delivered) notificationState = recordDeliveredNotification(notificationState, event, result);
  }
  const deliveredBody = renderComment(result, notificationState);
  if (deliveredBody !== body) {
    body = deliveredBody;
    await github(`/repos/${owner}/${repo}/issues/comments/${readinessComment.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
  }
  console.log(`PR #${pr.number} ${head.slice(0, 7)}: ${readiness.state}; Discord events: ${notifications.events.join(', ') || 'none'}`);
}

async function main() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required.');
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(await (await import('node:fs/promises')).readFile(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const number = Number(process.env.PR_NUMBER) || event.pull_request?.number || event.issue?.pull_request && event.issue.number || event.check_run?.pull_requests?.[0]?.number;
  const pulls = number
    ? [await github(`/repos/${owner}/${repo}/pulls/${number}`)]
    : await hydratePulls(await github(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`), (pullNumber) => github(`/repos/${owner}/${repo}/pulls/${pullNumber}`));
  for (const pull of pulls) {
    if (!isOpenPull(pull)) { console.log(`PR #${pull.number} is no longer open; skipping.`); continue; }
    await evaluatePull(owner, repo, pull, event);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.message); process.exitCode = 1; });