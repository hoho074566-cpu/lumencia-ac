#!/usr/bin/env node

import {
  AUTO_PR_MARKER,
  createGitHubClient,
  findLatestCodexReviewRequest,
} from './lumensia-auto-pr.mjs';
import {
  evaluateChecks,
  evaluateCodex,
  evaluateReadiness,
} from './lumensia-merge-readiness.mjs';

export const AUTO_FIX_MARKER = 'lumensia-auto-fix:v1';
export const HUMAN_CHECK_MARKER = 'lumensia-human-check:v1';
export const MAX_AUTO_FIX_ATTEMPTS = 5;
export const FIX_STALL_MINUTES = 30;
const OFFICIAL_CODEX_ACTORS = ['chatgpt-codex-connector[bot]', 'chatgpt-codex-connector'];

const PROTECTED_EXACT_PATHS = new Set([
  'AGENTS.md',
  'app.js',
  'app-runtime.js',
  'index.html',
  'vercel.json',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'scripts/lumensia-auto-pr.mjs',
  'scripts/lumensia-auto-maintenance.mjs',
  'scripts/lumensia-merge-readiness.mjs',
  'scripts/lumensia-pr-check.mjs',
]);

function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function trustedCodexActors(configured = '') {
  const extra = String(configured || '').split(',').map((item) => item.trim()).filter(Boolean);
  return [...new Set([...OFFICIAL_CODEX_ACTORS, ...extra])].join(',');
}

export function isAutoManagedPull(pull = {}) {
  return pull?.state === 'open'
    && !pull?.draft
    && String(pull?.head?.ref || '').startsWith('codex/')
    && !String(pull?.head?.ref || '').toLowerCase().includes('-no-pr')
    && String(pull?.body || '').includes(AUTO_PR_MARKER);
}

