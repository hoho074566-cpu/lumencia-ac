#!/usr/bin/env node

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeOpenAIParams} from '../../api/lib/context-router.js';
import {
  FATE_BACKGROUND_VISIBILITY,
  buildFateBackgroundState,
  compactFateBackgroundForModel,
} from '../../lib/fate-background.js';
import {generateFateStartingCharacter,normalizeCharacterCreation} from '../../lib/fate-start.js';

const commoner=generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'기사과 1학년',seed:'p2-pr03-commoner'});
const noble=generateFateStartingCharacter({gender:'female',socialClass:'fallen_noble',department:'기사과 1학년',seed:'p2-pr03-noble'});

for(const generated of [commoner,noble]){
  const background=generated.creation.fateStart.background,origin=generated.creation.fateStart.origin;
  assert.equal(background.version,1);
  assert.deepEqual([...new Set(background.facts.map(row=>row.visibility))].sort(),[...FATE_BACKGROUND_VISIBILITY].sort(),'all four visibility levels must persist');
  assert.deepEqual(normalizeCharacterCreation(JSON.parse(JSON.stringify(generated.creation))),generated.creation,'background state must survive save/load normalization');
  const legacy=JSON.parse(JSON.stringify(generated.creation));delete legacy.fateStart.background;
  assert.equal(normalizeCharacterCreation(legacy).fateStart.background.sourceSeedTag,origin.seedTag,'P2-PR02 saves must gain deterministic background state');
  const model=compactFateBackgroundForModel(generated.creation,generated.pc),modelText=JSON.stringify(model);
  assert.match(modelText,new RegExp(background.facts.find(row=>row.id==='social_class').fact),'PUBLIC social class must reach model context');
  for(const hidden of background.facts.filter(row=>['PRIVATE','SECRET'].includes(row.visibility)))assert.equal(modelText.includes(hidden.fact),false,`${hidden.visibility} value leaked into model context`);
  assert.equal(model.detail.limited_records.every(row=>row.audience.length>0),true,'LIMITED records require an explicit official audience');
}

assert.notEqual(commoner.creation.fateStart.background.startingRoute.id,noble.creation.fateStart.background.startingRoute.id,'social class must vary the starting route');
assert.notEqual(commoner.creation.fateStart.background.startingRoute.expectation,noble.creation.fateStart.background.startingRoute.expectation,'same event must carry different expectations');
assert.notEqual(commoner.creation.fateStart.background.startingRoute.eventMeaning,noble.creation.fateStart.background.startingRoute.eventMeaning,'same event must carry different meaning');

const advancedOrigin={...commoner.creation.fateStart.origin,baseStats:{...commoner.creation.fateStart.origin.baseStats,body:3},talents:{...commoner.creation.fateStart.origin.talents,martial:3}};
const advanced=buildFateBackgroundState(advancedOrigin);
assert.equal(advanced.strengthProfile.band,'advanced_start');
assert.match(advanced.strengthProfile.evaluationMode,/상위 과제로 전환/,'high starting strength must adjust evaluation instead of forcing a full beginner tutorial');

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
guide=안내 교관
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Academy entrance ceremony.
===== NPC CANON =====
${divider}
Guide
${divider}
Strict but fair evaluator.
===== NPC SPEECH =====
${divider}
Guide
${divider}
Brief official speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC
${divider}
Resolve declared actions.`;
const route=(generated)=>routeOpenAIParams(
  {instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},
  {incoming:{action:'같은 기사과 신입 평가를 받는다.',saveState:{turnNumber:0,world:{date:'1285-03-01',time:'08:40',location:'대강당 앞'},creation:generated.creation,pc:generated.pc,sceneRuntime:{participants:['guide']},scheduleContext:{due:[],upcoming:[]}},recentTurns:[]},mode:'game'},
);

const commonerRoute=route(commoner),nobleRoute=route(noble);
for(const [r,generated] of [[commonerRoute,commoner],[nobleRoute,noble]]){
  const background=generated.creation.fateStart.background;
  assert.match(r.params.input,/===== FATE BACKGROUND PERSISTENCE V1 =====/,'character-dependent background directive must reach normal gameplay');
  assert.match(r.params.instructions,/PUBLIC만 NPC 기본 지식/,'visibility authority must be a routed GM rule');
  assert.match(r.params.instructions,/NPC 성격 × NPC가 실제 아는 PC 배경 × 현재 상황 × 기대/,'first-impression calculation contract is missing');
  assert.match(r.params.instructions,/일반 초보 절차를 끝까지 반복 강요하지 않고/,'strength-aware evaluation contract is missing');
  for(const hidden of background.facts.filter(row=>['PRIVATE','SECRET'].includes(row.visibility)))assert.equal(r.params.input.includes(hidden.fact),false,`${hidden.visibility} background leaked into routed gameplay`);
  assert.equal(r.params.input.includes(generated.pc.characterSetting),false,'full Origin Story must not bypass background visibility through PC state');
  assert.ok(r.params.input.length<=9000,`background routing exceeded the stable routine budget: ${r.params.input.length}`);
}
assert.equal(commonerRoute.params.input.includes(commoner.creation.fateStart.background.startingRoute.eventMeaning),true);
assert.equal(nobleRoute.params.input.includes(noble.creation.fateStart.background.startingRoute.eventMeaning),true);
assert.notEqual(commonerRoute.params.input,nobleRoute.params.input,'same event must receive character-dependent context');

const app=readFileSync('app.js','utf8');
const runtime=readFileSync('app-runtime.js','utf8');
const router=readFileSync('api/lib/context-router.js','utf8');
assert.match(app,/startRoute\.arrivalFocus[\s\S]*startRoute\.eventMeaning[\s\S]*startRoute\.checkpoint/,'Fate creation must start from its persisted route');
assert.match(app,/world: save\.world, creation: save\.creation, pc: save\.pc/,'base compact request must carry persistent creation state');
const compactStateStableSource=runtime.match(/function compactStateStable\(\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(compactStateStableSource,'stable runtime compact request function is missing');
const runtimePayload=Function('save',`${compactStateStableSource}; return compactStateStable();`)({id:'runtime-test',version:6,turnNumber:0,world:{},creation:commoner.creation,pc:commoner.pc,usage:{},qualityTelemetry:{}});
assert.deepEqual(runtimePayload.creation,commoner.creation,'deployed stable runtime request must carry persistent Fate background state');
assert.doesNotMatch(router,/rumor propagation|global epistemic|faction intelligence/i,'P2-PR03 must not add a generic knowledge/rumor engine');

console.log('background-persistence-character-start: PASS');
