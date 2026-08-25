export const COMBAT_GROWTH_VERSION = '2.0';
export const MAX_COMBAT_STAT_PROGRESS = 2;
export const MAX_COMBAT_SKILL_EXPERIENCE = 3;

const GRADE_LADDER = Object.freeze([
  'F', 'F+', 'E-', 'E', 'E+', 'D-', 'D', 'D+', 'C-', 'C', 'C+',
  'B-', 'B', 'B+', 'A-', 'A', 'A+', 'A++', 'S-', 'S', 'S+', 'S++',
  'SS-', 'SS', 'SS+', 'SSS-', 'SSS', 'SSS+',
]);
const STAT_KEYS = new Set(['신체', '마나', '지능', '신성']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const PLAYER_GROWTH_ACTION_RE = /(?:훈련|연습|수련|단련|배우|익히|학습|공부|(?:교정|지도|가르침)(?:을|를)?\s*받|분석(?:하|해|했|한다)|연구(?:하|해|했|한다)|기도(?:하|해|했|한다)|명상(?:하|해|했|한다)|공격(?:하|해|했|한다)|방어(?:하|해|했|한다)|회피(?:하|해|했|한다)|버티|버틴|버텨|견디|견딘|견뎌|집중|싸우|맞서|대련|결투|(?:검|창|도끼|활|지팡이|주문|마법|오러|마나|신성력)(?:을|를|으로|로)?\s*(?:휘두르|베|찌르|쏘|시전|사용|운용|제어|순환|감지)|\b(?:train|practice|drill|study|learn|analy[sz]e|meditat|pray|endure|withstand|focus|attack|defend|dodge|fight|spar|cast)\w*\b)/i;
const DELIBERATE_TRAINING_RE = /(?:훈련|연습|수련|단련|배우|익히|학습|공부|(?:교정|지도|가르침)(?:을|를)?\s*받|분석(?:하|해|했|한다)|연구(?:하|해|했|한다)|기도(?:하|해|했|한다)|명상(?:하|해|했|한다)|\b(?:train|practice|drill|study|learn|analy[sz]e|meditat|pray)\w*\b)/i;
const COMBAT_ACTION_RE = /(?:공격|방어|회피|버티|버틴|버텨|견디|견딘|견뎌|싸우|맞서|대련|결투|베어|베고|찌르|쏘|패링|검기|오러|마법(?:을|로)?\s*(?:쓰|시전|쏘)|\b(?:attack|defend|dodge|endure|withstand|fight|fought|spar|combat)\w*\b)/i;
const NEGATED_ACTION_RE = /(?:훈련|연습|수련|단련|배우|익히|학습|공부|지도|가르침|분석|연구|기도|명상|공격|방어|회피|버티|버틴|버텨|견디|견딘|견뎌|집중|싸우|대련|결투)[^.!?\n]{0,40}(?:하지\s*않|하지\s*못|안\s*하|않았|못했|거부|거절|중단|그만두)|\b(?:(?:do\s+)?not|never|without|refus\w*)[^.!?\n]{0,28}(?:train|practice|fight|attack|study|learn|drill)\w*\b/gi;
const QUESTION_RE = /[?？]|(?:어떻게|왜|얼마나|무엇|뭐가|가능한가|할까|해도\s*될까|하면|한다면|라면|가정(?:하|했|한다|하면)|할\s*경우|\b(?:how|why|what|can|could|would|should|if)\b)/i;
const COMMITTED_ACTION_RE = /(?:한다|해본다|맞선다|싸운다|공격한다|방어한다|회피한다)(?=$|[\s.!?,;:)」』’”])|(?:^|[.!?\n]\s*)I\s+(?:will\s+)?(?:train|practice|study|fight|attack|defend|dodge|cast)\b/i;
const OBSERVATION_RE = /(?:지켜보|관찰|구경|목격|보기만|(?:^|[\s.!?])(?:본다|보았다)(?=$|[\s.!?])|\b(?:watch|observe|spectat)\w*\b)/i;
const OBSERVATION_TO_ACTION_RE = /(?:지켜본|관찰한|시범을?\s*본)\s*(?:뒤|후)|(?:지켜보|관찰)고\s*(?:직접|곧바로)|\bafter\s+(?:watching|observing)\b/i;
const SELF_SUBJECT_RE = /(?:내가|나는|제가|저는|PC(?:가|는)|플레이어(?:가|는)|주인공(?:이|은)|Aaa(?:가|는)|\bI\b)/i;
const THIRD_PARTY_ACTION_RE = /(?:^|\s)(?!(?:내가|나는|제가|저는|PC(?:가|는)?|플레이어(?:가|는)?|주인공(?:이|은)?|Aaa(?:가|는)?)(?:\s|$))[가-힣A-Za-z0-9_-]{2,32}(?:만|이|가|은|는)\s*[^.!?\n,;]{0,72}(?:훈련|연습|수련|단련|학습|공부|분석|공격|방어|회피|버티|버틴|버텨|견디|견딘|견뎌|집중|싸우|맞서|대련|결투|\b(?:train|practice|study|fight|attack|defend|dodge|endure|withstand|spar)\w*\b)/i;
const ENGLISH_THIRD_PARTY_ACTION_RE = /\b(?!(?:I|We|we|You|you)\b)(?:[A-Z][A-Za-z0-9_-]{1,31}|He|She|They|he|she|they|(?:The|the)\s+(?:NPC|npc|student|teacher|instructor|opponent|enemy))\s+(?:directly\s+|personally\s+)?(?:trains?|trained|training|practices?|practiced|practicing|drills?|drilled|drilling|studies|studied|learns?|learned|learning|analy[sz]es?|analy[sz]ed|meditates?|meditated|prays?|prayed|endures?|endured|withstands?|withstood|focuses|focused|attacks?|attacked|defends?|defended|dodges?|dodged|fights?|fought|spars?|sparred|casts?|cast)\b/;
const THIRD_PARTY_CAUSATIVE_RE = /(?:[가-힣A-Za-z0-9_-]{2,32}(?:에게|한테|를|을)\s*)[^.!?\n,;]{0,40}(?:훈련|연습|수련|단련|학습|공부)(?:을|를)?\s*(?:시키|하라고|명령|부탁)|\b(?:make|order|tell|ask)\s+[A-Za-z0-9_-]{2,32}\s+to\s+(?:train|practice|study|fight)\b/i;

