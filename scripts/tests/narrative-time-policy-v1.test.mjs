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
assert.match(routed.params.instructions,/let NPCs, time, and the world move naturally/,'the minimal contract must authorize natural time movement');
assert.match(routed.params.instructions,/Compress routine process/,'routine duration must remain compressible');
assert.match(routed.params.input,/"future_time_facts":\[/,'the Writer receives only bounded factual clock constraints');
assert.doesNotMatch(routed.params.input,/SCHEDULE_BOUNDARY|STOP|downtime|completion recipe/,'internal time policy must not become a prose plan');
const continued=routeOpenAIParams(baseParams,{incoming:{action:'[LUMENSIA V1.5.6 CONTINUE]\n같은 순간을 이어 쓴다.',saveState:{},recentTurns:[]},mode:'continue'});
assert.match(continued.params.instructions,/MINIMAL WRITER CONTRACT/);
assert.doesNotMatch(continued.params.input,/SCENE MOMENTUM|CONTINUE HARD FREEZE/,'CONTINUE internals must stay outside Writer prose authority');

console.log('PASS Narrative Time Policy V1 narrative-first prose, hard-boundary, compression, freeze, and one-call contract');
