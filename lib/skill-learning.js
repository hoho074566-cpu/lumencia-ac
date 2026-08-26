import { TIME_EFFECT_SOURCE } from './time-plan-reconciliation.js';

export const SKILL_LEARNING_VERSION = '1.0';
export const MAX_SKILL_CANDIDATES = 8;
export const MAX_SKILL_LEARNING_CHANGES = 2;

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const GENERIC_SKILL_NAMES = new Set(['새 기술', '새 스킬', '기술', '스킬', '능력', '공격', '방어', '행동', '동작', '연습', '훈련']);
const LEARNING_EVIDENCE_RE = /(훈련|연습|수련|배우|익히|습득|교정|지도|가르|시범|수업|연구|분석|실패|통찰|깨달|요령|원리|재현|반복|대련|실전|강적|새로운\s*응용|training|practice|learn|lesson|teach|correct|insight|drill|repeat|sparring|combat)/i;
const LEARNING_SPECIFIC_SCENE_RE = /(훈련(?!장|관|실)|연습(?!장|실)|수련(?!장|관|실)|배우|익히|습득|교정|가르|시범|수업|통찰|깨달|요령|(?:교수|교관|선생|스승)[^.!?\n]{0,24}지도|지도[^.!?\n]{0,24}(?:받|교정|가르|훈련|연습)|새로운\s*(?:응용|원리)|(?:원리|실패\s*원인)[^.!?\n]{0,32}(?:분석|발견|이해|교정)|(?:분석|교정)[^.!?\n]{0,32}(?:재현|성공|향상|안정)|(?:연속|반복)[^.!?\n]{0,24}(?:재현|성공)|재현[^.!?\n]{0,24}(?:완성|판정|성공|안정)|training(?!\s+(?:ground|hall|yard|room))|practice(?!\s+(?:ground|field|hall|room))|learn|lesson|teach|correct|insight|drill|new\s+(?:application|principle)|reproduc)/i;
const NEGATED_LEARNING_RE = /(?:훈련|연습|수련|배우|익히|습득|교정|지도|가르|시범|수업|연구|분석|통찰|깨달|재현|반복|대련|실전)[^.!?\n]{0,48}(?:하지\s*않|하지\s*못|지\s*않|지\s*못|안\s*하|않았|없었|금지|거절|거부|중단|그만두)/gi;
const NEGATED_ENGLISH_LEARNING_RE = /\b(?:(?:no|not|without)\s+(?:training|practice|learning|lessons?|teaching|drills?|sparring|combat)|(?:refus|declin)(?:e|ed|es|ing)\s+(?:to\s+)?(?:train|practice|learn|study|drill|spar))\b/gi;
const PLAYER_LEARNING_ACTION_RE = /(?:(?:훈련|연습|수련)(?:을|를)?\s*(?:하|해|했|한다|하고|하며|받|계속하|이어가)|배우|배워|배운|배웠|익히|익혀|익힌|습득(?:하|해|했)|교정(?:하|해|했|받)|(?:교정|지도|가르침)(?:을|를)?\s*받|시범(?:을|를)?\s*따라|(?:반복|재현|분석|연구)(?:하|해|했|한다|하고|하며)|(?:원리|요령)(?:을|를)?\s*(?:깨닫|이해하|익히)|\b(?:train(?:ed|ing|s)?|practic(?:e|ed|ing|es)|learn(?:ed|t|ing|s)?|stud(?:y|ied|ies|ying)|drill(?:ed|ing|s)?|rehears(?:e|ed|ing|es)|analy[sz](?:e|ed|ing|es)|correct(?:ed|ing|s)?|repeat(?:ed|ing|s)?|reproduc(?:e|ed|ing|es))\b)/i;
const PLAYER_COMBAT_ACTION_RE = /(?:공격(?:하|해|했|한다|하고|하며)|방어(?:하|해|했|한다|하고|하며)|회피(?:하|해|했|한다|하고|하며)|싸우|맞서|대련(?:하|해|했|한다|하고|하며)|검(?:을|으로)\s*(?:휘두르|베|찌르)|창(?:을|으로)\s*(?:찌르|휘두르)|활(?:을|로)\s*(?:쏘|겨누)|마법(?:을|로)\s*(?:쓰|시전하|쏘)|주문(?:을|로)\s*(?:쓰|시전하)|\b(?:attack(?:ed|ing|s)?|defend(?:ed|ing|s)?|dodg(?:e|ed|ing|es)|fight(?:ing|s)?|fought|spar(?:red|ring|s)?)\b)/i;
const OBSERVATION_RE = /(?:지켜보|지켜본|관찰|구경|목격|(?:훈련|연습|수련|시범|모습|것|걸|장면)(?:을|를)?\s*(?:보기만|본다|보았다)|\b(?:watch|observe|spectat))/i;
const OBSERVATION_TRANSITION_RE = /(?:지켜보(?:고|고서)|지켜본\s*(?:뒤|후)|관찰(?:하고|한\s*(?:뒤|후))|시범(?:을|를)?\s*본\s*(?:뒤|후)|\b(?:after\s+(?:watching|observing)|watch(?:ed|ing)?\s+then))\s*/i;
const PLAYER_SELF_SUBJECT_RE = /(?:내가|나는|제가|저는|내\s*손으로|PC(?:가|는)|플레이어(?:가|는)|주인공(?:이|은)|Aaa(?:가|는)|\bI\b)/i;
const DIRECT_ACTION_RE = /(?:직접|스스로|몸소|\bpersonally\b)/i;
const THIRD_PARTY_LEARNING_ACTION_RE = /(?:^|\s)(?!(?:내가|나는|제가|저는|PC(?:가|는)?|플레이어(?:가|는)?|주인공(?:이|은)?|Aaa(?:가|는)?)(?:\s|$))[가-힣A-Za-z0-9_-]{2,32}(?:만|이|가|은|는)\s*[^.!?\n,;]{0,64}(?:훈련(?:하|해|했)|연습(?:하|해|했)|수련(?:하|해|했)|배우|배워|배운|배웠|익히|익혀|익힌|습득(?:하|해|했)|(?:반복|재현|분석|연구)(?:하|해|했)|\b(?:train|practic|learn|stud|drill|rehears|analy[sz]|repeat|reproduc))/i;
const THIRD_PARTY_INSTRUCTOR_ACTION_RE = /(?:(?:^|\s)(?:교수|교관|선생|스승|강사)(?:만|이|가|은|는)\s*[^.!?\n,;]{0,64}(?:훈련(?:하|해|했)|연습(?:하|해|했)|수련(?:하|해|했)|교정(?:하|해|했)|지도(?:하|해|했)|가르(?:치|쳐|쳤)|시범(?:을|를)?\s*보(?:이|여|였))|\b(?:instructor|teacher|master)\s+(?:train(?:s|ed|ing)?|practic(?:e|es|ed|ing)|correct(?:s|ed|ing)?|teach(?:es|ing|t|ed)?|demonstrat(?:e|es|ed|ing)))/i;
const PLAYER_RECEIVED_INSTRUCTION_RE = /(?:교정|지도|가르침)(?:을|를)?\s*(?:직접\s*)?받/i;
const THIRD_PARTY_RECEIVED_INSTRUCTION_RE = /(?:^|\s)(?!(?:내가|나는|제가|저는|PC(?:가|는)?|플레이어(?:가|는)?|주인공(?:이|은)?|Aaa(?:가|는)?)(?:\s|$))[가-힣A-Za-z0-9_-]{2,32}(?:만|이|가|은|는)\s*[^.!?\n,;]{0,32}(?:교정|지도|가르침)(?:을|를)?\s*(?:직접\s*)?받/i;
const THIRD_PARTY_COMBAT_ACTION_RE = /(?:^|\s)(?!(?:내가|나는|제가|저는|PC(?:가|는)?|플레이어(?:가|는)?|주인공(?:이|은)?|Aaa(?:가|는)?)(?:\s|$))[가-힣A-Za-z0-9_-]{2,32}(?:만|이|가|은|는)\s*[^.!?\n,;]{0,64}(?:공격(?:하|해|했)|방어(?:하|해|했)|회피(?:하|해|했)|싸우|맞서|대련(?:하|해|했)|\b(?:attack|defend|dodg|fight|fought|spar))/i;

