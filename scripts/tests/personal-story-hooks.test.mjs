#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { routeOpenAIParams } from '../../api/lib/context-router.js';
import { deriveActiveThreads } from '../../lib/active-threads.js';
import {
  FATE_PERSONAL_STORY_LAYERS,
  buildFatePersonalStoryDirective,
  compactFatePersonalStoryForModel,
} from '../../lib/fate-personal-story.js';
import { generateFateStartingCharacter, normalizeCharacterCreation } from '../../lib/fate-start.js';

const commoner=generateFateStartingCharacter({gender:'female',socialClass:'commoner',department:'기사과 1학년',seed:'p2-pr04-commoner'});
const noble=generateFateStartingCharacter({gender:'male',socialClass:'fallen_noble',department:'마법과 1학년',seed:'p2-pr04-noble'});

for(const generated of [commoner,noble]){
  const story=generated.creation.fateStart.personalStory;
  assert.equal(story.version,1);
  assert.deepEqual(story.layers,[...FATE_PERSONAL_STORY_LAYERS]);
  assert.equal(story.hooks.length>=2&&story.hooks.length<=4,true,'each Fate character must start with 2-4 personal hook candidates');
  assert.equal(story.hooks.every((row)=>row.status==='candidate'&&row.layer==='PC_ORIGIN_PLOT'),true,'personal hooks must remain dormant PC Origin candidates');
  assert.equal(story.hooks.every((row)=>row.bridgeLayers.some((layer)=>['WORLD_PLOT','NPC_PLOT'].includes(layer))),true,'every Origin hook must be combinable with the world or an NPC plot');
  assert.deepEqual(normalizeCharacterCreation(JSON.parse(JSON.stringify(generated.creation))),generated.creation,'personal hooks must survive save/load normalization');
  const legacy=JSON.parse(JSON.stringify(generated.creation));
  delete legacy.fateStart.personalStory;
  assert.deepEqual(normalizeCharacterCreation(legacy).fateStart.personalStory,story,'P2-PR02/03 saves must gain deterministic personal hooks');

  const compact=compactFatePersonalStoryForModel(generated.creation),modelText=JSON.stringify(compact);
  assert.equal(compact.candidateCount,story.hooks.length);
  for(const hidden of story.hooks.filter((row)=>['PRIVATE','SECRET'].includes(row.visibility))){
    assert.equal(modelText.includes(hidden.premise),false,`${hidden.visibility} personal premise leaked into model context`);
    assert.equal(modelText.includes(hidden.id),false,`${hidden.visibility} internal candidate id leaked its meaning`);
    assert.equal(modelText.includes(hidden.title),false,`${hidden.visibility} candidate title leaked its meaning`);
    assert.equal(modelText.includes(hidden.activationCue),false,`${hidden.visibility} activation cue leaked its meaning`);
  }
  assert.equal(compact.detail.candidates.filter((row)=>row.withheld).every((row)=>row.kind==='other'),true,'hidden candidate kinds must remain semantically opaque');
  for(const limited of story.hooks.filter((row)=>row.visibility==='LIMITED')){
    assert.equal(modelText.includes(limited.premise),false,'Personal Story must not merge separately audience-gated LIMITED records');
  }
  assert.match(buildFatePersonalStoryDirective({creation:generated.creation}),/한 턴 최대 하나/,'the model must not activate all personal hooks at once');
  assert.match(buildFatePersonalStoryDirective({creation:generated.creation}),/hooks_add/,'activation must reuse the existing hook lifecycle');
}

assert.ok(commoner.creation.fateStart.personalStory.hooks.some((row)=>row.id==='regional-tie'));
assert.ok(noble.creation.fateStart.personalStory.hooks.some((row)=>row.id==='lost-house-echo'));
assert.notDeepEqual(commoner.creation.fateStart.personalStory.hooks.map((row)=>row.id),noble.creation.fateStart.personalStory.hooks.map((row)=>row.id),'social class must create different long-story candidates');

