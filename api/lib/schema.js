import { z } from 'zod/v4';

const Expression = z.enum(['default', 'smile', 'blush', 'serious', 'angry', 'sad', 'shock']);
const Importance = z.enum(['routine', 'important', 'critical']);

const SceneItem = z.object({
  kind: z.enum(['narration', 'dialogue']),
  text: z.string().min(1).max(2200),
  speaker_key: z.string().max(64).nullable(),
  speaker_name: z.string().max(80).nullable(),
  // 모델이 감지한 감정 태그. 최종 표시 표정은 서버의 전환 엔진이 결정한다.
  expression: Expression.nullable(),
  emotion_intensity: z.number().min(0).max(1).nullable(),
  emotion_confidence: z.number().min(0).max(1).nullable(),
  emotion_reason: z.string().max(220).nullable(),
});

const RelationshipChange = z.object({
  npc_key: z.string().min(1).max(64),
  affinity_delta: z.number().int().min(-10).max(10),
  trust_delta: z.number().int().min(-10).max(10),
  status: z.string().max(80).nullable(),
  reason: z.string().min(1).max(300),
});

const IntimacyChange = z.object({
  npc_key: z.string().min(1).max(64),
  level_delta: z.number().int().min(-1).max(1),
  status: z.string().max(80).nullable(),
  reason: z.string().min(1).max(300),
});

const StatProgress = z.object({
  stat: z.enum(['신체', '마나', '지능', '신성']),
  amount: z.number().int().min(1).max(5),
  reason: z.string().min(1).max(240),
});

const SkillExperience = z.object({
  skill: z.string().min(1).max(80),
  amount: z.number().int().min(1).max(5),
  reason: z.string().min(1).max(240),
});

const AbilityUse = z.object({
  kind: z.enum(['skill', 'stat']),
  name: z.string().min(1).max(80),
  role: z.enum(['primary', 'support', 'passive']),
  reason: z.string().min(1).max(240),
});

const ResolutionLog = z.object({
  triggered: z.boolean(),
  outcome: z.enum(['none', 'success', 'partial', 'failure']),
  summary: z.string().max(320).nullable(),
  abilities: z.array(AbilityUse).max(5),
});

const MemoryAdd = z.object({
  owner: z.string().min(1).max(80),
  fact: z.string().min(1).max(500),
  importance: z.enum(['minor', 'major', 'critical']),
  secret_level: z.number().int().min(0).max(5),
});

const NpcStateUpdate = z.object({
  npc_key: z.string().min(1).max(64),
  location: z.string().max(160).nullable(),
  status: z.string().max(240).nullable(),
  current_goal: z.string().max(300).nullable(),
  last_seen: z.string().max(160).nullable(),
});

export const TurnSchema = z.object({
  scene_title: z.string().min(1).max(120),
  importance: Importance,
  scene: z.array(SceneItem).min(1).max(24),
  cg_id: z.string().max(120).nullable(),
  choices: z.array(z.string().min(1).max(240)).max(3),
  resolution_log: ResolutionLog,
  state_delta: z.object({
    advance_minutes: z.number().int().min(0).max(1440),
    new_location: z.string().max(160).nullable(),
    pc_status: z.string().max(160).nullable(),
    fatigue_delta: z.number().int().min(-10).max(10),
    gold_delta: z.number().int().min(-10000).max(10000),
    relationship_changes: z.array(RelationshipChange).max(10),
    intimacy_changes: z.array(IntimacyChange).max(6),
    stat_progress: z.array(StatProgress).max(3),
    skill_experience: z.array(SkillExperience).max(4),
    items_add: z.array(z.string().min(1).max(160)).max(12),
    items_remove: z.array(z.string().min(1).max(160)).max(12),
    active_events_add: z.array(z.string().min(1).max(240)).max(8),
    active_events_remove: z.array(z.string().min(1).max(240)).max(8),
    scheduled_events_add: z.array(z.string().min(1).max(240)).max(8),
    scheduled_events_remove: z.array(z.string().min(1).max(240)).max(8),
    world_arcs_add: z.array(z.string().min(1).max(240)).max(8),
    world_arcs_remove: z.array(z.string().min(1).max(240)).max(8),
    completed_events_add: z.array(z.string().min(1).max(240)).max(8),
    pc_knowledge_add: z.array(z.string().min(1).max(500)).max(10),
    memories_add: z.array(MemoryAdd).max(12),
    npc_state_updates: z.array(NpcStateUpdate).max(12),
  }),
  scene_summary: z.string().min(1).max(1200),
});
