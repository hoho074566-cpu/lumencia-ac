#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  NARRATIVE_TIME_POLICY_VERSION,
  buildNarrativeTimePolicyDirective,
  buildSceneMomentumDirective,
  classifySceneIntent,
} from '../../lib/scene-momentum.js';

assert.equal(NARRATIVE_TIME_POLICY_VERSION,'1.0');

const policy=buildNarrativeTimePolicyDirective();
assert.match(policy,/NARRATIVE-FIRST \/ CLOCK-SECOND/,'narrative progression must own pacing while the clock remains internal authority');
assert.match(policy,/TIME_GUIDE·advance_minutes·내부 minute 값.*내부 authority/,'minute arithmetic remains available to deterministic validation');
assert.match(policy,/일반 narration\/dialogue에 절대 minute counter나 “N분 경과\/소요” 형식의 디버그 보고로 옮기지 않는다/,'ordinary prose must not expose raw elapsed-time diagnostics');
assert.match(policy,/정확한 시각\/남은 시간은 필수 일정·약속·deadline·위험 제한시간·중요 이벤트·사용자의 직접 시간 질문\/명시 시각/,'exact time remains available when it has gameplay relevance');
assert.match(policy,/단순 clock tick은 STOP 사유가 아니다/,'clock ticks cannot become player stop points');
assert.match(policy,/긴 downtime.*의미 있는 beat 중심으로 압축/,'long durations must be compressed rather than minute-simulated');
assert.match(policy,/일정, consequence, NPC initiative, 관계\/성장, world event를 건너뛰지 않는다/,'compression cannot skip meaningful world changes');
assert.match(policy,/같은 canonical 응답.*추가 model call은 없다/,'natural elapsed-time judgment must remain inside the one canonical call');

const policySource=buildNarrativeTimePolicyDirective.toString();
assert.doesNotMatch(policySource,/new RegExp|\.test\(/,'Narrative Time Policy must not become another natural-language parser');

const explicitTraining=classifySceneIntent('30분 정도 훈련한다',{currentDate:'1285-03-01',currentTime:'09:00'});
assert.equal(explicitTraining.explicitDurationMinutes,30,'existing explicit-duration arithmetic remains authoritative behind narrative prose');
const scheduleDirective=buildSceneMomentumDirective({action:'한 시간 훈련한다',saveState:{world:{date:'1285-03-01',time:'09:50',location:'훈련장'},scheduleContext:{due:[],upcoming:[{id:'class:10',title:'필수 수업',date:'1285-03-01',time:'10:00',importance:5}]}}});
assert.match(scheduleDirective,/SCHEDULE_BOUNDARY=10min/,'Narrative Time Policy cannot weaken a required schedule hard boundary');
const longTraining=classifySceneIntent('일주일 동안 수련한다',{currentDate:'1285-03-01',currentTime:'09:00'});
assert.equal(longTraining.turnLimitTruncated,true,'existing one-turn safety cap remains authoritative for long compression');
assert.match(buildSceneMomentumDirective({action:'지금 몇 시야?',saveState:{world:{date:'1285-03-01',time:'13:27'}}}),/QUESTION \/ DELIBERATION 규칙/,'a direct time question remains a same-moment player question');

const continuePolicy=buildNarrativeTimePolicyDirective({mode:'continue'});
assert.match(continuePolicy,/CONTINUE FREEZE/);
assert.match(continuePolicy,/내부 clock, 날짜, 일정, consequence, 행동 진행을 새로 움직이지 않고/,'CONTINUE must freeze all time authority');

const router=readFileSync('api/lib/context-router.js','utf8');
const chat=readFileSync('api/chat.js','utf8');
assert.match(router,/buildNarrativeTimePolicyDirective/,'Context Router must inject Narrative Time Policy into the canonical call');
assert.equal((chat.match(/client\.responses\.parse\s*\(/g)||[]).length,1,'Narrative Time Policy must not add a model call');

const divider='='.repeat(20),instructions=`===== CHARACTER REGISTRY =====
guide=Guide
===== WORLD CANON =====
${divider}
PUBLIC ACADEMY
${divider}
Public location facts.
===== NPC CANON =====
${divider}
Guide
${divider}
Helpful guide.
===== NPC SPEECH =====
${divider}
Guide
${divider}
Brief speech.
===== OPTIONAL ADULT / INTIMACY SPEECH LAYER =====
None.
===== PC SYSTEM =====
${divider}
PC ACTION RULES
${divider}
Resolve declared actions.`;
const baseParams={instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'};
const routed=routeOpenAIParams(baseParams,{incoming:{action:'한 시간 훈련한다',saveState:{turnNumber:1,world:{date:'1285-03-01',time:'09:50',location:'훈련장'},scheduleContext:{due:[],upcoming:[{id:'class:10',title:'필수 수업',date:'1285-03-01',time:'10:00',importance:5}]}},recentTurns:[]},mode:'game'});
assert.match(routed.params.instructions,/NARRATIVE TIME POLICY V1 — NARRATIVE-FIRST \/ CLOCK-SECOND/,'Context Router must put the policy in the routed instruction layer without consuming USER ACTION budget');
assert.match(routed.params.input,/SCHEDULE_BOUNDARY=10min/,'the existing hard-boundary instruction must remain in routed input');
const continued=routeOpenAIParams(baseParams,{incoming:{action:'[LUMENSIA V1.5.6 CONTINUE]\n같은 순간을 이어 쓴다.',saveState:{},recentTurns:[]},mode:'continue'});
assert.match(continued.params.instructions,/NARRATIVE TIME POLICY V1 — CONTINUE FREEZE/,'CONTINUE routing must receive the frozen policy variant');

console.log('PASS Narrative Time Policy V1 narrative-first prose, hard-boundary, compression, freeze, and one-call contract');