export function protectedMergeReason(path = '') {
  const normalized = String(path || '').replace(/^\.\//, '');
  const lower = normalized.toLowerCase();
  if (PROTECTED_EXACT_PATHS.has(normalized)) return 'core-or-automation';
  if (lower.startsWith('.github/')) return 'automation';
  if (lower.startsWith('api/')) return 'api';
  if (/(^|\/)(?:auth|security|secrets?|tokens?)(?:[.\/_-]|$)/i.test(normalized)) return 'auth-security';
  if (/(^|\/)(?:save|schema|migration|migrations|persist|persistence|storage)(?:[.\/_-]|$)/i.test(normalized)) return 'persistence-schema';
  if (/(^|\/)(?:canon|canonical)(?:[.\/_-]|$)/i.test(normalized)) return 'canon';
  return '';
}

export function protectedMergePaths(files = []) {
  return files
    .map((file) => typeof file === 'string' ? file : file?.filename)
    .filter(Boolean)
    .map((path) => ({ path, reason: protectedMergeReason(path) }))
    .filter((item) => item.reason);
}

function parseHiddenJsonMarker(body = '', marker = '') {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(body).match(new RegExp(`<!--\\s*${escaped}\\s*\\n(\\{[^]*?\\})\\s*\\n?-->`));
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

export function parseAutoFixRequest(body = '') {
  return parseHiddenJsonMarker(body, AUTO_FIX_MARKER);
}

export function trustedAutoFixRequests(issueComments = [], prNumber, owner = '') {
  const actor = String(owner || '').toLowerCase();
  return issueComments
    .map((comment) => ({ comment, request: parseAutoFixRequest(comment.body) }))
    .filter(({ comment, request }) => request
      && Number(request.pr) === Number(prNumber)
      && (!actor || String(comment.user?.login || '').toLowerCase() === actor))
    .sort((left, right) => Number(left.request.attempt || 0) - Number(right.request.attempt || 0));
}

export function makeAutoFixRequestBody({ prNumber, head, baseSha, branch, attempt, reviewRequestCommentId }) {
  const state = {
    pr: Number(prNumber),
    head: String(head || ''),
    baseSha: String(baseSha || ''),
    attempt: Number(attempt),
    reviewRequestCommentId: Number(reviewRequestCommentId || 0),
  };
  return `<!-- ${AUTO_FIX_MARKER}\n${JSON.stringify(state)}\n-->\n\n@codex address that feedback\n\nFix only the current P0/P1 findings for exact HEAD \`${state.head}\` on PR #${state.pr}. Keep the change focused and preserve unrelated behavior. Do not spend scope on P2/P3 unless required to resolve a P0/P1. Commit the fix to \`${cleanText(branch)}\`, run the repository-owned safety checks and relevant deterministic tests, and do not merge the PR.`;
}

export function makeHumanCheckBody({ prNumber, head, reason, details = [] }) {
  const state = { pr: Number(prNumber), head: String(head || ''), reason: String(reason || 'unknown'), details };
  return `<!-- ${HUMAN_CHECK_MARKER}\n${JSON.stringify(state)}\n-->\n\n## Lumensia V1.2 human check required\n\nReason: \`${cleanText(reason)}\`\nHEAD: \`${String(head || '').slice(0, 10)}\`${details.length ? `\n\n${details.map((item) => `- ${cleanText(item)}`).join('\n')}` : ''}`;
}

function matchingHumanCheck(issueComments, prNumber, head, reason) {
  return issueComments.some((comment) => {
    const state = parseHiddenJsonMarker(comment.body, HUMAN_CHECK_MARKER);
    return state
      && Number(state.pr) === Number(prNumber)
      && state.head === head
      && state.reason === reason;
  });
}

function ageMinutes(value, now = new Date()) {
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? Math.max(0, (now.getTime() - stamp) / 60000) : Infinity;
}

export function decideMaintenanceAction({
  pull,
  codex,
  checks,
  readiness,
  files = [],
  fixRequests = [],
  now = new Date(),
  mergeTokenAvailable = true,
}) {
  const blockers = Number(codex?.P0 || 0) + Number(codex?.P1 || 0);
  if (codex?.state === 'BLOCK' && blockers > 0) {
    if (fixRequests.length >= MAX_AUTO_FIX_ATTEMPTS) {
      return { action: 'HUMAN', reason: 'max-fix-attempts', details: [`P0/P1 still present after ${MAX_AUTO_FIX_ATTEMPTS} attempts.`] };
    }
    const currentHeadRequest = [...fixRequests].reverse().find(({ request }) => request?.head === pull?.head?.sha);
    if (currentHeadRequest) {
      if (ageMinutes(currentHeadRequest.comment?.created_at, now) >= FIX_STALL_MINUTES) {
        return { action: 'HUMAN', reason: 'fix-stalled', details: [`Auto-fix request did not move HEAD within ${FIX_STALL_MINUTES} minutes.`] };
      }
      return { action: 'WAIT', reason: 'fix-in-flight' };
    }
    return { action: 'FIX', attempt: fixRequests.length + 1 };
  }

  if (checks?.safety === 'FAIL' || checks?.vercel === 'FAIL' || checks?.required === 'FAIL') {
    return { action: 'HUMAN', reason: 'authoritative-check-failed', details: [`Safety=${checks?.safety}`, `Vercel=${checks?.vercel}`, `Required=${checks?.required}`] };
  }

  if (readiness?.state !== 'READY') return { action: 'WAIT', reason: 'not-ready' };

  const protectedPaths = protectedMergePaths(files);
  if (protectedPaths.length) {
    return {
      action: 'HUMAN',
      reason: 'protected-paths',
      details: protectedPaths.map((item) => `${item.path} (${item.reason})`),
    };
  }
  if (!mergeTokenAvailable) return { action: 'HUMAN', reason: 'merge-token-unavailable' };
  return { action: 'MERGE' };
}

async function deliverDiscord(webhook, message, fetchImpl = fetch, logger = console) {
  if (!webhook) return { delivered: false, reason: 'missing' };
  try {
    const response = await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }),
    });
    if (!response.ok) {
      logger.warn(`V1.2 Discord notification failed with HTTP ${response.status}.`);
      return { delivered: false, reason: 'http' };
    }
    return { delivered: true };
  } catch (error) {
    logger.warn(`V1.2 Discord notification failed: ${error?.name || 'network error'}.`);
    return { delivered: false, reason: 'network' };
  }
}

