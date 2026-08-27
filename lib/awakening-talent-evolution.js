import { TIME_EFFECT_SOURCE } from './time-plan-reconciliation.js';

export const AWAKENING_TALENT_VERSION = '1.0';
export const MAX_AWAKENING_CANDIDATES_PER_KIND = 4;
export const MAX_AWAKENING_HISTORY = 8;
export const MAX_TALENT_EVOLUTION_HISTORY = 12;

export const TALENT_KEYS = Object.freeze(['magic', 'martial', 'soul', 'knowledge']);

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const GENERIC_AWAKENING_NAMES = new Set([
  '새 특성', '새 권능', '새 능력', '특성', '권능', '능력', '각성',
  'new trait', 'new authority', 'trait', 'authority', 'awakening',
]);
const AWAKENING_KINDS = Object.freeze(['trait', 'authority']);
const TRAIT_MILESTONES_REQUIRED = 3;
const AUTHORITY_MILESTONES_REQUIRED = 4;

const TRAIT_RARE_SCENE_RE = /(?:반복(?:되|된|되는)?\s*(?:이상|특이|비정상)\s*(?:현상|반응)|극한(?:의)?\s*(?:환경|상황|손상|압박)[^.!?\n]{0,48}(?:적응|변이|재구성)|(?:혈통|영혼)[^.!?\n]{0,48}(?:고유|특이|비정상|새로운)\s*(?:반응|공명|현상)|기존에\s*없던[^.!?\n]{0,48}(?:감각|현상|반응|적응)|세계\s*법칙\s*안[^.!?\n]{0,40}(?:새로운|고유한)\s*현상|(?:anomalous|unique)\s+(?:adaptation|reaction|phenomenon)|bloodline[^.!?\n]{0,40}(?:reaction|resonance)|soul[^.!?\n]{0,40}(?:unique|anomalous)\s+(?:reaction|resonance))/i;
const AUTHORITY_RARE_SCENE_RE = /(?:(?:영혼|존재)[^.!?\n]{0,36}(?:각인|법칙이\s*새겨)|운명[^.!?\n]{0,36}(?:전환|분기|뒤틀림|재편)|(?:초월자|신격|정령왕|마신)[^.!?\n]{0,48}(?:계약|계승|선택|권능\s*부여)|(?:초월적|법칙급)[^.!?\n]{0,36}(?:계약|계승|각인)|세계\s*법칙[^.!?\n]{0,48}(?:응답|개입|강제|선언|새겨)|(?:fate|destiny)[^.!?\n]{0,40}(?:turn|shift|rewrite)|soul[^.!?\n]{0,40}(?:engraving|imprint)|transcendent[^.!?\n]{0,40}(?:contract|inheritance)|world\s*law[^.!?\n]{0,40}(?:respond|intervene|imprint))/i;
const DECISIVE_MILESTONE_RE = /(?:결정적|임계|확정|정착|완전히\s*새겨|각인|계약(?:이|을)?\s*(?:성립|체결)|계승(?:이|을)?\s*(?:완료|받)|법칙[^.!?\n]{0,24}(?:응답|승인|새겨)|현상[^.!?\n]{0,24}(?:고정|정착)|decisive|threshold|engraved|contract\s+(?:formed|sealed)|inheritance\s+completed)/i;
const NEGATED_RARE_CHANGE_RE = /(?:각성|각인|계약|계승|고유\s*반응|특이\s*현상|재능|잠재력)[^.!?\n]{0,48}(?:일어나지\s*않|발생하지\s*않|성립하지\s*않|변하지\s*않|없었|실패)|(?:no|not|without)[^.!?\n]{0,28}(?:awakening|imprint|contract|inheritance|talent\s+change)/i;
const UNBOUNDED_LIMITATION_RE = /^(?:(?:제한|한계|대가|조건)\s*(?:이|가|은|는|:)?\s*(?:없(?:음|다|는)?|무(?:제약|조건)?|존재하지)|무제한|무조건\s*성공|no\s+(?:limit|limitation|cost|condition)|unlimited)(?:$|\s|[.!?])/i;
const TRAIT_ANCHOR_RE = /(?:혈통|영혼|극한\s*(?:환경|상황|손상|압박)|특이\s*현상|고유\s*반응|비정상\s*반응|공명|bloodline|soul|anomalous|unique\s+reaction)/i;
const AUTHORITY_ANCHOR_RE = /(?:운명|영혼\s*각인|초월적?\s*계약|계승|세계\s*법칙|신격|초월자|정령왕|마신|fate|destiny|soul\s*(?:engraving|imprint)|transcendent\s*contract|inheritance|world\s*law)/i;

