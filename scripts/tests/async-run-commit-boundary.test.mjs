#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureRunOwnership, commitRunAndFate, commitRunFateAndInheritance, isRunOwnershipCurrent, recoverPendingRunCommit, RUN_COMMIT_PENDING_KEY } from '../../lib/run-commit-boundary.js';

class MemoryStorage{
  constructor(rows={}){this.rows=new Map(Object.entries(rows));this.failOnceKey='';}
  getItem(key){return this.rows.has(key)?this.rows.get(key):null;}
  setItem(key,value){if(this.failOnceKey===key){this.failOnceKey='';throw new Error(`write failed:${key}`);}this.rows.set(key,String(value));}
  removeItem(key){this.rows.delete(key);}
}

const keys={saveKey:'run',fateBookKey:'fate',inheritanceKey:'inheritance',pendingKey:RUN_COMMIT_PENDING_KEY};
const originalRun=JSON.stringify({id:'run-a',turnNumber:4}),originalFate=JSON.stringify({rewardTotal:3});
const owner=captureRunOwnership({id:'run-a'},0),current=()=>isRunOwnershipCurrent(owner,{id:'run-a'},0);

const committed=new MemoryStorage({run:originalRun,fate:originalFate});
commitRunAndFate(committed,keys,{owner,isOwnerCurrent:current,nextRun:{id:'run-a',turnNumber:5},nextFateBook:{rewardTotal:7}});
assert.deepEqual(JSON.parse(committed.getItem('run')),{id:'run-a',turnNumber:5});
assert.deepEqual(JSON.parse(committed.getItem('fate')),{rewardTotal:7});
assert.equal(committed.getItem(RUN_COMMIT_PENDING_KEY),null);

const originalInheritance=JSON.stringify({version:1,purchaseReceipts:{},spent:0});
for(const failKey of ['fate','inheritance','run']){
  const storage=new MemoryStorage({run:originalRun,fate:originalFate,inheritance:originalInheritance});storage.failOnceKey=failKey;
  assert.throws(()=>commitRunFateAndInheritance(storage,keys,{owner,isOwnerCurrent:current,nextRun:{id:'run-a',turnNumber:5},nextFateBook:{rewardTotal:7},nextInheritanceMeta:{version:1,purchaseReceipts:{a:{}},spent:1}}),/write failed/);
  assert.equal(storage.getItem('run'),originalRun);assert.equal(storage.getItem('fate'),originalFate);assert.equal(storage.getItem('inheritance'),originalInheritance);assert.equal(storage.getItem(RUN_COMMIT_PENDING_KEY),null);
}

// A — either canonical write failing restores both prior authorities.
for(const failKey of ['fate','run']){
  const storage=new MemoryStorage({run:originalRun,fate:originalFate});storage.failOnceKey=failKey;
  assert.throws(()=>commitRunAndFate(storage,keys,{owner,isOwnerCurrent:current,nextRun:{id:'run-a',turnNumber:5},nextFateBook:{rewardTotal:7}}),/write failed/);
  assert.equal(storage.getItem('run'),originalRun);assert.equal(storage.getItem('fate'),originalFate);assert.equal(storage.getItem(RUN_COMMIT_PENDING_KEY),null);
}

// B — a late result owned by the old run cannot write the new run.
const changedStorage=new MemoryStorage({run:originalRun,fate:originalFate});
assert.equal(isRunOwnershipCurrent(owner,{id:'run-b'},1),false);
assert.throws(()=>commitRunAndFate(changedStorage,keys,{owner,isOwnerCurrent:()=>false,nextRun:{id:'run-a',turnNumber:5},nextFateBook:{rewardTotal:7}}),/active run이 변경/);
assert.equal(changedStorage.getItem('run'),originalRun);assert.equal(changedStorage.getItem('fate'),originalFate);

// C — an interrupted pair write restores the pre-commit authority before normal load.
const recovery=new MemoryStorage({run:JSON.stringify({id:'run-a',turnNumber:5}),fate:JSON.stringify({rewardTotal:7})});
recovery.setItem(RUN_COMMIT_PENDING_KEY,JSON.stringify({version:1,owner,previousSaveRaw:originalRun,previousFateBookRaw:originalFate}));
assert.equal(recoverPendingRunCommit(recovery,keys),true);
assert.equal(recovery.getItem('run'),originalRun);assert.equal(recovery.getItem('fate'),originalFate);assert.equal(recovery.getItem(RUN_COMMIT_PENDING_KEY),null);

