const MAX_COMPLETED_BEATS = 24;
const FINGERPRINT_BITS = 1024;
const ID = /^[a-z0-9][a-z0-9._:#-]{0,79}$/i;

function cleanId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return ID.test(id) ? id.toLowerCase() : '';
}

function hash(text, seed) {
  let value = seed >>> 0;
  for (const char of text) { value ^= char.charCodeAt(0); value = Math.imul(value, 0x01000193); }
  return value >>> 0;
}

function fingerprint(value) {
  return typeof value === 'string' && /^[0-9a-f]{256}$/i.test(value) ? value.toLowerCase() : '0'.repeat(256);
}

function addFingerprint(value, beat) {
  const bytes = Uint8Array.from(value.match(/../g).map(x => Number.parseInt(x, 16)));
  for (const seed of [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]) { const bit=hash(beat,seed)%FINGERPRINT_BITS; bytes[bit>>3]|=1<<(bit&7); }
  return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function fingerprintHas(value, beat) {
  const bytes=value.match(/../g).map(x=>Number.parseInt(x,16));
  return [0x811c9dc5,0x9e3779b9,0x85ebca6b,0xc2b2ae35].every(seed=>{const bit=hash(beat,seed)%FINGERPRINT_BITS;return Boolean(bytes[bit>>3]&(1<<(bit&7)));});
}

export function normalizeEventProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const eventInstanceId = cleanId(value.event_instance_id ?? value.eventInstanceId);
  if (!eventInstanceId) return null;
  const completed = Array.isArray(value.completed_beats ?? value.completedBeats)
    ? (value.completed_beats ?? value.completedBeats).map(cleanId).filter(Boolean) : [];
  let completionFingerprint=fingerprint(value.completion_fingerprint ?? value.completionFingerprint);
  for(const beat of completed) completionFingerprint=addFingerprint(completionFingerprint,beat);
  const activeBeat=cleanId(value.active_beat ?? value.activeBeat) || null;
  return { eventInstanceId, activeBeat:activeBeat&&fingerprintHas(completionFingerprint,activeBeat)?null:activeBeat, completedBeats:[...new Set(completed)].slice(-MAX_COMPLETED_BEATS), completionFingerprint };
}

export function mergeEventProgress(previousValue, incomingValue, { allowInstanceChange = true } = {}) {
  const previous = normalizeEventProgress(previousValue);
  const incoming = normalizeEventProgress(incomingValue);
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (previous.eventInstanceId !== incoming.eventInstanceId) return allowInstanceChange ? incoming : previous;
  let completionFingerprint=previous.completionFingerprint;
  const completedBeats=[...previous.completedBeats];
  for(const beat of incoming.completedBeats){completionFingerprint=addFingerprint(completionFingerprint,beat);if(!completedBeats.includes(beat))completedBeats.push(beat);}
  const compactCompleted=completedBeats.slice(-MAX_COMPLETED_BEATS);
  const activeBeat=incoming.activeBeat&&fingerprintHas(completionFingerprint,incoming.activeBeat)?null:incoming.activeBeat;
  return { eventInstanceId:previous.eventInstanceId, activeBeat, completedBeats:compactCompleted, completionFingerprint };
}

export function compactEventProgress(value) {
  const progress = normalizeEventProgress(value);
  if (!progress) return '';
  return `event=${progress.eventInstanceId}; active=${progress.activeBeat || '-'}; completed=${progress.completedBeats.join(',') || '-'}; anchor=continue after completed beats; never execute them again`;
}

export function isEventBeatEligible(value, beatId) {
  const progress = normalizeEventProgress(value);
  const beat = cleanId(beatId);
  return Boolean(beat) && !(progress && fingerprintHas(progress.completionFingerprint,beat));
}

export function mergeRoutedEventProgress(previous, incoming, { dueEventIds = [], directorOccurrenceId = '' } = {}) {
  const next=normalizeEventProgress(incoming), directorId=cleanId(directorOccurrenceId);
  const routedNext=next&&directorId?{...next,eventInstanceId:directorId}:next;
  const due=new Set(dueEventIds.map(cleanId).filter(Boolean));
  const allowInstanceChange=!normalizeEventProgress(previous)||Boolean(routedNext&&(due.has(routedNext.eventInstanceId)||routedNext.eventInstanceId===directorId));
  return mergeEventProgress(previous,routedNext,{allowInstanceChange});
}
