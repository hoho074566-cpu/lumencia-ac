import assert from 'node:assert/strict';
import { explicitDepartures, freshChoices, reconcileParticipants } from '../../lib/scene-continuity.js';

const dialogue = (key, name, text = '안녕.') => ({ kind:'dialogue', speaker_key:key, speaker_name:name, text });
const narration = text => ({ kind:'narration', speaker_key:null, text });
const recent = [{ scene:[dialogue('mirabelle', '미라벨', '또 봐요.')] }];

{
  const turn = { scene:[narration('미라벨은 작별을 하고 방을 나갔다.')], state_delta:{} };
  assert.deepEqual([...explicitDepartures(turn, recent)], ['mirabelle']);
  assert.deepEqual(reconcileParticipants({ previous:['mirabelle','lillia'], turn, recentTurns:recent }), ['lillia']);
  assert.equal(recent[0].scene[0].speaker_key, 'mirabelle', 'speaker history must remain intact');
}

{
  const similar = [{ scene:[dialogue('elena','엘레나'), dialogue('lena','레나')] }];
  assert.deepEqual([...explicitDepartures({scene:[narration('Elena leaves the room.')]}, [{scene:[dialogue('elena','Elena'),dialogue('lena','Lena')]}])], ['elena'], 'Lena must not match inside Elena');
  assert.deepEqual([...explicitDepartures({scene:[narration('엘레나는 방을 나갔다.')]}, similar)], ['elena'], '레나 must not match inside 엘레나');
}

for (const text of ['Mirabelle does not leave the room.', 'Mirabelle might leave.', 'Should I leave, Mirabelle?', '미라벨은 떠나지 않는다.', '미라벨은 떠날지도 모른다.', '미라벨은 떠나야 할까?']) {
  assert.equal(explicitDepartures({ scene:[narration(text)] }, recent).size, 0, text);
}

assert.deepEqual(reconcileParticipants({ previous:['mirabelle'], turn:{ scene:[narration('비가 창문을 두드린다.')], state_delta:{} }, recentTurns:recent }), ['mirabelle'], 'silence is not departure');
assert.deepEqual(reconcileParticipants({ previous:[], turn:{ scene:[dialogue('mirabelle','미라벨','돌아왔어요.')], state_delta:{} }, recentTurns:recent }), ['mirabelle'], 'a departed NPC may return');
assert.deepEqual(reconcileParticipants({ previous:[], turn:{ scene:[narration('행사가 시작된다.')], state_delta:{} }, recentTurns:recent, scheduledEntries:['mirabelle'] }), ['mirabelle'], 'scheduled re-entry remains possible');
assert.deepEqual(reconcileParticipants({ previous:['mirabelle'], action:'미라벨과 함께 기사과 건물로 간다.', turn:{ scene:[narration('두 사람은 함께 기사과 건물에 도착했다.')], state_delta:{new_location:'기사과 건물'} }, recentTurns:recent }), ['mirabelle'], 'an explicitly accompanying NPC crosses locations');
assert.deepEqual(reconcileParticipants({ previous:['mirabelle'], action:'기사과 건물로 간다.', turn:{ scene:[narration('PC는 기사과 건물에 도착했다.')], state_delta:{new_location:'기사과 건물'} }, recentTurns:recent }), [], 'location change does not carry an unmentioned NPC');

{
  const turn = { scene:[narration('PC는 기사과 건물에 도착해 안으로 들어갔다.')], state_delta:{ new_location:'기사과 건물 내부' }, choices:['기사과 건물로 간다.','기사과 건물 안으로 들어간다.','훈련장을 둘러본다.'] };
  assert.deepEqual(freshChoices('기사과 건물로 간다.', turn), ['훈련장을 둘러본다.']);
  assert.deepEqual(freshChoices('주변을 살핀다.', { ...turn, choices:['기사과 훈련장으로 간다.'] }), ['기사과 훈련장으로 간다.'], 'movement within the current building stays available');
  assert.deepEqual(freshChoices('주변을 살핀다.', { ...turn, choices:['마법과 건물 안으로 들어간다.'] }), ['마법과 건물 안으로 들어간다.'], 'generic building words do not establish the same destination');
  assert.deepEqual(freshChoices('주변을 살핀다.', { ...turn, state_delta:{new_location:'건물'}, choices:['마법과 건물 안으로 들어간다.'] }), ['마법과 건물 안으로 들어간다.'], 'a generic current location alone does not establish destination identity');
}

{
  const turn = { scene:[narration('PC는 미라벨에게 오리엔테이션 장소를 알려 주었다.')], state_delta:{ new_location:null }, choices:['미라벨에게 오리엔테이션 장소를 알려 준다.','다른 주제를 묻는다.'] };
  assert.deepEqual(freshChoices('미라벨에게 오리엔테이션 장소를 알려 준다.', turn), ['다른 주제를 묻는다.']);
}

assert.deepEqual(freshChoices('적을 공격한다.', { scene:[narration('전투가 계속된다.')], state_delta:{}, choices:['적을 공격한다.'] }), ['적을 공격한다.']);
assert.deepEqual(freshChoices('문으로 들어간다.', { scene:[narration('경비에게 막혀 들어가지 못했다.')], state_delta:{}, choices:['문으로 들어간다.'] }), ['문으로 들어간다.']);
assert.deepEqual(freshChoices('문으로 들어간다.', { scene:[narration('릴리아는 공격에 실패했다.')], state_delta:{}, choices:['문으로 들어간다.'] }), [], 'an unrelated NPC failure does not exempt the player choice');
assert.deepEqual(freshChoices('문으로 들어간다.', { scene:[narration('Lillia failed to enter another room.')], state_delta:{}, choices:['문으로 들어간다.'] }), [], 'another character failing the same action does not exempt the player choice');
assert.deepEqual(freshChoices('문으로 들어간다.', { scene:[narration('릴리아는 문에 들어가지 못했다.')], state_delta:{}, choices:['문으로 들어간다.'] }), [], 'a named NPC failure is not the player failure');
assert.deepEqual(freshChoices('문으로 들어간다.', { resolution_log:{outcome:'failure'}, scene:[narration('시도가 실패했다.')], state_delta:{}, choices:['문으로 들어간다.'] }), ['문으로 들어간다.'], 'structured player failure permits retry');
assert.deepEqual(freshChoices('공격을 멈춘다.', { scene:[narration('PC는 검을 내리고 공격을 멈췄다.')], state_delta:{}, choices:['공격을 멈춘다.'] }), [], 'stopping combat is not a repeatable attack exemption');
assert.deepEqual(freshChoices('기사과 건물을 떠난다.', { scene:[narration('PC는 광장에 도착했다.')], state_delta:{new_location:'중앙 광장'}, choices:['기사과 건물로 돌아간다.'] }), ['기사과 건물로 돌아간다.']);

console.log('scene continuity tests passed');
