import { CHARACTER_REGISTRY, REGISTERED_SPEAKER_KEYS } from './character-registry.js';

const PRICES = {
  'gpt-5.6-luna': { input: 1, cached: 0.10, output: 6 },
  'gpt-5.6-terra': { input: 2.5, cached: 0.25, output: 15 },
  'gpt-5.6-sol': { input: 5, cached: 0.5, output: 30 },
};

const EXPRESSIONS = new Set(['default', 'smile', 'blush', 'serious', 'angry', 'sad', 'shock']);
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
const arrays = (value, max) => Array.isArray(value) ? value.slice(0, max) : [];

const mergeProgressRows = (rows, keyName, maxRows = 4) => {
  const out = [];
  const byKey = new Map();
  for (const raw of rows || []) {
    const key = String(raw?.[keyName] || '').trim();
    const amount = Math.max(0, Math.min(5, Number(raw?.amount || 0)));
    if (!key || amount <= 0) continue;
    const reason = String(raw?.reason || '').trim().slice(0, 240);
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

export function sanitizeTurn(turn, { allowedCgIds = [], allowedSkills = [] } = {}) {
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
      emotion_reason: String(item?.emotion_reason || '').slice(0,220) || null,
    };
  });

  const allowedCg = new Set(Array.isArray(allowedCgIds) ? allowedCgIds : []);
  if (!turn.cg_id || !allowedCg.has(turn.cg_id)) turn.cg_id = null;

  const d = turn.state_delta || {};
  d.advance_minutes = clamp(d.advance_minutes, 0, 1440);
  d.fatigue_delta = clamp(d.fatigue_delta, -10, 10);
  d.gold_delta = clamp(d.gold_delta, -10000, 10000);
  d.relationship_changes = arrays(d.relationship_changes, 10).filter((row) => REGISTERED_SPEAKER_KEYS.has(row?.npc_key));
  d.intimacy_changes = arrays(d.intimacy_changes, 6).filter((row) => REGISTERED_SPEAKER_KEYS.has(row?.npc_key));
  d.stat_progress = mergeProgressRows(arrays(d.stat_progress, 3), 'stat', 3)
    .filter((row) => ['신체', '마나', '지능', '신성'].includes(row.stat));
  const allowedSkillSet = new Set((allowedSkills || []).map((x) => String(x).trim()).filter(Boolean));
  d.skill_experience = mergeProgressRows(arrays(d.skill_experience, 4), 'skill', 4)
    .filter((row) => allowedSkillSet.has(row.skill));
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
  });
  d.npc_state_updates = arrays(d.npc_state_updates, 12).filter((row) => REGISTERED_SPEAKER_KEYS.has(row?.npc_key));
  turn.state_delta = d;
  turn.scene_summary = String(turn.scene_summary || '').slice(0,1200);
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
    input_tokens: input,
    output_tokens: output,
    reasoning_tokens: reasoning,
    cached_tokens: cached,
    cache_write_tokens: cacheWrite,
    uncached_input_tokens: uncached,
    cache_hit_rate: Number(cacheHitRate.toFixed(4)),
    estimated_usd: Number(usd.toFixed(6)),
    cold_cache: input > 12000 && cached < input * 0.15,
  };
}
