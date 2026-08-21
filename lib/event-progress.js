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
  const uniqueCompleted=[...new Set(completed)];
  return { eventInstanceId, activeBeat:activeBeat&&fingerprintHas(completionFingerprint,activeBeat)?null:activeBeat, completedBeats:uniqueCompleted.slice(-MAX_COMPLETED_BEATS), completionFingerprint, omittedCompletedCount:Math.max(uniqueCompleted.length-MAX_COMPLETED_BEATS,Number(value.omitted_completed_count??value.omittedCompletedCount)||0), resumeKey:String(value.resume_key??value.resumeKey??'').trim().toLowerCase().slice(0,160) };
}

export function mergeEventProgress(previousValue, incomingValue, { allowInstanceChange = true } = {}) {
  const previous = normalizeEventProgress(previousValue);
  if(incomingValue===null)return null;
  const incoming = normalizeEventProgress(incomingValue);
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (previous.eventInstanceId !== incoming.eventInstanceId) return allowInstanceChange ? incoming : previous;
  let completionFingerprint=previous.completionFingerprint;
  const completedBeats=[...previous.completedBeats];
  for(const beat of incoming.completedBeats){const alreadyCompleted=fingerprintHas(completionFingerprint,beat);completionFingerprint=addFingerprint(completionFingerprint,beat);if(!alreadyCompleted)completedBeats.push(beat);}
  const compactCompleted=completedBeats.slice(-MAX_COMPLETED_BEATS);
  const omittedCompletedCount=previous.omittedCompletedCount+Math.max(0,completedBeats.length-MAX_COMPLETED_BEATS);
  const activeBeat=incoming.activeBeat&&fingerprintHas(completionFingerprint,incoming.activeBeat)?null:incoming.activeBeat;
  return { eventInstanceId:previous.eventInstanceId, activeBeat, completedBeats:compactCompleted, completionFingerprint, omittedCompletedCount };
}

export function compactEventProgress(value) {
  const progress = normalizeEventProgress(value);
  if (!progress) return '';
  return `event=${progress.eventInstanceId}; active=${progress.activeBeat || '-'}; completed=${progress.completedBeats.join(',') || '-'}; omitted_completed=${progress.omittedCompletedCount}; anchor=all omitted beats are also completed; continue after the latest position; never execute any earlier beat again`;
}

export function isEventBeatEligible(value, beatId) {
  const progress = normalizeEventProgress(value);
  const beat = cleanId(beatId);
  return Boolean(beat) && !(progress && fingerprintHas(progress.completionFingerprint,beat));
}

export function occurrenceIdFromStartEvidence(date, turn, evidence) {
  const text=String(evidence||'').trim().toLowerCase();
  if(!text)return'';
  return `started:${cleanId(date)||'undated'}:t${Math.max(0,Number(turn)||0)}:${hash(text,0x811c9dc5).toString(16).padStart(8,'0')}`;
}

export function scheduledIdsDueByTurnEnd(save = {}, advanceMinutes = 0) {
  const world=save.world||{},[year,month,day]=String(world.date||'').split('-').map(Number),[hour,minute]=String(world.time||'').split(':').map(Number);
  const start=Date.UTC(year,month-1,day,hour,minute),end=start+Math.max(0,Number(advanceMinutes)||0)*60000;
  const due=Array.isArray(save.scheduleContext?.due)?save.scheduleContext.due.map(row=>String(row?.id||'')).filter(Boolean):[];
  if(!Number.isFinite(start))return due;
  for(const event of Array.isArray(save.scheduledEvents)?save.scheduledEvents:[]){
    if(!event?.id||['completed','cancelled'].includes(event.status)||due.includes(String(event.id)))continue;
    const [ey,em,ed]=String(event.date||'').split('-').map(Number),[eh,emin]=String(event.time||'').split(':').map(Number);
    const at=Date.UTC(ey,em-1,ed,eh,emin);if(Number.isFinite(at)&&at<=end)due.push(String(event.id));
  }
  return due;
}

