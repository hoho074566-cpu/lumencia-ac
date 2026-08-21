#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS, CANONICAL_PORTRAIT_EXPRESSIONS } from '../../assets.js';

const expressions = ['default', 'smile', 'blush', 'serious', 'angry', 'sad', 'shock', 'smug', 'annoyed', 'worried', 'confused', 'laugh', 'flustered'];
const physicalKeys = ['anastasia', 'aria', 'artemis', 'beelzebub', 'bellian', 'chloe', 'delpirem', 'elise', 'isabel', 'laris', 'lena', 'levian', 'lillia', 'lily_lumina', 'lucia', 'mirabelle', 'nemesis', 'sera', 'serena', 'sia', 'veradin'];
const defaultOnly = ['aria', 'artemis', 'elise', 'lucia', 'sia'];
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
assert.equal(urls.size, 233, 'manifest must represent exactly 233 physical V2 files');

const anastasia = ASSETS.characters.anastasia;
assert.equal(anastasia.default, null, 'Anastasia default portrait must not be synthesized');
assert.equal(Object.keys(anastasia.expressions).length, 12);
assert.ok(anastasia.fullbody.endsWith('/anastasia/fullbody/default.webp'));
for (const key of defaultOnly) {
  const character = ASSETS.characters[key];
  assert.ok(character.default.endsWith(`/${key}/portrait/default.webp`));
  assert.deepEqual(character.expressions, {}, `${key} expressions must not be synthesized`);
  assert.ok(character.fullbody.endsWith(`/${key}/fullbody/default.webp`));
}
const nemesis = ASSETS.characters.nemesis;
assert.ok(nemesis.default.endsWith('/nemesis/portrait/default.webp'));
for (const expression of expressions.filter((value) => value !== 'default')) assert.ok(nemesis.expressions[expression].endsWith(`/nemesis/portrait/${expression}.webp`));
assert.ok(nemesis.fullbody.endsWith('/nemesis/fullbody/default.webp'));

const chat = readFileSync('api/chat.js', 'utf8');
const runtime = readFileSync('app-runtime.js', 'utf8');
const schemaEnum = chat.match(/const Expression = z\.enum\(\[([^\]]+)\]\)/)?.[1].match(/'([^']+)'/g)?.map((value) => value.slice(1, -1));
assert.deepEqual(schemaEnum, expressions, 'server schema must expose the same 13 expressions');
for (const expression of expressions.slice(7)) assert.ok(chat.includes(expression), `${expression} missing from production server`);
assert.match(runtime, /ASSETS\.portraitExpressions\.includes\(normalized\) \? normalized : 'default'/, 'runtime must reject unknown expression filenames');
assert.doesNotMatch(runtime, /\[requested,\s*['"]default['"]\]/, 'runtime must not try an unreviewed expression filename');
assert.equal('HAPPY'.toLowerCase(), 'happy', 'case normalization must be deterministic');
assert.ok(!expressions.includes('HAPPY'.toLowerCase()));
assert.ok(!expressions.includes('embarrassed'));

console.log('PASS characters-v2 manifest and expression contract (21 characters, 233 URLs, 13 expressions)');
