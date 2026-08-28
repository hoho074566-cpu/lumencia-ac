import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SCENE_NOVELTY_VERSION,
  buildSceneNoveltyDirective,
  deriveSceneNovelty,
  extractSceneNoveltyTerms,
  normalizeSceneNovelty,
} from '../../lib/scene-novelty.js';

assert.equal(SCENE_NOVELTY_VERSION,'1.0');

const firstTurn={
  scene_title:'A동 복도의 게시판',
  scene_summary:'배정 창구와 정정 목록, 초기 기량평가 안내가 그대로 붙어 있다.',
  scene:[{kind:'narration',text:'게시판에는 초기 기량평가 안내와 기숙사 배정 목록이 나란히 붙어 있었다.'}],
};
const firstTerms=extractSceneNoveltyTerms(firstTurn);
assert.ok(firstTerms.includes('게시판'));
assert.ok(firstTerms.includes('창구'));
assert.ok(firstTerms.includes('목록'));
assert.ok(firstTerms.includes('기량평가'),'a lexical noun ending in 가 must not be truncated as a particle');

const noStructuralChange={structuralScore:0,flags:{}};
const first=deriveSceneNovelty({turn:firstTurn,sceneDelta:noStructuralChange,action:'본다',turnNumber:1});
assert.equal(first.repetition_streak,0);
assert.ok(first.recent_terms.length<=16);

const repeatedTurn={
  scene_title:'A동 복도의 느린 발걸음',
  scene_summary:'배정 창구와 정정 목록, 초기 기량평가 안내가 여전히 붙어 있다.',
  scene:[{kind:'narration',text:'게시판에는 초기 기량평가 안내와 기숙사 배정 목록이 그대로 붙어 있었다.'}],
};
const repeated=deriveSceneNovelty({previousRuntime:{novelty:first},turn:repeatedTurn,sceneDelta:noStructuralChange,action:'돌아다닌다',turnNumber:2});
assert.equal(repeated.repetition_streak,1,'unchanged visible terms with zero structural delta must build repetition pressure');
assert.ok(repeated.repeated_terms.includes('게시판'));
assert.ok(repeated.last_similarity>=0.65);

const changed=deriveSceneNovelty({
  previousRuntime:{novelty:repeated},turn:repeatedTurn,
  sceneDelta:{structuralScore:1,flags:{locationChanged:true}},action:'밖으로 간다',turnNumber:3,
});
assert.equal(changed.repetition_streak,0,'a real scene boundary must clear repetition pressure');

const different=deriveSceneNovelty({
  previousRuntime:{novelty:first},
  turn:{scene_title:'계단의 소란',scene_summary:'학생회가 달아나는 학생을 붙잡았다.',scene:[{kind:'narration',text:'계단 아래에서 언성이 높아졌다.'}]},
  sceneDelta:noStructuralChange,action:'돌아다닌다',turnNumber:2,
});
assert.equal(different.repetition_streak,0,'new visible material must not be mislabeled as repetition');

const requested=deriveSceneNovelty({previousRuntime:{novelty:first},turn:repeatedTurn,sceneDelta:noStructuralChange,action:'게시판 내용을 다시 설명해 줘',turnNumber:2});
assert.equal(requested.repetition_streak,0,'an explicit recap request must not create suppression pressure');

for(const ordinaryAction of [
  '다시 자리에서 일어나 경비에게 말을 건다',
  'I repeatedly check the notice board.',
  'Repeat the attack.',
]){
  const ordinary=deriveSceneNovelty({previousRuntime:{novelty:first},turn:repeatedTurn,sceneDelta:noStructuralChange,action:ordinaryAction,turnNumber:2});
  assert.equal(ordinary.repetition_streak,1,`ordinary action must not be classified as recap: ${ordinaryAction}`);
}

const bounded=normalizeSceneNovelty({
  repetition_streak:99,recent_terms:Array.from({length:40},(_,index)=>`term-${index}`),repeated_terms:Array.from({length:20},(_,index)=>`repeat-${index}`),recent_axes:['danger','invalid-axis'],last_turn:-10,last_similarity:5,
});
assert.equal(bounded.repetition_streak,6);
assert.equal(bounded.recent_terms.length,16);
assert.equal(bounded.repeated_terms.length,8);
assert.deepEqual(bounded.recent_axes,['danger']);
assert.equal(bounded.last_turn,0);
assert.equal(bounded.last_similarity,1);

const saveState={world:{location:'A동 복도'},sceneRuntime:{novelty:repeated}};
const guard=buildSceneNoveltyDirective({action:'본다',saveState,recentTurns:[firstTurn,repeatedTurn]});
assert.match(guard,/RECENT_VISIBLE_TERMS=/);
assert.match(guard,/다시 출력할 체크리스트가 아니다/);
assert.match(guard,/REPEAT_GUARD=required/);
assert.match(guard,/목록/);

