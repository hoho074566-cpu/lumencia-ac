// Lumensia Time Plan Parser Phase 1.
// Shadow-only structured parsing: no schedule, consequence, state, narration, or stop mutation.

export const TIME_PLAN_PARSER_VERSION = '1.0-shadow';

const NUMBER_WORDS = Object.freeze({
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9,
  열: 10, 열한: 11, 열두: 12, 스물: 20, 서른: 30, 마흔: 40, 쉰: 50,
});
const NUMBER_PATTERN = String.raw`(?:\d+(?:\.\d+)?|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열(?:한|두)?|스물|서른|마흔|쉰)`;
const DURATION_PATTERN = new RegExp(`(?<number>${NUMBER_PATTERN})\\s*(?<unit>년|개월|달|주일|주|일|시간|분)`, 'gu');
const CLOCK_PERIOD_PATTERN = String.raw`(?:오전|오후|아침|새벽|낮|저녁|밤)`;

const ACTION_DEFINITIONS = Object.freeze([
  {
    type: 'travel',
    pattern: /(?<destination>[A-Za-z가-힣0-9]+?)(?:으로|로|에)\s*(?:간다|가자|가겠다|갈게|가서|가고|이동한다|이동하자|이동하고|향한다|향하자|향하고|도착한다|도착하고)/gu,
  },
  {
    type: 'training',
    pattern: /(?:훈련|연습|수련|단련)(?:을|를)?\s*(?:한다|하자|하겠다|할게|하고|한\s*(?:뒤|후)|시작한다|계속한다|마친다|했다|할까|할지)/gu,
  },
  {
    type: 'class-attendance',
    pattern: /(?:수업|강의|세미나|실습|오리엔테이션|교육|입학식)(?:을|를|에)?\s*(?:듣는다|듣자|듣고|참석한다|참석하자|참석하고|참여한다|참여하자|참여하고|수강한다|수강하자|수강하고|받는다|받자|받고|시작한다|계속한다|마친다|할까|할지)/gu,
  },
  {
    type: 'sleep',
    pattern: /(?:(?:잠|수면)(?:을|를)?\s*)?(?:잔다|자자|자고|자겠다|잘게|잔\s*(?:뒤|후)|수면한다|수면하자|수면하고|잘까|잘지)/gu,
  },
  {
    type: 'meal',
    pattern: /(?:아침|점심|저녁|밥|식사|만찬)(?:을|를)?\s*(?:먹는다|먹자|먹고|먹겠다|먹을게|한다|하자|하고|마친다|할까|할지)/gu,
  },
  {
    type: 'dialogue',
    subtype: 'negotiation',
    pattern: /협상(?:을|를)?\s*(?:한다|하자|하고|하겠다|할게|시작한다|계속한다|마친다|할까|할지)/gu,
  },
  {
    type: 'dialogue',
    pattern: /(?:대화|이야기|상담|논의|면담|회의|브리핑)(?:을|를)?\s*(?:한다|하자|하고|하겠다|할게|시작한다|계속한다|마친다|할까|할지)/gu,
  },
  {
    type: 'wait',
    pattern: /(?:기다린다|기다리자|기다리고|기다리겠다|기다릴게|대기한다|대기하자|대기하고|대기하겠다|기다릴까|기다릴지)/gu,
  },
  {
    type: 'rest',
    pattern: /(?:쉰다|쉬자|쉬고|쉬겠다|쉴게|휴식한다|휴식하자|휴식하고|휴식하겠다|쉴까|쉴지)/gu,
  },
]);

const DEFAULT_DURATION = Object.freeze({
  training: [30, 120],
  'class-attendance': [45, 120],
  sleep: [240, 480],
  meal: [20, 45],
  dialogue: [2, 10],
  wait: [10, 60],
  rest: [30, 240],
});

const SUBJECT_STOP_WORDS = new Set([
  '오늘', '내일', '모레', '어제', '그제', '그저께', '지금', '현재', '이번', '다음',
  '시간', '분', '수업', '훈련', '식사', '대화', '잠', '휴식', '대기',
]);
const ADDITIVE_ADVERBIAL_STEMS = new Set([
  '적어', '정', '이번에', '다음에', '이전에', '직전에도', '오늘', '내일', '모레', '어제',
  '지금', '현재', '여기', '거기', '저기', '최소한', '최대', '보통', '대개', '아직',
  '벌써', '다시', '계속', '항상', '언제나', '가끔', '때로', '아무래', '그래', '그럼',
]);

export function isAdditiveAdverbialStem(value = '') {
  const stem = String(value || '').trim();
  return SUBJECT_STOP_WORDS.has(stem) || ADDITIVE_ADVERBIAL_STEMS.has(stem);
}

function numberValue(value = '') {
  const text = String(value || '').trim();
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, text)) return NUMBER_WORDS[text];
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function unitMinutes(amount, unit) {
  const multipliers = { 년: 525600, 개월: 43200, 달: 43200, 주일: 10080, 주: 10080, 일: 1440, 시간: 60, 분: 1 };
  return Number.isFinite(amount) && multipliers[unit] ? Math.round(amount * multipliers[unit]) : null;
}

