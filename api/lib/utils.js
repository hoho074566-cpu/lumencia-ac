import { CHARACTER_REGISTRY, REGISTERED_SPEAKER_KEYS } from './character-registry.js';

const PRICES = {
  'gpt-5.6-luna': { input: 1, cached: 0.10, output: 6 },
  'gpt-5.6-terra': { input: 2.5, cached: 0.25, output: 15 },
  'gpt-5.6-sol': { input: 5, cached: 0.5, output: 30 },
};

const EXPRESSIONS = new Set(['default', 'smile', 'blush', 'serious', 'angry', 'sad', 'shock', 'smug', 'annoyed', 'worried', 'confused', 'laugh', 'flustered']);
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
const arrays = (value, max) => Array.isArray(value) ? value.slice(0, max) : [];
const cleanText = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const mergeProgressRows = (rows, keyName, maxRows = 4) => {
  const out = [];
  const byKey = new Map();
  for (const raw of rows || []) {
    const key = cleanText(raw?.[keyName], 80);
    const amount = Math.max(0, Math.min(5, Number(raw?.amount || 0)));
    if (!key || amount <= 0) continue;
    const reason = cleanText(raw?.reason, 240);
    if (!reason) continue;
    if (byKey.has(key)) {
      const row = byKey.get(key);
      row.amount = Math.min(5, row.amount + amount);
      if (reason && !row.reason.includes(reason)) row.reason = `${row.reason} / ${reason}`.slice(0, 240);
      continue;
    }
    const row = { [keyName]: key, amount, reason };
    byKey.set(key, row);
    out.push(row);
    if (out.length >= maxRows) break;
  }
  return out;
};

function validCandidateName(name) {
  const text = cleanText(name, 48);
  if (text.length < 2 || /[\n\r{}<>]/.test(text)) return false;
  if (['신체','마나','지능','신성'].includes(text)) return false;
  return true;
}

