#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
guide=Guide
===== WORLD CANON =====
${divider}
Academy
${divider}
Public facts.
===== NPC CANON =====
${divider}
Guide
${divider}
Helpful.
===== NPC SPEECH =====
${divider}
Guide
${divider}
Brief.
===== PC SYSTEM =====
${divider}
Rules
${divider}
Resolve actions.`;
const originalInput='===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}';

function route(action,{saveState={},recentTurns=[],rollingSummary=''}={}){
  return routeOpenAIParams(
    {instructions,input:originalInput},
    {mode:'game',incoming:{action,recentTurns,rollingSummary,saveState:{turnNumber:8,world:{date:'1285-03-01',time:'08:50',location:'academy'},pc:{name:'Tester'},...saveState}}},
  );
}

const orientation={id:'freshman-orientation',title:'신입생 오리엔테이션',date:'1285-03-01',time:'09:00',location:'대강당',status:'scheduled',importance:4,participants:['guide']};
const wait=route('오티 시작까지 기다린다',{saveState:{scheduledEvents:[orientation],scheduleContext:{due:[],upcoming:[orientation]}}});
assert.equal(wait.telemetry.enabled,true,'Case A must use the routed GAME contract');
assert.match(wait.params.input,/===== NARRATIVE FLAVOR BASELINE =====/);
assert.match(wait.params.input,/COMPLETION=declared-safe-endpoint/);
assert.match(wait.params.input,/첫 실제 beat와 NPC\/세계 반응을 시작/,'Case A must start the scheduled scene, not stop at its threshold');
assert.match(wait.params.input,/도착·시작 직전이나 “곧” 상태에서 같은 의도를 재입력받지 않는다/,'Case A must prohibit pre-endpoint handback');
assert.match(wait.params.input,/"id":"freshman-orientation"/,'Case A must retain the authoritative occurrence');

const unpackAction='기숙사로 가서 짐을 푼다';
const unpack=route(unpackAction);
assert.ok(unpack.params.input.includes(unpackAction),'Case B must retain the complete compound action');
assert.match(unpack.params.input,/충돌하지 않는 긍정형 선언 절은 안전한 명시 endpoint까지 모두 resolve/,'Case B must complete all declared clauses');
assert.match(unpack.params.input,/SPECIFICITY=bounded-autonomy/,'Case B must allow safe intermediate autonomy');

const recentTurns=Array.from({length:3},(_,index)=>({action:`routine-${index}`,summary:'상태는 그대로다. 이제 무엇을 할지 정할 수 있다.',scene:[]}));
const ordinary=route('복도를 따라 걷는다',{recentTurns});
assert.match(ordinary.params.input,/HOOK=world-native-first/,'Case C must prefer a world-native turn hook');
assert.match(ordinary.params.input,/알려진 상태 보고·메타 질문 대신 새 변화/,'Case C must reject status-only/meta handback endings');
assert.match(ordinary.params.input,/실제 PC 판단점이 아니면 choices=\[\]/,'Case C must not manufacture routine choices');

const listenAction='문 앞에만 서서 안쪽 소리를 듣는다';
const listen=route(listenAction);
assert.ok(listen.params.input.includes(listenAction),'Case D must retain the explicit observation boundary');
assert.match(listen.params.input,/장소·행동·관찰 범위와 명시적 금지는 넘지 않는다/,'Case D must preserve the listen-only boundary');
assert.match(listen.params.input,/USER ACTION의 명시 한계가 우선/,'Case D must subordinate autonomy to the explicit limit');

const pressureAction=`${'긴 장면 행동 설명 '.repeat(700)}`.slice(0,5180)+' 오티 시작까지 기다린다';
const pressure=route(pressureAction,{rollingSummary:'old '.repeat(5000),saveState:{scheduledEvents:[orientation],scheduleContext:{due:[],upcoming:[orientation]}}});
assert.ok(pressure.params.input.length<=9000,`routine routed input exceeded its budget: ${pressure.params.input.length}`);
assert.match(pressure.params.input,/===== NARRATIVE FLAVOR BASELINE =====/,'baseline heading must survive context pressure');
assert.match(pressure.params.input,/COMPLETION=declared-safe-endpoint/,'completion contract must survive context pressure');
assert.match(pressure.params.input,/HOOK=world-native-first/,'hook contract must survive context pressure');

const source=readFileSync('api/lib/context-router.js','utf8');
const baselineStart=source.indexOf('const NARRATIVE_FLAVOR_BASELINE');
const baselineEnd=source.indexOf('const COMBAT_RULE',baselineStart);
assert.ok(baselineStart>=0&&baselineEnd>baselineStart,'baseline must be a bounded policy contract');
const baselineSource=source.slice(baselineStart,baselineEnd);
assert.doesNotMatch(baselineSource,/RegExp|_RE\s*=|match\(|test\(/,'baseline must not add wording regexes or a parser');
assert.match(source,/const reservedContext=`===== NARRATIVE FLAVOR BASELINE =====/,'baseline must be reserved before optional context truncation');

console.log('PASS Narrative Flavor Baseline cases A-D + context-pressure reservation');