const clampInteger = (value, min, max, fallback = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
};

const cleanText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const skillIdentity = (value) => cleanText(value, 80).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');

function validSkillName(value) {
  const name = cleanText(value, 48);
  if (name.length < 2 || FORBIDDEN_KEYS.has(name) || GENERIC_SKILL_NAMES.has(name)) return false;
  if (/[\u0000-\u001f\u007f\n\r{}<>]/.test(name)) return false;
  if (['신체', '마나', '지능', '신성'].includes(name)) return false;
  return true;
}

function normalizedExistingSkillNames(skills = {}) {
  return new Set(Object.keys(skills && typeof skills === 'object' && !Array.isArray(skills) ? skills : {}).map(skillIdentity).filter(Boolean));
}

function normalizeHistory(history, skill) {
  return (Array.isArray(history) ? history : []).slice(-6).map((raw) => ({
    turn: clampInteger(raw?.turn, 0, 1_000_000_000),
    amount: clampInteger(raw?.amount, 1, 15),
    basis: cleanText(raw?.basis, 120),
    reason: cleanText(raw?.reason, 280),
  })).filter((row) => row.amount > 0 && row.basis && row.reason && skill);
}

export function normalizeSkillCandidates(value = {}, { existingSkills = {}, maxCandidates = MAX_SKILL_CANDIDATES } = {}) {
  const existing = normalizedExistingSkillNames(existingSkills);
  const rows = [];
  for (const [rawName, rawValue] of Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})) {
    const name = cleanText(rawName, 48);
    const identity = skillIdentity(name);
    if (!validSkillName(name) || !identity || existing.has(identity)) continue;
    const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
    const progress = clampInteger(raw.progress, 0, 99);
    if (progress <= 0) continue;
    const basis = cleanText(raw.basis, 120);
    const reason = cleanText(raw.reason, 280);
    const updatedTurn = clampInteger(raw.updated_turn ?? raw.updatedTurn, 0, 1_000_000_000);
    rows.push([name, {
      progress,
      basis: basis || null,
      reason: reason || null,
      updated_turn: updatedTurn,
      history: normalizeHistory(raw.history, name),
    }, identity]);
  }
  rows.sort((a, b) => Number(b[1].updated_turn || 0) - Number(a[1].updated_turn || 0) || Number(b[1].progress || 0) - Number(a[1].progress || 0) || a[0].localeCompare(b[0], 'ko'));
  const seen = new Set();
  const uniqueRows = [];
  for (const [name, row, identity] of rows) {
    if (seen.has(identity)) continue;
    seen.add(identity);
    uniqueRows.push([name, row]);
  }
  return Object.fromEntries(uniqueRows.slice(0, Math.max(0, Math.min(MAX_SKILL_CANDIDATES, Number(maxCandidates) || MAX_SKILL_CANDIDATES))));
}

