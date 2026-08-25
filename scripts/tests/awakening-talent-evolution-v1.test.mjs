import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_AWAKENING_CANDIDATES_PER_KIND,
  compactAwakeningTalentTelemetry,
  deriveAwakeningTalentState,
  normalizeAwakeningCandidates,
} from '../../lib/awakening-talent-evolution.js';
import { deriveSceneDelta } from '../../lib/scene-momentum.js';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import { patchGoalV2StructuredFormat } from '../../api/chat-router.js';

const traitChange = (overrides = {}) => ({
  kind: 'trait',
  name: '공명 감각',
  amount: 8,
  milestone: false,
  description: '혈통과 영혼의 공명이 위험한 마나 왜곡을 감지한다.',
  limitation: '강한 마나 왜곡이 실제로 발생한 범위 안에서만 반응한다.',
  reason: '혈통이 첫 고유 공명을 일으켰다.',
  ...overrides,
});

const traitRareScene = [{ text:'극한의 마나 압박 속에서 혈통이 기존에 없던 고유 반응을 일으켰다.' }];
const traitMilestoneScene = [{ text:'극한의 마나 압박 속 혈통의 고유 반응이 결정적 임계점을 넘어 새로운 현상으로 정착했다.' }];
const authorityMilestoneScene = [{ text:'영혼에 세계 법칙이 완전히 새겨지는 결정적 각인이 일어났고, 법칙이 그 선언에 응답했다.' }];
const mythicalTalentScene = [{ text:'성유물의 빛이 영혼의 그릇을 재구성했고, 잠재력의 성장 한계가 영구적으로 확장됐다.' }];

const ordinaryRejected = deriveAwakeningTalentState({
  awakeningChanges:[traitChange()],
  scene:[{ text:'평범한 검술 훈련에서 승리해 기분이 고조됐다.' }],
});
assert.deepEqual(ordinaryRejected.accepted_awakening_changes, [], 'ordinary training, victory, or emotion must not create awakening progress');

const rareTrait = deriveAwakeningTalentState({
  awakeningChanges:[traitChange()],
  action:'혈통의 고유 공명을 견딘다.',
  scene:traitRareScene,
  turnNumber:4,
});
assert.equal(rareTrait.candidates.trait['공명 감각'].progress, 8, 'a visible rare Trait phenomenon may create bounded progress');
assert.equal(rareTrait.candidates.trait['공명 감각'].milestones, 0, 'ordinary rare progress must not invent a decisive milestone');

const negatedRareRejected = deriveAwakeningTalentState({
  awakeningChanges:[traitChange()],
  action:'혈통의 고유 공명을 확인한다.',
  scene:[{ text:'혈통의 고유 반응은 일어나지 않았고 새로운 특이 현상도 없었다.' }],
});
assert.deepEqual(negatedRareRejected.accepted_awakening_changes, [], 'negated rare evidence must not authorize progress');

const unanchoredRareRejected = deriveAwakeningTalentState({
  awakeningChanges:[traitChange()],
  action:'가만히 주변을 본다.',
  scene:traitRareScene,
});
assert.deepEqual(unanchoredRareRejected.accepted_awakening_changes, [], 'a model-authored rare scene without a pre-turn action/save anchor must not create a new candidate');

const unboundedTraitRejected = deriveAwakeningTalentState({
  awakeningChanges:[traitChange({ limitation:'제한 없음' })],
  action:'혈통의 고유 공명을 견딘다.',
  scene:traitRareScene,
});
assert.deepEqual(unboundedTraitRejected.accepted_awakening_changes, [], 'an explicitly unbounded ability definition must be rejected');

const prematureTrait = deriveAwakeningTalentState({
  previousCandidates:{ trait:{
    '공명 감각':{ progress:99, milestones:2, description:traitChange().description, limitation:traitChange().limitation, reason:'두 번째 공명', updated_turn:8, milestone_keys:['첫공명','둘째공명'], history:[] },
  } },
  awakeningChanges:[traitChange({ amount:1, milestone:false, description:'턴마다 바뀐 설명', limitation:'사라진 한계', reason:'세 번째 징후지만 아직 정착하지 않았다.' })],
  scene:traitRareScene,
  turnNumber:9,
});
assert.equal(prematureTrait.candidates.trait['공명 감각'].progress, 100, 'progress may reach 100 while waiting for the milestone threshold');
assert.equal(prematureTrait.awakened_traits.length, 0, '100 progress alone must not awaken a Trait');
assert.equal(prematureTrait.candidates.trait['공명 감각'].description, traitChange().description, 'an existing candidate definition must remain canonical across turns');
assert.equal(prematureTrait.candidates.trait['공명 감각'].limitation, traitChange().limitation, 'an existing limitation must not be removed by a later turn');

