#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import { deriveSceneDelta } from '../../lib/scene-momentum.js';

const chat=readFileSync('api/chat.js','utf8');
const router=readFileSync('api/chat-router.js','utf8');
const runtime=readFileSync('app-runtime.js','utf8');
const health=readFileSync('api/health.js','utf8');

assert.match(chat,/const NpcRelationshipChange = z\.object\(/,'canonical schema must define directional NPC relationship changes');
assert.match(chat,/npc_relationship_changes: z\.array\(NpcRelationshipChange\)\.max\(6\)/,'canonical state delta must bound NPC relationship changes');
assert.match(chat,/source_npc_key[\s\S]*target_npc_key/,'NPC relationship schema must identify both directional endpoints');
assert.match(chat,/relationship_changes는 NPC와 PC 사이[\s\S]*npc_relationship_changes는 NPC가 다른 NPC를 향해/,'canonical prompt must keep PC and NPC relationship fields distinct');
assert.match(router,/npc_relationship_changes:\[\]/,'CONTINUE freeze must clear NPC relationship changes');
assert.match(router,/const stateKeys=\[\.\.\.Object\.keys\(npcRelationshipUpdates\),\.\.\.array\(turn\?\.state_delta\?\.npc_state_updates\)/,'relationship persistence sources must be prioritized inside the bounded runtime update set');
assert.match(runtime,/npc_relationship_changes: \[\]/,'client-side frozen delta must clear NPC relationship changes');
assert.match(runtime,/applyNpcRelationshipDeltaStable\.toString\(\)/,'stable boot patch must inject the client relationship fallback helper');
assert.match(health,/npcRelationship:/,'health response must advertise NPC Relationship V1');

const relationshipStart=router.indexOf('function npcRelationshipRuntimeFor(');
const relationshipEnd=router.indexOf('function relationshipReasonFor(');
assert.ok(relationshipStart>=0&&relationshipEnd>relationshipStart,'NPC relationship runtime source markers missing');
const relationshipSource=router.slice(relationshipStart,relationshipEnd);
const array=(value)=>Array.isArray(value)?value:[];
const object=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const clampText=(value,max=1200)=>String(value??'').slice(0,max);
const bounded=(value,min,max,fallback)=>{
  if(value==null||value==='')return fallback;
  const number=Number(value);
  return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
};
const registry=Object.fromEntries(Array.from({length:20},(_,index)=>[`p${index+1}`,`NPC ${index+1}`]));
const makeRelationshipRuntime=new Function('array','object','clampText','bounded','CHARACTER_REGISTRY',`${relationshipSource};return {npcRelationshipRuntimeFor,localNpcRelationshipUpdates};`);
const {localNpcRelationshipUpdates}=makeRelationshipRuntime(array,object,clampText,bounded,registry);

const clientRelationshipStart=runtime.indexOf('function applyNpcRelationshipDeltaStable(');
const clientRelationshipEnd=runtime.indexOf('function applyRuntimeStateStable(');
assert.ok(clientRelationshipStart>=0&&clientRelationshipEnd>clientRelationshipStart,'client relationship fallback source markers missing');
const clientRelationshipSource=runtime.slice(clientRelationshipStart,clientRelationshipEnd);
const makeClientRelationshipRuntime=new Function('initialSave','ASSETS',`let save=initialSave;const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));${clientRelationshipSource};return{applyNpcRelationshipDeltaStable,getSave:()=>save};`);

const priorHistory=Array.from({length:8},(_,index)=>({turn:index+1,reason:`old-${index+1}`}));
const incoming={saveState:{turnNumber:9,npcInnerStates:{p1:{mood:'차분',npc_relationships:{p2:{affinity:12,trust:-5,status:'경계',reason:'기존 충돌',updated_turn:8,history:priorHistory}}}}}};
const turn={scene_title:'연무장의 신경전',event_progress:null,state_delta:{npc_relationship_changes:[
  {source_npc_key:'p1',target_npc_key:'p2',affinity_delta:3,trust_delta:2,status:'경쟁',reason:'공개 대련에서 실력을 인정했다.'},
  {source_npc_key:'p2',target_npc_key:'p1',affinity_delta:-4,trust_delta:1,status:null,reason:'상대의 도발을 경계했다.'},
  {source_npc_key:'p1',target_npc_key:'p1',affinity_delta:9,trust_delta:9,status:'잘못됨',reason:'자기 자신'},
  {source_npc_key:'unknown',target_npc_key:'p1',affinity_delta:9,trust_delta:9,status:'잘못됨',reason:'미등록'},
  {source_npc_key:'p3',target_npc_key:'p4',affinity_delta:0,trust_delta:0,status:null,reason:'실제 변화 없음'},
]}};
const updates=localNpcRelationshipUpdates(incoming,turn);
assert.equal(updates.p1.npc_relationships.p2.affinity,15,'directional affinity must accumulate from prior state');
assert.equal(updates.p1.npc_relationships.p2.trust,-3,'directional trust must accumulate from prior state');
assert.equal(updates.p1.npc_relationships.p2.status,'경쟁','explicit directional status must replace the prior status');
assert.equal(updates.p1.npc_relationships.p2.updated_turn,10,'directional relationship must record the authoritative next turn');
assert.equal(updates.p1.npc_relationships.p2.history.length,8,'directional relationship history must stay bounded');
assert.equal(updates.p1.npc_relationships.p2.history.at(-1).reason,'공개 대련에서 실력을 인정했다.','latest causal reason must be retained');
assert.equal(updates.p2.npc_relationships.p1.affinity,-4,'the reverse direction must change only when explicitly emitted');
assert.equal(updates.p2.npc_relationships.p1.trust,1,'the reverse direction must keep its own trust value');
assert.equal(updates.p1.npc_relationships.p1,undefined,'self-relationships must be rejected');
assert.equal(updates.unknown,undefined,'unregistered relationship sources must be rejected');
assert.equal(updates.p3,undefined,'zero-delta rows without a status change must not fake relationship progress');

const clientFixture={turnNumber:10,npcInnerStates:{p1:{npc_relationships:{p2:{affinity:12,trust:-5,status:'경계',history:[]}}}}};
const clientFallback=makeClientRelationshipRuntime(clientFixture,{characters:registry});
clientFallback.applyNpcRelationshipDeltaStable(turn,{});
assert.equal(clientFallback.getSave().npcInnerStates.p1.npc_relationships.p2.affinity,15,'client fallback must persist the directional change when the quality runtime is disabled');
const serverFixture={turnNumber:10,npcInnerStates:{p1:{npc_relationships:{p2:{affinity:12,trust:-5,status:'경계',history:[]}}}}};
const serverBacked=makeClientRelationshipRuntime(serverFixture,{characters:registry});
serverBacked.applyNpcRelationshipDeltaStable(turn,{npc_updates:{p1:{npc_relationships:{p2:{affinity:15,trust:-3,status:'경쟁'}}}}});
assert.equal(serverBacked.getSave().npcInnerStates.p1.npc_relationships.p2.affinity,12,'client fallback must not double-apply a server-backed directional update');

const sameStatusUpdates=localNpcRelationshipUpdates(incoming,{scene_title:'같은 상태',state_delta:{npc_relationship_changes:[{source_npc_key:'p1',target_npc_key:'p2',affinity_delta:0,trust_delta:0,status:'경계',reason:'기존 상태 재출력'}]}});
assert.equal(sameStatusUpdates.p1.npc_relationships.p2.history.length,8,'re-emitting the same status must not append a false causal history row');

const clampUpdates=localNpcRelationshipUpdates({saveState:{turnNumber:3,npcInnerStates:{p1:{npc_relationships:{p2:{affinity:99,trust:-99}}}}}},{scene_title:'한계',state_delta:{npc_relationship_changes:[{source_npc_key:'p1',target_npc_key:'p2',affinity_delta:10,trust_delta:-10,status:null,reason:'한계 검증'}]}});
assert.equal(clampUpdates.p1.npc_relationships.p2.affinity,100,'directional affinity must clamp at 100');
assert.equal(clampUpdates.p1.npc_relationships.p2.trust,-100,'directional trust must clamp at -100');

const manyLinks=Object.fromEntries(Array.from({length:17},(_,index)=>[`p${index+2}`,{affinity:index,trust:0,status:'중립',reason:'old',updated_turn:index,history:[]}])) ;
const boundedUpdates=localNpcRelationshipUpdates({saveState:{turnNumber:30,npcInnerStates:{p1:{npc_relationships:manyLinks}}}},{scene_title:'새 접점',state_delta:{npc_relationship_changes:[{source_npc_key:'p1',target_npc_key:'p20',affinity_delta:1,trust_delta:1,status:null,reason:'최근 접점'}]}});
assert.equal(Object.keys(boundedUpdates.p1.npc_relationships).length,16,'each NPC must retain only a bounded directional relationship set');
assert.ok(boundedUpdates.p1.npc_relationships.p20,'the relationship touched this turn must survive bounded eviction');

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
p1=One, p2=Two, p3=Three
===== WORLD CANON =====
${divider}
PUBLIC ACADEMY
${divider}
Public facts.
===== NPC CANON =====
${divider}
One
${divider}
One canon.
${divider}
Two
${divider}
Two canon.
===== NPC SPEECH =====
${divider}
One
${divider}
Brief.
${divider}
Two
${divider}
Brief.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC ACTION RULES
${divider}
Resolve actions.`;
const routed=routeOpenAIParams(
  {instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},
  {incoming:{action:'One과 Two의 대화를 지켜본다.',saveState:{turnNumber:10,world:{location:'academy'},sceneRuntime:{participants:['p1','p2']},npcInnerStates:{p1:{npc_relationships:{p2:{affinity:15,trust:-3,status:'경쟁',reason:'공개 대련',updated_turn:10,history:[{turn:10,reason:'공개 대련'}]},p3:{affinity:70,trust:70,status:'동맹',reason:'현재 무관',updated_turn:99,history:[]}}}}},recentTurns:[]},mode:'game'},
);
assert.match(routed.params.input,/"npc_relationships":\{"p2":\{"affinity":15,"trust":-3,"status":"경쟁"/,'bounded directional relationship state must reach the routed model context');
assert.doesNotMatch(routed.params.input,/"p3":\{"affinity":70/,'relationship links to an unrouted NPC must not enter model context');
assert.match(routed.params.instructions,/공동 장면에 있었다는 이유만으로 관계를 바꾸지 않는다/,'routed prompt must require causal evidence instead of co-presence');

const relationshipDelta=deriveSceneDelta({
  action:'둘의 대화를 지켜본다.',
  turn:{choices:[],scene:[],state_delta:{npc_relationship_changes:[{source_npc_key:'p1',target_npc_key:'p2',affinity_delta:1,trust_delta:0,reason:'협력'}]}},
});
assert.equal(relationshipDelta.flags.relationshipChanged,true,'NPC-to-NPC relationship mutation must count as structural Scene Delta');
assert.equal(relationshipDelta.structuralScore,1,'one NPC relationship axis must count exactly once');

const unchangedRelationshipDelta=deriveSceneDelta({
  action:'둘의 관계를 본다.',
  saveState:{npcInnerStates:{p1:{npc_relationships:{p2:{status:'경쟁'}}}}},
  turn:{choices:[],scene:[],state_delta:{npc_relationship_changes:[{source_npc_key:'p1',target_npc_key:'p2',affinity_delta:0,trust_delta:0,status:'경쟁',reason:'같은 상태'}]}},
});
assert.equal(unchangedRelationshipDelta.flags.relationshipChanged,false,'same-status zero-delta rows must not fake structural Scene Delta');

assert.equal((router.match(/coreHandler\(/g)||[]).length,1,'NPC Relationship V1 must preserve one canonical core call site');

console.log('PASS NPC Relationship V1 schema, persistence, routing, freeze, and momentum regressions');
