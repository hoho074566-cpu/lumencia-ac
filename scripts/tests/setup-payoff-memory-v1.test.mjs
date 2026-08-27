import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SETUP_PAYOFF_MEMORY_VERSION,
  buildSetupPayoffDirective,
  deriveSetupPayoffPlan,
  reconcileSetupPayoffTurn,
} from '../../lib/setup-payoff-memory.js';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const baseSave = {
  turnNumber: 12,
  world: { date: '1285-03-01', time: '10:00', location: '중앙광장' },
  pc: { name: '아리아', department: '기사과' },
  sceneRuntime: { participants: ['lena'] },
  scheduleContext: { due: [], upcoming: [] },
  director: { callbacks: [] },
};
const callback = (patch = {}) => ({ key:'rival-proof', status:'open', createdTurn:9, lastTurn:9, note:'레나가 공개 대련의 증명을 요구했다.', spotlight_keys:['lena'], ...patch });
const save = (patch = {}) => ({
  ...baseSave, ...patch,
  sceneRuntime: { ...baseSave.sceneRuntime, ...(patch.sceneRuntime || {}) },
  scheduleContext: { ...baseSave.scheduleContext, ...(patch.scheduleContext || {}) },
  director: { ...baseSave.director, ...(patch.director || {}) },
});
const turn = (director, patch = {}) => ({
  director: { intervention:'medium', beat:'friction', event_kind:'rivalry', spotlight_keys:['lena'], callback_key:null, callback_phase:'none', callback_note:null, reason:'test', ...director },
  scene: [{ kind:'narration', text:'레나가 공개 대련의 조건을 다시 꺼냈다.' }],
  choices: [],
  ...patch,
});

assert.equal(SETUP_PAYOFF_MEMORY_VERSION, '1');

{
  const immature = deriveSetupPayoffPlan({ saveState:save({ turnNumber:10, director:{ callbacks:[callback()] } }), reachableNpcKeys:['lena'] });
  assert.equal(immature.selected, null, 'an open setup must mature for two turns before payoff pressure');
  const mature = deriveSetupPayoffPlan({ saveState:save({ director:{ callbacks:[callback()] } }), reachableNpcKeys:['lena'] });
  assert.equal(mature.selected?.key, 'rival-proof', 'a mature reachable setup becomes the one selected payoff authority');
  assert.equal(mature.selected?.status, 'open');
  assert.doesNotMatch(buildSetupPayoffDirective(mature), /레나가 공개 대련의 증명/, 'the directive must not copy free-form callback notes into reserved authority');
}

{
  const unreachable = deriveSetupPayoffPlan({ saveState:save({ sceneRuntime:{participants:[]}, director:{callbacks:[callback()]} }), reachableNpcKeys:[] });
  assert.equal(unreachable.selected, null, 'an NPC-owned setup must not fire while its participant is unreachable');
  const worldSetup = deriveSetupPayoffPlan({ saveState:save({ sceneRuntime:{participants:[]}, director:{callbacks:[callback({key:'world-trace',spotlight_keys:[]})]} }), reachableNpcKeys:[] });
  assert.equal(worldSetup.selected?.key, 'world-trace', 'an unscoped visible-world setup may mature without inventing an NPC arrival');
}

{
  const awaiting = save({ sceneRuntime:{participants:['lena'],turn_hook:{status:'awaiting-player'}}, director:{callbacks:[callback()]} });
  assert.equal(deriveSetupPayoffPlan({saveState:awaiting,reachableNpcKeys:['lena']}).selected, null, 'an unrelated player-owned boundary blocks a new payoff opportunity');
  const ownedOpportunity = save({ sceneRuntime:{participants:['lena'],turn_hook:{status:'awaiting-player'}}, director:{callbacks:[callback({status:'opportunity'})]} });
  assert.equal(deriveSetupPayoffPlan({saveState:ownedOpportunity,reachableNpcKeys:['lena']}).selected?.key, 'rival-proof', 'an already offered opportunity remains available for the player response that resolves it');
}

for (const mode of ['meta', 'auto', 'continue']) {
  const frozen = deriveSetupPayoffPlan({ saveState:save({director:{callbacks:[callback()]}}), mode, reachableNpcKeys:['lena'] });
  assert.equal(frozen.selected, null, `${mode} must not select or advance a setup`);
  const output = turn({ callback_key:'rival-proof', callback_phase:'payoff', beat:'payoff' });
  const result = reconcileSetupPayoffTurn({ saveState:save({director:{callbacks:[callback({status:'opportunity'})]}}), turn:output, mode, plan:{selected:{key:'rival-proof'}} });
  assert.equal(result.status, 'rejected', `${mode} must freeze callback mutation`);
  assert.equal(output.director.callback_phase, 'none');
}