const baseSave={
  turnNumber:1, world:{date:'1285-03-01',time:'08:40',location:'대강당 앞'}, creation:commoner.creation, pc:commoner.pc,
  sceneRuntime:{}, activeEvents:[], completedEvents:[], worldArcs:[], hooks:[], scheduledEvents:[], scheduleContext:{due:[],upcoming:[]}, director:{callbacks:[]},
};
const threads=deriveActiveThreads({saveState:baseSave});
assert.equal(threads.filter((row)=>row.source==='personal-story').length,3,'dormant personal hooks must register as bounded Active Thread candidates');
assert.equal(threads.filter((row)=>row.source==='personal-story').every((row)=>row.status==='candidate'&&row.background),true,'personal candidates must not masquerade as active foreground events');
for(const hidden of commoner.creation.fateStart.personalStory.hooks.filter((row)=>['PRIVATE','SECRET'].includes(row.visibility))){
  assert.equal(JSON.stringify(threads).includes(hidden.premise),false,'Active Threads must not expose a hidden personal premise');
  assert.equal(JSON.stringify(threads).includes(hidden.id),false,'Active Threads must not expose a hidden internal candidate id');
  assert.equal(JSON.stringify(threads).includes(hidden.title),false,'Active Threads must not expose a hidden candidate title');
}

const materialized={...baseSave,hooks:[{id:'personal:origin-candidate-1',title:'지역 인연이 실제 장면에 연결됨',status:'open'}]};
assert.equal(compactFatePersonalStoryForModel(commoner.creation,{existingHooks:materialized.hooks}).candidateCount,2,'a materialized candidate must not be offered again');
assert.equal(deriveActiveThreads({saveState:materialized}).filter((row)=>row.source==='personal-story').length,2,'the dormant candidate must yield to its existing canonical hook');
assert.equal(deriveActiveThreads({saveState:materialized}).some((row)=>row.id==='hook:personal:origin-candidate-1'),true,'the existing hook lifecycle must become the active continuity authority');

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
const routed=routeOpenAIParams(
  {instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},
  {incoming:{action:'북부에서 온 학생과 고향 이야기를 나눈다.',saveState:{...baseSave,sceneRuntime:{participants:['guide']}},recentTurns:[]},mode:'game'},
);
assert.doesNotMatch(routed.params.input,/===== PERSONAL STORY HOOKS V1 =====|PC_ORIGIN_PLOT/,'dormant candidates must remain internal instead of becoming a prose plan');
assert.match(routed.params.input,/"public_background":\[/,'only public canonical origin facts may enter the Thin Scene Packet');
assert.equal(routed.telemetry.personal_story_v1?.candidate_count,3,'router telemetry must expose only the bounded candidate count');
for(const hidden of commoner.creation.fateStart.personalStory.hooks.filter((row)=>['PRIVATE','SECRET'].includes(row.visibility))){
  assert.equal(routed.params.input.includes(hidden.premise),false,'hidden Origin information leaked through personal-story routing');
}
assert.ok(routed.params.input.length<=9000,`personal story routing exceeded the stable routine budget: ${routed.params.input.length}`);

const moduleSource=readFileSync('lib/fate-personal-story.js','utf8');
const routerSource=readFileSync('api/lib/context-router.js','utf8');
const coreSource=readFileSync('api/chat-router.js','utf8');
assert.doesNotMatch(`${moduleSource}\n${routerSource}`,/responses\.create|chat\.completions|new OpenAI/,'P2-PR04 must not add a model call');
assert.equal((coreSource.match(/=>coreHandler\(/g)||[]).length,1,'the adapter must keep one canonical core call');
assert.doesNotMatch(`${moduleSource}\n${routerSource}`,/saveState\.(?:personalStory|activeThreads)\s*=/,'P2-PR04 must not add a parallel save root');
assert.match(moduleSource,/semantic relevance/,'semantic narrative selection must remain delegated to the AI');

console.log('personal-story-hooks: PASS');