export function mergeRoutedEventProgress(previous, incoming, { dueEventIds = [], directorOccurrenceId = '', startedOccurrenceId = '' } = {}) {
  if(incoming===null)return null;
  const next=normalizeEventProgress(incoming), directorId=cleanId(directorOccurrenceId);
  if(!next)return mergeEventProgress(previous,undefined);
  const startedId=cleanId(startedOccurrenceId);
  const usedDirector=Boolean(next&&directorId&&next.eventInstanceId===directorId);
  const keepsCurrent=Boolean(next&&normalizeEventProgress(previous)?.eventInstanceId===next.eventInstanceId);
  const routedNext=next&&startedId&&!usedDirector&&!keepsCurrent?{...next,eventInstanceId:startedId}:next;
  const due=new Set(dueEventIds.map(cleanId).filter(Boolean));
  const allowInstanceChange=!normalizeEventProgress(previous)||Boolean(routedNext&&(due.has(routedNext.eventInstanceId)||routedNext.eventInstanceId===directorId||routedNext.eventInstanceId===startedId));
  return mergeEventProgress(previous,routedNext,{allowInstanceChange});
}

function normalizeProgressLedger(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return{};
  const out={};for(const row of Object.values(value)){const progress=normalizeEventProgress(row);if(progress)out[progress.eventInstanceId]=progress;}return out;
}

export function mergeRoutedEventProgressState(previousValue, ledgerValue, incoming, options = {}) {
  const previous=normalizeEventProgress(previousValue),ledger=normalizeProgressLedger(ledgerValue);
  if(incoming===null){if(previous&&options.pauseOnNull)ledger[previous.eventInstanceId]=previous;else if(previous)delete ledger[previous.eventInstanceId];return{eventProgress:null,eventProgressByInstance:ledger};}
  if(!normalizeEventProgress(incoming))return{eventProgress:previous,eventProgressByInstance:ledger};
  const routed=mergeRoutedEventProgress(previous,incoming,options);
  if(!routed||(previous&&routed.eventInstanceId===previous.eventInstanceId))return{eventProgress:routed,eventProgressByInstance:ledger};
  if(previous)ledger[previous.eventInstanceId]=previous;
  const restored=mergeEventProgress(ledger[routed.eventInstanceId],routed,{allowInstanceChange:true});
  if(restored&&options.startedResumeKey&&restored.eventInstanceId===cleanId(options.startedOccurrenceId))restored.resumeKey=String(options.startedResumeKey).trim().toLowerCase().slice(0,160);
  delete ledger[routed.eventInstanceId];
  return{eventProgress:restored,eventProgressByInstance:ledger};
}

export function mergeContinuationEventProgressState(previousValue, ledgerValue, incoming) {
  const previous=normalizeEventProgress(previousValue),ledger=normalizeProgressLedger(ledgerValue);
  if(incoming===null){if(previous)delete ledger[previous.eventInstanceId];return{eventProgress:null,eventProgressByInstance:ledger};}
  if(!normalizeEventProgress(incoming))return{eventProgress:previous,eventProgressByInstance:ledger};
  return{eventProgress:mergeEventProgress(previous,incoming,{allowInstanceChange:false}),eventProgressByInstance:ledger};
}

export function promotePausedEventProgress(runtimeValue, occurrenceIds = []) {
  const runtime=runtimeValue&&typeof runtimeValue==='object'&&!Array.isArray(runtimeValue)?{...runtimeValue}:{};
  if(normalizeEventProgress(runtime.eventProgress))return runtime;
  const ledger=normalizeProgressLedger(runtime.eventProgressByInstance);
  for(const id of occurrenceIds.map(cleanId).filter(Boolean)){
    if(!ledger[id])continue;
    runtime.eventProgress=ledger[id];delete ledger[id];runtime.eventProgressByInstance=ledger;return runtime;
  }
  runtime.eventProgressByInstance=ledger;return runtime;
}

export function unscheduledPausedIdsForResume(runtimeValue, action, activeEvents = []) {
  const text=String(action||'').toLowerCase();
  if(!/(?:재개|계속|이어|돌아가|복귀|resume|continue|return)/i.test(text))return[];
  const active=new Set((Array.isArray(activeEvents)?activeEvents:[]).map(x=>String(x).trim().toLowerCase()));
  const ledger=normalizeProgressLedger(runtimeValue?.eventProgressByInstance),matches=[];
  for(const progress of Object.values(ledger)){
    if(!progress.resumeKey||!active.has(progress.resumeKey))continue;
    const tokens=progress.resumeKey.match(/[가-힣a-z0-9_]{2,}/g)||[];
    if(tokens.some(token=>text.includes(token)))matches.push(progress.eventInstanceId);
  }
  return matches;
}
