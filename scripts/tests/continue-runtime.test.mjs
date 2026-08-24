#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync('app-runtime.js', 'utf8');

function functionSource(name) {
  const start = runtime.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  let depth = 0;
  let opened = false;
  for (let index = runtime.indexOf('{', start); index < runtime.length; index += 1) {
    if (runtime[index] === '{') {
      depth += 1;
      opened = true;
    } else if (runtime[index] === '}') {
      depth -= 1;
      if (opened && depth === 0) return runtime.slice(start, index + 1);
    }
  }
  assert.fail(`could not parse ${name}`);
}

const tailSource = functionSource('continuationSceneTailStable');
const mergeSource = functionSource('mergeContinuationIntoRecentStable');
const tail = Function(`${tailSource}; return continuationSceneTailStable;`)();

const longScene = Array.from({ length: 18 }, (_, index) => ({ text: `entry ${index + 1}` }));
assert.deepEqual(
  tail(longScene, 10).map((entry) => entry.text),
  Array.from({ length: 10 }, (_, index) => `entry ${index + 9}`),
  'long scenes must retain entries 9..18 as the continuation anchor',
);
assert.equal(tail(longScene, 10).at(-1).text, 'entry 18', 'the real ending must survive');
assert.notEqual(tail(longScene, 10).at(-1).text, 'entry 10', 'the anchor must not stop at entry 10');

const shortScene = longScene.slice(0, 4);
assert.deepEqual(tail(shortScene, 10), shortScene, 'short scenes must remain complete and ordered');
assert.deepEqual(tail(null, 10), [], 'legacy null scenes must be safe');

const save = { recentTurns: [{ scene: longScene.slice(-10), summary: 'base' }] };
const merge = Function('save', `${tailSource}; ${mergeSource}; return mergeContinuationIntoRecentStable;`)(save);
merge({ scene: [{ text: 'continue 1' }, { text: 'continue 2' }], scene_summary: 'continued once' });
merge({ scene: [{ text: 'continue 3' }, { text: 'continue 4' }], scene_summary: 'continued twice' });
assert.equal(save.recentTurns[0].scene.length, 12, 'repeated continuation history must remain bounded');
assert.deepEqual(
  save.recentTurns[0].scene.slice(-4).map((entry) => entry.text),
  ['continue 1', 'continue 2', 'continue 3', 'continue 4'],
  'the newest continuation entries must survive repeated merges',
);

const renderAllSource = functionSource('renderAllStable');
assert.match(renderAllSource, /story\.innerHTML\s*=\s*'';[\s\S]*renderFlowControlsStable\(\);[\s\S]*scrollBottom\(false\)/, 'every full story rebuild must recreate flow controls centrally');
assert.equal((renderAllSource.match(/renderFlowControlsStable\(\)/g) || []).length, 1, 'full render must recreate controls once');
assert.match(renderAllSource, /const flowControls = \$\('flowControlsStable'\);[\s\S]*if \(flowControls\) story\.append\(flowControls\);/, 'full render must preserve the existing wrapper and its listeners');

const flowSource = functionSource('renderFlowControlsStable');
assert.match(flowSource, /querySelectorAll\('#flowControlsStable'\)[\s\S]*existing\.shift\(\)[\s\S]*duplicate\.remove\(\)/, 'flow recreation must collapse duplicate wrappers to one canonical control');
assert.equal((flowSource.match(/addEventListener\('click'/g) || []).length, 2, 'AUTO and CONTINUE listeners must only be installed in the creation branch');
assert.match(flowSource, /auto\.hidden\s*=\s*false;[\s\S]*auto\.removeAttribute\('aria-hidden'\)/, 'AUTO must recover from a stale duplicate-hidden state');
assert.match(flowSource, /cont\.hidden\s*=\s*false;[\s\S]*cont\.removeAttribute\('aria-hidden'\)/, 'CONTINUE must recover from a stale duplicate-hidden state');
assert.doesNotMatch(flowSource, /remaining_beats|미처리 beat|이어서 생성\s*·/, 'CONTINUE must not advertise a model-hidden legacy beat queue as executable content');
assert.match(flowSource, /cont\.textContent\s*=\s*'✦ 이어서 생성'/, 'CONTINUE keeps a truthful generic same-moment label');
const suppressSource = functionSource('suppressDuplicateFlowControlsStable');
assert.match(suppressSource, /button\.closest\('#flowControlsStable'\)/, 'duplicate suppression must never hide a stable flow-control button');
assert.match(runtime, /'renderAll flow controls lifecycle'/, 'the runtime transformation must install the central renderAll hook');

console.log('PASS CONTINUE runtime regressions (anchor, merge, full-render controls)');
