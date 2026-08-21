#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const stableJavaScriptFiles = [
  'app-runtime.js',
  'app.js',
  'api/chat-router.js',
  'api/chat.js',
  'api/health.js',
  'api/lib/context-router.js',
];

const corePaths = new Set(stableJavaScriptFiles);
const allowedApiEntrypoints = new Set(['api/chat-router.js', 'api/chat.js', 'api/health.js']);
const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`::error::${message}`);
}

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function runNodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`Syntax check failed: ${file}`);
    process.stderr.write(result.stderr || result.stdout);
    return;
  }
  console.log(`PASS syntax: ${file}`);
}

for (const file of stableJavaScriptFiles) {
  if (!existsSync(file)) {
    fail(`Required stable file is missing: ${file}`);
    continue;
  }

  runNodeCheck(file);
}

const testDirectory = 'scripts/tests';
const deterministicTests = existsSync(testDirectory)
  ? readdirSync(testDirectory).filter((file) => file.endsWith('.test.mjs')).sort().map((file) => `${testDirectory}/${file}`)
  : [];
if (!deterministicTests.length) fail('No permanent deterministic tests found under scripts/tests');
for (const file of deterministicTests) {
  runNodeCheck(file);
  const result = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`Deterministic test failed: ${file}`);
    process.stderr.write(result.stderr || result.stdout);
  } else {
    const summary = (result.stdout || '').trim().split('\n').at(-1);
    console.log(summary || `PASS test: ${file}`);
  }
}

const requiredArchitecture = [
  ['index.html', /<script\s+type=["']module["']\s+src=["']\/app-runtime\.js["']><\/script>/, 'index.html must load /app-runtime.js'],
  ['app-runtime.js', /fetch\(["']\/api\/chat-router["']/, 'app-runtime.js must use /api/chat-router'],
  ['api/chat-router.js', /from\s+["']\.\/chat\.js["']/, 'api/chat-router.js must wrap api/chat.js'],
  ['api/chat-router.js', /from\s+["']\.\/lib\/context-router\.js["']/, 'api/chat-router.js must use api/lib/context-router.js'],
];

for (const [file, pattern, message] of requiredArchitecture) {
  if (!existsSync(file) || !pattern.test(readFileSync(file, 'utf8'))) fail(message);
  else console.log(`PASS architecture: ${message}`);
}

const forbiddenStableNames = [
  /^app-v\d+(?:-[^.]+)?\.js$/i,
  /^api\/chat-v\d+(?:-[^.]+)?\.js$/i,
  /^api\/lib\/context-router-v\d+(?:-[^.]+)?\.js$/i,
];
const trackedFiles = runGit(['ls-files']).split('\n').filter(Boolean);
for (const file of trackedFiles) {
  if (forbiddenStableNames.some((pattern) => pattern.test(file))) {
    fail(`Obsolete versioned stable filename is not allowed: ${file}`);
  }
}
if (!failures.some((message) => message.includes('versioned stable filename'))) {
  console.log('PASS filenames: no versioned runtime or API replacements');
}

const base = process.argv[2];
const head = process.argv[3] || 'HEAD';
const changedFiles = base
  ? runGit(['diff', '--name-only', '--diff-filter=ACMR', `${base}...${head}`]).split('\n').filter(Boolean)
  : [];
const riskyFiles = changedFiles.filter((file) => corePaths.has(file));
const apiEntrypoints = existsSync('api')
  ? readdirSync('api', { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.js')).map((entry) => `api/${entry.name}`)
  : [];
const unexpectedApiEntrypoints = apiEntrypoints.filter((file) => !allowedApiEntrypoints.has(file));
for (const file of unexpectedApiEntrypoints) fail(`Unexpected top-level API entrypoint: ${file}`);

if (riskyFiles.length) {
  console.log(`::warning::Core/stabilization files changed: ${riskyFiles.join(', ')}`);
} else if (base) {
  console.log('PASS risk review: no core/stabilization files changed');
}
console.log(`INFO top-level API entrypoints (${apiEntrypoints.length}): ${apiEntrypoints.join(', ')}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const risk = riskyFiles.length
    ? `⚠️ Core/stabilization files changed: ${riskyFiles.map((file) => `\`${file}\``).join(', ')}`
    : '✅ No core/stabilization files changed.';
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '## Lumensia PR safety gate',
    '',
    failures.length ? `❌ ${failures.length} blocking check(s) failed.` : '✅ All blocking checks passed.',
    risk,
    `ℹ️ ${apiEntrypoints.length} top-level JavaScript API entrypoint(s).`,
    '',
  ].join('\n'));
}

if (failures.length) process.exit(1);
console.log('All blocking Lumensia PR checks passed.');
