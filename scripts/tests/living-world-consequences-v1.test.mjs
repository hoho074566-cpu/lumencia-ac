#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  LIVING_WORLD_CONSEQUENCES_VERSION,
  buildLivingWorldDirective,
  compactLivingWorldContext,
} from '../../lib/living-world-consequences.js';

const registry = { artemis:'아르테미스', emily:'에밀리', chloe:'클로에', lucia:'루시아' };
const saveState = {
  version:6, turnNumber:24,
  world:{ date:'1285-03-05', time:'16:20', location:'중앙광장' },
  pc:{ name:'카인', department:'기사과 1학년', skills:{}, skillCandidates:{} },
  sceneRuntime:{
    participants:['artemis','emily'],
    faction_social:{ reputations:{
      student_council:{ reputation:6, stance:'주의 깊은 관심', updated_turn:23, history:[{ turn:23, reason:'공개 대련에서 규칙과 약속을 지킨 기록', evidence_type:'public_event', observer_npc_keys:['lucia'] }] },
    } },
  },
  relationships:{ chloe:{ affinity:18, trust:15, status:'먼 곳에서도 소식을 확인하는 동료' } },
  npcStates:{
    chloe:{ location:'마법과 연구동', status:'공개 연구 발표를 마침' },
    lucia:{ location:'학생회실', status:'공식 대련 기록 검토 중' },
  },
  npcInnerStates:{
    artemis:{
      active_goal:{ desire:'훈련 규율을 지키면서 카인의 기량을 검증한다.', state:'active', target_type:'pc', target_key:'pc', priority:8, urgency:7, obstacle:'에밀리는 즉시 실전 투입을 원한다.', next_actions:['재현 훈련을 요구한다.'] },
      npc_relationships:{ emily:{ affinity:-4, trust:2, status:'방법론 경쟁', reason:'훈련 속도에 대한 견해가 다르다.' } },
    },
    emily:{ active_goal:{ desire:'카인을 즉시 공개 실전 평가에 투입한다.', state:'active', target_type:'pc', target_key:'pc', priority:8, urgency:8, obstacle:'아르테미스의 단계적 검증', next_actions:['공개 평가를 제안한다.'] } },
    chloe:{ active_goal:{ desire:'연구 발표 결과를 카인에게 직접 전한다.', state:'active', target_type:'pc', target_key:'pc', priority:6, urgency:4 } },
  },
  memories:{ global:[
    { id:'public-duel', type:'event', fact:'카인이 공개 대련에서 규칙을 지키고 상대를 보호했다.', importance:4, turn:18, source:'공식 대련 기록' },
    { id:'old-promise', type:'promise', fact:'클로에가 연구 발표 뒤 결과를 직접 전하겠다고 약속했다.', importance:4, turn:19, source:'직접 대화' },
    { id:'hidden-setup', type:'fact', fact:'일반 턴에 노출되면 안 되는 L4 비밀 setup', importance:5, turn:20, secret_level:4 },
    { type:'belief', fact:'세계의 객관 사실이 아닌 개인 해석', importance:5, turn:22 },
  ], npc:{} },
  hooks:[
    { id:'research-return', title:'클로에의 연구 발표 결과 확인', status:'open', importance:3, createdTurn:19 },
    {
      id:'consequence:public-duel', title:'학생회의 공개 대련 후속 통지', kind:'other', status:'open', importance:4,
      event_consequence:{
        version:'1.0', event_name:'학생회의 공개 대련 후속 통지', target_bucket:'active', reason:'공식 대련 기록', secret_level:0,
        due_at:'1285-03-05T17:00', expires_at:'1285-03-08T17:00', created_turn:23, source_event:'public-duel', fingerprint:'public-duel-record',
      },
    },
  ],
  activeEvents:[], completedEvents:[], worldArcs:[], scheduledEvents:[],
  scheduleContext:{ due:[], upcoming:[{ id:'research-report', title:'연구 발표 결과 공유', participants:['chloe'], date:'1285-03-05', time:'17:30' }] },
  director:{ callbacks:[] },
  backgroundDigest:'[OFFSCREEN 1285-03-05 16:00] chloe: 마법과 공개 연구 발표 종료 확정',
};
const activeThreads = [
  { id:'hook:research-return', kind:'open-hook', status:'open', title:'클로에의 연구 발표 결과 확인' },
  { id:'schedule:research-report', kind:'upcoming-schedule', status:'upcoming', title:'연구 발표 결과 공유', background:true },
];

