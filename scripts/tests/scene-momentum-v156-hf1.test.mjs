#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  SCENE_MOMENTUM_VERSION,
  buildSceneMomentumDirective,
  classifySceneIntent,
  deriveSceneDelta,
  updateSceneMomentum,
} from '../../lib/scene-momentum.js';

assert.equal(SCENE_MOMENTUM_VERSION, '1.0');

// TEST A — 밖으로 간다: semantic destination must be exterior, not one micro-step.
const exitIntent = classifySceneIntent('밖으로 간다.', { location:'A동 개인실' });
assert.equal(exitIntent.kind, 'exit-exterior');
assert.equal(exitIntent.semanticTarget, 'current-building-exterior');
assert.equal(exitIntent.compression, true);
assert.ok(exitIntent.minAdvanceMinutes >= 2);
const exitDirective = buildSceneMomentumDirective({ action:'밖으로 간다.', saveState:{ world:{location:'A동 개인실'}, sceneRuntime:{} } });
assert.match(exitDirective, /복도 → 계단\/현관.*건물 외부/);
assert.match(exitDirective, /복도에서 멈추려면 실제 방해\/사건\/중요 선택 근거/);
assert.equal(classifySceneIntent('마법과 건물로 간다.', { location:'A동 복도' }).kind, 'travel', 'department travel must not be mistaken for magic ability use');
const outdoorExitDirective = buildSceneMomentumDirective({ action:'밖으로 간다.', saveState:{world:{location:'중앙광장'},sceneRuntime:{}} });
assert.doesNotMatch(outdoorExitDirective,/현재 방\/생활공간 → 복도/,'outdoor exit must not fabricate an indoor route');
assert.match(outdoorExitDirective,/이미 야외\/외부/);

// Travel must support common Korean particles and isolate the actual destination.
const libraryTravel = classifySceneIntent('도서관에 간다.', { location:'중앙광장' });
assert.equal(libraryTravel.kind,'travel');
assert.equal(libraryTravel.semanticTarget,'도서관');
const squareTravel = classifySceneIntent('중앙광장에 이동한다.', { location:'A동' });
assert.equal(squareTravel.kind,'travel');
assert.equal(squareTravel.semanticTarget,'중앙광장');
const companionTravel = classifySceneIntent('미라벨과 함께 중앙광장으로 간다.', { location:'A동' });
assert.equal(companionTravel.kind,'travel');
assert.equal(companionTravel.semanticTarget,'중앙광장','companion text must not become part of the destination');
assert.equal(classifySceneIntent('결투장으로 간다.', { location:'A동' }).kind,'travel','location names containing 결투 must not become decisions');

// TEST B — 돌아다닌다: exploration needs multi-point compression + novelty.
const exploreIntent = classifySceneIntent('돌아다닌다.', { location:'A동 복도' });
assert.equal(exploreIntent.kind, 'explore');
assert.equal(exploreIntent.requiresNovelty, true);
assert.ok(exploreIntent.deltaTarget >= 2);
assert.ok(exploreIntent.minAdvanceMinutes >= 8);
const exploreDirective = buildSceneMomentumDirective({ action:'돌아다닌다.', saveState:{ world:{location:'A동 복도'}, sceneRuntime:{} } });
assert.match(exploreDirective, /새 NPC\/새 정보\/작은 사건\/소문\/의미 있는 장소 중 최소 하나/);

// Observation accepts qualified objects/adverbs and English tokens must not match substrings.
assert.equal(classifySceneIntent('게시판을 확인한다.', { location:'A동 복도' }).kind,'observe');
assert.equal(classifySceneIntent('주변을 자세히 살펴본다.', { location:'A동 복도' }).kind,'observe');
assert.equal(classifySceneIntent('restaurant로 간다.', { location:'중앙광장' }).kind,'travel','restaurant must not be parsed as rest');
assert.notEqual(classifySceneIntent('waitress에게 묻는다.', { location:'식당' }).kind,'wait','waitress must not be parsed as wait');

// TEST C — repeated static turns must create Scene Stall pressure. Scene title alone never counts.
const staticTurn = {
  scene_title:'A동 복도의 느린 발걸음',
  scene:[{kind:'narration',text:'게시판과 정정 목록은 그대로였다.'}],
  state_delta:{advance_minutes:0,new_location:null,relationship_changes:[],intimacy_changes:[],npc_state_updates:[],pc_knowledge_add:[],memories_add:[],hooks_add:[],hooks_update:[],active_events_add:[],active_events_remove:[],completed_events_add:[],scheduled_events_complete:[],items_add:[],items_remove:[]},
  event_progress:null,
};
const baseSave = { turnNumber:10, world:{location:'A동 복도'}, sceneRuntime:{participants:[]} };
const d1 = deriveSceneDelta({ saveState:baseSave, previousRuntime:baseSave.sceneRuntime, turn:staticTurn, nextParticipants:[], action:'본다' });
assert.equal(d1.score, 0, 'renaming/rephrasing a scene must not count as State Delta');
let m = updateSceneMomentum(baseSave.sceneRuntime,d1,{turnNumber:11});
assert.equal(m.stall_streak,1);
const d2 = deriveSceneDelta({ saveState:{...baseSave,turnNumber:11,sceneRuntime:{...baseSave.sceneRuntime,momentum:m}}, previousRuntime:{...baseSave.sceneRuntime,momentum:m}, turn:staticTurn, nextParticipants:[], action:'돌아다닌다' });
m = updateSceneMomentum({...baseSave.sceneRuntime,momentum:m},d2,{turnNumber:12});
assert.equal(m.stall_streak,2);
const pressureDirective = buildSceneMomentumDirective({ action:'본다', saveState:{...baseSave,sceneRuntime:{...baseSave.sceneRuntime,momentum:m}} });
assert.match(pressureDirective,/SCENE_STALL=true/);
assert.match(pressureDirective,/scene_title만 바꾸는 것으로 통과할 수 없다/);