const BASIC_STIMULUS_RE = /(?:훈련(?!장|관|실)|연습(?!장|실)|수련(?!장|관|실)|단련|반복[^.!?\n]{0,32}(?:자세|동작|호흡|제어|순환|성공|재현)|교정|지도(?:를|을)?\s*받|가르침|(?:지시|조언|가르침)(?:을|를)?\s*(?:적용|반영)(?:한|해|하여|해서)?[^.!?\n]{0,40}(?:반복|자세|동작|호흡|제어|순환|원인|오류|문제|성공)|실패\s*원인[^.!?\n]{0,24}(?:분석|파악)|분석[^.!?\n]{0,28}(?:이해|수정|개선)|통찰|깨달|요령|원리[^.!?\n]{0,24}(?:이해|익힘)|적응|\b(?:training|practice|drill|correction|instruction|insight|adaptation|failure\s+analysis)\b)/i;
const CHALLENGE_STIMULUS_RE = /(?:(?:강적|상위\s*상대|격상\s*상대|실전|대련|전투)[^.!?\n]{0,52}(?:압박|적응|교정|통찰|응용|한계|실패\s*원인)|(?:압박|새로운\s*응용|정확한\s*교정|연속\s*실패|실패\s*원인|전술적\s*분석)[^.!?\n]{0,52}(?:재현|성공|파악|수정|개선|돌파)|\b(?:stronger\s+opponent|combat\s+pressure|new\s+application|precise\s+correction|failure\s+analysis|meaningful\s+pressure)\b)/i;
const DECISIVE_STIMULUS_RE = /(?:생사의\s*경계|죽음의\s*문턱|극한(?:의)?\s*(?:압박|상황|부하|한계)|한계를\s*(?:넘|돌파)|결정적\s*(?:통찰|깨달음|교정|돌파)|근본(?:적인)?\s*(?:원리|오류)[^.!?\n]{0,28}(?:깨닫|파악|수정)|완전히\s*새로운\s*응용[^.!?\n]{0,28}(?:성공|재현)|\b(?:life[- ]or[- ]death|extreme\s+pressure|decisive\s+insight|fundamental\s+breakthrough|beyond\s+(?:the\s+)?limit)\b)/i;
const THIRD_PARTY_STIMULUS_RE = /(?:^|\s)(?!(?:내가|나는|제가|저는|PC(?:가|는)?|플레이어(?:가|는)?|주인공(?:이|은)?|Aaa(?:가|는)?)(?:\s|$))[가-힣A-Za-z0-9_-]{2,32}(?:만|이|가|은|는)\s*[^.!?\n,;]{0,72}(?:훈련|연습|수련|단련|교정|지시|조언|가르침|통찰|깨달|적응|한계|압박|\b(?:train|practice|insight|adapt|pressure)\w*\b)/i;
const ENGLISH_THIRD_PARTY_STIMULUS_RE = /\b(?:(?!(?:I|We|You|They)\b)(?:[A-Z][A-Za-z0-9_-]{1,31}|He|She|he|she|(?:The|the)\s+(?:NPC|npc|student|teacher|instructor|opponent|enemy))\s+(?:(?:directly|personally|repeatedly|successfully|finally)\s+)*(?:trains|trained|practices|practiced|drills|drilled|studies|studied|learns|learned|corrects|corrected|adapts|adapted|endures|endured|withstands|withstood|gains|gained|achieves|achieved|breaks|broke)|(?:They|they)\s+(?:(?:directly|personally|repeatedly|successfully|finally)\s+)*(?:train|trained|practice|practiced|drill|drilled|study|studied|learn|learned|correct|corrected|adapt|adapted|endure|endured|withstand|withstood|gain|gained|achieve|achieved|break|broke))\b/;
const NEGATED_STIMULUS_RE = /(?:훈련|연습|수련|단련|반복|교정|지도|분석|통찰|깨달|적응|응용|돌파|한계)(?:(?!(?:훈련|연습|수련|단련|반복|교정|지도|분석|통찰|깨달|적응|응용|돌파|한계))[^.!?\n]){0,48}(?:하지\s*않|하지\s*못|되지\s*않|안\s*되|못했|못하|얻지\s*못|깨닫지\s*못|파악하지\s*못|없었|일어나지\s*않|실패했)|\b(?:(?:no|not|without)\s+(?:training|practice|insight|adaptation|breakthrough)|fail(?:ed|s|ing)?\s+to\s+(?:learn|adapt|understand|correct))\b/gi;

