import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMBAT_GROWTH_VERSION,
  MAX_COMBAT_SKILL_EXPERIENCE,
  MAX_COMBAT_STAT_PROGRESS,
  compactCombatGrowthTelemetry,
  deriveCombatGrowthState,
} from '../../lib/combat-growth.js';

const scene = (text) => [{ kind:'narration', text }];
const ability = (kind, name, role = 'primary') => ({ kind, name, role, reason:`${name}이 판정에 실제 반영됨` });
const resolution = (outcome, abilities) => ({ triggered:true, outcome, summary:'능력과 장면 조건을 반영한 판정', abilities });
const pc = {
  name: '카일',
  stats: {
    신체: { grade:'B', progress:40 },
    마나: { grade:'S', progress:20 },
    지능: { grade:'B+', progress:10 },
    신성: { grade:'SS', progress:3 },
  },
  skills: {
    대검술: { grade:'A', hiddenXp:30 },
    '오러 운용': { grade:'SS', hiddenXp:2 },
    전술분석: { grade:'B+', hiddenXp:5 },
    신성기원: { grade:'SS', hiddenXp:1 },
  },
};

assert.equal(COMBAT_GROWTH_VERSION, '2.0');
assert.equal(MAX_COMBAT_STAT_PROGRESS, 2);
assert.equal(MAX_COMBAT_SKILL_EXPERIENCE, 3);

const basicTraining = deriveCombatGrowthState({
  pc,
  action:'대검술 기본 자세를 반복 연습한다.',
  scene:scene('반복한 자세의 잘못된 손목 각도를 교정하며 대검술 동작을 안정시켰다.'),
  resolutionLog:resolution('success', [ability('skill', '대검술'), ability('stat', '신체', 'support')]),
  statChanges:[{ stat:'신체', amount:5, reason:'반복 자세 교정' }],
  skillChanges:[{ skill:'대검술', amount:5, reason:'기본 동작 교정' }],
});
assert.equal(basicTraining.evidence_tier, 1, 'ordinary deliberate practice must remain basic evidence');
assert.deepEqual(basicTraining.accepted_stat_progress, [{ stat:'신체', amount:1, reason:'반복 자세 교정' }], 'basic practice must cap stat progress at +1');
assert.deepEqual(basicTraining.accepted_skill_experience, [{ skill:'대검술', amount:1, reason:'기본 동작 교정' }], 'basic practice must cap existing-skill XP at +1');

const pressuredCombat = deriveCombatGrowthState({
  pc,
  action:'강적과 대련하며 대검술로 맞선다.',
  scene:scene('강적의 실전 압박 속에서 대검술의 새로운 응용을 시도하고 실패 원인을 파악해 자세를 수정했다.'),
  resolutionLog:resolution('partial', [ability('skill', '대검술'), ability('stat', '신체', 'support')]),
  statChanges:[{ stat:'신체', amount:5, reason:'강적의 압박에 대한 적응' }],
  skillChanges:[{ skill:'대검술', amount:5, reason:'실전에서 새 응용을 습득' }],
});
assert.equal(pressuredCombat.evidence_tier, 2, 'strong-opponent pressure and new application must be challenging evidence');
assert.equal(pressuredCombat.accepted_stat_progress[0].amount, 2, 'B-grade stat growth must be grade-capped under challenging evidence');
assert.equal(pressuredCombat.accepted_skill_experience[0].amount, 2, 'A-grade skill growth must be grade-capped under challenging evidence');

const enduranceGrowth = deriveCombatGrowthState({
  pc,
  action:'강적의 연속 공격을 견딘다.',
  scene:scene('카일은 실전 압박에 적응하며 무너지는 호흡을 교정했다.'),
  resolutionLog:resolution('partial', [ability('stat', '신체')]),
  statChanges:[{ stat:'신체', amount:4, reason:'강적의 압박을 견딘 적응' }],
});
assert.deepEqual(enduranceGrowth.accepted_stat_progress, [{ stat:'신체', amount:2, reason:'강적의 압박을 견딘 적응' }], 'enduring meaningful combat pressure is a valid player-owned physical stimulus');

