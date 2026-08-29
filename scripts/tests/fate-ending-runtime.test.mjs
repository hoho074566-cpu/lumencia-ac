#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ASSETS } from '../../assets.js';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  applyEndingReceipts,
  ENDING_REGISTRY,
  ENDING_CONDITION_GUIDE,
  endingRegistryState,
  fateBookRuntimeSnapshot,
  FATE_ENDING_CONTRACT,
  normalizeFateBook,
  projectEndingSignals,
  reconcileFateBooks,
  resolveEndingDefinition,
} from '../../lib/fate-ending.js';

const npcKeys=Object.keys(ASSETS.characters||{});
const options={allowedCharacterKeys:npcKeys};

for(const [id,row] of Object.entries(ENDING_REGISTRY)){
  assert.equal(row.endingId,id);
  assert.ok(['general','character','world','secret','dead'].includes(row.category));
  assert.ok(row.conditions&&row.worldState&&Number(row.reward)>0);
  assert.ok(Array.isArray(row.characters));
}
assert.ok(ENDING_REGISTRY['general.graduation']);
assert.ok(ENDING_REGISTRY['general.honors']);
assert.ok(ENDING_REGISTRY['dead.irrecoverable']);
assert.equal(resolveEndingDefinition('character.companion:artemis',options)?.characterKeys[0],'artemis');
assert.equal(resolveEndingDefinition('character.companion:not_registered',options),null,'Character Ending must use a canonical NPC key');
assert.equal(resolveEndingDefinition('toString',options),null,'inherited object properties must never resolve as canonical Endings');

const terminalReceipts=[
  {ending_id:'general.graduation',terminal_outcome:'life_complete',irreversible:true,reason:'정규 과정을 마치고 졸업했다.',world_state:'academy'},
  {ending_id:'character.companion:artemis',terminal_outcome:'life_complete',irreversible:true,reason:'아르테미스와 동료로서 종장을 함께했다.',world_state:'character'},
  {ending_id:'world.academy',terminal_outcome:'life_complete',irreversible:true,reason:'아카데미의 다음 시대가 확정되었다.',world_state:'academy'},
];
const terminalSignals=terminalReceipts.map((row)=>`ending:${row.ending_id}`);
const first=applyEndingReceipts({
  fateBook:null,receipts:terminalReceipts,stateDelta:{completed_events_add:terminalSignals},
  ...options,runId:'run-1',turnNumber:220,mode:'game',now:'2026-08-28T03:00:00.000Z',
});
assert.equal(first.acceptedDiscoveries.length,3,'general, Character, and World Endings must record independently');
assert.equal(first.repeatedDiscoveries.length,0);
assert.equal(Object.keys(first.fateBook.discoveries).length,3);
assert.equal(first.fateBook.rewardTotal,3+4+6,'first-discovery rewards must come from the canonical registry');
assert.equal(first.validReceipts.length,3);
const discoveredRegistry=endingRegistryState(first.fateBook,options);
assert.equal(discoveredRegistry['general.graduation'].discovered,true);
assert.deepEqual(discoveredRegistry['character.companion'].discoveredIds,['character.companion:artemis']);
assert.equal(discoveredRegistry['dead.irrecoverable'].discovered,false);

const repeated=applyEndingReceipts({
  fateBook:first.fateBook,receipts:[...terminalReceipts,terminalReceipts[0]],stateDelta:{completed_events_add:terminalSignals},
  ...options,runId:'run-2',turnNumber:300,mode:'game',now:'2026-09-01T03:00:00.000Z',
});
assert.equal(repeated.acceptedDiscoveries.length,0,'the same Ending must never receive another first-discovery reward');
assert.equal(repeated.repeatedDiscoveries.length,3);
assert.equal(repeated.fateBook.rewardTotal,first.fateBook.rewardTotal);

const ordinaryFailure=applyEndingReceipts({
  fateBook:first.fateBook,
  receipts:[{ending_id:'dead.irrecoverable',terminal_outcome:'life_complete',irreversible:true,reason:'결투에서 패배했다.',world_state:'academy'}],
  stateDelta:{completed_events_add:['ending:dead.irrecoverable']},...options,mode:'game',
});
assert.equal(ordinaryFailure.validReceipts.length,0,'Failure must not satisfy the Dead Ending terminal contract');

const recoverableDeath=applyEndingReceipts({
  fateBook:first.fateBook,
  receipts:[{ending_id:'dead.irrecoverable',terminal_outcome:'death',irreversible:false,reason:'소생 가능성이 남아 있다.',world_state:'dead'}],
  stateDelta:{completed_events_add:['ending:dead.irrecoverable']},...options,mode:'game',
});
assert.equal(recoverableDeath.validReceipts.length,0,'revival/recovery possibility must fail closed without wording classification');

