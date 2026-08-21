const LEGACY_NPC_KEY = 'lilia';
const CANONICAL_NPC_KEY = 'lillia';

function stableUnique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const signature = value && typeof value === 'object' ? JSON.stringify(value) : `${typeof value}:${value}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function chronological(values) {
  if (!values.every((value) => !value || typeof value !== 'object' || Number.isFinite(Number(value.turn)))) return values;
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => Number(a.value?.turn || 0) - Number(b.value?.turn || 0) || a.index - b.index)
    .map(({ value }) => value);
}

function mergeLegacyIntoCanonical(legacy, canonical) {
  if (Array.isArray(legacy) || Array.isArray(canonical)) {
    return chronological(stableUnique([
      ...(Array.isArray(legacy) ? legacy : []),
      ...(Array.isArray(canonical) ? canonical : []),
    ]));
  }
  if (legacy && canonical && typeof legacy === 'object' && typeof canonical === 'object') {
    const merged = { ...legacy };
    for (const [key, value] of Object.entries(canonical)) {
      merged[key] = key in merged ? mergeLegacyIntoCanonical(merged[key], value) : value;
    }
    // Exposure counters describe the same identity and must never be double-counted.
    if (Number.isFinite(Number(legacy.appearances)) && Number.isFinite(Number(canonical.appearances))) {
      merged.appearances = Math.max(Number(legacy.appearances), Number(canonical.appearances));
    }
    return merged;
  }
  return canonical ?? legacy;
}

function migrateValue(value) {
  if (value === LEGACY_NPC_KEY) return CANONICAL_NPC_KEY;
  if (value === `npc:${LEGACY_NPC_KEY}`) return `npc:${CANONICAL_NPC_KEY}`;
  if (Array.isArray(value)) {
    const migrated = value.map(migrateValue);
    return migrated.some((item, index) => item !== value[index]) ? stableUnique(migrated) : migrated;
  }
  if (!value || typeof value !== 'object') return value;

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === LEGACY_NPC_KEY) continue;
    result[key] = migrateValue(child);
  }
  if (Object.hasOwn(value, LEGACY_NPC_KEY)) {
    const legacy = migrateValue(value[LEGACY_NPC_KEY]);
    result[CANONICAL_NPC_KEY] = Object.hasOwn(value, CANONICAL_NPC_KEY)
      ? migrateValue(mergeLegacyIntoCanonical(legacy, value[CANONICAL_NPC_KEY]))
      : legacy;
  }
  return result;
}

// Runs before normal save defaults are applied so imported/local legacy identities
// cannot reach rendering, scheduling, Director, or server payload construction.
export function migrateLegacyNpcKeys(raw) {
  return raw && typeof raw === 'object' ? migrateValue(raw) : raw;
}