const failedButLearned = deriveCombatGrowthState({
  pc,
  action:'대검술 대련을 계속한다.',
  scene:scene('대검술 연속 실패의 원인을 파악해 무너진 자세를 수정하고 같은 실수를 피했다.'),
  resolutionLog:resolution('failure', [ability('skill', '대검술')]),
  skillChanges:[{ skill:'대검술', amount:4, reason:'실패 분석과 자세 수정' }],
});
assert.deepEqual(failedButLearned.accepted_skill_experience, [{ skill:'대검술', amount:2, reason:'실패 분석과 자세 수정' }], 'failure may teach when correction is actually shown');

const extremeBreakthrough = deriveCombatGrowthState({
  pc,
  action:'오러 운용으로 생사의 전투에 맞선다.',
  scene:scene('죽음의 문턱에서 오러 운용의 순환 오류를 깨닫고 극한의 압박 속에 한계를 돌파했다.'),
  resolutionLog:resolution('partial', [ability('skill', '오러 운용'), ability('stat', '마나', 'support')]),
  statChanges:[{ stat:'마나', amount:5, reason:'극한에서 순환 한계 돌파' }],
  skillChanges:[{ skill:'오러 운용', amount:5, reason:'생사 경계의 근본 통찰' }],
});
assert.equal(extremeBreakthrough.evidence_tier, 3);
assert.equal(extremeBreakthrough.accepted_skill_experience[0].amount, 1, 'SS skill must gain at most +1 from decisive extreme evidence');
assert.equal(extremeBreakthrough.accepted_stat_progress[0].amount, 2, 'S stat may gain only a small decisive amount');

const perAbilityEvidenceCaps = deriveCombatGrowthState({
  pc,
  action:'대검술을 연습한 뒤 오러 운용으로 극한 전투에 맞선다.',
  scene:[
    { kind:'narration', text:'카일은 대검술의 기본 자세를 반복 연습하고 손목 각도를 교정했다.' },
    { kind:'narration', text:'카일은 죽음의 문턱에서 오러 운용의 근본 오류를 깨닫고 극한의 압박 속에 한계를 돌파했다.' },
  ],
  resolutionLog:resolution('partial', [ability('skill', '대검술'), ability('skill', '오러 운용'), ability('stat', '신체'), ability('stat', '마나')]),
  statChanges:[{ stat:'신체', amount:5, reason:'기초 자세 교정' }, { stat:'마나', amount:5, reason:'극한 오러 돌파' }],
  skillChanges:[{ skill:'대검술', amount:5, reason:'기초 자세 교정' }, { skill:'오러 운용', amount:5, reason:'생사 경계의 통찰' }],
});
assert.equal(perAbilityEvidenceCaps.accepted_skill_experience.find((row) => row.skill === '대검술').amount, 1, 'an unrelated extreme breakthrough must not inflate a basic skill drill');
assert.equal(perAbilityEvidenceCaps.accepted_stat_progress.find((row) => row.stat === '신체').amount, 1, 'an unrelated extreme breakthrough must not inflate a basic stat drill');

const highGradeRoutineRejected = deriveCombatGrowthState({
  pc,
  action:'오러 운용의 기초 순환을 연습한다.',
  scene:scene('기초 순환을 반복 연습하고 호흡을 교정했다.'),
  resolutionLog:resolution('success', [ability('skill', '오러 운용'), ability('stat', '마나', 'support')]),
  statChanges:[{ stat:'마나', amount:2, reason:'기초 순환 반복' }],
  skillChanges:[{ skill:'오러 운용', amount:2, reason:'기초 순환 반복' }],
});
assert.deepEqual(highGradeRoutineRejected.accepted_stat_progress, [], 'S stat must not farm routine practice');
assert.deepEqual(highGradeRoutineRejected.accepted_skill_experience, [], 'SS skill must not farm routine practice');

const mereVictoryRejected = deriveCombatGrowthState({
  pc,
  action:'대검술로 적을 공격한다.',
  scene:scene('대검술로 적을 베어 쓰러뜨리고 승리했다.'),
  resolutionLog:resolution('success', [ability('skill', '대검술'), ability('stat', '신체', 'support')]),
  statChanges:[{ stat:'신체', amount:5, reason:'전투 승리' }],
  skillChanges:[{ skill:'대검술', amount:5, reason:'스킬 사용과 승리' }],
});
assert.equal(mereVictoryRejected.evidence_tier, 0);
assert.deepEqual(mereVictoryRejected.accepted_stat_progress, []);
assert.deepEqual(mereVictoryRejected.accepted_skill_experience, [], 'mere use or victory must not award XP');