const tripleRecovery=new MemoryStorage({run:'new-run',fate:'new-fate',inheritance:'new-inheritance'});
tripleRecovery.setItem(RUN_COMMIT_PENDING_KEY,JSON.stringify({version:1,owner,previousSaveRaw:originalRun,previousFateBookRaw:originalFate,previousInheritanceRaw:originalInheritance}));
assert.equal(recoverPendingRunCommit(tripleRecovery,keys),true);
assert.equal(tripleRecovery.getItem('run'),originalRun);assert.equal(tripleRecovery.getItem('fate'),originalFate);assert.equal(tripleRecovery.getItem('inheritance'),originalInheritance);

const app=readFileSync('app.js','utf8'),runtime=readFileSync('app-runtime.js','utf8'),worker=readFileSync('sw.js','utf8');
assert.ok(app.indexOf('recoverPendingRunCommit(localStorage')<app.indexOf('const loadedRunSave = loadJson(SAVE_KEY)'),'recovery must finish before canonical run load');
assert.match(app,/const owner=captureActiveRunOwnership\(\),embeddedFateBook=loadedRunSave\.fateBook,nextRun=\{\.\.\.save\};delete nextRun\.fateBook;[\s\S]*commitRunFateAndInheritance/,'legacy deletion must remain staged until the journaled external-ledger commit succeeds');
const endingPath=app.slice(app.indexOf('// LUMENSIA_FATE_ENDING_HANDLER_V1'),app.indexOf('async function sendAction'));
assert.doesNotMatch(endingPath,/persistFateBook\(/,'Ending reconciliation must stage without an early independent persistence write');
const commitPath=app.slice(app.indexOf('function commitTurnState'),app.indexOf('if (loadedRunSave?.fateBook)'));
assert.match(commitPath,/catch\(error\)\{rollbackTurnCommit\(stage\);throw error;\}/,'a failed paired persistence commit must restore the staged in-memory authorities');
assert.match(app,/const runOwner=captureActiveRunOwnership\(\)/);
assert.match(app,/assertActiveRunOwner\(runOwner\)[\s\S]*stageTurnCommit\(runOwner\)[\s\S]*await commitTurnState\(stagedTurn,runOwner\)/);
assert.match(runtime,/const runOwner = captureActiveRunOwnership\(\)/);
assert.match(runtime,/assertActiveRunOwner\(runOwner\)[\s\S]*stageTurnCommit\(runOwner\)[\s\S]*await commitTurnState\(stagedTurn, runOwner\)/);
assert.match(runtime,/LUMENSIA_FATE_ENDING_HANDLER_V1/,'stable loader must bind to the canonical Ending handler marker');
const canonicalLoaderMarker=String.raw`/function compactState\(\) \{[\s\S]*?\n\}(?=\n\n\/\/ LUMENSIA_FATE_ENDING_HANDLER_V1)/`;
assert.ok(runtime.includes(canonicalLoaderMarker),'stable loader and Ending handler must share the exact canonical version marker');
const markerBoundary=/function compactState\(\) \{[\s\S]*?\n\}(?=\n\n\/\/ LUMENSIA_FATE_ENDING_HANDLER_V1)/;
for(const declaration of ['function applyFateEndingRuntime','async function applyFateEndingRuntime']){
  const fixture=`function compactState() {\n  return {};\n}\n\n// LUMENSIA_FATE_ENDING_HANDLER_V1\n${declaration}(packet = {}) {}`;
  assert.match(fixture,markerBoundary,`canonical loader marker must accept ${declaration}`);
}
assert.doesNotMatch(runtime,/import\(`\/app\.js\?v=fallback-/,'patch failure must never boot the direct /api/chat fallback');
assert.match(runtime,/fetch\('\/api\/chat-router'/,'the canonical stable runtime must retain the router');
assert.match(worker,/\/lib\/run-commit-boundary\.js/,'offline boot must cache the ownership boundary');

console.log('PASS STAB-BASE async run ownership, paired commit rollback, migration ordering, and loader marker contract');
