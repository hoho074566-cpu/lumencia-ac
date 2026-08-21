const array = (value) => Array.isArray(value) ? value : [];
const compact = (value) => String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

const DEPARTURE = /(?:\bleav(?:e|es|ing)\b|\bleft\b|\bexits?\b|\bdepart(?:s|ed|ing)?\b|\bwalk(?:s|ed)?\s+away\b|\bgo(?:es|ne)?\s+(?:out|away)\b|떠나(?:다|간다|갔다|갔고|고|며|서|버린다|버렸다)?|떠났(?:다|고|으며|다가)?|나가(?:다|ㄴ다|고|며|서|버린다|버렸다)?|나갔(?:다|고|으며)?|퇴장(?:한다|했다|하며)?|자리를\s*떠나|작별(?:을)?\s*(?:하고|한\s*뒤)|복도를\s*따라\s*멀어)/giu;
const NON_DEPARTURE = /(?:\b(?:does|did|will|would|should|could|might|may)\s+not\b|\bnot\s+(?:leave|exit|depart)\b|\b(?:might|may|could|should|would)\s+(?:leave|exit|depart)\b|\b(?:should|could|would)\s+i\s+(?:leave|go)\b|\bif\s+[^.!?]*(?:leave|exit|depart)|떠나지\s*않|나가지\s*않|떠날(?:까|지도|지\s*모르|수)|나갈(?:까|지도|지\s*모르|수)|떠나야\s*할까|나가야\s*할까|떠나고\s*싶|나가고\s*싶)/iu;
const FAILED_DEPARTURE = /(?:\b(?:tried|attempted|intended)\s+to\s+(?:leave|exit|depart)\b|\b(?:leave|exit|departure)\s+(?:was\s+)?(?:interrupted|prevented|blocked)\b|(?:떠나|나가|퇴장하)려(?:고)?\s*했|(?:떠나|나가)려다.{0,40}(?:막|잠|저지|실패|못|중단|방해))/iu;
function identities(turn, recentTurns, activeParticipants = [], registry = {}) {
  const map = new Map();
  for (const key of array(activeParticipants).map(String)) map.set(key, new Set([key, registry?.[key]].filter(Boolean).map(String)));
  for (const item of [...array(recentTurns).flatMap(row => array(row?.scene)), ...array(turn?.scene)]) {
    if (!item?.speaker_key) continue;
    const names = map.get(String(item.speaker_key)) || new Set();
    names.add(String(item.speaker_key));
    if (item.speaker_name) names.add(String(item.speaker_name));
    map.set(String(item.speaker_key), names);
  }
  return map;
}

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function identityMatch(text, name) {
  const escaped = escapeRegex(name);
  const ascii = /^[a-z0-9_-]+$/i.test(name);
  const suffix = ascii ? '(?![\\p{L}\\p{N}_])' : '(?=$|[\\s.,!?…\'"():;]|은|는|이|가|을|를|와|과|도|에게|께서|부터|까지)';
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}${suffix}`, 'iu').test(text);
}

function identityOccurrences(text, known) {
  const out = [];
  const candidates = [...known].flatMap(([key, names]) => [...names].map(name => ({ key, name }))).sort((a,b) => b.name.length - a.name.length);
  for (const { key, name } of candidates) {
    const escaped = escapeRegex(name);
    const ascii = /^[a-z0-9_-]+$/i.test(name);
    const suffix = ascii ? '(?![\\p{L}\\p{N}_])' : '(?=$|[\\s.,!?…\'"():;]|은|는|이|가|을|를|와|과|도|에게|께서|부터|까지)';
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}${suffix}`, 'giu');
    for (const match of text.matchAll(re)) out.push({ key, start:match.index, end:match.index + match[0].length, length:name.length });
  }
  return out.sort((a,b) => a.start-b.start || b.length-a.length);
}

