export const NOVEL_PRESENTATION_VERSION = '1.0';

const text = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function createNovelPresentationState() {
  return { sceneTitle: '', eventId: '', activeBeat: '', portraits: Object.create(null) };
}

export function resetNovelPresentationState(state) {
  const next = state && typeof state === 'object' ? state : createNovelPresentationState();
  next.sceneTitle = '';
  next.eventId = '';
  next.activeBeat = '';
  next.portraits = Object.create(null);
  return next;
}

function cleanSceneTitle(value) {
  return text(value, 120).replace(/^(?:AUTO|CONTINUE)\s*·\s*/i, '') || '장면';
}

function structuralSceneChange(turn, state) {
  const delta = object(turn?.state_delta);
  const event = object(turn?.event_progress);
  const eventId = text(event.event_instance_id, 80);
  const activeBeat = text(event.active_beat, 80);
  const eventChanged = Boolean(eventId && (eventId !== state.eventId || activeBeat !== state.activeBeat));
  const deltaChanged = Boolean(
    text(delta.new_location, 160)
    || list(delta.active_events_add).length
    || list(delta.active_events_remove).length
    || list(delta.completed_events_add).length
    || list(delta.scheduled_events_complete).length
  );
  return turn?.importance === 'important'
    || turn?.importance === 'critical'
    || list(turn?.choices).length > 0
    || eventChanged
    || deltaChanged;
}

export function novelSceneTitle(state, record = {}) {
  const target = state && typeof state === 'object' ? state : createNovelPresentationState();
  const turn = object(record.turn);
  const rawTitle = cleanSceneTitle(turn.scene_title);
  if (record.meta) return rawTitle;
  if (!target.sceneTitle || structuralSceneChange(turn, target)) target.sceneTitle = rawTitle;
  const event = object(turn.event_progress);
  target.eventId = text(event.event_instance_id, 80);
  target.activeBeat = text(event.active_beat, 80);
  return target.sceneTitle || rawTitle;
}

export function shouldShowNovelPortrait(state, { speakerKey = '', expression = 'default', emotionTransition = '', turnIndex = 0 } = {}) {
  const target = state && typeof state === 'object' ? state : createNovelPresentationState();
  if (!target.portraits || typeof target.portraits !== 'object') target.portraits = Object.create(null);
  const key = text(speakerKey, 64);
  if (!key) return false;
  const current = text(expression, 32).toLowerCase() || 'default';
  const previous = target.portraits[key];
  const changed = !previous || previous.expression !== current || /^(?:accepted|changed)$/i.test(text(emotionTransition, 40));
  const refresh = previous && Number(turnIndex) - Number(previous.turnIndex) >= 3;
  if (!changed && !refresh) return false;
  target.portraits[key] = { expression: current, turnIndex: Number(turnIndex) || 0 };
  return true;
}