const question=buildSceneNoveltyDirective({action:'기량평가가 언제 시작할까?',saveState,recentTurns:[repeatedTurn]});
assert.match(question,/QUESTION BOUNDARY/);
assert.doesNotMatch(question,/중요한 선택점이 아니라면 기존 NPC 목표/,'a question must not be used to force world progression');
const elapsedStartNovelty=buildSceneNoveltyDirective({action:'오늘 오전 1시에 훈련한다.',saveState:{...saveState,world:{...saveState.world,time:'09:00'}},recentTurns:[repeatedTurn]});
assert.match(elapsedStartNovelty,/QUESTION BOUNDARY/,'novelty must share the elapsed-start freeze produced by the canonical current time');
assert.doesNotMatch(elapsedStartNovelty,/현재 USER ACTION과 고정 일정\/진행 사건을 우선 완료한다/,'novelty must not tell the model to complete an elapsed today-start action');
const futureWeekdayNovelty=buildSceneNoveltyDirective({action:'이번 목요일 오전 10시에 1시간 훈련한다.',saveState:{...saveState,world:{date:'1285-03-01',weekday:'수요일',time:'11:00',location:'훈련장'}},recentTurns:[repeatedTurn]});
assert.doesNotMatch(futureWeekdayNovelty,/QUESTION BOUNDARY/,'novelty must use the saved fantasy weekday instead of freezing a future activity as elapsed');
assert.match(futureWeekdayNovelty,/현재 USER ACTION과 고정 일정\/진행 사건을 우선 완료한다/,'novelty must agree with the time floor that the future weekday action remains executable');

const recap=buildSceneNoveltyDirective({action:'게시판 내용을 다시 설명해 줘',saveState,recentTurns:[repeatedTurn]});
assert.match(recap,/REQUESTED RECAP/);
assert.match(recap,/새 사건이나 상태 변화를 날조하지 않는다/);
assert.doesNotMatch(recap,/REPEAT_GUARD/);
assert.match(buildSceneNoveltyDirective({action:'지금까지 상황을 요약해줘',saveState,recentTurns:[repeatedTurn]}),/REQUESTED RECAP/);
assert.match(buildSceneNoveltyDirective({action:'Please recap the scene.',saveState,recentTurns:[repeatedTurn]}),/REQUESTED RECAP/);
for(const ordinaryAction of ['다시 자리에서 일어나 경비에게 말을 건다','I repeatedly check the notice board.','Repeat the attack.']){
  assert.doesNotMatch(buildSceneNoveltyDirective({action:ordinaryAction,saveState,recentTurns:[repeatedTurn]}),/REQUESTED RECAP/);
}

const frozen=buildSceneNoveltyDirective({action:'[LUMENSIA V1.5.6 CONTINUE] 직전 장면을 이어서 묘사한다.',saveState,recentTurns:[repeatedTurn]});
assert.match(frozen,/CONTINUE PRESERVE/);
assert.doesNotMatch(frozen,/REPEAT_GUARD/);

const router=fs.readFileSync(new URL('../../api/chat-router.js',import.meta.url),'utf8');
const context=fs.readFileSync(new URL('../../api/lib/context-router.js',import.meta.url),'utf8');
const noveltySource=fs.readFileSync(new URL('../../lib/scene-novelty.js',import.meta.url),'utf8');
const health=fs.readFileSync(new URL('../../api/health.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../../app-runtime.js',import.meta.url),'utf8');
assert.match(router,/deriveSceneNovelty/);
assert.match(router,/scene_novelty_v1:true/);
assert.match(router,/novelty,scene_delta:sceneDelta/);
assert.doesNotMatch(context,/buildSceneNoveltyDirective/,'novelty telemetry must remain deterministic without becoming writer-facing prose control');
assert.match(noveltySource,/classifySceneIntent\(rawAction,\{location:saveState\?\.world\?\.location\|\|'',currentTime:saveState\?\.world\?\.time\|\|''/,'novelty intent classification must receive the canonical current time');
assert.doesNotMatch(context,/DETERMINISTIC SCENE NOVELTY V1/,'the Novel Director Diet must move novelty principles from generation prompt to acceptance/runtime telemetry');
assert.doesNotMatch(context,/actionTextLimit=noveltyDirective/,'novelty context must not independently truncate a user action already covered by the routed input budget');
assert.match(health,/sceneNovelty:/);
assert.match(runtime,/save\.sceneRuntime = \{ \.\.\.\(save\.sceneRuntime \|\| \{\}\), \.\.\.runtime\.scene_runtime \}/,'the stable runtime must persist bounded novelty inside the existing sceneRuntime root');
assert.equal((router.match(/await runCore\(req,incoming,mode\)/g)||[]).length,1,'novelty must not add another canonical core call');

console.log('PASS Deterministic Scene Novelty V1 bounded repetition tracking and change-first guidance');
