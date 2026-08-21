const array = (value) => Array.isArray(value) ? value : [];
const compact = (value) => String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

const DEPARTURE = /(?:\bleav(?:e|es|ing|eft)\b|\bexits?\b|\bdepart(?:s|ed|ing)?\b|\bwalk(?:s|ed)?\s+away\b|\bgo(?:es|ne)?\s+(?:out|away)\b|떠나(?:다|간다|갔다|갔고|며|서|버린다|버렸다)?|나가(?:다|ㄴ다|고|며|서|버린다|버렸다)?|퇴장(?:한다|했다|하며)?|자리를\s*떠나|작별(?:을)?\s*(?:하고|한\s*뒤)|복도를\s*따라\s*멀어)/iu;
const NON_DEPARTURE = /(?:\b(?:does|did|will|would|should|could|might|may)\s+not\b|\bnot\s+(?:leave|exit|depart)\b|\b(?:might|may|could|should|would)\s+(?:leave|exit|depart)\b|\b(?:should|could|would)\s+i\s+(?:leave|go)\b|\bif\s+[^.!?]*(?:leave|exit|depart)|떠나지\s*않|나가지\s*않|떠날(?:까|지도|지\s*모르|수)|나갈(?:까|지도|지\s*모르|수)|떠나야\s*할까|나가야\s*할까|떠나고\s*싶|나가고\s*싶)/iu;
function identities(turn, recentTurns) {
  const map = new Map();
  for (const item of [...array(recentTurns).flatMap(row => array(row?.scene)), ...array(turn?.scene)]) {
    if (!item?.speaker_key) continue;
    const names = map.get(String(item.speaker_key)) || new Set();
    names.add(String(item.speaker_key));
    if (item.speaker_name) names.add(String(item.speaker_name));
    map.set(String(item.speaker_key), names);
  }
  return map;
}

export function explicitDepartures(turn, recentTurns = []) {
  const found = new Set();
  const known = identities(turn, recentTurns);
  for (const item of array(turn?.scene)) {
    const text = String(item?.text || '');
    if (!DEPARTURE.test(text) || NON_DEPARTURE.test(text) || text.trim().endsWith('?')) continue;
    for (const [key, names] of known) {
      if ([...names].some(name => text.toLowerCase().includes(name.toLowerCase()))) found.add(key);
    }
  }
  return found;
}

export function reconcileParticipants({ previous = [], turn = {}, recentTurns = [], scheduledEntries = [] } = {}) {
  const speakers = array(turn.scene).filter(row => row?.speaker_key).map(row => String(row.speaker_key));
  const changedLocation = Boolean(turn?.state_delta?.new_location);
  const participants = new Set(changedLocation ? [] : array(previous).map(String));
  for (const key of speakers) participants.add(key);
  for (const key of array(scheduledEntries).map(String)) participants.add(key);
  for (const key of explicitDepartures(turn, recentTurns)) participants.delete(key);
  return [...participants].slice(0, 8);
}

function failedAttempt(turn) {
  return array(turn?.scene).some(row => /\b(?:fail(?:s|ed)?|prevent(?:s|ed)?|blocked|unable|cannot|couldn't)\b|실패|막(?:혔|힌|았다)|저지|할\s*수\s*없|들어가지\s*못|도착하지\s*못/iu.test(String(row?.text || '')));
}

function isStaleChoice(choice, action, turn) {
  const c = compact(choice), a = compact(action);
  if (!c || !a) return false;
  if (c === a || (c.length >= 8 && a.includes(c)) || (a.length >= 8 && c.includes(a))) return true;
  const location = compact(turn?.state_delta?.new_location);
  if (!location) return false;
  const movement = /(?:\b(?:go|travel|move|head|enter|walk)\b|간다|가다|가기|향하|이동하|들어(?:가|간|갔)|입장하)/iu.test(String(choice));
  if (!movement) return false;
  const tokens = String(turn.state_delta.new_location).split(/[\s/·,()-]+/).map(compact).filter(x => x.length >= 2);
  const matches = tokens.filter(token => c.includes(token));
  const entry = /(?:\benter\b|들어(?:가|간|갔)|입장하)/iu.test(String(choice));
  const sameContainer = entry && matches.some(token => /^(?:건물|회관|강당|hall|building|room)$/.test(token));
  return c.includes(location) || matches.length >= 2 || sameContainer;
}

export function freshChoices(action, turn) {
  const choices = array(turn?.choices);
  if (!action || failedAttempt(turn) || /(?:\b(?:attack|strike|shoot)\b|공격|베어|찌르|쏘|대련|전투)/iu.test(String(action))) return choices;
  return choices.filter(choice => !isStaleChoice(choice, action, turn));
}
