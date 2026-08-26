// Time Plan Parser Phase 3 structural reconciliation.
// The user action plan owns clause identity; returned narration is not effect authority.

export const TIME_EXECUTION_CONTRACT_VERSION = '1.0';

const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clauseId = (clause, position = 0) => String(clause?.clause_id || `action_${Number(clause?.index || position + 1)}`);

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
    boundary_event_id: '',
    reason,
  };
}

export function validateStructuredTimeExecution(turn = {}, plan = {}) {
  const clauses = array(plan?.clauses), applicable = Boolean(plan?.eligible && clauses.length);
  if (!applicable) return { applicable: false, valid: false, reason: 'ineligible-plan' };
  const claim = object(turn?.time_execution), delta = object(turn?.state_delta);
  if (!Object.keys(claim).length) return { applicable: true, valid: false, reason: 'missing-contract' };
  if (claim.version !== TIME_EXECUTION_CONTRACT_VERSION || claim.plan_used !== true) return { applicable: true, valid: false, reason: 'inactive-contract' };
  const boundaryKind = String(claim.boundary_kind || ''), allowedBoundaries = new Set(['none', 'choice', 'schedule', 'consequence', 'turn-limit']);
  if (!allowedBoundaries.has(boundaryKind)) return { applicable: true, valid: false, reason: 'invalid-boundary-kind' };
  const minutes = Number(claim.boundary_minutes), returnedMinutes = Number(delta.advance_minutes || 0);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440 || minutes !== returnedMinutes) return { applicable: true, valid: false, reason: 'boundary-time-mismatch' };

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

  const scene = array(turn?.scene), choices = array(turn?.choices), decisionIndex = claim.decision_scene_index == null ? null : Number(claim.decision_scene_index);
  if (boundaryKind === 'choice') {
    if (!choices.some((choice) => String(choice || '').trim()) || !Number.isInteger(decisionIndex) || decisionIndex !== scene.length - 1 || !String(scene[decisionIndex]?.text || '').trim()) return { applicable: true, valid: false, reason: 'invalid-decision-location' };
  } else if (decisionIndex != null) return { applicable: true, valid: false, reason: 'unexpected-decision-location' };

  const boundaryEventId = String(claim.boundary_event_id || '').trim(), owners = array(claim.effect_owners), ownerKeys = new Set();
  for (const owner of owners) {
    const row = object(owner), scope = String(row.scope || ''), field = String(row.field || ''), ownerKind = String(row.owner_kind || ''), ownerId = String(row.owner_id || ''), effectIndex = row.effect_index == null ? null : Number(row.effect_index);
    if (!['state_delta', 'turn'].includes(scope) || !field || !['clause', 'boundary-event', 'world'].includes(ownerKind) || !ownerId) return { applicable: true, valid: false, reason: 'invalid-effect-owner' };
    if (effectIndex != null && (!Number.isInteger(effectIndex) || effectIndex < 0)) return { applicable: true, valid: false, reason: 'invalid-effect-index' };
    const effectSource = scope === 'state_delta' ? delta : turn;
    if (!Object.prototype.hasOwnProperty.call(effectSource, field)) return { applicable: true, valid: false, reason: 'missing-owned-effect' };
    if (Array.isArray(effectSource[field])) {
      if (effectIndex == null || effectIndex >= effectSource[field].length) return { applicable: true, valid: false, reason: 'invalid-array-effect-index' };
    } else if (effectIndex != null) return { applicable: true, valid: false, reason: 'unexpected-scalar-effect-index' };
    if (ownerKind === 'clause' && !ids.has(ownerId)) return { applicable: true, valid: false, reason: 'unknown-effect-clause' };
    if (ownerKind === 'boundary-event' && (!boundaryEventId || ownerId !== boundaryEventId)) return { applicable: true, valid: false, reason: 'invalid-boundary-event-owner' };
    const key = `${scope}:${field}:${effectIndex == null ? 'scalar' : effectIndex}`;
    if (ownerKeys.has(key)) return { applicable: true, valid: false, reason: 'duplicate-effect-owner' };
    ownerKeys.add(key);
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
  };
}

export function projectStructuredOwnedEffects(turn = {}, authority = {}, appliedMinutes = null) {
  if (!authority?.valid) return emptyProjection(authority?.reason || 'invalid-contract');
  if (appliedMinutes != null && Number(appliedMinutes) !== Number(authority.boundary_minutes)) return emptyProjection('boundary-rebased');
  const delta = object(turn?.state_delta), completed = authority.completed_clause_set instanceof Set ? authority.completed_clause_set : new Set(array(authority.completed_clause_ids).map(String)), boundaryEventId = String(authority.boundary_event_id || '');
  const keepOwner = (owner) => owner?.owner_kind === 'clause' ? completed.has(String(owner.owner_id || '')) : owner?.owner_kind === 'boundary-event' ? boundaryEventId && String(owner.owner_id || '') === boundaryEventId : false;
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
  projection.boundary_event_id = boundaryEventId;
  return projection;
}