const nonPositiveAmountsRejected = deriveCombatGrowthState({
  pc,
  action:'대검술 기본 자세를 반복 연습한다.',
  scene:scene('반복 자세를 교정하며 대검술 동작을 안정시켰다.'),
  resolutionLog:resolution('success', [ability('skill', '대검술'), ability('stat', '신체')]),
  statChanges:[{ stat:'신체', amount:-3, reason:'음수 입력' }],
  skillChanges:[{ skill:'대검술', amount:0, reason:'0 입력' }],
});
assert.deepEqual(nonPositiveAmountsRejected.accepted_stat_progress, [], 'negative progress must never be converted into a positive award');
assert.deepEqual(nonPositiveAmountsRejected.accepted_skill_experience, [], 'zero XP must never be converted into a positive award');

const npcOnlyRejected = deriveCombatGrowthState({
  pc,
  action:'릴리아가 대련하는 모습을 지켜본다.',
  scene:scene('릴리아가 강적의 압박 속에서 새로운 응용을 깨닫고 자세를 교정했다.'),
  resolutionLog:resolution('success', [ability('skill', '대검술')]),
  statChanges:[{ stat:'신체', amount:3, reason:'릴리아의 대련' }],
  skillChanges:[{ skill:'대검술', amount:3, reason:'릴리아의 실전 통찰' }],
});
assert.deepEqual(npcOnlyRejected.accepted_stat_progress, [], 'NPC-only action must not mutate PC stats');
assert.deepEqual(npcOnlyRejected.accepted_skill_experience, [], 'observing another NPC must not mutate PC skill XP');

const npcDirectlyRejected = deriveCombatGrowthState({
  pc,
  action:'릴리아가 직접 대련한다.',
  scene:scene('릴리아가 강적의 실전 압박 속에서 새로운 응용을 깨닫고 자세를 교정했다.'),
  resolutionLog:resolution('success', [ability('skill', '대검술')]),
  skillChanges:[{ skill:'대검술', amount:3, reason:'릴리아의 직접 대련' }],
});
assert.deepEqual(npcDirectlyRejected.accepted_skill_experience, [], 'the word 직접 must not convert a named NPC action into PC-owned growth');

const englishNpcOnlyRejected = deriveCombatGrowthState({
  pc:{ ...pc, skills:{ ...pc.skills, Greatsword:{ grade:'C', hiddenXp:0 } } },
  action:'Lillia trains Greatsword.',
  scene:scene('Lillia practiced under pressure, corrected her stance, and gained a new insight.'),
  resolutionLog:resolution('success', [ability('skill', 'Greatsword')]),
  skillChanges:[{ skill:'Greatsword', amount:3, reason:'Lillia trained it' }],
});
assert.deepEqual(englishNpcOnlyRejected.accepted_skill_experience, [], 'English third-person action and scene evidence must not mutate PC growth');

