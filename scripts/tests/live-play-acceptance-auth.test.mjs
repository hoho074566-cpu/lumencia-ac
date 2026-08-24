#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/qa/live-play-acceptance.mjs', 'utf8');

assert.match(source, /process\.env\.LUMENSIA_LIVE_ACCESS_TOKEN/, 'the manual harness must accept a dedicated deployment token environment variable');
assert.match(source, /ACCESS_TOKEN\s*\?\s*\{\s*'x-lumensia-token':\s*ACCESS_TOKEN\s*\}\s*:\s*\{\}/, 'the deployment token must be forwarded only when configured');
assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*ACCESS_TOKEN|process\.stderr\.write\([^\n]*ACCESS_TOKEN/, 'the deployment token must never be printed');

console.log('PASS live-play acceptance protected-deployment auth forwarding');
