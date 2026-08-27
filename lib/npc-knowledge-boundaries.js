export const NPC_KNOWLEDGE_BOUNDARIES_VERSION = '1.0';

const KNOWLEDGE_BASES = new Set(['witnessed', 'told', 'public', 'private']);
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value, max = 180) => String(value || '').trim().slice(0, max);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function basisOf(row = {}) {
  return KNOWLEDGE_BASES.has(row?.knowledge_basis) ? row.knowledge_basis : 'private';
}

function presentNpcKeys(saveState = {}, registered = new Set()) {
  const save = object(saveState);
  const scene = object(save.sceneRuntime);
  const hasAuthoritativeParticipants = Object.prototype.hasOwnProperty.call(scene, 'participants');
  if (hasAuthoritativeParticipants) {
    return [...new Set(array(scene.participants).map(String).filter((key) => registered.has(key)))];
  }

  const location = String(save.world?.location || '');
  if (!location) return [];
  return Object.entries(object(save.npcStates))
    .filter(([key, row]) => registered.has(key) && String(row?.location || '') === location)
    .map(([key]) => key);
}

function selectedMemoryRefs(rows, prefix, limit = 4) {
  return array(rows)
    .map((row, index) => ({
      index,
      row: object(row),
      score: number(row?.importance, 1) * 1000 + number(row?.turn, index),
    }))
    .filter(({ row }) => text(row.fact, 180))
    .sort((left, right) => right.score - left.score || right.index - left.index)
    .slice(0, Math.max(0, limit))
    .sort((left, right) => left.index - right.index)
    .map(({ row, index }) => ({
      ref: `${prefix}:${index}`,
      basis: basisOf(row),
      fact: text(row.fact, 180),
      source: text(row.source, 100) || null,
    }));
}

export function deriveNpcKnowledgeBoundary({
  saveState = {},
  npcKeys = [],
  registeredNpcKeys = [],
  currentSceneNpcKeys = [],
  mode = 'game',
  maxNpcs = 6,
  memoriesPerNpc = 4,
  publicLimit = 5,
} = {}) {
  const save = object(saveState);
  const registered = new Set(array(registeredNpcKeys).map(String));
  const keys = [...new Set(array(npcKeys).map(String))]
    .filter((key) => registered.has(key))
    .slice(0, Math.max(0, maxNpcs));
  const present = new Set(mode === 'meta' ? [] : [
    ...presentNpcKeys(save, registered),
    ...array(currentSceneNpcKeys).map(String).filter((key) => registered.has(key)),
  ]);
  const publicRows = array(save.memories?.global)
    .map((row, index) => ({ row: object(row), index }))
    .filter(({ row }) => basisOf(row) === 'public'
      && number(row.secret_level, 0) <= 1
      && text(row.source, 100)
      && text(row.fact, 180));
  const publicFacts = selectedMemoryRefs(
    publicRows.map(({ row }) => row),
    'public',
    publicLimit,
  );
  const npcs = {};

  for (const key of keys) {
    npcs[key] = {
      present: present.has(key),
      current_scene_candidate: present.has(key),
      owned_memory_refs: selectedMemoryRefs(save.memories?.npc?.[key], `npc:${key}`, memoriesPerNpc),
    };
  }

  return {
    version: NPC_KNOWLEDGE_BOUNDARIES_VERSION,
    mode,
    pc_only_field: 'pcKnowledge',
    pc_only_count: array(save.pcKnowledge).length,
    public_facts: publicFacts,
    present_npc_keys: [...present].filter((key) => keys.includes(key)),
    npcs,
  };
}

export function buildNpcKnowledgeBoundaryDirective(boundary = {}, { maxChars = 320 } = {}) {
  const value = object(boundary);
  const lines = [
    `[NPC KNOWLEDGE BOUNDARIES V${NPC_KNOWLEDGE_BOUNDARIES_VERSION}]`,
    'PC_ONLY=pcKnowledge',
    'BASIS=OWNED|WITNESSED|TOLD|PUBLIC',
    'PRESENT=CANDIDATE_NOT_PROOF',
  ];
  const publicFacts = array(value.public_facts);
  lines.push(publicFacts.length ? `PUBLIC=${publicFacts[0].ref}:${text(publicFacts[0].fact, 80)}` : 'PUBLIC=none');
  const npcRows = [];
  for (const [key, row] of Object.entries(object(value.npcs))) {
    const refs = array(row?.owned_memory_refs);
    npcRows.push(`${key}:${row?.present === true ? 'P' : 'O'}:${refs.map((item) => item.ref).join(',') || '-'}`);
  }
  lines.push(`NPCS=${npcRows.join(';') || 'none'}`);
  return text(lines.join('\n'), Math.max(120, maxChars));
}

export function sanitizeKnowledgeMemoryRows(rows, {
  boundary = {},
  registeredNpcKeys = [],
} = {}) {
  const registered = new Set(array(registeredNpcKeys).map(String));
  const present = new Set(array(boundary?.present_npc_keys).map(String));
  const accepted = [];
  let rejectedCount = 0;
  let downgradedCount = 0;

  for (const raw of array(rows)) {
    const row = object(raw);
    const owner = text(row.owner, 80);
    const npcKey = owner.startsWith('npc:') ? owner.slice(4) : null;
    const canonicalOwner = owner === 'world' || owner === 'global'
      || (npcKey && registered.has(npcKey));
    if (!canonicalOwner) {
      rejectedCount += 1;
      continue;
    }

    let basis = basisOf(row);
    const source = text(row.source, 200) || null;
    const secretLevel = Math.max(0, Math.min(5, number(row.secret_level, 0)));
    if (npcKey && ['witnessed', 'told'].includes(basis) && (!present.has(npcKey) || !source)) {
      rejectedCount += 1;
      continue;
    }
    if (basis === 'public' && (!['world', 'global'].includes(owner) || secretLevel > 1 || !source)) {
      basis = 'private';
      downgradedCount += 1;
    }
    if (['world', 'global'].includes(owner) && ['witnessed', 'told'].includes(basis)) {
      basis = 'private';
      downgradedCount += 1;
    }
    accepted.push({ ...row, owner, knowledge_basis: basis, source, secret_level: secretLevel });
  }

  return { rows: accepted, rejected_count: rejectedCount, downgraded_count: downgradedCount };
}
