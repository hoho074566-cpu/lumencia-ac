#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeOpenAIParams } from '../../api/lib/context-router.js';

const divider='='.repeat(20);
const instructions=`===== CHARACTER REGISTRY =====
lena=레나, artemis=아르테미스
===== WORLD CANON =====
${divider}
ACADEMY FACILITIES
${divider}
[학생 식당]
학생 식당은 점심과 저녁에 운영된다.

[제한구역]
제한구역은 허가 없이 들어갈 수 없다.
ACCESS_RULE_SENTINEL

[기숙사]
기숙사 공용 구역은 정해진 시간에만 사용한다.
DORM_RULE_SENTINEL
===== NPC CANON =====
${divider}
LENA 레나
${divider}
레나는 느긋하지만 관찰력이 좋은 학생이다.
${divider}
ARTEMIS 아르테미스
${divider}
아르테미스는 기사과 평가를 맡는 실무적인 교수다.
===== NPC SPEECH =====
${divider}
LENA SPEECH 레나
${divider}
레나는 짧고 건조하게 말한다.
${divider}
ARTEMIS SPEECH 아르테미스
${divider}
아르테미스는 핵심만 말한다.
===== PC SYSTEM =====
${divider}
PC RULES
${divider}
선택한 행동을 처리한다.`;

function route(action,patch={}){
  return routeOpenAIParams(
    {instructions,input:'===== TURN OPTIONS =====\nnormal\n===== AUTHORITATIVE SAVE_STATE =====\n{}'},
    {incoming:{
      action,
      saveState:{
        turnNumber:12,
        world:{date:'1285-03-08',time:'11:30',location:'학생 식당'},
        pc:{name:'테오 에버른',department:'기사과 1학년'},
        sceneRuntime:{scene_key:'안전 규정 안내',participants:['lena'],ongoing_topic:'레나가 제한구역과 기숙사 규정을 읽고 있다.'},
        scheduleContext:{due:[],upcoming:[]},
        ...patch.saveState,
      },
      recentTurns:[{action:'규정집을 받는다.',summary:'규정 안내가 끝났다.',scene:[{kind:'dialogue',speaker_key:'lena',text:'제한구역과 기숙사 규정을 확인해.'}]}],
      rollingSummary:'레나가 규정집의 안전 절차를 읽었다.',
      ...patch,
    },mode:'game'},
  );
}

const meal=route('식사를 한다.');
assert.deepEqual(meal.telemetry.selected_npcs,[],'a completed fresh routine does not inherit the last speaker as foreground character signal');
assert.doesNotMatch(meal.params.instructions,/ACCESS_RULE_SENTINEL|DORM_RULE_SENTINEL/,'latent institutional rules do not become meal-scene exposition');
assert.doesNotMatch(meal.params.input,/"participants":\["lena"\]|ACTIVE NPC SIGNAL/,'the last active NPC is absent from high-authority writer signals when the fresh action has no causal NPC');
assert.match(meal.params.input,/"speaker_key":"lena"/,'bounded recent prose remains available for continuity without promoting its speaker to active NPC authority');
assert.ok(meal.params.input.endsWith('===== USER ACTION (EXACT) =====\n식사를 한다.'),'the exact routine intent remains final');

const restricted=route('제한구역 진입을 시도한다.');
assert.match(restricted.params.instructions,/ACCESS_RULE_SENTINEL/,'a directly triggered restriction remains available as canonical constraint');
assert.doesNotMatch(restricted.params.instructions,/DORM_RULE_SENTINEL/,'a triggered restriction does not pull an unrelated rulebook section with it');

const withLena=route('레나와 식사를 한다.');
assert.deepEqual(withLena.telemetry.selected_npcs,['lena'],'an explicitly relevant NPC still receives full character signal');
assert.match(withLena.params.input,/ACTIVE NPC SIGNAL/,'explicit NPC relevance still routes the active character profile');

const currentEvaluation=route('기량평가를 계속 받는다.',{saveState:{world:{date:'1285-03-08',time:'10:10',location:'기사과 연병장'},sceneRuntime:{scene_key:'초기 기량평가',participants:['artemis'],eventProgress:{eventInstanceId:'initial-evaluation',completedBeats:['group-choice']}},scheduledEvents:[{id:'initial-evaluation',title:'초기 기량평가',date:'1285-03-08',time:'10:00',location:'기사과 연병장',kind:'academic',actor_key:'artemis',participants:[]}]}});
assert.deepEqual(currentEvaluation.telemetry.selected_npcs,['artemis'],'an active canonical event keeps its current actor signal without a generic fallback');

const routerSource=readFileSync(new URL('../../api/chat-router.js',import.meta.url),'utf8');
assert.doesNotMatch(routerSource,/구조화된 실행 결과를 검증할 수 없어 반환된 시점에서 진행을 중단했다/,'structured validation diagnostics must not exist as fiction copy');
assert.match(routerSource,/reconciliationReason==='invalid-structured-execution'\)return res\.status\(409\)/,'rejected execution uses the existing non-fiction HTTP error path');
assert.match(routerSource,/code:'UNCOMMITTED_TURN'/,'the client receives a stable non-fiction error code without committing the turn');

console.log('PASS Canon/Validator/NPC Diet (latent canon filtered, triggered canon retained, NPC relevance reset, internal meta firewalled)');