function visibleSceneText(scene = []) {
  return (Array.isArray(scene) ? scene : []).slice(0, 24).map((row) => cleanText(row?.text, 900)).filter(Boolean).join('\n');
}

function affirmativeLearningText(value, max) {
  return cleanText(value, max)
    .replace(NEGATED_LEARNING_RE, ' ')
    .replace(NEGATED_ENGLISH_LEARNING_RE, ' ');
}

function hasSelfOwnedAction(segment, actionPattern) {
  const selfStart = PLAYER_SELF_SUBJECT_RE.exec(segment);
  if (!selfStart) return false;
  const selfTail = segment.slice(Number(selfStart.index || 0));
  return actionPattern.test(selfTail) && !THIRD_PARTY_LEARNING_ACTION_RE.test(selfTail) && !THIRD_PARTY_INSTRUCTOR_ACTION_RE.test(selfTail) && !THIRD_PARTY_COMBAT_ACTION_RE.test(selfTail);
}

function hasPlayerOwnedLearningAction(value, max = 1800) {
  const text = affirmativeLearningText(value, max);
  const actionPattern = new RegExp(`(?:${PLAYER_LEARNING_ACTION_RE.source}|${PLAYER_COMBAT_ACTION_RE.source})`, 'i');
  for (const rawSegment of text.split(/[.!?\n,;]+/)) {
    const segment = cleanText(rawSegment, 600);
    if (!segment || !actionPattern.test(segment)) continue;
    const hasThirdPartyAction = THIRD_PARTY_LEARNING_ACTION_RE.test(segment) || THIRD_PARTY_INSTRUCTOR_ACTION_RE.test(segment) || THIRD_PARTY_COMBAT_ACTION_RE.test(segment);
    const hasSelfAction = hasSelfOwnedAction(segment, actionPattern);
    if (OBSERVATION_RE.test(segment)) {
      const transition = OBSERVATION_TRANSITION_RE.exec(segment);
      const tail = transition ? segment.slice(Number(transition.index || 0) + transition[0].length) : '';
      const directStart = !hasThirdPartyAction ? DIRECT_ACTION_RE.exec(segment) : null;
      const directTail = directStart ? segment.slice(Number(directStart.index || 0)) : '';
      if ((tail && actionPattern.test(tail) && !THIRD_PARTY_LEARNING_ACTION_RE.test(tail) && !THIRD_PARTY_INSTRUCTOR_ACTION_RE.test(tail) && !THIRD_PARTY_COMBAT_ACTION_RE.test(tail)) || hasSelfAction || (directTail && actionPattern.test(directTail))) return true;
      continue;
    }
    if (hasThirdPartyAction && !hasSelfAction) continue;
    return true;
  }
  return false;
}