export function sanitizeTurn(turn, { allowedCgIds = [], allowedSkills = [], skillGrades = {}, statGrades = {}, existingTraits = [], existingAuthorities = [] } = {}) {
  if (!turn || typeof turn !== 'object') throw new Error('모델 응답이 비어 있습니다.');
  turn.choices = arrays(turn.choices, 3);
  turn.scene = arrays(turn.scene, 24).map((item) => {
    if (item?.kind !== 'dialogue') {
      return { ...item, speaker_key: null, speaker_name: null, expression: null, emotion_intensity:null, emotion_confidence:null, emotion_reason:null };
    }
    const key = item?.speaker_key && REGISTERED_SPEAKER_KEYS.has(item.speaker_key) ? item.speaker_key : null;
    return {
      ...item,
      speaker_key: key,
      speaker_name: key ? (item.speaker_name || CHARACTER_REGISTRY[key]) : (item.speaker_name || 'NPC'),
      expression: EXPRESSIONS.has(item?.expression) ? item.expression : 'default',
      emotion_intensity: clamp(item?.emotion_intensity ?? 0.5, 0, 1),
      emotion_confidence: clamp(item?.emotion_confidence ?? 0.65, 0, 1),
      emotion_reason: cleanText(item?.emotion_reason, 220) || null,
    };
  });

  const allowedCg = new Set(Array.isArray(allowedCgIds) ? allowedCgIds : []);
  if (!turn.cg_id || !allowedCg.has(turn.cg_id)) turn.cg_id = null;

  const allowedSkillSet = new Set((allowedSkills || []).map((x) => String(x).trim()).filter(Boolean));
  const traitSet = new Set((existingTraits || []).map((x) => String(x).trim()).filter(Boolean));
  const authoritySet = new Set((existingAuthorities || []).map((x) => String(x).trim()).filter(Boolean));
  const allowedStats = new Set(['신체', '마나', '지능', '신성']);
  const rawResolution = turn.resolution_log && typeof turn.resolution_log === 'object' ? turn.resolution_log : {};
  const validRoles = new Set(['primary', 'support', 'passive']);
  const seenAbilities = new Set();
  const resolutionAbilities = [];
  for (const raw of arrays(rawResolution.abilities, 5)) {
    const kind = ['skill','stat','trait','authority'].includes(raw?.kind) ? raw.kind : null;
    const name = cleanText(raw?.name, 80);
    if (!kind || !name) continue;
    if (kind === 'skill' && !allowedSkillSet.has(name)) continue;
    if (kind === 'stat' && !allowedStats.has(name)) continue;
    if (kind === 'trait' && !traitSet.has(name)) continue;
    if (kind === 'authority' && !authoritySet.has(name)) continue;
    const dedupeKey = `${kind}:${name}`;
    if (seenAbilities.has(dedupeKey)) continue;
    const reason = cleanText(raw?.reason, 240);
    if (!reason) continue;
    seenAbilities.add(dedupeKey);
    resolutionAbilities.push({
      kind,
      name,
      role: validRoles.has(raw?.role) ? raw.role : 'support',
      reason,
      grade: String(kind === 'skill' ? (skillGrades?.[name] || '') : kind === 'stat' ? (statGrades?.[name] || '') : '').slice(0, 24) || null,
    });
  }
  const validOutcomes = new Set(['success', 'partial', 'failure']);
  const resolutionTriggered = Boolean(rawResolution.triggered) && resolutionAbilities.length > 0;
  turn.resolution_log = {
    triggered: resolutionTriggered,
    outcome: resolutionTriggered && validOutcomes.has(rawResolution.outcome) ? rawResolution.outcome : 'none',
    summary: resolutionTriggered ? (cleanText(rawResolution.summary, 320) || null) : null,
    abilities: resolutionTriggered ? resolutionAbilities : [],
  };

  const d = turn.state_delta || {};
  d.advance_minutes = clamp(d.advance_minutes, 0, 1440);
  d.fatigue_delta = clamp(d.fatigue_delta, -10, 10);
  d.gold_delta = clamp(d.gold_delta, -10000, 10000);
  d.relationship_changes = arrays(d.relationship_changes, 10).filter((row) => REGISTERED_SPEAKER_KEYS.has(row?.npc_key));
  d.relationship_milestones_add = arrays(d.relationship_milestones_add, 6).filter((row) => REGISTERED_SPEAKER_KEYS.has(row?.npc_key));
  d.intimacy_changes = arrays(d.intimacy_changes, 6).filter((row) => REGISTERED_SPEAKER_KEYS.has(row?.npc_key));

  d.stat_progress = mergeProgressRows(arrays(d.stat_progress, 3), 'stat', 3).filter((row) => allowedStats.has(row.stat));
  d.skill_experience = mergeProgressRows(arrays(d.skill_experience, 4), 'skill', 4).filter((row) => allowedSkillSet.has(row.skill));

  d.skill_learning = arrays(d.skill_learning, 2).map((raw) => ({
    skill: cleanText(raw?.skill, 48), amount: clamp(raw?.amount, 1, 15), basis: cleanText(raw?.basis, 120) || null, reason: cleanText(raw?.reason, 280),
  })).filter((row) => validCandidateName(row.skill) && row.reason && !allowedSkillSet.has(row.skill));

  d.awakening_progress = arrays(d.awakening_progress, 1).map((raw) => ({
    kind: raw?.kind === 'authority' ? 'authority' : 'trait', name: cleanText(raw?.name, 64), amount: clamp(raw?.amount, 1, 10), milestone: Boolean(raw?.milestone),
    description: cleanText(raw?.description, 360), limitation: cleanText(raw?.limitation, 360), reason: cleanText(raw?.reason, 300),
  })).filter((row) => row.name.length >= 2 && row.description && row.limitation && row.reason && !(row.kind === 'trait' ? traitSet : authoritySet).has(row.name));

  d.items_add = arrays(d.items_add, 12);
  d.items_remove = arrays(d.items_remove, 12);
  d.active_events_add = arrays(d.active_events_add, 8);
  d.active_events_remove = arrays(d.active_events_remove, 8);
  d.scheduled_events_add = arrays(d.scheduled_events_add, 8);
  d.scheduled_events_remove = arrays(d.scheduled_events_remove, 8);
  d.world_arcs_add = arrays(d.world_arcs_add, 8);
  d.world_arcs_remove = arrays(d.world_arcs_remove, 8);
  d.completed_events_add = arrays(d.completed_events_add, 8);
  d.pc_knowledge_add = arrays(d.pc_knowledge_add, 10);

  d.memories_add = arrays(d.memories_add, 12).filter((row) => {
    const owner = String(row?.owner || '');
    if (owner === 'world' || owner === 'global') return true;
    const match = owner.match(/^npc:([a-z0-9_]+)$/i);
    return Boolean(match && REGISTERED_SPEAKER_KEYS.has(match[1]));
  }).map((row) => ({
    ...row,
    knowledge_type: ['direct','hearsay','inference','secret','world'].includes(row?.knowledge_type) ? row.knowledge_type : null,
    source: cleanText(row?.source, 160) || null,
    credibility: row?.credibility == null ? null : clamp(row.credibility, 0, 1),
  }));

  d.npc_state_updates = arrays(d.npc_state_updates, 12).filter((row) => REGISTERED_SPEAKER_KEYS.has(row?.npc_key)).map((row) => ({
    ...row,
    goal_progress: row?.goal_progress == null ? null : clamp(row.goal_progress, 0, 100),
    next_change_minutes: row?.next_change_minutes == null ? null : clamp(row.next_change_minutes, 0, 10080),
  }));

  d.npc_schedule_updates = arrays(d.npc_schedule_updates, 8).filter((row) => REGISTERED_SPEAKER_KEYS.has(row?.npc_key)).map((row) => ({
    ...row, delay_minutes: clamp(row.delay_minutes, 1, 10080), location: cleanText(row.location,160), activity: cleanText(row.activity,240), reason: cleanText(row.reason,260),
  })).filter((row) => row.location && row.activity && row.reason);

  d.rumors_add = arrays(d.rumors_add, 6).map((row) => ({
    ...row,
    source_npc_key: REGISTERED_SPEAKER_KEYS.has(row?.source_npc_key) ? row.source_npc_key : null,
    target_npc_keys: [...new Set(arrays(row?.target_npc_keys, 6).filter((key) => REGISTERED_SPEAKER_KEYS.has(key)))],
    credibility: clamp(row?.credibility, 0, 1), delay_turns: clamp(row?.delay_turns, 0, 20),
    fact: cleanText(row?.fact,420), reason: cleanText(row?.reason,260),
  })).filter((row) => row.fact && row.reason && row.target_npc_keys.length);

  d.delayed_consequences_add = arrays(d.delayed_consequences_add, 6).map((row) => ({
    ...row, event_name: cleanText(row?.event_name,220), target_bucket: row?.target_bucket === 'world' ? 'world' : 'active', delay_minutes: clamp(row?.delay_minutes,1,43200), reason: cleanText(row?.reason,320), secret_level: clamp(row?.secret_level,0,5),
  })).filter((row) => row.event_name && row.reason);

  turn.state_delta = d;
  turn.scene_summary = cleanText(turn.scene_summary, 1200);
  return turn;
}

