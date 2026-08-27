export const CANONICAL_RESOLUTION_OUTCOMES = Object.freeze(['none', 'success', 'partial', 'failure']);
const CANONICAL_RESOLUTION_OUTCOME_SET = new Set(CANONICAL_RESOLUTION_OUTCOMES);
const CANONICAL_RESOLUTION_ABILITY_KINDS = new Set(['skill', 'stat', 'trait', 'authority']);
const CANONICAL_RESOLUTION_ABILITY_ROLES = new Set(['primary', 'support', 'passive']);

const arrays = (value, max) => Array.isArray(value) ? value.slice(0, max) : [];

export function sanitizeCanonicalResolutionLog(value = {}) {
  const rawResolution = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const triggered = Boolean(rawResolution.triggered);
  const outcome = CANONICAL_RESOLUTION_OUTCOME_SET.has(rawResolution.outcome) ? rawResolution.outcome : 'none';
  return {
    triggered,
    outcome,
    summary: outcome === 'none' ? null : (String(rawResolution.summary || '').slice(0,320) || null),
    abilities: triggered ? arrays(rawResolution.abilities, 5)
      .filter((row) => CANONICAL_RESOLUTION_ABILITY_KINDS.has(row?.kind) && String(row?.name || '').trim() && String(row?.reason || '').trim())
      .map((row) => ({
        kind: row.kind,
        name: String(row.name).slice(0,80),
        role: CANONICAL_RESOLUTION_ABILITY_ROLES.has(row.role) ? row.role : 'support',
        reason: String(row.reason).slice(0,240),
      })) : [],
  };
}
