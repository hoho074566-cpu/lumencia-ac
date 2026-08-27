export const RELATIONSHIP_THRESHOLDS_VERSION = '1.0';

const SIGNALS = new Set([
  'none',
  'trust_opened',
  'trust_withdrawn',
  'hostility_opened',
  'hostility_eased',
]);

const ENTRY_BOUND = 30;
const RELEASE_BOUND = 20;

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value : [];
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const text = (value, max = 180) => String(value || '').trim().slice(0, max);

function activeThresholds(innerState = {}) {
  const saved = object(object(innerState).relationship_thresholds);
  if (saved.version !== RELATIONSHIP_THRESHOLDS_VERSION) return { trust: false, hostility: false };
  return {
    trust: saved.trust_active === true,
    hostility: saved.hostility_active === true,
  };
}

export function deriveRelationshipThresholdContext({ relationship = {}, innerState = {} } = {}) {
  const affinity = Math.trunc(clamp(relationship?.affinity, -100, 100));
  const trust = Math.trunc(clamp(relationship?.trust, -100, 100));
  const active = activeThresholds(innerState);
  const eligible = [];

  if (!active.trust && trust >= ENTRY_BOUND) eligible.push('trust_opened');
  if (active.trust && trust < RELEASE_BOUND) eligible.push('trust_withdrawn');
  if (!active.hostility && (affinity <= -ENTRY_BOUND || trust <= -ENTRY_BOUND)) eligible.push('hostility_opened');
  if (active.hostility && affinity > -RELEASE_BOUND && trust > -RELEASE_BOUND) eligible.push('hostility_eased');

  return {
    version: RELATIONSHIP_THRESHOLDS_VERSION,
    affinity,
    trust,
    trust_active: active.trust,
    hostility_active: active.hostility,
    eligible_signals: eligible,
  };
}

function transitionAllowed(signal, { before, after, affinityDelta, trustDelta, followup }) {
  if (!followup) return false;
  if (signal === 'trust_opened') return !before.trust && trustDelta > 0 && after.trust >= ENTRY_BOUND;
  if (signal === 'trust_withdrawn') return before.trust && trustDelta < 0 && after.trust < RELEASE_BOUND;
  if (signal === 'hostility_opened') {
    return !before.hostility
      && (affinityDelta < 0 || trustDelta < 0)
      && (after.affinity <= -ENTRY_BOUND || after.trust <= -ENTRY_BOUND);
  }
  if (signal === 'hostility_eased') {
    return before.hostility
      && (affinityDelta > 0 || trustDelta > 0)
      && after.affinity > -RELEASE_BOUND
      && after.trust > -RELEASE_BOUND;
  }
  return false;
}

function nextActive(before, signal) {
  if (signal === 'trust_opened') return { ...before, trust: true };
  if (signal === 'trust_withdrawn') return { ...before, trust: false };
  if (signal === 'hostility_opened') return { ...before, hostility: true };
  if (signal === 'hostility_eased') return { ...before, hostility: false };
  return before;
}

export function applyRelationshipThresholdReceipts(turn, {
  relationships = {},
  npcInnerStates = {},
  registeredNpcKeys = [],
  mode = 'game',
  turnNumber = 0,
} = {}) {
  const rows = array(turn?.state_delta?.relationship_changes);
  const frozen = mode !== 'game';
  const registered = new Set(array(registeredNpcKeys).map(String));
  const working = new Map();
  const acceptedNpcKeys = new Set();
  const npcUpdates = {};
  const transitions = [];
  let rejectedCount = 0;

  for (const row of rows) {
    const key = text(row?.npc_key, 64);
    const previousRelationship = working.get(key) || object(relationships)[key] || {};
    const affinityDelta = Math.trunc(clamp(row?.affinity_delta, -10, 10));
    const trustDelta = Math.trunc(clamp(row?.trust_delta, -10, 10));
    const after = {
      affinity: Math.trunc(clamp(Number(previousRelationship?.affinity || 0) + affinityDelta, -100, 100)),
      trust: Math.trunc(clamp(Number(previousRelationship?.trust || 0) + trustDelta, -100, 100)),
    };
    working.set(key, { ...previousRelationship, ...after });

    const claimed = SIGNALS.has(row?.threshold_signal) ? row.threshold_signal : 'none';
    const unknownClaim = row?.threshold_signal != null && !SIGNALS.has(row.threshold_signal);
    const before = activeThresholds(npcUpdates[key] || object(npcInnerStates)[key]);
    const followup = text(row?.followup, 180);
    const accepted = !frozen
      && registered.has(key)
      && claimed !== 'none'
      && !acceptedNpcKeys.has(key)
      && transitionAllowed(claimed, { before, after, affinityDelta, trustDelta, followup });

    row.threshold_signal = accepted ? claimed : 'none';
    if ((claimed !== 'none' || unknownClaim) && !accepted) rejectedCount += 1;
    if (!accepted) continue;

    acceptedNpcKeys.add(key);
    const next = nextActive(before, claimed);
    const cause = text(row?.cause || row?.reason, 180);
    npcUpdates[key] = {
      relationship_thresholds: {
        version: RELATIONSHIP_THRESHOLDS_VERSION,
        trust_active: next.trust,
        hostility_active: next.hostility,
        last_transition: claimed,
        cause,
        followup,
        updated_turn: Math.max(0, Math.trunc(Number(turnNumber) || 0)),
      },
    };
    transitions.push({ npc_key: key, signal: claimed });
  }

  return {
    version: RELATIONSHIP_THRESHOLDS_VERSION,
    mode,
    frozen,
    accepted_count: transitions.length,
    rejected_count: rejectedCount,
    transitions,
    npc_updates: npcUpdates,
  };
}