async function evaluatePull(api, pull, owner, configuredActors) {
  const head = pull.head.sha;
  const baseSha = pull.base.sha;
  const [issueComments, reviews, reviewComments, checkRunsResponse, combinedStatus, files] = await Promise.all([
    api.listIssueComments(pull.number),
    api.listReviews(pull.number),
    api.listReviewComments(pull.number),
    api.listCheckRuns(head),
    api.getCombinedStatus(head),
    api.listPullFiles(pull.number),
  ]);
  const requestEntry = findLatestCodexReviewRequest(issueComments, pull.number, owner, head, baseSha);
  const actors = trustedCodexActors(configuredActors);
  const codex = requestEntry
    ? evaluateCodex({
      head,
      reviews,
      comments: reviewComments,
      issueComments,
      baselineReviewIds: requestEntry.request.baselineReviewIds || [],
      baselineReviewCommentIds: requestEntry.request.baselineReviewCommentIds || [],
      baselineIssueCommentIds: requestEntry.request.baselineIssueCommentIds || [],
      configuredActors: actors,
      requestCreatedAt: requestEntry.comment.created_at || '',
    })
    : { state: 'PENDING', P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 };
  const checks = evaluateChecks({
    head,
    baseSha,
    prNumber: pull.number,
    checkRuns: checkRunsResponse?.check_runs || [],
    statuses: combinedStatus?.statuses || [],
    requiredCheckNames: String(process.env.REQUIRED_CHECKS || '').split(','),
  });
  const readiness = evaluateReadiness({
    codex,
    checks,
    mergeable: pull.mergeable,
    mergeableState: pull.mergeable_state,
    draft: pull.draft,
  });
  return { issueComments, reviews, reviewComments, files, requestEntry, codex, checks, readiness };
}

async function ensureHumanCheck({ api, webhook, pull, signals, reason, details, logger, discordFetch }) {
  if (matchingHumanCheck(signals.issueComments, pull.number, pull.head.sha, reason)) return false;
  await api.createIssueComment(pull.number, makeHumanCheckBody({ prNumber: pull.number, head: pull.head.sha, reason, details }));
  await deliverDiscord(
    webhook,
    `🧑‍🔧 **Lumensia PR #${pull.number} 사람 확인 필요**\nReason: \`${cleanText(reason)}\`\nHEAD: \`${pull.head.sha.slice(0, 7)}\`\n${pull.html_url}`,
    discordFetch,
    logger,
  );
  return true;
}

function initialSummary() {
  return { scanned: 0, eligible: 0, fixesRequested: 0, merged: 0, humanRequired: 0, waiting: 0, errors: [] };
}