function clockValue(value = '') {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

function quoteRanges(text = '') {
  const source = String(text || ''), ranges = [];
  for (const pattern of [/"[^"\n]*"/gu, /“[^”\n]*”/gu, /'[^'\n]*'/gu, /‘[^’\n]*’/gu, /「[^」\n]*」/gu, /『[^』\n]*』/gu]) {
    for (const match of source.matchAll(pattern)) ranges.push([match.index ?? -1, (match.index ?? -1) + match[0].length]);
  }
  return ranges;
}

function actionMatches(text = '') {
  const source = String(text || ''), matches = [];
  ACTION_DEFINITIONS.forEach((definition, priority) => {
    const pattern = new RegExp(definition.pattern.source, definition.pattern.flags);
    for (const match of source.matchAll(pattern)) {
      const matchIndex = match.index ?? 0, before = source[matchIndex - 1] || '';
      if (definition.type === 'sleep' && !/^(?:잠|수면)/u.test(match[0]) && /[A-Za-z가-힣0-9_]/u.test(before)) continue;
      matches.push({
        type: definition.type,
        index: matchIndex,
        end: matchIndex + match[0].length,
        text: match[0],
        destination: match.groups?.destination || null,
        subtype: definition.subtype || null,
        priority,
      });
    }
  });
  matches.sort((left, right) => left.index - right.index || left.priority - right.priority || right.end - left.end);
  const selected = [];
  for (const candidate of matches) {
    const overlap = selected.findIndex((row) => candidate.index < row.end && candidate.end > row.index);
    if (overlap < 0) selected.push(candidate);
    else if (candidate.priority < selected[overlap].priority) selected[overlap] = candidate;
  }
  return selected.sort((left, right) => left.index - right.index);
}

function splitClauses(text = '') {
  const source = String(text || ''), anchors = actionMatches(source);
  if (!anchors.length) return [{ source: source.trim(), start: 0, end: source.length, anchor: null }];
  const clauses = [];
  let cursor = 0;
  anchors.forEach((anchor, index) => {
    const prelude = source.slice(cursor, anchor.index), sentenceBreaks = [...prelude.matchAll(/[.!?。！？]\s*/gu)].filter((match) => {
      const position = match.index ?? 0;
      return match[0][0] !== '.' || !(/\d/u.test(prelude[position - 1] || '') && /\d/u.test(prelude[position + 1] || ''));
    }), lastBreak = sentenceBreaks.at(-1);
    const start = lastBreak ? cursor + (lastBreak.index ?? 0) + lastBreak[0].length : cursor;
    const end = index === anchors.length - 1 ? source.length : anchor.end;
    clauses.push({ source: source.slice(start, end).trim(), start, end, anchor });
    cursor = anchor.end;
  });
  return clauses.filter((clause) => clause.source);
}

function namedDateTokenIndex(source = '', raw = '') {
  const text = String(source || ''), token = String(raw || '');
  let selected = -1, cursor = 0;
  while (token && cursor < text.length) {
    const index = text.indexOf(token, cursor);
    if (index < 0) break;
    const before = text[index - 1] || '', after = text.slice(index + token.length);
    const leftBoundary = index === 0 || /[\s,.;!?。！？…"'“”‘’「」『』()[\]{}]/u.test(before);
    const rightBoundary = after.length === 0 || /^[\s,.;!?。！？…"'“”‘’「」『』()[\]{}]/u.test(after) || /^(?:에는|에|은|는|도|부터|까지|쯤|경)(?=$|[\s,.;!?。！？…"'“”‘’「」『』()[\]{}])/u.test(after);
    if (leftBoundary && rightBoundary) selected = index;
    cursor = index + token.length;
  }
  return selected;
}

function explicitActor(clause = '', actorName = '') {
  const text = String(clause || '');
  const firstPerson = [...text.matchAll(/(?:^|[\s,"'“‘])(?<name>나는|난|내가|나도|저도|PC|Aaa)(?:가|이|은|는|도)?(?=\s|[,.;!?。！？…]|$)/giu)].at(-1);
  if (firstPerson) return { kind: 'pc', name: String(actorName || 'PC'), explicit: true };
  const canonical = String(actorName || '').trim();
  if (canonical && new RegExp(`(?:^|[\\s,"'“‘])${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:가|이|은|는|도|께서)(?=\\s|[,.;!?。！？…]|$)`, 'u').test(text)) {
    return { kind: 'pc', name: canonical, explicit: true };
  }
  const ordinarySubjects = [...text.matchAll(/(?:^|[\s,"'“‘])(?<name>[A-Za-z가-힣0-9_:]{1,32})(?:가|이|은|는|께서)(?=\s|[,.;!?。！？…]|$)/gu)];
  const additiveSubjects = [...text.matchAll(/(?:^|[\s,"'“‘])(?<name>[A-Za-z가-힣0-9_:]{1,32})도(?=\s|[,.;!?。！？…]|$)/gu)]
    .filter((match) => {
      const stem = String(match.groups?.name || '').trim();
      return stem && !isAdditiveAdverbialStem(stem);
    });
  const subjects = [...ordinarySubjects, ...additiveSubjects]
    .sort((left, right) => (left.index ?? -1) - (right.index ?? -1))
    .map((match) => String(match.groups?.name || '').trim())
    .filter((name) => name && !SUBJECT_STOP_WORDS.has(name));
  const name = subjects.at(-1);
  return name ? { kind: 'npc', name, explicit: true } : null;
}

function isHypothetical(text = '') {
  return /(?:만약|가정|하고\s*싶|하려면|한다면|했다면|했으면|할까|할지|해야\s*할지|예정|계획|고민|망설|[?？]\s*$)/u.test(String(text || ''));
}

function isNegatedAction(text = '', anchorIndex = -1) {
  if (anchorIndex < 0) return false;
  return /(?:^|[\s,.;!?。！？])(?:안|못)(?=\s|$)/u.test(String(text || '').slice(0, anchorIndex));
}

function hasUnresolvedCondition(text = '') {
  return /(?:^|[\s,.;!?。！？])(?:만약\s*)?(?:[A-Za-z가-힣0-9_:]{1,32}(?:으면|면)|[A-Za-z가-힣0-9_:]{1,32}\s+(?:때|경우))(?=$|[\s,.;!?。！？])/u.test(String(text || ''));
}

function hasUnparsedPrefixAction(text = '') {
  const source = String(text || '');
  return /(?:^|[\s,.;!?。！？])[A-Za-z가-힣0-9_:]{1,48}(?:하고|하면서|하며|면서|으며|가서|와서|해서|되어서|돼서|한\s*(?:뒤|후))(?=$|[\s,.;!?。！？])/u.test(source)
    || /(?:^|[\s,.;!?。！？])[A-Za-z가-힣0-9_:]{1,32}(?:을|를|에|에서|와|과)\s+[A-Za-z가-힣0-9_:]{1,48}고(?=$|[\s,.;!?。！？])/u.test(source);
}

function isConnectorAnchor(text = '') {
  return /(?:고|가서|한\s*(?:뒤|후)|잔\s*(?:뒤|후))$/u.test(String(text || '').trim());
}

function durationCandidates(text = '') {
  const source = String(text || ''), rows = [];
  for (const match of source.matchAll(new RegExp(DURATION_PATTERN.source, DURATION_PATTERN.flags))) {
    const amount = numberValue(match.groups?.number), unit = match.groups?.unit, minutes = unitMinutes(amount, unit), index = match.index ?? 0, end = index + match[0].length;
    if (minutes == null) continue;
    const suffix = source.slice(end, end + 12);
    if (/^\s*(?:전(?:에)?|이전|후(?:에)?|뒤(?:에)?|이후(?:에)?|마다|간격(?:으로)?|씩)/u.test(suffix)) continue;
    rows.push({ raw: match[0], index, end, minutes });
  }
  return rows;
}

function travelDuration(destination = '', location = '') {
  const target = String(destination || '').trim(), from = String(location || '').trim();
  if (/(?:왕도|수도|도시|마을|항구|영지|국경|산맥|숲|유적|던전|외곽)/u.test(target)) return { min_minutes: 15, max_minutes: 60, profile: 'regional' };
  if (/(?:기숙사|도서관|학생회관|강의동|기사과|마법과|신학부|연금술과|식당|중앙광장|운동장|정문|교정)/u.test(target)) return { min_minutes: 5, max_minutes: 20, profile: 'campus' };
  const fromAnchor = from.match(/(?:[A-Za-z가-힣0-9]+동|기숙사|도서관|학생회관|강의동)/u)?.[0];
  if (fromAnchor && /^(?:방|개인실|복도|계단|로비|홀|교실|강의실|사무실|학생회실|창고|지하)$/u.test(target)) return { min_minutes: 2, max_minutes: 8, profile: 'within-building' };
  return { min_minutes: 3, max_minutes: 30, profile: 'local' };
}

function parseDuration(text = '', actionType = 'unknown', destination = '', location = '') {
  const source = String(text || ''), candidates = durationCandidates(source);
  if (candidates.length >= 2) {
    const first = candidates.at(-2), second = candidates.at(-1), connector = source.slice(first.end, second.index);
    if (/(?:에서|부터|~|〜|내지|또는|혹은)/u.test(connector)) {
      return { min_minutes: Math.min(first.minutes, second.minutes), max_minutes: Math.max(first.minutes, second.minutes), explicit: true, source: source.slice(first.index, second.end) };
    }
  }
  const selected = candidates.at(-1);
  if (selected) {
    const prefix = source.slice(Math.max(0, selected.index - 8), selected.index), suffix = source.slice(selected.end, selected.end + 8);
    if (/최대\s*$/u.test(prefix) || /^\s*(?:이내|이하)/u.test(suffix)) return { min_minutes: 0, max_minutes: selected.minutes, explicit: true, source: selected.raw };
    if (/^\s*미만/u.test(suffix)) return { min_minutes: 0, max_minutes: Math.max(0, selected.minutes - 1), explicit: true, source: selected.raw };
    if (/(?:최소(?:한)?|적어도)\s*$/u.test(prefix) || /^\s*이상/u.test(suffix)) {
      const defaultMaximum = Number(DEFAULT_DURATION[actionType]?.[1]);
      return { min_minutes: selected.minutes, max_minutes: Number.isFinite(defaultMaximum) ? Math.max(selected.minutes, defaultMaximum) : selected.minutes, explicit: true, upper_bounded: false, source: selected.raw };
    }
    return { min_minutes: selected.minutes, max_minutes: selected.minutes, explicit: true, source: selected.raw };
  }
  if (actionType === 'travel') return { ...travelDuration(destination, location), explicit: false, source: null };
  const defaults = DEFAULT_DURATION[actionType];
  return defaults ? { min_minutes: defaults[0], max_minutes: defaults[1], explicit: false, source: null } : { min_minutes: null, max_minutes: null, explicit: false, source: null };
}

function clockExpression(text = '') {
  const source = String(text || ''), rows = [];
  const pattern = new RegExp(`(?:(?<period>${CLOCK_PERIOD_PATTERN})\\s*)?(?<hour>\\d{1,2}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)\\s*시(?!간)(?:\\s*(?<minute>\\d{1,2}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)\\s*분)?|(?<colon>\\d{1,2}:\\d{2})|(?<named>정오|자정)`, 'gu');
  for (const match of source.matchAll(pattern)) {
    let minutes = match.groups?.colon ? clockValue(match.groups.colon) : match.groups?.named === '정오' ? 720 : match.groups?.named === '자정' ? 0 : null;
    if (minutes == null && match.groups?.hour) {
      let hour = numberValue(match.groups.hour), minute = numberValue(match.groups.minute || '0') || 0;
      if (hour != null) {
        if (/^(?:오후|낮|저녁|밤)$/u.test(String(match.groups.period || ''))) hour = hour % 12 + 12;
        else if (/^(?:오전|아침|새벽)$/u.test(String(match.groups.period || '')) && hour === 12) hour = 0;
        minutes = hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
      }
    }
    if (minutes != null) {
      const index = match.index ?? 0, end = index + match[0].length, trailing = source.slice(end), leading = source.slice(Math.max(0, index - 8), index);
      const droppedPeriod = !match.groups?.period && new RegExp(`${CLOCK_PERIOD_PATTERN}\\s*$`, 'u').test(leading);
      const complete = !droppedPeriod && (!/^\s*[A-Za-z가-힣0-9]/u.test(trailing) || /^\s*(?:에|부터|까지|후|뒤|이후|전|이전|마다|씩|동안|간)(?:\s|$)/u.test(trailing));
      rows.push({ raw: match[0], minutes, period: match.groups?.period || null, index, end, complete });
    }
  }
  return rows.at(-1) || null;
}

function dateExpression(text = '') {
  const source = String(text || ''), named = [
    ['그저께', -2, 'fixed-day'], ['그제', -2, 'fixed-day'], ['어제', -1, 'fixed-day'], ['지난주', -7, 'calendar-approximate'], ['지난달', -30, 'calendar-approximate'], ['지난해', -365, 'calendar-approximate'],
    ['오늘', 0, 'fixed-day'], ['내일', 1, 'fixed-day'], ['다음날', 1, 'fixed-day'], ['익일', 1, 'fixed-day'], ['모레', 2, 'fixed-day'], ['다음주', 7, 'calendar-approximate'], ['차주', 7, 'calendar-approximate'],
  ];
  let selected = null;
  for (const [raw, offset, precision] of named) {
    const index = namedDateTokenIndex(source, raw);
    if (index >= 0 && (!selected || index > selected.index)) selected = { raw, kind: 'relative-date', precision, date_offset_days: offset, index, end: index + raw.length };
  }
  const relativePattern = new RegExp(`(?<number>${NUMBER_PATTERN})\\s*(?<unit>년|개월|달|주일|주|일)\\s*(?:후|뒤|이후)(?:에)?`, 'gu');
  for (const match of source.matchAll(relativePattern)) {
    const amount = numberValue(match.groups?.number), unit = match.groups?.unit, multiplier = unit === '년' ? 365 : unit === '개월' || unit === '달' ? 30 : unit === '주' || unit === '주일' ? 7 : 1;
    const row = { raw: match[0], kind: 'relative-date', precision: unit === '일' ? 'fixed-day' : 'calendar-approximate', date_offset_days: amount == null ? null : amount * multiplier, index: match.index ?? 0, end: (match.index ?? 0) + match[0].length };
    if (row.date_offset_days != null && (!selected || row.index > selected.index)) selected = row;
  }
  const absolute = [...source.matchAll(/(?:(?<year>\d{1,4})[-/.년]\s*)?(?<month>\d{1,2})\s*(?:[-/.]|월)\s*(?<day>\d{1,2})\s*(?:일)?/gu)].at(-1);
  if (absolute && (!selected || (absolute.index ?? 0) > selected.index)) {
    selected = { raw: absolute[0], kind: 'absolute-date', date_offset_days: null, year: absolute.groups?.year ? Number(absolute.groups.year) : null, month: Number(absolute.groups?.month), day: Number(absolute.groups?.day), index: absolute.index ?? 0, end: (absolute.index ?? 0) + absolute[0].length };
  }
  return selected;
}

function relativeOffsetExpression(text = '') {
  const source = String(text || ''), rows = [];
  for (const match of source.matchAll(new RegExp(DURATION_PATTERN.source, DURATION_PATTERN.flags))) {
    const index = match.index ?? 0, end = index + match[0].length, suffix = source.slice(end, end + 12).match(/^\s*(?:후|뒤|이후)(?:에)?/u);
    if (!suffix) continue;
    const minutes = unitMinutes(numberValue(match.groups?.number), match.groups?.unit);
    if (minutes != null) rows.push({ raw: `${match[0]}${suffix[0]}`, minutes, index, end: end + suffix[0].length });
  }
  return rows.at(-1) || null;
}

function qualifierTailOwnedByAction(text = '', qualifierEnd = -1, actionAnchorIndex = -1) {
  const source = String(text || '');
  if (qualifierEnd < 0 || actionAnchorIndex < qualifierEnd) return false;
  const tail = source.slice(qualifierEnd, actionAnchorIndex), mask = Array.from(tail);
  const clear = (start, end) => { for (let index = Math.max(0, start); index < Math.min(mask.length, end); index += 1) mask[index] = ' '; };
  const clock = clockExpression(tail);
  if (clock) clear(clock.index, clock.end);
  durationCandidates(tail).forEach((row) => clear(row.index, row.end));
  const remainder = mask.join('')
    .replace(/(?:에는|에서|에|은|는|도|만|부터|까지|쯤|경|동안|간|정도|가량|약|최소|최대|적어도|최장|이상|초과|이하|미만|이내|씩|내지|또는|혹은)/gu, ' ')
    .replace(/[\s,.;!?。！？…~〜"'“”‘’「」『』()[\]{}]/gu, '');
  return !/[A-Za-z가-힣0-9_]/u.test(remainder);
}

function parseDeadline(text = '') {
  const source = String(text || ''), until = source.lastIndexOf('까지');
  if (until < 0) return null;
  const prefix = source.slice(Math.max(0, until - 80), until), date = dateExpression(prefix), clock = clockExpression(prefix);
  if (!date && !clock) return null;
  const start = Math.min(date?.index ?? prefix.length, clock?.index ?? prefix.length);
  return {
    raw: `${prefix.slice(start).trim()}까지`,
    date_offset_days: date?.date_offset_days ?? null,
    absolute_date: date?.kind === 'absolute-date' ? { year: date.year, month: date.month, day: date.day } : null,
    clock_minutes: clock?.minutes ?? null,
  };
}

function parseStart(text = '', context = {}, sequenceRelation = 'root', deadline = null, actionAnchorIndex = -1) {
  const source = String(text || ''), date = dateExpression(source), clock = clockExpression(source), relativeOffset = date ? null : relativeOffsetExpression(source), currentClock = clockValue(context.currentTime);
  const clockIsDeadline = Boolean(clock && /까지/u.test(source.slice(clock.end, clock.end + 8)));
  const dateIsDeadline = Boolean(deadline && date && deadline.raw.includes(date.raw));
  const dateOwnedByAction = !date || qualifierTailOwnedByAction(source, date.end, actionAnchorIndex);
  const clockOwnedByAction = !clock || qualifierTailOwnedByAction(source, clock.end, actionAnchorIndex);
  const relativeOffsetOwnedByAction = !relativeOffset || qualifierTailOwnedByAction(source, relativeOffset.end, actionAnchorIndex);
  const ownershipComplete = dateOwnedByAction && clockOwnedByAction && relativeOffsetOwnedByAction;
  const effectiveDate = dateIsDeadline || !dateOwnedByAction ? null : date;
  const effectiveClock = clockIsDeadline || !clockOwnedByAction ? null : clock;
  const effectiveRelativeOffset = relativeOffsetOwnedByAction ? relativeOffset : null;
  if (!effectiveDate && !effectiveClock && !effectiveRelativeOffset) {
    return sequenceRelation === 'root'
      ? { relation: 'immediate', raw: null, ownership_complete: ownershipComplete, date_offset_days: null, date_owned_by_action: date ? dateOwnedByAction : null, clock_owned_by_action: clock ? clockOwnedByAction : null, relative_offset_owned_by_action: relativeOffset ? relativeOffsetOwnedByAction : null, clock_minutes: null, offset_minutes: 0, elapsed: false }
      : { relation: sequenceRelation, raw: null, ownership_complete: ownershipComplete, date_offset_days: null, date_owned_by_action: date ? dateOwnedByAction : null, clock_owned_by_action: clock ? clockOwnedByAction : null, relative_offset_owned_by_action: relativeOffset ? relativeOffsetOwnedByAction : null, clock_minutes: null, offset_minutes: null, elapsed: false };
  }
  const dateOffset = effectiveDate?.date_offset_days ?? null;
  let offset = dateOffset == null ? effectiveRelativeOffset?.minutes ?? null : Math.round(dateOffset * 1440);
  if (effectiveClock && currentClock != null) offset = (offset ?? 0) + effectiveClock.minutes - currentClock;
  const elapsed = offset != null && offset < 0;
  return {
    relation: elapsed ? 'elapsed' : effectiveDate && effectiveClock ? 'date-and-clock' : effectiveDate ? effectiveDate.kind : effectiveRelativeOffset ? 'relative-offset' : 'clock',
    raw: [effectiveDate?.raw, effectiveRelativeOffset?.raw, effectiveClock?.raw].filter(Boolean).join(' ') || null,
    ownership_complete: ownershipComplete,
    date_offset_days: dateOffset,
    date_owned_by_action: date ? dateOwnedByAction : null,
    clock_owned_by_action: clock ? clockOwnedByAction : null,
    relative_offset_owned_by_action: relativeOffset ? relativeOffsetOwnedByAction : null,
    date_precision: effectiveDate?.precision ?? null,
    absolute_date: effectiveDate?.kind === 'absolute-date' ? { year: effectiveDate.year, month: effectiveDate.month, day: effectiveDate.day } : null,
    clock_minutes: effectiveClock?.minutes ?? null,
    clock_period: effectiveClock?.period ?? null,
    clock_parse_complete: effectiveClock?.complete !== false,
    clock_context_available: !effectiveClock || currentClock != null,
    relative_offset_minutes: effectiveRelativeOffset?.minutes ?? null,
    offset_minutes: offset,
    elapsed,
  };
}

function cleanDestination(value = '') {
  return String(value || '').trim().replace(/^(?:그리고|그다음|이어서)\s+/u, '').replace(/(?:으로|로|에)$/u, '') || null;
}

export function parseTimePlan(action = '', context = {}) {
  const rawSource = String(action || '').trim(), source = rawSource.slice(0, 2000), ranges = quoteRanges(source), clauses = splitClauses(source), parsed = [];
  if (!source) return { version: TIME_PLAN_PARSER_VERSION, mode: 'shadow', clauses: [], diagnostics: [] };
  let inheritedActor = null;
  clauses.forEach((clause, index) => {
    const quoted = Boolean(clause.anchor && ranges.some(([start, end]) => clause.anchor.index >= start && clause.anchor.index < end)), localAnchor = clause.anchor ? clause.source.indexOf(clause.anchor.text) : -1, actorScope = localAnchor >= 0 ? clause.source.slice(0, localAnchor) : clause.source;
    const explicit = explicitActor(actorScope, context.actorName), actor = explicit || (quoted ? { kind: 'unknown', name: null, explicit: false } : inheritedActor) || { kind: 'pc', name: String(context.actorName || 'PC'), explicit: false };
    if (explicit && !quoted) inheritedActor = explicit;
    else if (!quoted && !inheritedActor) inheritedActor = actor;
    const anchorEnd = localAnchor < 0 ? -1 : localAnchor + String(clause.anchor?.text || '').length, suffix = anchorEnd < 0 ? '' : clause.source.slice(anchorEnd), unparsedSuffix = Boolean(suffix.replace(/[\s.!?。！？…"'“”‘’「」『』]/gu, '')), completed = /(?:했다)$/u.test(String(clause.anchor?.text || ''));
    const actionType = clause.anchor?.type || 'unknown', destination = cleanDestination(clause.anchor?.destination), hypothetical = isHypothetical(clause.source), conditional = hasUnresolvedCondition(actorScope), unparsedPrefixAction = hasUnparsedPrefixAction(actorScope), negated = isNegatedAction(clause.source, localAnchor), incompleteConnector = index === clauses.length - 1 && isConnectorAnchor(clause.anchor?.text), thirdParty = actor.kind === 'npc', committed = actionType !== 'unknown' && actor.kind === 'pc' && !quoted && !hypothetical && !conditional && !unparsedPrefixAction && !negated && !completed && !unparsedSuffix && !incompleteConnector;
    const concurrent = index > 0 && /(?:^|[\s,.;!?。！？])(?:동시에|그동안|그러는\s*동안|병행(?:하여|해서|해)?|나란히)(?=$|[\s,.;!?。！？])/u.test(clause.source);
    const sequenceRelation = index === 0 ? 'root' : concurrent ? `concurrent_with_action_${index}` : `after_action_${index}`;
    const deadline = parseDeadline(clause.source), start = parseStart(clause.source, context, sequenceRelation, deadline, localAnchor), duration = parseDuration(clause.source, actionType, destination, context.location), durationRows = durationCandidates(clause.source), durationOwnershipComplete = !duration.explicit || qualifierTailOwnedByAction(clause.source, durationRows.at(-1)?.end ?? -1, localAnchor);
    parsed.push({
      index: index + 1,
      clause_id: `action_${index + 1}`,
      actor: { kind: actor.kind, name: actor.name, explicit: Boolean(actor.explicit) },
      action_type: actionType,
      action_subtype: clause.anchor?.subtype || actionType,
      start,
      duration,
      duration_ownership_complete: durationOwnershipComplete,
      destination,
      explicit_deadline: deadline,
      sequence_relation: sequenceRelation,
      concurrent,
      committed,
      completion_required: committed,
      hypothetical,
      conditional,
      unparsed_prefix_action: unparsedPrefixAction,
      negated,
      completed,
      incomplete_connector: incompleteConnector,
      unparsed_suffix: unparsedSuffix,
      quoted,
      third_party: thirdParty,
    });
  });
  return {
    version: TIME_PLAN_PARSER_VERSION,
    mode: 'shadow',
    clauses: parsed,
    diagnostics: [rawSource.length > source.length ? 'input-truncated' : null, parsed.some((clause) => clause.action_type === 'unknown') ? 'unclassified-clause' : null].filter(Boolean),
  };
}

export function summarizeTimePlan(plan = {}, legacyIntent = {}) {
  const clauses = Array.isArray(plan.clauses) ? plan.clauses : [], committedPc = clauses.filter((clause) => clause.committed && !clause.third_party), terminal = committedPc.at(-1) || null;
  const legacy = String(legacyIntent?.kind || 'unknown'), terminalType = String(terminal?.action_type || 'none'), comparableType = terminalType === 'sleep' || terminalType === 'rest' ? 'downtime' : terminalType;
  return {
    version: String(plan.version || TIME_PLAN_PARSER_VERSION),
    mode: 'shadow',
    clause_count: clauses.length,
    committed_pc_clause_count: committedPc.length,
    action_types: clauses.map((clause) => String(clause.action_type || 'unknown')).slice(0, 8),
    terminal_action_type: terminalType,
    legacy_intent: legacy,
    terminal_agreement: terminal ? comparableType === legacy : legacy === 'decision-sensitive' || legacy === 'generic',
    diagnostic_count: Array.isArray(plan.diagnostics) ? plan.diagnostics.length : 0,
  };
}

export function deriveStructuredTimingCandidate(plan = {}) {
  const clauses = Array.isArray(plan.clauses) ? plan.clauses : [], diagnostics = Array.isArray(plan.diagnostics) ? plan.diagnostics : [];
  const terminal = clauses.at(-1), eligible = Boolean(plan.mode === 'shadow' && diagnostics.length === 0 && terminal?.committed && !terminal?.third_party && terminal?.action_type !== 'unknown' && terminal?.explicit_deadline == null && terminal?.start?.ownership_complete !== false && terminal?.start?.clock_context_available !== false && terminal?.start?.clock_parse_complete !== false && terminal?.duration_ownership_complete !== false);
  const terminalActionType = !eligible ? null : terminal.action_type === 'sleep' || terminal.action_type === 'rest' ? 'downtime' : terminal.action_type;
  const provenElapsedDate = Boolean(eligible && terminal.start?.absolute_date == null && terminal.start?.date_precision === 'fixed-day' && Number(terminal.start?.date_offset_days) < 0);
  const relativeDateStart = eligible && terminal.start?.absolute_date == null && terminal.start?.date_precision === 'fixed-day' && terminal.start?.clock_parse_complete !== false && terminal.start?.clock_context_available !== false && !/^(?:밤|새벽)$/u.test(String(terminal.start?.clock_period || '')) && Number.isFinite(terminal.start?.date_offset_days)
    ? Number(terminal.start?.offset_minutes)
    : null;
  const prefix = clauses.slice(0, -1), regionalTravelPrefix = eligible && prefix.length === 1 && prefix[0]?.committed && !prefix[0]?.third_party && prefix[0]?.action_type === 'travel' && prefix[0]?.start?.relation === 'immediate' && Number(prefix[0]?.start?.offset_minutes) === 0 && prefix[0]?.explicit_deadline == null && prefix[0]?.duration?.profile === 'regional'
    ? [Number(prefix[0].duration.min_minutes), Number(prefix[0].duration.max_minutes)]
    : null;
  return {
    eligible,
    terminal_action_type: terminalActionType,
    terminal_action_subtype: eligible ? terminal.action_subtype || terminal.action_type : null,
    terminal_destination: eligible ? terminal.destination : null,
    relative_date_start_day_offset: relativeDateStart == null ? null : terminal.start.date_offset_days,
    relative_date_start_offset_minutes: Number.isFinite(relativeDateStart) ? relativeDateStart : null,
    elapsed_relative_date_start: Boolean(provenElapsedDate || Number.isFinite(relativeDateStart) && relativeDateStart < 0),
    regional_travel_prefix_range: regionalTravelPrefix?.every(Number.isFinite) ? regionalTravelPrefix : null,
  };
}

export function deriveStructuredExecutionPlan(plan = {}) {
  const clauses = Array.isArray(plan.clauses) ? plan.clauses : [], diagnostics = Array.isArray(plan.diagnostics) ? plan.diagnostics : [];
  const fail = (reason) => ({ version: '1.0', eligible: false, reason, clauses: [], total_min_minutes: null, total_max_minutes: null });
  if (plan.mode !== 'shadow' || diagnostics.length) return fail('parser-diagnostics');
  if (!clauses.length || clauses.length > 8) return fail('unsupported-clause-count');
  const timeline = [];
  let cursorMin = 0, cursorMax = 0;
  for (let position = 0; position < clauses.length; position += 1) {
    const clause = clauses[position], durationMin = Number(clause?.duration?.min_minutes), durationMax = Number(clause?.duration?.max_minutes);
    if (!clause?.committed || clause?.third_party || clause?.actor?.kind !== 'pc' || clause?.action_type === 'unknown') return fail('noncommitted-clause');
    if (clause?.start?.ownership_complete === false || clause?.duration_ownership_complete === false || clause?.explicit_deadline != null) return fail('unowned-timing');
    if (clause?.duration?.upper_bounded === false) return fail('unbounded-duration');
    if (!Number.isInteger(durationMin) || !Number.isInteger(durationMax) || durationMin < 0 || durationMax < durationMin) return fail('invalid-duration');
    let startMin, startMax;
    if (position === 0) {
      const relation = String(clause?.start?.relation || '');
      const offset = Number(clause?.start?.offset_minutes);
      if (relation === 'immediate' && offset === 0) startMin = startMax = 0;
      else if (!clause?.start?.elapsed && Number.isInteger(offset) && offset >= 0 && clause?.start?.clock_context_available !== false && clause?.start?.clock_parse_complete !== false) startMin = startMax = offset;
      else return fail('unsupported-root-start');
    } else {
      if (String(clause?.sequence_relation || '') !== `after_action_${position}` || String(clause?.start?.relation || '') !== `after_action_${position}`) return fail('unsupported-sequence');
      startMin = cursorMin; startMax = cursorMax;
    }
    const completeMin = startMin + durationMin, completeMax = startMax + durationMax;
    timeline.push({
      index: Number(clause.index || position + 1),
      clause_id: String(clause.clause_id || `action_${Number(clause.index || position + 1)}`),
      action_type: String(clause.action_type),
      action_subtype: String(clause.action_subtype || clause.action_type),
      destination: clause.destination || null,
      start_min_minutes: startMin,
      start_max_minutes: startMax,
      complete_min_minutes: completeMin,
      complete_max_minutes: completeMax,
    });
    cursorMin = completeMin; cursorMax = completeMax;
  }
  return { version: '1.0', eligible: true, reason: null, actor_name: String(clauses[0]?.actor?.name||''), clauses: timeline, total_min_minutes: cursorMin, total_max_minutes: cursorMax };
}

export function deriveStructuredDecisionPlan(plan = {}) {
  const exact = deriveStructuredExecutionPlan(plan);
  if (exact.eligible || exact.reason !== 'unbounded-duration') return exact;
  const clauses = Array.isArray(plan.clauses) ? plan.clauses : [], diagnostics = Array.isArray(plan.diagnostics) ? plan.diagnostics : [];
  const fail = (reason) => ({ version: '1.0', eligible: false, exact_timeline: false, reason, clauses: [], total_min_minutes: null, total_max_minutes: null });
  if (plan.mode !== 'shadow' || diagnostics.length || clauses.length < 2 || clauses.length > 8) return fail('unsupported-decision-plan');
  const timeline = [];
  let cursorMin = 0, cursorMax = 0, sawUnbounded = false;
  for (let position = 0; position < clauses.length; position += 1) {
    const clause = clauses[position], durationMin = Number(clause?.duration?.min_minutes), durationMax = Number(clause?.duration?.max_minutes), upperBounded = clause?.duration?.upper_bounded !== false;
    if (!clause?.committed || clause?.third_party || clause?.actor?.kind !== 'pc' || clause?.action_type === 'unknown') return fail('noncommitted-clause');
    if (clause?.start?.ownership_complete === false || clause?.duration_ownership_complete === false || clause?.explicit_deadline != null) return fail('unowned-timing');
    if (!Number.isInteger(durationMin) || !Number.isInteger(durationMax) || durationMin < 0 || durationMax < durationMin) return fail('invalid-duration');
    let startMin, startMax;
    if (position === 0) {
      const relation = String(clause?.start?.relation || ''), offset = Number(clause?.start?.offset_minutes);
      if (relation === 'immediate' && offset === 0) startMin = startMax = 0;
      else if (!clause?.start?.elapsed && Number.isInteger(offset) && offset >= 0 && clause?.start?.clock_context_available !== false && clause?.start?.clock_parse_complete !== false) startMin = startMax = offset;
      else return fail('unsupported-root-start');
    } else {
      if (String(clause?.sequence_relation || '') !== `after_action_${position}` || String(clause?.start?.relation || '') !== `after_action_${position}`) return fail('unsupported-sequence');
      startMin = cursorMin; startMax = Number.isFinite(cursorMax) ? cursorMax : null;
    }
    const completeMin = startMin + durationMin, completeMax = upperBounded && Number.isFinite(startMax) ? startMax + durationMax : null;
    timeline.push({ index: Number(clause.index || position + 1), clause_id: String(clause.clause_id || `action_${Number(clause.index || position + 1)}`), action_type: String(clause.action_type), action_subtype: String(clause.action_subtype || clause.action_type), destination: clause.destination || null, start_min_minutes: startMin, start_max_minutes: startMax, complete_min_minutes: completeMin, complete_max_minutes: completeMax });
    cursorMin = completeMin; cursorMax = completeMax; sawUnbounded ||= !upperBounded;
  }
  return sawUnbounded ? { version: '1.0', eligible: true, exact_timeline: false, reason: 'unbounded-duration', actor_name: String(clauses[0]?.actor?.name||''), clauses: timeline, total_min_minutes: cursorMin, total_max_minutes: null } : fail('unsupported-decision-plan');
}
