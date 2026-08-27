import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CALLBACK_PHASE_BEAT_CONTRACT,
  SETUP_PAYOFF_MEMORY_VERSION,
  buildSetupPayoffDirective,
  deriveSetupPayoffPlan,
  reconcileSetupPayoffTurn,
  restoreSetupPayoffOpportunity,
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
const payoffChoice = '훈련용 목검을 들고 한 번의 유효타를 목표로 대련한다.';
const payoffBoundary = (turn = 9, anchor = payoffChoice) => ({ kind:'player-choice', source:'choices', status:'awaiting-player', established_turn:turn, anchor });
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
assert.deepEqual(CALLBACK_PHASE_BEAT_CONTRACT.payoff_opportunity_open, ['choice', 'payoff_opportunity'], 'opening an opportunity must retain the narrow canonical choice beats');
assert.deepEqual(CALLBACK_PHASE_BEAT_CONTRACT.payoff_opportunity_continuation, ['choice', 'payoff_opportunity', 'combat'], 'an already-owned continuation may use only the existing combat continuation beat in addition to choice beats');
assert.deepEqual(CALLBACK_PHASE_BEAT_CONTRACT.payoff, ['payoff']);
assert.deepEqual(CALLBACK_PHASE_BEAT_CONTRACT.aftermath, ['aftermath']);

{
  const immature = deriveSetupPayoffPlan({ saveState:save({ turnNumber:10, director:{ callbacks:[callback()] } }), reachableNpcKeys:['lena'] });
  assert.equal(immature.selected, null, 'an open setup must mature for two turns before payoff pressure');
  const mature = deriveSetupPayoffPlan({ saveState:save({ director:{ callbacks:[callback()] } }), reachableNpcKeys:['lena'] });
  assert.equal(mature.selected?.key, 'rival-proof', 'a mature reachable setup becomes the one selected payoff authority');
  assert.equal(mature.selected?.status, 'open');
  assert.doesNotMatch(buildSetupPayoffDirective(mature), /레나가 공개 대련의 증명/, 'the directive must not copy free-form callback notes into reserved authority');
  assert.match(buildSetupPayoffDirective({...mature,selected:{...mature.selected,status:'opportunity'}}), /같은 ID와 payoff_opportunity를 반복/, 'a continued payoff choice must explicitly carry the same stable ownership into the next player boundary');
}

{
  const unreachable = deriveSetupPayoffPlan({ saveState:save({ sceneRuntime:{participants:[]}, director:{callbacks:[callback()]} }), reachableNpcKeys:[] });
  assert.equal(unreachable.selected, null, 'an NPC-owned setup must not fire while its participant is unreachable');
  const worldSetup = deriveSetupPayoffPlan({ saveState:save({ sceneRuntime:{participants:[]}, director:{callbacks:[callback({key:'world-trace',spotlight_keys:[]})]} }), reachableNpcKeys:[] });
  assert.equal(worldSetup.selected?.key, 'world-trace', 'an unscoped visible-world setup may mature without inventing an NPC arrival');
}

