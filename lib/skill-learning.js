export const SKILL_LEARNING_VERSION = '1.0';
export const MAX_SKILL_CANDIDATES = 8;
export const MAX_SKILL_LEARNING_CHANGES = 2;

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const GENERIC_SKILL_NAMES = new Set(['새 기술', '새 스킬', '기술', '스킬', '능력', '공격', '방어', '행동', '동작', '연습', '훈련']);
const LEARNING_EVIDENCE_RE = /(훈련|연습|수련|배우|익히|습득|교정|지도|가르|시범|수업|연구|분석|실패|통찰|깨달|요령|원리|재현|대련|실전|강적|새로운\s*응용|training|practice|learn|lesson|teach|correct|insight|drill|sparring|combat)/i;

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

function hasLearningEvidence({ action = '', scene = [], basis = '', reason = '' } = {}) {
  const evidence = [cleanText(action, 1800), visibleSceneText(scene), cleanText(basis, 120), cleanText(reason, 280)].filter(Boolean).join('\n');
  return LEARNING_EVIDENCE_RE.test(evidence);
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
      if (!amount || !basis || !reason || !hasLearningEvidence({ action, scene, basis, reason })) continue;

      const priorEntry = candidateByIdentity(candidates, identity);
      if (!priorEntry && Object.keys(candidates).length >= MAX_SKILL_CANDIDATES) continue;
      const name = priorEntry?.[0] || proposedName;
      const prior = priorEntry?.[1] || { progress: 0, history: [] };
      const nextProgress = Math.min(100, Number(prior.progress || 0) + amount);
      const historyRow = { turn: clampInteger(turnNumber, 0, 1_000_000_000), amount, basis, reason };
      const accepted = { skill: name, amount, basis, reason };
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