// Repeated/no-op Goal V2 metadata must not fake world progress.
const activeGoalSave = {
  ...baseSave,
  npcInnerStates:{isabel:{active_goal:{desire:'PC의 실력을 관찰한다.',state:'active',progress:20}}},
  npcStates:{isabel:{current_goal:'PC의 실력을 관찰한다.'}},
};
const noOpGoalTurn = {
  ...staticTurn,
  state_delta:{...staticTurn.state_delta,npc_state_updates:[{npc_key:'isabel',goal_state:'active'}]},
};
const noOpGoalDelta = deriveSceneDelta({saveState:activeGoalSave,previousRuntime:baseSave.sceneRuntime,turn:noOpGoalTurn,nextParticipants:[],action:'본다'});
assert.equal(noOpGoalDelta.flags.objectiveChanged,false,'same active lifecycle metadata must not count as objective progress');
assert.equal(noOpGoalDelta.flags.npcAction,false,'a no-op goal metadata row must not fake NPC action');
const progressedGoalTurn = {
  ...staticTurn,
  state_delta:{...staticTurn.state_delta,npc_state_updates:[{npc_key:'isabel',goal_state:'active',goal_progress_delta:10}]},
};
const progressedGoalDelta=deriveSceneDelta({saveState:activeGoalSave,previousRuntime:baseSave.sceneRuntime,turn:progressedGoalTurn,nextParticipants:[],action:'본다'});
assert.equal(progressedGoalDelta.flags.objectiveChanged,true,'real goal progress must count as State Delta');

// Event completion represented by event_progress:null is still real progression.
const priorEventRuntime={participants:[],eventProgress:{eventInstanceId:'entrance#1285',activeBeat:'ceremony_close',completedBeats:['welcome_address'],paused:false}};
const eventCompletedDelta=deriveSceneDelta({saveState:baseSave,previousRuntime:priorEventRuntime,turn:staticTurn,nextParticipants:[],action:'본다'});
assert.equal(eventCompletedDelta.flags.eventProgress,true,'event_progress -> null completion must count as progression');

// A meaningful turn resets the stall.
const changedTurn = {
  scene_title:'중앙광장',
  scene:[{kind:'dialogue',speaker_key:'isabel',text:'여기 있었네.'}],
  state_delta:{advance_minutes:12,new_location:'중앙광장',relationship_changes:[],intimacy_changes:[],npc_state_updates:[],pc_knowledge_add:['기량평가 대진표가 공개되었다.'],memories_add:[],hooks_add:[],hooks_update:[],active_events_add:[],active_events_remove:[],completed_events_add:[],scheduled_events_complete:[],items_add:[],items_remove:[]},
  event_progress:null,
};
const d3 = deriveSceneDelta({ saveState:{...baseSave,sceneRuntime:{...baseSave.sceneRuntime,momentum:m}}, previousRuntime:{...baseSave.sceneRuntime,momentum:m}, turn:changedTurn, nextParticipants:['isabel'], action:'돌아다닌다' });
assert.ok(d3.score >= 4);
const m3 = updateSceneMomentum({...baseSave.sceneRuntime,momentum:m},d3,{turnNumber:13});
assert.equal(m3.stall_streak,0);

// TEST D — NPC Initiative is explicitly allowed and PC-centric freezing is forbidden.
const genericDirective = buildSceneMomentumDirective({ action:'복도를 걷는다.', saveState:{world:{location:'A동'},sceneRuntime:{}} });
assert.match(genericDirective,/NPC는 목표·일정·관계·감정.*먼저 말하거나 움직이거나 떠나거나 다른 NPC와 상호작용/);
assert.match(genericDirective,/PC가 찾아오기를 항상 기다리지 않는다/);

// TEST E — downtime compresses low-value steps and advances meaningful time.
const restIntent = classifySceneIntent('좀 쉰다.', { location:'기숙사 개인실' });
assert.equal(restIntent.kind,'downtime');
assert.ok(restIntent.minAdvanceMinutes >= 30);
const restDirective = buildSceneMomentumDirective({ action:'좀 쉰다.', saveState:{world:{location:'기숙사 개인실'},sceneRuntime:{}} });
assert.match(restDirective,/앉기→눈감기→잠들기 같은 미세 단계를 여러 턴 요구하지 않는다/);
assert.match(restDirective,/충분한 시간을 넘긴 뒤 변화한 상황/);

// TEST F — important decisions must still stop and preserve player agency.
const duelIntent = classifySceneIntent('결투를 받아들일지 고민한다.', { location:'중앙광장' });
assert.equal(duelIntent.kind,'decision-sensitive');
assert.equal(duelIntent.compression,false);
assert.equal(duelIntent.deltaTarget,0);
assert.match(genericDirective,/STOP은 전투 돌입\/되돌리기 어려운 위험\/중대한 관계 선택\/중요 대화의 직접 질문\/갈림길\/능력 사용 여부/);

// Internal naming leak guard.
assert.match(genericDirective,/내부 명칭 "PC"나 자리표시자 "Aaa"를 주어로 출력하지 않는다/);

console.log('PASS Scene Momentum HF1 acceptance A-F + intent/delta edge cases');