const STAT_RELEVANCE = Object.freeze({
  신체: /(?:신체|육체|근력|체력|지구력|반응|민첩|균형|자세|호흡|보법|발끝|무게\s*중심|대검술?|검술|검기|(?:검|창|도끼|활)(?:을|를|으로|로)|격투|회피|방어|달리|physical|strength|stamina|reflex|agility)/i,
  마나: /(?:마나|오러|마력|마법|주문|순환|출력|제어|감지|회복|mana|aura|magic|spell|circulation|control)/i,
  지능: /(?:지능|분석|전술|전략|연구|이론|계산|학습|해석|intelligence|analysis|tactic|strategy|theory|study)/i,
  신성: /(?:신성|신성력|기도|교리|성법|축복|성력|divine|holy|prayer|doctrine|blessing)/i,
});

const cleanText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const identity = (value) => cleanText(value, 80).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
const escapeRegExp = (value) => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clampInteger = (value, min, max, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
};
const positiveProgressAmount = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return 0;
  return Math.min(5, Math.trunc(number));
};

function affirmativeActionText(value) {
  return cleanText(value, 1800).replace(NEGATED_ACTION_RE, ' ');
}

function hasThirdPartyAction(segment) {
  return THIRD_PARTY_ACTION_RE.test(segment) || ENGLISH_THIRD_PARTY_ACTION_RE.test(segment);
}

function hasThirdPartyStimulus(segment) {
  return THIRD_PARTY_STIMULUS_RE.test(segment) || ENGLISH_THIRD_PARTY_STIMULUS_RE.test(segment);
}

function stripPlayerSubject(segment, pcName = '') {
  let stripped = cleanText(segment, 900).replace(/(?:^|\s)(?:내가|나는|제가|저는|PC(?:가|는)|플레이어(?:가|는)|주인공(?:이|은)|Aaa(?:가|는)|I)(?=\s)/gi, ' ');
  const name = cleanText(pcName, 80);
  if (name) {
    stripped = stripped.replace(new RegExp(`(?:^|\\s)${escapeRegExp(name)}(?:이|가|은|는)?(?=\\s)`, 'gi'), ' ');
  }
  return stripped;
}

