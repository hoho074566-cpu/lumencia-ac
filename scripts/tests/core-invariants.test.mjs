#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('api/chat.js', 'utf8');
const router = readFileSync('api/lib/context-router.js', 'utf8');

assert.match(chat, /\[PLAYER ACTION COMMIT\]/, 'PLAYER ACTION COMMIT guard is missing');
assert.match(chat, /C1\. USER ACTION[\s\S]*C2\.[\s\S]*C3\./, 'PLAYER ACTION COMMIT rules are incomplete');
assert.equal((chat.match(/client\.responses\.parse\s*\(/g) || []).length, 1, 'normal turn must keep one canonical model call');
assert.match(chat, /client\.responses\.parse\s*\(\s*\{[\s\S]*?store:\s*false\b/, 'canonical model call must use store: false');
assert.match(chat, /prompt_cache_key\s*:/, 'prompt cache key is missing');
assert.match(chat, /prompt_cache_retention:\s*['"]24h['"]/, 'prompt cache retention changed');

const expectedBudgets = [
  ['continue', 11000, 14000],
  ['routine', 17000, 20000],
  ['scheduled', 18000, 20000],
  ['important', 20000, 23000],
  ['critical', 24000, 30000],
];
for (const [name, target, softMax] of expectedBudgets) {
  const profile = new RegExp(`${name}:\\s*\\{[\\s\\S]*?targetTokens:${target},\\s*softMaxTokens:${softMax},`);
  assert.match(router, profile, `${name} context budget changed`);
}

console.log(`PASS core invariants (${expectedBudgets.length + 6} checks)`);
