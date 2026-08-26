// Time Plan Parser Phase 3 structural reconciliation.
// The user action plan owns clause identity; returned narration is not effect authority.

export const TIME_EXECUTION_CONTRACT_VERSION = '1.0';
export const TIME_EFFECT_SOURCE = Symbol.for('lumensia.time.effect.source');

const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clauseId = (clause, position = 0) => String(clause?.clause_id || `action_${Number(clause?.index || position + 1)}`);
const compactIdentity = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
const SCALAR_LIMITS = Object.freeze({ fatigue_delta:10, gold_delta:10000 });
const TURN_EFFECT_FIELDS = new Set(['event_progress', 'director']);

function effectRowIdentity(field, row) {
  const value = object(row);
  if (field === 'stat_progress') return compactIdentity(value.stat);
  if (['skill_experience', 'skill_learning'].includes(field)) return compactIdentity(value.skill);
  if (field === 'awakening_progress') return `${compactIdentity(value.kind)}:${compactIdentity(value.name)}`;
  if (field === 'talent_evolution') return compactIdentity(value.talent);
  try { return JSON.stringify(value); } catch { return ''; }
}

function emptyProjection(reason = null) {
  return {
    preserved_delta: {},
    npc_state_updates: [],
    npc_schedule_updates: [],
    new_location: '',
    pc_status: '',
    completed_prefix_action_types: [],
    completed_prefix_clause_indexes: [],
    structured_execution: true,
    preserved_turn_fields: [],
    preserved_turn: {},
    boundary_event_id: '',
    reason,
  };
}

