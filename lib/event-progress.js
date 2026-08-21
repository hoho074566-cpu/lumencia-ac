const MAX_COMPLETED_BEATS = 24;
const ID = /^[a-z0-9][a-z0-9._:#-]{0,79}$/i;

function cleanId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return ID.test(id) ? id : '';
}

export function normalizeEventProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const eventInstanceId = cleanId(value.event_instance_id ?? value.eventInstanceId);
  if (!eventInstanceId) return null;
  const completed = Array.isArray(value.completed_beats ?? value.completedBeats)
    ? (value.completed_beats ?? value.completedBeats).map(cleanId).filter(Boolean) : [];
  return { eventInstanceId, activeBeat:cleanId(value.active_beat ?? value.activeBeat) || null, completedBeats:[...new Set(completed)].slice(-MAX_COMPLETED_BEATS) };
}

export function mergeEventProgress(previousValue, incomingValue, { allowInstanceChange = true } = {}) {
  const previous = normalizeEventProgress(previousValue);
  const incoming = normalizeEventProgress(incomingValue);
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (previous.eventInstanceId !== incoming.eventInstanceId) return allowInstanceChange ? incoming : previous;
  const completedBeats = [...previous.completedBeats];
  for (const beat of incoming.completedBeats) if (!completedBeats.includes(beat) && completedBeats.length < MAX_COMPLETED_BEATS) completedBeats.push(beat);
  return { eventInstanceId:previous.eventInstanceId, activeBeat:completedBeats.includes(incoming.activeBeat) ? null : incoming.activeBeat, completedBeats };
}

export function compactEventProgress(value) {
  const progress = normalizeEventProgress(value);
  if (!progress) return '';
  return `event=${progress.eventInstanceId}; active=${progress.activeBeat || '-'}; completed=${progress.completedBeats.join(',') || '-'}; anchor=continue after completed beats; never execute them again`;
}

export function isEventBeatEligible(value, beatId) {
  const progress = normalizeEventProgress(value);
  const beat = cleanId(beatId);
  return Boolean(beat) && !progress?.completedBeats.includes(beat);
}