const actualDeath=applyEndingReceipts({
  fateBook:first.fateBook,
  receipts:[{ending_id:'dead.irrecoverable',terminal_outcome:'death',irreversible:true,reason:'실제 사망이 확정되었다.',world_state:'dead'}],
  stateDelta:{completed_events_add:['ending:dead.irrecoverable']},...options,runId:'run-dead',turnNumber:400,mode:'game',now:'2026-09-02T03:00:00.000Z',
});
assert.equal(actualDeath.acceptedDiscoveries.length,1,'actual irreversible death must be discoverable');
assert.equal(actualDeath.acceptedDiscoveries[0].category,'dead');
assert.deepEqual(
  projectEndingSignals(['ordinary.event','ending:dead.irrecoverable','ending:world.secret'],actualDeath.validReceipts,{allow:true}),
  ['ordinary.event','ending:dead.irrecoverable'],
  'only terminal signals backed by a valid current-turn receipt may survive',
);
assert.deepEqual(projectEndingSignals(['ordinary.event','ending:dead.irrecoverable'],actualDeath.validReceipts,{allow:false}),['ordinary.event'],'frozen modes must remove all terminal signals');

const missingCurrentSignal=applyEndingReceipts({fateBook:null,receipts:terminalReceipts,stateDelta:{completed_events_add:[]},...options,mode:'game'});
assert.equal(missingCurrentSignal.validReceipts.length,0,'a receipt without its surviving current-turn terminal signal must be rejected');
for(const frozenMode of ['meta','auto','continue']){
  const frozen=applyEndingReceipts({fateBook:null,receipts:terminalReceipts,stateDelta:{completed_events_add:terminalSignals},...options,mode:frozenMode});
  assert.equal(frozen.acceptedDiscoveries.length,0,`${frozenMode} must not discover Endings`);
}

const currentBook=actualDeath.fateBook;
const staleImported=normalizeFateBook({discoveries:{'general.graduation':currentBook.discoveries['general.graduation']}},options);
const reconciled=reconcileFateBooks(currentBook,staleImported,options);
assert.deepEqual(Object.keys(reconciled.discoveries).sort(),Object.keys(currentBook.discoveries).sort(),'an older imported run must not roll back newer Fate Book discoveries');
assert.equal(reconciled.rewardTotal,currentBook.rewardTotal,'stale import must not reduce first-discovery reward authority');
const earlierImported=normalizeFateBook({discoveries:[{...currentBook.discoveries['general.graduation'],discoveredAt:'2026-08-01T03:00:00.000Z',runId:'actual-first',turnNumber:100}]},options);
const earliestReconciled=reconcileFateBooks(currentBook,earlierImported,options);
assert.equal(earliestReconciled.discoveries['general.graduation'].runId,'actual-first','reconciliation must preserve the earliest known first-discovery record');
assert.equal(earliestReconciled.rewardLedger['general.graduation'].grantedAt,currentBook.rewardLedger['general.graduation'].grantedAt,'canonical committed earned receipt must not be rewritten by an imported display record');

const characterTemplates=['companion','alliance','co_rule','journey','rival'];
const longCollection={};
for(const key of npcKeys)for(const template of characterTemplates){
  const id=`character.${template}:${key}`;
  longCollection[id]={discoveryId:id,discoveredAt:'2026-08-28T00:00:00.000Z'};
}
const normalizedLong=normalizeFateBook({discoveries:longCollection},options);
assert.equal(Object.keys(normalizedLong.discoveries).length,npcKeys.length*characterTemplates.length,'normalization must retain the full attainable collection without a destructive cap');
const snapshot=fateBookRuntimeSnapshot(normalizedLong,options);
assert.equal(snapshot.discoveredIds.length,Object.keys(normalizedLong.discoveries).length);
assert.equal('discoveries' in snapshot,false,'runtime requests must carry the ledger identity without full prose records');