export function usageSummary(model, usage = {}) {
  const input = Number(usage.input_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  const inputDetails = usage.input_tokens_details || {};
  const outputDetails = usage.output_tokens_details || {};
  const cached = Number(inputDetails.cached_tokens || 0);
  const cacheWrite = Number(inputDetails.cache_write_tokens || inputDetails.cache_creation_tokens || 0);
  const reasoning = Number(outputDetails.reasoning_tokens || 0);
  const uncached = Math.max(0, input - cached - cacheWrite);
  const price = PRICES[model] || PRICES[model?.includes('luna') ? 'gpt-5.6-luna' : model?.includes('sol') ? 'gpt-5.6-sol' : 'gpt-5.6-terra'];
  const usd = (uncached * price.input + cached * price.cached + cacheWrite * price.input * 1.25 + output * price.output) / 1_000_000;
  const cacheHitRate = input > 0 ? cached / input : 0;
  return {
    input_tokens: input, output_tokens: output, reasoning_tokens: reasoning, cached_tokens: cached, cache_write_tokens: cacheWrite, uncached_input_tokens: uncached,
    cache_hit_rate: Number(cacheHitRate.toFixed(4)), estimated_usd: Number(usd.toFixed(6)), cold_cache: input > 12000 && cached < input * 0.15,
  };
}
