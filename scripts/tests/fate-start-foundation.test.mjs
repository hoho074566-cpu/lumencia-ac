import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createFateCharacterCreation,
  createFreeCharacterCreation,
  fateStartLabels,
  normalizeCharacterCreation,
} from '../../lib/fate-start.js';

const free = createFreeCharacterCreation();
assert.deepEqual(free, { mode:'free', fateStart:null }, 'free creation remains the neutral default');
assert.deepEqual(normalizeCharacterCreation(undefined), free, 'legacy saves without creation state load as free creation');
assert.deepEqual(normalizeCharacterCreation({ mode:'fate', fateStart:{ gender:'unknown' } }), free, 'invalid fate state fails closed to free creation');

for (const gender of ['male','female']) {
  for (const socialClass of ['commoner','fallen_noble']) {
    for (const department of ['기사과 1학년','마법과 1학년','신학부 1학년','일반학부 1학년']) {
      const creation = createFateCharacterCreation({ gender, socialClass, department });
      assert.equal(creation.mode, 'fate');
      assert.deepEqual(normalizeCharacterCreation(JSON.parse(JSON.stringify(creation))), creation, 'fate state survives a save/load round trip');
      const labels = fateStartLabels(creation.fateStart);
      assert.ok(['남성','여성'].includes(labels.gender));
      assert.ok(['평민','몰락귀족'].includes(labels.socialClass));
      assert.equal(labels.department, department);
    }
  }
}

assert.throws(() => createFateCharacterCreation({ gender:'male', socialClass:'commoner', department:'연금술과 1학년' }), /학과/, 'new departments are not invented in the foundation PR');

const html = readFileSync('index.html','utf8');
const app = readFileSync('app.js','utf8');
const runtime = readFileSync('app-runtime.js','utf8');

assert.match(html, /id="pcFreeModeBtn"[\s\S]*자유 생성/);
assert.match(html, /id="pcFateModeBtn"[\s\S]*운명 시작/);
assert.match(html, /id="pcPasteApplyBtn"/, 'paste creation remains available');
assert.match(html, /id="pcDepartment"/, 'free creation department remains available');
assert.match(html, /id="fateGender"[\s\S]*value="male">남성[\s\S]*value="female">여성/);
assert.match(html, /id="fateSocialClass"[\s\S]*value="commoner">평민[\s\S]*value="fallen_noble">몰락귀족/);
assert.match(app, /target\.replaceChildren\(\.\.\.\[\.\.\.source\.options\]\.map\(option=>option\.cloneNode\(true\)\)\)/, 'fate mode reuses the existing department options');
assert.match(app, /creation: createFreeCharacterCreation\(\)/, 'new and legacy free saves own neutral creation state');
assert.match(app, /next\.creation = normalizeCharacterCreation\(next\.creation,\{allowedNpcKeys:FATE_AFFINITY_KEYS\}\)/, 'load normalization preserves additive compatibility and the player-visible Fate Affinity boundary');
assert.match(app, /if\(\$\('pcCreationMode'\)\.value==='fate'\)/, 'fate submit uses a separate bounded path');
assert.match(runtime, /'fate start import'/, 'blob runtime rewrites the new module import to an origin URL');

console.log('fate-start-foundation: PASS');