export function validateStructuredTimeExecution(turn = {}, plan = {}, runtime = {}) {
  const clauses = array(plan?.clauses), applicable = Boolean(plan?.eligible && clauses.length);
  if (!applicable) return { applicable: false, valid: false, reason: 'ineligible-plan' };
  const claim = object(turn?.time_execution), delta = object(turn?.state_delta);
  if (!Object.keys(claim).length) return { applicable: true, valid: false, reason: 'missing-contract' };
  if (claim.version !== TIME_EXECUTION_CONTRACT_VERSION || claim.plan_used !== true) return { applicable: true, valid: false, reason: 'inactive-contract' };
  const boundaryKind = String(claim.boundary_kind || ''), allowedBoundaries = new Set(['none', 'choice', 'schedule', 'consequence', 'turn-limit']);
  if (!allowedBoundaries.has(boundaryKind)) return { applicable: true, valid: false, reason: 'invalid-boundary-kind' };
  const minutes = Number(claim.boundary_minutes), returnedMinutes = Number(delta.advance_minutes || 0);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440 || minutes !== returnedMinutes) return { applicable: true, valid: false, reason: 'boundary-time-mismatch' };
  const requiredBoundaryKind = String(runtime?.required_boundary_kind || '');
  if (requiredBoundaryKind && boundaryKind !== requiredBoundaryKind) return { applicable: true, valid: false, reason: 'required-boundary-kind' };
  const runtimeBoundary = object(object(runtime?.boundaries)[boundaryKind]);
  if (['schedule', 'consequence', 'turn-limit'].includes(boundaryKind)) {
    const runtimeMinutes = Number(runtimeBoundary.minutes);
    if (!Number.isInteger(runtimeMinutes) || runtimeMinutes !== minutes) return { applicable: true, valid: false, reason: 'unverified-boundary-time' };
  }

  const rows = clauses.map((clause, position) => ({ ...clause, clause_id: clauseId(clause, position) })), ids = new Set(rows.map((row) => row.clause_id));
  if (ids.size !== rows.length) return { applicable: true, valid: false, reason: 'duplicate-clause-id' };
  const completedIds = array(claim.completed_clause_ids).map(String), completed = new Set(completedIds);
  if (completed.size !== completedIds.length || completedIds.some((id) => !ids.has(id))) return { applicable: true, valid: false, reason: 'invalid-completed-set' };

  let sawIncomplete = false, firstIncomplete = null;
  for (const row of rows) {
    const id = row.clause_id, reportedComplete = completed.has(id), startMin = Number(row.start_min_minutes), startMax = Number(row.start_max_minutes), completeMin = Number(row.complete_min_minutes), rawCompleteMax = row.complete_max_minutes, completeMax = rawCompleteMax == null ? null : Number(rawCompleteMax);
    if (reportedComplete && sawIncomplete) return { applicable: true, valid: false, reason: 'noncontiguous-completed-set' };
    if (!reportedComplete) { sawIncomplete = true; firstIncomplete ||= row; }
    const positiveMaximum = Number.isFinite(startMax) && Number.isFinite(completeMax) && completeMax > startMax;
    if (reportedComplete && (!Number.isFinite(completeMin) || minutes < completeMin || positiveMaximum && minutes <= startMin)) return { applicable: true, valid: false, reason: 'completion-before-range' };
    if (!reportedComplete && Number.isFinite(completeMax) && minutes >= completeMax) return { applicable: true, valid: false, reason: 'missing-deterministic-completion' };
  }

  const interruptedId = claim.interrupted_clause_id == null ? null : String(claim.interrupted_clause_id), expectedInterrupted = firstIncomplete ? firstIncomplete.clause_id : null;
  const expectedStartMin = Number(firstIncomplete?.start_min_minutes), expectedRawCompleteMax = firstIncomplete?.complete_max_minutes, expectedCompleteMax = expectedRawCompleteMax == null ? null : Number(expectedRawCompleteMax), interruptionRequired = Boolean(firstIncomplete && Number.isFinite(expectedStartMin) && minutes >= expectedStartMin && (!Number.isFinite(expectedCompleteMax) || minutes < expectedCompleteMax));
  if (interruptionRequired && interruptedId !== expectedInterrupted) return { applicable: true, valid: false, reason: 'missing-interrupted-clause' };
  if (interruptedId && interruptedId !== expectedInterrupted) return { applicable: true, valid: false, reason: 'invalid-interrupted-clause' };
  if (interruptedId) {
    const interrupted = rows.find((row) => row.clause_id === interruptedId), startMin = Number(interrupted?.start_min_minutes), rawCompleteMax = interrupted?.complete_max_minutes, completeMax = rawCompleteMax == null ? null : Number(rawCompleteMax);
    if (!Number.isFinite(startMin) || minutes < startMin || Number.isFinite(completeMax) && minutes >= completeMax) return { applicable: true, valid: false, reason: 'interruption-outside-range' };
  }

  const scene = array(turn?.scene), choices = array(turn?.choices), hasChoices = choices.some((choice) => String(choice || '').trim()), decisionIndex = claim.decision_scene_index == null ? null : Number(claim.decision_scene_index);
  if (hasChoices) {
    if (!Number.isInteger(decisionIndex) || decisionIndex !== scene.length - 1 || !String(scene[decisionIndex]?.text || '').trim()) return { applicable: true, valid: false, reason: 'invalid-decision-location' };
  } else if (decisionIndex != null) return { applicable: true, valid: false, reason: 'unexpected-decision-location' };
  if (boundaryKind === 'choice' && !hasChoices) return { applicable: true, valid: false, reason: 'choice-boundary-without-choices' };

  const boundaryEventId = String(claim.boundary_event_id || '').trim(), runtimeEventIds = new Set(array(runtimeBoundary.event_ids).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)), owners = array(claim.effect_owners), contributions = array(claim.scalar_contributions), ownerKeys = new Set();
  if (boundaryEventId && !runtimeEventIds.has(boundaryEventId.toLowerCase())) return { applicable: true, valid: false, reason: 'unverified-boundary-event' };
  if (['schedule', 'consequence'].includes(boundaryKind) && !boundaryEventId) return { applicable: true, valid: false, reason: 'missing-boundary-event' };
  for (const owner of owners) {
    const row = object(owner), scope = String(row.scope || ''), field = String(row.field || ''), ownerKind = String(row.owner_kind || ''), ownerId = String(row.owner_id || ''), effectIndex = row.effect_index == null ? null : Number(row.effect_index);
    if (!['state_delta', 'turn'].includes(scope) || !field || !['clause', 'boundary-event', 'world'].includes(ownerKind) || !ownerId) return { applicable: true, valid: false, reason: 'invalid-effect-owner' };
    if (effectIndex != null && (!Number.isInteger(effectIndex) || effectIndex < 0)) return { applicable: true, valid: false, reason: 'invalid-effect-index' };
    const effectSource = scope === 'state_delta' ? delta : turn;
    if (scope === 'turn' && !TURN_EFFECT_FIELDS.has(field)) return { applicable: true, valid: false, reason: 'unsupported-turn-effect' };
    if (!Object.prototype.hasOwnProperty.call(effectSource, field)) return { applicable: true, valid: false, reason: 'missing-owned-effect' };
    if (Array.isArray(effectSource[field])) {
      if (effectIndex == null || effectIndex >= effectSource[field].length) return { applicable: true, valid: false, reason: 'invalid-array-effect-index' };
    } else {
      if (effectIndex != null) return { applicable: true, valid: false, reason: 'unexpected-scalar-effect-index' };
      if (scope === 'state_delta' && typeof effectSource[field] === 'number') return { applicable: true, valid: false, reason: 'scalar-contribution-required' };
    }
    if (ownerKind === 'clause' && !ids.has(ownerId)) return { applicable: true, valid: false, reason: 'unknown-effect-clause' };
    if (ownerKind === 'boundary-event' && (!boundaryEventId || ownerId !== boundaryEventId)) return { applicable: true, valid: false, reason: 'invalid-boundary-event-owner' };
    if (scope === 'turn' && (ownerKind !== 'boundary-event' || ownerId !== boundaryEventId)) return { applicable: true, valid: false, reason: 'invalid-turn-effect-owner' };
    if (scope === 'turn' && field === 'event_progress') {
      const progress = object(turn.event_progress), progressId = String(progress.event_instance_id || progress.eventInstanceId || '').trim().toLowerCase();
      if (!progressId || progressId !== ownerId.toLowerCase()) return { applicable: true, valid: false, reason: 'mismatched-turn-event-progress' };
    }
    if (scope === 'turn' && field === 'director' && (!boundaryEventId.startsWith('director:') || ownerKind !== 'boundary-event')) return { applicable: true, valid: false, reason: 'invalid-director-owner' };
    const key = `${scope}:${field}:${effectIndex == null ? 'scalar' : effectIndex}`;
    if (ownerKeys.has(key)) return { applicable: true, valid: false, reason: 'duplicate-effect-owner' };
    ownerKeys.add(key);
  }
  const ownedTurnFields = new Set(owners.filter((owner) => object(owner).scope === 'turn').map((owner) => String(object(owner).field || '')));
  if (ownedTurnFields.has('director') && !ownedTurnFields.has('event_progress')) return { applicable: true, valid: false, reason: 'director-without-progress-owner' };

  const contributionSums = new Map();
  for (const rawContribution of contributions) {
    const contribution = object(rawContribution), field = String(contribution.field || ''), amount = Number(contribution.amount), ownerKind = String(contribution.owner_kind || ''), ownerId = String(contribution.owner_id || '');
    const limit = Number(SCALAR_LIMITS[field] || 0);
    if (!limit || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > limit || !['clause', 'boundary-event', 'world'].includes(ownerKind) || !ownerId) return { applicable: true, valid: false, reason: 'invalid-scalar-contribution' };
    if (ownerKind === 'clause' && !ids.has(ownerId)) return { applicable: true, valid: false, reason: 'unknown-scalar-clause' };
    if (ownerKind === 'boundary-event' && (!boundaryEventId || ownerId !== boundaryEventId)) return { applicable: true, valid: false, reason: 'invalid-scalar-boundary-owner' };
    contributionSums.set(field, Number(contributionSums.get(field) || 0) + amount);
  }
  for (const field of ['fatigue_delta', 'gold_delta']) {
    if (Number(contributionSums.get(field) || 0) !== Number(delta[field] || 0)) return { applicable: true, valid: false, reason: 'scalar-contribution-mismatch' };
  }

  return {
    applicable: true,
    valid: true,
    reason: null,
    claim,
    boundary_kind: boundaryKind,
    boundary_minutes: minutes,
    boundary_event_id: boundaryEventId,
    decision_scene_index: decisionIndex,
    completed_clause_ids: completedIds,
    completed_clause_set: completed,
    interrupted_clause_id: interruptedId,
    clauses: rows,
    effect_owners: owners,
    scalar_contributions: contributions,
    verified_boundary_event_ids: runtimeEventIds,
  };
}

