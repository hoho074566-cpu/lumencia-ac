// Lumensia V1.5.6 NPC Significance Evaluator V1
// Model-owned semantic foreground selection with deterministic candidate bounds only.

export const NPC_SIGNIFICANCE_VERSION = '1.0';

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function unique(values, limit = 6) { return [...new Set(array(values).map(String).filter(Boolean))].slice(0, limit); }

export function deriveNpcSignificanceBoundary({ candidateKeys = [], registry = {}, mode = 'game', orchestration = null } = {}) {
  const known = object(registry);
  const plan = object(orchestration);
  const normalizedMode = ['game', 'auto', 'continue', 'meta'].includes(mode) ? mode : 'game';
  const frozen = normalizedMode === 'meta'
    || normalizedMode === 'continue'
    || plan.primary === 'frozen'
    || plan.primary === 'player-boundary'
    || Number(plan.max_drivers) === 0;
  const eligibleKeys = frozen
    ? []
    : unique(candidateKeys).filter((key) => Object.prototype.hasOwnProperty.call(known, key));
  return {
    version: NPC_SIGNIFICANCE_VERSION,
    mode: frozen ? 'freeze' : eligibleKeys.length ? 'semantic' : 'none',
    eligible_keys: eligibleKeys,
    primary_limit: 1,
    support_limit: 1,
    source: 'routed-npc-context',
  };
}

export function applyNpcSignificanceReceipt(turn, { boundary = null } = {}) {
  const row = object(boundary);
  const director = object(turn?.director);
  const eligible = new Set(unique(row.eligible_keys));
  const proposed = unique(director.spotlight_keys, 4);
  const accepted = row.mode === 'semantic'
    ? proposed.filter((key) => eligible.has(key)).slice(0, 2)
    : [];
  const acceptedSet = new Set(accepted);
  const rejected = proposed.filter((key) => !acceptedSet.has(key));
  if (turn && typeof turn === 'object' && turn.director && typeof turn.director === 'object') {
    turn.director.spotlight_keys = accepted;
  }
  return {
    version: NPC_SIGNIFICANCE_VERSION,
    mode: row.mode || 'none',
    source: 'model-director-spotlight',
    eligible_keys: [...eligible],
    primary_key: accepted[0] || null,
    support_key: accepted[1] || null,
    significant_keys: accepted,
    rejected_keys: rejected,
  };
}