const awakenedTrait = deriveAwakeningTalentState({
  previousCandidates:{ trait:{
    '공명 감각':{ progress:99, milestones:2, description:traitChange().description, limitation:traitChange().limitation, reason:'두 번째 공명', updated_turn:8, milestone_keys:['첫공명','둘째공명'], history:[] },
  } },
  awakeningChanges:[traitChange({ amount:1, milestone:true, reason:'세 번째 공명이 현상으로 정착했다.' })],
  scene:traitMilestoneScene,
  turnNumber:9,
});
assert.equal(awakenedTrait.candidates.trait['공명 감각'], undefined, 'a completed Trait must leave the candidate bucket');
assert.deepEqual(awakenedTrait.awakened_traits.map((row) => row.name), ['공명 감각'], 'Trait awakening requires both 100 progress and three distinct milestones');

const awakenedAuthority = deriveAwakeningTalentState({
  previousCandidates:{ authority:{
    '경계 선언':{ progress:99, milestones:3, description:'자신과 맞닿은 경계 하나에 법칙을 선언한다.', limitation:'한 번에 하나의 짧은 경계만 유지하며 영혼 피로가 누적된다.', reason:'세 번째 법칙 응답', updated_turn:12, milestone_keys:['첫각인','둘째각인','셋째각인'], history:[] },
  } },
  awakeningChanges:[{
    kind:'authority', name:'경계 선언', amount:1, milestone:true,
    description:'설명을 무제한 권능으로 바꾼다.', limitation:'제한 없음', reason:'네 번째 각인에서 세계 법칙이 응답했다.',
  }],
  scene:authorityMilestoneScene,
  turnNumber:13,
});
assert.deepEqual(awakenedAuthority.awakened_authorities.map((row) => row.name), ['경계 선언'], 'Authority awakening must require a fourth distinct decisive milestone');
assert.equal(awakenedAuthority.awakened_authorities[0].limitation.includes('영혼 피로'), true, 'promotion must preserve the established Authority limitation');

const newAuthorityCandidate = deriveAwakeningTalentState({
  awakeningChanges:[{
    kind:'authority', name:'경계 선언', amount:5, milestone:true,
    description:'자신과 맞닿은 경계 하나에 법칙을 선언한다.', limitation:'한 번에 하나의 짧은 경계만 유지하며 영혼 피로가 누적된다.', reason:'초월적 계약이 영혼에 첫 법칙을 새겼다.',
  }],
  action:'초월적 계약의 각인을 받아들인다.',
  scene:authorityMilestoneScene,
});
assert.equal(newAuthorityCandidate.candidates.authority['경계 선언'].progress, 5, 'a new Authority candidate needs both a pre-turn anchor and visible law-grade evidence');

const authorityAtThree = deriveAwakeningTalentState({
  previousCandidates:{ authority:{
    '경계 선언':{ progress:99, milestones:2, description:'경계 하나에 법칙을 선언한다.', limitation:'영혼 피로가 누적된다.', reason:'두 번째 각인', updated_turn:11, milestone_keys:['첫각인','둘째각인'], history:[] },
  } },
  awakeningChanges:[{ kind:'authority', name:'경계 선언', amount:1, milestone:true, description:'변경', limitation:'없음', reason:'세 번째 각인에서 법칙이 응답했다.' }],
  scene:authorityMilestoneScene,
});
assert.equal(authorityAtThree.awakened_authorities.length, 0, 'three Authority milestones must remain insufficient');

const duplicateMilestone = deriveAwakeningTalentState({
  previousCandidates:{ trait:{
    '공명 감각':{ progress:50, milestones:1, description:traitChange().description, limitation:traitChange().limitation, reason:'혈통의 첫 공명', updated_turn:5, milestone_keys:['혈통의첫공명'], history:[] },
  } },
  awakeningChanges:[traitChange({ milestone:true, reason:'혈통의 첫 공명' })],
  scene:traitMilestoneScene,
});
assert.deepEqual(duplicateMilestone.accepted_awakening_changes, [], 'the same causal milestone must not be applied twice');