export function projectStructuredOwnedEffects(turn = {}, authority = {}, appliedMinutes = null) {
  if (!authority?.valid) return emptyProjection(authority?.reason || 'invalid-contract');
  if (appliedMinutes != null && Number(appliedMinutes) !== Number(authority.boundary_minutes)) return emptyProjection('boundary-rebased');
  const delta = object(turn?.state_delta), completed = authority.completed_clause_set instanceof Set ? authority.completed_clause_set : new Set(array(authority.completed_clause_ids).map(String)), boundaryEventId = String(authority.boundary_event_id || '');
  const verifiedBoundaryEvents = authority.verified_boundary_event_ids instanceof Set ? authority.verified_boundary_event_ids : new Set(), keepOwner = (owner) => owner?.owner_kind === 'clause' ? completed.has(String(owner.owner_id || '')) : owner?.owner_kind === 'boundary-event' ? boundaryEventId && verifiedBoundaryEvents.has(boundaryEventId.toLowerCase()) && String(owner.owner_id || '') === boundaryEventId : false;
  const arrayIndexes = new Map(), scalarFields = new Set(), turnFields = new Set();
  for (const rawOwner of array(authority.effect_owners)) {
    const owner = object(rawOwner);if (!keepOwner(owner)) continue;
    const field = String(owner.field || ''), scope = String(owner.scope || ''), index = owner.effect_index == null ? null : Number(owner.effect_index);
    if (scope === 'turn') { turnFields.add(field); continue; }
    if (field === 'advance_minutes') continue;
    if (index == null) scalarFields.add(field);
    else { if (!arrayIndexes.has(field)) arrayIndexes.set(field, new Set()); arrayIndexes.get(field).add(index); }
  }

  const preservedDelta = {};
  for (const [field, indexes] of arrayIndexes) {
    const source = array(delta[field]), kept = source.filter((_, index) => indexes.has(index));
    if (kept.length) preservedDelta[field] = kept;
  }
  for (const field of scalarFields) {
    const value = delta[field];
    if (value != null && value !== '' && value !== false && !(typeof value === 'number' && value === 0)) preservedDelta[field] = value;
  }
  for (const rawContribution of array(authority.scalar_contributions)) {
    const contribution = object(rawContribution);if (!keepOwner(contribution)) continue;
    const field = String(contribution.field || ''), amount = Number(contribution.amount);
    if (Number.isInteger(amount) && amount !== 0) preservedDelta[field] = Number(preservedDelta[field] || 0) + amount;
  }
  for (const [field, limit] of Object.entries(SCALAR_LIMITS)) {
    if (Number.isFinite(Number(preservedDelta[field]))) preservedDelta[field] = Math.max(-limit, Math.min(limit, Number(preservedDelta[field])));
  }
  const completedRows = authority.clauses.filter((row) => completed.has(row.clause_id));
  const projection = emptyProjection();
  projection.preserved_delta = preservedDelta;
  projection.npc_state_updates = array(preservedDelta.npc_state_updates);
  projection.npc_schedule_updates = array(preservedDelta.npc_schedule_updates);
  delete projection.preserved_delta.npc_state_updates;
  delete projection.preserved_delta.npc_schedule_updates;
  projection.new_location = scalarFields.has('new_location') ? String(delta.new_location || '').trim() : '';
  projection.pc_status = scalarFields.has('pc_status') ? String(delta.pc_status || '').trim() : '';
  delete projection.preserved_delta.new_location;
  delete projection.preserved_delta.pc_status;
  projection.completed_prefix_action_types = [...new Set(completedRows.map((row) => String(row.action_type || '')).filter(Boolean))];
  projection.completed_prefix_clause_indexes = completedRows.map((row) => Number(row.index)).filter(Number.isFinite);
  projection.preserved_turn_fields = [...turnFields];
  projection.preserved_turn = Object.fromEntries([...turnFields].map((field) => {
    const value = turn[field];
    if (Array.isArray(value)) return [field, value.map((row) => row && typeof row === 'object' ? { ...row } : row)];
    return [field, value && typeof value === 'object' ? { ...value } : value];
  }));
  projection.boundary_event_id = boundaryEventId;
  return projection;
}

