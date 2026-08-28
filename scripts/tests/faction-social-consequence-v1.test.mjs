#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  compactFactionSocialForContext,
  compactFactionSocialTelemetry,
  deriveFactionSocialState,
  FACTION_KEYS,
  factionReputationChangeIsReal,
  normalizeFactionSocial,
} from '../../lib/faction-social-consequence.js';
import { deriveSceneDelta } from '../../lib/scene-momentum.js';

const chat=readFileSync('api/chat.js','utf8');
const router=readFileSync('api/chat-router.js','utf8');
const runtime=readFileSync('app-runtime.js','utf8');
const health=readFileSync('api/health.js','utf8');

assert.match(chat,/const FactionReputationChange = z\.object\(/,'canonical schema must define faction reputation changes');
assert.match(chat,/faction_reputation_changes: z\.array\(FactionReputationChange\)\.max\(4\)/,'canonical state delta must bound faction reputation changes');
assert.match(chat,/source: z\.string\(\)\.max\(120\)\.nullable\(\)/,'faction schema must carry bounded evidence provenance');
assert.match(chat,/공개 사건·공식 기록·등록 NPC의 실제 목격·출처 있는 소문/,'canonical prompt must require social evidence');
assert.match(chat,/credible_rumor에는 실제 출처나 전달 경로를 source에 적는다/,'canonical prompt must require explicit rumor provenance');
assert.match(chat,/집단 평판은 개인 NPC 관계나 NPC 간 관계를 자동 변경하지 않는다/,'faction reputation must stay separate from personal relationships');
assert.match(router,/faction_reputation_changes:\[\]/,'CONTINUE freeze must clear faction reputation changes');
assert.match(router,/deriveFactionSocialState\(\{/,'stable router must derive bounded faction state from accepted changes');
assert.match(router,/faction_social:factionSocialTelemetry/,'pipeline telemetry must not duplicate full faction runtime state');
assert.match(runtime,/faction_reputation_changes: \[\]/,'client-side frozen delta must clear faction reputation changes');
assert.match(runtime,/save\.sceneRuntime = \{ \.\.\.\(save\.sceneRuntime \|\| \{\}\), \.\.\.runtime\.scene_runtime \}/,'client runtime must persist server-derived faction state through the existing scene runtime merge');
assert.match(health,/factionSocialConsequence:/,'health response must advertise Faction Social Consequence V1');
assert.equal((router.match(/coreHandler\(/g)||[]).length,1,'Faction Social Consequence V1 must preserve one canonical core call site');

const registered=['anastasia','lucia','elise','artemis'];
const first=deriveFactionSocialState({
  previous:{},turnNumber:5,sourceEvent:'public_duel',registeredNpcKeys:registered,
  changes:[
    {faction_key:'student_council',reputation_delta:4,stance:'관심',evidence_type:'witnessed_action',observer_npc_keys:['anastasia'],reason:'아나스타샤가 공식 대련의 규칙 준수를 직접 목격했다.'},
    {faction_key:'white_rose',reputation_delta:-3,stance:'경계',evidence_type:'credible_rumor',observer_npc_keys:['lucia'],source:'엘리제의 공개 대련 기록 전달',reason:'루시아에게 출처가 확인된 결투 소문이 전달됐다.'},
  ],
});
assert.equal(first.reputations.student_council.reputation,4,'witnessed public behavior must update the addressed faction only');
assert.equal(first.reputations.student_council.stance,'관심','explicit faction stance must persist');
assert.deepEqual(first.reputations.student_council.history[0].observer_npc_keys,['anastasia'],'registered observers must remain bounded causal evidence');
assert.equal(first.reputations.white_rose.reputation,-3,'different factions may interpret the same public event with different polarity');
assert.equal(first.reputations.white_rose.history[0].source,'엘리제의 공개 대련 기록 전달','credible rumor history must retain bounded provenance');

const privateRejected=deriveFactionSocialState({
  previous:first,turnNumber:6,registeredNpcKeys:registered,
  changes:[{faction_key:'student_council',reputation_delta:8,stance:'호의',evidence_type:'witnessed_action',observer_npc_keys:[],reason:'아무도 보지 않은 사적 행동'}],
});
assert.deepEqual(privateRejected,first,'unwitnessed private behavior must not propagate to a faction');

const badRumorRejected=deriveFactionSocialState({
  previous:first,turnNumber:6,registeredNpcKeys:registered,
  changes:[{faction_key:'white_rose',reputation_delta:5,stance:null,evidence_type:'credible_rumor',observer_npc_keys:['unknown'],source:'익명 게시판',reason:'등록되지 않은 전달자'}],
});
assert.deepEqual(badRumorRejected,first,'a rumor without a registered receiving witness must not change faction reputation');

const sourcelessRumorRejected=deriveFactionSocialState({
  previous:first,turnNumber:6,registeredNpcKeys:registered,
  changes:[{faction_key:'white_rose',reputation_delta:5,stance:null,evidence_type:'credible_rumor',observer_npc_keys:['lucia'],source:null,reason:'사람들이 그랬다는 출처 없는 소문'}],
});
assert.deepEqual(sourcelessRumorRejected,first,'a credible rumor must identify its actual source or transmission path');

const official=deriveFactionSocialState({
  previous:first,turnNumber:6,sourceEvent:'discipline_record',registeredNpcKeys:registered,
  changes:[{faction_key:'blue_knights',reputation_delta:-6,stance:'감시',evidence_type:'official_record',observer_npc_keys:[],reason:'공식 징계 기록이 접수됐다.'}],
});
assert.equal(official.reputations.blue_knights.reputation,-6,'an authoritative official record may update a faction without a named witness');

let bounded={version:'1.0',reputations:{student_council:{reputation:99,stance:'호의',updated_turn:1,history:Array.from({length:8},(_,index)=>({turn:index+1,reputation_delta:1,stance:null,evidence_type:'public_event',observer_npc_keys:[],reason:`old-${index+1}`}))}}};
bounded=deriveFactionSocialState({previous:bounded,turnNumber:10,changes:[{faction_key:'student_council',reputation_delta:10,stance:'우호',evidence_type:'public_event',observer_npc_keys:[],reason:'공개 표창'}]});
assert.equal(bounded.reputations.student_council.reputation,100,'faction reputation must clamp at 100');
assert.equal(bounded.reputations.student_council.history.length,8,'faction causal history must stay bounded');
assert.equal(bounded.reputations.student_council.history.at(-1).reason,'공개 표창','latest bounded history must retain the new cause');

const taintedHistory=normalizeFactionSocial({reputations:{student_council:{reputation:3,history:[
  {turn:1,reputation_delta:3,evidence_type:'invented_evidence',observer_npc_keys:[],reason:'잘못된 증거 유형'},
  {turn:2,reputation_delta:1,evidence_type:'witnessed_action',observer_npc_keys:[],reason:'목격자 없는 목격 기록'},
  {turn:2,reputation_delta:1,evidence_type:'credible_rumor',observer_npc_keys:['lucia'],source:null,reason:'출처 없는 소문 기록'},
  {turn:3,reputation_delta:1,evidence_type:'official_record',observer_npc_keys:[],reason:'유효한 공식 기록'},
]}}});
assert.deepEqual(taintedHistory.reputations.student_council.history.map((row)=>row.reason),['유효한 공식 기록'],'invalid or unsupported saved evidence must be dropped rather than relabeled as public evidence');

const staleObserverHistory=normalizeFactionSocial({reputations:{white_rose:{reputation:2,history:[
  {turn:1,reputation_delta:1,evidence_type:'witnessed_action',observer_npc_keys:['removed_npc'],reason:'삭제된 NPC만 목격한 기록'},
  {turn:2,reputation_delta:1,evidence_type:'credible_rumor',observer_npc_keys:['lucia','removed_npc'],source:'엘리제의 전달',reason:'등록 NPC에게 전달된 기록'},
  {turn:3,reputation_delta:1,evidence_type:'official_record',observer_npc_keys:['removed_npc'],reason:'공식 기록'},
]}}},{registeredNpcKeys:registered});
assert.deepEqual(staleObserverHistory.reputations.white_rose.history.map((row)=>row.reason),['등록 NPC에게 전달된 기록','공식 기록'],'saved evidence that requires a witness must drop rows left without a registered observer');
assert.deepEqual(staleObserverHistory.reputations.white_rose.history.flatMap((row)=>row.observer_npc_keys),['lucia'],'stale or malformed observer keys must not survive save normalization');

const noOp=deriveFactionSocialState({previous:bounded,turnNumber:11,changes:[{faction_key:'student_council',reputation_delta:0,stance:'우호',evidence_type:'public_event',observer_npc_keys:[],reason:'동일 상태 재출력'}]});
assert.deepEqual(noOp,bounded,'same-stance zero-delta rows must not append false social history');
const invalid=deriveFactionSocialState({previous:bounded,turnNumber:11,changes:[{faction_key:'invented_faction',reputation_delta:10,stance:'우호',evidence_type:'public_event',observer_npc_keys:[],reason:'미등록 조직'}]});
assert.deepEqual(invalid,bounded,'unregistered factions must be rejected');
assert.ok(Object.keys(normalizeFactionSocial({reputations:Object.fromEntries([...FACTION_KEYS,'invented'].map((key,index)=>[key,{reputation:index,updated_turn:index}]))}).reputations).length<=8,'stored faction rows must remain bounded');

const compact=compactFactionSocialForContext({reputations:{
  student_council:{reputation:5,stance:'관심',updated_turn:50,history:Array.from({length:5},(_,index)=>({turn:index,reason:`council-${index}`,evidence_type:'public_event'}))},
  white_rose:{reputation:-2,stance:'경계',updated_turn:2,history:Array.from({length:4},(_,index)=>({turn:index,reason:`rose-${index}`,evidence_type:'public_event'}))},
  blue_knights:{reputation:1,stance:'중립',updated_turn:40,history:[]},
  knight_department:{reputation:1,stance:'중립',updated_turn:30,history:[]},
}},{text:'계속 그 평판을 확인한다.',recentTexts:['그 전에는 학생회 평판을 확인했다.','직전 턴에는 백장미회 평판을 확인했다.'],keywords:['student_council','white_rose','blue_knights','knight_department'],maxFactions:3,historyLimit:2});
assert.ok(compact.reputations.white_rose,'an explicitly relevant faction must survive context selection even when older');
assert.equal(Object.keys(compact.reputations).length,3,'routed faction context must stay bounded');
assert.equal(compact.reputations.white_rose.history.length,2,'routed faction history must keep only the latest causal rows');

const compactTelemetry=compactFactionSocialTelemetry(official,first);
assert.deepEqual(compactTelemetry.changed_faction_keys,['blue_knights'],'telemetry must report only faction rows that differ in the accepted final state');
assert.ok(compactTelemetry.faction_keys.includes('student_council'),'telemetry may retain bounded faction identifiers');
assert.doesNotMatch(JSON.stringify(compactTelemetry),/history|reason|observer_npc_keys|reputation/,'telemetry must not duplicate authoritative faction values or causal history');
assert.deepEqual(compactFactionSocialTelemetry(first,first).changed_faction_keys,[],'rejected or no-op model rows cannot appear as accepted telemetry changes');

const saveState={sceneRuntime:{faction_social:first},relationships:{anastasia:{affinity:7}},npcInnerStates:{lucia:{npc_relationships:{elise:{affinity:9}}}}};
const personalBefore=JSON.stringify({relationships:saveState.relationships,npcInnerStates:saveState.npcInnerStates});
deriveFactionSocialState({previous:saveState.sceneRuntime.faction_social,turnNumber:7,changes:[{faction_key:'student_council',reputation_delta:1,stance:null,evidence_type:'public_event',observer_npc_keys:[],reason:'공개 행사'}]});
assert.equal(JSON.stringify({relationships:saveState.relationships,npcInnerStates:saveState.npcInnerStates}),personalBefore,'faction updates must not mutate PC/NPC or NPC/NPC relationships');

assert.equal(factionReputationChangeIsReal(saveState,{faction_key:'student_council',reputation_delta:0,stance:'관심',evidence_type:'public_event',observer_npc_keys:[],reason:'같은 태도'}),false,'same faction stance must not fake a Scene Delta');
const factionDelta=deriveSceneDelta({saveState,turn:{choices:[],scene:[],state_delta:{faction_reputation_changes:[{faction_key:'student_council',reputation_delta:1,stance:null,evidence_type:'public_event',observer_npc_keys:[],reason:'공개 행사'}]}}});
assert.equal(factionDelta.flags.relationshipChanged,true,'a real faction reputation mutation must count on the social relationship axis');
assert.equal(factionDelta.structuralScore,1,'one faction reputation mutation must count exactly once');

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
anastasia=아나스타샤, lucia=루시아, elise=엘리제
===== WORLD CANON =====
${divider}
PUBLIC ACADEMY
${divider}
Public facts.
===== NPC CANON =====
${divider}
루시아
${divider}
루시아 canon.
===== NPC SPEECH =====
${divider}
루시아
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
  {incoming:{action:'백장미회가 나를 어떻게 보는지 루시아에게 묻는다.',saveState:{turnNumber:10,world:{location:'academy'},sceneRuntime:{participants:['lucia'],faction_social:{reputations:{student_council:{reputation:9,stance:'관심',updated_turn:99,history:[]},white_rose:{reputation:-2,stance:'경계',updated_turn:2,history:[{turn:2,reputation_delta:-2,evidence_type:'credible_rumor',observer_npc_keys:['lucia'],source:'엘리제의 전달',reason:'전달된 소문'}]},blue_knights:{reputation:3,stance:'중립',updated_turn:80,history:[]},knight_department:{reputation:2,stance:'중립',updated_turn:70,history:[]}}}},npcInnerStates:{}},recentTurns:[]},mode:'game'},
);
assert.match(routed.params.input,/"white_rose":\{"reputation":-2,"stance":"경계"/,'relevant faction reputation must reach authoritative routed context');
assert.match(routed.params.instructions,/관계·NPC 간 관계·조직 평판·소문[^\n]*직접 근거[^\n]*서로 자동 전이하지 않는다/,'the consolidated hard contract must preserve evidence and cross-system boundaries');
assert.match(routed.params.input,/"evidence_type":"credible_rumor"/,'the causal reputation evidence must remain available as data');

const denseFactionState={reputations:Object.fromEntries(FACTION_KEYS.map((key,index)=>[key,{
  reputation:index+1,stance:'관심',updated_turn:100-index,
  history:Array.from({length:8},(_,historyIndex)=>({turn:historyIndex+1,reputation_delta:1,evidence_type:'public_event',observer_npc_keys:['removed_npc'],reason:`${key}-${historyIndex}-${'긴 근거 '.repeat(80)}`})),
}]))};
const denseRouted=routeOpenAIParams(
  {instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},
  {incoming:{action:`백장미회의 오래된 평판을 확인한다. ${'긴 행동 '.repeat(1200)}`,saveState:{turnNumber:11,world:{location:'academy'},sceneRuntime:{participants:['lucia'],faction_social:denseFactionState},npcInnerStates:{},routerFeedback:{routerVersion:'1.5.6-hf1',profile:'routine-17k-v154',lastInputTokens:100000}},recentTurns:[]},mode:'game'},
);
assert.equal(denseRouted.telemetry.adaptive_scale,.76,'dense faction fixture must exercise minimum adaptive routing scale');
assert.ok(denseRouted.params.input.length<=6840,`dense faction input exceeded adaptive routine budget: ${denseRouted.params.input.length}`);
const minimumText=denseRouted.params.input.split('===== AUTHORITATIVE SAVE_STATE (ROUTED MINIMUM) =====\n')[1].split('\n\n=====')[0];
const minimumFactionSocial=JSON.parse(minimumText).sceneRuntime.faction_social;
assert.ok(minimumFactionSocial.reputations.white_rose,'explicitly relevant faction must survive the mandatory minimum block');
assert.ok(Object.keys(minimumFactionSocial.reputations).length<=2,'mandatory minimum must include at most two relevant factions');
assert.ok(Object.values(minimumFactionSocial.reputations).every((row)=>row.history.length<=1),'mandatory minimum must include at most one causal row per faction');
assert.doesNotMatch(JSON.stringify(minimumFactionSocial),/removed_npc/,'routed faction context must remove stale observer keys');

const indirectRouted=routeOpenAIParams(
  {instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},
  {incoming:{action:'계속 그 평판을 확인한다.',proReasoning:true,saveState:{turnNumber:12,world:{location:'academy'},sceneRuntime:{participants:['lucia'],faction_social:denseFactionState},npcInnerStates:{}},recentTurns:[
    {action:'학생회의 평판을 확인한다.',summary:'학생회의 태도를 확인했다.',scene:[]},
    {action:'청기사단의 평판을 확인한다.',summary:'청기사단의 태도를 확인했다.',scene:[]},
    {action:'백장미회의 오래된 평판을 확인한다.',summary:'가장 최근에 백장미회의 태도를 물었다.',scene:[]},
  ]},mode:'game'},
);
const indirectMinimumText=indirectRouted.params.input.split('===== AUTHORITATIVE SAVE_STATE (ROUTED MINIMUM) =====\n')[1].split('\n\n=====')[0];
assert.ok(JSON.parse(indirectMinimumText).sceneRuntime.faction_social.reputations.white_rose,'most recently discussed older faction must survive an indirect important-turn follow-up despite two newer stored factions and broad save keywords');

console.log('PASS Faction / Social Consequence V1 schema, evidence, bounds, routing, freeze, and momentum regressions');