assert.match(FATE_ENDING_CONTRACT,/일반 실패·패배·부상·후퇴는 Ending이나 Dead Ending이 아니라 새 이야기 상태/);
assert.match(FATE_ENDING_CONTRACT,/state_delta\.completed_events_add/);
assert.match(FATE_ENDING_CONTRACT,/META\/AUTO\/CONTINUE 요청에서는 Ending\/Dead Ending을 서술하거나/);
for(const row of Object.values(ENDING_REGISTRY))assert.match(ENDING_CONDITION_GUIDE,new RegExp(row.endingId.replaceAll('.','\\.')),'every registry condition must reach the semantic model contract');
assert.doesNotMatch(readFileSync('lib/fate-ending.js','utf8'),/(?:사망|죽음|소생|부활).*(?:RegExp|\.test\()|new RegExp\([^)]*(?:사망|죽음|소생|부활)/,'terminal semantics must not become a Korean wording regex engine');

const divider='='.repeat(20);
const routed=routeOpenAIParams({
  instructions:`===== CHARACTER REGISTRY =====\nartemis=아르테미스\n===== WORLD CANON =====\n${divider}\nPUBLIC\n${divider}\nWorld.\n===== NPC CANON =====\n${divider}\n아르테미스\n${divider}\nNPC.\n===== NPC SPEECH =====\n${divider}\n아르테미스\n${divider}\nSpeech.\n===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====\nNone.\n===== PC SYSTEM =====\n${divider}\nPC\n${divider}\nSystem.`,
  input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}',
},{incoming:{action:'마지막 학기를 마치고 졸업식을 끝까지 진행한다.',saveState:{id:'run-1',turnNumber:200,world:{date:'1288-02-20',time:'11:00',location:'졸업식장'},pc:{name:'테스트',department:'기사과'},flags:{majorScene:true},sceneRuntime:{participants:['artemis']},scheduleContext:{due:[],upcoming:[]}},recentTurns:[]},mode:'game'});
assert.match(routed.params.instructions,/FATE ENDING RUNTIME V1/,'normal routed gameplay must retain the canonical Ending contract');

const app=readFileSync('app.js','utf8');
const runtime=readFileSync('app-runtime.js','utf8');
const core=readFileSync('api/chat.js','utf8');
const router=readFileSync('api/chat-router.js','utf8');
const serviceWorker=readFileSync('sw.js','utf8');
const health=readFileSync('api/health.js','utf8');
assert.match(core,/ending_receipts: z\.array\(EndingReceipt\)\.max\(4\)/,'the canonical response must include bounded structured Ending receipts');
assert.match(core,/applyEndingReceipts\([\s\S]*stateDelta:turn\.state_delta/,'the direct canonical handler must validate current-turn effects');
assert.match(core,/completed_events_add=projectEndingSignals\(turn\.state_delta\.completed_events_add,fateEnding\.validReceipts/,'the direct handler must drop terminal signals rejected by receipt validation');
assert.match(router,/applySceneMomentumTimeFloor[\s\S]*applyEndingReceipts/,'the stable router must validate receipts after final current-turn reconciliation');
assert.match(router,/applyEndingReceipts\(\{fateBook:incoming0\.fateBook[\s\S]*,mode\}\)/,'the stable adapter must pass its actual mode to the Ending guard');
assert.match(router,/completed_events_add=projectEndingSignals\(data\.turn\.state_delta\.completed_events_add,fateEnding\.validReceipts,\{allow:mode==='game'\}\)/,'the stable router must retain only validated game-mode terminal signals');
assert.match(router,/AUTO에서는 회차를 종결하거나 Ending\/Dead Ending을 서술·기록하지 않는다/,'AUTO guidance must forbid terminal narration before deterministic receipts are discarded');
assert.match(app,/const FATE_BOOK_KEY = 'lumensia\.fate-book\.v1'/,'Fate Book must persist outside the replaceable run save');
assert.match(app,/incomingFateBook:embeddedFateBook/,'a legacy embedded Fate Book must enter the canonical migration boundary');
assert.match(app,/delete save\.fateBook/,'the replaceable run save must not retain a parallel Fate Book root');
assert.match(app,/format:'lumensia\.save\.bundle\.v3',save:persistedRun,fateBook:canonical\.fateBook,inheritanceMeta:canonical\.inheritanceMeta/,'exports must include canonical Fate and Inheritance ledgers');
assert.match(app,/prepareCanonicalProgressionImport\(\{currentFateBook:canonical\.fateBook[\s\S]*incomingFateBook:importedBook/,'imports must pass through fail-closed canonical progression validation');
assert.match(runtime,/fetch\('\/api\/chat-router'/,'deployed stable runtime must keep the canonical router');
assert.match(runtime,/fateBook: fateBookRuntimeSnapshot/,'deployed stable runtime must send the bounded discovery ledger');
assert.match(runtime,/applyFateEndingRuntime\(data\.fate_ending\)/,'deployed stable runtime must persist accepted discoveries');
assert.match(serviceWorker,/\/lib\/fate-ending\.js/,'the offline shell must cache the Fate Book runtime dependency');
assert.match(health,/fateEnding:/,'health metadata must advertise the STAB-01 runtime');
assert.equal((router.match(/=>coreHandler\(/g)||[]).length,1,'STAB-01 must keep one canonical model call');
assert.doesNotMatch(readFileSync('lib/fate-ending.js','utf8'),/new OpenAI|responses\.create|chat\.completions/,'STAB-01 must not add a model call');

console.log('PASS STAB-01 Ending / Dead Ending / Fate Book persistence, dedupe, current-turn projection, and no-new-engine invariants');