const context = compactLivingWorldContext({ saveState, candidateKeys:['artemis','emily'], registry, activeThreads, mode:'game' });
assert.equal(context.version, LIVING_WORLD_CONSEQUENCES_VERSION);
assert.equal(context.mode, 'semantic');
assert.deepEqual(context.present_npcs.map((row) => row.npc_key), ['artemis','emily']);
assert.deepEqual(context.interaction_pairs.map((row) => [row.a,row.b]), [['artemis','emily']], 'every present NPC pair must remain available for NPC-to-NPC interaction');
assert.equal(context.interaction_pairs[0].a_to_b.status, '방법론 경쟁');
assert.deepEqual(context.goal_rows.filter((row) => row.present).map((row) => row.npc_key), ['emily','artemis'], 'the model must receive both present goals and judge conflict semantically');
assert.ok(context.offscreen_priority.some((row) => row.npc_key === 'chloe' && row.reasons.includes('active-thread')), 'Active Thread NPCs must outrank full off-screen simulation');
assert.ok(context.offscreen_priority.some((row) => row.npc_key === 'lucia' && row.reasons.includes('faction-witness')), 'registered faction witnesses remain bounded world-consequence candidates');
assert.match(JSON.stringify(context.offscreen_priority), /공개 연구 발표를 마침/, 'a returning off-screen NPC must retain the bounded existing change');
assert.ok(context.setup_anchors.some((row) => row.fact.includes('공개 대련')), 'a public major action must remain a cross-scene setup anchor');
assert.ok(context.setup_anchors.some((row) => row.fact.includes('연구 발표 뒤 결과')), 'past promises may be reused without creating a new payoff ledger');
assert.doesNotMatch(JSON.stringify(context.setup_anchors), /객관 사실이 아닌 개인 해석/, 'unsupported BELIEF rows must not become global setup authority');
assert.doesNotMatch(JSON.stringify(context.setup_anchors), /L4 비밀 setup/, 'ordinary routing must not bypass Context Router secret access');
assert.equal(context.factions[0].key, 'student_council');
assert.equal(context.pending_consequences[0].event, '학생회의 공개 대련 후속 통지');
assert.match(context.public_world_trace, /연구 발표 종료 확정/);
const tailContext = compactLivingWorldContext({ ...{ saveState:{...saveState,backgroundDigest:`${'오래된 공개 기록 '.repeat(40)}\n[OFFSCREEN 1285-03-05 16:10] chloe: 최신 연구 결과 종료 확정`}, candidateKeys:['chloe'], registry, activeThreads, mode:'game' } });
assert.match(tailContext.public_world_trace, /최신 연구 결과 종료 확정/, 'the bounded world trace must retain the newest off-screen result');
const secretContext = compactLivingWorldContext({ saveState, candidateKeys:['artemis'], registry, activeThreads, mode:'game', allowSecrets:true });
assert.match(JSON.stringify(secretContext.setup_anchors), /L4 비밀 setup/, 'an already-authorized secret turn may reuse an authoritative hidden setup');