function hasPlayerAttributedSceneEvidence(value, max = 21_600) {
  const text = affirmativeLearningText(value, max);
  for (const rawSegment of text.split(/[.!?\n,;]+/)) {
    const segment = cleanText(rawSegment, 900);
    if (!segment || !LEARNING_SPECIFIC_SCENE_RE.test(segment)) continue;
    const hasSelfAction = hasSelfOwnedAction(segment, PLAYER_LEARNING_ACTION_RE);
    if (OBSERVATION_RE.test(segment) && !hasSelfAction) continue;
    const hasThirdPartyLearning = THIRD_PARTY_LEARNING_ACTION_RE.test(segment) || THIRD_PARTY_INSTRUCTOR_ACTION_RE.test(segment);
    const hasPlayerReceipt = PLAYER_RECEIVED_INSTRUCTION_RE.test(segment) && !THIRD_PARTY_RECEIVED_INSTRUCTION_RE.test(segment);
    if (hasThirdPartyLearning && !hasPlayerReceipt && !hasSelfAction) continue;
    return true;
  }
  return false;
}

function hasLearningEvidence({ action = '', scene = [] } = {}) {
  const actionText = cleanText(action, 1800);
  const sceneText = visibleSceneText(scene);
  return hasPlayerOwnedLearningAction(actionText) && hasPlayerAttributedSceneEvidence(sceneText);
}

export function filterExistingSkillExperience(changes = [], existingSkills = {}) {
  const canonicalByIdentity = new Map();
  for (const rawName of Object.keys(existingSkills && typeof existingSkills === 'object' && !Array.isArray(existingSkills) ? existingSkills : {})) {
    const name = cleanText(rawName, 80);
    const identity = skillIdentity(name);
    if (name && identity && !canonicalByIdentity.has(identity)) canonicalByIdentity.set(identity, name);
  }

  return (Array.isArray(changes) ? changes : []).slice(0, 12).flatMap((raw) => {
    const canonicalName = canonicalByIdentity.get(skillIdentity(raw?.skill));
    if (!canonicalName) return [];
    return [{ ...raw, skill: canonicalName }];
  });
}