const englishPlayerEvidenceAccepted = deriveCombatGrowthState({
  pc:{ ...pc, skills:{ ...pc.skills, Greatsword:{ grade:'C', hiddenXp:0 } } },
  action:'I practice Greatsword.',
  scene:scene('Repeated practice corrected my stance and produced new insight in Greatsword.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  skillChanges:[{ skill:'Greatsword', amount:3, reason:'repeated stance correction' }],
});
assert.deepEqual(englishPlayerEvidenceAccepted.accepted_skill_experience, [{ skill:'Greatsword', amount:1, reason:'repeated stance correction' }], 'a capitalized English sentence opener is not an NPC subject');

const englishNpcEvidenceRejected = deriveCombatGrowthState({
  pc:{ ...pc, skills:{ ...pc.skills, Greatsword:{ grade:'C', hiddenXp:0 } } },
  action:'I practice Greatsword.',
  scene:scene('Lillia practiced Greatsword under pressure and corrected her stance.'),
  resolutionLog:resolution('success', [ability('skill', 'Greatsword')]),
  skillChanges:[{ skill:'Greatsword', amount:3, reason:'Lillia corrected her stance' }],
});
assert.deepEqual(englishNpcEvidenceRejected.accepted_skill_experience, [], 'an English third-person subject must still block NPC-only scene evidence');

const namedObserverRejected = deriveCombatGrowthState({
  pc,
  action:'카일은 릴리아가 대검술을 훈련하는 모습을 지켜본다.',
  scene:scene('카일은 릴리아가 대검술의 자세를 교정하고 새 통찰을 얻는 모습을 봤다.'),
  resolutionLog:resolution('success', [ability('skill', '대검술')]),
  skillChanges:[{ skill:'대검술', amount:3, reason:'릴리아의 훈련 관찰' }],
});
assert.deepEqual(namedObserverRejected.accepted_skill_experience, [], 'mentioning the PC as observer must not transfer an NPC training action');

const namedPcWithNpcOnlyEvidenceRejected = deriveCombatGrowthState({
  pc,
  action:'대검술을 연습한다.',
  scene:scene('카일은 잠시 쉬는 동안 릴리아가 대검술의 자세를 교정하고 새 통찰을 얻었다.'),
  resolutionLog:resolution('success', [ability('skill', '대검술')]),
  skillChanges:[{ skill:'대검술', amount:3, reason:'릴리아의 교정 장면' }],
});
assert.deepEqual(namedPcWithNpcOnlyEvidenceRejected.accepted_skill_experience, [], 'the PC name elsewhere in a scene must not authenticate an NPC learning stimulus');

const playerRecipientCorrectionAccepted = deriveCombatGrowthState({
  pc,
  action:'대검술을 연습한다.',
  scene:scene('릴리아가 카일의 대검술 손목 각도를 직접 교정해 자세가 안정됐다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  skillChanges:[{ skill:'대검술', amount:3, reason:'교관의 직접 교정' }],
});
assert.deepEqual(playerRecipientCorrectionAccepted.accepted_skill_experience, [{ skill:'대검술', amount:1, reason:'교관의 직접 교정' }], 'a named instructor may still provide evidence when the PC is the explicit correction recipient');

const liveImperativeCorrectionAccepted = deriveCombatGrowthState({
  pc,
  action:'나는 광장 한쪽에서 신체 단련용 보법을 세 번 시도한다. 첫 두 번은 발이 꼬여 실패하고, 곁의 교관에게 내 자세를 봐 달라고 요청한다. 교관이 오른발을 반 보 뒤로 두고 무게중심을 낮추라고 정확히 교정하면, 나는 그 지시를 직접 적용해 마지막 반복에 성공하고 실패 원인을 파악한다.',
  scene:[
    { kind:'narration', text:'광장 한쪽에서 첫 두 번의 보법은 발이 얽히며 흐트러졌다. 곁을 지나던 교관이 요청을 받고 걸음을 멈춘다.' },
    { kind:'dialogue', speaker_name:'교관', text:'오른발을 반 보 뒤로. 허리를 세우려 하지 말고, 중심부터 낮춰. 발을 옮기는 게 아니라 바닥을 밀어낸다고 생각해.' },
    { kind:'narration', text:'지시를 적용한 마지막 반복은 발끝이 엉키지 않고 매끄럽게 이어진다. 문제는 속도가 아니라 앞발에 쏠린 무게중심이었다는 점이 분명해진다.' },
  ],
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  statChanges:[{ stat:'신체', amount:1, reason:'실패 뒤 교관의 보법 교정 적용' }],
});
assert.equal(liveImperativeCorrectionAccepted.evidence_tier, 1, 'an applied technical instruction in the resolved PC repetition is visible basic correction evidence');
assert.deepEqual(liveImperativeCorrectionAccepted.accepted_stat_progress, [{ stat:'신체', amount:1, reason:'실패 뒤 교관의 보법 교정 적용' }], 'the exact live failure-and-imperative-correction scene must retain bounded physical growth');

const linkedInstructorCorrectionAccepted = deriveCombatGrowthState({
  pc,
  action:'나는 이번에는 신체 단련을 위해 별도의 후퇴 보법을 세 번 연습한다. 첫 두 번은 발이 교차되어 실패한다. 교관에게 새 오류를 봐 달라고 요청하고, 교관의 뒷발 각도와 무게중심 지시를 직접 적용한 마지막 반복을 성공시켜 실패 원인을 확인한다.',
  scene:[
    { kind:'narration', text:'후퇴할 때도 앞선 두 번은 발이 교차하며 중심이 무너졌다. 요청을 받은 교관은 뒷발을 진행 방향에서 비스듬히 빼고, 체중을 앞발에 남기지 말라고 짧게 지적했다.' },
    { kind:'dialogue', speaker_name:'교관', text:'뒷발부터 길을 만들어. 몸이 먼저 물러나면 발이 얽힌다.' },
    { kind:'narration', text:'마지막 반복에서는 뒷발의 각도를 먼저 열고 중심을 낮췄다. 발이 교차하지 않은 채 한 걸음이 깔끔하게 빠진다. 원인은 뒷발의 닫힌 각도와 앞쪽에 남은 무게였다.' },
  ],
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  statChanges:[{ stat:'신체', amount:1, reason:'실패 뒤 교관의 후퇴 보법 교정 적용' }],
});
assert.equal(linkedInstructorCorrectionAccepted.evidence_tier, 1, 'adjacent instructor guidance and a subjectless successful final repetition form visible basic correction evidence');
assert.deepEqual(linkedInstructorCorrectionAccepted.accepted_stat_progress, [{ stat:'신체', amount:1, reason:'실패 뒤 교관의 후퇴 보법 교정 적용' }], 'natural narration may link correction and application across adjacent scene rows');

const linkedNpcCorrectionRejected = deriveCombatGrowthState({
  pc,
  action:'나는 후퇴 보법을 연습한다.',
  scene:[
    { kind:'narration', text:'교관이 뒷발 각도와 체중 이동을 짧게 지적했다.' },
    { kind:'narration', text:'릴리아는 마지막 반복에서 뒷발을 먼저 열어 깔끔하게 성공했다.' },
  ],
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  statChanges:[{ stat:'신체', amount:1, reason:'릴리아의 후퇴 보법 교정 적용' }],
});
assert.deepEqual(linkedNpcCorrectionRejected.accepted_stat_progress, [], 'an explicitly named NPC correction outcome must not transfer through adjacent guidance');

const npcInstructionApplicationRejected = deriveCombatGrowthState({
  pc,
  action:'신체 단련용 보법을 반복 연습한다.',
  scene:scene('릴리아가 교관의 지시를 적용한 마지막 보법 반복에 성공했다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  statChanges:[{ stat:'신체', amount:1, reason:'릴리아의 보법 교정 적용' }],
});
assert.deepEqual(npcInstructionApplicationRejected.accepted_stat_progress, [], 'a named NPC applying the instructor directive must not transfer growth to the PC');

const koreanAttemptVerbAccepted = deriveCombatGrowthState({
  pc,
  action:'대검술을 연습해본다.',
  scene:scene('대검술의 기본 자세를 반복 연습하고 손목 각도를 교정했다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  skillChanges:[{ skill:'대검술', amount:3, reason:'기본 자세 교정' }],
});
assert.deepEqual(koreanAttemptVerbAccepted.accepted_skill_experience, [{ skill:'대검술', amount:1, reason:'기본 자세 교정' }], '연습해본다 is a committed attempt, not an observation verb');

const commandedNpcRejected = deriveCombatGrowthState({
  pc,
  action:'나는 릴리아를 훈련시킨다.',
  scene:scene('반복 훈련의 원리를 설명하고 자세를 교정했다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  skillChanges:[{ skill:'대검술', amount:2, reason:'릴리아에게 시킨 훈련' }],
});
assert.deepEqual(commandedNpcRejected.accepted_skill_experience, [], 'ordering another character to train must not count as the PC training');

const npcDialogueEvidenceRejected = deriveCombatGrowthState({
  pc,
  action:'대검술을 연습한다.',
  scene:[{ kind:'dialogue', speaker_key:'lillia', text:'나는 강적의 압박 속에서 새로운 응용을 깨닫고 자세를 교정했어.' }],
  resolutionLog:resolution('success', [ability('skill', '대검술')]),
  skillChanges:[{ skill:'대검술', amount:3, reason:'릴리아의 대화 속 통찰' }],
});
assert.deepEqual(npcDialogueEvidenceRejected.accepted_skill_experience, [], 'an NPC speaking about their own growth must not authenticate PC growth');

const namedPcTraining = deriveCombatGrowthState({
  pc,
  action:'카일은 대검술을 연습한다.',
  scene:scene('카일은 반복 자세를 교정하며 대검술 동작을 안정시켰다.'),
  resolutionLog:resolution('success', [ability('skill', '대검술')]),
  skillChanges:[{ skill:'대검술', amount:3, reason:'카일의 자세 교정' }],
});
assert.equal(namedPcTraining.accepted_skill_experience[0].amount, 1, 'the canonical PC name must remain valid attribution evidence');

const overlappingSkillNames = deriveCombatGrowthState({
  pc:{ ...pc, skills:{ ...pc.skills, 검술:{ grade:'C', hiddenXp:0 } } },
  action:'대검술 기본 자세를 반복 연습한다.',
  scene:scene('대검술의 손목 각도를 교정하고 반복 동작을 안정시켰다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  skillChanges:[{ skill:'검술', amount:3, reason:'대검술 훈련의 부분 문자열' }, { skill:'대검술', amount:3, reason:'대검술 자세 교정' }],
});
assert.deepEqual(overlappingSkillNames.accepted_skill_experience, [{ skill:'대검술', amount:1, reason:'대검술 자세 교정' }], 'a shorter overlapping skill name must not inherit another skill training mention');

const unownedCompoundNameRejected = deriveCombatGrowthState({
  pc:{ ...pc, skills:{ '검술':{ grade:'C', hiddenXp:0 } } },
  action:'대검술 기본 자세를 반복 연습한다.',
  scene:scene('대검술의 손목 각도를 교정하고 반복 동작을 안정시켰다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  skillChanges:[{ skill:'검술', amount:3, reason:'소유하지 않은 대검술 훈련' }],
});
assert.deepEqual(unownedCompoundNameRejected.accepted_skill_experience, [], 'an unowned compound skill must not count as an exact mention of its shorter suffix');

const questionOnlyRejected = deriveCombatGrowthState({
  pc,
  action:'대검술을 훈련하면 얼마나 성장할까?',
  scene:scene('교관은 반복 훈련과 자세 교정의 원리를 설명했다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  skillChanges:[{ skill:'대검술', amount:2, reason:'훈련 질문' }],
});
assert.deepEqual(questionOnlyRejected.accepted_skill_experience, [], 'a question about training is not a committed growth action');

const conditionalEndingRejected = deriveCombatGrowthState({
  pc,
  action:'대검술을 훈련한다면 얼마나 성장할까?',
  scene:scene('대검술 반복 훈련으로 자세를 교정했다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  skillChanges:[{ skill:'대검술', amount:2, reason:'가정형 훈련 질문' }],
});
assert.deepEqual(conditionalEndingRejected.accepted_skill_experience, [], '한다면 must remain hypothetical rather than satisfy the committed-action guard');

const negatedStimulusRejected = deriveCombatGrowthState({
  pc,
  action:'대검술을 연습한다.',
  scene:scene('손목 각도는 교정되지 않았고 새로운 통찰도 얻지 못했다.'),
  resolutionLog:resolution('failure', [ability('skill', '대검술')]),
  skillChanges:[{ skill:'대검술', amount:2, reason:'교정 시도' }],
});
assert.deepEqual(negatedStimulusRejected.accepted_skill_experience, [], 'negated correction or insight must not authenticate growth');

const laterAffirmativeEvidence = deriveCombatGrowthState({
  pc,
  action:'대검술을 연습한다.',
  scene:scene('처음에는 자세를 교정하지 못했지만, 실패 원인을 파악해 손목 각도를 수정했다.'),
  resolutionLog:resolution('partial', [ability('skill', '대검술')]),
  skillChanges:[{ skill:'대검술', amount:3, reason:'후반의 실패 분석과 수정' }],
});
assert.equal(laterAffirmativeEvidence.accepted_skill_experience[0].amount, 2, 'a scoped early failure must not erase later affirmative learning evidence');

const laterNegatedClaimKeepsCorrection = deriveCombatGrowthState({
  pc,
  action:'대검술을 연습한다.',
  scene:scene('대검술의 손목 각도를 교정했지만 새로운 통찰은 얻지 못했다.'),
  resolutionLog:resolution('partial', [ability('skill', '대검술')]),
  skillChanges:[{ skill:'대검술', amount:3, reason:'손목 각도 교정' }],
});
assert.deepEqual(laterNegatedClaimKeepsCorrection.accepted_skill_experience, [{ skill:'대검술', amount:1, reason:'손목 각도 교정' }], 'negating a later insight must not erase an earlier affirmative correction');

const globalEvidenceNotTransferred = deriveCombatGrowthState({
  pc,
  action:'강적의 연속 공격을 견딘다.',
  scene:scene('죽음의 문턱에서 신체의 호흡과 균형을 교정하며 한계를 넘었다.'),
  resolutionLog:resolution('partial', [ability('skill', '대검술'), ability('stat', '지능')]),
  statChanges:[{ stat:'지능', amount:3, reason:'신체 돌파와 무관한 지능' }],
  skillChanges:[{ skill:'대검술', amount:3, reason:'신체 돌파와 무관한 해결 능력' }],
});
assert.deepEqual(globalEvidenceNotTransferred.accepted_stat_progress, [], 'a sole resolved stat still needs ability-specific learning evidence');
assert.deepEqual(globalEvidenceNotTransferred.accepted_skill_experience, [], 'a sole resolved skill still needs ability-specific learning evidence');

const unrelatedAbilityRejected = deriveCombatGrowthState({
  pc,
  action:'대검술로 강적을 공격한다.',
  scene:scene('강적의 실전 압박 속에서 대검술의 새로운 응용을 시험하고 실패 원인을 파악했다.'),
  resolutionLog:resolution('partial', [ability('skill', '대검술'), ability('stat', '신체', 'support')]),
  statChanges:[{ stat:'신성', amount:3, reason:'전투 경험' }],
  skillChanges:[{ skill:'오러 운용', amount:3, reason:'전투 경험' }, { skill:'없는 기술', amount:3, reason:'전투 경험' }],
});
assert.deepEqual(unrelatedAbilityRejected.accepted_stat_progress, [], 'semantically unrelated stat growth must be rejected');
assert.deepEqual(unrelatedAbilityRejected.accepted_skill_experience, [], 'combat XP must match a used existing resolution ability');

const noResolutionCombatRejected = deriveCombatGrowthState({
  pc,
  action:'대검술로 강적을 공격한다.',
  scene:scene('강적의 실전 압박 속에서 대검술의 새로운 응용을 시험했다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  skillChanges:[{ skill:'대검술', amount:3, reason:'새 응용' }],
});
assert.deepEqual(noResolutionCombatRejected.accepted_skill_experience, [], 'combat skill XP requires a matching structured resolution ability');

const mixedCombatTrainingMustMatchResolution = deriveCombatGrowthState({
  pc,
  action:'강적과 대련하며 대검술의 새로운 응용을 연습한다.',
  scene:scene('강적의 실전 압박 속에서 대검술의 새로운 응용을 시도하고 자세를 교정했다.'),
  resolutionLog:resolution('partial', [ability('skill', '전술분석')]),
  skillChanges:[{ skill:'대검술', amount:3, reason:'혼합 전투 훈련' }],
});
assert.deepEqual(mixedCombatTrainingMustMatchResolution.accepted_skill_experience, [], 'training language must not bypass exact resolution membership in a combat action');

const directStudyWithoutResolution = deriveCombatGrowthState({
  pc,
  action:'전술분석을 연구한다.',
  scene:scene('지난 실패 원인을 분석해 전술적 오류를 수정하고 대응 원리를 이해했다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  statChanges:[{ stat:'지능', amount:5, reason:'전술 실패 분석' }],
  skillChanges:[{ skill:'전술분석', amount:5, reason:'전술 오류 수정' }],
});
assert.equal(directStudyWithoutResolution.accepted_stat_progress[0].amount, 2, 'deliberate study may progress without a combat resolution log');
assert.equal(directStudyWithoutResolution.accepted_skill_experience[0].amount, 2, 'an explicitly trained existing skill may progress without combat resolution');

const equipmentInspectionDoesNotMeanSwordGrowth = deriveCombatGrowthState({
  pc,
  action:'장비를 점검하고 전술분석을 연구한다.',
  scene:scene('장비 점검 뒤 실패 원인을 분석해 전술적 오류를 수정했다.'),
  resolutionLog:{ triggered:false, outcome:'none', abilities:[] },
  statChanges:[{ stat:'신체', amount:2, reason:'장비 점검' }, { stat:'지능', amount:2, reason:'전술 분석' }],
});
assert.deepEqual(equipmentInspectionDoesNotMeanSwordGrowth.accepted_stat_progress, [{ stat:'지능', amount:2, reason:'전술 분석' }], 'the substring 점검 must not make physical growth relevant');

const frozen = deriveCombatGrowthState({
  pc,
  action:'대검술을 연습한다.',
  scene:scene('반복 자세를 교정했다.'),
  resolutionLog:resolution('success', [ability('skill', '대검술')]),
  statChanges:[{ stat:'신체', amount:1, reason:'교정' }],
  skillChanges:[{ skill:'대검술', amount:1, reason:'교정' }],
  allowProgress:false,
});
assert.deepEqual(frozen.accepted_stat_progress, []);
assert.deepEqual(frozen.accepted_skill_experience, [], 'META/AUTO/CONTINUE must freeze both legacy growth arrays');

const bounded = deriveCombatGrowthState({
  pc:{ ...pc, skills:{ 대검술:{grade:'C'}, 전술분석:{grade:'C'}, 투척:{grade:'C'}, 승마:{grade:'C'} } },
  action:'대검술과 전술분석과 투척과 승마를 극한 훈련한다.',
  scene:scene('극한의 압박 속에서 한계를 넘어 결정적 통찰을 얻고 완전히 새로운 응용을 재현했다.'),
  resolutionLog:resolution('success', [ability('skill', '대검술'), ability('skill', '전술분석'), ability('skill', '투척'), ability('skill', '승마'), ability('stat', '신체')]),
  statChanges:['신체','마나','지능','신성'].map((stat) => ({ stat, amount:5, reason:'극한 훈련' })),
  skillChanges:['대검술','전술분석','투척','승마'].map((skill) => ({ skill, amount:5, reason:'극한 훈련' })),
});
assert.ok(bounded.accepted_stat_progress.length <= MAX_COMBAT_STAT_PROGRESS);
assert.ok(bounded.accepted_skill_experience.length <= MAX_COMBAT_SKILL_EXPERIENCE);
const telemetry = compactCombatGrowthTelemetry(bounded);
assert.equal(telemetry.version, '2.0');
assert.ok(telemetry.stat_keys.length <= 2 && telemetry.skill_keys.length <= 3, 'telemetry must stay compact and bounded');

const routerSource = readFileSync(new URL('../../api/chat-router.js', import.meta.url), 'utf8');
const healthSource = readFileSync(new URL('../../api/health.js', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../../api/lib/schema.js', import.meta.url), 'utf8');
assert.match(routerSource, /deriveCombatGrowthState/);
assert.match(routerSource, /\[COMBAT GROWTH V2\]/, 'the single canonical request must receive the growth contract');
assert.match(routerSource, /state_delta\.stat_progress=\[\];data\.turn\.state_delta\.skill_experience=\[\]/, 'META must clear both legacy growth arrays');
assert.match(routerSource, /allowProgress:mode==='game'/, 'AUTO and every frozen mode must fail closed');
assert.match(routerSource, /stat_progress=combatGrowthState\.accepted_stat_progress.*skill_experience=combatGrowthState\.accepted_skill_experience/s, 'only accepted rows may reach the stable runtime');
assert.ok(routerSource.indexOf('const combatGrowthState=deriveCombatGrowthState({') < routerSource.indexOf('const sceneRuntime=localSceneRuntime('), 'growth filtering must run before deterministic State Delta/momentum measurement');
assert.equal((routerSource.match(/await runCore\(req,incoming,mode\)/g) || []).length, 1, 'Combat Growth V2 must preserve one canonical core call');
assert.match(routerSource, /combat_growth_v2:true/);
assert.match(healthSource, /combatGrowth: 'V2 PC-attributed evidence gates/);
assert.doesNotMatch(schemaSource, /combat_growth/i, 'V2 must reuse existing stat/skill delta fields rather than add a new structured-output surface');

console.log('PASS Combat Growth V2 attribution, evidence, resolution relevance, grade caps, freeze, bounds, and one-call regressions');