export async function maintainAutoPulls({
  token,
  mergeToken,
  owner,
  repo,
  api,
  mergeApi,
  webhook = '',
  configuredActors = '',
  now = new Date(),
  logger = console,
  discordFetch = fetch,
}) {
  const summary = initialSummary();
  if (!token) {
    logger.warn('AUTO MAINTENANCE DISABLED / missing LUMENSIA_PR_CREATOR_TOKEN');
    return summary;
  }
  await api.validate();
  const pulls = await api.listOpenPulls();
  summary.scanned = pulls.length;

  for (const candidate of pulls) {
    if (!isAutoManagedPull(candidate)) continue;
    summary.eligible += 1;
    try {
      let pull = await api.getPull(candidate.number);
      if (!isAutoManagedPull(pull)) continue;
      let signals = await evaluatePull(api, pull, owner, configuredActors);
      let fixRequests = trustedAutoFixRequests(signals.issueComments, pull.number, owner);
      let decision = decideMaintenanceAction({
        pull,
        codex: signals.codex,
        checks: signals.checks,
        readiness: signals.readiness,
        files: signals.files,
        fixRequests,
        now,
        mergeTokenAvailable: Boolean(mergeToken && mergeApi),
      });

      if (decision.action === 'FIX') {
        if (!signals.requestEntry) { summary.waiting += 1; continue; }
        const body = makeAutoFixRequestBody({
          prNumber: pull.number,
          head: pull.head.sha,
          baseSha: pull.base.sha,
          branch: pull.head.ref,
          attempt: decision.attempt,
          reviewRequestCommentId: signals.requestEntry.comment.id,
        });
        await api.createIssueComment(pull.number, body);
        summary.fixesRequested += 1;
        await deliverDiscord(
          webhook,
          `🛠️ **Lumensia PR #${pull.number} 자동 수정 ${decision.attempt}/${MAX_AUTO_FIX_ATTEMPTS}**\nP0 ${signals.codex.P0} · P1 ${signals.codex.P1}\nHEAD: \`${pull.head.sha.slice(0, 7)}\`\n${pull.html_url}`,
          discordFetch,
          logger,
        );
        continue;
      }

      if (decision.action === 'HUMAN') {
        if (await ensureHumanCheck({ api, webhook, pull, signals, reason: decision.reason, details: decision.details || [], logger, discordFetch })) summary.humanRequired += 1;
        continue;
      }

      if (decision.action !== 'MERGE') {
        summary.waiting += 1;
        continue;
      }

      // Final revalidation closes races between the initial decision and the merge mutation.
      pull = await api.getPull(pull.number);
      if (!isAutoManagedPull(pull)) { summary.waiting += 1; continue; }
      signals = await evaluatePull(api, pull, owner, configuredActors);
      fixRequests = trustedAutoFixRequests(signals.issueComments, pull.number, owner);
      decision = decideMaintenanceAction({
        pull,
        codex: signals.codex,
        checks: signals.checks,
        readiness: signals.readiness,
        files: signals.files,
        fixRequests,
        now,
        mergeTokenAvailable: Boolean(mergeToken && mergeApi),
      });
      if (decision.action !== 'MERGE') {
        if (decision.action === 'HUMAN' && await ensureHumanCheck({ api, webhook, pull, signals, reason: decision.reason, details: decision.details || [], logger, discordFetch })) summary.humanRequired += 1;
        else summary.waiting += 1;
        continue;
      }

      const result = await mergeApi.mergePull(pull.number, pull.head.sha, 'merge');
      if (!result?.merged) {
        if (await ensureHumanCheck({ api, webhook, pull, signals, reason: 'merge-rejected', details: [result?.message || 'GitHub rejected the merge.'], logger, discordFetch })) summary.humanRequired += 1;
        continue;
      }
      summary.merged += 1;
      await deliverDiscord(
        webhook,
        `✅ **Lumensia PR #${pull.number} 자동 병합 완료**\nHEAD: \`${pull.head.sha.slice(0, 7)}\`\nMerge: \`${String(result.sha || '').slice(0, 7)}\`\n${pull.html_url}`,
        discordFetch,
        logger,
      );
    } catch (error) {
      summary.errors.push({ pr: candidate.number, status: error?.status || null, message: cleanText(error?.message || error?.name || 'error') });
      logger.error(`Auto maintenance failed: PR #${candidate.number} (${error?.status ? `HTTP ${error.status}` : error?.name || 'error'}).`);
    }
  }
  return summary;
}

export function logMaintenanceSummary(summary, logger = console) {
  logger.log(`AUTO MAINTENANCE\n\nOpen PRs scanned: ${summary.scanned}\nEligible Auto-PRs: ${summary.eligible}\nFix requests: ${summary.fixesRequested}\nAuto-merged: ${summary.merged}\nHuman required: ${summary.humanRequired}\nWaiting: ${summary.waiting}\nErrors: ${summary.errors.length}`);
}

async function main() {
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be set to owner/repository.');
  const token = process.env.LUMENSIA_PR_CREATOR_TOKEN || '';
  const mergeToken = process.env.LUMENSIA_AUTO_MERGE_TOKEN || '';
  const api = createGitHubClient({ token, owner, repo });
  const mergeApi = mergeToken ? createGitHubClient({ token: mergeToken, owner, repo }) : null;
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