const directive = buildLivingWorldDirective({ context });
assert.match(directive, /NPC↔PC뿐 아니라 NPC↔NPC/);
assert.match(directive, /실제로 충돌하는지는 AI가 판단/);
assert.match(directive, /offscreen_priority만 우선 검토/);
assert.match(directive, /Action→실제 Witness\/공식 기록→개별 Reaction/);
assert.match(directive, /severity·visibility·duration·decay·affected NPC\/faction/);
assert.match(directive, /PR #66의 별도 lifecycle을 재현하지 않는다/);
assert.match(directive, /FAIL FORWARD/);
assert.match(directive, /generic quest lifecycle/);
assert.ok(directive.length <= 3600, `living-world directive exceeded its bound: ${directive.length}`);

const frozen = compactLivingWorldContext({ saveState, candidateKeys:['artemis'], registry, activeThreads, mode:'continue' });
assert.equal(frozen.mode, 'freeze');
assert.deepEqual(frozen.goal_rows, []);
assert.equal(buildLivingWorldDirective({ context:frozen }), '', 'CONTINUE must not advance off-screen world state or consequences');
const guardOnly = compactLivingWorldContext({ saveState:{sceneRuntime:{participants:['artemis']}}, candidateKeys:['artemis'], registry, activeThreads:[], mode:'game' });
assert.equal(guardOnly.mode, 'guard-only');
assert.equal(buildLivingWorldDirective({ context:guardOnly }), '', 'one ordinary present NPC with no world signal must not displace older routed contracts');

const divider = '='.repeat(20);
const instructions = `===== CHARACTER REGISTRY =====
artemis=아르테미스, emily=에밀리, chloe=클로에, lucia=루시아
===== WORLD CANON =====
${divider}
PUBLIC
${divider}
Public academy facts.
===== NPC CANON =====
${divider}
NPC RULES
${divider}
Canon.
===== NPC SPEECH =====
${divider}
NPC SPEECH
${divider}
Speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
Resolve.`;
const routed = routeOpenAIParams(
  { instructions, input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}' },
  { incoming:{ action:'아르테미스와 에밀리가 내 공개 기록을 두고 서로 다른 평가를 내리는 것을 지켜본다.', saveState, recentTurns:[] }, mode:'game' },
);
assert.equal(routed.telemetry.living_world_consequences_v1.version, LIVING_WORLD_CONSEQUENCES_VERSION);
assert.equal(routed.telemetry.living_world_consequences_v1.present_count, 2);
assert.ok(routed.telemetry.living_world_consequences_v1.offscreen_count <= 4);
assert.match(routed.params.instructions, /같은 장면의 NPC는 PC에게만 차례로 반응하지 않고/);
assert.match(routed.params.instructions, /공개적인 큰 행동의 후폭풍/);
assert.match(routed.params.input, /===== LIVING WORLD \+ CONSEQUENCES V1 =====/);
assert.match(routed.params.input, /카인이 공개 대련에서 규칙을 지키고 상대를 보호했다/);
assert.match(routed.params.input, /마법과 공개 연구 발표 종료 확정/);
assert.match(routed.params.input, /delayed_consequences_add/);
assert.ok(routed.params.input.length <= 9000, `P2-PR07 exceeded the routine input budget: ${routed.params.input.length}`);

const moduleSource = readFileSync('lib/living-world-consequences.js', 'utf8');
const routerSource = readFileSync('api/lib/context-router.js', 'utf8');
const adapterSource = readFileSync('api/chat-router.js', 'utf8');
const coreSource = readFileSync('api/chat.js', 'utf8');
const runtimeSource = readFileSync('app-runtime.js', 'utf8');
const appSource = readFileSync('app.js', 'utf8');
const healthSource = readFileSync('api/health.js', 'utf8');
assert.doesNotMatch(`${moduleSource}\n${routerSource}`, /responses\.create|chat\.completions|new OpenAI/, 'P2-PR07 must not add a model call');
assert.equal((adapterSource.match(/coreHandler\(/g) || []).length, 1, 'P2-PR07 must preserve one canonical core call');
assert.doesNotMatch(moduleSource, /saveState\.[a-zA-Z_][a-zA-Z0-9_]*\s*=/, 'P2-PR07 context derivation must stay read-only');
assert.doesNotMatch(`${runtimeSource}\n${appSource}`, /livingWorldConsequences|living_world_consequences/, 'P2-PR07 must not add a save root');
assert.doesNotMatch(moduleSource, /genericQuest|eventSourcing|fullNpcSimulation/i, 'P2-PR07 must not implement a generic quest/event-sourcing/full-NPC engine');
assert.doesNotMatch(`${moduleSource}\n${routerSource}`, /setupPayoff|payoffLedger|resolvedPayoffReceipt/, 'P2-PR07 must not revive deferred PR #66 lifecycle code');
assert.match(coreSource, /D12\. 같은 장면의 NPC는 명시적 퇴장 전까지 참여를 유지/);
assert.match(healthSource, /livingWorldConsequences:/);

console.log('PASS P2-PR07 Living World + Consequences bounded presence, NPC conflict, off-screen priority, consequence chain, setup/payoff, and fail-forward invariants');
