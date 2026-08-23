import { z } from 'zod/v4';

const Expression = z.enum(['default', 'smile', 'blush', 'serious', 'angry', 'sad', 'shock', 'smug', 'annoyed', 'worried', 'confused', 'laugh', 'flustered']);
const Importance = z.enum(['routine', 'important', 'critical']);

const SceneItem = z.object({
  kind: z.enum(['narration', 'dialogue']),
  text: z.string().min(1).max(2200),
  speaker_key: z.string().max(64).nullable(),
  speaker_name: z.string().max(80).nullable(),
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

const RelationshipMilestone = z.object({
  npc_key: z.string().min(1).max(64),
  kind: z.enum(['shared_trial', 'promise_kept', 'personal_confidence', 'rescue', 'sacrifice', 'reconciliation', 'major_choice', 'other']),
  description: z.string().min(1).max(320),
  reason: z.string().min(1).max(260),
});

const IntimacyChange = z.object({
  npc_key: z.string().min(1).max(64),
  level_delta: z.number().int().min(-1).max(1),
  status: z.string().max(80).nullable(),
  reason: z.string().min(1).max(300),
});

const StatProgress = z.object({ stat: z.enum(['신체', '마나', '지능', '신성']), amount: z.number().int().min(1).max(5), reason: z.string().min(1).max(240) });
const SkillExperience = z.object({ skill: z.string().min(1).max(80), amount: z.number().int().min(1).max(5), reason: z.string().min(1).max(240) });
const SkillLearning = z.object({ skill: z.string().min(2).max(48), amount: z.number().int().min(1).max(15), basis: z.string().max(120).nullable(), reason: z.string().min(1).max(280) });
const AwakeningProgress = z.object({
  kind: z.enum(['trait', 'authority']), name: z.string().min(2).max(64), amount: z.number().int().min(1).max(10), milestone: z.boolean(),
  description: z.string().min(1).max(360), limitation: z.string().min(1).max(360), reason: z.string().min(1).max(300),
});

const AbilityUse = z.object({ kind: z.enum(['skill', 'stat', 'trait', 'authority']), name: z.string().min(1).max(80), role: z.enum(['primary', 'support', 'passive']), reason: z.string().min(1).max(240) });
const ResolutionLog = z.object({ triggered: z.boolean(), outcome: z.enum(['none', 'success', 'partial', 'failure']), summary: z.string().max(320).nullable(), abilities: z.array(AbilityUse).max(5) });

const MemoryAdd = z.object({
  owner: z.string().min(1).max(80), fact: z.string().min(1).max(500), importance: z.enum(['minor', 'major', 'critical']), secret_level: z.number().int().min(0).max(5),
  knowledge_type: z.enum(['direct', 'hearsay', 'inference', 'secret', 'world']).nullable(), source: z.string().max(160).nullable(), credibility: z.number().min(0).max(1).nullable(),
});

const NpcStateUpdate = z.object({
  npc_key: z.string().min(1).max(64), location: z.string().max(160).nullable(), status: z.string().max(240).nullable(), current_goal: z.string().max(300).nullable(),
  long_term_goal: z.string().max(320).nullable(), short_term_goal: z.string().max(320).nullable(), goal_progress: z.number().int().min(0).max(100).nullable(), obstacle: z.string().max(280).nullable(),
  goal_progress_delta: z.number().int().min(-100).max(100).nullable(), goal_state: z.enum(['active','blocked','completed','abandoned']).nullable(),
  goal_reason: z.string().max(280).nullable(), goal_next_action: z.string().max(240).nullable(), goal_replace: z.boolean().nullable(),
  next_activity: z.string().max(240).nullable(), next_location: z.string().max(160).nullable(), next_change_minutes: z.number().int().min(0).max(10080).nullable(), last_seen: z.string().max(160).nullable(),
});

const NpcScheduleUpdate = z.object({ npc_key: z.string().min(1).max(64), delay_minutes: z.number().int().min(1).max(10080), location: z.string().min(1).max(160), activity: z.string().min(1).max(240), reason: z.string().min(1).max(260) });
const RumorAdd = z.object({ fact: z.string().min(1).max(420), source_npc_key: z.string().max(64).nullable(), target_npc_keys: z.array(z.string().min(1).max(64)).min(1).max(6), credibility: z.number().min(0).max(1), delay_turns: z.number().int().min(0).max(20), reason: z.string().min(1).max(260) });
const DelayedConsequence = z.object({ event_name: z.string().min(1).max(220), target_bucket: z.enum(['active', 'world']), delay_minutes: z.number().int().min(1).max(43200), reason: z.string().min(1).max(320), secret_level: z.number().int().min(0).max(5) });

export const TurnSchema = z.object({
  scene_title: z.string().min(1).max(120), importance: Importance, scene: z.array(SceneItem).min(1).max(24), cg_id: z.string().max(120).nullable(), choices: z.array(z.string().min(1).max(240)).max(3), resolution_log: ResolutionLog,
  state_delta: z.object({
    advance_minutes: z.number().int().min(0).max(1440), new_location: z.string().max(160).nullable(), pc_status: z.string().max(160).nullable(), fatigue_delta: z.number().int().min(-10).max(10), gold_delta: z.number().int().min(-10000).max(10000),
    relationship_changes: z.array(RelationshipChange).max(10), relationship_milestones_add: z.array(RelationshipMilestone).max(6), intimacy_changes: z.array(IntimacyChange).max(6),
    stat_progress: z.array(StatProgress).max(3), skill_experience: z.array(SkillExperience).max(4), skill_learning: z.array(SkillLearning).max(2), awakening_progress: z.array(AwakeningProgress).max(1),
    items_add: z.array(z.string().min(1).max(160)).max(12), items_remove: z.array(z.string().min(1).max(160)).max(12),
    active_events_add: z.array(z.string().min(1).max(240)).max(8), active_events_remove: z.array(z.string().min(1).max(240)).max(8), scheduled_events_add: z.array(z.string().min(1).max(240)).max(8), scheduled_events_remove: z.array(z.string().min(1).max(240)).max(8), world_arcs_add: z.array(z.string().min(1).max(240)).max(8), world_arcs_remove: z.array(z.string().min(1).max(240)).max(8), completed_events_add: z.array(z.string().min(1).max(240)).max(8),
    pc_knowledge_add: z.array(z.string().min(1).max(500)).max(10), memories_add: z.array(MemoryAdd).max(12), npc_state_updates: z.array(NpcStateUpdate).max(12), npc_schedule_updates: z.array(NpcScheduleUpdate).max(8), rumors_add: z.array(RumorAdd).max(6), delayed_consequences_add: z.array(DelayedConsequence).max(6),
  }),
  scene_summary: z.string().min(1).max(1200),
});