{
  const awaiting = save({ sceneRuntime:{participants:['lena'],turn_hook:payoffBoundary(12)}, director:{callbacks:[callback()]} });
  assert.equal(deriveSetupPayoffPlan({saveState:awaiting,reachableNpcKeys:['lena']}).selected, null, 'an unrelated player-owned boundary blocks a new payoff opportunity');
  const ownedOpportunity = save({ sceneRuntime:{participants:['lena'],turn_hook:payoffBoundary(9)}, director:{callbacks:[callback({status:'opportunity'})]} });
  assert.equal(deriveSetupPayoffPlan({saveState:ownedOpportunity,action:payoffChoice,reachableNpcKeys:['lena']}).selected?.key, 'rival-proof', 'the exact presented option keeps its owned payoff authority');
  assert.equal(deriveSetupPayoffPlan({saveState:ownedOpportunity,action:'학생 식당으로 간다.',reachableNpcKeys:['lena']}).selected, null, 'an unrelated action cannot consume the presented payoff opportunity');
  const unrelatedLaterChoice = save({ sceneRuntime:{participants:['lena'],turn_hook:payoffBoundary(12)}, director:{callbacks:[callback({status:'opportunity'})]} });
  assert.equal(deriveSetupPayoffPlan({saveState:unrelatedLaterChoice,action:payoffChoice,reachableNpcKeys:['lena']}).selected, null, 'a later unrelated player boundary cannot consume an older payoff opportunity');
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

  const ownedContinuationState = save({sceneRuntime:{participants:['lena'],turn_hook:payoffBoundary(9)},director:{callbacks:[callback({status:'opportunity'})]}});
  const ownedContinuationPlan = deriveSetupPayoffPlan({saveState:ownedContinuationState,action:payoffChoice,reachableNpcKeys:['lena']});
  const combatContinuation = turn({callback_key:'rival-proof',callback_phase:'payoff_opportunity',beat:'combat'}, {choices:['간격을 유지하며 다음 합을 준비한다.']});
  assert.equal(reconcileSetupPayoffTurn({saveState:ownedContinuationState,turn:combatContinuation,plan:ownedContinuationPlan}).status, 'opportunity', 'an already presented and exactly selected payoff may continue through the existing canonical combat beat');
  const unrelatedContinuationBeat = turn({callback_key:'rival-proof',callback_phase:'payoff_opportunity',beat:'investigation'}, {choices:['단서를 더 찾는다.']});
  assert.equal(reconcileSetupPayoffTurn({saveState:ownedContinuationState,turn:unrelatedContinuationBeat,plan:ownedContinuationPlan}).reason, 'payoff-opportunity-beat-mismatch', 'an unrelated canonical beat must remain fail-closed');

  const openCombat = turn({callback_key:'rival-proof',callback_phase:'payoff_opportunity',beat:'combat'}, {choices:['공개 대련에서 직접 증명한다.']});
  assert.equal(reconcileSetupPayoffTurn({saveState:state,turn:openCombat,plan}).reason, 'payoff-opportunity-beat-mismatch', 'combat must not bypass the narrow open-to-opportunity contract');
}

{
  const openState = save({director:{callbacks:[callback()]}});
  const openPlan = deriveSetupPayoffPlan({saveState:openState,reachableNpcKeys:['lena']});
  const earlyPayoff = turn({callback_key:'rival-proof',callback_phase:'payoff',beat:'payoff'});
  const earlyResult = reconcileSetupPayoffTurn({saveState:openState,turn:earlyPayoff,plan:openPlan});
  assert.equal(earlyResult.reason, 'payoff-requires-owned-opportunity', 'an open setup cannot skip the player-owned opportunity transition');
  assert.equal(earlyResult.reject_turn, true, 'an unauthorized payoff must reject the complete result so narration and rewards cannot leak through');
  const earlyAftermath = turn({callback_key:'rival-proof',callback_phase:'aftermath',beat:'aftermath'});
  assert.equal(reconcileSetupPayoffTurn({saveState:openState,turn:earlyAftermath,plan:openPlan}).reason, 'payoff-requires-owned-opportunity', 'an open setup cannot skip directly to aftermath');

  const offered = save({sceneRuntime:{participants:['lena'],turn_hook:payoffBoundary(9)},director:{callbacks:[callback({status:'opportunity'})]}});
  const offeredPlan = deriveSetupPayoffPlan({saveState:offered,action:payoffChoice,reachableNpcKeys:['lena']});
  const payoff = turn({callback_key:'rival-proof',callback_phase:'payoff',beat:'payoff'});
  assert.equal(reconcileSetupPayoffTurn({saveState:offered,turn:payoff,plan:offeredPlan}).status, 'resolved', 'the exact owned opportunity may resolve after the player acts');

  const failedPayoff = turn(
    {callback_key:'rival-proof',callback_phase:'payoff',beat:'payoff'},
    {resolution_log:{triggered:true,outcome:'failure',summary:'유효타에 실패했다.',abilities:[]},choices:['간격을 다시 잡고 재도전한다.']},
  );
  const failedResult = reconcileSetupPayoffTurn({saveState:offered,turn:failedPayoff,plan:offeredPlan});
  assert.equal(failedResult.status, 'opportunity', 'an explicit failed payoff must remain a player-owned opportunity');
  assert.equal(failedResult.reason, 'owned-payoff-failure-retry');
  assert.equal(failedPayoff.director.callback_phase, 'payoff_opportunity', 'failure must not persist a resolved callback phase');
  assert.equal(failedPayoff.director.beat, 'payoff_opportunity', 'the retained retry must use the existing canonical opportunity beat');
  assert.equal(failedPayoff.director.callback_key, 'rival-proof');

  const failedWithoutRetry = turn(
    {callback_key:'rival-proof',callback_phase:'payoff',beat:'payoff'},
    {resolution_log:{triggered:true,outcome:'failure',summary:'유효타에 실패했다.',abilities:[]}},
  );
  const failedWithoutRetryResult = reconcileSetupPayoffTurn({saveState:offered,turn:failedWithoutRetry,plan:offeredPlan});
  assert.equal(failedWithoutRetryResult.reason, 'payoff-failure-requires-retry-choice', 'failure without a new player boundary must fail closed instead of resolving');
  assert.equal(failedWithoutRetryResult.reject_turn, true);

  const partialPayoff = turn(
    {callback_key:'rival-proof',callback_phase:'payoff',beat:'payoff'},
    {resolution_log:{triggered:true,outcome:'partial',summary:'조건 일부를 증명했다.',abilities:[]}},
  );
  assert.equal(reconcileSetupPayoffTurn({saveState:offered,turn:partialPayoff,plan:offeredPlan}).status, 'resolved', 'a structured partial success may complete the owned payoff');

  const legacyCase = save({sceneRuntime:{participants:['lena'],turn_hook:payoffBoundary(9)},director:{callbacks:[callback({key:'Rival-Proof',status:'opportunity'})]}});
  const legacyPlan = deriveSetupPayoffPlan({saveState:legacyCase,action:payoffChoice,reachableNpcKeys:['lena']});
  const legacyPayoff = turn({callback_key:'rival-proof',callback_phase:'payoff',beat:'payoff'});
  assert.equal(reconcileSetupPayoffTurn({saveState:legacyCase,turn:legacyPayoff,plan:legacyPlan}).status, 'resolved');
  assert.equal(legacyPayoff.director.callback_key, 'Rival-Proof', 'accepted transitions must retain the persisted exact key so the existing frontend row is updated instead of duplicated');
}