const TALENT_MYTHIC_SOURCE_RE = /(?:성유물|신의\s*(?:축복|가호|직접\s*개입)|신격|초월자|정령왕|법칙급\s*유물|영혼[^.!?\n]{0,24}(?:재구성|재창조)|(?:divine|god(?:'s)?)\s*(?:blessing|intervention)|sacred\s+relic|transcendent\s+(?:being|intervention)|spirit\s+king|soul\s+reconstruction)/i;
const TALENT_IRREVERSIBLE_CHANGE_RE = /(?:(?:재능|잠재력|성장\s*(?:한계|천장)|영혼의?\s*(?:그릇|구조)|근원)[^.!?\n]{0,48}(?:상승|확장|넓어|재구성|재편|변화|바뀌|각성|새겨|초월)|(?:상승|확장|재구성|재편|변화|각성)[^.!?\n]{0,40}(?:재능|잠재력|성장\s*(?:한계|천장)|영혼의?\s*(?:그릇|구조))|(?:talent|potential|growth\s+(?:limit|ceiling)|soul\s+(?:vessel|structure))[^.!?\n]{0,48}(?:increase|expand|reconstruct|transform|awaken))/i;

const clampInteger = (value, min, max, fallback = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
};

const cleanText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const abilityIdentity = (value) => cleanText(value, 80).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
const evidenceIdentity = (value) => cleanText(value, 300).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 180);

function validAwakeningName(value) {
  const name = cleanText(value, 64);
  if (name.length < 2 || FORBIDDEN_KEYS.has(name) || GENERIC_AWAKENING_NAMES.has(name.toLocaleLowerCase('ko-KR'))) return false;
  return !/[\u0000-\u001f\u007f\n\r{}<>]/.test(name);
}

function validLimitation(value) {
  const limitation = cleanText(value, 360);
  return Boolean(limitation) && !UNBOUNDED_LIMITATION_RE.test(limitation);
}

function abilityNameSet(value) {
  if (Array.isArray(value)) return new Set(value.map((row) => abilityIdentity(typeof row === 'string' ? row : row?.name)).filter(Boolean));
  return new Set(Object.keys(object(value)).map(abilityIdentity).filter(Boolean));
}

function visibleSceneText(scene = []) {
  return (Array.isArray(scene) ? scene : []).slice(0, 24).map((row) => cleanText(row?.text, 900)).filter(Boolean).join('\n');
}

function savedRareContext(saveState = {}) {
  const save = object(saveState);
  const pc = object(save.pc);
  const memoryFacts = (Array.isArray(save?.memories?.global) ? save.memories.global : []).slice(-12).map((row) => typeof row === 'string' ? row : row?.fact);
  const hookFacts = (Array.isArray(save.hooks) ? save.hooks : []).slice(-12).flatMap((row) => [row?.title, row?.description, row?.reason]);
  return cleanText([
    ...(Array.isArray(pc.inventory) ? pc.inventory : []),
    ...(Array.isArray(save.activeEvents) ? save.activeEvents : []),
    ...(Array.isArray(save.pcKnowledge) ? save.pcKnowledge.map((row) => typeof row === 'string' ? row : row?.fact) : []),
    ...memoryFacts,
    ...hookFacts,
    save?.sceneRuntime?.eventProgress?.activeBeat,
  ].filter(Boolean).join('\n'), 7200);
}

function normalizeAwakeningHistory(history = []) {
  return (Array.isArray(history) ? history : []).slice(-MAX_AWAKENING_HISTORY).map((raw) => {
    const reason = cleanText(raw?.reason, 300);
    return {
      turn: clampInteger(raw?.turn, 0, 1_000_000_000),
      amount: clampInteger(raw?.amount, 1, 10, 1),
      milestone: raw?.milestone === true,
      reason,
      evidence_key: cleanText(raw?.evidence_key, 180) || evidenceIdentity(reason),
    };
  }).filter((row) => row.reason && row.evidence_key);
}

function normalizeCandidateBucket(value, kind, existingNames, maxCandidates) {
  const rows = [];
  for (const [rawName, rawValue] of Object.entries(object(value))) {
    const name = cleanText(rawName, 64);
    const identity = abilityIdentity(name);
    if (!validAwakeningName(name) || !identity || existingNames.has(identity)) continue;
    const raw = object(rawValue);
    const progress = clampInteger(raw.progress, 0, 100);
    const description = cleanText(raw.description, 360);
    const limitation = cleanText(raw.limitation, 360);
    const reason = cleanText(raw.reason, 300);
    if (progress <= 0 || !description || !validLimitation(limitation) || !reason) continue;
    const history = normalizeAwakeningHistory(raw.history);
    const milestoneKeys = [...new Set([
      ...(Array.isArray(raw.milestone_keys) ? raw.milestone_keys : []),
      ...history.filter((row) => row.milestone).map((row) => row.evidence_key),
    ].map((key) => cleanText(key, 180)).filter(Boolean))].slice(-MAX_AWAKENING_HISTORY);
    rows.push([name, {
      progress,
      milestones: clampInteger(raw.milestones, 0, 20),
      description,
      limitation,
      reason,
      updated_turn: clampInteger(raw.updated_turn ?? raw.updatedTurn, 0, 1_000_000_000),
      milestone_keys: milestoneKeys,
      history,
    }, identity]);
  }
  rows.sort((a, b) => Number(b[1].updated_turn || 0) - Number(a[1].updated_turn || 0) || Number(b[1].progress || 0) - Number(a[1].progress || 0) || a[0].localeCompare(b[0], 'ko'));
  const seen = new Set();
  const unique = [];
  for (const [name, row, identity] of rows) {
    if (seen.has(identity)) continue;
    seen.add(identity);
    unique.push([name, row]);
  }
  return Object.fromEntries(unique.slice(0, maxCandidates));
}

export function normalizeAwakeningCandidates(value = {}, {
  existingTraits = {},
  existingAuthorities = {},
  maxCandidatesPerKind = MAX_AWAKENING_CANDIDATES_PER_KIND,
} = {}) {
  const limit = Math.max(0, Math.min(MAX_AWAKENING_CANDIDATES_PER_KIND, Math.trunc(Number(maxCandidatesPerKind) || MAX_AWAKENING_CANDIDATES_PER_KIND)));
  const traitNames = abilityNameSet(existingTraits);
  const authorityNames = abilityNameSet(existingAuthorities);
  const allExisting = new Set([...traitNames, ...authorityNames]);
  const trait = normalizeCandidateBucket(object(value).trait, 'trait', allExisting, limit);
  const authority = normalizeCandidateBucket(object(value).authority, 'authority', new Set([...allExisting, ...Object.keys(trait).map(abilityIdentity)]), limit);
  const traitIdentities = new Set(Object.keys(trait).map(abilityIdentity));
  return {
    trait,
    authority: Object.fromEntries(Object.entries(authority).filter(([name]) => !traitIdentities.has(abilityIdentity(name)))),
  };
}

function candidateEntryByIdentity(bucket, identity) {
  return Object.entries(bucket).find(([name]) => abilityIdentity(name) === identity) || null;
}

function hasAwakeningEvidence(kind, scene, milestone, anchorText, hasPriorCandidate) {
  const text = visibleSceneText(scene);
  if (!text || NEGATED_RARE_CHANGE_RE.test(text)) return false;
  const rare = kind === 'authority' ? AUTHORITY_RARE_SCENE_RE.test(text) : TRAIT_RARE_SCENE_RE.test(text);
  const anchored = hasPriorCandidate || (kind === 'authority' ? AUTHORITY_ANCHOR_RE.test(anchorText) : TRAIT_ANCHOR_RE.test(anchorText));
  return rare && anchored && (!milestone || DECISIVE_MILESTONE_RE.test(text));
}

function requiredMilestones(kind) {
  return kind === 'authority' ? AUTHORITY_MILESTONES_REQUIRED : TRAIT_MILESTONES_REQUIRED;
}

export function normalizeTalentValues(value = {}) {
  const source = object(value);
  return Object.fromEntries(TALENT_KEYS.map((key) => [key, clampInteger(source[key], 1, 10, 5)]));
}

export function normalizeTalentEvolutionHistory(value = []) {
  const rows = [];
  const seen = new Set();
  for (const raw of (Array.isArray(value) ? value : []).slice(-MAX_TALENT_EVOLUTION_HISTORY * 2)) {
    const talent = TALENT_KEYS.includes(raw?.talent) ? raw.talent : null;
    const before = clampInteger(raw?.before, 1, 10, 0);
    const after = clampInteger(raw?.after, 1, 10, 0);
    const cause = cleanText(raw?.cause, 280);
    const reason = cleanText(raw?.reason, 300);
    const causeKey = cleanText(raw?.cause_key, 180) || evidenceIdentity(cause);
    const identity = `${talent || ''}:${causeKey}`;
    if (!talent || !before || after !== before + 1 || !cause || !reason || !causeKey || seen.has(identity)) continue;
    seen.add(identity);
    rows.push({ talent, before, after, cause, reason, cause_key:causeKey, turn:clampInteger(raw?.turn, 0, 1_000_000_000) });
  }
  return rows.slice(-MAX_TALENT_EVOLUTION_HISTORY);
}

function hasTalentEvolutionEvidence(scene, cause, anchorText) {
  const text = visibleSceneText(scene);
  if (!text || NEGATED_RARE_CHANGE_RE.test(text)) return false;
  return TALENT_MYTHIC_SOURCE_RE.test(text) && TALENT_IRREVERSIBLE_CHANGE_RE.test(text) && TALENT_MYTHIC_SOURCE_RE.test(cleanText(cause, 280)) && TALENT_MYTHIC_SOURCE_RE.test(anchorText);
}

export function deriveAwakeningTalentState({
  existingTraits = {},
  existingAuthorities = {},
  talents = {},
  previousCandidates = {},
  previousTalentHistory = [],
  awakeningChanges = [],
  talentEvolutionChanges = [],
  action = '',
  saveState = {},
  scene = [],
  turnNumber = 0,
  allowProgress = true,
} = {}) {
  const candidates = normalizeAwakeningCandidates(previousCandidates, { existingTraits, existingAuthorities });
  const traitNames = abilityNameSet(existingTraits);
  const authorityNames = abilityNameSet(existingAuthorities);
  const allAbilityNames = new Set([...traitNames, ...authorityNames]);
  const acceptedAwakeningChanges = [];
  const awakenedTraits = [];
  const awakenedAuthorities = [];
  const changedCandidateKeys = [];
  const anchorText = cleanText(`${action}\n${savedRareContext(saveState)}`, 9000);

  if (allowProgress) {
    for (const raw of (Array.isArray(awakeningChanges) ? awakeningChanges : []).slice(0, 4)) {
      if (acceptedAwakeningChanges.length >= 1) break;
      const kind = AWAKENING_KINDS.includes(raw?.kind) ? raw.kind : null;
      const proposedName = cleanText(raw?.name, 64);
      const identity = abilityIdentity(proposedName);
      const amount = clampInteger(raw?.amount, 1, 10, 0);
      const milestone = raw?.milestone === true;
      const description = cleanText(raw?.description, 360);
      const limitation = cleanText(raw?.limitation, 360);
      const reason = cleanText(raw?.reason, 300);
      if (!kind || !validAwakeningName(proposedName) || !identity || allAbilityNames.has(identity) || !amount || !description || !limitation || !reason) continue;

      const oppositeKind = kind === 'trait' ? 'authority' : 'trait';
      if (candidateEntryByIdentity(candidates[oppositeKind], identity)) continue;
      const priorEntry = candidateEntryByIdentity(candidates[kind], identity);
      if (!priorEntry && Object.keys(candidates[kind]).length >= MAX_AWAKENING_CANDIDATES_PER_KIND) continue;
      if (!priorEntry && !validLimitation(limitation)) continue;
      if (!hasAwakeningEvidence(kind, scene, milestone, anchorText, Boolean(priorEntry))) continue;
      const name = priorEntry?.[0] || proposedName;
      const prior = priorEntry?.[1] || { progress:0, milestones:0, milestone_keys:[], history:[] };
      const evidenceKey = evidenceIdentity(reason);
      if (!evidenceKey || (Array.isArray(prior.history) ? prior.history : []).some((row) => row.evidence_key === evidenceKey) || (Array.isArray(prior.milestone_keys) ? prior.milestone_keys : []).includes(evidenceKey)) continue;

      const milestoneKeys = new Set(Array.isArray(prior.milestone_keys) ? prior.milestone_keys : []);
      const countsMilestone = milestone && !milestoneKeys.has(evidenceKey);
      if (countsMilestone) milestoneKeys.add(evidenceKey);
      const nextProgress = Math.min(100, Number(prior.progress || 0) + amount);
      const nextMilestones = Math.min(20, Number(prior.milestones || 0) + (countsMilestone ? 1 : 0));
      const canonicalDescription = priorEntry ? prior.description : description;
      const canonicalLimitation = priorEntry ? prior.limitation : limitation;
      const historyRow = { turn:clampInteger(turnNumber, 0, 1_000_000_000), amount, milestone:countsMilestone, reason, evidence_key:evidenceKey };
      const accepted = { kind, name, amount, milestone:countsMilestone, description:canonicalDescription, limitation:canonicalLimitation, reason, ...(Number.isInteger(raw?.[TIME_EFFECT_SOURCE])?{[TIME_EFFECT_SOURCE]:raw[TIME_EFFECT_SOURCE]}:{}) };
      acceptedAwakeningChanges.push(accepted);
      changedCandidateKeys.push(`${kind}:${name}`);

      if (nextProgress >= 100 && nextMilestones >= requiredMilestones(kind)) {
        delete candidates[kind][name];
        allAbilityNames.add(identity);
        const awakened = { name, description:canonicalDescription, limitation:canonicalLimitation, awakened_turn:clampInteger(turnNumber, 0, 1_000_000_000), source:reason };
        (kind === 'authority' ? awakenedAuthorities : awakenedTraits).push(awakened);
        continue;
      }

      candidates[kind][name] = {
        progress: nextProgress,
        milestones: nextMilestones,
        description: canonicalDescription,
        limitation: canonicalLimitation,
        reason,
        updated_turn: clampInteger(turnNumber, 0, 1_000_000_000),
        milestone_keys: [...milestoneKeys].slice(-MAX_AWAKENING_HISTORY),
        history: [...(Array.isArray(prior.history) ? prior.history : []), historyRow].slice(-MAX_AWAKENING_HISTORY),
      };
    }
  }

  const talentValues = normalizeTalentValues(talents);
  const talentHistory = normalizeTalentEvolutionHistory(previousTalentHistory);
  const acceptedTalentEvolution = [];
  const talentChanges = [];
  if (allowProgress) {
    for (const raw of (Array.isArray(talentEvolutionChanges) ? talentEvolutionChanges : []).slice(0, 4)) {
      if (acceptedTalentEvolution.length >= 1) break;
      const talent = TALENT_KEYS.includes(raw?.talent) ? raw.talent : null;
      const cause = cleanText(raw?.cause, 280);
      const reason = cleanText(raw?.reason, 300);
      const causeKey = evidenceIdentity(cause);
      if (!talent || Number(raw?.amount) !== 1 || !cause || !reason || !causeKey || talentValues[talent] >= 10) continue;
      if (!hasTalentEvolutionEvidence(scene, cause, anchorText)) continue;
      if (talentHistory.some((row) => row.talent === talent && row.cause_key === causeKey)) continue;
      const before = talentValues[talent];
      const after = before + 1;
      const turn = clampInteger(turnNumber, 0, 1_000_000_000);
      talentValues[talent] = after;
      acceptedTalentEvolution.push({ talent, amount:1, cause, reason, ...(Number.isInteger(raw?.[TIME_EFFECT_SOURCE])?{[TIME_EFFECT_SOURCE]:raw[TIME_EFFECT_SOURCE]}:{}) });
      talentChanges.push({ talent, before, after, cause, reason });
      talentHistory.push({ talent, before, after, cause, reason, cause_key:causeKey, turn });
    }
  }

  return {
    version: AWAKENING_TALENT_VERSION,
    candidates,
    accepted_awakening_changes: acceptedAwakeningChanges,
    awakened_traits: awakenedTraits,
    awakened_authorities: awakenedAuthorities,
    changed_candidate_keys: changedCandidateKeys.slice(0, 1),
    talents: talentValues,
    accepted_talent_evolution: acceptedTalentEvolution,
    talent_changes: talentChanges,
    talent_history: normalizeTalentEvolutionHistory(talentHistory),
  };
}

export function compactAwakeningTalentTelemetry(state = {}) {
  const candidates = normalizeAwakeningCandidates(state?.candidates || {});
  return {
    version: AWAKENING_TALENT_VERSION,
    candidate_keys: AWAKENING_KINDS.flatMap((kind) => Object.keys(candidates[kind]).map((name) => `${kind}:${name}`)).slice(0, MAX_AWAKENING_CANDIDATES_PER_KIND * 2),
    changed_candidate_keys: (Array.isArray(state?.changed_candidate_keys) ? state.changed_candidate_keys : []).map((value) => cleanText(value, 80)).filter(Boolean).slice(0, 1),
    awakened_trait_keys: (Array.isArray(state?.awakened_traits) ? state.awakened_traits : []).map((row) => cleanText(row?.name, 64)).filter(Boolean).slice(0, 1),
    awakened_authority_keys: (Array.isArray(state?.awakened_authorities) ? state.awakened_authorities : []).map((row) => cleanText(row?.name, 64)).filter(Boolean).slice(0, 1),
    evolved_talent_keys: (Array.isArray(state?.talent_changes) ? state.talent_changes : []).map((row) => TALENT_KEYS.includes(row?.talent) ? row.talent : '').filter(Boolean).slice(0, 1),
  };
}