const noTraitToAuthority = deriveAwakeningTalentState({
  existingTraits:{ '공명 감각':{ description:'기존 Trait', limitation:'범위 제한' } },
  awakeningChanges:[{ kind:'authority', name:'공명 감각', amount:10, milestone:true, description:'권능으로 진화', limitation:'없음', reason:'Trait가 성장했다.' }],
  scene:authorityMilestoneScene,
});
assert.deepEqual(noTraitToAuthority.accepted_awakening_changes, [], 'an existing Trait must never become an Authority candidate with the same identity');

const boundedCandidates = normalizeAwakeningCandidates({
  trait:Object.fromEntries(Array.from({ length:9 }, (_, index) => [`후보 특성 ${index}`, { progress:index + 1, milestones:0, description:`현상 ${index}`, limitation:`제한 ${index}`, reason:`원인 ${index}`, updated_turn:index }])),
  authority:{ constructor:{ progress:99, milestones:4, description:'오염', limitation:'없음', reason:'오염' } },
});
assert.equal(Object.keys(boundedCandidates.trait).length, MAX_AWAKENING_CANDIDATES_PER_KIND, 'each awakening kind must remain bounded');
assert.equal(Object.prototype.hasOwnProperty.call(boundedCandidates.authority, 'constructor'), false, 'prototype-sensitive candidate names must be rejected');

const frozen = deriveAwakeningTalentState({
  previousCandidates:rareTrait.candidates,
  talents:{ magic:5, martial:6, soul:7, knowledge:4 },
  awakeningChanges:[traitChange({ reason:'자동 진행 각성' })],
  talentEvolutionChanges:[{ talent:'martial', amount:1, cause:'성유물의 선택', reason:'자동 진행 재능 상승' }],
  scene:[...traitRareScene, ...mythicalTalentScene],
  allowProgress:false,
});
assert.deepEqual(frozen.candidates, rareTrait.candidates, 'AUTO/CONTINUE-style freeze must preserve normalized awakening candidates');
assert.deepEqual(frozen.accepted_awakening_changes, [], 'frozen flow must accept no awakening progress');
assert.deepEqual(frozen.accepted_talent_evolution, [], 'frozen flow must accept no talent evolution');

const ordinaryTalentRejected = deriveAwakeningTalentState({
  talents:{ magic:5, martial:5, soul:5, knowledge:5 },
  talentEvolutionChanges:[{ talent:'martial', amount:1, cause:'반복 검술 훈련', reason:'많이 훈련했다.' }],
  scene:[{ text:'검술 훈련을 반복해 승리했다.' }],
});
assert.deepEqual(ordinaryTalentRejected.accepted_talent_evolution, [], 'ordinary training must never raise a talent score');

const evolvedTalent = deriveAwakeningTalentState({
  talents:{ magic:5, martial:5, soul:5, knowledge:5 },
  talentEvolutionChanges:[{ talent:'martial', amount:1, cause:'성유물 룽기누스의 직접 선택', reason:'성유물이 영혼의 성장 천장을 재구성했다.' }],
  action:'성유물 룽기누스에 손을 댄다.',
  scene:mythicalTalentScene,
  turnNumber:20,
});
assert.equal(evolvedTalent.talents.martial, 6, 'a visible mythical source may raise exactly one talent by one');
assert.deepEqual(evolvedTalent.talent_changes.map(({ talent, before, after }) => ({ talent, before, after })), [{ talent:'martial', before:5, after:6 }]);
assert.equal(evolvedTalent.talent_history.length, 1, 'accepted mythical evolution must keep a bounded causal audit row');

const oversizedTalentRejected = deriveAwakeningTalentState({
  talents:{ magic:5, martial:5, soul:5, knowledge:5 },
  talentEvolutionChanges:[{ talent:'martial', amount:99, cause:'성유물 룽기누스의 직접 선택', reason:'과대 상승을 시도했다.' }],
  action:'성유물 룽기누스에 손을 댄다.',
  scene:mythicalTalentScene,
});
assert.deepEqual(oversizedTalentRejected.accepted_talent_evolution, [], 'malformed multi-step talent changes must be rejected rather than clamped');