export function replaceStructuredEffectRows(turn = {}, field = '', nextRows = []) {
  const delta = object(turn?.state_delta), previousRows = array(delta[field]), acceptedRows = array(nextRows);
  if (!field || !Array.isArray(delta[field])) return acceptedRows;
  const sourceToPrevious = new Map(), queues = new Map();
  previousRows.forEach((row, index) => {
    const source = object(row)[TIME_EFFECT_SOURCE];if (Number.isInteger(source)) sourceToPrevious.set(source, index);
    const key = effectRowIdentity(field, row);if (!queues.has(key)) queues.set(key, []);queues.get(key).push(index);
  });
  const oldToNew = new Map();
  acceptedRows.forEach((row, newIndex) => {
    const source = object(row)[TIME_EFFECT_SOURCE];
    if (Number.isInteger(source) && sourceToPrevious.has(source)) { oldToNew.set(sourceToPrevious.get(source), newIndex);return; }
    const queue = queues.get(effectRowIdentity(field, row));
    if (queue?.length) oldToNew.set(queue.shift(), newIndex);
  });
  const claim = object(turn?.time_execution);
  if (Array.isArray(claim.effect_owners)) {
    claim.effect_owners = claim.effect_owners.flatMap((rawOwner) => {
      const owner = object(rawOwner);
      if (owner.scope !== 'state_delta' || owner.field !== field) return [rawOwner];
      const oldIndex = Number(owner.effect_index);
      return oldToNew.has(oldIndex) ? [{ ...owner, effect_index:oldToNew.get(oldIndex) }] : [];
    });
  }
  delta[field] = acceptedRows;
  return acceptedRows;
}

export function structuredEffectRows(turn = {}, field = '') {
  const rows = array(object(turn?.state_delta)[field]);
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Number.isInteger(row[TIME_EFFECT_SOURCE])) return;
    Object.defineProperty(row, TIME_EFFECT_SOURCE, { value:index, enumerable:true, configurable:false, writable:false });
  });
  return rows;
}
