import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS } from '../../assets.js';
import { resolveManifestPortrait, runFastLocalRegression, runImageContractRegression } from '../../lib/debug-regression.js';

globalThis.performance ||= { now:() => Date.now() };
const fast = runFastLocalRegression();
const images = runImageContractRegression();
assert.equal(fast.some(row=>row.status==='FAIL'),false,'fast local console contracts must pass');
assert.equal(images.some(row=>row.status==='FAIL'),false,'image console contracts must pass');
assert.equal(fast.filter(row=>row.status==='WARN').length,4,'server/runtime-only checks must be honestly marked WARN');
assert.equal(resolveManifestPortrait('anastasia','default').role,'portrait','Anastasia default must use its declared portrait');
assert.ok(resolveManifestPortrait('anastasia','default').url.endsWith('/anastasia/portrait/default.webp'));
assert.equal(resolveManifestPortrait('aria','angry').fallback,'none','full-set character must use its declared angry portrait');
assert.ok(resolveManifestPortrait('aria','angry').url.endsWith('/aria/portrait/angry.webp'));
assert.doesNotMatch(resolveManifestPortrait('nemesis','unknown').url,/unknown\.webp$/,'unknown expression must not become a URL');

const cloneAssets = () => structuredClone(ASSETS);
const missingPortrait = cloneAssets();
delete missingPortrait.characters.nemesis.expressions.angry;
const missingPortraitRows = runImageContractRegression(missingPortrait);
assert.equal(missingPortraitRows.find(row=>row.id==='required-images').status,'FAIL','missing required portrait must fail availability');
assert.match(missingPortraitRows.find(row=>row.id==='required-images').detail,/nemesis: angry/,'missing portrait failure must identify the character and expression');
assert.equal(missingPortraitRows.find(row=>row.id==='urls').status,'FAIL','lower physical URL count must fail the 448 URL contract');

const missingCharacter = cloneAssets();
delete missingCharacter.characters.lillia;
assert.doesNotThrow(()=>runImageContractRegression(missingCharacter),'missing character entry must produce rows instead of throwing');
const missingCharacterRows = runImageContractRegression(missingCharacter);
assert.equal(missingCharacterRows.find(row=>row.id==='required-images').status,'FAIL');
assert.match(missingCharacterRows.find(row=>row.id==='required-images').detail,/lillia: character entry/,'missing entry failure must name its canonical key');

const app = readFileSync('app.js','utf8');
assert.match(app,/new URL\('\/lib\/debug-regression\.js', window\.location\.origin\)\.href/,'blob runtime must resolve the lazy DEBUG module against the page origin');
assert.match(app,/import\(regressionUrl\)/,'DEBUG must import the fully qualified regression URL');
console.log(`PASS debug regression console (${fast.length} fast rows, ${images.length} image rows, zero fetch calls)`);