const cappedTalent = deriveAwakeningTalentState({
  talents:{ magic:5, martial:10, soul:5, knowledge:5 },
  talentEvolutionChanges:[{ talent:'martial', amount:1, cause:'성유물 룽기누스의 직접 선택', reason:'이미 최고치다.' }],
  action:'성유물 룽기누스에 손을 댄다.',
  scene:mythicalTalentScene,
});
assert.deepEqual(cappedTalent.accepted_talent_evolution, [], 'talent 10 must remain the hard maximum');

const duplicateTalentCause = deriveAwakeningTalentState({
  talents:{ magic:5, martial:6, soul:5, knowledge:5 },
  previousTalentHistory:evolvedTalent.talent_history,
  talentEvolutionChanges:[{ talent:'martial', amount:1, cause:'성유물 룽기누스의 직접 선택', reason:'같은 원인을 다시 적용했다.' }],
  action:'성유물 룽기누스에 다시 손을 댄다.',
  scene:mythicalTalentScene,
});
assert.deepEqual(duplicateTalentCause.accepted_talent_evolution, [], 'the same mythical cause must not raise the same talent twice');

const awakeningGrowthDelta = deriveSceneDelta({ saveState:{}, turn:{ choices:[], scene:[], state_delta:{ awakening_progress:rareTrait.accepted_awakening_changes } } });
assert.equal(awakeningGrowthDelta.flags.growthChanged, true, 'accepted awakening progress must count as real growth State Delta');
const talentGrowthDelta = deriveSceneDelta({ saveState:{}, turn:{ choices:[], scene:[], state_delta:{ talent_evolution:evolvedTalent.accepted_talent_evolution } } });
assert.equal(talentGrowthDelta.flags.growthChanged, true, 'accepted talent evolution must count as real growth State Delta');

const telemetry = compactAwakeningTalentTelemetry(evolvedTalent);
assert.deepEqual(telemetry.evolved_talent_keys, ['martial']);
assert.doesNotMatch(JSON.stringify(telemetry), /cause|reason|history|before|after|description|limitation/, 'telemetry must not duplicate authoritative causal or ability state');