{
  const acceptedDirector = {
    intervention:'medium', beat:'payoff_opportunity', event_kind:'rivalry', spotlight_keys:['lena'],
    callback_key:'rival-proof', callback_phase:'payoff_opportunity', callback_note:null, reason:'test',
  };
  const rewritten = {director:null,choices:['간격을 다시 잡고 재도전한다.']};
  assert.equal(restoreSetupPayoffOpportunity({
    turn:rewritten,
    lifecycle:{status:'opportunity',callback_key:'rival-proof'},
    acceptedDirector,
    acceptedChoices:['간격을 다시 잡고 재도전한다.'],
  }), true, 'a final time rewrite must restore accepted callback ownership when the exact player choice survives');
  assert.equal(rewritten.director.callback_key, 'rival-proof');
  assert.equal(rewritten.director.callback_phase, 'payoff_opportunity');

  const unrelatedRewrite = {director:null,choices:['수업으로 돌아간다.']};
  assert.equal(restoreSetupPayoffOpportunity({
    turn:unrelatedRewrite,
    lifecycle:{status:'opportunity',callback_key:'rival-proof'},
    acceptedDirector,
    acceptedChoices:['간격을 다시 잡고 재도전한다.'],
  }), false, 'an unrelated rewritten choice cannot inherit payoff ownership');
  assert.equal(unrelatedRewrite.director, null);

  const partialRewrite = {director:null,choices:['간격을 다시 잡고 재도전한다.']};
  assert.equal(restoreSetupPayoffOpportunity({
    turn:partialRewrite,
    lifecycle:{status:'opportunity',callback_key:'rival-proof'},
    acceptedDirector,
    acceptedChoices:['간격을 다시 잡고 재도전한다.','거리를 벌리고 상황을 본다.'],
  }), false, 'a partially replaced choice boundary cannot inherit payoff ownership');
  assert.equal(partialRewrite.director, null);

  const conflictingRewrite = {director:{callback_key:'other-proof',callback_phase:'payoff_opportunity'},choices:['간격을 다시 잡고 재도전한다.']};
  assert.equal(restoreSetupPayoffOpportunity({
    turn:conflictingRewrite,
    lifecycle:{status:'opportunity',callback_key:'rival-proof'},
    acceptedDirector,
    acceptedChoices:['간격을 다시 잡고 재도전한다.'],
  }), false, 'a different final callback owner cannot be overwritten');
  assert.equal(conflictingRewrite.director.callback_key, 'other-proof');
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

const ownedCombatSave = save({
  sceneRuntime:{participants:['lena'],turn_hook:payoffBoundary(12)},
  director:{callbacks:[callback({status:'opportunity',lastTurn:12})]},
});
const ownedCombat = routeOpenAIParams({instructions,input},{incoming:{action:payoffChoice,saveState:ownedCombatSave,recentTurns:[]},mode:'game'});
assert.equal(ownedCombat.telemetry.event_director_v2?.result, 'CALLBACK_PRIORITY', 'an exact selected owned payoff continuation must outrank generic active-combat routing');
assert.equal(ownedCombat.telemetry.setup_payoff_memory_v1?.plan?.selected?.key, 'rival-proof', 'the same stable callback must own the continued payoff');
const scheduledOwnedCombat = routeOpenAIParams({instructions,input:scheduledInput},{incoming:{action:payoffChoice,saveState:{...ownedCombatSave,scheduleContext:{due:[{id:'class',title:'필수 수업',participants:['lena']}],upcoming:[]}},recentTurns:[]},mode:'game'});
assert.notEqual(scheduledOwnedCombat.telemetry.event_director_v2?.result, 'CALLBACK_PRIORITY', 'a required schedule must remain above an owned payoff continuation');
assert.equal(scheduledOwnedCombat.telemetry.setup_payoff_memory_v1?.plan?.selected, null, 'hard-boundary routing must not consume the payoff opportunity');
const ignoredPayoff = routeOpenAIParams({instructions,input},{incoming:{action:'학생 식당으로 간다.',saveState:ownedCombatSave,recentTurns:[]},mode:'game'});
assert.notEqual(ignoredPayoff.telemetry.event_director_v2?.result, 'CALLBACK_PRIORITY', 'choosing another action must leave the payoff unconsumed');
assert.equal(ignoredPayoff.telemetry.setup_payoff_memory_v1?.plan?.selected, null, 'an unselected option has no continuation authority');
const ordinaryCombat = routeOpenAIParams({instructions,input},{incoming:{action:'공개 대련을 시작한다.',saveState:save(),recentTurns:[]},mode:'game'});
assert.equal(ordinaryCombat.telemetry.event_director_v2?.result, 'ACTIVE_COMBAT_FIXED_FLOW', 'ordinary combat without an owned payoff must retain the existing fixed flow');

const routerSource = readFileSync(new URL('../../api/lib/context-router.js', import.meta.url), 'utf8');
const adapterSource = readFileSync(new URL('../../api/chat-router.js', import.meta.url), 'utf8');
const coreSource = readFileSync(new URL('../../api/chat.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
assert.doesNotMatch(routerSource, /responses\.create|chat\.completions|new OpenAI/, 'Setup -> Payoff routing must not add a model call');
assert.equal((adapterSource.match(/=>coreHandler\(/g) || []).length, 1, 'the adapter must retain one canonical core call');
assert.match(adapterSource, /reconcileSetupPayoffTurn/, 'the returned semantic transition must pass the deterministic validator before persistence');
assert.ok((adapterSource.match(/reconcileSetupPayoffTurn/g) || []).length >= 3, 'the adapter must validate before and after final time reconciliation');
assert.ok(adapterSource.lastIndexOf('restoreSetupPayoffOpportunity') > adapterSource.indexOf('const sceneIntent=applySceneMomentumTimeFloor'), 'accepted opportunity ownership must be restored only after the final time rewrite');
assert.match(adapterSource, /setupPayoffLifecycle\.reject_turn[\s\S]*SETUP_PAYOFF_LIFECYCLE_REJECTED/, 'a rejected payoff must fail the complete response before its narration or state delta can persist');
assert.match(coreSource, /const ResolutionLog = z\.object\([\s\S]*outcome: z\.enum\(\['none', 'success', 'partial', 'failure'\]\)[\s\S]*resolution_log: ResolutionLog/, 'the canonical core response schema must carry the structured failure outcome used by lifecycle validation');
assert.match(coreSource, /turn\.resolution_log = \{[\s\S]*outcome: resolutionTriggered && allowedOutcomes\.has\(rawResolution\.outcome\)/, 'canonical sanitization must preserve a schema-valid explicit failure outcome');
assert.match(coreSource, /payoff\/aftermath[\s\S]*outcome='failure'/, 'canonical GM authority must require retrying payoff failures to report the structured failure outcome');
assert.match(appSource, /callback_phase[\s\S]*payoff_opportunity[\s\S]*payoff[\s\S]*resolved/, 'V1 must reuse the existing callback lifecycle instead of adding a save root');
assert.doesNotMatch(adapterSource, /setupPayoffMemory\s*=|setup_payoff_memory_add/, 'V1 must not create parallel persistent setup authority');

console.log('PASS Setup -> Payoff Memory V1 selection, ownership, lifecycle, freeze, routing, and one-call regressions');