function departureSubject(text, departureIndex, occurrences) {
  const before = occurrences.filter(row => row.end <= departureIndex);
  const direct = before.filter(row => {
    const gap = text.slice(row.end, departureIndex);
    return /^(?:은|는|이|가)?\s*(?:조용히|곧장|천천히|quickly|quietly|then\s+)?$/iu.test(gap);
  }).at(-1);
  if (direct) return direct;
  const prefix = text.slice(0, departureIndex);
  const boundary = Math.max(prefix.lastIndexOf('.'), prefix.lastIndexOf('!'), prefix.lastIndexOf('?'), prefix.lastIndexOf(';')) + 1;
  return before.find(row => row.start >= boundary) || null;
}

function clauseAt(text, index) {
  const boundaries = [...text.matchAll(/[.!?;]|(?:,\s*)?(?:but|while|however)\b|(?:하)?지만|그러나|반면/giu)];
  const before = boundaries.filter(match => match.index < index).at(-1);
  const after = boundaries.find(match => match.index > index);
  const start = before ? before.index + before[0].length : 0;
  const end = after?.index ?? text.length;
  return {text:text.slice(start,end),start,end};
}

export function explicitDepartures(turn, recentTurns = [], { activeParticipants = [], registry = {} } = {}) {
  const found = new Set();
  const known = identities(turn, recentTurns, activeParticipants, registry);
  for (const item of array(turn?.scene)) {
    const text = String(item?.text || '');
    const occurrences = identityOccurrences(text, known);
    for (const departure of text.matchAll(DEPARTURE)) {
      const clause = clauseAt(text, departure.index);
      if (NON_DEPARTURE.test(clause.text) || FAILED_DEPARTURE.test(clause.text) || clause.text.trim().endsWith('?')) continue;
      const subject = departureSubject(text, departure.index, occurrences.filter(row=>row.start>=clause.start&&row.end<=clause.end));
      if (subject) found.add(subject.key);
    }
  }
  return found;
}

function carriedParticipants(previous, action, turn, recentTurns) {
  const text = [action, ...array(turn?.scene).map(row => row?.text)].filter(Boolean).join(' ');
  const accompaniment = /(?:\bwith\b|\baccompan(?:y|ies|ied)\b|\bfollows?\b|\btogether\b|함께|같이|동행|따라(?:간|갔|오|왔)|데리고|이끌고)/iu;
  if (!accompaniment.test(text)) return [];
  const known = identities(turn, recentTurns);
  return array(previous).map(String).filter(key => [...(known.get(key) || [])].some(name => identityMatch(text, name)));
}

export function reconcileParticipants({ previous = [], action = '', turn = {}, recentTurns = [], scheduledEntries = [], registry = {} } = {}) {
  const speakers = array(turn.scene).filter(row => row?.speaker_key).map(row => String(row.speaker_key));
  const changedLocation = Boolean(turn?.state_delta?.new_location);
  const carried = changedLocation ? carriedParticipants(previous, action, turn, recentTurns) : array(previous).map(String);
  const participants = new Set([...speakers, ...array(scheduledEntries).map(String), ...carried]);
  for (const key of explicitDepartures(turn, recentTurns, {activeParticipants:previous,registry})) participants.delete(key);
  return [...participants].slice(0, 8);
}

export function actualScheduledEntrants({ due = [], turn = {}, recentTurns = [], currentLocation = '' } = {}) {
  const candidates = new Set(array(due).flatMap(event => array(event?.participants)).map(String));
  if (!candidates.size) return [];
  const location = compact(turn?.state_delta?.new_location || currentLocation);
  const structured = new Set(array(turn?.state_delta?.npc_state_updates)
    .filter(row => candidates.has(String(row?.npc_key)) && location && compact(row?.location) === location)
    .map(row => String(row.npc_key)));
  const known = identities(turn, recentTurns);
  for (const key of candidates) if (!known.has(key)) known.set(key, new Set([key]));
  const entryText = array(turn?.scene).map(row => String(row?.text || '')).filter(text => /(?:\b(?:arrives?|enters?|joins?|comes?\s+in)\b|도착하|들어(?:오|왔)|입장하|합류하|나타나)/iu.test(text));
  for (const key of candidates) if (entryText.some(text => [...(known.get(key) || [])].some(name => identityMatch(text, name)))) structured.add(key);
  const completed = new Set(array(turn?.state_delta?.scheduled_events_complete).map(String));
  if (entryText.length && location) for (const event of array(due)) {
    if (completed.has(String(event?.id)) && compact(event?.location) === location) for (const key of array(event?.participants)) structured.add(String(key));
  }
  return [...structured];
}