const baseSchema = {
  type:'object', additionalProperties:false,
  properties:{
    state_delta:{ type:'object', additionalProperties:false, properties:{ skill_experience:{ type:'array', items:{ type:'object' } } }, required:['skill_experience'] },
  },
  required:['state_delta'],
};
const patched = patchGoalV2StructuredFormat({ instructions:'core', text:{ format:{ schema:baseSchema } } });
assert.equal(patched.text.format.schema.properties.state_delta.properties.awakening_progress.maxItems, 1, 'adapter schema must expose one bounded awakening row');
assert.equal(patched.text.format.schema.properties.state_delta.properties.talent_evolution.items.properties.amount.maximum, 1, 'adapter schema must expose one-step talent evolution');
assert.match(patched.instructions, /Trait은 100 진척과 서로 다른 이정표 3개/, 'adapter instructions must carry the milestone authority rule');
assert.match(patched.instructions, /META·AUTO·CONTINUE에서는 두 필드를 모두 비운다/, 'adapter instructions must preserve all freeze modes');

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Public facts.
===== NPC CANON =====
${divider}
아르테미스
${divider}
Canon.
===== NPC SPEECH =====
${divider}
아르테미스
${divider}
Speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve.`;
const denseRouted = routeOpenAIParams(
  { instructions, input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming:{
    action:`공명 감각의 징후를 확인한다. ${'긴 행동 '.repeat(1600)}`,
    saveState:{
      turnNumber:20,
      world:{ location:'고대 유적' },
      pc:{
        name:'아리아', department:'기사과', status:'안정',
        talents:{ magic:4, martial:8, soul:7, knowledge:5 },
        skills:{ 대검술:{ grade:'A' } }, skillCandidates:{},
        traits:{ 사선감각:{ description:'살의를 감지한다.', limitation:'살의 없는 공격에는 둔하다.' } },
        authorities:{ 불변의서약:{ description:'맹세 하나를 법칙으로 묶는다.', limitation:'자기 자신에게도 같은 대가가 적용된다.' } },
        awakeningCandidates:rareTrait.candidates,
      },
      sceneRuntime:{ participants:['artemis'] }, npcInnerStates:{},
      routerFeedback:{ routerVersion:'1.5.6-hf1', profile:'routine-17k-v154', lastInputTokens:100000 },
    },
    recentTurns:[],
  }, mode:'game' },
);
assert.equal(denseRouted.telemetry.adaptive_scale, .76, 'dense fixture must exercise minimum adaptive routing');
assert.ok(denseRouted.params.input.length <= 6840, `awakening authority exceeded adaptive routine budget: ${denseRouted.params.input.length}`);
const minimumText = denseRouted.params.input.split('===== AUTHORITATIVE SAVE_STATE (ROUTED MINIMUM) =====\n')[1].split('\n\n=====')[0];
const minimumSave = JSON.parse(minimumText);
assert.equal(minimumSave.pc.talents.martial, 8, 'all four authoritative talent scores must survive the minimum route');
assert.equal(minimumSave.pc.traits['사선감각'], true, 'existing Trait identity must survive the minimum route');
assert.equal(minimumSave.pc.authorities['불변의서약'], true, 'existing Authority identity must survive the minimum route');
assert.equal(minimumSave.pc.awakeningCandidates.trait['공명 감각'].progress, 8, 'awakening progress must survive the minimum route');
assert.equal(minimumSave.pc.awakeningCandidates.trait['공명 감각'].milestones, 0, 'awakening milestone count must survive the minimum route');

const fixedName = (prefix, index, length) => `${prefix}${index}-`.padEnd(length, String(index % 10)).slice(0, length);
const maximalTraits = Object.fromEntries(Array.from({ length:8 }, (_, index) => [fixedName('Trait-', index, 64), { description:'설명 '.repeat(80), limitation:'조건과 대가 '.repeat(60) }]));
const maximalAuthorities = Object.fromEntries(Array.from({ length:8 }, (_, index) => [fixedName('Authority-', index, 64), { description:'설명 '.repeat(80), limitation:'조건과 대가 '.repeat(60) }]));
const maximalAwakening = Object.fromEntries(['trait','authority'].map((kind) => [kind, Object.fromEntries(Array.from({ length:4 }, (_, index) => [fixedName(`${kind}-후보-`, index, 64), { progress:80 + index, milestones:index, description:'후보 현상 '.repeat(60), limitation:'후보 제한 '.repeat(60), reason:'희귀 원인', updated_turn:index }]))]));
const directlyMentionedTrait = Object.keys(maximalTraits).at(-1);
const directlyMentionedAwakening = Object.keys(maximalAwakening.authority).at(-1);
const maximalGrowthRoute = routeOpenAIParams(
  { instructions, input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming:{
    action:`${directlyMentionedTrait} 및 ${directlyMentionedAwakening} 상태를 점검한다. ${'장문 행동 '.repeat(1600)}`,
    saveState:{
      turnNumber:30, world:{ location:'고대 유적' },
      pc:{
        name:'아리아', department:'기사과', status:'안정', talents:{ magic:10, martial:10, soul:10, knowledge:10 },
        skills:Object.fromEntries(Array.from({ length:24 }, (_, index) => [fixedName('기존-', index, 80), { grade:'A++' }])),
        skillCandidates:Object.fromEntries(Array.from({ length:8 }, (_, index) => [fixedName('학습-', index, 48), { progress:80 + index, updated_turn:index }])),
        traits:maximalTraits, authorities:maximalAuthorities, awakeningCandidates:maximalAwakening,
      },
      sceneRuntime:{ participants:['artemis'] }, npcInnerStates:{},
      routerFeedback:{ routerVersion:'1.5.6-hf1', profile:'routine-17k-v154', lastInputTokens:100000 },
    }, recentTurns:[],
  }, mode:'game' },
);
assert.ok(maximalGrowthRoute.params.input.length <= 6840, `maximal bounded growth authority exceeded adaptive routine budget: ${maximalGrowthRoute.params.input.length}`);
const maximalMinimumText = maximalGrowthRoute.params.input.split('===== AUTHORITATIVE SAVE_STATE (ROUTED MINIMUM) =====\n')[1].split('\n\n=====')[0];
const maximalMinimum = JSON.parse(maximalMinimumText);
assert.equal(maximalMinimum.pc.growth_context_truncated, true, 'pathological combined growth pressure must be explicitly marked');
assert.ok(Object.prototype.hasOwnProperty.call(maximalMinimum.pc.traits, directlyMentionedTrait), 'directly mentioned Trait must outrank unmentioned entries under pressure');
assert.ok(Object.prototype.hasOwnProperty.call(maximalMinimum.pc.awakeningCandidates.authority, directlyMentionedAwakening), 'directly mentioned awakening candidate must survive pressure compaction');

const routerSource = readFileSync(new URL('../../api/chat-router.js', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../../app-runtime.js', import.meta.url), 'utf8');
const healthSource = readFileSync(new URL('../../api/health.js', import.meta.url), 'utf8');
const coreSource = readFileSync(new URL('../../api/chat.js', import.meta.url), 'utf8');
const runtimeFunctionMatch = runtimeSource.match(/function applyAwakeningTalentRuntimeStable\(runtime = \{\}\) \{[\s\S]*?\n\}\n\nfunction applyNpcRelationshipDeltaStable/);
assert.ok(runtimeFunctionMatch, 'stable runtime awakening helper must remain extractable for deterministic persistence verification');
const runtimeFunctionSource = runtimeFunctionMatch[0].replace(/\n\nfunction applyNpcRelationshipDeltaStable[\s\S]*$/, '');
const runtimeSave = { pc:{ talents:{ magic:5, martial:5, soul:5, knowledge:5 }, traits:{}, authorities:{} } };
const runtimeClamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const applyRuntimePacket = Function('save', 'clamp', `${runtimeFunctionSource}; return applyAwakeningTalentRuntimeStable;`)(runtimeSave, runtimeClamp);
const firstRuntimeNotices = applyRuntimePacket({ awakening_talent:{ ...evolvedTalent, awakened_traits:awakenedTrait.awakened_traits } });
assert.equal(runtimeSave.pc.talents.martial, 6, 'stable runtime must apply the exact server-validated talent transition');
assert.equal(runtimeSave.pc.traits['공명 감각'].limitation, traitChange().limitation, 'stable runtime must persist the canonical awakened ability definition');
assert.equal(firstRuntimeNotices.length, 2, 'first application must report one Trait and one talent evolution');
const replayNotices = applyRuntimePacket({ awakening_talent:{ ...evolvedTalent, awakened_traits:awakenedTrait.awakened_traits } });
assert.equal(runtimeSave.pc.talents.martial, 6, 'replaying the same packet must not apply talent evolution twice');
assert.deepEqual(replayNotices, [], 'replaying the same packet must be notice-idempotent');
assert.match(routerSource, /allowProgress:mode==='game'/, 'AUTO must pass through the deterministic freeze gate');
assert.match(routerSource, /state_delta\.awakening_progress=\[\].*state_delta\.talent_evolution=\[\]/s, 'META must clear both growth fields');
assert.match(runtimeSource, /applyAwakeningTalentRuntimeStable/, 'stable runtime must persist server-validated awakening and talent state');
assert.match(runtimeSource, /current === before[\s\S]*save\.pc\.talents\[talent\] = after/, 'talent application must be exact-state and replay safe');
assert.match(runtimeSource, /Trait: \$\{traits\}[\s\S]*Authority: \$\{authorities\}[\s\S]*각성 중: \$\{awakening\}/, 'INFO UI must expose learned abilities and active awakening candidates');
assert.match(healthSource, /awakeningTalentEvolution/, 'health must advertise the deployed feature');
assert.match(readFileSync(new URL('../../lib/scene-orchestration.js', import.meta.url), 'utf8'), /EFFECT_ONLY=relationship\|faction\|growth\|offscreen\|novelty/, 'growth systems must remain effects rather than independent scene drivers');
assert.equal((coreSource.match(/responses\.parse\(/g) || []).length, 1, 'canonical core must retain one model call per normal turn');
assert.doesNotMatch(routerSource, /responses\.(?:create|parse)\(/, 'adapter feature logic must not add a second model call');

console.log('PASS Awakening / Talent Evolution V1 evidence, thresholds, persistence, routing, freeze, UI, and one-call regressions');