{
  const setupTurn = turn({ callback_key:'rival-proof', callback_phase:'friction', callback_note:'레나가 공개 증명을 요구했다.', beat:'friction' });
  assert.equal(reconcileSetupPayoffTurn({saveState:save(),turn:setupTurn}).status, 'setup-created', 'a visible friction scene may register a setup through the existing callback row');
  const hiddenSetup = turn({ callback_key:'secret-plan', callback_phase:'pressure', callback_note:'숨은 계획', beat:'routine' }, {scene:[]});
  assert.equal(reconcileSetupPayoffTurn({saveState:save(),turn:hiddenSetup}).status, 'rejected', 'an internal or invisible plan must not become setup memory');
  const reopen = turn({ callback_key:'rival-proof', callback_phase:'friction', callback_note:'다시 열기', beat:'friction' });
  assert.equal(reconcileSetupPayoffTurn({saveState:save({director:{callbacks:[callback({status:'resolved'})]}}),turn:reopen}).reason, 'resolved-callback-cannot-reopen', 'a consumed callback ID must never reopen');
  const downgrade = turn({ callback_key:'rival-proof', callback_phase:'pressure', callback_note:'다시 압박', beat:'friction' });
  assert.equal(reconcileSetupPayoffTurn({saveState:save({director:{callbacks:[callback({status:'opportunity'})]}}),turn:downgrade}).reason, 'opportunity-cannot-downgrade', 'an offered player choice cannot be demoted back into setup pressure');
}

{
  const state = save({director:{callbacks:[callback()]}});
  const plan = deriveSetupPayoffPlan({saveState:state,reachableNpcKeys:['lena']});
  const opportunity = turn({callback_key:'rival-proof',callback_phase:'payoff_opportunity',beat:'payoff_opportunity'}, {choices:['공개 대련에서 직접 증명한다.']});
  assert.equal(reconcileSetupPayoffTurn({saveState:state,turn:opportunity,plan}).status, 'opportunity', 'the selected mature setup may become a player-owned opportunity');
  const noChoice = turn({callback_key:'rival-proof',callback_phase:'payoff_opportunity',beat:'payoff_opportunity'});
  assert.equal(reconcileSetupPayoffTurn({saveState:state,turn:noChoice,plan}).reason, 'payoff-opportunity-requires-choice', 'an opportunity without a real choice fails closed');
  const wrong = turn({callback_key:'other-proof',callback_phase:'payoff_opportunity',beat:'payoff_opportunity'}, {choices:['응한다.']});
  assert.equal(reconcileSetupPayoffTurn({saveState:state,turn:wrong,plan}).reason, 'unselected-payoff-opportunity', 'a different callback cannot hijack the selected setup');
  const wrongBeat = turn({callback_key:'rival-proof',callback_phase:'payoff_opportunity',beat:'routine'}, {choices:['응한다.']});
  assert.equal(reconcileSetupPayoffTurn({saveState:state,turn:wrongBeat,plan}).reason, 'payoff-opportunity-beat-mismatch', 'the semantic phase and visible beat must agree');
}

{
  const openState = save({director:{callbacks:[callback()]}});
  const openPlan = deriveSetupPayoffPlan({saveState:openState,reachableNpcKeys:['lena']});
  const earlyPayoff = turn({callback_key:'rival-proof',callback_phase:'payoff',beat:'payoff'});
  assert.equal(reconcileSetupPayoffTurn({saveState:openState,turn:earlyPayoff,plan:openPlan}).reason, 'payoff-requires-owned-opportunity', 'an open setup cannot skip the player-owned opportunity transition');

  const offered = save({director:{callbacks:[callback({status:'opportunity'})]}});
  const offeredPlan = deriveSetupPayoffPlan({saveState:offered,reachableNpcKeys:['lena']});
  const payoff = turn({callback_key:'rival-proof',callback_phase:'payoff',beat:'payoff'});
  assert.equal(reconcileSetupPayoffTurn({saveState:offered,turn:payoff,plan:offeredPlan}).status, 'resolved', 'the exact owned opportunity may resolve after the player acts');

  const legacyCase = save({director:{callbacks:[callback({key:'Rival-Proof',status:'opportunity'})]}});
  const legacyPlan = deriveSetupPayoffPlan({saveState:legacyCase,reachableNpcKeys:['lena']});
  const legacyPayoff = turn({callback_key:'rival-proof',callback_phase:'payoff',beat:'payoff'});
  assert.equal(reconcileSetupPayoffTurn({saveState:legacyCase,turn:legacyPayoff,plan:legacyPlan}).status, 'resolved');
  assert.equal(legacyPayoff.director.callback_key, 'Rival-Proof', 'accepted transitions must retain the persisted exact key so the existing frontend row is updated instead of duplicated');
}