function actionKind(text) {
  if (/(?:\b(?:enter|go|travel|move|head|arrive)\b|들어|입장|이동|향하|도착|간다|가다)/iu.test(text)) return 'move';
  if (/(?:\b(?:tell|say|ask|inform)\b|말하|알리|묻|전하)/iu.test(text)) return 'speak';
  if (/(?:\b(?:attack|strike|shoot)\b|공격|베어|찌르|쏘)/iu.test(text)) return 'attack';
  return '';
}

function failedAttempt(action, turn) {
  const kind = actionKind(String(action));
  if (!kind) return false;
  if (turn?.resolution_log?.outcome === 'failure') return true;
  if (['success','partial'].includes(turn?.resolution_log?.outcome)) return false;
  return array(turn?.scene).some(row => {
    const text = String(row?.text || '');
    const failed = /\b(?:fail(?:s|ed)?|prevent(?:s|ed)?|blocked|unable|cannot|couldn't)\b|실패|막(?:혀|혔|힌|았다)|저지|할\s*수\s*없|지\s*못/iu.test(text);
    const playerNamed = /\b(?:pc|player|you)\b|플레이어|당신|주인공/iu.test(text);
    const thirdPartyNamed = /(?:\b[A-Z][a-z]+\b|[가-힣]{2,12})(?:은|는|이|가)\s+.{0,40}(?:실패|지\s*못)/u.test(text);
    const subjectlessKorean = /지\s*못|막(?:혀|혔)/u.test(text) && !thirdPartyNamed;
    return failed && actionKind(text) === kind && (playerNamed || subjectlessKorean);
  });
}

function isStaleChoice(choice, action, turn) {
  const c = compact(choice), a = compact(action);
  if (!c || !a) return false;
  if (c === a || (c.length >= 8 && a.includes(c)) || (a.length >= 8 && c.includes(a))) return true;
  const location = compact(turn?.state_delta?.new_location);
  if (!location) return false;
  const movement = /(?:\b(?:go|travel|move|head|enter|walk)\b|간다|가다|가기|향(?:하|한|했|한다)|이동(?:하|한|했|한다)|들어(?:가|간|갔)|입장(?:하|한|했|한다))/iu.test(String(choice));
  if (!movement) return false;
  const token = value => compact(value).replace(/(?:안으로|으로|에게|에서|까지|부터|[에는을를와과로])$/u, '');
  const tokens = String(turn.state_delta.new_location).split(/[\s/·,()-]+/).map(token).filter(x => x.length >= 2);
  const matches = tokens.filter(token => c.includes(token));
  const genericDestination = /^(?:건물|회관|강당|방|실|내부|hall|building|room|inside)$/;
  const locationSpecific = tokens.filter(token => !genericDestination.test(token));
  const specific = matches.filter(token => !genericDestination.test(token));
  const choiceTokens = String(choice).split(/[\s/·,()-]+/).map(token).filter(x => x.length >= 2);
  const movementWord = /^(?:go|travel|move|head|enter|walk|간다|가다|가기|향한다|향하다|향해|이동한다|이동하다|이동해|들어간다|들어가다|입장한다|입장하다)$/;
  const extraDestination = choiceTokens.some(word => !tokens.includes(word) && !genericDestination.test(word) && word !== '안' && !movementWord.test(word));
  return (locationSpecific.length > 0 && c.includes(location)) || (specific.length >= 1 && !extraDestination);
}

function repeatableAttack(action) {
  const text = String(action);
  if (/(?:\b(?:stop|cease|halt|don't|do\s+not|not)\b|멈추|중단|그만|공격하지\s*않|공격을?\s*안)/iu.test(text)) return false;
  return /(?:\b(?:attack|strike|shoot)\b|공격(?:하|한|했|한다)|베어|찌르|쏘)/iu.test(text);
}

export function freshChoices(action, turn) {
  const choices = array(turn?.choices);
  if (!action || failedAttempt(action, turn) || repeatableAttack(action)) return choices;
  return choices.filter(choice => !isStaleChoice(choice, action, turn));
}