function hasNonPlayerThirdPartyAction(segment, pcName = '') {
  return hasThirdPartyAction(stripPlayerSubject(segment, pcName));
}

function hasNonPlayerThirdPartyStimulus(segment, pcName = '') {
  return hasThirdPartyStimulus(stripPlayerSubject(segment, pcName));
}

function playerOwnsGrowthAction(action = '', pcName = '') {
  const text = affirmativeActionText(action);
  if (!PLAYER_GROWTH_ACTION_RE.test(text)) return false;
  if (QUESTION_RE.test(text) && !COMMITTED_ACTION_RE.test(text)) return false;
  for (const rawSegment of text.split(/[.!?\n,;]+/)) {
    const segment = cleanText(rawSegment, 600);
    if (!segment || !PLAYER_GROWTH_ACTION_RE.test(segment)) continue;
    if (OBSERVATION_RE.test(segment)) {
      const transition = OBSERVATION_TO_ACTION_RE.exec(segment);
      const tail = transition ? segment.slice(Number(transition.index || 0) + transition[0].length) : '';
      if (tail && PLAYER_GROWTH_ACTION_RE.test(tail) && !hasNonPlayerThirdPartyAction(tail, pcName)) return true;
      continue;
    }
    if (THIRD_PARTY_CAUSATIVE_RE.test(segment)) continue;
    if (hasNonPlayerThirdPartyAction(segment, pcName)) continue;
    return true;
  }
  return false;
}

function pcNamedInSegment(segment, pcName) {
  const name = cleanText(pcName, 80);
  return Boolean(name) && new RegExp(`${escapeRegExp(name)}(?:이|가|은|는|도|에게|의)?`).test(segment);
}

function pcSubjectInSegment(segment, pcName) {
  const name = cleanText(pcName, 80);
  if (!name) return false;
  return new RegExp(`(?:^|\\s)${escapeRegExp(name)}(?:(?:이|가|은|는)(?=$|\\s|[,.!?])|(?=\\s))`, 'i').test(segment);
}

function pcRecipientInSegment(segment, pcName) {
  const name = cleanText(pcName, 80);
  if (!name) return false;
  return new RegExp(`${escapeRegExp(name)}(?:에게|한테|의|을|를)(?=$|\\s|[,.!?])`, 'i').test(segment);
}

function sceneEvidence(scene = [], pcName = '') {
  let tier = 0;
  const evidenceSegments = [];
  for (const row of (Array.isArray(scene) ? scene : []).slice(0, 24)) {
    const dialogue = row?.kind === 'dialogue';
    for (const rawSegment of cleanText(row?.text, 900).split(/[.!?\n,;]+/)) {
      const segment = cleanText(rawSegment, 900).replace(NEGATED_STIMULUS_RE, ' ');
      if (!segment) continue;
      const playerNamed = pcNamedInSegment(segment, pcName);
      const playerSubject = pcSubjectInSegment(segment, pcName) || (!dialogue && SELF_SUBJECT_RE.test(segment));
      const playerAddressed = (dialogue && playerNamed) || pcRecipientInSegment(segment, pcName) || /(?:너(?:는|가|의|에게|도|를)?|네(?:가|게|것|자세|동작|검|마나|오러)|당신(?:은|이|의|에게|도|을|를)?|PC(?:가|는|의|에게|도|를)?|플레이어(?:가|는|의|에게|도|를)?|주인공(?:이|은|의|에게|도|을|를)?)/i.test(segment);
      if (dialogue && !playerAddressed) continue;
      if (hasNonPlayerThirdPartyStimulus(segment, pcName) && !playerAddressed) continue;
      if (!playerSubject && !playerAddressed && hasThirdPartyStimulus(segment)) continue;
      let segmentTier = 0;
      if (DECISIVE_STIMULUS_RE.test(segment)) segmentTier = 3;
      else if (CHALLENGE_STIMULUS_RE.test(segment)) segmentTier = 2;
      else if (BASIC_STIMULUS_RE.test(segment)) segmentTier = 1;
      if (!segmentTier) continue;
      tier = Math.max(tier, segmentTier);
      evidenceSegments.push({ text:segment, tier:segmentTier });
    }
  }
  return { tier, text:evidenceSegments.map((row) => row.text).join('\n'), segments:evidenceSegments };
}