const instructions = `
===== CHARACTER REGISTRY =====
lena=레나
===== WORLD CANON =====
[MODULE: ACADEMY_CORE] academy
===== NPC CANON =====
[NPC: lena] lena
===== NPC SPEECH =====
[NPC: lena] direct
===== PC SYSTEM =====
[MODULE: PC] pc
`;
const input = '===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}';
const routed = routeOpenAIParams({instructions,input},{incoming:{action:'레나를 바라본다.',saveState:save({director:{callbacks:[callback()]}}),recentTurns:[]},mode:'game'});
assert.match(routed.params.input, /===== SETUP -> PAYOFF MEMORY V1 =====/, 'the bounded policy must reach the existing canonical call');
assert.match(routed.params.input, /SELECTED_CALLBACK=rival-proof/, 'the reserved directive must carry only the selected stable callback ID');
assert.equal(routed.telemetry.setup_payoff_memory_v1?.plan?.selected?.key, 'rival-proof', 'router telemetry must expose the same selected ownership receipt');
assert.equal(routed.telemetry.setup_payoff_memory_v1?.plan?.selected?.note, undefined, 'free-form callback notes must not leak through telemetry');

const callbackPriority = routeOpenAIParams({instructions,input},{incoming:{action:'주변을 살핀다.',saveState:save({director:{callbacks:[callback()]}}),recentTurns:[]},mode:'game'});
assert.equal(callbackPriority.telemetry.event_director_v2?.result, 'CALLBACK_PRIORITY', 'a reachable selected setup may claim the existing fixed callback flow');
const unreachablePriority = routeOpenAIParams({instructions,input},{incoming:{action:'주변을 살핀다.',saveState:save({sceneRuntime:{participants:[]},director:{callbacks:[callback()]}}),recentTurns:[]},mode:'game'});
assert.notEqual(unreachablePriority.telemetry.event_director_v2?.result, 'CALLBACK_PRIORITY', 'an unreachable callback must not force payoff narration that the validator would reject');
const scheduledInput = `${input}\n===== GM EVENT DIRECTOR (SERVER GUIDANCE) =====\nINTERVENTION: scheduled\n===== SCHEDULE ENGINE (AUTHORITATIVE) =====\n{}`;
const scheduledPriority = routeOpenAIParams({instructions,input:scheduledInput},{incoming:{action:'주변을 살핀다.',saveState:save({director:{callbacks:[callback()]},scheduleContext:{due:[{id:'class',title:'필수 수업',participants:['lena']}],upcoming:[]}}),recentTurns:[]},mode:'game'});
assert.notEqual(scheduledPriority.telemetry.event_director_v2?.result, 'CALLBACK_PRIORITY', 'a fixed schedule must stay ahead of a mature setup');
assert.equal(scheduledPriority.telemetry.setup_payoff_memory_v1?.plan?.selected, null, 'a higher-priority fixed flow must remove payoff transition authority from the receipt');

const routerSource = readFileSync(new URL('../../api/lib/context-router.js', import.meta.url), 'utf8');
const adapterSource = readFileSync(new URL('../../api/chat-router.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
assert.doesNotMatch(routerSource, /responses\.create|chat\.completions|new OpenAI/, 'Setup -> Payoff routing must not add a model call');
assert.equal((adapterSource.match(/=>coreHandler\(/g) || []).length, 1, 'the adapter must retain one canonical core call');
assert.match(adapterSource, /reconcileSetupPayoffTurn/, 'the returned semantic transition must pass the deterministic validator before persistence');
assert.match(appSource, /callback_phase[\s\S]*payoff_opportunity[\s\S]*payoff[\s\S]*resolved/, 'V1 must reuse the existing callback lifecycle instead of adding a save root');
assert.doesNotMatch(adapterSource, /setupPayoffMemory\s*=|setup_payoff_memory_add/, 'V1 must not create parallel persistent setup authority');

console.log('PASS Setup -> Payoff Memory V1 selection, ownership, lifecycle, freeze, routing, and one-call regressions');
