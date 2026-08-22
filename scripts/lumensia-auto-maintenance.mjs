#!/usr/bin/env node

import {
  AUTO_PR_MARKER,
  DISCORD_DELIVERED_MARKER,
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
export const MAX_AUTO_MERGE_CODE_FILES = 12;
export const MAX_AUTO_MERGE_LINE_CHANGES = 500;
const OFFICIAL_CODEX_ACTORS = ['chatgpt-codex-connector[bot]', 'chatgpt-codex-connector'];
const OLD_AUTO_PR_POLICY = 'Manual merge only. P0/P1 and failed authoritative checks block merge. P2/P3 are non-blocking by project policy.';
const V12_AUTO_PR_POLICY = 'V1.2: guarded low-risk PRs may auto-merge after authoritative checks pass. Protected/high-risk changes require human merge. P0/P1 may trigger up to five focused auto-fix attempts; P2/P3 remain non-blocking.';

const PROTECTED_EXACT_PATHS = new Set([
  'AGENTS.md',
  'app.js',
  'app-runtime.js',
  'sw.js',
  'index.html',
  'vercel.json',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function repoFullName(repo = {}) {
  if (repo.full_name) return String(repo.full_name).toLowerCase();
  const owner = repo.owner?.login || repo.owner?.name;
  return owner && repo.name ? `${owner}/${repo.name}`.toLowerCase() : '';
}

export function trustedCodexActors(configured = '') {
  const extra = String(configured || '').split(',').map((item) => item.trim()).filter(Boolean);
  return [...new Set([...OFFICIAL_CODEX_ACTORS, ...extra])].join(',');
}

export function isAutoManagedPull(pull = {}, owner = '', repo = '') {
  const expectedOwner = String(owner || '').toLowerCase();
  const expectedRepo = `${owner}/${repo}`.toLowerCase();
  if (!expectedOwner || !repo) return false;
  return pull?.state === 'open'
    && !pull?.draft
    && String(pull?.user?.login || '').toLowerCase() === expectedOwner
    && repoFullName(pull?.head?.repo) === expectedRepo
    && repoFullName(pull?.base?.repo) === expectedRepo
    && String(pull?.head?.ref || '').startsWith('codex/')
    && !String(pull?.head?.ref || '').toLowerCase().includes('-no-pr')
    && String(pull?.body || '').includes(AUTO_PR_MARKER)
    && String(pull?.body || '').includes(DISCORD_DELIVERED_MARKER);
}

export function protectedMergeReason(path = '') {
  const normalized = String(path || '').replace(/^\.\//, '');
  const lower = normalized.toLowerCase();
  if (PROTECTED_EXACT_PATHS.has(normalized)) return 'core-or-config';
  if (/(^|\/)\.env[^/]*$/i.test(normalized) || /(^|\/)[^/]+\.env$/i.test(normalized)) return 'environment-config';
  if (lower.startsWith('.github/')) return 'automation';
  if (lower.startsWith('scripts/tests/') && lower.endsWith('.test.mjs')) return 'automation-safety-test';
  if (lower.startsWith('scripts/lumensia-') || lower.startsWith('scripts/tests/lumensia-')) return 'automation';
  if (lower.startsWith('api/')) return 'api';
  if (/(^|\/)(?:auth|security|secrets?|tokens?)(?:[.\/_-]|$)/i.test(normalized)) return 'auth-security';
  if (/(^|\/)(?:save|schema|migration|migrations|persist|persistence|storage)(?:[.\/_-]|$)/i.test(normalized)) return 'persistence-schema';
  if (/(^|\/)(?:canon|canonical)(?:[.\/_-]|$)/i.test(normalized)) return 'canon';
  return '';
}

export function protectedMergePaths(files = []) {
  const seen = new Set();
  const protectedPaths = [];
  for (const file of files) {
    const paths = typeof file === 'string'
      ? [{ path: file, source: 'filename' }]
      : [
        { path: file?.filename, source: 'filename' },
        { path: file?.previous_filename, source: 'previous_filename' },
      ];
    for (const item of paths) {
      if (!item.path) continue;
      const key = `${item.source}:${item.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const reason = protectedMergeReason(item.path);
      if (reason) protectedPaths.push({ path: item.path, source: item.source, reason });
    }
  }
  return protectedPaths;
}

export function isDocumentationOrAssetPath(path = '') {
  const normalized = String(path || '').replace(/^\.\//, '').toLowerCase();
  return normalized.startsWith('docs/') || normalized.startsWith('assets/');
}

export function autoMergeBreadth(files = []) {
  let codeFiles = 0;
  let lineChanges = 0;
  for (const file of files) {
    if (!file || typeof file === 'string') {
      if (typeof file === 'string' && !isDocumentationOrAssetPath(file)) codeFiles += 1;
      continue;
    }
    const currentPath = file.filename || '';
    const previousPath = file.previous_filename || '';
    const lowRiskOnly = Boolean(currentPath)
      && isDocumentationOrAssetPath(currentPath)
      && (!previousPath || isDocumentationOrAssetPath(previousPath));
    if (lowRiskOnly) continue;
    codeFiles += 1;
    const explicitChanges = Number(file.changes);
    const fallbackChanges = Number(file.additions || 0) + Number(file.deletions || 0);
    lineChanges += Number.isFinite(explicitChanges) ? Math.max(0, explicitChanges) : Math.max(0, fallbackChanges);
  }
  return { codeFiles, lineChanges };
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
      && String(comment.user?.login || '').toLowerCase() === actor)
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

export function findTrustedHumanCheck(issueComments = [], prNumber, head, owner = '', reason = '') {
  const actor = String(owner || '').toLowerCase();
  return issueComments.find((comment) => {
    if (String(comment.user?.login || '').toLowerCase() !== actor) return false;
    const state = parseHiddenJsonMarker(comment.body, HUMAN_CHECK_MARKER);
    return state
      && Number(state.pr) === Number(prNumber)
      && state.head === head
      && (!reason || state.reason === reason);
  }) || null;
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
  if (checks?.safety === 'FAIL' || checks?.vercel === 'FAIL' || checks?.required === 'FAIL') {
    return { action: 'HUMAN', reason: 'authoritative-check-failed', details: [`Safety=${checks?.safety}`, `Vercel=${checks?.vercel}`, `Required=${checks?.required}`] };
  }

  const blockers = Number(codex?.P0 || 0) + Number(codex?.P1 || 0);
  if (codex?.state === 'BLOCK' && blockers > 0) {
    const currentHeadRequest = [...fixRequests].reverse().find(({ request }) => request?.head === pull?.head?.sha);
    if (currentHeadRequest) {
      if (ageMinutes(currentHeadRequest.comment?.created_at, now) >= FIX_STALL_MINUTES) {
        return { action: 'HUMAN', reason: 'fix-stalled', details: [`Auto-fix request did not move HEAD within ${FIX_STALL_MINUTES} minutes.`] };
      }
      return { action: 'WAIT', reason: 'fix-in-flight' };
    }
    if (fixRequests.length >= MAX_AUTO_FIX_ATTEMPTS) {
      return { action: 'HUMAN', reason: 'max-fix-attempts', details: [`P0/P1 still present after ${MAX_AUTO_FIX_ATTEMPTS} attempts.`] };
    }
    return { action: 'FIX', attempt: fixRequests.length + 1 };
  }

  if (Number(codex?.unknown || 0) > 0) {
    return { action: 'HUMAN', reason: 'codex-unknown', details: [`Codex returned ${Number(codex.unknown)} unclassified finding(s).`] };
  }

  if (readiness?.state !== 'READY') return { action: 'WAIT', reason: 'not-ready' };
  if (pull?.mergeable !== true || pull?.mergeable_state !== 'clean') return { action: 'WAIT', reason: 'merge-state-not-clean' };

  const protectedPaths = protectedMergePaths(files);
  if (protectedPaths.length) {
    return {
      action: 'HUMAN',
      reason: 'protected-paths',
      details: protectedPaths.map((item) => `${item.path}${item.source === 'previous_filename' ? ' [renamed source]' : ''} (${item.reason})`),
    };
  }

  const breadth = autoMergeBreadth(files);
  if (breadth.codeFiles > MAX_AUTO_MERGE_CODE_FILES || breadth.lineChanges > MAX_AUTO_MERGE_LINE_CHANGES) {
    return {
      action: 'HUMAN',
      reason: 'high-risk-breadth',
      details: [
        `Non-doc/asset files=${breadth.codeFiles} (max ${MAX_AUTO_MERGE_CODE_FILES})`,
        `Non-doc/asset line changes=${breadth.lineChanges} (max ${MAX_AUTO_MERGE_LINE_CHANGES})`,
      ],
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
  const codex = requestEntry
    ? evaluateCodex({
      head,
      reviews,
      comments: reviewComments,
      issueComments,
      baselineReviewIds: requestEntry.request.baselineReviewIds || [],
      baselineReviewCommentIds: requestEntry.request.baselineReviewCommentIds || [],
      baselineIssueCommentIds: requestEntry.request.baselineIssueCommentIds || [],
      configuredActors: trustedCodexActors(configuredActors),
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
  return { issueComments, files, requestEntry, codex, checks, readiness };
}

async function ensureHumanCheck({ api, webhook, pull, signals, reason, details, owner, logger, discordFetch }) {
  if (findTrustedHumanCheck(signals.issueComments, pull.number, pull.head.sha, owner, reason)) return false;
  await api.createIssueComment(pull.number, makeHumanCheckBody({ prNumber: pull.number, head: pull.head.sha, reason, details }));
  await deliverDiscord(
    webhook,
    `🧑‍🔧 **Lumensia PR #${pull.number} 사람 확인 필요**\nReason: \`${cleanText(reason)}\`\nHEAD: \`${pull.head.sha.slice(0, 7)}\`\n${pull.html_url}`,
    discordFetch,
    logger,
  );
  return true;
}

async function syncAutoPrPolicy(api, pull) {
  if (!String(pull.body || '').includes(OLD_AUTO_PR_POLICY)) return pull;
  const body = pull.body.replace(OLD_AUTO_PR_POLICY, V12_AUTO_PR_POLICY);
  const updated = await api.updatePull(pull.number, { body });
  return { ...pull, ...updated, body };
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
    if (!isAutoManagedPull(candidate, owner, repo)) continue;
    summary.eligible += 1;
    try {
      let pull = await api.getPull(candidate.number);
      if (!isAutoManagedPull(pull, owner, repo)) continue;
      pull = await syncAutoPrPolicy(api, pull);
      let signals = await evaluatePull(api, pull, owner, configuredActors);

      // Any trusted current-head human marker is a persistent automation hold.
      if (findTrustedHumanCheck(signals.issueComments, pull.number, pull.head.sha, owner)) {
        summary.humanRequired += 1;
        continue;
      }

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
        await api.createIssueComment(pull.number, makeAutoFixRequestBody({
          prNumber: pull.number,
          head: pull.head.sha,
          baseSha: pull.base.sha,
          branch: pull.head.ref,
          attempt: decision.attempt,
          reviewRequestCommentId: signals.requestEntry.comment.id,
        }));
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
        if (await ensureHumanCheck({ api, webhook, pull, signals, reason: decision.reason, details: decision.details || [], owner, logger, discordFetch })) summary.humanRequired += 1;
        continue;
      }

      if (decision.action !== 'MERGE') {
        summary.waiting += 1;
        continue;
      }

      // Final revalidation closes stale-head/base/check races before the privileged mutation.
      pull = await api.getPull(pull.number);
      if (!isAutoManagedPull(pull, owner, repo)) { summary.waiting += 1; continue; }
      signals = await evaluatePull(api, pull, owner, configuredActors);
      if (findTrustedHumanCheck(signals.issueComments, pull.number, pull.head.sha, owner)) {
        summary.humanRequired += 1;
        continue;
      }
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
        if (decision.action === 'HUMAN' && await ensureHumanCheck({ api, webhook, pull, signals, reason: decision.reason, details: decision.details || [], owner, logger, discordFetch })) summary.humanRequired += 1;
        else summary.waiting += 1;
        continue;
      }

      const validatedHead = pull.head.sha;
      const validatedBase = pull.base.sha;
      const mergeCandidate = await api.getPull(pull.number);
      if (!isAutoManagedPull(mergeCandidate, owner, repo)
        || mergeCandidate.head?.sha !== validatedHead
        || mergeCandidate.base?.sha !== validatedBase
        || mergeCandidate.mergeable !== true
        || mergeCandidate.mergeable_state !== 'clean') {
        summary.waiting += 1;
        continue;
      }
      pull = mergeCandidate;

      let result;
      try {
        result = await mergeApi.mergePull(pull.number, pull.head.sha, 'merge');
      } catch (error) {
        const details = [`HTTP ${error?.status || 'error'}: ${cleanText(error?.data?.message || error?.message || 'GitHub rejected the merge.')}`];
        if (await ensureHumanCheck({ api, webhook, pull, signals, reason: 'merge-rejected', details, owner, logger, discordFetch })) summary.humanRequired += 1;
        continue;
      }
      if (!result?.merged) {
        if (await ensureHumanCheck({ api, webhook, pull, signals, reason: 'merge-rejected', details: [result?.message || 'GitHub rejected the merge.'], owner, logger, discordFetch })) summary.humanRequired += 1;
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
