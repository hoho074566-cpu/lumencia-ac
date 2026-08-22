#!/usr/bin/env node

const MARKER = '<!-- lumensia-merge-readiness:v1 -->';
const STATE_PREFIX = 'lumensia-readiness-state:';
const TERMINAL_FAILURES = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale']);

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
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
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

export function evaluateCodex({ head, reviews = [], comments = [], configuredActors = '' }) {
  const trustedReviews = reviews.filter((review) => isCodexActor(review.user, configuredActors));
  const dismissedReviewIds = new Set(trustedReviews.filter((review) => review.state?.toUpperCase() === 'DISMISSED').map((review) => review.id));
  const currentReviews = trustedReviews.filter((review) => review.commit_id === head && review.submitted_at && review.state?.toUpperCase() !== 'DISMISSED');
  const currentComments = comments.filter((comment) => comment.commit_id === head && isCodexActor(comment.user, configuredActors) && !dismissedReviewIds.has(comment.pull_request_review_id));
  if (currentReviews.length === 0) return { state: 'PENDING', P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 };
  const totals = { P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 };
  for (const item of [...currentReviews, ...currentComments]) {
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
    const stamp = Date.parse(item.completed_at || item.updated_at || item.started_at || item.created_at || 0) || 0;
    const previousStamp = previous ? Date.parse(previous.completed_at || previous.updated_at || previous.started_at || previous.created_at || 0) || 0 : -1;
    if (!previous || stamp > previousStamp || stamp === previousStamp && Number(item.id || 0) > Number(previous.id || 0)) newest.set(key, item);
  }
  return [...newest.values()];
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
  const vercelChecks = newestAttempts(currentChecks.filter((check) => /vercel/i.test(`${check.name} ${check.app?.name || ''}`)), checkIdentity);
  const vercelStatuses = newestAttempts(statuses.filter((status) => (!status.sha || status.sha === head) && /vercel/i.test(status.context || '')), (status) => status.context.toLowerCase());
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

export function parseMachineState(body = '', head = '') {
  const match = String(body).match(/lumensia-readiness-state:\s*(\{[^]*?\})\s*-->/);
  try {
    const state = match ? JSON.parse(match[1]) : {};
    return state.head === head ? state : { head };
  } catch {
    return { head };
  }
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

async function evaluatePull(owner, repo, pr) {
  const head = pr.head.sha;
  const [reviews, comments, runs, combined, issueComments] = await Promise.all([
    github(`/repos/${owner}/${repo}/pulls/${pr.number}/reviews?per_page=100`),
    github(`/repos/${owner}/${repo}/pulls/${pr.number}/comments?per_page=100`),
    github(`/repos/${owner}/${repo}/commits/${head}/check-runs?per_page=100`),
    github(`/repos/${owner}/${repo}/commits/${head}/status`),
    github(`/repos/${owner}/${repo}/issues/${pr.number}/comments?per_page=100`),
  ]);
  const codex = evaluateCodex({ head, reviews, comments, configuredActors: process.env.CODEX_ACTORS });
  const requiredCheckNames = (process.env.REQUIRED_CHECKS || '').split(',');
  const checks = evaluateChecks({ head, baseSha: pr.base.sha, prNumber: pr.number, checkRuns: runs.check_runs, statuses: combined.statuses, requiredCheckNames });
  const readiness = evaluateReadiness({ codex, checks, mergeable: pr.mergeable, mergeableState: pr.mergeable_state, draft: pr.draft });
  const currentPr = await github(`/repos/${owner}/${repo}/pulls/${pr.number}`);
  if (!isCurrentPull(pr, currentPr)) { console.log(`PR #${pr.number} changed or closed during evaluation; skipping mutations.`); return; }
  const priorComment = issueComments.find((comment) => comment.body?.includes(MARKER) && /github-actions\[bot\]/i.test(comment.user?.login || ''));
  const result = { number: pr.number, url: pr.html_url, head, codex, checks, readiness };
  const notifications = plannedNotifications(parseMachineState(priorComment?.body, head), result);
  let notificationState = notifications.state;
  for (const event of notifications.events) {
    const delivery = await deliverDiscord(process.env.DISCORD_WEBHOOK_URL, discordMessage(event, result));
    if (delivery.delivered) notificationState = recordDeliveredNotification(notificationState, event, result);
  }
  const body = renderComment(result, notificationState);
  if (!priorComment) await github(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
  else if (priorComment.body !== body) await github(`/repos/${owner}/${repo}/issues/comments/${priorComment.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
  const existing = reusableReadinessCheck(newestAttempts(
    runs.check_runs.filter((run) => run.name === 'Lumensia Merge Readiness' && run.head_sha === head),
    () => 'lumensia-merge-readiness',
  )[0], readiness.state);
  const checkPayload = readiness.state === 'WAITING'
    ? { name: 'Lumensia Merge Readiness', head_sha: head, status: 'in_progress', output: { title: 'Waiting for current-head results', summary: renderCheckSummary(body) } }
    : { name: 'Lumensia Merge Readiness', head_sha: head, status: 'completed', conclusion: readiness.state === 'READY' ? 'success' : 'failure', output: { title: readiness.state === 'READY' ? 'Ready for manual merge' : 'Action required', summary: renderCheckSummary(body) } };
  const checkRequest = existing ? (({ head_sha: _head, ...update }) => update)(checkPayload) : checkPayload;
  await github(existing ? `/repos/${owner}/${repo}/check-runs/${existing.id}` : `/repos/${owner}/${repo}/check-runs`, { method: existing ? 'PATCH' : 'POST', body: JSON.stringify(checkRequest) });
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
    await evaluatePull(owner, repo, pull);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