function candidateByIdentity(candidates, identity) {
  return Object.entries(candidates).find(([name]) => skillIdentity(name) === identity) || null;
}

export function deriveSkillLearningState({
  existingSkills = {},
  previousCandidates = {},
  changes = [],
  action = '',
  scene = [],
  turnNumber = 0,
  allowProgress = true,
} = {}) {
  const candidates = normalizeSkillCandidates(previousCandidates, { existingSkills });
  const existing = normalizedExistingSkillNames(existingSkills);
  const acceptedChanges = [];
  const unlockedSkills = [];
  const changedKeys = [];
  const handled = new Set();

  if (allowProgress) {
    for (const raw of (Array.isArray(changes) ? changes : []).slice(0, 8)) {
      if (acceptedChanges.length >= MAX_SKILL_LEARNING_CHANGES) break;
      const proposedName = cleanText(raw?.skill, 48);
      const identity = skillIdentity(proposedName);
      if (!validSkillName(proposedName) || !identity || existing.has(identity) || handled.has(identity)) continue;
      const amount = clampInteger(raw?.amount, 1, 15, 0);
      const basis = cleanText(raw?.basis, 120);
      const reason = cleanText(raw?.reason, 280);
      if (!amount || !basis || !reason || !hasLearningEvidence({ action, scene })) continue;

      const priorEntry = candidateByIdentity(candidates, identity);
      if (!priorEntry && Object.keys(candidates).length >= MAX_SKILL_CANDIDATES) continue;
      const name = priorEntry?.[0] || proposedName;
      const prior = priorEntry?.[1] || { progress: 0, history: [] };
      const nextProgress = Math.min(100, Number(prior.progress || 0) + amount);
      const historyRow = { turn: clampInteger(turnNumber, 0, 1_000_000_000), amount, basis, reason };
      const accepted = { skill: name, amount, basis, reason, ...(Number.isInteger(raw?.[TIME_EFFECT_SOURCE])?{[TIME_EFFECT_SOURCE]:raw[TIME_EFFECT_SOURCE]}:{}) };
      handled.add(identity);
      acceptedChanges.push(accepted);
      changedKeys.push(name);

      if (nextProgress >= 100) {
        delete candidates[name];
        existing.add(identity);
        unlockedSkills.push({ skill: name, grade: 'F', hiddenXp: 0, basis, reason });
        continue;
      }

      candidates[name] = {
        progress: nextProgress,
        basis,
        reason,
        updated_turn: clampInteger(turnNumber, 0, 1_000_000_000),
        history: [...(Array.isArray(prior.history) ? prior.history : []), historyRow].slice(-6),
      };
    }
  }

  return {
    version: SKILL_LEARNING_VERSION,
    candidates: normalizeSkillCandidates(candidates, { existingSkills: Object.fromEntries([...existing].map((identity) => [identity, true])) }),
    accepted_changes: acceptedChanges,
    unlocked_skills: unlockedSkills,
    changed_skill_keys: [...new Set(changedKeys)].slice(0, MAX_SKILL_LEARNING_CHANGES),
  };
}

export function compactSkillLearningTelemetry(state = {}) {
  const candidates = normalizeSkillCandidates(state?.candidates || {});
  return {
    version: SKILL_LEARNING_VERSION,
    candidate_keys: Object.keys(candidates).slice(0, MAX_SKILL_CANDIDATES),
    changed_skill_keys: (Array.isArray(state?.changed_skill_keys) ? state.changed_skill_keys : []).map((value) => cleanText(value, 48)).filter(Boolean).slice(0, MAX_SKILL_LEARNING_CHANGES),
    unlocked_skill_keys: (Array.isArray(state?.unlocked_skills) ? state.unlocked_skills : []).map((row) => cleanText(row?.skill, 48)).filter(Boolean).slice(0, MAX_SKILL_LEARNING_CHANGES),
  };
}
