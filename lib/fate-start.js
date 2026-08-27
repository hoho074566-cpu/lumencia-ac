export const FATE_START_GENDERS = Object.freeze({
  male: '남성',
  female: '여성',
});

export const FATE_START_SOCIAL_CLASSES = Object.freeze({
  commoner: '평민',
  fallen_noble: '몰락귀족',
});

export const FATE_START_DEPARTMENTS = Object.freeze([
  '기사과 1학년',
  '마법과 1학년',
  '신학부 1학년',
  '일반학부 1학년',
]);

export function createFreeCharacterCreation() {
  return { mode: 'free', fateStart: null };
}

export function createFateCharacterCreation({ gender, socialClass, department } = {}) {
  if (!Object.hasOwn(FATE_START_GENDERS, gender)) throw new Error('운명 시작 성별을 선택해야 함.');
  if (!Object.hasOwn(FATE_START_SOCIAL_CLASSES, socialClass)) throw new Error('운명 시작 신분을 선택해야 함.');
  if (!FATE_START_DEPARTMENTS.includes(department)) throw new Error('운명 시작 학과를 선택해야 함.');
  return {
    mode: 'fate',
    fateStart: {
      version: 1,
      gender,
      socialClass,
      department,
    },
  };
}

export function normalizeCharacterCreation(value) {
  if (!value || value.mode !== 'fate') return createFreeCharacterCreation();
  try {
    return createFateCharacterCreation(value.fateStart);
  } catch {
    return createFreeCharacterCreation();
  }
}

export function fateStartLabels(value) {
  const normalized = createFateCharacterCreation(value).fateStart;
  return {
    gender: FATE_START_GENDERS[normalized.gender],
    socialClass: FATE_START_SOCIAL_CLASSES[normalized.socialClass],
    department: normalized.department,
  };
}
