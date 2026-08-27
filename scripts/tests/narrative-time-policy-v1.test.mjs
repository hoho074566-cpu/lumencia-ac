#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';
import {
  NARRATIVE_TIME_POLICY_VERSION,
  buildSceneMomentumDirective,
  classifySceneIntent,
} from '../../lib/scene-momentum.js';

assert.equal(NARRATIVE_TIME_POLICY_VERSION,'1.0');

const explicitTraining=classifySceneIntent('30분 정도 훈련한다',{currentDate:'1285-03-01',currentTime:'09:00'});
assert.equal(explicitTraining.explicitDurationMinutes,30,'existing explicit-duration arithmetic remains authoritative behind narrative prose');
const scheduleDirective=buildSceneMomentumDirective({action:'한 시간 훈련한다',saveState:{world:{date:'1285-03-01',time:'09:50',location:'훈련장'},scheduleContext:{due:[],upcoming:[{id:'class:10',title:'필수 수업',date:'1285-03-01',time:'10:00',importance:5}]}}});
assert.match(scheduleDirective,/SCHEDULE_BOUNDARY=10min/,'Narrative Time Policy cannot weaken a required schedule hard boundary');
const longTraining=classifySceneIntent('일주일 동안 수련한다',{currentDate:'1285-03-01',currentTime:'09:00'});
assert.equal(longTraining.turnLimitTruncated,true,'existing one-turn safety cap remains authoritative for long compression');
assert.match(buildSceneMomentumDirective({action:'지금 몇 시야?',saveState:{world:{date:'1285-03-01',time:'13:27'}}}),/QUESTION \/ DELIBERATION 규칙/,'a direct time question remains a same-moment player question');

const router=readFileSync('api/lib/context-router.js','utf8');
const chat=readFileSync('api/chat.js','utf8');
assert.doesNotMatch(router,/buildNarrativeTimePolicyDirective/,'Narrative Time Policy must not consume a separate instruction-budget section');
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
assert.match(routed.params.instructions,/NARRATIVE TIME POLICY 1\.0.*서사 우선, clock 보조/,'Context Router must carry Narrative Time Policy inside the existing GM-rule budget');
assert.match(routed.params.instructions,/minute는 일정\/deadline\/consequence\/duration 등 시간 검증용/,'minute arithmetic remains deterministic internal authority');
assert.match(routed.params.instructions,/prose에 raw\/경과분을 보고하지 않는다/,'ordinary prose must not expose raw elapsed-time diagnostics');
assert.match(routed.params.instructions,/시각은 일정·위험·질문\/지정에만 보이며/,'exact time remains available only when gameplay-relevant');
assert.match(routed.params.instructions,/clock tick은 STOP 사유가 아니다/,'clock ticks cannot become player stop points');
assert.match(routed.params.instructions,/downtime은 변화까지 압축/,'long durations must be compressed rather than minute-simulated');
assert.match(routed.params.instructions,/일정·consequence·NPC initiative·관계\/성장·world event는 보존한다/,'compression cannot skip meaningful world changes');
assert.match(routed.params.input,/SCHEDULE_BOUNDARY=10min/,'the existing hard-boundary instruction must remain in routed input');
const continued=routeOpenAIParams(baseParams,{incoming:{action:'[LUMENSIA V1.5.6 CONTINUE]\n같은 순간을 이어 쓴다.',saveState:{},recentTurns:[]},mode:'continue'});
assert.match(continued.params.instructions,/NARRATIVE TIME POLICY 1\.0/,'CONTINUE keeps the same compact narrative-time rule without a second policy section');
assert.match(continued.params.input,/SCENE MOMENTUM V1 — CONTINUE HARD FREEZE/,'CONTINUE must freeze clock, schedule, consequence, and action progress through the existing authority tail');

const policyLines=routed.params.instructions.split('\n').filter(line=>/^(?:9\)|21\)|22\))/.test(line));
assert.equal(policyLines.length,3,'Narrative Time Policy must stay consolidated in the three pre-existing time/compression/STOP rules');
assert.ok(policyLines.reduce((sum,line)=>sum+line.length,0)<=332,'Narrative Time Policy rules must not exceed the legacy rules they replace or displace routed canon/PC SYSTEM');

console.log('PASS Narrative Time Policy V1 narrative-first prose, hard-boundary, compression, freeze, and one-call contract');
