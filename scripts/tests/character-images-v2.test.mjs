#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS, CANONICAL_PORTRAIT_EXPRESSIONS } from '../../assets.js';

const expressions = ['default', 'smile', 'blush', 'serious', 'angry', 'sad', 'shock', 'smug', 'annoyed', 'worried', 'confused', 'laugh', 'flustered'];
const physicalKeys = ['anastasia', 'aria', 'arien', 'aris', 'artemis', 'asmo', 'beelzebub', 'bellian', 'carne', 'chloe', 'delpirem', 'elena', 'elise', 'emily', 'etera', 'fria', 'isabel', 'kartia', 'laris', 'lena', 'levian', 'lillia', 'lily_lumina', 'lucia', 'mirabelle', 'nemesis', 'sera', 'serena', 'seriel', 'sia', 'sloth', 'veradin'];
const forbidden = ['Aaa', 'belian', 'karne', 'pria', 'mirabel', 'lilia'];

assert.deepEqual(CANONICAL_PORTRAIT_EXPRESSIONS, expressions, 'frontend canonical expression set changed');
assert.deepEqual([...ASSETS.liveFolders].sort(), [...physicalKeys].sort(), 'physical V2 character set changed');
for (const key of forbidden) assert.ok(!ASSETS.liveFolders.includes(key), `${key} must not be a physical asset key`);
for (const key of ['lucia', 'bellian', 'mirabelle', 'lillia', 'lily_lumina']) assert.ok(ASSETS.characters[key], `${key} canonical registry entry missing`);
assert.notEqual(ASSETS.characters.sera, ASSETS.characters.serena);
assert.notEqual(ASSETS.characters.sera, ASSETS.characters.seriel);
assert.notEqual(ASSETS.characters.lillia, ASSETS.characters.lily_lumina);

const urls = new Set();
for (const key of ASSETS.liveFolders) {
  const character = ASSETS.characters[key];
  for (const url of [character.default, ...Object.values(character.expressions), character.fullbody]) {
    if (url) urls.add(url);
  }
}
assert.equal(urls.size, 448, 'manifest must represent exactly 448 physical V2 files');

for (const key of physicalKeys) {
  const character = ASSETS.characters[key];
  assert.ok(character.default.endsWith(`/${key}/portrait/default.webp`), `${key} default portrait missing`);
  assert.equal(Object.keys(character.expressions).length, 12, `${key} must expose all 12 expression portraits`);
  for (const expression of expressions.filter((value) => value !== 'default')) {
    assert.ok(character.expressions[expression].endsWith(`/${key}/portrait/${expression}.webp`));
  }
  assert.ok(character.fullbody.endsWith(`/${key}/fullbody/default.webp`));
}

const declaredAuditUrls = (character) => [
  ...(character.default ? [character.default] : []),
  ...expressions.filter((value) => value !== 'default').map((value) => character.expressions[value]).filter(Boolean),
  ...(character.fullbody ? [character.fullbody] : []),
];
assert.equal(declaredAuditUrls(ASSETS.characters.anastasia).length, 14, 'Anastasia audit must cover default + 12 expressions + fullbody');
assert.ok(ASSETS.characters.anastasia.default.endsWith('/anastasia/portrait/default.webp'));
assert.equal(declaredAuditUrls(ASSETS.characters.nemesis).length, 14, 'full-set characters must audit default + 12 expressions + fullbody');

const chat = readFileSync('api/chat.js', 'utf8');
const runtime = readFileSync('app-runtime.js', 'utf8');
const app = readFileSync('app.js', 'utf8');
const serviceWorker = readFileSync('sw.js', 'utf8');
const schemaEnum = chat.match(/const Expression = z\.enum\(\[([^\]]+)\]\)/)?.[1].match(/'([^']+)'/g)?.map((value) => value.slice(1, -1));
assert.deepEqual(schemaEnum, expressions, 'server schema must expose the same 13 expressions');
for (const expression of expressions.slice(7)) assert.ok(chat.includes(expression), `${expression} missing from production server`);
assert.match(runtime, /ASSETS\.portraitExpressions\.includes\(normalized\) \? normalized : 'default'/, 'runtime must reject unknown expression filenames');
assert.doesNotMatch(runtime, /\[requested,\s*['"]default['"]\]/, 'runtime must not try an unreviewed expression filename');
assert.equal('HAPPY'.toLowerCase(), 'happy', 'case normalization must be deterministic');
assert.ok(!expressions.includes('HAPPY'.toLowerCase()));
assert.ok(!expressions.includes('embarrassed'));
assert.match(serviceWorker, /['"]\/app\.js['"]/, 'offline shell must cache app.js');
assert.match(serviceWorker, /['"]\/assets\.js['"]/, 'offline shell must cache assets.js');
assert.match(serviceWorker, /['"]\/save-migrations\.js['"]/, 'offline shell must cache the save migration dependency');
assert.match(serviceWorker, /['"]\/lib\/debug-regression\.js['"]/, 'offline shell must cache the lazy DEBUG console');
assert.match(serviceWorker, /['"]\/lib\/scene-continuity\.js['"]/, 'offline shell must cache the DEBUG console production helper');
assert.match(serviceWorker, /['"]\/lib\/novel-presentation\.js['"]/, 'offline shell must cache the presentation helper');
assert.match(serviceWorker, /lumensia-shell-v11-novel-presentation-v156/, 'offline shell cache version must invalidate the previous precache');
assert.match(app, /\.filter\(\(row\) => row\.url\)/, 'asset audit must probe only manifest-declared portraits');
assert.match(app, /char\.fullbody \? \[\{ expression: 'fullbody', url: char\.fullbody \}\]/, 'asset audit must probe declared fullbody images');
assert.doesNotMatch(app, /const defaultOk = await probeImage/, 'asset audit must not require a default portrait for partial characters');

console.log('PASS characters-v2 manifest and expression contract (32 characters, 448 URLs, 13 expressions)');