function canonicalSkillMap(skills = {}) {
  const map = new Map();
  for (const [rawName, rawValue] of Object.entries(skills && typeof skills === 'object' && !Array.isArray(skills) ? skills : {})) {
    const name = cleanText(rawName, 80);
    const key = identity(name);
    if (!name || !key || FORBIDDEN_KEYS.has(name) || map.has(key)) continue;
    map.set(key, { name, grade: cleanText(rawValue?.grade ?? rawValue, 24) });
  }
  return map;
}

function skillMentionedExactly(text, name) {
  const haystack = cleanText(text, 2400).normalize('NFKC').toLocaleLowerCase('ko-KR');
  const normalizedName = cleanText(name, 80).normalize('NFKC').toLocaleLowerCase('ko-KR');
  if (!haystack || !normalizedName) return false;
  const target = normalizedName.split(/\s+/).map(escapeRegExp).join('\\s*');
  const particle = '(?:은|는|이|가|을|를|의|에|에서|에게|한테|도|만|과|와|으로|로|부터|까지)';
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${target}(?=$|[^\\p{L}\\p{N}_]|${particle}(?=$|[^\\p{L}\\p{N}_]))`, 'u').test(haystack);
}

function gradeAwardCap(grade, evidenceTier) {
  const index = GRADE_LADDER.indexOf(cleanText(grade, 24));
  if (index < 0 || evidenceTier <= 0) return 0;
  if (index >= 22) return evidenceTier >= 3 ? 1 : 0;
  if (index >= 18) return evidenceTier >= 3 ? 2 : evidenceTier >= 2 ? 1 : 0;
  if (index >= 11) return evidenceTier >= 3 ? 3 : evidenceTier >= 2 ? 2 : 1;
  return evidenceTier >= 3 ? 5 : evidenceTier >= 2 ? 3 : 1;
}

function resolutionAbilitySets(resolutionLog = {}) {
  const sets = { skill:new Set(), stat:new Set() };
  if (!resolutionLog?.triggered || !['success', 'partial', 'failure'].includes(resolutionLog?.outcome)) return { ...sets, triggered:false };
  for (const raw of (Array.isArray(resolutionLog.abilities) ? resolutionLog.abilities : []).slice(0, 5)) {
    if (!sets[raw?.kind]) continue;
    const key = identity(raw?.name);
    if (key) sets[raw.kind].add(key);
  }
  return { ...sets, triggered:sets.skill.size > 0 || sets.stat.size > 0 };
}

function skillIsRelevant(name, action, resolution, deliberateTraining, combatAction) {
  const key = identity(name);
  if (resolution.skill.has(key)) return true;
  if (combatAction) return false;
  const directlyNamed = skillMentionedExactly(action, name);
  if (deliberateTraining && directlyNamed) return true;
  return false;
}

function statIsRelevant(stat, action, sceneText, resolution) {
  if (resolution.stat.has(identity(stat))) return true;
  return Boolean(STAT_RELEVANCE[stat]?.test(`${action}\n${sceneText}`));
}

function skillEvidenceTier(name, action, evidence, deliberateTraining) {
  const direct = (Array.isArray(evidence?.segments) ? evidence.segments : []).filter((row) => skillMentionedExactly(row?.text, name));
  if (direct.length) return Math.max(...direct.map((row) => Number(row?.tier || 0)));
  if (deliberateTraining && skillMentionedExactly(action, name)) return Number(evidence?.tier || 0);
  return 0;
}

function statEvidenceTier(stat, evidence) {
  const direct = (Array.isArray(evidence?.segments) ? evidence.segments : []).filter((row) => STAT_RELEVANCE[stat]?.test(row?.text || ''));
  if (direct.length) return Math.max(...direct.map((row) => Number(row?.tier || 0)));
  return 0;
}

export function deriveCombatGrowthState({
  pc = {},
  statChanges = [],
  skillChanges = [],
  action = '',
  scene = [],
  resolutionLog = {},
  allowProgress = true,
} = {}) {
  const proposedStats = Array.isArray(statChanges) ? statChanges.slice(0, 8) : [];
  const proposedSkills = Array.isArray(skillChanges) ? skillChanges.slice(0, 12) : [];
  const acceptedStats = [];
  const acceptedSkills = [];
  const actionOwned = allowProgress && playerOwnsGrowthAction(action, pc?.name);
  const evidence = actionOwned ? sceneEvidence(scene, pc?.name) : { tier:0, text:'', segments:[] };
  const evidenceTier = evidence.tier;
  const sceneText = evidence.text;
  const resolution = resolutionAbilitySets(resolutionLog);
  const deliberateTraining = DELIBERATE_TRAINING_RE.test(affirmativeActionText(action));
  const combatAction = COMBAT_ACTION_RE.test(affirmativeActionText(action));
  const skills = canonicalSkillMap(pc?.skills);
  const stats = pc?.stats && typeof pc.stats === 'object' && !Array.isArray(pc.stats) ? pc.stats : {};
  const handledStats = new Set();
  const handledSkills = new Set();

  if (allowProgress && actionOwned && evidenceTier > 0) {
    for (const raw of proposedStats) {
      if (acceptedStats.length >= MAX_COMBAT_STAT_PROGRESS) break;
      const stat = cleanText(raw?.stat, 16);
      if (!STAT_KEYS.has(stat) || handledStats.has(stat) || !stats[stat]) continue;
      const reason = cleanText(raw?.reason, 240);
      const amount = positiveProgressAmount(raw?.amount);
      const grade = cleanText(stats[stat]?.grade ?? stats[stat], 24);
      const cap = gradeAwardCap(grade, statEvidenceTier(stat, evidence));
      if (!reason || !amount || !cap || !statIsRelevant(stat, action, sceneText, resolution)) continue;
      handledStats.add(stat);
      acceptedStats.push({ stat, amount:Math.min(amount, cap), reason });
    }

    for (const raw of proposedSkills) {
      if (acceptedSkills.length >= MAX_COMBAT_SKILL_EXPERIENCE) break;
      const proposedKey = identity(raw?.skill);
      const canonical = skills.get(proposedKey);
      if (!canonical || handledSkills.has(proposedKey)) continue;
      const reason = cleanText(raw?.reason, 240);
      const amount = positiveProgressAmount(raw?.amount);
      const cap = gradeAwardCap(canonical.grade, skillEvidenceTier(canonical.name, action, evidence, deliberateTraining));
      if (!reason || !amount || !cap || !skillIsRelevant(canonical.name, action, resolution, deliberateTraining, combatAction)) continue;
      handledSkills.add(proposedKey);
      acceptedSkills.push({ skill:canonical.name, amount:Math.min(amount, cap), reason });
    }
  }

  return {
    version: COMBAT_GROWTH_VERSION,
    evidence_tier: evidenceTier,
    accepted_stat_progress: acceptedStats,
    accepted_skill_experience: acceptedSkills,
    accepted_stat_keys: acceptedStats.map((row) => row.stat),
    accepted_skill_keys: acceptedSkills.map((row) => row.skill),
    rejected_stat_count: Math.max(0, proposedStats.length - acceptedStats.length),
    rejected_skill_count: Math.max(0, proposedSkills.length - acceptedSkills.length),
  };
}

export function compactCombatGrowthTelemetry(state = {}) {
  return {
    version: COMBAT_GROWTH_VERSION,
    evidence_tier: clampInteger(state?.evidence_tier, 0, 3, 0),
    stat_keys: (Array.isArray(state?.accepted_stat_keys) ? state.accepted_stat_keys : []).map((value) => cleanText(value, 16)).filter((value) => STAT_KEYS.has(value)).slice(0, MAX_COMBAT_STAT_PROGRESS),
    skill_keys: (Array.isArray(state?.accepted_skill_keys) ? state.accepted_skill_keys : []).map((value) => cleanText(value, 80)).filter(Boolean).slice(0, MAX_COMBAT_SKILL_EXPERIENCE),
    rejected_stat_count: clampInteger(state?.rejected_stat_count, 0, 8, 0),
    rejected_skill_count: clampInteger(state?.rejected_skill_count, 0, 12, 0),
  };
}
