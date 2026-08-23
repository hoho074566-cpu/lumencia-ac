import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ASSETS, ASSET_MANIFEST_VERSION, CANONICAL_PORTRAIT_EXPRESSIONS } from '../../assets.js';

const EXPECTED_CHARACTERS = [
  'anastasia','aria','arien','aris','artemis','asmo','beelzebub','bellian','carne','chloe','delpirem','elena','elise','emily','etera','fria','isabel','kartia','laris','lena','levian','lillia','lily_lumina','lucia','mirabelle','nemesis','sera','serena','seriel','sia','sloth','veradin',
];
const NON_DEFAULT = CANONICAL_PORTRAIT_EXPRESSIONS.filter((x) => x !== 'default');
const appSource = readFileSync('app.js','utf8');

test('characters-v2 manifest exposes the refreshed 32-character roster', () => {
  assert.equal(ASSET_MANIFEST_VERSION, 'characters-v2-availability-2026-08-23');
  assert.deepEqual(Object.keys(ASSETS.characters).sort(), [...EXPECTED_CHARACTERS].sort());
  assert.deepEqual([...ASSETS.liveFolders].sort(), [...EXPECTED_CHARACTERS].sort());
  assert.equal(Object.keys(ASSETS.characters).length, 32);
  assert.equal(ASSETS.characters.Aaa, undefined, 'PC placeholder must never be treated as an NPC asset');
});

test('all non-Anastasia characters expose default plus all 12 expression portraits', () => {
  for (const key of EXPECTED_CHARACTERS.filter((x) => x !== 'anastasia')) {
    const char = ASSETS.characters[key];
    assert.equal(char.available, true, `${key} should be V2-live`);
    assert.equal(char.default, `${ASSETS.base}/${key}/portrait/default.webp`);
    assert.equal(char.portraitDefault, char.default);
    assert.equal(char.fullbody, `${ASSETS.base}/${key}/fullbody/default.webp`);
    assert.deepEqual(Object.keys(char.expressions).sort(), [...NON_DEFAULT].sort(), `${key} expression set mismatch`);
    for (const expression of NON_DEFAULT) {
      assert.equal(char.expressions[expression], `${ASSETS.base}/${key}/portrait/${expression}.webp`);
    }
  }
});

test('Anastasia keeps the intentional missing-default exception without losing expressions', () => {
  const char = ASSETS.characters.anastasia;
  assert.equal(char.available, true);
  assert.equal(char.default, null);
  assert.equal(char.portraitDefault, null);
  assert.equal(char.fullbody, `${ASSETS.base}/anastasia/fullbody/default.webp`);
  assert.deepEqual(Object.keys(char.expressions).sort(), [...NON_DEFAULT].sort());
});

test('asset manifest uses only characters-v2 WEBP URLs', () => {
  const urls = [];
  for (const char of Object.values(ASSETS.characters)) {
    urls.push(char.default, char.portraitDefault, char.fullbody, ...Object.values(char.expressions));
  }
  for (const url of urls.filter(Boolean)) {
    assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/dudghl\/test\/main\/assets\/characters-v2\//);
    assert.match(url, /\.webp$/);
    assert.doesNotMatch(url, /\.png(?:$|\?)/i);
  }
});

test('portrait routing never synthesizes an unknown expression path', () => {
  assert.match(appSource, /ASSETS\.portraitExpressions\.includes\(normalized\)\s*\?\s*normalized\s*:\s*'default'/);
  assert.match(appSource, /const char = ASSETS\.characters\[key\]/);
  assert.match(appSource, /char\.expressions\?\.\[state\]/);
  assert.doesNotMatch(appSource, /portrait\/\$\{(?:normalized|requested|expression|candidate|state)\}\.webp/);
});
